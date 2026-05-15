import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIsBusy = vi.fn();
const mockBuscarElementoDeep = vi.fn();

vi.mock("../src/core/aspnet-lifecycle.ts", () => ({
  isBusy: mockIsBusy,
}));
vi.mock("../src/utils/selectors.ts", () => ({
  buscarElementoDeep: mockBuscarElementoDeep,
}));

const mod = await import("../src/workflow/pagina-verificador.ts");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const unspscInlineFixture = fs.readFileSync(
  path.join(__dirname, "fixtures", "unspsc_inline.html"),
  "utf8",
);

function makeVisible(el) {
  Object.defineProperty(el, "getBoundingClientRect", {
    value: () => ({ width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10 }),
    configurable: true,
  });
  el.style.display = "block";
  el.style.visibility = "visible";
  el.style.opacity = "1";
  return el;
}

describe("workflow/pagina-verificador", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mockIsBusy.mockReset();
    mockBuscarElementoDeep.mockReset();
    mockBuscarElementoDeep.mockImplementation((sel) => {
      for (const part of String(sel).split(",")) {
        const found = document.querySelector(part.trim());
        if (found) return found;
      }
      return null;
    });
    delete globalThis.Sys;
  });

  it("detecta mensagens NCM/NBS inválidas", () => {
    expect(mod.isMensagemNcmInvalido("NCM informado inválido")).toBe(true);
    expect(mod.isMensagemNbsInvalido("NBS informado inválido")).toBe(true);
    expect(mod.isMensagemSubGrupoInvalido("O valor do campo Sub Grupo 1 é inválido para esse item!")).toBe(true);
  });

  it("detectarAvisoCritico retorna tipo correto", () => {
    mockBuscarElementoDeep.mockImplementation((sel) => {
      if (sel === "#lblExecucoes") return null;
      return { value: "NCM informado inválido para item" };
    });
    const r = mod.detectarAvisoCritico();
    expect(r.tipo).toBe("ncm_invalido");
  });

  it("detectarAvisoCritico reconhece Sub Grupo inválido", () => {
    mockBuscarElementoDeep.mockImplementation((sel) => {
      if (sel === "#lblExecucoes") return null;
      return { value: "O valor do campo Sub Grupo 1 é inválido para esse item!" };
    });

    const r = mod.detectarAvisoCritico();

    expect(r.tipo).toBe("subgrupo_invalido");
  });

  it("detectarAvisoCritico pausa em reincidência a partir de 2 execuções", () => {
    const lbl = makeVisible(document.createElement("span"));
    lbl.id = "lblExecucoes";
    lbl.textContent = "Esta é a 2º vez que esta SIN passa por esta etapa";
    mockBuscarElementoDeep.mockImplementation((sel) => {
      if (sel === "#lblExecucoes") return lbl;
      return null;
    });

    const r = mod.detectarAvisoCritico();
    expect(r.tipo).toBe("reincidencia_etapa");
    expect(r.numeroExecucoes).toBe(2);
  });

  it("detectarAvisoCritico aceita contagens maiores e ignora label oculto", () => {
    const oculto = document.createElement("span");
    oculto.id = "lblExecucoes";
    oculto.textContent = "Esta é a 5º vez que esta SIN passa por esta etapa";
    mockBuscarElementoDeep.mockImplementation((sel) => {
      if (sel === "#lblExecucoes") return oculto;
      return null;
    });
    expect(mod.detectarAvisoCritico()).toBe(null);

    const visivel = makeVisible(document.createElement("span"));
    visivel.id = "lblExecucoes";
    visivel.textContent = "Esta é a 5º vez que esta SIN passa por esta etapa";
    mockBuscarElementoDeep.mockImplementation((sel) => {
      if (sel === "#lblExecucoes") return visivel;
      return null;
    });
    const r = mod.detectarAvisoCritico();
    expect(r.tipo).toBe("reincidencia_etapa");
    expect(r.numeroExecucoes).toBe(5);
  });

  it("verificarSessao detecta logout no body", () => {
    document.body.textContent = "Sua sessão expirou, faça login novamente";
    expect(mod.verificarSessao()).toBe(false);
  });

  it("paginaOcupada considera lifecycle busy e async postback", () => {
    mockIsBusy.mockReturnValue(true);
    expect(mod.paginaOcupada()).toEqual({ ocupado: true, motivo: "asp_lifecycle_busy" });

    mockIsBusy.mockReturnValue(false);
    globalThis.Sys = {
      WebForms: {
        PageRequestManager: {
          getInstance: () => ({ get_isInAsyncPostBack: () => true }),
        },
      },
    };
    expect(mod.paginaOcupada()).toEqual({ ocupado: true, motivo: "asp_async_postback" });
  });

  it("paginaOcupada detecta overlay visível", () => {
    const load = makeVisible(document.createElement("div"));
    load.className = "load";
    const overlay = makeVisible(document.createElement("div"));
    overlay.className = "overlay";
    load.appendChild(overlay);
    document.body.appendChild(load);
    mockIsBusy.mockReturnValue(false);
    expect(mod.paginaOcupada()).toEqual({ ocupado: true, motivo: "visual_overlay" });
  });

  it("obterConfirmacao detecta #butSimContinuar", () => {
    const btn = makeVisible(document.createElement("button"));
    btn.id = "butSimContinuar";
    mockBuscarElementoDeep.mockImplementation((sel) => {
      if (sel.includes("butSimContinuar")) return btn;
      return null;
    });
    const r = mod.obterConfirmacao();
    expect(r.modalAberto).toBe(true);
    expect(r.btnSimContinuar).toBe(btn);
  });

  it("isModalUnspscAberto considera campo e botão visíveis", () => {
    const campo = makeVisible(document.createElement("input"));
    const btn = makeVisible(document.createElement("button"));
    mockBuscarElementoDeep.mockImplementation((sel) => {
      if (sel === "#div1") return null;
      if (sel === "#tableUNSPSC") return null;
      if (sel === "#campo") return campo;
      if (sel === "#sel") return btn;
      return null;
    });
    expect(mod.isModalUnspscAberto("#campo", "#sel")).toBe(true);
  });

  it("detectarModoUnspsc identifica o fluxo inline real da tela", () => {
    document.body.innerHTML = unspscInlineFixture;
    for (const el of document.querySelectorAll("input")) makeVisible(el);
    expect(mod.detectarModoUnspsc("#txtCodUNSPSC", "#butFechar")).toBe("inline");
  });

  it("unspscDescricaoDefinida considera o readonly da tela inline", () => {
    document.body.innerHTML = unspscInlineFixture;
    const campoDescricao = document.getElementById("txtUNSPSC");
    expect(mod.unspscDescricaoDefinida()).toBe(false);

    campoDescricao.value = "Agulhas e componentes";
    expect(mod.unspscDescricaoDefinida()).toBe(true);
  });

  it("isItemEmAtuacao detecta por classe e por texto", () => {
    document.body.innerHTML = `
      <div class="result emAtuacao"><a id="a1">Item 1</a></div>
      <div class="result"><a id="a2">Item 2</a> Em atuação no fluxo</div>
    `;
    const a1 = document.getElementById("a1");
    const a2 = document.getElementById("a2");
    expect(mod.isItemEmAtuacao(a1)).toBe(true);
    expect(mod.isItemEmAtuacao(a2)).toBe(true);
  });

  it("isItemVermelho detecta item vermelho por classe e estilo", () => {
    document.body.innerHTML = `
      <div class="result danger"><a id="a1">Item 1</a></div>
      <div class="result" style="color: red"><a id="a2">Item 2</a></div>
    `;
    const a1 = document.getElementById("a1");
    const a2 = document.getElementById("a2");
    expect(mod.isItemVermelho(a1)).toBe(true);
    expect(mod.isItemVermelho(a2)).toBe(true);
  });

  it("encontrarItensPendentesInfo ignora itens em atuação e extrai item key", () => {
    document.body.innerHTML = `
      <div id="DIVResultado">
        <div class="result emAtuacao"><a id="x1" href="javascript:abreSIN('111',1)">x</a></div>
        <div class="result"><a id="x2" href="javascript:abreSIN('222',1)">y</a></div>
      </div>
    `;
    makeVisible(document.getElementById("x1"));
    makeVisible(document.getElementById("x2"));
    const info = mod.encontrarItensPendentesInfo();
    expect(info.ignorados).toBe(1);
    expect(info.elegiveis).toHaveLength(1);
    expect(info.inelegiveisConhecidos).toHaveLength(1);
    expect(info.desconhecidos).toHaveLength(0);
    expect(info.totalVisiveis).toBe(2);
    expect(mod.extrairItemKey(info.elegiveis[0])).toBe("222");
  });

  it("encontrarItensPendentesInfo ignora item marcado com skipNestaRodada", () => {
    document.body.innerHTML = `
      <div id="DIVResultado">
        <div class="result"><a id="x1" href="javascript:abreSIN('111',1)">x</a></div>
        <div class="result"><a id="x2" href="javascript:abreSIN('222',1)">y</a></div>
      </div>
    `;
    makeVisible(document.getElementById("x1"));
    makeVisible(document.getElementById("x2"));

    const info = mod.encontrarItensPendentesInfo({
      itemFlags: {
        111: { skipNestaRodada: true, skipMotivo: "problema_imagem" },
      },
    });

    expect(info.elegiveis).toHaveLength(1);
    expect(mod.extrairItemKey(info.elegiveis[0])).toBe("222");
    expect(info.inelegiveisConhecidos).toHaveLength(1);
  });

  it("encontrarBotaoProximo localiza o link Próximo", () => {
    document.body.innerHTML = `<a id="next" href="#">Próximo &gt;</a>`;
    makeVisible(document.getElementById("next"));
    expect(mod.encontrarBotaoProximo()).toBe(document.getElementById("next"));
  });

  it("detectarAvisoBloqueanteItem localiza problema visual com botão OK", () => {
    document.body.innerHTML = `
      <div class="modal" role="dialog">
        <p>Problema na imagem do item.</p>
        <button id="ok">OK</button>
      </div>
    `;
    makeVisible(document.querySelector(".modal"));
    makeVisible(document.getElementById("ok"));

    const aviso = mod.detectarAvisoBloqueanteItem();
    expect(aviso.tipo).toBe("problema_imagem");
    expect(aviso.btnOk).toBe(document.getElementById("ok"));
  });

  it("parseia texto de paginação com total do servidor", () => {
    const parsed = mod.parseTotalPendentesServidor("Exibindo SIN 1 a 16 de um total de 16");
    expect(parsed).toEqual({
      primeiro: 1,
      ultimo: 16,
      total: 16,
      texto: "Exibindo SIN 1 a 16 de um total de 16",
    });
  });

  it("parseia paginação com whitespace irregular", () => {
    const parsed = mod.parseTotalPendentesServidor("  Exibindo   SIN  1  a  2   de um total de   2  ");
    expect(parsed).toEqual({
      primeiro: 1,
      ultimo: 2,
      total: 2,
      texto: "Exibindo SIN 1 a 2 de um total de 2",
    });
  });

  it("obterResumoPendentesServidor localiza o total no DOM", () => {
    document.body.innerHTML = `
      <div id="lblPaginacao">Exibindo SIN 17 a 32 de um total de 64</div>
    `;
    const parsed = mod.obterResumoPendentesServidor();
    expect(parsed.total).toBe(64);
    expect(parsed.primeiro).toBe(17);
    expect(parsed.ultimo).toBe(32);
  });

  it("obterResumoPendentesServidor encontra o total em candidatos alternativos", () => {
    document.body.innerHTML = `
      <div class="grid-pager">
        <font color="white">Exibindo SIN <b>1</b> a <b>2</b> de um total de <b>2</b></font>
      </div>
    `;
    const parsed = mod.obterResumoPendentesServidor();
    expect(parsed).toEqual({
      primeiro: 1,
      ultimo: 2,
      total: 2,
      texto: "Exibindo SIN 1 a 2 de um total de 2",
    });
  });

  it("obterResumoPendentesServidor retorna nulo quando a paginação não existe", () => {
    document.body.innerHTML = `<div id="DIVResultado">Sem paginação disponível</div>`;
    expect(mod.obterResumoPendentesServidor()).toBe(null);
  });
});
