import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetEstado = vi.fn();
const mockSetEstado = vi.fn();
const mockLog = vi.fn();
const mockTocar = vi.fn();
const mockGerarSeletorUnico = vi.fn();

vi.mock("../src/core/estado-manager.ts", () => ({
  get: mockGetEstado,
  set: mockSetEstado,
}));

vi.mock("../src/core/log-manager.ts", () => ({
  log: mockLog,
}));

vi.mock("../src/interaction/audio-manager.ts", () => ({
  tocar: mockTocar,
}));

vi.mock("../src/utils/selectors.ts", () => ({
  gerarSeletorUnico: mockGerarSeletorUnico,
}));

vi.mock("../src/utils/misc.ts", async () => {
    const actual = await vi.importActual("../src/utils/misc.ts");
    return {
        ...actual,
        clone: vi.fn((obj) => JSON.parse(JSON.stringify(obj)))
    }
});

const mod = await import("../src/ui/inspecao-manager.ts");

describe("ui/inspecao-manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
    
    // Default estado
    mockGetEstado.mockReturnValue({
        acoes: { "acao1": { seletor: "" } },
        perfilAtivo: "default",
        perfis: { "default": {} }
    });
    mockGerarSeletorUnico.mockReturnValue("#meu-seletor");
  });

  it("cria o overlay ao ativar o modo inspeção e remove ao desativar", () => {
    mod.ativar("acao1");
    let overlay = document.getElementById("inspecao-overlay");
    expect(overlay).not.toBeNull();
    expect(overlay.innerHTML).toContain("Modo Inspeção");
    expect(overlay.innerHTML).toContain("acao1");

    mod.desativar();
    overlay = document.getElementById("inspecao-overlay");
    expect(overlay).toBeNull();
  });

  it("fecha o overlay quando a tecla Escape é pressionada", () => {
    mod.ativar("acao1");
    expect(document.getElementById("inspecao-overlay")).not.toBeNull();
    
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    
    expect(document.getElementById("inspecao-overlay")).toBeNull();
  });

  it("mapeia e salva o seletor ao clicar num elemento, depois fecha o overlay e toca som", () => {
    // Adiciona um alvo
    const alvo = document.createElement("button");
    alvo.id = "btn-alvo";
    document.body.appendChild(alvo);

    mod.ativar("acao1");

    // Simula clique no alvo (que gera o seletor mockado #meu-seletor)
    const mockClick = new MouseEvent("click", { bubbles: true, cancelable: true });
    alvo.dispatchEvent(mockClick);

    // Deve ter resolvido e salvo o estado
    expect(mockSetEstado).toHaveBeenCalled();
    const estadoSalvo = mockSetEstado.mock.calls[0][0];
    expect(estadoSalvo.acoes["acao1"].seletor).toBe("#meu-seletor");
    expect(estadoSalvo.perfis["default"]).toBeDefined();
    
    // Deve ter tocado som
    expect(mockTocar).toHaveBeenCalledWith("success");
    
    // Overlay deve ter sido fechado
    expect(document.getElementById("inspecao-overlay")).toBeNull();
  });
});
