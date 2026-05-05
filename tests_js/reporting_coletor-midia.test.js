import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAbsolutizarUrl = vi.fn((url) => `https://klassmatt.local/${url}`);
const mockGetReportingConfig = vi.fn();
const mockGetCacheItem = vi.fn();
const mockUpdateItemReportingState = vi.fn();
const mockFetchHtml = vi.fn();
const mockFetchPostHtml = vi.fn();
const mockFetchBlob = vi.fn();
const mockEncontrarAbaMidia = vi.fn();
const mockExtrairQtdMidiaDoTexto = vi.fn();
const mockMontarUrlsMidiaCandidatas = vi.fn();
const mockExtrairUrlOpenGenerica = vi.fn();
const mockDetectarErroHtmlMidia = vi.fn();
const mockExtrairItensMidiaDoDocumento = vi.fn();
const mockExtrairCategoriasMidia = vi.fn();
const mockExtrairViewState = vi.fn();

vi.mock("../src/utils/misc.ts", async () => {
  const actual = await vi.importActual("../src/utils/misc.ts");
  return {
    ...actual,
    hashTexto: vi.fn((t) => `hash_${t.length}`),
    slugifyArquivo: vi.fn((t) => t.replace(/[^a-z0-9]/gi, "_").toLowerCase()),
    sleep: vi.fn(),
    clone: vi.fn((obj) => JSON.parse(JSON.stringify(obj))),
    absolutizarUrl: mockAbsolutizarUrl,
    debounce: vi.fn((fn) => fn),
  };
});
vi.mock("../src/reporting/session.ts", () => ({
  getReportingConfig: mockGetReportingConfig,
}));
vi.mock("../src/reporting/metadata.ts", () => ({
  getCacheItem: mockGetCacheItem,
  updateItemReportingState: mockUpdateItemReportingState,
  fetchHtml: mockFetchHtml,
  fetchPostHtml: mockFetchPostHtml,
  fetchBlob: mockFetchBlob,
}));
vi.mock("../src/reporting/parsers/midia-parser.ts", () => ({
  encontrarAbaMidia: mockEncontrarAbaMidia,
  montarUrlsMidiaCandidatas: mockMontarUrlsMidiaCandidatas,
  extrairQtdMidiaDoTexto: mockExtrairQtdMidiaDoTexto,
  extrairCategoriasMidia: mockExtrairCategoriasMidia,
  extrairViewState: mockExtrairViewState,
  extrairItensMidiaDoDocumento: mockExtrairItensMidiaDoDocumento,
  detectarErroHtmlMidia: mockDetectarErroHtmlMidia,
  extrairUrlOpenGenerica: mockExtrairUrlOpenGenerica,
}));

const mod = await import("../src/reporting/coletor-midia.ts");

