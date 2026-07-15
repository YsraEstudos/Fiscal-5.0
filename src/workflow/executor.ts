/**
 * Motor principal do workflow (WorkflowExecutor).
 * Extraído do monólito — linhas 3085–4216.
 *
 * Orquestra os handlers, o loop de ciclo, e o estado de workflow.
 * Referências a UI (atualizarBotaoToggle, atualizarIndicadorProgresso) são
 * injetadas via setters para evitar dependência circular com Fase 5.
 */

import { CONFIG } from '../config/constants.ts';
import { ACOES_WORKFLOW, ehAcaoUnspsc } from '../config/workflow-actions.ts';
import * as EstadoManager from '../core/estado-manager.ts';
import type { EstadoApp } from '../core/estado-manager.ts';
import type { AcaoWorkflow } from '../config/workflow-actions.ts';
import { log } from '../core/log-manager.ts';
import * as CooldownManager from '../core/cooldown-manager.ts';
import * as AudioManager from '../interaction/audio-manager.ts';
import * as AspNetLifecycle from '../core/aspnet-lifecycle.ts';
import * as Interacao from '../interaction/interacao.ts';
import * as PaginaVerificador from './pagina-verificador.ts';
import * as ItemMapManager from '../data/item-map-manager.ts';
import * as EmpresaJsonRequirements from '../validation/empresa-json-requirements.ts';
import * as Estimativa from './estimativa.ts';
import * as ItemTrace from './item-trace.ts';
import { isTestMode, sleep, valoresSaoIguais } from '../utils/misc.ts';
import { normalizarEspacos } from '../utils/text.ts';
import { buscarElementoDeep } from '../utils/selectors.ts';
import { confirmar, setAtualizarBotaoToggle } from './handlers/flow-control.js';
import { workflowState } from './workflow-state.ts';
import { atualizarTotaisLote, getTotalPlanejadoJson } from './progress-totals.ts';
import {
    inicializarFlagsItemAtual,
    limparContextoTelaStaleSeNecessario,
    marcarItemConcluido,
    marcarItemParaPularNestaRodada,
    registrarInicioItemSeNecessario,
    registrarItemAberto,
    tratarItemSemJsonNaRodada,
} from './item-flow.ts';
import {
    habilitarValidacaoNcmAposInsercao,
    isValidacaoNcmLiberada,
    registrarAvisoValidacaoNcmAguardando,
    registrarPausaCriticaNaTrilha,
} from './critical-pauses.ts';
import { createWorkflowScheduler, LOOP_TICK_MS } from './scheduler.ts';
import { createHandlerMap } from './handler-registry.ts';
import type { AcaoEstadoSlim, HandlerFn, HandlerMap, UICallbacks, WorkflowContext } from './types.ts';

export type { HandlerFn, HandlerMap };

type ItemFlagRecord = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Callbacks de UI injetados pela Fase 5
// ---------------------------------------------------------------------------
let _atualizarBotaoToggle: () => void = () => { };
let _atualizarIndicadorProgresso: () => void = () => { };

export function setUICallbacks({ atualizarBotaoToggle, atualizarIndicadorProgresso }: UICallbacks): void {
    _atualizarBotaoToggle = atualizarBotaoToggle || _atualizarBotaoToggle;
    _atualizarIndicadorProgresso = atualizarIndicadorProgresso || _atualizarIndicadorProgresso;
    setAtualizarBotaoToggle(_atualizarBotaoToggle);
}

// ---------------------------------------------------------------------------
// Estado interno do executor
// ---------------------------------------------------------------------------
let roboAtivo = true;
let cicloEmExecucao = false;
let wakePending = false;
let lastItensEmAtuacaoCount = -1;
let buscaSemItemInicioTs: number | null = null;
let retornoItemBloqueadoEmAndamento = false;
const BUSCA_SEM_ITEM_TIMEOUT_MS = 60_000;
const SHIFT_S_RETORNO_DELAY_MS = 600;
const scheduler = createWorkflowScheduler((trigger: string) => {
    void executarCiclo(trigger);
});

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------
function getAcao(id: string, estado: EstadoApp): AcaoEstadoSlim {
    const acao = (estado.acoes as Record<string, AcaoEstadoSlim>)[id] || { ativo: false, seletor: '', valor: null };
    const exigeUnspsc = EmpresaJsonRequirements.empresaExigeUnspsc();

    if (ehAcaoUnspsc(id) && exigeUnspsc === false) {
        return { ...acao, ativo: false };
    }

    return acao;
}

