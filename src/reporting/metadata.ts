/**
 * Metadados de item + helpers de fetch para coleta de relatórios.
 * Extraído do monólito — RelatorioItemManager (funções de metadados e fetch).
 */

import { CONFIG, REPORTING_ERROR_CODES } from '../config/constants.ts';
import * as EstadoManager from '../core/estado-manager.ts';
import type { EstadoApp } from '../core/estado-manager.ts';
import { sleep } from '../utils/misc.ts';
import { buscarElementoDeep } from '../utils/selectors.ts';
import { obterItemIdAtual } from '../data/item-map-manager.ts';

// ---------------------------------------------------------------------------
// Tipos auxiliares
// ---------------------------------------------------------------------------

export interface ItemCacheState {
    media: unknown | null;
    acompanhamento: unknown | null;
    files: unknown[];
}

export interface ItemReportingState {
    mediaDone?: boolean;
    reportDone?: boolean;
    [key: string]: unknown;
}

export interface BasicMetadata {
    itemId: string | null;
    sinId: string | null;
    statusAtual: string | null;
    solicitante: string | null;
    empresa: string | null;
    timestamp: string;
    itemKey: string | null;
    perfil: string;
}

export interface FetchRetryOptions {
    method?: string;
    body?: BodyInit | null;
    headers?: Record<string, string>;
    responseType?: 'text' | 'blob';
    timeoutMs?: number;
    attempts?: number;
}

// ---------------------------------------------------------------------------
// Cache por item
// ---------------------------------------------------------------------------
const cachePorItem = new Map<string, ItemCacheState>();

export function getCacheItem(itemKey: string | null | undefined): ItemCacheState | null {
    const key = String(itemKey ?? '').trim();
    if (!key) return null;
    if (!cachePorItem.has(key)) {
        cachePorItem.set(key, { media: null, acompanhamento: null, files: [] });
    }
    return cachePorItem.get(key) || null;
}

// ---------------------------------------------------------------------------
// Item reporting state
// ---------------------------------------------------------------------------
export function getItemReportingState(estado: EstadoApp, itemKey: string): ItemReportingState {
    const estadoAny = estado as unknown as Record<string, any>;
    return estadoAny?.itemFlags?.[itemKey]?.reporting || {};
}

export function updateItemReportingState(itemKey: string, patch: Record<string, unknown>): void {
    if (!itemKey || !patch || typeof patch !== 'object') return;
    EstadoManager.update((e: EstadoApp) => {
        const eAny = e as unknown as Record<string, any>;
        eAny.itemFlags = eAny.itemFlags || {};
        const atualItem = eAny.itemFlags[itemKey] || {};
        const atualReporting = atualItem.reporting || {};
        eAny.itemFlags[itemKey] = {
            ...atualItem,
            reporting: {
                ...atualReporting,
                ...patch,
            },
        };
    });
}

// ---------------------------------------------------------------------------
// Helpers DOM para metadados
// ---------------------------------------------------------------------------
export function obterCampoValor(seletores: string[] = []): string | null {
    for (const s of seletores) {
        const el = buscarElementoDeep(s) as HTMLInputElement | HTMLElement | null;
        if (!el) continue;
        const val = ((el as HTMLInputElement).value ?? el.textContent ?? '').toString().trim();
        if (val) return val;
    }
    return null;
}

function extrairSinIdDaUrl(): string | null {
    try {
        const u = new URL(window.location.href);
        return u.searchParams.get('IdSIN') || u.searchParams.get('Id') || null;
    } catch {
        return null;
    }
}

export function obterMetadadosBasicos(estado: EstadoApp, itemKey: string | null | undefined): BasicMetadata {
    const itemId = obterItemIdAtual()
        || obterCampoValor(['#txtCodigo', 'input[name$="txtCodigo"]'])
        || itemKey
        || null;

    const sinId = obterCampoValor(['#txtNumero', 'input[name$="txtNumero"]'])
        || extrairSinIdDaUrl()
        || itemKey
        || null;

    const statusAtual = obterCampoValor(['#txtStatus', 'input[name$="txtStatus"]']) || null;
    const solicitante = obterCampoValor(['#txtSolicitante', 'input[name$="txtSolicitante"]']) || null;
    const empresa = obterCampoValor(['#txtEmpresa', 'input[name$="txtEmpresa"]']) || null;

    const estadoAny = estado as unknown as Record<string, any>;

    return {
        itemId,
        sinId,
        statusAtual,
        solicitante,
        empresa,
        timestamp: new Date().toISOString(),
        itemKey: itemKey || null,
        perfil: estadoAny?.perfilAtivo || 'default',
    };
}

// ---------------------------------------------------------------------------
// Erro de relatório
// ---------------------------------------------------------------------------
export function criarErroRelatorio(code: string, message: string, cause: unknown = null): Error & { code?: string; cause?: unknown } {
    const err = new Error(`${code}: ${message}`) as Error & { code?: string; cause?: unknown };
    err.code = code;
    err.cause = cause || null;
    return err;
}

