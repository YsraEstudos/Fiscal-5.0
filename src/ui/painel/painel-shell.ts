import { escapeHtml } from '../../utils/misc.ts';
import type { EstadoApp } from '../../core/estado-manager.ts';
import {
    renderControleSection,
    renderJsonSection,
    renderFiscalHintsSection,
    renderLogsSection,
    renderOpcoesSection,
    renderPerfilSection,
    renderProgressoSection,
    renderResumoExecucao,
    renderTrilhaSection,
    renderWorkflowSection,
} from './painel-sections.ts';
import { ehPaginaSso, renderSsoEmpresasSection } from '../../sso/empresa-abas.ts';

function renderSecaoColapsavel(estado: EstadoApp, chave: string, titulo: string, conteudoHtml: string): string {
    const secoes = (estado.painelSecoes as unknown as Record<string, boolean>) || {};
    const expandida = secoes[chave] !== undefined ? !!secoes[chave] : true;
    const icon = expandida ? '▾' : '▸';
    return `
        <section class="km-collapsible ${expandida ? '' : 'is-collapsed'}" data-section="${escapeHtml(chave)}">
            <button class="km-section-toggle" type="button" data-section-toggle="${escapeHtml(chave)}" aria-expanded="${expandida ? 'true' : 'false'}">
                <span class="km-section-toggle-label">${escapeHtml(titulo)}</span>
                <span class="km-section-toggle-icon">${icon}</span>
            </button>
            <div class="km-section-body">
                ${conteudoHtml}
            </div>
        </section>
    `;
}

export function renderPainelShell(estado: EstadoApp, painelMinimizado: boolean): string {
    return `
        <div class="km-drawer-shell">
            <div id="painelHeader" class="km-drawer-header">
                <button id="drawerToggle" type="button" title="${painelMinimizado ? 'Expandir' : 'Recolher'}">${painelMinimizado ? '»' : '«'}</button>
                <div class="km-brand">
                    <span class="km-brand-mark">KM</span>
                    <div class="km-brand-copy">
                        <span class="km-brand-title">FISCAL 5.0</span>
                        <span class="km-brand-subtitle">Drawer operacional</span>
                    </div>
                </div>
                <span class="km-drawer-status-compact">${estado.ativo ? (estado.pausado ? 'pause' : 'run') : 'off'}</span>
            </div>

            <div id="painelConteudo">
                ${renderSecaoColapsavel(estado, 'resumo', 'Resumo da Execução', renderResumoExecucao(estado))}
                ${renderSecaoColapsavel(estado, 'trilha', 'Trilha do Item', renderTrilhaSection(estado))}
                ${renderSecaoColapsavel(estado, 'perfil', 'Perfil', renderPerfilSection())}
                ${renderSecaoColapsavel(estado, 'workflow', 'Ações do Workflow', renderWorkflowSection())}
                ${renderSecaoColapsavel(estado, 'opcoes', 'Opções', renderOpcoesSection(estado))}
                ${renderSecaoColapsavel(estado, 'fiscalHints', 'Dicas fiscais', renderFiscalHintsSection(estado))}
                ${renderSecaoColapsavel(estado, 'json', 'JSON por Item', renderJsonSection(estado))}
                ${ehPaginaSso() ? renderSsoEmpresasSection() : ''}
                ${renderSecaoColapsavel(estado, 'progresso', 'Progresso', renderProgressoSection())}
                ${renderSecaoColapsavel(estado, 'controle', 'Controle', renderControleSection(estado))}
                ${renderSecaoColapsavel(estado, 'logs', 'Logs', renderLogsSection())}
            </div>
        </div>
    `;
}
