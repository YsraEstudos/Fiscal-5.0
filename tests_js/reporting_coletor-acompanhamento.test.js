import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAbsolutizarUrl = vi.fn((url) => `https://klassmatt.local/${url}`);
const mockBuscarElementoDeep = vi.fn();
const mockNormalizarTextoSemAcento = vi.fn((t) => t.toLowerCase());

const mockGetReportingConfig = vi.fn();
const mockGetCacheItem = vi.fn();
const mockUpdateItemReportingState = vi.fn();
const mockFetchHtml = vi.fn();

const mockExtrairUrlOpenGenerica = vi.fn();
const mockParseHistorico = vi.fn();

vi.mock("../src/utils/misc.ts", async () => {
  const actual = await vi.importActual("../src/utils/misc.ts");
  return {
    ...actual,
    absolutizarUrl: mockAbsolutizarUrl,
  };
});

vi.mock("../src/utils/text.ts", async () => {
  const actual = await vi.importActual("../src/utils/text.ts");
  return {
    ...actual,
    normalizarTextoSemAcento: mockNormalizarTextoSemAcento,
  };
});

vi.mock("../src/utils/selectors.ts", async () => {
  const actual = await vi.importActual("../src/utils/selectors.ts");
  return {
    ...actual,
    buscarElementoDeep: mockBuscarElementoDeep,
  };
});

vi.mock("../src/reporting/session.ts", () => ({
  getReportingConfig: mockGetReportingConfig,
}));
vi.mock("../src/reporting/session.ts", () => ({
  getReportingConfig: mockGetReportingConfig,
}));

vi.mock("../src/reporting/metadata.ts", () => ({
  getCacheItem: mockGetCacheItem,
  updateItemReportingState: mockUpdateItemReportingState,
  fetchHtml: mockFetchHtml,
}));
vi.mock("../src/reporting/metadata.ts", () => ({
  getCacheItem: mockGetCacheItem,
  updateItemReportingState: mockUpdateItemReportingState,
  fetchHtml: mockFetchHtml,
}));

vi.mock("../src/reporting/parsers/midia-parser.ts", () => ({
  extrairUrlOpenGenerica: mockExtrairUrlOpenGenerica,
}));
vi.mock("../src/reporting/parsers/midia-parser.ts", () => ({
  extrairUrlOpenGenerica: mockExtrairUrlOpenGenerica,
}));

vi.mock("../src/reporting/parsers/historico-parser.ts", () => ({
  parseHistorico: mockParseHistorico,
}));
vi.mock("../src/reporting/parsers/historico-parser.ts", () => ({
  parseHistorico: mockParseHistorico,
}));

describe("reporting/coletor-acompanhamento", () => {
  let mod;
  let cache;

  beforeEach(async () => {
    vi.clearAllMocks();
    cache = { acompanhamento: null };
    history.replaceState({}, "", "/SIN_Item.aspx?IdItem=123");

    mockGetCacheItem.mockReturnValue(cache);
    mockGetReportingConfig.mockReturnValue({
      enabledAcompanhamento: true,
    });
    
    mockBuscarElementoDeep.mockReturnValue(null);
    mockExtrairUrlOpenGenerica.mockReturnValue(null);
    mockParseHistorico.mockReturnValue({
      summary: { totalEventos: 2 },
      timeline: [{ status: "1" }, { status: "2" }],
    });
    mockFetchHtml.mockResolvedValue("<html><body>test</body></html>");

    mod = await import("../src/reporting/coletor-acompanhamento.ts?update=" + Date.now());
  });

  it("pula a coleta quando a feature está desativada", async () => {
    mockGetReportingConfig.mockReturnValue({
      enabledAcompanhamento: false,
    });

    const result = await mod.coletarAcompanhamento({}, "1234");
    
    expect(result.skipped).toBe(true);
    expect(result.summary.status).toBe("SKIPPED_DISABLED");
    expect(mockUpdateItemReportingState).toHaveBeenCalledWith(
      "1234",
      expect.objectContaining({ acompanhamentoDone: true, acompanhamentoSkipped: true })
    );
  });

  it("retorna SKIPPED_LINK_NOT_FOUND se não conseguir montar URL", async () => {
    history.replaceState({}, "", "/SIN_Item.aspx"); // sem id
    const result = await mod.coletarAcompanhamento({}, ""); // sem key

    expect(result.skipped).toBe(true);
    expect(result.summary.status).toBe("SKIPPED_LINK_NOT_FOUND");
  });

  it("monta url via Id na url se não tiver elemento na página", async () => {
    const result = await mod.coletarAcompanhamento({}, "1234");
    
    expect(mockAbsolutizarUrl).toHaveBeenCalledWith("Historico.aspx?source=SIN&SomenteLeitura=1&Id=1234");
    expect(result.summary.totalEventos).toBe(2);
    expect(result.timeline).toHaveLength(2);
  });

  it("usa link direto e extrairUrlOpenGenerica se existir", async () => {
    const mockElement = { getAttribute: vi.fn(() => "javascript:OpenNewTab('Hist.aspx')") };
    mockBuscarElementoDeep.mockReturnValue(mockElement);
    mockExtrairUrlOpenGenerica.mockReturnValue("https://klassmatt.local/Hist.aspx");

    const result = await mod.coletarAcompanhamento({}, "1234");
    
    expect(mockFetchHtml).toHaveBeenCalledWith("https://klassmatt.local/Hist.aspx");
    expect(result.ok).toBe(true);
  });

  it("retorna SKIPPED_PARSING_FAILED se fetch falhar", async () => {
    mockFetchHtml.mockRejectedValue(new Error("offline"));

    const result = await mod.coletarAcompanhamento({}, "1234");

    expect(result.skipped).toBe(true);
    expect(result.summary.status).toBe("SKIPPED_PARSING_FAILED");
    expect(result.summary.diagnostic).toContain("offline");
  });

  it("retorna SKIPPED_PARSING_FAILED se parse falhar", async () => {
    mockParseHistorico.mockImplementation(() => { throw new Error("parse error"); });

    const result = await mod.coletarAcompanhamento({}, "1234");

    expect(result.skipped).toBe(true);
    expect(result.summary.status).toBe("SKIPPED_PARSING_FAILED");
    expect(result.summary.diagnostic).toContain("parse error");
  });

  it("retorna SKIPPED_EMPTY_TIMELINE se timeline for vazia", async () => {
    mockParseHistorico.mockReturnValue({
      summary: { totalEventos: 0 },
      timeline: [],
    });

    const result = await mod.coletarAcompanhamento({}, "1234");

    expect(result.skipped).toBe(true);
    expect(result.summary.status).toBe("SKIPPED_EMPTY_TIMELINE");
  });
});
