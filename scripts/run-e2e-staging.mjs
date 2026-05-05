import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const requiredEnv = [
  "STAGING_BASE_URL",
  "STAGING_USER",
  "STAGING_PASSWORD",
  "STAGING_ITEM_HAPPY",
  "STAGING_ITEM_REINCIDENCIA",
  "STAGING_ITEM_SEM_MIDIA",
];

const missing = requiredEnv.filter((name) => !String(process.env[name] || "").trim());
if (missing.length > 0) {
  console.error(`[staging-smoke] Variáveis obrigatórias ausentes: ${missing.join(", ")}`);
  process.exit(1);
}

const configPath = path.resolve("playwright.staging.config.js");
if (!existsSync(configPath)) {
  console.error("[staging-smoke] Arquivo playwright.staging.config.js não encontrado.");
  process.exit(1);
}

const smokeSpec = path.resolve("tests_e2e", "staging", "smoke.spec.js");
if (!existsSync(smokeSpec)) {
  console.error("[staging-smoke] Suite de staging ausente em tests_e2e/staging/smoke.spec.js.");
  process.exit(1);
}

const child = spawn("npx", ["playwright", "test", "--config=playwright.staging.config.js"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});
