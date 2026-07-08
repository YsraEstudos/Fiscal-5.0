/**
 * Orquestrador da UI do drawer lateral.
 */

import * as EstadoManager from '../core/estado-manager.ts';
import { log } from '../core/log-manager.ts';
import * as AudioManager from '../interaction/audio-manager.ts';
import * as WorkflowExecutor from '../workflow/executor.ts';
import { obterResumoUI } from '../workflow/estimativa.ts';
import { obterResumoTrilhaUI } from '../workflow/item-trace.ts';
import { escapeHtml } from '../utils/misc.ts';
import { injetarEstilos, construirPainel, getPainelEl } from './painel-builder.ts';
import * as FiscalHints from './fiscal-hints.ts';
import { obterEmpresaAtual } from '../validation/empresa-json-requirements.ts';
import { wireEvents } from './painel-events.ts';
import type { EstadoApp } from '../core/estado-manager.ts';

const SAFE_TOP = 12;
const SAFE_MARGIN = 10;

let _painelMinimizado = false;
let _keyboardController: AbortController | null = null;

function atualizarStatusCompacto(estado: EstadoApp): void {
    const el = document.querySelector('.km-drawer-status-compact');
    if (!el) return;

    if (estado.pausado) el.textContent = 'pause';
    else if (estado.ativo) el.textContent = 'run';
    else el.textContent = 'off';
}

function atualizarResumoEstimativa(): void {
    const estado = EstadoManager.get() as EstadoApp;
    const resumo = obterResumoUI(estado);

    const card = document.querySelector('.km-summary-card');
    const resumoEl = document.getElementById('etaResumo');
    const tempoBaseEl = document.getElementById('etaTempoBase');
    const etaRestanteEl = document.getElementById('etaRestante');
    const previsaoEl = document.getElementById('etaPrevisao');
    const primeiroItemEl = document.querySelector('[data-role="eta-primeiro-item"]');

    if (card) card.classList.toggle('is-critical', resumo.pausadoPorReincidencia || false);
    if (resumoEl) Object.assign(resumoEl, { textContent: resumo.pausadoPorReincidencia ? (resumo.mensagemPausa || resumo.resumo) : resumo.resumo });
    if (tempoBaseEl) Object.assign(tempoBaseEl, { textContent: resumo.tempoBaseTexto });
    if (etaRestanteEl) Object.assign(etaRestanteEl, { textContent: resumo.etaRestanteTexto });
    if (previsaoEl) Object.assign(previsaoEl, { textContent: resumo.previsaoTexto });
    if (primeiroItemEl) Object.assign(primeiroItemEl, { textContent: resumo.primeiroItemTexto });
}

function renderEventosTrilha(eventos: any[]): string {
    return eventos.map((evento) => `
        <li class="km-trace-item" data-event-type="${escapeHtml(evento.tipo || '')}">
            <span class="km-trace-time">${escapeHtml(evento.horario || '')}</span>
            <span class="km-trace-copy">${escapeHtml(evento.resumo || '')}</span>
        </li>
    `).join('');
}

export function atualizarTrilhaItem(): void {
    const estado = EstadoManager.get() as EstadoApp;
    const resumo = obterResumoTrilhaUI(estado);
    const card = document.getElementById('itemTraceCard');
    const currentEl = document.getElementById('itemTraceCurrent');
    const listEl = document.getElementById('itemTraceList');
    const emptyEl = document.getElementById('itemTraceEmpty');

    if (card) card.classList.toggle('is-critical', resumo.critical || false);
    if (currentEl) currentEl.textContent = resumo.empty ? 'Sem eventos nesta rodada.' : (resumo.currentLabel || '');

    if (listEl) {
        if (resumo.empty) {
            listEl.innerHTML = '';
            listEl.style.display = 'none';
        } else {
            listEl.innerHTML = renderEventosTrilha(resumo.events || []);
            listEl.style.display = 'flex';
        }
    }

    if (emptyEl) {
        emptyEl.textContent = 'Sem eventos nesta rodada.';
        emptyEl.style.display = resumo.empty ? 'block' : 'none';
    }
}

export function manterPainelVisivel(painel: HTMLElement | null): void {
    if (!painel) return;

    const rect = painel.getBoundingClientRect();
    const maxTop = typeof globalThis !== 'undefined' && globalThis.innerHeight
        ? Math.max(SAFE_TOP, globalThis.innerHeight - rect.height - SAFE_MARGIN)
        : SAFE_TOP;
    const topAtual = Number.parseFloat(painel.style.top || `${rect.top}`) || SAFE_TOP;
    const top = Math.min(Math.max(topAtual, SAFE_TOP), maxTop);

    painel.style.left = `${SAFE_MARGIN}px`;
    painel.style.top = `${top}px`;
    painel.style.right = 'auto';

    EstadoManager.update((e: any) => {
        e.painelPosicao = { top: painel.style.top };
    });
}

