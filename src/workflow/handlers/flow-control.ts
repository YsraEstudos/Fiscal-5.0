/**
 * Handlers de controle de fluxo: confirmar, prosseguir.
 * Extraído do monólito — WorkflowExecutor.handlers (linhas 3294–3318, 3840–3897).
 */

import * as EstadoManager from '../../core/estado-manager.ts';
import type { EstadoApp } from '../../core/estado-manager.ts';
import { log } from '../../core/log-manager.ts';
import * as AudioManager from '../../interaction/audio-manager.ts';
import * as Interacao from '../../interaction/interacao.ts';
import * as PaginaVerificador from '../pagina-verificador.ts';
import * as Estimativa from '../estimativa.ts';
import * as ItemTrace from '../item-trace.ts';
import * as Validador from '../../validation/validador.ts';
import { elementoVisivel } from '../../utils/dom-helpers.ts';
import { buscarElementoDeep } from '../../utils/selectors.ts';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
export interface HandlerContext {
    getAcao: (id: string, estado: EstadoApp) => { ativo: boolean; seletor: string; valor: string | null;[key: string]: unknown };
    getValorAcao: (id: string, estado: EstadoApp) => unknown;
    workflowState: {
        isCompleta: (fase: string) => boolean;
        reset: () => void;
        [key: string]: unknown;
    };
    itemJaTemUnspsc: (estado: EstadoApp) => boolean;
    marcarItemConcluido?: (estado: EstadoApp, itemKey: string | null, opts?: { now?: number }) => ReturnType<typeof Estimativa.registrarConclusaoItem> | null;
    [key: string]: unknown;
}

// Injetado pelo executor para evitar dependência circular
let _atualizarBotaoToggle: () => void = () => { };
export function setAtualizarBotaoToggle(fn: () => void): void { _atualizarBotaoToggle = fn; }

// ---------------------------------------------------------------------------
export async function confirmar(estado: EstadoApp, status: HTMLElement | null, { getAcao, getValorAcao }: HandlerContext): Promise<boolean> {
    const acaoConfirmar = getAcao('confirmar', estado);
    if (!acaoConfirmar.ativo) return false;

    const confirmacao = PaginaVerificador.obterConfirmacao();
    if (!confirmacao.modalAberto) return false;

    const btnSim =
        (confirmacao.btnSim && elementoVisivel(confirmacao.btnSim as HTMLElement)) ? confirmacao.btnSim :
            (confirmacao.btnSimContinuar && elementoVisivel(confirmacao.btnSimContinuar as HTMLElement)) ? confirmacao.btnSimContinuar :
                null;

    if (!btnSim) return true;

    if (!Validador.validarAcoesObrigatorias(
        () => EstadoManager.get() as unknown as Record<string, unknown>,
        (id: string, e: Record<string, unknown>) => getValorAcao(id, e as unknown as EstadoApp),
        (msg: string, level: string) => log(msg, level as any),
        AudioManager.tocar
    )) {
        log('⚠️ Confirmação bloqueada - validação falhou', 'warn');
        EstadoManager.update((e: EstadoApp) => { e.pausado = true; });
        _atualizarBotaoToggle();
        return true;
    }

    if (status) status.textContent = 'Confirmando...';
    await Interacao.interagir(btnSim as HTMLElement, null, 'confirmar');
    return true;
}

