import { describe, expect, it } from "vitest";
import { docFromFixture, loadFixture } from "./helpers/fixture-loader.js";
import {
  classificarMidia,
  detectarErroHtmlMidia,
  encontrarAbaMidia,
  extrairCategoriasMidia,
  extrairItensMidiaDoDocumento,
  extrairQtdMidiaDoTexto,
  extrairUrlOpenGenerica,
  extrairViewState,
  isLinkAcaoInvalida,
  montarUrlsMidiaCandidatas,
} from "../src/reporting/parsers/midia-parser.ts";
import {
  detectarMencoesNcmEvento,
  parseHistorico,
} from "../src/reporting/parsers/historico-parser.ts";

function resumirTipos(itens) {
  return {
    imagens: itens.filter((x) => x.tipo === "imagem").length,
    pdfs: itens.filter((x) => x.tipo === "pdf").length,
    files: itens.filter((x) => x.tipo === "file").length,
    unsupported: itens.filter((x) => x.tipo === "unsupported").length,
  };
}

describe("parser de mídia", () => {
  it("detecta sem mídia quando contador é zero", () => {
    expect(extrairQtdMidiaDoTexto(loadFixture("midia_zero.html"))).toBe(0);
  });

  it("classifica imagem/pdf e ignora links de ação", () => {
    const doc = docFromFixture("midia_mista.html");
    const itens = extrairItensMidiaDoDocumento(doc, "https://example.com/Midia.aspx");
    const t = resumirTipos(itens);
    expect(t.imagens).toBe(1);
    expect(t.pdfs).toBe(1);
    expect(t.files).toBe(1);
    expect(t.unsupported).toBe(0);
  });

  it("extrai mídia de HTML estilo Klassmatt (data-image + galeria)", () => {
    const doc = docFromFixture("midia_klassmatt.html");
    const itens = extrairItensMidiaDoDocumento(doc, "https://example.com/Midia.aspx");
    const t = resumirTipos(itens);
    expect(t.imagens).toBeGreaterThanOrEqual(1);
    expect(t.pdfs).toBe(1);
  });

  it("classifica PDF via handler GetTempFile.ashx", () => {
    const doc = docFromFixture("midia_handler.html");
    const itens = extrairItensMidiaDoDocumento(doc, "https://example.com/Midia.aspx");
    const t = resumirTipos(itens);
    expect(t.imagens).toBe(1);
    expect(t.pdfs).toBe(1);
  });

  it("classifica PDF via query file em .ashx mesmo sem title", () => {
    const out = classificarMidia(
      "https://x/GetTempFile.ashx?path=banco_imagens&file=DOC1.pdf",
      "",
    );
    expect(out.tipo).toBe("pdf");
  });

  it("detecta páginas de erro e acesso negado de Midia.aspx", () => {
    const erroDoc = docFromFixture("midia_erro_aspx.html");
    const acessoDoc = docFromFixture("midia_acesso_negado.html");

    expect(
      detectarErroHtmlMidia(erroDoc, erroDoc.body.textContent, "https://x/Erro.aspx"),
    ).toMatch(/erro/i);

    expect(
      detectarErroHtmlMidia(acessoDoc, acessoDoc.body.textContent, "https://x/Midia.aspx"),
    ).toMatch(/acesso não autorizado/i);
  });

  it("classificarMidia detecta pdf pelo title mesmo sem extensão", () => {
    const out = classificarMidia("https://x/arquivo?id=1", "Documento PDF");
    expect(out.tipo).toBe("pdf");
  });

  it("classificarMidia cobre arquivos office, extensões desconhecidas e unsupported", () => {
    expect(classificarMidia("https://x/planilha.xlsx", "").tipo).toBe("file");
    expect(classificarMidia("https://x/binario.xyz", "").tipo).toBe("file");
    expect(classificarMidia("https://x/sem-extensao", "foto interna").tipo).toBe("unsupported");
    expect(classificarMidia("https://x/sem-extensao", "").tipo).toBe("unsupported");
  });

  it("extrairUrlOpenGenerica detecta funções open/abre", () => {
    const a = extrairUrlOpenGenerica("javascript:OpenNewTab('/Midia.aspx?id=10')", ["OpenNewTab"]);
    const b = extrairUrlOpenGenerica("javascript:abrePDF('/GetTempFile.ashx?file=doc.pdf')");
    expect(a).toContain("Midia.aspx?id=10");
    expect(b).toContain("GetTempFile.ashx");
  });

  it("isLinkAcaoInvalida rejeita links de ação e aceita links úteis", () => {
    expect(isLinkAcaoInvalida("", "", "")).toBe(true);
    expect(isLinkAcaoInvalida("#", "", "")).toBe(true);
    expect(isLinkAcaoInvalida("javascript:void(0)", "", "")).toBe(true);
    expect(isLinkAcaoInvalida("javascript:__doPostBack('ctl00$Body$dlMidias','')", "Editar", "")).toBe(true);
    expect(
      isLinkAcaoInvalida("javascript:OpenNewTab('/Midia.aspx?id=10')", "PDF técnico", ""),
    ).toBe(false);
    expect(
      isLinkAcaoInvalida("javascript:__doPostBack('dlMidias','Fotos')", "Fotos", "Fotos"),
    ).toBe(true);
  });

  it("encontrarAbaMidia seleciona link por itemKey e monta url candidata", () => {
    document.body.innerHTML = `
      <div id="dlTab">
        <a href="javascript:OpenNewTab('/Midia.aspx?tipo=Itens&id=111')">Mídias (1)</a>
        <a href="javascript:OpenNewTab('/Midia.aspx?tipo=Itens&id=222')">Mídias (2)</a>
      </div>
    `;
    const aba = encontrarAbaMidia("222");
    expect(aba).toBeTruthy();
    expect(aba.textContent).toContain("(2)");
    expect(montarUrlsMidiaCandidatas("https://x/Midia.aspx?id=222")).toEqual([
      "https://x/Midia.aspx?id=222",
    ]);
  });

  it("encontrarAbaMidia faz fallback para o primeiro link quando não encontra item exato", () => {
    document.body.innerHTML = `
      <div id="dlTab">
        <a href="javascript:OpenNewTab('/Midia.aspx?tipo=Itens&id=111')">Mídias (4)</a>
        <a href="javascript:OpenNewTab('/Midia.aspx?tipo=Itens&id=222')">Mídias (1)</a>
      </div>
    `;
    const aba = encontrarAbaMidia("999");
    expect(aba).toBeTruthy();
    expect(aba.textContent).toContain("(4)");
  });

  it("extrai categorias de mídia via link e postback, ignorando duplicatas e ações", () => {
    const doc = new DOMParser().parseFromString(
      `
        <div id="dlMidias">
          <a href="javascript:__doPostBack('ctl00$Body$dlMidias','Fotos')">Fotos</a>
          <a href="javascript:__doPostBack('ctl00$Body$dlMidias','Fotos')">Fotos</a>
          <a href="/Midia.aspx?tipo=Itens&id=10&cat=pdf">PDF</a>
          <a href="/Midia.aspx?tipo=Itens&id=10&cat=pdf">PDF</a>
          <a href="/Midia.aspx?tipo=Itens&id=10&cat=edit">Editar</a>
        </div>
      `,
      "text/html",
    );
    const categorias = extrairCategoriasMidia(doc, "https://example.com/Midia.aspx?tipo=Itens&id=10");
    expect(categorias).toEqual([
      {
        label: "Fotos",
        type: "postback",
        target: "ctl00$Body$dlMidias",
        argument: "Fotos",
        url: null,
      },
      {
        label: "PDF",
        type: "link",
        url: "https://example.com/Midia.aspx?tipo=Itens&id=10&cat=pdf",
        target: null,
        argument: null,
      },
    ]);
  });

  it("extrai viewstate e eventvalidation do documento", () => {
    const doc = new DOMParser().parseFromString(
      `
        <form>
          <input id="__VIEWSTATE" value="vs-123" />
          <input name="__VIEWSTATEGENERATOR" value="gen-456" />
          <input id="__EVENTVALIDATION" value="ev-789" />
        </form>
      `,
      "text/html",
    );
    expect(extrairViewState(doc)).toEqual({
      __VIEWSTATE: "vs-123",
      __VIEWSTATEGENERATOR: "gen-456",
      __EVENTVALIDATION: "ev-789",
    });
  });

  it("extrai mídias em fallback do body com deduplicação", () => {
    const doc = new DOMParser().parseFromString(
      `
        <body>
          <a href="/GetTempFile.ashx?file=manual.pdf" title="Manual PDF">Manual</a>
          <a href="/GetTempFile.ashx?file=manual.pdf" title="Manual PDF">Manual duplicado</a>
          <a data-image="/img/foto1.jpg" title="Foto do item"></a>
          <img src="/img/foto1.jpg" alt="Foto do item" />
        </body>
      `,
      "text/html",
    );
    const itens = extrairItensMidiaDoDocumento(doc, "https://example.com/Midia.aspx");
    const urls = itens.map((item) => item.url);
    expect(urls).toContain("https://example.com/GetTempFile.ashx?file=manual.pdf");
    expect(urls).toContain("https://example.com/img/foto1.jpg");
    expect(new Set(urls).size).toBe(urls.length);
  });
});

