/**
 * Constantes globais de configuração do FISCAL 5.0.
 * Extraído do monólito (linhas 39–142).
 */

interface ValidadorConfig {
    readonly regex: RegExp;
    readonly mensagem: string;
}

interface ReportingConfig {
    readonly SERVICE_DEFAULT: string;
    readonly SERVICE_TIMEOUT_MS: number;
    readonly FETCH_TIMEOUT_MS: number;
    readonly RETRY_ATTEMPTS: number;
    readonly RETRY_BASE_DELAY_MS: number;
    readonly RETRY_JITTER_MS: number;
    readonly MAX_MEDIA_DOWNLOADS: number;
    readonly MAX_FILE_SIZE_MB: number;
    readonly MAX_FILES_PER_ITEM: number;
    readonly IMPORTANT_YELLOW_KEYWORDS: readonly string[];
    readonly ALTERACAO_CAMPOS_CHAVE: readonly string[];
}

interface AppConfig {
    readonly SCHEMA_VERSION: number;
    readonly LOG_MAX_ENTRIES: number;
    readonly STORAGE_KEY: string;
    readonly RETRY: Readonly<{
        MAX_TENTATIVAS: number;
        DELAY_BASE: number;
        MULTIPLICADOR: number;
    }>;
    readonly DELAYS: Readonly<{
        UNSPSC_MODAL: number;
        LUPA_COOLDOWN: number;
        ABA_CLASSIFICACAO_COOLDOWN: number;
        RESULTADOS_TIMEOUT: number;
        RESULTADO_COOLDOWN: number;
        POS_SELECIONAR_COOLDOWN: number;
        SELECIONAR_ITEM_COOLDOWN: number;
        NCM_VALIDACAO_JANELA: number;
        TYPING_MIN: number;
        TYPING_MAX: number;
        ESTABILIDADE: number;
    }>;
    readonly VALIDADORES: Readonly<Record<string, ValidadorConfig>>;
    readonly MENSAGENS: Readonly<{
        SUCESSO: readonly string[];
        ERRO: readonly string[];
        LOGOUT: readonly string[];
    }>;
    readonly SONS: Readonly<{
        success: readonly number[];
        error: readonly number[];
        warning: readonly number[];
        complete: readonly number[];
    }>;
    readonly REPORTING: Readonly<ReportingConfig>;
}

