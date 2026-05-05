import { beforeEach, describe, expect, it, vi } from "vitest";

let helpers: typeof import("../src/utils/dom-helpers.ts") | any;

function setVisibleRect(element: HTMLElement, width = 120, height = 32) {
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

describe("utils/dom-helpers", () => {
  beforeEach(async () => {
    vi.resetModules();
    helpers = await import("../src/utils/dom-helpers.ts");
  });

  it("cacheia a lista de iframes dentro do TTL", () => {
    document.body.innerHTML = "<iframe></iframe><iframe></iframe>";
    const spy = vi.spyOn(document, "querySelectorAll");

    const first = helpers.getIframesCached(1000);
    const second = helpers.getIframesCached(1000);

    expect(first).toHaveLength(2);
    expect(second).toHaveLength(2);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("detecta visibilidade com style e dimensões", () => {
    const visivel = setVisibleRect(document.createElement("div"));
    document.body.appendChild(visivel);

    const oculto = setVisibleRect(document.createElement("div"));
    oculto.style.display = "none";
    document.body.appendChild(oculto);

    const transparente = setVisibleRect(document.createElement("div"));
    transparente.style.opacity = "0";
    document.body.appendChild(transparente);

    const semDimensao = setVisibleRect(document.createElement("div"), 0, 0);
    document.body.appendChild(semDimensao);

    expect(helpers.elementoVisivel(visivel)).toBe(true);
    expect(helpers.elementoVisivel(oculto)).toBe(false);
    expect(helpers.elementoVisivel(transparente)).toBe(false);
    expect(helpers.elementoVisivel(semDimensao)).toBe(false);
  });

  it("verificarElemento usa querySelector e visibilidade", () => {
    const el = setVisibleRect(document.createElement("button"));
    el.id = "executar";
    document.body.appendChild(el);

    expect(helpers.verificarElemento("#executar")).toBe(true);
    expect(helpers.verificarElemento("#inexistente")).toBe(null);
  });

  it("lê value para inputs e textContent para outros nós", () => {
    const input = document.createElement("input");
    input.value = "8471.30.12";

    const div = document.createElement("div");
    div.textContent = "Classificações";

    expect(helpers.getTextoElemento(input)).toBe("8471.30.12");
    expect(helpers.getTextoElemento(div)).toBe("Classificações");
    expect(helpers.getTextoElemento(null)).toBe("");
  });

  it("itera no document principal e em iframes acessíveis", () => {
    const iframeDoc = document.implementation.createHTMLDocument("iframe");
    const iframeOk = document.createElement("iframe");
    Object.defineProperty(iframeOk, "contentDocument", {
      value: iframeDoc,
      configurable: true,
    });

    const iframeErro = document.createElement("iframe");
    Object.defineProperty(iframeErro, "contentDocument", {
      get() {
        throw new Error("cross-origin");
      },
      configurable: true,
    });

    document.body.append(iframeOk, iframeErro);
    const vistos: Document[] = [];

    helpers.forEachDoc((doc: Document) => vistos.push(doc));

    expect(vistos).toContain(document);
    expect(vistos).toContain(iframeDoc);
    expect(vistos).toHaveLength(2);
  });

  it("filtra por texto ignorando invisíveis e priorizando match exato", () => {
    const parcial = setVisibleRect(document.createElement("button"));
    parcial.textContent = "Salvar agora";

    const exato = setVisibleRect(document.createElement("button"));
    exato.textContent = "Salvar";

    const oculto = setVisibleRect(document.createElement("button"));
    oculto.textContent = "Salvar";
    oculto.style.display = "none";

    const filtrados = helpers.filtrarPorTexto([parcial, exato, oculto], "Salvar");

    expect(filtrados).toEqual([exato, parcial]);
  });
});

