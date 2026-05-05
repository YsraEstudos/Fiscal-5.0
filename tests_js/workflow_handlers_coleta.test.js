import { beforeEach, describe, expect, it, vi } from "vitest";

const mockLog = vi.fn();
const mockEstadoUpdate = vi.fn((fn) => {
  const draft = { itemAtualTelaId: "320780", itemAtualKey: "320780", trilhaExecucao: { items: {} } };
  if (typeof fn === "function") fn(draft);
  return draft;
});
const mockIsAtivo = vi.fn(() => false);
const mockSet = vi.fn();
const mockInteragir = vi.fn(async () => true);
const mockElementoVisivel = vi.fn(() => true);
const mockBuscarElementoDeep = vi.fn(() => null);
const mockGetReportingConfig = vi.fn(() => ({
  enabledMedia: true,
  clickMediaTabBeforeCollect: false,
  enabledAcompanhamento: true,
}));
const mockGetItemReportingState = vi.fn(() => ({}));
const mockUpdateItemReportingState = vi.fn();
const mockColetarMidia = vi.fn();
const mockColetarAcompanhamento = vi.fn();
const mockRegistrarEventoItem = vi.fn();

vi.mock("../src/core/log-manager.ts", () => ({ log: mockLog }));
vi.mock("../src/core/estado-manager.ts", () => ({ update: mockEstadoUpdate }));
vi.mock("../src/core/cooldown-manager.ts", () => ({
  isAtivo: mockIsAtivo,
  set: mockSet,
}));
vi.mock("../src/interaction/interacao.ts", () => ({ interagir: mockInteragir }));
vi.mock("../src/utils/dom-helpers.ts", () => ({ elementoVisivel: mockElementoVisivel }));
vi.mock("../src/utils/selectors.ts", () => ({ buscarElementoDeep: mockBuscarElementoDeep }));
vi.mock("../src/utils/text.ts", () => ({ normalizarTextoSemAcento: (valor) => String(valor || "").toLowerCase() }));
vi.mock("../src/reporting/session.ts", () => ({ getReportingConfig: mockGetReportingConfig }));
vi.mock("../src/reporting/metadata.ts", () => ({
  getItemReportingState: mockGetItemReportingState,
  updateItemReportingState: mockUpdateItemReportingState,
}));
vi.mock("../src/reporting/coletor-midia.ts", () => ({ coletarMidia: mockColetarMidia }));
vi.mock("../src/reporting/coletor-acompanhamento.ts", () => ({ coletarAcompanhamento: mockColetarAcompanhamento }));
vi.mock("../src/workflow/item-trace.ts", () => ({ registrarEventoItem: mockRegistrarEventoItem }));

const mod = await import("../src/workflow/handlers/coleta.ts");

