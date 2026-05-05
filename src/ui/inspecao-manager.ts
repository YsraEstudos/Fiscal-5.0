/**
 * Modo inspeção — permite mapear seletores clicando em elementos da página.
 * Extraído do monólito — InspecaoManager IIFE (linhas 4395–4502).
 */

import * as EstadoManager from '../core/estado-manager.ts';
import { log } from '../core/log-manager.ts';
import * as AudioManager from '../interaction/audio-manager.ts';
import { gerarSeletorUnico } from '../utils/selectors.ts';
import { clone, escapeHtml } from '../utils/misc.ts';
import type { EstadoApp } from '../core/estado-manager.ts';

// ---------------------------------------------------------------------------
let _controller: AbortController | null = null;
let _acaoSendoMapeada: string | null = null;

export function ativar(acaoId: string): void {
    if (_controller) desativar();

    _acaoSendoMapeada = acaoId;
    _controller = new AbortController();
    const { signal } = _controller;

    const overlay = document.createElement('div');
    overlay.id = 'inspecao-overlay';
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.25); z-index: 999998; cursor: crosshair;
        display: flex; justify-content: center; align-items: flex-start; padding-top: 20px;
        pointer-events: none;
    `;
    overlay.innerHTML = `
        <div style="background:#fff; padding:15px 25px; border-radius:8px; box-shadow:0 4px 20px rgba(0,0,0,0.3); text-align:center; pointer-events:auto;">
          <div style="font-size:16px; font-weight:bold; color:#0056b3;">🎯 Modo Inspeção</div>
          <div style="font-size:12px; color:#666; margin:8px 0;">Clique no elemento para: <b>${escapeHtml(acaoId)}</b></div>
          <div style="font-size:11px; color:#999; margin:6px 0;">Pressione ESC para cancelar</div>
          <button id="btnCancelarInspecao" style="padding:6px 16px; cursor:pointer;">❌ Cancelar</button>
        </div>
    `;
    document.body.appendChild(overlay);

    let elementoAtual: HTMLElement | null = null;
    let outlineOriginal = '';

    const handleMouseOver = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('#inspecao-overlay') || target.closest('#painel-robo-pro')) return;
        if (elementoAtual && elementoAtual !== target) {
            elementoAtual.style.outline = outlineOriginal;
            elementoAtual.style.boxShadow = '';
        }
        elementoAtual = target;
        outlineOriginal = elementoAtual.style.outline;
        elementoAtual.style.outline = '3px solid #ff0000';
        elementoAtual.style.boxShadow = '0 0 12px rgba(255,0,0,0.6)';
    };

    const handleMouseOut = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (elementoAtual === target) {
            elementoAtual.style.outline = outlineOriginal;
            elementoAtual.style.boxShadow = '';
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            desativar();
        }
    };

    const handleClick = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('#inspecao-overlay')) {
            if (target.id === 'btnCancelarInspecao') desativar();
            return;
        }
        if (target.closest('#painel-robo-pro')) return;

        e.preventDefault();
        e.stopPropagation();

        // Pega o elemento clicável mais próximo
        const alvo = target.closest('a,button,input,select,textarea') || target;

        const seletor = gerarSeletorUnico(alvo as HTMLElement);
        if (_acaoSendoMapeada) {
            _salvarSeletor(_acaoSendoMapeada, seletor);
            log(`🎯 Mapeado: ${_acaoSendoMapeada} → ${seletor}`, 'info');
        }
        
        AudioManager.tocar('success');
        desativar();
    };

    document.addEventListener('mouseover', handleMouseOver, { signal });
    document.addEventListener('mouseout', handleMouseOut, { signal });
    document.addEventListener('keydown', handleKeyDown, { signal });
    document.addEventListener('click', handleClick, { signal, capture: true });

    log(`🔍 Modo inspeção ativado para: ${acaoId}`, 'info');
}

export function desativar(): void {
    if (_controller) {
        _controller.abort();
        _controller = null;
    }
    _acaoSendoMapeada = null;
    document.getElementById('inspecao-overlay')?.remove();
    log('🔍 Modo inspeção desativado', 'info');
}

function _salvarSeletor(acaoId: string, seletor: string): void {
    const estado = EstadoManager.get() as EstadoApp;
    if (estado.acoes && estado.acoes[acaoId]) {
        estado.acoes[acaoId].seletor = seletor;
        estado.perfis[estado.perfilAtivo] = clone(estado.acoes);
        EstadoManager.set(estado);
    }
}
