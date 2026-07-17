import { describe, expect, it } from "vitest";
import { escapeHtml } from "../src/utils/misc.ts";

describe("utils/misc escapeHtml", () => {
  it("escapa todos os delimitadores HTML", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("não permite injeção de atributo", () => {
    const host = document.createElement("div");
    host.innerHTML = '<input value="' + escapeHtml('" onfocus="alert(1)') + '">';

    expect(host.querySelector("[onfocus]")).toBeNull();
    expect(host.querySelector("input")?.value).toBe('" onfocus="alert(1)');
  });
});
