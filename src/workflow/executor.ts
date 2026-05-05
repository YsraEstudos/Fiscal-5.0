/**
 * Motor principal do workflow (WorkflowExecutor).
 * Extraído do monólito — linhas 3085–4216.
 *
 * Orquestra os handlers, o loop de ciclo, e o estado de workflow.
 * Referências a UI (atualizarBotaoToggle, atualizarIndicadorProgresso) são
 * injetadas via setters para evitar dependência circular com Fase 5.
 */

import { CONFIG } from '../config/constants.ts';
import { ACOES_WORKFLOW } from '../config/workflow-actions.ts';
import * as EstadoManager from '../core/estado-manager.ts';
import { normalizarReportingConfig } from '../core/estado-manager.ts';
import type { EstadoApp } from '../core/estado-manager.ts';
import type { AcaoWorkflow } from '../config/workflow-actions.ts';
import { log } from '../core/log-manager.ts';
import * as CooldownManager from '../core/cooldown-manager.ts';
import * as AudioManager from '../interaction/audio-manager.ts';
import * as AspNetLifecycle from '../core/aspnet-lifecycle.ts';
import * as Interacao from '../interaction/interacao.ts';
import * as PaginaVerificador from './pagina-verificador.ts';
import * as ItemMapManager from '../data/item-map-manager.ts';
import * as Estimativa from './estimativa.ts';
import * as ItemTrace from './item-trace.ts';
import { isTestMode, sleep, valoresSaoIguais } from '../utils/misc.ts';
import { normalizarEspacos } from '../utils/text.ts';
import { buscarElementoDeep } from '../utils/selectors.ts';
import { resolverOuCriarSessionRunId, getReportingConfig } from '../reporting/session.ts';
import { touchSessionNoServico } from '../reporting/session.ts';
import { confirmar, setAtualizarBotaoToggle } from './handlers/flow-control.js';
import { workflowState } from './workflow-state.ts';
import { atualizarTotaisLote, getTotalPlanejadoJson } from './progress-totals.ts';
import {
    inicializarFlagsItemAtual,
    limparContextoTelaStaleSeNecessario,
    marcarItemConcluido,
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
const BUSCA_SEM_ITEM_TIMEOUT_MS = 60_000;
const scheduler = createWorkflowScheduler((trigger: string) => {
    void executarCiclo(trigger);
});

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------
function getAcao(id: string, estado: EstadoApp): AcaoEstadoSlim {
    return (estado.acoes as Record<string, AcaoEstadoSlim>)[id] || { ativo: false, seletor: '', valor: null };
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

// ---------------------------------------------------------------------------
// Lógica principal
// ---------------------------------------------------------------------------
async function executarLogica(): Promise<boolean> {
    const estado = EstadoManager.get();
    const status = document.getElementById('statusRobo');

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

    const itensInfo = PaginaVerificador.encontrarItensPendentesInfo();
    atualizarTotaisLote(EstadoManager.get(), itensInfo);
    const itensPendentes = itensInfo.elegiveis;
    if (itensInfo.ignorados > 0 && itensInfo.ignorados !== lastItensEmAtuacaoCount) {
        log(`⏭️ Ignorados ${itensInfo.ignorados} item(ns) em atuação`, 'info');
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

        const itensInfo = PaginaVerificador.encontrarItensPendentesInfo();
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

    ACOES_WORKFLOW.forEach((acao: AcaoWorkflow) => {
        const chk = document.getElementById(`chk_${acao.id}`) as HTMLInputElement | null;
        const val = document.getElementById(`val_${acao.id}`) as HTMLInputElement | null;
        const acoes = estado.acoes as Record<string, AcaoEstadoSlim>;
        if (acoes[acao.id]) {
            acoes[acao.id].ativo = chk?.checked ?? true;
            if (val) acoes[acao.id].valor = val.value;
        }
    });

    EstadoManager.persistirAcoes(estado);
    const estadoAny = estado as unknown as Record<string, unknown>;
    estadoAny['reporting'] = normalizarReportingConfig(estadoAny['reporting']);
    (estadoAny['reporting'] as Record<string, unknown>)['sessionRunId'] = resolverOuCriarSessionRunId(estado);
    estado.ativo = true;
    estado.pausado = false;
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
            runId: (estadoAny['reporting'] as Record<string, unknown>)['sessionRunId'] as string,
            now: Date.now(),
        }
    );
    workflowState.reset();
    EstadoManager.set(estado);

    log(`▶️ Ciclo iniciado (session: ${(estadoAny['reporting'] as Record<string, unknown>)['sessionRunId']})`, 'info');
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
    EstadoManager.update((e: EstadoApp) => { e.ativo = false; });
    log('🛑 Ciclo parado', 'info');

    const estado = EstadoManager.get();
    const reporting = getReportingConfig(estado);
    if ((reporting as Record<string, unknown>)['serviceUrl']) {
        touchSessionNoServico(estado, 'manual-stop')
            .then((data: Record<string, unknown>) => {
                const dir = data?.['sessionDir'] as string || '-';
                log(`📁 Sessão de relatório atualizada: ${dir}`, 'info');
            })
            .catch((err: unknown) => {
                const e = err as Error;
                log(`⚠️ Não foi possível criar/atualizar pasta da sessão ao parar: ${e?.message || err}`, 'warn');
            });
    }

    _atualizarBotaoToggle();
    _atualizarIndicadorProgresso();
}

export function limpar(): void {
    scheduler.cancelarTimer();
    CooldownManager.limpar();
    buscaSemItemInicioTs = null;
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

            if (PaginaVerificador.isMensagemNcmInvalido(String(msg ?? ''))) {
                if (ncmLiberado) {
                    registrarPausaCriticaNaTrilha({ tipo: 'ncm_invalido', mensagem: String(msg || '') });
                    pausarComAviso('NCM inválido detectado (alerta)', { alertUser: false, tipo: 'ncm_invalido' });
                }
            } else if (PaginaVerificador.isMensagemNbsInvalido(String(msg ?? ''))) {
                if (ncmLiberado) {
                    registrarPausaCriticaNaTrilha({ tipo: 'nbs_invalido', mensagem: String(msg || '') });
                    pausarComAviso('NBS inválido detectado (alerta)', { alertUser: false, tipo: 'nbs_invalido' });
                }
            }
        } catch { }
        return alertOriginal.apply(globalThis, args as Parameters<typeof alert>);
    };

    Interacao.setRegistrarInteracao(registrarInteracao);
}
