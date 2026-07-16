import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

const mockGetEstado = vi.fn();
const mockUpdateEstado = vi.fn();
const mockLog = vi.fn();

vi.mock("../src/core/estado-manager.ts", () => ({
  get: mockGetEstado,
  update: mockUpdateEstado,
}));

vi.mock("../src/core/log-manager.ts", () => ({
  log: mockLog,
}));

vi.mock("../src/interaction/audio-manager.ts", () => ({
  fechar: vi.fn(),
}));

vi.mock("../src/workflow/executor.ts", () => ({
  setUICallbacks: vi.fn(),
  ativarKillSwitch: vi.fn(),
  togglePausar: vi.fn(),
  executarCiclo: vi.fn(),
  limpar: vi.fn(),
}));

vi.mock("../src/workflow/estimativa.ts", () => ({
  obterResumoUI: vi.fn(() => ({
    pausadoPorReincidencia: false,
    resumo: "Resumo teste",
    tempoBaseTexto: "Tempo req: 1s",
    etaRestanteTexto: "00:01",
    previsaoTexto: "12:00",
    primeiroItemTexto: "Item 1",
    totalPlanejado: 10,
    itemAtualId: "ID_X"
  })),
}));

vi.mock("../src/workflow/item-trace.ts", () => ({
  obterResumoTrilhaUI: vi.fn(() => ({
    critical: false,
    empty: false,
    currentLabel: "Current Event",
    events: [{ tipo: "info", horario: "12:00", resumo: "Teste" }]
  })),
}));

vi.mock("../src/utils/misc.ts", async () => {
    const actual = await vi.importActual("../src/utils/misc.ts");
    return {
        ...actual,
    };
});

let mockPainelEl = null;

vi.mock("../src/ui/painel-builder.ts", () => ({
  injetarEstilos: vi.fn(),
  construirPainel: vi.fn(() => document.createElement("div")),
  getPainelEl: () => mockPainelEl,
}));

vi.mock("../src/ui/painel-events.ts", () => ({
  wireEvents: vi.fn(),
}));

const mod = await import("../src/ui/ui-manager.ts");

describe("ui/ui-manager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = `
      <div class="km-drawer-status-compact"></div>
      <div class="km-summary-card"></div>
      <div id="etaResumo"></div>
      <div id="etaTempoBase"></div>
      <div id="etaRestante"></div>
      <div id="etaPrevisao"></div>
      <div data-role="eta-primeiro-item"></div>

      <div id="itemTraceCard"></div>
      <div id="itemTraceCurrent"></div>
      <ul id="itemTraceList"></ul>
      <div id="itemTraceEmpty"></div>

      <div id="progressBar"></div>
      <div id="progressFill"></div>
      <div id="progressText"></div>

      <button id="btnToggle"></button>
      <div id="statusRobo"></div>
      <button id="drawerToggle">«</button>
      <div id="painelHeader"></div>
      <div id="painelConteudo"></div>
    `;

    mockPainelEl = document.createElement("div");
    mockPainelEl.classList.add("km-drawer");
    
    // Polyfill pra requestAnimationFrame no node
    globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 0);

    mockGetEstado.mockReturnValue({
        ativo: true,
        pausado: false,
        progresso: { total: 10, atual: 5 },
        painelScrollTop: 0
    });
  });

  it("atualizarIndicadorProgresso manipula DOM e chama resumo", () => {
    mod.atualizarIndicadorProgresso();

    const progressBar = document.getElementById("progressBar");
    const progressFill = document.getElementById("progressFill");
    const progressText = document.getElementById("progressText");

    expect(progressBar.style.display).toBe("block");
    expect(progressFill.style.width).toBe("50%"); // 5 / 10 * 100
    expect(progressText.textContent).toContain("Concluídos 5 de 10");
  });

  it("prioriza o progresso do estado em vez do totalPlanejado do resumo", () => {
    mockGetEstado.mockReturnValue({
      ativo: true,
      pausado: false,
      progresso: { total: 5, atual: 2 },
      painelScrollTop: 0
    });

    mod.atualizarIndicadorProgresso();

    const progressFill = document.getElementById("progressFill");
    const progressText = document.getElementById("progressText");
    expect(progressFill.style.width).toBe("40%");
    expect(progressText.textContent).toContain("Concluídos 2 de 5");
    expect(progressText.textContent).not.toContain("de 10");
  });

  it("exibe o total do JSON ativo mesmo antes do primeiro ciclo no detalhe", () => {
    mockGetEstado.mockReturnValue({
      ativo: true,
      pausado: false,
      progresso: { total: 0, atual: 0 },
      itemMapAtivo: true,
      itemMap: {
        A: { ncm: "8471.30.12" },
        B: { ncm: "8471.30.12" },
        C: { ncm: "8471.30.12" },
      },
      painelScrollTop: 0,
    });

    mod.atualizarIndicadorProgresso();

    expect(document.getElementById("progressText").textContent).toContain("Concluídos 0 de 3");
  });

  it("atualizarBotaoToggle atualiza estilos pendendo estado", () => {
    // Estado Ativo não pausado
    mod.atualizarBotaoToggle();
    const btn = document.getElementById("btnToggle");
    expect(btn.textContent).toBe("Parar robô");

    // Pausado
    mockGetEstado.mockReturnValue({
        ativo: true,
        pausado: true,
        progresso: {}
    });
    mod.atualizarBotaoToggle();
    expect(btn.textContent).toBe("Retomar");
  });

  it("toggleMinimizar alterna classe no painel principal", () => {
    mod.toggleMinimizar();

    // Primeira vez estava sem, então adicionou
    expect(mockPainelEl.classList.contains("is-collapsed")).toBe(true);
    const btn = document.getElementById("drawerToggle");
    expect(btn.textContent).toBe("»");
    
    expect(mockUpdateEstado).toHaveBeenCalled();
  });
});
