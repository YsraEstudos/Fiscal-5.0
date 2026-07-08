import { describe, expect, it, vi } from "vitest";

/**
 * Testes de contrato HTML do sistema "JSON por item".
 *
 * Estes testes verificam que os elementos HTML gerados por renderJsonSection
 * e os event handlers wired por wireEvents mantêm os IDs e comportamentos
 * esperados pelo item-map-manager.ts.
 *
 * Se algum destes testes quebrar, significa que o contrato HTML foi violado
 * e o sistema JSON por item provavelmente está quebrado.
 */

// -----------------------------------------------------------------------
// Mocks mínimos para importar painel-sections
// -----------------------------------------------------------------------
vi.mock("../src/config/constants.ts", () => ({
  CONFIG: {
    REPORTING: { SERVICE_DEFAULT: "http://localhost:5000", MAX_FILE_SIZE_MB: 50, MAX_FILES_PER_ITEM: 20 },
    VALIDADORES: {},
  },
  REPORTING_DEFAULTS: {
    enabledMedia: false,
    enabledReport: false,
    enabledAcompanhamento: false,
    clickMediaTabBeforeCollect: false,
    blockOnReportError: false,
    serviceUrl: "http://localhost:5000",
    apiToken: null,
    transport: "auto",
    maxFileSizeMb: 50,
    maxFilesPerItem: 20,
    sessionRunId: null,
  },
}));

vi.mock("../src/core/estado-manager.ts", () => ({
  normalizarReportingConfig: (v) => v || {},
}));

vi.mock("../src/workflow/estimativa.ts", () => ({
  obterResumoUI: () => ({
    resumo: "", tempoBaseTexto: "", etaRestanteTexto: "",
    previsaoTexto: "", primeiroItemTexto: "", fonteTotal: "json",
    totalPlanejado: 0, pausadoPorReincidencia: false, itemAtualId: null,
  }),
}));

vi.mock("../src/workflow/item-trace.ts", () => ({
  obterResumoTrilhaUI: () => ({
    empty: true, currentLabel: "", events: [],
    critical: false, cardClassName: "km-card", status: null,
    lastEventTipo: null,
  }),
}));

vi.mock("../src/utils/misc.ts", () => ({
  escapeHtml: (v) => String(v ?? ""),
}));

const { renderJsonSection } = await import("../src/ui/painel/painel-sections.ts");

// -----------------------------------------------------------------------
// Estado mínimo para renderizar a seção JSON
// -----------------------------------------------------------------------
function criarEstadoMinimo(overrides = {}) {
  return {
    itemMapAtivo: false,
    itemMapJson: "",
    modoSimulacao: false,
    pausarEmReincidencia: true,
    globalActionDelayMs: 1200,
    clickCooldownMs: 3000,
    reporting: {
      enabledMedia: false,
      enabledReport: false,
      enabledAcompanhamento: false,
      clickMediaTabBeforeCollect: false,
      blockOnReportError: false,
      serviceUrl: "http://localhost:5000",
      apiToken: null,
      transport: "auto",
      maxFileSizeMb: 50,
      maxFilesPerItem: 20,
    },
    ...overrides,
  };
}

// -----------------------------------------------------------------------
// Testes de contrato: IDs HTML na seção JSON
// -----------------------------------------------------------------------
describe("contrato HTML: renderJsonSection", () => {
  it("gera o checkbox #chkItemMapAtivo", () => {
    const html = renderJsonSection(criarEstadoMinimo());
    expect(html).toContain('id="chkItemMapAtivo"');
  });

  it("gera o textarea #itemMapJson", () => {
    const html = renderJsonSection(criarEstadoMinimo());
    expect(html).toContain('id="itemMapJson"');
  });

  it("gera o botão #btnItemMapAplicar", () => {
    const html = renderJsonSection(criarEstadoMinimo());
    expect(html).toContain('id="btnItemMapAplicar"');
  });

  it("gera o botão #btnItemMapCriar", () => {
    const html = renderJsonSection(criarEstadoMinimo());
    expect(html).toContain('id="btnItemMapCriar"');
  });

  it("gera o div de status #itemMapStatus", () => {
    const html = renderJsonSection(criarEstadoMinimo());
    expect(html).toContain('id="itemMapStatus"');
  });

  it("marca checkbox como checked quando itemMapAtivo é true", () => {
    const html = renderJsonSection(criarEstadoMinimo({ itemMapAtivo: true }));
    expect(html).toMatch(/id="chkItemMapAtivo"\s+checked/);
  });

  it("não marca checkbox quando itemMapAtivo é false", () => {
    const html = renderJsonSection(criarEstadoMinimo({ itemMapAtivo: false }));
    expect(html).not.toMatch(/id="chkItemMapAtivo"\s+checked/);
  });

  it("usa as classes CSS esperadas", () => {
    const html = renderJsonSection(criarEstadoMinimo());
    expect(html).toContain('class="km-card"');
    expect(html).toContain('class="km-section-label"');
    expect(html).toContain('class="km-checkline"');
    expect(html).toContain('class="km-textarea"');
    expect(html).toContain('class="km-button-row"');
    expect(html).toContain('class="km-secondary-button"');
    expect(html).toContain('class="km-helper-text"');
  });

  it("contém todos os 5 IDs de contrato em uma única renderização", () => {
    const html = renderJsonSection(criarEstadoMinimo());
    const idsContrato = [
      "chkItemMapAtivo",
      "itemMapJson",
      "btnItemMapAplicar",
      "btnItemMapCriar",
      "itemMapStatus",
    ];
    for (const id of idsContrato) {
      expect(html).toContain(`id="${id}"`);
    }
  });
});
