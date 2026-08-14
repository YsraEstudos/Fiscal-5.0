import { beforeEach, describe, expect, it, vi } from "vitest";

const state = {
  pausado: false,
  itemAtualKey: "320780",
  itemAtualTelaId: "320780",
  progresso: { atual: 0, total: 3, ultimoProcessado: null },
  estatisticas: { processados: 0 },
  itemFlags: {},
  acoes: {
    confirmar: { ativo: true, seletor: "#butSim" },
    prosseguir: { ativo: true, seletor: "#butAcao1" },
    unspsc: { ativo: false, seletor: "#txtCodigoUnspsc" },
  },
};

const mockEstadoGet = vi.fn(() => state);
const mockEstadoUpdate = vi.fn((fn) => {
  if (typeof fn === "function") fn(state);
  else Object.assign(state, fn);
  return state;
});
const mockLog = vi.fn();
const mockInteragir = vi.fn(async () => true);
const mockBuscarElementoDeep = vi.fn();
const mockRegistrarConclusao = vi.fn();
const mockRegistrarEventoItem = vi.fn();
const mockObterConfirmacao = vi.fn();
const mockValidarAcoesObrigatorias = vi.fn(() => true);
const mockElementoVisivel = vi.fn(() => true);
const mockAtualizarBotaoToggle = vi.fn();

vi.mock("../src/core/estado-manager.ts", () => ({
  get: mockEstadoGet,
  update: mockEstadoUpdate,
}));
vi.mock("../src/core/log-manager.ts", () => ({ log: mockLog }));
vi.mock("../src/interaction/audio-manager.ts", () => ({ tocar: vi.fn() }));
vi.mock("../src/interaction/interacao.ts", () => ({ interagir: mockInteragir }));
vi.mock("../src/workflow/pagina-verificador.ts", () => ({ obterConfirmacao: mockObterConfirmacao }));
vi.mock("../src/validation/validador.ts", () => ({
  validarAcoesObrigatorias: mockValidarAcoesObrigatorias,
}));
vi.mock("../src/utils/dom-helpers.ts", () => ({ elementoVisivel: mockElementoVisivel }));
vi.mock("../src/utils/selectors.ts", () => ({ buscarElementoDeep: mockBuscarElementoDeep }));
vi.mock("../src/workflow/estimativa.ts", () => ({
  registrarConclusaoItem: mockRegistrarConclusao,
}));
vi.mock("../src/workflow/item-trace.ts", () => ({
  registrarEventoItem: mockRegistrarEventoItem,
}));

const mod = await import("../src/workflow/handlers/flow-control.ts");

function buildCtx(overrides = {}) {
  return {
    getAcao: (id) => state.acoes[id] || { ativo: false, seletor: "" },
    getValorAcao: vi.fn(),
    workflowState: {
      isCompleta: vi.fn(() => true),
      reset: vi.fn(),
    },
    itemJaTemUnspsc: vi.fn(() => true),
    ...overrides,
  };
}

