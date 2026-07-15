import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  aplicarDicasFiscais,
  exportarDicasFiscaisJson,
  importarDicasFiscaisJson,
  normalizarTermoFiscal,
} from "../src/ui/fiscal-hints.ts";

describe("ui/fiscal-hints", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("normaliza termos ignorando acentos, caixa e espaços duplicados", () => {
    expect(normalizarTermoFiscal("  Aplicação:  Caminhão  ")).toBe("aplicacao: caminhao");
  });

  it("importa e exporta JSON aceitando alias nspsc para unspsc", () => {
    const resultado = importarDicasFiscaisJson(`[
      { "termo": "APLICACAO: CAMINHAO", "ncm": "8708.93.00", "nspsc": "25101929" }
    ]`);

    expect(resultado.ok).toBe(true);
    expect(resultado.dicas).toEqual({
      "aplicacao-caminhao": {
        termo: "APLICACAO: CAMINHAO",
        ncm: "8708.93.00",
        unspsc: "25101929",
      },
    });
    expect(exportarDicasFiscaisJson(resultado.dicas)).toContain('"unspsc": "25101929"');
  });

  it("rejeita NCM ou UNSPSC inválidos ao importar JSON", () => {
    const resultado = importarDicasFiscaisJson(`[
      { "termo": "CAMINHAO", "ncm": "87089300", "unspsc": "ABC" }
    ]`);

    expect(resultado.ok).toBe(false);
    expect(resultado.erros.join(" | ")).toContain("NCM");
    expect(resultado.erros.join(" | ")).toContain("UNSPSC");
  });

  it("destaca frase normalizada na descrição e copia códigos pelo pop-up", async () => {
    document.body.innerHTML = `
      <div id="divDescricaoCompleta">
        <span id="txtD0" class="descricao">
          NOME ITEM: EMBREAGEM VISCOSA; APLICACAO: CAMINHAO AXOR 2036
        </span>
      </div>
    `;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    aplicarDicasFiscais({
      ativo: true,
      dicas: {
        "aplicacao-caminhao": {
          termo: "aplicação: caminhão",
          ncm: "8708.93.00",
          unspsc: "25101929",
        },
      },
    });

    const destaque = document.querySelector(".km-fiscal-hint-mark");
    expect(destaque).not.toBeNull();
    expect(destaque.textContent).toBe("APLICACAO: CAMINHAO");

    destaque.click();
    const copiarNcm = document.querySelector('[data-km-copy-fiscal="ncm"]');
    const copiarUnspsc = document.querySelector('[data-km-copy-fiscal="unspsc"]');
    expect(copiarNcm).not.toBeNull();
    expect(copiarUnspsc).not.toBeNull();

    copiarNcm.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith("8708.93.00");

    copiarUnspsc.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith("25101929");
  });

  it("funciona em elementos de id txtDescricao e aceita dicas globais e por empresa", () => {
    document.body.innerHTML = `
      <div class="kl-msg">
        <span id="txtDescricao">NOME ITEM: LANTERNA LATERAL; APLICACAO: CAMINHAO;</span>
      </div>
    `;

    // 1. Dica global (sem empresa)
    aplicarDicasFiscais({
      ativo: true,
      dicas: {
        "aplicacao-caminhao": {
          termo: "aplicação: caminhão",
          ncm: "8708.93.00",
        },
      },
    }, "RODONAVES");

    let destaque = document.querySelector(".km-fiscal-hint-mark");
    expect(destaque).not.toBeNull();
    expect(destaque.textContent).toBe("APLICACAO: CAMINHAO");

    // Reset
    document.body.innerHTML = `
      <div class="kl-msg">
        <span id="txtDescricao">NOME ITEM: LANTERNA LATERAL; APLICACAO: CAMINHAO;</span>
      </div>
    `;

    // 2. Dica para empresa diferente (não deve grifar)
    aplicarDicasFiscais({
      ativo: true,
      dicas: {
        "aplicacao-caminhao": {
          termo: "aplicação: caminhão",
          ncm: "8708.93.00",
          empresa: "PETROBRAS",
        },
      },
    }, "RODONAVES");

    destaque = document.querySelector(".km-fiscal-hint-mark");
    expect(destaque).toBeNull();

    // 3. Dica para a mesma empresa (deve grifar)
    aplicarDicasFiscais({
      ativo: true,
      dicas: {
        "aplicacao-caminhao": {
          termo: "aplicação: caminhão",
          ncm: "8708.93.00",
          empresa: "RODONAVES",
        },
      },
    }, "RODONAVES");

    destaque = document.querySelector(".km-fiscal-hint-mark");
    expect(destaque).not.toBeNull();
  });

  it("destaca o termo somente quando ele está separado da palavra vizinha", () => {
    const dica = {
      aco: {
        termo: "aco",
        ncm: "7308.90.10",
      },
    };

    document.body.innerHTML = `
      <div id="divDescricaoCompleta">
        <span class="descricao">trACO ACO traco</span>
      </div>
    `;

    aplicarDicasFiscais({ ativo: true, dicas: dica });

    let destaque = document.querySelector(".km-fiscal-hint-mark");
    expect(destaque).not.toBeNull();
    expect(destaque.textContent).toBe("ACO");
    expect(document.querySelector(".descricao").textContent).toBe("trACO ACO traco");

    document.body.innerHTML = `
      <div id="divDescricaoCompleta">
        <span class="descricao">trACO traco</span>
      </div>
    `;

    aplicarDicasFiscais({ ativo: true, dicas: dica });

    destaque = document.querySelector(".km-fiscal-hint-mark");
    expect(destaque).toBeNull();
  });
});
