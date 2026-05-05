import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CONFIG } from "../src/config/constants.ts";

let audioManager;
let originalAudioContext;
let originalWebkitAudioContext;

function createAudioContextDouble() {
  const oscillator = {
    connect: vi.fn(),
    frequency: { value: 0 },
    type: "",
    start: vi.fn(),
    stop: vi.fn(),
  };
  const gain = {
    connect: vi.fn(),
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
  };
  const context = {
    state: "running",
    destination: {},
    currentTime: 10,
    createOscillator: vi.fn(() => oscillator),
    createGain: vi.fn(() => gain),
    resume: vi.fn(),
    close: vi.fn(),
  };
  return { context, oscillator };
}

describe("interaction/audio-manager", () => {
  beforeEach(async () => {
    vi.resetModules();
    originalAudioContext = window.AudioContext;
    originalWebkitAudioContext = window.webkitAudioContext;
    audioManager = await import("../src/interaction/audio-manager.ts");
  });

  afterEach(() => {
    globalThis.__KM_TEST_MODE__ = true;
    window.AudioContext = originalAudioContext;
    window.webkitAudioContext = originalWebkitAudioContext;
  });

  it("não inicializa áudio em modo de teste", () => {
    globalThis.__KM_TEST_MODE__ = true;

    expect(audioManager.inicializar()).toBe(false);
  });

  it("inicializa AudioContext uma única vez fora do modo de teste", () => {
    globalThis.__KM_TEST_MODE__ = false;
    const { context } = createAudioContextDouble();
    const ctor = vi.fn(() => context);
    window.AudioContext = ctor;

    expect(audioManager.inicializar()).toBe(true);
    expect(audioManager.inicializar()).toBe(true);
    expect(ctor).toHaveBeenCalledTimes(1);
  });

  it("faz warning quando AudioContext falha", () => {
    globalThis.__KM_TEST_MODE__ = false;
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    window.AudioContext = vi.fn(() => {
      throw new Error("sem audio");
    });

    expect(audioManager.inicializar()).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith("[KM] Audio API não disponível:", expect.any(Error));
  });

  it("toca notas e retoma contexto suspenso", () => {
    globalThis.__KM_TEST_MODE__ = false;
    const { context, oscillator } = createAudioContextDouble();
    context.state = "suspended";
    window.AudioContext = vi.fn(() => context);

    audioManager.tocar("warning");

    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(context.createOscillator).toHaveBeenCalledTimes(CONFIG.SONS.warning.length);
    expect(oscillator.start).toHaveBeenCalled();
    expect(oscillator.stop).toHaveBeenCalled();
  });

  it("fecha o contexto e libera recursos", () => {
    globalThis.__KM_TEST_MODE__ = false;
    const { context } = createAudioContextDouble();
    window.AudioContext = vi.fn(() => context);

    audioManager.inicializar();
    audioManager.fechar();

    expect(context.close).toHaveBeenCalledTimes(1);
  });
});