export function getAcoesOrdenadas(estado: EstadoApp): AcaoWorkflow[] {
    return ACOES_WORKFLOW
        .map((acao: AcaoWorkflow) => ({
            ...acao,
            ordem: (estado.acoes as Record<string, { ordem?: number }>)?.[acao.id]?.ordem ?? acao.ordem
        }))
        .sort((a: AcaoWorkflow, b: AcaoWorkflow) => a.ordem - b.ordem);
}

function lerUnspscAtualTela(estado: EstadoApp): string {
    const acaoUnspsc = getAcao('unspsc', estado);
    const campo = buscarElementoDeep(acaoUnspsc?.seletor || '#txtCodigoUnspsc')
        || buscarElementoDeep('#txtCodUNSPSC')
        || buscarElementoDeep('input[name$="txtCodigoUnspsc"], input[name$="txtCodUNSPSC"]');
    const valor = normalizarEspacos(
        (campo as HTMLInputElement)?.value ?? campo?.getAttribute?.('value') ?? ''
    );
    return valor;
}

function itemJaTemUnspsc(estado: EstadoApp): boolean {
    const modo = PaginaVerificador.detectarModoUnspsc(
        getAcao('unspsc', estado)?.seletor || '',
        getAcao('selecionar', estado)?.seletor || '#butFechar'
    );
    if (modo === 'inline') {
        return PaginaVerificador.unspscDescricaoDefinida();
    }

    const valor = lerUnspscAtualTela(estado);
    if (valor) {
        const digits = valor.replace(/\D/g, '');
        if (digits.length >= 4 || valor.length >= 4) return true;
    }

    return PaginaVerificador.unspscDescricaoDefinida();
}

function enviarShiftS(): void {
    const alvo = (document.activeElement instanceof HTMLElement ? document.activeElement : document.body) || document.body;
    const opts: KeyboardEventInit = { key: 'S', code: 'KeyS', shiftKey: true, bubbles: true, cancelable: true };
    try { document.dispatchEvent(new KeyboardEvent('keydown', opts)); } catch { /* ignore */ }
    try { document.dispatchEvent(new KeyboardEvent('keypress', opts)); } catch { /* ignore */ }
    try { document.dispatchEvent(new KeyboardEvent('keyup', opts)); } catch { /* ignore */ }
    try { window.dispatchEvent(new KeyboardEvent('keydown', opts)); } catch { /* ignore */ }
    try { window.dispatchEvent(new KeyboardEvent('keypress', opts)); } catch { /* ignore */ }
    try { window.dispatchEvent(new KeyboardEvent('keyup', opts)); } catch { /* ignore */ }
    try { alvo.dispatchEvent(new KeyboardEvent('keydown', opts)); } catch { /* ignore */ }
    try { alvo.dispatchEvent(new KeyboardEvent('keypress', opts)); } catch { /* ignore */ }
    try { alvo.dispatchEvent(new KeyboardEvent('keyup', opts)); } catch { /* ignore */ }
}

function textoControle(el: Element): string {
    return normalizarEspacos(
        (el as HTMLInputElement).value ||
        el.getAttribute('title') ||
        el.getAttribute('aria-label') ||
        el.textContent ||
        ''
    ).toLowerCase();
}

