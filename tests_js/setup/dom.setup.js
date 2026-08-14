import { afterEach, beforeEach, vi } from "vitest";

globalThis.__KM_TEST_MODE__ = true;

class MemoryStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
  get length() {
    return this.store.size;
  }
  key(i) {
    return Array.from(this.store.keys())[i] ?? null;
  }
}

if (!globalThis.localStorage || typeof globalThis.localStorage.clear !== "function") {
  globalThis.localStorage = new MemoryStorage();
}
if (!globalThis.sessionStorage || typeof globalThis.sessionStorage.clear !== "function") {
  globalThis.sessionStorage = new MemoryStorage();
}

beforeEach(() => {
  document.body.innerHTML = "";
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();

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
