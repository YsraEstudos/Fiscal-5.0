/**
 * Gestão de session/run IDs para reporting.
 * Extraído do monólito — RelatorioItemManager (funções de sessão).
 */

import { CONFIG, REPORTING_DEFAULTS } from '../config/constants.ts';
import * as EstadoManager from '../core/estado-manager.ts';
import type { EstadoApp } from '../core/estado-manager.ts';
import { normalizarReportingConfig } from '../core/estado-manager.ts';
import { hashTexto, slugifyArquivo } from '../utils/misc.ts';
import { normalizarEspacos } from '../utils/text.ts';
import { buscarElementoDeep } from '../utils/selectors.ts';
import { obterItemIdAtual } from '../data/item-map-manager.ts';

// ---------------------------------------------------------------------------
export function getReportingConfig(estado: EstadoApp): Record<string, any> {
    const estadoAny = estado as unknown as Record<string, any>;
    return normalizarReportingConfig(estadoAny.reporting || REPORTING_DEFAULTS);
}

export function obterProjetoLabelAtual(): string {
    const el = buscarElementoDeep('#lblUsuario') || document.querySelector('#lblUsuario');
    const raw = normalizarEspacos(el?.textContent || '');
    if (!raw) return 'projeto_sem_nome';
    const parts = raw.split('//').map((p) => normalizarEspacos(p)).filter(Boolean);
    const candidato = parts.length >= 2 ? parts[1] : raw;
    return slugifyArquivo(candidato.toLowerCase(), 'projeto_sem_nome');
}

function resolverChaveVinculoSessao(estado: EstadoApp): string {
    const projeto = obterProjetoLabelAtual();
    const estadoAny = estado as unknown as Record<string, any>;
    const jsonAtivo = !!(estadoAny?.itemMapAtivo && String(estadoAny?.itemMapJson || '').trim());
    if (jsonAtivo) {
        const hashJson = hashTexto(String(estadoAny.itemMapJson || '').trim());
        return `proj:${projeto}|json:${hashJson}`;
    }

    const itemRef = String(
        estadoAny?.itemAtualKey
        || estadoAny?.itemAtualTelaId
        || obterItemIdAtual()
        || 'sem_item'
    ).trim();
    const itemSlug = slugifyArquivo(itemRef.toLowerCase(), 'sem_item');
    return `proj:${projeto}|item:${itemSlug}`;
}

export function resolverOuCriarSessionRunId(estado: EstadoApp): string {
    const key = resolverChaveVinculoSessao(estado);
    const projeto = obterProjetoLabelAtual();
    const estadoAny = estado as unknown as Record<string, any>;

    const mapa = (estadoAny?.reportingSessionMap && typeof estadoAny.reportingSessionMap === 'object')
        ? estadoAny.reportingSessionMap as Record<string, string>
        : {};

    if (mapa[key]) return mapa[key];

    const horario = new Date();
    const pad2 = (n: number | string) => String(n).padStart(2, '0');
    const stamp = `${horario.getFullYear()}${pad2(horario.getMonth() + 1)}${pad2(horario.getDate())}_${pad2(horario.getHours())}${pad2(horario.getMinutes())}${pad2(horario.getSeconds())}`;
    const curto = hashTexto(key).slice(0, 6);
    const sessionRunId = slugifyArquivo(`session_${projeto}_${stamp}_${curto}`, `session_${stamp}_${curto}`);

    EstadoManager.update((e: EstadoApp) => {
        const eAny = e as unknown as Record<string, any>;
        eAny.reportingSessionMap = eAny.reportingSessionMap && typeof eAny.reportingSessionMap === 'object'
            ? eAny.reportingSessionMap
            : {};
        eAny.reportingSessionMap[key] = sessionRunId;
    });

    return sessionRunId;
}

export async function touchSessionNoServico(estado: EstadoApp, reason: string = 'manual-stop'): Promise<Record<string, unknown>> {
    const reporting = getReportingConfig(estado);
    const baseUrl = (reporting.serviceUrl || CONFIG.REPORTING.SERVICE_DEFAULT).replace(/\/+$/, '');
    const endpoint = `${baseUrl}/reports/session/touch`;

    const sessionRunId = reporting.sessionRunId || resolverOuCriarSessionRunId(estado);
    if (!sessionRunId) return { ok: false, skipped: true, reason: 'session-id-empty' };

    const estadoAny = estado as unknown as Record<string, any>;
    const payload = {
        sessionRunId,
        projectName: obterProjetoLabelAtual(),
        reason,
        itemRef: String(estadoAny?.itemAtualKey || estadoAny?.itemAtualTelaId || obterItemIdAtual() || 'sem_item'),
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (reporting.apiToken) headers['X-KM-Token'] = reporting.apiToken;

    const resp = await fetch(endpoint, {
        method: 'POST',
        credentials: 'omit',
        headers,
        body: JSON.stringify(payload),
    });

    const txt = await resp.text();
    let data: Record<string, any> = {};
    try { data = txt ? JSON.parse(txt) : {}; } catch { data = { raw: txt }; }
    
    if (!resp.ok || data?.ok === false) {
        const msg = data?.errors?.join(' | ') || data?.detail || `HTTP ${resp.status}`;
        throw new Error(msg);
    }
    return data;
}
