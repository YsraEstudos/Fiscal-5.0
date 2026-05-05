import type { EstadoApp } from '../core/estado-manager.ts';
import type { AcaoWorkflow } from '../config/workflow-actions.ts';
import type * as Estimativa from './estimativa.ts';

export interface UICallbacks {
    atualizarBotaoToggle?: () => void;
    atualizarIndicadorProgresso?: () => void;
}

export interface AcaoEstadoSlim {
    ativo: boolean;
    seletor: string;
    valor: string | null;
    ordem?: number;
    [key: string]: unknown;
}

export interface WorkflowStateObj {
    faseCompleta: Set<string>;
    unspscValorDigitado: boolean;
    unspscPesquisado: boolean;
    unspscSelecionado: boolean;
    debugMode: boolean;
    _debugLastSeen: Map<string, number>;
    _lupaRetryCount?: number;
    reset(): void;
    marcarCompleta(fase: string): void;
    isCompleta(fase: string): boolean;
    debugLog(msg: string): void;
    debugLogThrottled(chave: string, msg: string, intervaloMs?: number): void;
    getStatus(): string;
    [key: string]: unknown;
}

export interface TotaisDinamicos {
    totalPlanejado: number;
    concluidosEfetivos: number;
    pendentesServidor: number;
    fonteTotal: 'json' | 'fila';
}

export interface WorkflowContext {
    getAcao: (id: string, estado: EstadoApp) => AcaoEstadoSlim;
    workflowState: WorkflowStateObj;
    itemJaTemUnspsc: (estado: EstadoApp) => boolean;
    habilitarValidacaoNcmAposInsercao: (estado: EstadoApp) => void;
    isValidacaoNcmLiberada: (estado: EstadoApp) => boolean;
    registrarAvisoValidacaoNcmAguardando: (estado: EstadoApp) => void;
    getValorAcao: (id: string, estado: EstadoApp) => unknown;
    valoresSaoIguais: (a: string, b: unknown) => boolean;
    marcarItemConcluido: (
        estado: EstadoApp,
        itemKey: string | null | undefined,
        opts?: { now?: number }
    ) => ReturnType<typeof Estimativa.registrarConclusaoItem>;
    pausarComAviso: (mensagem: string, opts?: { alertUser?: boolean; tipo?: string }) => void;
    getModalUnspscContainer: () => Element | null;
    isModalUnspscAberto: (seletorUnspsc: string, seletorSelecionar: string) => boolean;
    getUnspscModo: (seletorUnspsc: string, seletorSelecionar: string) => 'modal' | 'inline' | 'none';
    [key: string]: unknown;
}

export type HandlerFn = (estado: EstadoApp, status: HTMLElement | null) => Promise<boolean>;
export type HandlerMap = Record<string, HandlerFn>;
export type { AcaoWorkflow };
