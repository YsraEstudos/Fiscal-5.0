import { afterEach, beforeEach, vi } from "vitest";

globalThis.__KM_TEST_MODE__ = true;

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  sessionStorage.clear();

  if (!globalThis.CSS) {
    globalThis.CSS = {};
  }
  if (!globalThis.CSS.escape) {
    globalThis.CSS.escape = (value) =>
      String(value).replace(/[^a-zA-Z0-9_-]/g, (m) => `\\${m}`);
  }

  globalThis.alert = vi.fn();
  globalThis.confirm = vi.fn(() => true);
  globalThis.prompt = vi.fn(() => "perfil_teste");
  globalThis.scrollTo = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});
