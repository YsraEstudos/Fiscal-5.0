import { describe, expect, it, vi } from "vitest";
import {
  absolutizarUrl,
  clone,
  cssEscape,
  debounce,
  escapeHtml,
  extrairUrlDaFuncaoJs,
  gerarRunId,
  hashTexto,
  isTestMode,
  sleep,
  slugifyArquivo,
  valoresSaoIguais,
} from "../src/utils/misc.ts";

describe("utils/misc", () => {
  it("cssEscape usa CSS.escape quando disponível", () => {
    const old = window.CSS?.escape;
    window.CSS = window.CSS || {};
    window.CSS.escape = vi.fn(() => "escaped");
    expect(cssEscape("x")).toBe("escaped");
    if (old) window.CSS.escape = old;
  });

  it("cssEscape faz fallback quando CSS.escape não existe", () => {
    const oldCss = window.CSS;
    (window as any).CSS = {} as typeof CSS;
    expect(cssEscape("a b#c")).toBe("a\\ b\\#c");
    (window as any).CSS = oldCss;
  });

  it("clone usa fallback JSON quando structuredClone falha", () => {
    const old = globalThis.structuredClone;
    globalThis.structuredClone = () => {
      throw new Error("x");
    };
    const original = { a: 1, b: { c: 2 } };
    const copied = clone(original);
    expect(copied).toEqual(original);
    expect(copied).not.toBe(original);
    globalThis.structuredClone = old;
  });

  it("escapeHtml escapa conteúdo perigoso", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toContain("&lt;script&gt;");
  });

  it("sleep resolve promise", async () => {
    const start = Date.now();
    await sleep(5);
    expect(Date.now() - start).toBeGreaterThanOrEqual(0);
  });

  it("isTestMode respeita __KM_TEST_MODE__", () => {
    (globalThis as any).__KM_TEST_MODE__ = false;
    expect(isTestMode()).toBe(false);
    (globalThis as any).__KM_TEST_MODE__ = true;
    expect(isTestMode()).toBe(true);
  });

  it("debounce executa apenas última chamada", async () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const fn = debounce(spy, 50);
    fn("a");
    fn("b");
    vi.advanceTimersByTime(49);
    expect(spy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("b");
    vi.useRealTimers();
  });

  it("gerarRunId gera prefixo esperado", () => {
    const id = gerarRunId("sessao");
    expect(id.startsWith("sessao_")).toBe(true);
  });

  it("absolutizarUrl converte relativo e retorna null para inválido", () => {
    expect(absolutizarUrl("/abc")).toContain("/abc");
    expect(absolutizarUrl("http://%")).toBe(null);
  });

  it("extrairUrlDaFuncaoJs encontra URL em chamada JS", () => {
    const href = "javascript:OpenNewTab('/Midia.aspx?id=10')";
    const out = extrairUrlDaFuncaoJs(href, ["OpenNewTab"]);
    expect(out).toContain("Midia.aspx?id=10");
  });

  it("slugifyArquivo remove acento e normaliza separadores", () => {
    expect(slugifyArquivo("ação fiscal.pdf")).toBe("acao_fiscal.pdf");
    expect(slugifyArquivo("   ")).toBe("arquivo");
  });

  it("hashTexto é determinístico", () => {
    expect(hashTexto("abc")).toBe(hashTexto("abc"));
    expect(hashTexto("abc")).not.toBe(hashTexto("abd"));
  });

  it("valoresSaoIguais normaliza espaços", () => {
    expect(valoresSaoIguais(" 123 ", "123")).toBe(true);
    expect(valoresSaoIguais(null, undefined)).toBe(true);
    expect(valoresSaoIguais("a", "b")).toBe(false);
  });
});
