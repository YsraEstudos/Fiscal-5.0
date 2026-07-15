/**
 * Módulo de interação com elementos DOM.
 * Simula cliques/digitação humanos para automação.
 * Extraído do monólito (linhas 1416–1591).
 */

import { CONFIG } from '../config/constants.ts';
import * as EstadoManager from '../core/estado-manager.ts';
import type { UltimoErro } from '../core/estado-manager.ts';
import { log } from '../core/log-manager.ts';
import * as CooldownManager from '../core/cooldown-manager.ts';
import { isTestMode, sleep } from '../utils/misc.ts';
import { normalizarTexto } from '../utils/text.ts';
import { elementoVisivel, getTextoElemento } from '../utils/dom-helpers.ts';
import { buscarElementoDeep } from '../utils/selectors.ts';

export type DestaqueTipo = 'action' | 'success' | 'error' | 'simulated';

// ---------------------------------------------------------------------------
// Destaque visual
// ---------------------------------------------------------------------------
export function destacar(elemento: HTMLElement, tipo: DestaqueTipo = 'action'): void {
    if (!elemento) return;
    const cores: Record<string, string> = { action: '#ff0000', success: '#28a745', error: '#dc3545', simulated: '#ffc107' };
    const outlineOriginal = elemento.style.outline;
    const shadowOriginal = elemento.style.boxShadow;

    elemento.style.outline = `3px solid ${cores[tipo] ?? cores['action']}`;
    elemento.style.boxShadow = `0 0 15px ${cores[tipo] ?? cores['action']}`;
    elemento.style.transition = 'all 0.2s ease';

    setTimeout(() => {
        elemento.style.outline = outlineOriginal;
        elemento.style.boxShadow = shadowOriginal;
    }, 800);
}

// ---------------------------------------------------------------------------
// Anti-loop de clique
// ---------------------------------------------------------------------------
function signature(elemento: Element): string {
    try {
        const tag = (elemento.tagName || '').toLowerCase();
        const id = (elemento as HTMLElement).id ? `#${(elemento as HTMLElement).id}` : '';
        const name = (elemento as HTMLInputElement).name ? `[name=${(elemento as HTMLInputElement).name}]` : '';
        const href = elemento.getAttribute?.('href') ? `[href=${(elemento.getAttribute('href') || '').slice(0, 80)}]` : '';
        const txt = normalizarTexto(getTextoElemento(elemento)).slice(0, 40);
        return `${tag}${id}${name}${href}::${txt}`;
    } catch {
        return 'unknown';
    }
}

function shouldBlockRepeatedClick(acaoId: string, elemento: Element): boolean {
    const st = EstadoManager.get();
    const cooldown = Math.max(0, Number(st.clickCooldownMs ?? 0));
    if (!cooldown) return false;

    const sig = signature(elemento);
    const key = `click:${acaoId}:${sig}`;

    if (CooldownManager.isAtivo(key)) {
        const rest = CooldownManager.tempoRestante(key);
        log(`⏳ Bloqueado anti-clique (${acaoId}) por ${Math.ceil(rest / 1000)}s`, 'warn');
        return true;
    }

    CooldownManager.set(key, cooldown);
    return false;
}

// ---------------------------------------------------------------------------
// Digitação humana
// ---------------------------------------------------------------------------
export async function digitarHumano(elemento: HTMLInputElement | HTMLTextAreaElement, valor: string | number | null): Promise<void> {
    const proto = (elemento instanceof HTMLTextAreaElement)
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;

    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    elemento.focus();

    const str = String(valor ?? '');

    if (!setter) {
        elemento.value = str;
        elemento.dispatchEvent(new Event('input', { bubbles: true }));
        elemento.dispatchEvent(new Event('change', { bubbles: true }));
        return;
    }

    if (elemento.value) {
        setter.call(elemento, '');
        elemento.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(80);
    }

    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const valorAtual = str.substring(0, i + 1);

        elemento.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
        elemento.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
        setter.call(elemento, valorAtual);
        elemento.dispatchEvent(new InputEvent('input', { bubbles: true, data: char }));
        elemento.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));

        const delay = isTestMode()
            ? 0
            : Math.floor(Math.random() * (CONFIG.DELAYS.TYPING_MAX - CONFIG.DELAYS.TYPING_MIN)) + CONFIG.DELAYS.TYPING_MIN;
        await sleep(delay);
    }

    elemento.dispatchEvent(new Event('change', { bubbles: true }));
}

