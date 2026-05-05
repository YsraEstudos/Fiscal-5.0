import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLog = vi.fn();
const mockEstadoUpdate = vi.fn((fn) => {
  const draft = { itemAtualTelaId: "320780", itemAtualKey: "320780", trilhaExecucao: { items: {} } };
  if (typeof fn === "function") fn(draft);
  return draft;
});
const mockGetReportingConfig = vi.fn(() => ({
  enabledReport: true,
  enabledMedia: true,
  enabledAcompanhamento: true,
}));
const mockGetItemReportingState = vi.fn(() => ({
  mediaDone: true,
  acompanhamentoDone: true,
  reportDone: false,
}));
const mockUpdateItemReportingState = vi.fn();
const mockEnviarRelatorioItem = vi.fn();
const mockRegistrarEventoItem = vi.fn();

vi.mock("../src/core/log-manager.ts", () => ({ log: mockLog }));
vi.mock("../src/core/estado-manager.ts", () => ({ update: mockEstadoUpdate }));
vi.mock("../src/reporting/session.ts", () => ({ getReportingConfig: mockGetReportingConfig }));
vi.mock("../src/reporting/metadata.ts", () => ({
  getItemReportingState: mockGetItemReportingState,
  updateItemReportingState: mockUpdateItemReportingState,
}));
vi.mock("../src/reporting/envio-relatorio.ts", () => ({ enviarRelatorioItem: mockEnviarRelatorioItem }));
vi.mock("../src/workflow/item-trace.ts", () => ({ registrarEventoItem: mockRegistrarEventoItem }));

const mod = await import("../src/workflow/handlers/report.ts");

describe("workflow/handlers/report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetItemReportingState.mockReturnValue({
      mediaDone: true,
      acompanhamentoDone: true,
      reportDone: false,
    });
    mockGetReportingConfig.mockReturnValue({
      enabledReport: true,
      enabledMedia: true,
      enabledAcompanhamento: true,
    });
  });

  it("retorna false quando a ação está desativada ou não existe item", async () => {
    let ok = await mod.gerarRelatorioItem(
      { itemAtualKey: "320780", itemAtualTelaId: "320780" },
      { textContent: "" },
      { getAcao: () => ({ ativo: false }) },
    );
    expect(ok).toBe(false);

    ok = await mod.gerarRelatorioItem(
      { itemAtualKey: null, itemAtualTelaId: null },
      { textContent: "" },
      { getAcao: () => ({ ativo: true }) },
    );
    expect(ok).toBe(false);
  });

  it("retorna false quando o relatório do item já foi concluído", async () => {
    mockGetItemReportingState.mockReturnValue({
      mediaDone: true,
      acompanhamentoDone: true,
      reportDone: true,
    });

    const ok = await mod.gerarRelatorioItem(
      { itemAtualKey: "320780", itemAtualTelaId: "320780" },
      { textContent: "" },
      { getAcao: () => ({ ativo: true }) },
    );

    expect(ok).toBe(false);
    expect(mockEnviarRelatorioItem).not.toHaveBeenCalled();
  });

  it("pula geração quando relatório PDF/MD está desativado por padrão", async () => {
    mockGetReportingConfig.mockReturnValue({
      enabledReport: false,
      enabledMedia: false,
      enabledAcompanhamento: false,
    });

    const ok = await mod.gerarRelatorioItem(
      { itemAtualKey: "320780", itemAtualTelaId: "320780" },
      { textContent: "" },
      { getAcao: () => ({ ativo: true }) },
    );

    expect(ok).toBe(true);
    expect(mockEnviarRelatorioItem).not.toHaveBeenCalled();
    expect(mockUpdateItemReportingState).toHaveBeenCalledWith(
      "320780",
      expect.objectContaining({
        reportDone: true,
        reportResponse: expect.objectContaining({
          ok: true,
          skippedDisabled: true,
        }),
      }),
    );
  });

  it("pula envio quando há erro de coleta anterior", async () => {
    mockGetItemReportingState.mockReturnValue({
      mediaDone: true,
      acompanhamentoDone: true,
      reportDone: false,
      mediaErrorCode: "MEDIA_PARSE_ERROR",
      mediaError: "falha mídia",
    });

    const ok = await mod.gerarRelatorioItem(
      { itemAtualKey: "320780", itemAtualTelaId: "320780" },
      { textContent: "" },
      { getAcao: () => ({ ativo: true }) },
    );

    expect(ok).toBe(true);
    expect(mockUpdateItemReportingState).toHaveBeenCalledWith(
      "320780",
      expect.objectContaining({
        reportDone: true,
        reportResponse: expect.objectContaining({
          ok: false,
          skippedByCollectionError: true,
          warnings: ["falha mídia"],
        }),
      }),
    );
    expect(mockRegistrarEventoItem).not.toHaveBeenCalled();
  });

  it("aguarda mídia e acompanhamento quando exigidos pelo perfil", async () => {
    mockGetItemReportingState.mockReturnValue({
      mediaDone: false,
      acompanhamentoDone: false,
      reportDone: false,
    });

    let ok = await mod.gerarRelatorioItem(
      { itemAtualKey: "320780", itemAtualTelaId: "320780" },
      { textContent: "" },
      { getAcao: () => ({ ativo: true }) },
    );
    expect(ok).toBe(false);

    mockGetReportingConfig.mockReturnValue({
      enabledReport: true,
      enabledMedia: false,
      enabledAcompanhamento: true,
    });
    mockGetItemReportingState.mockReturnValue({
      mediaDone: false,
      acompanhamentoDone: false,
      reportDone: false,
    });

    ok = await mod.gerarRelatorioItem(
      { itemAtualKey: "320780", itemAtualTelaId: "320780" },
      { textContent: "" },
      { getAcao: () => ({ ativo: true }) },
    );
    expect(ok).toBe(false);
  });

  it("registra evento quando o relatório é enviado com sucesso", async () => {
    mockEnviarRelatorioItem.mockResolvedValue({
      itemId: "320780",
      pdfPath: "session/item.pdf",
      mdPath: "session/item.md",
      warnings: [],
    });

    const status = { textContent: "" };
    const ok = await mod.gerarRelatorioItem(
      { itemAtualKey: "320780", itemAtualTelaId: "320780" },
      status,
      { getAcao: () => ({ ativo: true }) },
    );

    expect(ok).toBe(true);
    expect(status.textContent).toBe("Gerando relatório (PDF+MD)...");
    expect(mockRegistrarEventoItem).toHaveBeenCalledWith(
      expect.any(Object),
      "320780",
      "relatorio_enviado",
      expect.objectContaining({
        payload: expect.objectContaining({
          itemId: "320780",
          pdfPath: "session/item.pdf",
          mdPath: "session/item.md",
          warningsCount: 0,
        }),
      }),
    );
  });

  it("não registra evento quando o envio falha", async () => {
    const erro = new Error("offline");
    erro.code = "SERVICE_UNAVAILABLE";
    mockEnviarRelatorioItem.mockRejectedValue(erro);

    const ok = await mod.gerarRelatorioItem(
      { itemAtualKey: "320780", itemAtualTelaId: "320780" },
      { textContent: "" },
      { getAcao: () => ({ ativo: true }) },
    );

    expect(ok).toBe(true);
    expect(mockUpdateItemReportingState).toHaveBeenCalledWith(
      "320780",
      expect.objectContaining({
        reportDone: true,
        reportError: "offline",
        reportErrorCode: "SERVICE_UNAVAILABLE",
      }),
    );
    expect(mockRegistrarEventoItem).not.toHaveBeenCalled();
  });
});
