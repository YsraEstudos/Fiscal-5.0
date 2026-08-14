/**
 * Handlers UNSPSC: unspsc, lupaUnspsc, pesquisar, resultado, selecionar.
 * Fachada dos fluxos modal e inline de UNSPSC.
 */

import { CONFIG } from '../../config/constants.ts';
import type { EstadoApp } from '../../core/estado-manager.ts';
import { log } from '../../core/log-manager.ts';
import * as CooldownManager from '../../core/cooldown-manager.ts';
import { sleep } from '../../utils/misc.ts';
import * as Interacao from '../../interaction/interacao.ts';
import { waitForAny } from '../../utils/selectors.ts';
import type {
    LupaContext,
    PesquisarContext,
    ResultadoContext,
    SelecionarContext,
    UnspscContext,
} from './unspsc/types.ts';
import {
    getUnspscItemFlags,
    marcarUnspscInlineConcluido,
    updateUnspscItemFlags,
} from './unspsc/item-flags.ts';
import {
    botaoUnspscInlineVisivel,
    descricaoUnspscInlineDefinida,
    dispararPostbackInline,
    extrairTargetPostbackInline,
    obterCampoUnspscInline,
    pausarFalhaUnspscInline,
} from './unspsc/inline.ts';
import {
    buscarElementoVisivel,
    buscarResultadoUnspscVisivel,
    campoVisivel,
    checkboxUnspscMarcado,
    obterCampoUnspscModal,
    obterModoUnspsc,
} from './unspsc/modal.ts';
import {
    registrarUnspscPesquisado,
    registrarUnspscPreenchido,
    registrarUnspscSelecionado,
} from './unspsc/trace.ts';

// ---------------------------------------------------------------------------
export async function selecionar(estado: EstadoApp, status: HTMLElement | null, { getAcao, workflowState, isModalUnspscAberto, getUnspscModo, getValorAcao }: SelecionarContext): Promise<boolean> {
    const acaoSelecionar = getAcao('selecionar', estado);
    if (!acaoSelecionar.ativo) return false;

    const acaoUnspsc = getAcao('unspsc', estado);
    if (!acaoUnspsc.ativo) return false;

    if (workflowState.isCompleta('selecionar')) return false;

    workflowState.debugLogThrottled?.(
        'selecionar_tick',
        `▶ SELECIONAR: Iniciando verificação ${workflowState.getStatus?.()}`,
        3000
    );

    if (obterModoUnspsc(estado, getAcao, getUnspscModo) === 'inline') return false;

    const modalAberto = isModalUnspscAberto(acaoUnspsc.seletor, acaoSelecionar.seletor);
    const btnSelecionar = buscarElementoVisivel(acaoSelecionar.seletor);
    const podeSelecionar = workflowState.unspscSelecionado || checkboxUnspscMarcado();

    if (modalAberto && podeSelecionar && btnSelecionar) {
        if (status) status.textContent = 'Selecionando UNSPSC...';
        const ok = await Interacao.interagir(btnSelecionar, null, 'selecionar');
        if (!ok) return false;

        workflowState.marcarCompleta('selecionar');
        workflowState.unspscSelecionado = false;
        registrarUnspscSelecionado(estado, getValorAcao);

        CooldownManager.set('posSelecionar', CONFIG.DELAYS.POS_SELECIONAR_COOLDOWN);
        log('✅ UNSPSC selecionado', 'info');
        return true;
    }

    return false;
}

// ---------------------------------------------------------------------------
export async function resultado(estado: EstadoApp, status: HTMLElement | null, { getAcao, workflowState, isModalUnspscAberto, getUnspscModo }: ResultadoContext): Promise<boolean> {
    const acaoResultado = getAcao('resultado', estado);
    if (!acaoResultado.ativo) return false;

    if (obterModoUnspsc(estado, getAcao, getUnspscModo) === 'inline') return false;

    if (workflowState.unspscSelecionado) return false;
    if (workflowState.isCompleta('selecionar')) return false;
    if (CooldownManager.isAtivo('posSelecionar')) return false;
    if (CooldownManager.isAtivo('resultado')) return false;

    if (checkboxUnspscMarcado()) {
        workflowState.unspscSelecionado = true;
        return false;
    }

    const acaoUnspsc = getAcao('unspsc', estado);
    const acaoSelecionar = getAcao('selecionar', estado);
    const modalAberto = isModalUnspscAberto(acaoUnspsc.seletor, acaoSelecionar.seletor);
    const resultadoEl = buscarResultadoUnspscVisivel(acaoResultado.seletor);
    const podeClic = workflowState.unspscPesquisado || resultadoEl;

    if (modalAberto && podeClic && resultadoEl) {
        if (status) status.textContent = 'Clicando no resultado...';
        await Interacao.interagir(resultadoEl, null, 'resultado');
        workflowState.unspscSelecionado = true;
        CooldownManager.set('resultado', CONFIG.DELAYS.RESULTADO_COOLDOWN);
        CooldownManager.limpar('aguardandoResultados');
        return true;
    }

    return false;
}

