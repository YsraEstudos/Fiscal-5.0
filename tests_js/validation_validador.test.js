import { describe, expect, it, vi } from "vitest";
import {
  aplicarVisual,
  validar,
  validarAcoesObrigatorias,
} from "../src/validation/validador.ts";

describe("validation/validador", () => {
  it("valida NCM e UNSPSC corretamente", () => {
    expect(validar("ncm", "8471.30.12").valido).toBe(true);
    expect(validar("ncm", "84713012").valido).toBe(false);
    expect(validar("nbs", "1.0105.40.00").valido).toBe(true);
    expect(validar("nbs", "8471.30.12").valido).toBe(false);
    expect(validar("cest", "0107500").valido).toBe(true);
    expect(validar("cest", "01.075.00").valido).toBe(true);
    expect(validar("cest", "abc").valido).toBe(false);
    expect(validar("unspsc", "30103618").valido).toBe(true);
    expect(validar("unspsc", "3010").valido).toBe(false);
    expect(validar("lei116Servico", "7.02").valido).toBe(true);
    expect(validar("lei116Servico", "7.2").valido).toBe(false);
  });

  it("retorna válido para chave sem validador", () => {
    expect(validar("nao_existente", "x")).toEqual({ valido: true, mensagem: "" });
  });

  it("aplicarVisual atualiza borda e tooltip", () => {
    const input = document.createElement("input");
    aplicarVisual(input, { valido: false, mensagem: "erro" });
    expect(input.style.border).toContain("2px");
    expect(input.title).toBe("erro");
  });

  it("validarAcoesObrigatorias bloqueia quando ação obrigatória é inválida", () => {
    const logFn = vi.fn();
    const tocarErro = vi.fn();
    const getEstado = () => ({
      acoes: {
        ncm: { ativo: true },
        unspsc: { ativo: true },
      },
    });
    const getValorAcao = (id) => (id === "ncm" ? "9999" : "30103618");
    const ok = validarAcoesObrigatorias(getEstado, getValorAcao, logFn, tocarErro);
    expect(ok).toBe(false);
    expect(logFn).toHaveBeenCalledTimes(1);
    expect(tocarErro).toHaveBeenCalledWith("error");
  });

  it("validarAcoesObrigatorias passa quando não há violações", () => {
    const getEstado = () => ({
      acoes: {
        ncm: { ativo: true },
        unspsc: { ativo: true },
        lei116Servico: { ativo: true },
      },
    });
    const getValorAcao = (id) => {
      if (id === "ncm") return "8471.30.12";
      if (id === "unspsc") return "30103618";
      return null;
    };
    const ok = validarAcoesObrigatorias(getEstado, getValorAcao, vi.fn(), vi.fn());
    expect(ok).toBe(true);
  });

  it("validarAcoesObrigatorias valida NBS em contexto de serviço", () => {
    document.body.innerHTML = `
      <input id="txtNBS" value="1.0105.40.00" />
      <input id="txtIncideNBS" value="SIM" />
    `;
    const logFn = vi.fn();
    const tocarErro = vi.fn();
    const getEstado = () => ({
      itemMapAtivo: false,
      acoes: {
        ncm: { ativo: true },
        unspsc: { ativo: true },
      },
    });
    const getValorAcao = (id) => (id === "ncm" ? "1.0105.40.00" : "30103618");
    const ok = validarAcoesObrigatorias(getEstado, getValorAcao, logFn, tocarErro);
    expect(ok).toBe(true);
    expect(logFn).not.toHaveBeenCalled();
    expect(tocarErro).not.toHaveBeenCalled();
  });

  it("validarAcoesObrigatorias bloqueia lei116 inválida quando há valor", () => {
    const logFn = vi.fn();
    const tocarErro = vi.fn();
    const getEstado = () => ({
      acoes: {
        ncm: { ativo: true },
        unspsc: { ativo: true },
        lei116Servico: { ativo: true },
      },
    });
    const getValorAcao = (id) => {
      if (id === "ncm") return "8471.30.12";
      if (id === "unspsc") return "30103618";
      return "7.2";
    };

    const ok = validarAcoesObrigatorias(getEstado, getValorAcao, logFn, tocarErro);
    expect(ok).toBe(false);
    expect(logFn).toHaveBeenCalledWith(expect.stringContaining("lei116Servico"), "error");
    expect(tocarErro).toHaveBeenCalledWith("error");
  });
});
