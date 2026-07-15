import { normalizarTrilhaExecucao } from '../../workflow/item-trace.ts';
import { clone } from '../../utils/misc.ts';
import { inicializarAcoes } from './actions.ts';
import { ESTADO_PADRAO } from './defaults.ts';
import {
    normalizarEstimativa,
    normalizarLogAreaHeight,
    normalizarNumeroInteiro,
    normalizarPainelPosicao,
    normalizarPainelScrollTop,
    normalizarPainelSecoes,
    normalizarProgresso,
} from './normalizers.ts';
import type { AcaoEstado, EstadoApp } from './types.ts';

export type EstadoSalvoRaw = Record<string, unknown>;

type TarefaLegada = {
    ativo?: boolean;
    valor?: string;
};

function isRecord(valor: unknown): valor is Record<string, unknown> {
    return !!valor && typeof valor === 'object';
}

function normalizarStringOuVazio(valor: unknown): string {
    return valor ? String(valor) : '';
}

function aplicarTarefasLegadas(novo: EstadoApp, tarefasRaw: unknown): void {
    if (!isRecord(tarefasRaw)) return;
    const tarefas = tarefasRaw as Record<string, TarefaLegada>;

    if (tarefas['ncm']) {
        novo.acoes['ncm'] = {
            ativo: tarefas['ncm'].ativo ?? true,
            seletor: '#txtNCMTIPI',
            valor: tarefas['ncm'].valor || '8471.30.12',
            ordem: 3,
        };
    }
    if (tarefas['unspsc']) {
        novo.acoes['unspsc'] = {
            ativo: tarefas['unspsc'].ativo ?? true,
            seletor: '#txtCodigoUnspsc, #txtCodUNSPSC, input[name$="txtCodigoUnspsc"], input[name$="txtCodUNSPSC"]',
            valor: tarefas['unspsc'].valor || '43211503',
            ordem: 7,
        };
    }
    if (tarefas['finalizar']) {
        novo.acoes['prosseguir'] = { ativo: tarefas['finalizar'].ativo ?? true, seletor: '#butAcao1', valor: null, ordem: 12 };
        novo.acoes['confirmar'] = { ativo: tarefas['finalizar'].ativo ?? true, seletor: '#butSim', valor: null, ordem: 13 };
    }
}

export function garantirDefaultsEstado(estado: EstadoApp): EstadoApp {
    if (!estado.perfis?.['default']) {
        estado.perfis = { ...(estado.perfis || {}), default: clone(estado.acoes) as Record<string, AcaoEstado> };
    }

    estado.painelPosicao = normalizarPainelPosicao(estado.painelPosicao);
    estado.progresso = normalizarProgresso(estado.progresso);
    estado.painelSecoes = normalizarPainelSecoes(estado.painelSecoes);
    estado.painelScrollTop = normalizarPainelScrollTop(estado.painelScrollTop);
    estado.logAreaHeight = normalizarLogAreaHeight(estado.logAreaHeight);
    estado.estimativa = normalizarEstimativa(estado.estimativa);
    estado.trilhaExecucao = normalizarTrilhaExecucao(estado.trilhaExecucao);

    return estado;
}

export function migrarEstadoSalvo(antigo: EstadoSalvoRaw, salvar: (estado: EstadoApp) => void): EstadoApp {
    const novo = clone(ESTADO_PADRAO) as EstadoApp;

    if (isRecord(antigo['perfis'])) novo.perfis = antigo['perfis'] as typeof novo.perfis;
    if (antigo['ativo'] !== undefined) novo.ativo = !!antigo['ativo'];
    if (antigo['pausado'] !== undefined) novo.pausado = !!antigo['pausado'];
    if (antigo['pausarEmReincidencia'] !== undefined) novo.pausarEmReincidencia = !!antigo['pausarEmReincidencia'];
    if (antigo['minimizado'] !== undefined) novo.minimizado = !!antigo['minimizado'];
    if (Array.isArray(antigo['logs'])) novo.logs = antigo['logs'] as typeof novo.logs;
    if (isRecord(antigo['estatisticas'])) novo.estatisticas = antigo['estatisticas'] as typeof novo.estatisticas;
    novo.progresso = normalizarProgresso(antigo['progresso']);
    novo.painelPosicao = normalizarPainelPosicao(antigo['painelPosicao']);
    novo.painelSecoes = normalizarPainelSecoes(antigo['painelSecoes']);
    novo.painelScrollTop = normalizarPainelScrollTop(antigo['painelScrollTop']);
    novo.logAreaHeight = normalizarLogAreaHeight(antigo['logAreaHeight']);
    if (antigo['modoSimulacao'] !== undefined) novo.modoSimulacao = !!antigo['modoSimulacao'];

    if (antigo['globalActionDelayMs'] !== undefined) novo.globalActionDelayMs = normalizarNumeroInteiro(antigo['globalActionDelayMs'], novo.globalActionDelayMs);
    else if (antigo['actionDelayMs'] !== undefined) novo.globalActionDelayMs = normalizarNumeroInteiro(antigo['actionDelayMs'], novo.globalActionDelayMs);
    else if (antigo['delayMs'] !== undefined) novo.globalActionDelayMs = normalizarNumeroInteiro(antigo['delayMs'], novo.globalActionDelayMs);

    if (antigo['clickCooldownMs'] !== undefined) novo.clickCooldownMs = normalizarNumeroInteiro(antigo['clickCooldownMs'], novo.clickCooldownMs);
    if (antigo['itemMapAtivo'] !== undefined) novo.itemMapAtivo = !!antigo['itemMapAtivo'];
    if (antigo['itemMapJson']) novo.itemMapJson = normalizarStringOuVazio(antigo['itemMapJson']);
    if (isRecord(antigo['itemMap'])) novo.itemMap = antigo['itemMap'];
    if (antigo['itemMapUltimoAplicadoId']) novo.itemMapUltimoAplicadoId = String(antigo['itemMapUltimoAplicadoId']);
    if (antigo['itemAtualTelaId']) novo.itemAtualTelaId = String(antigo['itemAtualTelaId']);
    if (antigo['fiscalHintsAtivo'] !== undefined) novo.fiscalHintsAtivo = !!antigo['fiscalHintsAtivo'];
    if (antigo['fiscalHintsJson'] !== undefined) novo.fiscalHintsJson = String(antigo['fiscalHintsJson']);
    if (isRecord(antigo['fiscalHints'])) novo.fiscalHints = antigo['fiscalHints'] as Record<string, unknown>;

    novo.estimativa = normalizarEstimativa(antigo['estimativa']);
    novo.trilhaExecucao = normalizarTrilhaExecucao(antigo['trilhaExecucao']);

    aplicarTarefasLegadas(novo, antigo['tarefas']);
    inicializarAcoes(novo);
    novo.perfis['default'] = clone(novo.acoes) as Record<string, AcaoEstado>;
    salvar(novo);
    return novo;
}
