import { beforeEach, describe, expect, it, vi } from "vitest";

let selectors;

function setVisibleRect(element, width = 120, height = 32) {
  element.getBoundingClientRect = () => ({
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON() {
      return {};
    },
  });
  return element;
}

describe("utils/selectors", () => {
  beforeEach(async () => {
    vi.resetModules();
    selectors = await import("../src/utils/selectors.ts");
  });

  it("parseSeletor reconhece formatos css, texto, postback, km e css||text", () => {
    expect(selectors.parseSeletor("")).toEqual({ kind: "empty" });
    expect(selectors.parseSeletor("text=Fiscal")).toEqual({ kind: "text", text: "Fiscal" });
    expect(selectors.parseSeletor("postback=ctl00$Body$lbutMenu")).toEqual({
      kind: "postback",
      target: "ctl00$Body$lbutMenu",
    });
    expect(selectors.parseSeletor("a.link||Fiscal")).toEqual({
      kind: "cssText",
      css: "a.link",
      text: "Fiscal",
    });
    expect(selectors.parseSeletor("km:tag=a;id=menu;text=Fiscal")).toEqual({
      kind: "km",
      tag: "a",
      id: "menu",
      name: null,
      text: "Fiscal",
    });
  });

  it("busca por texto em documentos visíveis", () => {
    const botao = setVisibleRect(document.createElement("button"));
    botao.textContent = "Executar";
    document.body.appendChild(botao);

    expect(selectors.buscarElementoDeep("text=Executar")).toBe(botao);
    expect(selectors.buscarElementosDeep("text=Executar")).toEqual([botao]);
  });

  it("busca por postback e ignora links invisíveis", () => {
    const invisivel = setVisibleRect(document.createElement("a"));
    invisivel.href = "javascript:__doPostBack('ctl00$Body$lbutMenu','')";
    invisivel.style.display = "none";

    const visivel = setVisibleRect(document.createElement("a"));
    visivel.href = "javascript:__doPostBack('ctl00$Body$lbutMenu','')";

    document.body.append(invisivel, visivel);

    expect(selectors.buscarElementoDeep("postback=ctl00$Body$lbutMenu")).toBe(visivel);
  });

  it("busca css||text e km selector com filtro textual", () => {
    const outra = setVisibleRect(document.createElement("a"));
    outra.className = "menu";
    outra.id = "menu";
    outra.textContent = "Outros";

    const alvo = setVisibleRect(document.createElement("a"));
    alvo.className = "menu";
    alvo.id = "menu";
    alvo.textContent = "Classificações";

    document.body.append(outra, alvo);

    expect(selectors.buscarElementoDeep("a.menu||Classificações")).toBe(alvo);
    expect(selectors.buscarElementoDeep("km:tag=a;id=menu;text=Classificações")).toBe(alvo);
  });

  it("busca CSS também em iframe acessível", () => {
    const iframeDoc = document.implementation.createHTMLDocument("iframe");
    const alvo = iframeDoc.createElement("input");
    alvo.id = "txtNCMTIPI";
    iframeDoc.body.appendChild(alvo);

    const iframe = document.createElement("iframe");
    Object.defineProperty(iframe, "contentDocument", {
      value: iframeDoc,
      configurable: true,
    });
    document.body.appendChild(iframe);

    expect(selectors.buscarElementoDeep("#txtNCMTIPI")).toBe(alvo);
    expect(selectors.buscarElementosDeep("#txtNCMTIPI")).toContain(alvo);
  });

  it("encontra campo NCM preferindo seletores conhecidos", () => {
    const alternativo = document.createElement("input");
    alternativo.id = "customNcm";
    document.body.appendChild(alternativo);

    const preferido = document.createElement("input");
    preferido.id = "txtNCMTIPI";
    document.body.appendChild(preferido);

    expect(selectors.encontrarCampoNcmPreferido("#customNcm")).toBe(alternativo);
    expect(selectors.encontrarCampoNcmPreferido("#naoExiste, #outra")).toBe(preferido);
  });

  it("encontra campos de serviço (NBS, Cat90 e Cat91)", () => {
    const nbs = document.createElement("input");
    nbs.id = "txtNBS";
    document.body.appendChild(nbs);

    const cat90 = document.createElement("input");
    cat90.className = "Cat90";
    document.body.appendChild(cat90);

    const cat91 = document.createElement("input");
    cat91.className = "Cat91";
    document.body.appendChild(cat91);

    expect(selectors.encontrarCampoNbsPreferido()).toBe(nbs);
    expect(selectors.encontrarCampoLei116Grupo()).toBe(cat90);
    expect(selectors.encontrarCampoLei116Subgrupo()).toBe(cat91);
  });

  it("waitForAny resolve quando um seletor aparece", async () => {
    const root = document.createElement("div");
    document.body.appendChild(root);

    const promise = selectors.waitForAny([".ok", ".ready"], { root, timeoutMs: 100 });

    setTimeout(() => {
      const el = document.createElement("span");
      el.className = "ready";
      root.appendChild(el);
    }, 10);

    const found = await promise;
    expect(found.className).toBe("ready");
  });

  it("waitForAny rejeita no timeout", async () => {
    vi.useFakeTimers();
    const root = document.createElement("div");
    document.body.appendChild(root);

    const promise = selectors.waitForAny(".missing", { root, timeoutMs: 10 });
    vi.advanceTimersByTime(10);

    await expect(promise).rejects.toThrow("Timeout esperando um dos seletores: .missing");
    vi.useRealTimers();
  });

  it("gera seletor único por ID, name, ID duplicado e path fallback", () => {
    const unico = document.createElement("button");
    unico.id = "btnExecutar";
    document.body.appendChild(unico);

    const porName = document.createElement("input");
    porName.name = "ctl00$Body$txtNum";
    document.body.appendChild(porName);

    const dup1 = document.createElement("a");
    dup1.id = "menuDuplicado";
    dup1.textContent = "Fiscal";
    document.body.appendChild(dup1);

    const dup2 = document.createElement("a");
    dup2.id = "menuDuplicado";
    dup2.textContent = "Classificações";
    document.body.appendChild(dup2);

    const wrapper = document.createElement("div");
    const spanA = document.createElement("span");
    const spanB = document.createElement("span");
    wrapper.append(spanA, spanB);
    document.body.appendChild(wrapper);

    expect(selectors.gerarSeletorUnico(unico)).toBe("#btnExecutar");
    expect(selectors.gerarSeletorUnico(porName)).toBe('[name="ctl00\\$Body\\$txtNum"]');
    expect(selectors.gerarSeletorUnico(dup2)).toBe("km:tag=a;id=menuDuplicado;text=Classificações");
    expect(selectors.gerarSeletorUnico(spanB)).toContain("span:nth-of-type(2)");
  });
});
