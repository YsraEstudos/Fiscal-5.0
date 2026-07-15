/**
 * Construção do HTML do drawer lateral de controle.
 */

import * as EstadoManager from '../core/estado-manager.ts';
import type { EstadoApp } from '../core/estado-manager.ts';
import { construirListaAcoes as construirListaAcoesPainel } from './painel/painel-actions-renderer.ts';
import { PANEL_ID } from './painel/painel-constants.ts';
import { renderPainelShell } from './painel/painel-shell.ts';
import { injetarEstilosPainel } from './painel/painel-styles.ts';

export function getPainelEl(): HTMLElement | null {
    return document.getElementById(PANEL_ID);
}

export function injetarEstilos(): void {
    injetarEstilosPainel();
}

export function construirPainel(painelMinimizado: boolean): HTMLElement {
    const estado = EstadoManager.get() as EstadoApp;

    const div = document.createElement('div');
    div.id = PANEL_ID;
    div.classList.toggle('is-collapsed', !!painelMinimizado);

    if (estado.painelPosicao?.top) {
        div.style.top = estado.painelPosicao.top;
    }

    div.innerHTML = renderPainelShell(estado, painelMinimizado);

    return div;
}

export function construirListaAcoes(estado: EstadoApp): void {
    construirListaAcoesPainel(estado);
}
