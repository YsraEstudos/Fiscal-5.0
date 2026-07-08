// ==UserScript==
// @name         FISCAL 5.0 (Robust Robot)
// @namespace    http://tampermonkey.net/
// @version      5.1.0
// @author       System Admin
// @description  Automação modular FISCAL 5.0 com controle individual de ações, inspeção de elementos, perfis e seletor robusto (ID + Texto).
// @downloadURL  https://raw.githubusercontent.com/YsraEstudos/Fiscal-5.0/main/dist/FISCAL-5.0.user.js
// @updateURL    https://raw.githubusercontent.com/YsraEstudos/Fiscal-5.0/main/dist/FISCAL-5.0.user.js
// @match        https://*.klassmatt.com.br/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
  'use strict';

  function enableTrustedTypesBypass() {
    var _a;
    try {
      if ((_a = window.trustedTypes) == null ? void 0 : _a.createPolicy) {
        if (!window.trustedTypes.defaultPolicy) {
          window.trustedTypes.createPolicy("default", {
            createHTML: (s) => s,
            createScript: (s) => s,
            createScriptURL: (s) => s
          });
        }
      }
    } catch (e) {
      console.warn("[KM] TrustedTypes policy não pôde ser criada:", e);
    }
  }
  const CONFIG = Object.freeze({
    SCHEMA_VERSION: 11,
    LOG_MAX_ENTRIES: 100,
    STORAGE_KEY: "km_robo_state",
    RETRY: Object.freeze({
      MAX_TENTATIVAS: 3,
      DELAY_BASE: 500,
      MULTIPLICADOR: 2
    }),
    DELAYS: Object.freeze({
      UNSPSC_MODAL: 3e3,
      LUPA_COOLDOWN: 5e3,
      ABA_CLASSIFICACAO_COOLDOWN: 4e3,
      RESULTADOS_TIMEOUT: 8e3,
      RESULTADO_COOLDOWN: 3e3,
      POS_SELECIONAR_COOLDOWN: 4e3,
      SELECIONAR_ITEM_COOLDOWN: 5e3,
      NCM_VALIDACAO_JANELA: 15e3,
      TYPING_MIN: 30,
      TYPING_MAX: 90,
      ESTABILIDADE: 250
    }),
    VALIDADORES: Object.freeze({
      ncm: { regex: /^\d{4}\.\d{2}\.\d{2}$/, mensagem: "NCM deve ter formato 0000.00.00" },
      nbs: { regex: /^\d{1,2}\.\d{4}\.\d{2}\.\d{2}$/, mensagem: "NBS deve ter formato 0.0000.00.00 ou 00.0000.00.00" },
      cest: { regex: /^(?:\d{7}|\d{2}\.\d{3}\.\d{2})(?:\s+-\s+.+)?$/, mensagem: "CEST deve ter formato 00.000.00" },
      unspsc: { regex: /^\d{8}$/, mensagem: "UNSPSC deve ter 8 dígitos numéricos" },
      lei116Servico: { regex: /^\d{1,2}\.\d{2}$/, mensagem: "Lei 116 deve ter formato 0.00 ou 00.00" }
    }),
    MENSAGENS: Object.freeze({
      SUCESSO: ["Salvo com sucesso", "Operação realizada", "Registro atualizado", "Item processado"],
      ERRO: ["Erro", "Falha", "Não foi possível", "Inválido"],
      LOGOUT: ["sessão expirou", "faça login novamente", "session expired"]
    }),
    SONS: Object.freeze({
      success: [523.25, 659.25, 783.99],
      error: [349.23, 293.66],
      warning: [440],
      complete: [523.25, 659.25, 783.99, 1046.5]
    }),
    REPORTING: Object.freeze({
      SERVICE_DEFAULT: "http://127.0.0.1:8765",
      SERVICE_TIMEOUT_MS: 12e4,
      FETCH_TIMEOUT_MS: 3e4,
      RETRY_ATTEMPTS: 3,
      RETRY_BASE_DELAY_MS: 600,
      RETRY_JITTER_MS: 300,
      MAX_MEDIA_DOWNLOADS: 20,
      MAX_FILE_SIZE_MB: 25,
      MAX_FILES_PER_ITEM: 20,
      IMPORTANT_YELLOW_KEYWORDS: Object.freeze([
        "usar",
        "urgente",
        "criar codigo",
        "atributo",
        "pdm",
        "corrigir",
        "ajustar",
        "fiscal",
        "integra",
        "klassmatt"
      ]),
      ALTERACAO_CAMPOS_CHAVE: Object.freeze([
        "NCM",
        "NBS",
        "UNSPSC",
        "TIPO BRINDE",
        "GRUPO DE MATERIAIS",
        "LINHA PRODUTO",
        "TIPO DE MATERIAL",
        "MATERIAL",
        "COR",
        "DADOS COMPLEMENTARES",
        "DESCRICAO",
        "DESCRIÇÃO"
      ])
    })
  });
  const REPORTING_DEFAULTS = Object.freeze({
    enabledReport: false,
    enabledMedia: false,
    clickMediaTabBeforeCollect: false,
    enabledAcompanhamento: false,
    blockOnReportError: false,
    serviceUrl: CONFIG.REPORTING.SERVICE_DEFAULT,
    apiToken: "km-local-token",
    transport: "auto",
    maxFileSizeMb: CONFIG.REPORTING.MAX_FILE_SIZE_MB,
    maxFilesPerItem: CONFIG.REPORTING.MAX_FILES_PER_ITEM,
    sessionRunId: null,
    ocrEnabled: true,
    ocrEngine: "tesseract"
  });
  const REPORTING_ERROR_CODES = Object.freeze({
    MEDIA_PARSE_ERROR: "MEDIA_PARSE_ERROR",
    HISTORICO_PARSE_ERROR: "HISTORICO_PARSE_ERROR",
    SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
    UPLOAD_LIMIT_EXCEEDED: "UPLOAD_LIMIT_EXCEEDED",
    SERVICE_AUTH_MISSING: "SERVICE_AUTH_MISSING"
  });
  function cssEscape(s) {
    var _a;
    const str = String(s ?? "");
    if ((_a = window.CSS) == null ? void 0 : _a.escape) return window.CSS.escape(str);
    return str.replace(/[^a-zA-Z0-9_-]/g, (m) => `\\${m}`);
  }
  function clone(obj) {
    if (typeof structuredClone === "function") {
      try {
        return structuredClone(obj);
      } catch {
      }
    }
    return JSON.parse(JSON.stringify(obj));
  }
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function isTestMode() {
    return !!globalThis.__KM_TEST_MODE__;
  }
  function debounce(fn, delay) {
    let timeoutId;
    return function(...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
  }
  function absolutizarUrl(url) {
    try {
      return new URL(String(url ?? ""), window.location.href).toString();
    } catch {
      return null;
    }
  }
  function extrairUrlDaFuncaoJs(href, nomesFuncoes = []) {
    const raw = String(href ?? "");
    if (!raw) return null;
    const nomes = Array.isArray(nomesFuncoes) ? nomesFuncoes : [nomesFuncoes];
    for (const nome of nomes) {
      if (!nome) continue;
      const rx = new RegExp(`${nome}\\s*\\(\\s*['"]([^'"]+)['"]`, "i");
      const m = raw.match(rx);
      if (m == null ? void 0 : m[1]) return absolutizarUrl(m[1]);
    }
    return null;
  }
  function slugifyArquivo(nome, fallback = "arquivo") {
    const base = String(nome ?? "").trim() || fallback;
    const limpo = base.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
    return limpo || fallback;
  }
  function hashTexto(texto) {
    const raw = String(texto ?? "");
    let h = 2166136261;
    for (let i = 0; i < raw.length; i++) {
      h ^= raw.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }
  function valoresSaoIguais(valorCampo, valorAlvo) {
    if (!valorCampo || !valorAlvo) return valorCampo == valorAlvo;
    const v1 = String(valorCampo).trim();
    const v2 = String(valorAlvo).trim();
    return v1 === v2;
  }
  let context = null;
  function inicializar$1() {
    if (isTestMode()) return false;
    if (context) return true;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      context = new Ctx();
      return true;
    } catch (e) {
      console.warn("[KM] Audio API não disponível:", e);
      return false;
    }
  }
  function tocar(tipo = "success") {
    if (isTestMode()) return;
    if (!context && !inicializar$1()) return;
    if (!context) return;
    if (context.state === "suspended") void context.resume();
    const notas = CONFIG.SONS[tipo] ?? CONFIG.SONS.success;
    const duracao = 0.15;
    notas.forEach((freq, i) => {
      if (!context) return;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.connect(gain);
      gain.connect(context.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      const startTime = context.currentTime + i * duracao;
      osc.start(startTime);
      osc.stop(startTime + duracao);
      gain.gain.setValueAtTime(0.3, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + duracao);
    });
  }
  function fechar() {
    if (isTestMode()) return;
    if (context) {
      void context.close();
      context = null;
    }
  }
  const MAX_STRING_LENGTH = 300;
  const CRITICAL_EVENT_TYPES = /* @__PURE__ */ new Set([
    "pausado_por_reincidencia",
    "pausado_por_validacao_ncm",
    "pausado_por_validacao_nbs"
  ]);
  const EVENT_LABELS = Object.freeze({
    item_aberto: "Item aberto para processamento",
    item_sem_json: "Item ignorado por falta de JSON",
    ncm_preenchido: "NCM preenchido",
    cest_preenchido: "CEST preenchido",
    lei116_preenchida: "Lei 116 preenchida",
    unspsc_preenchido: "UNSPSC digitado",
    unspsc_pesquisado: "Pesquisa de UNSPSC executada",
    unspsc_selecionado: "UNSPSC selecionado",
    midia_coletada: "Coleta de mídia",
    acompanhamento_coletado: "Acompanhamento coletado",
    relatorio_enviado: "Relatório enviado com sucesso",
    item_concluido: "Item concluído",
    item_pulado_na_rodada: "Item pulado nesta rodada",
    pausado_por_reincidencia: "Pausado por reincidência da etapa",
    pausado_por_validacao_ncm: "Pausado por NCM inválido",
    pausado_por_validacao_nbs: "Pausado por NBS inválido"
  });
  const TRILHA_EXECUCAO_PADRAO = Object.freeze({
    runId: null,
    startedAtTs: null,
    lastEventSeq: 0,
    itemAtualKey: null,
    items: {}
  });
  function truncarTexto(valor, fallback = "") {
    const texto = String(valor ?? fallback).trim();
    if (!texto) return fallback;
    return texto.length > MAX_STRING_LENGTH ? `${texto.slice(0, MAX_STRING_LENGTH - 1)}…` : texto;
  }
  function normalizarNumeroNullable$1(valor) {
    if (valor == null || valor === "") return null;
    const numero = Number(valor);
    return Number.isFinite(numero) ? Math.max(0, numero) : null;
  }
  function normalizarNumeroInteiro$1(valor, fallback = 0) {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) return fallback;
    return Math.max(0, Math.floor(numero));
  }
  function normalizarItemKey$1(itemKey) {
    const valor = String(itemKey ?? "").trim();
    return valor || null;
  }
  function normalizarStatus(status) {
    return ["em_andamento", "concluido", "pausado"].includes(status) ? status : "em_andamento";
  }
  function sanitizarPayload(valor, depth = 0) {
    if (depth > 3) return "[truncated]";
    if (valor == null) return null;
    if (typeof valor === "string") return truncarTexto(valor, "");
    if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
    if (typeof valor === "boolean") return valor;
    if (Array.isArray(valor)) return valor.slice(0, 20).map((item) => sanitizarPayload(item, depth + 1));
    if (typeof valor === "object") {
      return Object.fromEntries(
        Object.entries(valor).slice(0, 20).map(([chave, item]) => [truncarTexto(chave, ""), sanitizarPayload(item, depth + 1)])
      );
    }
    return truncarTexto(String(valor), "");
  }
  function normalizarEvento(evento, itemKeyPadrao, itemTelaIdPadrao) {
    if (!evento || typeof evento !== "object") return null;
    const e = evento;
    const tipo = truncarTexto(e["tipo"], "");
    if (!tipo) return null;
    const itemKey = normalizarItemKey$1(e["itemKey"]) || itemKeyPadrao;
    if (!itemKey) return null;
    const itemTelaId = normalizarItemKey$1(e["itemTelaId"]) || itemTelaIdPadrao || itemKey;
    const ts = normalizarNumeroNullable$1(e["ts"]);
    return {
      seq: normalizarNumeroInteiro$1(e["seq"], 0),
      tipo,
      ts,
      itemKey,
      itemTelaId,
      resumo: truncarTexto(e["resumo"], EVENT_LABELS[tipo] || tipo),
      payload: sanitizarPayload(e["payload"] ?? {})
    };
  }
  function normalizarItemTracado(itemKey, item, fallbackTs = null) {
    const key = normalizarItemKey$1(itemKey);
    if (!key || !item || typeof item !== "object") return null;
    const i = item;
    const itemTelaIdBase = normalizarItemKey$1(i["itemTelaId"]) || key;
    const events = Array.isArray(i["events"]) ? i["events"].map((evento) => normalizarEvento(evento, key, itemTelaIdBase)).filter((e) => e !== null).slice(-20) : [];
    const firstEvent = events[0] ?? null;
    const lastEvent = events.at(-1) ?? null;
    const itemTelaId = normalizarItemKey$1(i["itemTelaId"]) || (lastEvent == null ? void 0 : lastEvent.itemTelaId) || key;
    const firstEventTs = normalizarNumeroNullable$1(i["firstEventTs"]) ?? (firstEvent == null ? void 0 : firstEvent.ts) ?? fallbackTs;
    const lastEventTs = normalizarNumeroNullable$1(i["lastEventTs"]) ?? (lastEvent == null ? void 0 : lastEvent.ts) ?? firstEventTs ?? fallbackTs;
    const lastEventTipo = truncarTexto(i["lastEventTipo"], (lastEvent == null ? void 0 : lastEvent.tipo) || "") || null;
    const resumoCurto = truncarTexto(i["resumoCurto"], (lastEvent == null ? void 0 : lastEvent.resumo) || "") || null;
    return {
      itemKey: key,
      itemTelaId,
      status: normalizarStatus(i["status"]),
      firstEventTs,
      lastEventTs,
      lastEventTipo,
      resumoCurto,
      events
    };
  }
  function resolverItemAtualKey(estado, trilha) {
    var _a;
    const candidatos = [
      estado == null ? void 0 : estado.itemAtualKey,
      estado == null ? void 0 : estado.itemAtualTelaId,
      trilha == null ? void 0 : trilha.itemAtualKey
    ];
    for (const candidato of candidatos) {
      const key = normalizarItemKey$1(candidato);
      if (key && ((_a = trilha == null ? void 0 : trilha.items) == null ? void 0 : _a[key])) return key;
    }
    return null;
  }
  function getEventosRecentes(item, limit) {
    return ((item == null ? void 0 : item.events) || []).slice(-Math.max(1, limit)).reverse().map(formatarEventoTrilha);
  }
  function normalizarTrilhaExecucao(trilha) {
    const src = trilha && typeof trilha === "object" ? trilha : {};
    const items = {};
    let maxSeq = 0;
    for (const [itemKey, item] of Object.entries(src["items"] || {})) {
      const normalizado = normalizarItemTracado(itemKey, item, normalizarNumeroNullable$1(src["startedAtTs"]));
      if (!normalizado) continue;
      items[normalizado.itemKey] = normalizado;
      for (const evento of normalizado.events) {
        if (evento.seq > maxSeq) maxSeq = evento.seq;
      }
    }
    const lastEventSeq = Math.max(normalizarNumeroInteiro$1(src["lastEventSeq"], 0), maxSeq);
    const itemAtualKey = normalizarItemKey$1(src["itemAtualKey"]);
    return {
      runId: normalizarItemKey$1(src["runId"]),
      startedAtTs: normalizarNumeroNullable$1(src["startedAtTs"]),
      lastEventSeq,
      itemAtualKey: itemAtualKey && items[itemAtualKey] ? itemAtualKey : null,
      items
    };
  }
  function resetarTrilhaExecucao(estado, { runId, now = Date.now() } = {}) {
    const runIdNormalizado = normalizarItemKey$1(runId) || `run_${Math.floor(now)}`;
    const nova = normalizarTrilhaExecucao({
      runId: runIdNormalizado,
      startedAtTs: now,
      lastEventSeq: 0,
      itemAtualKey: null,
      items: {}
    });
    estado.trilhaExecucao = nova;
    return nova;
  }
  function garantirItemTracado(estado, itemKey, itemTelaId = null, now = Date.now()) {
    const key = normalizarItemKey$1(itemKey);
    if (!key) return null;
    const trilha = normalizarTrilhaExecucao(estado.trilhaExecucao);
    const telaId = normalizarItemKey$1(itemTelaId) || key;
    const existente = trilha.items[key];
    trilha.startedAtTs = trilha.startedAtTs ?? now;
    trilha.items[key] = existente || {
      itemKey: key,
      itemTelaId: telaId,
      status: "em_andamento",
      firstEventTs: now,
      lastEventTs: now,
      lastEventTipo: null,
      resumoCurto: null,
      events: []
    };
    if (telaId) trilha.items[key].itemTelaId = telaId;
    trilha.itemAtualKey = key;
    estado.trilhaExecucao = trilha;
    return trilha.items[key];
  }
  function registrarEventoItem(estado, itemKey, tipo, options = {}) {
    const key = normalizarItemKey$1(itemKey);
    const tipoNormalizado = truncarTexto(tipo, "");
    if (!key || !tipoNormalizado) return null;
    const now = normalizarNumeroNullable$1(options.now) ?? Date.now();
    const item = garantirItemTracado(estado, key, options.itemTelaId ?? null, now);
    if (!item) return null;
    if (tipoNormalizado === "item_aberto" && item.events.some((evento2) => evento2.tipo === "item_aberto")) {
      return item.events.find((evento2) => evento2.tipo === "item_aberto") ?? null;
    }
    const trilha = estado.trilhaExecucao;
    trilha.lastEventSeq += 1;
    trilha.itemAtualKey = key;
    const itemTelaId = normalizarItemKey$1(options.itemTelaId) || item.itemTelaId || key;
    const resumo = truncarTexto(options.resumo, EVENT_LABELS[tipoNormalizado] || tipoNormalizado);
    const evento = {
      seq: trilha.lastEventSeq,
      tipo: tipoNormalizado,
      ts: now,
      itemKey: key,
      itemTelaId,
      resumo,
      payload: sanitizarPayload(options.payload ?? {})
    };
    item.itemTelaId = itemTelaId;
    item.events = [...item.events, evento].slice(-20);
    item.firstEventTs = item.firstEventTs ?? now;
    item.lastEventTs = now;
    item.lastEventTipo = tipoNormalizado;
    item.resumoCurto = resumo;
    item.status = options.status ? normalizarStatus(options.status) : item.status;
    return evento;
  }
  function registrarEventoItemAtual(estado, tipo, options = {}) {
    const trilha = estado.trilhaExecucao;
    const itemKey = normalizarItemKey$1(options.itemKey) || normalizarItemKey$1(estado == null ? void 0 : estado.itemAtualKey) || normalizarItemKey$1(estado == null ? void 0 : estado.itemAtualTelaId) || normalizarItemKey$1(trilha == null ? void 0 : trilha.itemAtualKey);
    if (!itemKey) return null;
    return registrarEventoItem(estado, itemKey, tipo, options);
  }
  function obterTrilhaItem(estado, itemKey) {
    const trilha = normalizarTrilhaExecucao(estado == null ? void 0 : estado.trilhaExecucao);
    const key = normalizarItemKey$1(itemKey);
    return key ? trilha.items[key] ?? null : null;
  }
  function obterItemTrilhaAtual(estado) {
    const trilha = normalizarTrilhaExecucao(estado == null ? void 0 : estado.trilhaExecucao);
    const itemAtualKey = resolverItemAtualKey(estado, trilha);
    if (itemAtualKey) return trilha.items[itemAtualKey] ?? null;
    return null;
  }
  function formatarEventoTrilha(evento) {
    const ts = normalizarNumeroNullable$1(evento == null ? void 0 : evento.ts);
    const horario = ts != null ? new Date(ts).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }) : "—";
    const titulo = EVENT_LABELS[(evento == null ? void 0 : evento.tipo) ?? ""] || truncarTexto(evento == null ? void 0 : evento.tipo, "Evento");
    const resumo = truncarTexto(evento == null ? void 0 : evento.resumo, titulo);
    return {
      seq: (evento == null ? void 0 : evento.seq) ?? 0,
      tipo: (evento == null ? void 0 : evento.tipo) ?? "",
      ts: (evento == null ? void 0 : evento.ts) ?? null,
      itemKey: (evento == null ? void 0 : evento.itemKey) ?? "",
      itemTelaId: (evento == null ? void 0 : evento.itemTelaId) ?? "",
      payload: (evento == null ? void 0 : evento.payload) ?? null,
      horario,
      titulo,
      resumo,
      texto: `${horario} • ${resumo}`
    };
  }
  function obterResumoTrilhaUI(estado, { limit = 8 } = {}) {
    var _a;
    const trilha = normalizarTrilhaExecucao(estado == null ? void 0 : estado.trilhaExecucao);
    const itemAtual = obterItemTrilhaAtual(estado);
    const ultimoProcessado = obterTrilhaItem(estado, (_a = estado == null ? void 0 : estado.progresso) == null ? void 0 : _a.ultimoProcessado);
    const item = itemAtual || ultimoProcessado;
    if (!item) {
      return {
        empty: true,
        itemKey: null,
        itemTelaId: null,
        currentLabel: "Sem eventos nesta rodada.",
        events: [],
        critical: false,
        status: null,
        lastEventTipo: null,
        cardClassName: "km-card km-trace-card"
      };
    }
    const itemKey = item.itemKey;
    const currentLabel = `Item ${item.itemTelaId || itemKey}`;
    const critical = CRITICAL_EVENT_TYPES.has(item.lastEventTipo ?? "");
    return {
      empty: false,
      itemKey,
      itemTelaId: item.itemTelaId || itemKey,
      currentLabel,
      events: getEventosRecentes(item, limit),
      critical,
      status: item.status,
      lastEventTipo: item.lastEventTipo,
      resumoCurto: item.resumoCurto,
      cardClassName: critical ? "km-card km-trace-card is-critical" : "km-card km-trace-card",
      runId: trilha.runId
    };
  }
  function serializarTrilhaParaRelatorio(estado, { maxItems = 5, maxEventsPerItem = 12 } = {}) {
    var _a, _b;
    const trilha = normalizarTrilhaExecucao(estado == null ? void 0 : estado.trilhaExecucao);
    const limiteItens = Math.max(1, maxItems);
    const limiteEventos = Math.max(1, maxEventsPerItem);
    const prioridades = [];
    const addPrioridade = (itemKey) => {
      const key = normalizarItemKey$1(itemKey);
      if (!key || prioridades.includes(key) || !trilha.items[key]) return;
      prioridades.push(key);
    };
    addPrioridade(resolverItemAtualKey(estado, trilha));
    addPrioridade((_a = estado == null ? void 0 : estado.progresso) == null ? void 0 : _a.ultimoProcessado);
    const recentes = Object.values(trilha.items).sort((a, b) => Number(b.lastEventTs ?? 0) - Number(a.lastEventTs ?? 0)).map((item) => item.itemKey);
    recentes.forEach(addPrioridade);
    const itensRecentes = prioridades.slice(0, limiteItens).map((itemKey) => {
      const item = trilha.items[itemKey];
      return {
        itemKey: item.itemKey,
        itemTelaId: item.itemTelaId,
        status: item.status,
        lastEventTipo: item.lastEventTipo,
        resumoCurto: item.resumoCurto,
        events: item.events.slice(-limiteEventos)
      };
    });
    return {
      runId: trilha.runId,
      startedAtTs: trilha.startedAtTs,
      itemAtualKey: resolverItemAtualKey(estado, trilha),
      ultimoProcessado: normalizarItemKey$1((_b = estado == null ? void 0 : estado.progresso) == null ? void 0 : _b.ultimoProcessado),
      itensRecentes
    };
  }
  const PAINEL_SECOES_PADRAO = Object.freeze({
    resumo: true,
    trilha: true,
    workflow: true,
    json: true,
    controle: true,
    opcoes: false,
    perfil: false,
    logs: false,
    progresso: true,
    fiscalHints: true
  });
  function asObject(valor) {
    return valor && typeof valor === "object" ? valor : {};
  }
  function normalizarReportingConfig(config) {
    const src = asObject(config);
    const url = String(src["serviceUrl"] ?? REPORTING_DEFAULTS.serviceUrl).trim() || REPORTING_DEFAULTS.serviceUrl;
    const transportRaw = String(src["transport"] ?? REPORTING_DEFAULTS.transport).trim().toLowerCase();
    const transport = ["auto", "fetch", "gm_xhr"].includes(transportRaw) ? transportRaw : REPORTING_DEFAULTS.transport;
    const apiToken = src["apiToken"] != null ? String(src["apiToken"]).trim() : "";
    const maxFileSizeMb = Number.isFinite(Number(src["maxFileSizeMb"])) ? Math.max(1, Math.min(200, Number(src["maxFileSizeMb"]))) : REPORTING_DEFAULTS.maxFileSizeMb;
    const maxFilesPerItem = Number.isFinite(Number(src["maxFilesPerItem"])) ? Math.max(1, Math.min(200, Number(src["maxFilesPerItem"]))) : REPORTING_DEFAULTS.maxFilesPerItem;
    const ocrEngineRaw = String(src["ocrEngine"] ?? REPORTING_DEFAULTS.ocrEngine).trim().toLowerCase();
    const ocrEngine = ["tesseract", "paddleocr", "none"].includes(ocrEngineRaw) ? ocrEngineRaw : REPORTING_DEFAULTS.ocrEngine;
    return {
      enabledReport: src["enabledReport"] !== void 0 ? !!src["enabledReport"] : REPORTING_DEFAULTS.enabledReport,
      enabledMedia: src["enabledMedia"] !== void 0 ? !!src["enabledMedia"] : REPORTING_DEFAULTS.enabledMedia,
      clickMediaTabBeforeCollect: src["clickMediaTabBeforeCollect"] !== void 0 ? !!src["clickMediaTabBeforeCollect"] : REPORTING_DEFAULTS.clickMediaTabBeforeCollect,
      enabledAcompanhamento: src["enabledAcompanhamento"] !== void 0 ? !!src["enabledAcompanhamento"] : REPORTING_DEFAULTS.enabledAcompanhamento,
      blockOnReportError: src["blockOnReportError"] !== void 0 ? !!src["blockOnReportError"] : REPORTING_DEFAULTS.blockOnReportError,
      serviceUrl: url,
      apiToken: apiToken || REPORTING_DEFAULTS.apiToken,
      transport,
      maxFileSizeMb,
      maxFilesPerItem,
      sessionRunId: src["sessionRunId"] ? String(src["sessionRunId"]) : null,
      ocrEnabled: src["ocrEnabled"] !== void 0 ? !!src["ocrEnabled"] : REPORTING_DEFAULTS.ocrEnabled,
      ocrEngine
    };
  }
  function normalizarPainelPosicao(posicao) {
    if (!posicao || typeof posicao !== "object") return null;
    const pos = posicao;
    const top = typeof pos["top"] === "string" ? pos["top"].trim() : "";
    if (!top) return null;
    return { top };
  }
  function normalizarPainelSecoes(secoes) {
    const src = asObject(secoes);
    const out = {};
    for (const [chave, padrao] of Object.entries(PAINEL_SECOES_PADRAO)) {
      out[chave] = src[chave] !== void 0 ? !!src[chave] : !!padrao;
    }
    return out;
  }
  function normalizarPainelScrollTop(valor) {
    const num = Number(valor);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.floor(num));
  }
  function normalizarLogAreaHeight$1(valor) {
    const num = Number(valor);
    if (!Number.isFinite(num)) return 110;
    return Math.max(80, Math.min(520, Math.floor(num)));
  }
  function normalizarNumeroInteiro(valor, fallback = 0) {
    const num = Number(valor);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(0, Math.floor(num));
  }
  function normalizarNumeroNullable(valor) {
    if (valor == null || valor === "") return null;
    const num = Number(valor);
    return Number.isFinite(num) ? Math.max(0, num) : null;
  }
  function normalizarConcluidosIds(ids) {
    if (!Array.isArray(ids)) return [];
    return [...new Set(
      ids.map((id) => String(id ?? "").trim()).filter(Boolean)
    )];
  }
  function normalizarProgresso(progresso) {
    const src = asObject(progresso);
    return {
      atual: normalizarNumeroInteiro(src["atual"], 0),
      total: normalizarNumeroInteiro(src["total"], 0),
      ultimoProcessado: src["ultimoProcessado"] ? String(src["ultimoProcessado"]).trim() : null,
      concluidosIds: normalizarConcluidosIds(src["concluidosIds"])
    };
  }
  function normalizarEstimativa(estimativa) {
    const src = asObject(estimativa);
    const totalPlanejado = normalizarNumeroInteiro(src["totalPlanejado"], 0);
    const fonteTotal = src["fonteTotal"] === "json" || src["fonteTotal"] === "fila" ? src["fonteTotal"] : null;
    const itemAtualId = src["itemAtualId"] ? String(src["itemAtualId"]).trim() : null;
    const itemAtualInicioTs = normalizarNumeroNullable(src["itemAtualInicioTs"]);
    const primeiroItemId = src["primeiroItemId"] ? String(src["primeiroItemId"]).trim() : null;
    const primeiroItemDuracaoMs = normalizarNumeroNullable(src["primeiroItemDuracaoMs"]);
    const duracaoTotalConcluidosMs = normalizarNumeroNullable(src["duracaoTotalConcluidosMs"]) ?? 0;
    const duracaoAmostras = normalizarNumeroInteiro(src["duracaoAmostras"], 0);
    const tempoMedioReferenciaMs = normalizarNumeroNullable(src["tempoMedioReferenciaMs"]);
    const ultimoItemConcluidoTs = normalizarNumeroNullable(src["ultimoItemConcluidoTs"]);
    const restantes = normalizarNumeroInteiro(src["restantes"], totalPlanejado);
    const etaRestanteMs = normalizarNumeroNullable(src["etaRestanteMs"]);
    const previsaoTerminoTs = normalizarNumeroNullable(src["previsaoTerminoTs"]);
    return {
      totalPlanejado,
      fonteTotal,
      itemAtualId,
      itemAtualInicioTs,
      primeiroItemId,
      primeiroItemDuracaoMs,
      duracaoTotalConcluidosMs,
      duracaoAmostras,
      tempoMedioReferenciaMs,
      restantes,
      etaRestanteMs,
      previsaoTerminoTs,
      ultimoItemConcluidoTs
    };
  }
  const ESTIMATIVA_PADRAO = Object.freeze({
    totalPlanejado: 0,
    fonteTotal: null,
    itemAtualId: null,
    itemAtualInicioTs: null,
    primeiroItemId: null,
    primeiroItemDuracaoMs: null,
    duracaoTotalConcluidosMs: 0,
    duracaoAmostras: 0,
    tempoMedioReferenciaMs: null,
    restantes: 0,
    etaRestanteMs: null,
    previsaoTerminoTs: null,
    ultimoItemConcluidoTs: null
  });
  const ESTADO_PADRAO = {
    schemaVersion: CONFIG.SCHEMA_VERSION,
    ativo: false,
    pausado: false,
    pausarEmReincidencia: true,
    minimizado: true,
    modoSimulacao: false,
    modoInspecao: false,
    globalActionDelayMs: 1200,
    clickCooldownMs: 3e3,
    perfilAtivo: "default",
    perfis: {},
    perfilConfigs: {},
    progresso: normalizarProgresso(null),
    logs: [],
    estatisticas: { processados: 0, erros: 0, ultimoErro: null },
    painelPosicao: null,
    painelSecoes: normalizarPainelSecoes(null),
    painelScrollTop: 0,
    logAreaHeight: 110,
    itemAtualKey: null,
    itemAtualTelaId: null,
    reportingSessionMap: {},
    estimativa: normalizarEstimativa(ESTIMATIVA_PADRAO),
    trilhaExecucao: normalizarTrilhaExecucao(TRILHA_EXECUCAO_PADRAO),
    itemFlags: {},
    itemMapAtivo: false,
    itemMapJson: "",
    itemMap: {},
    itemMapUltimoAplicadoId: null,
    fiscalHintsAtivo: true,
    fiscalHintsJson: "",
    fiscalHints: {},
    reporting: normalizarReportingConfig(REPORTING_DEFAULTS),
    acoes: {}
  };
  const ACOES_WORKFLOW = Object.freeze([
    { id: "atuar", nome: "Atuar no Item", seletor: 'input[name$="butAcao3"]', tipo: "click", ordem: 1 },
    { id: "abaFiscal", nome: "Aba Fiscal", seletor: "text=Fiscal", tipo: "click", ordem: 2 },
    { id: "ncm", nome: "Preencher NCM", seletor: "#txtNCMTIPI, #txtNBS", tipo: "input", ordem: 3, valorPadrao: "8471.30.12" },
    { id: "cest", nome: "Preencher CEST", seletor: "#txtCest", tipo: "custom", ordem: 4 },
    { id: "lei116Servico", nome: "Preencher Lei 116 (Serviço)", seletor: "input.Cat90, input.Cat91", tipo: "custom", ordem: 5 },
    { id: "abaClassificacao", nome: "Aba Classificações", seletor: "text=Classificações", tipo: "click", ordem: 6 },
    { id: "lupaUnspsc", nome: "Lupa UNSPSC", seletor: "#ibutUNSPSC", tipo: "click", ordem: 7 },
    { id: "unspsc", nome: "Preencher UNSPSC", seletor: '#txtCodigoUnspsc, #txtCodUNSPSC, input[name$="txtCodigoUnspsc"], input[name$="txtCodUNSPSC"]', tipo: "input", ordem: 8, valorPadrao: "30103618" },
    { id: "pesquisar", nome: "Pesquisar", seletor: 'input[name*="butPesquisar"]', tipo: "click", ordem: 9 },
    { id: "resultado", nome: "Clique Resultado", seletor: 'a[id="txtDescricao"]', tipo: "click", ordem: 10 },
    { id: "selecionar", nome: "Selecionar UNSPSC", seletor: "#butFechar", tipo: "click", ordem: 11 },
    { id: "coletarMidia", nome: "Coletar Mídia", seletor: "text=Mídias", tipo: "click", ordem: 12 },
    { id: "coletarAcompanhamento", nome: "Coletar Acompanhamento", seletor: "#hButAcompanhamentoSIN, #hlkObs", tipo: "custom", ordem: 13 },
    { id: "gerarRelatorioItem", nome: "Gerar Relatório Item", seletor: "", tipo: "custom", ordem: 14 },
    { id: "prosseguir", nome: "Prosseguir", seletor: '#butAcao2, #butAcao1, input[value="Prosseguir"]', tipo: "click", ordem: 15 },
    { id: "confirmar", nome: "Confirmar (Sim)", seletor: "#butSim", tipo: "click", ordem: 16 }
  ]);
  function corrigirSeletorLegado(acaoId, seletor) {
    const acao = ACOES_WORKFLOW.find((item) => item.id === acaoId);
    if (!acao) return seletor;
    if (acaoId === "unspsc" && (seletor === 'input[name*="txtCodigoUnspsc"]' || seletor === "#txtCodigoUnspsc")) return acao.seletor;
    if (acaoId === "resultado" && seletor === "a#txtDescricao") return acao.seletor;
    if (acaoId === "abaClassificacao" && seletor === 'a[href*="ctl02$lbutMenu"]') return acao.seletor;
    if (acaoId === "abaFiscal" && seletor === 'a[href*="ctl04lbutMenu"]') return acao.seletor;
    if (acaoId === "ncm" && seletor === "#txtNCMTIPI") return acao.seletor;
    if (acaoId === "prosseguir" && seletor === "#butAcao1") return acao.seletor;
    return seletor;
  }
  function inicializarAcoes(estado) {
    ACOES_WORKFLOW.forEach((acao) => {
      const savedAcao = estado.acoes[acao.id] || {};
      const seletor = corrigirSeletorLegado(acao.id, savedAcao.seletor ?? acao.seletor);
      estado.acoes[acao.id] = {
        ativo: savedAcao.ativo ?? true,
        seletor,
        valor: savedAcao.valor ?? (acao.valorPadrao || null),
        ordem: savedAcao.ordem ?? acao.ordem
      };
    });
    return estado;
  }
  function isRecord(valor) {
    return !!valor && typeof valor === "object";
  }
  function normalizarStringOuVazio(valor) {
    return valor ? String(valor) : "";
  }
  function aplicarTarefasLegadas(novo, tarefasRaw) {
    if (!isRecord(tarefasRaw)) return;
    const tarefas = tarefasRaw;
    if (tarefas["ncm"]) {
      novo.acoes["ncm"] = {
        ativo: tarefas["ncm"].ativo ?? true,
        seletor: "#txtNCMTIPI",
        valor: tarefas["ncm"].valor || "8471.30.12",
        ordem: 3
      };
    }
    if (tarefas["unspsc"]) {
      novo.acoes["unspsc"] = {
        ativo: tarefas["unspsc"].ativo ?? true,
        seletor: '#txtCodigoUnspsc, #txtCodUNSPSC, input[name$="txtCodigoUnspsc"], input[name$="txtCodUNSPSC"]',
        valor: tarefas["unspsc"].valor || "43211503",
        ordem: 7
      };
    }
    if (tarefas["finalizar"]) {
      novo.acoes["prosseguir"] = { ativo: tarefas["finalizar"].ativo ?? true, seletor: "#butAcao1", valor: null, ordem: 14 };
      novo.acoes["confirmar"] = { ativo: tarefas["finalizar"].ativo ?? true, seletor: "#butSim", valor: null, ordem: 15 };
    }
  }
  function garantirDefaultsEstado(estado) {
    var _a, _b;
    if (!((_a = estado.perfis) == null ? void 0 : _a["default"])) {
      estado.perfis = { ...estado.perfis || {}, default: clone(estado.acoes) };
    }
    if (!((_b = estado.perfilConfigs) == null ? void 0 : _b["default"])) {
      estado.perfilConfigs = { ...estado.perfilConfigs || {}, default: { reporting: normalizarReportingConfig(estado.reporting) } };
    }
    estado.painelPosicao = normalizarPainelPosicao(estado.painelPosicao);
    estado.progresso = normalizarProgresso(estado.progresso);
    estado.painelSecoes = normalizarPainelSecoes(estado.painelSecoes);
    estado.painelScrollTop = normalizarPainelScrollTop(estado.painelScrollTop);
    estado.logAreaHeight = normalizarLogAreaHeight$1(estado.logAreaHeight);
    estado.estimativa = normalizarEstimativa(estado.estimativa);
    estado.trilhaExecucao = normalizarTrilhaExecucao(estado.trilhaExecucao);
    estado.reporting = normalizarReportingConfig(estado.reporting);
    return estado;
  }
  function migrarEstadoSalvo(antigo, salvar) {
    const novo = clone(ESTADO_PADRAO);
    if (isRecord(antigo["perfis"])) novo.perfis = antigo["perfis"];
    if (isRecord(antigo["perfilConfigs"])) novo.perfilConfigs = antigo["perfilConfigs"];
    if (antigo["ativo"] !== void 0) novo.ativo = !!antigo["ativo"];
    if (antigo["pausado"] !== void 0) novo.pausado = !!antigo["pausado"];
    if (antigo["pausarEmReincidencia"] !== void 0) novo.pausarEmReincidencia = !!antigo["pausarEmReincidencia"];
    if (antigo["minimizado"] !== void 0) novo.minimizado = !!antigo["minimizado"];
    if (Array.isArray(antigo["logs"])) novo.logs = antigo["logs"];
    if (isRecord(antigo["estatisticas"])) novo.estatisticas = antigo["estatisticas"];
    novo.progresso = normalizarProgresso(antigo["progresso"]);
    novo.painelPosicao = normalizarPainelPosicao(antigo["painelPosicao"]);
    novo.painelSecoes = normalizarPainelSecoes(antigo["painelSecoes"]);
    novo.painelScrollTop = normalizarPainelScrollTop(antigo["painelScrollTop"]);
    novo.logAreaHeight = normalizarLogAreaHeight$1(antigo["logAreaHeight"]);
    if (antigo["modoSimulacao"] !== void 0) novo.modoSimulacao = !!antigo["modoSimulacao"];
    if (antigo["globalActionDelayMs"] !== void 0) novo.globalActionDelayMs = normalizarNumeroInteiro(antigo["globalActionDelayMs"], novo.globalActionDelayMs);
    else if (antigo["actionDelayMs"] !== void 0) novo.globalActionDelayMs = normalizarNumeroInteiro(antigo["actionDelayMs"], novo.globalActionDelayMs);
    else if (antigo["delayMs"] !== void 0) novo.globalActionDelayMs = normalizarNumeroInteiro(antigo["delayMs"], novo.globalActionDelayMs);
    if (antigo["clickCooldownMs"] !== void 0) novo.clickCooldownMs = normalizarNumeroInteiro(antigo["clickCooldownMs"], novo.clickCooldownMs);
    if (antigo["itemMapAtivo"] !== void 0) novo.itemMapAtivo = !!antigo["itemMapAtivo"];
    if (antigo["itemMapJson"]) novo.itemMapJson = normalizarStringOuVazio(antigo["itemMapJson"]);
    if (isRecord(antigo["itemMap"])) novo.itemMap = antigo["itemMap"];
    if (antigo["itemMapUltimoAplicadoId"]) novo.itemMapUltimoAplicadoId = String(antigo["itemMapUltimoAplicadoId"]);
    if (antigo["itemAtualTelaId"]) novo.itemAtualTelaId = String(antigo["itemAtualTelaId"]);
    if (isRecord(antigo["reportingSessionMap"])) novo.reportingSessionMap = antigo["reportingSessionMap"];
    if (antigo["fiscalHintsAtivo"] !== void 0) novo.fiscalHintsAtivo = !!antigo["fiscalHintsAtivo"];
    if (antigo["fiscalHintsJson"] !== void 0) novo.fiscalHintsJson = String(antigo["fiscalHintsJson"]);
    if (isRecord(antigo["fiscalHints"])) novo.fiscalHints = antigo["fiscalHints"];
    novo.estimativa = normalizarEstimativa(antigo["estimativa"]);
    novo.trilhaExecucao = normalizarTrilhaExecucao(antigo["trilhaExecucao"]);
    novo.reporting = normalizarReportingConfig(antigo["reporting"]);
    aplicarTarefasLegadas(novo, antigo["tarefas"]);
    inicializarAcoes(novo);
    novo.perfis["default"] = clone(novo.acoes);
    novo.perfilConfigs["default"] = {
      reporting: normalizarReportingConfig(novo.reporting)
    };
    salvar(novo);
    return novo;
  }
  let cache = null;
  let cacheTimestamp = 0;
  const CACHE_TTL = 100;
  function carregarEstadoAtual(salvo) {
    let estado = {
      ...ESTADO_PADRAO,
      ...salvo,
      acoes: { ...salvo["acoes"] || {} }
    };
    estado.perfilConfigs = { ...salvo["perfilConfigs"] || {} };
    estado.progresso = normalizarProgresso(salvo["progresso"]);
    estado.painelPosicao = normalizarPainelPosicao(salvo["painelPosicao"]);
    estado.painelSecoes = normalizarPainelSecoes(salvo["painelSecoes"]);
    estado.painelScrollTop = normalizarPainelScrollTop(salvo["painelScrollTop"]);
    estado.logAreaHeight = normalizarLogAreaHeight$1(salvo["logAreaHeight"]);
    estado.estimativa = normalizarEstimativa(salvo["estimativa"]);
    estado.trilhaExecucao = normalizarTrilhaExecucao(salvo["trilhaExecucao"]);
    estado.reporting = normalizarReportingConfig(salvo["reporting"]);
    estado.pausarEmReincidencia = salvo["pausarEmReincidencia"] !== void 0 ? !!salvo["pausarEmReincidencia"] : true;
    estado = inicializarAcoes(estado);
    return garantirDefaultsEstado(estado);
  }
  function get() {
    const agora = Date.now();
    if (cache && agora - cacheTimestamp < CACHE_TTL) return cache;
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      const salvo = (raw ? JSON.parse(raw) : null) || {};
      const schemaVersion = Number(salvo["schemaVersion"]);
      cache = !schemaVersion || schemaVersion < CONFIG.SCHEMA_VERSION ? migrarEstadoSalvo(salvo, set$1) : carregarEstadoAtual(salvo);
      cacheTimestamp = agora;
      return cache;
    } catch (e) {
      console.error("[KM] Erro ao carregar estado:", e);
      cache = clone(ESTADO_PADRAO);
      cacheTimestamp = agora;
      return cache;
    }
  }
  function set$1(novoEstado) {
    novoEstado.schemaVersion = CONFIG.SCHEMA_VERSION;
    cache = novoEstado;
    cacheTimestamp = Date.now();
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(novoEstado));
  }
  function update(modificador) {
    const estado = get();
    if (typeof modificador === "function") modificador(estado);
    else Object.assign(estado, modificador);
    set$1(estado);
    return estado;
  }
  function persistirAcoes(estado) {
    const nome = estado.perfilAtivo || "default";
    estado.perfis = estado.perfis || {};
    estado.perfis[nome] = clone(estado.acoes);
    estado.perfilConfigs = estado.perfilConfigs || {};
    const atual = estado.perfilConfigs[nome] || {};
    estado.perfilConfigs[nome] = {
      ...atual,
      reporting: normalizarReportingConfig(estado.reporting)
    };
  }
  let memLogs = null;
  const flushDebounced = debounce(() => {
    if (!memLogs) return;
    update((st) => {
      st["logs"] = memLogs;
    });
  }, 400);
  function garantirMemLogs() {
    if (!memLogs) {
      const existing = get().logs;
      memLogs = (Array.isArray(existing) ? existing : []).slice(0, CONFIG.LOG_MAX_ENTRIES);
    }
  }
  function adicionar(mensagem, tipo = "info") {
    garantirMemLogs();
    const timestamp = (/* @__PURE__ */ new Date()).toLocaleTimeString("pt-BR");
    const entry = { timestamp, mensagem, tipo };
    memLogs.unshift(entry);
    if (memLogs.length > CONFIG.LOG_MAX_ENTRIES) memLogs.length = CONFIG.LOG_MAX_ENTRIES;
    atualizarUI(entry);
    flushDebounced();
    const consoleMethod = tipo === "error" ? "error" : tipo === "warn" ? "warn" : "log";
    console[consoleMethod](`[KM ${timestamp}] ${mensagem}`);
  }
  function atualizarUI(entry) {
    var _a;
    const logArea = document.getElementById("log-area");
    if (!logArea) return;
    const div = document.createElement("div");
    div.className = `log-entry log-${entry.tipo}`;
    div.textContent = `${entry.timestamp} - ${entry.mensagem}`;
    logArea.prepend(div);
    while (logArea.children.length > 50) (_a = logArea.lastChild) == null ? void 0 : _a.remove();
  }
  function preloadParaUI() {
    garantirMemLogs();
    return memLogs;
  }
  function formatarTodos() {
    garantirMemLogs();
    return memLogs.map((entry) => `${entry.timestamp} - ${entry.mensagem}`).join("\n");
  }
  function limpar$2() {
    memLogs = [];
    update((st) => {
      st["logs"] = [];
    });
    const logArea = document.getElementById("log-area");
    if (logArea) logArea.innerHTML = "";
  }
  const log = adicionar;
  const cooldowns = /* @__PURE__ */ new Map();
  function set(key, duracao) {
    cooldowns.set(key, Date.now() + duracao);
  }
  function isAtivo(key) {
    const expira = cooldowns.get(key);
    if (!expira) return false;
    if (Date.now() >= expira) {
      cooldowns.delete(key);
      return false;
    }
    return true;
  }
  function tempoRestante(key) {
    const expira = cooldowns.get(key);
    if (!expira) return 0;
    return Math.max(0, expira - Date.now());
  }
  function limpar$1(key) {
    if (key) cooldowns.delete(key);
    else cooldowns.clear();
  }
  function normalizarTexto(s) {
    return String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  }
  function removerAcentos(s) {
    const str = String(s ?? "");
    try {
      return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    } catch {
      return str;
    }
  }
  function normalizarTextoSemAcento(s) {
    return removerAcentos(normalizarTexto(s));
  }
  function normalizarEspacos(s) {
    return String(s ?? "").replace(/\s+/g, " ").trim();
  }
  const _iframesCache = { ts: 0, list: [] };
  function getIframesCached(ttlMs = 1e3) {
    const now = Date.now();
    if (now - _iframesCache.ts < ttlMs) return _iframesCache.list;
    const list = Array.from(document.querySelectorAll("iframe"));
    _iframesCache.ts = now;
    _iframesCache.list = list;
    return list;
  }
  function elementoVisivel(elemento) {
    var _a;
    if (!elemento) return false;
    const view = ((_a = elemento.ownerDocument) == null ? void 0 : _a.defaultView) || window;
    const style = view.getComputedStyle(elemento);
    if (style.display === "none" || style.visibility === "hidden") return false;
    if (parseFloat(style.opacity) === 0) return false;
    const rect = elemento.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  function getTextoElemento(el) {
    if (!el) return "";
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value || "";
    return el.textContent || "";
  }
  function forEachDoc(callback) {
    callback(document);
    for (const iframe of getIframesCached()) {
      try {
        const doc = iframe.contentDocument;
        if (!doc) continue;
        callback(doc);
      } catch {
      }
    }
  }
  function filtrarPorTexto(elements, textWanted) {
    const wanted = normalizarTexto(textWanted);
    if (!wanted) return Array.from(elements);
    const scored = [];
    const elementsArray = Array.from(elements);
    for (const el of elementsArray) {
      if (!elementoVisivel(el)) continue;
      const t = normalizarTexto(getTextoElemento(el));
      if (!t) continue;
      if (t === wanted) scored.push({ score: 100, el });
      else if (t.includes(wanted)) scored.push({ score: 50, el });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.map((x) => x.el);
  }
  function parseSeletor(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return { kind: "empty" };
    const low = s.toLowerCase();
    if (low.startsWith("km:")) {
      const body = s.slice(3);
      const parts = body.split(";").map((p) => p.trim()).filter(Boolean);
      const obj = {};
      for (const p of parts) {
        const [k, ...rest] = p.split("=");
        if (!k) continue;
        obj[k.trim().toLowerCase()] = rest.join("=").trim();
      }
      return {
        kind: "km",
        tag: (obj["tag"] || "").trim() || null,
        id: (obj["id"] || "").trim() || null,
        name: (obj["name"] || "").trim() || null,
        text: (obj["text"] || "").trim() || null
      };
    }
    if (s.includes("||")) {
      const [css, text] = s.split("||");
      return { kind: "cssText", css: (css || "").trim(), text: (text || "").trim() };
    }
    if (low.startsWith("text=")) {
      return { kind: "text", text: s.slice(5).trim() };
    }
    if (low.startsWith("postback=")) {
      return { kind: "postback", target: s.slice(9).trim() };
    }
    return { kind: "css", css: s };
  }
  function buscarPorTextoDeep(textWanted) {
    const wanted = normalizarTexto(textWanted);
    if (!wanted) return null;
    let found = null;
    forEachDoc((doc) => {
      if (found) return;
      const candidatos = [...doc.querySelectorAll('a, button, input[type="button"], input[type="submit"]')];
      const filtrados = filtrarPorTexto(candidatos, wanted);
      found = filtrados[0] || null;
    });
    return found;
  }
  function buscarPorPostbackDeep(target) {
    if (!target) return null;
    const targetEsc = target.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(String.raw`__doPostBack\(\s*['"]${targetEsc}['"]`, "i");
    let found = null;
    forEachDoc((doc) => {
      if (found) return;
      const links = [...doc.querySelectorAll('a[href^="javascript:__doPostBack"]')];
      for (const a of links) {
        if (!elementoVisivel(a)) continue;
        const href = a.getAttribute("href") || "";
        if (rx.test(href)) {
          found = a;
          return;
        }
      }
    });
    return found;
  }
  function buscarElementoDeep(seletor) {
    const spec = parseSeletor(seletor);
    if (spec.kind === "empty") return null;
    if (spec.kind === "text") return buscarPorTextoDeep(spec.text ?? "");
    if (spec.kind === "postback") return buscarPorPostbackDeep(spec.target ?? "");
    if (spec.kind === "km") {
      let candidatos = [];
      forEachDoc((doc) => {
        let local = [];
        if (spec.id) {
          const q = `#${cssEscape(spec.id)}`;
          try {
            local = [...doc.querySelectorAll(q)];
          } catch {
            local = [];
          }
        } else if (spec.name) {
          const q = `[name="${cssEscape(spec.name)}"]`;
          try {
            local = [...doc.querySelectorAll(q)];
          } catch {
            local = [];
          }
        }
        if (spec.tag) local = local.filter((el) => {
          var _a;
          return ((_a = el.tagName) == null ? void 0 : _a.toLowerCase()) === spec.tag.toLowerCase();
        });
        candidatos.push(...local);
      });
      if (spec.text) candidatos = filtrarPorTexto(candidatos, spec.text);
      else candidatos = candidatos.filter((el) => elementoVisivel(el));
      return candidatos[0] || null;
    }
    if (spec.kind === "cssText") {
      const all = buscarElementosDeep(spec.css ?? "");
      const filtrados = filtrarPorTexto(all, spec.text ?? "");
      return filtrados[0] || null;
    }
    if (spec.kind === "css") {
      const direto = document.querySelector(spec.css);
      if (direto) return direto;
      for (const iframe of getIframesCached()) {
        try {
          const doc = iframe.contentDocument;
          if (!doc) continue;
          const encontrado = doc.querySelector(spec.css);
          if (encontrado) return encontrado;
        } catch {
        }
      }
      return null;
    }
    return null;
  }
  function buscarElementosDeep(seletor) {
    const spec = parseSeletor(seletor);
    if (spec.kind === "empty") return [];
    if (spec.kind === "text") {
      const el = buscarPorTextoDeep(spec.text ?? "");
      return el ? [el] : [];
    }
    if (spec.kind === "postback") {
      const el = buscarPorPostbackDeep(spec.target ?? "");
      return el ? [el] : [];
    }
    if (spec.kind === "km") {
      const el = buscarElementoDeep(seletor);
      return el ? [el] : [];
    }
    if (spec.kind === "cssText") {
      const base = buscarElementosDeep(spec.css ?? "");
      return filtrarPorTexto(base, spec.text ?? "");
    }
    const resultados = [];
    try {
      resultados.push(...document.querySelectorAll(spec.css));
    } catch {
    }
    for (const iframe of getIframesCached()) {
      try {
        const doc = iframe.contentDocument;
        if (!doc) continue;
        resultados.push(...doc.querySelectorAll(spec.css));
      } catch {
      }
    }
    return resultados;
  }
  function encontrarCampoNcmPreferido(seletorPrimario) {
    const preferidos = [
      "#txtNCMTIPI",
      "#txtNBS",
      'input[name$="txtNCMTIPI"]',
      'input[name$="txtNBS"]'
    ];
    const tentativas = [];
    const raw = String(seletorPrimario ?? "").trim();
    if (raw) {
      const partes = raw.split(",").map((s) => s.trim()).filter(Boolean);
      if (partes.length === 1) {
        tentativas.push(partes[0]);
      } else {
        partes.forEach((p) => {
          if (!preferidos.includes(p)) tentativas.push(p);
        });
      }
    }
    preferidos.forEach((p) => {
      if (!tentativas.includes(p)) tentativas.push(p);
    });
    for (const sel of tentativas) {
      const el = buscarElementoDeep(sel);
      if (el) return el;
    }
    return null;
  }
  function encontrarCampoNbsPreferido() {
    const tentativas = [
      "#txtNBS",
      'input[name$="txtNBS"]',
      "#txtNCMTIPI",
      'input[name$="txtNCMTIPI"]'
    ];
    for (const sel of tentativas) {
      const el = buscarElementoDeep(sel);
      if (el) return el;
    }
    return null;
  }
  function encontrarCampoLei116Grupo() {
    const tentativas = [
      "input.Cat90",
      'input[name$="rptCategoriasX$ctl01$txtCat"]',
      "#ctl00_Body_ucTabs_tabFiscal_FISCAL_Categorias_Empresas1_ucCategoriasFlex_rptCategoriasX_ctl01_txtCat"
    ];
    for (const sel of tentativas) {
      const el = buscarElementoDeep(sel);
      if (el) return el;
    }
    return null;
  }
  function encontrarCampoLei116Subgrupo() {
    const tentativas = [
      "input.Cat91",
      'input[name$="rptCategoriasX$ctl02$txtCat"]',
      "#ctl00_Body_ucTabs_tabFiscal_FISCAL_Categorias_Empresas1_ucCategoriasFlex_rptCategoriasX_ctl02_txtCat"
    ];
    for (const sel of tentativas) {
      const el = buscarElementoDeep(sel);
      if (el) return el;
    }
    return null;
  }
  function waitForAny(selectors, { root = document, timeoutMs = 8e3 } = {}) {
    const selList = Array.isArray(selectors) ? selectors : [selectors];
    const find = () => {
      for (const sel of selList) {
        try {
          const el = root.querySelector(sel);
          if (el) return el;
        } catch {
        }
      }
      return null;
    };
    return new Promise((resolve, reject) => {
      const already = find();
      if (already) return resolve(already);
      const obs = new MutationObserver(() => {
        const el = find();
        if (el) {
          cleanup();
          resolve(el);
        }
      });
      const t = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout esperando um dos seletores: ${selList.join(" | ")}`));
      }, timeoutMs);
      function cleanup() {
        try {
          obs.disconnect();
        } catch {
        }
        clearTimeout(t);
      }
      const node = root === document ? document.documentElement : root;
      obs.observe(node, { childList: true, subtree: true });
    });
  }
  function gerarSeletorUnico(elemento) {
    const doc = elemento.ownerDocument || document;
    if (elemento.id) {
      const idSel = `#${cssEscape(elemento.id)}`;
      try {
        const count = doc.querySelectorAll(idSel).length;
        if (count === 1) return idSel;
        const texto = getTextoElemento(elemento);
        const textoNorm = texto.replaceAll(/\s+/g, " ").trim();
        const tag = (elemento.tagName || "").toLowerCase();
        if (textoNorm) return `km:tag=${tag};id=${elemento.id};text=${textoNorm}`;
        return `km:tag=${tag};id=${elemento.id}`;
      } catch {
      }
    }
    if (elemento.name) {
      return `[name="${cssEscape(elemento.name)}"]`;
    }
    if (elemento.className && typeof elemento.className === "string") {
      const classes = elemento.className.trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (classes.length > 0) {
        const seletor = `${elemento.tagName.toLowerCase()}.${classes.map((c) => cssEscape(c)).join(".")}`;
        try {
          if (doc.querySelectorAll(seletor).length === 1) return seletor;
        } catch {
        }
      }
    }
    const path = [];
    let current = elemento;
    while (current == null ? void 0 : current.tagName) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        const idSel = `#${cssEscape(current.id)}`;
        try {
          if (doc.querySelectorAll(idSel).length === 1) {
            path.unshift(idSel);
            break;
          }
        } catch {
        }
      }
      if (current.parentNode) {
        const parent = current.parentNode;
        const siblings = [...parent.children].filter((c) => c.tagName === current.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }
      path.unshift(selector);
      current = current.parentNode;
    }
    return path.join(" > ");
  }
  function destacar(elemento, tipo = "action") {
    if (!elemento) return;
    const cores = { action: "#ff0000", success: "#28a745", error: "#dc3545", simulated: "#ffc107" };
    const outlineOriginal = elemento.style.outline;
    const shadowOriginal = elemento.style.boxShadow;
    elemento.style.outline = `3px solid ${cores[tipo] ?? cores["action"]}`;
    elemento.style.boxShadow = `0 0 15px ${cores[tipo] ?? cores["action"]}`;
    elemento.style.transition = "all 0.2s ease";
    setTimeout(() => {
      elemento.style.outline = outlineOriginal;
      elemento.style.boxShadow = shadowOriginal;
    }, 800);
  }
  function signature(elemento) {
    var _a;
    try {
      const tag = (elemento.tagName || "").toLowerCase();
      const id = elemento.id ? `#${elemento.id}` : "";
      const name = elemento.name ? `[name=${elemento.name}]` : "";
      const href = ((_a = elemento.getAttribute) == null ? void 0 : _a.call(elemento, "href")) ? `[href=${(elemento.getAttribute("href") || "").slice(0, 80)}]` : "";
      const txt = normalizarTexto(getTextoElemento(elemento)).slice(0, 40);
      return `${tag}${id}${name}${href}::${txt}`;
    } catch {
      return "unknown";
    }
  }
  function shouldBlockRepeatedClick(acaoId, elemento) {
    const st = get();
    const cooldown = Math.max(0, Number(st.clickCooldownMs ?? 0));
    if (!cooldown) return false;
    const sig = signature(elemento);
    const key = `click:${acaoId}:${sig}`;
    if (isAtivo(key)) {
      const rest = tempoRestante(key);
      log(`⏳ Bloqueado anti-clique (${acaoId}) por ${Math.ceil(rest / 1e3)}s`, "warn");
      return true;
    }
    set(key, cooldown);
    return false;
  }
  async function digitarHumano(elemento, valor) {
    var _a;
    const proto = elemento instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = (_a = Object.getOwnPropertyDescriptor(proto, "value")) == null ? void 0 : _a.set;
    elemento.focus();
    const str = String(valor ?? "");
    if (!setter) {
      elemento.value = str;
      elemento.dispatchEvent(new Event("input", { bubbles: true }));
      elemento.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (elemento.value) {
      setter.call(elemento, "");
      elemento.dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(80);
    }
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      const valorAtual = str.substring(0, i + 1);
      elemento.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
      elemento.dispatchEvent(new KeyboardEvent("keypress", { key: char, bubbles: true }));
      setter.call(elemento, valorAtual);
      elemento.dispatchEvent(new InputEvent("input", { bubbles: true, data: char }));
      elemento.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
      const delay = isTestMode() ? 0 : Math.floor(Math.random() * (CONFIG.DELAYS.TYPING_MAX - CONFIG.DELAYS.TYPING_MIN)) + CONFIG.DELAYS.TYPING_MIN;
      await sleep(delay);
    }
    elemento.dispatchEvent(new Event("change", { bubbles: true }));
  }
  async function digitarSilencioso$1(elemento, valor) {
    var _a;
    const proto = elemento instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = (_a = Object.getOwnPropertyDescriptor(proto, "value")) == null ? void 0 : _a.set;
    elemento.focus();
    const str = String(valor ?? "");
    if (!setter) {
      elemento.value = str;
      elemento.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    if (elemento.value) {
      setter.call(elemento, "");
      elemento.dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(80);
    }
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      const valorAtual = str.substring(0, i + 1);
      elemento.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
      elemento.dispatchEvent(new KeyboardEvent("keypress", { key: char, bubbles: true }));
      setter.call(elemento, valorAtual);
      elemento.dispatchEvent(new InputEvent("input", { bubbles: true, data: char }));
      elemento.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
      const delay = isTestMode() ? 0 : Math.floor(Math.random() * (CONFIG.DELAYS.TYPING_MAX - CONFIG.DELAYS.TYPING_MIN)) + CONFIG.DELAYS.TYPING_MIN;
      await sleep(delay);
    }
  }
  function clickHuman(elemento) {
    const rect = elemento.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const opts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };
    try {
      elemento.dispatchEvent(new PointerEvent("pointerdown", opts));
      elemento.dispatchEvent(new MouseEvent("mousedown", opts));
      elemento.dispatchEvent(new PointerEvent("pointerup", opts));
      elemento.dispatchEvent(new MouseEvent("mouseup", opts));
    } catch {
      try {
        elemento.dispatchEvent(new MouseEvent("mousedown", opts));
      } catch {
      }
      try {
        elemento.dispatchEvent(new MouseEvent("mouseup", opts));
      } catch {
      }
    }
    if (typeof elemento.click === "function") elemento.click();
    else elemento.dispatchEvent(new MouseEvent("click", opts));
  }
  let _registrarInteracaoCallback = null;
  function setRegistrarInteracao(fn) {
    _registrarInteracaoCallback = fn;
  }
  async function interagir(elemento, valor = null, acaoId = "click") {
    const estado = get();
    if (!elemento || !elementoVisivel(elemento)) {
      log(`❌ Elemento não encontrado ou não visível: ${acaoId}`, "error");
      return false;
    }
    if (valor === null) {
      if (shouldBlockRepeatedClick(acaoId, elemento)) {
        destacar(elemento, "simulated");
        return true;
      }
    }
    const acoesDestrutivas = ["confirmar", "prosseguir"];
    if (estado.modoSimulacao && acoesDestrutivas.includes(acaoId)) {
      log(`🧪 [SIMULAÇÃO] Ação bloqueada: ${acaoId}`, "warn");
      destacar(elemento, "simulated");
      return true;
    }
    destacar(elemento);
    try {
      elemento.scrollIntoView({ block: "center", behavior: "auto" });
    } catch {
    }
    if (valor !== null) {
      await digitarHumano(elemento, valor);
      log(`⌨️ Preenchido (${acaoId}): ${valor}`, "info");
      await sleep(150);
    } else {
      clickHuman(elemento);
      log(`🖱️ Clique (${acaoId})`, "info");
    }
    try {
      _registrarInteracaoCallback == null ? void 0 : _registrarInteracaoCallback(acaoId);
    } catch {
    }
    return true;
  }
  async function tentarComRetry(seletor, valor = null, acaoId = "click") {
    for (let tentativa = 1; tentativa <= CONFIG.RETRY.MAX_TENTATIVAS; tentativa++) {
      const elemento = buscarElementoDeep(seletor);
      if (elemento && elementoVisivel(elemento)) {
        return await interagir(elemento, valor, acaoId);
      }
      if (tentativa < CONFIG.RETRY.MAX_TENTATIVAS) {
        const delay = CONFIG.RETRY.DELAY_BASE * Math.pow(CONFIG.RETRY.MULTIPLICADOR, tentativa - 1);
        log(`⏳ Tentativa ${tentativa}/${CONFIG.RETRY.MAX_TENTATIVAS}. Aguardando ${delay}ms...`, "warn");
        await sleep(delay);
      }
    }
    update((estado) => {
      estado.estatisticas.erros++;
      estado.estatisticas.ultimoErro = {
        tipo: "elemento_nao_encontrado",
        seletor,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
    });
    log(`❌ Falha após ${CONFIG.RETRY.MAX_TENTATIVAS} tentativas: ${seletor}`, "error");
    return false;
  }
  let busy = false;
  let hooked = false;
  const listeners = /* @__PURE__ */ new Set();
  function onBeginRequest() {
    busy = true;
  }
  function onEndRequest(_sender, args) {
    var _a, _b;
    busy = false;
    const err = (_a = args == null ? void 0 : args.get_error) == null ? void 0 : _a.call(args);
    if (err) {
      try {
        (_b = args.set_errorHandled) == null ? void 0 : _b.call(args, true);
      } catch {
      }
      log(`❌ Erro no servidor (endRequest): ${err.message}`, "error");
      return;
    }
    for (const fn of listeners) {
      try {
        fn();
      } catch {
      }
    }
  }
  function hook() {
    if (hooked) return;
    hooked = true;
    const t = setInterval(() => {
      var _a;
      if (typeof Sys !== "undefined" && ((_a = Sys.WebForms) == null ? void 0 : _a.PageRequestManager)) {
        clearInterval(t);
        try {
          const prm = Sys.WebForms.PageRequestManager.getInstance();
          if (!prm) return;
          try {
            prm.remove_beginRequest(onBeginRequest);
          } catch {
          }
          try {
            prm.remove_endRequest(onEndRequest);
          } catch {
          }
          prm.add_beginRequest(onBeginRequest);
          prm.add_endRequest(onEndRequest);
        } catch (e) {
          console.warn("[KM] Falha ao hookar PageRequestManager:", e);
        }
      }
    }, 50);
  }
  function isBusy() {
    return busy;
  }
  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function isMensagemNcmInvalido(texto) {
    const t = normalizarTextoSemAcento(texto || "");
    return t.includes("ncm informado") && t.includes("invalido");
  }
  function isMensagemNbsInvalido(texto) {
    const t = normalizarTextoSemAcento(texto || "");
    return t.includes("nbs informado") && t.includes("invalido");
  }
  function isMensagemSubGrupoInvalido(texto) {
    const t = normalizarTextoSemAcento(texto || "");
    return t.includes("sub grupo") && t.includes("invalido");
  }
  function extrairNumeroExecucoes(texto) {
    const normalizado = normalizarTextoSemAcento(texto || "").replaceAll(/[ºª]/g, " ");
    const match = normalizado.match(/\b(\d+)\b/);
    if (!(match == null ? void 0 : match[1])) return null;
    const numero = Number.parseInt(match[1], 10);
    return Number.isFinite(numero) ? numero : null;
  }
  function detectarAvisoCritico() {
    const lblExecucoes = buscarElementoDeep("#lblExecucoes");
    const textoExecucoes = normalizarEspacos((lblExecucoes == null ? void 0 : lblExecucoes.textContent) || "");
    if (lblExecucoes && elementoVisivel(lblExecucoes) && textoExecucoes) {
      const numeroExecucoes = extrairNumeroExecucoes(textoExecucoes);
      if (numeroExecucoes != null && numeroExecucoes >= 2) {
        return {
          fonte: "lblExecucoes",
          mensagem: textoExecucoes,
          tipo: "reincidencia_etapa",
          numeroExecucoes
        };
      }
    }
    const campo = buscarElementoDeep("#txtDescricaNCM") || buscarElementoDeep('textarea[name$="txtDescricaNCM"]');
    const valor = (campo == null ? void 0 : campo.value) ?? (campo == null ? void 0 : campo.textContent) ?? "";
    if (valor && isMensagemNcmInvalido(valor)) {
      return { fonte: "textarea", mensagem: String(valor).trim(), tipo: "ncm_invalido" };
    }
    if (valor && isMensagemNbsInvalido(valor)) {
      return { fonte: "textarea", mensagem: String(valor).trim(), tipo: "nbs_invalido" };
    }
    if (valor && isMensagemSubGrupoInvalido(valor)) {
      return { fonte: "textarea", mensagem: String(valor).trim(), tipo: "subgrupo_invalido" };
    }
    return null;
  }
  function verificarSessao() {
    if (!document.body) return true;
    const textoBody = (document.body.textContent || "").toLowerCase();
    return !CONFIG.MENSAGENS.LOGOUT.some((ind) => textoBody.includes(ind));
  }
  function paginaOcupada() {
    var _a, _b;
    if (isBusy()) return { ocupado: true, motivo: "asp_lifecycle_busy" };
    if (typeof Sys !== "undefined" && ((_a = Sys.WebForms) == null ? void 0 : _a.PageRequestManager)) {
      try {
        const prm = Sys.WebForms.PageRequestManager.getInstance();
        if ((_b = prm == null ? void 0 : prm.get_isInAsyncPostBack) == null ? void 0 : _b.call(prm)) return { ocupado: true, motivo: "asp_async_postback" };
      } catch {
      }
    }
    const loadContainer = document.querySelector(".load");
    if (loadContainer && elementoVisivel(loadContainer)) {
      const overlay = loadContainer.querySelector(".overlay");
      const loadBar = loadContainer.querySelector(".load-bar");
      if (overlay && elementoVisivel(overlay) || loadBar && elementoVisivel(loadBar)) {
        return { ocupado: true, motivo: "visual_overlay" };
      }
    }
    return { ocupado: false };
  }
  function obterConfirmacao() {
    const modalConfirmacao = buscarElementoDeep("#dt_edita_div") || buscarElementoDeep("#divAcao") || buscarElementoDeep("#ControlesConfirmacao");
    const btnSim = buscarElementoDeep("#butSim") || buscarElementoDeep('input[name$="butSim"]');
    const btnSimContinuar = buscarElementoDeep("#butSimContinuar") || buscarElementoDeep('input[name$="butSimContinuar"]');
    const modalAberto = modalConfirmacao && elementoVisivel(modalConfirmacao) || btnSim && elementoVisivel(btnSim) || btnSimContinuar && elementoVisivel(btnSimContinuar);
    return { modalAberto: !!modalAberto, btnSim, btnSimContinuar };
  }
  function getModalUnspscContainer() {
    return buscarElementoDeep("#div1");
  }
  function isModalUnspscAberto(seletorCampo, seletorSelecionar) {
    const modalDiv1 = getModalUnspscContainer();
    const modalTable = buscarElementoDeep("#tableUNSPSC");
    const campoUnspsc = buscarElementoDeep(seletorCampo);
    const btnSelecionar = buscarElementoDeep(seletorSelecionar);
    return !!(modalDiv1 && elementoVisivel(modalDiv1) || modalTable && elementoVisivel(modalTable) || campoUnspsc && elementoVisivel(campoUnspsc) || btnSelecionar && elementoVisivel(btnSelecionar));
  }
  function detectarModoUnspsc(_seletorCampo = "", seletorSelecionar = "#butFechar") {
    const campoInline = buscarElementoDeep('#txtCodUNSPSC, input[name$="txtCodUNSPSC"]');
    const descricaoInline = buscarElementoDeep('#txtUNSPSC, input[name$="txtUNSPSC"]');
    if (campoInline && elementoVisivel(campoInline) && descricaoInline) {
      return "inline";
    }
    const modalDiv1 = getModalUnspscContainer();
    const modalTable = buscarElementoDeep("#tableUNSPSC");
    const campoModal = buscarElementoDeep('#txtCodigoUnspsc, input[name$="txtCodigoUnspsc"]');
    const btnSelecionar = buscarElementoDeep(seletorSelecionar);
    const resultado2 = buscarElementoDeep('#txtDescricao, a[id="txtDescricao"]');
    if (modalDiv1 && elementoVisivel(modalDiv1) || modalTable && elementoVisivel(modalTable) || campoModal && elementoVisivel(campoModal) || btnSelecionar && elementoVisivel(btnSelecionar) || resultado2 && elementoVisivel(resultado2)) {
      return "modal";
    }
    return "none";
  }
  function unspscDescricaoDefinida() {
    var _a;
    const campoDescricao = buscarElementoDeep('#txtUNSPSC, input[name$="txtUNSPSC"]');
    const valor = normalizarTextoSemAcento(
      (campoDescricao == null ? void 0 : campoDescricao.value) ?? ((_a = campoDescricao == null ? void 0 : campoDescricao.getAttribute) == null ? void 0 : _a.call(campoDescricao, "value")) ?? ""
    );
    if (!valor) return false;
    return !valor.includes("nao definido");
  }
  function isItemEmAtuacao(linkEl) {
    if (!linkEl) return false;
    const card = linkEl.closest(".result") || linkEl.closest('[class*="result"]');
    if (!card) return false;
    const classTokens = String(card.className || "").split(/\s+/).map((c) => c.trim().toLowerCase()).filter(Boolean);
    if (classTokens.includes("ematuacao")) return true;
    const textoCard = normalizarTextoSemAcento(card.textContent || "");
    return textoCard.includes("em atuacao");
  }
  function itemMarcadoParaPularNestaRodada(estado, itemKey) {
    var _a;
    if (!itemKey) return false;
    const itemFlags = estado == null ? void 0 : estado.itemFlags;
    return ((_a = itemFlags == null ? void 0 : itemFlags[itemKey]) == null ? void 0 : _a.skipNestaRodada) === true;
  }
  function isItemVermelho(linkEl) {
    var _a, _b;
    if (!linkEl) return false;
    const card = linkEl.closest(".result") || linkEl.closest('[class*="result"]') || linkEl;
    const html = card;
    const classTokens = String(html.className || "").split(/\s+/).map((c) => c.trim().toLowerCase()).filter(Boolean);
    if (classTokens.some((c) => c.includes("vermelh") || c.includes("danger") || c.includes("erro") || c === "red" || c.includes("red-"))) {
      return true;
    }
    const style = html.getAttribute("style") || "";
    if (/color\s*:\s*(red|#f00|#ff0000|rgb\(\s*255\s*,\s*0\s*,\s*0\s*\))/i.test(style)) return true;
    try {
      const color = ((_b = (_a = html.ownerDocument) == null ? void 0 : _a.defaultView) == null ? void 0 : _b.getComputedStyle(html).color) || "";
      if (/rgb\(\s*255\s*,\s*0\s*,\s*0\s*\)/i.test(color)) return true;
    } catch {
    }
    return false;
  }
  function classificarItemLista(linkEl, estado) {
    const key = extrairItemKey(linkEl);
    if (!key) {
      return { elemento: linkEl, key: null, elegivel: false, motivo: "sem_id" };
    }
    if (isItemEmAtuacao(linkEl) || isItemVermelho(linkEl)) {
      return { elemento: linkEl, key, elegivel: false, motivo: "item_vermelho" };
    }
    if (itemMarcadoParaPularNestaRodada(estado, key)) {
      return { elemento: linkEl, key, elegivel: false, motivo: "skip_nesta_rodada" };
    }
    return { elemento: linkEl, key, elegivel: true, motivo: null };
  }
  function encontrarItensPendentesInfo(estado) {
    const root = document.querySelector("#DIVResultado");
    if (!root) return { elegiveis: [], ignorados: 0, inelegiveisConhecidos: [], desconhecidos: [], totalVisiveis: 0 };
    const linksVisiveis = [...root.querySelectorAll('a[href*="abreSIN("]')].filter((el) => elementoVisivel(el));
    const classificacoes = linksVisiveis.map((el) => classificarItemLista(el, estado));
    const elegiveis = classificacoes.filter((item) => item.elegivel).map((item) => item.elemento);
    const inelegiveisConhecidos = classificacoes.filter((item) => item.motivo === "item_vermelho" || item.motivo === "skip_nesta_rodada").map((item) => item.elemento);
    const desconhecidos = classificacoes.filter((item) => item.motivo === "sem_id").map((item) => item.elemento);
    return {
      elegiveis,
      ignorados: inelegiveisConhecidos.length,
      inelegiveisConhecidos,
      desconhecidos,
      totalVisiveis: linksVisiveis.length
    };
  }
  function extrairItemKey(link) {
    var _a, _b;
    const href = ((_a = link == null ? void 0 : link.getAttribute) == null ? void 0 : _a.call(link, "href")) || "";
    const m = href.match(/abreSIN\(([^)]*)\)/i);
    if (!m) return null;
    const args = m[1].split(",").map((s) => s.trim());
    return ((_b = args[0]) == null ? void 0 : _b.replace(/^['"]|['"]$/g, "")) || null;
  }
  function encontrarBotaoProximo() {
    const candidatos = [
      ...document.querySelectorAll('a, button, input[type="button"], input[type="submit"]')
    ];
    for (const el of candidatos) {
      if (!elementoVisivel(el)) continue;
      const texto = normalizarTextoSemAcento(
        el.value || el.getAttribute("title") || el.getAttribute("aria-label") || el.textContent || ""
      );
      if (/\bproximo\b\s*>?/.test(texto) || texto.includes("proximo >")) return el;
    }
    return null;
  }
  function textoElementoComValor(el) {
    return normalizarEspacos(
      el.value || el.getAttribute("title") || el.getAttribute("aria-label") || el.textContent || ""
    );
  }
  function isBotaoOk(el) {
    const texto = normalizarTextoSemAcento(textoElementoComValor(el));
    return texto === "ok" || texto === "fechar" || texto === "continuar";
  }
  function isTextoProblemaImagem(texto) {
    const normalizado = normalizarTextoSemAcento(texto);
    if (!normalizado) return false;
    return normalizado.includes("imagem") && (normalizado.includes("problema") || normalizado.includes("erro") || normalizado.includes("falha")) || normalizado.includes("midia") && (normalizado.includes("problema") || normalizado.includes("erro") || normalizado.includes("falha")) || normalizado.includes("erro visual");
  }
  function detectarAvisoBloqueanteItem() {
    const botoes = [...document.querySelectorAll('button, input[type="button"], input[type="submit"], a')].filter((el) => elementoVisivel(el) && isBotaoOk(el));
    for (const btnOk of botoes) {
      const container = btnOk.closest('[role="dialog"], .modal, .swal2-popup, #divAcao, #dt_edita_div, #ControlesConfirmacao') || btnOk.parentElement || document.body;
      const mensagem = normalizarEspacos(container.textContent || textoElementoComValor(btnOk));
      if (isTextoProblemaImagem(mensagem)) {
        return { tipo: "problema_imagem", mensagem, btnOk };
      }
    }
    return null;
  }
  function parseTotalPendentesServidor(texto) {
    const raw = normalizarEspacos(texto || "");
    if (!raw) return null;
    const match = raw.match(/Exibindo\s+SIN\s+(\d+)\s+a\s+(\d+)\s+de\s+um\s+total\s+de\s+(\d+)/i);
    if (!match) return null;
    const primeiro = Number.parseInt(match[1], 10);
    const ultimo = Number.parseInt(match[2], 10);
    const total = Number.parseInt(match[3], 10);
    if (!Number.isFinite(total) || total < 0) return null;
    return {
      primeiro: Number.isFinite(primeiro) ? primeiro : null,
      ultimo: Number.isFinite(ultimo) ? ultimo : null,
      total,
      texto: raw
    };
  }
  function obterResumoPendentesServidor() {
    const candidatos = [
      "#lblExibicaoItens",
      "#lblPaginacao",
      "#lblPaginador",
      ".grid-pager",
      ".pager",
      "#DIVResultado",
      "body"
    ];
    for (const seletor of candidatos) {
      const el = seletor === "body" ? document.body : document.querySelector(seletor);
      const texto = normalizarEspacos((el == null ? void 0 : el.textContent) || "");
      if (!texto) continue;
      const parsed = parseTotalPendentesServidor(texto);
      if (parsed) return parsed;
    }
    return null;
  }
  function normalizarId(id) {
    const s = String(id ?? "").trim();
    return s || null;
  }
  function normalizarValor$1(valor) {
    const s = String(valor ?? "").trim();
    return s ? s : null;
  }
  function normalizarLei116$1(valor) {
    const raw = normalizarValor$1(valor);
    if (!raw) return null;
    const normalizado = raw.replace(",", ".");
    return normalizado || null;
  }
  function normalizarCest(valor) {
    var _a, _b;
    const raw = normalizarValor$1(valor);
    if (!raw) return null;
    const digits = raw.replace(/\D/g, "");
    if (digits.length !== 7) return raw;
    const codigo = `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 7)}`;
    const descricao = (_b = (_a = raw.match(/^\s*[\d.\s]+-\s*(.+)$/)) == null ? void 0 : _a[1]) == null ? void 0 : _b.trim();
    return descricao ? `${codigo} - ${descricao}` : codigo;
  }
  function obterParametroUrl(nomes) {
    try {
      const url = new URL(window.location.href);
      for (const nome of nomes) {
        const valor = normalizarId(url.searchParams.get(nome));
        if (valor) return valor;
      }
    } catch {
    }
    return null;
  }
  function ehValorNbs$1(valor) {
    const raw = normalizarValor$1(valor);
    if (!raw) return false;
    return CONFIG.VALIDADORES.nbs.regex.test(raw);
  }
  function extrairParteNumerica(valor, { min = 1, max = 2 } = {}) {
    const raw = normalizarValor$1(valor);
    if (!raw) return null;
    if (/[<]/.test(raw)) return null;
    const digits = raw.replace(/\D/g, "");
    if (!digits || digits.length < min || digits.length > max) return null;
    return digits;
  }
  function extrairLei116DosCampos(valorGrupo, valorSubgrupo) {
    const grupoRaw = normalizarLei116$1(valorGrupo);
    if (grupoRaw && CONFIG.VALIDADORES.lei116Servico.regex.test(grupoRaw)) {
      return grupoRaw;
    }
    const grupo = extrairParteNumerica(valorGrupo, { min: 1, max: 2 });
    const subgrupo = extrairParteNumerica(valorSubgrupo, { min: 1, max: 2 });
    if (!grupo || !subgrupo) return null;
    return `${String(Number.parseInt(grupo, 10))}.${subgrupo.padStart(2, "0").slice(-2)}`;
  }
  function extrairCampos(entry) {
    if (!entry || typeof entry !== "object") return { ncm: null, nbs: null, cest: null, unspsc: null, lei116: null };
    const e = entry;
    const nbsExplicito = normalizarValor$1(e["nbs"] ?? e["NBS"] ?? e["Nbs"]);
    const ncmRaw = normalizarValor$1(e["ncm"] ?? e["NCM"] ?? e["Ncm"]);
    let ncm2 = ncmRaw;
    let nbs = nbsExplicito;
    if (!nbs && ehValorNbs$1(ncmRaw)) {
      nbs = ncmRaw;
      ncm2 = null;
    }
    const cest = normalizarCest(e["cest"] ?? e["CEST"] ?? e["Cest"] ?? e["codCest"] ?? e["codigoCest"] ?? e["codigoCEST"]);
    const unspsc2 = normalizarValor$1(e["unspsc"] ?? e["UNSPSC"] ?? e["Unspsc"]);
    const lei116 = normalizarLei116$1(e["lei116"] ?? e["Lei116"] ?? e["lei_116"] ?? e["LEI116"]);
    return { ncm: ncm2, nbs, cest, unspsc: unspsc2, lei116 };
  }
  function parseJsonParaMapa(jsonText) {
    const raw = String(jsonText ?? "").trim();
    if (!raw) return { map: {}, warnings: [], empty: true };
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return { error: `JSON inválido: ${e.message}` };
    }
    const map = {};
    const warnings = [];
    const addEntry = (id, entryObj) => {
      const idNorm = normalizarId(id);
      if (!idNorm) return;
      const campos = extrairCampos(entryObj);
      if (!campos.ncm && !campos.nbs && !campos.cest && !campos.unspsc && !campos.lei116) {
        warnings.push(`Item ${idNorm}: sem NCM, NBS, CEST, UNSPSC ou Lei 116`);
      }
      if (campos.ncm && !CONFIG.VALIDADORES.ncm.regex.test(campos.ncm)) {
        warnings.push(`Item ${idNorm}: NCM inválido (${campos.ncm})`);
      }
      if (campos.nbs && !CONFIG.VALIDADORES.nbs.regex.test(campos.nbs)) {
        warnings.push(`Item ${idNorm}: NBS inválido (${campos.nbs})`);
      }
      if (campos.cest && !CONFIG.VALIDADORES.cest.regex.test(campos.cest)) {
        warnings.push(`Item ${idNorm}: CEST inválido (${campos.cest})`);
      }
      if (campos.unspsc && !CONFIG.VALIDADORES.unspsc.regex.test(campos.unspsc)) {
        warnings.push(`Item ${idNorm}: UNSPSC inválido (${campos.unspsc})`);
      }
      if (campos.lei116 && !CONFIG.VALIDADORES.lei116Servico.regex.test(campos.lei116)) {
        warnings.push(`Item ${idNorm}: Lei 116 inválida (${campos.lei116})`);
      }
      map[idNorm] = campos;
    };
    if (Array.isArray(data)) {
      data.forEach((item) => {
        if (!item || typeof item !== "object") return;
        const i = item;
        const id = i["id"] ?? i["ID"] ?? i["itemId"] ?? i["ItemId"] ?? i["codigo"] ?? i["Codigo"];
        addEntry(id, item);
      });
      return { map, warnings };
    }
    if (data && typeof data === "object") {
      const d = data;
      const list = Array.isArray(d["itens"]) ? d["itens"] : Array.isArray(d["items"]) ? d["items"] : null;
      if (list) {
        list.forEach((item) => {
          if (!item || typeof item !== "object") return;
          const i = item;
          const id = i["id"] ?? i["ID"] ?? i["itemId"] ?? i["ItemId"] ?? i["codigo"] ?? i["Codigo"];
          addEntry(id, item);
        });
      } else {
        Object.entries(d).forEach(([id, val]) => {
          if (id === "itens" || id === "items") return;
          if (val && typeof val === "object") addEntry(id, val);
          else addEntry(id, { ncm: val });
        });
      }
      return { map, warnings };
    }
    return { error: "JSON deve ser um objeto ou array." };
  }
  function obterItemIdAtual() {
    var _a;
    const idUrl = obterParametroUrl(["IdItem", "idItem", "itemId", "ItemId"]);
    if (idUrl) return idUrl;
    const campo = buscarElementoDeep("#txtIdItem") || buscarElementoDeep('input[name$="txtIdItem"]') || buscarElementoDeep('input[id$="txtIdItem"]') || buscarElementoDeep("#hfIdItem") || buscarElementoDeep('input[name$="hfIdItem"]') || buscarElementoDeep('input[id$="hfIdItem"]') || buscarElementoDeep("#hidIdItem") || buscarElementoDeep('input[name$="hidIdItem"]') || buscarElementoDeep('input[id$="hidIdItem"]') || buscarElementoDeep('input[name$="IdItem"]') || buscarElementoDeep('input[id$="IdItem"]') || buscarElementoDeep("#txtNum") || buscarElementoDeep('input[name="ctl00$Body$txtNum"]') || buscarElementoDeep('input[name$="txtNum"]') || buscarElementoDeep("#txtNumero") || buscarElementoDeep('input[name="ctl00$Body$txtNumero"]') || buscarElementoDeep('input[name$="txtNumero"]') || buscarElementoDeep('input[id$="txtNumero"]');
    const valor = (campo == null ? void 0 : campo.value) ?? ((_a = campo == null ? void 0 : campo.getAttribute) == null ? void 0 : _a.call(campo, "value"));
    return normalizarId(valor);
  }
  function resolverItemMapIdAtual(estado) {
    return normalizarId(estado.itemAtualTelaId) || obterItemIdAtual();
  }
  function sincronizarItemAtual(estado) {
    const idAtual = obterItemIdAtual();
    if (!idAtual) return estado.itemAtualKey || null;
    const houveMudancaTela = estado.itemAtualTelaId !== idAtual;
    if (houveMudancaTela) {
      estado.itemAtualTelaId = idAtual;
    }
    if (!estado.itemAtualKey) {
      estado.itemAtualKey = idAtual;
      estado.itemFlags = estado.itemFlags || {};
      if (!estado.itemFlags[idAtual]) estado.itemFlags[idAtual] = { unspscFeito: false };
      estado.itemMapUltimoAplicadoId = null;
      set$1(estado);
      log(`🔖 Item atual detectado: ${idAtual}`, "info");
      return idAtual;
    }
    if (houveMudancaTela) {
      set$1(estado);
      if (estado.itemAtualKey !== idAtual) {
        log(`🔎 ID tela=${idAtual} | item processamento=${estado.itemAtualKey} (mantendo item do lote)`, "info");
      }
    }
    return estado.itemAtualKey || idAtual;
  }
  function getValoresParaItem(estado, itemId) {
    if (!estado.itemMapAtivo) return null;
    const id = normalizarId(itemId);
    if (!id) return null;
    return estado.itemMap[id] || null;
  }
  function getValorAcao(acaoId, estado) {
    var _a;
    const acao = (_a = estado.acoes) == null ? void 0 : _a[acaoId];
    if (!acao) return null;
    if (!estado.itemMapAtivo || acaoId !== "ncm" && acaoId !== "cest" && acaoId !== "unspsc" && acaoId !== "lei116Servico") return acao.valor;
    const idAtual = resolverItemMapIdAtual(estado);
    const entry = getValoresParaItem(estado, idAtual);
    if (!entry) return null;
    const campoNbs = buscarElementoDeep("#txtNBS") || buscarElementoDeep('input[name$="txtNBS"]');
    const campoIncideNbs = buscarElementoDeep("#txtIncideNBS") || buscarElementoDeep('input[name$="txtIncideNBS"]');
    const incideNbs = String((campoIncideNbs == null ? void 0 : campoIncideNbs.value) ?? (campoIncideNbs == null ? void 0 : campoIncideNbs.textContent) ?? "").trim().toUpperCase() === "SIM";
    const modoServico = !!(entry.nbs || normalizarLei116$1(entry.lei116) || entry.ncm && ehValorNbs$1(entry.ncm) || campoNbs && incideNbs);
    if (acaoId === "ncm") {
      const valorFiscal = modoServico ? entry.nbs || (ehValorNbs$1(entry.ncm) ? entry.ncm : null) : entry.ncm;
      return valorFiscal != null ? valorFiscal : modoServico ? null : acao.valor;
    }
    const valor = acaoId === "cest" ? entry.cest : acaoId === "unspsc" ? entry.unspsc : entry.lei116;
    return valor != null ? valor : acao.valor;
  }
  function aplicarJson(jsonText, { silent = false } = {}) {
    var _a;
    const estado = get();
    const rawJson = String(jsonText ?? "");
    estado.itemMapJson = rawJson;
    const parsed = parseJsonParaMapa(rawJson);
    if (parsed.error) {
      set$1(estado);
      if (!silent) {
        log(`❌ JSON inválido: ${parsed.error}`, "error");
        tocar("error");
      }
      atualizarStatusUI(estado);
      return { ok: false, error: parsed.error };
    }
    if (parsed.empty) {
      estado.itemMap = {};
      estado.itemMapAtivo = false;
      estado.itemMapUltimoAplicadoId = null;
      set$1(estado);
      if (!silent) {
        log("🧹 JSON vazio: mapa limpo e desativado", "info");
        tocar("warning");
      }
      atualizarStatusUI(estado);
      return { ok: true, warnings: [] };
    }
    estado.itemMap = parsed.map || {};
    estado.itemMapAtivo = true;
    estado.itemMapUltimoAplicadoId = null;
    set$1(estado);
    if (!silent) {
      const total = Object.keys(estado.itemMap).length;
      log(`🧾 JSON aplicado: ${total} itens carregados`, "info");
      if ((_a = parsed.warnings) == null ? void 0 : _a.length) {
        const resumo = parsed.warnings.slice(0, 3).join(" | ");
        log(`⚠️ JSON: ${resumo}${parsed.warnings.length > 3 ? " ..." : ""}`, "warn");
      }
      tocar("success");
    }
    atualizarStatusUI(estado);
    return { ok: true, warnings: parsed.warnings || [] };
  }
  function aplicarParaItemAtual(estado) {
    if (!estado.itemMapAtivo) {
      atualizarStatusUI(estado);
      return null;
    }
    const idAtual = resolverItemMapIdAtual(estado);
    if (!idAtual) {
      atualizarStatusUI(estado);
      return null;
    }
    const entry = getValoresParaItem(estado, idAtual);
    if (entry && estado.itemMapUltimoAplicadoId !== idAtual) {
      log(`🧾 JSON aplicado ao item ${idAtual}: NCM ${entry.ncm || "-"} / NBS ${entry.nbs || "-"} / CEST ${entry.cest || "-"} / UNSPSC ${entry.unspsc || "-"} / Lei116 ${entry.lei116 || "-"}`, "info");
      estado.itemMapUltimoAplicadoId = idAtual;
      set$1(estado);
    }
    atualizarStatusUI(estado, { itemId: idAtual, entry: entry ?? void 0 });
    return entry;
  }
  function atualizarStatusUI(estado, { itemId, entry } = {}) {
    const el = document.getElementById("itemMapStatus");
    if (!el) return;
    const ativo = !!estado.itemMapAtivo;
    const total = Object.keys(estado.itemMap || {}).length;
    const idAtual = itemId || resolverItemMapIdAtual(estado) || estado.itemAtualKey;
    const dados = entry || (idAtual ? estado.itemMap[idAtual] : null);
    let texto = ativo ? `JSON ativo: ${total} itens.` : "JSON por ID desativado.";
    if (ativo && idAtual) {
      if (dados) texto += ` Item ${idAtual}: NCM ${dados.ncm || "-"} / NBS ${dados.nbs || "-"} / CEST ${dados.cest || "-"} / UNSPSC ${dados.unspsc || "-"} / Lei116 ${dados.lei116 || "-"}.`;
      else texto += ` Item ${idAtual}: sem entrada no JSON.`;
    }
    el.textContent = texto;
    el.style.color = ativo ? "#0b7285" : "#666";
  }
  function gerarJsonDoItemAtual(textareaEl) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const estado = get();
    const idAtual = resolverItemMapIdAtual(estado) || estado.itemAtualKey;
    if (!idAtual) {
      log("⚠️ Não foi possível localizar o ID do item atual (#txtNum)", "warn");
      tocar("warning");
      return;
    }
    const campoNcm = encontrarCampoNcmPreferido(((_b = (_a = estado.acoes) == null ? void 0 : _a["ncm"]) == null ? void 0 : _b.seletor) ?? "");
    const campoNbs = buscarElementoDeep("#txtNBS") || buscarElementoDeep('input[name$="txtNBS"]');
    const campoCest = buscarElementoDeep("#txtCest") || buscarElementoDeep('input[name$="txtCest"]');
    const campoUnspsc = buscarElementoDeep("#txtCodigoUnspsc, #txtCodUNSPSC") || buscarElementoDeep('input[name$="txtCodigoUnspsc"], input[name$="txtCodUNSPSC"]');
    const campoLei116Grupo = encontrarCampoLei116Grupo();
    const campoLei116Subgrupo = encontrarCampoLei116Subgrupo();
    let ncm2 = normalizarValor$1(campoNcm == null ? void 0 : campoNcm.value) || normalizarValor$1((_d = (_c = estado.acoes) == null ? void 0 : _c["ncm"]) == null ? void 0 : _d.valor);
    let nbs = normalizarValor$1(campoNbs == null ? void 0 : campoNbs.value);
    if (!nbs && ehValorNbs$1(ncm2)) {
      nbs = ncm2;
      ncm2 = null;
    }
    const unspsc2 = normalizarValor$1(campoUnspsc == null ? void 0 : campoUnspsc.value) || normalizarValor$1((_f = (_e = estado.acoes) == null ? void 0 : _e["unspsc"]) == null ? void 0 : _f.valor);
    const cest = normalizarCest(campoCest == null ? void 0 : campoCest.value) || normalizarCest((_h = (_g = estado.acoes) == null ? void 0 : _g["cest"]) == null ? void 0 : _h.valor);
    const lei116 = extrairLei116DosCampos(campoLei116Grupo == null ? void 0 : campoLei116Grupo.value, campoLei116Subgrupo == null ? void 0 : campoLei116Subgrupo.value);
    if (!ncm2 && !nbs && !cest && !unspsc2 && !lei116) {
      log("⚠️ Não foi possível ler NCM, NBS, CEST, UNSPSC ou Lei 116 para montar o JSON", "warn");
      tocar("warning");
      return;
    }
    const rawAtual = textareaEl ? textareaEl.value : estado.itemMapJson;
    const parsed = parseJsonParaMapa(rawAtual);
    if (parsed.error && rawAtual.trim()) {
      log("⚠️ JSON atual inválido. Criando novo mapa.", "warn");
    }
    const map = parsed.error ? {} : parsed.map || {};
    map[idAtual] = { ncm: ncm2 || null, nbs: nbs || null, cest: cest || null, unspsc: unspsc2 || null, lei116: lei116 || null };
    const jsonFinal = JSON.stringify(map, null, 2);
    if (textareaEl) textareaEl.value = jsonFinal;
    aplicarJson(jsonFinal, { silent: true });
    log(`🧾 JSON criado/atualizado para item ${idAtual}`, "info");
    tocar("success");
  }
  const NCM_SH_COM_CEST = `
3815.12.10 3815.12.90 3917 3918.10.00 3923.30.00 3926.30.00 4010.3 5910.00.00 4016.93.00
4823.90.9 4016.10.10 4016.99.90 5705.00.00 5903.90.00 5909.00.00 6306.1 6506.10.00
6813 7007.11.00 7007.21.00 7009.10.00 7014.00.00 7311.00.00 7320 7325 7806 8007.00.90
8301.2 8301.6 8301.7 8302.10.00 8302.30.00 8310 8407.3 8408.2 8409.9 8412.2 8413.3
8414.10.00 8414.80.1 8414.80.2 8413.91.90 8414.90.10 8414.90.3 8414.90.39 8415.2
8421.23.00 8421.29.90 8421.9 8424.10.00 8421.31.00 8421.39.20 8425.42.00 8431.10.10
8431.49.2 8433.90.90 8481.10.00 8481.2 8481.80.92 8482 8483 8484 8505.2 8507.1 8511
8512.2 8512.4 8512.90.00 8517.12.13 8518 8518.50.00 8519.81 8525.50.1 8525.60.10 8527.2
8527.21.90 8521.90.90 8529.10.90 8534.00.00 8535.3 8536.5 8536.10.00 8536.20.00 8536.4
8538 8539.1 8539.2 8544.20.00 8544.30.00 8707 8708 8714.1 8716.90.90 9026.1 9026.2
9029 9030.33.21 9031.80.40 9032.89.2 9104.00.00 9401.20.00 9401.90.90 9613.80.00 4009
4504.90.00 6812.99.10 4823.40.00 3919.10.00 3919.90.00 8708.29.99 8412.31.10
8413.19.00 8413.50.90 8413.81.00 8413.60.19 8413.70.10 8414.59.10 8414.59.90 8421.39.90
8501.10.19 8501.31.10 8504.50.00 8507.2 8507.3 8512.30.00 9032.89.8 9032.89.9 9027.10.00
4008.11.00 5601.22.19 5703.20.00 5703.30.00 5911.90.00 6903.90.99 7007.29.00 7314.50.00
7315.11.00 7315.12.10 8418.99.00 8419.5 8424.90.90 8425.49.10 8431.41.00 8501.61.00
8531.10.90 9014.10.00 9025.19.90 9025.90.10 9026.9 9032.10.10 9032.10.90 9032.20.00
8716.9 7322.90.10
2205 2208.90.00 2207.2 2208.40.00 2206.00.90 2208.20.00 2208.50.00 2208.70.00 2208.3
2206.00.10 2204 2206 2207 2208 2201.10.00 2202.90.00 2202 2106.90.10 2106.90.90 2101.2
2202.10.00 2203.00.00 2402 2403.1 2523 2710.12.59 2710.12.51 2710.19.19 2710.19.11
2710.19.2 2710.19.3 2710.19.9 2710.9 2711 2711.19.10 2711.11.00 2711.21.00 2713
3826.00.00 3403 2710.20.00 2716.00.00
4016.99.90 4417.00.10 4417.00.90 6804 8201 8202.20.00 8202.91.00 8202 8203 8204 8205
8206 8207.4 8207.6 8207.7 8207 8208 8209.00.11 8209 8211 8213 8467 9015 9017.20.00
9017.3 9017.8 9017.90.90 9025.11.90 9025.90.10 9025.19 9025.90.90
8539 8540 8504.10.00 8536.5 8543.70.99 2522 3816.00.1 3824.50.00 3214.90.00 3910 3916
3918 3919 3920 3921 3922 3924 3925.10.00 3925.9 3925.20.00 3925.30.00 3926.9 4814
6810.19.00 6811 6901.00.00 6902 6904 6905 6906.00.00 6907 6908 6910 6912.00.00 7003
7004 7005 7007.19.00 7007.29.00 7008 7016 7214.20.00 7308.90.10 7213 7217.10.90
7312 7217.2 7307 7308.30.00 7308.40.00 7308.9 7308.90.90 7310 7313.00.00 7314
7315.12.90 7315.82.00 7317 7318 7323 7324 7325 7326 7407 7411.10.10 7412 7415
7418.20.00 7607.19.90 7608 7609.00.00 7610 7615.20.00 7616 8302.41.00 8301 8307 8311 8481
2828.90.11 2828.90.19 3206.41.00 3808.94.19 3401.20.90 3402.20.00 3402 3809.91.90
3924.10.00 3924.90.00 6805.30.10 6805.30.90 2207 2208.90.00 7323.10.00 8504 8516 8535
8536 8538 7413.00.00 8544 7605 7614 8546 8547
3003 3004 3006.60.00 2936 3006.3 3002 3005 3005.10.90 4015.11.00 4015.19.00 4014.10.00
9018.31 9018.32.1 3926.90.90 9018.90.99 4823.20.9 4823.6 4813.10.00 3924 3923.2
4011.10.00 4011 4011.40.00 4011.50.00 4012.1 4012.9 4013 4013.20.00
1704.90.10 1806.31.10 1806.31.20 1806.32.10 1806.32.20 1806.90.00 1704.90.90 2009
2009.8 402.1 402.2 402.9 1901.10.20 1901.10.10 1901.10.90 1901.10.30 0401.10.10
0401.20.10 0401.40.10 0401.50.10 0401.10.90 0401.20.90 0401.40.2 0402.21.30 0402.29.30
0402.29.20 403 0403.90.00 406 0405.10.00 1517.10.00 1517.9 1516.20.00 1901.90.20
1904.10.00 1904.90.00 1905.90.90 2005.20.00 2005.9 2008.1 2103.20.10 2103.90.21
2103.90.91 2103.10.10 2103.30.10 2103.30.21 2103.90.11 2002 1704.90.90 1904.20.00
1101.00.10 1101.00.20 1901.20.00 1901.90.90 1902.30.00 1902 1902.40.00 1902.1 1905.2
1905.20.90 1905.20.10 1905.31 1905.90.20 1905.32 1905.4 1905.90.10 1905.10.00 1905.9
1507.90.11 1508 1509 1510.00.00 1512.19.11 1512.29.10 1514.1 1515.19.00 1515.29.10
1512.29.90 1517.90.10 1511 1513 1514 1515 1516 1518 1601.00.00 1602 1604 1605 206
0210.20.00 0210.99.00 1502 201 202 204 1502.10.19 1502.90.00 203 207 209 210.1 1501
710 811 2001 2004 2005 2006.00.00 2007 2008 901 902 1211.90.90 2106.90.90 903 1701.1
1701.99.00 1701.91.00 1701.91 1702 2008.19.00 2101.1 2101.2 1901.90.90 2101.11.90 2101.12.00
6911.10.10 6911.10.90 6912.00.00 3213.10.00 3916.20.00 3916.10.00 3916.9 3926.10.00
4202.1 4202.9 3926.90.90 4802.20.90 4811.90.90 4802.54.9 4802.54.99 4802.57.99
4816.20.00 4802.56.9 4802.57.9 4802.58.9 3703.10.10 3703.10.29 3703.20.00 3703.90.10
3704.00.00 4802.20.00 4810.13.90 4816.90.10 3920.20.19 4806.20.00 4810.22.90 4809
4816 4817 4820.10.00 4820.20.00 4820.30.00 4820.40.00 4820.50.00 4820.90.00 4909.00.00
9608.10.00 9608.20.00 9608.30.00 9608 4802.56 5210.59.90 7607.11.90
1211.90.90 2712.10.00 2814.20.00 2847.00.00 3006.70.00 3301 3303.00.10 3303.00.20
3304.10.00 3304.20.10 3304.20.90 3304.30.00 3304.91.00 3304.99.10 3304.99.90 3305.10.00
3305.20.00 3305.30.00 3305.90.00 3306.10.00 3306.20.00 3306.90.00 3307.10.00 3307.20.10
3307.20.90 3307.30.00 3307.90.00 3401.11.90 3401.19.00 3401.20.10 3401.30.00 4014.90.10
4014.90.90 3924.90.00 3926.90.40 3926.90.90 4202.1 4818.10.00 4818.20.00 4818.30.00
4818.90.90 9619.00.00 5601.21.90 5603.92.90 8203.20.90 8214.10.00 8214.20.00 9025.11.10
9025.19.90 9603.2 9603.21.00 9603.30.00 9605.00.00 9615 9616.20.00 3923.30.00 7010.20.00
8212.10.20 8212.20.10
7321.11.00 7321.81.00 7321.90.00 8418.10.00 8418.21.00 8418.29.00 8418.30.00 8418.40.00
8418.5 8418.69.9 8418.69.99 8418.99.00 8421.12 8421.19.90 8421.9 8422.11.00 8422.90.10
8443.31 8443.32 8443.9 8450.11.00 8450.12.00 8450.19.00 8450.2 8450.9 8451.21.00 8451.29.90
8451.9 8452.10.00 8471.3 8471.4 8471.50.10 8471.60.5 8471.60.90 8471.7 8471.9 8473.3
8504.3 8504.40.10 8504.40.40 8507.80.00 8508 8509 8509.80.10 8516.10.00 8516.40.00
8516.50.00 8516.60.00 8516.71.00 8516.72.00 8516.79 8516.90.00 8517.11.00 8517.12.3
8517.12 8517.18.9 8517.62.5 8518 8519 8522 8527.1 8519.81.90 8521.90.10 8521.90.90
8523.51.10 8523.52.00 8525.80.2 8527.9 8528.49.29 8528.59.20 8528.69 8528.61.00 8528.51.20
8528.7 9006.1 9006.40.00 9018.90.50 9019.10.00 9032.89.11 9504.50.00 8517.62.1
8517.62.22 8517.62.39 8517.62.4 8517.62.62 8517.62.9 8517.70.21 8214.90 8510 8414.5
8414.59.90 8414.60.00 8414.90.20 8415.1 8415.8 8415.10.11 8415.10.19 8415.10.90
8415.90.10 8415.90.20 8421.21.00 8424.30.10 8424.30.90 8424.90.90 8467.21.00 8516.2
8516.31.00 8516.32.00 8527 8479.60.00 8415.90.90 8525.80.19 8423.10.00 8540 8517
8529 8531 8531.1 8531.80.00 8534 8541.40.11 8541.40.21 8541.40.22 8543.70.92 9030.3
9030.89 9107 9405 2309 2105 1806 1901 2106 3208 3209 3210 2821 3204.17.00 3206
8711 7009 7013 7013.37.00 7013.42.90
`;
  const NCM_SH_COM_CEST_NORMALIZADOS = [...new Set(
    NCM_SH_COM_CEST.split(/\s+/).map((valor) => valor.replace(/\D/g, "")).filter(Boolean)
  )];
  const EMPRESAS_NCM = [
    "3RPETROLEUM",
    "ACCOR",
    "ACECO",
    "AÇOTEL",
    "AES",
    "AGRARIA",
    "AGRICOLA FAMOSA",
    "AGROGALAXY",
    "AGROVALE",
    "ALBIOMA",
    "ALCOA",
    "ALGAFARMING",
    "ALPEK",
    "AMYRIS",
    "ANGLOS",
    "ANGRIVEST",
    "APPLUS",
    "ARDAGH",
    "ATERPA",
    "AURAMINERALS",
    "AZUL",
    "AYOSHI",
    "BAHIAGAS",
    "BAHIANA",
    "BAYER",
    "BAYER SEMENTES",
    "BBA",
    "BBTS",
    "BELEM BIOENERGIA",
    "BENEL",
    "BEMISA",
    "BERNEK",
    "BIOAROEIRA",
    "BIONOVIS",
    "BONDINHO",
    "BOPAPER",
    "BRASILATA",
    "BRISANET",
    "BRK",
    "BRZ",
    "BSM",
    "C&C",
    "CAM",
    "CAMPRO",
    "CARMO ENERGY",
    "CARMOENERGY",
    "CARTA FABRIL",
    "CBO",
    "CBC",
    "CBL",
    "CEDRO",
    "CEI",
    "CATTALINI",
    "CITROSUCO",
    "CMAA",
    "CINPAL",
    "CMOC",
    "CONNECTOWAY",
    "CONTOUR",
    "COPEL",
    "COTY",
    "COTY(CANCELOU)",
    "CRASA",
    "CRISTAL EMBALAGEM",
    "CRM",
    "CSP",
    "CTG",
    "CTG-P",
    "DPSP",
    "DUAS RODAS",
    "DUKE",
    "ECO ENERGIA",
    "ECORODOVIAS",
    "EDP",
    "ELCANO",
    "ELECNOR",
    "ELFSM",
    "ELETROBRAS",
    "EQUATORIAL ENERGIA",
    "ESM",
    "EXPRESSO SÃO MIGUEL",
    "ESM(EXPRESSO SÃO MIGUEL)",
    "ETEX-GYPSUM",
    "FABER CASTEL",
    "FERROPORT",
    "FIEP",
    "FIEPE",
    "FORMITEX",
    "FORTLEV",
    "FORACO",
    "FS",
    "FURUKAWA",
    "GARBUIO",
    "GDM",
    "GEOPAR",
    "GILBARCO",
    "GM",
    "GNA",
    "GRAPHCOA",
    "GREEN4T",
    "GSINIMA",
    "GS INIMA",
    "GRUPO BARIGUI",
    "GRUPODECIO",
    "GRUPOPROGRESSO",
    "GRUPO SADA",
    "GRUPO SCHEFFER",
    "GRUPO WEBLER",
    "GTM",
    "GVR",
    "GSM",
    "HIDROVIAS",
    "HOCHSCHILD",
    "INSOLO",
    "ICONIC",
    "INTERCEMENT",
    "IRANI",
    "ITAIPU",
    "JDEMITO",
    "JOTABASSO",
    "KALMAR",
    "KAROON",
    "KINROSS",
    "KRONA",
    "LHOIST",
    "LAGOA SANTA",
    "LARGOINC",
    "LEAGOLD/BRIO",
    "LEBES",
    "LOCALFRIO",
    "LOGIN",
    "LUNDIN",
    "M DIAS BRANCO",
    "MACENGENHARIA",
    "MAC ENG.",
    "MAC ENG",
    "MARISTA",
    "MERCADO LIBRE",
    "MEZENERGIA",
    "METASA",
    "MINERAÇÃO CARAIBA",
    "MILPLAN",
    "MI ELECTRIC",
    "MIP",
    "MIRABELA",
    "MMI",
    "MODEC",
    "MRN",
    "MRNV6",
    "MRNv6",
    "MULTILIXO",
    "MVV",
    "NORSUL",
    "NOVELIS",
    "NTS",
    "NPE",
    "NX GOLD",
    "OCEAN PACT",
    "OCEANICA",
    "OCYAN-TK",
    "ODONTOPREV",
    "OLEOPLAN",
    "ONNO LOG",
    "OOG",
    "ORIGEM",
    "ORIZON",
    "ORTOBOM",
    "OXITENO",
    "OZ MINERALS",
    "OWENS",
    "PAGOLD",
    "PAGUE MENOS",
    "PARAIBUNA",
    "PATENSE",
    "PETROBRAS",
    "PETRORECONCAVO",
    "PETRORIO",
    "PLANATERRA",
    "POSIDONIA",
    "POTENCIAL",
    "PRO NOVA",
    "RECH",
    "REFRAMAX",
    "RIO ENERGY",
    "RIOSULENSE",
    "RNP",
    "RODONAVES",
    "SABESP",
    "SAE",
    "SANTHER",
    "SARAH",
    "SCALA",
    "SB ALIMENTOS",
    "SB ALIMENTOS(CANCELOU)",
    "SBM OFFSHORE DO BRASIL LTDA",
    "SHOULDER",
    "SCHULZ COMPRESSORES",
    "SIEMENS ENERGY",
    "SER EDUCACIONAL",
    "SGB",
    "SOIN",
    "SLC",
    "SUMITOMO",
    "SUPER GASBRAS",
    "SUPERVIA",
    "SYMRISE",
    "TAM",
    "TANAC",
    "TEMA",
    "TEGMA",
    "TERNIUM",
    "THECNIP",
    "THYSSENKRUPP",
    "TIROL",
    "TRAMONTINA",
    "TRANSPES",
    "TRES CORAÇÕES",
    "UMICORE",
    "UNIGEL",
    "UNIVERSAL",
    "USINA SANTA VITORIA",
    "VALE",
    "VALID",
    "VAXXINOVA",
    "VERO",
    "VERACEL",
    "VERDEFORTE",
    "VERENE",
    "VETORIAL",
    "VILARES METALS",
    "VOESTALPINE",
    "VOPAK",
    "WHB",
    "WOBBEN",
    "WOODBRIDGE",
    "WILSON SONS",
    "YAMANA",
    "ZILOR",
    "ZORTEA"
  ];
  const EMPRESAS_LEI116_QUANDO_NBS = [
    "3RPETROLEUM",
    "ACCOR",
    "ACECO",
    "AÇOTEL",
    "AES",
    "AGRICOLA FAMOSA",
    "AGROGALAXY",
    "AGROVALE",
    "ALCOA",
    "ALPEK",
    "AMYRIS",
    "APPLUS",
    "ARDAGH",
    "ATERPA",
    "AURAMINERALS",
    "AZUL",
    "AYOSHI",
    "BAYER SEMENTES",
    "BBA",
    "BELEM BIOENERGIA",
    "BENEL",
    "BEMISA",
    "BERNEK",
    "BIOAROEIRA",
    "BIONOVIS",
    "BOPAPER",
    "BRISANET",
    "BRK",
    "BRZ",
    "BSM",
    "C&C",
    "CAM",
    "CAMPRO",
    "CARMO ENERGY",
    "CARMOENERGY",
    "CARTA FABRIL",
    "CBC",
    "CBL",
    "CEDRO",
    "CATTALINI",
    "CITROSUCO",
    "CMAA",
    "CINPAL",
    "CONNECTOWAY",
    "CONTOUR",
    "COPEL",
    "COTY",
    "COTY(CANCELOU)",
    "CRASA",
    "CTG-P",
    "DPSP",
    "DUAS RODAS",
    "ECORODOVIAS",
    "EDP",
    "ELCANO",
    "ELECNOR",
    "ELFSM",
    "ELETROBRAS",
    "EQUATORIAL ENERGIA",
    "ESM",
    "EXPRESSO SÃO MIGUEL",
    "ESM(EXPRESSO SÃO MIGUEL)",
    "ETEX-GYPSUM",
    "FABER CASTEL",
    "FIEP",
    "FIEPE",
    "FORMITEX",
    "FORACO",
    "FS",
    "FURUKAWA",
    "GARBUIO",
    "GDM",
    "GEOPAR",
    "GILBARCO",
    "GNA",
    "GREEN4T",
    "GSINIMA",
    "GS INIMA",
    "GRUPO BARIGUI",
    "GRUPODECIO",
    "GRUPOPROGRESSO",
    "GRUPO SADA",
    "GRUPO SCHEFFER",
    "GRUPO WEBLER",
    "GVR",
    "GSM",
    "HIDROVIAS",
    "HOCHSCHILD",
    "INTERCEMENT",
    "IRANI",
    "ITAIPU",
    "JDEMITO",
    "KALMAR",
    "KAROON",
    "KRONA",
    "LHOIST",
    "LAGOA SANTA",
    "LARGOINC",
    "LOCALFRIO",
    "M DIAS BRANCO",
    "MACENGENHARIA",
    "MAC ENG.",
    "MAC ENG",
    "MARISTA",
    "MERCADO LIBRE",
    "MEZENERGIA",
    "METASA",
    "MINERAÇÃO CARAIBA",
    "MILPLAN",
    "MI ELECTRIC",
    "MIP",
    "MMI",
    "MRN",
    "MRNV6",
    "MRNv6",
    "MULTILIXO",
    "NPE",
    "NX GOLD",
    "OCEAN PACT",
    "OCEANICA",
    "OCYAN-TK",
    "ODONTOPREV",
    "OLEOPLAN",
    "ONNO LOG",
    "OOG",
    "ORIGEM",
    "ORIZON",
    "OXITENO",
    "OZ MINERALS",
    "OWENS",
    "PAGOLD",
    "PAGUE MENOS",
    "PARAIBUNA",
    "PATENSE",
    "PETROBRAS",
    "PETRORECONCAVO",
    "PETRORIO",
    "PLANATERRA",
    "POSIDONIA",
    "POTENCIAL",
    "PRO NOVA",
    "REFRAMAX",
    "RIO ENERGY",
    "RIOSULENSE",
    "RNP",
    "RODONAVES",
    "SABESP",
    "SAE",
    "SANTHER",
    "SARAH",
    "SCALA",
    "SB ALIMENTOS",
    "SB ALIMENTOS(CANCELOU)",
    "SBM OFFSHORE DO BRASIL LTDA",
    "SHOULDER",
    "SCHULZ COMPRESSORES",
    "SIEMENS ENERGY",
    "SER EDUCACIONAL",
    "SGB",
    "SUMITOMO",
    "SUPER GASBRAS",
    "SUPERVIA",
    "SYMRISE",
    "TAM",
    "TANAC",
    "TEMA",
    "TEGMA",
    "TERNIUM",
    "THECNIP",
    "THYSSENKRUPP",
    "TIROL",
    "TRAMONTINA",
    "TRANSPES",
    "UMICORE",
    "UNIGEL",
    "UNIVERSAL",
    "USINA SANTA VITORIA",
    "VALID",
    "VAXXINOVA",
    "VERO",
    "VERACEL",
    "VERDEFORTE",
    "VERENE",
    "VETORIAL",
    "VILARES METALS",
    "VOESTALPINE",
    "VOPAK",
    "WHB",
    "WOBBEN",
    "WOODBRIDGE",
    "ZILOR"
  ];
  const EMPRESAS_UNSPSC = [
    "3RPETROLEUM",
    "ACCOR",
    "AGRICOLA FAMOSA",
    "AGROVALE",
    "ALCOA",
    "ALGAFARMING",
    "ALPEK",
    "AMYRIS",
    "ANGLOS",
    "ANGRIVEST",
    "APPLUS",
    "ATERPA",
    "AZUL",
    "BAYER SEMENTES",
    "BBTS",
    "BELEM BIOENERGIA",
    "BENEL",
    "BIOAROEIRA",
    "BOPAPER",
    "BRADESCO",
    "BRASILATA",
    "BRISANET",
    "BRZ",
    "C&C",
    "CAM",
    "CAMPRO",
    "CBL",
    "CATTALINI",
    "CINPAL",
    "CONTOUR",
    "COOPERCITRUS",
    "COPEL",
    "COTY",
    "COTY(CANCELOU)",
    "DUAS RODAS",
    "ECO ENERGIA",
    "ELCANO",
    "ELECNOR",
    "EQUATORIAL ENERGIA",
    "ETEX-GYPSUM",
    "FERROPORT",
    "FORMITEX",
    "FORACO",
    "FS",
    "FURUKAWA",
    "GARBUIO",
    "GDM",
    "GEOPAR",
    "GILBARCO",
    "GRUPODECIO",
    "GRUPOPROGRESSO",
    "GRUPO SADA",
    "GSM",
    "HOCHSCHILD",
    "ITAIPU",
    "JDEMITO",
    "KINROSS",
    "LHOIST",
    "LEAGOLD/BRIO",
    "M DIAS BRANCO",
    "MACENGENHARIA",
    "MAC ENG.",
    "MAC ENG",
    "MARISTA",
    "MERCADO LIBRE",
    "MINERAÇÃO CARAIBA",
    "MILPLAN",
    "MODEC",
    "MODEC GHANA",
    "MOSAIC",
    "MRN",
    "MRNV6",
    "MRNv6",
    "NX GOLD",
    "ODONTOPREV",
    "OOG",
    "ORIGEM",
    "ORIZON",
    "ORTOBOM",
    "OXITENO",
    "OZ MINERALS",
    "PAGUE MENOS",
    "PETROBRAS",
    "PETRORIO",
    "PLANATERRA",
    "POTENCIAL",
    "RECH",
    "RESIA",
    "RIO ENERGY",
    "RNP",
    "SARAH",
    "SCALA",
    "SBM OFFSHORE DO BRASIL LTDA",
    "SIEMENS",
    "SIEMENS ENERGY",
    "SOIN",
    "SUPERVIA",
    "TDK",
    "TEMA",
    "TEGMA",
    "TERNIUM",
    "THECNIP",
    "TIGRE",
    "TRAMONTINA",
    "TRANSPES",
    "UMICORE",
    "UNIGEL",
    "VALID",
    "VAXXINOVA",
    "VERACEL",
    "VERDEFORTE",
    "VERENE",
    "VILARES METALS",
    "VOESTALPINE",
    "VOPAK",
    "WOODBRIDGE"
  ];
  const EMPRESAS_CEST_QUANDO_NCM = [
    "ACCOR",
    "ACECO",
    "AZUL",
    "DPSP",
    "EDP",
    "ELFSM",
    "GREEN4T",
    "GRUPODECIO",
    "LEBES",
    "M DIAS BRANCO",
    "PAGOLD",
    "RODONAVES",
    "SABESP",
    "SAE",
    "SANTHER",
    "TAM",
    "TANAC",
    "TEMA",
    "TEGMA",
    "TRAMONTINA",
    "ZORTEA"
  ];
  function aplicarCampoRegra(registro, empresas, campo) {
    for (const empresa of empresas) {
      const empresaNorm = normalizarEmpresa(empresa);
      if (!empresaNorm) continue;
      registro[empresaNorm] = { ...registro[empresaNorm] || {}, [campo]: true };
    }
  }
  function criarRegrasEmpresa() {
    const regras = {};
    aplicarCampoRegra(regras, EMPRESAS_NCM, "ncm");
    aplicarCampoRegra(regras, EMPRESAS_LEI116_QUANDO_NBS, "lei116QuandoNbs");
    aplicarCampoRegra(regras, EMPRESAS_UNSPSC, "unspsc");
    aplicarCampoRegra(regras, EMPRESAS_CEST_QUANDO_NCM, "cestQuandoNcm");
    return regras;
  }
  function normalizarEspacosLocal(valor) {
    return String(valor ?? "").replace(/\s+/g, " ").trim();
  }
  function normalizarEmpresa(valor) {
    const raw = normalizarEspacosLocal(valor);
    if (!raw) return null;
    return raw.toUpperCase();
  }
  const REGRAS_EMPRESA = criarRegrasEmpresa();
  function temValor(valor) {
    return String(valor ?? "").trim() !== "";
  }
  function normalizarNcmSh(valor) {
    return String(valor ?? "").replace(/\D/g, "");
  }
  function ncmTemCestCompativel(ncm2) {
    const ncmNorm = normalizarNcmSh(ncm2);
    if (!ncmNorm) return false;
    return NCM_SH_COM_CEST_NORMALIZADOS.some((padrao) => ncmNorm.startsWith(padrao));
  }
  function loteNaoTrouxeNenhumCest(entry, itemMap) {
    const entries = itemMap ? Object.values(itemMap) : [entry];
    return !entries.some((item) => temValor(item == null ? void 0 : item.cest));
  }
  function labelCampo(campo) {
    if (campo === "ncm") return "NCM";
    if (campo === "nbs") return "NBS";
    if (campo === "cest") return "CEST";
    if (campo === "unspsc") return "UNSPSC";
    return "Lei 116";
  }
  function montarMensagem(empresa, itemId, campos, entry) {
    const labels = campos.map(labelCampo).join(", ");
    const contexto = campos.includes("cest") && temValor(entry.ncm) ? " para item com NCM no JSON" : campos.includes("lei116") && temValor(entry.nbs) ? " para serviço com NBS no JSON" : "";
    const item = itemId ? ` do item ${itemId}` : "";
    return `${empresa} exige ${labels}${contexto}${item}. Continuar mesmo assim?`;
  }
  function obterEmpresaAtual() {
    const el = buscarElementoDeep("#lblUsuario") || document.querySelector("#lblUsuario");
    const raw = normalizarEspacosLocal((el == null ? void 0 : el.textContent) || "");
    if (!raw) return null;
    const parts = raw.split("//").map((p) => normalizarEmpresa(p)).filter(Boolean);
    return parts.length >= 2 ? parts[1] : normalizarEmpresa(raw);
  }
  function avaliarCamposObrigatoriosJsonEmpresa({
    empresa,
    itemId,
    entry,
    itemMap,
    liberados = []
  }) {
    const empresaNorm = normalizarEmpresa(empresa);
    const itemNorm = normalizarEspacosLocal(itemId) || null;
    const regra = empresaNorm ? REGRAS_EMPRESA[empresaNorm] : null;
    const dados = entry || {};
    if (!empresaNorm || !regra || !entry) {
      return { valido: true, empresa: empresaNorm, itemId: itemNorm, camposFaltantes: [], mensagem: "" };
    }
    const liberadosSet = new Set(liberados);
    const faltantes = [];
    const pareceServico = temValor(dados.nbs) || temValor(dados.lei116);
    if (regra.ncm && !pareceServico && !temValor(dados.ncm) && !liberadosSet.has("ncm")) {
      faltantes.push("ncm");
    }
    if (regra.cestQuandoNcm && loteNaoTrouxeNenhumCest(dados, itemMap) && ncmTemCestCompativel(dados.ncm) && !temValor(dados.cest) && !liberadosSet.has("cest")) {
      faltantes.push("cest");
    }
    if (regra.lei116QuandoNbs && temValor(dados.nbs) && !temValor(dados.lei116) && !liberadosSet.has("lei116")) {
      faltantes.push("lei116");
    }
    if (regra.unspsc && !temValor(dados.unspsc) && !liberadosSet.has("unspsc")) {
      faltantes.push("unspsc");
    }
    return {
      valido: faltantes.length === 0,
      empresa: empresaNorm,
      itemId: itemNorm,
      camposFaltantes: faltantes,
      mensagem: faltantes.length ? montarMensagem(empresaNorm, itemNorm, faltantes, dados) : ""
    };
  }
  function normalizarItemId(itemId) {
    const valor = String(itemId ?? "").trim();
    return valor || null;
  }
  function garantirEstimativa(estado) {
    estado.estimativa = normalizarEstimativa(estado.estimativa);
    return estado.estimativa;
  }
  function inteiroPositivo(valor) {
    const num = Number(valor);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.floor(num));
  }
  function recalcularEta(estimativa, concluidos, now) {
    const totalPlanejado = inteiroPositivo(estimativa.totalPlanejado);
    estimativa.restantes = Math.max(0, totalPlanejado - concluidos);
    if (estimativa.tempoMedioReferenciaMs != null) {
      estimativa.etaRestanteMs = estimativa.tempoMedioReferenciaMs * estimativa.restantes;
      estimativa.previsaoTerminoTs = now + estimativa.etaRestanteMs;
    } else {
      estimativa.etaRestanteMs = null;
      estimativa.previsaoTerminoTs = null;
    }
  }
  function resetarRodada(estado, { totalPlanejado = 0, fonteTotal = null } = {}) {
    const total = inteiroPositivo(totalPlanejado);
    estado.estimativa = normalizarEstimativa({
      totalPlanejado: total,
      fonteTotal,
      restantes: total
    });
    return estado.estimativa;
  }
  function registrarInicioItem(estado, itemId, now = Date.now()) {
    const estimativa = garantirEstimativa(estado);
    const id = normalizarItemId(itemId);
    if (!id) return false;
    if (estimativa.itemAtualId === id && estimativa.itemAtualInicioTs != null) return false;
    estimativa.itemAtualId = id;
    estimativa.itemAtualInicioTs = now;
    return true;
  }
  function registrarConclusaoItem(estado, itemId, now = Date.now()) {
    var _a;
    const estimativa = garantirEstimativa(estado);
    const idInformado = normalizarItemId(itemId);
    const itemAtualAberto = normalizarItemId(estimativa.itemAtualId);
    const id = itemAtualAberto || idInformado;
    const concluidos = inteiroPositivo((_a = estado == null ? void 0 : estado.progresso) == null ? void 0 : _a.atual);
    const podeCalcularDuracao = estimativa.itemAtualInicioTs != null && !!id;
    const duracaoMs = podeCalcularDuracao ? Math.max(0, now - estimativa.itemAtualInicioTs) : null;
    if (estimativa.primeiroItemDuracaoMs == null && duracaoMs != null) {
      const base = Math.max(1, duracaoMs);
      estimativa.primeiroItemId = id;
      estimativa.primeiroItemDuracaoMs = base;
    }
    if (duracaoMs != null) {
      estimativa.duracaoTotalConcluidosMs = Math.max(0, Number(estimativa.duracaoTotalConcluidosMs || 0) + duracaoMs);
      estimativa.duracaoAmostras = inteiroPositivo(estimativa.duracaoAmostras) + 1;
      estimativa.tempoMedioReferenciaMs = estimativa.duracaoAmostras > 0 ? estimativa.duracaoTotalConcluidosMs / estimativa.duracaoAmostras : null;
    }
    estimativa.ultimoItemConcluidoTs = now;
    estimativa.itemAtualId = null;
    estimativa.itemAtualInicioTs = null;
    recalcularEta(estimativa, concluidos, now);
    return {
      duracaoMs,
      restantes: estimativa.restantes,
      duracaoAmostras: estimativa.duracaoAmostras,
      tempoMedioReferenciaMs: estimativa.tempoMedioReferenciaMs
    };
  }
  function formatarDuracao(ms) {
    if (ms == null || !Number.isFinite(Number(ms))) return "—";
    const totalSegundos = Math.max(0, Math.round(Number(ms) / 1e3));
    const horas = Math.floor(totalSegundos / 3600);
    const minutos = Math.floor(totalSegundos % 3600 / 60);
    const segundos = totalSegundos % 60;
    if (horas > 0) return `${horas}h ${String(minutos).padStart(2, "0")}m`;
    if (minutos > 0) return `${minutos}m ${String(segundos).padStart(2, "0")}s`;
    return `${segundos}s`;
  }
  function formatarHorario(ts) {
    if (ts == null || !Number.isFinite(Number(ts))) return "—";
    return new Date(Number(ts)).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  function obterResumoUI(estado, now = Date.now()) {
    var _a, _b, _c, _d;
    const estimativa = normalizarEstimativa(estado == null ? void 0 : estado.estimativa);
    const totalPlanejado = inteiroPositivo(estimativa.totalPlanejado || ((_a = estado == null ? void 0 : estado.progresso) == null ? void 0 : _a.total));
    const concluidos = inteiroPositivo((_b = estado == null ? void 0 : estado.progresso) == null ? void 0 : _b.atual);
    const restantes = Math.max(0, totalPlanejado - concluidos);
    const ultimoProcessado = normalizarItemId((_c = estado == null ? void 0 : estado.progresso) == null ? void 0 : _c.ultimoProcessado);
    const itemTela = normalizarItemId(estado == null ? void 0 : estado.itemAtualTelaId);
    const itemFila = normalizarItemId(estado == null ? void 0 : estado.itemAtualKey);
    const itemAtualId = estimativa.itemAtualId || (itemTela && itemTela !== ultimoProcessado ? itemTela : null) || (itemFila && itemFila !== ultimoProcessado ? itemFila : null);
    const itemAtualDecorridoMs = estimativa.itemAtualInicioTs != null ? Math.max(0, now - estimativa.itemAtualInicioTs) : null;
    const erroAtual = ((_d = estado == null ? void 0 : estado.estatisticas) == null ? void 0 : _d.ultimoErro) || null;
    const pausadoPorReincidencia = !!((estado == null ? void 0 : estado.pausado) && (erroAtual == null ? void 0 : erroAtual.tipo) === "reincidencia_etapa");
    const fonteTotal = estimativa.fonteTotal === "json" ? "JSON" : estimativa.fonteTotal === "fila" ? "Fila" : "—";
    const resumo = pausadoPorReincidencia ? "Parado por reincidência na etapa atual." : totalPlanejado > 0 ? `Item ${itemAtualId || "—"} • ${concluidos}/${totalPlanejado} concluídos • base ${fonteTotal}` : "Aguardando início do lote.";
    const tempoBaseTexto = estimativa.tempoMedioReferenciaMs != null ? formatarDuracao(estimativa.tempoMedioReferenciaMs) : itemAtualDecorridoMs != null ? `Medindo 1º item... ${formatarDuracao(itemAtualDecorridoMs)}` : "Medindo 1º item...";
    const etaRestanteTexto = estimativa.tempoMedioReferenciaMs != null ? formatarDuracao(estimativa.tempoMedioReferenciaMs * restantes) : "Aguardando base";
    const previsaoTexto = estimativa.tempoMedioReferenciaMs != null ? formatarHorario(now + estimativa.tempoMedioReferenciaMs * restantes) : "—";
    return {
      itemAtualId,
      totalPlanejado,
      concluidos,
      restantes,
      fonteTotal,
      itemAtualDecorridoMs,
      primeiroItemDuracaoMs: estimativa.primeiroItemDuracaoMs,
      duracaoTotalConcluidosMs: estimativa.duracaoTotalConcluidosMs,
      duracaoAmostras: estimativa.duracaoAmostras,
      tempoMedioReferenciaMs: estimativa.tempoMedioReferenciaMs,
      etaRestanteMs: estimativa.tempoMedioReferenciaMs != null ? estimativa.tempoMedioReferenciaMs * restantes : null,
      previsaoTerminoTs: estimativa.tempoMedioReferenciaMs != null ? now + estimativa.tempoMedioReferenciaMs * restantes : null,
      pausadoPorReincidencia,
      mensagemPausa: pausadoPorReincidencia ? (erroAtual == null ? void 0 : erroAtual.mensagem) || "Reincidência detectada" : null,
      resumo,
      tempoBaseTexto,
      etaRestanteTexto,
      previsaoTexto,
      primeiroItemTexto: estimativa.primeiroItemDuracaoMs != null ? formatarDuracao(estimativa.primeiroItemDuracaoMs) : "—"
    };
  }
  function getReportingConfig(estado) {
    const estadoAny = estado;
    return normalizarReportingConfig(estadoAny.reporting || REPORTING_DEFAULTS);
  }
  function obterProjetoLabelAtual() {
    const el = buscarElementoDeep("#lblUsuario") || document.querySelector("#lblUsuario");
    const raw = normalizarEspacos((el == null ? void 0 : el.textContent) || "");
    if (!raw) return "projeto_sem_nome";
    const parts = raw.split("//").map((p) => normalizarEspacos(p)).filter(Boolean);
    const candidato = parts.length >= 2 ? parts[1] : raw;
    return slugifyArquivo(candidato.toLowerCase(), "projeto_sem_nome");
  }
  function resolverChaveVinculoSessao(estado) {
    const projeto = obterProjetoLabelAtual();
    const estadoAny = estado;
    const jsonAtivo = !!((estadoAny == null ? void 0 : estadoAny.itemMapAtivo) && String((estadoAny == null ? void 0 : estadoAny.itemMapJson) || "").trim());
    if (jsonAtivo) {
      const hashJson = hashTexto(String(estadoAny.itemMapJson || "").trim());
      return `proj:${projeto}|json:${hashJson}`;
    }
    const itemRef = String(
      (estadoAny == null ? void 0 : estadoAny.itemAtualKey) || (estadoAny == null ? void 0 : estadoAny.itemAtualTelaId) || obterItemIdAtual() || "sem_item"
    ).trim();
    const itemSlug = slugifyArquivo(itemRef.toLowerCase(), "sem_item");
    return `proj:${projeto}|item:${itemSlug}`;
  }
  function resolverOuCriarSessionRunId(estado) {
    const key = resolverChaveVinculoSessao(estado);
    const projeto = obterProjetoLabelAtual();
    const estadoAny = estado;
    const mapa = (estadoAny == null ? void 0 : estadoAny.reportingSessionMap) && typeof estadoAny.reportingSessionMap === "object" ? estadoAny.reportingSessionMap : {};
    if (mapa[key]) return mapa[key];
    const horario = /* @__PURE__ */ new Date();
    const pad2 = (n) => String(n).padStart(2, "0");
    const stamp = `${horario.getFullYear()}${pad2(horario.getMonth() + 1)}${pad2(horario.getDate())}_${pad2(horario.getHours())}${pad2(horario.getMinutes())}${pad2(horario.getSeconds())}`;
    const curto = hashTexto(key).slice(0, 6);
    const sessionRunId = slugifyArquivo(`session_${projeto}_${stamp}_${curto}`, `session_${stamp}_${curto}`);
    update((e) => {
      const eAny = e;
      eAny.reportingSessionMap = eAny.reportingSessionMap && typeof eAny.reportingSessionMap === "object" ? eAny.reportingSessionMap : {};
      eAny.reportingSessionMap[key] = sessionRunId;
    });
    return sessionRunId;
  }
  async function touchSessionNoServico(estado, reason = "manual-stop") {
    var _a;
    const reporting = getReportingConfig(estado);
    const baseUrl = (reporting.serviceUrl || CONFIG.REPORTING.SERVICE_DEFAULT).replace(/\/+$/, "");
    const endpoint = `${baseUrl}/reports/session/touch`;
    const sessionRunId = reporting.sessionRunId || resolverOuCriarSessionRunId(estado);
    if (!sessionRunId) return { ok: false, skipped: true, reason: "session-id-empty" };
    const estadoAny = estado;
    const payload = {
      sessionRunId,
      projectName: obterProjetoLabelAtual(),
      reason,
      itemRef: String((estadoAny == null ? void 0 : estadoAny.itemAtualKey) || (estadoAny == null ? void 0 : estadoAny.itemAtualTelaId) || obterItemIdAtual() || "sem_item")
    };
    const headers = { "Content-Type": "application/json" };
    if (reporting.apiToken) headers["X-KM-Token"] = reporting.apiToken;
    const resp = await fetch(endpoint, {
      method: "POST",
      credentials: "omit",
      headers,
      body: JSON.stringify(payload)
    });
    const txt = await resp.text();
    let data = {};
    try {
      data = txt ? JSON.parse(txt) : {};
    } catch {
      data = { raw: txt };
    }
    if (!resp.ok || (data == null ? void 0 : data.ok) === false) {
      const msg = ((_a = data == null ? void 0 : data.errors) == null ? void 0 : _a.join(" | ")) || (data == null ? void 0 : data.detail) || `HTTP ${resp.status}`;
      throw new Error(msg);
    }
    return data;
  }
  function validar(key, valor) {
    const validador = CONFIG.VALIDADORES[key];
    if (!validador) return { valido: true, mensagem: "" };
    const str = String(valor ?? "");
    const valido = validador.regex.test(str);
    return { valido, mensagem: valido ? "" : validador.mensagem };
  }
  function aplicarVisual(inputElement, resultado2) {
    inputElement.style.border = resultado2.valido ? "1px solid #28a745" : "2px solid #dc3545";
    inputElement.title = resultado2.mensagem;
  }
  function normalizarValor(valor) {
    const texto = String(valor ?? "").trim();
    return texto || null;
  }
  function obterEntradaItemDoEstado(estado) {
    const itemId = String((estado == null ? void 0 : estado.itemAtualTelaId) || (estado == null ? void 0 : estado.itemAtualKey) || "").trim();
    if (!(estado == null ? void 0 : estado.itemMapAtivo) || !itemId) return null;
    const itemMap = estado == null ? void 0 : estado.itemMap;
    const entry = itemMap == null ? void 0 : itemMap[itemId];
    return entry && typeof entry === "object" ? entry : null;
  }
  function detectarContextoServico(estado, valorInformado) {
    const valor = normalizarValor(valorInformado);
    const entry = obterEntradaItemDoEstado(estado);
    const campoNbs = buscarElementoDeep("#txtNBS") || buscarElementoDeep('input[name$="txtNBS"]');
    const campoIncideNbs = buscarElementoDeep("#txtIncideNBS") || buscarElementoDeep('input[name$="txtIncideNBS"]');
    const incideNbsText = (campoIncideNbs == null ? void 0 : campoIncideNbs.value) ?? (campoIncideNbs == null ? void 0 : campoIncideNbs.textContent) ?? "";
    const incideNbs = normalizarTextoSemAcento(incideNbsText) === "sim";
    const valorPareceNbs = !!(valor && CONFIG.VALIDADORES.nbs.regex.test(valor));
    const entryPareceServico = !!(normalizarValor(entry == null ? void 0 : entry.nbs) || normalizarValor(entry == null ? void 0 : entry.lei116) || normalizarValor(entry == null ? void 0 : entry.ncm) && CONFIG.VALIDADORES.nbs.regex.test(String(entry == null ? void 0 : entry.ncm)));
    const possuiCampoNbs = !!campoNbs;
    return valorPareceNbs || entryPareceServico || possuiCampoNbs && incideNbs;
  }
  function resolverValidadorDaAcao(acaoId, estado, valorAtual) {
    if (acaoId !== "ncm") return acaoId;
    return detectarContextoServico(estado, valorAtual) ? "nbs" : "ncm";
  }
  function validarAcoesObrigatorias(getEstado, getValorAcao2, logFn, tocarErro) {
    const estado = getEstado();
    const acoes = estado.acoes;
    for (const acaoId of ["ncm", "cest", "unspsc", "lei116Servico"]) {
      const acao = acoes == null ? void 0 : acoes[acaoId];
      if (acao == null ? void 0 : acao.ativo) {
        const valorAtual = getValorAcao2(acaoId, estado);
        if (valorAtual == null || String(valorAtual).trim() === "") continue;
        const validadorId = resolverValidadorDaAcao(acaoId, estado, valorAtual);
        const resultado2 = validar(validadorId, valorAtual);
        if (!resultado2.valido) {
          logFn(`❌ Validação falhou: ${validadorId} - ${resultado2.mensagem}`, "error");
          tocarErro("error");
          return false;
        }
      }
    }
    return true;
  }
  let _atualizarBotaoToggle$1 = () => {
  };
  function setAtualizarBotaoToggle(fn) {
    _atualizarBotaoToggle$1 = fn;
  }
  async function confirmar(estado, status, { getAcao: getAcao2, getValorAcao: getValorAcao2 }) {
    const acaoConfirmar = getAcao2("confirmar", estado);
    if (!acaoConfirmar.ativo) return false;
    const confirmacao = obterConfirmacao();
    if (!confirmacao.modalAberto) return false;
    const btnSim = confirmacao.btnSim && elementoVisivel(confirmacao.btnSim) ? confirmacao.btnSim : confirmacao.btnSimContinuar && elementoVisivel(confirmacao.btnSimContinuar) ? confirmacao.btnSimContinuar : null;
    if (!btnSim) return true;
    if (!validarAcoesObrigatorias(
      () => get(),
      (id, e) => getValorAcao2(id, e),
      (msg, level) => log(msg, level),
      tocar
    )) {
      log("⚠️ Confirmação bloqueada - validação falhou", "warn");
      update((e) => {
        e.pausado = true;
      });
      _atualizarBotaoToggle$1();
      return true;
    }
    if (status) status.textContent = "Confirmando...";
    await interagir(btnSim, null, "confirmar");
    return true;
  }
  async function prosseguir(estado, status, { getAcao: getAcao2, getValorAcao: getValorAcao2, workflowState: workflowState2, itemJaTemUnspsc: itemJaTemUnspsc2, marcarItemConcluido: marcarItemConcluido2 }) {
    var _a, _b;
    const acaoUnspscCheck = getAcao2("unspsc", estado);
    if (acaoUnspscCheck.ativo) {
      const itemKey2 = estado.itemAtualKey;
      let unspscFeito = !!(itemKey2 && ((_b = (_a = estado.itemFlags) == null ? void 0 : _a[itemKey2]) == null ? void 0 : _b["unspscFeito"]));
      if (!unspscFeito && !workflowState2.isCompleta("selecionar") && itemJaTemUnspsc2(estado)) {
        unspscFeito = true;
        if (itemKey2) {
          update((e) => {
            const eAny = e;
            eAny["itemFlags"] = eAny["itemFlags"] || {};
            const flags = eAny["itemFlags"];
            const atual = flags[itemKey2] || {};
            flags[itemKey2] = { ...atual, unspscFeito: true };
          });
        }
        log(`ℹ️ UNSPSC já preenchido na tela para item ${itemKey2 || "-"}; liberando prosseguir`, "info");
      }
      if (!unspscFeito && !workflowState2.isCompleta("selecionar")) return false;
    }
    const acaoProsseguir = getAcao2("prosseguir", estado);
    if (!acaoProsseguir.ativo) return false;
    let btnProsseguir = buscarElementoDeep(acaoProsseguir.seletor);
    if (!btnProsseguir) {
      btnProsseguir = document.querySelector('input[value="Prosseguir"]') || document.querySelector("#butAcao2") || document.querySelector("#butAcao1");
    }
    if (!btnProsseguir) {
      log("⚠️ Botão Prosseguir não encontrado na página", "warn");
      return false;
    }
    if (!validarAcoesObrigatorias(
      () => get(),
      (id, e) => getValorAcao2(id, e),
      (msg, level) => log(msg, level),
      tocar
    )) {
      log("⚠️ Prosseguir bloqueado - validação falhou", "warn");
      update((e) => {
        e.pausado = true;
      });
      _atualizarBotaoToggle$1();
      return true;
    }
    if (status) status.textContent = "Prosseguindo...";
    const itemKey = estado.itemAtualKey || estado["itemAtualTelaId"] || null;
    const sucesso = await interagir(btnProsseguir, null, "prosseguir");
    if (!sucesso) return false;
    update((e) => {
      const eAny = e;
      const now = Date.now();
      let conclusao = null;
      if (typeof marcarItemConcluido2 === "function") {
        conclusao = marcarItemConcluido2(e, itemKey, { now }) || null;
      } else {
        const prog = eAny["progresso"];
        prog["atual"]++;
        prog["ultimoProcessado"] = itemKey || null;
        const est = e.estatisticas;
        est["processados"]++;
        conclusao = registrarConclusaoItem(e, itemKey, now);
      }
      if (itemKey) {
        eAny["itemFlags"] = eAny["itemFlags"] || {};
        const flags = eAny["itemFlags"];
        const atualFlags = flags[itemKey] || {};
        flags[itemKey] = {
          ...atualFlags,
          unspscModoDetectado: null,
          unspscInlinePostbackTentado: false,
          unspscInlineFallbackTentado: false,
          unspscInlineValorTentado: null
        };
      }
      const progresso = eAny["progresso"];
      const progressoAtual = Number((progresso == null ? void 0 : progresso["atual"]) || 0);
      const progressoTotal = Number((progresso == null ? void 0 : progresso["total"]) || 0);
      const itemEventoKey = itemKey || eAny["itemAtualKey"] || eAny["itemAtualTelaId"] || null;
      registrarEventoItem(e, itemEventoKey, "item_concluido", {
        itemTelaId: eAny["itemAtualTelaId"] || itemEventoKey,
        resumo: `Item concluído (${progressoAtual}/${progressoTotal})`,
        payload: {
          progressoAtual,
          progressoTotal,
          duracaoMs: (conclusao == null ? void 0 : conclusao.duracaoMs) ?? null
        },
        status: "concluido",
        now
      });
    });
    const estadoAtual = get();
    const eaProg = estadoAtual["progresso"];
    log(`✅ Item ${eaProg["atual"]}/${eaProg["total"]} processado`, "info");
    workflowState2.reset();
    return true;
  }
  const workflowState = {
    faseCompleta: /* @__PURE__ */ new Set(),
    unspscValorDigitado: false,
    unspscPesquisado: false,
    unspscSelecionado: false,
    debugMode: false,
    _debugLastSeen: /* @__PURE__ */ new Map(),
    reset() {
      this.faseCompleta.clear();
      this.unspscValorDigitado = false;
      this.unspscPesquisado = false;
      this.unspscSelecionado = false;
      this._lupaRetryCount = 0;
      log("🔄 Estado do workflow resetado", "info");
    },
    marcarCompleta(fase) {
      this.faseCompleta.add(fase);
      this.debugLog(`✓ Fase '${fase}' marcada como COMPLETA`);
    },
    isCompleta(fase) {
      return this.faseCompleta.has(fase);
    },
    debugLog(msg) {
      if (this.debugMode) {
        console.log(`[WF-DEBUG] ${msg}`);
        log(`🔍 ${msg}`, "info");
      }
    },
    debugLogThrottled(chave, msg, intervaloMs = 2500) {
      if (!this.debugMode) return;
      const now = Date.now();
      const last = this._debugLastSeen.get(chave) || 0;
      if (now - last < intervaloMs) return;
      this._debugLastSeen.set(chave, now);
      this.debugLog(msg);
    },
    getStatus() {
      return `[State: fases=${[...this.faseCompleta].join(",") || "∅"} | valorDigitado=${this.unspscValorDigitado} | pesquisado=${this.unspscPesquisado} | selecionado=${this.unspscSelecionado}]`;
    }
  };
  function normalizarItemKey(itemKey) {
    const key = String(itemKey ?? "").trim();
    return key || null;
  }
  function getTotalPlanejadoJson(estado) {
    if (!(estado == null ? void 0 : estado.itemMapAtivo)) return 0;
    return new Set(
      Object.keys(estado.itemMap || {}).map(normalizarItemKey).filter((k) => k !== null)
    ).size;
  }
  function obterConcluidosSet(estado) {
    const prog = estado == null ? void 0 : estado.progresso;
    const raw = Array.isArray(prog == null ? void 0 : prog["concluidosIds"]) ? prog["concluidosIds"] : [];
    return new Set(raw.map(normalizarItemKey).filter((k) => k !== null));
  }
  function contarConcluidosEfetivos(estado, concluidosSet = obterConcluidosSet(estado)) {
    if (!(estado == null ? void 0 : estado.itemMapAtivo)) return concluidosSet.size;
    const idsJson = new Set(Object.keys(estado.itemMap || {}).map(normalizarItemKey).filter((k) => k !== null));
    let count = 0;
    for (const key of concluidosSet) {
      if (idsJson.has(key)) count++;
    }
    return count;
  }
  function calcularTotaisDinamicos(estado, itensInfo = { elegiveis: [] }, concluidosSet = obterConcluidosSet(estado)) {
    var _a;
    if (estado == null ? void 0 : estado.itemMapAtivo) {
      const totalJson = getTotalPlanejadoJson(estado);
      const concluidosFallback = contarConcluidosEfetivos(estado, concluidosSet);
      const totalPlanejado2 = totalJson > 0 ? totalJson : concluidosFallback;
      const resumoServidor2 = obterResumoPendentesServidor();
      if (totalJson > 0 && Number.isFinite(resumoServidor2 == null ? void 0 : resumoServidor2.total)) {
        const pendentesServidor3 = Math.min(totalJson, Math.max(0, Number(resumoServidor2 == null ? void 0 : resumoServidor2.total)));
        const concluidosEfetivos2 = Math.max(0, totalJson - pendentesServidor3);
        return { totalPlanejado: totalJson, concluidosEfetivos: concluidosEfetivos2, pendentesServidor: pendentesServidor3, fonteTotal: "json" };
      }
      const pendentesServidor2 = Math.max(0, totalPlanejado2 - concluidosFallback);
      return { totalPlanejado: totalPlanejado2, concluidosEfetivos: concluidosFallback, pendentesServidor: pendentesServidor2, fonteTotal: "json" };
    }
    const concluidosEfetivos = contarConcluidosEfetivos(estado, concluidosSet);
    const resumoServidor = obterResumoPendentesServidor();
    const pendentesFallback = Math.max(0, Number(((_a = itensInfo == null ? void 0 : itensInfo.elegiveis) == null ? void 0 : _a.length) || 0));
    const pendentesServidor = Number.isFinite(resumoServidor == null ? void 0 : resumoServidor.total) ? Math.max(0, resumoServidor.total) : pendentesFallback;
    const totalPlanejado = concluidosEfetivos + pendentesServidor;
    return { totalPlanejado, concluidosEfetivos, pendentesServidor, fonteTotal: "fila" };
  }
  function aplicarTotaisDinamicosNoEstado(estado, totais, now = Date.now()) {
    const e = estado;
    e["progresso"] = e["progresso"] || { atual: 0, total: 0, ultimoProcessado: null, concluidosIds: [] };
    e["progresso"]["atual"] = totais.concluidosEfetivos;
    e["progresso"]["total"] = totais.totalPlanejado;
    e["estatisticas"] = e["estatisticas"] || { processados: 0, erros: 0, ultimoErro: null };
    e["estatisticas"]["processados"] = totais.concluidosEfetivos;
    e["estimativa"] = e["estimativa"] || {};
    const est = e["estimativa"];
    est["totalPlanejado"] = totais.totalPlanejado;
    est["fonteTotal"] = totais.fonteTotal;
    est["restantes"] = Math.max(0, totais.totalPlanejado - totais.concluidosEfetivos);
    const tempoMedio = Number(est["tempoMedioReferenciaMs"]);
    if (Number.isFinite(tempoMedio) && tempoMedio != null) {
      est["etaRestanteMs"] = tempoMedio * Number(est["restantes"]);
      est["previsaoTerminoTs"] = now + Number(est["etaRestanteMs"]);
    } else {
      est["etaRestanteMs"] = null;
      est["previsaoTerminoTs"] = null;
    }
  }
  function atualizarTotaisLote(estado, itensInfo = { elegiveis: [] }) {
    update((e) => {
      const concluidosSet = obterConcluidosSet(e);
      const totais = calcularTotaisDinamicos(e, itensInfo, concluidosSet);
      aplicarTotaisDinamicosNoEstado(e, totais, Date.now());
    });
  }
  function estaNaTelaListaItens() {
    const temFiltroLista = !!document.querySelector("#ddlOpcao");
    const temContainerResultado = !!document.querySelector("#DIVResultado");
    const temLinkItem = !!document.querySelector('#DIVResultado a[href*="abreSIN("]');
    return temFiltroLista && temContainerResultado || temLinkItem;
  }
  function itemExisteNoJsonAtivo(estado, itemKey) {
    const key = normalizarItemKey(itemKey);
    if (!(estado == null ? void 0 : estado.itemMapAtivo) || !key) return false;
    return !!getValoresParaItem(estado, key);
  }
  function limparContextoTelaStaleSeNecessario(estado) {
    const itemTelaAtual = normalizarItemKey(obterItemIdAtual());
    if (itemTelaAtual) return false;
    if (!estaNaTelaListaItens()) return false;
    const estadoAny = estado;
    if (!estadoAny["itemAtualTelaId"] && !estadoAny["itemMapUltimoAplicadoId"]) return false;
    update((e) => {
      const eAny = e;
      eAny["itemAtualTelaId"] = null;
      eAny["itemMapUltimoAplicadoId"] = null;
    });
    return true;
  }
  function tratarItemSemJsonNaRodada(estado, status, pausarComAviso2) {
    const itemTelaId = normalizarItemKey(obterItemIdAtual());
    if (!estado.itemMapAtivo) {
      const itemKey = itemTelaId || normalizarItemKey(estado.itemAtualKey);
      if (itemKey) {
        update((e) => {
          registrarEventoItem(
            e,
            itemKey,
            "json_inativo",
            {
              itemTelaId: itemTelaId || itemKey,
              resumo: "JSON ativo obrigatório ausente",
              payload: {
                itemKey,
                itemTelaId,
                motivo: "json_inativo",
                somenteNestaRodada: false
              },
              status: "pausado",
              now: Date.now()
            }
          );
        });
      }
      const mensagem2 = itemTelaId ? `Item ${itemTelaId} aberto na tela, mas não há JSON ativo. Aplique um JSON antes de retomar o robô.` : "Não há JSON ativo. Aplique um JSON antes de retomar o robô.";
      if (status) {
        status.textContent = mensagem2;
        status.style.color = "#d97706";
      }
      pausarComAviso2(mensagem2, { alertUser: false, tipo: "json_inativo" });
      return true;
    }
    if (!itemTelaId || itemExisteNoJsonAtivo(estado, itemTelaId)) return false;
    update((e) => {
      const eAny = e;
      registrarEventoItem(
        e,
        itemTelaId,
        "item_sem_json",
        {
          itemTelaId,
          resumo: "Item fora do JSON ativo",
          payload: {
            itemKey: eAny["itemAtualKey"] || null,
            itemTelaId,
            motivo: "sem_json_ativo",
            somenteNestaRodada: false
          },
          status: "pausado",
          now: Date.now()
        }
      );
    });
    const mensagem = `Item ${itemTelaId} aberto na tela não existe no JSON ativo. Revise o lote antes de retomar o robô.`;
    if (status) {
      status.textContent = mensagem;
      status.style.color = "#d97706";
    }
    pausarComAviso2(mensagem, { alertUser: false, tipo: "item_sem_json" });
    return true;
  }
  function marcarItemConcluido(estado, itemKey, { now = Date.now() } = {}) {
    const key = normalizarItemKey(itemKey) || normalizarItemKey(estado == null ? void 0 : estado.itemAtualKey) || normalizarItemKey(estado["itemAtualTelaId"]);
    const concluidosSet = obterConcluidosSet(estado);
    if (key) concluidosSet.add(key);
    const prog = estado.progresso;
    prog["concluidosIds"] = [...concluidosSet];
    if (key) prog["ultimoProcessado"] = key;
    const concluidosEfetivos = contarConcluidosEfetivos(estado, concluidosSet);
    prog["atual"] = concluidosEfetivos;
    const estat = estado.estatisticas;
    estat["processados"] = concluidosEfetivos;
    return registrarConclusaoItem(estado, key, now);
  }
  function inicializarFlagsItemAtual(estado, key) {
    log(`🔖 Iniciando item ID: ${key}`, "info");
    update((e) => {
      const eUpd = e;
      eUpd["itemAtualKey"] = key;
      eUpd["itemAtualTelaId"] = null;
      eUpd["itemMapUltimoAplicadoId"] = null;
      eUpd["itemFlags"] = eUpd["itemFlags"] || {};
      const itemFlags = eUpd["itemFlags"];
      const atual = itemFlags[key] || {};
      const repAtual = atual["reporting"] || {};
      itemFlags[key] = {
        ...atual,
        unspscFeito: false,
        unspscModoDetectado: null,
        unspscInlinePostbackTentado: false,
        unspscInlineFallbackTentado: false,
        unspscInlineValorTentado: null,
        ncmValidacaoPendenteAte: 0,
        ncmValidacaoAvisada: false,
        reporting: {
          ...repAtual,
          mediaDone: false,
          acompanhamentoDone: false,
          reportDone: false,
          mediaError: null,
          mediaErrorCode: null,
          acompanhamentoError: null,
          acompanhamentoErrorCode: null,
          reportError: null,
          reportErrorCode: null
        }
      };
    });
  }
  function marcarItemParaPularNestaRodada(estado, itemKey, motivo, mensagem = "", aliases = []) {
    const key = normalizarItemKey(itemKey) || normalizarItemKey(estado == null ? void 0 : estado.itemAtualKey) || normalizarItemKey(estado["itemAtualTelaId"]);
    if (!key) return null;
    const aliasesNormalizados = [...new Set(
      aliases.map((alias) => normalizarItemKey(alias)).filter((alias) => !!alias && alias !== key)
    )];
    update((e) => {
      const eAny = e;
      eAny["itemFlags"] = eAny["itemFlags"] || {};
      const itemFlags = eAny["itemFlags"];
      const atual = itemFlags[key] || {};
      itemFlags[key] = {
        ...atual,
        skipNestaRodada: true,
        skipMotivo: motivo,
        skipMensagem: mensagem || null,
        skipDetectadoEm: Date.now(),
        skipAliases: aliasesNormalizados
      };
      aliasesNormalizados.forEach((alias) => {
        const aliasAtual = itemFlags[alias] || {};
        itemFlags[alias] = {
          ...aliasAtual,
          skipNestaRodada: true,
          skipMotivo: motivo,
          skipMensagem: mensagem || null,
          skipDetectadoEm: Date.now(),
          skipOrigem: key
        };
      });
      registrarEventoItem(
        e,
        key,
        "item_pulado_na_rodada",
        {
          itemTelaId: normalizarItemKey(eAny["itemAtualTelaId"]) || key,
          resumo: motivo === "problema_imagem" ? "Item pulado por problema visual" : motivo === "subgrupo_invalido" ? "Item pulado por Sub Grupo inválido" : "Item pulado por marcação vermelha",
          payload: { motivo, mensagem, aliases: aliasesNormalizados },
          status: "pausado",
          now: Date.now()
        }
      );
    });
    return key;
  }
  function registrarItemAberto(estado, itemSincronizado) {
    update((e) => {
      const eAny = e;
      registrarEventoItem(
        e,
        eAny["itemAtualKey"] || itemSincronizado,
        "item_aberto",
        {
          itemTelaId: eAny["itemAtualTelaId"] || itemSincronizado,
          resumo: "Item aberto para processamento",
          payload: {
            itemTelaId: eAny["itemAtualTelaId"] || itemSincronizado,
            origem: "sincronizacao_tela"
          },
          status: "em_andamento",
          now: Date.now()
        }
      );
    });
  }
  function registrarInicioItemSeNecessario(estado, itemSincronizado) {
    var _a;
    const estAtualAny = estado;
    if (((_a = estAtualAny["estimativa"]) == null ? void 0 : _a["itemAtualId"]) === itemSincronizado) return;
    update((e) => {
      const eAny = e;
      const itemLogico = eAny["itemAtualKey"] || itemSincronizado || eAny["itemAtualTelaId"];
      registrarInicioItem(e, itemLogico, Date.now());
    });
  }
  function isValidacaoNcmLiberada(estado) {
    var _a;
    const key = estado == null ? void 0 : estado.itemAtualKey;
    if (!key) return false;
    const flags = (_a = estado.itemFlags) == null ? void 0 : _a[key];
    const pendenteAte = Number((flags == null ? void 0 : flags["ncmValidacaoPendenteAte"]) || 0);
    return pendenteAte > Date.now();
  }
  function habilitarValidacaoNcmAposInsercao(estado) {
    const key = estado == null ? void 0 : estado.itemAtualKey;
    if (!key) return;
    const pendenteAte = Date.now() + CONFIG.DELAYS.NCM_VALIDACAO_JANELA;
    update((e) => {
      const eAny = e;
      eAny["itemFlags"] = eAny["itemFlags"] || {};
      const flags = eAny["itemFlags"];
      const atual = flags[key] || {};
      flags[key] = { ...atual, ncmValidacaoPendenteAte: pendenteAte };
    });
  }
  function registrarAvisoValidacaoNcmAguardando(estado) {
    const key = estado == null ? void 0 : estado.itemAtualKey;
    if (!key) return;
    const itemFlagsAny = estado["itemFlags"];
    const flags = (itemFlagsAny == null ? void 0 : itemFlagsAny[key]) || {};
    if (flags["ncmValidacaoAvisada"]) return;
    update((e) => {
      const eAny = e;
      eAny["itemFlags"] = eAny["itemFlags"] || {};
      const flags2 = eAny["itemFlags"];
      const atual = flags2[key] || {};
      flags2[key] = { ...atual, ncmValidacaoAvisada: true };
    });
    log("ℹ️ NCM já preenchido no campo; validação de inválido só ocorre após nova inserção.", "info");
  }
  function registrarPausaCriticaNaTrilha(aviso) {
    if (!(aviso == null ? void 0 : aviso.tipo)) return;
    let tipoEvento = null;
    let resumo = "";
    let payload = {};
    if (aviso.tipo === "reincidencia_etapa") {
      tipoEvento = "pausado_por_reincidencia";
      resumo = "Pausado por reincidência da etapa";
      payload = {
        fonte: aviso.fonte || "lblExecucoes",
        numeroExecucoes: aviso.numeroExecucoes ?? null,
        mensagem: aviso.mensagem || ""
      };
    } else if (aviso.tipo === "ncm_invalido") {
      tipoEvento = "pausado_por_validacao_ncm";
      resumo = "Pausado por NCM inválido";
      payload = { mensagem: aviso.mensagem || "" };
    } else if (aviso.tipo === "nbs_invalido") {
      tipoEvento = "pausado_por_validacao_nbs";
      resumo = "Pausado por NBS inválido";
      payload = { mensagem: aviso.mensagem || "" };
    }
    if (!tipoEvento) return;
    update((e) => {
      const eAny = e;
      registrarEventoItemAtual(
        e,
        tipoEvento,
        {
          itemTelaId: eAny["itemAtualTelaId"] || eAny["itemAtualKey"] || null,
          resumo,
          payload,
          status: "pausado",
          now: Date.now()
        }
      );
    });
  }
  const LOOP_TICK_MS = 300;
  function createWorkflowScheduler(runCycle) {
    let cicloTimeoutId = null;
    let nextRunAt = 0;
    let nextAllowedActionAt = 0;
    function cancelarTimer() {
      if (cicloTimeoutId) {
        clearTimeout(cicloTimeoutId);
        cicloTimeoutId = null;
      }
      nextRunAt = 0;
    }
    function scheduleNext(ms = LOOP_TICK_MS) {
      const restanteGate = Math.max(0, nextAllowedActionAt - Date.now());
      const delayFinal = Math.max(0, ms, restanteGate);
      const now = Date.now();
      const targetAt = now + delayFinal;
      if (cicloTimeoutId && nextRunAt && nextRunAt > now) {
        if (nextRunAt <= targetAt) return;
      }
      cancelarTimer();
      nextRunAt = targetAt;
      cicloTimeoutId = setTimeout(() => {
        cicloTimeoutId = null;
        nextRunAt = 0;
        runCycle("timer");
      }, delayFinal);
    }
    function registrarInteracao2(acaoId, estado) {
      const delay = Math.max(0, Number(estado.globalActionDelayMs ?? 0));
      nextAllowedActionAt = Date.now() + delay;
      return acaoId;
    }
    return {
      cancelarTimer,
      scheduleNext,
      hasPendingTimer: () => !!(cicloTimeoutId && nextRunAt && nextRunAt > Date.now()),
      registrarInteracao: registrarInteracao2,
      getActionDelayRemainingMs: () => Math.max(0, nextAllowedActionAt - Date.now()),
      resetActionDelay: () => {
        nextAllowedActionAt = 0;
      }
    };
  }
  async function atuar(estado, status, { getAcao: getAcao2, workflowState: workflowState2 }) {
    const acaoAtuar = getAcao2("atuar", estado);
    if (!acaoAtuar.ativo) return false;
    const btnAtuar = buscarElementoDeep(acaoAtuar.seletor);
    if (!btnAtuar || !elementoVisivel(btnAtuar)) return false;
    const valorBotao = (btnAtuar.value || "").toLowerCase();
    if (!/\batuar\b/.test(valorBotao)) return false;
    if (status) status.textContent = "Atuar no Item...";
    await tentarComRetry(acaoAtuar.seletor, null, "atuar");
    workflowState2.reset();
    return true;
  }
  function ehValorNbs(valor) {
    const raw = String(valor ?? "").trim();
    return !!raw && CONFIG.VALIDADORES.nbs.regex.test(raw);
  }
  function campoLei116EhPlaceholder(valor) {
    const raw = normalizarTextoSemAcento(String(valor ?? ""));
    if (!raw) return true;
    return raw.includes("< nao definido >") || raw.includes("< nao aplicavel >");
  }
  function normalizarLei116(valor) {
    const raw = String(valor ?? "").trim().replaceAll(",", ".");
    if (!raw) return null;
    const m = raw.match(/^(\d{1,2})\.(\d{2})$/);
    if (!m) return null;
    return {
      grupo: String(Number.parseInt(m[1], 10)),
      subgrupo: m[2],
      valor: `${String(Number.parseInt(m[1], 10))}.${m[2]}`
    };
  }
  function obterEntradaItem(estado) {
    const estadoAny = estado;
    const itemId = estadoAny["itemAtualTelaId"] || estadoAny["itemAtualKey"];
    return getValoresParaItem(estado, itemId) || null;
  }
  function resolverOrigemValorFiscal(estado, valorFiscal, campoFiscal) {
    const entry = obterEntradaItem(estado);
    if (!entry) return "perfil";
    if (campoFiscal === "NBS") {
      if (entry.nbs === valorFiscal) return "json";
      if (!entry.nbs && entry.ncm === valorFiscal && ehValorNbs(entry.ncm)) return "json_legacy_ncm";
      return "perfil";
    }
    return entry.ncm && entry.ncm === valorFiscal ? "json" : "perfil";
  }
  function textoCombinaOpcaoLei116(textoOpcao, valorAlvo) {
    const opcao = String(textoOpcao || "").replaceAll(/\s+/g, " ").trim().toUpperCase();
    const alvo = String(valorAlvo || "").trim().toUpperCase();
    if (!opcao || !alvo) return false;
    if (opcao.includes("NAO APLICAVEL") || opcao.includes("NÃO APLICÁVEL")) {
      return alvo === "00" || alvo.includes("NAO APLICAVEL") || alvo.includes("NÃO APLICÁVEL");
    }
    if (opcao === alvo) {
      return true;
    }
    const matchOpcao = opcao.match(/^(\d{1,2})(?:\.(\d{1,2}))?/);
    const matchAlvo = alvo.match(/^(\d{1,2})(?:\.(\d{1,2}))?/);
    if (matchOpcao && matchAlvo) {
      const grupoOpcao = Number.parseInt(matchOpcao[1], 10);
      const subOpcao = matchOpcao[2] !== void 0 ? Number.parseInt(matchOpcao[2], 10) : null;
      const grupoAlvo = Number.parseInt(matchAlvo[1], 10);
      const subAlvo = matchAlvo[2] !== void 0 ? Number.parseInt(matchAlvo[2], 10) : null;
      if (subOpcao !== null && subAlvo !== null) {
        return grupoOpcao === grupoAlvo && subOpcao === subAlvo;
      }
      if (subOpcao === null && subAlvo === null) {
        return grupoOpcao === grupoAlvo;
      }
      if (subOpcao !== null && subAlvo === null) {
        return subOpcao === grupoAlvo;
      }
      return false;
    }
    return opcao.startsWith(`${alvo} `) || opcao.startsWith(`${alvo}-`) || opcao.startsWith(`${alvo} -`);
  }
  async function digitarSilencioso(elemento, valor) {
    var _a;
    const proto = elemento instanceof HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = (_a = Object.getOwnPropertyDescriptor(proto, "value")) == null ? void 0 : _a.set;
    elemento.focus();
    const str = String(valor ?? "");
    if (!setter) {
      elemento.value = str;
      elemento.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    if (elemento.value) {
      setter.call(elemento, "");
      elemento.dispatchEvent(new Event("input", { bubbles: true }));
      await sleep(80);
    }
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      const valorAtual = str.substring(0, i + 1);
      elemento.dispatchEvent(new KeyboardEvent("keydown", { key: char, bubbles: true }));
      elemento.dispatchEvent(new KeyboardEvent("keypress", { key: char, bubbles: true }));
      setter.call(elemento, valorAtual);
      elemento.dispatchEvent(new InputEvent("input", { bubbles: true, data: char }));
      elemento.dispatchEvent(new KeyboardEvent("keyup", { key: char, bubbles: true }));
      await sleep(Math.floor(Math.random() * 60) + 40);
    }
  }
  function obterContainersAutocompleteLei116(campo) {
    var _a;
    const nameAttr = String(((_a = campo == null ? void 0 : campo.getAttribute) == null ? void 0 : _a.call(campo, "name")) || "").trim();
    const idAttr = String((campo == null ? void 0 : campo.id) || "").trim();
    const candidateIds = [];
    if (nameAttr) candidateIds.push(`divAuto_${nameAttr}`);
    if (idAttr) candidateIds.push(`divAuto_${idAttr}`);
    const found = [];
    for (const id of candidateIds) {
      const el = document.getElementById(id) || (() => {
        try {
          return document.querySelector(`div[id="${CSS.escape(id)}"]`);
        } catch (e) {
          return null;
        }
      })();
      if (el && !found.includes(el)) found.push(el);
    }
    if (found.length > 0) return found;
    return [...document.querySelectorAll('div[id^="divAuto_"]')];
  }
  function encontrarOpcaoAutocompleteLei116(container, valorAlvo) {
    const anchors = [...container.querySelectorAll('a[id^="asel"]')];
    for (const a of anchors) {
      if (!elementoVisivel(a)) continue;
      const texto = String(a.textContent || "").trim();
      if (texto && textoCombinaOpcaoLei116(texto, valorAlvo)) return a;
    }
    const candidatos = [...container.querySelectorAll("a, li, div, span, td, option")];
    for (const candidato of candidatos) {
      if (!elementoVisivel(candidato)) continue;
      const texto = String(candidato.textContent || "").trim();
      if (!texto) continue;
      if (textoCombinaOpcaoLei116(texto, valorAlvo)) return candidato;
    }
    return null;
  }
  async function selecionarOpcaoAutocompleteLei116(campo, valorAlvo, acaoId, timeoutMs = 3e3) {
    var _a, _b;
    const fim = Date.now() + timeoutMs;
    while (Date.now() <= fim) {
      const containers = obterContainersAutocompleteLei116(campo);
      for (const container of containers) {
        if (!container) continue;
        const cs = window.getComputedStyle(container);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const opcao = encontrarOpcaoAutocompleteLei116(container, valorAlvo);
        if (!opcao) continue;
        log(`✅ Lei 116: opção encontrada no container #${container.id} — "${(opcao.textContent || "").substring(0, 60)}" [${opcao.tagName}#${opcao.id || "sem-id"}]`, "info");
        const anchorToUse = opcao.tagName === "A" && ((_a = opcao.id) == null ? void 0 : _a.startsWith("asel")) ? opcao : (_b = opcao.querySelector) == null ? void 0 : _b.call(opcao, 'a[id^="asel"]');
        if (anchorToUse) {
          const hrefVal = anchorToUse.getAttribute("href") || "";
          const onclickVal = anchorToUse.getAttribute("onclick") || "";
          const selMatch = hrefVal.match(/sel\((\d+)\)/) || onclickVal.match(/sel\((\d+)\)/);
          if (selMatch) {
            const selIndex = selMatch[1];
            try {
              const injectScript = document.createElement("script");
              injectScript.textContent = `try { sel(${selIndex}); } catch(e) { console.error('FISCAL 5.0 sel() error:', e); }`;
              document.body.appendChild(injectScript);
              injectScript.remove();
              log(`✅ Lei 116: seleção via sel(${selIndex}) extraído de href/onclick — sucesso`, "info");
              return true;
            } catch (e) {
              log(`⚠️ Lei 116: erro na injeção de script sel(${selIndex}): ${e.message}`, "warn");
            }
          } else {
            log(`⚠️ Lei 116: âncora ${anchorToUse.id} não tem sel() no href/onclick. href="${hrefVal}" onclick="${onclickVal}"`, "warn");
          }
        }
        const inlineOnclick = opcao.getAttribute("onclick") || "";
        const inlineMousedown = opcao.getAttribute("onmousedown") || "";
        if (inlineMousedown) {
          try {
            const injectScript = document.createElement("script");
            injectScript.textContent = inlineMousedown;
            document.body.appendChild(injectScript);
            injectScript.remove();
            log(`✅ Lei 116: executado onmousedown inline — sucesso`, "info");
            return true;
          } catch (e) {
          }
        }
        if (inlineOnclick) {
          try {
            const injectScript = document.createElement("script");
            injectScript.textContent = inlineOnclick;
            document.body.appendChild(injectScript);
            injectScript.remove();
            log(`✅ Lei 116: executado onclick inline — sucesso`, "info");
            return true;
          } catch (e) {
          }
        }
        log(`⚠️ Lei 116: Fallback de clique físico em ${opcao.tagName}#${opcao.id || "sem-id"} (${acaoId})`, "warn");
        opcao.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: null }));
        opcao.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: null }));
        opcao.click();
        return true;
      }
      await sleep(150);
    }
    log(`⚠️ Lei 116: nenhuma opção visível com valor "${valorAlvo}" encontrada após ${timeoutMs}ms`, "warn");
    return false;
  }
  function normalizarCodigoCest(valor) {
    const normalizado = normalizarCest(valor);
    if (!normalizado) return null;
    const digits = normalizado.replace(/\D/g, "");
    if (digits.length !== 7) return null;
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 7)}`;
  }
  function normalizarCestAlvo(valor) {
    const texto = normalizarCest(valor);
    const codigo = normalizarCodigoCest(texto);
    if (!texto || !codigo) return null;
    return { codigo, texto };
  }
  function textoCombinaOpcaoCest(textoOpcao, valorAlvo) {
    const alvo = normalizarCestAlvo(valorAlvo);
    if (!alvo) return false;
    const texto = String(textoOpcao ?? "").replace(/\s+/g, " ").trim();
    if (!texto) return false;
    const codigoOpcao = normalizarCodigoCest(texto);
    if (codigoOpcao && codigoOpcao === alvo.codigo) return true;
    const textoUpper = texto.toUpperCase();
    const alvoUpper = alvo.texto.toUpperCase();
    return textoUpper === alvoUpper || textoUpper.startsWith(`${alvo.codigo} `) || textoUpper.startsWith(`${alvo.codigo} -`);
  }
  function obterContainersAutocomplete(campo) {
    const nameAttr = String(campo.getAttribute("name") || "").trim();
    const idAttr = String(campo.id || "").trim();
    const candidateIds = [];
    if (nameAttr) candidateIds.push(`divAuto_${nameAttr}`);
    if (idAttr) candidateIds.push(`divAuto_${idAttr}`);
    const found = [];
    for (const id of candidateIds) {
      const el = document.getElementById(id) || (() => {
        try {
          return document.querySelector(`div[id="${CSS.escape(id)}"]`);
        } catch {
          return null;
        }
      })();
      if (el && !found.includes(el)) found.push(el);
    }
    if (found.length > 0) return found;
    return [...document.querySelectorAll('div[id^="divAuto_"]')];
  }
  function encontrarOpcaoAutocompleteCest(container, valorAlvo) {
    const anchors = [...container.querySelectorAll('a[id^="asel"]')];
    for (const a of anchors) {
      if (!elementoVisivel(a)) continue;
      if (textoCombinaOpcaoCest(a.textContent, valorAlvo)) return a;
    }
    const candidatos = [...container.querySelectorAll("a, li, div, span, td, option")];
    for (const candidato of candidatos) {
      if (!elementoVisivel(candidato)) continue;
      if (textoCombinaOpcaoCest(candidato.textContent, valorAlvo)) return candidato;
    }
    return null;
  }
  async function selecionarOpcaoAutocompleteCest(campo, valorAlvo, timeoutMs = 3e3) {
    var _a, _b;
    const fim = Date.now() + timeoutMs;
    while (Date.now() <= fim) {
      const containers = obterContainersAutocomplete(campo);
      for (const container of containers) {
        const cs = window.getComputedStyle(container);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const opcao = encontrarOpcaoAutocompleteCest(container, valorAlvo);
        if (!opcao) continue;
        const texto = String(opcao.textContent || "").trim();
        log(`✅ CEST: opção selecionada "${texto.substring(0, 80)}"`, "info");
        const anchorToUse = opcao.tagName === "A" && ((_a = opcao.id) == null ? void 0 : _a.startsWith("asel")) ? opcao : (_b = opcao.querySelector) == null ? void 0 : _b.call(opcao, 'a[id^="asel"]');
        if (anchorToUse) {
          const hrefVal = anchorToUse.getAttribute("href") || "";
          const onclickVal = anchorToUse.getAttribute("onclick") || "";
          const selMatch = hrefVal.match(/sel\((\d+)\)/) || onclickVal.match(/sel\((\d+)\)/);
          if (selMatch) {
            const selIndex = selMatch[1];
            try {
              const injectScript = document.createElement("script");
              injectScript.textContent = `try { sel(${selIndex}); } catch(e) { console.error('FISCAL 5.0 sel() CEST error:', e); }`;
              document.body.appendChild(injectScript);
              injectScript.remove();
              return true;
            } catch (e) {
              log(`⚠️ CEST: erro na injeção de script sel(${selIndex}): ${e.message}`, "warn");
            }
          }
        }
        for (const attr of ["onmousedown", "onclick"]) {
          const inline = opcao.getAttribute(attr) || "";
          if (!inline) continue;
          try {
            const injectScript = document.createElement("script");
            injectScript.textContent = inline;
            document.body.appendChild(injectScript);
            injectScript.remove();
            return true;
          } catch {
          }
        }
        opcao.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: null }));
        opcao.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: null }));
        opcao.click();
        return true;
      }
      await sleep(150);
    }
    log(`⚠️ CEST: opção não encontrada para "${valorAlvo}"`, "warn");
    return false;
  }
  async function preencherCestAutocomplete(campo, valorCest) {
    const alvo = normalizarCestAlvo(valorCest);
    if (!alvo) {
      log(`⚠️ CEST: valor inválido no JSON (${String(valorCest ?? "")})`, "warn");
      return false;
    }
    await digitarSilencioso(campo, alvo.codigo);
    log(`⌨️ CEST: digitado "${alvo.codigo}"...`, "info");
    await sleep(700);
    const selecionou = await selecionarOpcaoAutocompleteCest(campo, alvo.texto);
    if (!selecionou) return false;
    await sleep(1e3);
    return true;
  }
  function encontrarAbaClassificacao(acaoAbaClass) {
    let abaClass = buscarElementoDeep(acaoAbaClass.seletor);
    if (abaClass && elementoVisivel(abaClass)) return abaClass;
    const tabRoot = document.querySelector("#dlTab");
    const links = tabRoot ? [...tabRoot.querySelectorAll("a")] : [...document.querySelectorAll('a[href*="lbutMenu"], a[href*="lbutSelMenu"]')];
    const byTexto = links.find((a) => {
      const texto = normalizarTextoSemAcento(a.textContent || "");
      return texto.includes("classificaco");
    });
    if (byTexto && elementoVisivel(byTexto)) return byTexto;
    const byHref = links.find((a) => /ctl\d+\$lbutMenu/.test(String(a.getAttribute("href") || "")));
    if (byHref && elementoVisivel(byHref)) return byHref;
    return null;
  }
  function encontrarAbaFiscal(seletor) {
    let abaFiscalEl = buscarElementoDeep(seletor);
    if (abaFiscalEl) return abaFiscalEl;
    const tabRoot = document.querySelector("#dlTab");
    const candidatos = tabRoot ? [...tabRoot.querySelectorAll("a")] : [...document.querySelectorAll('a[href*="lbutMenu"], a[href*="lbutSelMenu"]')];
    abaFiscalEl = candidatos.find((a) => normalizarTextoSemAcento(a.textContent || "").includes("fiscal")) || null;
    return abaFiscalEl;
  }
  function detectarModoServico(estado, entry, valorFiscal) {
    const campoNbs = encontrarCampoNbsPreferido();
    const campoIncideNbs = buscarElementoDeep("#txtIncideNBS") || buscarElementoDeep('input[name$="txtIncideNBS"]');
    const incideNbs = normalizarTextoSemAcento(String((campoIncideNbs == null ? void 0 : campoIncideNbs.value) ?? (campoIncideNbs == null ? void 0 : campoIncideNbs.textContent) ?? "")) === "sim";
    const valorPareceNbs = ehValorNbs(valorFiscal);
    const entryPareceServico = !!((entry == null ? void 0 : entry.nbs) || normalizarLei116(entry == null ? void 0 : entry.lei116) || (entry == null ? void 0 : entry.ncm) && ehValorNbs(entry.ncm));
    return valorPareceNbs || entryPareceServico || !!(campoNbs && incideNbs);
  }
  function lei116EstaPendente(estado, targetLei116, valoresSaoIguais2) {
    if (!targetLei116) return false;
    const campoGrupo = encontrarCampoLei116Grupo();
    const campoSubgrupo = encontrarCampoLei116Subgrupo();
    if (!campoGrupo || !campoSubgrupo) return true;
    const grupoAtual = String(campoGrupo.value ?? "").trim();
    const subgrupoAtual = String(campoSubgrupo.value ?? "").trim();
    if (campoLei116EhPlaceholder(grupoAtual) || campoLei116EhPlaceholder(subgrupoAtual)) return true;
    const grupoMatch = textoCombinaOpcaoLei116(grupoAtual, targetLei116.grupo);
    const subMatch = textoCombinaOpcaoLei116(subgrupoAtual, targetLei116.subgrupo);
    return !grupoMatch || !subMatch;
  }
  function cestEstaPendente(campo, valorCest) {
    const alvo = normalizarCestAlvo(valorCest);
    if (!alvo) return false;
    const valorAtual = String(campo.value ?? "").trim();
    return !textoCombinaOpcaoCest(valorAtual, alvo.texto);
  }
  async function abaClassificacao(estado, status, { getAcao: getAcao2, workflowState: workflowState2 }) {
    const acaoAbaClass = getAcao2("abaClassificacao", estado);
    if (!acaoAbaClass.ativo) return false;
    if (isAtivo("abaClassificacao")) return true;
    if (workflowState2.isCompleta("selecionar")) return false;
    if (isAtivo("posSelecionar")) return false;
    const acaoLupa = getAcao2("lupaUnspsc", estado);
    if (acaoLupa == null ? void 0 : acaoLupa.ativo) {
      const lupa = buscarElementoDeep(acaoLupa.seletor);
      if (lupa && elementoVisivel(lupa)) return false;
    }
    const abaClass = encontrarAbaClassificacao(acaoAbaClass);
    if (!abaClass || !elementoVisivel(abaClass)) return false;
    if (status) status.textContent = "Indo para Classificações...";
    set("abaClassificacao", CONFIG.DELAYS.ABA_CLASSIFICACAO_COOLDOWN);
    await interagir(abaClass, null, "abaClassificacao");
    return true;
  }
  async function ncm(estado, status, ctx) {
    const { getAcao: getAcao2, habilitarValidacaoNcmAposInsercao: habilitarValidacaoNcmAposInsercao2, isValidacaoNcmLiberada: isValidacaoNcmLiberada2, registrarAvisoValidacaoNcmAguardando: registrarAvisoValidacaoNcmAguardando2 } = ctx;
    const acaoNcm = getAcao2("ncm", estado);
    const valorNcm = ctx.getValorAcao("ncm", estado);
    if (!acaoNcm.ativo) return false;
    if (!String(valorNcm ?? "").trim()) return false;
    const entry = obterEntradaItem(estado);
    const emModoServico = detectarModoServico(estado, entry, valorNcm);
    const campoNcm = emModoServico ? encontrarCampoNbsPreferido() || encontrarCampoNcmPreferido(acaoNcm.seletor) : encontrarCampoNcmPreferido(acaoNcm.seletor);
    if (!campoNcm) return false;
    const nomeCampoFiscal = emModoServico ? "NBS" : "NCM";
    if (!ctx.valoresSaoIguais(campoNcm.value, valorNcm)) {
      if (status) status.textContent = emModoServico ? "Preenchendo NBS..." : "Preenchendo NCM...";
      const ok = await interagir(campoNcm, valorNcm, "ncm");
      if (ok) {
        if (emModoServico) {
          try {
            campoNcm.blur();
          } catch (e) {
          }
          await sleep(1500);
        }
        habilitarValidacaoNcmAposInsercao2(estado);
        update((e) => {
          const eAny = e;
          registrarEventoItemAtual(e, "ncm_preenchido", {
            itemTelaId: eAny["itemAtualTelaId"] || eAny["itemAtualKey"] || null,
            resumo: `${nomeCampoFiscal} preenchido com ${valorNcm}`,
            payload: {
              valor: valorNcm,
              campo: nomeCampoFiscal,
              origemValor: resolverOrigemValorFiscal(e, valorNcm, nomeCampoFiscal)
            },
            status: "em_andamento",
            now: Date.now()
          });
        });
      }
      return true;
    }
    if (!isValidacaoNcmLiberada2(estado)) {
      registrarAvisoValidacaoNcmAguardando2(estado);
    }
    const acaoLei116 = getAcao2("lei116Servico", estado);
    if (emModoServico && acaoLei116.ativo) {
      const lei116Alvo = normalizarLei116(ctx.getValorAcao("lei116Servico", estado));
      if (lei116EstaPendente(estado, lei116Alvo, ctx.valoresSaoIguais)) {
        if (status) status.textContent = "Aguardando preenchimento de Lei 116...";
        return false;
      }
    }
    const acaoCest = getAcao2("cest", estado);
    const valorCest = ctx.getValorAcao("cest", estado);
    if (!emModoServico && acaoCest.ativo && normalizarCestAlvo(valorCest)) {
      const campoCest = buscarElementoDeep(acaoCest.seletor || "#txtCest");
      if (campoCest && elementoVisivel(campoCest) && cestEstaPendente(campoCest, valorCest)) {
        if (status) status.textContent = "Preenchendo CEST...";
        const okCest = await preencherCestAutocomplete(campoCest, valorCest);
        if (okCest) {
          update((e) => {
            const eAny = e;
            const alvo = normalizarCestAlvo(valorCest);
            registrarEventoItemAtual(e, "cest_preenchido", {
              itemTelaId: eAny["itemAtualTelaId"] || eAny["itemAtualKey"] || null,
              resumo: `CEST preenchido com ${(alvo == null ? void 0 : alvo.codigo) || valorCest}`,
              payload: {
                cest: (alvo == null ? void 0 : alvo.codigo) || valorCest,
                valorOriginal: valorCest
              },
              status: "em_andamento",
              now: Date.now()
            });
          });
        }
        return true;
      }
    }
    const acaoAbaClass = getAcao2("abaClassificacao", estado);
    if (acaoAbaClass.ativo) {
      const avancouAba = await abaClassificacao(estado, status, ctx);
      if (avancouAba) return true;
    }
    return false;
  }
  async function lei116Servico(estado, status, { getAcao: getAcao2, getValorAcao: getValorAcao2, valoresSaoIguais: valoresSaoIguais2 }) {
    const acaoLei116 = getAcao2("lei116Servico", estado);
    if (!acaoLei116.ativo) return false;
    const lei116 = normalizarLei116(getValorAcao2("lei116Servico", estado));
    if (!lei116) return false;
    const campoGrupo = encontrarCampoLei116Grupo();
    const campoSubgrupo = encontrarCampoLei116Subgrupo();
    if (!campoGrupo || !campoSubgrupo) return false;
    const grupoAtual = String(campoGrupo.value ?? "").trim();
    const subgrupoAtual = String(campoSubgrupo.value ?? "").trim();
    const grupoPendente = campoLei116EhPlaceholder(grupoAtual);
    const subgrupoPendente = campoLei116EhPlaceholder(subgrupoAtual);
    let executou = false;
    if (grupoPendente || !textoCombinaOpcaoLei116(grupoAtual, lei116.grupo)) {
      if (status) status.textContent = "Preenchendo Lei 116 (Grupo)...";
      await digitarSilencioso(campoGrupo, lei116.grupo);
      log(`⌨️ Lei 116 (Grupo): digitado "${lei116.grupo}" sem change event`, "info");
      await sleep(700);
      const clicouGrupo = await selecionarOpcaoAutocompleteLei116(campoGrupo, lei116.grupo, "lei116ServicoGrupoOpcao");
      if (clicouGrupo) {
        await sleep(2e3);
        executou = true;
      } else {
        log("⚠️ Lei 116 (Grupo): opção do autocomplete não encontrada para clique", "warn");
      }
    }
    if (subgrupoPendente || !textoCombinaOpcaoLei116(subgrupoAtual, lei116.subgrupo)) {
      if (status) status.textContent = "Preenchendo Lei 116 (SubGrupo)...";
      await digitarSilencioso(campoSubgrupo, lei116.subgrupo);
      log(`⌨️ Lei 116 (SubGrupo): digitado "${lei116.subgrupo}" sem change event`, "info");
      await sleep(700);
      const clicouSubgrupo = await selecionarOpcaoAutocompleteLei116(campoSubgrupo, lei116.subgrupo, "lei116ServicoSubgrupoOpcao");
      if (clicouSubgrupo) {
        await sleep(2e3);
        executou = true;
      } else {
        log("⚠️ Lei 116 (SubGrupo): opção do autocomplete não encontrada para clique", "warn");
      }
    }
    if (!executou) return false;
    update((e) => {
      const eAny = e;
      registrarEventoItemAtual(e, "lei116_preenchida", {
        itemTelaId: eAny["itemAtualTelaId"] || eAny["itemAtualKey"] || null,
        resumo: `Lei 116 preenchida com ${lei116.valor}`,
        payload: {
          lei116: lei116.valor,
          grupo: lei116.grupo,
          subgrupo: lei116.subgrupo
        },
        status: "em_andamento",
        now: Date.now()
      });
    });
    return true;
  }
  async function abaFiscal(estado, status, ctx) {
    const { getAcao: getAcao2, workflowState: workflowState2 } = ctx;
    const acaoAbaFiscal = getAcao2("abaFiscal", estado);
    const acaoNcm = getAcao2("ncm", estado);
    const acaoLupa = getAcao2("lupaUnspsc", estado);
    const acaoUnspsc = getAcao2("unspsc", estado);
    const acaoSelecionar = getAcao2("selecionar", estado);
    if (!acaoAbaFiscal.ativo || !acaoNcm.ativo) return false;
    if (isAtivo("abaClassificacao")) return false;
    if (isAtivo("abaFiscal")) return false;
    const modalDiv1 = ctx.getModalUnspscContainer();
    const modalAberto = ctx.isModalUnspscAberto(acaoUnspsc.seletor, acaoSelecionar.seletor);
    const lupa = (acaoLupa == null ? void 0 : acaoLupa.ativo) ? buscarElementoDeep(acaoLupa.seletor) : null;
    const campoUnspsc = (acaoUnspsc == null ? void 0 : acaoUnspsc.ativo) ? modalDiv1 ? modalDiv1.querySelector(acaoUnspsc.seletor) : buscarElementoDeep(acaoUnspsc.seletor) : null;
    if (!workflowState2.isCompleta("selecionar")) {
      if (modalAberto || lupa && elementoVisivel(lupa) || campoUnspsc && elementoVisivel(campoUnspsc)) {
        return false;
      }
    }
    const campoNcm = encontrarCampoNcmPreferido(acaoNcm.seletor);
    if (campoNcm && elementoVisivel(campoNcm)) return false;
    const abaFiscalEl = encontrarAbaFiscal(acaoAbaFiscal.seletor);
    if (!abaFiscalEl || !elementoVisivel(abaFiscalEl)) return false;
    if (status) status.textContent = "Indo para aba Fiscal...";
    set("abaFiscal", CONFIG.DELAYS.ABA_CLASSIFICACAO_COOLDOWN);
    await interagir(abaFiscalEl, null, "abaFiscal");
    return true;
  }
  function getItemKey(estado) {
    const estadoAny = estado;
    return String(estadoAny["itemAtualKey"] || estadoAny["itemAtualTelaId"] || "").trim() || null;
  }
  function getUnspscItemFlags(estado) {
    const itemKey = getItemKey(estado);
    if (!itemKey) return {};
    const estadoAny = estado;
    const itemFlags = estadoAny["itemFlags"];
    return (itemFlags == null ? void 0 : itemFlags[itemKey]) || {};
  }
  function updateUnspscItemFlags(estado, patch) {
    const itemKey = getItemKey(estado);
    if (!itemKey) return;
    update((e) => {
      const eAny = e;
      eAny["itemFlags"] = eAny["itemFlags"] || {};
      const flags = eAny["itemFlags"];
      const atual = flags[itemKey] || {};
      flags[itemKey] = { ...atual, ...patch };
    });
  }
  function marcarUnspscInlineConcluido(estado, valorUnspsc) {
    updateUnspscItemFlags(estado, {
      unspscFeito: true,
      unspscModoDetectado: "inline",
      unspscInlinePostbackTentado: false,
      unspscInlineFallbackTentado: false,
      unspscInlineValorTentado: valorUnspsc == null ? null : String(valorUnspsc)
    });
  }
  function lerDescricaoUnspscInline() {
    var _a;
    const campoDescricao = buscarElementoDeep('#txtUNSPSC, input[name$="txtUNSPSC"]');
    return String(
      (campoDescricao == null ? void 0 : campoDescricao.value) ?? ((_a = campoDescricao == null ? void 0 : campoDescricao.getAttribute) == null ? void 0 : _a.call(campoDescricao, "value")) ?? ""
    ).trim();
  }
  function descricaoUnspscInlineDefinida() {
    const valor = normalizarTextoSemAcento(lerDescricaoUnspscInline());
    return !!valor && !valor.includes("nao definido");
  }
  function extrairTargetPostbackInline(campo) {
    const onchange = String(campo.getAttribute("onchange") || "");
    const match = onchange.match(/__doPostBack\(\s*\\?'([^'\\]+)\\?'\s*,/i) || onchange.match(/__doPostBack\(\s*'([^']+)'\s*,/i) || onchange.match(/__doPostBack\(\s*"([^"]+)"\s*,/i);
    if (match == null ? void 0 : match[1]) return match[1];
    const name = String(campo.getAttribute("name") || "").trim();
    return name || null;
  }
  function dispararPostbackInline(campo, target) {
    const globalAny = globalThis;
    if (typeof globalAny.__doPostBack === "function") {
      globalAny.__doPostBack(target, "");
      return true;
    }
    try {
      campo.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch {
      const form = campo.form;
      const eventTarget = form == null ? void 0 : form.querySelector('input[name="__EVENTTARGET"]');
      const eventArgument = form == null ? void 0 : form.querySelector('input[name="__EVENTARGUMENT"]');
      if (!form || !eventTarget || !eventArgument) return false;
      eventTarget.value = target;
      eventArgument.value = "";
      form.submit();
      return true;
    }
  }
  function obterCampoUnspscInline() {
    return buscarElementoDeep('#txtCodUNSPSC, input[name$="txtCodUNSPSC"]');
  }
  function obterBotaoUnspscInline() {
    return buscarElementoDeep('#ibutUNSPSC, input[name$="ibutUNSPSC"]');
  }
  function botaoUnspscInlineVisivel() {
    const botaoInline = obterBotaoUnspscInline();
    return botaoInline && elementoVisivel(botaoInline) ? botaoInline : null;
  }
  function pausarFalhaUnspscInline(pausarComAviso2, valorUnspsc) {
    const valorInfo = valorUnspsc == null ? "" : ` (${String(valorUnspsc)})`;
    const mensagem = `UNSPSC inline não foi definido após postback e fallback${valorInfo}`.trim();
    if (typeof pausarComAviso2 === "function") {
      pausarComAviso2(mensagem, { alertUser: false, tipo: "unspsc_inline_falha" });
      return true;
    }
    log(`⚠️ ${mensagem}`, "warn");
    return false;
  }
  function obterModoUnspsc(estado, getAcao2, getUnspscModo) {
    const acaoUnspsc = getAcao2("unspsc", estado);
    const acaoSelecionar = getAcao2("selecionar", estado);
    if (typeof getUnspscModo !== "function") return "none";
    return getUnspscModo(acaoUnspsc.seletor, acaoSelecionar.seletor);
  }
  function obterCampoUnspscModal(seletor, getModalUnspscContainer2) {
    const modalDiv1 = getModalUnspscContainer2();
    return modalDiv1 ? modalDiv1.querySelector(seletor) : buscarElementoDeep(seletor);
  }
  function campoVisivel(campo) {
    return !!(campo && elementoVisivel(campo));
  }
  function checkboxUnspscMarcado() {
    const checkboxMarcado = document.querySelector(
      '#ckSelUNSPSC[src*="check"]:not([src*="uncheck"]), input[src*="check.gif"]:not([src*="uncheck"])'
    );
    return !!(checkboxMarcado && checkboxMarcado.src);
  }
  function buscarResultadoUnspscVisivel(seletor) {
    const candidatos = buscarElementosDeep(seletor);
    return candidatos.find((el) => elementoVisivel(el)) || null;
  }
  function buscarElementoVisivel(seletor) {
    const el = buscarElementoDeep(seletor);
    return el && elementoVisivel(el) ? el : null;
  }
  function resolverOrigemValorUnspsc(estado, valorUnspsc) {
    const estadoAny = estado;
    const itemId = estadoAny["itemAtualTelaId"] || estadoAny["itemAtualKey"];
    const entry = getValoresParaItem(estado, itemId);
    return (entry == null ? void 0 : entry.unspsc) && entry.unspsc === valorUnspsc ? "json" : "perfil";
  }
  function registrarUnspscPreenchido(estado, valorUnspsc, modo) {
    update((e) => {
      const eAny = e;
      registrarEventoItemAtual(e, "unspsc_preenchido", {
        itemTelaId: eAny["itemAtualTelaId"] || eAny["itemAtualKey"] || null,
        resumo: `UNSPSC digitado com ${valorUnspsc}`,
        payload: {
          valor: valorUnspsc,
          origemValor: resolverOrigemValorUnspsc(e, valorUnspsc),
          ...modo ? { modo } : {}
        },
        status: "em_andamento",
        now: Date.now()
      });
    });
  }
  function registrarUnspscPesquisado(estado, valorUnspsc) {
    update((e) => {
      const eAny = e;
      registrarEventoItemAtual(e, "unspsc_pesquisado", {
        itemTelaId: eAny["itemAtualTelaId"] || eAny["itemAtualKey"] || null,
        resumo: "Pesquisa de UNSPSC executada",
        payload: {
          valor: valorUnspsc
        },
        status: "em_andamento",
        now: Date.now()
      });
    });
  }
  function registrarUnspscSelecionado(estado, getValorAcao2) {
    const itemKey = getItemKey(estado);
    if (!itemKey) return;
    update((e) => {
      const eAny = e;
      eAny["itemFlags"] = eAny["itemFlags"] || {};
      const flags = eAny["itemFlags"];
      const atual = flags[itemKey] || {};
      flags[itemKey] = { ...atual, unspscFeito: true };
      registrarEventoItem(e, itemKey, "unspsc_selecionado", {
        itemTelaId: eAny["itemAtualTelaId"] || itemKey,
        resumo: "UNSPSC selecionado",
        payload: {
          valor: getValorAcao2 ? getValorAcao2("unspsc", e) : null
        },
        status: "em_andamento",
        now: Date.now()
      });
    });
  }
  async function selecionar(estado, status, { getAcao: getAcao2, workflowState: workflowState2, isModalUnspscAberto: isModalUnspscAberto2, getUnspscModo, getValorAcao: getValorAcao2 }) {
    var _a, _b;
    const acaoSelecionar = getAcao2("selecionar", estado);
    if (!acaoSelecionar.ativo) return false;
    const acaoUnspsc = getAcao2("unspsc", estado);
    if (!acaoUnspsc.ativo) return false;
    if (workflowState2.isCompleta("selecionar")) return false;
    (_b = workflowState2.debugLogThrottled) == null ? void 0 : _b.call(
      workflowState2,
      "selecionar_tick",
      `▶ SELECIONAR: Iniciando verificação ${(_a = workflowState2.getStatus) == null ? void 0 : _a.call(workflowState2)}`,
      3e3
    );
    if (obterModoUnspsc(estado, getAcao2, getUnspscModo) === "inline") return false;
    const modalAberto = isModalUnspscAberto2(acaoUnspsc.seletor, acaoSelecionar.seletor);
    const btnSelecionar = buscarElementoVisivel(acaoSelecionar.seletor);
    const podeSelecionar = workflowState2.unspscSelecionado || checkboxUnspscMarcado();
    if (modalAberto && podeSelecionar && btnSelecionar) {
      if (status) status.textContent = "Selecionando UNSPSC...";
      const ok = await interagir(btnSelecionar, null, "selecionar");
      if (!ok) return false;
      workflowState2.marcarCompleta("selecionar");
      workflowState2.unspscSelecionado = false;
      registrarUnspscSelecionado(estado, getValorAcao2);
      set("posSelecionar", CONFIG.DELAYS.POS_SELECIONAR_COOLDOWN);
      log("✅ UNSPSC selecionado - avançando para coleta de mídia/acompanhamento", "info");
      return true;
    }
    return false;
  }
  async function resultado(estado, status, { getAcao: getAcao2, workflowState: workflowState2, isModalUnspscAberto: isModalUnspscAberto2, getUnspscModo }) {
    const acaoResultado = getAcao2("resultado", estado);
    if (!acaoResultado.ativo) return false;
    if (obterModoUnspsc(estado, getAcao2, getUnspscModo) === "inline") return false;
    if (workflowState2.unspscSelecionado) return false;
    if (workflowState2.isCompleta("selecionar")) return false;
    if (isAtivo("posSelecionar")) return false;
    if (isAtivo("resultado")) return false;
    if (checkboxUnspscMarcado()) {
      workflowState2.unspscSelecionado = true;
      return false;
    }
    const acaoUnspsc = getAcao2("unspsc", estado);
    const acaoSelecionar = getAcao2("selecionar", estado);
    const modalAberto = isModalUnspscAberto2(acaoUnspsc.seletor, acaoSelecionar.seletor);
    const resultadoEl = buscarResultadoUnspscVisivel(acaoResultado.seletor);
    const podeClic = workflowState2.unspscPesquisado || resultadoEl;
    if (modalAberto && podeClic && resultadoEl) {
      if (status) status.textContent = "Clicando no resultado...";
      await interagir(resultadoEl, null, "resultado");
      workflowState2.unspscSelecionado = true;
      set("resultado", CONFIG.DELAYS.RESULTADO_COOLDOWN);
      limpar$1("aguardandoResultados");
      return true;
    }
    return false;
  }
  async function pesquisar(estado, status, { getAcao: getAcao2, workflowState: workflowState2, getModalUnspscContainer: getModalUnspscContainer2, valoresSaoIguais: valoresSaoIguais2, getValorAcao: getValorAcao2, getUnspscModo, pausarComAviso: pausarComAviso2 }) {
    const acaoPesquisar = getAcao2("pesquisar", estado);
    const acaoUnspsc = getAcao2("unspsc", estado);
    const valorUnspsc = getValorAcao2("unspsc", estado);
    if (!acaoPesquisar.ativo || !acaoUnspsc.ativo) return false;
    if (workflowState2.unspscPesquisado) return false;
    if (workflowState2.unspscSelecionado) return false;
    if (workflowState2.isCompleta("selecionar")) return false;
    if (isAtivo("posSelecionar")) return false;
    const modo = obterModoUnspsc(estado, getAcao2, getUnspscModo);
    if (modo === "inline") {
      if (descricaoUnspscInlineDefinida()) {
        marcarUnspscInlineConcluido(estado, valorUnspsc);
        return false;
      }
      const flags = getUnspscItemFlags(estado);
      if (!flags.unspscInlinePostbackTentado) return false;
      if (flags.unspscInlineFallbackTentado) {
        return pausarFalhaUnspscInline(pausarComAviso2, valorUnspsc);
      }
      const botaoInline = botaoUnspscInlineVisivel();
      if (!botaoInline) return false;
      if (status) status.textContent = "Acionando validação inline do UNSPSC...";
      updateUnspscItemFlags(estado, {
        unspscModoDetectado: "inline",
        unspscInlineFallbackTentado: true,
        unspscInlineValorTentado: valorUnspsc == null ? null : String(valorUnspsc)
      });
      const ok = await interagir(botaoInline, null, "pesquisar");
      if (!ok) return false;
      return true;
    }
    const campoUnspsc = obterCampoUnspscModal(acaoUnspsc.seletor, getModalUnspscContainer2);
    if (!campoVisivel(campoUnspsc)) return false;
    if (!campoUnspsc) return false;
    if (!workflowState2.unspscValorDigitado) return false;
    if (!valoresSaoIguais2(campoUnspsc.value, valorUnspsc)) return false;
    if (isAtivo("aguardandoResultados")) {
      if (status) status.textContent = "Aguardando resultados...";
      return false;
    }
    const btnPesquisar = buscarElementoVisivel(acaoPesquisar.seletor);
    if (btnPesquisar) {
      if (status) status.textContent = "Pesquisando...";
      const ok = await interagir(btnPesquisar, null, "pesquisar");
      if (!ok) return false;
      workflowState2.unspscPesquisado = true;
      set("aguardandoResultados", CONFIG.DELAYS.RESULTADOS_TIMEOUT);
      registrarUnspscPesquisado(estado, valorUnspsc);
      return true;
    }
    return false;
  }
  async function unspsc(estado, status, { getAcao: getAcao2, workflowState: workflowState2, getModalUnspscContainer: getModalUnspscContainer2, valoresSaoIguais: valoresSaoIguais2, getValorAcao: getValorAcao2, getUnspscModo, pausarComAviso: pausarComAviso2 }) {
    const acaoUnspsc = getAcao2("unspsc", estado);
    const valorUnspsc = getValorAcao2("unspsc", estado);
    if (!acaoUnspsc.ativo) return false;
    if (workflowState2.isCompleta("selecionar")) return false;
    if (isAtivo("posSelecionar")) return false;
    const modo = obterModoUnspsc(estado, getAcao2, getUnspscModo);
    if (modo === "inline") {
      if (descricaoUnspscInlineDefinida()) {
        workflowState2.unspscValorDigitado = true;
        marcarUnspscInlineConcluido(estado, valorUnspsc);
        return false;
      }
      const flags = getUnspscItemFlags(estado);
      if (flags.unspscInlinePostbackTentado) {
        if (flags.unspscInlineFallbackTentado) {
          return pausarFalhaUnspscInline(pausarComAviso2, valorUnspsc);
        }
        return false;
      }
      const campoInline = obterCampoUnspscInline();
      if (!campoVisivel(campoInline)) return false;
      if (!campoInline) return false;
      if (status) status.textContent = "Digitando UNSPSC...";
      if (!valoresSaoIguais2(campoInline.value, valorUnspsc)) {
        await digitarSilencioso$1(campoInline, valorUnspsc);
        await sleep(150);
      }
      workflowState2.unspscValorDigitado = true;
      updateUnspscItemFlags(estado, {
        unspscModoDetectado: "inline",
        unspscInlinePostbackTentado: true,
        unspscInlineFallbackTentado: false,
        unspscInlineValorTentado: valorUnspsc == null ? null : String(valorUnspsc)
      });
      registrarUnspscPreenchido(estado, valorUnspsc, "inline");
      const target = extrairTargetPostbackInline(campoInline);
      if (!target) {
        updateUnspscItemFlags(estado, { unspscInlinePostbackTentado: false });
        log("⚠️ Não foi possível identificar o target do postback inline do UNSPSC", "warn");
        return false;
      }
      const disparou = dispararPostbackInline(campoInline, target);
      if (!disparou) {
        updateUnspscItemFlags(estado, { unspscInlinePostbackTentado: false });
        log("⚠️ Falha ao disparar postback inline do UNSPSC", "warn");
        return false;
      }
      return true;
    }
    if (workflowState2.unspscValorDigitado) return false;
    const campoUnspsc = obterCampoUnspscModal(acaoUnspsc.seletor, getModalUnspscContainer2);
    if (!campoVisivel(campoUnspsc)) return false;
    if (!campoUnspsc) return false;
    if (!valoresSaoIguais2(campoUnspsc.value, valorUnspsc)) {
      if (status) status.textContent = "Digitando UNSPSC...";
      const ok = await interagir(campoUnspsc, valorUnspsc, "unspsc");
      if (!ok) return false;
      workflowState2.unspscValorDigitado = true;
      registrarUnspscPreenchido(estado, valorUnspsc);
      return true;
    }
    return false;
  }
  async function lupaUnspsc(estado, status, { getAcao: getAcao2, workflowState: workflowState2, getModalUnspscContainer: getModalUnspscContainer2, isModalUnspscAberto: isModalUnspscAberto2, getUnspscModo }) {
    const acaoLupa = getAcao2("lupaUnspsc", estado);
    const acaoUnspsc = getAcao2("unspsc", estado);
    if (!acaoLupa.ativo || !acaoUnspsc.ativo) return false;
    if (obterModoUnspsc(estado, getAcao2, getUnspscModo) === "inline") return false;
    if (getUnspscItemFlags(estado).unspscFeito) return false;
    if (workflowState2.isCompleta("selecionar")) return false;
    if (isAtivo("posSelecionar")) return false;
    const acaoSelecionar = getAcao2("selecionar", estado);
    const modalAberto = isModalUnspscAberto2(acaoUnspsc.seletor, acaoSelecionar.seletor);
    const campoUnspsc = obterCampoUnspscModal(acaoUnspsc.seletor, getModalUnspscContainer2);
    const campoUnspscVisivel = campoVisivel(campoUnspsc);
    if (!campoUnspscVisivel && !modalAberto) {
      if (isAtivo("lupa")) return true;
      const lupa = buscarElementoVisivel(acaoLupa.seletor);
      if (lupa) {
        const maxRetries = CONFIG.RETRY.MAX_TENTATIVAS;
        workflowState2._lupaRetryCount = (workflowState2._lupaRetryCount || 0) + 1;
        if (workflowState2._lupaRetryCount > maxRetries) {
          log(`❌ Lupa UNSPSC: ${maxRetries} tentativas sem sucesso — desistindo`, "error");
          workflowState2._lupaRetryCount = 0;
          return false;
        }
        if (status) status.textContent = `Abrindo busca UNSPSC (tentativa ${workflowState2._lupaRetryCount}/${maxRetries})...`;
        set("lupa", CONFIG.DELAYS.LUPA_COOLDOWN);
        workflowState2.unspscValorDigitado = false;
        workflowState2.unspscPesquisado = false;
        workflowState2.unspscSelecionado = false;
        await interagir(lupa, null, "lupaUnspsc");
        try {
          await waitForAny(
            ["#tableUNSPSC", "#div1", acaoUnspsc.seletor, acaoSelecionar.seletor],
            { root: document, timeoutMs: 12e3 }
          );
          workflowState2._lupaRetryCount = 0;
        } catch {
          await sleep(CONFIG.DELAYS.UNSPSC_MODAL);
        }
        return true;
      }
      log("⚠️ Lupa UNSPSC não encontrada/visível para clique", "warn");
    } else if (modalAberto && !campoUnspscVisivel) {
      if (status) status.textContent = "Carregando modal...";
      await sleep(150);
      return true;
    }
    return false;
  }
  const cachePorItem = /* @__PURE__ */ new Map();
  function getCacheItem(itemKey) {
    const key = String(itemKey ?? "").trim();
    if (!key) return null;
    if (!cachePorItem.has(key)) {
      cachePorItem.set(key, { media: null, acompanhamento: null, files: [] });
    }
    return cachePorItem.get(key) || null;
  }
  function getItemReportingState(estado, itemKey) {
    var _a, _b;
    const estadoAny = estado;
    return ((_b = (_a = estadoAny == null ? void 0 : estadoAny.itemFlags) == null ? void 0 : _a[itemKey]) == null ? void 0 : _b.reporting) || {};
  }
  function updateItemReportingState(itemKey, patch) {
    if (!itemKey || !patch || typeof patch !== "object") return;
    update((e) => {
      const eAny = e;
      eAny.itemFlags = eAny.itemFlags || {};
      const atualItem = eAny.itemFlags[itemKey] || {};
      const atualReporting = atualItem.reporting || {};
      eAny.itemFlags[itemKey] = {
        ...atualItem,
        reporting: {
          ...atualReporting,
          ...patch
        }
      };
    });
  }
  function obterCampoValor(seletores = []) {
    for (const s of seletores) {
      const el = buscarElementoDeep(s);
      if (!el) continue;
      const val = (el.value ?? el.textContent ?? "").toString().trim();
      if (val) return val;
    }
    return null;
  }
  function extrairSinIdDaUrl() {
    try {
      const u = new URL(window.location.href);
      return u.searchParams.get("IdSIN") || u.searchParams.get("Id") || null;
    } catch {
      return null;
    }
  }
  function obterMetadadosBasicos(estado, itemKey) {
    const itemId = obterItemIdAtual() || obterCampoValor(["#txtCodigo", 'input[name$="txtCodigo"]']) || itemKey || null;
    const sinId = obterCampoValor(["#txtNumero", 'input[name$="txtNumero"]']) || extrairSinIdDaUrl() || itemKey || null;
    const statusAtual = obterCampoValor(["#txtStatus", 'input[name$="txtStatus"]']) || null;
    const solicitante = obterCampoValor(["#txtSolicitante", 'input[name$="txtSolicitante"]']) || null;
    const empresa = obterCampoValor(["#txtEmpresa", 'input[name$="txtEmpresa"]']) || null;
    const estadoAny = estado;
    return {
      itemId,
      sinId,
      statusAtual,
      solicitante,
      empresa,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      itemKey: itemKey || null,
      perfil: (estadoAny == null ? void 0 : estadoAny.perfilAtivo) || "default"
    };
  }
  function criarErroRelatorio(code, message, cause = null) {
    const err = new Error(`${code}: ${message}`);
    err.code = code;
    err.cause = cause || null;
    return err;
  }
  function classificarErroServico(message = "") {
    const msg = String(message || "");
    if (/401|token|unauthorized/i.test(msg)) return REPORTING_ERROR_CODES.SERVICE_AUTH_MISSING;
    if (/413|file_size|file_count|limit|UPLOAD_LIMIT_EXCEEDED/i.test(msg)) return REPORTING_ERROR_CODES.UPLOAD_LIMIT_EXCEEDED;
    return REPORTING_ERROR_CODES.SERVICE_UNAVAILABLE;
  }
  function extrairCharsetContentType(contentType = "") {
    const m = String(contentType || "").match(/charset\s*=\s*["']?([^;"'\s]+)/i);
    return (m == null ? void 0 : m[1]) ? m[1].trim().toLowerCase() : "";
  }
  function extrairCharsetMeta(bytes) {
    try {
      const head = bytes.slice(0, 8192);
      const ascii = new TextDecoder("ascii").decode(head);
      const mCharset = ascii.match(/<meta[^>]*charset=["']?\s*([a-z0-9._-]+)/i);
      if (mCharset == null ? void 0 : mCharset[1]) return mCharset[1].trim().toLowerCase();
      const mHttpEquiv = ascii.match(/<meta[^>]*http-equiv=["']content-type["'][^>]*content=["'][^"']*charset=([a-z0-9._-]+)/i);
      if (mHttpEquiv == null ? void 0 : mHttpEquiv[1]) return mHttpEquiv[1].trim().toLowerCase();
    } catch {
    }
    return "";
  }
  function normalizarLabelCharset(charset = "") {
    const c = String(charset || "").toLowerCase();
    if (!c) return "";
    if (c === "latin1") return "iso-8859-1";
    if (c === "cp1252" || c === "windows1252") return "windows-1252";
    return c;
  }
  function scoreTextoDecodificado(texto = "") {
    const invalid = (texto.match(/\uFFFD/g) || []).length;
    const mojibake = (texto.match(/Ã.|Â.|â€|â€œ|â€/g) || []).length;
    return invalid * 10 + mojibake;
  }
  function decodificarTextoHttp(buffer, contentType = "") {
    const bytes = new Uint8Array(buffer || []);
    const candidatos = [];
    const headerCharset = normalizarLabelCharset(extrairCharsetContentType(contentType));
    const metaCharset = normalizarLabelCharset(extrairCharsetMeta(bytes));
    if (headerCharset) candidatos.push(headerCharset);
    if (metaCharset && metaCharset !== headerCharset) candidatos.push(metaCharset);
    candidatos.push("utf-8", "windows-1252", "iso-8859-1");
    let melhorTexto = "";
    let melhorScore = Number.POSITIVE_INFINITY;
    for (const charset of candidatos) {
      try {
        const texto = new TextDecoder(charset, { fatal: false }).decode(bytes);
        const score = scoreTextoDecodificado(texto);
        if (score < melhorScore) {
          melhorScore = score;
          melhorTexto = texto;
        }
        if (score === 0) break;
      } catch {
      }
    }
    if (melhorTexto) return melhorTexto;
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
  async function fetchWithRetry(url, { method = "GET", body = null, headers = {}, responseType = "text", timeoutMs = CONFIG.REPORTING.FETCH_TIMEOUT_MS, attempts = CONFIG.REPORTING.RETRY_ATTEMPTS } = {}) {
    var _a;
    let lastErr = null;
    for (let i = 1; i <= Math.max(1, attempts); i++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const opts = {
          method,
          credentials: "include",
          signal: controller.signal,
          headers: { ...headers }
        };
        if (body) opts.body = body;
        const resp = await fetch(url, opts);
        if (!resp.ok) throw new Error(`Falha HTTP ${resp.status}`);
        if (responseType === "blob") return await resp.blob();
        const buffer = await resp.arrayBuffer();
        return decodificarTextoHttp(buffer, ((_a = resp.headers) == null ? void 0 : _a.get("content-type")) || "");
      } catch (err) {
        lastErr = err;
        if (i < attempts) {
          const jitter = Math.floor(Math.random() * CONFIG.REPORTING.RETRY_JITTER_MS);
          const delay = CONFIG.REPORTING.RETRY_BASE_DELAY_MS * Math.pow(2, i - 1) + jitter;
          await sleep(delay);
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr || new Error("Falha de rede sem detalhe");
  }
  async function fetchHtml(url) {
    return await fetchWithRetry(url, { responseType: "text" });
  }
  async function fetchPostHtml(url, formData) {
    return await fetchWithRetry(url, {
      method: "POST",
      body: formData,
      responseType: "text"
    });
  }
  async function fetchBlob(url) {
    return await fetchWithRetry(url, { responseType: "blob" });
  }
  const IMG_EXT = /* @__PURE__ */ new Set(["jpg", "jpeg", "png", "gif", "bmp", "webp"]);
  const PDF_EXT = /* @__PURE__ */ new Set(["pdf"]);
  function absolutizarComBase(href, baseUrl) {
    try {
      return new URL(String(href ?? ""), baseUrl || window.location.href).toString();
    } catch {
      return null;
    }
  }
  function classificarMidia(url, title = "") {
    const cleanTitle = normalizarEspacos(title);
    let ext = "";
    let fileExt = "";
    try {
      const parsedUrl = new URL(url, window.location.href);
      const pathname = parsedUrl.pathname || "";
      const mPath = pathname.toLowerCase().match(/\.([a-z0-9]+)$/);
      ext = (mPath == null ? void 0 : mPath[1]) || "";
      const fileParam = parsedUrl.searchParams.get("file") || "";
      const mFile = fileParam.toLowerCase().match(/\.([a-z0-9]+)$/);
      fileExt = (mFile == null ? void 0 : mFile[1]) || "";
    } catch {
      ext = "";
      fileExt = "";
    }
    if (fileExt) ext = fileExt;
    if (IMG_EXT.has(ext)) return { tipo: "imagem", ext };
    if (PDF_EXT.has(ext)) return { tipo: "pdf", ext };
    if (/\bpdf\b/i.test(cleanTitle)) return { tipo: "pdf", ext: ext || "pdf" };
    if (/xlsx?|docx?|pptx?|txt|csv|zip|rar|7z/i.test(ext)) {
      return { tipo: "file", ext };
    }
    if (/\bfoto|\bimagem|\banexo|\barquivo/i.test(cleanTitle)) return { tipo: "unsupported", ext };
    if (ext && ext.length <= 5) return { tipo: "file", ext };
    return { tipo: "unsupported", ext };
  }
  function isLinkAcaoInvalida(href, title = "", text = "") {
    const rawHref = String(href || "");
    const rawMeta = `${title || ""} ${text || ""}`.toLowerCase();
    if (!rawHref || rawHref.startsWith("#")) return true;
    if (/^javascript:/i.test(rawHref) && !/open[\w]*\s*\(/i.test(rawHref)) return true;
    if (/__doPostBack/i.test(rawHref) && !/dlMidias|Foto|PDF|Midia/i.test(rawHref + " " + rawMeta)) return true;
    if (/excluir|adicionar|remover|editar/i.test(rawMeta)) return true;
    return false;
  }
  function extrairUrlOpenGenerica(href, nomesFuncoes = []) {
    const fromKnown = extrairUrlDaFuncaoJs(href, nomesFuncoes);
    if (fromKnown) return fromKnown;
    const raw = String(href ?? "");
    if (!raw) return null;
    const m = raw.match(/open[\w]*\s*\(\s*['"]([^'"]+)['"]/i);
    if (m == null ? void 0 : m[1]) return absolutizarUrl(m[1]);
    const mAbre = raw.match(/abre(?:PDF)?\s*\(\s*['"]([^'"]+)['"]/i);
    if (mAbre == null ? void 0 : mAbre[1]) return absolutizarUrl(mAbre[1]);
    return null;
  }
  function encontrarAbaMidia(itemKey = null) {
    const tabRoot = document.querySelector("#dlTab");
    const links = tabRoot ? [...tabRoot.querySelectorAll("a")] : [...document.querySelectorAll('a[href*="Midia.aspx"], a#lbutMenu')];
    const linksMidia = links.filter((a) => {
      const txt = normalizarTextoSemAcento(a.textContent || "");
      return txt.includes("midias (") || txt.includes("midia (") || txt.startsWith("midias");
    });
    if (linksMidia.length === 0) return null;
    const candidatoHref = linksMidia.find((a) => {
      const href = String(a.getAttribute("href") || "");
      const midiaUrl = extrairUrlOpenGenerica(href, ["OpenNewTab", "opennewtab", "OpenWindowsWHR", "OpenWindowsWHRNS"]);
      if (!midiaUrl) return false;
      try {
        const u = new URL(midiaUrl, window.location.href);
        const id = u.searchParams.get("id");
        if (itemKey && id && String(id) !== String(itemKey)) return false;
        return /Midia\.aspx/i.test(u.pathname || "");
      } catch {
        return false;
      }
    });
    return candidatoHref || linksMidia[0] || null;
  }
  function extrairQtdMidiaDoTexto(texto) {
    const raw = normalizarEspacos(texto || "");
    const m = raw.match(/Mídias?\s*\((\d+)\)/i);
    if (!m) return null;
    const n = Number.parseInt(m[1], 10);
    return Number.isFinite(n) ? n : null;
  }
  function montarUrlsMidiaCandidatas(midiaUrl, _itemKey) {
    const url = String(midiaUrl || "").trim();
    return url ? [url] : [];
  }
  function detectarErroHtmlMidia(doc, html, requestUrl = "") {
    var _a, _b;
    const titulo = normalizarTextoSemAcento(((_a = doc == null ? void 0 : doc.querySelector("title")) == null ? void 0 : _a.textContent) || "");
    const texto = normalizarTextoSemAcento(((_b = doc == null ? void 0 : doc.body) == null ? void 0 : _b.textContent) || html || "");
    const url = normalizarTextoSemAcento(requestUrl || "");
    const ehErroAspx = titulo.includes("erro") || url.includes("/erro.aspx");
    const acessoNegado = texto.includes("acesso nao autorizado") || texto.includes("nao edite a url");
    const excecao = texto.includes("ocorreu uma excecao") || texto.includes("object reference not set to an instance of an object");
    if (ehErroAspx || acessoNegado || excecao) {
      if (acessoNegado) return "Acesso não autorizado na Midia.aspx (URL protegida do Klassmatt)";
      if (excecao) return "Midia.aspx retornou página de exceção do Klassmatt";
      return "Midia.aspx retornou página de erro do Klassmatt";
    }
    return null;
  }
  function extrairCategoriasMidia(doc, baseUrl) {
    const categorias = [];
    if (!doc) return categorias;
    const sidebars = doc.querySelectorAll('#dlMidias, [id*="dlMidias"]');
    if (sidebars.length === 0) return categorias;
    const vistos = /* @__PURE__ */ new Set();
    for (const sidebar of sidebars) {
      const links = sidebar.querySelectorAll("a[href]");
      for (const a of links) {
        const href = a.getAttribute("href") || "";
        const text = normalizarEspacos(a.textContent || "");
        if (/adicionar|excluir|remover|editar/i.test(text)) continue;
        let cat = null;
        if (/javascript:/i.test(href) && /__doPostBack/i.test(href)) {
          const m = href.match(/__doPostBack\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]\s*\)/);
          if (m == null ? void 0 : m[1]) {
            cat = {
              label: text,
              type: "postback",
              target: m[1],
              argument: m[2] || "",
              url: null
            };
          }
        } else if (/Midia\.aspx/i.test(href)) {
          const url = absolutizarComBase(href, baseUrl || window.location.href);
          if (url) {
            cat = {
              label: text,
              type: "link",
              url,
              target: null,
              argument: null
            };
          }
        }
        if (cat) {
          const key = cat.type === "postback" ? `pb:${cat.target}` : `lnk:${cat.url}`;
          if (!vistos.has(key)) {
            vistos.add(key);
            categorias.push(cat);
          }
        }
      }
    }
    return categorias;
  }
  function extrairViewState(doc) {
    if (!doc) return {};
    const getVal = (id) => {
      const el = doc.querySelector(`#${id}`) || doc.querySelector(`input[name="${id}"]`);
      return (el == null ? void 0 : el.value) || "";
    };
    return {
      __VIEWSTATE: getVal("__VIEWSTATE"),
      __VIEWSTATEGENERATOR: getVal("__VIEWSTATEGENERATOR"),
      __EVENTVALIDATION: getVal("__EVENTVALIDATION")
    };
  }
  function extrairItensMidiaDoDocumento(doc, baseUrl) {
    const containers = [
      ...doc.querySelectorAll('.slide, .carrousel, #dlMidias, [id*="dlMidias"], [class*="midia"], [class*="galeria"], .wme-galeria, .wme-galeria-g, .wme-galeria-lista, #divFotos')
    ];
    const roots = containers.length > 0 ? containers : [doc.body];
    const vistos = /* @__PURE__ */ new Set();
    const itens = [];
    const pushItem = (url, meta = {}) => {
      if (!url || vistos.has(url)) return;
      vistos.add(url);
      const title = String(meta.title || "");
      const cls = classificarMidia(url, title);
      if (cls.tipo === "unsupported" && !title && !/GetTempFile|Banco_Imagens/i.test(url)) return;
      itens.push({
        url,
        tipo: cls.tipo,
        ext: cls.ext || null,
        title: normalizarEspacos(title) || null,
        filename: slugifyArquivo(meta.filename || url.split("/").pop() || `midia_${itens.length + 1}`),
        source: meta.source || "Midia.aspx"
      });
    };
    for (const root of roots) {
      const anchors = [...root.querySelectorAll("a[href]")];
      for (const a of anchors) {
        const href = a.getAttribute("href") || "";
        const title = a.getAttribute("title") || "";
        const text = a.textContent || "";
        const onmouse = a.getAttribute("onmouseover") || "";
        const mMouse = onmouse.match(/abre(?:PDF)?\s*\(\s*this\s*,\s*["'](.+?)["']\s*\)/);
        const enrichedTitle = title || ((mMouse == null ? void 0 : mMouse[1]) ? normalizarEspacos(mMouse[1]) : "") || text;
        if (isLinkAcaoInvalida(href, title, text)) continue;
        const url = absolutizarComBase(href, baseUrl);
        if (!url) continue;
        pushItem(url, {
          title: enrichedTitle,
          filename: a.getAttribute("download") || null,
          source: "Midia.aspx"
        });
      }
      const dataImgAnchors = [...root.querySelectorAll("a[data-image], a[data-zoom-image]")];
      for (const a of dataImgAnchors) {
        const dataUrl = a.getAttribute("data-image") || a.getAttribute("data-zoom-image") || "";
        const url = absolutizarComBase(dataUrl, baseUrl);
        if (!url) continue;
        pushItem(url, {
          title: a.getAttribute("title") || "",
          filename: a.getAttribute("download") || null,
          source: "Midia.aspx/data-attr"
        });
      }
      const imgs = [...root.querySelectorAll("img[src]")];
      for (const img of imgs) {
        const src = img.getAttribute("src") || "";
        if (/^imagens\//i.test(src) || /\/imagens\//i.test(src)) continue;
        if (!src || src === "#") continue;
        const url = absolutizarComBase(src, baseUrl);
        if (!url) continue;
        pushItem(url, {
          title: img.getAttribute("alt") || img.getAttribute("title") || "Imagem",
          source: "Midia.aspx/img"
        });
      }
    }
    if (itens.length === 0 && doc.body) {
      const allAnchors = [...doc.body.querySelectorAll("a[href]")];
      for (const a of allAnchors) {
        const href = a.getAttribute("href") || "";
        const title = a.getAttribute("title") || "";
        const text = a.textContent || "";
        if (isLinkAcaoInvalida(href, title, text)) continue;
        const url = absolutizarComBase(href, baseUrl);
        if (!url) continue;
        pushItem(url, { title, filename: a.getAttribute("download") || null, source: "Midia.aspx/fallback" });
      }
      const allDataImgs = [...doc.body.querySelectorAll("a[data-image], a[data-zoom-image]")];
      for (const a of allDataImgs) {
        const dataUrl = a.getAttribute("data-image") || a.getAttribute("data-zoom-image") || "";
        const url = absolutizarComBase(dataUrl, baseUrl);
        if (!url) continue;
        pushItem(url, {
          title: a.getAttribute("title") || "",
          filename: a.getAttribute("download") || null,
          source: "Midia.aspx/fallback-data"
        });
      }
      const allImgs = [...doc.body.querySelectorAll("img[src]")];
      for (const img of allImgs) {
        const src = img.getAttribute("src") || "";
        if (/^imagens\//i.test(src) || /\/imagens\//i.test(src)) continue;
        if (!src || src === "#") continue;
        const url = absolutizarComBase(src, baseUrl);
        if (!url) continue;
        pushItem(url, {
          title: img.getAttribute("alt") || img.getAttribute("title") || "Imagem",
          source: "Midia.aspx/fallback-img"
        });
      }
    }
    return itens;
  }
  function finalizarColetaMidiaSemArquivos(itemKey, summary) {
    const cache2 = getCacheItem(itemKey);
    if (cache2) {
      cache2.media = summary;
      cache2.files = cache2.files || [];
    }
    updateItemReportingState(itemKey, {
      mediaDone: true,
      mediaSummary: summary,
      mediaCollectedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    return { ok: true, summary, files: [] };
  }
  function extrairSessionToken() {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("k") || null;
    } catch {
      return null;
    }
  }
  function anexarSessionToken(url, sessionKey) {
    if (!sessionKey || !url) return url;
    try {
      const u = new URL(url, window.location.href);
      if (!u.searchParams.has("k")) {
        u.searchParams.set("k", sessionKey);
      }
      return u.toString();
    } catch {
      if (!url.includes("k=")) {
        return url + (url.includes("?") ? "&" : "?") + `k=${sessionKey}`;
      }
      return url;
    }
  }
  function detectarContextoSin() {
    const href = window.location.href;
    const params = new URLSearchParams(window.location.search);
    if (/SIN_Item|SIN_Resumo|sin_lista|SIN_Classificacao|SIN_Detalhes|SIN_Novo/i.test(href)) return true;
    const keys = Array.from(params.keys()).map((k) => k.toLowerCase());
    return keys.includes("idsin");
  }
  async function coletarMidia$1(estado, itemKey) {
    const reporting = getReportingConfig(estado);
    if (!reporting.enabledMedia) {
      const summary2 = { status: "SKIPPED_DISABLED", total: 0, imagens: 0, pdfs: 0, unsupported: 0, itens: [] };
      updateItemReportingState(itemKey, { mediaDone: true, mediaSummary: summary2, mediaSkipped: true });
      return { ok: true, skipped: true, summary: summary2, files: [] };
    }
    const sessionKey = extrairSessionToken();
    const abaMidia = encontrarAbaMidia(itemKey);
    if (!abaMidia) {
      const summary2 = { status: "ABA_MIDIA_NAO_ENCONTRADA", total: 0, imagens: 0, pdfs: 0, unsupported: 0, itens: [] };
      updateItemReportingState(itemKey, { mediaDone: true, mediaSummary: summary2 });
      return { ok: true, skipped: true, summary: summary2, files: [] };
    }
    const qtdMidia = extrairQtdMidiaDoTexto(abaMidia.textContent || "") ?? 0;
    if (qtdMidia === 0) {
      const summary2 = { status: "SEM_MIDIA_UI_ZERO", total: 0, imagens: 0, pdfs: 0, unsupported: 0, itens: [] };
      updateItemReportingState(itemKey, { mediaDone: true, mediaSummary: summary2 });
      const cache22 = getCacheItem(itemKey);
      if (cache22) cache22.media = summary2;
      return { ok: true, summary: summary2, files: [] };
    }
    const hrefMidia = abaMidia.getAttribute("href") || "";
    let midiaUrl = extrairUrlOpenGenerica(hrefMidia, ["OpenNewTab", "opennewtab"]);
    if (!midiaUrl) {
      const itemId = itemKey || new URLSearchParams(window.location.search).get("IdItem");
      const isSinContext = detectarContextoSin();
      const tipo = isSinContext ? "SIN" : "Itens";
      let targetId = itemId;
      if (isSinContext) {
        const params = new URLSearchParams(window.location.search);
        const idSin = params.get("IdSIN") || params.get("idsin");
        if (idSin) targetId = idSin;
      }
      if (targetId) {
        midiaUrl = absolutizarUrl(`Midia.aspx?tipo=${tipo}&id=${targetId}&Alterar=0&Session=${tipo}`);
      }
      if (!midiaUrl) {
        const summary2 = {
          status: "SEM_MIDIA_URL",
          total: 0,
          imagens: 0,
          pdfs: 0,
          unsupported: 0,
          requestedByUiCount: qtdMidia,
          diagnostic: "Não foi possível extrair URL de Midia.aspx",
          itens: []
        };
        return finalizarColetaMidiaSemArquivos(itemKey, summary2);
      }
    }
    midiaUrl = anexarSessionToken(midiaUrl, sessionKey);
    let itens = [];
    let baseMidiaUsada = midiaUrl;
    const urlsCandidatas = montarUrlsMidiaCandidatas(midiaUrl).map(
      (u) => anexarSessionToken(u, sessionKey)
    );
    let lastErr = null;
    for (const urlCandidata of urlsCandidatas) {
      try {
        const html = await fetchHtml(urlCandidata);
        const doc = new DOMParser().parseFromString(html, "text/html");
        const erroMidia = detectarErroHtmlMidia(doc, html, urlCandidata);
        if (erroMidia) {
          const summary2 = {
            status: "SEM_MIDIA_ERRO_PAGINA",
            total: 0,
            imagens: 0,
            pdfs: 0,
            unsupported: 0,
            sourceUrl: urlCandidata,
            requestedByUiCount: qtdMidia,
            diagnostic: erroMidia,
            itens: []
          };
          return finalizarColetaMidiaSemArquivos(itemKey, summary2);
        }
        const candidatos = extrairItensMidiaDoDocumento(doc, urlCandidata);
        if (candidatos.length > 0) {
          itens = candidatos;
          baseMidiaUsada = urlCandidata;
        }
        const categorias = extrairCategoriasMidia(doc, urlCandidata);
        const categoriasVisitadas = /* @__PURE__ */ new Set([urlCandidata]);
        const viewStateInicial = extrairViewState(doc);
        for (const cat of categorias) {
          let catHtml = null;
          let catUrl = null;
          try {
            if (cat.type === "link" && cat.url) {
              catUrl = anexarSessionToken(cat.url, sessionKey);
              if (categoriasVisitadas.has(catUrl)) continue;
              categoriasVisitadas.add(catUrl);
              catHtml = await fetchHtml(catUrl);
            } else if (cat.type === "postback" && cat.target) {
              const key = `pb:${cat.target}`;
              if (categoriasVisitadas.has(key)) continue;
              categoriasVisitadas.add(key);
              const formData = new FormData();
              formData.append("__EVENTTARGET", cat.target);
              formData.append("__EVENTARGUMENT", cat.argument || "");
              formData.append("__VIEWSTATE", viewStateInicial.__VIEWSTATE || "");
              formData.append("__VIEWSTATEGENERATOR", viewStateInicial.__VIEWSTATEGENERATOR || "");
              formData.append("__EVENTVALIDATION", viewStateInicial.__EVENTVALIDATION || "");
              const postUrl = anexarSessionToken(urlCandidata, sessionKey);
              catHtml = await fetchPostHtml(postUrl, formData);
              if (catHtml) {
                console.log(`[ColetorMidia] PostBack '${cat.label}' retornou ${catHtml.length} chars. Início: ${catHtml.substring(0, 500)}...`);
              } else {
                console.warn(`[ColetorMidia] PostBack '${cat.label}' retornou VAZIO.`);
              }
              catUrl = `${urlCandidata}#cat=${cat.label}`;
            }
            if (!catHtml) continue;
            const catDoc = new DOMParser().parseFromString(catHtml, "text/html");
            const err = detectarErroHtmlMidia(catDoc, catHtml, catUrl || urlCandidata);
            if (err) {
              console.warn(`[ColetorMidia] Erro detectado na resposta do PostBack '${cat.label}': ${err}`);
              continue;
            }
            const catItens = extrairItensMidiaDoDocumento(catDoc, catUrl || urlCandidata);
            for (const ci of catItens) {
              if (!itens.some((existing) => existing.url === ci.url)) {
                ci.source = `Midia.aspx/cat:${cat.label || "extra"}`;
                itens.push(ci);
              }
            }
          } catch (_catErr) {
            console.warn(`[ColetorMidia] Erro ao buscar categoria ${cat.label}:`, _catErr);
          }
        }
        if (itens.length > 0) break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (itens.length === 0 && lastErr) {
      const summary2 = {
        status: "SEM_MIDIA_FETCH_ERROR",
        total: 0,
        imagens: 0,
        pdfs: 0,
        unsupported: 0,
        sourceUrl: baseMidiaUsada,
        requestedByUiCount: qtdMidia,
        diagnostic: `Falha ao buscar Midia.aspx: ${(lastErr == null ? void 0 : lastErr.message) || lastErr}`,
        itens: []
      };
      return finalizarColetaMidiaSemArquivos(itemKey, summary2);
    }
    if (itens.length === 0) {
      const summary2 = {
        status: "SEM_MIDIA_PARSE",
        total: 0,
        imagens: 0,
        pdfs: 0,
        unsupported: 0,
        sourceUrl: baseMidiaUsada,
        requestedByUiCount: qtdMidia,
        diagnostic: null,
        itens: []
      };
      return finalizarColetaMidiaSemArquivos(itemKey, summary2);
    }
    const files = [];
    const limitByUi = Math.max(1, Number(reporting.maxFilesPerItem || CONFIG.REPORTING.MAX_FILES_PER_ITEM));
    const limit = Math.min(CONFIG.REPORTING.MAX_MEDIA_DOWNLOADS, limitByUi);
    const maxBytes = Math.max(1, Number(reporting.maxFileSizeMb || CONFIG.REPORTING.MAX_FILE_SIZE_MB)) * 1024 * 1024;
    for (const item of itens.slice(0, limit)) {
      if (item.tipo !== "imagem" && item.tipo !== "pdf" && item.tipo !== "file") continue;
      try {
        const downloadUrl = anexarSessionToken(item.url, sessionKey);
        const blob = await fetchBlob(downloadUrl);
        if (blob.size > maxBytes) {
          item.downloadError = `${REPORTING_ERROR_CODES.UPLOAD_LIMIT_EXCEEDED}: arquivo excede limite de ${reporting.maxFileSizeMb}MB`;
          continue;
        }
        let mime = blob.type;
        if (!mime || mime === "application/octet-stream") {
          if (item.tipo === "pdf") mime = "application/pdf";
          else if (item.tipo === "imagem") mime = "image/*";
          else mime = "application/octet-stream";
        }
        files.push({
          kind: item.tipo,
          filename: item.filename,
          url: item.url,
          mimeType: mime,
          blob,
          size: blob.size
        });
      } catch (err) {
        item.downloadError = `${REPORTING_ERROR_CODES.MEDIA_PARSE_ERROR}: ${String((err == null ? void 0 : err.message) || err)}`;
      }
    }
    const imagens = itens.filter((i) => i.tipo === "imagem").length;
    const pdfs = itens.filter((i) => i.tipo === "pdf").length;
    const filesCount = itens.filter((i) => i.tipo === "file").length;
    const unsupported = itens.filter((i) => i.tipo === "unsupported").length;
    const summary = {
      status: "OK",
      total: itens.length,
      imagens,
      pdfs,
      otherFiles: filesCount,
      unsupported,
      sourceUrl: baseMidiaUsada,
      requestedByUiCount: qtdMidia,
      itens
    };
    const cache2 = getCacheItem(itemKey);
    if (cache2) {
      cache2.media = summary;
      cache2.files = (cache2.files || []).concat(files);
    }
    updateItemReportingState(itemKey, {
      mediaDone: true,
      mediaSummary: summary,
      mediaCollectedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    return { ok: true, summary, files };
  }
  function normalizarCodigoNcm(raw) {
    const digits = String(raw || "").replace(/\D/g, "");
    if (digits.length !== 8) return null;
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
  }
  function detectarMencoesNcmEvento(texto) {
    const src = normalizarEspacos(texto || "");
    if (!src) {
      return { keywordMention: false, formattedCodes: [], unformattedCodes: [] };
    }
    const norm = normalizarTextoSemAcento(src).toLowerCase();
    const keywordMention = /\bn\.?\s*c\.?\s*m\b|\bncm\b/i.test(norm);
    const contextoNcm = keywordMention || /(classificac[aã]o\s*fiscal|codigo\s*ncm|cod\.?\s*ncm)/i.test(norm);
    const formattedMatch = src.match(/\b\d{4}\.\d{2}\.\d{2}\b/g) || [];
    const formatted = [...new Set(formattedMatch.map(normalizarCodigoNcm).filter((c) => Boolean(c)))];
    const unformattedMatch = src.match(/\b\d{8}\b/g) || [];
    const unformatted = contextoNcm ? [...new Set(unformattedMatch.map(normalizarCodigoNcm).filter((c) => Boolean(c)))] : [];
    return { keywordMention, formattedCodes: formatted, unformattedCodes: unformatted };
  }
  function consolidarHistorico(eventos) {
    const timeline = [];
    const stageTransitions = [];
    const importantes = [];
    const ncmCodesSet = /* @__PURE__ */ new Set();
    const evidences = [];
    let ncmKeywordMentions = 0;
    let formattedMatches = 0;
    let unformattedMatchesWithContext = 0;
    let fiscalCount = 0;
    for (const evento of eventos) {
      const dia = normalizarEspacos((evento == null ? void 0 : evento.dia) || "");
      const hora = normalizarEspacos((evento == null ? void 0 : evento.hora) || "");
      const usuarioAtual = normalizarEspacos((evento == null ? void 0 : evento.usuario) || "") || null;
      const descricao = normalizarEspacos((evento == null ? void 0 : evento.descricao) || "");
      if (!descricao) continue;
      const descricaoHtml = String((evento == null ? void 0 : evento.descricaoHtml) || "").trim();
      const yellowComments = Array.isArray(evento == null ? void 0 : evento.yellowComments) ? evento.yellowComments.map((s) => normalizarEspacos(s || "")).filter(Boolean) : [];
      const fontesNcm = [descricao, ...yellowComments];
      const mStage = descricao.match(/Solicita[cç][aã]o enviada para\s+(.+)$/i) || descricao.match(/Solicita.*o enviada para\s+(.+)$/i);
      const stage = mStage ? normalizarEspacos(mStage[1]).toUpperCase() : null;
      if (stage) {
        stageTransitions.push({ dia, hora, usuario: usuarioAtual, stage });
        if (stage.includes("FISCAL-INTEGRA") || stage.includes("FISCAL-KLASSMATT")) fiscalCount++;
      }
      if (/retorn|forçou o retorno|trazer de volta/i.test(descricao)) {
        importantes.push({ tipo: "RETORNO_ETAPA", dia, hora, usuario: usuarioAtual, descricao });
      }
      if (/SOLICITACAO ALTERADA/i.test(descricao)) {
        const keys = CONFIG.REPORTING.ALTERACAO_CAMPOS_CHAVE.filter((k) => descricao.toUpperCase().includes(k));
        if (keys.length > 0) {
          importantes.push({
            tipo: "ALTERACAO_CHAVE",
            dia,
            hora,
            usuario: usuarioAtual,
            campos: keys,
            descricao
          });
        }
      }
      for (const yc of yellowComments) {
        const norm = normalizarTextoSemAcento(yc);
        const score = CONFIG.REPORTING.IMPORTANT_YELLOW_KEYWORDS.reduce((acc, kw) => acc + (norm.includes(kw) ? 1 : 0), 0);
        if (score > 0) {
          importantes.push({
            tipo: "COMENTARIO_AMARELO_IMPORTANTE",
            score,
            dia,
            hora,
            usuario: usuarioAtual,
            comentario: yc
          });
        }
      }
      for (const fonte of fontesNcm) {
        const det = detectarMencoesNcmEvento(fonte);
        if (det.keywordMention) ncmKeywordMentions++;
        if (det.formattedCodes.length > 0) formattedMatches += det.formattedCodes.length;
        if (det.unformattedCodes.length > 0) unformattedMatchesWithContext += det.unformattedCodes.length;
        const codigos = [...det.formattedCodes, ...det.unformattedCodes];
        for (const codigo of codigos) {
          ncmCodesSet.add(codigo);
          if (evidences.length < 8) {
            evidences.push({
              dia,
              hora,
              usuario: usuarioAtual,
              codigo,
              trecho: fonte.slice(0, 220)
            });
          }
        }
      }
      timeline.push({
        dia,
        hora,
        usuario: usuarioAtual,
        descricao,
        descricaoHtml,
        stage,
        yellowComments
      });
    }
    const criticalFiscalRework = fiscalCount > 2;
    if (criticalFiscalRework) {
      importantes.unshift({
        tipo: "ALERTA_FISCAL_REINCIDENCIA",
        descricao: `Etapas FISCAL-INTEGRA/FISCAL-KLASSMATT apareceram ${fiscalCount} vezes (limite > 2)`
      });
    }
    return {
      timeline,
      summary: {
        totalEventos: timeline.length,
        totalTransicoes: stageTransitions.length,
        fiscalTransitionsCount: fiscalCount,
        criticalFiscalRework,
        stageTransitions,
        importantSignals: importantes,
        ncmMentions: {
          found: ncmKeywordMentions > 0 || ncmCodesSet.size > 0,
          keywordMentions: ncmKeywordMentions,
          formattedMatches,
          unformattedMatchesWithContext,
          codes: [...ncmCodesSet],
          evidences
        }
      }
    };
  }
  function parseHistoricoEstrito(doc) {
    var _a, _b;
    const eventos = [];
    const fieldsets = [...doc.querySelectorAll("fieldset.hist-fieldset")];
    for (const fs of fieldsets) {
      const dia = normalizarEspacos(((_a = fs.querySelector("legend.hist-legend")) == null ? void 0 : _a.textContent) || "");
      let usuarioAtual = null;
      const rows = [...fs.querySelectorAll(".row")];
      for (const row of rows) {
        const isResult = row.classList.contains("result");
        if (!isResult) {
          const userLink = row.querySelector('a#hlinkUsuario, a[href*="USUARIO_show"]');
          if (userLink) usuarioAtual = normalizarEspacos(userLink.textContent || "").replace(/\*+$/, "");
          continue;
        }
        const hora = normalizarEspacos(((_b = row.querySelector('span[id="lblHora"]')) == null ? void 0 : _b.textContent) || "");
        const descEl = row.querySelector('span[id="lblDescricao"]');
        const descricao = normalizarEspacos((descEl == null ? void 0 : descEl.textContent) || "");
        const descricaoHtml = ((descEl == null ? void 0 : descEl.innerHTML) || "").trim();
        const yellowNodes = descEl ? [...descEl.querySelectorAll('span[style*="background-color"]')] : [];
        const yellowComments = yellowNodes.map((n) => normalizarEspacos(n.textContent || "")).filter(Boolean);
        eventos.push({
          dia,
          hora,
          usuario: usuarioAtual,
          descricao,
          descricaoHtml,
          yellowComments
        });
      }
    }
    return consolidarHistorico(eventos);
  }
  function parseHistoricoLoose(doc) {
    var _a;
    const eventos = [];
    const fieldsets = [...doc.querySelectorAll("fieldset")];
    for (const fs of fieldsets) {
      const dia = normalizarEspacos(((_a = fs.querySelector("legend")) == null ? void 0 : _a.textContent) || "");
      let usuarioAtual = null;
      const textoBruto = String(fs.innerText || fs.textContent || "");
      const linhas = textoBruto.split(/\r?\n+/).map((s) => normalizarEspacos(s)).filter(Boolean);
      let eventoAtual = null;
      for (const linha of linhas) {
        if (dia && linha === dia) continue;
        const candidatoUsuario = linha.replace(/\*+$/, "");
        if (/^[a-zA-Z0-9._-]{3,}$/.test(candidatoUsuario) && !/\s/.test(candidatoUsuario) && !/solicita[cç][aã]o|retorn|aprov|catalog|revis/i.test(candidatoUsuario)) {
          if (eventoAtual) {
            eventos.push(eventoAtual);
            eventoAtual = null;
          }
          usuarioAtual = candidatoUsuario;
          continue;
        }
        const mHora = linha.match(/^(\d{1,2}:\d{2})(?:\s*[-–]\s*|\s+)(.+)$/);
        if (mHora == null ? void 0 : mHora[2]) {
          if (eventoAtual) eventos.push(eventoAtual);
          eventoAtual = {
            dia,
            hora: mHora[1],
            usuario: usuarioAtual,
            descricao: normalizarEspacos(mHora[2]),
            descricaoHtml: "",
            yellowComments: []
          };
        } else if (eventoAtual) {
          eventoAtual.descricao += " " + linha;
        } else {
          eventos.push({
            dia,
            hora: "",
            usuario: usuarioAtual,
            descricao: linha,
            descricaoHtml: "",
            yellowComments: []
          });
        }
      }
      if (eventoAtual) eventos.push(eventoAtual);
    }
    return consolidarHistorico(eventos);
  }
  function parseHistorico(doc) {
    const parsedEstrito = parseHistoricoEstrito(doc);
    const estritoTotal = ((parsedEstrito == null ? void 0 : parsedEstrito.timeline) || []).length;
    if (estritoTotal > 0) return parsedEstrito;
    return parseHistoricoLoose(doc);
  }
  const EMPTY_NCM$1 = { found: false, keywordMentions: 0, formattedMatches: 0, unformattedMatchesWithContext: 0, codes: [], evidences: [] };
  function buildSkipSummary(status, extra = {}) {
    return {
      status,
      totalEventos: 0,
      totalTransicoes: 0,
      fiscalTransitionsCount: 0,
      criticalFiscalRework: false,
      stageTransitions: [],
      importantSignals: [],
      ncmMentions: { ...EMPTY_NCM$1 },
      ...extra
    };
  }
  function encontrarLinkAcompanhamento() {
    const direto = buscarElementoDeep("#hButAcompanhamentoSIN, #hlkObs");
    if (direto) return direto;
    const links = [...document.querySelectorAll("a")];
    return links.find((a) => normalizarTextoSemAcento(a.textContent || "").includes("acompanhamento")) || null;
  }
  async function coletarAcompanhamento$1(estado, itemKey) {
    const reporting = getReportingConfig(estado);
    if (!reporting.enabledAcompanhamento) {
      const summary = buildSkipSummary("SKIPPED_DISABLED");
      updateItemReportingState(itemKey, { acompanhamentoDone: true, acompanhamentoSummary: summary, acompanhamentoSkipped: true });
      return { ok: true, skipped: true, summary };
    }
    const link = encontrarLinkAcompanhamento();
    let acompanhamentoUrl = null;
    if (link) {
      const href = link.getAttribute("href") || "";
      acompanhamentoUrl = extrairUrlOpenGenerica(href, ["OpenWindowsWHR", "OpenWindowsWHRNS", "OpenNewTab"]);
    }
    if (!acompanhamentoUrl) {
      const params = new URLSearchParams(window.location.search);
      const idItem = itemKey || params.get("Id") || params.get("IdItem");
      if (idItem) {
        acompanhamentoUrl = absolutizarUrl(`Historico.aspx?source=SIN&SomenteLeitura=1&Id=${idItem}`);
      }
    }
    if (!acompanhamentoUrl) {
      const summary = buildSkipSummary("SKIPPED_LINK_NOT_FOUND");
      updateItemReportingState(itemKey, { acompanhamentoDone: true, acompanhamentoSummary: summary });
      return { ok: true, skipped: true, summary };
    }
    let html = "";
    try {
      html = await fetchHtml(acompanhamentoUrl);
    } catch (err) {
      const summary = buildSkipSummary("SKIPPED_PARSING_FAILED", {
        diagnostic: `Falha ao buscar Historico.aspx: ${(err == null ? void 0 : err.message) || err}`
      });
      updateItemReportingState(itemKey, { acompanhamentoDone: true, acompanhamentoSummary: summary });
      return { ok: true, skipped: true, summary };
    }
    let parsed = null;
    try {
      const doc = new DOMParser().parseFromString(html, "text/html");
      parsed = parseHistorico(doc);
    } catch (err) {
      const summary = buildSkipSummary("SKIPPED_PARSING_FAILED", {
        diagnostic: `Falha ao interpretar Historico.aspx: ${(err == null ? void 0 : err.message) || err}`
      });
      updateItemReportingState(itemKey, { acompanhamentoDone: true, acompanhamentoSummary: summary });
      return { ok: true, skipped: true, summary };
    }
    if (((parsed == null ? void 0 : parsed.timeline) || []).length === 0) {
      const summary = buildSkipSummary("SKIPPED_EMPTY_TIMELINE");
      updateItemReportingState(itemKey, { acompanhamentoDone: true, acompanhamentoSummary: summary });
      return { ok: true, skipped: true, summary };
    }
    const cache2 = getCacheItem(itemKey);
    if (cache2) cache2.acompanhamento = parsed;
    updateItemReportingState(itemKey, {
      acompanhamentoDone: true,
      acompanhamentoSummary: { status: "OK", ...parsed.summary },
      acompanhamentoCollectedAt: (/* @__PURE__ */ new Date()).toISOString()
    });
    return { ok: true, summary: parsed.summary, timeline: parsed.timeline };
  }
  function registrarEventoMidia(itemKey, summary, itemTelaId = null) {
    if (!itemKey || !summary) return;
    update((e) => {
      const payloadTotal = Number(summary.total || 0);
      const payloadStatus = summary.status || "OK";
      registrarEventoItem(e, itemKey, "midia_coletada", {
        itemTelaId: itemTelaId || e["itemAtualTelaId"] || itemKey,
        resumo: `Coleta de mídia: ${payloadStatus} (${payloadTotal} arquivos)`,
        payload: {
          status: payloadStatus,
          total: payloadTotal,
          imagens: Number(summary.imagens || 0),
          pdfs: Number(summary.pdfs || 0),
          unsupported: Number(summary.unsupported || 0)
        },
        status: "em_andamento",
        now: Date.now()
      });
    });
  }
  function registrarEventoAcompanhamento(itemKey, summary, itemTelaId = null) {
    if (!itemKey || !summary) return;
    update((e) => {
      const payloadTotalEventos = Number(summary.totalEventos || 0);
      const payloadStatus = summary.status || "OK";
      registrarEventoItem(e, itemKey, "acompanhamento_coletado", {
        itemTelaId: itemTelaId || e["itemAtualTelaId"] || itemKey,
        resumo: `Acompanhamento coletado: ${payloadTotalEventos} eventos`,
        payload: {
          status: payloadStatus,
          totalEventos: payloadTotalEventos,
          criticalFiscalRework: !!summary.criticalFiscalRework
        },
        status: "em_andamento",
        now: Date.now()
      });
    });
  }
  async function coletarMidia(estado, status, { getAcao: getAcao2 }) {
    const acao = getAcao2("coletarMidia", estado);
    if (!acao.ativo) return false;
    const estadoAny = estado;
    const itemKey = estadoAny["itemAtualKey"];
    if (!itemKey) return false;
    const reporting = getReportingConfig(estado);
    const repState = getItemReportingState(estado, itemKey);
    if (repState.mediaDone) {
      const logKey = `log:midia_done:${itemKey}`;
      if (!isAtivo(logKey)) {
        log(`COLETA_MIDIA | Item ${itemKey} | SKIPPED_ALREADY_DONE`, "info");
        set(logKey, 1e4);
      }
      return false;
    }
    if (!reporting.enabledMedia) {
      const summary = { status: "SKIPPED_DISABLED", total: 0, imagens: 0, pdfs: 0, unsupported: 0, itens: [] };
      updateItemReportingState(itemKey, {
        mediaDone: true,
        mediaSummary: summary
      });
      registrarEventoMidia(itemKey, summary, estadoAny["itemAtualTelaId"]);
      log(`COLETA_MIDIA | Item ${itemKey} | SKIPPED_DISABLED | desativada no perfil`, "info");
      return true;
    }
    if (reporting.clickMediaTabBeforeCollect) {
      let abaMidia = buscarElementoDeep(acao.seletor);
      if (!abaMidia) {
        const tabRoot = document.querySelector("#dlTab");
        const candidatos = tabRoot ? [...tabRoot.querySelectorAll("a")] : [...document.querySelectorAll('a[href*="Midia.aspx"], a[id*="lbutMenu"], a[id*="lbutSelMenu"]')];
        abaMidia = candidatos.find((a) => normalizarTextoSemAcento(a.textContent || "").includes("midia")) || null;
      }
      if (abaMidia && elementoVisivel(abaMidia)) {
        if (status) status.textContent = "Abrindo aba Mídias...";
        await interagir(abaMidia, null, "coletarMidiaAba");
      } else {
        log(`COLETA_MIDIA | Item ${itemKey} | ABA_MIDIA_NAO_ENCONTRADA_PARA_CLIQUE | seguindo com coleta por leitura`, "warn");
      }
    }
    if (status) status.textContent = "Coletando mídias...";
    try {
      log(`COLETA_MIDIA | Item ${itemKey} | START | modo=${reporting.clickMediaTabBeforeCollect ? "click+fetch" : "headless"}`, "info");
      const result = await coletarMidia$1(estado, itemKey);
      const s = result.summary || {};
      registrarEventoMidia(itemKey, s, estadoAny["itemAtualTelaId"]);
      const diag = s.diagnostic ? ` | diag=${s.diagnostic}` : "";
      const origem = s.sourceUrl ? ` | source=${s.sourceUrl}` : "";
      log(`COLETA_MIDIA | Item ${itemKey} | ${s.status || "OK"} | img=${s.imagens || 0} pdf=${s.pdfs || 0} outros=${s.unsupported || 0}${origem}${diag}`, "info");
      return true;
    } catch (err) {
      const msg = String((err == null ? void 0 : err.message) || err);
      const code = (err == null ? void 0 : err.code) || REPORTING_ERROR_CODES.MEDIA_PARSE_ERROR;
      const summary = { status: "ERRO", total: 0, imagens: 0, pdfs: 0, unsupported: 0, itens: [] };
      updateItemReportingState(itemKey, {
        mediaDone: true,
        mediaSummary: summary,
        mediaError: msg,
        mediaErrorCode: code
      });
      registrarEventoMidia(itemKey, summary, estadoAny["itemAtualTelaId"]);
      log(`COLETA_MIDIA | Item ${itemKey} | ${code}: ${msg} | modo opcional: seguindo fluxo`, "warn");
      return true;
    }
  }
  async function coletarAcompanhamento(estado, status, { getAcao: getAcao2 }) {
    const acao = getAcao2("coletarAcompanhamento", estado);
    if (!acao.ativo) return false;
    const estadoAny = estado;
    const itemKey = estadoAny["itemAtualKey"];
    if (!itemKey) return false;
    const reporting = getReportingConfig(estado);
    const repState = getItemReportingState(estado, itemKey);
    if (repState.acompanhamentoDone) {
      const logKey = `log:hist_done:${itemKey}`;
      if (!isAtivo(logKey)) {
        log(`COLETA_HISTORICO | Item ${itemKey} | SKIPPED_ALREADY_DONE`, "info");
        set(logKey, 1e4);
      }
      return false;
    }
    if (!reporting.enabledAcompanhamento) {
      const summary = {
        status: "SKIPPED_DISABLED",
        totalEventos: 0,
        totalTransicoes: 0,
        fiscalTransitionsCount: 0,
        criticalFiscalRework: false,
        stageTransitions: [],
        importantSignals: []
      };
      updateItemReportingState(itemKey, {
        acompanhamentoDone: true,
        acompanhamentoSummary: summary
      });
      registrarEventoAcompanhamento(itemKey, summary, estadoAny["itemAtualTelaId"]);
      log(`COLETA_HISTORICO | Item ${itemKey} | SKIPPED_DISABLED | desativada no perfil`, "info");
      return true;
    }
    if (status) status.textContent = "Coletando acompanhamento...";
    try {
      log(`COLETA_HISTORICO | Item ${itemKey} | START | modo=headless`, "info");
      const result = await coletarAcompanhamento$1(estado, itemKey);
      const s = result.summary || {};
      registrarEventoAcompanhamento(itemKey, s, estadoAny["itemAtualTelaId"]);
      if (s.criticalFiscalRework) {
        log(`COLETA_HISTORICO | Item ${itemKey} | CRITICO | fiscalTransitions=${s.fiscalTransitionsCount}`, "warn");
      } else {
        log(`COLETA_HISTORICO | Item ${itemKey} | OK | eventos=${s.totalEventos || 0}`, "info");
      }
      return true;
    } catch (err) {
      const msg = String((err == null ? void 0 : err.message) || err);
      const code = (err == null ? void 0 : err.code) || REPORTING_ERROR_CODES.HISTORICO_PARSE_ERROR;
      const summary = {
        status: "ERRO",
        totalEventos: 0,
        totalTransicoes: 0,
        fiscalTransitionsCount: 0,
        criticalFiscalRework: false,
        stageTransitions: [],
        importantSignals: []
      };
      updateItemReportingState(itemKey, {
        acompanhamentoDone: true,
        acompanhamentoSummary: summary,
        acompanhamentoError: msg,
        acompanhamentoErrorCode: code
      });
      registrarEventoAcompanhamento(itemKey, summary, estadoAny["itemAtualTelaId"]);
      log(`COLETA_HISTORICO | Item ${itemKey} | ${code}: ${msg} | modo opcional: seguindo fluxo`, "warn");
      return true;
    }
  }
  function hasGmXhr() {
    return typeof globalThis.GM_xmlhttpRequest === "function" || typeof globalThis.GM !== "undefined" && typeof globalThis.GM.xmlHttpRequest === "function";
  }
  function gmXhr(details) {
    if (typeof globalThis.GM_xmlhttpRequest === "function") return globalThis.GM_xmlhttpRequest(details);
    if (typeof globalThis.GM !== "undefined" && typeof globalThis.GM.xmlHttpRequest === "function") return globalThis.GM.xmlHttpRequest(details);
    throw new Error("GM_xmlhttpRequest indisponível");
  }
  function getOrder(pref) {
    const p = String(pref || "auto").toLowerCase();
    if (p === "gm_xhr") return ["gm_xhr", "fetch"];
    if (p === "fetch") return ["fetch"];
    return ["gm_xhr", "fetch"];
  }
  function parseJsonSafe(raw) {
    const txt = String(raw ?? "");
    if (!txt) return { ok: false, errors: ["Empty response"] };
    try {
      return JSON.parse(txt);
    } catch {
      return { ok: false, errors: [`Resposta inválida do serviço: ${txt.slice(0, 300)}`] };
    }
  }
  async function sendWithFetch(url, formData, headers, timeoutMs) {
    var _a;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const resp = await fetch(url, {
        method: "POST",
        body: formData,
        mode: "cors",
        headers,
        signal: controller.signal
      });
      const raw = await resp.text();
      const data = parseJsonSafe(raw);
      if (!resp.ok || (data == null ? void 0 : data.ok) === false) {
        const msg = ((_a = data == null ? void 0 : data.errors) == null ? void 0 : _a[0]) || `Falha ${resp.status} no serviço local`;
        throw new Error(msg);
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }
  async function sendWithGmXhr(url, formData, headers, timeoutMs) {
    if (!hasGmXhr()) throw new Error("GM_xmlhttpRequest indisponível");
    return new Promise((resolve, reject) => {
      gmXhr({
        method: "POST",
        url,
        data: formData,
        headers,
        timeout: timeoutMs,
        onload: (resp) => {
          var _a;
          const data = parseJsonSafe(resp.responseText || "");
          if (resp.status < 200 || resp.status >= 300 || (data == null ? void 0 : data.ok) === false) {
            const msg = ((_a = data == null ? void 0 : data.errors) == null ? void 0 : _a[0]) || `Falha ${resp.status} no serviço local`;
            reject(new Error(msg));
            return;
          }
          resolve(data);
        },
        onerror: () => reject(new Error("Falha de transporte GM_xmlhttpRequest")),
        ontimeout: () => reject(new Error("Timeout de transporte GM_xmlhttpRequest"))
      });
    });
  }
  async function send(formData, config) {
    const attempts = Math.max(1, Number(config.attempts || CONFIG.REPORTING.RETRY_ATTEMPTS));
    const order = getOrder(config.transport);
    const timeoutMs = Math.max(2e3, Number(config.timeoutMs || CONFIG.REPORTING.SERVICE_TIMEOUT_MS));
    const headers = { ...config.headers || {} };
    const baseDelay = Math.max(100, Number(config.baseDelayMs || CONFIG.REPORTING.RETRY_BASE_DELAY_MS));
    const jitterMs = Math.max(0, Number(config.jitterMs || CONFIG.REPORTING.RETRY_JITTER_MS));
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      for (const mode of order) {
        if (mode === "gm_xhr" && !hasGmXhr()) continue;
        try {
          if (mode === "gm_xhr") return await sendWithGmXhr(config.url, formData, headers, timeoutMs);
          return await sendWithFetch(config.url, formData, headers, timeoutMs);
        } catch (err) {
          lastError = err;
        }
      }
      if (attempt < attempts) {
        const jitter = jitterMs ? Math.floor(Math.random() * jitterMs) : 0;
        const delay = baseDelay * Math.pow(2, attempt - 1) + jitter;
        await sleep(delay);
      }
    }
    throw lastError || new Error("Falha de transporte sem detalhe");
  }
  const EMPTY_NCM = { found: false, keywordMentions: 0, formattedMatches: 0, unformattedMatchesWithContext: 0, codes: [], evidences: [] };
  async function enviarRelatorioItem(estado, itemKey) {
    const reporting = getReportingConfig(estado);
    const itemState = getItemReportingState(estado, itemKey);
    const cache2 = getCacheItem(itemKey) || {};
    const meta = obterMetadadosBasicos(estado, itemKey);
    const mediaSummary = cache2.media || itemState.mediaSummary || { status: "NAO_COLETADO", total: 0, imagens: 0, pdfs: 0, otherFiles: 0, unsupported: 0, itens: [] };
    const histData = cache2.acompanhamento || {};
    const historicoSummary = histData.summary || itemState.acompanhamentoSummary || {
      status: "NAO_COLETADO",
      totalEventos: 0,
      fiscalTransitionsCount: 0,
      criticalFiscalRework: false,
      stageTransitions: [],
      importantSignals: [],
      ncmMentions: { ...EMPTY_NCM }
    };
    const historicoTimeline = histData.timeline || [];
    const manifest = {
      manifestVersion: 2,
      ...meta,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      sessionRunId: reporting.sessionRunId || resolverOuCriarSessionRunId(estado),
      uploadLimits: {
        maxFileSizeMb: reporting.maxFileSizeMb,
        maxFilesPerItem: reporting.maxFilesPerItem
      },
      ocrEnabled: reporting.ocrEnabled,
      ocrEngine: reporting.ocrEngine,
      mediaSummary,
      historicoSummary,
      historicoTimeline
    };
    const form = new FormData();
    form.append("manifest", JSON.stringify(manifest));
    const arquivos = Array.isArray(cache2.files) ? cache2.files : [];
    const maxFiles = Math.max(1, Number(reporting.maxFilesPerItem || CONFIG.REPORTING.MAX_FILES_PER_ITEM));
    const maxBytes = Math.max(1, Number(reporting.maxFileSizeMb || CONFIG.REPORTING.MAX_FILE_SIZE_MB)) * 1024 * 1024;
    for (const f of arquivos.slice(0, maxFiles)) {
      if (!(f == null ? void 0 : f.blob)) continue;
      if (f.blob.size > maxBytes) continue;
      const fname = slugifyArquivo(f.filename || `media_${Date.now()}`);
      form.append("files", f.blob, fname);
    }
    const baseUrl = (reporting.serviceUrl || CONFIG.REPORTING.SERVICE_DEFAULT).replace(/\/+$/, "");
    const endpoint = `${baseUrl}/reports/item`;
    const headers = {};
    if (reporting.apiToken) headers["X-KM-Token"] = reporting.apiToken;
    let data;
    try {
      data = await send(form, {
        url: endpoint,
        headers,
        transport: reporting.transport,
        timeoutMs: CONFIG.REPORTING.SERVICE_TIMEOUT_MS,
        attempts: CONFIG.REPORTING.RETRY_ATTEMPTS
      });
    } catch (err) {
      const code = classificarErroServico((err == null ? void 0 : err.message) || "");
      throw criarErroRelatorio(code, (err == null ? void 0 : err.message) || "Falha ao enviar relatório", err);
    }
    updateItemReportingState(itemKey, {
      reportDone: true,
      reportResponse: {
        ok: true,
        itemId: (data == null ? void 0 : data.itemId) || meta.itemId || null,
        pdfPath: (data == null ? void 0 : data.pdfPath) || null,
        mdPath: (data == null ? void 0 : data.mdPath) || null,
        warnings: (data == null ? void 0 : data.warnings) || [],
        generatedAt: (/* @__PURE__ */ new Date()).toISOString()
      },
      reportError: null,
      reportErrorCode: null
    });
    return data;
  }
  async function gerarRelatorioItem(estado, status, { getAcao: getAcao2 }) {
    const acao = getAcao2("gerarRelatorioItem", estado);
    if (!acao.ativo) return false;
    const estadoAny = estado;
    const itemKey = estadoAny["itemAtualKey"];
    if (!itemKey) return false;
    const reporting = getReportingConfig(estado);
    const repState = getItemReportingState(estado, itemKey);
    if (repState.reportDone) return false;
    if (!reporting.enabledReport) {
      updateItemReportingState(itemKey, {
        reportDone: true,
        reportResponse: {
          ok: true,
          skippedDisabled: true,
          generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          warnings: ["Geração de relatório PDF/MD desativada nas opções"]
        },
        reportError: null,
        reportErrorCode: null
      });
      log(`ENVIO_RELATORIO | Item ${itemKey} | SKIPPED_DISABLED: geração de PDF/MD desativada`, "info");
      return true;
    }
    const erroColeta = repState.mediaErrorCode || repState.acompanhamentoErrorCode;
    if (erroColeta) {
      const msgColeta = repState.mediaError || repState.acompanhamentoError || "Falha de coleta antes da geração do relatório";
      updateItemReportingState(itemKey, {
        reportDone: true,
        reportResponse: {
          ok: false,
          skippedByCollectionError: true,
          generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
          warnings: [msgColeta]
        },
        reportError: null,
        reportErrorCode: null
      });
      log(`ENVIO_RELATORIO | Item ${itemKey} | SKIPPED_COLETA(${erroColeta}): ${msgColeta} | modo opcional`, "warn");
      return true;
    }
    if (reporting.enabledMedia && !repState.mediaDone) return false;
    if (reporting.enabledAcompanhamento && !repState.acompanhamentoDone) return false;
    if (status) status.textContent = "Gerando relatório (PDF+MD)...";
    try {
      const data = await enviarRelatorioItem(estado, itemKey);
      update((e) => {
        const eAny = e;
        registrarEventoItem(e, itemKey, "relatorio_enviado", {
          itemTelaId: eAny["itemAtualTelaId"] || itemKey,
          resumo: "Relatório enviado com sucesso",
          payload: {
            itemId: (data == null ? void 0 : data.itemId) || null,
            pdfPath: (data == null ? void 0 : data.pdfPath) || null,
            mdPath: (data == null ? void 0 : data.mdPath) || null,
            warningsCount: Array.isArray(data == null ? void 0 : data.warnings) ? data.warnings.length : 0
          },
          status: "em_andamento",
          now: Date.now()
        });
      });
      log(`ENVIO_RELATORIO | Item ${itemKey} | OK | PDF=${(data == null ? void 0 : data.pdfPath) || "-"} MD=${(data == null ? void 0 : data.mdPath) || "-"}`, "info");
      return true;
    } catch (err) {
      const msg = String((err == null ? void 0 : err.message) || err);
      const code = (err == null ? void 0 : err.code) || REPORTING_ERROR_CODES.SERVICE_UNAVAILABLE;
      updateItemReportingState(itemKey, {
        reportDone: true,
        reportError: msg,
        reportErrorCode: code
      });
      log(`ENVIO_RELATORIO | Item ${itemKey} | ${code}: ${msg} | modo opcional: seguindo fluxo`, "warn");
      return true;
    }
  }
  function createHandlerMap(ctx) {
    return {
      confirmar: (e, s) => confirmar(e, s, ctx),
      atuar: (e, s) => atuar(e, s, ctx),
      selecionar: (e, s) => selecionar(e, s, ctx),
      resultado: (e, s) => resultado(e, s, ctx),
      pesquisar: (e, s) => pesquisar(e, s, ctx),
      unspsc: (e, s) => unspsc(e, s, ctx),
      lupaUnspsc: (e, s) => lupaUnspsc(e, s, ctx),
      abaClassificacao: (e, s) => abaClassificacao(e, s, ctx),
      ncm: (e, s) => ncm(e, s, ctx),
      lei116Servico: (e, s) => lei116Servico(e, s, ctx),
      abaFiscal: (e, s) => abaFiscal(e, s, ctx),
      coletarMidia: (e, s) => coletarMidia(e, s, ctx),
      coletarAcompanhamento: (e, s) => coletarAcompanhamento(e, s, ctx),
      gerarRelatorioItem: (e, s) => gerarRelatorioItem(e, s, ctx),
      prosseguir: (e, s) => prosseguir(e, s, ctx)
    };
  }
  let _atualizarBotaoToggle = () => {
  };
  let _atualizarIndicadorProgresso = () => {
  };
  function setUICallbacks({ atualizarBotaoToggle: atualizarBotaoToggle2, atualizarIndicadorProgresso: atualizarIndicadorProgresso2 }) {
    _atualizarBotaoToggle = atualizarBotaoToggle2 || _atualizarBotaoToggle;
    _atualizarIndicadorProgresso = atualizarIndicadorProgresso2 || _atualizarIndicadorProgresso;
    setAtualizarBotaoToggle(_atualizarBotaoToggle);
  }
  let roboAtivo = true;
  let cicloEmExecucao = false;
  let lastItensEmAtuacaoCount = -1;
  let buscaSemItemInicioTs = null;
  let retornoItemBloqueadoEmAndamento = false;
  const BUSCA_SEM_ITEM_TIMEOUT_MS = 6e4;
  const SHIFT_S_RETORNO_DELAY_MS = 600;
  const scheduler = createWorkflowScheduler((trigger) => {
    void executarCiclo(trigger);
  });
  function getAcao(id, estado) {
    return estado.acoes[id] || { ativo: false, seletor: "", valor: null };
  }
  function getAcoesOrdenadas(estado) {
    return ACOES_WORKFLOW.map((acao) => {
      var _a, _b;
      return {
        ...acao,
        ordem: ((_b = (_a = estado.acoes) == null ? void 0 : _a[acao.id]) == null ? void 0 : _b.ordem) ?? acao.ordem
      };
    }).sort((a, b) => a.ordem - b.ordem);
  }
  function lerUnspscAtualTela(estado) {
    var _a;
    const acaoUnspsc = getAcao("unspsc", estado);
    const campo = buscarElementoDeep((acaoUnspsc == null ? void 0 : acaoUnspsc.seletor) || "#txtCodigoUnspsc") || buscarElementoDeep("#txtCodUNSPSC") || buscarElementoDeep('input[name$="txtCodigoUnspsc"], input[name$="txtCodUNSPSC"]');
    const valor = normalizarEspacos(
      (campo == null ? void 0 : campo.value) ?? ((_a = campo == null ? void 0 : campo.getAttribute) == null ? void 0 : _a.call(campo, "value")) ?? ""
    );
    return valor;
  }
  function itemJaTemUnspsc(estado) {
    var _a, _b;
    const modo = detectarModoUnspsc(
      ((_a = getAcao("unspsc", estado)) == null ? void 0 : _a.seletor) || "",
      ((_b = getAcao("selecionar", estado)) == null ? void 0 : _b.seletor) || "#butFechar"
    );
    if (modo === "inline") {
      return unspscDescricaoDefinida();
    }
    const valor = lerUnspscAtualTela(estado);
    if (valor) {
      const digits = valor.replace(/\D/g, "");
      if (digits.length >= 4 || valor.length >= 4) return true;
    }
    return unspscDescricaoDefinida();
  }
  function enviarShiftS() {
    const alvo = (document.activeElement instanceof HTMLElement ? document.activeElement : document.body) || document.body;
    const opts = { key: "S", code: "KeyS", shiftKey: true, bubbles: true, cancelable: true };
    try {
      document.dispatchEvent(new KeyboardEvent("keydown", opts));
    } catch {
    }
    try {
      document.dispatchEvent(new KeyboardEvent("keypress", opts));
    } catch {
    }
    try {
      document.dispatchEvent(new KeyboardEvent("keyup", opts));
    } catch {
    }
    try {
      window.dispatchEvent(new KeyboardEvent("keydown", opts));
    } catch {
    }
    try {
      window.dispatchEvent(new KeyboardEvent("keypress", opts));
    } catch {
    }
    try {
      window.dispatchEvent(new KeyboardEvent("keyup", opts));
    } catch {
    }
    try {
      alvo.dispatchEvent(new KeyboardEvent("keydown", opts));
    } catch {
    }
    try {
      alvo.dispatchEvent(new KeyboardEvent("keypress", opts));
    } catch {
    }
    try {
      alvo.dispatchEvent(new KeyboardEvent("keyup", opts));
    } catch {
    }
  }
  function textoControle(el) {
    return normalizarEspacos(
      el.value || el.getAttribute("title") || el.getAttribute("aria-label") || el.textContent || ""
    ).toLowerCase();
  }
  function encontrarControleVoltarItem() {
    const voltarFormulario = document.querySelector(
      '#butVoltar, input[name$="$butVoltar"], button[name$="$butVoltar"], #hbutVoltar'
    );
    if (voltarFormulario) return voltarFormulario;
    const candidatos = [...document.querySelectorAll('a, button, input[type="button"], input[type="submit"]')];
    const voltarSin = candidatos.find((el) => {
      const href = el.getAttribute("href") || "";
      return /redireciona\(/i.test(href) && /SIN_Item_Resultante\.aspx/i.test(href) && /Source=SIN_Lista/i.test(href);
    });
    if (voltarSin) return voltarSin;
    const voltarRedireciona = candidatos.find((el) => {
      const href = el.getAttribute("href") || "";
      return textoControle(el) === "voltar" && /redireciona\(/i.test(href);
    });
    if (voltarRedireciona) return voltarRedireciona;
    let sair = null;
    for (const el of candidatos) {
      const texto = textoControle(el);
      if (texto === "voltar") return el;
      if (texto === "sair" && !sair) sair = el;
    }
    return sair;
  }
  function acionarControleDireto(controle) {
    const href = controle.getAttribute("href") || "";
    const redirecionaMatch = href.match(/redireciona\(['"]([^'"]+)['"]\)/i);
    if (redirecionaMatch == null ? void 0 : redirecionaMatch[1]) {
      if (executarRedirecionaPagina(redirecionaMatch[1])) return true;
    }
    const postbackMatch = href.match(/__doPostBack\(['"]([^'"]+)['"],\s*['"]([^'"]*)['"]\)/i);
    if (postbackMatch == null ? void 0 : postbackMatch[1]) {
      if (executarPostbackPagina(postbackMatch[1], postbackMatch[2] || "")) return true;
    }
    try {
      controle.click();
      return true;
    } catch {
      return false;
    }
  }
  function executarRedirecionaPagina(url) {
    try {
      const injectScript = document.createElement("script");
      injectScript.textContent = `
            try {
                var url = ${JSON.stringify(url)};
                if (typeof redireciona === 'function') {
                    redireciona(url);
                } else {
                    window.location.href = url;
                }
            } catch(e) {
                console.error('FISCAL 5.0 redireciona retorno error:', e);
            }
        `;
      document.body.appendChild(injectScript);
      injectScript.remove();
      return true;
    } catch {
      try {
        window.location.href = url;
        return true;
      } catch {
        return false;
      }
    }
  }
  function executarPostbackPagina(target, argument) {
    try {
      const injectScript = document.createElement("script");
      injectScript.textContent = `
            try {
                if (typeof __doPostBack === 'function') {
                    __doPostBack(${JSON.stringify(target)}, ${JSON.stringify(argument)});
                } else {
                    var form = document.forms['aspnetForm'] || document.aspnetForm || document.querySelector('form');
                    if (!form) throw new Error('form not found');
                    var eventTarget = form.querySelector('input[name="__EVENTTARGET"]');
                    var eventArgument = form.querySelector('input[name="__EVENTARGUMENT"]');
                    if (!eventTarget || !eventArgument) throw new Error('event fields not found');
                    eventTarget.value = ${JSON.stringify(target)};
                    eventArgument.value = ${JSON.stringify(argument)};
                    form.submit();
                }
            } catch(e) {
                console.error('FISCAL 5.0 postback retorno error:', e);
            }
        `;
      document.body.appendChild(injectScript);
      injectScript.remove();
      return true;
    } catch {
      return executarPostbackPorFormulario(target, argument);
    }
  }
  function executarPostbackPorFormulario(target, argument) {
    const form = document.forms.namedItem("aspnetForm") || document.aspnetForm || document.querySelector("form");
    const eventTarget = form == null ? void 0 : form.querySelector('input[name="__EVENTTARGET"]');
    const eventArgument = form == null ? void 0 : form.querySelector('input[name="__EVENTARGUMENT"]');
    if (!form || !eventTarget || !eventArgument) return false;
    eventTarget.value = target;
    eventArgument.value = argument;
    form.submit();
    return true;
  }
  function acionarRetornoLista() {
    const controleVoltar = encontrarControleVoltarItem();
    if (controleVoltar) {
      acionarControleDireto(controleVoltar);
      return textoControle(controleVoltar) || "voltar";
    }
    enviarShiftS();
    return "Shift+S";
  }
  function obterParametroUrlAtual(nome) {
    try {
      return new URL(window.location.href).searchParams.get(nome);
    } catch {
      return null;
    }
  }
  function obterAliasesItemAtual(estado) {
    const estadoAny = estado;
    const aliases = [
      estadoAny["itemAtualKey"],
      estadoAny["itemAtualTelaId"],
      estadoAny["itemMapUltimoAplicadoId"],
      obterItemIdAtual(),
      obterParametroUrlAtual("IdItem"),
      obterParametroUrlAtual("IdSIN")
    ];
    return [...new Set(
      aliases.map((alias) => String(alias ?? "").trim()).filter(Boolean)
    )];
  }
  function itemAtualMarcadoParaPularNestaRodada(estado) {
    const itemFlags = estado.itemFlags || {};
    const aliases = obterAliasesItemAtual(estado);
    return aliases.find((alias) => {
      var _a;
      return ((_a = itemFlags[alias]) == null ? void 0 : _a.skipNestaRodada) === true;
    }) || null;
  }
  function encontrarBotaoAtuarResumo() {
    const botao = document.querySelector('#butAcao3, input[name$="$butAcao3"], button[name$="$butAcao3"]');
    const valor = normalizarEspacos((botao == null ? void 0 : botao.value) || (botao == null ? void 0 : botao.textContent) || "").toLowerCase();
    if (!botao || !/\batuar\b/.test(valor)) return null;
    return botao;
  }
  function retornarSeResumoItemPulado(estado, status) {
    const itemPulado = itemAtualMarcadoParaPularNestaRodada(estado);
    if (!itemPulado || !encontrarBotaoAtuarResumo()) return false;
    const metodoRetorno = acionarRetornoLista();
    if (status) {
      status.textContent = `Item ${itemPulado} pulado nesta rodada; retornando...`;
      status.style.color = "#d97706";
    }
    log(`⏭️ Item ${itemPulado} já marcado para pular; evitando Atuar no Item e retornando com ${metodoRetorno}`, "warn");
    workflowState.reset();
    buscaSemItemInicioTs = null;
    return true;
  }
  async function tratarAvisoBloqueanteItem(estado, status) {
    const aviso = detectarAvisoBloqueanteItem();
    if (!aviso) return false;
    const estadoAny = estado;
    const itemKey = estadoAny["itemAtualKey"] || estadoAny["itemAtualTelaId"] || obterItemIdAtual();
    const marcado = marcarItemParaPularNestaRodada(estado, itemKey, aviso.tipo, aviso.mensagem);
    if (status) {
      status.textContent = `Pulando item ${marcado || "-"} por problema visual...`;
      status.style.color = "#d97706";
    }
    const ok = await interagir(aviso.btnOk, null, "okProblemaVisual");
    if (!ok) return false;
    await sleep(SHIFT_S_RETORNO_DELAY_MS);
    enviarShiftS();
    log(`⏭️ Item ${marcado || "-"} pulado por problema visual; retornando para a lista com Shift+S`, "warn");
    workflowState.reset();
    buscaSemItemInicioTs = null;
    return true;
  }
  function tratarAlertSubGrupoInvalido(mensagem) {
    if (retornoItemBloqueadoEmAndamento) return;
    retornoItemBloqueadoEmAndamento = true;
    const estado = get();
    const estadoAny = estado;
    const itemKey = estadoAny["itemAtualKey"] || estadoAny["itemAtualTelaId"] || obterItemIdAtual();
    const aliases = obterAliasesItemAtual(estado);
    const marcado = marcarItemParaPularNestaRodada(estado, itemKey, "subgrupo_invalido", mensagem, aliases);
    const status = document.getElementById("statusRobo");
    if (status) {
      status.textContent = `Pulando item ${marcado || "-"} por Sub Grupo inválido...`;
      status.style.color = "#d97706";
    }
    log(`🌐 Mensagem do navegador: ${mensagem}`, "browser");
    scheduler.cancelarTimer();
    const metodoRetorno = acionarRetornoLista();
    log(`⏭️ Item ${marcado || "-"} pulado por Sub Grupo inválido; retornando para a lista com ${metodoRetorno}`, "warn");
    workflowState.reset();
    buscaSemItemInicioTs = null;
  }
  async function tentarPaginarProximaPagina(itensInfo, status) {
    const elegiveis = itensInfo.elegiveis || [];
    const inelegiveisConhecidos = itensInfo.inelegiveisConhecidos || [];
    const desconhecidos = itensInfo.desconhecidos || [];
    const totalVisiveis = Number(itensInfo.totalVisiveis || 0);
    const semElegiveis = elegiveis.length === 0;
    const temItens = totalVisiveis > 0;
    const todosInelegiveisConhecidos = temItens && inelegiveisConhecidos.length === totalVisiveis && desconhecidos.length === 0;
    if (!semElegiveis || !todosInelegiveisConhecidos) return false;
    const btnProximo = encontrarBotaoProximo();
    if (!btnProximo) return false;
    if (status) {
      status.textContent = "Página atual só tem itens bloqueados; avançando para Próximo...";
      status.style.color = "#0d6efd";
    }
    await interagir(btnProximo, null, "proximaPaginaItens");
    buscaSemItemInicioTs = null;
    log("⏭️ Página atual sem itens elegíveis conhecidos; clicando em Próximo", "info");
    return true;
  }
  function buildCtx() {
    return {
      getAcao,
      workflowState,
      itemJaTemUnspsc,
      habilitarValidacaoNcmAposInsercao,
      isValidacaoNcmLiberada,
      registrarAvisoValidacaoNcmAguardando,
      getValorAcao: (id, est) => getValorAcao(id, est),
      valoresSaoIguais,
      marcarItemConcluido,
      pausarComAviso,
      getModalUnspscContainer: () => getModalUnspscContainer(),
      isModalUnspscAberto: (s1, s2) => isModalUnspscAberto(s1, s2),
      getUnspscModo: (s1, s2) => detectarModoUnspsc(s1, s2)
    };
  }
  function tratarCamposObrigatoriosJsonEmpresa(estado, status) {
    if (!estado.itemMapAtivo) return false;
    const itemId = obterItemIdAtual() || estado.itemAtualTelaId || estado.itemAtualKey;
    const entry = getValoresParaItem(estado, itemId);
    if (!itemId || !entry) return false;
    const flagsPorItem = estado.itemFlags;
    const itemFlags = (flagsPorItem == null ? void 0 : flagsPorItem[itemId]) || {};
    const liberados = Array.isArray(itemFlags["jsonEmpresaCamposLiberados"]) ? itemFlags["jsonEmpresaCamposLiberados"] : [];
    const resultado2 = avaliarCamposObrigatoriosJsonEmpresa({
      empresa: obterEmpresaAtual(),
      itemId,
      entry,
      itemMap: estado.itemMap,
      liberados
    });
    if (resultado2.valido) return false;
    update((e) => {
      const eAny = e;
      eAny["itemFlags"] = eAny["itemFlags"] || {};
      const flags = eAny["itemFlags"];
      const atual = flags[itemId] || {};
      const atuaisLiberados = Array.isArray(atual["jsonEmpresaCamposLiberados"]) ? atual["jsonEmpresaCamposLiberados"] : [];
      flags[itemId] = {
        ...atual,
        jsonEmpresaCamposLiberados: [.../* @__PURE__ */ new Set([...atuaisLiberados, ...resultado2.camposFaltantes])],
        jsonEmpresaUltimaPausa: {
          empresa: resultado2.empresa,
          campos: resultado2.camposFaltantes,
          mensagem: resultado2.mensagem,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        }
      };
    });
    if (status) {
      status.textContent = resultado2.mensagem;
      status.style.color = "#d97706";
    }
    pausarComAviso(resultado2.mensagem, { alertUser: false, tipo: "json_empresa_obrigatorio" });
    return true;
  }
  async function executarLogica() {
    const estado = get();
    const status = document.getElementById("statusRobo");
    if (retornoItemBloqueadoEmAndamento) {
      if (status) {
        status.textContent = "Aguardando retorno do item bloqueado...";
        status.style.color = "#d97706";
      }
      return false;
    }
    if (!estado.ativo || estado.pausado) return false;
    const actionDelayRemainingMs = scheduler.getActionDelayRemainingMs();
    if (actionDelayRemainingMs > 0) {
      const faltam = Math.ceil(actionDelayRemainingMs / 1e3);
      if (status) {
        status.textContent = `⏳ Aguardando delay global: ${faltam}s`;
        status.style.color = "#d63384";
      }
      return false;
    }
    const estadoPagina = paginaOcupada();
    if (estadoPagina.ocupado) {
      if (status) {
        status.textContent = `⏳ Aguardando server (${estadoPagina.motivo})...`;
        status.style.color = "#d63384";
      }
      return false;
    }
    if (status) {
      status.textContent = "Analisando página...";
      status.style.color = "blue";
    }
    await sleep(CONFIG.DELAYS.ESTABILIDADE);
    const itemSincronizado = sincronizarItemAtual(estado);
    let estadoAtual = get();
    if (itemSincronizado) {
      registrarInicioItemSeNecessario(estadoAtual, itemSincronizado);
      estadoAtual = get();
    }
    if (itemSincronizado) {
      registrarItemAberto(estadoAtual, itemSincronizado);
      estadoAtual = get();
    }
    if (limparContextoTelaStaleSeNecessario(estadoAtual)) {
      estadoAtual = get();
    }
    aplicarParaItemAtual(estadoAtual);
    if (tratarItemSemJsonNaRodada(estadoAtual, status, pausarComAviso)) return true;
    estadoAtual = get();
    if (tratarCamposObrigatoriosJsonEmpresa(estadoAtual, status)) return true;
    if (await tratarAvisoBloqueanteItem(estadoAtual, status)) return true;
    if (retornarSeResumoItemPulado(estadoAtual, status)) return true;
    const avisoCritico = detectarAvisoCritico();
    const pausaReincidenciaAtiva = estadoAtual.pausarEmReincidencia !== false;
    const pausaPorReincidencia = (avisoCritico == null ? void 0 : avisoCritico.tipo) === "reincidencia_etapa" && pausaReincidenciaAtiva;
    const pausaPorValidacao = avisoCritico && ["ncm_invalido", "nbs_invalido"].includes(avisoCritico.tipo) && isValidacaoNcmLiberada(estadoAtual);
    if (avisoCritico && (pausaPorReincidencia || pausaPorValidacao)) {
      registrarPausaCriticaNaTrilha(avisoCritico);
      if (status) {
        status.textContent = pausaPorReincidencia ? "❌ Reincidência detectada - operação pausada" : "❌ Aviso crítico detectado - operação pausada";
        status.style.color = "#dc3545";
      }
      pausarComAviso(avisoCritico.mensagem || "Aviso crítico detectado", {
        alertUser: false,
        tipo: avisoCritico.tipo
      });
      return true;
    }
    const ctx = buildCtx();
    const confirmacaoPre = obterConfirmacao();
    if (getAcao("confirmar", estadoAtual).ativo && confirmacaoPre.modalAberto) {
      const did = await confirmar(estadoAtual, status, ctx);
      return !!did;
    }
    const acoesOrdenadas = getAcoesOrdenadas(estadoAtual);
    const handlerMap = createHandlerMap(ctx);
    for (const acao of acoesOrdenadas) {
      const handler = handlerMap[acao.id];
      if (handler) {
        const executado = await handler(estadoAtual, status);
        if (executado) return true;
      }
    }
    const itensInfo = encontrarItensPendentesInfo(get());
    atualizarTotaisLote(get(), itensInfo);
    const itensPendentes = itensInfo.elegiveis;
    if (itensInfo.ignorados > 0 && itensInfo.ignorados !== lastItensEmAtuacaoCount) {
      log(`⏭️ Ignorados ${itensInfo.ignorados} item(ns) inelegíveis conhecidos`, "info");
    }
    lastItensEmAtuacaoCount = itensInfo.ignorados;
    if (itensPendentes.length > 0) {
      buscaSemItemInicioTs = null;
      for (const candidato of itensPendentes) {
        const estadoAtualFresh = get();
        const key = extrairItemKey(candidato);
        const itemLabel = key || "sem ID";
        const eAny = estadoAtualFresh;
        const mesmoItem = !!key && eAny["itemAtualKey"] === key;
        const cooldownKey = `selecionarItemNormal:${key || "sem_id"}`;
        if (mesmoItem && isAtivo(cooldownKey)) {
          if (status) {
            const restante = Math.ceil(tempoRestante(cooldownKey) / 1e3);
            status.textContent = `⏳ Aguardando abertura do item ${itemLabel} (${restante}s)...`;
          }
          return false;
        }
        if (key && !mesmoItem) {
          inicializarFlagsItemAtual(estadoAtualFresh, key);
          workflowState.reset();
        }
        set(cooldownKey, CONFIG.DELAYS.SELECIONAR_ITEM_COOLDOWN);
        if (status) status.textContent = "Selecionando item...";
        await interagir(candidato, null, "selecionarItemNormal");
        return true;
      }
    }
    if (await tentarPaginarProximaPagina(itensInfo, status)) return true;
    const agora = Date.now();
    if (buscaSemItemInicioTs == null) {
      buscaSemItemInicioTs = agora;
    } else if (agora - buscaSemItemInicioTs >= BUSCA_SEM_ITEM_TIMEOUT_MS) {
      scheduler.cancelarTimer();
      update((e) => {
        e.ativo = false;
      });
      const mensagem = "Procura parada: nenhum item encontrado em 1 minuto.";
      if (status) status.textContent = mensagem;
      log(`⏹️ ${mensagem}`, "warn");
      _atualizarBotaoToggle();
      _atualizarIndicadorProgresso();
      return false;
    }
    if (status) status.textContent = "Aguardando...";
    return false;
  }
  async function executarCiclo(trigger = "timer") {
    const estado = get();
    if (!roboAtivo || !estado.ativo || estado.pausado) return;
    if (cicloEmExecucao) {
      return;
    }
    cicloEmExecucao = true;
    try {
      if (!verificarSessao()) {
        log("🔐 Sessão expirada detectada!", "error");
        tocar("error");
        update((e) => {
          e.ativo = false;
        });
        if (!isTestMode()) {
          alert("⚠️ Sua sessão expirou. Faça login novamente.");
        }
        return;
      }
      const itensInfo = encontrarItensPendentesInfo(estado);
      atualizarTotaisLote(estado, itensInfo);
      _atualizarIndicadorProgresso();
      await executarLogica();
    } catch (erro) {
      const err = erro;
      log(`❌ Erro na execução: ${err.message}`, "error");
      update((e) => {
        const estat = e.estatisticas;
        estat["erros"]++;
        estat["ultimoErro"] = {
          tipo: "execucao",
          mensagem: err.message,
          stack: err.stack,
          timestamp: (/* @__PURE__ */ new Date()).toISOString()
        };
      });
      tocar("error");
    } finally {
      cicloEmExecucao = false;
      const st = get();
      if (!roboAtivo || !st.ativo || st.pausado) return;
      scheduler.scheduleNext(LOOP_TICK_MS);
    }
  }
  function registrarInteracao(acaoId) {
    return scheduler.registrarInteracao(acaoId, get());
  }
  function wake(reason = "wake") {
    const st = get();
    if (!st.ativo || st.pausado || !roboAtivo) return;
    if (cicloEmExecucao) {
      return;
    }
    if (scheduler.hasPendingTimer()) return;
    scheduler.scheduleNext(LOOP_TICK_MS);
  }
  function pausarComAviso(mensagem, { alertUser = true, tipo = "ncm_invalido" } = {}) {
    scheduler.cancelarTimer();
    update((e) => {
      e.ativo = true;
      e.pausado = true;
      const estat = e.estatisticas;
      estat["erros"]++;
      estat["ultimoErro"] = {
        tipo,
        mensagem,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
    });
    log(`⏸️ ${mensagem}`, "error");
    tocar("error");
    _atualizarBotaoToggle();
    _atualizarIndicadorProgresso();
    if (alertUser && !isTestMode()) {
      try {
        globalThis.alert(mensagem);
      } catch {
      }
    }
  }
  function ativarKillSwitch() {
    roboAtivo = false;
    scheduler.cancelarTimer();
    update((e) => {
      e.ativo = false;
      e.pausado = false;
    });
    log("🛑 KILL SWITCH ATIVADO - Parando tudo!", "error");
    tocar("error");
    if (!isTestMode()) {
      setTimeout(() => location.reload(), 300);
    }
  }
  function togglePausar() {
    update((e) => {
      e.pausado = !e.pausado;
    });
    const novoEstado = get();
    log(novoEstado.pausado ? "⏸️ PAUSADO" : "▶️ RETOMANDO", "info");
    _atualizarBotaoToggle();
    if (!novoEstado.pausado && novoEstado.ativo) executarCiclo("resume");
  }
  function iniciar() {
    const estado = get();
    const totalPlanejadoJson = getTotalPlanejadoJson(estado);
    ACOES_WORKFLOW.forEach((acao) => {
      const chk = document.getElementById(`chk_${acao.id}`);
      const val = document.getElementById(`val_${acao.id}`);
      const acoes = estado.acoes;
      if (acoes[acao.id]) {
        acoes[acao.id].ativo = (chk == null ? void 0 : chk.checked) ?? true;
        if (val) acoes[acao.id].valor = val.value;
      }
    });
    persistirAcoes(estado);
    const estadoAny = estado;
    estadoAny["reporting"] = normalizarReportingConfig(estadoAny["reporting"]);
    estadoAny["reporting"]["sessionRunId"] = resolverOuCriarSessionRunId(estado);
    estado.ativo = true;
    estado.pausado = false;
    estadoAny["progresso"] = { atual: 0, total: totalPlanejadoJson, ultimoProcessado: null, concluidosIds: [] };
    estadoAny["itemFlags"] = {};
    estadoAny["itemAtualKey"] = null;
    estadoAny["itemAtualTelaId"] = null;
    estadoAny["estimativa"] = resetarRodada(
      estado,
      {
        totalPlanejado: totalPlanejadoJson,
        fonteTotal: totalPlanejadoJson > 0 ? "json" : null
      }
    );
    estadoAny["trilhaExecucao"] = resetarTrilhaExecucao(
      estado,
      {
        runId: estadoAny["reporting"]["sessionRunId"],
        now: Date.now()
      }
    );
    workflowState.reset();
    set$1(estado);
    log(`▶️ Ciclo iniciado (session: ${estadoAny["reporting"]["sessionRunId"]})`, "info");
    tocar("success");
    _atualizarBotaoToggle();
    roboAtivo = true;
    lastItensEmAtuacaoCount = -1;
    buscaSemItemInicioTs = null;
    scheduler.resetActionDelay();
    executarCiclo("start");
  }
  function parar() {
    scheduler.cancelarTimer();
    retornoItemBloqueadoEmAndamento = false;
    update((e) => {
      e.ativo = false;
    });
    log("🛑 Ciclo parado", "info");
    const estado = get();
    const reporting = getReportingConfig(estado);
    if (reporting["serviceUrl"]) {
      touchSessionNoServico(estado, "manual-stop").then((data) => {
        const dir = (data == null ? void 0 : data["sessionDir"]) || "-";
        log(`📁 Sessão de relatório atualizada: ${dir}`, "info");
      }).catch((err) => {
        const e = err;
        log(`⚠️ Não foi possível criar/atualizar pasta da sessão ao parar: ${(e == null ? void 0 : e.message) || err}`, "warn");
      });
    }
    _atualizarBotaoToggle();
    _atualizarIndicadorProgresso();
  }
  function limpar() {
    scheduler.cancelarTimer();
    limpar$1();
    buscaSemItemInicioTs = null;
    retornoItemBloqueadoEmAndamento = false;
  }
  function inicializarHooks() {
    hook();
    subscribe(() => wake("asp_endRequest"));
    const alertOriginal = globalThis.alert;
    globalThis.alert = function(...args) {
      var _a;
      const msg = args == null ? void 0 : args[0];
      try {
        const estado = get();
        const eAny = estado;
        const key = eAny["itemAtualKey"];
        const itemFlags = eAny["itemFlags"];
        const pendenteAte = Number(((_a = itemFlags == null ? void 0 : itemFlags[key ?? ""]) == null ? void 0 : _a["ncmValidacaoPendenteAte"]) || 0);
        const ncmLiberado = pendenteAte > Date.now();
        let alertaConsumido = false;
        if (isMensagemNcmInvalido(String(msg ?? ""))) {
          if (ncmLiberado) {
            registrarPausaCriticaNaTrilha({ tipo: "ncm_invalido", mensagem: String(msg || "") });
            pausarComAviso("NCM inválido detectado (alerta)", { alertUser: false, tipo: "ncm_invalido" });
            alertaConsumido = true;
          }
        } else if (isMensagemNbsInvalido(String(msg ?? ""))) {
          if (ncmLiberado) {
            registrarPausaCriticaNaTrilha({ tipo: "nbs_invalido", mensagem: String(msg || "") });
            pausarComAviso("NBS inválido detectado (alerta)", { alertUser: false, tipo: "nbs_invalido" });
            alertaConsumido = true;
          }
        } else if (isMensagemSubGrupoInvalido(String(msg ?? ""))) {
          tratarAlertSubGrupoInvalido(String(msg || ""));
          alertaConsumido = true;
        }
        if (alertaConsumido) return void 0;
      } catch {
      }
      return alertOriginal.apply(globalThis, args);
    };
    setRegistrarInteracao(registrarInteracao);
  }
  function getAcaoState(estado, acao) {
    return estado.acoes && estado.acoes[acao.id] ? estado.acoes[acao.id] : { ativo: true, seletor: acao.seletor, valor: acao.valorPadrao };
  }
  function renderValorInput(acao, acaoState) {
    if (acao.tipo !== "input") return "";
    return `<input type="text" id="val_${acao.id}" class="km-acao-input" value="${escapeHtml(acaoState.valor || "")}">`;
  }
  function renderBotoesAcao(acao) {
    if (acao.tipo === "custom") {
      return `
            <div class="km-acao-buttons">
                <button class="km-action-button" disabled type="button" title="Ação interna sem seletor DOM">—</button>
                <button class="km-action-button" disabled type="button" title="Ação interna sem mapeamento">—</button>
            </div>
        `;
    }
    return `
        <div class="km-acao-buttons">
            <button class="btn-testar km-action-button" data-acao="${acao.id}" type="button" title="Testar ação agora">▶</button>
            <button class="btn-inspecao km-action-button" data-acao="${acao.id}" type="button" title="Mapear elemento">🎯</button>
        </div>
    `;
  }
  function renderAcaoItemHtml(acao, acaoState) {
    return `
        <span class="acao-handle" title="Arrastar para reordenar">☰</span>
        <input type="checkbox" id="chk_${acao.id}" ${acaoState.ativo ? "checked" : ""}>
        <span class="km-acao-nome" title="${escapeHtml(acaoState.seletor || acao.seletor)}">${escapeHtml(acao.nome)}</span>
        ${renderValorInput(acao, acaoState)}
        ${renderBotoesAcao(acao)}
    `;
  }
  function construirListaAcoes$1(estado) {
    const container = document.getElementById("lista-acoes");
    if (!container) return;
    const acoesOrdenadas = getAcoesOrdenadas(estado);
    const fragment = document.createDocumentFragment();
    acoesOrdenadas.forEach((acao) => {
      const acaoState = getAcaoState(estado, acao);
      const divItem = document.createElement("div");
      divItem.className = "acao-item";
      divItem.dataset.acao = acao.id;
      divItem.draggable = true;
      divItem.innerHTML = renderAcaoItemHtml(acao, acaoState);
      fragment.appendChild(divItem);
    });
    container.appendChild(fragment);
  }
  const PANEL_ID = "painel-robo-pro";
  const STYLE_ID = "fiscal-pro-styles";
  const ORIGINAL_TEXT_ATTR = "data-km-fiscal-original-text";
  const MARK_CLASS = "km-fiscal-hint-mark";
  const POPUP_ID = "km-fiscal-hint-popup";
  function normalizarTermoFiscal(valor) {
    return String(valor ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  }
  function criarSlugDica(termo, index = 0) {
    const slug = normalizarTermoFiscal(termo).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
    return index > 0 ? `${slug || "dica"}-${index + 1}` : slug || "dica";
  }
  function normalizarCodigo(valor) {
    const texto = String(valor ?? "").trim();
    return texto || void 0;
  }
  function obterUnspsc(raw) {
    return normalizarCodigo(raw.unspsc ?? raw.UNSPSC ?? raw.NSPSC ?? raw.nspsc);
  }
  function validarDica(dica, indice) {
    const erros = [];
    if (!normalizarTermoFiscal(dica.termo)) erros.push(`Regra ${indice}: termo obrigatório`);
    if (!dica.ncm && !dica.unspsc) erros.push(`Regra ${indice}: informe NCM ou UNSPSC`);
    if (dica.ncm && !CONFIG.VALIDADORES.ncm.regex.test(dica.ncm)) {
      erros.push(`Regra ${indice}: NCM inválido (${dica.ncm})`);
    }
    if (dica.unspsc && !CONFIG.VALIDADORES.unspsc.regex.test(dica.unspsc)) {
      erros.push(`Regra ${indice}: UNSPSC inválido (${dica.unspsc})`);
    }
    return erros;
  }
  function importarDicasFiscaisJson(json) {
    const erros = [];
    const dicas = {};
    try {
      const parsed = JSON.parse(String(json || "[]"));
      const lista = Array.isArray(parsed) ? parsed : Object.entries(parsed || {}).map(([id, value]) => ({ id, ...value }));
      lista.forEach((raw, idx) => {
        if (!raw || typeof raw !== "object") {
          erros.push(`Regra ${idx + 1}: objeto inválido`);
          return;
        }
        const record = raw;
        const dica = {
          termo: String(record.termo ?? record.frase ?? record.term ?? "").trim(),
          ncm: normalizarCodigo(record.ncm ?? record.NCM),
          unspsc: obterUnspsc(record),
          empresa: record.empresa ? String(record.empresa).trim().toUpperCase() : void 0
        };
        const errosDica = validarDica(dica, idx + 1);
        if (errosDica.length) {
          erros.push(...errosDica);
          return;
        }
        const id = String(record.id || criarSlugDica(dica.termo, idx)).trim();
        dicas[id] = dica;
      });
    } catch (err) {
      erros.push(`JSON inválido: ${(err == null ? void 0 : err.message) || err}`);
    }
    return { ok: erros.length === 0, dicas, erros };
  }
  function exportarDicasFiscaisJson(dicas) {
    const lista = Object.entries(dicas || {}).map(([id, dica]) => ({
      id,
      termo: dica.termo,
      ...dica.ncm ? { ncm: dica.ncm } : {},
      ...dica.unspsc ? { unspsc: dica.unspsc } : {},
      ...dica.empresa ? { empresa: dica.empresa } : {}
    }));
    return JSON.stringify(lista, null, 2);
  }
  function criarMapaNormalizado(texto) {
    let normalizado = "";
    const indices = [];
    let ultimoFoiEspaco = false;
    for (let i = 0; i < texto.length; i += 1) {
      const chars = texto[i].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      for (const char of chars) {
        if (/\s/.test(char)) {
          if (!ultimoFoiEspaco) {
            normalizado += " ";
            indices.push(i);
            ultimoFoiEspaco = true;
          }
          continue;
        }
        normalizado += char;
        indices.push(i);
        ultimoFoiEspaco = false;
      }
    }
    return { normalizado, indices };
  }
  function encontrarTermo(texto, termo) {
    const alvo = normalizarTermoFiscal(termo);
    if (!alvo) return null;
    const mapa = criarMapaNormalizado(texto);
    const inicioNormalizado = mapa.normalizado.indexOf(alvo);
    if (inicioNormalizado < 0) return null;
    const inicio = mapa.indices[inicioNormalizado] ?? 0;
    const fimIndiceNormalizado = inicioNormalizado + alvo.length - 1;
    const fim = (mapa.indices[fimIndiceNormalizado] ?? inicio) + 1;
    return { inicio, fim };
  }
  function obterDicasOrdenadas(dicas, empresaAtual) {
    const empNorm = empresaAtual ? empresaAtual.trim().toUpperCase() : null;
    return Object.values(dicas || {}).filter((dica) => {
      const termoValido = normalizarTermoFiscal(dica.termo) && (dica.ncm || dica.unspsc);
      if (!termoValido) return false;
      if (dica.empresa) {
        return empNorm === dica.empresa.toUpperCase();
      }
      return true;
    }).sort((a, b) => normalizarTermoFiscal(b.termo).length - normalizarTermoFiscal(a.termo).length);
  }
  function limparPopup() {
    var _a;
    (_a = document.getElementById(POPUP_ID)) == null ? void 0 : _a.remove();
  }
  async function copiarTexto(texto) {
    var _a;
    if ((_a = navigator.clipboard) == null ? void 0 : _a.writeText) {
      await navigator.clipboard.writeText(texto);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = texto;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
    } finally {
      textarea.remove();
    }
  }
  function abrirPopup(alvo, dica) {
    limparPopup();
    const rect = alvo.getBoundingClientRect();
    const popup = document.createElement("div");
    popup.id = POPUP_ID;
    popup.innerHTML = `
        <div class="km-fiscal-popup-title">${escapeHtml(dica.termo)}</div>
        <div class="km-fiscal-popup-actions">
            ${dica.ncm ? `<button type="button" data-km-copy-fiscal="ncm">NCM ${escapeHtml(dica.ncm)}</button>` : ""}
            ${dica.unspsc ? `<button type="button" data-km-copy-fiscal="unspsc">UNSPSC ${escapeHtml(dica.unspsc)}</button>` : ""}
        </div>
    `;
    popup.style.top = `${Math.max(8, rect.bottom + 6)}px`;
    popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 260))}px`;
    popup.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-km-copy-fiscal]");
      if (!button) return;
      const tipo = button.getAttribute("data-km-copy-fiscal");
      const valor = tipo === "ncm" ? dica.ncm : dica.unspsc;
      if (!valor) return;
      await copiarTexto(valor);
      button.textContent = "Copiado";
    });
    document.body.appendChild(popup);
  }
  function restaurarDescricao(el) {
    const original = el.getAttribute(ORIGINAL_TEXT_ATTR);
    if (original != null) {
      el.textContent = original;
      return original;
    }
    const texto = el.textContent || "";
    el.setAttribute(ORIGINAL_TEXT_ATTR, texto);
    return texto;
  }
  function destacarDescricao(el, dicas) {
    const texto = restaurarDescricao(el);
    const match = dicas.map((dica) => ({ dica, pos: encontrarTermo(texto, dica.termo) })).find((entry) => entry.pos);
    if (!(match == null ? void 0 : match.pos)) return;
    const antes = texto.slice(0, match.pos.inicio);
    const trecho = texto.slice(match.pos.inicio, match.pos.fim);
    const depois = texto.slice(match.pos.fim);
    el.innerHTML = `${escapeHtml(antes)}<button type="button" class="${MARK_CLASS}">${escapeHtml(trecho)}</button>${escapeHtml(depois)}`;
    const mark = el.querySelector(`.${MARK_CLASS}`);
    mark == null ? void 0 : mark.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      abrirPopup(mark, match.dica);
    });
  }
  function aplicarDicasFiscais(options, empresaAtual) {
    limparPopup();
    const descricoes = Array.from(document.querySelectorAll('#divDescricaoCompleta .descricao, .descricao[id^="txtD"], #txtDescricao'));
    descricoes.forEach(restaurarDescricao);
    if (!options.ativo) return;
    const dicas = obterDicasOrdenadas(options.dicas, empresaAtual);
    if (!dicas.length) return;
    descricoes.forEach((el) => destacarDescricao(el, dicas));
  }
  function fecharPopupDicasFiscais() {
    limparPopup();
  }
  function formatarSegundos(ms) {
    return `${(Number(ms || 0) / 1e3).toFixed(1)}s`;
  }
  function renderResumoExecucao(estado) {
    const resumo = obterResumoUI(estado);
    const classeCard = resumo.pausadoPorReincidencia ? "km-card km-summary-card is-critical" : "km-card km-summary-card";
    return `
        <section class="${classeCard}">
            <div class="km-card-head">
                <div>
                    <p class="km-kicker">Lote</p>
                    <h2 class="km-card-title">Resumo da execução</h2>
                </div>
                <span class="km-badge">${escapeHtml(resumo.fonteTotal)}</span>
            </div>
            <p id="etaResumo" class="km-summary-copy">${escapeHtml(resumo.resumo)}</p>
            <div class="km-summary-grid">
                <div class="km-summary-metric">
                    <span class="km-summary-label">1º item</span>
                    <strong class="km-summary-value" data-role="eta-primeiro-item">${escapeHtml(resumo.primeiroItemTexto)}</strong>
                </div>
                <div class="km-summary-metric">
                    <span class="km-summary-label">Tempo base</span>
                    <strong id="etaTempoBase" class="km-summary-value">${escapeHtml(resumo.tempoBaseTexto)}</strong>
                </div>
                <div class="km-summary-metric">
                    <span class="km-summary-label">ETA</span>
                    <strong id="etaRestante" class="km-summary-value">${escapeHtml(resumo.etaRestanteTexto)}</strong>
                </div>
                <div class="km-summary-metric">
                    <span class="km-summary-label">Término</span>
                    <strong id="etaPrevisao" class="km-summary-value">${escapeHtml(resumo.previsaoTexto)}</strong>
                </div>
            </div>
        </section>
    `;
  }
  function renderTrilhaSection(estado) {
    const trilha = obterResumoTrilhaUI(estado);
    const eventosHtml = trilha.events.map((evento) => `
        <li class="km-trace-item" data-event-type="${escapeHtml(evento.tipo)}">
            <span class="km-trace-time">${escapeHtml(evento.horario)}</span>
            <span class="km-trace-copy">${escapeHtml(evento.resumo)}</span>
        </li>
    `).join("");
    return `
        <section id="itemTraceCard" class="${trilha.cardClassName}">
            <div id="itemTraceHeader" class="km-card-head km-card-head--tight">
                <label class="km-section-label">Trilha do item</label>
            </div>
            <div id="itemTraceCurrent" class="km-trace-current">${escapeHtml(trilha.empty ? "Sem eventos nesta rodada." : trilha.currentLabel)}</div>
            <ul id="itemTraceList" class="km-trace-list" style="${trilha.empty ? "display:none;" : ""}">
                ${eventosHtml}
            </ul>
            <div id="itemTraceEmpty" class="km-helper-text" style="${trilha.empty ? "" : "display:none;"}">Sem eventos nesta rodada.</div>
        </section>
    `;
  }
  function renderPerfilSection() {
    return `
        <section class="km-card">
            <label class="km-section-label">Perfil</label>
            <div id="perfil-container"></div>
        </section>
    `;
  }
  function renderWorkflowSection() {
    return `
        <section class="km-card">
            <label class="km-section-label">Ações do workflow</label>
            <div id="lista-acoes-wrapper" class="km-lista-acoes-wrapper">
                <div id="lista-acoes"></div>
            </div>
        </section>
    `;
  }
  function renderOpcoesSection(estado) {
    const reporting = estado.reporting || normalizarReportingConfig(REPORTING_DEFAULTS);
    return `
        <section class="km-card">
            <label class="km-section-label">Opções</label>
            <div class="km-form-stack">
                <label class="km-checkline">
                    <input type="checkbox" id="chkSimulacao" ${estado.modoSimulacao ? "checked" : ""}>
                    <span>Modo simulação</span>
                </label>
                <label class="km-checkline">
                    <input type="checkbox" id="chkPausarReincidencia" ${estado.pausarEmReincidencia !== false ? "checked" : ""}>
                    <span>Pausar ao detectar 2ª passagem na etapa</span>
                </label>

                <div class="km-field">
                    <label>Delay global entre ações <span id="globalActionDelayLabel">${formatarSegundos(estado.globalActionDelayMs ?? 1200)}</span></label>
                    <input type="range" id="globalActionDelaySlider" min="200" max="60000" step="100" value="${Number(estado.globalActionDelayMs ?? 1200)}">
                </div>

                <div class="km-field">
                    <label>Anti-clique <span id="clickCooldownLabel">${formatarSegundos(estado.clickCooldownMs)}</span></label>
                    <input type="range" id="clickCooldownSlider" min="0" max="20000" step="500" value="${Number(estado.clickCooldownMs || 3e3)}">
                </div>

                <div class="km-divider"></div>

                <label class="km-checkline">
                    <input type="checkbox" id="chkReportingEnabled" ${reporting.enabledReport ? "checked" : ""}>
                    <span>Gerar relatório PDF/MD</span>
                </label>
                <label class="km-checkline">
                    <input type="checkbox" id="chkReportingMedia" ${reporting.enabledMedia ? "checked" : ""}>
                    <span>Coletar mídia</span>
                </label>
                <label class="km-checkline">
                    <input type="checkbox" id="chkReportingClickMediaTab" ${reporting.clickMediaTabBeforeCollect ? "checked" : ""}>
                    <span>Clicar na aba Mídias antes da coleta</span>
                </label>
                <label class="km-checkline">
                    <input type="checkbox" id="chkReportingAcompanhamento" ${reporting.enabledAcompanhamento ? "checked" : ""}>
                    <span>Coletar acompanhamento</span>
                </label>
                <label class="km-checkline">
                    <input type="checkbox" id="chkReportingBlock" ${reporting.blockOnReportError ? "checked" : ""}>
                    <span>Bloquear em erro de relatório</span>
                </label>

                <div class="km-field">
                    <label for="txtReportingServiceUrl">Serviço local</label>
                    <input type="text" id="txtReportingServiceUrl" value="${escapeHtml(reporting.serviceUrl || CONFIG.REPORTING.SERVICE_DEFAULT)}">
                </div>
                <div class="km-field">
                    <label for="txtReportingApiToken">Token API</label>
                    <input type="text" id="txtReportingApiToken" value="${escapeHtml(reporting.apiToken || "")}" placeholder="X-KM-Token">
                </div>
                <div class="km-field">
                    <label for="selReportingTransport">Transporte</label>
                    <select id="selReportingTransport">
                        <option value="auto" ${reporting.transport === "auto" ? "selected" : ""}>auto</option>
                        <option value="gm_xhr" ${reporting.transport === "gm_xhr" ? "selected" : ""}>gm_xhr</option>
                        <option value="fetch" ${reporting.transport === "fetch" ? "selected" : ""}>fetch</option>
                    </select>
                </div>

                <div class="km-field-grid">
                    <div class="km-field">
                        <label for="numReportingMaxFileMb">Max MB/arquivo</label>
                        <input type="number" id="numReportingMaxFileMb" min="1" max="200" value="${Number(reporting.maxFileSizeMb || CONFIG.REPORTING.MAX_FILE_SIZE_MB)}">
                    </div>
                    <div class="km-field">
                        <label for="numReportingMaxFiles">Max arquivos/item</label>
                        <input type="number" id="numReportingMaxFiles" min="1" max="200" value="${Number(reporting.maxFilesPerItem || CONFIG.REPORTING.MAX_FILES_PER_ITEM)}">
                    </div>
                </div>
            </div>
        </section>
    `;
  }
  function renderFiscalHintRows(estado) {
    const dicas = Object.entries(estado.fiscalHints || {});
    if (!dicas.length) return '<div id="fiscalHintsLista" class="km-helper-text">Nenhuma dica cadastrada.</div>';
    return `
        <div id="fiscalHintsLista" class="km-fiscal-hint-list">
            ${dicas.map(([id, dica]) => `
                <div class="km-fiscal-hint-row" data-km-fiscal-id="${escapeHtml(id)}">
                    <div class="km-fiscal-hint-row-copy">
                        <strong>${escapeHtml(dica.termo || "")}</strong>
                        <span>${escapeHtml([dica.ncm ? `NCM ${dica.ncm}` : "", dica.unspsc ? `UNSPSC ${dica.unspsc}` : ""].filter(Boolean).join(" / "))}</span>
                    </div>
                    <button class="km-inline-button km-inline-button--danger" type="button" data-km-fiscal-remove="${escapeHtml(id)}">Remover</button>
                </div>
            `).join("")}
        </div>
    `;
  }
  function renderFiscalHintsSection(estado) {
    const json = estado.fiscalHintsJson || exportarDicasFiscaisJson(estado.fiscalHints || {});
    return `
        <section class="km-card">
            <label class="km-section-label">Dicas fiscais</label>
            <label class="km-checkline">
                <input type="checkbox" id="chkFiscalHintsAtivo" ${estado.fiscalHintsAtivo !== false ? "checked" : ""}>
                <span>Destacar termos na descrição</span>
            </label>
            <div class="km-field">
                <label for="txtFiscalHintTermo">Termo ou frase</label>
                <input type="text" id="txtFiscalHintTermo" placeholder="APLICACAO: CAMINHAO">
            </div>
            <div class="km-field-grid">
                <div class="km-field">
                    <label for="txtFiscalHintNcm">NCM</label>
                    <input type="text" id="txtFiscalHintNcm" placeholder="8708.93.00">
                </div>
                <div class="km-field">
                    <label for="txtFiscalHintUnspsc">UNSPSC / NSPSC</label>
                    <input type="text" id="txtFiscalHintUnspsc" placeholder="25101929">
                </div>
            </div>
            <button id="btnFiscalHintAdicionar" class="km-secondary-button" type="button">Adicionar dica</button>
            ${renderFiscalHintRows(estado)}
            <textarea id="fiscalHintsJson" class="km-textarea" placeholder='[{ "termo": "APLICACAO: CAMINHAO", "ncm": "8708.93.00", "unspsc": "25101929" }]'>${escapeHtml(json)}</textarea>
            <div class="km-button-row">
                <button id="btnFiscalHintsImportar" class="km-secondary-button" type="button">Aplicar JSON</button>
                <button id="btnFiscalHintsExportar" class="km-secondary-button" type="button">Atualizar JSON</button>
            </div>
            <div id="fiscalHintsStatus" class="km-helper-text"></div>
        </section>
    `;
  }
  function renderJsonSection(estado) {
    return `
        <section class="km-card">
            <label class="km-section-label">JSON por item</label>
            <label class="km-checkline">
                <input type="checkbox" id="chkItemMapAtivo" ${estado.itemMapAtivo ? "checked" : ""}>
                <span>Usar JSON por ID</span>
            </label>
            <textarea id="itemMapJson" class="km-textarea" placeholder='{
  &quot;320780&quot;: { &quot;ncm&quot;: &quot;8471.30.12&quot;, &quot;cest&quot;: &quot;01.075.00&quot;, &quot;unspsc&quot;: &quot;30103618&quot; }
}'></textarea>
            <div class="km-button-row">
                <button id="btnItemMapAplicar" class="km-secondary-button" type="button">Aplicar JSON</button>
                <button id="btnItemMapCriar" class="km-secondary-button" type="button">Criar JSON do item</button>
            </div>
            <div id="itemMapStatus" class="km-helper-text"></div>
        </section>
    `;
  }
  function renderProgressoSection() {
    return `
        <section id="progressBar" class="km-card km-progress-card" style="display:none;">
            <div class="km-progress-track">
                <div id="progressFill" class="km-progress-fill"></div>
            </div>
            <div id="progressText" class="km-progress-text">0 / 0</div>
        </section>
    `;
  }
  function renderControleSection(estado) {
    return `
        <button id="btnToggle" class="km-primary-button" type="button">
            ${estado.ativo ? "Parar robô" : "Iniciar ciclo"}
        </button>
        <div id="statusRobo" class="km-status">
            ${estado.ativo ? estado.pausado ? "Pausado" : "Executando..." : "Aguardando comando."}
        </div>
    `;
  }
  function renderLogsSection() {
    return `
        <section class="km-card">
            <div class="km-card-head km-card-head--tight">
                <label class="km-section-label">Log</label>
                <div class="km-log-actions">
                    <button id="btnCopiarLogs" class="km-inline-button" type="button">Copiar tudo</button>
                    <button id="btnLimparLogs" class="km-inline-button km-inline-button--danger" type="button">Apagar</button>
                    <button id="btnCopiarRelatorio" class="km-inline-button" type="button">Copiar erro</button>
                </div>
            </div>
            <div class="km-log-resizer">
                <div id="log-area" class="km-log-area"></div>
                <div class="km-log-resize-handle" data-log-resize-handle title="Arraste para redimensionar logs"></div>
            </div>
            <div class="km-shortcuts">F7 abre/fecha • F8 pausa • ESC para tudo</div>
        </section>
    `;
  }
  function renderSecaoColapsavel(estado, chave, titulo, conteudoHtml) {
    const secoes = estado.painelSecoes || {};
    const expandida = secoes[chave] !== void 0 ? !!secoes[chave] : true;
    const icon = expandida ? "▾" : "▸";
    return `
        <section class="km-collapsible ${expandida ? "" : "is-collapsed"}" data-section="${escapeHtml(chave)}">
            <button class="km-section-toggle" type="button" data-section-toggle="${escapeHtml(chave)}" aria-expanded="${expandida ? "true" : "false"}">
                <span class="km-section-toggle-label">${escapeHtml(titulo)}</span>
                <span class="km-section-toggle-icon">${icon}</span>
            </button>
            <div class="km-section-body">
                ${conteudoHtml}
            </div>
        </section>
    `;
  }
  function renderPainelShell(estado, painelMinimizado) {
    return `
        <div class="km-drawer-shell">
            <div id="painelHeader" class="km-drawer-header">
                <button id="drawerToggle" type="button" title="${painelMinimizado ? "Expandir" : "Recolher"}">${painelMinimizado ? "»" : "«"}</button>
                <div class="km-brand">
                    <span class="km-brand-mark">KM</span>
                    <div class="km-brand-copy">
                        <span class="km-brand-title">FISCAL 5.0</span>
                        <span class="km-brand-subtitle">Drawer operacional</span>
                    </div>
                </div>
                <span class="km-drawer-status-compact">${estado.ativo ? estado.pausado ? "pause" : "run" : "off"}</span>
            </div>

            <div id="painelConteudo">
                ${renderSecaoColapsavel(estado, "resumo", "Resumo da Execução", renderResumoExecucao(estado))}
                ${renderSecaoColapsavel(estado, "trilha", "Trilha do Item", renderTrilhaSection(estado))}
                ${renderSecaoColapsavel(estado, "perfil", "Perfil", renderPerfilSection())}
                ${renderSecaoColapsavel(estado, "workflow", "Ações do Workflow", renderWorkflowSection())}
                ${renderSecaoColapsavel(estado, "opcoes", "Opções", renderOpcoesSection(estado))}
                ${renderSecaoColapsavel(estado, "fiscalHints", "Dicas fiscais", renderFiscalHintsSection(estado))}
                ${renderSecaoColapsavel(estado, "json", "JSON por Item", renderJsonSection(estado))}
                ${renderSecaoColapsavel(estado, "progresso", "Progresso", renderProgressoSection())}
                ${renderSecaoColapsavel(estado, "controle", "Controle", renderControleSection(estado))}
                ${renderSecaoColapsavel(estado, "logs", "Logs", renderLogsSection())}
            </div>
        </div>
    `;
  }
  function injetarEstilosPainel() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
        :root {
            --km-bg: linear-gradient(180deg, #f4f1e8 0%, #e7ded0 100%);
            --km-surface: rgba(255, 250, 240, 0.9);
            --km-surface-strong: rgba(255, 252, 247, 0.98);
            --km-border: rgba(90, 68, 44, 0.18);
            --km-shadow: 0 22px 40px rgba(53, 42, 31, 0.18);
            --km-text: #2f241b;
            --km-muted: #6c5947;
            --km-accent: #0e5a48;
            --km-accent-strong: #0a4336;
            --km-danger: #b42318;
            --km-warning: #d97706;
        }

        #painel-robo-pro {
            position: fixed;
            top: 10px;
            left: 10px;
            width: min(390px, calc(100vw - 20px));
            max-height: calc(100vh - 20px);
            z-index: 999999;
            overflow: hidden;
            border: 1px solid var(--km-border);
            border-radius: 22px;
            background: var(--km-bg);
            color: var(--km-text);
            box-shadow: var(--km-shadow);
            font-family: "Segoe UI", Tahoma, sans-serif;
            transition: width 0.25s ease, transform 0.25s ease, box-shadow 0.25s ease;
        }

        #painel-robo-pro.is-collapsed {
            width: 60px;
        }

        .km-drawer-shell {
            display: flex;
            flex-direction: column;
            min-height: 100%;
        }

        .km-drawer-header {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px;
            background: linear-gradient(135deg, #153a2d 0%, #245847 100%);
            color: #fffdf8;
            cursor: move;
            user-select: none;
        }

        #painel-robo-pro.is-collapsed .km-drawer-header {
            flex-direction: column;
            gap: 12px;
            padding: 14px 8px;
        }

        #drawerToggle {
            width: 34px;
            height: 34px;
            border: 0;
            border-radius: 10px;
            background: rgba(255, 255, 255, 0.14);
            color: #fff;
            font-size: 18px;
            cursor: pointer;
        }

        .km-brand {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
            flex: 1;
        }

        .km-brand-mark {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.16);
            font-weight: 700;
            letter-spacing: 0.08em;
        }

        .km-brand-copy {
            display: flex;
            flex-direction: column;
            min-width: 0;
        }

        .km-brand-title {
            font-size: 14px;
            font-weight: 700;
            line-height: 1.1;
        }

        .km-brand-subtitle {
            font-size: 10px;
            opacity: 0.8;
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }

        .km-drawer-status-compact {
            padding: 6px 8px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.14);
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            white-space: nowrap;
        }

        #painel-robo-pro.is-collapsed .km-brand-copy,
        #painel-robo-pro.is-collapsed .km-drawer-status-compact {
            display: none;
        }

        #painelConteudo {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 12px;
            overflow-y: auto;
            overflow-x: hidden;
            max-height: calc(100vh - 90px);
            scrollbar-width: thin;
        }

        #painel-robo-pro.is-collapsed #painelConteudo {
            display: none;
        }

        .km-collapsible {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .km-section-toggle {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            padding: 6px 10px;
            border: 1px solid rgba(90, 68, 44, 0.18);
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.62);
            color: var(--km-text);
            font-size: 11px;
            font-weight: 700;
            cursor: pointer;
            text-align: left;
        }

        .km-section-toggle:hover {
            background: rgba(255, 255, 255, 0.78);
        }

        .km-section-toggle-label {
            pointer-events: none;
        }

        .km-section-toggle-icon {
            font-size: 10px;
            opacity: 0.85;
            pointer-events: none;
        }

        .km-collapsible.is-collapsed .km-section-body {
            display: none;
        }

        .km-card {
            padding: 12px;
            border: 1px solid var(--km-border);
            border-radius: 18px;
            background: var(--km-surface);
            backdrop-filter: blur(8px);
        }

        .km-summary-card {
            background: linear-gradient(180deg, rgba(255, 252, 247, 0.95), rgba(248, 240, 226, 0.95));
        }

        .km-summary-card.is-critical {
            border-color: rgba(180, 35, 24, 0.35);
            background: linear-gradient(180deg, rgba(255, 241, 238, 0.98), rgba(255, 230, 224, 0.98));
        }

        .km-card-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 8px;
        }

        .km-card-head--tight {
            align-items: center;
            margin-bottom: 10px;
        }

        .km-kicker {
            margin: 0;
            color: var(--km-muted);
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
        }

        .km-card-title,
        .km-section-label {
            margin: 0;
            font-size: 12px;
            font-weight: 700;
            color: var(--km-text);
        }

        .km-badge {
            padding: 6px 8px;
            border-radius: 999px;
            background: rgba(14, 90, 72, 0.1);
            color: var(--km-accent);
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
        }

        .km-summary-copy {
            margin: 0 0 10px;
            font-size: 11px;
            line-height: 1.45;
        }

        .km-summary-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
        }

        .km-summary-metric {
            padding: 10px;
            border-radius: 14px;
            background: var(--km-surface-strong);
            border: 1px solid rgba(90, 68, 44, 0.08);
        }

        .km-trace-card.is-critical {
            border-color: rgba(180, 35, 24, 0.35);
            background: linear-gradient(180deg, rgba(255, 241, 238, 0.98), rgba(255, 230, 224, 0.98));
        }

        .km-trace-current {
            margin: 0 0 10px;
            font-size: 11px;
            font-weight: 700;
            color: var(--km-text);
        }

        .km-trace-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
            margin: 0;
            padding: 0;
            list-style: none;
        }

        .km-trace-item {
            display: grid;
            grid-template-columns: 64px minmax(0, 1fr);
            gap: 8px;
            padding: 8px 10px;
            border-radius: 12px;
            background: var(--km-surface-strong);
            border: 1px solid rgba(90, 68, 44, 0.08);
            font-size: 10px;
            line-height: 1.4;
        }

        .km-trace-time {
            color: var(--km-muted);
            font-variant-numeric: tabular-nums;
        }

        .km-trace-copy {
            color: var(--km-text);
            word-break: break-word;
        }

        .km-summary-label {
            display: block;
            font-size: 10px;
            color: var(--km-muted);
            margin-bottom: 4px;
        }

        .km-summary-value {
            font-size: 13px;
            line-height: 1.2;
        }

        .km-form-stack {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .km-field {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .km-field-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
        }

        .km-field label {
            font-size: 11px;
            color: var(--km-muted);
        }

        .km-checkline {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 11px;
            color: var(--km-text);
        }

        .km-divider {
            height: 1px;
            background: rgba(90, 68, 44, 0.12);
            margin: 2px 0;
        }

        #painel-robo-pro input[type="text"],
        #painel-robo-pro input[type="number"],
        #painel-robo-pro select,
        #painel-robo-pro textarea {
            width: 100%;
            box-sizing: border-box;
            border: 1px solid rgba(90, 68, 44, 0.18);
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.85);
            color: var(--km-text);
            padding: 8px 10px;
            font-size: 11px;
        }

        #painel-robo-pro input[type="range"] {
            width: 100%;
        }

        #painel-robo-pro input[type="text"]:focus,
        #painel-robo-pro input[type="number"]:focus,
        #painel-robo-pro select:focus,
        #painel-robo-pro textarea:focus {
            outline: 2px solid rgba(14, 90, 72, 0.18);
            border-color: rgba(14, 90, 72, 0.3);
        }

        .km-textarea {
            min-height: 100px;
            resize: vertical;
            font-family: Consolas, "Courier New", monospace;
        }

        .km-button-row {
            display: flex;
            gap: 8px;
            margin-top: 8px;
        }

        .km-primary-button,
        .km-secondary-button,
        .km-inline-button,
        .km-action-button {
            border: 0;
            border-radius: 14px;
            cursor: pointer;
            transition: transform 0.18s ease, opacity 0.18s ease, background 0.18s ease;
        }

        .km-primary-button:hover,
        .km-secondary-button:hover,
        .km-inline-button:hover,
        .km-action-button:hover {
            opacity: 0.92;
            transform: translateY(-1px);
        }

        .km-primary-button {
            width: 100%;
            padding: 12px;
            background: linear-gradient(135deg, var(--km-accent) 0%, var(--km-accent-strong) 100%);
            color: #fff;
            font-size: 13px;
            font-weight: 700;
        }

        .km-secondary-button,
        .km-inline-button,
        .km-action-button {
            padding: 8px 10px;
            background: rgba(14, 90, 72, 0.09);
            color: var(--km-accent-strong);
            font-size: 11px;
        }

        .km-inline-button {
            padding: 6px 8px;
            white-space: nowrap;
        }

        .km-inline-button--danger {
            background: rgba(180, 35, 24, 0.1);
            color: var(--km-danger);
        }

        .km-status {
            margin-top: 8px;
            font-size: 11px;
            text-align: center;
            color: var(--km-muted);
        }

        .km-helper-text {
            margin-top: 8px;
            font-size: 10px;
            color: var(--km-muted);
        }

        .km-progress-card {
            gap: 8px;
        }

        .km-progress-track {
            width: 100%;
            height: 14px;
            border-radius: 999px;
            background: rgba(90, 68, 44, 0.12);
            overflow: hidden;
        }

        .km-progress-fill {
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, #0e5a48, #d5a14f);
            transition: width 0.3s ease;
        }

        .km-progress-text {
            margin-top: 6px;
            text-align: center;
            font-size: 10px;
            color: var(--km-muted);
        }

        .km-log-actions {
            display: flex;
            flex-wrap: wrap;
            justify-content: flex-end;
            gap: 6px;
        }

        .km-log-resizer {
            border-radius: 14px;
            background: #1f2421;
        }

        .km-log-area {
            height: 110px;
            min-height: 80px;
            max-height: min(520px, 60vh);
            overflow-y: auto;
            box-sizing: border-box;
            border-radius: 14px 14px 10px 10px;
            border: 1px solid rgba(17, 24, 39, 0.08);
            background: #1f2421;
            color: #d5f7d0;
            padding: 8px;
            font-family: Consolas, "Courier New", monospace;
            font-size: 10px;
        }

        .km-log-resize-handle {
            height: 12px;
            cursor: ns-resize;
            border-radius: 0 0 14px 14px;
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.12));
            position: relative;
        }

        .km-log-resize-handle::before {
            content: "";
            position: absolute;
            left: 50%;
            top: 4px;
            width: 38px;
            height: 3px;
            transform: translateX(-50%);
            border-radius: 999px;
            background: rgba(213, 247, 208, 0.42);
        }

        .km-shortcuts {
            margin-top: 8px;
            text-align: center;
            font-size: 10px;
            color: var(--km-muted);
        }

        .log-entry {
            padding: 2px 4px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            word-break: break-word;
        }

        .log-info { color: #9de29b; }
        .log-browser { color: #7cc7ff; }
        .log-warn { color: #f4e28a; }
        .log-error { color: #ff8f8f; font-weight: bold; }

        .km-lista-acoes-wrapper {
            max-height: min(220px, 32vh);
            overflow-y: auto;
            scrollbar-width: thin;
        }

        .acao-item {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 8px;
            margin-bottom: 6px;
            border: 1px dashed transparent;
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.68);
            transition: background 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;
        }

        .acao-item.dragging { opacity: 0.5; }
        .acao-item.drag-over {
            border-color: rgba(14, 90, 72, 0.35);
            background: rgba(14, 90, 72, 0.08);
        }

        .acao-handle {
            cursor: grab;
            font-size: 12px;
            padding: 0 4px;
            user-select: none;
        }

        .km-acao-nome {
            flex: 1;
            min-width: 0;
            font-size: 10px;
        }

        .km-acao-input {
            width: 72px !important;
            min-width: 72px;
            padding: 4px 6px !important;
        }

        .km-acao-buttons {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .km-action-button[disabled] {
            opacity: 0.5;
            cursor: default;
            transform: none;
        }

        .km-fiscal-hint-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .km-fiscal-hint-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            padding: 8px;
            border-radius: 12px;
            background: rgba(255, 255, 255, 0.68);
            border: 1px solid rgba(90, 68, 44, 0.1);
        }

        .km-fiscal-hint-row-copy {
            display: flex;
            flex-direction: column;
            gap: 3px;
            min-width: 0;
            font-size: 10px;
        }

        .km-fiscal-hint-row-copy strong,
        .km-fiscal-hint-row-copy span {
            overflow-wrap: anywhere;
        }

        .km-fiscal-hint-mark {
            display: inline;
            border: 0;
            border-radius: 6px;
            padding: 1px 4px;
            background: #ffe08a;
            color: #3b2a00;
            font: inherit;
            cursor: pointer;
            box-shadow: inset 0 0 0 1px rgba(118, 84, 0, 0.24);
        }

        #km-fiscal-hint-popup {
            position: fixed;
            z-index: 2147483646;
            width: min(252px, calc(100vw - 16px));
            box-sizing: border-box;
            padding: 10px;
            border-radius: 8px;
            border: 1px solid rgba(50, 40, 24, 0.18);
            background: #fffdf8;
            color: #2f241b;
            box-shadow: 0 12px 28px rgba(0, 0, 0, 0.18);
            font-family: "Segoe UI", Tahoma, sans-serif;
        }

        .km-fiscal-popup-title {
            margin-bottom: 8px;
            font-size: 11px;
            font-weight: 700;
            overflow-wrap: anywhere;
        }

        .km-fiscal-popup-actions {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .km-fiscal-popup-actions button {
            border: 0;
            border-radius: 8px;
            padding: 8px;
            background: rgba(14, 90, 72, 0.1);
            color: #0a4336;
            cursor: pointer;
            font-size: 11px;
            text-align: left;
        }

        @media (max-width: 640px) {
            #painel-robo-pro {
                width: calc(100vw - 20px);
            }

            .km-field-grid,
            .km-summary-grid,
            .km-button-row {
                grid-template-columns: 1fr;
                flex-direction: column;
            }
        }
    `;
    document.head.appendChild(style);
  }
  function getPainelEl() {
    return document.getElementById(PANEL_ID);
  }
  function injetarEstilos() {
    injetarEstilosPainel();
  }
  function construirPainel(painelMinimizado) {
    var _a;
    const estado = get();
    estado.reporting = normalizarReportingConfig(estado.reporting || REPORTING_DEFAULTS);
    const div = document.createElement("div");
    div.id = PANEL_ID;
    div.classList.toggle("is-collapsed", !!painelMinimizado);
    if ((_a = estado.painelPosicao) == null ? void 0 : _a.top) {
      div.style.top = estado.painelPosicao.top;
    }
    div.innerHTML = renderPainelShell(estado, painelMinimizado);
    return div;
  }
  function construirListaAcoes(estado) {
    construirListaAcoes$1(estado);
  }
  function criar(nome) {
    const estado = get();
    if (!estado.perfis) estado.perfis = {};
    estado.perfis[nome] = clone(estado.acoes || {});
    estado.perfilConfigs = estado.perfilConfigs || {};
    estado.perfilConfigs[nome] = {
      reporting: normalizarReportingConfig(estado.reporting)
    };
    set$1(estado);
    log(`📁 Perfil "${nome}" criado`, "info");
    renderizarSeletor();
  }
  function carregar(nome) {
    var _a, _b;
    const estado = get();
    if (!estado.perfis || !estado.perfis[nome]) {
      log(`❌ Perfil "${nome}" não encontrado`, "error");
      return;
    }
    estado.acoes = clone(estado.perfis[nome]);
    estado.perfilAtivo = nome;
    const cfgPerfil = (_b = (_a = estado.perfilConfigs) == null ? void 0 : _a[nome]) == null ? void 0 : _b.reporting;
    estado.reporting = normalizarReportingConfig(cfgPerfil || REPORTING_DEFAULTS);
    set$1(estado);
    log(`📂 Perfil "${nome}" carregado`, "info");
    if (typeof globalThis.location !== "undefined") {
      globalThis.location.reload();
    }
  }
  function excluir(nome) {
    var _a, _b;
    if (nome === "default") {
      log("⚠️ Não é possível excluir o perfil padrão", "warn");
      return;
    }
    const estado = get();
    if (estado.perfis) delete estado.perfis[nome];
    if (estado.perfilConfigs) delete estado.perfilConfigs[nome];
    if (estado.perfilAtivo === nome) {
      estado.perfilAtivo = "default";
      estado.acoes = estado.perfis && estado.perfis.default ? estado.perfis.default : {};
      const defaultCfg = (_b = (_a = estado.perfilConfigs) == null ? void 0 : _a.default) == null ? void 0 : _b.reporting;
      estado.reporting = normalizarReportingConfig(defaultCfg || REPORTING_DEFAULTS);
    }
    set$1(estado);
    renderizarSeletor();
  }
  function exportar() {
    const estado = get();
    const perfilAtual = estado.perfis && estado.perfilAtivo ? estado.perfis[estado.perfilAtivo] : estado.acoes;
    const dadosExport = {
      versao: "5.4.1",
      schema: CONFIG.SCHEMA_VERSION,
      nome: estado.perfilAtivo || "default",
      acoes: perfilAtual,
      reporting: normalizarReportingConfig(estado.reporting),
      exportadoEm: (/* @__PURE__ */ new Date()).toISOString()
    };
    const blob = new Blob([JSON.stringify(dadosExport, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `perfil_${estado.perfilAtivo || "default"}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    log(`📤 Perfil "${estado.perfilAtivo || "default"}" exportado`, "info");
    tocar("success");
  }
  function importar() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.addEventListener("change", (e) => {
      var _a;
      const target = e.target;
      const file = (_a = target.files) == null ? void 0 : _a[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        var _a2;
        try {
          if (typeof ((_a2 = event.target) == null ? void 0 : _a2.result) !== "string") throw new Error("Falha ao ler o arquivo");
          const dados = JSON.parse(event.target.result);
          if (!dados.acoes || typeof dados.acoes !== "object") {
            throw new Error('Formato inválido: falta objeto "acoes"');
          }
          if (dados.schema && dados.schema > CONFIG.SCHEMA_VERSION) {
            log("⚠️ Perfil de versão mais nova, pode haver incompatibilidades", "warn");
          }
          const nomePerfil = dados.nome || `importado_${Date.now()}`;
          const estado = get();
          if (!estado.perfis) estado.perfis = {};
          if (estado.perfis[nomePerfil]) {
            if (!globalThis.confirm(`Perfil "${nomePerfil}" já existe. Sobrescrever?`)) return;
          }
          const acoesValidadas = {};
          ACOES_WORKFLOW.forEach((acao) => {
            const importada = dados.acoes[acao.id];
            acoesValidadas[acao.id] = {
              ativo: (importada == null ? void 0 : importada.ativo) ?? true,
              seletor: (importada == null ? void 0 : importada.seletor) || acao.seletor,
              valor: (importada == null ? void 0 : importada.valor) ?? (acao.valorPadrao || null),
              ordem: (importada == null ? void 0 : importada.ordem) ?? acao.ordem
            };
          });
          estado.perfis[nomePerfil] = acoesValidadas;
          estado.perfilConfigs = estado.perfilConfigs || {};
          estado.perfilConfigs[nomePerfil] = {
            reporting: normalizarReportingConfig(dados.reporting || REPORTING_DEFAULTS)
          };
          estado.reporting = normalizarReportingConfig(dados.reporting || estado.reporting || REPORTING_DEFAULTS);
          set$1(estado);
          log(`📥 Perfil "${nomePerfil}" importado com sucesso`, "info");
          tocar("success");
          renderizarSeletor();
        } catch (erro) {
          log(`❌ Erro ao importar: ${erro.message}`, "error");
          tocar("error");
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }
  function renderizarSeletor() {
    var _a, _b, _c, _d, _e;
    const container = document.getElementById("perfil-container");
    if (!container) return;
    const estado = get();
    const perfis = Object.keys(estado.perfis || {});
    if (perfis.length === 0) perfis.push("default");
    container.innerHTML = `
        <select id="seletorPerfil" style="width:45%; padding:4px; font-size:11px;">
          ${perfis.map((p) => `<option value="${escapeHtml(p)}" ${p === estado.perfilAtivo ? "selected" : ""}>${escapeHtml(p)}</option>`).join("")}
        </select>
        <button id="btnCriarPerfil" title="Criar novo perfil" style="padding:4px 6px; font-size:10px;">➕</button>
        <button id="btnExcluirPerfil" title="Excluir perfil" style="padding:4px 5px; font-size:10px;">🗑️</button>
        <button id="btnExportarPerfil" title="Exportar perfil" style="padding:4px 5px; font-size:10px;">📤</button>
        <button id="btnImportarPerfil" title="Importar perfil" style="padding:4px 5px; font-size:10px;">📥</button>
    `;
    (_a = document.getElementById("seletorPerfil")) == null ? void 0 : _a.addEventListener("change", (e) => carregar(e.target.value));
    (_b = document.getElementById("btnCriarPerfil")) == null ? void 0 : _b.addEventListener("click", () => {
      const nome = globalThis.prompt("Nome do novo perfil:");
      if (nome == null ? void 0 : nome.trim()) criar(nome.trim());
    });
    (_c = document.getElementById("btnExcluirPerfil")) == null ? void 0 : _c.addEventListener("click", () => {
      const est = get();
      if (globalThis.confirm(`Excluir perfil "${est.perfilAtivo}"?`)) excluir(est.perfilAtivo || "default");
    });
    (_d = document.getElementById("btnExportarPerfil")) == null ? void 0 : _d.addEventListener("click", () => exportar());
    (_e = document.getElementById("btnImportarPerfil")) == null ? void 0 : _e.addEventListener("click", () => importar());
  }
  let _controller = null;
  let _acaoSendoMapeada = null;
  function ativar(acaoId) {
    if (_controller) desativar();
    _acaoSendoMapeada = acaoId;
    _controller = new AbortController();
    const { signal } = _controller;
    const overlay = document.createElement("div");
    overlay.id = "inspecao-overlay";
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.25); z-index: 999998; cursor: crosshair;
        display: flex; justify-content: center; align-items: flex-start; padding-top: 20px;
        pointer-events: none;
    `;
    overlay.innerHTML = `
        <div style="background:#fff; padding:15px 25px; border-radius:8px; box-shadow:0 4px 20px rgba(0,0,0,0.3); text-align:center; pointer-events:auto;">
          <div style="font-size:16px; font-weight:bold; color:#0056b3;">🎯 Modo Inspeção</div>
          <div style="font-size:12px; color:#666; margin:8px 0;">Clique no elemento para: <b>${escapeHtml(acaoId)}</b></div>
          <div style="font-size:11px; color:#999; margin:6px 0;">Pressione ESC para cancelar</div>
          <button id="btnCancelarInspecao" style="padding:6px 16px; cursor:pointer;">❌ Cancelar</button>
        </div>
    `;
    document.body.appendChild(overlay);
    let elementoAtual = null;
    let outlineOriginal = "";
    const handleMouseOver = (e) => {
      const target = e.target;
      if (target.closest("#inspecao-overlay") || target.closest("#painel-robo-pro")) return;
      if (elementoAtual && elementoAtual !== target) {
        elementoAtual.style.outline = outlineOriginal;
        elementoAtual.style.boxShadow = "";
      }
      elementoAtual = target;
      outlineOriginal = elementoAtual.style.outline;
      elementoAtual.style.outline = "3px solid #ff0000";
      elementoAtual.style.boxShadow = "0 0 12px rgba(255,0,0,0.6)";
    };
    const handleMouseOut = (e) => {
      const target = e.target;
      if (elementoAtual === target) {
        elementoAtual.style.outline = outlineOriginal;
        elementoAtual.style.boxShadow = "";
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        desativar();
      }
    };
    const handleClick = (e) => {
      const target = e.target;
      if (target.closest("#inspecao-overlay")) {
        if (target.id === "btnCancelarInspecao") desativar();
        return;
      }
      if (target.closest("#painel-robo-pro")) return;
      e.preventDefault();
      e.stopPropagation();
      const alvo = target.closest("a,button,input,select,textarea") || target;
      const seletor = gerarSeletorUnico(alvo);
      if (_acaoSendoMapeada) {
        _salvarSeletor(_acaoSendoMapeada, seletor);
        log(`🎯 Mapeado: ${_acaoSendoMapeada} → ${seletor}`, "info");
      }
      tocar("success");
      desativar();
    };
    document.addEventListener("mouseover", handleMouseOver, { signal });
    document.addEventListener("mouseout", handleMouseOut, { signal });
    document.addEventListener("keydown", handleKeyDown, { signal });
    document.addEventListener("click", handleClick, { signal, capture: true });
    log(`🔍 Modo inspeção ativado para: ${acaoId}`, "info");
  }
  function desativar() {
    var _a;
    if (_controller) {
      _controller.abort();
      _controller = null;
    }
    _acaoSendoMapeada = null;
    (_a = document.getElementById("inspecao-overlay")) == null ? void 0 : _a.remove();
    log("🔍 Modo inspeção desativado", "info");
  }
  function _salvarSeletor(acaoId, seletor) {
    const estado = get();
    if (estado.acoes && estado.acoes[acaoId]) {
      estado.acoes[acaoId].seletor = seletor;
      estado.perfis[estado.perfilAtivo] = clone(estado.acoes);
      set$1(estado);
    }
  }
  function gerar(contexto = {}) {
    const estado = get();
    return JSON.stringify({
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      url: globalThis.location.href,
      userAgent: navigator.userAgent,
      estado: {
        ativo: estado.ativo,
        pausado: estado.pausado,
        progresso: estado.progresso,
        perfilAtivo: estado.perfilAtivo,
        itemMap: {
          ativo: estado.itemMapAtivo,
          total: Object.keys(estado.itemMap || {}).length,
          ultimoAplicadoId: estado.itemMapUltimoAplicadoId
        },
        timers: {
          globalActionDelayMs: estado.globalActionDelayMs,
          clickCooldownMs: estado.clickCooldownMs
        }
      },
      trilhaExecucao: serializarTrilhaParaRelatorio(estado),
      ultimosLogs: (estado.logs || []).slice(0, 10),
      contexto,
      domSnapshot: {
        title: document.title,
        visibleButtons: [...document.querySelectorAll('button, input[type="button"], input[type="submit"], a')].filter(elementoVisivel).slice(0, 20).map((b) => ({
          id: b.id,
          name: b.name || null,
          text: (b.textContent || b.value || "").replace(/\s+/g, " ").trim().slice(0, 60)
        }))
      }
    }, null, 2);
  }
  async function copiar() {
    var _a;
    const estado = get();
    const relatorio = gerar({ ultimoErro: (_a = estado.estatisticas) == null ? void 0 : _a.ultimoErro });
    try {
      await navigator.clipboard.writeText(relatorio);
      log("📋 Relatório copiado para clipboard!", "info");
      globalThis.alert("Relatório de erro copiado! Cole em um arquivo ou envie ao suporte.");
    } catch {
      mostrarModal(relatorio);
    }
  }
  function mostrarModal(relatorio) {
    var _a;
    const modal = document.createElement("div");
    modal.id = "modal-relatorio";
    modal.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:9999999;display:flex;align-items:center;justify-content:center;";
    modal.innerHTML = `
        <div style="background:white;padding:20px;border-radius:8px;max-width:700px;width:90vw;max-height:80vh;overflow:auto;">
          <h3>📋 Relatório de Erro</h3>
          <textarea id="txtRelatorio" style="width:100%;height:320px;font-family:monospace;font-size:11px;"></textarea>
          <br><button id="btnFecharModal" style="margin-top:10px;padding:8px 16px;">Fechar</button>
        </div>
    `;
    document.body.appendChild(modal);
    document.getElementById("txtRelatorio").value = relatorio;
    (_a = document.getElementById("btnFecharModal")) == null ? void 0 : _a.addEventListener("click", () => modal.remove());
  }
  const LOG_AREA_DEFAULT_HEIGHT = 110;
  const LOG_AREA_MIN_HEIGHT = 80;
  const LOG_AREA_MAX_HEIGHT = 520;
  function setupDragAndDrop(container) {
    let draggedElement = null;
    container.addEventListener("dragstart", (e) => {
      const item = e.target.closest(".acao-item");
      if (!item || !e.dataTransfer) return;
      draggedElement = item;
      item.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    container.addEventListener("dragend", (e) => {
      const item = e.target.closest(".acao-item");
      if (!item) return;
      item.classList.remove("dragging");
      draggedElement = null;
      container.querySelectorAll(".acao-item").forEach((i) => i.classList.remove("drag-over"));
    });
    container.addEventListener("dragover", (e) => {
      e.preventDefault();
      const item = e.target.closest(".acao-item");
      if (!item || item === draggedElement || !e.dataTransfer) return;
      container.querySelectorAll(".acao-item").forEach((i) => i.classList.remove("drag-over"));
      item.classList.add("drag-over");
      e.dataTransfer.dropEffect = "move";
    });
    container.addEventListener("dragleave", (e) => {
      const item = e.target.closest(".acao-item");
      if (item) item.classList.remove("drag-over");
    });
    container.addEventListener("drop", (e) => {
      e.preventDefault();
      const targetItem = e.target.closest(".acao-item");
      if (!targetItem || !draggedElement || targetItem === draggedElement) return;
      targetItem.classList.remove("drag-over");
      const items = Array.from(container.querySelectorAll(".acao-item"));
      const draggedIndex = items.indexOf(draggedElement);
      const targetIndex = items.indexOf(targetItem);
      if (draggedIndex < targetIndex) container.insertBefore(draggedElement, targetItem.nextSibling);
      else container.insertBefore(draggedElement, targetItem);
      _atualizarOrdemAcoesPorLista(container);
    });
  }
  function _atualizarOrdemAcoesPorLista(container) {
    const itens = Array.from(container.querySelectorAll("[data-acao]"));
    const estado = get();
    if (!estado.acoes) estado.acoes = {};
    itens.forEach((el, index) => {
      const id = el.dataset.acao;
      if (id && estado.acoes[id]) {
        estado.acoes[id].ordem = index + 1;
      }
    });
    persistirAcoes(estado);
    set$1(estado);
    log("🔃 Ordem das ações atualizada", "info");
  }
  function getLogAreaMaxHeight() {
    const viewportMax = typeof globalThis !== "undefined" && Number.isFinite(globalThis.innerHeight) ? Math.floor(globalThis.innerHeight * 0.6) : LOG_AREA_MAX_HEIGHT;
    return Math.max(LOG_AREA_MIN_HEIGHT, Math.min(LOG_AREA_MAX_HEIGHT, viewportMax));
  }
  function normalizarLogAreaHeight(valor) {
    const num = Number(valor);
    if (!Number.isFinite(num)) return LOG_AREA_DEFAULT_HEIGHT;
    return Math.max(LOG_AREA_MIN_HEIGHT, Math.min(getLogAreaMaxHeight(), Math.floor(num)));
  }
  async function copiarTextoParaClipboard(texto) {
    const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : null;
    if (clipboard == null ? void 0 : clipboard.writeText) {
      await clipboard.writeText(texto);
      return;
    }
    const textarea = document.createElement("textarea");
    textarea.value = texto;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
    } finally {
      textarea.remove();
    }
  }
  function setupLogResize(estado) {
    const logArea = document.getElementById("log-area");
    const handle = document.querySelector("[data-log-resize-handle]");
    if (!logArea || !handle) return;
    logArea.style.height = `${normalizarLogAreaHeight(estado.logAreaHeight)}px`;
    let resizing = false;
    let startY = 0;
    let startHeight = 0;
    handle.addEventListener("mousedown", (e) => {
      resizing = true;
      startY = e.clientY;
      startHeight = logArea.getBoundingClientRect().height || normalizarLogAreaHeight(estado.logAreaHeight);
      e.preventDefault();
    });
    document.addEventListener("mousemove", (e) => {
      if (!resizing) return;
      const nextHeight = normalizarLogAreaHeight(startHeight + (e.clientY - startY));
      logArea.style.height = `${nextHeight}px`;
    });
    document.addEventListener("mouseup", () => {
      if (!resizing) return;
      resizing = false;
      const nextHeight = normalizarLogAreaHeight(parseFloat(logArea.style.height));
      logArea.style.height = `${nextHeight}px`;
      update((st) => {
        st.logAreaHeight = nextHeight;
      });
    });
  }
  function getFiscalHintsOptions(estado) {
    return {
      ativo: estado.fiscalHintsAtivo !== false,
      dicas: estado.fiscalHints || {}
    };
  }
  function aplicarDicasFiscaisDoEstado() {
    aplicarDicasFiscais(getFiscalHintsOptions(get()), obterEmpresaAtual());
  }
  function setFiscalHintsStatus(mensagem, tipo = "info") {
    const el = document.getElementById("fiscalHintsStatus");
    if (!el) return;
    el.textContent = mensagem;
    el.style.color = tipo === "error" ? "#b42318" : "#6c5947";
  }
  function atualizarListaDicasFiscais(estado) {
    const container = document.getElementById("fiscalHintsLista");
    if (!container) return;
    const dicas = Object.entries(estado.fiscalHints || {});
    container.className = dicas.length ? "km-fiscal-hint-list" : "km-helper-text";
    container.replaceChildren();
    if (!dicas.length) {
      container.textContent = "Nenhuma dica cadastrada.";
      return;
    }
    dicas.forEach(([id, dica]) => {
      const row = document.createElement("div");
      row.className = "km-fiscal-hint-row";
      row.dataset.kmFiscalId = id;
      const copy = document.createElement("div");
      copy.className = "km-fiscal-hint-row-copy";
      const termo = document.createElement("strong");
      termo.textContent = dica.termo || "";
      const codigos = document.createElement("span");
      codigos.textContent = [dica.ncm ? `NCM ${dica.ncm}` : "", dica.unspsc ? `UNSPSC ${dica.unspsc}` : ""].filter(Boolean).join(" / ");
      copy.append(termo, codigos);
      const remover = document.createElement("button");
      remover.className = "km-inline-button km-inline-button--danger";
      remover.type = "button";
      remover.dataset.kmFiscalRemove = id;
      remover.textContent = "Remover";
      row.append(copy, remover);
      container.appendChild(row);
    });
  }
  function persistirDicasFiscais(dicas, json) {
    const estado = update((st) => {
      st.fiscalHints = dicas;
      st.fiscalHintsJson = json ?? exportarDicasFiscaisJson(dicas);
    });
    const textarea = document.getElementById("fiscalHintsJson");
    if (textarea) textarea.value = estado.fiscalHintsJson || "";
    atualizarListaDicasFiscais(estado);
    aplicarDicasFiscaisDoEstado();
    return estado;
  }
  function wireEvents(toggleMinimizar2) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A;
    const estado = get();
    const fmtS = (ms) => `${(Number(ms || 0) / 1e3).toFixed(1)}s`;
    const painelConteudo = document.getElementById("painelConteudo");
    painelConteudo == null ? void 0 : painelConteudo.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-section-toggle]");
      if (!btn) return;
      const chave = String(btn.getAttribute("data-section-toggle") || "").trim();
      if (!chave) return;
      const secao = btn.closest(".km-collapsible[data-section]");
      if (!secao) return;
      const vaiExpandir = secao.classList.contains("is-collapsed");
      secao.classList.toggle("is-collapsed", !vaiExpandir);
      btn.setAttribute("aria-expanded", vaiExpandir ? "true" : "false");
      const icon = btn.querySelector(".km-section-toggle-icon");
      if (icon) icon.textContent = vaiExpandir ? "▾" : "▸";
      update((st) => {
        st.painelSecoes = st.painelSecoes || {};
        st.painelSecoes[chave] = vaiExpandir;
      });
    });
    const persistirScrollPainel = debounce(() => {
      if (!painelConteudo) return;
      const top = Math.max(0, Math.floor(painelConteudo.scrollTop || 0));
      update((st) => {
        st.painelScrollTop = top;
      });
    }, 120);
    painelConteudo == null ? void 0 : painelConteudo.addEventListener("scroll", persistirScrollPainel, { passive: true });
    construirListaAcoes(estado);
    const container = document.getElementById("lista-acoes");
    container == null ? void 0 : container.addEventListener("click", async (e) => {
      const btnInspecao = e.target.closest(".btn-inspecao");
      if (btnInspecao) {
        ativar(btnInspecao.dataset.acao);
        return;
      }
      const btnTestar = e.target.closest(".btn-testar");
      if (btnTestar) {
        const acaoId = btnTestar.dataset.acao;
        if (!acaoId) return;
        const est = get();
        const acao = est.acoes && est.acoes[acaoId];
        if (!acao) {
          log(`❌ Ação ${acaoId} não encontrada`, "error");
          return;
        }
        log(`🧪 Testando ação: ${acaoId}...`, "info");
        const inputVal = document.getElementById(`val_${acaoId}`);
        const valorParaUsar = inputVal ? inputVal.value : acao.valor;
        try {
          const sucesso = await tentarComRetry(acao.seletor || "", valorParaUsar || "", `teste_${acaoId}`);
          if (sucesso) {
            log(`✅ Sucesso no teste: ${acaoId}`, "info");
            tocar("success");
          } else {
            log(`❌ Falha no teste: ${acaoId} (não encontrado/visível)`, "warn");
            tocar("warning");
          }
        } catch (err) {
          log(`❌ Erro no teste: ${err.message}`, "error");
          tocar("error");
        }
      }
    });
    container == null ? void 0 : container.addEventListener("change", (e) => {
      const target = e.target;
      if (target.type === "checkbox" && target.id.startsWith("chk_")) {
        const acaoId = target.id.replace("chk_", "");
        const acaoDef = ACOES_WORKFLOW.find((a) => a.id === acaoId);
        if (acaoDef) {
          update((st) => {
            if (st.acoes[acaoId]) {
              st.acoes[acaoId].ativo = target.checked;
              persistirAcoes(st);
            }
          });
          log(`${target.checked ? "✅" : "⬜"} ${acaoDef.nome}`, "info");
        }
      }
      if (target.type === "text" && target.id.startsWith("val_")) {
        const acaoId = target.id.replace("val_", "");
        const acaoDef = ACOES_WORKFLOW.find((a) => a.id === acaoId);
        if (acaoDef) {
          update((st) => {
            if (st.acoes[acaoId]) {
              st.acoes[acaoId].valor = target.value;
              persistirAcoes(st);
            }
          });
          log(`💾 ${acaoDef.nome}: ${target.value}`, "info");
        }
      }
    });
    container == null ? void 0 : container.addEventListener("input", (e) => {
      const target = e.target;
      if (target.type === "text" && target.id.startsWith("val_")) {
        const acaoId = target.id.replace("val_", "");
        if (CONFIG.VALIDADORES[acaoId]) {
          const resultado2 = validar(acaoId, target.value);
          aplicarVisual(target, resultado2);
        }
      }
    });
    ACOES_WORKFLOW.forEach((acaoDef) => {
      if (acaoDef.tipo === "input" && CONFIG.VALIDADORES[acaoDef.id]) {
        const input = document.getElementById(`val_${acaoDef.id}`);
        const acaoState = estado.acoes && estado.acoes[acaoDef.id];
        if (input && acaoState) {
          const resultado2 = validar(acaoDef.id, acaoState.valor || "");
          aplicarVisual(input, resultado2);
        }
      }
    });
    if (estado.perfis && !estado.perfis.default) {
      estado.perfis.default = clone(estado.acoes);
      estado.perfilConfigs = estado.perfilConfigs || {};
      estado.perfilConfigs.default = estado.perfilConfigs.default || {
        reporting: normalizarReportingConfig(estado.reporting || REPORTING_DEFAULTS)
      };
      set$1(estado);
    }
    renderizarSeletor();
    setupLogResize(estado);
    const logsAtuais = (preloadParaUI == null ? void 0 : preloadParaUI()) || [];
    logsAtuais.slice(0, 20).reverse().forEach((entry) => atualizarUI == null ? void 0 : atualizarUI(entry));
    (_a = document.getElementById("drawerToggle")) == null ? void 0 : _a.addEventListener("click", toggleMinimizar2);
    (_b = document.getElementById("btnCopiarRelatorio")) == null ? void 0 : _b.addEventListener("click", () => copiar());
    (_c = document.getElementById("btnCopiarLogs")) == null ? void 0 : _c.addEventListener("click", async () => {
      const texto = (formatarTodos == null ? void 0 : formatarTodos()) || "";
      if (!texto.trim()) {
        log("ℹ️ Sem logs para copiar", "info");
        return;
      }
      try {
        await copiarTextoParaClipboard(texto);
        log("📋 Logs copiados para a área de transferência", "info");
      } catch (err) {
        log(`❌ Erro ao copiar logs: ${(err == null ? void 0 : err.message) || err}`, "error");
      }
    });
    (_d = document.getElementById("btnLimparLogs")) == null ? void 0 : _d.addEventListener("click", () => {
      limpar$2 == null ? void 0 : limpar$2();
    });
    (_e = document.getElementById("chkSimulacao")) == null ? void 0 : _e.addEventListener("change", (e) => {
      update((st) => {
        st.modoSimulacao = e.target.checked;
      });
      const novoEstado = get();
      log(novoEstado.modoSimulacao ? "🧪 Modo simulação ATIVADO" : "▶️ Modo simulação desativado", "info");
    });
    (_f = document.getElementById("chkPausarReincidencia")) == null ? void 0 : _f.addEventListener("change", (e) => {
      const ativo = !!e.target.checked;
      update((st) => {
        st.pausarEmReincidencia = ativo;
      });
      log(ativo ? "⛔ Pausa por reincidência ATIVADA" : "✅ Pausa por reincidência DESATIVADA", "info");
    });
    const itemMapTextarea = document.getElementById("itemMapJson");
    if (itemMapTextarea) itemMapTextarea.value = estado.itemMapJson || "";
    (_g = document.getElementById("chkItemMapAtivo")) == null ? void 0 : _g.addEventListener("change", (e) => {
      update((st) => {
        st.itemMapAtivo = e.target.checked;
      });
      const novoEstado = get();
      log(novoEstado.itemMapAtivo ? "🧾 JSON por item ATIVADO" : "🧾 JSON por item DESATIVADO", "info");
      atualizarStatusUI(novoEstado);
    });
    (_h = document.getElementById("btnItemMapAplicar")) == null ? void 0 : _h.addEventListener("click", () => {
      aplicarJson((itemMapTextarea == null ? void 0 : itemMapTextarea.value) || "");
    });
    (_i = document.getElementById("btnItemMapCriar")) == null ? void 0 : _i.addEventListener("click", () => {
      gerarJsonDoItemAtual(itemMapTextarea);
    });
    const fiscalHintsTextarea = document.getElementById("fiscalHintsJson");
    if (fiscalHintsTextarea && !fiscalHintsTextarea.value.trim()) {
      fiscalHintsTextarea.value = exportarDicasFiscaisJson(estado.fiscalHints || {});
    }
    (_j = document.getElementById("chkFiscalHintsAtivo")) == null ? void 0 : _j.addEventListener("change", (e) => {
      update((st) => {
        st.fiscalHintsAtivo = e.target.checked;
      });
      aplicarDicasFiscaisDoEstado();
      log(e.target.checked ? "🔎 Dicas fiscais ativadas" : "🔎 Dicas fiscais desativadas", "info");
    });
    (_k = document.getElementById("btnFiscalHintAdicionar")) == null ? void 0 : _k.addEventListener("click", () => {
      var _a2, _b2, _c2;
      const termo = ((_a2 = document.getElementById("txtFiscalHintTermo")) == null ? void 0 : _a2.value) || "";
      const ncm2 = ((_b2 = document.getElementById("txtFiscalHintNcm")) == null ? void 0 : _b2.value) || "";
      const unspsc2 = ((_c2 = document.getElementById("txtFiscalHintUnspsc")) == null ? void 0 : _c2.value) || "";
      const atuais = Object.values(get().fiscalHints || {});
      const resultado2 = importarDicasFiscaisJson(JSON.stringify([...atuais, { termo, ncm: ncm2, unspsc: unspsc2 }]));
      if (!resultado2.ok) {
        setFiscalHintsStatus(resultado2.erros.join(" | "), "error");
        return;
      }
      persistirDicasFiscais(resultado2.dicas);
      ["txtFiscalHintTermo", "txtFiscalHintNcm", "txtFiscalHintUnspsc"].forEach((id) => {
        const input = document.getElementById(id);
        if (input) input.value = "";
      });
      setFiscalHintsStatus("Dica adicionada.");
      log(`🔎 Dica fiscal adicionada para: ${termo}`, "info");
    });
    (_l = document.getElementById("btnFiscalHintsImportar")) == null ? void 0 : _l.addEventListener("click", () => {
      const json = (fiscalHintsTextarea == null ? void 0 : fiscalHintsTextarea.value) || "";
      const resultado2 = importarDicasFiscaisJson(json);
      if (!resultado2.ok) {
        setFiscalHintsStatus(resultado2.erros.join(" | "), "error");
        return;
      }
      persistirDicasFiscais(resultado2.dicas, exportarDicasFiscaisJson(resultado2.dicas));
      setFiscalHintsStatus("JSON aplicado.");
      log("🔎 JSON de dicas fiscais aplicado", "info");
    });
    (_m = document.getElementById("btnFiscalHintsExportar")) == null ? void 0 : _m.addEventListener("click", () => {
      const est = get();
      const json = exportarDicasFiscaisJson(est.fiscalHints || {});
      update((st) => {
        st.fiscalHintsJson = json;
      });
      if (fiscalHintsTextarea) fiscalHintsTextarea.value = json;
      setFiscalHintsStatus("JSON atualizado.");
    });
    (_n = document.getElementById("fiscalHintsLista")) == null ? void 0 : _n.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-km-fiscal-remove]");
      if (!btn) return;
      const id = btn.dataset.kmFiscalRemove || "";
      const dicas = { ...get().fiscalHints || {} };
      delete dicas[id];
      persistirDicasFiscais(dicas);
      setFiscalHintsStatus("Dica removida.");
    });
    const deb = (fn) => debounce(fn, 80);
    (_o = document.getElementById("globalActionDelaySlider")) == null ? void 0 : _o.addEventListener("input", deb((e) => {
      const valor = parseInt(e.target.value, 10);
      const label = document.getElementById("globalActionDelayLabel");
      if (label) label.textContent = fmtS(valor);
      update((st) => {
        st.globalActionDelayMs = valor;
      });
    }));
    (_p = document.getElementById("clickCooldownSlider")) == null ? void 0 : _p.addEventListener("input", deb((e) => {
      const valor = parseInt(e.target.value, 10);
      const label = document.getElementById("clickCooldownLabel");
      if (label) label.textContent = fmtS(valor);
      update((st) => {
        st.clickCooldownMs = valor;
      });
    }));
    const persistReporting = (mutator) => {
      update((st) => {
        st.reporting = normalizarReportingConfig(st.reporting || REPORTING_DEFAULTS);
        mutator(st.reporting);
        persistirAcoes(st);
      });
    };
    (_q = document.getElementById("chkReportingMedia")) == null ? void 0 : _q.addEventListener("change", (e) => {
      persistReporting((cfg) => {
        cfg.enabledMedia = !!e.target.checked;
      });
      log(`🖼️ Coleta de mídia ${e.target.checked ? "ativada" : "desativada"}`, "info");
    });
    (_r = document.getElementById("chkReportingEnabled")) == null ? void 0 : _r.addEventListener("change", (e) => {
      persistReporting((cfg) => {
        cfg.enabledReport = !!e.target.checked;
      });
      log(`📝 Geração de relatório PDF/MD ${e.target.checked ? "ativada" : "desativada"}`, "info");
    });
    (_s = document.getElementById("chkReportingClickMediaTab")) == null ? void 0 : _s.addEventListener("change", (e) => {
      persistReporting((cfg) => {
        cfg.clickMediaTabBeforeCollect = !!e.target.checked;
      });
      log(`🖱️ Clique na aba Mídias antes da coleta ${e.target.checked ? "ativado" : "desativado"}`, "info");
    });
    (_t = document.getElementById("chkReportingAcompanhamento")) == null ? void 0 : _t.addEventListener("change", (e) => {
      persistReporting((cfg) => {
        cfg.enabledAcompanhamento = !!e.target.checked;
      });
      log(`📜 Coleta de acompanhamento ${e.target.checked ? "ativada" : "desativada"}`, "info");
    });
    (_u = document.getElementById("chkReportingBlock")) == null ? void 0 : _u.addEventListener("change", (e) => {
      persistReporting((cfg) => {
        cfg.blockOnReportError = !!e.target.checked;
      });
      log(`🧱 Bloqueio em erro de relatório ${e.target.checked ? "ativado" : "desativado"}`, "info");
    });
    (_v = document.getElementById("txtReportingServiceUrl")) == null ? void 0 : _v.addEventListener("change", (e) => {
      const input = e.target;
      const novo = String(input.value || "").trim() || CONFIG.REPORTING.SERVICE_DEFAULT;
      persistReporting((cfg) => {
        cfg.serviceUrl = novo;
      });
      input.value = novo;
      log(`🔗 Serviço de relatório: ${novo}`, "info");
    });
    (_w = document.getElementById("txtReportingApiToken")) == null ? void 0 : _w.addEventListener("change", (e) => {
      const input = e.target;
      const token = String(input.value || "").trim();
      persistReporting((cfg) => {
        cfg.apiToken = token || null;
      });
      input.value = token;
      log(`🔐 Token de API ${token ? "configurado" : "removido"}`, "info");
    });
    (_x = document.getElementById("selReportingTransport")) == null ? void 0 : _x.addEventListener("change", (e) => {
      const transport = String(e.target.value || "auto").trim();
      persistReporting((cfg) => {
        cfg.transport = transport;
      });
      log(`🚚 Transporte de relatório: ${transport}`, "info");
    });
    (_y = document.getElementById("numReportingMaxFileMb")) == null ? void 0 : _y.addEventListener("change", (e) => {
      const input = e.target;
      const val = Math.max(1, Math.min(200, Number(input.value || CONFIG.REPORTING.MAX_FILE_SIZE_MB)));
      persistReporting((cfg) => {
        cfg.maxFileSizeMb = val;
      });
      input.value = String(val);
      log(`📦 Limite por arquivo: ${val}MB`, "info");
    });
    (_z = document.getElementById("numReportingMaxFiles")) == null ? void 0 : _z.addEventListener("change", (e) => {
      const input = e.target;
      const val = Math.max(1, Math.min(200, Number(input.value || CONFIG.REPORTING.MAX_FILES_PER_ITEM)));
      persistReporting((cfg) => {
        cfg.maxFilesPerItem = val;
      });
      input.value = String(val);
      log(`📚 Limite de arquivos por item: ${val}`, "info");
    });
    (_A = document.getElementById("btnToggle")) == null ? void 0 : _A.addEventListener("click", () => {
      const est = get();
      if (est.pausado) togglePausar();
      else if (est.ativo) parar();
      else iniciar();
    });
    atualizarStatusUI(get());
    atualizarListaDicasFiscais(estado);
    aplicarDicasFiscaisDoEstado();
    if (container) setupDragAndDrop(container);
  }
  const SAFE_TOP = 12;
  const SAFE_MARGIN = 10;
  let _painelMinimizado = false;
  let _keyboardController = null;
  function atualizarStatusCompacto(estado) {
    const el = document.querySelector(".km-drawer-status-compact");
    if (!el) return;
    if (estado.pausado) el.textContent = "pause";
    else if (estado.ativo) el.textContent = "run";
    else el.textContent = "off";
  }
  function atualizarResumoEstimativa() {
    const estado = get();
    const resumo = obterResumoUI(estado);
    const card = document.querySelector(".km-summary-card");
    const resumoEl = document.getElementById("etaResumo");
    const tempoBaseEl = document.getElementById("etaTempoBase");
    const etaRestanteEl = document.getElementById("etaRestante");
    const previsaoEl = document.getElementById("etaPrevisao");
    const primeiroItemEl = document.querySelector('[data-role="eta-primeiro-item"]');
    if (card) card.classList.toggle("is-critical", resumo.pausadoPorReincidencia || false);
    if (resumoEl) Object.assign(resumoEl, { textContent: resumo.pausadoPorReincidencia ? resumo.mensagemPausa || resumo.resumo : resumo.resumo });
    if (tempoBaseEl) Object.assign(tempoBaseEl, { textContent: resumo.tempoBaseTexto });
    if (etaRestanteEl) Object.assign(etaRestanteEl, { textContent: resumo.etaRestanteTexto });
    if (previsaoEl) Object.assign(previsaoEl, { textContent: resumo.previsaoTexto });
    if (primeiroItemEl) Object.assign(primeiroItemEl, { textContent: resumo.primeiroItemTexto });
  }
  function renderEventosTrilha(eventos) {
    return eventos.map((evento) => `
        <li class="km-trace-item" data-event-type="${escapeHtml(evento.tipo || "")}">
            <span class="km-trace-time">${escapeHtml(evento.horario || "")}</span>
            <span class="km-trace-copy">${escapeHtml(evento.resumo || "")}</span>
        </li>
    `).join("");
  }
  function atualizarTrilhaItem() {
    const estado = get();
    const resumo = obterResumoTrilhaUI(estado);
    const card = document.getElementById("itemTraceCard");
    const currentEl = document.getElementById("itemTraceCurrent");
    const listEl = document.getElementById("itemTraceList");
    const emptyEl = document.getElementById("itemTraceEmpty");
    if (card) card.classList.toggle("is-critical", resumo.critical || false);
    if (currentEl) currentEl.textContent = resumo.empty ? "Sem eventos nesta rodada." : resumo.currentLabel || "";
    if (listEl) {
      if (resumo.empty) {
        listEl.innerHTML = "";
        listEl.style.display = "none";
      } else {
        listEl.innerHTML = renderEventosTrilha(resumo.events || []);
        listEl.style.display = "flex";
      }
    }
    if (emptyEl) {
      emptyEl.textContent = "Sem eventos nesta rodada.";
      emptyEl.style.display = resumo.empty ? "block" : "none";
    }
  }
  function manterPainelVisivel(painel) {
    if (!painel) return;
    const rect = painel.getBoundingClientRect();
    const maxTop = typeof globalThis !== "undefined" && globalThis.innerHeight ? Math.max(SAFE_TOP, globalThis.innerHeight - rect.height - SAFE_MARGIN) : SAFE_TOP;
    const topAtual = Number.parseFloat(painel.style.top || `${rect.top}`) || SAFE_TOP;
    const top = Math.min(Math.max(topAtual, SAFE_TOP), maxTop);
    painel.style.left = `${SAFE_MARGIN}px`;
    painel.style.top = `${top}px`;
    painel.style.right = "auto";
    update((e) => {
      e.painelPosicao = { top: painel.style.top };
    });
  }
  function atualizarIndicadorProgresso() {
    const estado = get();
    const resumo = obterResumoUI(estado);
    const container = document.getElementById("progressBar");
    const fill = document.getElementById("progressFill");
    const textEl = document.getElementById("progressText");
    atualizarResumoEstimativa();
    atualizarTrilhaItem();
    if (!container || !fill || !textEl) return;
    if (!estado.ativo) {
      container.style.display = "none";
      return;
    }
    const total = Number(estado.progresso && estado.progresso.total || resumo.totalPlanejado || 0);
    const concluidos = Number(estado.progresso && estado.progresso.atual || 0);
    const pct = total > 0 ? concluidos / total * 100 : 0;
    container.style.display = "block";
    fill.style.width = `${pct}%`;
    textEl.textContent = total > 0 ? `Concluídos ${concluidos} de ${total} • atual ${resumo.itemAtualId || "—"}` : "Aguardando definição do lote...";
  }
  function atualizarBotaoToggle() {
    var _a;
    const estado = get();
    const btn = document.getElementById("btnToggle");
    const statusEl = document.getElementById("statusRobo");
    const ultimoErro = ((_a = estado.estatisticas) == null ? void 0 : _a.ultimoErro) || null;
    atualizarStatusCompacto(estado);
    atualizarTrilhaItem();
    if (!btn) return;
    if (estado.pausado) {
      btn.style.background = "linear-gradient(135deg, #d97706 0%, #b45309 100%)";
      btn.textContent = "Retomar";
      if (statusEl) {
        statusEl.textContent = (ultimoErro == null ? void 0 : ultimoErro.tipo) === "reincidencia_etapa" ? "Reincidência detectada. Revisão manual necessária." : "Pausado (F8 para retomar)";
        statusEl.style.color = (ultimoErro == null ? void 0 : ultimoErro.tipo) === "reincidencia_etapa" ? "#b42318" : "#6c5947";
      }
    } else if (estado.ativo) {
      btn.style.background = "linear-gradient(135deg, #b42318 0%, #7a271a 100%)";
      btn.textContent = "Parar robô";
      if (statusEl) {
        statusEl.textContent = "Executando...";
        statusEl.style.color = "#6c5947";
      }
    } else {
      btn.style.background = "linear-gradient(135deg, #0e5a48 0%, #0a4336 100%)";
      btn.textContent = "Iniciar ciclo";
      if (statusEl) {
        statusEl.textContent = "Aguardando comando.";
        statusEl.style.color = "#6c5947";
      }
    }
  }
  function tornarArrastavel(elemento, handle) {
    let isDragging = false;
    let startY = 0;
    let startTop = 0;
    const controller = new AbortController();
    handle.style.cursor = "move";
    handle.addEventListener("mousedown", (e) => {
      const target = e.target;
      if (["INPUT", "BUTTON", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      isDragging = true;
      startY = e.clientY;
      startTop = elemento.getBoundingClientRect().top;
      e.preventDefault();
    }, { signal: controller.signal });
    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      elemento.style.left = `${SAFE_MARGIN}px`;
      elemento.style.top = `${startTop + (e.clientY - startY)}px`;
      elemento.style.right = "auto";
    }, { signal: controller.signal });
    document.addEventListener("mouseup", () => {
      if (!isDragging) return;
      isDragging = false;
      manterPainelVisivel(elemento);
    }, { signal: controller.signal });
    elemento._dragController = controller;
  }
  function toggleMinimizar() {
    const painel = getPainelEl();
    const toggle = document.getElementById("drawerToggle");
    if (!painel || !toggle) return;
    _painelMinimizado = !painel.classList.contains("is-collapsed");
    painel.classList.toggle("is-collapsed", _painelMinimizado);
    update((e) => {
      e.minimizado = _painelMinimizado;
    });
    toggle.textContent = _painelMinimizado ? "»" : "«";
    toggle.title = _painelMinimizado ? "Expandir" : "Recolher";
    manterPainelVisivel(painel);
  }
  let _fiscalHintsObserver = null;
  let _fiscalHintsTimer = null;
  let _fiscalHintsGlobalController = null;
  function aplicarDicasFiscaisEstado() {
    const estado = get();
    aplicarDicasFiscais({
      ativo: estado.fiscalHintsAtivo !== false,
      dicas: estado.fiscalHints || {}
    }, obterEmpresaAtual());
  }
  function agendarAplicacaoDicasFiscais() {
    if (typeof globalThis === "undefined") return;
    if (_fiscalHintsTimer != null) globalThis.clearTimeout(_fiscalHintsTimer);
    _fiscalHintsTimer = globalThis.setTimeout(() => {
      _fiscalHintsTimer = null;
      aplicarDicasFiscaisEstado();
    }, 120);
  }
  function inicializarDicasFiscaisPagina() {
    aplicarDicasFiscaisEstado();
    if (_fiscalHintsObserver) _fiscalHintsObserver.disconnect();
    _fiscalHintsObserver = new MutationObserver((mutations) => {
      const relevante = mutations.some((mutation) => Array.from(mutation.addedNodes).some((node) => {
        var _a, _b;
        if (!(node instanceof HTMLElement)) return false;
        return !!((_a = node.querySelector) == null ? void 0 : _a.call(node, '#divDescricaoCompleta .descricao, .descricao[id^="txtD"], #txtDescricao')) || ((_b = node.matches) == null ? void 0 : _b.call(node, '#divDescricaoCompleta, .descricao[id^="txtD"], #txtDescricao'));
      }));
      if (relevante) agendarAplicacaoDicasFiscais();
    });
    if (document.body) _fiscalHintsObserver.observe(document.body, { childList: true, subtree: true });
    if (_fiscalHintsGlobalController) _fiscalHintsGlobalController.abort();
    _fiscalHintsGlobalController = new AbortController();
    document.addEventListener("click", (e) => {
      const target = e.target;
      if (target.closest("#km-fiscal-hint-popup") || target.closest(".km-fiscal-hint-mark")) return;
      fecharPopupDicasFiscais();
    }, { signal: _fiscalHintsGlobalController.signal });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") fecharPopupDicasFiscais();
    }, { signal: _fiscalHintsGlobalController.signal });
  }
  function criarPainel() {
    if (getPainelEl()) return;
    const estado = get();
    _painelMinimizado = estado.minimizado ?? (typeof globalThis !== "undefined" && globalThis.innerWidth < 640);
    injetarEstilos();
    const div = construirPainel(_painelMinimizado);
    document.body.appendChild(div);
    const header = document.getElementById("painelHeader");
    if (header) tornarArrastavel(div, header);
    manterPainelVisivel(div);
    if (typeof globalThis !== "undefined") {
      globalThis.addEventListener("resize", () => manterPainelVisivel(getPainelEl()));
    }
    wireEvents(toggleMinimizar);
    const conteudo = document.getElementById("painelConteudo");
    const scrollTopSalvo = Number(estado.painelScrollTop || 0);
    if (conteudo && scrollTopSalvo > 0 && typeof globalThis !== "undefined") {
      const raf = globalThis.requestAnimationFrame || ((cb) => setTimeout(() => cb(Date.now()), 0));
      raf(() => {
        raf(() => {
          conteudo.scrollTop = scrollTopSalvo;
        });
      });
    }
    atualizarBotaoToggle();
    atualizarIndicadorProgresso();
  }
  function registrarAtalhos() {
    if (_keyboardController) _keyboardController.abort();
    _keyboardController = new AbortController();
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        ativarKillSwitch();
      }
      if (e.key === "F7") {
        e.preventDefault();
        toggleMinimizar();
      }
      if (e.key === "F8") {
        e.preventDefault();
        const estado = get();
        if (estado.ativo) togglePausar();
      }
    }, { signal: _keyboardController.signal });
  }
  function conectarCallbacksUI() {
    setUICallbacks({
      atualizarBotaoToggle,
      atualizarIndicadorProgresso
    });
  }
  function inicializar() {
    conectarCallbacksUI();
    criarPainel();
    inicializarDicasFiscaisPagina();
    registrarAtalhos();
    const estado = get();
    if (estado.ativo && !estado.pausado) {
      log("🔄 Retomando execução...", "info");
      setTimeout(() => executarCiclo("resume_load"), 700);
    }
  }
  function limparTudo() {
    const painel = getPainelEl();
    if (painel == null ? void 0 : painel._dragController) painel._dragController.abort();
    try {
      _keyboardController == null ? void 0 : _keyboardController.abort();
    } catch {
    }
    try {
      _fiscalHintsObserver == null ? void 0 : _fiscalHintsObserver.disconnect();
    } catch {
    }
    try {
      _fiscalHintsGlobalController == null ? void 0 : _fiscalHintsGlobalController.abort();
    } catch {
    }
    if (_fiscalHintsTimer != null && typeof globalThis !== "undefined") globalThis.clearTimeout(_fiscalHintsTimer);
    fecharPopupDicasFiscais();
    fechar();
    limpar();
  }
  enableTrustedTypesBypass();
  inicializarHooks();
  setRegistrarInteracao((acaoId) => {
    if (registrarInteracao) {
      registrarInteracao(acaoId);
    }
  });
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", inicializar);
    } else {
      inicializar();
    }
    document.addEventListener("click", () => inicializar$1(), { once: true });
  }
  if (typeof globalThis !== "undefined") {
    globalThis.addEventListener("beforeunload", limparTudo);
  }
  console.log("[FISCAL 5.0] Build modular carregado — Fase 5.");

})();