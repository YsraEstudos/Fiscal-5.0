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
    fiscalHints: true,
});

export const TEMPO_DESATIVACAO_CHECKS_PADRAO_MINUTOS = 10;
export const TEMPO_DESATIVACAO_CHECKS_MIN_MINUTOS = 1;
export const TEMPO_DESATIVACAO_CHECKS_MAX_MINUTOS = 99;

function asObject(valor: unknown): RawObject {
    return valor && typeof valor === 'object' ? valor as RawObject : {};
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

export function normalizarTempoDesativacaoChecks(valor: unknown): number {
    if (valor == null || valor === '') return TEMPO_DESATIVACAO_CHECKS_PADRAO_MINUTOS;
    const num = Number(valor);
    if (!Number.isFinite(num)) return TEMPO_DESATIVACAO_CHECKS_PADRAO_MINUTOS;
    return Math.max(
        TEMPO_DESATIVACAO_CHECKS_MIN_MINUTOS,
        Math.min(TEMPO_DESATIVACAO_CHECKS_MAX_MINUTOS, Math.floor(num)),
    );
}

export function normalizarPrazoReativacao(valor: unknown): number | null {
    if (valor == null || valor === '') return null;
    const num = Number(valor);
    return Number.isFinite(num) && num > 0 ? Math.floor(num) : null;
}

export function normalizarIntervaloDelay(
    minimo: unknown,
    maximo: unknown,
    legado: unknown = 1200,
): { minimo: number; maximo: number } {
    const fallback = normalizarNumeroInteiro(legado, 1200);
    const temMinimo = minimo !== undefined && minimo !== null && minimo !== '';
    const temMaximo = maximo !== undefined && maximo !== null && maximo !== '';
    const valorMinimo = normalizarNumeroInteiro(temMinimo ? minimo : fallback, fallback);
    const valorMaximo = normalizarNumeroInteiro(temMaximo ? maximo : fallback, fallback);

    return valorMinimo <= valorMaximo
        ? { minimo: valorMinimo, maximo: valorMaximo }
        : { minimo: valorMaximo, maximo: valorMinimo };
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
        loteJsonAssinatura: src['loteJsonAssinatura'] ? String(src['loteJsonAssinatura']).trim() : null,
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
