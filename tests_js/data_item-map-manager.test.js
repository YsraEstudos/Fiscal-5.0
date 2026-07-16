import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLog = vi.fn();
const mockTocar = vi.fn();
const mockBuscarElementoDeep = vi.fn();
const mockEncontrarCampoNcmPreferido = vi.fn();
const mockEncontrarCampoLei116Grupo = vi.fn();
const mockEncontrarCampoLei116Subgrupo = vi.fn();

let state;
const estadoGet = vi.fn(() => state);
const estadoSet = vi.fn((next) => {
  state = next;
});

vi.mock("../src/core/log-manager.ts", () => ({ log: mockLog }));
vi.mock("../src/interaction/audio-manager.ts", () => ({ tocar: mockTocar }));
vi.mock("../src/utils/selectors.ts", () => ({
  buscarElementoDeep: mockBuscarElementoDeep,
  encontrarCampoNcmPreferido: mockEncontrarCampoNcmPreferido,
  encontrarCampoLei116Grupo: mockEncontrarCampoLei116Grupo,
  encontrarCampoLei116Subgrupo: mockEncontrarCampoLei116Subgrupo,
}));
vi.mock("../src/core/estado-manager.ts", () => ({
  get: estadoGet,
  set: estadoSet,
}));

const mod = await import("../src/data/item-map-manager.ts");