export const CONFIG: AppConfig = Object.freeze({
    SCHEMA_VERSION: 11,
    LOG_MAX_ENTRIES: 100,
    STORAGE_KEY: 'km_robo_state',

    RETRY: Object.freeze({
        MAX_TENTATIVAS: 3,
        DELAY_BASE: 500,
        MULTIPLICADOR: 2,
    }),

    DELAYS: Object.freeze({
        UNSPSC_MODAL: 3000,
        LUPA_COOLDOWN: 5000,
        ABA_CLASSIFICACAO_COOLDOWN: 4000,
        RESULTADOS_TIMEOUT: 8000,
        RESULTADO_COOLDOWN: 3000,
        POS_SELECIONAR_COOLDOWN: 4000,
        SELECIONAR_ITEM_COOLDOWN: 5000,
        NCM_VALIDACAO_JANELA: 15000,
        TYPING_MIN: 30,
        TYPING_MAX: 90,
        ESTABILIDADE: 250,
    }),

    VALIDADORES: Object.freeze({
        ncm: { regex: /^\d{4}\.\d{2}\.\d{2}$/, mensagem: 'NCM deve ter formato 0000.00.00' },
        nbs: { regex: /^\d{1,2}\.\d{4}\.\d{2}\.\d{2}$/, mensagem: 'NBS deve ter formato 0.0000.00.00 ou 00.0000.00.00' },
        cest: { regex: /^(?:\d{7}|\d{2}\.\d{3}\.\d{2})(?:\s+-\s+.+)?$/, mensagem: 'CEST deve ter formato 00.000.00' },
        unspsc: { regex: /^\d{8}$/, mensagem: 'UNSPSC deve ter 8 dígitos numéricos' },
        lei116Servico: { regex: /^\d{1,2}\.\d{2}$/, mensagem: 'Lei 116 deve ter formato 0.00 ou 00.00' },
    }),

    MENSAGENS: Object.freeze({
        SUCESSO: ['Salvo com sucesso', 'Operação realizada', 'Registro atualizado', 'Item processado'],
        ERRO: ['Erro', 'Falha', 'Não foi possível', 'Inválido'],
        LOGOUT: ['sessão expirou', 'faça login novamente', 'session expired'],
    }),

    SONS: Object.freeze({
        success: [523.25, 659.25, 783.99],
        error: [349.23, 293.66],
        warning: [440],
        complete: [523.25, 659.25, 783.99, 1046.5],
    }),

    REPORTING: Object.freeze({
        SERVICE_DEFAULT: 'http://127.0.0.1:8765',
        SERVICE_TIMEOUT_MS: 120000,
        FETCH_TIMEOUT_MS: 30000,
        RETRY_ATTEMPTS: 3,
        RETRY_BASE_DELAY_MS: 600,
        RETRY_JITTER_MS: 300,
        MAX_MEDIA_DOWNLOADS: 20,
        MAX_FILE_SIZE_MB: 25,
        MAX_FILES_PER_ITEM: 20,
        IMPORTANT_YELLOW_KEYWORDS: Object.freeze([
            'usar',
            'urgente',
            'criar codigo',
            'atributo',
            'pdm',
            'corrigir',
            'ajustar',
            'fiscal',
            'integra',
            'klassmatt',
        ]),
        ALTERACAO_CAMPOS_CHAVE: Object.freeze([
            'NCM',
            'NBS',
            'UNSPSC',
            'TIPO BRINDE',
            'GRUPO DE MATERIAIS',
            'LINHA PRODUTO',
            'TIPO DE MATERIAL',
            'MATERIAL',
            'COR',
            'DADOS COMPLEMENTARES',
            'DESCRICAO',
            'DESCRIÇÃO',
        ]),
    }),
});

export interface ReportingDefaults {
    enabledReport: boolean;
    enabledMedia: boolean;
    clickMediaTabBeforeCollect: boolean;
    enabledAcompanhamento: boolean;
    blockOnReportError: boolean;
    serviceUrl: string;
    apiToken: string;
    transport: string;
    maxFileSizeMb: number;
    maxFilesPerItem: number;
    sessionRunId: string | null;
    ocrEnabled: boolean;
    ocrEngine: string;
}

export const REPORTING_DEFAULTS: Readonly<ReportingDefaults> = Object.freeze({
    enabledReport: false,
    enabledMedia: false,
    clickMediaTabBeforeCollect: false,
    enabledAcompanhamento: false,
    blockOnReportError: false,
    serviceUrl: CONFIG.REPORTING.SERVICE_DEFAULT,
    apiToken: 'km-local-token',
    transport: 'auto',
    maxFileSizeMb: CONFIG.REPORTING.MAX_FILE_SIZE_MB,
    maxFilesPerItem: CONFIG.REPORTING.MAX_FILES_PER_ITEM,
    sessionRunId: null,
    ocrEnabled: true,
    ocrEngine: 'tesseract',
});

export const REPORTING_ERROR_CODES = Object.freeze({
    MEDIA_PARSE_ERROR: 'MEDIA_PARSE_ERROR',
    HISTORICO_PARSE_ERROR: 'HISTORICO_PARSE_ERROR',
    SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
    UPLOAD_LIMIT_EXCEEDED: 'UPLOAD_LIMIT_EXCEEDED',
    SERVICE_AUTH_MISSING: 'SERVICE_AUTH_MISSING',
} as const);

export type ReportingErrorCode = typeof REPORTING_ERROR_CODES[keyof typeof REPORTING_ERROR_CODES];
