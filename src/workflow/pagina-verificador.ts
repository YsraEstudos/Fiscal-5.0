/**
 * Verificação de estado da página (sessão, modais, loading).
 * Extraído do monólito (linhas 1597–1728).
 */

import { CONFIG } from '../config/constants.ts';
declare var Sys: any;
import * as AspNetLifecycle from '../core/aspnet-lifecycle.ts';
import { normalizarTextoSemAcento, normalizarEspacos } from '../utils/text.ts';
import { elementoVisivel } from '../utils/dom-helpers.ts';
import { buscarElementoDeep } from '../utils/selectors.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type TipoAviso = 'reincidencia_etapa' | 'ncm_invalido' | 'nbs_invalido';

export interface AvisoCritico {
    fonte: string;
    mensagem: string;
    tipo: TipoAviso;
    numeroExecucoes?: number;
}

export interface PaginaOcupadaResult {
    ocupado: boolean;
    motivo?: string;
}

export interface ConfirmacaoResult {
    modalAberto: boolean;
    btnSim: Element | null;
    btnSimContinuar: Element | null;
}

export interface ItensPendentesInfo {
    elegiveis: Element[];
    ignorados: number;
}

export interface TotalPendentesServidor {
    primeiro: number | null;
    ultimo: number | null;
    total: number;
    texto: string;
}

export type UnspscModo = 'modal' | 'inline' | 'none';

// ---------------------------------------------------------------------------
// Detecção de mensagens NCM/NBS
// ---------------------------------------------------------------------------
export function isMensagemNcmInvalido(texto: string): boolean {
    const t = normalizarTextoSemAcento(texto || '');
    return t.includes('ncm informado') && t.includes('invalido');
}

export function isMensagemNbsInvalido(texto: string): boolean {
    const t = normalizarTextoSemAcento(texto || '');
    return t.includes('nbs informado') && t.includes('invalido');
}

function extrairNumeroExecucoes(texto: string): number | null {
    const normalizado = normalizarTextoSemAcento(texto || '').replaceAll(/[ºª]/g, ' ');
    const match = normalizado.match(/\b(\d+)\b/);
    if (!match?.[1]) return null;
    const numero = Number.parseInt(match[1], 10);
    return Number.isFinite(numero) ? numero : null;
}

export function detectarAvisoCritico(): AvisoCritico | null {
    const lblExecucoes = buscarElementoDeep('#lblExecucoes');
    const textoExecucoes = normalizarEspacos((lblExecucoes as HTMLElement)?.textContent || '');
    if (lblExecucoes && elementoVisivel(lblExecucoes as HTMLElement) && textoExecucoes) {
        const numeroExecucoes = extrairNumeroExecucoes(textoExecucoes);
        if (numeroExecucoes != null && numeroExecucoes >= 2) {
            return {
                fonte: 'lblExecucoes',
                mensagem: textoExecucoes,
                tipo: 'reincidencia_etapa',
                numeroExecucoes,
            };
        }
    }

    const campo = buscarElementoDeep('#txtDescricaNCM') ||
        buscarElementoDeep('textarea[name$="txtDescricaNCM"]');
    const valor = (campo as HTMLTextAreaElement)?.value ?? (campo as HTMLElement)?.textContent ?? '';

    if (valor && isMensagemNcmInvalido(valor)) {
        return { fonte: 'textarea', mensagem: String(valor).trim(), tipo: 'ncm_invalido' };
    }
    if (valor && isMensagemNbsInvalido(valor)) {
        return { fonte: 'textarea', mensagem: String(valor).trim(), tipo: 'nbs_invalido' };
    }
    return null;
}

// ---------------------------------------------------------------------------
// Verificações de sessão e página
// ---------------------------------------------------------------------------
export function verificarSessao(): boolean {
    if (!document.body) return true;
    const textoBody = (document.body.textContent || '').toLowerCase();
    return !CONFIG.MENSAGENS.LOGOUT.some((ind: string) => textoBody.includes(ind));
}

