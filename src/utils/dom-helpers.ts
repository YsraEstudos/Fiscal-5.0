/**
 * Utilitários de manipulação DOM.
 * Verificação de visibilidade, busca em iframes, cache de iframes.
 * Extraído do monólito — Utils (funções DOM).
 */

import { normalizarTexto } from './text.js';

// ---------------------------------------------------------------------------
// Cache de iframes
// ---------------------------------------------------------------------------
const _iframesCache = { ts: 0, list: [] };

export function getIframesCached(ttlMs: number = 1000): HTMLIFrameElement[] {
    const now = Date.now();
    if (now - _iframesCache.ts < ttlMs) return _iframesCache.list as HTMLIFrameElement[];
    const list = Array.from(document.querySelectorAll('iframe'));
    _iframesCache.ts = now;
    _iframesCache.list = list as any;
    return list;
}

// ---------------------------------------------------------------------------
// Visibilidade
// ---------------------------------------------------------------------------

/** Verifica se um elemento DOM está visível (display, visibility, opacity, dimensões). */
export function elementoVisivel(elemento: Element | null | undefined): boolean {
    if (!elemento) return false;
    const view = elemento.ownerDocument?.defaultView || window;
    const style = view.getComputedStyle(elemento);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity) === 0) return false;
    const rect = elemento.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
}

/** Verifica se um elemento existe e está visível via seletor CSS simples. */
export function verificarElemento(seletor: string): boolean {
    const el = document.querySelector(seletor);
    return !!el && elementoVisivel(el);
}

// ---------------------------------------------------------------------------
// Texto de elemento
// ---------------------------------------------------------------------------

/** Retorna o texto de um elemento (value para inputs, textContent para outros). */
export function getTextoElemento(el: Element | null | undefined): string {
    if (!el) return '';
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value || '';
    return el.textContent || '';
}

// ---------------------------------------------------------------------------
// Iteração em documentos (main + iframes)
// ---------------------------------------------------------------------------

/** Executa callback para document principal e para cada iframe acessível. */
export function forEachDoc(callback: (doc: Document) => void): void {
    callback(document);
    for (const iframe of getIframesCached()) {
        try {
            const doc = iframe.contentDocument;
            if (!doc) continue;
            callback(doc);
        } catch { /* cross-origin */ }
    }
}

// ---------------------------------------------------------------------------
// Filtro por texto
// ---------------------------------------------------------------------------

/** Filtra e ordena elementos por proximidade de texto. */
export function filtrarPorTexto(elements: Iterable<Element> | ArrayLike<Element>, textWanted: string): Element[] {
    const wanted = normalizarTexto(textWanted);
    if (!wanted) return Array.from(elements);

    const scored = [];
    const elementsArray = Array.from(elements);
    for (const el of elementsArray) {
        if (!elementoVisivel(el)) continue;
        const t = normalizarTexto(getTextoElemento(el));
        if (!t) continue;
        if (t === wanted) scored.push({ score: 100, el });
        else if (t.includes(wanted)) scored.push({ score: 50, el });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.map((x) => x.el);
}
