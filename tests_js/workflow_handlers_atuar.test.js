import { beforeEach, describe, expect, it, vi } from "vitest";

const mockTentarComRetry = vi.fn(async () => true);
const mockElementoVisivel = vi.fn(() => true);
const mockBuscarElementoDeep = vi.fn();

vi.mock("../src/interaction/interacao.ts", () => ({
  tentarComRetry: mockTentarComRetry,
}));
vi.mock("../src/utils/dom-helpers.ts", () => ({
  elementoVisivel: mockElementoVisivel,
}));
vi.mock("../src/utils/selectors.ts", () => ({
  buscarElementoDeep: mockBuscarElementoDeep,
}));

const mod = await import("../src/workflow/handlers/atuar.ts");

describe("workflow/handlers/atuar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna false quando a ação está desativada", async () => {
    const ok = await mod.atuar(
      {},
      { textContent: "" },
      {
        getAcao: () => ({ ativo: false, seletor: 'input[name$="butAcao3"]' }),
        workflowState: { reset: vi.fn() },
      },
    );

    expect(ok).toBe(false);
    expect(mockBuscarElementoDeep).not.toHaveBeenCalled();
  });

  it("retorna false quando o botão não existe ou não está visível", async () => {
    mockBuscarElementoDeep.mockReturnValueOnce(null);

    let ok = await mod.atuar(
      {},
      { textContent: "" },
      {
        getAcao: () => ({ ativo: true, seletor: 'input[name$="butAcao3"]' }),
        workflowState: { reset: vi.fn() },
      },
    );

    expect(ok).toBe(false);

    const btn = document.createElement("input");
    btn.value = "Atuar";
    mockBuscarElementoDeep.mockReturnValueOnce(btn);
    mockElementoVisivel.mockReturnValueOnce(false);

    ok = await mod.atuar(
      {},
      { textContent: "" },
      {
        getAcao: () => ({ ativo: true, seletor: 'input[name$="butAcao3"]' }),
        workflowState: { reset: vi.fn() },
      },
    );

    expect(ok).toBe(false);
  });

  it("retorna false quando o botão encontrado não é de atuar", async () => {
    const btn = document.createElement("input");
    btn.value = "Prosseguir";
    mockBuscarElementoDeep.mockReturnValue(btn);

    const ok = await mod.atuar(
      {},
      { textContent: "" },
      {
        getAcao: () => ({ ativo: true, seletor: 'input[name$="butAcao3"]' }),
        workflowState: { reset: vi.fn() },
      },
    );

    expect(ok).toBe(false);
    expect(mockTentarComRetry).not.toHaveBeenCalled();
  });

  it("clica em atuar e reseta o workflow quando encontra o botão correto", async () => {
    const btn = document.createElement("input");
    btn.value = "Atuar no item";
    mockBuscarElementoDeep.mockReturnValue(btn);
    const workflowState = { reset: vi.fn() };
    const status = { textContent: "" };

    const ok = await mod.atuar(
      {},
      status,
      {
        getAcao: () => ({ ativo: true, seletor: 'input[name$="butAcao3"]' }),
        workflowState,
      },
    );

    expect(ok).toBe(true);
    expect(status.textContent).toBe("Atuar no Item...");
    expect(mockTentarComRetry).toHaveBeenCalledWith('input[name$="butAcao3"]', null, "atuar");
    expect(workflowState.reset).toHaveBeenCalled();
  });
});