export function paginaOcupada(): PaginaOcupadaResult {
    if (AspNetLifecycle.isBusy()) return { ocupado: true, motivo: 'asp_lifecycle_busy' };

    if (typeof Sys !== 'undefined' && (Sys as { WebForms?: { PageRequestManager?: { getInstance?: () => { get_isInAsyncPostBack?: () => boolean } } } }).WebForms?.PageRequestManager) {
        try {
            const prm = (Sys as { WebForms: { PageRequestManager: { getInstance: () => { get_isInAsyncPostBack?: () => boolean } } } }).WebForms.PageRequestManager.getInstance();
            if (prm?.get_isInAsyncPostBack?.()) return { ocupado: true, motivo: 'asp_async_postback' };
        } catch { /* ignore */ }
    }

    const loadContainer = document.querySelector('.load');
    if (loadContainer && elementoVisivel(loadContainer as HTMLElement)) {
        const overlay = loadContainer.querySelector('.overlay');
        const loadBar = loadContainer.querySelector('.load-bar');
        if ((overlay && elementoVisivel(overlay as HTMLElement)) || (loadBar && elementoVisivel(loadBar as HTMLElement))) {
            return { ocupado: true, motivo: 'visual_overlay' };
        }
    }

    return { ocupado: false };
}

// ---------------------------------------------------------------------------
// Modais de confirmação / UNSPSC
// ---------------------------------------------------------------------------
export function obterConfirmacao(): ConfirmacaoResult {
    const modalConfirmacao =
        buscarElementoDeep('#dt_edita_div') ||
        buscarElementoDeep('#divAcao') ||
        buscarElementoDeep('#ControlesConfirmacao');

    const btnSim = buscarElementoDeep('#butSim') || buscarElementoDeep('input[name$="butSim"]');
    const btnSimContinuar = buscarElementoDeep('#butSimContinuar') || buscarElementoDeep('input[name$="butSimContinuar"]');

    const modalAberto =
        (modalConfirmacao && elementoVisivel(modalConfirmacao as HTMLElement)) ||
        (btnSim && elementoVisivel(btnSim as HTMLElement)) ||
        (btnSimContinuar && elementoVisivel(btnSimContinuar as HTMLElement));

    return { modalAberto: !!modalAberto, btnSim, btnSimContinuar };
}

export function getModalUnspscContainer(): Element | null {
    return buscarElementoDeep('#div1');
}

export function isModalUnspscAberto(seletorCampo: string, seletorSelecionar: string): boolean {
    const modalDiv1 = getModalUnspscContainer();
    const modalTable = buscarElementoDeep('#tableUNSPSC');
    const campoUnspsc = buscarElementoDeep(seletorCampo);
    const btnSelecionar = buscarElementoDeep(seletorSelecionar);

    return !!(
        (modalDiv1 && elementoVisivel(modalDiv1 as HTMLElement)) ||
        (modalTable && elementoVisivel(modalTable as HTMLElement)) ||
        (campoUnspsc && elementoVisivel(campoUnspsc as HTMLElement)) ||
        (btnSelecionar && elementoVisivel(btnSelecionar as HTMLElement))
    );
}

export function detectarModoUnspsc(_seletorCampo: string = '', seletorSelecionar: string = '#butFechar'): UnspscModo {
    const campoInline = buscarElementoDeep('#txtCodUNSPSC, input[name$="txtCodUNSPSC"]');
    const descricaoInline = buscarElementoDeep('#txtUNSPSC, input[name$="txtUNSPSC"]');
    if (
        campoInline
        && elementoVisivel(campoInline as HTMLElement)
        && descricaoInline
    ) {
        return 'inline';
    }

    const modalDiv1 = getModalUnspscContainer();
    const modalTable = buscarElementoDeep('#tableUNSPSC');
    const campoModal = buscarElementoDeep('#txtCodigoUnspsc, input[name$="txtCodigoUnspsc"]');
    const btnSelecionar = buscarElementoDeep(seletorSelecionar);
    const resultado = buscarElementoDeep('#txtDescricao, a[id="txtDescricao"]');
    if (
        (modalDiv1 && elementoVisivel(modalDiv1 as HTMLElement))
        || (modalTable && elementoVisivel(modalTable as HTMLElement))
        || (campoModal && elementoVisivel(campoModal as HTMLElement))
        || (btnSelecionar && elementoVisivel(btnSelecionar as HTMLElement))
        || (resultado && elementoVisivel(resultado as HTMLElement))
    ) {
        return 'modal';
    }

    return 'none';
}

