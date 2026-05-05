/**
 * Handler de relatório: gerarRelatorioItem.
 * Extraído do monólito — WorkflowExecutor.handlers.gerarRelatorioItem (linhas 3789–3838).
 */

import { REPORTING_ERROR_CODES } from '../../config/constants.ts';
import * as EstadoManager from '../../core/estado-manager.ts';
import type { EstadoApp } from '../../core/estado-manager.ts';
import { log } from '../../core/log-manager.ts';
import { getReportingConfig } from '../../reporting/session.ts';
import { getItemReportingState, updateItemReportingState } from '../../reporting/metadata.ts';
import { enviarRelatorioItem } from '../../reporting/envio-relatorio.ts';
import * as ItemTrace from '../item-trace.ts';

interface ReportAcaoContext {
    getAcao: (id: string, estado: EstadoApp) => { ativo: boolean;[key: string]: unknown };
}

// ---------------------------------------------------------------------------
export async function gerarRelatorioItem(estado: EstadoApp, status: HTMLElement | null, { getAcao }: ReportAcaoContext): Promise<boolean> {
    const acao = getAcao('gerarRelatorioItem', estado);
    if (!acao.ativo) return false;

    const estadoAny = estado as unknown as Record<string, unknown>;
    const itemKey = estadoAny['itemAtualKey'] as string | undefined;
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
                generatedAt: new Date().toISOString(),
                warnings: ['Geração de relatório PDF/MD desativada nas opções'],
            },
            reportError: null,
            reportErrorCode: null,
        });
        log(`ENVIO_RELATORIO | Item ${itemKey} | SKIPPED_DISABLED: geração de PDF/MD desativada`, 'info');
        return true;
    }

    const erroColeta = repState.mediaErrorCode || repState.acompanhamentoErrorCode;
    if (erroColeta) {
        const msgColeta = repState.mediaError || repState.acompanhamentoError || 'Falha de coleta antes da geração do relatório';
        updateItemReportingState(itemKey, {
            reportDone: true,
            reportResponse: {
                ok: false,
                skippedByCollectionError: true,
                generatedAt: new Date().toISOString(),
                warnings: [msgColeta]
            },
            reportError: null,
            reportErrorCode: null
        });
        log(`ENVIO_RELATORIO | Item ${itemKey} | SKIPPED_COLETA(${erroColeta}): ${msgColeta} | modo opcional`, 'warn');
        return true;
    }

    if (reporting.enabledMedia && !repState.mediaDone) return false;
    if (reporting.enabledAcompanhamento && !repState.acompanhamentoDone) return false;

    if (status) status.textContent = 'Gerando relatório (PDF+MD)...';

    try {
        const data = await enviarRelatorioItem(estado, itemKey);
        EstadoManager.update((e: EstadoApp) => {
            const eAny = e as unknown as Record<string, unknown>;
            ItemTrace.registrarEventoItem(e, itemKey, 'relatorio_enviado', {
                itemTelaId: (eAny['itemAtualTelaId'] as string) || itemKey,
                resumo: 'Relatório enviado com sucesso',
                payload: {
                    itemId: data?.itemId || null,
                    pdfPath: data?.pdfPath || null,
                    mdPath: data?.mdPath || null,
                    warningsCount: Array.isArray(data?.warnings) ? data.warnings.length : 0,
                },
                status: 'em_andamento',
                now: Date.now(),
            });
        });
        log(`ENVIO_RELATORIO | Item ${itemKey} | OK | PDF=${data?.pdfPath || '-'} MD=${data?.mdPath || '-'}`, 'info');
        return true;
    } catch (err: any) {
        const msg = String(err?.message || err);
        const code = err?.code || REPORTING_ERROR_CODES.SERVICE_UNAVAILABLE;
        updateItemReportingState(itemKey, {
            reportDone: true,
            reportError: msg,
            reportErrorCode: code
        });
        log(`ENVIO_RELATORIO | Item ${itemKey} | ${code}: ${msg} | modo opcional: seguindo fluxo`, 'warn');
        return true;
    }
}
