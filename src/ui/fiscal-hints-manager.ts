import * as FiscalHints from './fiscal-hints.ts';
import { escapeHtml } from '../utils/misc.ts';

export type FiscalHintsManagerStatusType = 'info' | 'error';

export interface FiscalHintsManagerCallbacks {
    getDicas: () => Record<string, FiscalHints.FiscalHint>;
    persist: (dicas: Record<string, FiscalHints.FiscalHint>, json: string) => void;
    setStatus: (mensagem: string, tipo?: FiscalHintsManagerStatusType) => void;
    log?: (mensagem: string) => void;
}

export const FISCAL_HINTS_MANAGER_ID = 'km-fiscal-hints-manager';

let modalAtual: HTMLElement | null = null;
let callbacksAtivos: FiscalHintsManagerCallbacks | null = null;

function obterModal(): HTMLElement {
    if (modalAtual?.isConnected) return modalAtual;

    const modal = document.createElement('div');
    modal.id = FISCAL_HINTS_MANAGER_ID;
    modal.className = 'km-fiscal-hints-manager';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'kmFiscalHintsManagerTitle');
    modal.innerHTML = `
        <div class="km-fiscal-hints-manager-backdrop" data-km-fiscal-hints-close></div>
        <section class="km-fiscal-hints-manager-dialog">
            <header class="km-fiscal-hints-manager-header">
                <div>
                    <span class="km-kicker">Curadoria fiscal</span>
                    <h2 id="kmFiscalHintsManagerTitle" class="km-fiscal-hints-manager-title">Gerenciar dicas fiscais</h2>
                    <p class="km-fiscal-hints-manager-subtitle">Organize as dicas globais e defina em qual empresa cada uma deve aparecer.</p>
                </div>
                <button class="km-fiscal-hints-manager-close" type="button" data-km-fiscal-hints-close aria-label="Fechar gerenciador">×</button>
            </header>
            <div class="km-fiscal-hints-manager-layout">
                <section class="km-fiscal-hints-manager-list-panel" aria-labelledby="kmFiscalHintsListTitle">
                    <div class="km-fiscal-hints-manager-list-head">
                        <div>
                            <span class="km-section-label" id="kmFiscalHintsListTitle">Dicas cadastradas</span>
                            <span class="km-fiscal-hints-manager-count" data-km-fiscal-manager-count></span>
                        </div>
                        <button type="button" class="km-action-button" data-km-fiscal-manager-new>Nova dica</button>
                    </div>
                    <div class="km-field km-fiscal-hints-manager-search-field">
                        <label for="kmFiscalHintsManagerSearch">Filtrar dicas</label>
                        <input id="kmFiscalHintsManagerSearch" type="search" data-km-fiscal-manager-search placeholder="Termo, código ou empresa">
                    </div>
                    <div class="km-fiscal-hints-manager-list" data-km-fiscal-manager-list></div>
                </section>
                <form id="kmFiscalHintsManagerForm" class="km-fiscal-hints-manager-form">
                    <input id="kmFiscalHintsManagerId" type="hidden">
                    <div class="km-fiscal-hints-manager-form-head">
                        <span class="km-kicker">Edição</span>
                        <h3 class="km-fiscal-hints-manager-form-title" data-km-fiscal-manager-form-title>Nova dica</h3>
                    </div>
                    <div class="km-field">
                        <label for="kmFiscalHintsManagerTermo">Termo ou frase</label>
                        <input id="kmFiscalHintsManagerTermo" type="text" required placeholder="APLICACAO: CAMINHAO">
                    </div>
                    <div class="km-field-grid">
                        <div class="km-field">
                            <label for="kmFiscalHintsManagerNcm">NCM</label>
                            <input id="kmFiscalHintsManagerNcm" type="text" placeholder="8708.93.00">
                        </div>
                        <div class="km-field">
                            <label for="kmFiscalHintsManagerUnspsc">UNSPSC / NSPSC</label>
                            <input id="kmFiscalHintsManagerUnspsc" type="text" placeholder="25101929">
                        </div>
                    </div>
                    <div class="km-field">
                        <label for="kmFiscalHintsManagerEmpresa">Empresa</label>
                        <input id="kmFiscalHintsManagerEmpresa" type="text" placeholder="Ex.: RODONAVES">
                        <span class="km-field-help">Deixe vazio para a dica valer em todas as empresas.</span>
                    </div>
                    <div class="km-fiscal-hints-manager-form-actions">
                        <button type="button" class="km-secondary-button" data-km-fiscal-manager-new>Limpar</button>
                        <button type="submit" class="km-primary-button km-fiscal-hints-manager-submit" data-km-fiscal-manager-submit>Adicionar dica</button>
                    </div>
                    <div class="km-helper-text" data-km-fiscal-manager-status aria-live="polite"></div>
                </form>
            </div>
        </section>
    `;

    modal.addEventListener('click', (event) => {
        const target = event.target as HTMLElement;
        if (target.closest('[data-km-fiscal-hints-close]')) {
            fecharGerenciadorDicasFiscais();
            return;
        }

        const novo = target.closest('[data-km-fiscal-manager-new]');
        if (novo) {
            limparFormulario(modal);
            return;
        }

        const editar = target.closest('[data-km-fiscal-manager-edit]') as HTMLElement | null;
        if (editar) {
            carregarDicaNoFormulario(modal, editar.dataset.kmFiscalManagerEdit || '');
            return;
        }

        const remover = target.closest('[data-km-fiscal-manager-remove]') as HTMLElement | null;
        if (remover) {
            removerDica(modal, remover.dataset.kmFiscalManagerRemove || '');
        }
    });

    modal.addEventListener('input', (event) => {
        const target = event.target as HTMLInputElement;
        if (target.matches('[data-km-fiscal-manager-search]')) renderLista(modal);
    });

    modal.addEventListener('submit', (event) => {
        if (!(event.target as HTMLElement).matches('#kmFiscalHintsManagerForm')) return;
        event.preventDefault();
        salvarDica(modal);
    });

    modal.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') fecharGerenciadorDicasFiscais();
    });

    document.body.appendChild(modal);
    modalAtual = modal;
    return modal;
}