describe("workflow/handlers/coleta", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
    mockGetItemReportingState.mockReturnValue({});
    mockGetReportingConfig.mockReturnValue({
      enabledMedia: true,
      clickMediaTabBeforeCollect: false,
      enabledAcompanhamento: true,
    });
  });

  it("retorna false quando a ação está desativada ou não existe item atual", async () => {
    let ok = await mod.coletarMidia(
      { itemAtualKey: "320780", itemAtualTelaId: "320780" },
      { textContent: "" },
      { getAcao: () => ({ ativo: false, seletor: "text=Mídias" }) },
    );
    expect(ok).toBe(false);

    ok = await mod.coletarMidia(
      { itemAtualKey: null, itemAtualTelaId: null },
      { textContent: "" },
      { getAcao: () => ({ ativo: true, seletor: "text=Mídias" }) },
    );
    expect(ok).toBe(false);
  });

  it("ignora coleta de mídia já concluída e grava cooldown de log", async () => {
    mockGetItemReportingState.mockReturnValue({ mediaDone: true });

    const ok = await mod.coletarMidia(
      { itemAtualKey: "320780", itemAtualTelaId: "320780" },
      { textContent: "" },
      { getAcao: () => ({ ativo: true, seletor: "text=Mídias" }) },
    );

    expect(ok).toBe(false);
    expect(mockLog).toHaveBeenCalledWith("COLETA_MIDIA | Item 320780 | SKIPPED_ALREADY_DONE", "info");
    expect(mockSet).toHaveBeenCalledWith("log:midia_done:320780", 10000);
  });

  it("não reloga mídia já concluída enquanto o cooldown estiver ativo", async () => {
    mockGetItemReportingState.mockReturnValue({ mediaDone: true });
    mockIsAtivo.mockReturnValue(true);

    const ok = await mod.coletarMidia(
      { itemAtualKey: "320780", itemAtualTelaId: "320780" },
      { textContent: "" },
      { getAcao: () => ({ ativo: true, seletor: "text=Mídias" }) },
    );

    expect(ok).toBe(false);
    expect(mockLog).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("marca mídia como pulada quando o reporting de mídia está desativado", async () => {
    mockGetReportingConfig.mockReturnValue({
      enabledMedia: false,
      clickMediaTabBeforeCollect: false,
      enabledAcompanhamento: true,
    });

    const ok = await mod.coletarMidia(
      { itemAtualKey: "320780", itemAtualTelaId: "320780" },
      { textContent: "" },
      { getAcao: () => ({ ativo: true, seletor: "text=Mídias" }) },
    );

    expect(ok).toBe(true);
    expect(mockUpdateItemReportingState).toHaveBeenCalledWith(
      "320780",
      expect.objectContaining({
        mediaDone: true,
        mediaSummary: expect.objectContaining({ status: "SKIPPED_DISABLED" }),
      }),
    );
    expect(mockRegistrarEventoItem).toHaveBeenCalledWith(
      expect.any(Object),
      "320780",
      "midia_coletada",
      expect.objectContaining({
        payload: expect.objectContaining({ status: "SKIPPED_DISABLED" }),
      }),
    );
  });

  it("clica na aba de mídia antes da coleta quando configurado", async () => {
    mockGetReportingConfig.mockReturnValue({
      enabledMedia: true,
      clickMediaTabBeforeCollect: true,
      enabledAcompanhamento: true,
    });
    const aba = document.createElement("a");
    mockBuscarElementoDeep.mockReturnValue(aba);
    mockColetarMidia.mockResolvedValue({
      summary: { status: "OK", total: 1, imagens: 1, pdfs: 0, unsupported: 0 },
    });

    const status = { textContent: "" };
    const ok = await mod.coletarMidia(
      { itemAtualKey: "320780", itemAtualTelaId: "320780" },
      status,
      { getAcao: () => ({ ativo: true, seletor: "text=Mídias" }) },
    );

    expect(ok).toBe(true);
    expect(mockInteragir).toHaveBeenCalledWith(aba, null, "coletarMidiaAba");
    expect(status.textContent).toBe("Coletando mídias...");
  });

  it("loga warning quando não consegue clicar na aba de mídia", async () => {
    mockGetReportingConfig.mockReturnValue({
      enabledMedia: true,
      clickMediaTabBeforeCollect: true,
      enabledAcompanhamento: true,
    });
    mockBuscarElementoDeep.mockReturnValue(null);
    mockColetarMidia.mockResolvedValue({
      summary: { status: "OK", total: 0, imagens: 0, pdfs: 0, unsupported: 0 },
    });

    const ok = await mod.coletarMidia(
      { itemAtualKey: "320780", itemAtualTelaId: "320780" },
      { textContent: "" },
      { getAcao: () => ({ ativo: true, seletor: "text=Mídias" }) },
    );

    expect(ok).toBe(true);
    expect(mockLog).toHaveBeenCalledWith(
      "COLETA_MIDIA | Item 320780 | ABA_MIDIA_NAO_ENCONTRADA_PARA_CLIQUE | seguindo com coleta por leitura",
      "warn",
    );
  });

  it("registra evento de mídia com o summary retornado", async () => {
    mockColetarMidia.mockResolvedValue({
      summary: { status: "OK", total: 3, imagens: 2, pdfs: 1, unsupported: 0 },
    });

    const ok = await mod.coletarMidia(
      { itemAtualKey: "320780", itemAtualTelaId: "320780" },
      { textContent: "" },
      { getAcao: () => ({ ativo: true, seletor: "text=Mídias" }) },
    );

    expect(ok).toBe(true);
    expect(mockRegistrarEventoItem).toHaveBeenCalledWith(
      expect.any(Object),
      "320780",
      "midia_coletada",
      expect.objectContaining({
        payload: expect.objectContaining({ status: "OK", total: 3 }),
      }),
    );
  });

  it("converte erro de coleta de mídia em summary opcional", async () => {
    const erro = new Error("falha parse");
    erro.code = "MEDIA_PARSE_ERROR";
    mockColetarMidia.mockRejectedValue(erro);

    const ok = await mod.coletarMidia(
      { itemAtualKey: "320780", itemAtualTelaId: "320780" },
      { textContent: "" },
      { getAcao: () => ({ ativo: true, seletor: "text=Mídias" }) },
    );

    expect(ok).toBe(true);
    expect(mockUpdateItemReportingState).toHaveBeenCalledWith(
      "320780",
      expect.objectContaining({
        mediaDone: true,
        mediaError: "falha parse",
        mediaErrorCode: "MEDIA_PARSE_ERROR",
      }),
    );
    expect(mockRegistrarEventoItem).toHaveBeenCalledWith(
      expect.any(Object),
      "320780",
      "midia_coletada",
      expect.objectContaining({
        payload: expect.objectContaining({ status: "ERRO" }),
      }),
    );
  });

  it("ignora acompanhamento já concluído e aplica cooldown de log", async () => {
    mockGetItemReportingState.mockReturnValue({ acompanhamentoDone: true });

    const ok = await mod.coletarAcompanhamento(
      { itemAtualKey: "320780", itemAtualTelaId: "320780" },
      { textContent: "" },
      { getAcao: () => ({ ativo: true, seletor: "#hlkObs" }) },
    );

    expect(ok).toBe(false);
    expect(mockLog).toHaveBeenCalledWith("COLETA_HISTORICO | Item 320780 | SKIPPED_ALREADY_DONE", "info");
    expect(mockSet).toHaveBeenCalledWith("log:hist_done:320780", 10000);
  });

  it("marca acompanhamento como pulado quando desativado", async () => {
    mockGetReportingConfig.mockReturnValue({
      enabledMedia: true,
      clickMediaTabBeforeCollect: false,
      enabledAcompanhamento: false,
    });

    const ok = await mod.coletarAcompanhamento(
      { itemAtualKey: "320780", itemAtualTelaId: "320780" },
      { textContent: "" },
      { getAcao: () => ({ ativo: true, seletor: "#hlkObs" }) },
    );

    expect(ok).toBe(true);
    expect(mockUpdateItemReportingState).toHaveBeenCalledWith(
      "320780",
      expect.objectContaining({
        acompanhamentoDone: true,
        acompanhamentoSummary: expect.objectContaining({ status: "SKIPPED_DISABLED" }),
      }),
    );
  });

  it("registra evento de acompanhamento com o summary retornado", async () => {
    mockColetarAcompanhamento.mockResolvedValue({
      summary: { status: "OK", totalEventos: 12, criticalFiscalRework: false },
    });

    const ok = await mod.coletarAcompanhamento(
      { itemAtualKey: "320780", itemAtualTelaId: "320780" },
      { textContent: "" },
      { getAcao: () => ({ ativo: true, seletor: "#hlkObs" }) },
    );

    expect(ok).toBe(true);
    expect(mockRegistrarEventoItem).toHaveBeenCalledWith(
      expect.any(Object),
      "320780",
      "acompanhamento_coletado",
      expect.objectContaining({
        payload: expect.objectContaining({ status: "OK", totalEventos: 12 }),
      }),
    );
  });

  it("loga acompanhamento crítico quando há reincidência fiscal", async () => {
    mockColetarAcompanhamento.mockResolvedValue({
      summary: { status: "OK", totalEventos: 12, criticalFiscalRework: true, fiscalTransitionsCount: 4 },
    });

    const ok = await mod.coletarAcompanhamento(
      { itemAtualKey: "320780", itemAtualTelaId: "320780" },
      { textContent: "" },
      { getAcao: () => ({ ativo: true, seletor: "#hlkObs" }) },
    );

    expect(ok).toBe(true);
    expect(mockLog).toHaveBeenCalledWith(
      "COLETA_HISTORICO | Item 320780 | CRITICO | fiscalTransitions=4",
      "warn",
    );
  });

  it("converte erro de acompanhamento em summary opcional", async () => {
    const erro = new Error("historico offline");
    erro.code = "HISTORICO_PARSE_ERROR";
    mockColetarAcompanhamento.mockRejectedValue(erro);

    const ok = await mod.coletarAcompanhamento(
      { itemAtualKey: "320780", itemAtualTelaId: "320780" },
      { textContent: "" },
      { getAcao: () => ({ ativo: true, seletor: "#hlkObs" }) },
    );

    expect(ok).toBe(true);
    expect(mockUpdateItemReportingState).toHaveBeenCalledWith(
      "320780",
      expect.objectContaining({
        acompanhamentoDone: true,
        acompanhamentoError: "historico offline",
        acompanhamentoErrorCode: "HISTORICO_PARSE_ERROR",
      }),
    );
  });
});
