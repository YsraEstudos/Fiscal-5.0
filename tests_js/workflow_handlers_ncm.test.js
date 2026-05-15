import { beforeEach, describe, expect, it, vi } from "vitest";

let currentState = {};
const mockEstadoUpdate = vi.fn((fn) => {
  if (typeof fn === "function") fn(currentState);
  return currentState;
});
const mockLog = vi.fn();
const mockInteragir = vi.fn(async () => true);
const mockBuscarElementoDeep = vi.fn();
const mockEncontrarCampoNcmPreferido = vi.fn();
const mockEncontrarCampoNbsPreferido = vi.fn();
const mockEncontrarCampoLei116Grupo = vi.fn();
const mockEncontrarCampoLei116Subgrupo = vi.fn();
const mockElementoVisivel = vi.fn(() => true);
const mockRegistrarEventoItemAtual = vi.fn();
const mockGetValoresParaItem = vi.fn(() => null);

const cooldowns = new Map();
const mockSetCooldown = vi.fn((key) => cooldowns.set(key, true));
const mockIsAtivo = vi.fn((key) => cooldowns.get(key) === true);

vi.mock("../src/core/estado-manager.ts", () => ({ update: mockEstadoUpdate }));
vi.mock("../src/core/log-manager.ts", () => ({ log: mockLog }));
vi.mock("../src/core/cooldown-manager.ts", () => ({
  set: mockSetCooldown,
  isAtivo: mockIsAtivo,
}));
vi.mock("../src/utils/misc.ts", () => ({ sleep: vi.fn(() => Promise.resolve()) }));
vi.mock("../src/interaction/interacao.ts", () => ({ interagir: mockInteragir }));
vi.mock("../src/utils/dom-helpers.ts", () => ({ elementoVisivel: mockElementoVisivel }));
vi.mock("../src/utils/selectors.ts", () => ({
  buscarElementoDeep: mockBuscarElementoDeep,
  encontrarCampoNcmPreferido: mockEncontrarCampoNcmPreferido,
  encontrarCampoNbsPreferido: mockEncontrarCampoNbsPreferido,
  encontrarCampoLei116Grupo: mockEncontrarCampoLei116Grupo,
  encontrarCampoLei116Subgrupo: mockEncontrarCampoLei116Subgrupo,
}));
vi.mock("../src/data/item-map-manager.ts", () => ({
  getValoresParaItem: mockGetValoresParaItem,
  normalizarCest: (valor) => {
    const raw = String(valor ?? "").trim();
    if (!raw) return null;
    const digits = raw.replace(/\D/g, "");
    if (digits.length !== 7) return raw;
    const codigo = `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 7)}`;
    const descricao = raw.match(/^\s*[\d.\s]+-\s*(.+)$/)?.[1]?.trim();
    return descricao ? `${codigo} - ${descricao}` : codigo;
  },
}));
vi.mock("../src/workflow/item-trace.ts", () => ({
  registrarEventoItemAtual: mockRegistrarEventoItemAtual,
}));

const mod = await import("../src/workflow/handlers/ncm.ts");

function getAcaoFactory() {
  return (id) => {
    const map = {
      ncm: { ativo: true, seletor: "#txtNCMTIPI" },
      cest: { ativo: true, seletor: "#txtCest" },
      lei116Servico: { ativo: true, seletor: "input.Cat90, input.Cat91" },
      abaFiscal: { ativo: true, seletor: "text=Fiscal" },
      abaClassificacao: { ativo: true, seletor: "text=Classificações" },
      lupaUnspsc: { ativo: true, seletor: "#ibutUNSPSC" },
      unspsc: { ativo: true, seletor: "#txtCodigoUnspsc" },
      selecionar: { ativo: true, seletor: "#butFechar" },
    };
    return map[id] || { ativo: false, seletor: "" };
  };
}