function encontrarControleVoltarItem(): HTMLElement | null {
    const voltarFormulario = document.querySelector(
        '#butVoltar, input[name$="$butVoltar"], button[name$="$butVoltar"], #hbutVoltar'
    );
    if (voltarFormulario) return voltarFormulario as HTMLElement;

    const candidatos = [...document.querySelectorAll('a, button, input[type="button"], input[type="submit"]')];
    const voltarSin = candidatos.find((el) => {
        const href = el.getAttribute('href') || '';
        return /redireciona\(/i.test(href)
            && /SIN_Item_Resultante\.aspx/i.test(href)
            && /Source=SIN_Lista/i.test(href);
    });
    if (voltarSin) return voltarSin as HTMLElement;

    const voltarRedireciona = candidatos.find((el) => {
        const href = el.getAttribute('href') || '';
        return textoControle(el) === 'voltar' && /redireciona\(/i.test(href);
    });
    if (voltarRedireciona) return voltarRedireciona as HTMLElement;

    let sair: HTMLElement | null = null;
    for (const el of candidatos) {
        const texto = textoControle(el);
        if (texto === 'voltar') return el as HTMLElement;
        if (texto === 'sair' && !sair) sair = el as HTMLElement;
    }
    return sair;
}

function acionarControleDireto(controle: HTMLElement): boolean {
    const href = controle.getAttribute('href') || '';
    const redirecionaMatch = href.match(/redireciona\(['"]([^'"]+)['"]\)/i);
    if (redirecionaMatch?.[1]) {
        if (executarRedirecionaPagina(redirecionaMatch[1])) return true;
    }

    const postbackMatch = href.match(/__doPostBack\(['"]([^'"]+)['"],\s*['"]([^'"]*)['"]\)/i);
    if (postbackMatch?.[1]) {
        if (executarPostbackPagina(postbackMatch[1], postbackMatch[2] || '')) return true;
    }

    try {
        controle.click();
        return true;
    } catch {
        return false;
    }
}

function executarRedirecionaPagina(url: string): boolean {
    try {
        const injectScript = document.createElement('script');
        injectScript.textContent = `
            try {
                var url = ${JSON.stringify(url)};
                if (typeof redireciona === 'function') {
                    redireciona(url);
                } else {
                    window.location.href = url;
                }
            } catch(e) {
                console.error('FISCAL 5.0 redireciona retorno error:', e);
            }
        `;
        document.body.appendChild(injectScript);
        injectScript.remove();
        return true;
    } catch {
        try {
            window.location.href = url;
            return true;
        } catch {
            return false;
        }
    }
}

function executarPostbackPagina(target: string, argument: string): boolean {
    try {
        const injectScript = document.createElement('script');
        injectScript.textContent = `
            try {
                if (typeof __doPostBack === 'function') {
                    __doPostBack(${JSON.stringify(target)}, ${JSON.stringify(argument)});
                } else {
                    var form = document.forms['aspnetForm'] || document.aspnetForm || document.querySelector('form');
                    if (!form) throw new Error('form not found');
                    var eventTarget = form.querySelector('input[name="__EVENTTARGET"]');
                    var eventArgument = form.querySelector('input[name="__EVENTARGUMENT"]');
                    if (!eventTarget || !eventArgument) throw new Error('event fields not found');
                    eventTarget.value = ${JSON.stringify(target)};
                    eventArgument.value = ${JSON.stringify(argument)};
                    form.submit();
                }
            } catch(e) {
                console.error('FISCAL 5.0 postback retorno error:', e);
            }
        `;
        document.body.appendChild(injectScript);
        injectScript.remove();
        return true;
    } catch {
        return executarPostbackPorFormulario(target, argument);
    }
}

function executarPostbackPorFormulario(target: string, argument: string): boolean {
    const form = (document.forms.namedItem('aspnetForm') as HTMLFormElement | null)
        || (document as unknown as { aspnetForm?: HTMLFormElement }).aspnetForm
        || document.querySelector('form');
    const eventTarget = form?.querySelector('input[name="__EVENTTARGET"]') as HTMLInputElement | null;
    const eventArgument = form?.querySelector('input[name="__EVENTARGUMENT"]') as HTMLInputElement | null;
    if (!form || !eventTarget || !eventArgument) return false;

    eventTarget.value = target;
    eventArgument.value = argument;
    form.submit();
    return true;
}

function acionarRetornoLista(): string {
    const controleVoltar = encontrarControleVoltarItem();
    if (controleVoltar) {
        acionarControleDireto(controleVoltar);
        return textoControle(controleVoltar) || 'voltar';
    }

    enviarShiftS();
    return 'Shift+S';
}

function obterParametroUrlAtual(nome: string): string | null {
    try {
        return new URL(window.location.href).searchParams.get(nome);
    } catch {
        return null;
    }
}

function obterAliasesItemAtual(estado: EstadoApp): string[] {
    const estadoAny = estado as unknown as Record<string, unknown>;
    const aliases = [
        estadoAny['itemAtualKey'],
        estadoAny['itemAtualTelaId'],
        estadoAny['itemMapUltimoAplicadoId'],
        ItemMapManager.obterItemIdAtual(),
        obterParametroUrlAtual('IdItem'),
        obterParametroUrlAtual('IdSIN'),
    ];

    return [...new Set(
        aliases
            .map((alias) => String(alias ?? '').trim())
            .filter(Boolean)
    )];
}

function itemAtualMarcadoParaPularNestaRodada(estado: EstadoApp): string | null {
    const itemFlags = (estado as unknown as { itemFlags?: Record<string, Record<string, unknown>> }).itemFlags || {};
    const aliases = obterAliasesItemAtual(estado);
    return aliases.find((alias) => itemFlags[alias]?.skipNestaRodada === true) || null;
}

function encontrarBotaoAtuarResumo(): HTMLElement | null {
    const botao = document.querySelector('#butAcao3, input[name$="$butAcao3"], button[name$="$butAcao3"]') as HTMLElement | null;
    const valor = normalizarEspacos((botao as HTMLInputElement | null)?.value || botao?.textContent || '').toLowerCase();
    if (!botao || !/\batuar\b/.test(valor)) return null;
    return botao;
}

function retornarSeResumoItemPulado(estado: EstadoApp, status: HTMLElement | null): boolean {
    const itemPulado = itemAtualMarcadoParaPularNestaRodada(estado);
    if (!itemPulado || !encontrarBotaoAtuarResumo()) return false;

    const metodoRetorno = acionarRetornoLista();
    if (status) {
        status.textContent = `Item ${itemPulado} pulado nesta rodada; retornando...`;
        status.style.color = '#d97706';
    }
    log(`⏭️ Item ${itemPulado} já marcado para pular; evitando Atuar no Item e retornando com ${metodoRetorno}`, 'warn');
    workflowState.reset();
    buscaSemItemInicioTs = null;
    return true;
}

async function tratarAvisoBloqueanteItem(estado: EstadoApp, status: HTMLElement | null): Promise<boolean> {
    const aviso = PaginaVerificador.detectarAvisoBloqueanteItem();
    if (!aviso) return false;

    const estadoAny = estado as unknown as Record<string, unknown>;
    const itemKey = (estadoAny['itemAtualKey'] as string | null)
        || (estadoAny['itemAtualTelaId'] as string | null)
        || ItemMapManager.obterItemIdAtual();
    const marcado = marcarItemParaPularNestaRodada(estado, itemKey, aviso.tipo, aviso.mensagem);

    if (status) {
        status.textContent = `Pulando item ${marcado || '-'} por problema visual...`;
        status.style.color = '#d97706';
    }

    const ok = await Interacao.interagir(aviso.btnOk as HTMLElement, null, 'okProblemaVisual');
    if (!ok) return false;

    await sleep(SHIFT_S_RETORNO_DELAY_MS);
    enviarShiftS();
    log(`⏭️ Item ${marcado || '-'} pulado por problema visual; retornando para a lista com Shift+S`, 'warn');
    workflowState.reset();
    buscaSemItemInicioTs = null;
    return true;
}

function tratarAlertSubGrupoInvalido(mensagem: string): void {
    if (retornoItemBloqueadoEmAndamento) return;
    retornoItemBloqueadoEmAndamento = true;

    const estado = EstadoManager.get();
    const estadoAny = estado as unknown as Record<string, unknown>;
    const itemKey = (estadoAny['itemAtualKey'] as string | null)
        || (estadoAny['itemAtualTelaId'] as string | null)
        || ItemMapManager.obterItemIdAtual();
    const aliases = obterAliasesItemAtual(estado);
    const marcado = marcarItemParaPularNestaRodada(estado, itemKey, 'subgrupo_invalido', mensagem, aliases);
    const status = document.getElementById('statusRobo');

    if (status) {
        status.textContent = `Pulando item ${marcado || '-'} por Sub Grupo inválido...`;
        status.style.color = '#d97706';
    }

    log(`🌐 Mensagem do navegador: ${mensagem}`, 'browser');
    scheduler.cancelarTimer();
    const metodoRetorno = acionarRetornoLista();
    log(`⏭️ Item ${marcado || '-'} pulado por Sub Grupo inválido; retornando para a lista com ${metodoRetorno}`, 'warn');
    workflowState.reset();
    buscaSemItemInicioTs = null;
}

async function tentarPaginarProximaPagina(itensInfo: PaginaVerificador.ItensPendentesInfo, status: HTMLElement | null): Promise<boolean> {
    const elegiveis = itensInfo.elegiveis || [];
    const inelegiveisConhecidos = itensInfo.inelegiveisConhecidos || [];
    const desconhecidos = itensInfo.desconhecidos || [];
    const totalVisiveis = Number(itensInfo.totalVisiveis || 0);
    const semElegiveis = elegiveis.length === 0;
    const temItens = totalVisiveis > 0;
    const todosInelegiveisConhecidos = temItens
        && inelegiveisConhecidos.length === totalVisiveis
        && desconhecidos.length === 0;
    if (!semElegiveis || !todosInelegiveisConhecidos) return false;

    const btnProximo = PaginaVerificador.encontrarBotaoProximo();
    if (!btnProximo) return false;

    if (status) {
        status.textContent = 'Página atual só tem itens bloqueados; avançando para Próximo...';
        status.style.color = '#0d6efd';
    }
    await Interacao.interagir(btnProximo as HTMLElement, null, 'proximaPaginaItens');
    buscaSemItemInicioTs = null;
    log('⏭️ Página atual sem itens elegíveis conhecidos; clicando em Próximo', 'info');
    return true;
}

// Contexto compartilhado passado para todos os handlers
function buildCtx(): WorkflowContext {
    return {
        getAcao,
        workflowState,
        itemJaTemUnspsc,
        habilitarValidacaoNcmAposInsercao,
        isValidacaoNcmLiberada,
        registrarAvisoValidacaoNcmAguardando,
        getValorAcao: (id: string, est: EstadoApp) => ItemMapManager.getValorAcao(id, est),
        valoresSaoIguais,
        marcarItemConcluido,
        pausarComAviso,
        getModalUnspscContainer: () => PaginaVerificador.getModalUnspscContainer(),
        isModalUnspscAberto: (s1: string, s2: string) => PaginaVerificador.isModalUnspscAberto(s1, s2),
        getUnspscModo: (s1: string, s2: string) => PaginaVerificador.detectarModoUnspsc(s1, s2),
    };
}

function tratarCamposObrigatoriosJsonEmpresa(estado: EstadoApp, status: HTMLElement | null): boolean {
    if (!estado.itemMapAtivo) return false;

    const itemId = ItemMapManager.obterItemIdAtual()
        || (estado.itemAtualTelaId as string | null)
        || (estado.itemAtualKey as string | null);
    const entry = ItemMapManager.getValoresParaItem(estado, itemId);
    if (!itemId || !entry) return false;

    const flagsPorItem = estado.itemFlags as Record<string, ItemFlagRecord>;
    const itemFlags = flagsPorItem?.[itemId] || {};
    const liberados = Array.isArray(itemFlags['jsonEmpresaCamposLiberados'])
        ? itemFlags['jsonEmpresaCamposLiberados'] as string[]
        : [];
    const resultado = EmpresaJsonRequirements.avaliarCamposObrigatoriosJsonEmpresa({
        empresa: EmpresaJsonRequirements.obterEmpresaAtual(),
        itemId,
        entry: entry as EmpresaJsonRequirements.ItemJsonEmpresa,
        itemMap: estado.itemMap as Record<string, EmpresaJsonRequirements.ItemJsonEmpresa>,
        liberados,
    });
    if (resultado.valido) return false;

    EstadoManager.update((e: EstadoApp) => {
        const eAny = e as unknown as Record<string, unknown>;
        eAny['itemFlags'] = eAny['itemFlags'] || {};
        const flags = eAny['itemFlags'] as Record<string, ItemFlagRecord>;
        const atual = flags[itemId] || {};
        const atuaisLiberados = Array.isArray(atual['jsonEmpresaCamposLiberados'])
            ? atual['jsonEmpresaCamposLiberados'] as string[]
            : [];
        flags[itemId] = {
            ...atual,
            jsonEmpresaCamposLiberados: [...new Set([...atuaisLiberados, ...resultado.camposFaltantes])],
            jsonEmpresaUltimaPausa: {
                empresa: resultado.empresa,
                campos: resultado.camposFaltantes,
                mensagem: resultado.mensagem,
                timestamp: new Date().toISOString(),
            },
        };
    });

    if (status) {
        status.textContent = resultado.mensagem;
        status.style.color = '#d97706';
    }
    pausarComAviso(resultado.mensagem, { alertUser: false, tipo: 'json_empresa_obrigatorio' });
    return true;
}

// ---------------------------------------------------------------------------
// Lógica principal
// ---------------------------------------------------------------------------
async function executarLogica(): Promise<boolean> {
    const estado = EstadoManager.get();
    const status = document.getElementById('statusRobo');

    if (retornoItemBloqueadoEmAndamento) {
        if (status) {
            status.textContent = 'Aguardando retorno do item bloqueado...';
            status.style.color = '#d97706';
        }
        return false;
    }

    if (!estado.ativo || estado.pausado) return false;

    const actionDelayRemainingMs = scheduler.getActionDelayRemainingMs();
    if (actionDelayRemainingMs > 0) {
        const faltam = Math.ceil(actionDelayRemainingMs / 1000);
        if (status) {
            status.textContent = `⏳ Aguardando delay global: ${faltam}s`;
            status.style.color = '#d63384';
        }
        return false;
    }

    const estadoPagina = PaginaVerificador.paginaOcupada();
    if (estadoPagina.ocupado) {
        if (status) {
            status.textContent = `⏳ Aguardando server (${estadoPagina.motivo})...`;
            status.style.color = '#d63384';
        }
        return false;
    }

    if (status) {
        status.textContent = 'Analisando página...';
        status.style.color = 'blue';
    }

    await sleep((CONFIG.DELAYS as Record<string, number>).ESTABILIDADE);

    const itemSincronizado = ItemMapManager.sincronizarItemAtual(estado);
    let estadoAtual = EstadoManager.get();

    if (itemSincronizado) {
        registrarInicioItemSeNecessario(estadoAtual, itemSincronizado);
        estadoAtual = EstadoManager.get();
    }

    if (itemSincronizado) {
        registrarItemAberto(estadoAtual, itemSincronizado);
        estadoAtual = EstadoManager.get();
    }

    if (limparContextoTelaStaleSeNecessario(estadoAtual)) {
        estadoAtual = EstadoManager.get();
    }

    ItemMapManager.aplicarParaItemAtual(estadoAtual);
    if (tratarItemSemJsonNaRodada(estadoAtual, status, pausarComAviso)) return true;
    estadoAtual = EstadoManager.get();
    if (tratarCamposObrigatoriosJsonEmpresa(estadoAtual, status)) return true;
    if (await tratarAvisoBloqueanteItem(estadoAtual, status)) return true;
    if (retornarSeResumoItemPulado(estadoAtual, status)) return true;

    const avisoCritico = PaginaVerificador.detectarAvisoCritico();
    const pausaReincidenciaAtiva = estadoAtual.pausarEmReincidencia !== false;
    const pausaPorReincidencia = avisoCritico?.tipo === 'reincidencia_etapa' && pausaReincidenciaAtiva;
    const pausaPorValidacao = avisoCritico
        && ['ncm_invalido', 'nbs_invalido'].includes(avisoCritico.tipo)
        && isValidacaoNcmLiberada(estadoAtual);
    if (avisoCritico && (pausaPorReincidencia || pausaPorValidacao)) {
        registrarPausaCriticaNaTrilha(avisoCritico);
        if (status) {
            status.textContent = pausaPorReincidencia
                ? '❌ Reincidência detectada - operação pausada'
                : '❌ Aviso crítico detectado - operação pausada';
            status.style.color = '#dc3545';
        }
        pausarComAviso(avisoCritico.mensagem || 'Aviso crítico detectado', {
            alertUser: false,
            tipo: avisoCritico.tipo,
        });
        return true;
    }

    const ctx = buildCtx();

    const confirmacaoPre = PaginaVerificador.obterConfirmacao();
    if (getAcao('confirmar', estadoAtual).ativo && confirmacaoPre.modalAberto) {
        const did = await confirmar(estadoAtual, status, ctx);
        return !!did;
    }

    const acoesOrdenadas = getAcoesOrdenadas(estadoAtual);
    const handlerMap = createHandlerMap(ctx);

    for (const acao of acoesOrdenadas) {
        const handler = handlerMap[acao.id];
        if (handler) {
            const executado = await handler(estadoAtual, status);
            if (executado) return true;
        }
    }

    const itensInfo = PaginaVerificador.encontrarItensPendentesInfo(EstadoManager.get());
    atualizarTotaisLote(EstadoManager.get(), itensInfo);
    const itensPendentes = itensInfo.elegiveis;
    if (itensInfo.ignorados > 0 && itensInfo.ignorados !== lastItensEmAtuacaoCount) {
        log(`⏭️ Ignorados ${itensInfo.ignorados} item(ns) inelegíveis conhecidos`, 'info');
    }
    lastItensEmAtuacaoCount = itensInfo.ignorados;

    if (itensPendentes.length > 0) {
        buscaSemItemInicioTs = null;
        for (const candidato of itensPendentes) {
            const estadoAtualFresh = EstadoManager.get();
            const key = PaginaVerificador.extrairItemKey(candidato);

            const itemLabel = key || 'sem ID';
            const eAny = estadoAtualFresh as unknown as Record<string, unknown>;
            const mesmoItem = !!key && eAny['itemAtualKey'] === key;
            const cooldownKey = `selecionarItemNormal:${key || 'sem_id'}`;

            if (mesmoItem && CooldownManager.isAtivo(cooldownKey)) {
                if (status) {
                    const restante = Math.ceil(CooldownManager.tempoRestante(cooldownKey) / 1000);
                    status.textContent = `⏳ Aguardando abertura do item ${itemLabel} (${restante}s)...`;
                }
                return false;
            }

            if (key && !mesmoItem) {
                inicializarFlagsItemAtual(estadoAtualFresh, key);
                workflowState.reset();
            }

            CooldownManager.set(cooldownKey, (CONFIG.DELAYS as Record<string, number>).SELECIONAR_ITEM_COOLDOWN);
            if (status) status.textContent = 'Selecionando item...';
            await Interacao.interagir(candidato as HTMLElement, null, 'selecionarItemNormal');
            return true;
        }
    }

    if (await tentarPaginarProximaPagina(itensInfo, status)) return true;

    const agora = Date.now();
    if (buscaSemItemInicioTs == null) {
        buscaSemItemInicioTs = agora;
    } else if (agora - buscaSemItemInicioTs >= BUSCA_SEM_ITEM_TIMEOUT_MS) {
        scheduler.cancelarTimer();
        EstadoManager.update((e: EstadoApp) => { e.ativo = false; });
        const mensagem = 'Procura parada: nenhum item encontrado em 1 minuto.';
        if (status) status.textContent = mensagem;
        log(`⏹️ ${mensagem}`, 'warn');
        _atualizarBotaoToggle();
        _atualizarIndicadorProgresso();
        return false;
    }

    if (status) status.textContent = 'Aguardando...';
    return false;
}

// ---------------------------------------------------------------------------
// Ciclo principal
// ---------------------------------------------------------------------------
export async function executarCiclo(trigger: string = 'timer'): Promise<void> {
    const estado = EstadoManager.get();

    if (!roboAtivo || !estado.ativo || estado.pausado) return;

    if (cicloEmExecucao) {
        wakePending = true;
        return;
    }

    cicloEmExecucao = true;
    try {
        if (!PaginaVerificador.verificarSessao()) {
            log('🔐 Sessão expirada detectada!', 'error');
            AudioManager.tocar('error');
            EstadoManager.update((e: EstadoApp) => { e.ativo = false; });
            if (!isTestMode()) {
                alert('⚠️ Sua sessão expirou. Faça login novamente.');
            }
            return;
        }

        const itensInfo = PaginaVerificador.encontrarItensPendentesInfo(estado);
        atualizarTotaisLote(estado, itensInfo);

        _atualizarIndicadorProgresso();

        await executarLogica();
    } catch (erro) {
        const err = erro as Error;
        log(`❌ Erro na execução: ${err.message}`, 'error');
        EstadoManager.update((e: EstadoApp) => {
            const estat = e.estatisticas as unknown as Record<string, unknown>;
            (estat['erros'] as number)++;
            estat['ultimoErro'] = {
                tipo: 'execucao',
                mensagem: err.message,
                stack: err.stack,
                timestamp: new Date().toISOString()
            };
        });
        AudioManager.tocar('error');
    } finally {
        cicloEmExecucao = false;

        const st = EstadoManager.get();
        if (!roboAtivo || !st.ativo || st.pausado) return;

        wakePending = false;
        scheduler.scheduleNext(LOOP_TICK_MS);
    }
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------
export function registrarInteracao(acaoId: string): string {
    return scheduler.registrarInteracao(acaoId, EstadoManager.get());
}

export function wake(reason: string = 'wake'): void {
    const st = EstadoManager.get();
    if (!st.ativo || st.pausado || !roboAtivo) return;

    if (cicloEmExecucao) {
        wakePending = true;
        return;
    }

    if (scheduler.hasPendingTimer()) return;

    scheduler.scheduleNext(LOOP_TICK_MS);
}

export function pausarComAviso(mensagem: string, { alertUser = true, tipo = 'ncm_invalido' } = {}): void {
    scheduler.cancelarTimer();
    EstadoManager.update((e: EstadoApp) => {
        e.ativo = true;
        e.pausado = true;
        const estat = e.estatisticas as unknown as Record<string, unknown>;
        (estat['erros'] as number)++;
        estat['ultimoErro'] = {
            tipo,
            mensagem,
            timestamp: new Date().toISOString()
        };
    });

    log(`⏸️ ${mensagem}`, 'error');
    AudioManager.tocar('error');
    _atualizarBotaoToggle();
    _atualizarIndicadorProgresso();

    if (alertUser && !isTestMode()) {
        try { globalThis.alert(mensagem); } catch { }
    }
}

export function ativarKillSwitch(): void {
    roboAtivo = false;
    scheduler.cancelarTimer();

    EstadoManager.update((e: EstadoApp) => {
        e.ativo = false;
        e.pausado = false;
    });

    log('🛑 KILL SWITCH ATIVADO - Parando tudo!', 'error');
    AudioManager.tocar('error');
    if (!isTestMode()) {
        setTimeout(() => location.reload(), 300);
    }
}

export function togglePausar(): void {
    EstadoManager.update((e: EstadoApp) => { e.pausado = !e.pausado; });

    const novoEstado = EstadoManager.get();
    log(novoEstado.pausado ? '⏸️ PAUSADO' : '▶️ RETOMANDO', 'info');
    _atualizarBotaoToggle();

    if (!novoEstado.pausado && novoEstado.ativo) executarCiclo('resume');
}

export function iniciar(): void {
    const estado = EstadoManager.get();
    const totalPlanejadoJson = getTotalPlanejadoJson(estado);
    const exigeUnspsc = EmpresaJsonRequirements.empresaExigeUnspsc();

    ACOES_WORKFLOW.forEach((acao: AcaoWorkflow) => {
        const chk = document.getElementById(`chk_${acao.id}`) as HTMLInputElement | null;
        const val = document.getElementById(`val_${acao.id}`) as HTMLInputElement | null;
        const acoes = estado.acoes as Record<string, AcaoEstadoSlim>;
        if (acoes[acao.id]) {
            const disponivelParaEmpresa = !ehAcaoUnspsc(acao.id) || exigeUnspsc !== false;
            acoes[acao.id].ativo = disponivelParaEmpresa && (chk?.checked ?? true);
            if (val) acoes[acao.id].valor = val.value;
        }
    });

    EstadoManager.persistirAcoes(estado);
    estado.ativo = true;
    estado.pausado = false;
    const estadoAny = estado as unknown as Record<string, unknown>;
    estadoAny['progresso'] = { atual: 0, total: totalPlanejadoJson, ultimoProcessado: null, concluidosIds: [] };
    estadoAny['itemFlags'] = {};
    estadoAny['itemAtualKey'] = null;
    estadoAny['itemAtualTelaId'] = null;
    estadoAny['estimativa'] = Estimativa.resetarRodada(
        estado as Parameters<typeof Estimativa.resetarRodada>[0],
        {
            totalPlanejado: totalPlanejadoJson,
            fonteTotal: totalPlanejadoJson > 0 ? 'json' : null,
        }
    );
    estadoAny['trilhaExecucao'] = ItemTrace.resetarTrilhaExecucao(
        estado as Parameters<typeof ItemTrace.resetarTrilhaExecucao>[0],
        {
            runId: null,
            now: Date.now(),
        }
    );
    workflowState.reset();
    EstadoManager.set(estado);

    log('▶️ Ciclo iniciado', 'info');
    AudioManager.tocar('success');
    _atualizarBotaoToggle();

    roboAtivo = true;
    lastItensEmAtuacaoCount = -1;
    buscaSemItemInicioTs = null;
    scheduler.resetActionDelay();
    executarCiclo('start');
}

export function parar(): void {
    scheduler.cancelarTimer();
    retornoItemBloqueadoEmAndamento = false;
    EstadoManager.update((e: EstadoApp) => { e.ativo = false; });
    log('🛑 Ciclo parado', 'info');

    _atualizarBotaoToggle();
    _atualizarIndicadorProgresso();
}

export function limpar(): void {
    scheduler.cancelarTimer();
    CooldownManager.limpar();
    buscaSemItemInicioTs = null;
    retornoItemBloqueadoEmAndamento = false;
}

// ---------------------------------------------------------------------------
// Inicialização: hooks ASP.NET e interceptor de alertas NCM
// ---------------------------------------------------------------------------
export function inicializarHooks(): void {
    AspNetLifecycle.hook();
    AspNetLifecycle.subscribe(() => wake('asp_endRequest'));

    const alertOriginal = globalThis.alert;
    globalThis.alert = function (...args: unknown[]) {
        const msg = args?.[0];
        try {
            const estado = EstadoManager.get();
            const eAny = estado as unknown as Record<string, unknown>;
            const key = eAny['itemAtualKey'] as string | null;
            const itemFlags = eAny['itemFlags'] as Record<string, Record<string, unknown>> | undefined;
            const pendenteAte = Number(itemFlags?.[key ?? '']?.['ncmValidacaoPendenteAte'] || 0);
            const ncmLiberado = pendenteAte > Date.now();

            let alertaConsumido = false;
            if (PaginaVerificador.isMensagemNcmInvalido(String(msg ?? ''))) {
                if (ncmLiberado) {
                    registrarPausaCriticaNaTrilha({ tipo: 'ncm_invalido', mensagem: String(msg || '') });
                    pausarComAviso('NCM inválido detectado (alerta)', { alertUser: false, tipo: 'ncm_invalido' });
                    alertaConsumido = true;
                }
            } else if (PaginaVerificador.isMensagemNbsInvalido(String(msg ?? ''))) {
                if (ncmLiberado) {
                    registrarPausaCriticaNaTrilha({ tipo: 'nbs_invalido', mensagem: String(msg || '') });
                    pausarComAviso('NBS inválido detectado (alerta)', { alertUser: false, tipo: 'nbs_invalido' });
                    alertaConsumido = true;
                }
            } else if (PaginaVerificador.isMensagemSubGrupoInvalido(String(msg ?? ''))) {
                tratarAlertSubGrupoInvalido(String(msg || ''));
                alertaConsumido = true;
            }
            if (alertaConsumido) return undefined;
        } catch { }
        return alertOriginal.apply(globalThis, args as Parameters<typeof alert>);
    };

    Interacao.setRegistrarInteracao(registrarInteracao);
}
