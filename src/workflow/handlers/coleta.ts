/**
 * Handlers de coleta: coletarMidia, coletarAcompanhamento.
 * Extraído do monólito — WorkflowExecutor.handlers (linhas 3651–3787).
 */

import { REPORTING_ERROR_CODES } from '../../config/constants.ts';
import { log } from '../../core/log-manager.ts';
import * as CooldownManager from '../../core/cooldown-manager.ts';
import * as Interacao from '../../interaction/interacao.ts';
import { elementoVisivel } from '../../utils/dom-helpers.ts';
import { buscarElementoDeep } from '../../utils/selectors.ts';
import { normalizarTextoSemAcento } from '../../utils/text.ts';
import { getReportingConfig } from '../../reporting/session.ts';
import { getItemReportingState, updateItemReportingState } from '../../reporting/metadata.ts';
import { coletarMidia as _coletarMidia } from '../../reporting/coletor-midia.ts';
import { coletarAcompanhamento as _coletarAcompanhamento } from '../../reporting/coletor-acompanhamento.ts';
import * as EstadoManager from '../../core/estado-manager.ts';
import type { EstadoApp } from '../../core/estado-manager.ts';
import * as ItemTrace from '../item-trace.ts';

// ---------------------------------------------------------------------------
// Tipos auxiliares
// ---------------------------------------------------------------------------

interface AcaoContext {
    getAcao: (id: string, estado: EstadoApp) => { ativo: boolean; seletor: string;[key: string]: unknown };
}

interface MidiaSummary {
    status?: string | null;
    total?: number;
    imagens?: number;
    pdfs?: number;
    unsupported?: number;
    diagnostic?: string;
    sourceUrl?: string;
    itens?: unknown[];
}

interface ColetarMidiaResult {
    summary?: MidiaSummary;
}

interface AcompanhamentoSummary {
    status?: string | null;
    totalEventos?: number;
    totalTransicoes?: number;
    fiscalTransitionsCount?: number;
    criticalFiscalRework?: boolean;
    stageTransitions?: unknown[];
    importantSignals?: unknown[];
}

interface ColetarAcompanhamentoResult {
    summary?: AcompanhamentoSummary;
}

// ---------------------------------------------------------------------------

function registrarEventoMidia(itemKey: string | null | undefined, summary: MidiaSummary | null | undefined, itemTelaId: string | null = null): void {
    if (!itemKey || !summary) return;
    EstadoManager.update((e: EstadoApp) => {
        const payloadTotal = Number(summary.total || 0);
        const payloadStatus = summary.status || 'OK';

        ItemTrace.registrarEventoItem(e, itemKey, 'midia_coletada', {
            itemTelaId: itemTelaId || (e as unknown as Record<string, unknown>)['itemAtualTelaId'] as string || itemKey,
            resumo: `Coleta de mídia: ${payloadStatus} (${payloadTotal} arquivos)`,
            payload: {
                status: payloadStatus,
                total: payloadTotal,
                imagens: Number(summary.imagens || 0),
                pdfs: Number(summary.pdfs || 0),
                unsupported: Number(summary.unsupported || 0),
            },
            status: 'em_andamento',
            now: Date.now(),
        });
    });
}

function registrarEventoAcompanhamento(itemKey: string | null | undefined, summary: AcompanhamentoSummary | null | undefined, itemTelaId: string | null = null): void {
    if (!itemKey || !summary) return;
    EstadoManager.update((e: EstadoApp) => {
        const payloadTotalEventos = Number(summary.totalEventos || 0);
        const payloadStatus = summary.status || 'OK';

        ItemTrace.registrarEventoItem(e, itemKey, 'acompanhamento_coletado', {
            itemTelaId: itemTelaId || (e as unknown as Record<string, unknown>)['itemAtualTelaId'] as string || itemKey,
            resumo: `Acompanhamento coletado: ${payloadTotalEventos} eventos`,
            payload: {
                status: payloadStatus,
                totalEventos: payloadTotalEventos,
                criticalFiscalRework: !!summary.criticalFiscalRework,
            },
            status: 'em_andamento',
            now: Date.now(),
        });
    });
}

