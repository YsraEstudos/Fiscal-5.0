/**
 * Camada de transporte para envio de relatórios (fetch / GM_xmlhttpRequest).
 * Extraído do monólito (linhas 1734–1841).
 */

import { CONFIG } from '../config/constants.ts';
import { sleep } from '../utils/misc.ts';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

// Declaração de ambientação para GM_xmlhttpRequest se usado globalmente via UserScript
declare const GM_xmlhttpRequest: ((details: any) => void) | undefined;
declare const GM: { xmlHttpRequest?: (details: any) => void } | undefined;

export interface TransportConfig {
    transport?: 'auto' | 'fetch' | 'gm_xhr';
    attempts?: number;
    timeoutMs?: number;
    headers?: Record<string, string>;
    baseDelayMs?: number;
    jitterMs?: number;
    url: string;
}

export interface TransportResponse {
    ok: boolean;
    errors?: string[];
    [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// GM_xmlhttpRequest detection
// ---------------------------------------------------------------------------
export function hasGmXhr(): boolean {
    return typeof (globalThis as any).GM_xmlhttpRequest === 'function'
        || (typeof (globalThis as any).GM !== 'undefined' && typeof (globalThis as any).GM.xmlHttpRequest === 'function');
}

function gmXhr(details: any): void {
    if (typeof (globalThis as any).GM_xmlhttpRequest === 'function') return (globalThis as any).GM_xmlhttpRequest(details);
    if (typeof (globalThis as any).GM !== 'undefined' && typeof (globalThis as any).GM.xmlHttpRequest === 'function') return (globalThis as any).GM.xmlHttpRequest(details);
    throw new Error('GM_xmlhttpRequest indisponível');
}

function getOrder(pref: string | null | undefined): string[] {
    const p = String(pref || 'auto').toLowerCase();
    if (p === 'gm_xhr') return ['gm_xhr', 'fetch'];
    if (p === 'fetch') return ['fetch'];
    return ['gm_xhr', 'fetch'];
}

function parseJsonSafe(raw: unknown): TransportResponse {
    const txt = String(raw ?? '');
    if (!txt) return { ok: false, errors: ['Empty response'] };
    try {
        return JSON.parse(txt) as TransportResponse;
    } catch {
        return { ok: false, errors: [`Resposta inválida do serviço: ${txt.slice(0, 300)}`] };
    }
}

// ---------------------------------------------------------------------------
// Estratégias de envio
// ---------------------------------------------------------------------------
async function sendWithFetch(url: string, formData: FormData, headers: Record<string, string>, timeoutMs: number): Promise<TransportResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const resp = await fetch(url, {
            method: 'POST',
            body: formData,
            mode: 'cors',
            headers,
            signal: controller.signal,
        });
        const raw = await resp.text();
        const data = parseJsonSafe(raw);
        if (!resp.ok || data?.ok === false) {
            const msg = data?.errors?.[0] || `Falha ${resp.status} no serviço local`;
            throw new Error(msg);
        }
        return data;
    } finally {
        clearTimeout(timer);
    }
}

async function sendWithGmXhr(url: string, formData: FormData, headers: Record<string, string>, timeoutMs: number): Promise<TransportResponse> {
    if (!hasGmXhr()) throw new Error('GM_xmlhttpRequest indisponível');
    return new Promise((resolve, reject) => {
        gmXhr({
            method: 'POST',
            url,
            data: formData,
            headers,
            timeout: timeoutMs,
            onload: (resp: any) => {
                const data = parseJsonSafe(resp.responseText || '');
                if (resp.status < 200 || resp.status >= 300 || data?.ok === false) {
                    const msg = data?.errors?.[0] || `Falha ${resp.status} no serviço local`;
                    reject(new Error(msg));
                    return;
                }
                resolve(data);
            },
            onerror: () => reject(new Error('Falha de transporte GM_xmlhttpRequest')),
            ontimeout: () => reject(new Error('Timeout de transporte GM_xmlhttpRequest')),
        });
    });
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Envia FormData para o serviço de relatórios com retry e fallback de transporte.
 */
export async function send(formData: FormData, config: TransportConfig): Promise<TransportResponse> {
    const attempts = Math.max(1, Number(config.attempts || CONFIG.REPORTING.RETRY_ATTEMPTS));
    const order = getOrder(config.transport);
    const timeoutMs = Math.max(2000, Number(config.timeoutMs || CONFIG.REPORTING.SERVICE_TIMEOUT_MS));
    const headers = { ...(config.headers || {}) };
    const baseDelay = Math.max(100, Number(config.baseDelayMs || CONFIG.REPORTING.RETRY_BASE_DELAY_MS));
    const jitterMs = Math.max(0, Number(config.jitterMs || CONFIG.REPORTING.RETRY_JITTER_MS));
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        for (const mode of order) {
            if (mode === 'gm_xhr' && !hasGmXhr()) continue;
            try {
                if (mode === 'gm_xhr') return await sendWithGmXhr(config.url, formData, headers, timeoutMs);
                return await sendWithFetch(config.url, formData, headers, timeoutMs);
            } catch (err) {
                lastError = err;
            }
        }

        if (attempt < attempts) {
            const jitter = jitterMs ? Math.floor(Math.random() * jitterMs) : 0;
            const delay = (baseDelay * Math.pow(2, attempt - 1)) + jitter;
            await sleep(delay);
        }
    }

    throw (lastError || new Error('Falha de transporte sem detalhe'));
}
