import * as EstadoManager from '../../../core/estado-manager.ts';
import type { EstadoApp } from '../../../core/estado-manager.ts';
import { getValoresParaItem } from '../../../data/item-map-manager.ts';
import * as ItemTrace from '../../item-trace.ts';
import { getItemKey } from './item-flags.ts';

export function resolverOrigemValorUnspsc(estado: EstadoApp, valorUnspsc: unknown): 'json' | 'perfil' {
    const estadoAny = estado as unknown as Record<string, unknown>;
    const itemId = estadoAny['itemAtualTelaId'] || estadoAny['itemAtualKey'];
    const entry = getValoresParaItem(estado, itemId as string);
    return entry?.unspsc && entry.unspsc === valorUnspsc ? 'json' : 'perfil';
}

export function registrarUnspscPreenchido(estado: EstadoApp, valorUnspsc: unknown, modo?: 'inline'): void {
    EstadoManager.update((e: EstadoApp) => {
        const eAny = e as unknown as Record<string, unknown>;
        ItemTrace.registrarEventoItemAtual(e, 'unspsc_preenchido', {
            itemTelaId: (eAny['itemAtualTelaId'] as string) || (eAny['itemAtualKey'] as string) || null,
            resumo: `UNSPSC digitado com ${valorUnspsc}`,
            payload: {
                valor: valorUnspsc,
                origemValor: resolverOrigemValorUnspsc(e, valorUnspsc),
                ...(modo ? { modo } : {}),
            },
            status: 'em_andamento',
            now: Date.now(),
        });
    });
}

export function registrarUnspscPesquisado(estado: EstadoApp, valorUnspsc: unknown): void {
    EstadoManager.update((e: EstadoApp) => {
        const eAny = e as unknown as Record<string, unknown>;
        ItemTrace.registrarEventoItemAtual(e, 'unspsc_pesquisado', {
            itemTelaId: (eAny['itemAtualTelaId'] as string) || (eAny['itemAtualKey'] as string) || null,
            resumo: 'Pesquisa de UNSPSC executada',
            payload: {
                valor: valorUnspsc,
            },
            status: 'em_andamento',
            now: Date.now(),
        });
    });
}

export function registrarUnspscSelecionado(
    estado: EstadoApp,
    getValorAcao?: (id: string, estado: EstadoApp) => unknown
): void {
    const itemKey = getItemKey(estado);
    if (!itemKey) return;

    EstadoManager.update((e: EstadoApp) => {
        const eAny = e as unknown as Record<string, unknown>;
        eAny['itemFlags'] = eAny['itemFlags'] || {};
        const flags = eAny['itemFlags'] as Record<string, Record<string, unknown>>;
        const atual = flags[itemKey] || {};
        flags[itemKey] = { ...atual, unspscFeito: true };
        ItemTrace.registrarEventoItem(e, itemKey, 'unspsc_selecionado', {
            itemTelaId: (eAny['itemAtualTelaId'] as string) || itemKey,
            resumo: 'UNSPSC selecionado',
            payload: {
                valor: getValorAcao ? getValorAcao('unspsc', e) : null,
            },
            status: 'em_andamento',
            now: Date.now(),
        });
    });
}
