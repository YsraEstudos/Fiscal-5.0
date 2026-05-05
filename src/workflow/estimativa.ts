/**
 * Helper de estimativa do lote.
 * Mantém média acumulada dos itens concluídos e expõe resumo pronto p/ UI.
 */

import { normalizarEstimativa } from '../core/estado-manager.ts';
import type { EstimativaEstado, UltimoErro } from '../core/estado-manager.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface EstadoComEstimativa {
    estimativa: EstimativaEstado | null | undefined;
    progresso?: { atual?: number; total?: number; ultimoProcessado?: string | null };
    estatisticas?: { ultimoErro?: UltimoErro | null };
    pausado?: boolean;
    itemAtualKey?: string | null;
    itemAtualTelaId?: string | null;
}

export interface ConclusaoItemResult {
    duracaoMs: number | null;
    restantes: number;
    duracaoAmostras: number;
    tempoMedioReferenciaMs: number | null;
}

export interface ResumoEstimativaUI {
    itemAtualId: string | null;
    totalPlanejado: number;
    concluidos: number;
    restantes: number;
    fonteTotal: string;
    itemAtualDecorridoMs: number | null;
    primeiroItemDuracaoMs: number | null;
    duracaoTotalConcluidosMs: number | null;
    duracaoAmostras: number;
    tempoMedioReferenciaMs: number | null;
    etaRestanteMs: number | null;
    previsaoTerminoTs: number | null;
    pausadoPorReincidencia: boolean;
    mensagemPausa: string | null;
    resumo: string;
    tempoBaseTexto: string;
    etaRestanteTexto: string;
    previsaoTexto: string;
    primeiroItemTexto: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function normalizarItemId(itemId: unknown): string | null {
    const valor = String(itemId ?? '').trim();
    return valor || null;
}

function garantirEstimativa(estado: EstadoComEstimativa): EstimativaEstado {
    estado.estimativa = normalizarEstimativa(estado.estimativa);
    return estado.estimativa;
}

function inteiroPositivo(valor: unknown): number {
    const num = Number(valor);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.floor(num));
}

