import { CONFIG } from '../config/constants.ts';
import * as EstadoManager from '../core/estado-manager.ts';
import type { EstadoApp } from '../core/estado-manager.ts';
import { log } from '../core/log-manager.ts';
import * as ItemTrace from './item-trace.ts';

export interface AvisoCriticoPause {
    tipo: string;
    fonte?: string;
    numeroExecucoes?: number;
    mensagem?: string;
}

export function isValidacaoNcmLiberada(estado: EstadoApp): boolean {
    const key = estado?.itemAtualKey;
    if (!key) return false;
    const flags = (estado.itemFlags as Record<string, Record<string, unknown>>)?.[key];
    const pendenteAte = Number(flags?.['ncmValidacaoPendenteAte'] || 0);
    return pendenteAte > Date.now();
}

export function habilitarValidacaoNcmAposInsercao(estado: EstadoApp): void {
    const key = estado?.itemAtualKey;
    if (!key) return;
    const pendenteAte = Date.now() + (CONFIG.DELAYS as Record<string, number>).NCM_VALIDACAO_JANELA;
    EstadoManager.update((e: EstadoApp) => {
        const eAny = e as unknown as Record<string, unknown>;
        eAny['itemFlags'] = eAny['itemFlags'] || {};
        const flags = eAny['itemFlags'] as Record<string, Record<string, unknown>>;
        const atual = flags[key] || {};
        flags[key] = { ...atual, ncmValidacaoPendenteAte: pendenteAte };
    });
}

export function registrarAvisoValidacaoNcmAguardando(estado: EstadoApp): void {
    const key = estado?.itemAtualKey;
    if (!key) return;

    const itemFlagsAny = (estado as unknown as Record<string, unknown>)['itemFlags'] as Record<string, Record<string, unknown>> | undefined;
    const flags = itemFlagsAny?.[key] || {};
    if (flags['ncmValidacaoAvisada']) return;

    EstadoManager.update((e: EstadoApp) => {
        const eAny = e as unknown as Record<string, unknown>;
        eAny['itemFlags'] = eAny['itemFlags'] || {};
        const flags2 = eAny['itemFlags'] as Record<string, Record<string, unknown>>;
        const atual = flags2[key] || {};
        flags2[key] = { ...atual, ncmValidacaoAvisada: true };
    });

    log('ℹ️ NCM já preenchido no campo; validação de inválido só ocorre após nova inserção.', 'info');
}

export function registrarPausaCriticaNaTrilha(aviso: AvisoCriticoPause | null | undefined): void {
    if (!aviso?.tipo) return;

    let tipoEvento: string | null = null;
    let resumo = '';
    let payload: Record<string, unknown> = {};

    if (aviso.tipo === 'reincidencia_etapa') {
        tipoEvento = 'pausado_por_reincidencia';
        resumo = 'Pausado por reincidência da etapa';
        payload = {
            fonte: aviso.fonte || 'lblExecucoes',
            numeroExecucoes: aviso.numeroExecucoes ?? null,
            mensagem: aviso.mensagem || '',
        };
    } else if (aviso.tipo === 'ncm_invalido') {
        tipoEvento = 'pausado_por_validacao_ncm';
        resumo = 'Pausado por NCM inválido';
        payload = { mensagem: aviso.mensagem || '' };
    } else if (aviso.tipo === 'nbs_invalido') {
        tipoEvento = 'pausado_por_validacao_nbs';
        resumo = 'Pausado por NBS inválido';
        payload = { mensagem: aviso.mensagem || '' };
    }

    if (!tipoEvento) return;

    EstadoManager.update((e: EstadoApp) => {
        const eAny = e as unknown as Record<string, unknown>;
        ItemTrace.registrarEventoItemAtual(
            e as Parameters<typeof ItemTrace.registrarEventoItemAtual>[0],
            tipoEvento!,
            {
                itemTelaId: (eAny['itemAtualTelaId'] as string | null) || (eAny['itemAtualKey'] as string | null) || null,
                resumo,
                payload,
                status: 'pausado',
                now: Date.now(),
            }
        );
    });
}