describe("reporting/coletor-midia", () => {
  let cache;

  beforeEach(() => {
    vi.clearAllMocks();
    cache = { media: null, files: [] };
    history.replaceState({}, "", "/SIN_Item.aspx?k=session123&IdSIN=55");

    mockGetCacheItem.mockReturnValue(cache);
    mockGetReportingConfig.mockReturnValue({
      enabledMedia: true,
      maxFilesPerItem: 20,
      maxFileSizeMb: 25,
    });
    mockExtrairQtdMidiaDoTexto.mockReturnValue(2);
    mockMontarUrlsMidiaCandidatas.mockImplementation((url) => [url]);
    mockDetectarErroHtmlMidia.mockReturnValue(null);
    mockExtrairCategoriasMidia.mockReturnValue([]);
    mockExtrairViewState.mockReturnValue({
      __VIEWSTATE: "vs",
      __VIEWSTATEGENERATOR: "gen",
      __EVENTVALIDATION: "ev",
    });
    mockFetchBlob.mockResolvedValue(new Blob(["mock content"], { type: "text/plain" }));
  });

  it("pula a coleta quando a feature está desativada", async () => {
    mockGetReportingConfig.mockReturnValue({
      enabledMedia: false,
      maxFilesPerItem: 20,
      maxFileSizeMb: 25,
    });

    const result = await mod.coletarMidia({}, "320780");

    expect(result.skipped).toBe(true);
    expect(result.summary.status).toBe("SKIPPED_DISABLED");
    expect(mockUpdateItemReportingState).toHaveBeenCalledWith(
      "320780",
      expect.objectContaining({
        mediaDone: true,
        mediaSkipped: true,
      }),
    );
  });

  it("retorna ABA_MIDIA_NAO_ENCONTRADA quando a aba não existe", async () => {
    mockEncontrarAbaMidia.mockReturnValue(null);

    const result = await mod.coletarMidia({}, "320780");

    expect(result.skipped).toBe(true);
    expect(result.summary.status).toBe("ABA_MIDIA_NAO_ENCONTRADA");
  });

  it("retorna SEM_MIDIA_UI_ZERO quando a aba indica zero mídias", async () => {
    mockEncontrarAbaMidia.mockReturnValue({
      textContent: "Mídias (0)",
      getAttribute: vi.fn(() => "javascript:void(0)"),
    });
    mockExtrairQtdMidiaDoTexto.mockReturnValue(0);

    const result = await mod.coletarMidia({}, "320780");

    expect(result.summary.status).toBe("SEM_MIDIA_UI_ZERO");
    expect(cache.media.status).toBe("SEM_MIDIA_UI_ZERO");
  });

  it("monta URL fallback em contexto SIN quando o href não expõe Midia.aspx", async () => {
    mockEncontrarAbaMidia.mockReturnValue({
      textContent: "Mídias (2)",
      getAttribute: vi.fn(() => "javascript:void(0)"),
    });
    mockExtrairUrlOpenGenerica.mockReturnValue(null);
    mockFetchHtml.mockResolvedValue("<html><body>sem itens</body></html>");
    mockExtrairItensMidiaDoDocumento.mockReturnValue([]);

    const result = await mod.coletarMidia({}, "320780");

    expect(mockAbsolutizarUrl).toHaveBeenCalledWith("Midia.aspx?tipo=SIN&id=55&Alterar=0&Session=SIN");
    expect(result.summary.status).toBe("SEM_MIDIA_PARSE");
    expect(result.summary.sourceUrl).toContain("Midia.aspx?tipo=SIN&id=55&Alterar=0&Session=SIN");
  });

  it("varre categorias por postback e agrega itens sem duplicar URLs", async () => {
    mockEncontrarAbaMidia.mockReturnValue({
      textContent: "Mídias (2)",
      getAttribute: vi.fn(() => "javascript:OpenNewTab('/Midia.aspx?id=320780')"),
    });
    mockExtrairUrlOpenGenerica.mockReturnValue("https://klassmatt.local/Midia.aspx?id=320780");
    mockFetchHtml.mockResolvedValue("<html><body>base</body></html>");
    mockFetchPostHtml.mockResolvedValue("<html><body>categoria</body></html>");
    mockExtrairCategoriasMidia.mockReturnValue([
      { label: "PDF", type: "postback", target: "ctl00$Body$dlMidias", argument: "1" },
    ]);
    mockExtrairItensMidiaDoDocumento
      .mockReturnValueOnce([
        { url: "https://klassmatt.local/a.jpg", tipo: "imagem", filename: "a.jpg" },
      ])
      .mockReturnValueOnce([
        { url: "https://klassmatt.local/a.jpg", tipo: "imagem", filename: "a.jpg" },
        { url: "https://klassmatt.local/b.pdf", tipo: "pdf", filename: "b.pdf" },
      ]);
    mockFetchBlob
      .mockResolvedValueOnce(new Blob(["img"], { type: "image/jpeg" }))
      .mockResolvedValueOnce(new Blob(["pdf"], { type: "application/pdf" }));

    const result = await mod.coletarMidia({}, "320780");

    expect(result.ok).toBe(true);
    expect(result.summary.status).toBe("OK");
    expect(result.summary.total).toBe(2);
    expect(result.files).toHaveLength(2);
    expect(result.summary.itens.map((item) => item.url)).toEqual([
      "https://klassmatt.local/a.jpg",
      "https://klassmatt.local/b.pdf",
    ]);
  });

  it("converte falha de fetch em summary de erro de busca", async () => {
    mockEncontrarAbaMidia.mockReturnValue({
      textContent: "Mídias (2)",
      getAttribute: vi.fn(() => "javascript:OpenNewTab('/Midia.aspx?id=320780')"),
    });
    mockExtrairUrlOpenGenerica.mockReturnValue("https://klassmatt.local/Midia.aspx?id=320780");
    mockFetchHtml.mockRejectedValue(new Error("offline"));

    const result = await mod.coletarMidia({}, "320780");

    expect(result.summary.status).toBe("SEM_MIDIA_FETCH_ERROR");
    expect(result.summary.diagnostic).toContain("offline");
  });

  it("ignora arquivos acima do limite ao montar a lista de upload", async () => {
    mockGetReportingConfig.mockReturnValue({
      enabledMedia: true,
      maxFilesPerItem: 5,
      maxFileSizeMb: 1,
    });
    mockEncontrarAbaMidia.mockReturnValue({
      textContent: "Mídias (1)",
      getAttribute: vi.fn(() => "javascript:OpenNewTab('/Midia.aspx?id=320780')"),
    });
    mockExtrairUrlOpenGenerica.mockReturnValue("https://klassmatt.local/Midia.aspx?id=320780");
    mockFetchHtml.mockResolvedValue("<html><body>base</body></html>");
    mockExtrairItensMidiaDoDocumento.mockReturnValue([
      { url: "https://klassmatt.local/huge.pdf", tipo: "pdf", filename: "huge.pdf" },
    ]);
    mockFetchBlob.mockResolvedValue(new Blob([new Uint8Array(2 * 1024 * 1024)], { type: "application/pdf" }));

    const result = await mod.coletarMidia({}, "320780");

    expect(result.summary.status).toBe("OK");
    expect(result.files).toHaveLength(0);
    expect(result.summary.itens[0].downloadError).toContain("UPLOAD_LIMIT_EXCEEDED");
  });
});
