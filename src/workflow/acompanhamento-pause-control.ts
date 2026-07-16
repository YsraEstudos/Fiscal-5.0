import * as EstadoManager from '../core/estado-manager.ts';
import type { EstadoApp } from '../core/estado-manager.ts';
import { log } from '../core/log-manager.ts';
import { normalizarTempoDesativacaoChecks } from '../core/estado/normalizers.ts';

export const ACOMPANHAMENTO_REATIVACAO_MS = 10 * 60 * 1000;

type CheckKey = 'reincidencia' | 'acompanhamento';
type CheckFlag = 'pausarEmReincidencia' | 'pausarAcompanhamento';
type CheckDeadline = 'pausarEmReincidenciaReativarEm' | 'pausarAcompanhamentoReativarEm';

type CheckConfig = {
    flag: CheckFlag;
    deadline: CheckDeadline;
    checkboxId: string;
    label: string;
};

type EstadoPausaChecks = Pick<
    EstadoApp,
    | 'pausarEmReincidencia'
    | 'pausarEmReincidenciaReativarEm'
    | 'pausarAcompanhamento'
    | 'pausarAcompanhamentoReativarEm'
    | 'tempoDesativacaoChecksMinutos'
>;

const CHECK_KEYS: readonly CheckKey[] = ['reincidencia', 'acompanhamento'];

const CHECK_CONFIGS: Record<CheckKey, CheckConfig> = {
    reincidencia: {
        flag: 'pausarEmReincidencia',
        deadline: 'pausarEmReincidenciaReativarEm',
        checkboxId: 'chkPausarReincidencia',
        label: 'contra reincidência',
    },
    acompanhamento: {
        flag: 'pausarAcompanhamento',
        deadline: 'pausarAcompanhamentoReativarEm',
        checkboxId: 'chkPausarAcompanhamento',
        label: 'contra alertas no acompanhamento',
    },
};

const reativacaoTimers: Record<CheckKey, ReturnType<typeof setTimeout> | null> = {
    reincidencia: null,
    acompanhamento: null,
};

function limparTimer(check: CheckKey): void {
    const timer = reativacaoTimers[check];
    if (timer != null) {
        clearTimeout(timer);
        reativacaoTimers[check] = null;
    }
}

function obterConfig(check: CheckKey): CheckConfig {
    return CHECK_CONFIGS[check];
}

function obterPrazo(estado: EstadoPausaChecks, check: CheckKey): number | null {
    const prazo = Number(estado[obterConfig(check).deadline]);
    return Number.isFinite(prazo) && prazo > 0 ? Math.floor(prazo) : null;
}

function obterDuracaoMs(estado: EstadoPausaChecks): number {
    return normalizarTempoDesativacaoChecks(estado.tempoDesativacaoChecksMinutos) * 60 * 1000;
}

function atualizarCheckbox(check: CheckKey, ativo: boolean): void {
    if (typeof document === 'undefined') return;
    const checkbox = document.getElementById(obterConfig(check).checkboxId) as HTMLInputElement | null;
    if (checkbox) checkbox.checked = ativo;
}

function agendarReativacao(check: CheckKey, prazo: number): void {
    limparTimer(check);
    reativacaoTimers[check] = setTimeout(
        () => reativarAutomaticamente(check),
        Math.max(0, prazo - Date.now()),
    );
}

function reativarAutomaticamente(check: CheckKey): void {
    reativacaoTimers[check] = null;
    const config = obterConfig(check);
    const estado = EstadoManager.get() as EstadoPausaChecks;
    if (estado[config.flag] !== false) return;

    const prazo = obterPrazo(estado, check);
    if (prazo != null && prazo > Date.now()) {
        agendarReativacao(check, prazo);
        return;
    }

    EstadoManager.update((e: EstadoApp) => {
        e[config.flag] = true;
        e[config.deadline] = null;
    });
    atualizarCheckbox(check, true);
    const minutos = normalizarTempoDesativacaoChecks(estado.tempoDesativacaoChecksMinutos);
    log(
        '⏱️ Segurança ' + config.label + ' reativada automaticamente após ' + minutos + ' minuto' + (minutos === 1 ? '' : 's') + '.',
        'info',
    );
}

function inicializarCheck(check: CheckKey): void {
    limparTimer(check);
    const config = obterConfig(check);
    const estado = EstadoManager.get() as EstadoPausaChecks;
    if (estado[config.flag] !== false) return;

    const prazo = obterPrazo(estado, check);
    if (prazo == null) {
        const novoPrazo = Date.now() + obterDuracaoMs(estado);
        EstadoManager.update((e: EstadoApp) => {
            e[config.deadline] = novoPrazo;
        });
        agendarReativacao(check, novoPrazo);
        return;
    }

    if (prazo <= Date.now()) {
        reativarAutomaticamente(check);
        return;
    }

    agendarReativacao(check, prazo);
}

export function inicializar(): void {
    CHECK_KEYS.forEach(inicializarCheck);
}

export function configurarCheck(check: CheckKey, ativo: boolean): void {
    limparTimer(check);
    const config = obterConfig(check);
    const estado = EstadoManager.get() as EstadoPausaChecks;
    const minutos = normalizarTempoDesativacaoChecks(estado.tempoDesativacaoChecksMinutos);
    const reativarEm = ativo ? null : Date.now() + minutos * 60 * 1000;

    EstadoManager.update((e: EstadoApp) => {
        e[config.flag] = ativo;
        e[config.deadline] = reativarEm;
    });

    atualizarCheckbox(check, ativo);
    if (ativo) {
        log('🛡️ Segurança ' + config.label + ' ATIVADA.', 'info');
        return;
    }

    agendarReativacao(check, reativarEm as number);
    log(
        '🔓 Segurança ' + config.label + ' DESATIVADA por ' + minutos + ' minuto' + (minutos === 1 ? '' : 's') + '.',
        'info',
    );
}

export function configurarReincidencia(ativo: boolean): void {
    configurarCheck('reincidencia', ativo);
}

export function configurar(ativo: boolean): void {
    configurarCheck('acompanhamento', ativo);
}

export function limpar(): void {
    CHECK_KEYS.forEach(limparTimer);
}
