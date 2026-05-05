import { beforeEach, describe, expect, it, vi } from "vitest";

let currentState = {};
const mockEstadoUpdate = vi.fn((fn) => {
  if (typeof fn === "function") fn(currentState);
  return currentState;
});
const mockLog = vi.fn();
const mockInteragir = vi.fn(async () => true);
const mockDigitarSilencioso = vi.fn(async () => { });
const mockBuscarElementoDeep = vi.fn();
const mockBuscarElementosDeep = vi.fn();
const mockWaitForAny = vi.fn(async () => ({}));
const mockElementoVisivel = vi.fn(() => true);
const mockSleep = vi.fn(async () => { });
const mockRegistrarEventoItemAtual = vi.fn();
const mockRegistrarEventoItem = vi.fn();

const cooldowns = new Map();
const mockSetCooldown = vi.fn((key) => cooldowns.set(key, true));
const mockIsAtivo = vi.fn((key) => cooldowns.get(key) === true);
const mockLimpar = vi.fn((key) => {
  if (key) cooldowns.delete(key);
  else cooldowns.clear();
});

vi.mock("../src/core/estado-manager.ts", () => ({ update: mockEstadoUpdate }));
vi.mock("../src/core/log-manager.ts", () => ({ log: mockLog }));
vi.mock("../src/core/cooldown-manager.ts", () => ({
  set: mockSetCooldown,
  isAtivo: mockIsAtivo,
  limpar: mockLimpar,
}));
vi.mock("../src/interaction/interacao.ts", () => ({
  interagir: mockInteragir,
  digitarSilencioso: mockDigitarSilencioso,
}));
vi.mock("../src/utils/dom-helpers.ts", () => ({ elementoVisivel: mockElementoVisivel }));
vi.mock("../src/utils/selectors.ts", () => ({
  buscarElementoDeep: mockBuscarElementoDeep,
  buscarElementosDeep: mockBuscarElementosDeep,
  waitForAny: mockWaitForAny,
}));
vi.mock("../src/utils/misc.ts", () => ({ sleep: mockSleep }));
vi.mock("../src/data/item-map-manager.ts", () => ({
  getValoresParaItem: vi.fn(() => null),
}));
vi.mock("../src/workflow/item-trace.ts", () => ({
  registrarEventoItemAtual: mockRegistrarEventoItemAtual,
  registrarEventoItem: mockRegistrarEventoItem,
}));

const mod = await import("../src/workflow/handlers/unspsc.ts");

function workflowStateBase() {
  return {
    unspscValorDigitado: false,
    unspscPesquisado: false,
    unspscSelecionado: false,
    _lupaRetryCount: 0,
    isCompleta: vi.fn(() => false),
    marcarCompleta: vi.fn(),
    debugLogThrottled: vi.fn(),
    getStatus: vi.fn(() => "ok"),
  };
}

function getAcaoFactory() {
  return (id) => {
    const map = {
      unspsc: { ativo: true, seletor: "#txtCodigoUnspsc" },
      pesquisar: { ativo: true, seletor: 'input[name*="butPesquisar"]' },
      resultado: { ativo: true, seletor: "a#txtDescricao" },
      selecionar: { ativo: true, seletor: "#butFechar" },
      lupaUnspsc: { ativo: true, seletor: "#ibutUNSPSC" },
    };
    return map[id] || { ativo: false, seletor: "" };
  };
}

