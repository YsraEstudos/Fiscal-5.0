import * as EstadoManager from '../../../core/estado-manager.ts';
import type { EstadoApp } from '../../../core/estado-manager.ts';
import type { UnspscItemFlags } from './types.ts';

export function getItemKey(estado: EstadoApp): string | null {
    const estadoAny = estado as unknown as Record<string, unknown>;
    return String(estadoAny['itemAtualKey'] || estadoAny['itemAtualTelaId'] || '').trim() || null;
}

export function getUnspscItemFlags(estado: EstadoApp): UnspscItemFlags {
    const itemKey = getItemKey(estado);
    if (!itemKey) return {};
    const estadoAny = estado as unknown as Record<string, unknown>;
    const itemFlags = estadoAny['itemFlags'] as Record<string, UnspscItemFlags> | undefined;
    return itemFlags?.[itemKey] || {};
}

export function updateUnspscItemFlags(estado: EstadoApp, patch: Partial<UnspscItemFlags>): void {
    const itemKey = getItemKey(estado);
    if (!itemKey) return;

    EstadoManager.update((e: EstadoApp) => {
        const eAny = e as unknown as Record<string, unknown>;
        eAny['itemFlags'] = eAny['itemFlags'] || {};
        const flags = eAny['itemFlags'] as Record<string, UnspscItemFlags>;
        const atual = flags[itemKey] || {};
        flags[itemKey] = { ...atual, ...patch };
    });
}

export function limparUnspscInlineFlags(estado: EstadoApp, extras: Partial<UnspscItemFlags> = {}): void {
    updateUnspscItemFlags(estado, {
        unspscModoDetectado: null,
        unspscInlinePostbackTentado: false,
        unspscInlineFallbackTentado: false,
        unspscInlineValorTentado: null,
        ...extras,
    });
}

export function marcarUnspscInlineConcluido(estado: EstadoApp, valorUnspsc: unknown): void {
    updateUnspscItemFlags(estado, {
        unspscFeito: true,
        unspscModoDetectado: 'inline',
        unspscInlinePostbackTentado: false,
        unspscInlineFallbackTentado: false,
        unspscInlineValorTentado: valorUnspsc == null ? null : String(valorUnspsc),
    });
}