function setStatus(modal: HTMLElement, mensagem: string, tipo: FiscalHintsManagerStatusType = 'info'): void {
    const status = modal.querySelector('[data-km-fiscal-manager-status]') as HTMLElement | null;
    if (!status) return;
    status.textContent = mensagem;
    status.classList.toggle('is-error', tipo === 'error');
}

function limparFormulario(modal: HTMLElement): void {
    const form = modal.querySelector('#kmFiscalHintsManagerForm') as HTMLFormElement | null;
    if (!form) return;
    form.reset();
    (modal.querySelector('#kmFiscalHintsManagerId') as HTMLInputElement).value = '';
    const title = modal.querySelector('[data-km-fiscal-manager-form-title]');
    if (title) title.textContent = 'Nova dica';
    const submit = modal.querySelector('[data-km-fiscal-manager-submit]') as HTMLButtonElement | null;
    if (submit) submit.textContent = 'Adicionar dica';
    setStatus(modal, '');
}

function carregarDicaNoFormulario(modal: HTMLElement, id: string): void {
    const dica = callbacksAtivos?.getDicas()?.[id];
    if (!dica) return;

    (modal.querySelector('#kmFiscalHintsManagerId') as HTMLInputElement).value = id;
    (modal.querySelector('#kmFiscalHintsManagerTermo') as HTMLInputElement).value = dica.termo || '';
    (modal.querySelector('#kmFiscalHintsManagerNcm') as HTMLInputElement).value = dica.ncm || '';
    (modal.querySelector('#kmFiscalHintsManagerUnspsc') as HTMLInputElement).value = dica.unspsc || '';
    (modal.querySelector('#kmFiscalHintsManagerEmpresa') as HTMLInputElement).value = dica.empresa || '';
    const title = modal.querySelector('[data-km-fiscal-manager-form-title]');
    if (title) title.textContent = 'Editar dica';
    const submit = modal.querySelector('[data-km-fiscal-manager-submit]') as HTMLButtonElement | null;
    if (submit) submit.textContent = 'Salvar alterações';
    setStatus(modal, `Editando “${dica.termo}”.`);
    (modal.querySelector('#kmFiscalHintsManagerTermo') as HTMLInputElement).focus();
}

function obterRegistros(dicas: Record<string, FiscalHints.FiscalHint>): Array<Record<string, string>> {
    return Object.entries(dicas || {}).map(([id, dica]) => ({
        id,
        termo: dica.termo,
        ...(dica.ncm ? { ncm: dica.ncm } : {}),
        ...(dica.unspsc ? { unspsc: dica.unspsc } : {}),
        ...(dica.empresa ? { empresa: dica.empresa } : {}),
    }));
}

