import { log } from '../core/log-manager.ts';
import type { WorkflowStateObj } from './types.ts';

export const workflowState: WorkflowStateObj = {
    faseCompleta: new Set<string>(),
    unspscValorDigitado: false,
    unspscPesquisado: false,
    unspscSelecionado: false,
    debugMode: false,
    _debugLastSeen: new Map<string, number>(),

    reset() {
        this.faseCompleta.clear();
        this.unspscValorDigitado = false;
        this.unspscPesquisado = false;
        this.unspscSelecionado = false;
        this._lupaRetryCount = 0;
        log('🔄 Estado do workflow resetado', 'info');
    },

    marcarCompleta(fase: string) {
        this.faseCompleta.add(fase);
        this.debugLog(`✓ Fase '${fase}' marcada como COMPLETA`);
    },

    isCompleta(fase: string): boolean {
        return this.faseCompleta.has(fase);
    },

    debugLog(msg: string) {
        if (this.debugMode) {
            console.log(`[WF-DEBUG] ${msg}`);
            log(`🔍 ${msg}`, 'info');
        }
    },

    debugLogThrottled(chave: string, msg: string, intervaloMs: number = 2500) {
        if (!this.debugMode) return;
        const now = Date.now();
        const last = this._debugLastSeen.get(chave) || 0;
        if ((now - last) < intervaloMs) return;
        this._debugLastSeen.set(chave, now);
        this.debugLog(msg);
    },

    getStatus(): string {
        return `[State: fases=${[...this.faseCompleta].join(',') || '∅'} | valorDigitado=${this.unspscValorDigitado} | pesquisado=${this.unspscPesquisado} | selecionado=${this.unspscSelecionado}]`;
    }
};
