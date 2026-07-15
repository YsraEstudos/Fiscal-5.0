import { CONFIG } from '../../config/constants.ts';
import { normalizarTrilhaExecucao, TRILHA_EXECUCAO_PADRAO } from '../../workflow/item-trace.ts';
import { normalizarEstimativa, normalizarPainelSecoes, normalizarProgresso } from './normalizers.ts';
import type { EstadoApp, EstimativaEstado } from './types.ts';

export const ESTIMATIVA_PADRAO: Readonly<EstimativaEstado> = Object.freeze({
    totalPlanejado: 0,
    fonteTotal: null,
    itemAtualId: null,
    itemAtualInicioTs: null,
    primeiroItemId: null,
    primeiroItemDuracaoMs: null,
    duracaoTotalConcluidosMs: 0,
    duracaoAmostras: 0,
    tempoMedioReferenciaMs: null,
    restantes: 0,
    etaRestanteMs: null,
    previsaoTerminoTs: null,
    ultimoItemConcluidoTs: null,
});

export { PAINEL_SECOES_PADRAO } from './normalizers.ts';

export const ESTADO_PADRAO: EstadoApp = {
    schemaVersion: CONFIG.SCHEMA_VERSION,
    ativo: false,
    pausado: false,
    pausarEmReincidencia: true,
    minimizado: true,
    modoSimulacao: false,
    modoInspecao: false,
    globalActionDelayMs: 1200,
    clickCooldownMs: 3000,
    perfilAtivo: 'default',
    perfis: {},
    progresso: normalizarProgresso(null),
    logs: [],
    estatisticas: { processados: 0, erros: 0, ultimoErro: null },
    painelPosicao: null,
    painelSecoes: normalizarPainelSecoes(null),
    painelScrollTop: 0,
    logAreaHeight: 110,
    itemAtualKey: null,
    itemAtualTelaId: null,
    estimativa: normalizarEstimativa(ESTIMATIVA_PADRAO),
    trilhaExecucao: normalizarTrilhaExecucao(TRILHA_EXECUCAO_PADRAO),
    itemFlags: {},
    itemMapAtivo: false,
    itemMapJson: '',
    itemMap: {},
    itemMapUltimoAplicadoId: null,
    fiscalHintsAtivo: true,
    fiscalHintsJson: '',
    fiscalHints: {},
    acoes: {},
};