// ---------------------------------------------------------------------------
export async function pesquisar(estado: EstadoApp, status: HTMLElement | null, { getAcao, workflowState, getModalUnspscContainer, valoresSaoIguais, getValorAcao, getUnspscModo, pausarComAviso }: PesquisarContext): Promise<boolean> {
    const acaoPesquisar = getAcao('pesquisar', estado);
    const acaoUnspsc = getAcao('unspsc', estado);
    const valorUnspsc = getValorAcao('unspsc', estado);

    if (!acaoPesquisar.ativo || !acaoUnspsc.ativo) return false;

    if (workflowState.unspscPesquisado) return false;
    if (workflowState.unspscSelecionado) return false;
    if (workflowState.isCompleta('selecionar')) return false;
    if (CooldownManager.isAtivo('posSelecionar')) return false;

    const modo = obterModoUnspsc(estado, getAcao, getUnspscModo);
    if (modo === 'inline') {
        if (descricaoUnspscInlineDefinida()) {
            marcarUnspscInlineConcluido(estado, valorUnspsc, workflowState);
            return false;
        }

        const flags = getUnspscItemFlags(estado);
        if (!flags.unspscInlinePostbackTentado) return false;

        if (flags.unspscInlineFallbackTentado) {
            return pausarFalhaUnspscInline(pausarComAviso, valorUnspsc);
        }

        const botaoInline = botaoUnspscInlineVisivel();
        if (!botaoInline) return false;

        if (status) status.textContent = 'Acionando validação inline do UNSPSC...';
        updateUnspscItemFlags(estado, {
            unspscModoDetectado: 'inline',
            unspscInlineFallbackTentado: true,
            unspscInlineValorTentado: valorUnspsc == null ? null : String(valorUnspsc),
        });
        const ok = await Interacao.interagir(botaoInline, null, 'pesquisar');
        if (!ok) return false;
        return true;
    }

    const campoUnspsc = obterCampoUnspscModal(acaoUnspsc.seletor, getModalUnspscContainer);
    if (!campoVisivel(campoUnspsc)) return false;
    if (!campoUnspsc) return false;

    if (!workflowState.unspscValorDigitado) return false;
    if (!valoresSaoIguais(campoUnspsc.value, valorUnspsc)) return false;

    if (CooldownManager.isAtivo('aguardandoResultados')) {
        if (status) status.textContent = 'Aguardando resultados...';
        return false;
    }

    const btnPesquisar = buscarElementoVisivel(acaoPesquisar.seletor);
    if (btnPesquisar) {
        if (status) status.textContent = 'Pesquisando...';
        const ok = await Interacao.interagir(btnPesquisar, null, 'pesquisar');
        if (!ok) return false;
        workflowState.unspscPesquisado = true;
        CooldownManager.set('aguardandoResultados', CONFIG.DELAYS.RESULTADOS_TIMEOUT);
        registrarUnspscPesquisado(estado, valorUnspsc);
        return true;
    }

    return false;
}

