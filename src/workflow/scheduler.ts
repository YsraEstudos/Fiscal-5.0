import type { EstadoApp } from '../core/estado-manager.ts';
import { normalizarIntervaloDelay } from '../core/estado/normalizers.ts';

export const LOOP_TICK_MS = 300;

function sortearDelay(estado: EstadoApp): number {
    const intervalo = normalizarIntervaloDelay(
        estado.globalActionDelayMinMs,
        estado.globalActionDelayMaxMs,
        estado.globalActionDelayMs,
    );
    if (intervalo.minimo === intervalo.maximo) return intervalo.minimo;
    return intervalo.minimo + Math.floor(Math.random() * (intervalo.maximo - intervalo.minimo + 1));
}

export function createWorkflowScheduler(runCycle: (trigger: string) => void): {
    cancelarTimer: () => void;
    scheduleNext: (ms?: number) => void;
    hasPendingTimer: () => boolean;
    registrarInteracao: (acaoId: string, estado: EstadoApp) => string;
    getActionDelayRemainingMs: () => number;
    resetActionDelay: () => void;
} {
    let cicloTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let nextRunAt = 0;
    let nextAllowedActionAt = 0;

    function cancelarTimer(): void {
        if (cicloTimeoutId) {
            clearTimeout(cicloTimeoutId);
            cicloTimeoutId = null;
        }
        nextRunAt = 0;
    }

    function scheduleNext(ms: number = LOOP_TICK_MS): void {
        const restanteGate = Math.max(0, nextAllowedActionAt - Date.now());
        const delayFinal = Math.max(0, ms, restanteGate);
        const now = Date.now();
        const targetAt = now + delayFinal;

        if (cicloTimeoutId && nextRunAt && nextRunAt > now) {
            if (nextRunAt <= targetAt) return;
        }

        cancelarTimer();
        nextRunAt = targetAt;
        cicloTimeoutId = setTimeout(() => {
            cicloTimeoutId = null;
            nextRunAt = 0;
            runCycle('timer');
        }, delayFinal);
    }

    function registrarInteracao(acaoId: string, estado: EstadoApp): string {
        const delay = sortearDelay(estado);
        nextAllowedActionAt = Date.now() + delay;
        return acaoId;
    }

    return {
        cancelarTimer,
        scheduleNext,
        hasPendingTimer: () => !!(cicloTimeoutId && nextRunAt && nextRunAt > Date.now()),
        registrarInteracao,
        getActionDelayRemainingMs: () => Math.max(0, nextAllowedActionAt - Date.now()),
        resetActionDelay: () => { nextAllowedActionAt = 0; },
    };
}
