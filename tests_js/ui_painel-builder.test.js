import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetEstado = vi.fn();
const mockGetAcoesOrdenadas = vi.fn();
const mockObterResumoUI = vi.fn();
const mockObterResumoTrilhaUI = vi.fn();

vi.mock("../src/core/estado-manager.ts", () => ({
  get: mockGetEstado,
}));

vi.mock("../src/workflow/executor.ts", () => ({
  getAcoesOrdenadas: mockGetAcoesOrdenadas,
}));

vi.mock("../src/workflow/estimativa.ts", () => ({
  obterResumoUI: mockObterResumoUI,
}));

vi.mock("../src/workflow/item-trace.ts", () => ({
  obterResumoTrilhaUI: mockObterResumoTrilhaUI,
}));

vi.mock("../src/utils/misc.ts", async () => {
    const actual = await vi.importActual("../src/utils/misc.ts");
    return {
        ...actual,
        escapeHtml: vi.fn((str) => String(str || "")),
    }
});

const mod = await import("../src/ui/painel-builder.ts");

describe("ui/painel-builder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    
    mockGetEstado.mockReturnValue({
        ativo: false,
        pausado: false,
        modoSimulacao: false,
        fiscalHintsAtivo: true,
        fiscalHintsJson: "",
        fiscalHints: {},
        acoes: {}
    });
    mockGetAcoesOrdenadas.mockReturnValue([]);
    mockObterResumoUI.mockReturnValue({
        resumo: "MockResumo",
        primeiroItemTexto: "Item#1",
        tempoBaseTexto: "1.0s",
        etaRestanteTexto: "0s",
        previsaoTexto: "Agendar"
    });
    mockObterResumoTrilhaUI.mockReturnValue({
        empty: true,
        currentLabel: "Nenhum",
        events: []
    });
  });

  it("injetarEstilos insere o estilo na head", () => {
    mod.injetarEstilos();
    const style = document.getElementById("fiscal-pro-styles");
    expect(style).not.toBeNull();
    expect(style.textContent).toContain("#painel-robo-pro");

    // Deve ser idempotente
    mod.injetarEstilos();
    expect(document.querySelectorAll("#fiscal-pro-styles").length).toBe(1);
  });

  it("getPainelEl retorna o elemento do painel quando presente", () => {
    const div = document.createElement("div");
    div.id = "painel-robo-pro";
    document.body.appendChild(div);

    expect(mod.getPainelEl()).toBe(div);
  });

  it("construirPainel monta a estrutura com base no estado", () => {
    const painel = mod.construirPainel(true);
    // painel minimizado
    expect(painel.id).toBe("painel-robo-pro");
    expect(painel.classList.contains("is-collapsed")).toBe(true);
    expect(painel.innerHTML).toContain("FISCAL 5.0");
    expect(painel.innerHTML).toContain("Resumo da execução");
    expect(painel.innerHTML).toContain("Dicas fiscais");
    expect(painel.innerHTML).toContain('btnFiscalHintsGerenciar');
    expect(painel.innerHTML).toContain('chkPausarAcompanhamento');
    expect(painel.innerHTML).toContain('tempoDesativacaoChecksMinutos');
    expect(painel.querySelector('#tempoDesativacaoChecksMinutos').value).toBe('10');
    expect(painel.innerHTML).not.toContain('fiscalHintsLista');
    expect(painel.innerHTML).not.toContain('km-fiscal-hint-row');
  });

  it("construirListaAcoes constrói a lista baseada nas acoesOrdenadas", () => {
    const listaWrapper = document.createElement("div");
    listaWrapper.id = "lista-acoes";
    document.body.appendChild(listaWrapper);

    mockGetAcoesOrdenadas.mockReturnValue([
        { id: "acao1", nome: "Ação Um", tipo: "normal", seletor: "#btn1" },
        { id: "acao2", nome: "Ação Dois", tipo: "input", seletor: "#inp1" },
        { id: "acaoExtra", nome: "Interna", tipo: "custom", seletor: "" }
    ]);
    mockGetEstado.mockReturnValue({
        acoes: {
            "acao1": { ativo: true },
            "acao2": { ativo: false, valor: "teste" }
        }
    });

    mod.construirListaAcoes(mockGetEstado());
    
    const items = listaWrapper.querySelectorAll(".acao-item");
    expect(items.length).toBe(3);
    
    expect(items[0].innerHTML).toContain("checked");
    expect(items[0].innerHTML).toContain("Ação Um");
    expect(items[0].querySelector(".btn-inspecao")).not.toBeNull();

    expect(items[1].querySelector("input[type='text']").value).toBe("teste");
    
    // Ação custom vem sem botões interativos
    expect(items[2].querySelectorAll("button[disabled]").length).toBe(2);
  });

  it("desativa as ações de UNSPSC para empresas que não exigem esse campo", () => {
    document.body.innerHTML = `
      <span id="lblUsuario">USUARIO//INTERCEMENT</span>
      <div id="lista-acoes"></div>
    `;

    const idsUnspsc = ["abaClassificacao", "lupaUnspsc", "unspsc", "pesquisar", "resultado", "selecionar"];
    mockGetAcoesOrdenadas.mockReturnValue(idsUnspsc.map((id) => ({
      id,
      nome: id,
      tipo: id === "unspsc" ? "input" : "click",
      seletor: `#${id}`,
    })));
    mockGetEstado.mockReturnValue({
      acoes: Object.fromEntries(idsUnspsc.map((id) => [id, { ativo: true, valor: "30103618" }])),
    });

    mod.construirListaAcoes(mockGetEstado());

    const items = [...document.querySelectorAll(".acao-item")];
    expect(items).toHaveLength(idsUnspsc.length);
    items.forEach((item) => {
      const checkbox = item.querySelector("input[type='checkbox']");
      expect(checkbox.checked).toBe(false);
      expect(checkbox.disabled).toBe(true);
      expect(item.classList.contains("acao-item--desabilitado")).toBe(true);
      expect(item.textContent).toContain("não se aplica");
    });
  });
});
