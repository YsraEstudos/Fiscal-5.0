/**
 * Handlers de NCM: ncm, abaFiscal, abaClassificacao.
 * Extraído do monólito — WorkflowExecutor.handlers (linhas 3554–3649).
 */

import { CONFIG } from '../../config/constants.ts';
import * as EstadoManager from '../../core/estado-manager.ts';
import type { EstadoApp } from '../../core/estado-manager.ts';
import { log } from '../../core/log-manager.ts';
import * as CooldownManager from '../../core/cooldown-manager.ts';
import * as Interacao from '../../interaction/interacao.ts';
import { elementoVisivel } from '../../utils/dom-helpers.ts';
import {
    buscarElementoDeep,
    encontrarCampoLei116Grupo,
    encontrarCampoLei116Subgrupo,
    encontrarCampoNbsPreferido,
    encontrarCampoNcmPreferido,
} from '../../utils/selectors.ts';
import { normalizarTextoSemAcento } from '../../utils/text.ts';
import { sleep } from '../../utils/misc.ts';
import * as ItemTrace from '../item-trace.ts';
import {
    campoLei116EhPlaceholder,
    ehValorNbs,
    normalizarLei116,
    obterEntradaItem,
    resolverOrigemValorFiscal,
    textoCombinaOpcaoLei116,
    type ItemFiscalEntry,
    type Lei116Parsed,
} from './ncm/domain.ts';
import {
    normalizarCestAlvo,
    preencherCestAutocomplete,
    textoCombinaOpcaoCest,
} from './ncm/cest-autocomplete.ts';
import {
    digitarSilencioso,
    selecionarOpcaoAutocompleteLei116,
} from './ncm/lei116-autocomplete.ts';
import {
    encontrarAbaClassificacao,
    encontrarAbaFiscal,
} from './ncm/tabs.ts';

// ---------------------------------------------------------------------------
// Tipos auxiliares
// ---------------------------------------------------------------------------

interface AcaoInfo {
    ativo: boolean;
    seletor: string;
    [key: string]: unknown;
}

interface NcmWorkflowState {
    isCompleta: (step: string) => boolean;
    _lupaRetryCount?: number;
    [key: string]: unknown;
}

export interface NcmAcaoContext {
    getAcao: (id: string, estado: EstadoApp) => AcaoInfo;
    workflowState: NcmWorkflowState;
    getValorAcao: (id: string, estado: EstadoApp) => unknown;
    valoresSaoIguais: (a: string, b: unknown) => boolean;
    habilitarValidacaoNcmAposInsercao: (estado: EstadoApp) => void;
    isValidacaoNcmLiberada: (estado: EstadoApp) => boolean;
    registrarAvisoValidacaoNcmAguardando: (estado: EstadoApp) => void;
    getModalUnspscContainer: () => Element | null;
    isModalUnspscAberto: (seletorUnspsc: string, seletorSelecionar: string) => boolean;
}

export interface Lei116AcaoContext {
    getAcao: (id: string, estado: EstadoApp) => AcaoInfo;
    getValorAcao: (id: string, estado: EstadoApp) => unknown;
    valoresSaoIguais: (a: string, b: unknown) => boolean;
}

export interface AbaClassificacaoContext {
    getAcao: (id: string, estado: EstadoApp) => AcaoInfo;
    workflowState: NcmWorkflowState;
}

export interface AbaFiscalContext {
    getAcao: (id: string, estado: EstadoApp) => AcaoInfo;
    workflowState: NcmWorkflowState;
    getModalUnspscContainer: () => Element | null;
    isModalUnspscAberto: (seletorUnspsc: string, seletorSelecionar: string) => boolean;
}

function detectarModoServico(estado: EstadoApp, entry: ItemFiscalEntry | null, valorFiscal: unknown): boolean {
    const campoNbs = encontrarCampoNbsPreferido();
    const campoIncideNbs = buscarElementoDeep('#txtIncideNBS') || buscarElementoDeep('input[name$="txtIncideNBS"]');
    const incideNbs = normalizarTextoSemAcento(String((campoIncideNbs as HTMLInputElement)?.value ?? campoIncideNbs?.textContent ?? '')) === 'sim';
    const valorPareceNbs = ehValorNbs(valorFiscal);
    const entryPareceServico = !!(entry?.nbs || normalizarLei116(entry?.lei116) || (entry?.ncm && ehValorNbs(entry.ncm)));
    return valorPareceNbs || entryPareceServico || !!(campoNbs && incideNbs);
}