// ---------------------------------------------------------------------------
export async function coletarMidia(estado: EstadoApp, status: HTMLElement | null, { getAcao }: AcaoContext): Promise<boolean> {
    const acao = getAcao('coletarMidia', estado);
    if (!acao.ativo) return false;

    const estadoAny = estado as unknown as Record<string, unknown>;
    const itemKey = estadoAny['itemAtualKey'] as string | undefined;
    if (!itemKey) return false;

    const reporting = getReportingConfig(estado);
    const repState = getItemReportingState(estado, itemKey);
    if (repState.mediaDone) {
        const logKey = `log:midia_done:${itemKey}`;
        if (!CooldownManager.isAtivo(logKey)) {
            log(`COLETA_MIDIA | Item ${itemKey} | SKIPPED_ALREADY_DONE`, 'info');
            CooldownManager.set(logKey, 10000);
        }
        return false;
    }

    if (!reporting.enabledMedia) {
        const summary: MidiaSummary = { status: 'SKIPPED_DISABLED', total: 0, imagens: 0, pdfs: 0, unsupported: 0, itens: [] };
        updateItemReportingState(itemKey, {
            mediaDone: true,
            mediaSummary: summary
        });
        registrarEventoMidia(itemKey, summary, estadoAny['itemAtualTelaId'] as string | null);
        log(`COLETA_MIDIA | Item ${itemKey} | SKIPPED_DISABLED | desativada no perfil`, 'info');
        return true;
    }

    if (reporting.clickMediaTabBeforeCollect) {
        let abaMidia = buscarElementoDeep(acao.seletor);

        if (!abaMidia) {
            const tabRoot = document.querySelector('#dlTab');
            const candidatos = tabRoot
                ? [...tabRoot.querySelectorAll('a')]
                : [...document.querySelectorAll('a[href*="Midia.aspx"], a[id*="lbutMenu"], a[id*="lbutSelMenu"]')];

            abaMidia = candidatos.find(a => normalizarTextoSemAcento(a.textContent || '').includes('midia')) || null;
        }

        if (abaMidia && elementoVisivel(abaMidia as HTMLElement)) {
            if (status) status.textContent = 'Abrindo aba Mídias...';
            await Interacao.interagir(abaMidia as HTMLElement, null, 'coletarMidiaAba');
        } else {
            log(`COLETA_MIDIA | Item ${itemKey} | ABA_MIDIA_NAO_ENCONTRADA_PARA_CLIQUE | seguindo com coleta por leitura`, 'warn');
        }
    }

    if (status) status.textContent = 'Coletando mídias...';
    try {
        log(`COLETA_MIDIA | Item ${itemKey} | START | modo=${reporting.clickMediaTabBeforeCollect ? 'click+fetch' : 'headless'}`, 'info');
        const result: any = await _coletarMidia(estado, itemKey as string);
        const s = result.summary || {};
        registrarEventoMidia(itemKey, s, estadoAny['itemAtualTelaId'] as string | null);
        const diag = s.diagnostic ? ` | diag=${s.diagnostic}` : '';
        const origem = s.sourceUrl ? ` | source=${s.sourceUrl}` : '';
        log(`COLETA_MIDIA | Item ${itemKey} | ${s.status || 'OK'} | img=${s.imagens || 0} pdf=${s.pdfs || 0} outros=${s.unsupported || 0}${origem}${diag}`, 'info');
        return true;
    } catch (err: any) {
        const msg = String(err?.message || err);
        const code = err?.code || REPORTING_ERROR_CODES.MEDIA_PARSE_ERROR;
        const summary: MidiaSummary = { status: 'ERRO', total: 0, imagens: 0, pdfs: 0, unsupported: 0, itens: [] };
        updateItemReportingState(itemKey, {
            mediaDone: true,
            mediaSummary: summary,
            mediaError: msg,
            mediaErrorCode: code
        });
        registrarEventoMidia(itemKey, summary, estadoAny['itemAtualTelaId'] as string | null);
        log(`COLETA_MIDIA | Item ${itemKey} | ${code}: ${msg} | modo opcional: seguindo fluxo`, 'warn');
        return true;
    }
}

// ---------------------------------------------------------------------------
export async function coletarAcompanhamento(estado: EstadoApp, status: HTMLElement | null, { getAcao }: AcaoContext): Promise<boolean> {
    const acao = getAcao('coletarAcompanhamento', estado);
    if (!acao.ativo) return false;

    const estadoAny = estado as unknown as Record<string, unknown>;
    const itemKey = estadoAny['itemAtualKey'] as string | undefined;
    if (!itemKey) return false;

    const reporting = getReportingConfig(estado);
    const repState = getItemReportingState(estado, itemKey);
    if (repState.acompanhamentoDone) {
        const logKey = `log:hist_done:${itemKey}`;
        if (!CooldownManager.isAtivo(logKey)) {
            log(`COLETA_HISTORICO | Item ${itemKey} | SKIPPED_ALREADY_DONE`, 'info');
            CooldownManager.set(logKey, 10000);
        }
        return false;
    }

    if (!reporting.enabledAcompanhamento) {
        const summary: AcompanhamentoSummary = {
            status: 'SKIPPED_DISABLED',
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
        registrarEventoAcompanhamento(itemKey, summary, estadoAny['itemAtualTelaId'] as string | null);
        log(`COLETA_HISTORICO | Item ${itemKey} | SKIPPED_DISABLED | desativada no perfil`, 'info');
        return true;
    }

    if (status) status.textContent = 'Coletando acompanhamento...';
    try {
        log(`COLETA_HISTORICO | Item ${itemKey} | START | modo=headless`, 'info');
        const result: ColetarAcompanhamentoResult = await _coletarAcompanhamento(estado, itemKey as string);
        const s = result.summary || {};
        registrarEventoAcompanhamento(itemKey, s, estadoAny['itemAtualTelaId'] as string | null);
        if (s.criticalFiscalRework) {
            log(`COLETA_HISTORICO | Item ${itemKey} | CRITICO | fiscalTransitions=${s.fiscalTransitionsCount}`, 'warn');
        } else {
            log(`COLETA_HISTORICO | Item ${itemKey} | OK | eventos=${s.totalEventos || 0}`, 'info');
        }
        return true;
    } catch (err: any) {
        const msg = String(err?.message || err);
        const code = err?.code || REPORTING_ERROR_CODES.HISTORICO_PARSE_ERROR;
        const summary: AcompanhamentoSummary = {
            status: 'ERRO',
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
        registrarEventoAcompanhamento(itemKey, summary, estadoAny['itemAtualTelaId'] as string | null);
        log(`COLETA_HISTORICO | Item ${itemKey} | ${code}: ${msg} | modo opcional: seguindo fluxo`, 'warn');
        return true;
    }
}
