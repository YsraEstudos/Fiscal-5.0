import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let state;
const mockEstadoGet = vi.fn(() => state);
const mockEstadoSet = vi.fn((novo) => {
  state = novo;
});
const mockEstadoUpdate = vi.fn((fn) => {
  if (typeof fn === "function") fn(state);
  else Object.assign(state, fn);
  return state;
});
const mockPersistirAcoes = vi.fn();
const mockSincronizarItemAtual = vi.fn();
const mockObterItemIdAtual = vi.fn(() => null);
const mockAplicarParaItemAtual = vi.fn();
const mockGetValoresParaItem = vi.fn();
const mockDetectarAvisoCritico = vi.fn(() => null);
const mockDetectarAvisoBloqueanteItem = vi.fn(() => null);
const mockIsMensagemNcmInvalido = vi.fn(() => false);
const mockIsMensagemNbsInvalido = vi.fn(() => false);
const mockIsMensagemSubGrupoInvalido = vi.fn(() => false);
const mockScanAcompanhamento = vi.fn(() => ({ status: 'absent', alert: null }));
const mockEncontrarItensPendentes = vi.fn(() => []);
const mockEncontrarItensPendentesInfo = vi.fn(() => ({ elegiveis: [], ignorados: 0 }));
const mockEncontrarBotaoProximo = vi.fn(() => null);
const mockObterResumoPendentesServidor = vi.fn(() => null);
const mockPaginaOcupada = vi.fn(() => ({ ocupado: false }));
const mockVerificarSessao = vi.fn(() => true);
const mockExtrairItemKey = vi.fn(() => "320780");
const mockDetectarModoUnspsc = vi.fn(() => "modal");
const mockUnspscDescricaoDefinida = vi.fn(() => false);
const mockInteragir = vi.fn(async () => true);
const mockLog = vi.fn();
const mockTocar = vi.fn();
const mockIsAtivo = vi.fn(() => false);
const mockTempoRestante = vi.fn(() => 0);
const mockCooldownSet = vi.fn();
const mockCooldownLimpar = vi.fn();
const mockGarantirTotalPlanejado = vi.fn();
const mockRegistrarInicioItem = vi.fn((estado, itemId, now) => {
  estado.estimativa = {
    ...(estado.estimativa || {}),
    itemAtualId: itemId,
    itemAtualInicioTs: now,
  };
  return true;
});
const mockResetarRodada = vi.fn((_estado, { totalPlanejado = 0, fonteTotal = null } = {}) => ({
  totalPlanejado,
  fonteTotal,
  itemAtualId: null,
  itemAtualInicioTs: null,
  primeiroItemId: null,
  primeiroItemDuracaoMs: null,
  tempoMedioReferenciaMs: null,
  restantes: totalPlanejado,
  etaRestanteMs: null,
  previsaoTerminoTs: null,
  ultimoItemConcluidoTs: null,
}));

const mockConfirmar = vi.fn(async () => false);
const mockProsseguir = vi.fn(async () => false);
const mockAtuar = vi.fn(async () => false);
const mockNcm = vi.fn(async () => false);
const mockLei116Servico = vi.fn(async () => false);
const mockAbaFiscal = vi.fn(async () => false);
const mockAbaClassificacao = vi.fn(async () => false);
const mockUnspsc = vi.fn(async () => false);
const mockLupaUnspsc = vi.fn(async () => false);
const mockPesquisar = vi.fn(async () => false);
const mockResultado = vi.fn(async () => false);
const mockSelecionar = vi.fn(async () => false);

vi.resetModules();

vi.mock("../src/core/estado-manager.ts", () => ({
  get: mockEstadoGet,
  set: mockEstadoSet,
  update: mockEstadoUpdate,
  persistirAcoes: mockPersistirAcoes,
}));
vi.mock("../src/core/log-manager.ts", () => ({ log: mockLog }));
vi.mock("../src/core/cooldown-manager.ts", () => ({
  isAtivo: mockIsAtivo,
  tempoRestante: mockTempoRestante,
  set: mockCooldownSet,
  limpar: mockCooldownLimpar,
}));
vi.mock("../src/interaction/audio-manager.ts", () => ({ tocar: mockTocar }));
vi.mock("../src/core/aspnet-lifecycle.ts", () => ({
  hook: vi.fn(),
  subscribe: vi.fn(),
}));
vi.mock("../src/interaction/interacao.ts", () => ({
  interagir: mockInteragir,
  setRegistrarInteracao: vi.fn(),
}));
vi.mock("../src/workflow/acompanhamento-alert.ts", () => ({
  scanAcompanhamento: mockScanAcompanhamento,
}));

vi.mock("../src/workflow/pagina-verificador.ts", () => ({
  paginaOcupada: mockPaginaOcupada,
  detectarAvisoCritico: mockDetectarAvisoCritico,
  detectarAvisoBloqueanteItem: mockDetectarAvisoBloqueanteItem,
  obterConfirmacao: vi.fn(() => ({ modalAberto: false })),
  encontrarItensPendentesInfo: mockEncontrarItensPendentesInfo,
  encontrarItensPendentes: mockEncontrarItensPendentes,
  encontrarBotaoProximo: mockEncontrarBotaoProximo,
  obterResumoPendentesServidor: mockObterResumoPendentesServidor,
  verificarSessao: mockVerificarSessao,
  extrairItemKey: mockExtrairItemKey,
  isMensagemNcmInvalido: mockIsMensagemNcmInvalido,
  isMensagemNbsInvalido: mockIsMensagemNbsInvalido,
  isMensagemSubGrupoInvalido: mockIsMensagemSubGrupoInvalido,
  getModalUnspscContainer: vi.fn(() => null),
  isModalUnspscAberto: vi.fn(() => false),
  detectarModoUnspsc: mockDetectarModoUnspsc,
  unspscDescricaoDefinida: mockUnspscDescricaoDefinida,
}));
vi.mock("../src/data/item-map-manager.ts", () => ({
  sincronizarItemAtual: mockSincronizarItemAtual,
  obterItemIdAtual: mockObterItemIdAtual,
  aplicarParaItemAtual: mockAplicarParaItemAtual,
  getValoresParaItem: mockGetValoresParaItem,
  getValorAcao: vi.fn(() => null),
}));
vi.mock("../src/workflow/estimativa.ts", () => ({
  garantirTotalPlanejado: mockGarantirTotalPlanejado,
  registrarInicioItem: mockRegistrarInicioItem,
  registrarConclusaoItem: vi.fn(() => ({ duracaoMs: 6500, restantes: 0 })),
  resetarRodada: mockResetarRodada,
}));
vi.mock("../src/workflow/handlers/flow-control.ts", () => ({
  confirmar: mockConfirmar,
  prosseguir: mockProsseguir,
  setAtualizarBotaoToggle: vi.fn(),
}));
vi.mock("../src/workflow/handlers/atuar.ts", () => ({ atuar: mockAtuar }));
vi.mock("../src/workflow/handlers/ncm.ts", () => ({
  ncm: mockNcm,
  lei116Servico: mockLei116Servico,
  abaFiscal: mockAbaFiscal,
  abaClassificacao: mockAbaClassificacao,
}));
vi.mock("../src/workflow/handlers/unspsc.ts", () => ({
  unspsc: mockUnspsc,
  lupaUnspsc: mockLupaUnspsc,
  pesquisar: mockPesquisar,
  resultado: mockResultado,
  selecionar: mockSelecionar,
}));
vi.mock("../src/utils/misc.ts", () => ({
  isTestMode: vi.fn(() => true),
  sleep: vi.fn(async () => { }),
  valoresSaoIguais: vi.fn((a, b) => a === b),
}));
vi.mock("../src/utils/text.ts", () => ({
  normalizarEspacos: (valor) => String(valor || "").trim(),
}));
vi.mock("../src/utils/selectors.ts", () => ({
  buscarElementoDeep: vi.fn(() => null),
}));

