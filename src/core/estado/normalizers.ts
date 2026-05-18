import { REPORTING_DEFAULTS, type ReportingDefaults } from '../../config/constants.ts';
import type { EstimativaEstado, PainelPosicao, PainelSecoes, ProgressoEstado } from './types.ts';

type RawObject = Record<string, unknown>;

export const PAINEL_SECOES_PADRAO: Readonly<PainelSecoes> = Object.freeze({
    resumo: true,
    trilha: true,
    workflow: true,
    json: true,
    controle: true,
    opcoes: false,
    perfil: false,
    logs: false,
    progresso: true,
});

function asObject(valor: unknown): RawObject {
    return valor && typeof valor === 'object' ? valor as RawObject : {};
}

export function normalizarReportingConfig(config: unknown): ReportingDefaults {
    const src = asObject(config);
    const url = String(src['serviceUrl'] ?? REPORTING_DEFAULTS.serviceUrl).trim() || REPORTING_DEFAULTS.serviceUrl;
    const transportRaw = String(src['transport'] ?? REPORTING_DEFAULTS.transport).trim().toLowerCase();
    const transport = ['auto', 'fetch', 'gm_xhr'].includes(transportRaw) ? transportRaw : REPORTING_DEFAULTS.transport;
    const apiToken = src['apiToken'] != null ? String(src['apiToken']).trim() : '';
    const maxFileSizeMb = Number.isFinite(Number(src['maxFileSizeMb']))
        ? Math.max(1, Math.min(200, Number(src['maxFileSizeMb'])))
        : REPORTING_DEFAULTS.maxFileSizeMb;
    const maxFilesPerItem = Number.isFinite(Number(src['maxFilesPerItem']))
        ? Math.max(1, Math.min(200, Number(src['maxFilesPerItem'])))
        : REPORTING_DEFAULTS.maxFilesPerItem;
    const ocrEngineRaw = String(src['ocrEngine'] ?? REPORTING_DEFAULTS.ocrEngine).trim().toLowerCase();
    const ocrEngine = ['tesseract', 'paddleocr', 'none'].includes(ocrEngineRaw) ? ocrEngineRaw : REPORTING_DEFAULTS.ocrEngine;
    return {
        enabledReport: src['enabledReport'] !== undefined ? !!src['enabledReport'] : REPORTING_DEFAULTS.enabledReport,
        enabledMedia: src['enabledMedia'] !== undefined ? !!src['enabledMedia'] : REPORTING_DEFAULTS.enabledMedia,
        clickMediaTabBeforeCollect: src['clickMediaTabBeforeCollect'] !== undefined ? !!src['clickMediaTabBeforeCollect'] : REPORTING_DEFAULTS.clickMediaTabBeforeCollect,
        enabledAcompanhamento: src['enabledAcompanhamento'] !== undefined ? !!src['enabledAcompanhamento'] : REPORTING_DEFAULTS.enabledAcompanhamento,
        blockOnReportError: src['blockOnReportError'] !== undefined ? !!src['blockOnReportError'] : REPORTING_DEFAULTS.blockOnReportError,
        serviceUrl: url,
        apiToken: apiToken || REPORTING_DEFAULTS.apiToken,
        transport,
        maxFileSizeMb,
        maxFilesPerItem,
        sessionRunId: src['sessionRunId'] ? String(src['sessionRunId']) : null,
        ocrEnabled: src['ocrEnabled'] !== undefined ? !!src['ocrEnabled'] : REPORTING_DEFAULTS.ocrEnabled,
        ocrEngine,
    };
}

export function normalizarPainelPosicao(posicao: unknown): PainelPosicao | null {
    if (!posicao || typeof posicao !== 'object') return null;
    const pos = posicao as RawObject;
    const top = typeof pos['top'] === 'string' ? pos['top'].trim() : '';
    if (!top) return null;
    return { top };
}

export function normalizarPainelSecoes(secoes: unknown): PainelSecoes {
    const src = asObject(secoes);
    const out: Partial<PainelSecoes> = {};
    for (const [chave, padrao] of Object.entries(PAINEL_SECOES_PADRAO)) {
        (out as Record<string, boolean>)[chave] = src[chave] !== undefined ? !!src[chave] : !!padrao;
    }
    return out as PainelSecoes;
}

export function normalizarPainelScrollTop(valor: unknown): number {
    const num = Number(valor);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.floor(num));
}

export function normalizarLogAreaHeight(valor: unknown): number {
    const num = Number(valor);
    if (!Number.isFinite(num)) return 110;
    return Math.max(80, Math.min(520, Math.floor(num)));
}

export function normalizarNumeroInteiro(valor: unknown, fallback = 0): number {
    const num = Number(valor);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(0, Math.floor(num));
}

function normalizarNumeroNullable(valor: unknown): number | null {
    if (valor == null || valor === '') return null;
    const num = Number(valor);
    return Number.isFinite(num) ? Math.max(0, num) : null;
}

function normalizarConcluidosIds(ids: unknown): string[] {
    if (!Array.isArray(ids)) return [];
    return [...new Set(
        ids
            .map((id) => String(id ?? '').trim())
            .filter(Boolean),
    )];
}

export function normalizarProgresso(progresso: unknown): ProgressoEstado {
    const src = asObject(progresso);
    return {
        atual: normalizarNumeroInteiro(src['atual'], 0),
        total: normalizarNumeroInteiro(src['total'], 0),
        ultimoProcessado: src['ultimoProcessado'] ? String(src['ultimoProcessado']).trim() : null,
        concluidosIds: normalizarConcluidosIds(src['concluidosIds']),
    };
}

export function normalizarEstimativa(estimativa: unknown): EstimativaEstado {
    const src = asObject(estimativa);
    const totalPlanejado = normalizarNumeroInteiro(src['totalPlanejado'], 0);
    const fonteTotal = src['fonteTotal'] === 'json' || src['fonteTotal'] === 'fila' ? src['fonteTotal'] : null;
    const itemAtualId = src['itemAtualId'] ? String(src['itemAtualId']).trim() : null;
    const itemAtualInicioTs = normalizarNumeroNullable(src['itemAtualInicioTs']);
    const primeiroItemId = src['primeiroItemId'] ? String(src['primeiroItemId']).trim() : null;
    const primeiroItemDuracaoMs = normalizarNumeroNullable(src['primeiroItemDuracaoMs']);
    const duracaoTotalConcluidosMs = normalizarNumeroNullable(src['duracaoTotalConcluidosMs']) ?? 0;
    const duracaoAmostras = normalizarNumeroInteiro(src['duracaoAmostras'], 0);
    const tempoMedioReferenciaMs = normalizarNumeroNullable(src['tempoMedioReferenciaMs']);
    const ultimoItemConcluidoTs = normalizarNumeroNullable(src['ultimoItemConcluidoTs']);
    const restantes = normalizarNumeroInteiro(src['restantes'], totalPlanejado);
    const etaRestanteMs = normalizarNumeroNullable(src['etaRestanteMs']);
    const previsaoTerminoTs = normalizarNumeroNullable(src['previsaoTerminoTs']);

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
        ultimoItemConcluidoTs,
    };
}
