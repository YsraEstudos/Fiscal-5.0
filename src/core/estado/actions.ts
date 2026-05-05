import { ACOES_WORKFLOW } from '../../config/workflow-actions.ts';
import type { AcaoEstado, EstadoApp } from './types.ts';

function corrigirSeletorLegado(acaoId: string, seletor: string): string {
    const acao = ACOES_WORKFLOW.find((item) => item.id === acaoId);
    if (!acao) return seletor;

    if (acaoId === 'unspsc' && (seletor === 'input[name*="txtCodigoUnspsc"]' || seletor === '#txtCodigoUnspsc')) return acao.seletor;
    if (acaoId === 'resultado' && seletor === 'a#txtDescricao') return acao.seletor;
    if (acaoId === 'abaClassificacao' && seletor === 'a[href*="ctl02$lbutMenu"]') return acao.seletor;
    if (acaoId === 'abaFiscal' && seletor === 'a[href*="ctl04lbutMenu"]') return acao.seletor;
    if (acaoId === 'ncm' && seletor === '#txtNCMTIPI') return acao.seletor;
    if (acaoId === 'prosseguir' && seletor === '#butAcao1') return acao.seletor;

    return seletor;
}

export function inicializarAcoes(estado: EstadoApp): EstadoApp {
    ACOES_WORKFLOW.forEach((acao) => {
        const savedAcao: Partial<AcaoEstado> = estado.acoes[acao.id] || {};
        const seletor = corrigirSeletorLegado(acao.id, savedAcao.seletor ?? acao.seletor);

        estado.acoes[acao.id] = {
            ativo: savedAcao.ativo ?? true,
            seletor,
            valor: savedAcao.valor ?? (acao.valorPadrao || null),
            ordem: savedAcao.ordem ?? acao.ordem,
        };
    });
    return estado;
}

