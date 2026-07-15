import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("vite userscript metadata", () => {
  it("targets FISCAL 5.0 in metadata and output filename", () => {
    const configPath = path.join(process.cwd(), "vite.config.js");
    const config = fs.readFileSync(configPath, "utf8");

    expect(config).toContain("name: 'FISCAL 5.0 (Robust Robot)'");
    expect(config).toContain("version: '5.2.2'");
    expect(config).toContain("FISCAL 5.0 com controle individual");
    expect(config).toContain("fileName: 'FISCAL-5.0.user.js'");
  });
});