function renderLista(modal: HTMLElement): void {
    const list = modal.querySelector('[data-km-fiscal-manager-list]') as HTMLElement | null;
    if (!list || !callbacksAtivos) return;

    const dicas = Object.entries(callbacksAtivos.getDicas() || {});
    const query = ((modal.querySelector('[data-km-fiscal-manager-search]') as HTMLInputElement | null)?.value || '')
        .trim()
        .toLocaleLowerCase();
    const filtradas = dicas.filter(([, dica]) => !query || [dica.termo, dica.ncm, dica.unspsc, dica.empresa]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
        .includes(query));

    const count = modal.querySelector('[data-km-fiscal-manager-count]');
    if (count) count.textContent = `${dicas.length} ${dicas.length === 1 ? 'dica' : 'dicas'}`;

    if (!filtradas.length) {
        list.innerHTML = `<div class="km-fiscal-hints-manager-empty">${query ? 'Nenhuma dica encontrada.' : 'Nenhuma dica cadastrada.'}</div>`;
        return;
    }

    list.innerHTML = filtradas.map(([id, dica]) => {
        const codigos = [dica.ncm ? `NCM ${dica.ncm}` : '', dica.unspsc ? `UNSPSC ${dica.unspsc}` : '']
            .filter(Boolean)
            .join(' · ') || 'Sem código informado';
        const empresa = dica.empresa ? `Somente ${dica.empresa}` : 'Todas as empresas';
        return `
            <article class="km-fiscal-hints-manager-item">
                <div class="km-fiscal-hints-manager-item-copy">
                    <strong>${escapeHtml(dica.termo || '')}</strong>
                    <span>${escapeHtml(codigos)}</span>
                    <em>${escapeHtml(empresa)}</em>
                </div>
                <div class="km-fiscal-hints-manager-item-actions">
                    <button type="button" class="km-inline-button" data-km-fiscal-manager-edit="${escapeHtml(id)}">Editar</button>
                    <button type="button" class="km-inline-button km-inline-button--danger" data-km-fiscal-manager-remove="${escapeHtml(id)}">Remover</button>
                </div>
            </article>
        `;
    }).join('');
}

function salvarDica(modal: HTMLElement): void {
    if (!callbacksAtivos) return;

    const id = (modal.querySelector('#kmFiscalHintsManagerId') as HTMLInputElement).value.trim();
    const termo = (modal.querySelector('#kmFiscalHintsManagerTermo') as HTMLInputElement).value.trim();
    const ncm = (modal.querySelector('#kmFiscalHintsManagerNcm') as HTMLInputElement).value.trim();
    const unspsc = (modal.querySelector('#kmFiscalHintsManagerUnspsc') as HTMLInputElement).value.trim();
    const empresa = (modal.querySelector('#kmFiscalHintsManagerEmpresa') as HTMLInputElement).value.trim();
    const registros = obterRegistros(callbacksAtivos.getDicas() || {});
    const registro: Record<string, string> = {
        ...(id ? { id } : {}),
        termo,
        ...(ncm ? { ncm } : {}),
        ...(unspsc ? { unspsc } : {}),
        ...(empresa ? { empresa } : {}),
    };
    const indice = id ? registros.findIndex((item) => item.id === id) : -1;
    if (indice >= 0) registros[indice] = registro;
    else registros.push(registro);

    const resultado = FiscalHints.importarDicasFiscaisJson(JSON.stringify(registros));
    if (!resultado.ok) {
        setStatus(modal, resultado.erros.join(' | '), 'error');
        callbacksAtivos.setStatus(resultado.erros.join(' | '), 'error');
        return;
    }

    callbacksAtivos.persist(resultado.dicas, FiscalHints.exportarDicasFiscaisJson(resultado.dicas));
    renderLista(modal);
    limparFormulario(modal);
    const mensagem = id ? 'Dica atualizada.' : 'Dica adicionada.';
    setStatus(modal, mensagem);
    callbacksAtivos.setStatus(mensagem);
    callbacksAtivos.log?.(`🔎 ${mensagem}`);
}

function removerDica(modal: HTMLElement, id: string): void {
    if (!callbacksAtivos) return;
    const dica = callbacksAtivos.getDicas()?.[id];
    if (!dica) return;
    const confirmou = typeof window === 'undefined' || typeof window.confirm !== 'function'
        ? true
        : window.confirm(`Remover a dica “${dica.termo}”?`);
    if (!confirmou) return;

    const dicas = { ...(callbacksAtivos.getDicas() || {}) };
    delete dicas[id];
    callbacksAtivos.persist(dicas, FiscalHints.exportarDicasFiscaisJson(dicas));
    renderLista(modal);
    limparFormulario(modal);
    setStatus(modal, 'Dica removida.');
    callbacksAtivos.setStatus('Dica removida.');
    callbacksAtivos.log?.('🔎 Dica fiscal removida');
}

export function abrirGerenciadorDicasFiscais(callbacks: FiscalHintsManagerCallbacks, editarId?: string): void {
    callbacksAtivos = callbacks;
    const modal = obterModal();
    modal.hidden = false;
    renderLista(modal);
    limparFormulario(modal);
    if (editarId) carregarDicaNoFormulario(modal, editarId);
    const foco = editarId
        ? modal.querySelector('#kmFiscalHintsManagerTermo')
        : modal.querySelector('#kmFiscalHintsManagerSearch');
    (foco as HTMLInputElement | null)?.focus();
}

export function fecharGerenciadorDicasFiscais(): void {
    if (modalAtual) modalAtual.hidden = true;
}