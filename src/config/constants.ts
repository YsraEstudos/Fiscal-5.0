/**
 * Constantes globais de configuração do FISCAL 5.0.
 * Extraído do monólito (linhas 39–142).
 */

interface ValidadorConfig {
    readonly regex: RegExp;
    readonly mensagem: string;
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
}

export const CONFIG: AppConfig = Object.freeze({
    SCHEMA_VERSION: 13,
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

});
