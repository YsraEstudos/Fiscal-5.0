/**
 * Trilha estruturada por item da rodada atual.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MAX_EVENTS_PER_ITEM = 20;
const MAX_STRING_LENGTH = 300;
const CRITICAL_EVENT_TYPES = new Set([
    'pausado_por_reincidencia',
    'pausado_por_validacao_ncm',
    'pausado_por_validacao_nbs',
]);

export const EVENT_LABELS: Readonly<Record<string, string>> = Object.freeze({
    item_aberto: 'Item aberto para processamento',
    item_sem_json: 'Item ignorado por falta de JSON',
    ncm_preenchido: 'NCM preenchido',
    lei116_preenchida: 'Lei 116 preenchida',
    unspsc_preenchido: 'UNSPSC digitado',
    unspsc_pesquisado: 'Pesquisa de UNSPSC executada',
    unspsc_selecionado: 'UNSPSC selecionado',
    midia_coletada: 'Coleta de mídia',
    acompanhamento_coletado: 'Acompanhamento coletado',
    relatorio_enviado: 'Relatório enviado com sucesso',
    item_concluido: 'Item concluído',
    pausado_por_reincidencia: 'Pausado por reincidência da etapa',
    pausado_por_validacao_ncm: 'Pausado por NCM inválido',
    pausado_por_validacao_nbs: 'Pausado por NBS inválido',
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type ItemStatus = 'em_andamento' | 'concluido' | 'pausado';

export interface TraceEvent {
    seq: number;
    tipo: string;
    ts: number | null;
    itemKey: string;
    itemTelaId: string;
    resumo: string;
    payload: unknown;
}

export interface TracedItem {
    itemKey: string;
    itemTelaId: string;
    status: ItemStatus;
    firstEventTs: number | null;
    lastEventTs: number | null;
    lastEventTipo: string | null;
    resumoCurto: string | null;
    events: TraceEvent[];
}

export interface TrilhaExecucao {
    runId: string | null;
    startedAtTs: number | null;
    lastEventSeq: number;
    itemAtualKey: string | null;
    items: Record<string, TracedItem>;
}

export interface FormattedEvent extends TraceEvent {
    horario: string;
    titulo: string;
    texto: string;
}

export interface ResumoTrilhaUI {
    empty: boolean;
    itemKey: string | null;
    itemTelaId: string | null;
    currentLabel: string;
    events: FormattedEvent[];
    critical: boolean;
    status: ItemStatus | null;
    lastEventTipo: string | null;
    resumoCurto?: string | null;
    cardClassName: string;
    runId?: string | null;
}

export interface SerializacaoTrilha {
    runId: string | null;
    startedAtTs: number | null;
    itemAtualKey: string | null;
    ultimoProcessado: string | null;
    itensRecentes: Array<{
        itemKey: string;
        itemTelaId: string;
        status: ItemStatus;
        lastEventTipo: string | null;
        resumoCurto: string | null;
        events: TraceEvent[];
    }>;
}

// Minimal estado interface needed for this module
interface EstadoComTrilha {
    itemAtualKey?: string | null;
    itemAtualTelaId?: string | null;
    trilhaExecucao?: unknown;
    progresso?: { ultimoProcessado?: string | null };
}

// ---------------------------------------------------------------------------
// Default state
// ---------------------------------------------------------------------------
export const TRILHA_EXECUCAO_PADRAO: Readonly<TrilhaExecucao> = Object.freeze({
    runId: null,
    startedAtTs: null,
    lastEventSeq: 0,
    itemAtualKey: null,
    items: {},
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function truncarTexto(valor: unknown, fallback: string = ''): string {
    const texto = String(valor ?? fallback).trim();
    if (!texto) return fallback;
    return texto.length > MAX_STRING_LENGTH ? `${texto.slice(0, MAX_STRING_LENGTH - 1)}…` : texto;
}

function normalizarNumeroNullable(valor: unknown): number | null {
    if (valor == null || valor === '') return null;
    const numero = Number(valor);
    return Number.isFinite(numero) ? Math.max(0, numero) : null;
}

function normalizarNumeroInteiro(valor: unknown, fallback: number = 0): number {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) return fallback;
    return Math.max(0, Math.floor(numero));
}

function normalizarItemKey(itemKey: unknown): string | null {
    const valor = String(itemKey ?? '').trim();
    return valor || null;
}

function normalizarStatus(status: unknown): ItemStatus {
    return (['em_andamento', 'concluido', 'pausado'] as const).includes(status as ItemStatus)
        ? (status as ItemStatus)
        : 'em_andamento';
}

// Recursive type alias is not supported; use interface + index signature pattern
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SanitizedValue = string | number | boolean | null | SanitizedValue[] | { [key: string]: SanitizedValue };

function sanitizarPayload(valor: unknown, depth: number = 0): SanitizedValue {
    if (depth > 3) return '[truncated]';
    if (valor == null) return null;
    if (typeof valor === 'string') return truncarTexto(valor, '');
    if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
    if (typeof valor === 'boolean') return valor;
    if (Array.isArray(valor)) return valor.slice(0, 20).map((item) => sanitizarPayload(item, depth + 1));
    if (typeof valor === 'object') {
        return Object.fromEntries(
            Object.entries(valor as Record<string, unknown>)
                .slice(0, 20)
                .map(([chave, item]) => [truncarTexto(chave, ''), sanitizarPayload(item, depth + 1)])
        );
    }
    return truncarTexto(String(valor), '');
}

function normalizarEvento(evento: unknown, itemKeyPadrao: string, itemTelaIdPadrao: string): TraceEvent | null {
    if (!evento || typeof evento !== 'object') return null;
    const e = evento as Record<string, unknown>;
    const tipo = truncarTexto(e['tipo'], '');
    if (!tipo) return null;
    const itemKey = normalizarItemKey(e['itemKey']) || itemKeyPadrao;
    if (!itemKey) return null;
    const itemTelaId = normalizarItemKey(e['itemTelaId']) || itemTelaIdPadrao || itemKey;
    const ts = normalizarNumeroNullable(e['ts']);
    return {
        seq: normalizarNumeroInteiro(e['seq'], 0),
        tipo,
        ts,
        itemKey,
        itemTelaId,
        resumo: truncarTexto(e['resumo'], EVENT_LABELS[tipo] || tipo),
        payload: sanitizarPayload((e['payload'] as unknown) ?? {}),
    };
}

function normalizarItemTracado(itemKey: string, item: unknown, fallbackTs: number | null = null): TracedItem | null {
    const key = normalizarItemKey(itemKey);
    if (!key || !item || typeof item !== 'object') return null;
    const i = item as Record<string, unknown>;

    const itemTelaIdBase = normalizarItemKey(i['itemTelaId']) || key;
    const events: TraceEvent[] = Array.isArray(i['events'])
        ? (i['events'] as unknown[])
            .map((evento) => normalizarEvento(evento, key, itemTelaIdBase))
            .filter((e): e is TraceEvent => e !== null)
            .slice(-MAX_EVENTS_PER_ITEM)
        : [];

    const firstEvent = events[0] ?? null;
    const lastEvent = events.at(-1) ?? null;
    const itemTelaId = normalizarItemKey(i['itemTelaId']) || lastEvent?.itemTelaId || key;
    const firstEventTs = normalizarNumeroNullable(i['firstEventTs']) ?? firstEvent?.ts ?? fallbackTs;
    const lastEventTs = normalizarNumeroNullable(i['lastEventTs']) ?? lastEvent?.ts ?? firstEventTs ?? fallbackTs;
    const lastEventTipo = truncarTexto(i['lastEventTipo'], lastEvent?.tipo || '') || null;
    const resumoCurto = truncarTexto(i['resumoCurto'], lastEvent?.resumo || '') || null;

    return {
        itemKey: key,
        itemTelaId,
        status: normalizarStatus(i['status']),
        firstEventTs,
        lastEventTs,
        lastEventTipo,
        resumoCurto,
        events,
    };
}

function resolverItemAtualKey(estado: EstadoComTrilha, trilha: TrilhaExecucao): string | null {
    const candidatos = [
        estado?.itemAtualKey,
        estado?.itemAtualTelaId,
        trilha?.itemAtualKey,
    ];

    for (const candidato of candidatos) {
        const key = normalizarItemKey(candidato);
        if (key && trilha?.items?.[key]) return key;
    }
    return null;
}

function getEventosRecentes(item: TracedItem, limit: number): FormattedEvent[] {
    return (item?.events || []).slice(-Math.max(1, limit)).reverse().map(formatarEventoTrilha);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function normalizarTrilhaExecucao(trilha: unknown): TrilhaExecucao {
    const src: Record<string, unknown> = (trilha && typeof trilha === 'object') ? trilha as Record<string, unknown> : {};
    const items: Record<string, TracedItem> = {};
    let maxSeq = 0;

    for (const [itemKey, item] of Object.entries((src['items'] as Record<string, unknown>) || {})) {
        const normalizado = normalizarItemTracado(itemKey, item, normalizarNumeroNullable(src['startedAtTs']));
        if (!normalizado) continue;
        items[normalizado.itemKey] = normalizado;
        for (const evento of normalizado.events) {
            if (evento.seq > maxSeq) maxSeq = evento.seq;
        }
    }

    const lastEventSeq = Math.max(normalizarNumeroInteiro(src['lastEventSeq'], 0), maxSeq);
    const itemAtualKey = normalizarItemKey(src['itemAtualKey']);

    return {
        runId: normalizarItemKey(src['runId']),
        startedAtTs: normalizarNumeroNullable(src['startedAtTs']),
        lastEventSeq,
        itemAtualKey: itemAtualKey && items[itemAtualKey] ? itemAtualKey : null,
        items,
    };
}

export function resetarTrilhaExecucao(
    estado: EstadoComTrilha & { trilhaExecucao: unknown },
    { runId, now = Date.now() }: { runId?: string | null; now?: number } = {}
): TrilhaExecucao {
    const runIdNormalizado = normalizarItemKey(runId) || `run_${Math.floor(now)}`;
    const nova = normalizarTrilhaExecucao({
        runId: runIdNormalizado,
        startedAtTs: now,
        lastEventSeq: 0,
        itemAtualKey: null,
        items: {},
    });
    estado.trilhaExecucao = nova;
    return nova;
}

export function garantirItemTracado(
    estado: EstadoComTrilha & { trilhaExecucao: unknown },
    itemKey: string | null | undefined,
    itemTelaId: string | null = null,
    now: number = Date.now()
): TracedItem | null {
    const key = normalizarItemKey(itemKey);
    if (!key) return null;

    const trilha = normalizarTrilhaExecucao(estado.trilhaExecucao);
    const telaId = normalizarItemKey(itemTelaId) || key;
    const existente = trilha.items[key];
    trilha.startedAtTs = trilha.startedAtTs ?? now;
    trilha.items[key] = existente || {
        itemKey: key,
        itemTelaId: telaId,
        status: 'em_andamento',
        firstEventTs: now,
        lastEventTs: now,
        lastEventTipo: null,
        resumoCurto: null,
        events: [],
    };
    if (telaId) trilha.items[key].itemTelaId = telaId;
    trilha.itemAtualKey = key;
    estado.trilhaExecucao = trilha;
    return trilha.items[key];
}

export interface RegistrarEventoOptions {
    itemTelaId?: string | null;
    resumo?: string;
    payload?: unknown;
    status?: ItemStatus;
    now?: number;
    itemKey?: string | null;
}

export function registrarEventoItem(
    estado: EstadoComTrilha & { trilhaExecucao: unknown },
    itemKey: string | null | undefined,
    tipo: string,
    options: RegistrarEventoOptions = {}
): TraceEvent | null {
    const key = normalizarItemKey(itemKey);
    const tipoNormalizado = truncarTexto(tipo, '');
    if (!key || !tipoNormalizado) return null;

    const now = normalizarNumeroNullable(options.now) ?? Date.now();
    const item = garantirItemTracado(estado, key, options.itemTelaId ?? null, now);
    if (!item) return null;

    if (tipoNormalizado === 'item_aberto' && item.events.some((evento) => evento.tipo === 'item_aberto')) {
        return item.events.find((evento) => evento.tipo === 'item_aberto') ?? null;
    }

    const trilha = estado.trilhaExecucao as TrilhaExecucao;
    trilha.lastEventSeq += 1;
    trilha.itemAtualKey = key;

    const itemTelaId = normalizarItemKey(options.itemTelaId) || item.itemTelaId || key;
    const resumo = truncarTexto(options.resumo, EVENT_LABELS[tipoNormalizado] || tipoNormalizado);
    const evento: TraceEvent = {
        seq: trilha.lastEventSeq,
        tipo: tipoNormalizado,
        ts: now,
        itemKey: key,
        itemTelaId,
        resumo,
        payload: sanitizarPayload(options.payload ?? {}),
    };

    item.itemTelaId = itemTelaId;
    item.events = [...item.events, evento].slice(-MAX_EVENTS_PER_ITEM);
    item.firstEventTs = item.firstEventTs ?? now;
    item.lastEventTs = now;
    item.lastEventTipo = tipoNormalizado;
    item.resumoCurto = resumo;
    item.status = options.status ? normalizarStatus(options.status) : item.status;

    return evento;
}

export function registrarEventoItemAtual(
    estado: EstadoComTrilha & { trilhaExecucao: unknown },
    tipo: string,
    options: RegistrarEventoOptions = {}
): TraceEvent | null {
    const trilha = estado.trilhaExecucao as TrilhaExecucao | null;
    const itemKey = normalizarItemKey(options.itemKey)
        || normalizarItemKey(estado?.itemAtualKey)
        || normalizarItemKey(estado?.itemAtualTelaId)
        || normalizarItemKey(trilha?.itemAtualKey);
    if (!itemKey) return null;
    return registrarEventoItem(estado, itemKey, tipo, options);
}

export function obterTrilhaItem(estado: EstadoComTrilha, itemKey: string | null | undefined): TracedItem | null {
    const trilha = normalizarTrilhaExecucao(estado?.trilhaExecucao);
    const key = normalizarItemKey(itemKey);
    return key ? (trilha.items[key] ?? null) : null;
}

export function obterItemTrilhaAtual(estado: EstadoComTrilha): TracedItem | null {
    const trilha = normalizarTrilhaExecucao(estado?.trilhaExecucao);
    const itemAtualKey = resolverItemAtualKey(estado, trilha);
    if (itemAtualKey) return trilha.items[itemAtualKey] ?? null;
    return null;
}

export function formatarEventoTrilha(evento: Partial<TraceEvent> | null | undefined): FormattedEvent {
    const ts = normalizarNumeroNullable(evento?.ts);
    const horario = ts != null
        ? new Date(ts).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        })
        : '—';
    const titulo = EVENT_LABELS[evento?.tipo ?? ''] || truncarTexto(evento?.tipo, 'Evento');
    const resumo = truncarTexto(evento?.resumo, titulo);
    return {
        seq: evento?.seq ?? 0,
        tipo: evento?.tipo ?? '',
        ts: evento?.ts ?? null,
        itemKey: evento?.itemKey ?? '',
        itemTelaId: evento?.itemTelaId ?? '',
        payload: evento?.payload ?? null,
        horario,
        titulo,
        resumo,
        texto: `${horario} • ${resumo}`,
    };
}

export function obterResumoTrilhaUI(estado: EstadoComTrilha, { limit = 8 }: { limit?: number } = {}): ResumoTrilhaUI {
    const trilha = normalizarTrilhaExecucao(estado?.trilhaExecucao);
    const itemAtual = obterItemTrilhaAtual(estado);
    const ultimoProcessado = obterTrilhaItem(estado, estado?.progresso?.ultimoProcessado);
    const item = itemAtual || ultimoProcessado;

    if (!item) {
        return {
            empty: true,
            itemKey: null,
            itemTelaId: null,
            currentLabel: 'Sem eventos nesta rodada.',
            events: [],
            critical: false,
            status: null,
            lastEventTipo: null,
            cardClassName: 'km-card km-trace-card',
        };
    }

    const itemKey = item.itemKey;
    const currentLabel = `Item ${item.itemTelaId || itemKey}`;
    const critical = CRITICAL_EVENT_TYPES.has(item.lastEventTipo ?? '');
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
        cardClassName: critical ? 'km-card km-trace-card is-critical' : 'km-card km-trace-card',
        runId: trilha.runId,
    };
}

export function serializarTrilhaParaRelatorio(
    estado: EstadoComTrilha,
    { maxItems = 5, maxEventsPerItem = 12 }: { maxItems?: number; maxEventsPerItem?: number } = {}
): SerializacaoTrilha {
    const trilha = normalizarTrilhaExecucao(estado?.trilhaExecucao);
    const limiteItens = Math.max(1, maxItems);
    const limiteEventos = Math.max(1, maxEventsPerItem);
    const prioridades: string[] = [];

    const addPrioridade = (itemKey: string | null | undefined): void => {
        const key = normalizarItemKey(itemKey);
        if (!key || prioridades.includes(key) || !trilha.items[key]) return;
        prioridades.push(key);
    };

    addPrioridade(resolverItemAtualKey(estado, trilha));
    addPrioridade(estado?.progresso?.ultimoProcessado);

    const recentes = Object.values(trilha.items)
        .sort((a, b) => Number(b.lastEventTs ?? 0) - Number(a.lastEventTs ?? 0))
        .map((item) => item.itemKey);
    recentes.forEach(addPrioridade);

    const itensRecentes = prioridades.slice(0, limiteItens).map((itemKey) => {
        const item = trilha.items[itemKey];
        return {
            itemKey: item.itemKey,
            itemTelaId: item.itemTelaId,
            status: item.status,
            lastEventTipo: item.lastEventTipo,
            resumoCurto: item.resumoCurto,
            events: item.events.slice(-limiteEventos),
        };
    });

    return {
        runId: trilha.runId,
        startedAtTs: trilha.startedAtTs,
        itemAtualKey: resolverItemAtualKey(estado, trilha),
        ultimoProcessado: normalizarItemKey(estado?.progresso?.ultimoProcessado),
        itensRecentes,
    };
}