// ---------------------------------------------------------------------------
export async function prosseguir(estado: EstadoApp, status: HTMLElement | null, { getAcao, getValorAcao, workflowState, itemJaTemUnspsc, marcarItemConcluido }: HandlerContext): Promise<boolean> {
    const acaoUnspscCheck = getAcao('unspsc', estado);
    if (acaoUnspscCheck.ativo) {
        const itemKey = estado.itemAtualKey as string | undefined;
        let unspscFeito = !!(itemKey && (estado.itemFlags as Record<string, Record<string, unknown>>)?.[itemKey]?.['unspscFeito']);

        if (!unspscFeito && !workflowState.isCompleta('selecionar') && itemJaTemUnspsc(estado)) {
            unspscFeito = true;
            if (itemKey) {
                EstadoManager.update((e: EstadoApp) => {
                    const eAny = e as unknown as Record<string, unknown>;
                    eAny['itemFlags'] = eAny['itemFlags'] || {};
                    const flags = eAny['itemFlags'] as Record<string, Record<string, unknown>>;
                    const atual = flags[itemKey] || {};
                    flags[itemKey] = { ...atual, unspscFeito: true };
                });
            }
            log(`ℹ️ UNSPSC já preenchido na tela para item ${itemKey || '-'}; liberando prosseguir`, 'info');
        }

        if (!unspscFeito && !workflowState.isCompleta('selecionar')) return false;
    }

    const acaoProsseguir = getAcao('prosseguir', estado);
    if (!acaoProsseguir.ativo) return false;

    let btnProsseguir = buscarElementoDeep(acaoProsseguir.seletor);
    if (!btnProsseguir) {
        btnProsseguir = document.querySelector('input[value="Prosseguir"]')
            || document.querySelector('#butAcao2')
            || document.querySelector('#butAcao1');
    }
    if (!btnProsseguir) {
        log('⚠️ Botão Prosseguir não encontrado na página', 'warn');
        return false;
    }

    if (!Validador.validarAcoesObrigatorias(
        () => EstadoManager.get() as unknown as Record<string, unknown>,
        (id: string, e: Record<string, unknown>) => getValorAcao(id, e as unknown as EstadoApp),
        (msg: string, level: string) => log(msg, level as any),
        AudioManager.tocar
    )) {
        log('⚠️ Prosseguir bloqueado - validação falhou', 'warn');
        EstadoManager.update((e: EstadoApp) => { e.pausado = true; });
        _atualizarBotaoToggle();
        return true;
    }

    if (status) status.textContent = 'Prosseguindo...';
    const itemKey = (estado.itemAtualKey as string | null) || ((estado as unknown as Record<string, unknown>)['itemAtualTelaId'] as string | null) || null;
    const sucesso = await Interacao.interagir(btnProsseguir as HTMLElement, null, 'prosseguir');
    if (!sucesso) return false;

    EstadoManager.update((e: EstadoApp) => {
        const eAny = e as unknown as Record<string, unknown>;
        const now = Date.now();
        let conclusao: ReturnType<typeof Estimativa.registrarConclusaoItem> | null = null;
        if (typeof marcarItemConcluido === 'function') {
            conclusao = marcarItemConcluido(e, itemKey, { now }) || null;
        } else {
            const prog = eAny['progresso'] as Record<string, unknown>;
            (prog['atual'] as number)++;
            prog['ultimoProcessado'] = itemKey || null;
            const est = e.estatisticas as unknown as Record<string, unknown>;
            (est['processados'] as number)++;
            conclusao = Estimativa.registrarConclusaoItem(e as Parameters<typeof Estimativa.registrarConclusaoItem>[0], itemKey, now);
        }

        if (itemKey) {
            eAny['itemFlags'] = eAny['itemFlags'] || {};
            const flags = eAny['itemFlags'] as Record<string, Record<string, unknown>>;
            const atualFlags = flags[itemKey] || {};
            flags[itemKey] = {
                ...atualFlags,
                unspscModoDetectado: null,
                unspscInlinePostbackTentado: false,
                unspscInlineFallbackTentado: false,
                unspscInlineValorTentado: null,
            };
        }

        const progresso = eAny['progresso'] as Record<string, unknown>;
        const progressoAtual = Number(progresso?.['atual'] || 0);
        const progressoTotal = Number(progresso?.['total'] || 0);
        const itemEventoKey = itemKey || (eAny['itemAtualKey'] as string) || (eAny['itemAtualTelaId'] as string) || null;

        ItemTrace.registrarEventoItem(e as Parameters<typeof ItemTrace.registrarEventoItem>[0], itemEventoKey, 'item_concluido', {
            itemTelaId: (eAny['itemAtualTelaId'] as string) || itemEventoKey,
            resumo: `Item concluído (${progressoAtual}/${progressoTotal})`,
            payload: {
                progressoAtual,
                progressoTotal,
                duracaoMs: conclusao?.duracaoMs ?? null,
            },
            status: 'concluido',
            now,
        });
    });

    const estadoAtual = EstadoManager.get();
    const eaProg = (estadoAtual as unknown as Record<string, unknown>)['progresso'] as Record<string, unknown>;
    log(`✅ Item ${eaProg['atual']}/${eaProg['total']} processado`, 'info');

    workflowState.reset();
    return true;
}
