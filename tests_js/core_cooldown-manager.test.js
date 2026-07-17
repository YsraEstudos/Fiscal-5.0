import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isAtivo,
  limpar,
  set,
  tempoRestante,
} from "../src/core/cooldown-manager.ts";

describe("core/cooldown-manager", () => {
  beforeEach(() => {
    limpar();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-18T10:00:00Z"));
  });

  it("ativa e expira cooldown por tempo", () => {
    set("k1", 1000);
    expect(isAtivo("k1")).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(isAtivo("k1")).toBe(false);
  });

  it("tempoRestante retorna 0 quando inexistente", () => {
    expect(tempoRestante("inexistente")).toBe(0);
  });

  it("tempoRestante reduz com avanço do tempo", () => {
    set("k2", 5000);
    expect(tempoRestante("k2")).toBe(5000);
    vi.advanceTimersByTime(1200);
    expect(tempoRestante("k2")).toBe(3800);
  });

  it("limpar remove chave específica e limpar() remove todas", () => {
    set("a", 1000);
    set("b", 1000);
    limpar("a");
    expect(isAtivo("a")).toBe(false);
    expect(isAtivo("b")).toBe(true);
    limpar();
    expect(isAtivo("b")).toBe(false);
    vi.useRealTimers();
  });
});
