/**
 * Sistema de seletores robustos (KM selector, CSS, texto, postback).
 * Busca em document principal e iframes.
 * Extraído do monólito — Utils (funções de seletor).
 */

import { cssEscape } from './misc.ts';
import { normalizarTexto } from './text.ts';
import {
    elementoVisivel,
    getIframesCached,
    forEachDoc,
    filtrarPorTexto,
    getTextoElemento,
} from './dom-helpers.ts';

// ---------------------------------------------------------------------------
// Tipos de seletor
// ---------------------------------------------------------------------------

type SeletorKind = 'empty' | 'km' | 'cssText' | 'text' | 'postback' | 'css';

interface SeletorSpec {
    kind: SeletorKind;
    css?: string;
    text?: string | null;
    target?: string;
    tag?: string | null;
    id?: string | null;
    name?: string | null;
}

// ---------------------------------------------------------------------------
// Parser de seletor
// ---------------------------------------------------------------------------

/**
 * Analisa um seletor raw e retorna um objeto descrevendo o tipo.
 * Formatos suportados:
 *  - CSS puro: "#ibutUNSPSC"
 *  - CSS + filtro texto: "a#lbutMenu||Descrições"
 *  - KM selector: "km:tag=a;id=lbutMenu;text=descrições"
 *  - Texto global: "text=Descrições"
 *  - Postback: "postback=ctl00$Body$...$lbutMenu"
 */
export function parseSeletor(raw: string): SeletorSpec {
    const s = String(raw ?? '').trim();
    if (!s) return { kind: 'empty' };

    const low = s.toLowerCase();

    if (low.startsWith('km:')) {
        const body = s.slice(3);
        const parts = body.split(';').map((p) => p.trim()).filter(Boolean);
        const obj: Record<string, string> = {};
        for (const p of parts) {
            const [k, ...rest] = p.split('=');
            if (!k) continue;
            obj[k.trim().toLowerCase()] = rest.join('=').trim();
        }
        return {
            kind: 'km',
            tag: (obj['tag'] || '').trim() || null,
            id: (obj['id'] || '').trim() || null,
            name: (obj['name'] || '').trim() || null,
            text: (obj['text'] || '').trim() || null,
        };
    }

    if (s.includes('||')) {
        const [css, text] = s.split('||');
        return { kind: 'cssText', css: (css || '').trim(), text: (text || '').trim() };
    }

    if (low.startsWith('text=')) {
        return { kind: 'text', text: s.slice(5).trim() };
    }

    if (low.startsWith('postback=')) {
        return { kind: 'postback', target: s.slice(9).trim() };
    }

    return { kind: 'css', css: s };
}

// ---------------------------------------------------------------------------
// Busca deep por texto/postback
// ---------------------------------------------------------------------------

function buscarPorTextoDeep(textWanted: string): Element | null {
    const wanted = normalizarTexto(textWanted);
    if (!wanted) return null;

    let found: Element | null = null;
    forEachDoc((doc) => {
        if (found) return;
        const candidatos = [...doc.querySelectorAll('a, button, input[type="button"], input[type="submit"]')];
        const filtrados = filtrarPorTexto(candidatos, wanted);
        found = filtrados[0] || null;
    });
    return found;
}

function buscarPorPostbackDeep(target: string): Element | null {
    if (!target) return null;

    const targetEsc = target.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rx = new RegExp(String.raw`__doPostBack\(\s*['"]${targetEsc}['"]`, 'i');

    let found: Element | null = null;
    forEachDoc((doc) => {
        if (found) return;
        const links = [...doc.querySelectorAll('a[href^="javascript:__doPostBack"]')];
        for (const a of links) {
            if (!elementoVisivel(a as HTMLElement)) continue;
            const href = a.getAttribute('href') || '';
            if (rx.test(href)) {
                found = a;
                return;
            }
        }
    });
    return found;
}

// ---------------------------------------------------------------------------
// Busca deep principal
// ---------------------------------------------------------------------------

