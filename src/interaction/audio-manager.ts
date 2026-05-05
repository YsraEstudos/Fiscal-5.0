/**
 * Gerenciador de áudio para feedback sonoro.
 * Usa Web Audio API para tocar notas musicais como notificação.
 * Extraído do monólito (linhas 960–1006).
 */

import { CONFIG } from '../config/constants.ts';
import { isTestMode } from '../utils/misc.ts';

// Extend Window so TypeScript knows about webkitAudioContext
declare global {
    interface Window {
        webkitAudioContext?: typeof AudioContext;
    }
}

let context: AudioContext | null = null;

/** Inicializa o AudioContext (necessita interação do usuário no primeiro uso). */
export function inicializar(): boolean {
    if (isTestMode()) return false;
    if (context) return true;
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return false;
        context = new Ctx();
        return true;
    } catch (e) {
        console.warn('[KM] Audio API não disponível:', e);
        return false;
    }
}

/** Toca uma sequência de notas conforme o tipo de evento. */
export function tocar(tipo: string = 'success'): void {
    if (isTestMode()) return;
    if (!context && !inicializar()) return;
    if (!context) return;
    if (context.state === 'suspended') void context.resume();

    const notas: readonly number[] = (CONFIG.SONS as Record<string, readonly number[]>)[tipo] ?? CONFIG.SONS.success;
    const duracao = 0.15;

    notas.forEach((freq, i) => {
        if (!context) return;
        const osc = context.createOscillator();
        const gain = context.createGain();

        osc.connect(gain);
        gain.connect(context.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';

        const startTime = context.currentTime + i * duracao;
        osc.start(startTime);
        osc.stop(startTime + duracao);
        gain.gain.setValueAtTime(0.3, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + duracao);
    });
}

/** Fecha o AudioContext e libera recursos. */
export function fechar(): void {
    if (isTestMode()) return;
    if (context) {
        void context.close();
        context = null;
    }
}
