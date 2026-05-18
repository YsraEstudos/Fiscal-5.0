import { describe, expect, it } from "vitest";

import {
  avaliarCamposObrigatoriosJsonEmpresa,
  obterEmpresaAtual,
} from "../src/validation/empresa-json-requirements.ts";

describe("validation/empresa-json-requirements", () => {
  it("detecta empresa atual a partir do lblUsuario", () => {
    document.body.innerHTML = `
      <span id="lblUsuario">&nbsp;&nbsp;ISRAEL DE SENA XAVIER MACHADO//VAXXINOVA&nbsp;&nbsp;</span>
    `;

    expect(obterEmpresaAtual()).toBe("VAXXINOVA");
  });

  it("RODONAVES bloqueia NCM sem CEST", () => {
    const resultado = avaliarCamposObrigatoriosJsonEmpresa({
      empresa: "RODONAVES",
      itemId: "1001",
      entry: { ncm: "8708.29.99", nbs: null, cest: null, unspsc: null, lei116: null },
      liberados: [],
    });

    expect(resultado.valido).toBe(false);
    expect(resultado.camposFaltantes).toEqual(["cest"]);
    expect(resultado.mensagem).toContain("RODONAVES exige CEST");
  });

  it("RODONAVES passa quando NCM tem CEST", () => {
    const resultado = avaliarCamposObrigatoriosJsonEmpresa({
      empresa: "RODONAVES",
      itemId: "1001",
      entry: { ncm: "8708.29.99", nbs: null, cest: "01.075.00", unspsc: null, lei116: null },
      liberados: [],
    });

    expect(resultado.valido).toBe(true);
  });

  it("bloqueia serviço com NBS sem Lei 116 quando empresa exige Lei 116", () => {
    const resultado = avaliarCamposObrigatoriosJsonEmpresa({
      empresa: "VAXXINOVA",
      itemId: "S1",
      entry: { ncm: null, nbs: "1.0105.40.00", cest: null, unspsc: "30103618", lei116: null },
      liberados: [],
    });

    expect(resultado.valido).toBe(false);
    expect(resultado.camposFaltantes).toEqual(["lei116"]);
  });

  it("não bloqueia NBS ausente quando o item não trouxe NBS", () => {
    const resultado = avaliarCamposObrigatoriosJsonEmpresa({
      empresa: "VAXXINOVA",
      itemId: "P1",
      entry: { ncm: "8471.30.12", nbs: null, cest: null, unspsc: "30103618", lei116: null },
      liberados: [],
    });

    expect(resultado.valido).toBe(true);
  });

  it("VAXXINOVA exige UNSPSC quando ausente", () => {
    const resultado = avaliarCamposObrigatoriosJsonEmpresa({
      empresa: "VAXXINOVA",
      itemId: "P1",
      entry: { ncm: "8471.30.12", nbs: null, cest: null, unspsc: null, lei116: null },
      liberados: [],
    });

    expect(resultado.valido).toBe(false);
    expect(resultado.camposFaltantes).toEqual(["unspsc"]);
  });

  it("INTERCEMENT não exige UNSPSC", () => {
    const resultado = avaliarCamposObrigatoriosJsonEmpresa({
      empresa: "INTERCEMENT",
      itemId: "P1",
      entry: { ncm: "8471.30.12", nbs: null, cest: null, unspsc: null, lei116: null },
      liberados: [],
    });

    expect(resultado.valido).toBe(true);
  });

  it("MOSAIC exige somente UNSPSC", () => {
    const semUnspsc = avaliarCamposObrigatoriosJsonEmpresa({
      empresa: "MOSAIC",
      itemId: "M1",
      entry: { ncm: null, nbs: null, cest: null, unspsc: null, lei116: null },
      liberados: [],
    });
    const comUnspsc = avaliarCamposObrigatoriosJsonEmpresa({
      empresa: "MOSAIC",
      itemId: "M1",
      entry: { ncm: null, nbs: null, cest: null, unspsc: "30103618", lei116: null },
      liberados: [],
    });

    expect(semUnspsc.valido).toBe(false);
    expect(semUnspsc.camposFaltantes).toEqual(["unspsc"]);
    expect(comUnspsc.valido).toBe(true);
  });

  it("considera liberados para não bloquear novamente o mesmo item", () => {
    const resultado = avaliarCamposObrigatoriosJsonEmpresa({
      empresa: "RODONAVES",
      itemId: "1001",
      entry: { ncm: "8708.29.99", nbs: null, cest: null, unspsc: null, lei116: null },
      liberados: ["cest"],
    });

    expect(resultado.valido).toBe(true);
  });
});