/** Busca um único elemento usando qualquer formato de seletor suportado. */
export function buscarElementoDeep(seletor: string): Element | null {
    const spec = parseSeletor(seletor);

    if (spec.kind === 'empty') return null;

    if (spec.kind === 'text') return buscarPorTextoDeep(spec.text ?? '');

    if (spec.kind === 'postback') return buscarPorPostbackDeep(spec.target ?? '');

    if (spec.kind === 'km') {
        let candidatos: Element[] = [];
        forEachDoc((doc) => {
            let local: Element[] = [];
            if (spec.id) {
                const q = `#${cssEscape(spec.id)}`;
                try { local = [...doc.querySelectorAll(q)]; } catch { local = []; }
            } else if (spec.name) {
                const q = `[name="${cssEscape(spec.name)}"]`;
                try { local = [...doc.querySelectorAll(q)]; } catch { local = []; }
            }
            if (spec.tag) local = local.filter((el) => el.tagName?.toLowerCase() === spec.tag!.toLowerCase());
            candidatos.push(...local);
        });

        if (spec.text) candidatos = filtrarPorTexto(candidatos, spec.text);
        else candidatos = candidatos.filter((el) => elementoVisivel(el as HTMLElement));

        return candidatos[0] || null;
    }

    if (spec.kind === 'cssText') {
        const all = buscarElementosDeep(spec.css ?? '');
        const filtrados = filtrarPorTexto(all, spec.text ?? '');
        return filtrados[0] || null;
    }

    if (spec.kind === 'css') {
        const direto = document.querySelector(spec.css!);
        if (direto) return direto;

        for (const iframe of getIframesCached()) {
            try {
                const doc = iframe.contentDocument;
                if (!doc) continue;
                const encontrado = doc.querySelector(spec.css!);
                if (encontrado) return encontrado;
            } catch { /* cross-origin */ }
        }
        return null;
    }

    return null;
}

/** Busca múltiplos elementos. */
export function buscarElementosDeep(seletor: string): Element[] {
    const spec = parseSeletor(seletor);

    if (spec.kind === 'empty') return [];

    if (spec.kind === 'text') {
        const el = buscarPorTextoDeep(spec.text ?? '');
        return el ? [el] : [];
    }

    if (spec.kind === 'postback') {
        const el = buscarPorPostbackDeep(spec.target ?? '');
        return el ? [el] : [];
    }

    if (spec.kind === 'km') {
        const el = buscarElementoDeep(seletor);
        return el ? [el] : [];
    }

    if (spec.kind === 'cssText') {
        const base = buscarElementosDeep(spec.css ?? '');
        return filtrarPorTexto(base, spec.text ?? '');
    }

    const resultados: Element[] = [];
    try { resultados.push(...document.querySelectorAll(spec.css!)); } catch { /* invalid selector */ }
    for (const iframe of getIframesCached()) {
        try {
            const doc = iframe.contentDocument;
            if (!doc) continue;
            resultados.push(...doc.querySelectorAll(spec.css!));
        } catch { /* cross-origin */ }
    }
    return resultados;
}

// ---------------------------------------------------------------------------
// Campo NCM preferido
// ---------------------------------------------------------------------------

/** Localiza campo NCM/NBS com preferência por NCM. */
export function encontrarCampoNcmPreferido(seletorPrimario: string): Element | null {
    const preferidos = [
        '#txtNCMTIPI',
        '#txtNBS',
        'input[name$="txtNCMTIPI"]',
        'input[name$="txtNBS"]',
    ];

    const tentativas: string[] = [];
    const raw = String(seletorPrimario ?? '').trim();

    if (raw) {
        const partes = raw.split(',').map((s) => s.trim()).filter(Boolean);
        if (partes.length === 1) {
            tentativas.push(partes[0]);
        } else {
            partes.forEach((p) => {
                if (!preferidos.includes(p)) tentativas.push(p);
            });
        }
    }

    preferidos.forEach((p) => {
        if (!tentativas.includes(p)) tentativas.push(p);
    });

    for (const sel of tentativas) {
        const el = buscarElementoDeep(sel);
        if (el) return el;
    }

    return null;
}

/** Localiza campo NBS com prioridade para #txtNBS. */
export function encontrarCampoNbsPreferido(): Element | null {
    const tentativas = [
        '#txtNBS',
        'input[name$="txtNBS"]',
        '#txtNCMTIPI',
        'input[name$="txtNCMTIPI"]',
    ];
    for (const sel of tentativas) {
        const el = buscarElementoDeep(sel);
        if (el) return el;
    }
    return null;
}

/** Localiza campo LC116 Grupo (Cat90). */
export function encontrarCampoLei116Grupo(): Element | null {
    const tentativas = [
        'input.Cat90',
        'input[name$="rptCategoriasX$ctl01$txtCat"]',
        '#ctl00_Body_ucTabs_tabFiscal_FISCAL_Categorias_Empresas1_ucCategoriasFlex_rptCategoriasX_ctl01_txtCat',
    ];
    for (const sel of tentativas) {
        const el = buscarElementoDeep(sel);
        if (el) return el;
    }
    return null;
}

