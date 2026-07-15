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
    fiscalHints: boolean;
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


export interface EstadoApp {
    schemaVersion: number;
    ativo: boolean;
    pausado: boolean;
    pausarEmReincidencia: boolean;
    pausarAcompanhamento: boolean;
    pausarAcompanhamentoReativarEm: number | null;
    minimizado: boolean;
    modoSimulacao: boolean;
    modoInspecao: boolean;
    globalActionDelayMs: number;
    clickCooldownMs: number;
    perfilAtivo: string;
    perfis: Record<string, Record<string, AcaoEstado>>;
    progresso: ProgressoEstado;
    logs: LogEntry[];
    estatisticas: { processados: number; erros: number; ultimoErro: UltimoErro | null };
    painelPosicao: PainelPosicao | null;
    painelSecoes: PainelSecoes;
    painelScrollTop: number;
    logAreaHeight: number;
    /** @contract — usado por item-map-manager.ts, executor.ts, item-flow.ts */
    itemAtualKey: string | null;
    /** @contract — usado por item-map-manager.ts, executor.ts, item-flow.ts */
    itemAtualTelaId: string | null;
    estimativa: EstimativaEstado;
    trilhaExecucao: unknown;
    /** @contract — usado por item-map-manager.ts, item-flow.ts, executor.ts */
    itemFlags: Record<string, unknown>;
    /** @contract — liga/desliga o sistema JSON por item (item-map-manager.ts) */
    itemMapAtivo: boolean;
    /** @contract — JSON bruto do textarea (item-map-manager.ts, painel-events.ts) */
    itemMapJson: string;
    /** @contract — mapa parsed ID→ItemMapEntry (item-map-manager.ts, progress-totals.ts) */
    itemMap: Record<string, unknown>;
    /** @contract — anti-duplicação de log (item-map-manager.ts) */
    itemMapUltimoAplicadoId: string | null;
    fiscalHintsAtivo: boolean;
    fiscalHintsJson: string;
    fiscalHints: Record<string, unknown>;
    acoes: Record<string, AcaoEstado>;
}
