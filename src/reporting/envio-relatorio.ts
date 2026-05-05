/**
 * Envio final do relatório de item para o serviço local.
 * Extraído do monólito — RelatorioItemManager.enviarRelatorioItem (~2990–3070).
 */

import { CONFIG } from '../config/constants.ts';
import { slugifyArquivo } from '../utils/misc.ts';
import { getReportingConfig, resolverOuCriarSessionRunId } from './session.ts';
import {
    getCacheItem,
    getItemReportingState,
    updateItemReportingState,
    obterMetadadosBasicos,
    classificarErroServico,
    criarErroRelatorio,
} from './metadata.ts';
import * as ReportTransport from './transport.ts';
import type { EstadoApp } from '../core/estado-manager.ts';

// ---------------------------------------------------------------------------
const EMPTY_NCM = { found: false, keywordMentions: 0, formattedMatches: 0, unformattedMatchesWithContext: 0, codes: [], evidences: [] };

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------
export async function enviarRelatorioItem(estado: EstadoApp, itemKey: string): Promise<ReportTransport.TransportResponse> {
    const reporting = getReportingConfig(estado);
    const itemState = getItemReportingState(estado, itemKey);
    const cache = (getCacheItem(itemKey) || {}) as any;

    const meta = obterMetadadosBasicos(estado, itemKey);
    const mediaSummary = cache.media || itemState.mediaSummary || { status: 'NAO_COLETADO', total: 0, imagens: 0, pdfs: 0, otherFiles: 0, unsupported: 0, itens: [] };
    const histData = cache.acompanhamento || {};
    const historicoSummary = histData.summary || itemState.acompanhamentoSummary || {
        status: 'NAO_COLETADO',
        totalEventos: 0,
        fiscalTransitionsCount: 0,
        criticalFiscalRework: false,
        stageTransitions: [],
        importantSignals: [],
        ncmMentions: { ...EMPTY_NCM },
    };
    const historicoTimeline = histData.timeline || [];

    const manifest = {
        manifestVersion: 2,
        ...meta,
        timestamp: new Date().toISOString(),
        sessionRunId: reporting.sessionRunId || resolverOuCriarSessionRunId(estado),
        uploadLimits: {
            maxFileSizeMb: reporting.maxFileSizeMb,
            maxFilesPerItem: reporting.maxFilesPerItem,
        },
        ocrEnabled: reporting.ocrEnabled,
        ocrEngine: reporting.ocrEngine,
        mediaSummary,
        historicoSummary,
        historicoTimeline,
    };

    const form = new FormData();
    form.append('manifest', JSON.stringify(manifest));

    const arquivos = Array.isArray(cache.files) ? cache.files : [];
    const maxFiles = Math.max(1, Number(reporting.maxFilesPerItem || CONFIG.REPORTING.MAX_FILES_PER_ITEM));
    const maxBytes = Math.max(1, Number(reporting.maxFileSizeMb || CONFIG.REPORTING.MAX_FILE_SIZE_MB)) * 1024 * 1024;
    for (const f of arquivos.slice(0, maxFiles)) {
        if (!f?.blob) continue;
        if (f.blob.size > maxBytes) continue;
        const fname = slugifyArquivo(f.filename || `media_${Date.now()}`);
        form.append('files', f.blob, fname);
    }

    const baseUrl = (reporting.serviceUrl || CONFIG.REPORTING.SERVICE_DEFAULT).replace(/\/+$/, '');
    const endpoint = `${baseUrl}/reports/item`;
    const headers: Record<string, string> = {};
    if (reporting.apiToken) headers['X-KM-Token'] = reporting.apiToken;

    let data: ReportTransport.TransportResponse;
    try {
        data = await ReportTransport.send(form, {
            url: endpoint,
            headers,
            transport: reporting.transport,
            timeoutMs: CONFIG.REPORTING.SERVICE_TIMEOUT_MS,
            attempts: CONFIG.REPORTING.RETRY_ATTEMPTS,
        });
    } catch (err: any) {
        const code = classificarErroServico(err?.message || '');
        throw criarErroRelatorio(code, err?.message || 'Falha ao enviar relatório', err);
    }

    updateItemReportingState(itemKey, {
        reportDone: true,
        reportResponse: {
            ok: true,
            itemId: data?.itemId || meta.itemId || null,
            pdfPath: data?.pdfPath || null,
            mdPath: data?.mdPath || null,
            warnings: data?.warnings || [],
            generatedAt: new Date().toISOString(),
        },
        reportError: null,
        reportErrorCode: null,
    });

    return data;
}