/** Localiza campo LC116 SubGrupo (Cat91). */
export function encontrarCampoLei116Subgrupo(): Element | null {
    const tentativas = [
        'input.Cat91',
        'input[name$="rptCategoriasX$ctl02$txtCat"]',
        '#ctl00_Body_ucTabs_tabFiscal_FISCAL_Categorias_Empresas1_ucCategoriasFlex_rptCategoriasX_ctl02_txtCat',
    ];
    for (const sel of tentativas) {
        const el = buscarElementoDeep(sel);
        if (el) return el;
    }
    return null;
}

// ---------------------------------------------------------------------------
// waitForAny — MutationObserver
// ---------------------------------------------------------------------------

interface WaitForAnyOptions {
    root?: Document | Element;
    timeoutMs?: number;
}

/** Espera até que pelo menos um dos seletores esteja presente no DOM. */
export function waitForAny(selectors: string | string[], { root = document, timeoutMs = 8000 }: WaitForAnyOptions = {}): Promise<Element> {
    const selList = Array.isArray(selectors) ? selectors : [selectors];

    const find = (): Element | null => {
        for (const sel of selList) {
            try {
                const el = root.querySelector(sel);
                if (el) return el;
            } catch { /* invalid selector */ }
        }
        return null;
    };

    return new Promise((resolve, reject) => {
        const already = find();
        if (already) return resolve(already);

        const obs = new MutationObserver(() => {
            const el = find();
            if (el) {
                cleanup();
                resolve(el);
            }
        });

        const t = setTimeout(() => {
            cleanup();
            reject(new Error(`Timeout esperando um dos seletores: ${selList.join(' | ')}`));
        }, timeoutMs);

        function cleanup() {
            try { obs.disconnect(); } catch { /* ignore */ }
            clearTimeout(t);
        }

        const node = root === document ? document.documentElement : root;
        obs.observe(node, { childList: true, subtree: true });
    });
}

// ---------------------------------------------------------------------------
// Gerador de seletor único
// ---------------------------------------------------------------------------

/** Gera um seletor CSS/KM único para um elemento. */
export function gerarSeletorUnico(elemento: Element): string {
    const doc = elemento.ownerDocument || document;

    // 1) ID único
    if ((elemento as HTMLElement).id) {
        const idSel = `#${cssEscape((elemento as HTMLElement).id)}`;
        try {
            const count = doc.querySelectorAll(idSel).length;
            if (count === 1) return idSel;

            // ID duplicado → KM selector
            const texto = getTextoElemento(elemento);
            const textoNorm = texto.replaceAll(/\s+/g, ' ').trim();
            const tag = (elemento.tagName || '').toLowerCase();
            if (textoNorm) return `km:tag=${tag};id=${(elemento as HTMLElement).id};text=${textoNorm}`;
            return `km:tag=${tag};id=${(elemento as HTMLElement).id}`;
        } catch { /* ignore */ }
    }

    // 2) Name
    if ((elemento as HTMLInputElement).name) {
        return `[name="${cssEscape((elemento as HTMLInputElement).name)}"]`;
    }

    // 3) Classes
    if (elemento.className && typeof elemento.className === 'string') {
        const classes = elemento.className.trim().split(/\s+/).filter(Boolean).slice(0, 2);
        if (classes.length > 0) {
            const seletor = `${elemento.tagName.toLowerCase()}.${classes.map((c) => cssEscape(c)).join('.')}`;
            try {
                if (doc.querySelectorAll(seletor).length === 1) return seletor;
            } catch { /* ignore */ }
        }
    }

    // 4) Path fallback (nth-of-type)
    const path: string[] = [];
    let current: Element | null = elemento;

    while (current?.tagName) {
        let selector = current.tagName.toLowerCase();

        if ((current as HTMLElement).id) {
            const idSel = `#${cssEscape((current as HTMLElement).id)}`;
            try {
                if (doc.querySelectorAll(idSel).length === 1) {
                    path.unshift(idSel);
                    break;
                }
            } catch { /* ignore */ }
        }

        if (current.parentNode) {
            const parent = current.parentNode as Element;
            const siblings = [...parent.children].filter((c) => c.tagName === current!.tagName);
            if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                selector += `:nth-of-type(${index})`;
            }
        }

        path.unshift(selector);
        current = current.parentNode as Element | null;
    }

    return path.join(' > ');
}
