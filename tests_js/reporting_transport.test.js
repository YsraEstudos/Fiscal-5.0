import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hasGmXhr, send } from "../src/reporting/transport.ts";

describe("reporting/transport", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete globalThis.GM_xmlhttpRequest;
    delete globalThis.GM;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hasGmXhr detecta GM_xmlhttpRequest e GM.xmlHttpRequest", () => {
    expect(hasGmXhr()).toBe(false);
    globalThis.GM_xmlhttpRequest = () => {};
    expect(hasGmXhr()).toBe(true);
    delete globalThis.GM_xmlhttpRequest;
    globalThis.GM = { xmlHttpRequest: () => {} };
    expect(hasGmXhr()).toBe(true);
  });

  it("send usa fetch com sucesso", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, itemId: "1" }),
    }));
    const out = await send(new FormData(), {
      url: "http://x/reports/item",
      transport: "fetch",
      attempts: 1,
      timeoutMs: 1000,
    });
    expect(out.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("send faz fallback para fetch quando gm_xhr indisponível", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true }),
    }));
    const out = await send(new FormData(), {
      url: "http://x/reports/item",
      transport: "auto",
      attempts: 1,
      timeoutMs: 1000,
    });
    expect(out.ok).toBe(true);
  });

  it("send usa GM_xmlhttpRequest quando disponível", async () => {
    globalThis.GM_xmlhttpRequest = (details) => {
      details.onload({
        status: 200,
        responseText: JSON.stringify({ ok: true, source: "gm" }),
      });
    };
    const out = await send(new FormData(), {
      url: "http://x/reports/item",
      transport: "gm_xhr",
      attempts: 1,
      timeoutMs: 1000,
    });
    expect(out.source).toBe("gm");
  });

  it("send aplica retry e lança último erro", async () => {
    const errResp = { ok: false, status: 500, text: async () => "erro" };
    globalThis.fetch = vi.fn(async () => errResp);
    await expect(
      send(new FormData(), {
        url: "http://x/reports/item",
        transport: "fetch",
        attempts: 2,
        baseDelayMs: 1,
        jitterMs: 0,
        timeoutMs: 1000,
      }),
    ).rejects.toThrow(/Falha 500|Resposta inválida/);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("send interpreta erro de payload JSON ok=false", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: false, errors: ["falha de regra"] }),
    }));
    await expect(
      send(new FormData(), {
        url: "http://x/reports/item",
        transport: "fetch",
        attempts: 1,
        timeoutMs: 1000,
      }),
    ).rejects.toThrow(/falha de regra/);
  });
});
