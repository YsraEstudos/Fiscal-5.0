import { beforeEach, describe, expect, it, vi } from "vitest";

import { abrirGerenciadorDicasFiscais } from "../src/ui/fiscal-hints-manager.ts";

describe("ui/fiscal-hints-manager", () => {
  let dicas;
  let persist;
  let setStatus;

  beforeEach(() => {
    document.body.innerHTML = "";
    dicas = {
      "aplicacao-caminhao": {
        termo: "aplicação: caminhão",
        ncm: "8708.93.00",
        empresa: "RODONAVES",
      },
      "aco": {
        termo: "aco",
        unspsc: "25101929",
      },
    };
    persist = vi.fn((novasDicas) => {
      dicas = novasDicas;
    });
    setStatus = vi.fn();
  });

  it("abre a janela e lista dicas com o vínculo da empresa", () => {
    abrirGerenciadorDicasFiscais({
      getDicas: () => dicas,
      persist,
      setStatus,
    });

    const modal = document.getElementById("km-fiscal-hints-manager");
    expect(modal).not.toBeNull();
    expect(modal.hidden).toBe(false);
    expect(modal.textContent).toContain("aplicação: caminhão");
    expect(modal.textContent).toContain("Somente RODONAVES");
    expect(modal.textContent).toContain("Todas as empresas");
  });

  it("edita uma dica e atribui a empresa escolhida", () => {
    abrirGerenciadorDicasFiscais({
      getDicas: () => dicas,
      persist,
      setStatus,
    }, "aco");

    const modal = document.getElementById("km-fiscal-hints-manager");
    const empresa = modal.querySelector("#kmFiscalHintsManagerEmpresa");
    const termo = modal.querySelector("#kmFiscalHintsManagerTermo");
    empresa.value = "PETROBRAS";
    termo.value = "ACO INDUSTRIAL";
    modal.querySelector("#kmFiscalHintsManagerForm").dispatchEvent(new Event("submit", {
      bubbles: true,
      cancelable: true,
    }));

    expect(persist).toHaveBeenCalledTimes(1);
    expect(dicas.aco).toEqual({
      termo: "ACO INDUSTRIAL",
      unspsc: "25101929",
      empresa: "PETROBRAS",
    });
    expect(setStatus).toHaveBeenCalledWith("Dica atualizada.");
    expect(modal.textContent).toContain("ACO INDUSTRIAL");
  });
});