export function atualizarIndicadorProgresso(): void {
    const estado = EstadoManager.get() as EstadoApp;
    const resumo = obterResumoUI(estado);
    const container = document.getElementById('progressBar');
    const fill = document.getElementById('progressFill');
    const textEl = document.getElementById('progressText');

    atualizarResumoEstimativa();
    atualizarTrilhaItem();

    if (!container || !fill || !textEl) return;

    if (!estado.ativo) {
        container.style.display = 'none';
        return;
    }

    const total = Number((estado.progresso && estado.progresso.total) || resumo.totalPlanejado || 0);
    const concluidos = Number((estado.progresso && estado.progresso.atual) || 0);
    const pct = total > 0 ? (concluidos / total) * 100 : 0;

    container.style.display = 'block';
    fill.style.width = `${pct}%`;
    textEl.textContent = total > 0
        ? `Concluídos ${concluidos} de ${total} • atual ${resumo.itemAtualId || '—'}`
        : 'Aguardando definição do lote...';
}

export function atualizarBotaoToggle(): void {
    const estado = EstadoManager.get() as EstadoApp;
    const btn = document.getElementById('btnToggle');
    const statusEl = document.getElementById('statusRobo');
    const ultimoErro = estado.estatisticas?.ultimoErro || null;

    atualizarStatusCompacto(estado);
    atualizarTrilhaItem();

    if (!btn) return;

    if (estado.pausado) {
        btn.style.background = 'linear-gradient(135deg, #d97706 0%, #b45309 100%)';
        btn.textContent = 'Retomar';
        if (statusEl) {
            statusEl.textContent = ultimoErro?.tipo === 'reincidencia_etapa'
                ? 'Reincidência detectada. Revisão manual necessária.'
                : 'Pausado (F8 para retomar)';
            statusEl.style.color = ultimoErro?.tipo === 'reincidencia_etapa' ? '#b42318' : '#6c5947';
        }
    } else if (estado.ativo) {
        btn.style.background = 'linear-gradient(135deg, #b42318 0%, #7a271a 100%)';
        btn.textContent = 'Parar robô';
        if (statusEl) {
            statusEl.textContent = 'Executando...';
            statusEl.style.color = '#6c5947';
        }
    } else {
        btn.style.background = 'linear-gradient(135deg, #0e5a48 0%, #0a4336 100%)';
        btn.textContent = 'Iniciar ciclo';
        if (statusEl) {
            statusEl.textContent = 'Aguardando comando.';
            statusEl.style.color = '#6c5947';
        }
    }
}

function tornarArrastavel(elemento: HTMLElement & { _dragController?: AbortController }, handle: HTMLElement): void {
    let isDragging = false;
    let startY = 0;
    let startTop = 0;
    const controller = new AbortController();

    handle.style.cursor = 'move';

    handle.addEventListener('mousedown', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
        isDragging = true;
        startY = e.clientY;
        startTop = elemento.getBoundingClientRect().top;
        e.preventDefault();
    }, { signal: controller.signal });

    document.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isDragging) return;
        elemento.style.left = `${SAFE_MARGIN}px`;
        elemento.style.top = `${startTop + (e.clientY - startY)}px`;
        elemento.style.right = 'auto';
    }, { signal: controller.signal });

    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        manterPainelVisivel(elemento);
    }, { signal: controller.signal });

    elemento._dragController = controller;
}

export function toggleMinimizar(): void {
    const painel = getPainelEl();
    const toggle = document.getElementById('drawerToggle');
    if (!painel || !toggle) return;

    _painelMinimizado = !painel.classList.contains('is-collapsed');
    painel.classList.toggle('is-collapsed', _painelMinimizado);

    EstadoManager.update((e: any) => {
        e.minimizado = _painelMinimizado;
    });

    toggle.textContent = _painelMinimizado ? '»' : '«';
    toggle.title = _painelMinimizado ? 'Expandir' : 'Recolher';

    manterPainelVisivel(painel);
}

let _fiscalHintsObserver: MutationObserver | null = null;
let _fiscalHintsTimer: number | null = null;
let _fiscalHintsGlobalController: AbortController | null = null;

function aplicarDicasFiscaisEstado(): void {
    const estado = EstadoManager.get() as EstadoApp;
    FiscalHints.aplicarDicasFiscais({
        ativo: (estado as any).fiscalHintsAtivo !== false,
        dicas: ((estado as any).fiscalHints || {}) as any,
    }, obterEmpresaAtual());
}

