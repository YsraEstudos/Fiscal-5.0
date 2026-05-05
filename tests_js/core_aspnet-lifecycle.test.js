import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const logSpy = vi.fn();

vi.mock("../src/core/log-manager.ts", () => ({
  log: logSpy,
}));

let lifecycle;
let prm;

describe("core/aspnet-lifecycle", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    logSpy.mockReset();
    prm = {
      add_beginRequest: vi.fn(),
      add_endRequest: vi.fn(),
      remove_beginRequest: vi.fn(),
      remove_endRequest: vi.fn(),
    };
    globalThis.Sys = {
      WebForms: {
        PageRequestManager: {
          getInstance: vi.fn(() => prm),
        },
      },
    };
    lifecycle = await import("../src/core/aspnet-lifecycle.ts");
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.Sys;
  });

  it("faz hook idempotente no PageRequestManager", () => {
    lifecycle.hook();
    lifecycle.hook();
    vi.advanceTimersByTime(50);

    expect(prm.remove_beginRequest).toHaveBeenCalledTimes(1);
    expect(prm.remove_endRequest).toHaveBeenCalledTimes(1);
    expect(prm.add_beginRequest).toHaveBeenCalledTimes(1);
    expect(prm.add_endRequest).toHaveBeenCalledTimes(1);
  });

  it("marca busy no beginRequest e notifica listeners no endRequest", () => {
    lifecycle.hook();
    vi.advanceTimersByTime(50);
    const onBegin = prm.add_beginRequest.mock.calls[0][0];
    const onEnd = prm.add_endRequest.mock.calls[0][0];
    const listener = vi.fn();
    const unsubscribe = lifecycle.subscribe(listener);

    onBegin();
    expect(lifecycle.isBusy()).toBe(true);

    onEnd(null, { get_error: () => null });
    expect(lifecycle.isBusy()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    onEnd(null, { get_error: () => null });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("trata erro em endRequest sem disparar listeners", () => {
    lifecycle.hook();
    vi.advanceTimersByTime(50);
    const onEnd = prm.add_endRequest.mock.calls[0][0];
    const listener = vi.fn();
    lifecycle.subscribe(listener);
    const setErrorHandled = vi.fn();

    onEnd(null, {
      get_error: () => ({ message: "falha de servidor" }),
      set_errorHandled: setErrorHandled,
    });

    expect(setErrorHandled).toHaveBeenCalledWith(true);
    expect(logSpy).toHaveBeenCalledWith(
      "❌ Erro no servidor (endRequest): falha de servidor",
      "error",
    );
    expect(listener).not.toHaveBeenCalled();
  });
});

