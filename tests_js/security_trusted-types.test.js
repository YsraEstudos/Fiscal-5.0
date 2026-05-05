import { beforeEach, describe, expect, it, vi } from "vitest";

let mod;

describe("security/trusted-types", () => {
  beforeEach(async () => {
    vi.resetModules();
    mod = await import("../src/security/trusted-types.ts");
  });

  it("cria a policy default quando a API existe e ainda não há defaultPolicy", () => {
    const createPolicy = vi.fn(() => ({}));
    Object.defineProperty(window, "trustedTypes", {
      value: {
        createPolicy,
        defaultPolicy: null,
      },
      configurable: true,
      writable: true,
    });

    mod.enableTrustedTypesBypass();

    expect(createPolicy).toHaveBeenCalledTimes(1);
    expect(createPolicy).toHaveBeenCalledWith(
      "default",
      expect.objectContaining({
        createHTML: expect.any(Function),
        createScript: expect.any(Function),
        createScriptURL: expect.any(Function),
      }),
    );
  });

  it("não recria policy quando defaultPolicy já existe", () => {
    const createPolicy = vi.fn();
    Object.defineProperty(window, "trustedTypes", {
      value: {
        createPolicy,
        defaultPolicy: {},
      },
      configurable: true,
      writable: true,
    });

    mod.enableTrustedTypesBypass();

    expect(createPolicy).not.toHaveBeenCalled();
  });

  it("faz no-op seguro quando trustedTypes não existe", () => {
    Object.defineProperty(window, "trustedTypes", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    expect(() => mod.enableTrustedTypesBypass()).not.toThrow();
  });

  it("faz warning quando createPolicy lança erro", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    Object.defineProperty(window, "trustedTypes", {
      value: {
        createPolicy: vi.fn(() => {
          throw new Error("csp");
        }),
        defaultPolicy: null,
      },
      configurable: true,
      writable: true,
    });

    mod.enableTrustedTypesBypass();

    expect(warnSpy).toHaveBeenCalledWith(
      "[KM] TrustedTypes policy não pôde ser criada:",
      expect.any(Error),
    );
  });
});

