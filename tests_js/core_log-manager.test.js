import { beforeEach, describe, expect, it, vi } from "vitest";

import { CONFIG } from "../src/config/constants.ts";

let state;
let manager;
const mockGet = vi.fn(() => state);
const mockUpdate = vi.fn((fn) => {
  if (typeof fn === "function") fn(state);
  else Object.assign(state, fn);
  return state;
});

vi.mock("../src/core/estado-manager.ts", () => ({
  get: mockGet,
  update: mockUpdate,
}));

describe("core/log-manager", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    state = { logs: [] };
    mockGet.mockClear();
    mockUpdate.mockClear();
    manager = await import("../src/core/log-manager.ts");
  });

  it("preload carrega logs do estado para memória", () => {
    state.logs = [{ timestamp: "10:00:00", mensagem: "preexistente", tipo: "info" }];

    const logs = manager.preloadParaUI();

    expect(logs).toEqual(state.logs);
    expect(logs).not.toBe(state.logs);
  });

  it("adiciona log, atualiza a UI e faz flush debounced", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    document.body.innerHTML = '<div id="log-area"></div>';

    manager.adicionar("mensagem importante");

    expect(document.getElementById("log-area")?.firstChild?.textContent).toContain("mensagem importante");
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(state.logs).toEqual([]);

    vi.advanceTimersByTime(400);
    expect(state.logs[0].mensagem).toBe("mensagem importante");
  });

  it("usa console.error e console.warn conforme o tipo", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    manager.adicionar("erro crítico", "error");
    manager.adicionar("atenção", "warn");

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("limita logs em memória ao máximo configurado", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    state.logs = Array.from({ length: CONFIG.LOG_MAX_ENTRIES }, (_, index) => ({
      timestamp: `10:00:${String(index).padStart(2, "0")}`,
      mensagem: `log ${index}`,
      tipo: "info",
    }));

    manager.preloadParaUI();
    manager.adicionar("novo");
    vi.advanceTimersByTime(400);

    expect(state.logs).toHaveLength(CONFIG.LOG_MAX_ENTRIES);
    expect(state.logs[0].mensagem).toBe("novo");
    expect(consoleSpy).toHaveBeenCalledTimes(1);
  });

  it("mantém no máximo 50 nós visíveis no painel", () => {
    document.body.innerHTML = '<div id="log-area"></div>';
    const logArea = document.getElementById("log-area");
    for (let i = 0; i < 50; i += 1) {
      const div = document.createElement("div");
      div.textContent = `linha ${i}`;
      logArea.appendChild(div);
    }

    manager.atualizarUI({ timestamp: "10:00:00", mensagem: "nova linha", tipo: "info" });

    expect(logArea.children).toHaveLength(50);
    expect(logArea.firstChild.textContent).toContain("nova linha");
  });
});