describe("workflow/handlers/flow-control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";

    state.pausado = false;
    state.itemAtualKey = "320780";
    state.itemAtualTelaId = "320780";
    state.progresso = { atual: 0, total: 3, ultimoProcessado: null };
    state.estatisticas = { processados: 0 };
    state.itemFlags = {};
    state.acoes = {
      confirmar: { ativo: true, seletor: "#butSim" },
      prosseguir: { ativo: true, seletor: "#butAcao1" },
      unspsc: { ativo: false, seletor: "#txtCodigoUnspsc" },
    };

    mockRegistrarConclusao.mockReturnValue({ duracaoMs: 6500, restantes: 2 });
    mockObterConfirmacao.mockReturnValue({
      modalAberto: false,
      btnSim: null,
      btnSimContinuar: null,
    });

    mod.setAtualizarBotaoToggle(mockAtualizarBotaoToggle);
  });

  it("retorna false em confirmar quando a ação está desativada", async () => {
    state.acoes.confirmar.ativo = false;

    const ok = await mod.confirmar(state, { textContent: "" }, buildCtx());

    expect(ok).toBe(false);
    expect(mockObterConfirmacao).not.toHaveBeenCalled();
  });

  it("retorna false em confirmar quando não há modal aberto", async () => {
    const ok = await mod.confirmar(state, { textContent: "" }, buildCtx());

    expect(ok).toBe(false);
    expect(mockInteragir).not.toHaveBeenCalled();
  });

  it("retorna true em confirmar quando o modal está aberto sem botões visíveis", async () => {
    mockObterConfirmacao.mockReturnValue({
      modalAberto: true,
      btnSim: null,
      btnSimContinuar: null,
    });

    const ok = await mod.confirmar(state, { textContent: "" }, buildCtx());

    expect(ok).toBe(true);
    expect(mockInteragir).not.toHaveBeenCalled();
  });

  it("usa btnSimContinuar quando btnSim não está visível", async () => {
    const btnSim = document.createElement("button");
    const btnContinuar = document.createElement("button");
    mockObterConfirmacao.mockReturnValue({
      modalAberto: true,
      btnSim,
      btnSimContinuar: btnContinuar,
    });
    mockElementoVisivel.mockImplementation((el) => el === btnContinuar);

    const status = { textContent: "" };
    const ok = await mod.confirmar(state, status, buildCtx());

    expect(ok).toBe(true);
    expect(status.textContent).toBe("Confirmando...");
    expect(mockInteragir).toHaveBeenCalledWith(btnContinuar, null, "confirmar");
  });

  it("pausa em confirmar quando a validação falha", async () => {
    const btnSim = document.createElement("button");
    mockObterConfirmacao.mockReturnValue({
      modalAberto: true,
      btnSim,
      btnSimContinuar: null,
    });
    mockValidarAcoesObrigatorias.mockReturnValue(false);

    const ok = await mod.confirmar(state, { textContent: "" }, buildCtx());

    expect(ok).toBe(true);
    expect(state.pausado).toBe(true);
    expect(mockAtualizarBotaoToggle).toHaveBeenCalled();
    expect(mockInteragir).not.toHaveBeenCalled();
  });

  it("bloqueia prosseguir quando UNSPSC ainda não foi concluído", async () => {
    state.acoes.unspsc.ativo = true;
    const ctx = buildCtx({
      workflowState: {
        isCompleta: vi.fn(() => false),
        reset: vi.fn(),
      },
      itemJaTemUnspsc: vi.fn(() => false),
    });

    const ok = await mod.prosseguir(state, { textContent: "" }, ctx);

    expect(ok).toBe(false);
    expect(mockInteragir).not.toHaveBeenCalled();
  });

  it("marca unspscFeito quando o valor já está preenchido na tela", async () => {
    state.acoes.unspsc.ativo = true;
    const button = document.createElement("button");
    mockBuscarElementoDeep.mockReturnValue(button);
    const ctx = buildCtx({
      workflowState: {
        isCompleta: vi.fn(() => false),
        reset: vi.fn(),
      },
      itemJaTemUnspsc: vi.fn(() => true),
    });

    const ok = await mod.prosseguir(state, { textContent: "" }, ctx);

    expect(ok).toBe(true);
    expect(state.itemFlags["320780"].unspscFeito).toBe(true);
    expect(mockLog).toHaveBeenCalledWith(
      expect.stringContaining("UNSPSC já preenchido na tela"),
      "info",
    );
  });

  it("retorna false quando não encontra botão de prosseguir", async () => {
    mockBuscarElementoDeep.mockReturnValue(null);

    const ok = await mod.prosseguir(state, { textContent: "" }, buildCtx());

    expect(ok).toBe(false);
    expect(mockLog).toHaveBeenCalledWith(
      "⚠️ Botão Prosseguir não encontrado na página",
      "warn",
    );
  });

  it("usa fallback do DOM para localizar o botão de prosseguir", async () => {
    mockBuscarElementoDeep.mockReturnValue(null);
    const button = document.createElement("input");
    button.value = "Prosseguir";
    button.setAttribute("value", "Prosseguir");
    document.body.appendChild(button);

    const ok = await mod.prosseguir(state, { textContent: "" }, buildCtx());

    expect(ok).toBe(true);
    expect(mockInteragir).toHaveBeenCalledWith(button, null, "prosseguir");
  });

  it("pausa em prosseguir quando a validação falha", async () => {
    const button = document.createElement("button");
    mockBuscarElementoDeep.mockReturnValue(button);
    mockValidarAcoesObrigatorias.mockReturnValue(false);

    const ok = await mod.prosseguir(state, { textContent: "" }, buildCtx());

    expect(ok).toBe(true);
    expect(state.pausado).toBe(true);
    expect(mockAtualizarBotaoToggle).toHaveBeenCalled();
    expect(mockInteragir).not.toHaveBeenCalled();
  });

  it("prosseguir segue em contexto de serviço quando validação obrigatória aprova", async () => {
    const button = document.createElement("button");
    mockBuscarElementoDeep.mockReturnValue(button);
    mockValidarAcoesObrigatorias.mockImplementation((getEstado, getValorAcao) => {
      expect(getValorAcao("ncm", getEstado())).toBe("1.0105.40.00");
      return true;
    });
    const ctx = buildCtx({
      getValorAcao: (id) => {
        if (id === "ncm") return "1.0105.40.00";
        if (id === "unspsc") return "30103618";
        return null;
      },
      workflowState: { isCompleta: vi.fn(() => true), reset: vi.fn() },
    });

    const ok = await mod.prosseguir(state, { textContent: "" }, ctx);
    expect(ok).toBe(true);
    expect(state.pausado).toBe(false);
    expect(mockInteragir).toHaveBeenCalledWith(button, null, "prosseguir");
  });

  it("só registra conclusão depois de clicar em prosseguir", async () => {
    const button = document.createElement("button");
    mockBuscarElementoDeep.mockReturnValue(button);
    const workflowState = { isCompleta: vi.fn(() => true), reset: vi.fn() };

    const ok = await mod.prosseguir(
      state,
      { textContent: "" },
      buildCtx({ workflowState, itemJaTemUnspsc: vi.fn(() => true) }),
    );

    expect(ok).toBe(true);
    expect(mockInteragir).toHaveBeenCalledWith(button, null, "prosseguir");
    expect(state.progresso.atual).toBe(1);
    expect(state.progresso.ultimoProcessado).toBe("320780");
    expect(state.estatisticas.processados).toBe(1);
    expect(mockRegistrarConclusao).toHaveBeenCalledWith(state, "320780", expect.any(Number));
    expect(mockRegistrarEventoItem).toHaveBeenCalledWith(
      state,
      "320780",
      "item_concluido",
      expect.objectContaining({
        payload: expect.objectContaining({
          progressoAtual: 1,
          progressoTotal: 3,
          duracaoMs: 6500,
        }),
      }),
    );
    expect(workflowState.reset).toHaveBeenCalled();
  });

  it("não incrementa progresso se o clique falhar", async () => {
    const button = document.createElement("button");
    mockBuscarElementoDeep.mockReturnValue(button);
    mockInteragir.mockResolvedValueOnce(false);

    const ok = await mod.prosseguir(state, { textContent: "" }, buildCtx());

    expect(ok).toBe(false);
    expect(state.progresso.atual).toBe(0);
    expect(state.progresso.ultimoProcessado).toBe(null);
    expect(mockRegistrarConclusao).not.toHaveBeenCalled();
    expect(mockRegistrarEventoItem).not.toHaveBeenCalled();
  });

  it("prosseguir avança quando unspscFeito está presente nas itemFlags mesmo sem workflowState.isCompleta", async () => {
    const button = document.createElement("button");
    mockBuscarElementoDeep.mockReturnValue(button);
    const workflowState = { isCompleta: vi.fn(() => false), reset: vi.fn() };
    const stateComFlags = {
      ...state,
      itemFlags: { "320780": { unspscFeito: true } },
      acoes: { ...state.acoes, unspsc: { ativo: true, seletor: "#txtCodigoUnspsc" } },
    };

    const ok = await mod.prosseguir(
      stateComFlags,
      { textContent: "" },
      buildCtx({ workflowState, itemJaTemUnspsc: vi.fn(() => false) }),
    );

    expect(ok).toBe(true);
    expect(mockInteragir).toHaveBeenCalledWith(button, null, "prosseguir");
  });
});