export function classificarErroServico(message: string = ''): string {
    const msg = String(message || '');
    if (/401|token|unauthorized/i.test(msg)) return REPORTING_ERROR_CODES.SERVICE_AUTH_MISSING;
    if (/413|file_size|file_count|limit|UPLOAD_LIMIT_EXCEEDED/i.test(msg)) return REPORTING_ERROR_CODES.UPLOAD_LIMIT_EXCEEDED;
    return REPORTING_ERROR_CODES.SERVICE_UNAVAILABLE;
}

// ---------------------------------------------------------------------------
// Decodificação de texto HTTP (charset detection)
// ---------------------------------------------------------------------------
function extrairCharsetContentType(contentType: string = ''): string {
    const m = String(contentType || '').match(/charset\s*=\s*["']?([^;"'\s]+)/i);
    return m?.[1] ? m[1].trim().toLowerCase() : '';
}

function extrairCharsetMeta(bytes: Uint8Array): string {
    try {
        const head = bytes.slice(0, 8192);
        const ascii = new TextDecoder('ascii').decode(head);
        const mCharset = ascii.match(/<meta[^>]*charset=["']?\s*([a-z0-9._-]+)/i);
        if (mCharset?.[1]) return mCharset[1].trim().toLowerCase();
        const mHttpEquiv = ascii.match(/<meta[^>]*http-equiv=["']content-type["'][^>]*content=["'][^"']*charset=([a-z0-9._-]+)/i);
        if (mHttpEquiv?.[1]) return mHttpEquiv[1].trim().toLowerCase();
    } catch { /* ignore */ }
    return '';
}

function normalizarLabelCharset(charset: string = ''): string {
    const c = String(charset || '').toLowerCase();
    if (!c) return '';
    if (c === 'latin1') return 'iso-8859-1';
    if (c === 'cp1252' || c === 'windows1252') return 'windows-1252';
    return c;
}

function scoreTextoDecodificado(texto: string = ''): number {
    const invalid = (texto.match(/\uFFFD/g) || []).length;
    const mojibake = (texto.match(/Ã.|Â.|â€|â€œ|â€/g) || []).length;
    return (invalid * 10) + mojibake;
}

export function decodificarTextoHttp(buffer: ArrayBuffer, contentType: string = ''): string {
    const bytes = new Uint8Array(buffer || []);
    const candidatos: string[] = [];
    const headerCharset = normalizarLabelCharset(extrairCharsetContentType(contentType));
    const metaCharset = normalizarLabelCharset(extrairCharsetMeta(bytes));
    if (headerCharset) candidatos.push(headerCharset);
    if (metaCharset && metaCharset !== headerCharset) candidatos.push(metaCharset);
    candidatos.push('utf-8', 'windows-1252', 'iso-8859-1');

    let melhorTexto = '';
    let melhorScore = Number.POSITIVE_INFINITY;

    for (const charset of candidatos) {
        try {
            const texto = new TextDecoder(charset, { fatal: false }).decode(bytes);
            const score = scoreTextoDecodificado(texto);
            if (score < melhorScore) {
                melhorScore = score;
                melhorTexto = texto;
            }
            if (score === 0) break;
        } catch { /* ignore */ }
    }

    if (melhorTexto) return melhorTexto;
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

// ---------------------------------------------------------------------------
// HTTP fetch with retry
// ---------------------------------------------------------------------------
export async function fetchWithRetry(url: string, { method = 'GET', body = null, headers = {}, responseType = 'text', timeoutMs = CONFIG.REPORTING.FETCH_TIMEOUT_MS, attempts = CONFIG.REPORTING.RETRY_ATTEMPTS }: FetchRetryOptions = {}): Promise<string | Blob> {
    let lastErr: unknown = null;
    for (let i = 1; i <= Math.max(1, attempts); i++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const opts: RequestInit = {
                method,
                credentials: 'include',
                signal: controller.signal,
                headers: { ...headers },
            };
            if (body) opts.body = body;

            const resp = await fetch(url, opts);
            if (!resp.ok) throw new Error(`Falha HTTP ${resp.status}`);
            if (responseType === 'blob') return await resp.blob();
            const buffer = await resp.arrayBuffer();
            return decodificarTextoHttp(buffer, resp.headers?.get('content-type') || '');
        } catch (err) {
            lastErr = err;
            if (i < attempts) {
                const jitter = Math.floor(Math.random() * CONFIG.REPORTING.RETRY_JITTER_MS);
                const delay = (CONFIG.REPORTING.RETRY_BASE_DELAY_MS * Math.pow(2, i - 1)) + jitter;
                await sleep(delay);
            }
        } finally {
            clearTimeout(timer);
        }
    }
    throw (lastErr || new Error('Falha de rede sem detalhe'));
}

export async function fetchHtml(url: string): Promise<string> {
    return await fetchWithRetry(url, { responseType: 'text' }) as string;
}

export async function fetchPostHtml(url: string, formData: FormData): Promise<string> {
    return await fetchWithRetry(url, {
        method: 'POST',
        body: formData,
        responseType: 'text'
    }) as string;
}

export async function fetchBlob(url: string): Promise<Blob> {
    return await fetchWithRetry(url, { responseType: 'blob' }) as Blob;
}
