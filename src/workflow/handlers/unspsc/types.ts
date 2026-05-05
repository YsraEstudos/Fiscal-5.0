import type { EstadoApp } from '../../../core/estado-manager.ts';

export interface AcaoInfo {
    ativo: boolean;
    seletor: string;
    [key: string]: unknown;
}

export type UnspscModo = 'modal' | 'inline' | 'none';

export interface UnspscWorkflowState {
    unspscValorDigitado: boolean;
    unspscPesquisado: boolean;
    unspscSelecionado: boolean;
    _lupaRetryCount?: number;
    isCompleta: (step: string) => boolean;
    marcarCompleta: (step: string) => void;
    debugLogThrottled?: (key: string, msg: string, ms: number) => void;
    getStatus?: () => string;
    [key: string]: unknown;
}

export interface SelecionarContext {
    getAcao: (id: string, estado: EstadoApp) => AcaoInfo;
    workflowState: UnspscWorkflowState;
    isModalUnspscAberto: (seletorUnspsc: string, seletorSelecionar: string) => boolean;
    getUnspscModo: (seletorUnspsc: string, seletorSelecionar: string) => UnspscModo;
    getValorAcao?: (id: string, estado: EstadoApp) => unknown;
}

export interface ResultadoContext {
    getAcao: (id: string, estado: EstadoApp) => AcaoInfo;
    workflowState: UnspscWorkflowState;
    isModalUnspscAberto: (seletorUnspsc: string, seletorSelecionar: string) => boolean;
    getUnspscModo: (seletorUnspsc: string, seletorSelecionar: string) => UnspscModo;
}

export interface PesquisarContext {
    getAcao: (id: string, estado: EstadoApp) => AcaoInfo;
    workflowState: UnspscWorkflowState;
    getModalUnspscContainer: () => Element | null;
    valoresSaoIguais: (a: string, b: unknown) => boolean;
    getValorAcao: (id: string, estado: EstadoApp) => unknown;
    getUnspscModo: (seletorUnspsc: string, seletorSelecionar: string) => UnspscModo;
    pausarComAviso?: (mensagem: string, opts?: { alertUser?: boolean; tipo?: string }) => void;
}

export interface UnspscContext {
    getAcao: (id: string, estado: EstadoApp) => AcaoInfo;
    workflowState: UnspscWorkflowState;
    getModalUnspscContainer: () => Element | null;
    valoresSaoIguais: (a: string, b: unknown) => boolean;
    getValorAcao: (id: string, estado: EstadoApp) => unknown;
    getUnspscModo: (seletorUnspsc: string, seletorSelecionar: string) => UnspscModo;
    pausarComAviso?: (mensagem: string, opts?: { alertUser?: boolean; tipo?: string }) => void;
}

export interface LupaContext {
    getAcao: (id: string, estado: EstadoApp) => AcaoInfo;
    workflowState: UnspscWorkflowState;
    getModalUnspscContainer: () => Element | null;
    isModalUnspscAberto: (seletorUnspsc: string, seletorSelecionar: string) => boolean;
    getUnspscModo: (seletorUnspsc: string, seletorSelecionar: string) => UnspscModo;
}

export type UnspscItemFlags = {
    unspscFeito?: boolean;
    unspscModoDetectado?: UnspscModo | null;
    unspscInlinePostbackTentado?: boolean;
    unspscInlineFallbackTentado?: boolean;
    unspscInlineValorTentado?: string | null;
    [key: string]: unknown;
};