// ---------------------------------------------------------------------------
export async function unspsc(estado: EstadoApp, status: HTMLElement | null, { getAcao, workflowState, getModalUnspscContainer, valoresSaoIguais, getValorAcao, getUnspscModo, pausarComAviso }: UnspscContext): Promise<boolean> {
    const acaoUnspsc = getAcao('unspsc', estado);
    const valorUnspsc = getValorAcao('unspsc', estado);

    if (!acaoUnspsc.ativo) return false;
    if (workflowState.isCompleta('selecionar')) return false;
    if (CooldownManager.isAtivo('posSelecionar')) return false;

    const modo = obterModoUnspsc(estado, getAcao, getUnspscModo);
    if (modo === 'inline') {
        if (descricaoUnspscInlineDefinida()) {
            workflowState.unspscValorDigitado = true;
            marcarUnspscInlineConcluido(estado, valorUnspsc, workflowState);
            return false;
        }

        const flags = getUnspscItemFlags(estado);
        if (flags.unspscInlinePostbackTentado) {
            if (flags.unspscInlineFallbackTentado) {
                return pausarFalhaUnspscInline(pausarComAviso, valorUnspsc);
            }
            return false;
        }

        const campoInline = obterCampoUnspscInline();
        if (!campoVisivel(campoInline)) return false;
        if (!campoInline) return false;

        if (status) status.textContent = 'Digitando UNSPSC...';
        if (!valoresSaoIguais(campoInline.value, valorUnspsc)) {
            await Interacao.digitarSilencioso(campoInline, valorUnspsc as string);
            await sleep(150);
        }

        workflowState.unspscValorDigitado = true;
        updateUnspscItemFlags(estado, {
            unspscModoDetectado: 'inline',
            unspscInlinePostbackTentado: true,
            unspscInlineFallbackTentado: false,
            unspscInlineValorTentado: valorUnspsc == null ? null : String(valorUnspsc),
        });

        registrarUnspscPreenchido(estado, valorUnspsc, 'inline');

        const target = extrairTargetPostbackInline(campoInline);
        if (!target) {
            updateUnspscItemFlags(estado, { unspscInlinePostbackTentado: false });
            log('⚠️ Não foi possível identificar o target do postback inline do UNSPSC', 'warn');
            return false;
        }

        const disparou = dispararPostbackInline(campoInline, target);
        if (!disparou) {
            updateUnspscItemFlags(estado, { unspscInlinePostbackTentado: false });
            log('⚠️ Falha ao disparar postback inline do UNSPSC', 'warn');
            return false;
        }
        return true;
    }

    if (workflowState.unspscValorDigitado) return false;

    const campoUnspsc = obterCampoUnspscModal(acaoUnspsc.seletor, getModalUnspscContainer);
    if (!campoVisivel(campoUnspsc)) return false;
    if (!campoUnspsc) return false;

    if (!valoresSaoIguais(campoUnspsc.value, valorUnspsc)) {
        if (status) status.textContent = 'Digitando UNSPSC...';

        const ok = await Interacao.interagir(campoUnspsc, valorUnspsc as string, 'unspsc');
        if (!ok) return false;

        workflowState.unspscValorDigitado = true;
        registrarUnspscPreenchido(estado, valorUnspsc);
        return true;
    }

    return false;
}

// ---------------------------------------------------------------------------
export async function lupaUnspsc(estado: EstadoApp, status: HTMLElement | null, { getAcao, workflowState, getModalUnspscContainer, isModalUnspscAberto, getUnspscModo }: LupaContext): Promise<boolean> {
    const acaoLupa = getAcao('lupaUnspsc', estado);
    const acaoUnspsc = getAcao('unspsc', estado);

    if (!acaoLupa.ativo || !acaoUnspsc.ativo) return false;

    if (obterModoUnspsc(estado, getAcao, getUnspscModo) === 'inline') return false;

    if (getUnspscItemFlags(estado).unspscFeito) return false;

    if (workflowState.isCompleta('selecionar')) return false;
    if (CooldownManager.isAtivo('posSelecionar')) return false;

    const acaoSelecionar = getAcao('selecionar', estado);
    const modalAberto = isModalUnspscAberto(acaoUnspsc.seletor, acaoSelecionar.seletor);
    const campoUnspsc = obterCampoUnspscModal(acaoUnspsc.seletor, getModalUnspscContainer);
    const campoUnspscVisivel = campoVisivel(campoUnspsc);

    if (!campoUnspscVisivel && !modalAberto) {
        if (CooldownManager.isAtivo('lupa')) return true;

        const lupa = buscarElementoVisivel(acaoLupa.seletor);

        if (lupa) {
            const maxRetries = CONFIG.RETRY.MAX_TENTATIVAS;
            workflowState._lupaRetryCount = ((workflowState._lupaRetryCount as number) || 0) + 1;
            if ((workflowState._lupaRetryCount as number) > maxRetries) {
                log(`❌ Lupa UNSPSC: ${maxRetries} tentativas sem sucesso — desistindo`, 'error');
                workflowState._lupaRetryCount = 0;
                return false;
            }

            if (status) status.textContent = `Abrindo busca UNSPSC (tentativa ${workflowState._lupaRetryCount}/${maxRetries})...`;
            CooldownManager.set('lupa', CONFIG.DELAYS.LUPA_COOLDOWN);

            workflowState.unspscValorDigitado = false;
            workflowState.unspscPesquisado = false;
            workflowState.unspscSelecionado = false;

            await Interacao.interagir(lupa, null, 'lupaUnspsc');

            try {
                await waitForAny(
                    ['#tableUNSPSC', '#div1', acaoUnspsc.seletor, acaoSelecionar.seletor],
                    { root: document, timeoutMs: 12000 }
                );
                workflowState._lupaRetryCount = 0;
            } catch {
                await sleep(CONFIG.DELAYS.UNSPSC_MODAL);
            }

            return true;
        }

        log('⚠️ Lupa UNSPSC não encontrada/visível para clique', 'warn');
    } else if (modalAberto && !campoUnspscVisivel) {
        if (status) status.textContent = 'Carregando modal...';
        await sleep(150);
        return true;
    }

    return false;
}
