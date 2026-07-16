import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let state;
const mockEstadoGet = vi.fn(() => state);
const mockEstadoUpdate = vi.fn((fn) => {
  fn(state);
  return state;
});
const mockLog = vi.fn();

vi.mock("../src/core/estado-manager.ts", () => ({
  get: mockEstadoGet,
  update: mockEstadoUpdate,
}));

vi.mock("../src/core/log-manager.ts", () => ({
  log: mockLog,
}));

const mod = await import("../src/workflow/acompanhamento-pause-control.ts");

function buildState(overrides = {}) {
  return {
    pausarEmReincidencia: true,
    pausarEmReincidenciaReativarEm: null,
    pausarAcompanhamento: true,
    pausarAcompanhamentoReativarEm: null,
    tempoDesativacaoChecksMinutos: 10,
    ...overrides,
  };
}

describe("workflow/acompanhamento-pause-control", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-01-01T12:00:00.000Z"));
    vi.clearAllMocks();
    state = buildState();
    mod.limpar();
  });

  afterEach(() => {
    mod.limpar();
    vi.useRealTimers();
  });

  it("desativa por dez minutos e reativa automaticamente", () => {
    document.body.innerHTML = '<input type="checkbox" id="chkPausarAcompanhamento">';
    const checkbox = document.getElementById("chkPausarAcompanhamento");
    const inicio = Date.now();

    mod.configurar(false);

    expect(state.pausarAcompanhamento).toBe(false);
    expect(state.pausarAcompanhamentoReativarEm).toBe(inicio + mod.ACOMPANHAMENTO_REATIVACAO_MS);

    vi.advanceTimersByTime(mod.ACOMPANHAMENTO_REATIVACAO_MS - 1);
    expect(state.pausarAcompanhamento).toBe(false);

    vi.advanceTimersByTime(1);
    expect(checkbox.checked).toBe(true);
    expect(state.pausarAcompanhamento).toBe(true);
    expect(state.pausarAcompanhamentoReativarEm).toBeNull();
  });

  it("desativa a segurança de reincidência pelo prazo configurado e reativa o check", () => {
    document.body.innerHTML = '<input type="checkbox" id="chkPausarReincidencia">';
    const checkbox = document.getElementById("chkPausarReincidencia");
    state.tempoDesativacaoChecksMinutos = 2;
    const inicio = Date.now();

    mod.configurarReincidencia(false);

    expect(state.pausarEmReincidencia).toBe(false);
    expect(state.pausarEmReincidenciaReativarEm).toBe(inicio + 2 * 60 * 1000);

    vi.advanceTimersByTime(2 * 60 * 1000);

    expect(checkbox.checked).toBe(true);
    expect(state.pausarEmReincidencia).toBe(true);
    expect(state.pausarEmReincidenciaReativarEm).toBeNull();
  });

  it("retoma o prazo salvo e corrige uma desativação expirada ao inicializar", () => {
    state = buildState({
      pausarAcompanhamento: false,
      pausarAcompanhamentoReativarEm: Date.now() + 5000,
    });

    mod.inicializar();
    vi.advanceTimersByTime(4999);
    expect(state.pausarAcompanhamento).toBe(false);

    vi.advanceTimersByTime(1);
   expect(state.pausarAcompanhamento).toBe(true);

    state = buildState({
      pausarAcompanhamento: false,
      pausarAcompanhamentoReativarEm: Date.now() - 1,
    });
    mod.inicializar();
    expect(state.pausarAcompanhamento).toBe(true);
    expect(state.pausarAcompanhamentoReativarEm).toBeNull();
  });
});