// ---------------------------------------------------------------------------
// Digitação silenciosa para Autocomplete (Sem disparar 'change' no final)
// ---------------------------------------------------------------------------
export async function digitarSilencioso(elemento: HTMLInputElement | HTMLTextAreaElement, valor: string | number | null): Promise<void> {
    const proto = (elemento instanceof HTMLTextAreaElement)
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;

    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    elemento.focus();

    const str = String(valor ?? '');

    if (!setter) {
        elemento.value = str;
        elemento.dispatchEvent(new Event('input', { bubbles: true }));
        return;
    }

    if (elemento.value) {
        setter.call(elemento, '');
        elemento.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(80);
    }

    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const valorAtual = str.substring(0, i + 1);

        elemento.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
        elemento.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
        setter.call(elemento, valorAtual);
        elemento.dispatchEvent(new InputEvent('input', { bubbles: true, data: char }));
        elemento.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));

        const delay = isTestMode()
            ? 0
            : Math.floor(Math.random() * (CONFIG.DELAYS.TYPING_MAX - CONFIG.DELAYS.TYPING_MIN)) + CONFIG.DELAYS.TYPING_MIN;
        await sleep(delay);
    }
    // SEM CHANGE EVENT: a página valida ao 'change' e bloqueia antes de sel() rodar
}

// ---------------------------------------------------------------------------
// Clique humano
// ---------------------------------------------------------------------------
function clickHuman(elemento: HTMLElement): void {
    const rect = elemento.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const opts: MouseEventInit = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy };

    try {
        elemento.dispatchEvent(new PointerEvent('pointerdown', opts));
        elemento.dispatchEvent(new MouseEvent('mousedown', opts));
        elemento.dispatchEvent(new PointerEvent('pointerup', opts));
        elemento.dispatchEvent(new MouseEvent('mouseup', opts));
    } catch {
        try { elemento.dispatchEvent(new MouseEvent('mousedown', opts)); } catch { /* ignore */ }
        try { elemento.dispatchEvent(new MouseEvent('mouseup', opts)); } catch { /* ignore */ }
    }

    if (typeof elemento.click === 'function') elemento.click();
    else elemento.dispatchEvent(new MouseEvent('click', opts));
}

// ---------------------------------------------------------------------------
// Interação principal
// ---------------------------------------------------------------------------

/**
 * Registra um callback para ser notificado de interações.
 * Usado pelo WorkflowExecutor (definido em Fase 4).
 */
let _registrarInteracaoCallback: ((acaoId: string) => void) | null = null;
export function setRegistrarInteracao(fn: (acaoId: string) => void): void {
    _registrarInteracaoCallback = fn;
}

export async function interagir(elemento: HTMLElement | null, valor: string | null = null, acaoId: string = 'click'): Promise<boolean> {
    const estado = EstadoManager.get();

    if (!elemento || !elementoVisivel(elemento)) {
        log(`❌ Elemento não encontrado ou não visível: ${acaoId}`, 'error');
        return false;
    }

    if (valor === null) {
        if (shouldBlockRepeatedClick(acaoId, elemento)) {
            destacar(elemento, 'simulated');
            return true;
        }
    }

    const acoesDestrutivas = ['confirmar', 'prosseguir'];
    if (estado.modoSimulacao && acoesDestrutivas.includes(acaoId)) {
        log(`🧪 [SIMULAÇÃO] Ação bloqueada: ${acaoId}`, 'warn');
        destacar(elemento, 'simulated');
        return true;
    }

    destacar(elemento);
    try { elemento.scrollIntoView({ block: 'center', behavior: 'auto' }); } catch { /* ignore */ }

    if (valor !== null) {
        await digitarHumano(elemento as HTMLInputElement, valor);
        log(`⌨️ Preenchido (${acaoId}): ${valor}`, 'info');
        await sleep(150);
    } else {
        clickHuman(elemento);
        log(`🖱️ Clique (${acaoId})`, 'info');
    }

    try { _registrarInteracaoCallback?.(acaoId); } catch { /* ignore */ }
    return true;
}

// ---------------------------------------------------------------------------
// Tentativa com retry
// ---------------------------------------------------------------------------
export async function tentarComRetry(seletor: string, valor: string | null = null, acaoId: string = 'click'): Promise<boolean> {
    for (let tentativa = 1; tentativa <= CONFIG.RETRY.MAX_TENTATIVAS; tentativa++) {
        const elemento = buscarElementoDeep(seletor);
        if (elemento && elementoVisivel(elemento as HTMLElement)) {
            return await interagir(elemento as HTMLElement, valor, acaoId);
        }

        if (tentativa < CONFIG.RETRY.MAX_TENTATIVAS) {
            const delay = CONFIG.RETRY.DELAY_BASE * Math.pow(CONFIG.RETRY.MULTIPLICADOR, tentativa - 1);
            log(`⏳ Tentativa ${tentativa}/${CONFIG.RETRY.MAX_TENTATIVAS}. Aguardando ${delay}ms...`, 'warn');
            await sleep(delay);
        }
    }

    EstadoManager.update((estado) => {
        estado.estatisticas.erros++;
        estado.estatisticas.ultimoErro = {
            tipo: 'elemento_nao_encontrado',
            seletor,
            timestamp: new Date().toISOString(),
        } satisfies UltimoErro;
    });

    log(`❌ Falha após ${CONFIG.RETRY.MAX_TENTATIVAS} tentativas: ${seletor}`, 'error');
    return false;
}