export function unspscDescricaoDefinida(): boolean {
    const campoDescricao = buscarElementoDeep('#txtUNSPSC, input[name$="txtUNSPSC"]') as HTMLInputElement | null;
    const valor = normalizarTextoSemAcento(
        (campoDescricao as HTMLInputElement | null)?.value
        ?? campoDescricao?.getAttribute?.('value')
        ?? ''
    );

    if (!valor) return false;
    return !valor.includes('nao definido');
}

// ---------------------------------------------------------------------------
// Itens pendentes
// ---------------------------------------------------------------------------
export function isItemEmAtuacao(linkEl: Element | null): boolean {
    if (!linkEl) return false;

    const card = linkEl.closest('.result') || linkEl.closest('[class*="result"]');
    if (!card) return false;

    const classTokens = String((card as HTMLElement).className || '')
        .split(/\s+/)
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean);

    if (classTokens.includes('ematuacao')) return true;

    const textoCard = normalizarTextoSemAcento((card as HTMLElement).textContent || '');
    return textoCard.includes('em atuacao');
}

export function encontrarItensPendentesInfo(): ItensPendentesInfo {
    const root = document.querySelector('#DIVResultado');
    if (!root) return { elegiveis: [], ignorados: 0 };

    const linksVisiveis = [...root.querySelectorAll('a[href*="abreSIN("]')]
        .filter((el) => elementoVisivel(el as HTMLElement));

    let ignorados = 0;
    const elegiveis = linksVisiveis.filter((el) => {
        const emAtuacao = isItemEmAtuacao(el);
        if (emAtuacao) ignorados++;
        return !emAtuacao;
    });

    return { elegiveis, ignorados };
}

export function encontrarItensPendentes(): Element[] {
    return encontrarItensPendentesInfo().elegiveis;
}

export function extrairItemKey(link: Element | null): string | null {
    const href = link?.getAttribute?.('href') || '';
    const m = href.match(/abreSIN\(([^)]*)\)/i);
    if (!m) return null;
    const args = m[1].split(',').map((s) => s.trim());
    return args[0]?.replace(/^['"]|['"]$/g, '') || null;
}

export function parseTotalPendentesServidor(texto: string): TotalPendentesServidor | null {
    const raw = normalizarEspacos(texto || '');
    if (!raw) return null;
    const match = raw.match(/Exibindo\s+SIN\s+(\d+)\s+a\s+(\d+)\s+de\s+um\s+total\s+de\s+(\d+)/i);
    if (!match) return null;
    const primeiro = Number.parseInt(match[1], 10);
    const ultimo = Number.parseInt(match[2], 10);
    const total = Number.parseInt(match[3], 10);
    if (!Number.isFinite(total) || total < 0) return null;
    return {
        primeiro: Number.isFinite(primeiro) ? primeiro : null,
        ultimo: Number.isFinite(ultimo) ? ultimo : null,
        total,
        texto: raw,
    };
}

export function obterResumoPendentesServidor(): TotalPendentesServidor | null {
    const candidatos = [
        '#lblExibicaoItens',
        '#lblPaginacao',
        '#lblPaginador',
        '.grid-pager',
        '.pager',
        '#DIVResultado',
        'body',
    ];
    for (const seletor of candidatos) {
        const el = seletor === 'body' ? document.body : document.querySelector(seletor);
        const texto = normalizarEspacos(el?.textContent || '');
        if (!texto) continue;
        const parsed = parseTotalPendentesServidor(texto);
        if (parsed) return parsed;
    }
    return null;
}
