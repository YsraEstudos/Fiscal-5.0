import { CONFIG } from '../../config/constants.ts';
import { normalizarTrilhaExecucao } from '../../workflow/item-trace.ts';
import { clone } from '../../utils/misc.ts';
import { inicializarAcoes } from './actions.ts';
import { ESTADO_PADRAO } from './defaults.ts';
import { garantirDefaultsEstado, migrarEstadoSalvo, type EstadoSalvoRaw } from './migrations.ts';
import {
    normalizarEstimativa,
    normalizarIntervaloDelay,
    normalizarLogAreaHeight,
    normalizarPainelPosicao,
    normalizarPainelScrollTop,
    normalizarPainelSecoes,
    normalizarPrazoReativacao,
    normalizarProgresso,
    normalizarTempoDesativacaoChecks,
} from './normalizers.ts';
import type { AcaoEstado, EstadoApp } from './types.ts';

let cache: EstadoApp | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 100;

function carregarEstadoAtual(salvo: EstadoSalvoRaw): EstadoApp {
    let estado: EstadoApp = {
        ...ESTADO_PADRAO,
        ...salvo,
        acoes: { ...(salvo['acoes'] as Record<string, AcaoEstado> || {}) },
    };
    const estadoLegado = estado as unknown as Record<string, unknown>;
    delete estadoLegado['reporting'];
    delete estadoLegado['reportingSessionMap'];
    delete estadoLegado['perfilConfigs'];
    estado.progresso = normalizarProgresso(salvo['progresso']);
    estado.painelPosicao = normalizarPainelPosicao(salvo['painelPosicao']);
    estado.painelSecoes = normalizarPainelSecoes(salvo['painelSecoes']);
    estado.painelScrollTop = normalizarPainelScrollTop(salvo['painelScrollTop']);
    estado.logAreaHeight = normalizarLogAreaHeight(salvo['logAreaHeight']);
    estado.estimativa = normalizarEstimativa(salvo['estimativa']);
    estado.trilhaExecucao = normalizarTrilhaExecucao(salvo['trilhaExecucao']);
    const intervaloDelay = normalizarIntervaloDelay(
        salvo['globalActionDelayMinMs'],
        salvo['globalActionDelayMaxMs'],
        salvo['globalActionDelayMs'],
    );
    estado.globalActionDelayMinMs = intervaloDelay.minimo;
    estado.globalActionDelayMaxMs = intervaloDelay.maximo;
    estado.globalActionDelayMs = intervaloDelay.maximo;
    estado.tempoDesativacaoChecksMinutos = normalizarTempoDesativacaoChecks(salvo['tempoDesativacaoChecksMinutos']);
    estado.pausarEmReincidencia = salvo['pausarEmReincidencia'] !== undefined
        ? !!salvo['pausarEmReincidencia']
        : true;
    const prazoPausaReincidencia = normalizarPrazoReativacao(salvo['pausarEmReincidenciaReativarEm']);
    estado.pausarEmReincidenciaReativarEm = estado.pausarEmReincidencia
        ? null
        : prazoPausaReincidencia;
    const pausaAcompanhamentoSalva = salvo['pausarAcompanhamento'] ?? salvo['pausarNcmAcompanhamento'];
    estado.pausarAcompanhamento = pausaAcompanhamentoSalva !== undefined
        ? !!pausaAcompanhamentoSalva
        : true;
    const prazoPausaAcompanhamento = normalizarPrazoReativacao(
        salvo['pausarAcompanhamentoReativarEm'] ?? salvo['pausarNcmAcompanhamentoReativarEm']
    );
    estado.pausarAcompanhamentoReativarEm = estado.pausarAcompanhamento
        ? null
        : prazoPausaAcompanhamento;
    estado = inicializarAcoes(estado);
    return garantirDefaultsEstado(estado);
}

export function get(): EstadoApp {
    const agora = Date.now();
    if (cache && (agora - cacheTimestamp) < CACHE_TTL) return cache;

    try {
        const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
        const salvo: EstadoSalvoRaw = (raw ? JSON.parse(raw) : null) || {};
        const schemaVersion = Number(salvo['schemaVersion']);

        cache = !schemaVersion || schemaVersion < CONFIG.SCHEMA_VERSION
            ? migrarEstadoSalvo(salvo, set)
            : carregarEstadoAtual(salvo);

        cacheTimestamp = agora;
        return cache;
    } catch (e) {
        console.error('[KM] Erro ao carregar estado:', e);
        cache = clone(ESTADO_PADRAO) as EstadoApp;
        cacheTimestamp = agora;
        return cache;
    }
}

export function set(novoEstado: EstadoApp): void {
    novoEstado.schemaVersion = CONFIG.SCHEMA_VERSION;
    cache = novoEstado;
    cacheTimestamp = Date.now();
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(novoEstado));
}

export function update(modificador: ((estado: EstadoApp) => void) | Partial<EstadoApp>): EstadoApp {
    const estado = get();
    if (typeof modificador === 'function') modificador(estado);
    else Object.assign(estado, modificador);
    set(estado);
    return estado;
}

export function persistirAcoes(estado: EstadoApp): void {
    const nome = estado.perfilAtivo || 'default';
    estado.perfis = estado.perfis || {};
    estado.perfis[nome] = clone(estado.acoes) as Record<string, AcaoEstado>;
}

export function invalidar(): void {
    cache = null;
    cacheTimestamp = 0;
}
