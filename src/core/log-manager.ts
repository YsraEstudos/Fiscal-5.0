/**
 * Gerenciador de logs em memória com flush debounced para localStorage.
 * Extraído do monólito (linhas 1012–1059).
 */

import { CONFIG } from '../config/constants.ts';
import * as EstadoManager from '../core/estado-manager.ts';
import type { EstadoApp } from '../core/estado-manager.ts';
import { debounce } from '../utils/misc.ts';

export type LogTipo = 'info' | 'warn' | 'error' | 'success';

export interface LogEntry {
    timestamp: string;
    mensagem: string;
    tipo: LogTipo;
}

// ---------------------------------------------------------------------------
let memLogs: LogEntry[] | null = null;

const flushDebounced = debounce(() => {
    if (!memLogs) return;
    EstadoManager.update((st: EstadoApp) => { (st as unknown as Record<string, unknown>)['logs'] = memLogs; });
}, 400);

function garantirMemLogs(): void {
    if (!memLogs) {
        const existing = (EstadoManager.get() as unknown as Record<string, unknown>).logs;
        memLogs = (Array.isArray(existing) ? existing as LogEntry[] : []).slice(0, CONFIG.LOG_MAX_ENTRIES);
    }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/** Adiciona uma entrada de log. */
export function adicionar(mensagem: string, tipo: LogTipo = 'info'): void {
    garantirMemLogs();

    const timestamp = new Date().toLocaleTimeString('pt-BR');
    const entry: LogEntry = { timestamp, mensagem, tipo };

    memLogs!.unshift(entry);
    if (memLogs!.length > CONFIG.LOG_MAX_ENTRIES) memLogs!.length = CONFIG.LOG_MAX_ENTRIES;

    atualizarUI(entry);
    flushDebounced();

    const consoleMethod: 'error' | 'warn' | 'log' = tipo === 'error' ? 'error' : tipo === 'warn' ? 'warn' : 'log';
    console[consoleMethod](`[KM ${timestamp}] ${mensagem}`);
}

/** Atualiza a UI do painel de logs. */
export function atualizarUI(entry: LogEntry): void {
    const logArea = document.getElementById('log-area');
    if (!logArea) return;

    const div = document.createElement('div');
    div.className = `log-entry log-${entry.tipo}`;
    div.textContent = `${entry.timestamp} - ${entry.mensagem}`;
    logArea.prepend(div);

    while (logArea.children.length > 50) logArea.lastChild?.remove();
}

/** Retorna os logs em memória (para popular a UI). */
export function preloadParaUI(): LogEntry[] {
    garantirMemLogs();
    return memLogs!;
}

/**
 * Atalho para LogManager.adicionar.
 * Permite `log('mensagem', 'error')` em vez de `LogManager.adicionar(...)`.
 */
export const log = adicionar;