function lei116EstaPendente(estado: EstadoApp, targetLei116: Lei116Parsed | null, valoresSaoIguais: (a: string, b: unknown) => boolean): boolean {
    if (!targetLei116) return false;
    const campoGrupo = encontrarCampoLei116Grupo() as HTMLInputElement | null;
    const campoSubgrupo = encontrarCampoLei116Subgrupo() as HTMLInputElement | null;
    if (!campoGrupo || !campoSubgrupo) return true;

    const grupoAtual = String(campoGrupo.value ?? '').trim();
    const subgrupoAtual = String(campoSubgrupo.value ?? '').trim();
    if (campoLei116EhPlaceholder(grupoAtual) || campoLei116EhPlaceholder(subgrupoAtual)) return true;

    // Usa textoCombinaOpcaoLei116 pois após sel() o campo fica com o texto completo
    // ex: "07. Serviços relativos a engenharia..." que NUNCA daria match com "7" via ===
    const grupoMatch = textoCombinaOpcaoLei116(grupoAtual, targetLei116.grupo);
    const subMatch = textoCombinaOpcaoLei116(subgrupoAtual, targetLei116.subgrupo);
    return !grupoMatch || !subMatch;
}

function cestEstaPendente(campo: HTMLInputElement, valorCest: unknown): boolean {
    const alvo = normalizarCestAlvo(valorCest);
    if (!alvo) return false;
    const valorAtual = String(campo.value ?? '').trim();
    return !textoCombinaOpcaoCest(valorAtual, alvo.texto);
}

// ---------------------------------------------------------------------------
export async function abaClassificacao(estado: EstadoApp, status: HTMLElement | null, { getAcao, workflowState }: AbaClassificacaoContext): Promise<boolean> {
    const acaoAbaClass = getAcao('abaClassificacao', estado);
    if (!acaoAbaClass.ativo) return false;

    if (CooldownManager.isAtivo('abaClassificacao')) return true;

    if (workflowState.isCompleta('selecionar')) return false;
    if (CooldownManager.isAtivo('posSelecionar')) return false;

    const acaoLupa = getAcao('lupaUnspsc', estado);
    if (acaoLupa?.ativo) {
        const lupa = buscarElementoDeep(acaoLupa.seletor);
        if (lupa && elementoVisivel(lupa as HTMLElement)) return false;
    }

    const abaClass = encontrarAbaClassificacao(acaoAbaClass);
    if (!abaClass || !elementoVisivel(abaClass)) return false;

    if (status) status.textContent = 'Indo para Classificações...';
    CooldownManager.set('abaClassificacao', CONFIG.DELAYS.ABA_CLASSIFICACAO_COOLDOWN);

    await Interacao.interagir(abaClass, null, 'abaClassificacao');
    return true;
}

