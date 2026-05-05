import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let state;
let session;

const mockUpdate = vi.fn((fn) => {
  if (typeof fn === "function") fn(state);
  else Object.assign(state, fn);
  return state;
});
const mockBuscarElementoDeep = vi.fn(() => null);
const mockObterItemIdAtual = vi.fn(() => "320780");

vi.mock("../src/core/estado-manager.ts", async () => {
  const actual = await vi.importActual("../src/core/estado-manager.ts");
  return {
    ...actual,
    update: mockUpdate,
  };
});

vi.mock("../src/utils/selectors.ts", () => ({
  buscarElementoDeep: mockBuscarElementoDeep,
}));

vi.mock("../src/data/item-map-manager.ts", () => ({
  obterItemIdAtual: mockObterItemIdAtual,
}));

function buildState(overrides = {}) {
  return {
    itemMapAtivo: false,
    itemMapJson: "",
    itemAtualKey: "320780",
    itemAtualTelaId: null,
    reportingSessionMap: {},
    reporting: {
      serviceUrl: "http://127.0.0.1:8765",
      apiToken: "km-local-token",
      sessionRunId: null,
      transport: "auto",
      maxFileSizeMb: 25,
      maxFilesPerItem: 20,
      ocrEnabled: true,
      ocrEngine: "tesseract",
    },
    ...overrides,
  };
}

describe("reporting/session", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-04T12:34:56"));
    state = buildState();
    mockUpdate.mockClear();
    mockBuscarElementoDeep.mockReset();
    mockBuscarElementoDeep.mockReturnValue(null);
    mockObterItemIdAtual.mockReset();
    mockObterItemIdAtual.mockReturnValue("320780");
    session = await import("../src/reporting/session.ts");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("extrai projeto atual do label do usuário e faz fallback seguro", () => {
    const label = document.createElement("div");
    label.id = "lblUsuario";
    label.textContent = "israel // Projeto Fiscal";
    document.body.appendChild(label);

    expect(session.obterProjetoLabelAtual()).toBe("projeto_fiscal");

    document.body.innerHTML = "";
    expect(session.obterProjetoLabelAtual()).toBe("projeto_sem_nome");
  });

  it("reutiliza sessionRunId existente para a mesma chave projeto/item", () => {
    const label = document.createElement("div");
    label.id = "lblUsuario";
    label.textContent = "israel // Projeto Fiscal";
    document.body.appendChild(label);
    state.reportingSessionMap["proj:projeto_fiscal|item:320780"] = "session_existente";

    const runId = session.resolverOuCriarSessionRunId(state);

    expect(runId).toBe("session_existente");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("cria novo sessionRunId e persiste no mapa de sessão", () => {
    const label = document.createElement("div");
    label.id = "lblUsuario";
    label.textContent = "israel // Projeto Fiscal";
    document.body.appendChild(label);

    const runId = session.resolverOuCriarSessionRunId(state);

    expect(runId).toContain("session_projeto_fiscal_20260304_123456_");
    expect(state.reportingSessionMap["proj:projeto_fiscal|item:320780"]).toBe(runId);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("usa chave baseada em JSON ativo e reutiliza o mesmo runId", () => {
    const label = document.createElement("div");
    label.id = "lblUsuario";
    label.textContent = "israel // Projeto Fiscal";
    document.body.appendChild(label);
    state.itemMapAtivo = true;
    state.itemMapJson = '{"320780":{"ncm":"8471.30.12"}}';

    const first = session.resolverOuCriarSessionRunId(state);
    const second = session.resolverOuCriarSessionRunId(state);

    expect(first).toBe(second);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });

  it("faz touch da sessão no serviço com token e payload corretos", async () => {
    const label = document.createElement("div");
    label.id = "lblUsuario";
    label.textContent = "israel // Projeto Fiscal";
    document.body.appendChild(label);
    state.reporting.sessionRunId = "session_123";
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '{"ok":true,"sessionDir":"C:/tmp/session"}',
    }));
    vi.stubGlobal("fetch", fetchSpy);

    const data = await session.touchSessionNoServico(state, "manual-stop");

    expect(data).toEqual({ ok: true, sessionDir: "C:/tmp/session" });
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://127.0.0.1:8765/reports/session/touch",
      expect.objectContaining({
        method: "POST",
        credentials: "omit",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-KM-Token": "km-local-token",
        }),
      }),
    );
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body).toEqual(
      expect.objectContaining({
        sessionRunId: "session_123",
        projectName: "projeto_fiscal",
        reason: "manual-stop",
        itemRef: "320780",
      }),
    );
  });

  it("propaga erro textual retornado pelo serviço", async () => {
    state.reporting.sessionRunId = "session_erro";
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '{"ok":false,"errors":["token inválido","sem acesso"]}',
    }));
    vi.stubGlobal("fetch", fetchSpy);

    await expect(session.touchSessionNoServico(state, "manual-stop")).rejects.toThrow(
      "token inválido | sem acesso",
    );
  });
});

