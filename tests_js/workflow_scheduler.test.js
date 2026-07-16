import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkflowScheduler } from "../src/workflow/scheduler.ts";

describe("workflow/scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("sorteia um atraso entre o mínimo e o máximo a cada interação", () => {
    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.999999);
    const scheduler = createWorkflowScheduler(vi.fn());
    const estado = {
      globalActionDelayMs: 1200,
      globalActionDelayMinMs: 1000,
      globalActionDelayMaxMs: 20000,
    };

    scheduler.registrarInteracao("primeira", estado);
    expect(scheduler.getActionDelayRemainingMs()).toBe(1000);

    vi.advanceTimersByTime(1000);
    scheduler.registrarInteracao("segunda", estado);
    expect(scheduler.getActionDelayRemainingMs()).toBe(20000);
  });

  it("mantém o valor legado quando o estado ainda não possui intervalo", () => {
    const scheduler = createWorkflowScheduler(vi.fn());

    scheduler.registrarInteracao("legado", { globalActionDelayMs: 3333 });

    expect(scheduler.getActionDelayRemainingMs()).toBe(3333);
  });

  it("ordena automaticamente uma faixa salva invertida", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const scheduler = createWorkflowScheduler(vi.fn());

    scheduler.registrarInteracao("invertida", {
      globalActionDelayMs: 1200,
      globalActionDelayMinMs: 20000,
      globalActionDelayMaxMs: 1000,
    });

    expect(scheduler.getActionDelayRemainingMs()).toBe(1000);
  });
});