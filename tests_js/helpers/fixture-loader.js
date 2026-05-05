import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_DIR = path.resolve(__dirname, "../fixtures");

export function loadFixture(name) {
  const p = path.join(FIXTURES_DIR, name);
  return fs.readFileSync(p, "utf-8");
}

export function docFromFixture(name) {
  const html = loadFixture(name);
  return new DOMParser().parseFromString(html, "text/html");
}
