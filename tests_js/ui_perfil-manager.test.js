import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

const mockGetEstado = vi.fn();
const mockSetEstado = vi.fn();
const mockLog = vi.fn();
const mockTocar = vi.fn();

vi.mock("../src/config/constants.ts", () => ({
  CONFIG: { SCHEMA_VERSION: 1 },
  REPORTING_DEFAULTS: { transport: "auto" }
}));

vi.mock("../src/config/workflow-actions.ts", () => ({
  ACOES_WORKFLOW: [
    { id: "acao1", nome: "Ação Um", tipo: "input", seletor: "#a", valorPadrao: "x", ordem: 1 }
  ]
}));

vi.mock("../src/core/estado-manager.ts", () => ({
  get: mockGetEstado,
  set: mockSetEstado,
  normalizarReportingConfig: (config) => config || {},
}));

vi.mock("../src/core/log-manager.ts", () => ({
  log: mockLog,
}));

vi.mock("../src/interaction/audio-manager.ts", () => ({
  tocar: mockTocar,
}));

vi.mock("../src/utils/misc.ts", async () => {
    const actual = await vi.importActual("../src/utils/misc.ts");
    return {
        ...actual,
        clone: vi.fn((obj) => JSON.parse(JSON.stringify(obj))),
    };
});

const mod = await import("../src/ui/perfil-manager.ts");

describe("ui/perfil-manager", () => {
  let originalPrompt;
  let originalConfirm;
  let originalLocation;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "<div id='perfil-container'></div>";

    mockGetEstado.mockReturnValue({
        acoes: { "acao1": { ativo: true } },
        perfis: {
            "default": { "acao1": { ativo: true } },
            "antigo": { "acao1": { ativo: false } }
        },
        perfilConfigs: {},
        perfilAtivo: "default",
        reporting: {}
    });

    originalPrompt = globalThis.prompt;
    originalConfirm = globalThis.confirm;
    originalLocation = globalThis.location;

    globalThis.prompt = vi.fn();
    globalThis.confirm = vi.fn();
    
    delete globalThis.location;
    globalThis.location = { reload: vi.fn() };
  });

  afterEach(() => {
    globalThis.prompt = originalPrompt;
    globalThis.confirm = originalConfirm;
    globalThis.location = originalLocation;
  });

  it("renderizarSeletor desenha o combobox com os perfis e adiciona botões", () => {
    mod.renderizarSeletor();
    const select = document.getElementById("seletorPerfil");
    expect(select).not.toBeNull();
    expect(select.children.length).toBe(2); // default e antigo
    expect(document.getElementById("btnCriarPerfil")).not.toBeNull();
  });

  it("criar adiciona um perfil novo ao estado", () => {
    mod.criar("novo_perfil");
    expect(mockSetEstado).toHaveBeenCalled();
    const st = mockSetEstado.mock.calls[0][0];
    expect(st.perfis["novo_perfil"]).toBeDefined();
    expect(st.perfilConfigs["novo_perfil"]).toBeDefined();
    expect(mockLog).toHaveBeenCalledWith('📁 Perfil "novo_perfil" criado', 'info');
  });

  it("carregar atualiza as acoes baseadas no perfil e dá reload", () => {
    mod.carregar("antigo");
    expect(mockSetEstado).toHaveBeenCalled();
    const st = mockSetEstado.mock.calls[0][0];
    expect(st.acoes["acao1"].ativo).toBe(false); // Era falso em 'antigo'
    expect(st.perfilAtivo).toBe("antigo");
    expect(globalThis.location.reload).toHaveBeenCalled();
  });

  it("excluir remove o perfil e volta pro default se era o ativo", () => {
    mockGetEstado.mockReturnValue({
        acoes: {},
        perfis: { "default": {}, "para_deletar": {} },
        perfilConfigs: { "para_deletar": {} },
        perfilAtivo: "para_deletar",
        reporting: {}
    });

    mod.excluir("para_deletar");

    expect(mockSetEstado).toHaveBeenCalled();
    const st = mockSetEstado.mock.calls[0][0];
    expect(st.perfis["para_deletar"]).toBeUndefined();
    expect(st.perfilAtivo).toBe("default");
  });
});
