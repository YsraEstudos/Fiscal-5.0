/**
 * Hooks no ASP.NET WebForms PageRequestManager.
 * Monitora begin/end request para saber quando o servidor está processando.
 * Extraído do monólito (linhas 906–954).
 */

import { log } from '../core/log-manager.ts';

// The Sys global is injected by ASP.NET ScriptManager at runtime.
declare const Sys: {
    WebForms?: {
        PageRequestManager?: {
            getInstance(): {
                add_beginRequest(fn: () => void): void;
                remove_beginRequest(fn: () => void): void;
                add_endRequest(fn: (sender: unknown, args: AspNetEndRequestArgs) => void): void;
                remove_endRequest(fn: (sender: unknown, args: AspNetEndRequestArgs) => void): void;
            } | null;
        };
    };
} | undefined;

interface AspNetEndRequestArgs {
    get_error?(): { message: string } | undefined;
    set_errorHandled?(val: boolean): void;
}

let busy = false;
let hooked = false;
const listeners = new Set<() => void>();

function onBeginRequest(): void {
    busy = true;
}

function onEndRequest(_sender: unknown, args: AspNetEndRequestArgs): void {
    busy = false;

    const err = args?.get_error?.();
    if (err) {
        try { args.set_errorHandled?.(true); } catch { /* ignore */ }
        log(`❌ Erro no servidor (endRequest): ${err.message}`, 'error');
        return;
    }

    for (const fn of listeners) {
        try { fn(); } catch { /* ignore */ }
    }
}

/** Registra os hooks no Sys.WebForms.PageRequestManager (polling até disponível). */
export function hook(): void {
    if (hooked) return;
    hooked = true;

    const t = setInterval(() => {
        if (typeof Sys !== 'undefined' && Sys.WebForms?.PageRequestManager) {
            clearInterval(t);
            try {
                const prm = Sys.WebForms.PageRequestManager.getInstance();
                if (!prm) return;

                try { prm.remove_beginRequest(onBeginRequest); } catch { /* ignore */ }
                try { prm.remove_endRequest(onEndRequest); } catch { /* ignore */ }

                prm.add_beginRequest(onBeginRequest);
                prm.add_endRequest(onEndRequest);
            } catch (e) {
                console.warn('[KM] Falha ao hookar PageRequestManager:', e);
            }
        }
    }, 50);
}

/** Retorna `true` se uma requisição ASP.NET está em andamento. */
export function isBusy(): boolean {
    return busy;
}

/** Registra callback para ser chamado após cada endRequest. Retorna unsubscribe. */
export function subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