// ---------------------------------------------------------------------------
export async function ncm(estado: EstadoApp, status: HTMLElement | null, ctx: NcmAcaoContext): Promise<boolean> {
    const { getAcao, habilitarValidacaoNcmAposInsercao, isValidacaoNcmLiberada, registrarAvisoValidacaoNcmAguardando } = ctx;
    const acaoNcm = getAcao('ncm', estado);
    const valorNcm = ctx.getValorAcao('ncm', estado);
    if (!acaoNcm.ativo) return false;
    if (!String(valorNcm ?? '').trim()) return false;

    const entry = obterEntradaItem(estado);
    const emModoServico = detectarModoServico(estado, entry, valorNcm);
    const campoNcm = (
        emModoServico
            ? (encontrarCampoNbsPreferido() || encontrarCampoNcmPreferido(acaoNcm.seletor))
            : encontrarCampoNcmPreferido(acaoNcm.seletor)
    ) as HTMLElement | null;
    if (!campoNcm) return false;
    const nomeCampoFiscal = emModoServico ? 'NBS' : 'NCM';

    if (!ctx.valoresSaoIguais((campoNcm as HTMLInputElement).value, valorNcm)) {
        if (status) status.textContent = emModoServico ? 'Preenchendo NBS...' : 'Preenchendo NCM...';
        const ok = await Interacao.interagir(campoNcm as HTMLElement, valorNcm as string, 'ncm');
        if (ok) {
            // Se for NBS, o campo tem um onblur="getDescricaoNBS('NBS',0)" síncrono que trava a tela.
            // Forçamos o blur para dar o gatilho da validação e aguardamos o sistema "respirar".
            if (emModoServico) {
                try { (campoNcm as HTMLElement).blur(); } catch (e) { }
                await sleep(1500);
            }

            habilitarValidacaoNcmAposInsercao(estado);
            EstadoManager.update((e: EstadoApp) => {
                const eAny = e as unknown as Record<string, unknown>;
                ItemTrace.registrarEventoItemAtual(e, 'ncm_preenchido', {
                    itemTelaId: (eAny['itemAtualTelaId'] as string) || (eAny['itemAtualKey'] as string) || null,
                    resumo: `${nomeCampoFiscal} preenchido com ${valorNcm}`,
                    payload: {
                        valor: valorNcm,
                        campo: nomeCampoFiscal,
                        origemValor: resolverOrigemValorFiscal(e, valorNcm, nomeCampoFiscal),
                    },
                    status: 'em_andamento',
                    now: Date.now(),
                });
            });
        }
        return true;
    }

    if (!isValidacaoNcmLiberada(estado)) {
        registrarAvisoValidacaoNcmAguardando(estado);
    }

    const acaoLei116 = getAcao('lei116Servico', estado);
    if (emModoServico && acaoLei116.ativo) {
        const lei116Alvo = normalizarLei116(ctx.getValorAcao('lei116Servico', estado));
        if (lei116EstaPendente(estado, lei116Alvo, ctx.valoresSaoIguais)) {
            if (status) status.textContent = 'Aguardando preenchimento de Lei 116...';
            return false;
        }
    }

    const acaoCest = getAcao('cest', estado);
    const valorCest = ctx.getValorAcao('cest', estado);
    if (!emModoServico && acaoCest.ativo && normalizarCestAlvo(valorCest)) {
        const campoCest = buscarElementoDeep(acaoCest.seletor || '#txtCest') as HTMLInputElement | null;
        if (campoCest && elementoVisivel(campoCest) && cestEstaPendente(campoCest, valorCest)) {
            if (status) status.textContent = 'Preenchendo CEST...';
            const okCest = await preencherCestAutocomplete(campoCest, valorCest);
            if (okCest) {
                EstadoManager.update((e: EstadoApp) => {
                    const eAny = e as unknown as Record<string, unknown>;
                    const alvo = normalizarCestAlvo(valorCest);
                    ItemTrace.registrarEventoItemAtual(e, 'cest_preenchido', {
                        itemTelaId: (eAny['itemAtualTelaId'] as string) || (eAny['itemAtualKey'] as string) || null,
                        resumo: `CEST preenchido com ${alvo?.codigo || valorCest}`,
                        payload: {
                            cest: alvo?.codigo || valorCest,
                            valorOriginal: valorCest,
                        },
                        status: 'em_andamento',
                        now: Date.now(),
                    });
                });
            }
            return true;
        }
    }

    const acaoAbaClass = getAcao('abaClassificacao', estado);
    if (acaoAbaClass.ativo) {
        const avancouAba = await abaClassificacao(estado, status, ctx as unknown as AbaClassificacaoContext);
        if (avancouAba) return true;
    }

    return false;
}