describe("workflow/handlers/unspsc", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cooldowns.clear();
    document.body.innerHTML = "";
    currentState = { itemAtualKey: "320780", itemAtualTelaId: "320780", itemFlags: {} };
    delete globalThis.__doPostBack;
  });

  it("unspsc digita valor quando campo visível e diferente", async () => {
    const campo = document.createElement("input");
    campo.value = "";
    mockBuscarElementoDeep.mockReturnValue(campo);

    const workflowState = workflowStateBase();
    const status = { textContent: "" };
    const ok = await mod.unspsc(
      { itemAtualKey: "1", itemFlags: {} },
      status,
      {
        getAcao: getAcaoFactory(),
        workflowState,
        getModalUnspscContainer: () => null,
        valoresSaoIguais: () => false,
        getValorAcao: () => "30103618",
      },
    );
    expect(ok).toBe(true);
    expect(workflowState.unspscValorDigitado).toBe(true);
    expect(status.textContent).toMatch(/Digitando UNSPSC/);
    expect(mockInteragir).toHaveBeenCalled();
    expect(mockRegistrarEventoItemAtual).toHaveBeenCalledWith(
      expect.any(Object),
      "unspsc_preenchido",
      expect.objectContaining({
        resumo: "UNSPSC digitado com 30103618",
      }),
    );
  });

  it("unspsc usa digitacao silenciosa no campo inline com postback", async () => {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    const campo = document.createElement("input");
    campo.id = "txtCodUNSPSC";
    campo.value = "0";
    campo.setAttribute("name", "ctl00$Body$ucTabs$tabCategoriasMulti$txtCodUNSPSC");
    campo.setAttribute("onchange", "javascript:setTimeout('__doPostBack(\\'ctl00$Body$ucTabs$tabCategoriasMulti$txtCodUNSPSC\\',\\'\\')', 0)");
    const lupa = document.createElement("input");
    lupa.id = "ibutUNSPSC";
    lupa.setAttribute("type", "image");
    td.append(campo, lupa);
    tr.appendChild(td);
    document.body.appendChild(tr);

    const descricao = document.createElement("input");
    descricao.id = "txtUNSPSC";
    descricao.value = "< Não Definido >";
    document.body.appendChild(descricao);
    globalThis.__doPostBack = vi.fn();

    mockBuscarElementoDeep.mockImplementation((sel) => {
      if (sel.includes("#txtUNSPSC")) return descricao;
      if (sel === "#txtCodUNSPSC" || sel.includes("txtCodUNSPSC")) return campo;
      return null;
    });

    const workflowState = workflowStateBase();
    const status = { textContent: "" };
    const ok = await mod.unspsc(
      currentState,
      status,
      {
        getAcao: (id) => {
          if (id === "unspsc") return { ativo: true, seletor: "#txtCodUNSPSC" };
          return getAcaoFactory()(id);
        },
        workflowState,
        getModalUnspscContainer: () => null,
        valoresSaoIguais: () => false,
        getValorAcao: () => "30103618",
        getUnspscModo: () => "inline",
        pausarComAviso: vi.fn(),
      },
    );

    expect(ok).toBe(true);
    expect(workflowState.unspscValorDigitado).toBe(true);
    expect(mockDigitarSilencioso).toHaveBeenCalledWith(campo, "30103618");
    expect(mockInteragir).not.toHaveBeenCalled();
    expect(globalThis.__doPostBack).toHaveBeenCalledWith(
      "ctl00$Body$ucTabs$tabCategoriasMulti$txtCodUNSPSC",
      "",
    );
    expect(currentState.itemFlags["320780"]).toEqual(
      expect.objectContaining({
        unspscModoDetectado: "inline",
        unspscInlinePostbackTentado: true,
        unspscInlineFallbackTentado: false,
        unspscInlineValorTentado: "30103618",
      }),
    );
  });

  it("pesquisar aguarda resultados quando cooldown ativo", async () => {
    cooldowns.set("aguardandoResultados", true);
    const campo = document.createElement("input");
    campo.value = "30103618";
    mockBuscarElementoDeep.mockReturnValue(campo);
    const workflowState = { ...workflowStateBase(), unspscValorDigitado: true };
    const status = { textContent: "" };

    const ok = await mod.pesquisar(
      {},
      status,
      {
        getAcao: getAcaoFactory(),
        workflowState,
        getModalUnspscContainer: () => null,
        valoresSaoIguais: () => true,
        getValorAcao: () => "30103618",
      },
    );
    expect(ok).toBe(false);
    expect(status.textContent).toMatch(/Aguardando resultados/);
  });

  it("resultado marca selecionado quando checkbox já está marcado", async () => {
    document.body.innerHTML = `<img id="ckSelUNSPSC" src="check.gif" />`;
    const workflowState = workflowStateBase();
    const ok = await mod.resultado(
      {},
      { textContent: "" },
      {
        getAcao: getAcaoFactory(),
        workflowState,
        isModalUnspscAberto: () => true,
      },
    );
    expect(ok).toBe(false);
    expect(workflowState.unspscSelecionado).toBe(true);
  });

  it("selecionar conclui ação quando modal aberto e resultado selecionado", async () => {
    const btn = document.createElement("button");
    mockBuscarElementoDeep.mockReturnValue(btn);
    const workflowState = { ...workflowStateBase(), unspscSelecionado: true };
    const estado = { itemAtualKey: "320780", itemFlags: {} };
    const ok = await mod.selecionar(
      estado,
      { textContent: "" },
      {
        getAcao: getAcaoFactory(),
        workflowState,
        isModalUnspscAberto: () => true,
      },
    );
    expect(ok).toBe(true);
    expect(workflowState.marcarCompleta).toHaveBeenCalledWith("selecionar");
    expect(mockSetCooldown).toHaveBeenCalled();
    expect(mockEstadoUpdate).toHaveBeenCalled();
    expect(mockRegistrarEventoItem).toHaveBeenCalledWith(
      expect.any(Object),
      "320780",
      "unspsc_selecionado",
      expect.objectContaining({
        payload: expect.objectContaining({ valor: null }),
      }),
    );
  });

  it("pesquisar registra evento quando clica com sucesso", async () => {
    const campo = document.createElement("input");
    campo.value = "30103618";
    const botao = document.createElement("button");
    mockBuscarElementoDeep.mockImplementation((sel) => {
      if (sel === "#txtCodigoUnspsc") return campo;
      if (sel.includes("butPesquisar")) return botao;
      return null;
    });
    const workflowState = { ...workflowStateBase(), unspscValorDigitado: true };

    const ok = await mod.pesquisar(
      currentState,
      { textContent: "" },
      {
        getAcao: getAcaoFactory(),
        workflowState,
        getModalUnspscContainer: () => null,
        valoresSaoIguais: () => true,
        getValorAcao: () => "30103618",
      },
    );

    expect(ok).toBe(true);
    expect(mockRegistrarEventoItemAtual).toHaveBeenCalledWith(
      expect.any(Object),
      "unspsc_pesquisado",
      expect.objectContaining({
        payload: expect.objectContaining({ valor: "30103618" }),
      }),
    );
  });

  it("pesquisar usa fallback inline quando postback voltou sem classificação", async () => {
    const campo = document.createElement("input");
    campo.id = "txtCodUNSPSC";
    campo.value = "30103618";
    const descricao = document.createElement("input");
    descricao.id = "txtUNSPSC";
    descricao.value = "< Não Definido >";
    const botao = document.createElement("input");
    botao.id = "ibutUNSPSC";
    botao.setAttribute("type", "image");
    document.body.append(campo, descricao, botao);

    currentState.itemFlags["320780"] = {
      unspscModoDetectado: "inline",
      unspscInlinePostbackTentado: true,
      unspscInlineFallbackTentado: false,
      unspscInlineValorTentado: "30103618",
    };

    mockBuscarElementoDeep.mockImplementation((sel) => {
      if (sel.includes("#txtUNSPSC")) return descricao;
      if (sel.includes("#txtCodUNSPSC")) return campo;
      if (sel.includes("#ibutUNSPSC")) return botao;
      return null;
    });

    const workflowState = { ...workflowStateBase(), unspscValorDigitado: true };
    const ok = await mod.pesquisar(
      currentState,
      { textContent: "" },
      {
        getAcao: (id) => {
          if (id === "unspsc") return { ativo: true, seletor: "#txtCodUNSPSC" };
          return getAcaoFactory()(id);
        },
        workflowState,
        getModalUnspscContainer: () => null,
        valoresSaoIguais: () => true,
        getValorAcao: () => "30103618",
        getUnspscModo: () => "inline",
        pausarComAviso: vi.fn(),
      },
    );

    expect(ok).toBe(true);
    expect(mockInteragir).toHaveBeenCalledWith(botao, null, "pesquisar");
    expect(currentState.itemFlags["320780"]).toEqual(
      expect.objectContaining({
        unspscInlineFallbackTentado: true,
      }),
    );
  });

  it("unspsc pausa o item quando inline falhou após postback e fallback", async () => {
    const campo = document.createElement("input");
    campo.id = "txtCodUNSPSC";
    campo.value = "30103618";
    const descricao = document.createElement("input");
    descricao.id = "txtUNSPSC";
    descricao.value = "< Não Definido >";
    document.body.append(campo, descricao);

    currentState.itemFlags["320780"] = {
      unspscModoDetectado: "inline",
      unspscInlinePostbackTentado: true,
      unspscInlineFallbackTentado: true,
      unspscInlineValorTentado: "30103618",
    };

    const pausarComAviso = vi.fn();
    mockBuscarElementoDeep.mockImplementation((sel) => {
      if (sel.includes("#txtUNSPSC")) return descricao;
      if (sel.includes("#txtCodUNSPSC")) return campo;
      return null;
    });

    const ok = await mod.unspsc(
      currentState,
      { textContent: "" },
      {
        getAcao: (id) => {
          if (id === "unspsc") return { ativo: true, seletor: "#txtCodUNSPSC" };
          return getAcaoFactory()(id);
        },
        workflowState: workflowStateBase(),
        getModalUnspscContainer: () => null,
        valoresSaoIguais: () => true,
        getValorAcao: () => "30103618",
        getUnspscModo: () => "inline",
        pausarComAviso,
      },
    );

    expect(ok).toBe(true);
    expect(pausarComAviso).toHaveBeenCalledWith(
      expect.stringContaining("UNSPSC inline"),
      expect.objectContaining({ tipo: "unspsc_inline_falha" }),
    );
  });

  it("lupaUnspsc executa clique e espera modal", async () => {
    const lupa = document.createElement("button");
    mockBuscarElementoDeep.mockImplementation((sel) => {
      if (sel === "#ibutUNSPSC") return lupa;
      return null;
    });
    const workflowState = workflowStateBase();
    const ok = await mod.lupaUnspsc(
      { itemAtualKey: "A", itemFlags: {} },
      { textContent: "" },
      {
        getAcao: getAcaoFactory(),
        workflowState,
        getModalUnspscContainer: () => null,
        isModalUnspscAberto: () => false,
        getUnspscModo: () => "modal",
      },
    );
    expect(ok).toBe(true);
    expect(mockInteragir).toHaveBeenCalledWith(lupa, null, "lupaUnspsc");
    expect(mockWaitForAny).toHaveBeenCalled();
  });

  it("resultado e selecionar viram no-op no fluxo inline", async () => {
    const workflowState = { ...workflowStateBase(), unspscPesquisado: true, unspscSelecionado: true };

    const okResultado = await mod.resultado(
      currentState,
      { textContent: "" },
      {
        getAcao: getAcaoFactory(),
        workflowState,
        isModalUnspscAberto: () => false,
        getUnspscModo: () => "inline",
      },
    );

    const okSelecionar = await mod.selecionar(
      currentState,
      { textContent: "" },
      {
        getAcao: getAcaoFactory(),
        workflowState,
        isModalUnspscAberto: () => false,
        getUnspscModo: () => "inline",
      },
    );

    expect(okResultado).toBe(false);
    expect(okSelecionar).toBe(false);
  });
});
