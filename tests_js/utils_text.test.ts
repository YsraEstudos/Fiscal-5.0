import { describe, expect, it } from "vitest";
import {
  normalizarEspacos,
  normalizarTexto,
  normalizarTextoSemAcento,
  removerAcentos,
} from "../src/utils/text.ts";

describe("utils/text", () => {
  it("normalizarTexto remove espaços extras e lowercase", () => {
    expect(normalizarTexto("  Olá   MUNDO ")).toBe("olá mundo");
  });

  it("removerAcentos remove diacríticos", () => {
    expect(removerAcentos("Descrição")).toBe("Descricao");
  });

  it("normalizarTextoSemAcento combina normalizações", () => {
    expect(normalizarTextoSemAcento("  AçÃo   Fiscal ")).toBe("acao fiscal");
  });

  it("normalizarEspacos preserva caixa e limpa espaços", () => {
    expect(normalizarEspacos("  A   B\tC \n")).toBe("A B C");
  });
});