// ---------------------------------------------------------------------------
export async function lei116Servico(estado: EstadoApp, status: HTMLElement | null, { getAcao, getValorAcao, valoresSaoIguais }: Lei116AcaoContext): Promise<boolean> {
    const acaoLei116 = getAcao('lei116Servico', estado);
    if (!acaoLei116.ativo) return false;

    const lei116 = normalizarLei116(getValorAcao('lei116Servico', estado));
    if (!lei116) return false;

    const campoGrupo = encontrarCampoLei116Grupo() as HTMLInputElement | null;
    const campoSubgrupo = encontrarCampoLei116Subgrupo() as HTMLInputElement | null;
    if (!campoGrupo || !campoSubgrupo) return false;

    const grupoAtual = String(campoGrupo.value ?? '').trim();
    const subgrupoAtual = String(campoSubgrupo.value ?? '').trim();
    const grupoPendente = campoLei116EhPlaceholder(grupoAtual);
    const subgrupoPendente = campoLei116EhPlaceholder(subgrupoAtual);
    let executou = false;
    if (grupoPendente || !textoCombinaOpcaoLei116(grupoAtual, lei116.grupo)) {
        if (status) status.textContent = 'Preenchendo Lei 116 (Grupo)...';

        // NÃO usamos Interacao.interagir() aqui!
        // O motivo: digitarHumano dispara 'change' event ao final, que aciona
        // a validação nativa do Klassmatt ANTES do autocomplete aparecer,
        // exibindo o alert "Verifique o preenchimento do campo LC 116 Grupo!"
        //
        // Estratégia: apenas dar foco no campo (onfocus=posiciona() carrega a lista inteira)
        // e depois chamar sel(N) diretamente sem nunca digitar no campo.
        // digitarSilencioso: digita o número sem disparar 'change' event no final
        // Isso impede o alert "Verifique o preenchimento do campo LC 116 Grupo!" prematuro
        await digitarSilencioso(campoGrupo, lei116.grupo);
        log(`⌨️ Lei 116 (Grupo): digitado "${lei116.grupo}" sem change event`, 'info');

        // Aguarda resposta AJAX do autocompleta()
        await sleep(700);

        const clicouGrupo = await selecionarOpcaoAutocompleteLei116(campoGrupo, lei116.grupo, 'lei116ServicoGrupoOpcao');
        if (clicouGrupo) {
            // sel() já disparou — espera o postback interno do Klassmatt processar
            await sleep(2000);
            executou = true;
        } else {
            log('⚠️ Lei 116 (Grupo): opção do autocomplete não encontrada para clique', 'warn');
        }
    }
    if (subgrupoPendente || !textoCombinaOpcaoLei116(subgrupoAtual, lei116.subgrupo)) {
        if (status) status.textContent = 'Preenchendo Lei 116 (SubGrupo)...';

        await digitarSilencioso(campoSubgrupo, lei116.subgrupo);
        log(`⌨️ Lei 116 (SubGrupo): digitado "${lei116.subgrupo}" sem change event`, 'info');

        await sleep(700);

        const clicouSubgrupo = await selecionarOpcaoAutocompleteLei116(campoSubgrupo, lei116.subgrupo, 'lei116ServicoSubgrupoOpcao');
        if (clicouSubgrupo) {
            await sleep(2000);
            executou = true;
        } else {
            log('⚠️ Lei 116 (SubGrupo): opção do autocomplete não encontrada para clique', 'warn');
        }
    }

    if (!executou) return false;

    EstadoManager.update((e: EstadoApp) => {
        const eAny = e as unknown as Record<string, unknown>;
        ItemTrace.registrarEventoItemAtual(e, 'lei116_preenchida', {
            itemTelaId: (eAny['itemAtualTelaId'] as string) || (eAny['itemAtualKey'] as string) || null,
            resumo: `Lei 116 preenchida com ${lei116.valor}`,
            payload: {
                lei116: lei116.valor,
                grupo: lei116.grupo,
                subgrupo: lei116.subgrupo,
            },
            status: 'em_andamento',
            now: Date.now(),
        });
    });
    return true;
}

// ---------------------------------------------------------------------------
export async function abaFiscal(estado: EstadoApp, status: HTMLElement | null, ctx: AbaFiscalContext): Promise<boolean> {
    const { getAcao, workflowState } = ctx;
    const acaoAbaFiscal = getAcao('abaFiscal', estado);
    const acaoNcm = getAcao('ncm', estado);
    const acaoLupa = getAcao('lupaUnspsc', estado);
    const acaoUnspsc = getAcao('unspsc', estado);
    const acaoSelecionar = getAcao('selecionar', estado);

    if (!acaoAbaFiscal.ativo || !acaoNcm.ativo) return false;
    if (CooldownManager.isAtivo('abaClassificacao')) return false;
    if (CooldownManager.isAtivo('abaFiscal')) return false;

    const modalDiv1 = ctx.getModalUnspscContainer();
    const modalAberto = ctx.isModalUnspscAberto(acaoUnspsc.seletor, acaoSelecionar.seletor);
    const lupa = acaoLupa?.ativo ? buscarElementoDeep(acaoLupa.seletor) : null;
    const campoUnspsc = acaoUnspsc?.ativo
        ? (modalDiv1 ? modalDiv1.querySelector(acaoUnspsc.seletor) : buscarElementoDeep(acaoUnspsc.seletor))
        : null;

    if (modalAberto || (lupa && elementoVisivel(lupa as HTMLElement)) || (campoUnspsc && elementoVisivel(campoUnspsc as HTMLElement))) {
        return false;
    }

    const campoNcm = encontrarCampoNcmPreferido(acaoNcm.seletor);
    if (campoNcm && elementoVisivel(campoNcm as HTMLElement)) return false;

    const abaFiscalEl = encontrarAbaFiscal(acaoAbaFiscal.seletor);

    if (!abaFiscalEl || !elementoVisivel(abaFiscalEl)) return false;

    if (status) status.textContent = 'Indo para aba Fiscal...';
    CooldownManager.set('abaFiscal', CONFIG.DELAYS.ABA_CLASSIFICACAO_COOLDOWN);
    await Interacao.interagir(abaFiscalEl, null, 'abaFiscal');
    return true;
}

// ---------------------------------------------------------------------------
// Exports para Unit Testing
// ---------------------------------------------------------------------------
export const __test_ncm_internals__ = {
    textoCombinaOpcaoLei116,
    textoCombinaOpcaoCest,
    normalizarCestAlvo,
    normalizarLei116,
    campoLei116EhPlaceholder,
    selecionarOpcaoAutocompleteLei116,
    preencherCestAutocomplete
};
