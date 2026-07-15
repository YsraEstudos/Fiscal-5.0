import { describe, expect, it } from "vitest";

import {
  avaliarCamposObrigatoriosJsonEmpresa,
  empresaExigeUnspsc,
  obterEmpresaAtual,
} from "../src/validation/empresa-json-requirements.ts";

describe("validation/empresa-json-requirements", () => {
  it("detecta empresa atual a partir do lblUsuario", () => {
    document.body.innerHTML = `
      <span id="lblUsuario">&nbsp;&nbsp;ISRAEL DE SENA XAVIER MACHADO//VAXXINOVA&nbsp;&nbsp;</span>
    `;

    expect(obterEmpresaAtual()).toBe("VAXXINOVA");
  });

  it("reutiliza a regra de UNSPSC para habilitar ou desabilitar a empresa", () => {
    expect(empresaExigeUnspsc("VAXXINOVA")).toBe(true);
    expect(empresaExigeUnspsc("INTERCEMENT")).toBe(false);
    expect(empresaExigeUnspsc(null)).toBe(null);
  });

  it("RODONAVES não bloqueia NCM sem CEST quando outro item do lote trouxe CEST", () => {
    const itemMap = {
      "1001": { ncm: "8708.29.99", nbs: null, cest: null, unspsc: null, lei116: null },
      "1002": { ncm: "3917.29.00", nbs: null, cest: "01.002.00", unspsc: null, lei116: null },
    };

    const resultado = avaliarCamposObrigatoriosJsonEmpresa({
      empresa: "RODONAVES",
      itemId: "1001",
      entry: itemMap["1001"],
      itemMap,
      liberados: [],
    });

    expect(resultado.valido).toBe(true);
    expect(resultado.camposFaltantes).toEqual([]);
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

  it("RODONAVES não bloqueia CEST quando o NCM não tem CEST compatível", () => {
    const resultado = avaliarCamposObrigatoriosJsonEmpresa({
      empresa: "RODONAVES",
      itemId: "1001",
      entry: { ncm: "9999.99.99", nbs: null, cest: null, unspsc: null, lei116: null },
      liberados: [],
    });

    expect(resultado.valido).toBe(true);
    expect(resultado.camposFaltantes).toEqual([]);
  });

  it("RODONAVES não bloqueia item sem CEST quando o lote tem CEST em outro item", () => {
    const itemMap = {
      "1001": { ncm: "8708.29.99", nbs: null, cest: null, unspsc: null, lei116: null },
      "1002": { ncm: "3917.29.00", nbs: null, cest: "01.002.00", unspsc: null, lei116: null },
    };

    const resultado = avaliarCamposObrigatoriosJsonEmpresa({
      empresa: "RODONAVES",
      itemId: "1001",
      entry: itemMap["1001"],
      itemMap,
      liberados: [],
    });

    expect(resultado.valido).toBe(true);
    expect(resultado.camposFaltantes).toEqual([]);
  });

  it("RODONAVES bloqueia CEST quando nenhum item do lote trouxe CEST", () => {
    const itemMap = {
      "1001": { ncm: "8708.29.99", nbs: null, cest: null, unspsc: null, lei116: null },
      "1002": { ncm: "3917.29.00", nbs: null, cest: null, unspsc: null, lei116: null },
    };

    const resultado = avaliarCamposObrigatoriosJsonEmpresa({
      empresa: "RODONAVES",
      itemId: "1001",
      entry: itemMap["1001"],
      itemMap,
      liberados: [],
    });

    expect(resultado.valido).toBe(false);
    expect(resultado.camposFaltantes).toEqual(["cest"]);
    expect(resultado.mensagem).toContain("RODONAVES exige CEST");
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

  it("ACCOR exige só UNSPSC quando outro item do lote trouxe CEST", () => {
    const itemMap = {
      "1001": { ncm: "8708.29.99", nbs: null, cest: null, unspsc: null, lei116: null },
      "1002": { ncm: "3917.29.00", nbs: null, cest: "01.002.00", unspsc: "30103618", lei116: null },
    };

    const resultado = avaliarCamposObrigatoriosJsonEmpresa({
      empresa: "ACCOR",
      itemId: "1001",
      entry: itemMap["1001"],
      itemMap,
      liberados: [],
    });

    expect(resultado.valido).toBe(false);
    expect(resultado.camposFaltantes).toEqual(["unspsc"]);
  });

  it("AZUL combina CEST, UNSPSC e Lei 116 quando aplicáveis", () => {
    const itemMap = {
      "1001": { ncm: "8708.29.99", nbs: "1.0105.40.00", cest: null, unspsc: null, lei116: null },
      "1002": { ncm: "3917.29.00", nbs: null, cest: "01.002.00", unspsc: "30103618", lei116: null },
    };

    const resultado = avaliarCamposObrigatoriosJsonEmpresa({
      empresa: "AZUL",
      itemId: "1001",
      entry: itemMap["1001"],
      itemMap,
      liberados: [],
    });

    expect(resultado.valido).toBe(false);
    expect(resultado.camposFaltantes).toEqual(["lei116", "unspsc"]);
  });

  it("BRADESCO exige UNSPSC sem exigir NCM", () => {
    const resultado = avaliarCamposObrigatoriosJsonEmpresa({
      empresa: "BRADESCO",
      itemId: "B1",
      entry: { ncm: null, nbs: null, cest: null, unspsc: null, lei116: null },
      liberados: [],
    });

    expect(resultado.valido).toBe(false);
    expect(resultado.camposFaltantes).toEqual(["unspsc"]);
  });

  it("AGRARIA não exige Lei 116 só por ter NBS na lista informativa", () => {
    const resultado = avaliarCamposObrigatoriosJsonEmpresa({
      empresa: "AGRARIA",
      itemId: "S1",
      entry: { ncm: null, nbs: "1.0105.40.00", cest: null, unspsc: null, lei116: null },
      liberados: [],
    });

    expect(resultado.valido).toBe(true);
  });

  it("CARMO ENERGY aceita alias com espaço e exige Lei 116 quando há NBS", () => {
    const resultado = avaliarCamposObrigatoriosJsonEmpresa({
      empresa: "CARMO ENERGY",
      itemId: "S1",
      entry: { ncm: null, nbs: "1.0105.40.00", cest: null, unspsc: null, lei116: null },
      liberados: [],
    });

    expect(resultado.valido).toBe(false);
    expect(resultado.camposFaltantes).toEqual(["lei116"]);
  });

  it("AYOSHI não exige UNSPSC", () => {
    const resultado = avaliarCamposObrigatoriosJsonEmpresa({
      empresa: "AYOSHI",
      itemId: "A1",
      entry: { ncm: "8471.30.12", nbs: null, cest: null, unspsc: null, lei116: null },
      liberados: [],
    });

    expect(resultado.valido).toBe(true);
  });

  it("RECH não exige CEST automaticamente quando CEST é apenas condicional em GOV", () => {
    const itemMap = {
      "1001": { ncm: "8708.29.99", nbs: null, cest: null, unspsc: "30103618", lei116: null },
      "1002": { ncm: "3917.29.00", nbs: null, cest: "01.002.00", unspsc: "30103618", lei116: null },
    };

    const resultado = avaliarCamposObrigatoriosJsonEmpresa({
      empresa: "RECH",
      itemId: "1001",
      entry: itemMap["1001"],
      itemMap,
      liberados: [],
    });

    expect(resultado.valido).toBe(true);
  });

  it("OWENS continua sem CEST obrigatório após remoção informada", () => {
    const itemMap = {
      "1001": { ncm: "8708.29.99", nbs: null, cest: null, unspsc: null, lei116: null },
      "1002": { ncm: "3917.29.00", nbs: null, cest: "01.002.00", unspsc: null, lei116: null },
    };

    const resultado = avaliarCamposObrigatoriosJsonEmpresa({
      empresa: "OWENS",
      itemId: "1001",
      entry: itemMap["1001"],
      itemMap,
      liberados: [],
    });

    expect(resultado.valido).toBe(true);
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