function recalcularEta(estimativa: EstimativaEstado, concluidos: number, now: number): void {
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function resetarRodada(
    estado: EstadoComEstimativa,
    { totalPlanejado = 0, fonteTotal = null }: { totalPlanejado?: number; fonteTotal?: string | null } = {}
): EstimativaEstado {
    const total = inteiroPositivo(totalPlanejado);
    estado.estimativa = normalizarEstimativa({
        totalPlanejado: total,
        fonteTotal,
        restantes: total,
    });
    return estado.estimativa;
}

export function garantirTotalPlanejado(
    estado: EstadoComEstimativa,
    totalPlanejado: number,
    fonteTotal: string | null,
    now: number = Date.now()
): boolean {
    const estimativa = garantirEstimativa(estado);
    const total = inteiroPositivo(totalPlanejado);
    if (!total || estimativa.totalPlanejado > 0) return false;

    estimativa.totalPlanejado = total;
    estimativa.fonteTotal = fonteTotal === 'json' ? 'json' : 'fila';
    recalcularEta(estimativa, inteiroPositivo(estado?.progresso?.atual), now);
    return true;
}

export function registrarInicioItem(
    estado: EstadoComEstimativa,
    itemId: string | null | undefined,
    now: number = Date.now()
): boolean {
    const estimativa = garantirEstimativa(estado);
    const id = normalizarItemId(itemId);
    if (!id) return false;
    if (estimativa.itemAtualId === id && estimativa.itemAtualInicioTs != null) return false;

    estimativa.itemAtualId = id;
    estimativa.itemAtualInicioTs = now;
    return true;
}

export function registrarConclusaoItem(
    estado: EstadoComEstimativa,
    itemId: string | null | undefined,
    now: number = Date.now()
): ConclusaoItemResult {
    const estimativa = garantirEstimativa(estado);
    const idInformado = normalizarItemId(itemId);
    const itemAtualAberto = normalizarItemId(estimativa.itemAtualId);
    const id = itemAtualAberto || idInformado;
    const concluidos = inteiroPositivo(estado?.progresso?.atual);
    const podeCalcularDuracao = estimativa.itemAtualInicioTs != null && !!id;
    const duracaoMs = podeCalcularDuracao
        ? Math.max(0, now - (estimativa.itemAtualInicioTs as number))
        : null;

    if (estimativa.primeiroItemDuracaoMs == null && duracaoMs != null) {
        const base = Math.max(1, duracaoMs);
        estimativa.primeiroItemId = id;
        estimativa.primeiroItemDuracaoMs = base;
    }

    if (duracaoMs != null) {
        estimativa.duracaoTotalConcluidosMs = Math.max(0, Number(estimativa.duracaoTotalConcluidosMs || 0) + duracaoMs);
        estimativa.duracaoAmostras = inteiroPositivo(estimativa.duracaoAmostras) + 1;
        estimativa.tempoMedioReferenciaMs = estimativa.duracaoAmostras > 0
            ? estimativa.duracaoTotalConcluidosMs / estimativa.duracaoAmostras
            : null;
    }

    estimativa.ultimoItemConcluidoTs = now;
    estimativa.itemAtualId = null;
    estimativa.itemAtualInicioTs = null;
    recalcularEta(estimativa, concluidos, now);

    return {
        duracaoMs,
        restantes: estimativa.restantes,
        duracaoAmostras: estimativa.duracaoAmostras,
        tempoMedioReferenciaMs: estimativa.tempoMedioReferenciaMs,
    };
}

export function formatarDuracao(ms: number | null | undefined): string {
    if (ms == null || !Number.isFinite(Number(ms))) return '—';
    const totalSegundos = Math.max(0, Math.round(Number(ms) / 1000));
    const horas = Math.floor(totalSegundos / 3600);
    const minutos = Math.floor((totalSegundos % 3600) / 60);
    const segundos = totalSegundos % 60;

    if (horas > 0) return `${horas}h ${String(minutos).padStart(2, '0')}m`;
    if (minutos > 0) return `${minutos}m ${String(segundos).padStart(2, '0')}s`;
    return `${segundos}s`;
}

export function formatarHorario(ts: number | null | undefined): string {
    if (ts == null || !Number.isFinite(Number(ts))) return '—';
    return new Date(Number(ts)).toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function obterResumoUI(estado: EstadoComEstimativa, now: number = Date.now()): ResumoEstimativaUI {
    const estimativa = normalizarEstimativa(estado?.estimativa);
    const totalPlanejado = inteiroPositivo(estimativa.totalPlanejado || estado?.progresso?.total);
    const concluidos = inteiroPositivo(estado?.progresso?.atual);
    const restantes = Math.max(0, totalPlanejado - concluidos);
    const ultimoProcessado = normalizarItemId(estado?.progresso?.ultimoProcessado);
    const itemTela = normalizarItemId(estado?.itemAtualTelaId);
    const itemFila = normalizarItemId(estado?.itemAtualKey);
    const itemAtualId = estimativa.itemAtualId
        || (itemTela && itemTela !== ultimoProcessado ? itemTela : null)
        || (itemFila && itemFila !== ultimoProcessado ? itemFila : null);
    const itemAtualDecorridoMs = estimativa.itemAtualInicioTs != null
        ? Math.max(0, now - estimativa.itemAtualInicioTs)
        : null;
    const erroAtual = (estado?.estatisticas?.ultimoErro || null) as UltimoErro | null;
    const pausadoPorReincidencia = !!(estado?.pausado && erroAtual?.tipo === 'reincidencia_etapa');

    const fonteTotal = estimativa.fonteTotal === 'json' ? 'JSON' : estimativa.fonteTotal === 'fila' ? 'Fila' : '—';
    const resumo = pausadoPorReincidencia
        ? 'Parado por reincidência na etapa atual.'
        : totalPlanejado > 0
            ? `Item ${itemAtualId || '—'} • ${concluidos}/${totalPlanejado} concluídos • base ${fonteTotal}`
            : 'Aguardando início do lote.';

    const tempoBaseTexto = estimativa.tempoMedioReferenciaMs != null
        ? formatarDuracao(estimativa.tempoMedioReferenciaMs)
        : itemAtualDecorridoMs != null
            ? `Medindo 1º item... ${formatarDuracao(itemAtualDecorridoMs)}`
            : 'Medindo 1º item...';

    const etaRestanteTexto = estimativa.tempoMedioReferenciaMs != null
        ? formatarDuracao(estimativa.tempoMedioReferenciaMs * restantes)
        : 'Aguardando base';

    const previsaoTexto = estimativa.tempoMedioReferenciaMs != null
        ? formatarHorario(now + (estimativa.tempoMedioReferenciaMs * restantes))
        : '—';

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
        etaRestanteMs: estimativa.tempoMedioReferenciaMs != null
            ? estimativa.tempoMedioReferenciaMs * restantes
            : null,
        previsaoTerminoTs: estimativa.tempoMedioReferenciaMs != null
            ? now + (estimativa.tempoMedioReferenciaMs * restantes)
            : null,
        pausadoPorReincidencia,
        mensagemPausa: pausadoPorReincidencia ? ((erroAtual as UltimoErro & { mensagem?: string })?.mensagem || 'Reincidência detectada') : null,
        resumo,
        tempoBaseTexto,
        etaRestanteTexto,
        previsaoTexto,
        primeiroItemTexto: estimativa.primeiroItemDuracaoMs != null
            ? formatarDuracao(estimativa.primeiroItemDuracaoMs)
            : '—',
    };
}
