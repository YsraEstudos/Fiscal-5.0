/**
 * Coleta de acompanhamento (Historico.aspx).
 * Extraído do monólito — RelatorioItemManager.coletarAcompanhamento (~2549–2988).
 */

import { absolutizarUrl } from '../utils/misc.ts';
import { normalizarTextoSemAcento } from '../utils/text.ts';
import { buscarElementoDeep } from '../utils/selectors.ts';
import { getReportingConfig } from './session.ts';
import {
    getCacheItem,
    updateItemReportingState,
    fetchHtml,
} from './metadata.ts';
import { extrairUrlOpenGenerica } from './parsers/midia-parser.ts';
import { parseHistorico } from './parsers/historico-parser.ts';
import type { EstadoApp } from '../core/estado-manager.ts';

// ---------------------------------------------------------------------------
export interface NcmMentions {
    found: boolean;
    keywordMentions: number;
    formattedMatches: number;
    unformattedMatchesWithContext: number;
    codes: string[];
    evidences: string[];
}

export interface AcompanhamentoSummary {
    status: string;
    totalEventos: number;
    totalTransicoes: number;
    fiscalTransitionsCount: number;
    criticalFiscalRework: boolean;
    stageTransitions: any[]; // refine object later
    importantSignals: any[]; // refine object later
    ncmMentions: NcmMentions;
    diagnostic?: string | null;
}

export interface ColetaAcompanhamentoResult {
    ok: boolean;
    skipped?: boolean;
    summary: AcompanhamentoSummary;
    timeline?: any[];
}

const EMPTY_NCM: NcmMentions = { found: false, keywordMentions: 0, formattedMatches: 0, unformattedMatchesWithContext: 0, codes: [], evidences: [] };

function buildSkipSummary(status: string, extra: Partial<AcompanhamentoSummary> = {}): AcompanhamentoSummary {
    return {
        status,
        totalEventos: 0,
        totalTransicoes: 0,
        fiscalTransitionsCount: 0,
        criticalFiscalRework: false,
        stageTransitions: [],
        importantSignals: [],
        ncmMentions: { ...EMPTY_NCM },
        ...extra,
    };
}

// ---------------------------------------------------------------------------
function encontrarLinkAcompanhamento(): Element | null {
    const direto = buscarElementoDeep('#hButAcompanhamentoSIN, #hlkObs');
    if (direto) return direto;
    const links = [...document.querySelectorAll('a')];
    return links.find((a) => normalizarTextoSemAcento(a.textContent || '').includes('acompanhamento')) || null;
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------
export async function coletarAcompanhamento(estado: EstadoApp, itemKey: string): Promise<ColetaAcompanhamentoResult> {
    const reporting = getReportingConfig(estado);
    if (!reporting.enabledAcompanhamento) {
        const summary = buildSkipSummary('SKIPPED_DISABLED');
        updateItemReportingState(itemKey, { acompanhamentoDone: true, acompanhamentoSummary: summary, acompanhamentoSkipped: true });
        return { ok: true, skipped: true, summary };
    }

    const link = encontrarLinkAcompanhamento();
    let acompanhamentoUrl: string | null = null;

    if (link) {
        const href = link.getAttribute('href') || '';
        acompanhamentoUrl = extrairUrlOpenGenerica(href, ['OpenWindowsWHR', 'OpenWindowsWHRNS', 'OpenNewTab']);
    }

    if (!acompanhamentoUrl) {
        const params = new URLSearchParams(window.location.search);
        const idItem = itemKey || params.get('Id') || params.get('IdItem');
        if (idItem) {
            acompanhamentoUrl = absolutizarUrl(`Historico.aspx?source=SIN&SomenteLeitura=1&Id=${idItem}`);
        }
    }

    if (!acompanhamentoUrl) {
        const summary = buildSkipSummary('SKIPPED_LINK_NOT_FOUND');
        updateItemReportingState(itemKey, { acompanhamentoDone: true, acompanhamentoSummary: summary });
        return { ok: true, skipped: true, summary };
    }

    let html = '';
    try {
        html = await fetchHtml(acompanhamentoUrl);
    } catch (err) {
        const summary = buildSkipSummary('SKIPPED_PARSING_FAILED', {
            diagnostic: `Falha ao buscar Historico.aspx: ${(err as Error)?.message || err}`,
        });
        updateItemReportingState(itemKey, { acompanhamentoDone: true, acompanhamentoSummary: summary });
        return { ok: true, skipped: true, summary };
    }

    let parsed: any = null;
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        parsed = parseHistorico(doc);
    } catch (err) {
        const summary = buildSkipSummary('SKIPPED_PARSING_FAILED', {
            diagnostic: `Falha ao interpretar Historico.aspx: ${(err as Error)?.message || err}`,
        });
        updateItemReportingState(itemKey, { acompanhamentoDone: true, acompanhamentoSummary: summary });
        return { ok: true, skipped: true, summary };
    }

    if ((parsed?.timeline || []).length === 0) {
        const summary = buildSkipSummary('SKIPPED_EMPTY_TIMELINE');
        updateItemReportingState(itemKey, { acompanhamentoDone: true, acompanhamentoSummary: summary });
        return { ok: true, skipped: true, summary };
    }

    const cache = getCacheItem(itemKey) as Record<string, any> | undefined;
    if (cache) cache.acompanhamento = parsed;

    updateItemReportingState(itemKey, {
        acompanhamentoDone: true,
        acompanhamentoSummary: { status: 'OK', ...parsed.summary },
        acompanhamentoCollectedAt: new Date().toISOString(),
    });

    return { ok: true, summary: parsed.summary, timeline: parsed.timeline };
}