const mod = await import("../src/workflow/executor.ts");

function buildState(overrides = {}) {
  return {
    ativo: true,
    pausado: false,
    pausarEmReincidencia: true,
    pausarAcompanhamento: true,
    minimizado: false,
    globalActionDelayMs: 0,
    clickCooldownMs: 0,
    perfilAtivo: "default",
    perfis: { default: {} },
    progresso: { atual: 0, total: 0, ultimoProcessado: null, concluidosIds: [] },
    logs: [],
    estatisticas: { processados: 0, erros: 0, ultimoErro: null },
    painelPosicao: null,
    itemAtualKey: null,
    itemAtualTelaId: null,
    estimativa: {
      totalPlanejado: 0,
      fonteTotal: null,
      itemAtualId: null,
      itemAtualInicioTs: null,
      primeiroItemId: null,
      primeiroItemDuracaoMs: null,
      tempoMedioReferenciaMs: null,
      duracaoTotalConcluidosMs: 0,
      duracaoAmostras: 0,
      restantes: 0,
      etaRestanteMs: null,
      previsaoTerminoTs: null,
      ultimoItemConcluidoTs: null,
    },
    trilhaExecucao: {
      runId: null,
      startedAtTs: null,
      lastEventSeq: 0,
      itemAtualKey: null,
      items: {},
    },
    itemFlags: {},
    itemMapAtivo: true,
    itemMap: {
      "320780": { ncm: "8471.30.12", nbs: null, cest: null, unspsc: null, lei116: null },
    },
    itemMapJson: "",
    itemMapUltimoAplicadoId: null,
    acoes: {},
    ...overrides,
  };
}

function buildLink(key) {
  const link = document.createElement("a");
  link.dataset.key = key;
  return link;
}

