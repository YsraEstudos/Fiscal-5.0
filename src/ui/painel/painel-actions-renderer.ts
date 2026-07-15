import { escapeHtml } from '../../utils/misc.ts';
import { getAcoesOrdenadas } from '../../workflow/executor.ts';
import { ehAcaoUnspsc } from '../../config/workflow-actions.ts';
import type { EstadoApp } from '../../core/estado-manager.ts';
import { empresaExigeUnspsc } from '../../validation/empresa-json-requirements.ts';

function getAcaoState(estado: EstadoApp, acao: any): any {
    const acaoState = estado.acoes && estado.acoes[acao.id]
        ? estado.acoes[acao.id]
        : { ativo: true, seletor: acao.seletor, valor: acao.valorPadrao };
    const desabilitadaPorEmpresa = ehAcaoUnspsc(acao.id) && empresaExigeUnspsc() === false;

    return desabilitadaPorEmpresa
        ? { ...acaoState, ativo: false, desabilitadaPorEmpresa: true }
        : acaoState;
}

function renderValorInput(acao: any, acaoState: any): string {
    if (acao.tipo !== 'input') return '';
    return `<input type="text" id="val_${acao.id}" class="km-acao-input" value="${escapeHtml(acaoState.valor || '')}">`;
}

function renderBotoesAcao(acao: any): string {
    if (acao.tipo === 'custom') {
        return `
            <div class="km-acao-buttons">
                <button class="km-action-button" disabled type="button" title="Ação interna sem seletor DOM">—</button>
                <button class="km-action-button" disabled type="button" title="Ação interna sem mapeamento">—</button>
            </div>
        `;
    }

    return `
        <div class="km-acao-buttons">
            <button class="btn-testar km-action-button" data-acao="${acao.id}" type="button" title="Testar ação agora">▶</button>
            <button class="btn-inspecao km-action-button" data-acao="${acao.id}" type="button" title="Mapear elemento">🎯</button>
        </div>
    `;
}

function renderAcaoItemHtml(acao: any, acaoState: any): string {
    const desabilitadaPorEmpresa = acaoState.desabilitadaPorEmpresa === true;
    const motivo = 'UNSPSC não é necessário para esta empresa';

    return `
        <span class="acao-handle" title="Arrastar para reordenar">☰</span>
        <input type="checkbox" id="chk_${acao.id}" ${acaoState.ativo ? 'checked' : ''} ${desabilitadaPorEmpresa ? 'disabled' : ''} title="${desabilitadaPorEmpresa ? motivo : 'Ativar ou desativar ação'}">
        <span class="km-acao-nome" title="${escapeHtml(acaoState.seletor || acao.seletor)}">${escapeHtml(acao.nome)}${desabilitadaPorEmpresa ? ' (não se aplica)' : ''}</span>
        ${renderValorInput(acao, acaoState)}
        ${renderBotoesAcao(acao)}
    `;
}

export function construirListaAcoes(estado: EstadoApp): void {
    const container = document.getElementById('lista-acoes');
    if (!container) return;

    const acoesOrdenadas = getAcoesOrdenadas(estado);
    const fragment = document.createDocumentFragment();

    acoesOrdenadas.forEach((acao) => {
        const acaoState = getAcaoState(estado, acao);
        const divItem = document.createElement('div');
        divItem.className = 'acao-item';
        divItem.classList.toggle('acao-item--desabilitado', acaoState.desabilitadaPorEmpresa === true);
        divItem.dataset.acao = acao.id;
        divItem.draggable = true;
        divItem.innerHTML = renderAcaoItemHtml(acao, acaoState);
        fragment.appendChild(divItem);
    });

    container.appendChild(fragment);
}