describe("data/item-map-manager", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="itemMapStatus"></div>`;
    history.replaceState({}, "", "/");
    state = {
      itemMapAtivo: false,
      itemMapJson: "",
      itemMap: {},
      itemMapUltimoAplicadoId: null,
      itemAtualKey: null,
      itemAtualTelaId: null,
      itemFlags: {},
      progresso: { atual: 0, total: 0, ultimoProcessado: null, concluidosIds: [], loteJsonAssinatura: null },
      estimativa: { totalPlanejado: 0, fonteTotal: null, restantes: 0 },
      acoes: {
        ncm: { valor: "8471.30.12", seletor: "#txtNCMTIPI" },
        cest: { valor: null, seletor: "#txtCest" },
        unspsc: { valor: "30103618", seletor: "#txtCodigoUnspsc" },
        lei116Servico: { valor: null, seletor: "input.Cat90, input.Cat91" },
      },
    };
    vi.clearAllMocks();
  });

  it("parseJsonParaMapa parseia objeto simples e gera warnings", () => {
    const raw = JSON.stringify({
      "1001": { ncm: "9999", unspsc: "abc" },
      "1002": { ncm: "8471.30.12", unspsc: "30103618" },
    });
    const parsed = mod.parseJsonParaMapa(raw);
    expect(parsed.map["1001"]).toEqual({ ncm: "9999", nbs: null, cest: null, unspsc: "abc", lei116: null });
    expect(parsed.warnings.join(" | ")).toMatch(/NCM inválido/);
    expect(parsed.warnings.join(" | ")).toMatch(/UNSPSC inválido/);
  });

  it("parseJsonParaMapa suporta array e aliases de id", () => {
    const raw = JSON.stringify([
      { ID: "A1", NCM: "8471.30.12", UNSPSC: "30103618" },
      { itemId: "A2", ncm: "1234.56.78", unspsc: "87654321" },
    ]);
    const parsed = mod.parseJsonParaMapa(raw);
    expect(parsed.map.A1.ncm).toBe("8471.30.12");
    expect(parsed.map.A2.unspsc).toBe("87654321");
  });

  it("parseJsonParaMapa suporta NBS explícito e valida lei116", () => {
    const raw = JSON.stringify({
      S1: { nbs: "1.0105.40.00", lei116: "7.02" },
      S2: { nbs: "1.0105.40.00", lei116: "7.2" },
    });
    const parsed = mod.parseJsonParaMapa(raw);
    expect(parsed.map.S1.ncm).toBeNull();
    expect(parsed.map.S1.nbs).toBe("1.0105.40.00");
    expect(parsed.map.S1.lei116).toBe("7.02");
    expect(parsed.warnings.join(" | ")).toMatch(/Lei 116 inválida \(7.2\)/);
  });

  it("parseJsonParaMapa aceita item contendo apenas lei116", () => {
    const raw = JSON.stringify({
      S1: { lei116: "7.02" },
    });
    const parsed = mod.parseJsonParaMapa(raw);
    expect(parsed.map.S1).toEqual({ ncm: null, nbs: null, cest: null, unspsc: null, lei116: "7.02" });
    expect(parsed.warnings).toEqual([]);
  });

  it("parseJsonParaMapa mantém compatibilidade com legado em ncm contendo NBS", () => {
    const raw = JSON.stringify({
      S3: { ncm: "1.0105.40.00", lei116: "7.02" },
    });
    const parsed = mod.parseJsonParaMapa(raw);
    expect(parsed.map.S3.ncm).toBeNull();
    expect(parsed.map.S3.nbs).toBe("1.0105.40.00");
  });

  it("parseJsonParaMapa retorna erro para JSON inválido e tipo inválido", () => {
    expect(mod.parseJsonParaMapa("{").error).toMatch(/JSON inválido/);
    expect(mod.parseJsonParaMapa("123").error).toMatch(/objeto ou array/);
  });

  it("obterItemIdAtual prioriza IdItem da URL antes dos fallbacks de seletores", () => {
    history.replaceState({}, "", "/SIN_Item.aspx?IdItem=254556&IdSIN=83552");
    mockBuscarElementoDeep.mockImplementation((sel) => {
      if (sel === "#txtNum") return { value: "83552" };
      return null;
    });
    expect(mod.obterItemIdAtual()).toBe("254556");
  });

  it("parseJsonParaMapa aceita CEST e aliases normalizando o código", () => {
    const raw = JSON.stringify({
      P1: { ncm: "8708.29.99", cest: "0107500" },
      P2: { ncm: "8708.29.99", CEST: "01.075.00 - Partes e acessórios" },
      P3: { ncm: "8708.29.99", codCest: "01.090.00" },
      P4: { ncm: "8708.29.99", codigoCest: "abc" },
    });
    const parsed = mod.parseJsonParaMapa(raw);
    expect(parsed.map.P1.cest).toBe("01.075.00");
    expect(parsed.map.P2.cest).toBe("01.075.00 - Partes e acessórios");
    expect(parsed.map.P3.cest).toBe("01.090.00");
    expect(parsed.warnings.join(" | ")).toMatch(/CEST inválido \(abc\)/);
  });

  it("obterItemIdAtual usa fallbacks de seletores quando a URL não traz IdItem", () => {
    mockBuscarElementoDeep.mockImplementation((sel) => {
      if (sel === "#txtNum") return null;
      if (sel === 'input[name="ctl00$Body$txtNum"]') return null;
      if (sel === 'input[name$="txtNum"]') return { value: " 320780 " };
      return null;
    });
    expect(mod.obterItemIdAtual()).toBe("320780");
  });

  it("obterItemIdAtual usa txtNumero quando txtNum não existe", () => {
    mockBuscarElementoDeep.mockImplementation((sel) => {
      if (sel === "#txtNumero") return { value: " 342799 " };
      return null;
    });
    expect(mod.obterItemIdAtual()).toBe("342799");
  });

  it("sincronizarItemAtual define itemAtualKey na primeira leitura", () => {
    state.itemAtualKey = null;
    mockBuscarElementoDeep.mockReturnValue({ value: "1009" });
    const out = mod.sincronizarItemAtual(state);
    expect(out).toBe("1009");
    expect(state.itemAtualKey).toBe("1009");
    expect(state.itemFlags["1009"]).toEqual({ unspscFeito: false });
    expect(estadoSet).toHaveBeenCalled();
  });

  it("getValorAcao usa itemMap para ncm/unspsc/lei116 quando ativo", () => {
    state.itemMapAtivo = true;
    state.itemAtualTelaId = "X1";
    state.itemMap = { X1: { ncm: "1111.22.33", nbs: null, cest: "01.075.00", unspsc: "12345678", lei116: null } };
    expect(mod.getValorAcao("ncm", state)).toBe("1111.22.33");
    expect(mod.getValorAcao("cest", state)).toBe("01.075.00");
    expect(mod.getValorAcao("unspsc", state)).toBe("12345678");
    expect(mod.getValorAcao("lei116Servico", state)).toBeNull();
    expect(mod.getValorAcao("outra", { ...state, acoes: { outra: { valor: "x" } } })).toBe("x");
  });

  it("getValorAcao prioriza NBS para ação ncm em contexto de serviço", () => {
    state.itemMapAtivo = true;
    state.itemAtualTelaId = "SVC1";
    state.itemMap = { SVC1: { ncm: "8471.30.12", nbs: "1.0105.40.00", cest: "01.075.00", unspsc: "12345678", lei116: "7.02" } };
    mockBuscarElementoDeep.mockImplementation((sel) => {
      if (sel === "#txtNBS") return { value: "1.0105.40.00" };
      if (sel === "#txtIncideNBS") return { value: "SIM" };
      return null;
    });
    expect(mod.getValorAcao("ncm", state)).toBe("1.0105.40.00");
  });

  it("getValorAcao não usa NCM padrão como NBS quando item só tem lei116", () => {
    state.itemMapAtivo = true;
    state.itemAtualTelaId = "SVC2";
    state.itemMap = { SVC2: { ncm: null, nbs: null, cest: null, unspsc: null, lei116: "7.02" } };
    mockBuscarElementoDeep.mockReturnValue(null);

    expect(mod.getValorAcao("ncm", state)).toBeNull();
    expect(mod.getValorAcao("lei116Servico", state)).toBe("7.02");
  });

  it("getValorAcao usa o IdItem da URL em vez do itemAtualKey da lista", () => {
    history.replaceState({}, "", "/SIN_Item.aspx?IdItem=254556&IdSIN=83552");
    state.itemMapAtivo = true;
    state.itemAtualKey = "83552";
    state.itemAtualTelaId = null;
    state.itemMap = {
      "254556": { ncm: "3917.29.00", nbs: null, cest: null, unspsc: null, lei116: null },
      "83552": { ncm: "9999.99.99", nbs: null, cest: null, unspsc: null, lei116: null },
    };
    mockBuscarElementoDeep.mockReturnValue(null);

    expect(mod.getValorAcao("ncm", state)).toBe("3917.29.00");
  });

  it("getValorAcao não usa valor padrão quando JSON ativo não contém o item atual", () => {
    state.itemMapAtivo = true;
    state.itemAtualTelaId = "342799";
    state.itemMap = {
      "111111": { ncm: "3917.29.00", nbs: null, cest: null, unspsc: null, lei116: null },
    };
    mockBuscarElementoDeep.mockReturnValue(null);

    expect(mod.getValorAcao("ncm", state)).toBeNull();
  });

  it("aplicarJson trata erro e JSON vazio", () => {
    const erro = mod.aplicarJson("{");
    expect(erro.ok).toBe(false);
    expect(mockTocar).toHaveBeenCalledWith("error");

    const vazio = mod.aplicarJson("   ");
    expect(vazio.ok).toBe(true);
    expect(state.itemMapAtivo).toBe(false);
  });

  it("aplicarJson válido ativa mapa e atualiza status", () => {
    const out = mod.aplicarJson(
      JSON.stringify({
        "1": { ncm: "8471.30.12", unspsc: "30103618" },
      }),
    );
    expect(out.ok).toBe(true);
    expect(state.itemMapAtivo).toBe(true);
    expect(Object.keys(state.itemMap)).toHaveLength(1);
    expect(state.progresso.total).toBe(1);
    expect(state.progresso.loteJsonAssinatura).toMatch(/^json:1:/);
    expect(state.estimativa.totalPlanejado).toBe(1);
    expect(document.getElementById("itemMapStatus").textContent).toMatch(/JSON ativo/);
  });

  it("preserva o progresso ao reaplicar o mesmo JSON e reinicia ao trocar o lote", () => {
    const primeiro = JSON.stringify({
      A: { ncm: "8471.30.12" },
      B: { ncm: "8471.30.12" },
    });
    mod.aplicarJson(primeiro);
    state.progresso = {
      ...state.progresso,
      atual: 1,
      ultimoProcessado: "A",
      concluidosIds: ["A"],
    };

    mod.aplicarJson(JSON.stringify({
      B: { ncm: "8471.30.12" },
      A: { ncm: "8471.30.12" },
    }));
    expect(state.progresso.atual).toBe(1);
    expect(state.progresso.concluidosIds).toEqual(["A"]);

    mod.aplicarJson(JSON.stringify({
      A: { ncm: "8471.30.12" },
      B: { ncm: "9999.99.99" },
      C: { ncm: "8708.29.99" },
    }));
    expect(state.progresso.atual).toBe(0);
    expect(state.progresso.total).toBe(3);
    expect(state.progresso.concluidosIds).toEqual([]);
    expect(state.progresso.loteJsonAssinatura).toMatch(/^json:3:/);
  });

  it("aplicarParaItemAtual registra aplicação única por item", () => {
    state.itemMapAtivo = true;
    state.itemAtualTelaId = "77";
    state.itemMap = { 77: { ncm: "8471.30.12", unspsc: "30103618" } };
    const e1 = mod.aplicarParaItemAtual(state);
    const e2 = mod.aplicarParaItemAtual(state);
    expect(e1.ncm).toBe("8471.30.12");
    expect(e2.unspsc).toBe("30103618");
    expect(state.itemMapUltimoAplicadoId).toBe("77");
  });

  it("gerarJsonDoItemAtual cria/atualiza JSON do item atual", () => {
    state.itemAtualTelaId = "990";
    state.itemMapJson = "{}";
    mockEncontrarCampoNcmPreferido.mockReturnValue({ value: "8471.30.12" });
    mockBuscarElementoDeep.mockImplementation((sel) => {
      if (sel === "#txtCodigoUnspsc") return { value: "30103618" };
      if (sel === "#txtCest") return { value: "01.075.00" };
      return null;
    });
    const textarea = document.createElement("textarea");
    textarea.value = "{}";
    mod.gerarJsonDoItemAtual(textarea);
    const parsed = JSON.parse(textarea.value);
    expect(parsed["990"].ncm).toBe("8471.30.12");
    expect(parsed["990"].nbs).toBeNull();
    expect(parsed["990"].cest).toBe("01.075.00");
    expect(parsed["990"].unspsc).toBe("30103618");
    expect(parsed["990"].lei116).toBeNull();
    expect(mockTocar).toHaveBeenCalledWith("success");
  });

  it("gerarJsonDoItemAtual inclui lei116 quando Cat90/Cat91 estão preenchidos", () => {
    state.itemAtualTelaId = "991";
    state.itemMapJson = "{}";
    mockEncontrarCampoNcmPreferido.mockReturnValue({ value: "8471.30.12" });
    mockBuscarElementoDeep.mockImplementation((sel) => {
      if (sel === "#txtCodigoUnspsc") return { value: "30103618" };
      if (sel === "#txtCest") return { value: "" };
      return null;
    });
    mockEncontrarCampoLei116Grupo.mockReturnValue({ value: "7" });
    mockEncontrarCampoLei116Subgrupo.mockReturnValue({ value: "02" });

    const textarea = document.createElement("textarea");
    textarea.value = "{}";
    mod.gerarJsonDoItemAtual(textarea);
    const parsed = JSON.parse(textarea.value);
    expect(parsed["991"].lei116).toBe("7.02");
    expect(mockTocar).toHaveBeenCalledWith("success");
  });

  // -------------------------------------------------------------------
  // Testes de contrato HTML — atualizarStatusUI
  // Estes testes garantem que o contrato DOM entre item-map-manager.ts
  // e o HTML do painel (painel-sections.ts) é mantido.
  // -------------------------------------------------------------------

  describe("contrato: atualizarStatusUI", () => {
    it("atualiza #itemMapStatus com texto 'JSON ativo' quando ativo", () => {
      state.itemMapAtivo = true;
      state.itemMap = { "1": { ncm: "8471.30.12" } };
      mod.atualizarStatusUI(state);
      const el = document.getElementById("itemMapStatus");
      expect(el.textContent).toMatch(/JSON ativo/);
      expect(el.style.color).toBe("rgb(11, 114, 133)");
    });

    it("atualiza #itemMapStatus com texto 'desativado' quando inativo", () => {
      state.itemMapAtivo = false;
      state.itemMap = {};
      mod.atualizarStatusUI(state);
      const el = document.getElementById("itemMapStatus");
      expect(el.textContent).toMatch(/desativado/);
      expect(el.style.color).toBe("rgb(102, 102, 102)");
    });

    it("não falha quando #itemMapStatus não existe no DOM", () => {
      document.body.innerHTML = "";
      expect(() => mod.atualizarStatusUI(state)).not.toThrow();
    });

    it("mostra detalhes do item quando itemId e entry são fornecidos", () => {
      state.itemMapAtivo = true;
      state.itemMap = { "42": { ncm: "1234.56.78", nbs: null, cest: null, unspsc: "99999999", lei116: null } };
      mod.atualizarStatusUI(state, { itemId: "42", entry: state.itemMap["42"] });
      const el = document.getElementById("itemMapStatus");
      expect(el.textContent).toContain("Item 42");
      expect(el.textContent).toContain("1234.56.78");
    });
  });
});

