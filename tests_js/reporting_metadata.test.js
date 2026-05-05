import { beforeEach, describe, expect, it, vi } from "vitest";

const mockBuscarElementoDeep = vi.fn();
const mockObterItemIdAtual = vi.fn();
const mockSleep = vi.fn(async () => {});

let estadoInterno;
const mockUpdate = vi.fn((fn) => {
  fn(estadoInterno);
});

vi.mock("../src/core/estado-manager.ts", () => ({
  update: mockUpdate,
}));
vi.mock("../src/utils/selectors.ts", () => ({
  buscarElementoDeep: mockBuscarElementoDeep,
}));
vi.mock("../src/data/item-map-manager.ts", () => ({
  obterItemIdAtual: mockObterItemIdAtual,
}));
vi.mock("../src/utils/misc.ts", () => ({
  sleep: mockSleep,
}));

const mod = await import("../src/reporting/metadata.ts");

function textResponse(body, contentType = "text/plain; charset=utf-8") {
  return {
    ok: true,
    status: 200,
    headers: { get: () => contentType },
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
    blob: async () => new Blob([body], { type: "text/plain" }),
  };
}

describe("reporting/metadata", () => {
  beforeEach(() => {
    estadoInterno = { itemFlags: {} };
    vi.clearAllMocks();
    mockBuscarElementoDeep.mockReset();
    mockObterItemIdAtual.mockReset();
  });

  it("getCacheItem cria cache por item e reutiliza instância", () => {
    const a = mod.getCacheItem("x1");
    const b = mod.getCacheItem("x1");
    expect(a).toBe(b);
    expect(mod.getCacheItem("   ")).toBe(null);
  });

  it("getItemReportingState e updateItemReportingState funcionam com merge", () => {
    const vazio = mod.getItemReportingState({ itemFlags: {} }, "A");
    expect(vazio).toEqual({});

    mod.updateItemReportingState("A", { mediaDone: true });
    mod.updateItemReportingState("A", { reportDone: true });
    expect(estadoInterno.itemFlags.A.reporting).toEqual({
      mediaDone: true,
      reportDone: true,
    });
  });

  it("obterCampoValor retorna primeiro valor não vazio", () => {
    mockBuscarElementoDeep.mockImplementation((sel) => {
      if (sel === "#a") return { value: "" };
      if (sel === "#b") return { textContent: " valor " };
      return null;
    });
    expect(mod.obterCampoValor(["#a", "#b"])).toBe("valor");
  });

  it("obterMetadadosBasicos usa campos e fallback por item/url", () => {
    mockObterItemIdAtual.mockReturnValue("IT-1");
    mockBuscarElementoDeep.mockImplementation((sel) => {
      const map = {
        "#txtNumero": { value: "SIN-9" },
        "#txtStatus": { value: "EM ANALISE" },
        "#txtSolicitante": { value: "JOAO" },
        "#txtEmpresa": { value: "EMPRESA X" },
      };
      return map[sel] || null;
    });
    const out = mod.obterMetadadosBasicos({ perfilAtivo: "default" }, "item-key");
    expect(out.itemId).toBe("IT-1");
    expect(out.sinId).toBe("SIN-9");
    expect(out.statusAtual).toBe("EM ANALISE");
    expect(out.perfil).toBe("default");
  });

  it("criarErroRelatorio e classificarErroServico mapeiam códigos", () => {
    const err = mod.criarErroRelatorio("X", "falha");
    expect(err.message).toMatch(/^X:/);
    expect(mod.classificarErroServico("401 unauthorized")).toBe("SERVICE_AUTH_MISSING");
    expect(mod.classificarErroServico("413 file_size")).toBe("UPLOAD_LIMIT_EXCEEDED");
    expect(mod.classificarErroServico("timeout")).toBe("SERVICE_UNAVAILABLE");
  });

  it("decodificarTextoHttp decodifica usando charset do header", () => {
    const bytes = new TextEncoder().encode("Solicitação Fiscal");
    const txt = mod.decodificarTextoHttp(bytes.buffer, "text/html; charset=utf-8");
    expect(txt).toContain("Solicitação");
  });

  it("fetchWithRetry retorna texto e blob", async () => {
    globalThis.fetch = vi.fn(async () => textResponse("ok", "text/plain; charset=utf-8"));
    const txt = await mod.fetchWithRetry("http://x", { responseType: "text", attempts: 1 });
    expect(txt).toBe("ok");

    globalThis.fetch = vi.fn(async () => textResponse("bin", "application/octet-stream"));
    const blob = await mod.fetchWithRetry("http://x", { responseType: "blob", attempts: 1 });
    expect(blob).toBeInstanceOf(Blob);
  });

  it("fetchWithRetry aplica retry e termina com erro final", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, headers: { get: () => "" } })
      .mockResolvedValueOnce({ ok: false, status: 502, headers: { get: () => "" } });
    await expect(
      mod.fetchWithRetry("http://x", { attempts: 2, timeoutMs: 50 }),
    ).rejects.toThrow(/Falha HTTP/);
    expect(mockSleep).toHaveBeenCalledTimes(1);
  });

  it("fetchHtml/fetchBlob delegam para fetchWithRetry", async () => {
    globalThis.fetch = vi.fn(async () => textResponse("conteudo"));
    expect(await mod.fetchHtml("http://x")).toBe("conteudo");

    globalThis.fetch = vi.fn(async () => textResponse("blob"));
    const b = await mod.fetchBlob("http://x");
    expect(b).toBeInstanceOf(Blob);
  });
});
