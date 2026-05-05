import { beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG, REPORTING_DEFAULTS } from "../src/config/constants.ts";
import {
  ESTADO_PADRAO,
  get,
  invalidar,
  normalizarEstimativa,
  normalizarPainelScrollTop,
  normalizarPainelSecoes,
  normalizarReportingConfig,
  persistirAcoes,
  set,
  update,
} from "../src/core/estado-manager.ts";

describe("core/estado-manager", () => {
  beforeEach(() => {
    localStorage.clear();
    invalidar();
  });

  it("normaliza reporting config com clamp e defaults", () => {
    const cfg = normalizarReportingConfig({
      serviceUrl: "  http://localhost:9999  ",
      transport: "INVALID",
      apiToken: "  ",
      maxFileSizeMb: 999,
      maxFilesPerItem: 0,
      ocrEnabled: false,
      ocrEngine: "INVALID",
    });
    expect(cfg.serviceUrl).toBe("http://localhost:9999");
    expect(cfg.transport).toBe(REPORTING_DEFAULTS.transport);
    expect(cfg.apiToken).toBe(REPORTING_DEFAULTS.apiToken);
    expect(cfg.maxFileSizeMb).toBe(200);
    expect(cfg.maxFilesPerItem).toBe(1);
    expect(cfg.enabledReport).toBe(REPORTING_DEFAULTS.enabledReport);
    expect(cfg.ocrEnabled).toBe(false);
    expect(cfg.ocrEngine).toBe(REPORTING_DEFAULTS.ocrEngine);
  });

  it("normaliza reporting config com valores válidos e URL em branco", () => {
    const cfg = normalizarReportingConfig({
      serviceUrl: "   ",
      transport: "FETCH",
      apiToken: "  token-x  ",
      maxFileSizeMb: 25,
      maxFilesPerItem: 12,
      enabledReport: true,
      enabledMedia: true,
      clickMediaTabBeforeCollect: true,
      enabledAcompanhamento: true,
      blockOnReportError: true,
      sessionRunId: 123,
      ocrEnabled: true,
      ocrEngine: "PADDLEOCR",
    });

    expect(cfg.serviceUrl).toBe(REPORTING_DEFAULTS.serviceUrl);
    expect(cfg.transport).toBe("fetch");
    expect(cfg.apiToken).toBe("token-x");
    expect(cfg.maxFileSizeMb).toBe(25);
    expect(cfg.maxFilesPerItem).toBe(12);
    expect(cfg.enabledReport).toBe(true);
    expect(cfg.enabledMedia).toBe(true);
    expect(cfg.clickMediaTabBeforeCollect).toBe(true);
    expect(cfg.enabledAcompanhamento).toBe(true);
    expect(cfg.blockOnReportError).toBe(true);
    expect(cfg.sessionRunId).toBe("123");
    expect(cfg.ocrEnabled).toBe(true);
    expect(cfg.ocrEngine).toBe("paddleocr");
  });

  it("normaliza configurações de seções do painel e scroll interno", () => {
    const secoes = normalizarPainelSecoes({ resumo: false, logs: true, inexistente: true });
    expect(secoes.resumo).toBe(false);
    expect(secoes.logs).toBe(true);
    expect(secoes.workflow).toBe(true);
    expect("inexistente" in secoes).toBe(false);

    expect(normalizarPainelScrollTop("120.8")).toBe(120);
    expect(normalizarPainelScrollTop(-10)).toBe(0);
    expect(normalizarPainelScrollTop("abc")).toBe(0);
  });

  it("normaliza estimativa com valores inválidos e remove ids vazios", () => {
    const estimativa = normalizarEstimativa({
      totalPlanejado: "abc",
      fonteTotal: "manual",
      itemAtualId: "   ",
      itemAtualInicioTs: "",
      primeiroItemId: "",
      primeiroItemDuracaoMs: -10,
      duracaoTotalConcluidosMs: "abc",
      duracaoAmostras: "abc",
      tempoMedioReferenciaMs: "abc",
      ultimoItemConcluidoTs: -5,
      restantes: "abc",
      etaRestanteMs: "",
      previsaoTerminoTs: "abc",
    });

    expect(estimativa.totalPlanejado).toBe(0);
    expect(estimativa.fonteTotal).toBeNull();
    expect(estimativa.itemAtualId).toBe("");
    expect(estimativa.itemAtualInicioTs).toBeNull();
    expect(estimativa.primeiroItemId).toBeNull();
    expect(estimativa.primeiroItemDuracaoMs).toBe(0);
    expect(estimativa.duracaoTotalConcluidosMs).toBe(0);
    expect(estimativa.duracaoAmostras).toBe(0);
    expect(estimativa.tempoMedioReferenciaMs).toBeNull();
    expect(estimativa.ultimoItemConcluidoTs).toBe(0);
    expect(estimativa.restantes).toBe(0);
    expect(estimativa.etaRestanteMs).toBeNull();
    expect(estimativa.previsaoTerminoTs).toBeNull();
  });

  it("migra estado legado com tarefas e delays antigos", () => {
    const legado = {
      schemaVersion: 1,
      ativo: true,
      minimizado: false,
      actionDelayMs: 2222,
      painelPosicao: { left: "300px", top: "120px" },
      tarefas: {
        ncm: { ativo: true, valor: "1234.56.78" },
        unspsc: { ativo: true, valor: "12345678" },
        finalizar: { ativo: true },
      },
      reporting: {
        serviceUrl: "http://127.0.0.1:9000",
        ocrEngine: "none",
      },
    };
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(legado));
    const estado = get();
    expect(estado.schemaVersion).toBe(CONFIG.SCHEMA_VERSION);
    expect(estado.globalActionDelayMs).toBe(2222);
    expect(estado.acoes.ncm.valor).toBe("1234.56.78");
    expect(estado.acoes.unspsc.valor).toBe("12345678");
    expect(estado.acoes.unspsc.seletor).toContain("#txtCodigoUnspsc");
    expect(estado.perfis.default).toBeDefined();
    expect(estado.perfilConfigs.default.reporting.serviceUrl).toBe("http://127.0.0.1:9000");
    expect(estado.minimizado).toBe(false);
    expect(estado.painelPosicao).toEqual({ top: "120px" });
    expect(estado.estimativa.totalPlanejado).toBe(0);
    expect(estado.trilhaExecucao).toMatchObject({
      runId: null,
      startedAtTs: null,
      lastEventSeq: 0,
      itemAtualKey: null,
      items: {},
    });
  });

  it("migra campos legados opcionais sem tarefas", () => {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      ativo: false,
      pausado: true,
      pausarEmReincidencia: false,
      minimizado: true,
      modoSimulacao: true,
      globalActionDelayMs: "987",
      clickCooldownMs: "654",
      logs: [{ nivel: "info", mensagem: "ok", timestamp: "2026-01-01T00:00:00.000Z" }],
      estatisticas: { processados: 2, erros: 1, ultimoErro: { tipo: "x" } },
      itemMapAtivo: true,
      itemMapJson: 123,
      itemMap: { "item-1": { ncm: "1111.11.11" } },
      itemMapUltimoAplicadoId: 42,
      itemAtualTelaId: 777,
      reportingSessionMap: { "item-1": "run-1" },
    }));

    const estado = get();
    expect(estado.pausado).toBe(true);
    expect(estado.pausarEmReincidencia).toBe(false);
    expect(estado.modoSimulacao).toBe(true);
    expect(estado.globalActionDelayMs).toBe(987);
    expect(estado.clickCooldownMs).toBe(654);
    expect(estado.logs).toHaveLength(1);
    expect(estado.estatisticas.processados).toBe(2);
    expect(estado.itemMapAtivo).toBe(true);
    expect(estado.itemMapJson).toBe("123");
    expect(estado.itemMap["item-1"].ncm).toBe("1111.11.11");
    expect(estado.itemMapUltimoAplicadoId).toBe("42");
    expect(estado.itemAtualTelaId).toBe("777");
    expect(estado.reportingSessionMap["item-1"]).toBe("run-1");
  });

  it("migra delayMs legado e aplica defaults de tarefas sem valor explícito", () => {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({
      schemaVersion: 1,
      delayMs: 3333,
      tarefas: {
        ncm: {},
        unspsc: {},
        finalizar: { ativo: false },
      },
    }));

    const estado = get();
    expect(estado.globalActionDelayMs).toBe(3333);
    expect(estado.acoes.ncm.valor).toBe("8471.30.12");
    expect(estado.acoes.unspsc.valor).toBe("43211503");
    expect(estado.acoes.prosseguir.ativo).toBe(false);
    expect(estado.acoes.confirmar.ativo).toBe(false);
  });

  it("update persiste mudanças e set aplica schema atual", () => {
    set({
      ...ESTADO_PADRAO,
      acoes: { ...ESTADO_PADRAO.acoes },
      perfilAtivo: "default",
      perfis: { default: {} },
      perfilConfigs: { default: { reporting: normalizarReportingConfig(REPORTING_DEFAULTS) } },
    });
    update((st) => {
      st.ativo = true;
      st.clickCooldownMs = 4444;
    });
    const novo = get();
    expect(novo.ativo).toBe(true);
    expect(novo.clickCooldownMs).toBe(4444);
    const salvo = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY));
    expect(salvo.schemaVersion).toBe(CONFIG.SCHEMA_VERSION);
  });

  it("update aceita patch parcial", () => {
    set({
      ...ESTADO_PADRAO,
      acoes: { ...ESTADO_PADRAO.acoes },
      perfilAtivo: "default",
      perfis: { default: {} },
      perfilConfigs: { default: { reporting: normalizarReportingConfig(REPORTING_DEFAULTS) } },
    });

    const estado = update({ ativo: true, clickCooldownMs: 5555 });
    expect(estado.ativo).toBe(true);
    expect(estado.clickCooldownMs).toBe(5555);
    expect(JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY)).clickCooldownMs).toBe(5555);
  });

  it("mantém cache até invalidar e depois recarrega do localStorage", () => {
    set({
      ...ESTADO_PADRAO,
      acoes: { ...ESTADO_PADRAO.acoes },
      perfilAtivo: "default",
      perfis: { default: {} },
      perfilConfigs: { default: { reporting: normalizarReportingConfig(REPORTING_DEFAULTS) } },
      clickCooldownMs: 1111,
    });

    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({
      ...ESTADO_PADRAO,
      schemaVersion: CONFIG.SCHEMA_VERSION,
      clickCooldownMs: 2222,
    }));

    expect(get().clickCooldownMs).toBe(1111);
    invalidar();
    expect(get().clickCooldownMs).toBe(2222);
  });

  it("persistirAcoes salva ações e reporting no perfil ativo", () => {
    const estado = {
      ...ESTADO_PADRAO,
      perfilAtivo: "perfil_x",
      acoes: {
        ncm: { ativo: true, seletor: "#x", valor: "8471.30.12", ordem: 1 },
      },
      perfis: {},
      perfilConfigs: {},
      reporting: normalizarReportingConfig({ serviceUrl: "http://localhost:7777" }),
    };
    persistirAcoes(estado);
    expect(estado.perfis.perfil_x.ncm.valor).toBe("8471.30.12");
    expect(estado.perfilConfigs.perfil_x.reporting.serviceUrl).toBe("http://localhost:7777");
  });

  it("persistirAcoes usa default quando perfil ativo está vazio e preserva config existente", () => {
    const estado = {
      ...ESTADO_PADRAO,
      perfilAtivo: "",
      acoes: {
        ncm: { ativo: true, seletor: "#x", valor: "8471.30.12", ordem: 1 },
      },
      perfis: {},
      perfilConfigs: {
        default: {
          reporting: normalizarReportingConfig({ serviceUrl: "http://antigo" }),
          extra: "mantem",
        },
      },
      reporting: normalizarReportingConfig({ serviceUrl: "http://novo" }),
    };

    persistirAcoes(estado);
    expect(estado.perfis.default.ncm.valor).toBe("8471.30.12");
    expect(estado.perfilConfigs.default.reporting.serviceUrl).toBe("http://novo");
    expect(estado.perfilConfigs.default.extra).toBe("mantem");
  });

  it("retorna estado padrão quando localStorage está corrompido", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.setItem(CONFIG.STORAGE_KEY, "{");
    const estado = get();
    expect(estado.schemaVersion).toBe(CONFIG.SCHEMA_VERSION);
    expect(estado.ativo).toBe(false);
  });

  it("normaliza estimativa e ignora left/right antigos no schema atual", () => {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({
      ...ESTADO_PADRAO,
      schemaVersion: CONFIG.SCHEMA_VERSION,
      painelPosicao: { left: "500px", top: "88px", right: "10px" },
      painelSecoes: { resumo: false, logs: true },
      painelScrollTop: "145",
      estimativa: {
        totalPlanejado: 5,
        fonteTotal: "json",
        itemAtualId: "320780",
        tempoMedioReferenciaMs: 7500,
        etaRestanteMs: 22500,
      },
      trilhaExecucao: "inválida",
    }));

    const estado = get();
    expect(estado.painelPosicao).toEqual({ top: "88px" });
    expect(estado.painelSecoes.resumo).toBe(false);
    expect(estado.painelSecoes.logs).toBe(true);
    expect(estado.painelSecoes.workflow).toBe(true);
    expect(estado.painelScrollTop).toBe(145);
    expect(estado.estimativa.totalPlanejado).toBe(5);
    expect(estado.estimativa.fonteTotal).toBe("json");
    expect(estado.estimativa.itemAtualId).toBe("320780");
    expect(estado.estimativa.tempoMedioReferenciaMs).toBe(7500);
    expect(estado.estimativa.etaRestanteMs).toBe(22500);
    expect(estado.trilhaExecucao).toMatchObject({
      runId: null,
      startedAtTs: null,
      lastEventSeq: 0,
      itemAtualKey: null,
      items: {},
    });
  });

  it("corrige seletores legados e aplica pausarEmReincidencia default no schema atual", () => {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({
      ...ESTADO_PADRAO,
      schemaVersion: CONFIG.SCHEMA_VERSION,
      pausarEmReincidencia: undefined,
      acoes: {
        unspsc: { ativo: true, seletor: "input[name*=\"txtCodigoUnspsc\"]", valor: "12345678", ordem: 7 },
        resultado: { ativo: true, seletor: "a#txtDescricao", valor: null, ordem: 9 },
        abaClassificacao: { ativo: true, seletor: "a[href*=\"ctl02$lbutMenu\"]", valor: null, ordem: 5 },
        abaFiscal: { ativo: true, seletor: "a[href*=\"ctl04lbutMenu\"]", valor: null, ordem: 2 },
        ncm: { ativo: true, seletor: "#txtNCMTIPI", valor: "8471.30.12", ordem: 3 },
        prosseguir: { ativo: true, seletor: "#butAcao1", valor: null, ordem: 14 },
      },
    }));

    const estado = get();
    expect(estado.pausarEmReincidencia).toBe(true);
    expect(estado.acoes.unspsc.seletor).toContain("#txtCodUNSPSC");
    expect(estado.acoes.resultado.seletor).toBe('a[id="txtDescricao"]');
    expect(estado.acoes.abaClassificacao.seletor).toBe("text=Classificações");
    expect(estado.acoes.abaFiscal.seletor).toBe("text=Fiscal");
    expect(estado.acoes.ncm.seletor).toBe("#txtNCMTIPI, #txtNBS");
    expect(estado.acoes.prosseguir.seletor).toContain("#butAcao2");
  });

  it("mantém a flag pausarEmReincidencia ao carregar estado salvo", () => {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify({
      ...ESTADO_PADRAO,
      schemaVersion: CONFIG.SCHEMA_VERSION,
      pausarEmReincidencia: false,
    }));

    const estado = get();
    expect(estado.pausarEmReincidencia).toBe(false);
  });
});
