import { beforeEach, describe, expect, it } from "vitest";

import {
  analisarListaEmpresas,
  empresaMonitoradaEstaAberta,
  normalizarNomeMonitorado,
  obterEmpresasMonitoradas,
  obterProjetosSso,
  salvarEmpresasMonitoradas,
} from "../src/sso/empresa-abas.ts";

function limparCookies() {
  document.cookie.split(";").forEach((parte) => {
    const nome = parte.split("=")[0]?.trim();
    if (nome) document.cookie = `${nome}=; max-age=0; path=/`;
  });
}

describe("sso/empresa-abas", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    limparCookies();
  });

  it("normaliza nomes com acentos, separadores e ambiente", () => {
    expect(normalizarNomeMonitorado("TRES_CORAÇÕES_S4HANA - PRD")).toBe(
      "TRES CORACOES S4HANA PRD",
    );
  });

  it("separa linhas e remove empresas repetidas", () => {
    expect(analisarListaEmpresas("A\n\n B \nA\n")).toEqual(["A", "B"]);
  });

  it("considera aberta uma aba cujo heartbeat tenha a empresa monitorada", () => {
    const aba = {
      id: "tab-1",
      identidades: ["TRES_CORACOES_S4HANA - PRD", "ITEM_Edita.aspx"],
      host: "trescoracoes.klassmatt.com.br",
      url: "https://trescoracoes.klassmatt.com.br/ITEM_Edita.aspx",
      titulo: "TRES_CORACOES_S4HANA - PRD",
      atualizadoEm: Date.now(),
    };

    expect(
      empresaMonitoradaEstaAberta(
        { nome: "TRES CORACOES S4HANA", codigo: "TRES_CORACOES_S4HANA - PRD" },
        [aba],
      ),
    ).toBe(aba);
    expect(empresaMonitoradaEstaAberta({ nome: "RODONAVES", codigo: "RODONAVES" }, [aba])).toBeNull();
  });

  it("lê os cartões do SSO e salva o código real da empresa", () => {
    document.body.innerHTML = `
      <a id="lkDest" title="TRES_CORACOES_S4HANA" href="SSOService.aspx?targetId=1">3C_S4HANA</a>
      <a id="lkDest" title="RODONAVES" href="SSOService.aspx?targetId=2">RODONAVES - PRD</a>
    `;

    expect(obterProjetosSso()).toHaveLength(2);
    expect(salvarEmpresasMonitoradas("3C_S4HANA\nRODONAVES - PRD")).toEqual([
      { nome: "3C_S4HANA", codigo: "TRES_CORACOES_S4HANA" },
      { nome: "RODONAVES - PRD", codigo: "RODONAVES" },
    ]);
    expect(obterEmpresasMonitoradas()).toEqual([
      { nome: "3C_S4HANA", codigo: "TRES_CORACOES_S4HANA" },
      { nome: "RODONAVES - PRD", codigo: "RODONAVES" },
    ]);
  });
});