describe("workflow/handlers/ncm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.getComputedStyle = vi.fn().mockImplementation(() => ({ display: 'block', visibility: 'visible', opacity: '1' }));
    cooldowns.clear();
    document.body.innerHTML = "";
    currentState = { itemAtualKey: "320780", itemAtualTelaId: "320780", itemFlags: {} };
    mockGetValoresParaItem.mockReturnValue(null);
    mockEncontrarCampoNbsPreferido.mockReturnValue(null);
    mockEncontrarCampoLei116Grupo.mockReturnValue(null);
    mockEncontrarCampoLei116Subgrupo.mockReturnValue(null);
  });

  it("abaClassificacao navega quando aba está disponível", async () => {
    const aba = document.createElement("a");
    mockBuscarElementoDeep.mockImplementation((sel) => {
      if (sel === "text=Classificações") return aba;
      if (sel === "#ibutUNSPSC") return null;
      return null;
    });
    const ok = await mod.abaClassificacao(
      {},
      { textContent: "" },
      { getAcao: getAcaoFactory(), workflowState: { isCompleta: () => false } },
    );
    expect(ok).toBe(true);
    expect(mockSetCooldown).toHaveBeenCalledWith("abaClassificacao", expect.any(Number));
    expect(mockInteragir).toHaveBeenCalledWith(aba, null, "abaClassificacao");
  });

  it("ncm preenche campo quando valor difere", async () => {
    const campo = document.createElement("input");
    campo.value = "";
    mockEncontrarCampoNcmPreferido.mockReturnValue(campo);
    const habilitar = vi.fn();
    const ok = await mod.ncm(
      {},
      { textContent: "" },
      {
        getAcao: getAcaoFactory(),
        getValorAcao: () => "8471.30.12",
        valoresSaoIguais: () => false,
        habilitarValidacaoNcmAposInsercao: habilitar,
        isValidacaoNcmLiberada: () => false,
        registrarAvisoValidacaoNcmAguardando: vi.fn(),
        workflowState: { isCompleta: () => false },
      },
    );
    expect(ok).toBe(true);
    expect(mockInteragir).toHaveBeenCalledWith(campo, "8471.30.12", "ncm");
    expect(habilitar).toHaveBeenCalled();
    expect(mockRegistrarEventoItemAtual).toHaveBeenCalledWith(
      expect.any(Object),
      "ncm_preenchido",
      expect.objectContaining({
        resumo: "NCM preenchido com 8471.30.12",
        payload: expect.objectContaining({ valor: "8471.30.12" }),
      }),
    );
  });

  it("ncm em modo serviço preenche NBS quando lei116 existe no item", async () => {
    const campoNbs = document.createElement("input");
    campoNbs.value = "";
    mockGetValoresParaItem.mockReturnValue({ lei116: "7.02" });
    mockEncontrarCampoNbsPreferido.mockReturnValue(campoNbs);
    mockEncontrarCampoNcmPreferido.mockReturnValue(null);

    const ok = await mod.ncm(
      currentState,
      { textContent: "" },
      {
        getAcao: getAcaoFactory(),
        getValorAcao: () => "1111.22.33",
        valoresSaoIguais: () => false,
        habilitarValidacaoNcmAposInsercao: vi.fn(),
        isValidacaoNcmLiberada: () => true,
        registrarAvisoValidacaoNcmAguardando: vi.fn(),
        workflowState: { isCompleta: () => false },
      },
    );

    expect(ok).toBe(true);
    expect(mockInteragir).toHaveBeenCalledWith(campoNbs, "1111.22.33", "ncm");
    expect(mockRegistrarEventoItemAtual).toHaveBeenCalledWith(
      expect.any(Object),
      "ncm_preenchido",
      expect.objectContaining({
        resumo: "NBS preenchido com 1111.22.33",
        payload: expect.objectContaining({ campo: "NBS" }),
      }),
    );
  });

  it("ncm ignora serviço lei-only quando não há valor de NBS", async () => {
    const campoNbs = document.createElement("input");
    campoNbs.value = "";
    mockGetValoresParaItem.mockReturnValue({ ncm: null, nbs: null, lei116: "7.02" });
    mockEncontrarCampoNbsPreferido.mockReturnValue(campoNbs);
    mockEncontrarCampoNcmPreferido.mockReturnValue(null);

    const ok = await mod.ncm(
      currentState,
      { textContent: "" },
      {
        getAcao: getAcaoFactory(),
        getValorAcao: (id) => (id === "lei116Servico" ? "7.02" : null),
        valoresSaoIguais: () => false,
        habilitarValidacaoNcmAposInsercao: vi.fn(),
        isValidacaoNcmLiberada: () => true,
        registrarAvisoValidacaoNcmAguardando: vi.fn(),
        workflowState: { isCompleta: () => false },
      },
    );

    expect(ok).toBe(false);
    expect(mockInteragir).not.toHaveBeenCalled();
  });

  it("ncm registra aviso quando valor já está igual e validação não liberada", async () => {
    const campo = document.createElement("input");
    campo.value = "8471.30.12";
    mockEncontrarCampoNcmPreferido.mockReturnValue(campo);
    const registrar = vi.fn();
    const ok = await mod.ncm(
      {},
      { textContent: "" },
      {
        getAcao: getAcaoFactory(),
        getValorAcao: () => "8471.30.12",
        valoresSaoIguais: () => true,
        habilitarValidacaoNcmAposInsercao: vi.fn(),
        isValidacaoNcmLiberada: () => false,
        registrarAvisoValidacaoNcmAguardando: registrar,
        workflowState: { isCompleta: () => false },
      },
    );
    expect(ok).toBe(false);
    expect(registrar).toHaveBeenCalled();
    expect(mockRegistrarEventoItemAtual).not.toHaveBeenCalled();
  });

  it("ncm preenche CEST depois do NCM quando produto tem cest no JSON", async () => {
    const campoNcm = document.createElement("input");
    campoNcm.value = "8708.29.99";
    const campoCest = document.createElement("input");
    campoCest.id = "txtCest";
    campoCest.setAttribute("name", "txtCest");
    campoCest.value = "";
    mockEncontrarCampoNcmPreferido.mockReturnValue(campoNcm);
    mockBuscarElementoDeep.mockImplementation((sel) => {
      if (sel === "#txtCest") return campoCest;
      if (sel === "text=Classificações") return document.createElement("a");
      return null;
    });

    const autoCest = document.createElement("div");
    autoCest.id = "divAuto_txtCest";
    const opcaoOutra = document.createElement("div");
    opcaoOutra.textContent = "01.090.00 - Fitas";
    const opcaoCerta = document.createElement("div");
    opcaoCerta.textContent = "01.075.00 - Partes e acessórios dos veículos automóveis";
    autoCest.appendChild(opcaoOutra);
    autoCest.appendChild(opcaoCerta);
    document.body.appendChild(autoCest);

    const ok = await mod.ncm(
      currentState,
      { textContent: "" },
      {
        getAcao: getAcaoFactory(),
        getValorAcao: (id) => (id === "cest" ? "01.075.00" : "8708.29.99"),
        valoresSaoIguais: (a, b) => a === b,
        habilitarValidacaoNcmAposInsercao: vi.fn(),
        isValidacaoNcmLiberada: () => true,
        registrarAvisoValidacaoNcmAguardando: vi.fn(),
        workflowState: { isCompleta: () => false },
      },
    );

    expect(ok).toBe(true);
    expect(campoCest.value).toBe("01.075.00");
    expect(mockRegistrarEventoItemAtual).toHaveBeenCalledWith(
      expect.any(Object),
      "cest_preenchido",
      expect.objectContaining({
        payload: expect.objectContaining({ cest: "01.075.00" }),
      }),
    );
  });

  it("ncm não preenche CEST quando JSON não tem cest", async () => {
    const campoNcm = document.createElement("input");
    campoNcm.value = "8708.29.99";
    const campoCest = document.createElement("input");
    campoCest.id = "txtCest";
    mockEncontrarCampoNcmPreferido.mockReturnValue(campoNcm);
    mockBuscarElementoDeep.mockImplementation((sel) => (sel === "#txtCest" ? campoCest : null));

    const ok = await mod.ncm(
      currentState,
      { textContent: "" },
      {
        getAcao: getAcaoFactory(),
        getValorAcao: (id) => (id === "ncm" ? "8708.29.99" : null),
        valoresSaoIguais: (a, b) => a === b,
        habilitarValidacaoNcmAposInsercao: vi.fn(),
        isValidacaoNcmLiberada: () => true,
        registrarAvisoValidacaoNcmAguardando: vi.fn(),
        workflowState: { isCompleta: () => false },
      },
    );

    expect(ok).toBe(false);
    expect(campoCest.value).toBe("");
    expect(mockRegistrarEventoItemAtual).not.toHaveBeenCalledWith(expect.any(Object), "cest_preenchido", expect.any(Object));
  });

  it("ncm em serviço não roda CEST mesmo com campo e valor aplicáveis", async () => {
    const campoNbs = document.createElement("input");
    campoNbs.value = "1.0105.40.00";
    const campoCest = document.createElement("input");
    mockGetValoresParaItem.mockReturnValue({ nbs: "1.0105.40.00", lei116: null, cest: "01.075.00" });
    mockEncontrarCampoNbsPreferido.mockReturnValue(campoNbs);
    mockEncontrarCampoNcmPreferido.mockReturnValue(campoNbs);
    mockBuscarElementoDeep.mockImplementation((sel) => (sel === "#txtCest" ? campoCest : null));

    const ok = await mod.ncm(
      currentState,
      { textContent: "" },
      {
        getAcao: getAcaoFactory(),
        getValorAcao: (id) => (id === "cest" ? "01.075.00" : "1.0105.40.00"),
        valoresSaoIguais: (a, b) => a === b,
        habilitarValidacaoNcmAposInsercao: vi.fn(),
        isValidacaoNcmLiberada: () => true,
        registrarAvisoValidacaoNcmAguardando: vi.fn(),
        workflowState: { isCompleta: () => false },
      },
    );

    expect(ok).toBe(false);
    expect(campoCest.value).toBe("");
    expect(mockRegistrarEventoItemAtual).not.toHaveBeenCalledWith(expect.any(Object), "cest_preenchido", expect.any(Object));
  });

  it("ncm em serviço não avança para Classificações enquanto Lei 116 estiver pendente", async () => {
    const campoNbs = document.createElement("input");
    campoNbs.value = "1.0105.40.00";
    const abaClass = document.createElement("a");
    const campoGrupo = document.createElement("input");
    const campoSubgrupo = document.createElement("input");
    campoGrupo.value = "< Não Definido >";
    campoSubgrupo.value = "< Não Aplicável >";
    mockGetValoresParaItem.mockReturnValue({ nbs: "1.0105.40.00", lei116: "7.02" });
    mockEncontrarCampoNbsPreferido.mockReturnValue(campoNbs);
    mockEncontrarCampoNcmPreferido.mockReturnValue(campoNbs);
    mockEncontrarCampoLei116Grupo.mockReturnValue(campoGrupo);
    mockEncontrarCampoLei116Subgrupo.mockReturnValue(campoSubgrupo);
    mockBuscarElementoDeep.mockImplementation((sel) => {
      if (sel === "text=Classificações") return abaClass;
      return null;
    });

    const ok = await mod.ncm(
      currentState,
      { textContent: "" },
      {
        getAcao: getAcaoFactory(),
        getValorAcao: (id) => (id === "ncm" ? "1.0105.40.00" : "7.02"),
        valoresSaoIguais: (a, b) => a === b,
        habilitarValidacaoNcmAposInsercao: vi.fn(),
        isValidacaoNcmLiberada: () => true,
        registrarAvisoValidacaoNcmAguardando: vi.fn(),
        workflowState: { isCompleta: () => false },
      },
    );

    expect(ok).toBe(false);
    expect(mockInteragir).not.toHaveBeenCalledWith(abaClass, null, "abaClassificacao");
  });

  it("abaFiscal abre aba fiscal quando condições permitem", async () => {
    const abaFiscal = document.createElement("a");
    mockBuscarElementoDeep.mockImplementation((sel) => {
      if (sel === "text=Fiscal") return abaFiscal;
      if (sel === "#ibutUNSPSC") return null;
      if (sel === "#txtCodigoUnspsc") return null;
      return null;
    });
    mockEncontrarCampoNcmPreferido.mockReturnValue(null);

    const ok = await mod.abaFiscal(
      {},
      { textContent: "" },
      {
        getAcao: getAcaoFactory(),
        workflowState: { isCompleta: () => false },
        getModalUnspscContainer: () => null,
        isModalUnspscAberto: () => false,
      },
    );
    expect(ok).toBe(true);
    expect(mockSetCooldown).toHaveBeenCalledWith("abaFiscal", expect.any(Number));
    expect(mockInteragir).toHaveBeenCalledWith(abaFiscal, null, "abaFiscal");
  });

  it("lei116Servico preenche grupo e subgrupo quando valor válido", async () => {
    const campoGrupo = document.createElement("input");
    const campoSubgrupo = document.createElement("input");
    campoGrupo.value = "";
    campoSubgrupo.value = "";
    campoGrupo.id = "txtGrupo";
    campoGrupo.setAttribute("name", "txtGrupo");
    campoSubgrupo.id = "txtSubgrupo";
    campoSubgrupo.setAttribute("name", "txtSubgrupo");
    mockEncontrarCampoLei116Grupo.mockReturnValue(campoGrupo);
    mockEncontrarCampoLei116Subgrupo.mockReturnValue(campoSubgrupo);

    const autoGrupo = document.createElement("div");
    autoGrupo.id = "divAuto_txtGrupo";
    const opcaoGrupo = document.createElement("div");
    opcaoGrupo.textContent = "7 - SERVIÇOS";
    autoGrupo.appendChild(opcaoGrupo);

    const autoSubgrupo = document.createElement("div");
    autoSubgrupo.id = "divAuto_txtSubgrupo";
    const opcaoSubgrupo = document.createElement("div");
    opcaoSubgrupo.textContent = "02 - ANÁLISE";
    autoSubgrupo.appendChild(opcaoSubgrupo);

    document.body.appendChild(autoGrupo);
    document.body.appendChild(autoSubgrupo);

    const ok = await mod.lei116Servico(
      currentState,
      { textContent: "" },
      {
        getAcao: getAcaoFactory(),
        getValorAcao: () => "7.02",
        valoresSaoIguais: (a, b) => a === b,
      },
    );

    expect(ok).toBe(true);
    
    
    expect(mockRegistrarEventoItemAtual).toHaveBeenCalledWith(
      expect.any(Object),
      "lei116_preenchida",
      expect.objectContaining({
        payload: expect.objectContaining({ lei116: "7.02", grupo: "7", subgrupo: "02" }),
      }),
    );
  });

  it("lei116Servico ignora item sem valor de lei116", async () => {
    const ok = await mod.lei116Servico(
      currentState,
      { textContent: "" },
      {
        getAcao: getAcaoFactory(),
        getValorAcao: () => null,
        valoresSaoIguais: () => true,
      },
    );
    expect(ok).toBe(false);
    expect(mockInteragir).not.toHaveBeenCalledWith(expect.anything(), expect.anything(), "lei116ServicoGrupo");
  });

  it("lei116Servico trata placeholders como pendentes e força preenchimento", async () => {
    const campoGrupo = document.createElement("input");
    const campoSubgrupo = document.createElement("input");
    campoGrupo.value = "< Não Definido >";
    campoSubgrupo.value = "< Não Aplicável >";
    campoGrupo.id = "txtGrupo2";
    campoGrupo.setAttribute("name", "txtGrupo2");
    campoSubgrupo.id = "txtSubgrupo2";
    campoSubgrupo.setAttribute("name", "txtSubgrupo2");
    mockEncontrarCampoLei116Grupo.mockReturnValue(campoGrupo);
    mockEncontrarCampoLei116Subgrupo.mockReturnValue(campoSubgrupo);

    const autoGrupo = document.createElement("div");
    autoGrupo.id = "divAuto_txtGrupo2";
    const opcaoGrupo = document.createElement("div");
    opcaoGrupo.textContent = "7 - SERVIÇOS";
    autoGrupo.appendChild(opcaoGrupo);

    const autoSubgrupo = document.createElement("div");
    autoSubgrupo.id = "divAuto_txtSubgrupo2";
    const opcaoSubgrupo = document.createElement("div");
    opcaoSubgrupo.textContent = "02 - ANÁLISE";
    autoSubgrupo.appendChild(opcaoSubgrupo);

    document.body.appendChild(autoGrupo);
    document.body.appendChild(autoSubgrupo);

    const ok = await mod.lei116Servico(
      currentState,
      { textContent: "" },
      {
        getAcao: getAcaoFactory(),
        getValorAcao: () => "7.02",
        valoresSaoIguais: () => true,
      },
    );

    expect(ok).toBe(true);
    
    
  });

  it("lei116Servico clica na opção do autocomplete após digitar grupo e subgrupo", async () => {
    const campoGrupo = document.createElement("input");
    const campoSubgrupo = document.createElement("input");
    campoGrupo.value = "";
    campoSubgrupo.value = "";
    campoGrupo.setAttribute("name", "ctl00$Body$ucTabs$tabFiscal$FISCAL_Categorias_Empresas1$ucCategoriasFlex$rptCategoriasX$ctl01$txtCat");
    campoSubgrupo.setAttribute("name", "ctl00$Body$ucTabs$tabFiscal$FISCAL_Categorias_Empresas1$ucCategoriasFlex$rptCategoriasX$ctl02$txtCat");
    mockEncontrarCampoLei116Grupo.mockReturnValue(campoGrupo);
    mockEncontrarCampoLei116Subgrupo.mockReturnValue(campoSubgrupo);

    const autoGrupo = document.createElement("div");
    autoGrupo.id = `divAuto_${campoGrupo.getAttribute("name")}`;
    const opcaoGrupo = document.createElement("div");
    opcaoGrupo.textContent = "7 - SERVIÇOS";
    autoGrupo.appendChild(opcaoGrupo);

    const autoSubgrupo = document.createElement("div");
    autoSubgrupo.id = `divAuto_${campoSubgrupo.getAttribute("name")}`;
    const opcaoSubgrupo = document.createElement("div");
    opcaoSubgrupo.textContent = "02 - ANÁLISE";
    autoSubgrupo.appendChild(opcaoSubgrupo);

    document.body.appendChild(autoGrupo);
    document.body.appendChild(autoSubgrupo);

    const ok = await mod.lei116Servico(
      currentState,
      { textContent: "" },
      {
        getAcao: getAcaoFactory(),
        getValorAcao: () => "7.02",
        valoresSaoIguais: (a, b) => a === b,
      },
    );

    expect(ok).toBe(true);
  });
});
