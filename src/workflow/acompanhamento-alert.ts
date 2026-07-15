export type AcompanhamentoScanStatus = 'absent' | 'loading' | 'ready';

export interface AcompanhamentoAlert {
    matches: string[];
    evidence: string;
    element: HTMLElement;
}

export interface AcompanhamentoScanResult {
    status: AcompanhamentoScanStatus;
    alert: AcompanhamentoAlert | null;
}

const LAYOUT_SELECTOR = '.km-sin-layout[data-km-sin-root="1"]';
const ATTENTION_SELECTOR = '.km-sin-item.is-attention';
const ATTENTION_WORD_PATTERN = /\b(UNSPSC|NSPSC|NCM|NBS|NC|LEI)\b/gi;
const NCM_CODE_PATTERN = /(?<![\d.])\d{4}(?:[.\s]\d{2}){2}\b/g;
const NBS_CODE_PATTERN = /\b\d{1,2}[.\s]\d{4}[.\s]\d{2}[.\s]\d{2}\b/g;

function normalizeSpaces(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function normalizeItemId(value: unknown): string | null {
    const normalized = String(value ?? '').trim();
    return normalized || null;
}

function findViewRoot(itemId: string | null): ParentNode {
    const roots = Array.from(document.querySelectorAll<HTMLElement>('#UpdatePanel1 .kl-view, .kl-view'));
    if (roots.length === 0) return document;

    if (itemId) {
        const exactRoot = roots.find((root) => {
            const field = root.querySelector<HTMLInputElement>('#txtNumero, #txtIdItem, input[name$="txtNumero"], input[name$="txtIdItem"]');
            return normalizeItemId(field?.value ?? field?.getAttribute('value')) === itemId;
        });
        if (exactRoot) return exactRoot;
    }

    return roots.find((root) => root.querySelector(LAYOUT_SELECTOR)) || roots[0];
}

function textWithoutLinks(element: Element): string {
    const clone = element.cloneNode(true) as Element;
    clone.querySelectorAll('a').forEach((link) => link.remove());
    return normalizeSpaces(clone.textContent || '');
}

function getCardEvidence(card: HTMLElement): string {
    const sourceNodes = Array.from(card.querySelectorAll<HTMLElement>('.km-sin-desc, .km-sin-note'));
    const sources = sourceNodes.length > 0 ? sourceNodes : [card];
    return normalizeSpaces(sources.map(textWithoutLinks).filter(Boolean).join(' ')).slice(0, 300);
}

function getAttentionMatches(evidence: string): string[] {
    const matches: string[] = [];
    const seen = new Set<string>();
    const add = (value: string): void => {
        const normalized = normalizeSpaces(value).toUpperCase();
        if (!normalized || seen.has(normalized)) return;
        seen.add(normalized);
        matches.push(normalized);
    };

    for (const match of evidence.matchAll(ATTENTION_WORD_PATTERN)) {
        add(match[1]);
    }
    for (const match of evidence.matchAll(NCM_CODE_PATTERN)) {
        add(match[0]);
    }
    for (const match of evidence.matchAll(NBS_CODE_PATTERN)) {
        add(match[0]);
    }

    return matches;
}

function isLoading(layout: HTMLElement): boolean {
    const stateText = layout.querySelector<HTMLElement>('.km-sin-state')?.textContent || '';
    const bodyText = layout.querySelector<HTMLElement>('.km-sin-body')?.textContent || '';
    return /\b(carregando|buscando)\b/i.test(`${stateText} ${bodyText}`);
}

export function scanAcompanhamento(itemId?: string | null): AcompanhamentoScanResult {
    const scope = findViewRoot(normalizeItemId(itemId));
    const layouts = Array.from(scope.querySelectorAll<HTMLElement>(LAYOUT_SELECTOR));
    const visibleLayouts = layouts.filter((layout) => {
        const aside = layout.querySelector<HTMLElement>('.km-sin-aside');
        return !aside || !aside.hidden;
    });

    if (visibleLayouts.length === 0) {
        return { status: 'absent', alert: null };
    }

    for (const layout of visibleLayouts) {
        for (const card of Array.from(layout.querySelectorAll<HTMLElement>(ATTENTION_SELECTOR))) {
            const evidence = getCardEvidence(card);
            const matches = getAttentionMatches(evidence);
            if (matches.length > 0) {
                return {
                    status: 'ready',
                    alert: { matches, evidence, element: card },
                };
            }
        }
    }

    if (visibleLayouts.some(isLoading)) {
        return { status: 'loading', alert: null };
    }

    return { status: 'ready', alert: null };
}
