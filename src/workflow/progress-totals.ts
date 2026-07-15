import * as EstadoManager from '../core/estado-manager.ts';
import type { EstadoApp } from '../core/estado-manager.ts';
import * as PaginaVerificador from './pagina-verificador.ts';
import type { TotaisDinamicos } from './types.ts';

export function normalizarItemKey(itemKey: unknown): string | null {
    const key = String(itemKey ?? '').trim();
    return key || null;
}

export function getTotalPlanejadoJson(estado: EstadoApp): number {
    if (!estado?.itemMapAtivo) return 0;
    return new Set(
        Object.keys(estado.itemMap || {})
            .map(normalizarItemKey)
            .filter((k): k is string => k !== null)
    ).size;
}

export function obterConcluidosSet(estado: EstadoApp): Set<string> {
    const prog = estado?.progresso as unknown as Record<string, unknown>;
    const raw = Array.isArray(prog?.['concluidosIds']) ? prog['concluidosIds'] as unknown[] : [];
    return new Set(raw.map(normalizarItemKey).filter((k): k is string => k !== null));
}

export function contarConcluidosEfetivos(
    estado: EstadoApp,
    concluidosSet: Set<string> = obterConcluidosSet(estado)
): number {
    if (!estado?.itemMapAtivo) return concluidosSet.size;
    const idsJson = new Set(Object.keys(estado.itemMap || {}).map(normalizarItemKey).filter((k): k is string => k !== null));
    let count = 0;
    for (const key of concluidosSet) {
        if (idsJson.has(key)) count++;
    }
    return count;
}

export function calcularTotaisDinamicos(
    estado: EstadoApp,
    itensInfo: { elegiveis: Element[]; totalVisiveis?: number } = { elegiveis: [] },
    concluidosSet: Set<string> = obterConcluidosSet(estado)
): TotaisDinamicos {
    if (estado?.itemMapAtivo) {
        const totalJson = getTotalPlanejadoJson(estado);
        const concluidosFallback = contarConcluidosEfetivos(estado, concluidosSet);
        const totalPlanejado = totalJson > 0 ? totalJson : concluidosFallback;
        const resumoServidor = PaginaVerificador.obterResumoPendentesServidor();
        if (totalJson > 0 && Number.isFinite(resumoServidor?.total)) {
            const pendentesServidor = Math.min(totalJson, Math.max(0, Number(resumoServidor?.total)));
            const concluidosEfetivos = Math.max(0, totalJson - pendentesServidor);
            return { totalPlanejado: totalJson, concluidosEfetivos, pendentesServidor, fonteTotal: 'json' };
        }
        const pendentesServidor = Math.max(0, totalPlanejado - concluidosFallback);
        return { totalPlanejado, concluidosEfetivos: concluidosFallback, pendentesServidor, fonteTotal: 'json' };
    }

    const concluidosEfetivos = contarConcluidosEfetivos(estado, concluidosSet);
    const resumoServidor = PaginaVerificador.obterResumoPendentesServidor();
    const pendentesFallback = Math.max(0, Number(itensInfo?.elegiveis?.length || 0));
    const possuiItensVisiveis = Number(itensInfo?.totalVisiveis || 0) > 0 || pendentesFallback > 0;
    const totalAnterior = Math.max(
        0,
        Number(estado?.progresso?.total || 0),
        Number(estado?.estimativa?.totalPlanejado || 0)
    );
    const semInformacaoDeLista = !Number.isFinite(resumoServidor?.total) && !possuiItensVisiveis;
    const totalPlanejado = semInformacaoDeLista && totalAnterior > 0
        ? Math.max(totalAnterior, concluidosEfetivos)
        : concluidosEfetivos + (Number.isFinite(resumoServidor?.total)
            ? Math.max(0, resumoServidor!.total)
            : pendentesFallback);
    const pendentesServidor = Math.max(0, totalPlanejado - concluidosEfetivos);
    return { totalPlanejado, concluidosEfetivos, pendentesServidor, fonteTotal: 'fila' };
}

export function aplicarTotaisDinamicosNoEstado(
    estado: EstadoApp,
    totais: TotaisDinamicos,
    now: number = Date.now()
): void {
    type EstadoAny = Record<string, unknown>;
    const e = estado as unknown as EstadoAny;
    e['progresso'] = e['progresso'] || { atual: 0, total: 0, ultimoProcessado: null, concluidosIds: [] };
    (e['progresso'] as EstadoAny)['atual'] = totais.concluidosEfetivos;
    (e['progresso'] as EstadoAny)['total'] = totais.totalPlanejado;

    e['estatisticas'] = e['estatisticas'] || { processados: 0, erros: 0, ultimoErro: null };
    (e['estatisticas'] as EstadoAny)['processados'] = totais.concluidosEfetivos;

    e['estimativa'] = e['estimativa'] || {};
    const est = e['estimativa'] as EstadoAny;
    est['totalPlanejado'] = totais.totalPlanejado;
    est['fonteTotal'] = totais.fonteTotal;
    est['restantes'] = Math.max(0, totais.totalPlanejado - totais.concluidosEfetivos);
    const tempoMedio = Number(est['tempoMedioReferenciaMs']);
    if (Number.isFinite(tempoMedio) && tempoMedio != null) {
        est['etaRestanteMs'] = tempoMedio * Number(est['restantes']);
        est['previsaoTerminoTs'] = now + Number(est['etaRestanteMs']);
    } else {
        est['etaRestanteMs'] = null;
        est['previsaoTerminoTs'] = null;
    }
}

export function atualizarTotaisLote(
    estado: EstadoApp,
    itensInfo: { elegiveis: Element[] } = { elegiveis: [] }
): void {
    EstadoManager.update((e: EstadoApp) => {
        const concluidosSet = obterConcluidosSet(e);
        const totais = calcularTotaisDinamicos(e, itensInfo, concluidosSet);
        aplicarTotaisDinamicosNoEstado(e, totais, Date.now());
    });
}
