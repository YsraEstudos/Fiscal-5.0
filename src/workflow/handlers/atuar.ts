/**
 * Handler: atuar.
 * Extraído do monólito — WorkflowExecutor.handlers.atuar (linhas 3320–3336).
 */

import * as Interacao from '../../interaction/interacao.ts';
import { elementoVisivel } from '../../utils/dom-helpers.ts';
import { buscarElementoDeep } from '../../utils/selectors.ts';
import type { EstadoApp } from '../../core/estado-manager.ts';

export interface AtuarContext {
    getAcao: (id: string, estado: EstadoApp) => { ativo: boolean; seletor: string;[key: string]: unknown };
    workflowState: { reset: () => void;[key: string]: unknown };
}

// ---------------------------------------------------------------------------
export async function atuar(estado: EstadoApp, status: HTMLElement | null, { getAcao, workflowState }: AtuarContext): Promise<boolean> {
    const acaoAtuar = getAcao('atuar', estado);
    if (!acaoAtuar.ativo) return false;

    const btnAtuar = buscarElementoDeep(acaoAtuar.seletor) as HTMLInputElement | null;
    if (!btnAtuar || !elementoVisivel(btnAtuar)) return false;

    const valorBotao = (btnAtuar.value || '').toLowerCase();
    if (!/\batuar\b/.test(valorBotao)) return false;

    if (status) status.textContent = 'Atuar no Item...';

    await Interacao.tentarComRetry(acaoAtuar.seletor, null, 'atuar');

    workflowState.reset();
    return true;
}
