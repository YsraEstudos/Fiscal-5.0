import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetEstado = vi.fn();
const mockSetEstado = vi.fn();
const mockUpdateEstado = vi.fn();
const mockPersistirAcoes = vi.fn();
const mockLog = vi.fn();
const mockTocar = vi.fn();
const mockValidar = vi.fn();
const mockAplicarVisual = vi.fn();
const mockConfigurarPausaAcompanhamento = vi.fn();
const mockInicializarPausaAcompanhamento = vi.fn();

vi.mock("../src/config/constants.ts", () => ({
  CONFIG: {
    VALIDADORES: { "acao1": true }
  },
}));

vi.mock("../src/config/workflow-actions.ts", () => ({
  ACOES_WORKFLOW: [
    { id: "acao1", nome: "Ação Um", tipo: "input" },
    { id: "acao2", nome: "Ação Dois", tipo: "normal" }
  ]
}));

vi.mock("../src/core/estado-manager.ts", () => ({
  get: mockGetEstado,
  set: mockSetEstado,
  update: mockUpdateEstado,
  persistirAcoes: mockPersistirAcoes,
}));

vi.mock("../src/core/log-manager.ts", () => ({
  log: mockLog,
  preloadParaUI: vi.fn(() => []),
  atualizarUI: vi.fn(),
}));

vi.mock("../src/interaction/audio-manager.ts", () => ({
  tocar: mockTocar,
}));

vi.mock("../src/interaction/interacao.ts", () => ({
  tentarComRetry: vi.fn().mockResolvedValue(true),
}));

vi.mock("../src/data/item-map-manager.ts", () => ({
  atualizarStatusUI: vi.fn(),
  aplicarJson: vi.fn(),
  gerarJsonDoItemAtual: vi.fn(),
}));

vi.mock("../src/validation/validador.ts", () => ({
  validar: mockValidar,
  aplicarVisual: mockAplicarVisual,
}));

vi.mock("../src/ui/perfil-manager.ts", () => ({
  renderizarSeletor: vi.fn(),
}));

vi.mock("../src/ui/inspecao-manager.ts", () => ({
  ativar: vi.fn(),
}));


vi.mock("../src/ui/painel-builder.ts", () => ({
  construirListaAcoes: vi.fn(),
}));

vi.mock("../src/workflow/acompanhamento-pause-control.ts", () => ({
  configurar: mockConfigurarPausaAcompanhamento,
  inicializar: mockInicializarPausaAcompanhamento,
}));

vi.mock("../src/workflow/executor.ts", () => ({
  iniciar: vi.fn(),
  parar: vi.fn(),
  togglePausar: vi.fn(),
}));

vi.mock("../src/utils/misc.ts", async () => {
  const actual = await vi.importActual("../src/utils/misc.ts");
  return {
    ...actual,
    debounce: vi.fn((fn) => fn), // sincrono para teste
    clone: vi.fn((obj) => JSON.parse(JSON.stringify(obj))),
  };
});

const mod = await import("../src/ui/painel-events.ts");

describe("ui/painel-events", () => {
  let mockUpdateFn;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = `
      <div id="painelConteudo">
        <section class="km-collapsible" data-section="teste">
            <button data-section-toggle="teste">Toggle</button>
        </section>
      </div>
      <div id="lista-acoes">
        <div class="acao-item" data-acao="acao1">
            <button class="btn-testar" data-acao="acao1">Testar</button>
            <button class="btn-inspecao" data-acao="acao1">Inspecionar</button>
            <input type="checkbox" id="chk_acao1">
            <input type="text" id="val_acao1" value="texto">
        </div>
      </div>
      <input type="checkbox" id="chkSimulacao">
      <input type="checkbox" id="chkPausarAcompanhamento">
      <button id="drawerToggle"></button>
    `;

    mockGetEstado.mockReturnValue({
        acoes: { "acao1": { ativo: true, valor: "antigo" } },
        perfis: {},
    });

    mockUpdateEstado.mockImplementation((fn) => {
        mockUpdateFn = fn;
    });
  });

  it("wireEvents deve anexar toggle nas collapse sections", () => {
    mod.wireEvents(vi.fn());
    const collapseBtn = document.querySelector("[data-section-toggle='teste']");
    collapseBtn.click();
    
    expect(mockUpdateEstado).toHaveBeenCalled();
    const st = {};
    mockUpdateFn(st);
    expect(st.painelSecoes.teste).toBe(false); // Alternou
  });

  it("checkbox de simulação altera estado simulation", () => {
    mod.wireEvents(vi.fn());
    const chk = document.getElementById("chkSimulacao");
    chk.checked = true;
    
    // Dispara evento manual, ja que no jsdoc change é o listener
    chk.dispatchEvent(new Event("change"));
    
    expect(mockUpdateEstado).toHaveBeenCalled();
    const st = {};
    mockUpdateFn(st);
    expect(st.modoSimulacao).toBe(true);
  });

  it("checkbox de alerta no acompanhamento usa a pausa temporária", () => {
    mod.wireEvents(vi.fn());
    const chk = document.getElementById("chkPausarAcompanhamento");
    chk.checked = false;
    chk.dispatchEvent(new Event("change"));

    expect(mockConfigurarPausaAcompanhamento).toHaveBeenCalledWith(false);
  });
  it("checkbox de ação chk_acao1 salva valor no estado e persiste", () => {
    mod.wireEvents(vi.fn());
    const chk = document.getElementById("chk_acao1");
    chk.checked = false;
    
    chk.dispatchEvent(new Event("change", { bubbles: true })); // bubbles porque usa delegação
    
    expect(mockUpdateEstado).toHaveBeenCalled();
    const st = { acoes: { "acao1": { ativo: true } } };
    mockUpdateFn(st);
    expect(st.acoes["acao1"].ativo).toBe(false);
    expect(mockPersistirAcoes).toHaveBeenCalledWith(st);
  });

});
