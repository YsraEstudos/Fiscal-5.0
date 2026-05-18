import type { ReportingDefaults } from '../../config/constants.ts';
import type { LogEntry } from '../log-manager.ts';

export interface AcaoEstado {
    ativo: boolean;
    seletor: string;
    valor: string | null;
    ordem: number;
}

export interface ProgressoEstado {
    atual: number;
    total: number;
    ultimoProcessado: string | null;
    concluidosIds: string[];
}

export interface EstimativaEstado {
    totalPlanejado: number;
    fonteTotal: 'json' | 'fila' | null;
    itemAtualId: string | null;
    itemAtualInicioTs: number | null;
    primeiroItemId: string | null;
    primeiroItemDuracaoMs: number | null;
    duracaoTotalConcluidosMs: number;
    duracaoAmostras: number;
    tempoMedioReferenciaMs: number | null;
    restantes: number;
    etaRestanteMs: number | null;
    previsaoTerminoTs: number | null;
    ultimoItemConcluidoTs: number | null;
}

export interface PainelSecoes {
    resumo: boolean;
    trilha: boolean;
    workflow: boolean;
    json: boolean;
    controle: boolean;
    opcoes: boolean;
    perfil: boolean;
    logs: boolean;
    progresso: boolean;
}

export interface PainelPosicao {
    top: string;
}

export interface UltimoErro {
    tipo: string;
    seletor?: string;
    timestamp?: string;
    [key: string]: unknown;
}

export interface PerfilConfig {
    reporting: ReportingDefaults;
}

export interface EstadoApp {
    schemaVersion: number;
    ativo: boolean;
    pausado: boolean;
    pausarEmReincidencia: boolean;
    minimizado: boolean;
    modoSimulacao: boolean;
    modoInspecao: boolean;
    globalActionDelayMs: number;
    clickCooldownMs: number;
    perfilAtivo: string;
    perfis: Record<string, Record<string, AcaoEstado>>;
    perfilConfigs: Record<string, PerfilConfig>;
    progresso: ProgressoEstado;
    logs: LogEntry[];
    estatisticas: { processados: number; erros: number; ultimoErro: UltimoErro | null };
    painelPosicao: PainelPosicao | null;
    painelSecoes: PainelSecoes;
    painelScrollTop: number;
    logAreaHeight: number;
    itemAtualKey: string | null;
    itemAtualTelaId: string | null;
    reportingSessionMap: Record<string, unknown>;
    estimativa: EstimativaEstado;
    trilhaExecucao: unknown;
    itemFlags: Record<string, unknown>;
    itemMapAtivo: boolean;
    itemMapJson: string;
    itemMap: Record<string, unknown>;
    itemMapUltimoAplicadoId: string | null;
    reporting: ReportingDefaults;
    acoes: Record<string, AcaoEstado>;
}