describe("parser de histórico", () => {
  it("regra fiscal não crítica quando <= 2", () => {
    const doc = docFromFixture("historico_fiscal_ok.html");
    const parsed = parseHistorico(doc);
    expect(parsed.summary.fiscalTransitionsCount).toBe(1);
    expect(parsed.summary.criticalFiscalRework).toBe(false);
  });

  it("regra fiscal crítica quando > 2 e comentário amarelo", () => {
    const doc = docFromFixture("historico_fiscal_critico.html");
    const parsed = parseHistorico(doc);
    expect(parsed.summary.fiscalTransitionsCount).toBe(3);
    expect(parsed.summary.criticalFiscalRework).toBe(true);
    expect(
      parsed.summary.importantSignals.some((s) => /usar pdm/i.test(String(s.comentario || ""))),
    ).toBe(true);
  });

  it("funciona em layout Rodonaves simples (fallback loose)", () => {
    const doc = docFromFixture("historico_rodonaves_plain.html");
    const parsed = parseHistorico(doc);
    expect(parsed.summary.totalTransicoes).toBe(3);
    expect(parsed.summary.fiscalTransitionsCount).toBe(1);
  });

  it("não fragmenta evento multiline com [DT]", () => {
    const doc = docFromFixture("historico_loose_multiline.html");
    const parsed = parseHistorico(doc);
    expect(parsed.summary.totalTransicoes).toBe(2);
    expect(parsed.summary.criticalFiscalRework).toBe(false);
  });

  it("processa fixture com acentuação e mantém transições", () => {
    const doc = docFromFixture("historico_charset_windows1252.html");
    const parsed = parseHistorico(doc);
    expect(parsed.summary.totalTransicoes).toBe(2);
    expect(parsed.summary.fiscalTransitionsCount).toBe(1);
  });

  it("detectarMencoesNcmEvento reconhece códigos formatados e não formatados", () => {
    const a = detectarMencoesNcmEvento("NCM 3926.90.40 ajustado");
    expect(a.formattedCodes).toContain("3926.90.40");
    const b = detectarMencoesNcmEvento("Código NCM 39269040 atualizado");
    expect(b.unformattedCodes).toContain("3926.90.40");
  });
});