function agendarAplicacaoDicasFiscais(): void {
    if (typeof globalThis === 'undefined') return;
    if (_fiscalHintsTimer != null) globalThis.clearTimeout(_fiscalHintsTimer);
    _fiscalHintsTimer = globalThis.setTimeout(() => {
        _fiscalHintsTimer = null;
        aplicarDicasFiscaisEstado();
    }, 120) as unknown as number;
}

function inicializarDicasFiscaisPagina(): void {
    aplicarDicasFiscaisEstado();

    if (_fiscalHintsObserver) _fiscalHintsObserver.disconnect();
    _fiscalHintsObserver = new MutationObserver((mutations) => {
        const relevante = mutations.some((mutation) => Array.from(mutation.addedNodes).some((node) => {
            if (!(node instanceof HTMLElement)) return false;
            return !!node.querySelector?.('#divDescricaoCompleta .descricao, .descricao[id^="txtD"], #txtDescricao')
                || node.matches?.('#divDescricaoCompleta, .descricao[id^="txtD"], #txtDescricao');
        }));
        if (relevante) agendarAplicacaoDicasFiscais();
    });
    if (document.body) _fiscalHintsObserver.observe(document.body, { childList: true, subtree: true });

    if (_fiscalHintsGlobalController) _fiscalHintsGlobalController.abort();
    _fiscalHintsGlobalController = new AbortController();
    document.addEventListener('click', (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('#km-fiscal-hint-popup') || target.closest('.km-fiscal-hint-mark')) return;
        FiscalHints.fecharPopupDicasFiscais();
    }, { signal: _fiscalHintsGlobalController.signal });
    document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') FiscalHints.fecharPopupDicasFiscais();
    }, { signal: _fiscalHintsGlobalController.signal });
}

function criarPainel(): void {
    if (getPainelEl()) return;

    const estado = EstadoManager.get() as EstadoApp;
    _painelMinimizado = estado.minimizado ?? (typeof globalThis !== 'undefined' && globalThis.innerWidth < 640);

    injetarEstilos();

    const div = construirPainel(_painelMinimizado);
    document.body.appendChild(div);

    const header = document.getElementById('painelHeader');
    if (header) tornarArrastavel(div, header);
    
    manterPainelVisivel(div);

    if (typeof globalThis !== 'undefined') {
        globalThis.addEventListener('resize', () => manterPainelVisivel(getPainelEl()));
    }

    wireEvents(toggleMinimizar);
    const conteudo = document.getElementById('painelConteudo');
    const scrollTopSalvo = Number(estado.painelScrollTop || 0);
    
    if (conteudo && scrollTopSalvo > 0 && typeof globalThis !== 'undefined') {
        const raf = globalThis.requestAnimationFrame || ((cb: Function) => setTimeout(() => cb(Date.now()), 0));
        raf(() => {
            raf(() => {
                conteudo.scrollTop = scrollTopSalvo;
            });
        });
    }
    atualizarBotaoToggle();
    atualizarIndicadorProgresso();
}

function registrarAtalhos(): void {
    if (_keyboardController) _keyboardController.abort();
    _keyboardController = new AbortController();

    document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            WorkflowExecutor.ativarKillSwitch();
        }
        if (e.key === 'F7') {
            e.preventDefault();
            toggleMinimizar();
        }
        if (e.key === 'F8') {
            e.preventDefault();
            const estado = EstadoManager.get() as EstadoApp;
            if (estado.ativo) WorkflowExecutor.togglePausar();
        }
    }, { signal: _keyboardController.signal });
}

function conectarCallbacksUI(): void {
    WorkflowExecutor.setUICallbacks({
        atualizarBotaoToggle,
        atualizarIndicadorProgresso,
    });
}

export function inicializar(): void {
    conectarCallbacksUI();
    criarPainel();
    inicializarDicasFiscaisPagina();
    registrarAtalhos();

    const estado = EstadoManager.get() as EstadoApp;
    if (estado.ativo && !estado.pausado) {
        log('🔄 Retomando execução...', 'info');
        setTimeout(() => WorkflowExecutor.executarCiclo('resume_load'), 700);
    }
}

export function limparTudo(): void {
    const painel = getPainelEl() as any;
    if (painel?._dragController) painel._dragController.abort();
    try { _keyboardController?.abort(); } catch { /* ignore */ }
    try { _fiscalHintsObserver?.disconnect(); } catch { /* ignore */ }
    try { _fiscalHintsGlobalController?.abort(); } catch { /* ignore */ }
    if (_fiscalHintsTimer != null && typeof globalThis !== 'undefined') globalThis.clearTimeout(_fiscalHintsTimer);
    FiscalHints.fecharPopupDicasFiscais();
    AudioManager.fechar();
    WorkflowExecutor.limpar();
}