describe("workflow/executor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="statusRobo"></div>';
    state = buildState();

    mockDetectarAvisoCritico.mockReturnValue(null);
    mockDetectarAvisoBloqueanteItem.mockReturnValue(null);
    mockIsMensagemNcmInvalido.mockReturnValue(false);
    mockIsMensagemNbsInvalido.mockReturnValue(false);
    mockIsMensagemSubGrupoInvalido.mockReturnValue(false);
    mockEncontrarItensPendentes.mockReturnValue([]);
    mockEncontrarItensPendentesInfo.mockReturnValue({ elegiveis: [], ignorados: 0, inelegiveisConhecidos: [], desconhecidos: [], totalVisiveis: 0 });
    mockEncontrarBotaoProximo.mockReturnValue(null);
    mockObterResumoPendentesServidor.mockReturnValue(null);
    mockPaginaOcupada.mockReturnValue({ ocupado: false });
    mockVerificarSessao.mockReturnValue(true);
    mockDetectarModoUnspsc.mockReturnValue("modal");
    mockUnspscDescricaoDefinida.mockReturnValue(false);
    mockScanAcompanhamento.mockReturnValue({ status: 'absent', alert: null });
    mockSincronizarItemAtual.mockReturnValue(null);
    mockObterItemIdAtual.mockReturnValue(null);
    mockGetValoresParaItem.mockImplementation((estado, itemId) => {
      const key = itemId == null ? null : String(itemId).trim();
      if (!estado?.itemMapAtivo || !key) return null;
      return estado.itemMap?.[key] || null;
    });
    mockInteragir.mockResolvedValue(true);
    mockIsAtivo.mockReturnValue(false);
    mockTempoRestante.mockReturnValue(0);
    mod.setUICallbacks({
      atualizarBotaoToggle: vi.fn(),
      atualizarIndicadorProgresso: vi.fn(),
    });
    mod.registrarInteracao("reset");
  });

  afterEach(() => {
    vi.useRealTimers();
    state.ativo = false;
    mod.limpar();
  });

  it("ordena ações respeitando ordem customizada do estado", () => {
    state.acoes = {
      ncm: { ordem: 20 },
      atuar: { ordem: 1 },
      prosseguir: { ordem: 2 },
    };

    const ordenadas = mod.getAcoesOrdenadas(state);

    expect(ordenadas.find((acao) => acao.id === "atuar").ordem).toBe(1);
    expect(ordenadas.find((acao) => acao.id === "prosseguir").ordem).toBe(2);
    expect(ordenadas.find((acao) => acao.id === "ncm").ordem).toBe(20);
  });

  it("reseta a trilha da rodada ao iniciar o ciclo", () => {
    mockSincronizarItemAtual.mockReturnValue(null);

    mod.iniciar();

    expect(state.trilhaExecucao.runId).toMatch(/^run_/);
    expect(state.trilhaExecucao.startedAtTs).not.toBeNull();
    expect(state.trilhaExecucao.lastEventSeq).toBe(0);
  });

  it("desativa o robô quando detecta sessão expirada", async () => {
    mockVerificarSessao.mockReturnValue(false);

    await mod.executarCiclo("test");

    expect(state.ativo).toBe(false);
    expect(mockLog).toHaveBeenCalledWith("🔐 Sessão expirada detectada!", "error");
    expect(mockTocar).toHaveBeenCalledWith("error");
  });

  it("respeita o delay global antes de continuar o ciclo", async () => {
    state.globalActionDelayMs = 5000;
    mod.registrarInteracao("ncm");

    await mod.executarCiclo("test");

    const status = document.getElementById("statusRobo");
    expect(status.textContent).toContain("Aguardando delay global");
    expect(mockSincronizarItemAtual).not.toHaveBeenCalled();
  });

  it("aguarda quando a página está ocupada", async () => {
    mockPaginaOcupada.mockReturnValue({ ocupado: true, motivo: "asp_async_postback" });

    await mod.executarCiclo("test");

    const status = document.getElementById("statusRobo");
    expect(status.textContent).toBe("⏳ Aguardando server (asp_async_postback)...");
    expect(mockSincronizarItemAtual).not.toHaveBeenCalled();
  });

  it("pausa sem clicar quando não há JSON ativo", async () => {
    state.itemMapAtivo = false;
    state.itemMap = {};
    state.acoes = {
      atuar: { ativo: true, seletor: "#butAcao3", ordem: 1 },
      ncm: { ativo: true, seletor: "#txtNCMTIPI", valor: "8471.30.12", ordem: 2 },
    };
    mockObterItemIdAtual.mockReturnValue("342799");
    mockSincronizarItemAtual.mockImplementation(() => {
      state.itemAtualKey = "342799";
      state.itemAtualTelaId = "342799";
      return "342799";
    });

    await mod.executarCiclo("test");

    expect(state.pausado).toBe(true);
    expect(state.estatisticas.ultimoErro?.tipo).toBe("json_inativo");
    expect(mockInteragir).not.toHaveBeenCalled();
    expect(mockAtuar).not.toHaveBeenCalled();
    expect(mockNcm).not.toHaveBeenCalled();
    expect(mockProsseguir).not.toHaveBeenCalled();
  });

  it("registra item_aberto quando o item é sincronizado na tela", async () => {
    mockSincronizarItemAtual.mockImplementation(() => {
      state.itemAtualKey = "320780";
      state.itemAtualTelaId = "320780";
      return "320780";
    });

    await mod.executarCiclo("test");

    expect(state.trilhaExecucao.items["320780"].events.map((evento) => evento.tipo)).toContain("item_aberto");
    expect(mockRegistrarInicioItem).toHaveBeenCalled();
  });

  it("registra pausa por reincidência antes de pausar o robô", async () => {
    state.itemMapAtivo = true;
    state.itemMap = { "320780": { ncm: "8471.30.12" } };
    mockSincronizarItemAtual.mockImplementation(() => {
      state.itemAtualKey = "320780";
      state.itemAtualTelaId = "320780";
      return "320780";
    });
    mockDetectarAvisoCritico.mockReturnValue({
      tipo: "reincidencia_etapa",
      fonte: "lblExecucoes",
      mensagem: "Esta é a 2º vez...",
      numeroExecucoes: 2,
    });

    await mod.executarCiclo("test");

    expect(state.pausado).toBe(true);
    expect(state.trilhaExecucao.items["320780"].events.map((evento) => evento.tipo)).toContain("pausado_por_reincidencia");
  });

  it("não pausa por reincidência quando a opção está desativada", async () => {
    state.itemMapAtivo = true;
    state.itemMap = { "320780": { ncm: "8471.30.12" } };
    state.pausarEmReincidencia = false;
    mockSincronizarItemAtual.mockImplementation(() => {
      state.itemAtualKey = "320780";
      state.itemAtualTelaId = "320780";
      return "320780";
    });
    mockDetectarAvisoCritico.mockReturnValue({
      tipo: "reincidencia_etapa",
      fonte: "lblExecucoes",
      mensagem: "Esta é a 2º vez...",
      numeroExecucoes: 2,
    });

    await mod.executarCiclo("test");

    expect(state.pausado).toBe(false);
    const eventos = state.trilhaExecucao.items["320780"]?.events?.map((evento) => evento.tipo) || [];
    expect(eventos).not.toContain("pausado_por_reincidencia");
  });

  it("não pausa por alertas NCM, NBS, UNSPSC e LEI quando a opção está desativada", async () => {
    state.itemMapAtivo = true;
    state.itemMap = { "320780": { ncm: "8471.30.12" } };
    state.pausarAcompanhamento = false;
    mockSincronizarItemAtual.mockImplementation(() => {
      state.itemAtualKey = "320780";
      state.itemAtualTelaId = "320780";
      return "320780";
    });
    mockScanAcompanhamento.mockReturnValue({
      status: "ready",
      alert: {
        matches: ["NBS", "UNSPSC", "LEI"],
        evidence: "Alertas apresentados no acompanhamento",
        element: document.createElement("div"),
      },
    });

    await mod.executarCiclo("test");

    expect(state.pausado).toBe(false);
    const eventos = state.trilhaExecucao.items["320780"]?.events?.map((evento) => evento.tipo) || [];
    expect(eventos).not.toContain("pausado_por_alerta_acompanhamento");
  });
  it("pausa por NCM inválido quando a janela de validação está liberada", async () => {
    state.itemMapAtivo = true;
    state.itemMap = { "320780": { ncm: "8471.30.12" } };
    mockSincronizarItemAtual.mockImplementation(() => {
      state.itemAtualKey = "320780";
      state.itemAtualTelaId = "320780";
      state.itemFlags["320780"] = { ncmValidacaoPendenteAte: Date.now() + 10000 };
      return "320780";
    });
    mockDetectarAvisoCritico.mockReturnValue({
      tipo: "ncm_invalido",
      mensagem: "NCM informado inválido",
    });

    await mod.executarCiclo("test");

    expect(state.pausado).toBe(true);
    expect(state.trilhaExecucao.items["320780"].events.map((evento) => evento.tipo)).toContain("pausado_por_validacao_ncm");
  });

  it("não pausa por Sub Grupo inválido detectado em texto sem alert nativo", async () => {
    state.itemMapAtivo = true;
    state.itemMap = { "320780": { ncm: "8471.30.12" } };
    mockSincronizarItemAtual.mockImplementation(() => {
      state.itemAtualKey = "320780";
      state.itemAtualTelaId = "320780";
      state.itemFlags["320780"] = { ncmValidacaoPendenteAte: Date.now() + 10000 };
      return "320780";
    });
    mockDetectarAvisoCritico.mockReturnValue({
      tipo: "subgrupo_invalido",
      mensagem: "O valor do campo Sub Grupo 1 é inválido para esse item!",
    });

    await mod.executarCiclo("test");

    expect(state.pausado).toBe(false);
    expect(state.itemFlags["320780"].skipNestaRodada).not.toBe(true);
  });

  it("consome alert nativo de Sub Grupo inválido, marca item e aciona Voltar", () => {
    const alertOriginal = vi.fn();
    globalThis.alert = alertOriginal;
    const keyEvents = [];
    document.body.addEventListener("keydown", (event) => keyEvents.push(event));
    const voltarMenu = document.createElement("a");
    voltarMenu.textContent = "Voltar";
    voltarMenu.href = "javascript:__doPostBack('ctl00$Body$TopMenu1$dlmenu$ctl01$lbutopcao','')";
    document.body.appendChild(voltarMenu);
    const voltarFormulario = document.createElement("input");
    voltarFormulario.type = "submit";
    voltarFormulario.id = "butVoltar";
    voltarFormulario.name = "ctl00$Body$butVoltar";
    voltarFormulario.value = "Voltar";
    const clickVoltarFormulario = vi.spyOn(voltarFormulario, "click").mockImplementation(() => {});
    document.body.appendChild(voltarFormulario);
    window.history.pushState({}, "", "/ITEM_Edita.aspx?IdItem=312063&IdSIN=242752");
    state.itemAtualKey = "313899";
    state.itemAtualTelaId = "312063";
    state.itemMapUltimoAplicadoId = "313899";
    mockObterItemIdAtual.mockReturnValue("312063");
    mockIsMensagemSubGrupoInvalido.mockReturnValue(true);

    mod.inicializarHooks();
    try {
      globalThis.alert("O valor do campo Sub Grupo 1 é inválido para esse item!");
    } finally {
      globalThis.alert = alertOriginal;
    }

    expect(alertOriginal).not.toHaveBeenCalled();
    expect(state.pausado).toBe(false);
    expect(state.itemFlags["313899"]).toEqual(expect.objectContaining({
      skipNestaRodada: true,
      skipMotivo: "subgrupo_invalido",
      skipMensagem: "O valor do campo Sub Grupo 1 é inválido para esse item!",
      skipAliases: expect.arrayContaining(["312063", "242752"]),
    }));
    expect(state.itemFlags["312063"]).toEqual(expect.objectContaining({
      skipNestaRodada: true,
      skipMotivo: "subgrupo_invalido",
      skipOrigem: "313899",
    }));
    expect(state.itemFlags["242752"]).toEqual(expect.objectContaining({
      skipNestaRodada: true,
      skipMotivo: "subgrupo_invalido",
      skipOrigem: "313899",
    }));
    expect(state.trilhaExecucao.items["313899"].events.map((evento) => evento.tipo)).toContain("item_pulado_na_rodada");

    expect(clickVoltarFormulario).toHaveBeenCalledTimes(1);
    expect(mockInteragir).not.toHaveBeenCalledWith(voltarFormulario, null, "voltarListaItemBloqueado");
    expect(keyEvents.some((event) => event.key === "S" && event.shiftKey)).toBe(false);
    expect(mockLog).toHaveBeenCalledWith(expect.stringContaining("Sub Grupo inválido"), "warn");
  });

  it("não clica em Atuar no Item quando o IdSIN atual já está marcado para pular", async () => {
    state.itemMapAtivo = true;
    state.itemMap = { "242752": { ncm: "8471.30.12" } };
    window.history.pushState({}, "", "/SIN_Item_Resultante.aspx?Source=SIN_Lista&Acao=ITEM_Edita&IdSIN=242752");
    state.itemFlags["242752"] = {
      skipNestaRodada: true,
      skipMotivo: "subgrupo_invalido",
      skipOrigem: "313899",
    };
    state.acoes = {
      atuar: { ativo: true, seletor: "#butAcao3", ordem: 1 },
    };

    const btnAtuar = document.createElement("input");
    btnAtuar.type = "submit";
    btnAtuar.id = "butAcao3";
    btnAtuar.name = "ctl00$Body$butAcao3";
    btnAtuar.value = "Atuar no Item";
    document.body.appendChild(btnAtuar);

    const btnVoltar = document.createElement("input");
    btnVoltar.type = "submit";
    btnVoltar.id = "butVoltar";
    btnVoltar.name = "ctl00$Body$butVoltar";
    btnVoltar.value = "Voltar";
    const clickVoltar = vi.spyOn(btnVoltar, "click").mockImplementation(() => {});
    document.body.appendChild(btnVoltar);

    await mod.executarCiclo("test");

    expect(clickVoltar).toHaveBeenCalledTimes(1);
    expect(mockAtuar).not.toHaveBeenCalled();
    expect(mockLog).toHaveBeenCalledWith(expect.stringContaining("evitando Atuar no Item"), "warn");
  });

  it("seleciona um novo item pendente e prepara o estado do item", async () => {
    state.itemMapAtivo = true;
    state.itemMap = { "777": { ncm: "8471.30.12" } };
    const link = document.createElement("a");
    mockEncontrarItensPendentes.mockReturnValue([link]);
    mockEncontrarItensPendentesInfo.mockReturnValue({ elegiveis: [link], ignorados: 1 });
    mockExtrairItemKey.mockReturnValue("777");

    await mod.executarCiclo("test");

    expect(state.itemAtualKey).toBe("777");
    expect(state.itemAtualTelaId).toBeNull();
    expect(state.itemFlags["777"]).toEqual(
      expect.objectContaining({
        unspscFeito: false,
        ncmValidacaoPendenteAte: 0,
        ncmValidacaoAvisada: false,
      }),
    );
    expect(mockInteragir).toHaveBeenCalledWith(link, null, "selecionarItemNormal");
    expect(mockCooldownSet).toHaveBeenCalledWith("selecionarItemNormal:777", expect.any(Number));
    expect(mockLog).toHaveBeenCalledWith("⏭️ Ignorados 1 item(ns) inelegíveis conhecidos", "info");
    expect(mockLog).toHaveBeenCalledWith("🔖 Iniciando item ID: 777", "info");
  });

  it("fecha aviso de problema visual com OK, envia Shift+S e marca o item para pular na rodada", async () => {
    state.itemMapAtivo = true;
    state.itemMap = { "777": { ncm: "8471.30.12" } };
    const btnOk = document.createElement("button");
    document.body.appendChild(btnOk);
    const keyEvents = [];
    document.body.addEventListener("keydown", (event) => keyEvents.push(event));
    mockSincronizarItemAtual.mockImplementation(() => {
      state.itemAtualKey = "777";
      state.itemAtualTelaId = "777";
      return "777";
    });
    mockDetectarAvisoBloqueanteItem.mockReturnValue({
      tipo: "problema_imagem",
      mensagem: "Problema na imagem do item",
      btnOk,
    });

    await mod.executarCiclo("test");

    expect(mockInteragir).toHaveBeenCalledWith(btnOk, null, "okProblemaVisual");
    expect(state.itemFlags["777"]).toEqual(expect.objectContaining({
      skipNestaRodada: true,
      skipMotivo: "problema_imagem",
      skipMensagem: "Problema na imagem do item",
    }));
    expect(keyEvents.some((event) => event.key === "S" && event.shiftKey)).toBe(true);
    expect(mockLog).toHaveBeenCalledWith(expect.stringContaining("pulado por problema visual"), "warn");
  });

  it("seleciona item elegível da página em vez de paginar quando há bloqueados e elegíveis", async () => {
    state.itemMapAtivo = true;
    state.itemMap = { "222": { ncm: "8471.30.12" } };
    const bloqueado = buildLink("111");
    const elegivel = buildLink("222");
    mockEncontrarItensPendentesInfo.mockReturnValue({
      elegiveis: [elegivel],
      ignorados: 1,
      inelegiveisConhecidos: [bloqueado],
      desconhecidos: [],
      totalVisiveis: 2,
    });
    mockExtrairItemKey.mockImplementation((link) => link?.dataset?.key || null);

    await mod.executarCiclo("test");

    expect(mockInteragir).toHaveBeenCalledWith(elegivel, null, "selecionarItemNormal");
    expect(mockEncontrarBotaoProximo).not.toHaveBeenCalled();
  });

  it("clica em Próximo quando todos os itens visíveis são inelegíveis conhecidos", async () => {
    state.itemMapAtivo = true;
    state.itemMap = { "111": { ncm: "8471.30.12" }, "222": { ncm: "8471.30.12" } };
    const bloqueado1 = buildLink("111");
    const bloqueado2 = buildLink("222");
    const btnProximo = document.createElement("a");
    mockEncontrarItensPendentesInfo.mockReturnValue({
      elegiveis: [],
      ignorados: 2,
      inelegiveisConhecidos: [bloqueado1, bloqueado2],
      desconhecidos: [],
      totalVisiveis: 2,
    });
    mockEncontrarBotaoProximo.mockReturnValue(btnProximo);

    await mod.executarCiclo("test");

    expect(mockInteragir).toHaveBeenCalledWith(btnProximo, null, "proximaPaginaItens");
    expect(mockLog).toHaveBeenCalledWith("⏭️ Página atual sem itens elegíveis conhecidos; clicando em Próximo", "info");
  });

  it("não pagina quando há item visível desconhecido", async () => {
    const desconhecido = document.createElement("a");
    const btnProximo = document.createElement("a");
    mockEncontrarItensPendentesInfo.mockReturnValue({
      elegiveis: [],
      ignorados: 0,
      inelegiveisConhecidos: [],
      desconhecidos: [desconhecido],
      totalVisiveis: 1,
    });
    mockEncontrarBotaoProximo.mockReturnValue(btnProximo);

    await mod.executarCiclo("test");

    expect(mockInteragir).not.toHaveBeenCalledWith(btnProximo, null, "proximaPaginaItens");
  });

  it("aguarda abertura do mesmo item quando o cooldown ainda está ativo", async () => {
    state.itemMapAtivo = true;
    state.itemMap = { "777": { ncm: "8471.30.12" } };
    const link = document.createElement("a");
    state.itemAtualKey = "777";
    mockEncontrarItensPendentes.mockReturnValue([link]);
    mockEncontrarItensPendentesInfo.mockReturnValue({ elegiveis: [link], ignorados: 0 });
    mockExtrairItemKey.mockReturnValue("777");
    mockIsAtivo.mockImplementation((key) => key === "selecionarItemNormal:777");
    mockTempoRestante.mockReturnValue(5000);

    await mod.executarCiclo("test");

    const status = document.getElementById("statusRobo");
    expect(status.textContent).toBe("⏳ Aguardando abertura do item 777 (5s)...");
    expect(mockInteragir).not.toHaveBeenCalledWith(link, null, "selecionarItemNormal");
  });

  it("para a procura quando nao encontra item por um minuto", async () => {
    state.itemMapAtivo = true;
    state.itemMap = { "777": { ncm: "8471.30.12" } };
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-05-05T12:00:00.000Z"));
    mockEncontrarItensPendentesInfo.mockReturnValue({ elegiveis: [], ignorados: 0 });

    await mod.executarCiclo("test");
    vi.setSystemTime(new Date("2030-05-05T12:01:01.000Z"));
    await mod.executarCiclo("test");

    const status = document.getElementById("statusRobo");
    expect(state.ativo).toBe(false);
    expect(status.textContent).toBe("Procura parada: nenhum item encontrado em 1 minuto.");
    expect(mockLog).toHaveBeenCalledWith("⏹️ Procura parada: nenhum item encontrado em 1 minuto.", "warn");
  });

  it("atualiza progresso total a partir do JSON ativo ao iniciar", () => {
    state.itemMapAtivo = true;
    state.itemMap = {
      "320780": { ncm: "8471.30.12" },
      "320781": { ncm: "8471.30.12" },
    };

    mod.iniciar();

    expect(state.progresso.total).toBe(2);
    expect(mockResetarRodada).toHaveBeenCalledWith(state, expect.objectContaining({
      totalPlanejado: 2,
      fonteTotal: "json",
    }));
  });

  it("calcula total dinâmico como concluídos efetivos + pendentes do servidor", async () => {
    state.itemMap = {
      A: { ncm: "8471.30.12" },
      B: { ncm: "8471.30.12" },
      C: { ncm: "8471.30.12" },
      D: { ncm: "8471.30.12" },
      E: { ncm: "8471.30.12" },
      F: { ncm: "8471.30.12" },
      G: { ncm: "8471.30.12" },
    };
    state.progresso.concluidosIds = ["A", "B"];
    mockObterResumoPendentesServidor.mockReturnValue({
      primeiro: 1,
      ultimo: 5,
      total: 5,
      texto: "Exibindo SIN 1 a 5 de um total de 5",
    });

    await mod.executarCiclo("test");

    expect(state.progresso.atual).toBe(2);
    expect(state.progresso.total).toBe(7);
  });

  it("ajusta total automaticamente quando pendentes do servidor diminuem", async () => {
    state.itemMapAtivo = true;
    state.itemMap = {
      A: { ncm: "8471.30.12" },
      B: { ncm: "8471.30.12" },
      C: { ncm: "8471.30.12" },
      D: { ncm: "8471.30.12" },
      E: { ncm: "8471.30.12" },
      F: { ncm: "8471.30.12" },
      G: { ncm: "8471.30.12" },
    };
    state.progresso.concluidosIds = ["A", "B"];
    mockObterResumoPendentesServidor.mockReturnValue({
      primeiro: 1,
      ultimo: 5,
      total: 5,
      texto: "Exibindo SIN 1 a 5 de um total de 5",
    });
    await mod.executarCiclo("test");
    expect(state.progresso.total).toBe(7);
    expect(state.pausado).toBe(false);

    mockObterResumoPendentesServidor.mockReturnValue({
      primeiro: 1,
      ultimo: 3,
      total: 3,
      texto: "Exibindo SIN 1 a 3 de um total de 3",
    });
    state.itemMap = {
      A: { ncm: "8471.30.12" },
      B: { ncm: "8471.30.12" },
      C: { ncm: "8471.30.12" },
      D: { ncm: "8471.30.12" },
      E: { ncm: "8471.30.12" },
    };
    await mod.executarCiclo("test");

    expect(state.progresso.total).toBe(5);
    expect(state.pausado).toBe(false);
  });

  it("no modo JSON calcula concluídos pelo total do lote menos os pendentes do site", async () => {
    state.itemMapAtivo = true;
    state.itemMap = {
      A: { ncm: "8471.30.12" },
      B: { ncm: "8471.30.12" },
      C: { ncm: "8471.30.12" },
      D: { ncm: "8471.30.12" },
      E: { ncm: "8471.30.12" },
    };
    state.progresso.concluidosIds = ["A"];
    mockObterResumoPendentesServidor.mockReturnValue({
      primeiro: 1,
      ultimo: 3,
      total: 3,
      texto: "Exibindo SIN 1 a 3 de um total de 3",
    });

    await mod.executarCiclo("test");

    expect(state.progresso.atual).toBe(2);
    expect(state.progresso.total).toBe(5);
    expect(state.estatisticas.processados).toBe(2);
    expect(state.estimativa.totalPlanejado).toBe(5);
    expect(state.estimativa.restantes).toBe(3);
    expect(state.estimativa.fonteTotal).toBe("json");
  });

  it("no modo JSON usa fallback local quando a paginação do site não está disponível", async () => {
    state.itemMapAtivo = true;
    state.itemMap = {
      A: { ncm: "8471.30.12" },
      B: { ncm: "8471.30.12" },
      C: { ncm: "8471.30.12" },
    };
    state.progresso.concluidosIds = ["A", "B", "X"];
    mockObterResumoPendentesServidor.mockReturnValue(null);

    await mod.executarCiclo("test");

    expect(state.progresso.atual).toBe(2);
    expect(state.progresso.total).toBe(3);
    expect(state.estimativa.restantes).toBe(1);
    expect(state.estatisticas.processados).toBe(2);
  });

  it("mantém o total conhecido ao abrir um item sem lista visível", async () => {
    state.itemMapAtivo = false;
    state.progresso = { atual: 0, total: 5, ultimoProcessado: null, concluidosIds: [] };
    state.estimativa.totalPlanejado = 5;
    mockObterResumoPendentesServidor.mockReturnValue(null);
    mockEncontrarItensPendentesInfo.mockReturnValue({
      elegiveis: [],
      ignorados: 0,
      inelegiveisConhecidos: [],
      desconhecidos: [],
      totalVisiveis: 0,
    });

    await mod.executarCiclo("item-aberto");

    expect(state.progresso.atual).toBe(0);
    expect(state.progresso.total).toBe(5);
    expect(state.estimativa.totalPlanejado).toBe(5);
    expect(state.estimativa.restantes).toBe(5);
  });

  it("no modo JSON continua abrindo o item da lista antes de validar o ID real da tela", async () => {
    state.itemMapAtivo = true;
    state.itemMap = {
      "300": { ncm: "8471.30.12" },
    };
    const linkLista = buildLink("84548");
    mockEncontrarItensPendentesInfo.mockReturnValue({ elegiveis: [linkLista], ignorados: 0 });
    mockExtrairItemKey.mockImplementation((link) => link?.dataset?.key || null);

    await mod.executarCiclo("test");

    expect(state.pausado).toBe(false);
    expect(mockInteragir).toHaveBeenCalledTimes(1);
    expect(mockInteragir).toHaveBeenCalledWith(linkLista, null, "selecionarItemNormal");
    expect(state.itemAtualKey).toBe("84548");
    expect(state.estatisticas.erros).toBe(0);
    expect(state.progresso.atual).toBe(0);
    expect(state.progresso.total).toBe(1);
  });

  it("pausa quando o item já aberto na tela não existe no JSON ativo", async () => {
    state.itemMapAtivo = true;
    state.itemMap = {
      "300": { ncm: "8471.30.12" },
    };
    mockObterItemIdAtual.mockReturnValue("999");
    mockSincronizarItemAtual.mockImplementation(() => {
      state.itemAtualKey = "84548";
      state.itemAtualTelaId = "999";
      return "84548";
    });

    await mod.executarCiclo("test");

    expect(state.pausado).toBe(true);
    expect(mockInteragir).not.toHaveBeenCalled();
    expect(state.estatisticas.erros).toBe(1);
    expect(state.estatisticas.ultimoErro?.tipo).toBe("item_sem_json");
    expect(mockLog).toHaveBeenCalledWith(expect.stringContaining("Item 999 aberto na tela não existe no JSON ativo"), "error");
    expect(state.trilhaExecucao.items["999"].status).toBe("pausado");
    expect(state.trilhaExecucao.items["999"].events.map((evento) => evento.tipo)).toContain("item_sem_json");
  });

  it("pausa sem clicar quando txtNumero aberto não existe no JSON ativo", async () => {
    state.itemMapAtivo = true;
    state.itemMap = {
      "300": { ncm: "8471.30.12" },
    };
    mockObterItemIdAtual.mockReturnValue("342799");
    mockSincronizarItemAtual.mockImplementation(() => {
      state.itemAtualKey = "84548";
      state.itemAtualTelaId = "342799";
      return "84548";
    });

    await mod.executarCiclo("test");

    expect(state.pausado).toBe(true);
    expect(state.estatisticas.ultimoErro?.tipo).toBe("item_sem_json");
    expect(mockInteragir).not.toHaveBeenCalled();
    expect(mockAtuar).not.toHaveBeenCalled();
    expect(mockNcm).not.toHaveBeenCalled();
    expect(mockProsseguir).not.toHaveBeenCalled();
  });

  it("continua o fluxo quando txtNumero aberto existe no JSON ativo", async () => {
    state.itemMapAtivo = true;
    state.itemMap = {
      "342799": { ncm: "8471.30.12", nbs: null, cest: null, unspsc: null, lei116: null },
    };
    state.acoes = {
      ncm: { ativo: true, seletor: "#txtNCMTIPI", valor: "0000.00.00", ordem: 1 },
    };
    mockObterItemIdAtual.mockReturnValue("342799");
    mockSincronizarItemAtual.mockImplementation(() => {
      state.itemAtualKey = "84548";
      state.itemAtualTelaId = "342799";
      return "84548";
    });
    mockNcm.mockResolvedValue(true);

    await mod.executarCiclo("test");

    expect(state.pausado).toBe(false);
    expect(mockGetValoresParaItem).toHaveBeenCalledWith(state, "342799");
    expect(mockNcm).toHaveBeenCalled();
    expect(state.estatisticas.ultimoErro?.tipo).not.toBe("item_sem_json");
  });

  it("pausa uma vez quando JSON da empresa atual não traz campo obrigatório", async () => {
    document.body.innerHTML = `
      <span id="lblUsuario">ISRAEL DE SENA XAVIER MACHADO//RODONAVES</span>
      <div id="statusRobo"></div>
    `;
    state.itemMapAtivo = true;
    state.itemAtualKey = "1001";
    state.itemAtualTelaId = "1001";
    state.itemMap = {
      "1001": { ncm: "8708.29.99", nbs: null, cest: null, unspsc: null, lei116: null },
      "1002": { ncm: "3917.29.00", nbs: null, cest: null, unspsc: null, lei116: null },
    };
    mockSincronizarItemAtual.mockReturnValue("1001");
    mockObterItemIdAtual.mockReturnValue("1001");

    await mod.executarCiclo("test");

    expect(state.pausado).toBe(true);
    expect(state.estatisticas.ultimoErro?.tipo).toBe("json_empresa_obrigatorio");
    expect(state.estatisticas.ultimoErro?.mensagem).toContain("RODONAVES exige CEST");
    expect(state.itemFlags["1001"].jsonEmpresaCamposLiberados).toEqual(["cest"]);
  });

  it("não pausa por CEST ausente quando o NCM não tem CEST compatível", async () => {
    document.body.innerHTML = `
      <span id="lblUsuario">ISRAEL DE SENA XAVIER MACHADO//RODONAVES</span>
      <div id="statusRobo"></div>
      <input id="butAcao2" value="Prosseguir" />
    `;
    state.itemMapAtivo = true;
    state.itemAtualKey = "1001";
    state.itemAtualTelaId = "1001";
    state.itemMap = {
      "1001": { ncm: "9999.99.99", nbs: null, cest: null, unspsc: null, lei116: null },
    };
    state.acoes = {
      prosseguir: { ativo: true, seletor: "#butAcao2", valor: null, ordem: 1 },
    };
    mockSincronizarItemAtual.mockReturnValue("1001");
    mockObterItemIdAtual.mockReturnValue("1001");
    mockProsseguir.mockResolvedValue(true);

    await mod.executarCiclo("test");

    expect(state.pausado).toBe(false);
    expect(state.estatisticas.ultimoErro?.tipo).not.toBe("json_empresa_obrigatorio");
    expect(mockProsseguir).toHaveBeenCalled();
  });

  it("não pausa por CEST ausente quando nenhum item compatível do lote trouxe CEST", async () => {
    document.body.innerHTML = `
      <span id="lblUsuario">ISRAEL DE SENA XAVIER MACHADO//RODONAVES</span>
      <div id="statusRobo"></div>
      <input id="butAcao2" value="Prosseguir" />
    `;
    state.itemMapAtivo = true;
    state.itemAtualKey = "1001";
    state.itemAtualTelaId = "1001";
    state.itemMap = {
      "1001": { ncm: "8708.29.99", nbs: null, cest: null, unspsc: null, lei116: null },
      "1002": { ncm: "3917.29.00", nbs: null, cest: "01.002.00", unspsc: null, lei116: null },
    };
    state.acoes = {
      prosseguir: { ativo: true, seletor: "#butAcao2", valor: null, ordem: 1 },
    };
    mockSincronizarItemAtual.mockReturnValue("1001");
    mockObterItemIdAtual.mockReturnValue("1001");
    mockProsseguir.mockResolvedValue(true);

    await mod.executarCiclo("test");

    expect(state.pausado).toBe(false);
    expect(state.estatisticas.ultimoErro?.tipo).not.toBe("json_empresa_obrigatorio");
    expect(mockProsseguir).toHaveBeenCalled();
  });

  it("não pausa de novo quando o campo obrigatório ausente já foi liberado para o item", async () => {
    document.body.innerHTML = `
      <span id="lblUsuario">ISRAEL DE SENA XAVIER MACHADO//RODONAVES</span>
      <div id="statusRobo"></div>
      <input id="butAcao2" value="Prosseguir" />
    `;
    state.itemMapAtivo = true;
    state.itemAtualKey = "1001";
    state.itemAtualTelaId = "1001";
    state.itemFlags["1001"] = { jsonEmpresaCamposLiberados: ["cest"] };
    state.itemMap = {
      "1001": { ncm: "8708.29.99", nbs: null, cest: null, unspsc: null, lei116: null },
    };
    state.acoes = {
      prosseguir: { ativo: true, seletor: "#butAcao2", valor: null, ordem: 1 },
    };
    mockSincronizarItemAtual.mockReturnValue("1001");
    mockObterItemIdAtual.mockReturnValue("1001");
    mockProsseguir.mockResolvedValue(true);

    await mod.executarCiclo("test");

    expect(state.pausado).toBe(false);
    expect(mockProsseguir).toHaveBeenCalled();
  });

  it("não contabiliza item sem JSON como concluído mesmo quando o site informa pendentes", async () => {
    state.itemMapAtivo = true;
    state.itemMap = {
      A: { ncm: "8471.30.12" },
      B: { ncm: "8471.30.12" },
      C: { ncm: "8471.30.12" },
    };
    mockObterResumoPendentesServidor.mockReturnValue({
      primeiro: 1,
      ultimo: 3,
      total: 3,
      texto: "Exibindo SIN 1 a 3 de um total de 3",
    });
    mockObterItemIdAtual.mockReturnValue("999");
    mockSincronizarItemAtual.mockImplementation(() => {
      state.itemAtualKey = "84548";
      state.itemAtualTelaId = "999";
      return "84548";
    });

    await mod.executarCiclo("test");

    expect(state.pausado).toBe(true);
    expect(state.progresso.atual).toBe(0);
    expect(state.progresso.total).toBe(3);
    expect(state.estimativa.restantes).toBe(3);
    expect(mockInteragir).not.toHaveBeenCalled();
  });

  it("usa o resolvedor do ItemMapManager com o ID real da tela antes de pausar", async () => {
    state.itemMapAtivo = true;
    state.itemMap = {};
    mockObterItemIdAtual.mockReturnValue("999");
    mockSincronizarItemAtual.mockImplementation(() => {
      state.itemAtualKey = "84548";
      state.itemAtualTelaId = "999";
      return "84548";
    });
    mockGetValoresParaItem.mockImplementation((_estado, itemId) => (
      String(itemId).trim() === "999" ? { ncm: "8471.30.12" } : null
    ));

    await mod.executarCiclo("test");

    expect(state.pausado).toBe(false);
    expect(mockGetValoresParaItem).toHaveBeenCalledWith(state, "999");
    expect(state.estatisticas.erros).toBe(0);
  });

  it("retoma da lista após pausa por item sem JSON sem reaproveitar o itemAtualTelaId antigo", async () => {
    state.itemMapAtivo = true;
    state.itemMap = {
      "84560": { ncm: "8471.30.12" },
    };
    state.pausado = false;
    state.itemAtualKey = "84548";
    state.itemAtualTelaId = "300994";
    state.itemMapUltimoAplicadoId = "300994";
    state.estatisticas.ultimoErro = {
      tipo: "item_sem_json",
      mensagem: "Item 300994 aberto na tela não existe no JSON ativo.",
      timestamp: new Date().toISOString(),
    };

    const linkLista = buildLink("84560");
    mockEncontrarItensPendentesInfo.mockReturnValue({ elegiveis: [linkLista], ignorados: 0 });
    mockExtrairItemKey.mockImplementation((link) => link?.dataset?.key || null);
    mockSincronizarItemAtual.mockImplementation(() => state.itemAtualKey);
    mockObterItemIdAtual.mockReturnValue(null);

    await mod.executarCiclo("test");

    expect(state.pausado).toBe(false);
    expect(state.itemAtualTelaId).toBeNull();
    expect(state.itemMapUltimoAplicadoId).toBeNull();
    expect(state.itemAtualKey).toBe("84560");
    expect(mockInteragir).toHaveBeenCalledWith(linkLista, null, "selecionarItemNormal");
    expect(state.estatisticas.erros).toBe(0);
  });

  it("não limpa itemAtualTelaId antigo fora da tela de lista para preservar o contexto do detalhe", async () => {
    state.itemMapAtivo = true;
    state.itemMap = {
      "300994": { ncm: "8526.10.00" },
    };
    state.itemAtualKey = "84550";
    state.itemAtualTelaId = "300994";
    state.itemMapUltimoAplicadoId = "300994";
    mockSincronizarItemAtual.mockImplementation(() => state.itemAtualKey);
    mockObterItemIdAtual.mockReturnValue(null);
    mockEncontrarItensPendentesInfo.mockReturnValue({ elegiveis: [], ignorados: 0 });
    document.body.innerHTML = '<div id="statusRobo"></div><div id="pagina-detalhe"></div>';

    await mod.executarCiclo("test");

    expect(state.itemAtualTelaId).toBe("300994");
    expect(state.itemMapUltimoAplicadoId).toBe("300994");
    expect(state.pausado).toBe(false);
  });

  it("libera prosseguir no fluxo inline somente quando readonly confirma o UNSPSC", async () => {
    state.itemMapAtivo = true;
    state.itemMap = { "320780": { ncm: "8471.30.12" } };
    state.itemAtualKey = "320780";
    state.itemAtualTelaId = "320780";
    state.itemFlags["320780"] = { unspscFeito: false };
    mockDetectarModoUnspsc.mockReturnValue("inline");
    mockUnspscDescricaoDefinida.mockReturnValue(true);
    const resultados = [];
    mockProsseguir.mockImplementation(async (_estado, _status, ctx) => {
      resultados.push(ctx.itemJaTemUnspsc(_estado));
      return false;
    });

    await mod.executarCiclo("test");

    expect(mockProsseguir).toHaveBeenCalled();
    expect(resultados).toContain(true);
  });

  it("no modo JSON deduplica concluídos e usa fallback filtrado pelo JSON quando não há resumo do site", async () => {
    state.itemMapAtivo = true;
    state.itemMap = {
      A: { ncm: "8471.30.12" },
      C: { ncm: "8471.30.12" },
    };
    state.progresso.concluidosIds = ["A", "A", "B"];
    mockObterResumoPendentesServidor.mockReturnValue(null);

    await mod.executarCiclo("test");

    expect(state.progresso.atual).toBe(1);
    expect(state.progresso.total).toBe(2);
  });
});
