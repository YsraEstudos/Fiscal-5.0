import * as EstadoManager from '../core/estado-manager.ts';
import type { EstadoApp } from '../core/estado-manager.ts';
import { log } from '../core/log-manager.ts';

export const ACOMPANHAMENTO_REATIVACAO_MS = 10 * 60 * 1000;

type EstadoPausaAcompanhamento = Pick<
    EstadoApp,
    'pausarAcompanhamento' | 'pausarAcompanhamentoReativarEm'
>;

let reativacaoTimer: ReturnType<typeof setTimeout> | null = null;

function limparTimer(): void {
    if (reativacaoTimer != null) {
        clearTimeout(reativacaoTimer);
        reativacaoTimer = null;
    }
}

function atualizarCheckbox(ativo: boolean): void {
    if (typeof document === 'undefined') return;
    const checkbox = document.getElementById('chkPausarAcompanhamento') as HTMLInputElement | null;
    if (checkbox) checkbox.checked = ativo;
}

function obterPrazo(estado: EstadoPausaAcompanhamento): number | null {
    const prazo = Number(estado.pausarAcompanhamentoReativarEm);
    return Number.isFinite(prazo) && prazo > 0 ? prazo : null;
}

function reativarAutomaticamente(): void {
    reativacaoTimer = null;
    const estado = EstadoManager.get() as EstadoPausaAcompanhamento;
    if (estado.pausarAcompanhamento !== false) return;

    const prazo = obterPrazo(estado);
    if (prazo != null && prazo > Date.now()) {
        agendarReativacao(prazo);
        return;
    }

    EstadoManager.update((e: EstadoApp) => {
        e.pausarAcompanhamento = true;
        e.pausarAcompanhamentoReativarEm = null;
    });
    atualizarCheckbox(true);
    log('⏱️ Pausa por alerta do acompanhamento reativada automaticamente após 10 minutos.', 'info');
}

function agendarReativacao(prazo: number): void {
    limparTimer();
    reativacaoTimer = setTimeout(reativarAutomaticamente, Math.max(0, prazo - Date.now()));
}

export function inicializar(): void {
    limparTimer();
    const estado = EstadoManager.get() as EstadoPausaAcompanhamento;
    if (estado.pausarAcompanhamento !== false) return;

    const prazo = obterPrazo(estado);
    if (prazo == null) {
        const novoPrazo = Date.now() + ACOMPANHAMENTO_REATIVACAO_MS;
        EstadoManager.update((e: EstadoApp) => {
            e.pausarAcompanhamentoReativarEm = novoPrazo;
        });
        agendarReativacao(novoPrazo);
        return;
    }

    if (prazo <= Date.now()) {
        reativarAutomaticamente();
        return;
    }

    agendarReativacao(prazo);
}

export function configurar(ativo: boolean): void {
    limparTimer();
    const agora = Date.now();
    const reativarEm = ativo ? null : agora + ACOMPANHAMENTO_REATIVACAO_MS;

    EstadoManager.update((e: EstadoApp) => {
        e.pausarAcompanhamento = ativo;
        e.pausarAcompanhamentoReativarEm = reativarEm;
    });

    atualizarCheckbox(ativo);
    if (ativo) {
        log('⛔ Pausa por alerta do acompanhamento ATIVADA', 'info');
        return;
    }

    agendarReativacao(reativarEm as number);
    log('✅ Pausa por alerta do acompanhamento DESATIVADA por 10 minutos.', 'info');
}

export function limpar(): void {
    limparTimer();
}