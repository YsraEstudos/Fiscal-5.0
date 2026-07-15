import { describe, expect, it, vi, beforeEach } from "vitest";

const mockEnableTrustedTypes = vi.fn();
const mockInicializarHooks = vi.fn();
const mockRegistrarInteracao = vi.fn();
const mockSetRegistrarInteracao = vi.fn((cb) => cb("acao_teste"));
const mockInicializarUI = vi.fn();
const mockLimparTudo = vi.fn();
const mockAudioInicializar = vi.fn();

vi.mock("../src/security/trusted-types.ts", () => ({ enableTrustedTypesBypass: mockEnableTrustedTypes }));
vi.mock("../src/workflow/executor.ts", () => ({ inicializarHooks: mockInicializarHooks, registrarInteracao: mockRegistrarInteracao }));
vi.mock("../src/interaction/interacao.ts", () => ({ setRegistrarInteracao: mockSetRegistrarInteracao }));
vi.mock("../src/ui/ui-manager.ts", () => ({ inicializar: mockInicializarUI, limparTudo: mockLimparTudo }));
vi.mock("../src/interaction/audio-manager.ts", () => ({ inicializar: mockAudioInicializar }));

// Mocks para resolver os outros imports soltos do main
vi.mock("../src/config/constants.ts", () => ({ CONFIG: {} }));
vi.mock("../src/config/workflow-actions.ts", () => ({ ACOES_WORKFLOW: [] }));
vi.mock("../src/utils/misc.ts", () => ({}));
vi.mock("../src/utils/text.ts", () => ({}));
vi.mock("../src/core/cooldown-manager.ts", () => ({}));
vi.mock("../src/core/estado-manager.ts", () => ({}));
vi.mock("../src/core/log-manager.ts", () => ({ log: vi.fn() }));
vi.mock("../src/core/aspnet-lifecycle.ts", () => ({}));
vi.mock("../src/utils/dom-helpers.ts", () => ({}));
vi.mock("../src/utils/selectors.ts", () => ({ buscarElementoDeep: () => null }));
vi.mock("../src/validation/validador.ts", () => ({}));
vi.mock("../src/data/item-map-manager.ts", () => ({}));
vi.mock("../src/workflow/pagina-verificador.ts", () => ({}));
vi.mock("../src/workflow/handlers/flow-control.ts", () => ({}));
vi.mock("../src/workflow/handlers/atuar.ts", () => ({}));
vi.mock("../src/workflow/handlers/ncm.ts", () => ({}));
vi.mock("../src/workflow/handlers/unspsc.ts", () => ({}));

describe("src/main", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("deve invocar os inicializadores ao ser carregado", async () => {
    // Definir document.readyState = loading para testar o addEventListener
    Object.defineProperty(document, "readyState", { value: "loading", configurable: true });
    
    // Importa o módulo pela primeira vez
    await import("../src/main.ts");

    expect(mockEnableTrustedTypes).toHaveBeenCalled();
    expect(mockInicializarHooks).toHaveBeenCalled();
    expect(mockSetRegistrarInteracao).toHaveBeenCalled();
    
    // Como foi callback do setRegistrarInteracao, registrarInteracao deve ter sido chamado com "acao_teste"
    expect(mockRegistrarInteracao).toHaveBeenCalledWith("acao_teste");

    // Aciona os listeners do DOM
    document.dispatchEvent(new Event("DOMContentLoaded"));
    expect(mockInicializarUI).toHaveBeenCalled();

    document.dispatchEvent(new Event("click"));
    expect(mockAudioInicializar).toHaveBeenCalled();

    globalThis.dispatchEvent(new Event("beforeunload"));
    expect(mockLimparTudo).toHaveBeenCalled();
  });
});
