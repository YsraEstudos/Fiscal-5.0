import { beforeEach, describe, expect, it, vi } from "vitest";

let state;
let interaction;

const mockGet = vi.fn(() => state);
const mockUpdate = vi.fn((fn) => {
  if (typeof fn === "function") fn(state);
  else Object.assign(state, fn);
  return state;
});
const logSpy = vi.fn();
const cooldownIsAtivo = vi.fn(() => false);
const cooldownTempoRestante = vi.fn(() => 0);
const cooldownSet = vi.fn();
const mockBuscarElementoDeep = vi.fn(() => null);
const mockElementoVisivel = vi.fn((element) => !!element);
const mockGetTextoElemento = vi.fn((element) => element?.value ?? element?.textContent ?? "");
const sleepSpy = vi.fn(async () => {});

vi.mock("../src/core/estado-manager.ts", () => ({
  get: mockGet,
  update: mockUpdate,
}));

vi.mock("../src/core/log-manager.ts", () => ({
  log: logSpy,
}));

vi.mock("../src/core/cooldown-manager.ts", () => ({
  isAtivo: cooldownIsAtivo,
  tempoRestante: cooldownTempoRestante,
  set: cooldownSet,
}));

vi.mock("../src/utils/misc.ts", async () => {
  const actual = await vi.importActual("../src/utils/misc.ts");
  return {
    ...actual,
    isTestMode: () => true,
    sleep: sleepSpy,
  };
});

vi.mock("../src/utils/dom-helpers.ts", () => ({
  elementoVisivel: mockElementoVisivel,
  getTextoElemento: mockGetTextoElemento,
}));

vi.mock("../src/utils/selectors.ts", () => ({
  buscarElementoDeep: mockBuscarElementoDeep,
}));

function buildState(overrides = {}) {
  return {
    modoSimulacao: false,
    clickCooldownMs: 3000,
    estatisticas: { erros: 0, ultimoErro: null },
    ...overrides,
  };
}

describe("interaction/interacao", () => {
  beforeEach(async () => {
    vi.resetModules();
    state = buildState();
    logSpy.mockReset();
    mockGet.mockClear();
    mockUpdate.mockClear();
    cooldownIsAtivo.mockReset();
    cooldownIsAtivo.mockReturnValue(false);
    cooldownTempoRestante.mockReset();
    cooldownTempoRestante.mockReturnValue(0);
    cooldownSet.mockReset();
    mockBuscarElementoDeep.mockReset();
    mockElementoVisivel.mockReset();
    mockElementoVisivel.mockImplementation((element) => !!element);
    mockGetTextoElemento.mockReset();
    mockGetTextoElemento.mockImplementation((element) => element?.value ?? element?.textContent ?? "");
    sleepSpy.mockClear();
    interaction = await import("../src/interaction/interacao.ts");
  });

  it("digitarHumano preenche caractere a caractere e dispara eventos", async () => {
    const input = document.createElement("input");
    const inputSpy = vi.fn();
    const changeSpy = vi.fn();
    input.addEventListener("input", inputSpy);
    input.addEventListener("change", changeSpy);

    await interaction.digitarHumano(input, "30103618");

    expect(input.value).toBe("30103618");
    expect(inputSpy).toHaveBeenCalledTimes(8);
    expect(changeSpy).toHaveBeenCalledTimes(1);
  });

  it("interagir falha com elemento ausente ou invisível", async () => {
    mockElementoVisivel.mockReturnValue(false);

    await expect(interaction.interagir(document.createElement("button"), null, "abaFiscal")).resolves.toBe(false);
    expect(logSpy).toHaveBeenCalledWith("❌ Elemento não encontrado ou não visível: abaFiscal", "error");
  });

  it("bloqueia ações destrutivas em modo simulação", async () => {
    state = buildState({ modoSimulacao: true, clickCooldownMs: 0 });
    const button = document.createElement("button");
    button.click = vi.fn();

    const ok = await interaction.interagir(button, null, "prosseguir");

    expect(ok).toBe(true);
    expect(button.click).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith("🧪 [SIMULAÇÃO] Ação bloqueada: prosseguir", "warn");
  });

  it("bloqueia clique repetido quando cooldown está ativo", async () => {
    const button = document.createElement("button");
    button.click = vi.fn();
    cooldownIsAtivo.mockReturnValue(true);
    cooldownTempoRestante.mockReturnValue(2500);

    const ok = await interaction.interagir(button, null, "confirmar");

    expect(ok).toBe(true);
    expect(button.click).not.toHaveBeenCalled();
    expect(cooldownSet).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith("⏳ Bloqueado anti-clique (confirmar) por 3s", "warn");
  });

  it("registra callback ao clicar com sucesso", async () => {
    state = buildState({ clickCooldownMs: 0 });
    const button = document.createElement("button");
    button.scrollIntoView = vi.fn();
    button.click = vi.fn();
    const callback = vi.fn();
    interaction.setRegistrarInteracao(callback);

    const ok = await interaction.interagir(button, null, "abaFiscal");

    expect(ok).toBe(true);
    expect(button.click).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith("abaFiscal");
  });

  it("preenche valor quando a ação é de input", async () => {
    state = buildState({ clickCooldownMs: 0 });
    const input = document.createElement("input");
    input.scrollIntoView = vi.fn();

    const ok = await interaction.interagir(input, "8471.30.12", "ncm");

    expect(ok).toBe(true);
    expect(input.value).toBe("8471.30.12");
    expect(logSpy).toHaveBeenCalledWith("⌨️ Preenchido (ncm): 8471.30.12", "info");
  });

  it("tentarComRetry reexecuta até encontrar o elemento", async () => {
    const button = document.createElement("button");
    button.click = vi.fn();
    button.scrollIntoView = vi.fn();
    state = buildState({ clickCooldownMs: 0 });
    mockBuscarElementoDeep
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null)
      .mockReturnValue(button);

    const ok = await interaction.tentarComRetry("#butAcao1", null, "prosseguir");

    expect(ok).toBe(true);
    expect(mockBuscarElementoDeep).toHaveBeenCalledTimes(3);
    expect(logSpy).toHaveBeenCalledWith("⏳ Tentativa 1/3. Aguardando 500ms...", "warn");
    expect(logSpy).toHaveBeenCalledWith("⏳ Tentativa 2/3. Aguardando 1000ms...", "warn");
  });

  it("tentarComRetry registra erro quando falha em todas as tentativas", async () => {
    mockBuscarElementoDeep.mockReturnValue(null);

    const ok = await interaction.tentarComRetry("#inexistente", null, "prosseguir");

    expect(ok).toBe(false);
    expect(state.estatisticas.erros).toBe(1);
    expect(state.estatisticas.ultimoErro).toEqual(
      expect.objectContaining({
        tipo: "elemento_nao_encontrado",
        seletor: "#inexistente",
      }),
    );
    expect(logSpy).toHaveBeenCalledWith("❌ Falha após 3 tentativas: #inexistente", "error");
  });
});

