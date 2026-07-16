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

function serializarValorLote(valor: unknown): unknown {
    if (valor == null || typeof valor !== 'object') return valor ?? null;
    if (Array.isArray(valor)) return valor.map(serializarValorLote);

    return Object.fromEntries(
        Object.entries(valor as Record<string, unknown>)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([chave, item]) => [chave, serializarValorLote(item)])
    );
}

function hashLote(texto: string): string {
    let hash = 2166136261;
    for (let i = 0; i < texto.length; i++) {
        hash ^= texto.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

export function obterAssinaturaLoteJson(estado: EstadoApp): string | null {
    if (!estado?.itemMapAtivo) return null;

    const entradas = Object.entries(estado.itemMap || {})
        .map(([id, valores]) => {
            const idNormalizado = normalizarItemKey(id);
            return idNormalizado ? [idNormalizado, serializarValorLote(valores)] as [string, unknown] : null;
        })
        .filter((entrada): entrada is [string, unknown] => entrada !== null)
        .sort(([a], [b]) => a.localeCompare(b));

    if (!entradas.length) return null;
    return `json:${entradas.length}:${hashLote(JSON.stringify(entradas))}`;
}

export function sincronizarSnapshotLoteJson(
    estado: EstadoApp,
    { reiniciar = false }: { reiniciar?: boolean } = {}
): boolean {
    const assinatura = obterAssinaturaLoteJson(estado);
    if (!assinatura) return false;

    type EstadoAny = Record<string, unknown>;
    const e = estado as unknown as EstadoAny;
    const progresso = (e['progresso'] || {}) as EstadoAny;
    const assinaturaAnterior = typeof progresso['loteJsonAssinatura'] === 'string'
        ? progresso['loteJsonAssinatura']
        : null;
    const total = getTotalPlanejadoJson(estado);
    const idsJson = new Set(Object.keys(estado.itemMap || {})
        .map(normalizarItemKey)
        .filter((id): id is string => id !== null));
    const deveReiniciar = reiniciar || (!!assinaturaAnterior && assinaturaAnterior !== assinatura);
    const concluidos = deveReiniciar
        ? []
        : [...obterConcluidosSet(estado)].filter((id) => idsJson.has(id));
    const ultimoAnterior = normalizarItemKey(progresso['ultimoProcessado']);
    const ultimoProcessado = deveReiniciar || !ultimoAnterior || !idsJson.has(ultimoAnterior)
        ? null
        : ultimoAnterior;
    const concluidosSalvos = Array.isArray(progresso['concluidosIds'])
        ? progresso['concluidosIds'].map((id) => String(id ?? '').trim()).filter(Boolean)
        : [];
    const restantes = Math.max(0, total - concluidos.length);
    const estimativa = (e['estimativa'] || {}) as EstadoAny;
    const mudou = deveReiniciar
        || assinaturaAnterior !== assinatura
        || Number(progresso['total'] || 0) !== total
        || Number(progresso['atual'] || 0) !== concluidos.length
        || JSON.stringify(concluidosSalvos) !== JSON.stringify(concluidos)
        || String(progresso['ultimoProcessado'] || '') !== String(ultimoProcessado || '')
        || Number(estimativa['totalPlanejado'] || 0) !== total
        || estimativa['fonteTotal'] !== 'json'
        || Number(estimativa['restantes'] || 0) !== restantes;

    e['progresso'] = {
        ...progresso,
        atual: concluidos.length,
        total,
        ultimoProcessado,
        concluidosIds: concluidos,
        loteJsonAssinatura: assinatura,
    };

    e['estimativa'] = {
        ...estimativa,
        totalPlanejado: total,
        fonteTotal: 'json',
        restantes,
        ...(deveReiniciar ? {
            itemAtualId: null,
            itemAtualInicioTs: null,
            primeiroItemId: null,
            primeiroItemDuracaoMs: null,
            duracaoTotalConcluidosMs: 0,
            duracaoAmostras: 0,
            tempoMedioReferenciaMs: null,
            etaRestanteMs: null,
            previsaoTerminoTs: null,
            ultimoItemConcluidoTs: null,
        } : {}),
    };

    return mudou;
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

function obterTotalConhecido(estado: EstadoApp): number {
    return Math.max(
        0,
        Number(estado?.progresso?.total || 0),
        Number(estado?.estimativa?.totalPlanejado || 0),
    );
}

function ehPaginaDetalheItem(): boolean {
    if (typeof window === 'undefined') return false;

    try {
        const pathname = new URL(window.location.href).pathname;
        return /\/(?:SIN_Item_Resultante|SIN_Item|ITEM_Edita)\.aspx$/i.test(pathname);
    } catch {
        return false;
    }
}

export function calcularTotaisDinamicos(
    estado: EstadoApp,
    itensInfo: { elegiveis: Element[]; totalVisiveis?: number } = { elegiveis: [] },
    concluidosSet: Set<string> = obterConcluidosSet(estado)
): TotaisDinamicos {
    const totalAnterior = obterTotalConhecido(estado);
    const resumoServidor = PaginaVerificador.obterResumoPendentesServidor();
    const pendentesFallback = Math.max(0, Number(itensInfo?.elegiveis?.length || 0));
    const possuiItensVisiveis = Number(itensInfo?.totalVisiveis || 0) > 0 || pendentesFallback > 0;
    const detalheSemLista = ehPaginaDetalheItem()
        && !possuiItensVisiveis
        && !document.querySelector('#DIVResultado');

    if (estado?.itemMapAtivo) {
        const totalJson = getTotalPlanejadoJson(estado);
        const concluidosFallback = contarConcluidosEfetivos(estado, concluidosSet);
        const totalPlanejado = totalJson > 0
            ? totalJson
            : detalheSemLista && totalAnterior > 0
                ? Math.max(totalAnterior, concluidosFallback)
                : concluidosFallback;
        if (totalJson > 0 && Number.isFinite(resumoServidor?.total)) {
            const pendentesServidor = Math.min(totalJson, Math.max(0, Number(resumoServidor?.total)));
            const concluidosEfetivos = Math.max(0, totalJson - pendentesServidor);
            return { totalPlanejado: totalJson, concluidosEfetivos, pendentesServidor, fonteTotal: 'json' };
        }
        const pendentesServidor = Math.max(0, totalPlanejado - concluidosFallback);
        return { totalPlanejado, concluidosEfetivos: concluidosFallback, pendentesServidor, fonteTotal: 'json' };
    }

    const concluidosEfetivos = contarConcluidosEfetivos(estado, concluidosSet);
    const semInformacaoDeLista = !Number.isFinite(resumoServidor?.total) && !possuiItensVisiveis;
    const preservarSnapshot = (semInformacaoDeLista || detalheSemLista) && totalAnterior > 0;
    const totalPlanejado = preservarSnapshot
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
    e['progresso'] = e['progresso'] || { atual: 0, total: 0, ultimoProcessado: null, concluidosIds: [], loteJsonAssinatura: null };
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
        sincronizarSnapshotLoteJson(e);
        const concluidosSet = obterConcluidosSet(e);
        const totais = calcularTotaisDinamicos(e, itensInfo, concluidosSet);
        aplicarTotaisDinamicosNoEstado(e, totais, Date.now());
    });
}
