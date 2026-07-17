/**
 * Event listeners do painel de controle.
 * Extraído do monólito — criarPainel() event wiring (linhas 4912–5176).
 */

import { CONFIG } from '../config/constants.ts';
import { ACOES_WORKFLOW } from '../config/workflow-actions.ts';
import * as EstadoManager from '../core/estado-manager.ts';
import { log } from '../core/log-manager.ts';
import * as LogManager from '../core/log-manager.ts';
import * as AudioManager from '../interaction/audio-manager.ts';
import * as Interacao from '../interaction/interacao.ts';
import * as ItemMapManager from '../data/item-map-manager.ts';
import * as Validador from '../validation/validador.ts';
import { debounce, clone } from '../utils/misc.ts';
import { normalizarTempoDesativacaoChecks } from '../core/estado/normalizers.ts';
import * as PerfilManager from './perfil-manager.js';
import * as InspecaoManager from './inspecao-manager.ts';
import { obterEmpresaAtual } from '../validation/empresa-json-requirements.ts';
import * as FiscalHints from './fiscal-hints.ts';
import { abrirGerenciadorDicasFiscais } from './fiscal-hints-manager.ts';
import { construirListaAcoes } from './painel-builder.ts';
import * as WorkflowExecutor from '../workflow/executor.ts';
import * as AcompanhamentoPauseControl from '../workflow/acompanhamento-pause-control.ts';
import * as SsoEmpresaAbas from '../sso/empresa-abas.ts';
import type { EstadoApp } from '../core/estado-manager.ts';

const LOG_AREA_DEFAULT_HEIGHT = 110;
const LOG_AREA_MIN_HEIGHT = 80;
const LOG_AREA_MAX_HEIGHT = 520;

// ---------------------------------------------------------------------------
// Drag & drop de reordenação de ações
// ---------------------------------------------------------------------------
export function setupDragAndDrop(container: HTMLElement): void {
    let draggedElement: HTMLElement | null = null;
    let dragOverElement: HTMLElement | null = null;

    const limparDragOver = (): void => {
        if (!dragOverElement) return;
        dragOverElement.classList.remove('drag-over');
        dragOverElement = null;
    };

    container.addEventListener('dragstart', (e: DragEvent) => {
        const item = (e.target as HTMLElement).closest('.acao-item') as HTMLElement;
        if (!item || !e.dataTransfer) return;
        draggedElement = item;
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    container.addEventListener('dragend', (e: Event) => {
        const item = (e.target as HTMLElement).closest('.acao-item') as HTMLElement;
        if (!item) return;
        item.classList.remove('dragging');
        draggedElement = null;
        limparDragOver();
    });

    container.addEventListener('dragover', (e: DragEvent) => {
        e.preventDefault();
        const item = (e.target as HTMLElement).closest('.acao-item') as HTMLElement;
        if (!item || item === draggedElement || !e.dataTransfer) return;
        if (item === dragOverElement) {
            e.dataTransfer.dropEffect = 'move';
            return;
        }
        limparDragOver();
        item.classList.add('drag-over');
        dragOverElement = item;
        e.dataTransfer.dropEffect = 'move';
    });

    container.addEventListener('dragleave', (e: Event) => {
        const item = (e.target as HTMLElement).closest('.acao-item');
        if (item === dragOverElement) limparDragOver();
    });

    container.addEventListener('drop', (e: DragEvent) => {
        e.preventDefault();
        const targetItem = (e.target as HTMLElement).closest('.acao-item') as HTMLElement;
        if (!targetItem || !draggedElement || targetItem === draggedElement) return;

        if (targetItem === dragOverElement) limparDragOver();

        const items = Array.from(container.querySelectorAll('.acao-item'));
        const draggedIndex = items.indexOf(draggedElement);
        const targetIndex = items.indexOf(targetItem);

        if (draggedIndex < targetIndex) container.insertBefore(draggedElement, targetItem.nextSibling);
        else container.insertBefore(draggedElement, targetItem);

        _atualizarOrdemAcoesPorLista(container);
    });
}

function _atualizarOrdemAcoesPorLista(container: HTMLElement): void {
    const itens = Array.from(container.querySelectorAll('[data-acao]')) as HTMLElement[];
    const estado = EstadoManager.get() as EstadoApp;

    if (!estado.acoes) estado.acoes = {};

    itens.forEach((el, index) => {
        const id = el.dataset.acao;
        if (id && estado.acoes[id]) {
            estado.acoes[id].ordem = index + 1;
        }
    });

    EstadoManager.persistirAcoes(estado);
    EstadoManager.set(estado);
    log('🔃 Ordem das ações atualizada', 'info');
}

function getLogAreaMaxHeight(): number {
    const viewportMax = typeof globalThis !== 'undefined' && Number.isFinite(globalThis.innerHeight)
        ? Math.floor(globalThis.innerHeight * 0.6)
        : LOG_AREA_MAX_HEIGHT;
    return Math.max(LOG_AREA_MIN_HEIGHT, Math.min(LOG_AREA_MAX_HEIGHT, viewportMax));
}

function normalizarLogAreaHeight(valor: unknown): number {
    const num = Number(valor);
    if (!Number.isFinite(num)) return LOG_AREA_DEFAULT_HEIGHT;
    return Math.max(LOG_AREA_MIN_HEIGHT, Math.min(getLogAreaMaxHeight(), Math.floor(num)));
}

async function copiarTextoParaClipboard(texto: string): Promise<void> {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : null;
    if (clipboard?.writeText) {
        await clipboard.writeText(texto);
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = texto;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
    } finally {
        textarea.remove();
    }
}

function setupLogResize(estado: EstadoApp): void {
    const logArea = document.getElementById('log-area') as HTMLElement | null;
    const handle = document.querySelector('[data-log-resize-handle]') as HTMLElement | null;
    if (!logArea || !handle) return;

    logArea.style.height = `${normalizarLogAreaHeight((estado as any).logAreaHeight)}px`;

    let resizing = false;
    let startY = 0;
    let startHeight = 0;
    let pendingHeight: number | null = null;
    let resizeFramePending = false;

    const aplicarAlturaPendente = (): void => {
        if (pendingHeight == null) return;
        logArea.style.height = `${pendingHeight}px`;
        pendingHeight = null;
    };

    const agendarAltura = (): void => {
        if (resizeFramePending) return;
        resizeFramePending = true;
        const atualizar = (): void => {
            resizeFramePending = false;
            if (resizing) aplicarAlturaPendente();
        };

        if (typeof globalThis.requestAnimationFrame === 'function') {
            globalThis.requestAnimationFrame(atualizar);
        } else {
            globalThis.setTimeout(atualizar, 0);
        }
    };

    handle.addEventListener('mousedown', (e: MouseEvent) => {
        resizing = true;
        startY = e.clientY;
        startHeight = logArea.getBoundingClientRect().height || normalizarLogAreaHeight((estado as any).logAreaHeight);
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
        if (!resizing) return;
        pendingHeight = normalizarLogAreaHeight(startHeight + (e.clientY - startY));
        agendarAltura();
    });

    document.addEventListener('mouseup', () => {
        if (!resizing) return;
        aplicarAlturaPendente();
        resizing = false;
        const nextHeight = normalizarLogAreaHeight(parseFloat(logArea.style.height));
        logArea.style.height = `${nextHeight}px`;
        EstadoManager.update((st: any) => { st.logAreaHeight = nextHeight; });
    });
}

function getFiscalHintsOptions(estado: EstadoApp): FiscalHints.FiscalHintsApplyOptions {
    return {
        ativo: (estado as any).fiscalHintsAtivo !== false,
        dicas: ((estado as any).fiscalHints || {}) as Record<string, FiscalHints.FiscalHint>,
    };
}

function aplicarDicasFiscaisDoEstado(): void {
    FiscalHints.aplicarDicasFiscais(getFiscalHintsOptions(EstadoManager.get() as EstadoApp), obterEmpresaAtual());
}

function setFiscalHintsStatus(mensagem: string, tipo: 'info' | 'error' = 'info'): void {
    const el = document.getElementById('fiscalHintsStatus');
    if (!el) return;
    el.textContent = mensagem;
    el.style.color = tipo === 'error' ? '#b42318' : '#6c5947';
}

function atualizarListaDicasFiscais(estado: EstadoApp): void {
    const dicas = Object.entries(((estado as any).fiscalHints || {}) as Record<string, FiscalHints.FiscalHint>);
    const contador = document.querySelector('[data-km-fiscal-hints-count]');
    if (contador) contador.textContent = String(dicas.length);
}

function abrirGerenciadorDicas(editarId?: string): void {
    abrirGerenciadorDicasFiscais({
        getDicas: () => (((EstadoManager.get() as any).fiscalHints || {}) as Record<string, FiscalHints.FiscalHint>),
        persist: (dicas, json) => { persistirDicasFiscais(dicas, json); },
        setStatus: setFiscalHintsStatus,
        log: (mensagem) => log(mensagem, 'info'),
    }, editarId);
}
function persistirDicasFiscais(dicas: Record<string, FiscalHints.FiscalHint>, json?: string): EstadoApp {
    const estado = EstadoManager.update((st: any) => {
        st.fiscalHints = dicas;
        st.fiscalHintsJson = json ?? FiscalHints.exportarDicasFiscaisJson(dicas);
    }) as EstadoApp;
    const textarea = document.getElementById('fiscalHintsJson') as HTMLTextAreaElement | null;
    if (textarea) textarea.value = (estado as any).fiscalHintsJson || '';
    atualizarListaDicasFiscais(estado);
    aplicarDicasFiscaisDoEstado();
    return estado;
}

// ---------------------------------------------------------------------------
// Wiring principal de eventos
// ---------------------------------------------------------------------------
export function wireEvents(toggleMinimizar: () => void): void {
    const estado = EstadoManager.get() as EstadoApp;
    AcompanhamentoPauseControl.inicializar();
    const fmtS = (ms: number | string | null | undefined) => `${(Number(ms || 0) / 1000).toFixed(1)}s`;
    const painelConteudo = document.getElementById('painelConteudo');

    // ---- seções recolhíveis + persistência
    painelConteudo?.addEventListener('click', (e: Event) => {
        const btn = (e.target as HTMLElement).closest('[data-section-toggle]') as HTMLElement;
        if (!btn) return;
        const chave = String(btn.getAttribute('data-section-toggle') || '').trim();
        if (!chave) return;
        const secao = btn.closest('.km-collapsible[data-section]') as HTMLElement;
        if (!secao) return;

        const vaiExpandir = secao.classList.contains('is-collapsed');
        secao.classList.toggle('is-collapsed', !vaiExpandir);
        btn.setAttribute('aria-expanded', vaiExpandir ? 'true' : 'false');
        const icon = btn.querySelector('.km-section-toggle-icon');
        if (icon) icon.textContent = vaiExpandir ? '▾' : '▸';

        EstadoManager.update((st: any) => {
            st.painelSecoes = st.painelSecoes || {};
            st.painelSecoes[chave] = vaiExpandir;
        });
    });

    // ---- persistência do scroll interno do drawer
    const persistirScrollPainel = debounce(() => {
        if (!painelConteudo) return;
        const top = Math.max(0, Math.floor(painelConteudo.scrollTop || 0));
        EstadoManager.update((st: any) => {
            st.painelScrollTop = top;
        });
    }, 120);
    painelConteudo?.addEventListener('scroll', persistirScrollPainel, { passive: true });

    // ---- lista de ações: construir e wiring
    construirListaAcoes(estado);
    const container = document.getElementById('lista-acoes');

    // Inspecionar / testar ações
    container?.addEventListener('click', async (e: Event) => {
        const btnInspecao = (e.target as HTMLElement).closest('.btn-inspecao') as HTMLElement;
        if (btnInspecao) {
            InspecaoManager.ativar(btnInspecao.dataset.acao!);
            return;
        }

        const btnTestar = (e.target as HTMLElement).closest('.btn-testar') as HTMLElement;
        if (btnTestar) {
            const acaoId = btnTestar.dataset.acao;
            if (!acaoId) return;

            const est = EstadoManager.get() as EstadoApp;
            const acao = est.acoes && est.acoes[acaoId];

            if (!acao) {
                log(`❌ Ação ${acaoId} não encontrada`, 'error');
                return;
            }

            log(`🧪 Testando ação: ${acaoId}...`, 'info');
            const inputVal = document.getElementById(`val_${acaoId}`) as HTMLInputElement;
            const valorParaUsar = inputVal ? inputVal.value : acao.valor;

            try {
                const sucesso = await Interacao.tentarComRetry(acao.seletor || '', valorParaUsar || '', `teste_${acaoId}`);
                if (sucesso) {
                    log(`✅ Sucesso no teste: ${acaoId}`, 'info');
                    AudioManager.tocar('success');
                } else {
                    log(`❌ Falha no teste: ${acaoId} (não encontrado/visível)`, 'warn');
                    AudioManager.tocar('warning');
                }
            } catch (err: any) {
                log(`❌ Erro no teste: ${err.message}`, 'error');
                AudioManager.tocar('error');
            }
        }
    });

    // Persistência de checkboxes / valores de ações
    container?.addEventListener('change', (e: Event) => {
        const target = e.target as HTMLInputElement;

        if (target.type === 'checkbox' && target.id.startsWith('chk_')) {
            const acaoId = target.id.replace('chk_', '');
            const acaoDef = ACOES_WORKFLOW.find((a) => a.id === acaoId);
            if (acaoDef) {
                EstadoManager.update((st: any) => {
                    if (st.acoes[acaoId]) {
                        st.acoes[acaoId].ativo = target.checked;
                        EstadoManager.persistirAcoes(st);
                    }
                });
                log(`${target.checked ? '✅' : '⬜'} ${acaoDef.nome}`, 'info');
            }
        }

        if (target.type === 'text' && target.id.startsWith('val_')) {
            const acaoId = target.id.replace('val_', '');
            const acaoDef = ACOES_WORKFLOW.find((a) => a.id === acaoId);
            if (acaoDef) {
                EstadoManager.update((st: any) => {
                    if (st.acoes[acaoId]) {
                        st.acoes[acaoId].valor = target.value;
                        EstadoManager.persistirAcoes(st);
                    }
                });
                log(`💾 ${acaoDef.nome}: ${target.value}`, 'info');
            }
        }
    });

    // Validação visual em inputs de valor
    container?.addEventListener('input', (e: Event) => {
        const target = e.target as HTMLInputElement;
        if (target.type === 'text' && target.id.startsWith('val_')) {
            const acaoId = target.id.replace('val_', '');
            if (CONFIG.VALIDADORES[acaoId as keyof typeof CONFIG.VALIDADORES]) {
                const resultado = Validador.validar(acaoId, target.value);
                Validador.aplicarVisual(target, resultado);
            }
        }
    });

    // Validação inicial de todos os inputs
    ACOES_WORKFLOW.forEach((acaoDef) => {
        if (acaoDef.tipo === 'input' && CONFIG.VALIDADORES[acaoDef.id as keyof typeof CONFIG.VALIDADORES]) {
            const input = document.getElementById(`val_${acaoDef.id}`) as HTMLInputElement;
            const acaoState = estado.acoes && estado.acoes[acaoDef.id];
            if (input && acaoState) {
                const resultado = Validador.validar(acaoDef.id, acaoState.valor || '');
                Validador.aplicarVisual(input, resultado);
            }
        }
    });

    // ---- Perfil padrão
    if (estado.perfis && !estado.perfis.default) {
        estado.perfis.default = clone(estado.acoes);
        EstadoManager.set(estado);
    }
    PerfilManager.renderizarSeletor();

    // ---- Logs existentes
    setupLogResize(estado);
    const logsAtuais = LogManager.preloadParaUI?.() || [];
    logsAtuais.slice(0, 20).reverse().forEach((entry: any) => LogManager.atualizarUI?.(entry));

    // ---- Botões e sliders
    document.getElementById('drawerToggle')?.addEventListener('click', toggleMinimizar);
    document.getElementById('btnCopiarLogs')?.addEventListener('click', async () => {
        const texto = LogManager.formatarTodos?.() || '';
        if (!texto.trim()) {
            log('ℹ️ Sem logs para copiar', 'info');
            return;
        }

        try {
            await copiarTextoParaClipboard(texto);
            log('📋 Logs copiados para a área de transferência', 'info');
        } catch (err: any) {
            log(`❌ Erro ao copiar logs: ${err?.message || err}`, 'error');
        }
    });
    document.getElementById('btnLimparLogs')?.addEventListener('click', () => {
        LogManager.limpar?.();
    });

    document.getElementById('chkSimulacao')?.addEventListener('change', (e: Event) => {
        EstadoManager.update((st: any) => { st.modoSimulacao = (e.target as HTMLInputElement).checked; });
        const novoEstado = EstadoManager.get() as EstadoApp;
        log(novoEstado.modoSimulacao ? '🧪 Modo simulação ATIVADO' : '▶️ Modo simulação desativado', 'info');
    });
    document.getElementById('chkPausarReincidencia')?.addEventListener('change', (e: Event) => {
        AcompanhamentoPauseControl.configurarReincidencia(!!(e.target as HTMLInputElement).checked);
    });
    document.getElementById('chkPausarAcompanhamento')?.addEventListener('change', (e: Event) => {
        AcompanhamentoPauseControl.configurar(!!(e.target as HTMLInputElement).checked);
    });
    document.getElementById('tempoDesativacaoChecksMinutos')?.addEventListener('change', (e: Event) => {
        const input = e.target as HTMLInputElement;
        const minutos = normalizarTempoDesativacaoChecks(input.value);
        input.value = String(minutos);
        EstadoManager.update((st: any) => { st.tempoDesativacaoChecksMinutos = minutos; });
        log('⏱️ Tempo máximo dos checks desativados definido para ' + minutos + ' minuto' + (minutos === 1 ? '' : 's') + '.', 'info');
    });

    // ---- ItemMap
    // @contract ── Wiring do JSON por item (não alterar IDs nem chamadas) ──
    // Elementos esperados (gerados por painel-sections.ts → renderJsonSection):
    //   #itemMapJson       → textarea, carrega estado.itemMapJson
    //   #chkItemMapAtivo   → checkbox, toggle estado.itemMapAtivo
    //   #btnItemMapAplicar → click → ItemMapManager.aplicarJson(textarea.value)
    //   #btnItemMapCriar   → click → ItemMapManager.gerarJsonDoItemAtual(textarea)
    // Ao final do wireEvents: ItemMapManager.atualizarStatusUI() é chamado.
    const itemMapTextarea = document.getElementById('itemMapJson') as HTMLTextAreaElement;
    if (itemMapTextarea) itemMapTextarea.value = (estado as any).itemMapJson || '';

    document.getElementById('chkItemMapAtivo')?.addEventListener('change', (e: Event) => {
        EstadoManager.update((st: any) => { st.itemMapAtivo = (e.target as HTMLInputElement).checked; });
        const novoEstado = EstadoManager.get() as EstadoApp;
        log(novoEstado.itemMapAtivo ? '🧾 JSON por item ATIVADO' : '🧾 JSON por item DESATIVADO', 'info');
        ItemMapManager.atualizarStatusUI(novoEstado);
    });

    document.getElementById('btnItemMapAplicar')?.addEventListener('click', () => {
        ItemMapManager.aplicarJson(itemMapTextarea?.value || '');
    });

    document.getElementById('btnItemMapCriar')?.addEventListener('click', () => {
        ItemMapManager.gerarJsonDoItemAtual(itemMapTextarea);
    });

    // ---- Dicas fiscais por termo
    const fiscalHintsTextarea = document.getElementById('fiscalHintsJson') as HTMLTextAreaElement | null;
    if (fiscalHintsTextarea && !fiscalHintsTextarea.value.trim()) {
        fiscalHintsTextarea.value = FiscalHints.exportarDicasFiscaisJson(((estado as any).fiscalHints || {}) as Record<string, FiscalHints.FiscalHint>);
    }

    document.getElementById('btnFiscalHintsGerenciar')?.addEventListener('click', () => {
        abrirGerenciadorDicas();
    });
    document.getElementById('chkFiscalHintsAtivo')?.addEventListener('change', (e: Event) => {
        EstadoManager.update((st: any) => { st.fiscalHintsAtivo = (e.target as HTMLInputElement).checked; });
        aplicarDicasFiscaisDoEstado();
        log((e.target as HTMLInputElement).checked ? '🔎 Dicas fiscais ativadas' : '🔎 Dicas fiscais desativadas', 'info');
    });

    document.getElementById('btnFiscalHintAdicionar')?.addEventListener('click', () => {
        const termo = (document.getElementById('txtFiscalHintTermo') as HTMLInputElement | null)?.value || '';
        const ncm = (document.getElementById('txtFiscalHintNcm') as HTMLInputElement | null)?.value || '';
        const unspsc = (document.getElementById('txtFiscalHintUnspsc') as HTMLInputElement | null)?.value || '';
        const atuais = Object.values(((EstadoManager.get() as any).fiscalHints || {}) as Record<string, FiscalHints.FiscalHint>);
        const resultado = FiscalHints.importarDicasFiscaisJson(JSON.stringify([...atuais, { termo, ncm, unspsc }]));
        if (!resultado.ok) {
            setFiscalHintsStatus(resultado.erros.join(' | '), 'error');
            return;
        }
        persistirDicasFiscais(resultado.dicas);
        ['txtFiscalHintTermo', 'txtFiscalHintNcm', 'txtFiscalHintUnspsc'].forEach((id) => {
            const input = document.getElementById(id) as HTMLInputElement | null;
            if (input) input.value = '';
        });
        setFiscalHintsStatus('Dica adicionada.');
        log(`🔎 Dica fiscal adicionada para: ${termo}`, 'info');
    });

    document.getElementById('btnFiscalHintsImportar')?.addEventListener('click', () => {
        const json = fiscalHintsTextarea?.value || '';
        const resultado = FiscalHints.importarDicasFiscaisJson(json);
        if (!resultado.ok) {
            setFiscalHintsStatus(resultado.erros.join(' | '), 'error');
            return;
        }
        persistirDicasFiscais(resultado.dicas, FiscalHints.exportarDicasFiscaisJson(resultado.dicas));
        setFiscalHintsStatus('JSON aplicado.');
        log('🔎 JSON de dicas fiscais aplicado', 'info');
    });

    document.getElementById('btnFiscalHintsExportar')?.addEventListener('click', () => {
        const est = EstadoManager.get() as EstadoApp;
        const json = FiscalHints.exportarDicasFiscaisJson(((est as any).fiscalHints || {}) as Record<string, FiscalHints.FiscalHint>);
        EstadoManager.update((st: any) => { st.fiscalHintsJson = json; });
        if (fiscalHintsTextarea) fiscalHintsTextarea.value = json;
        setFiscalHintsStatus('JSON atualizado.');
    });

    // ---- Sliders de delay
    const deb = (fn: any) => debounce(fn, 80);

    const atualizarIntervaloDelay = (alterado: 'min' | 'max'): void => {
        const minimoEl = document.getElementById('globalActionDelayMinSlider') as HTMLInputElement | null;
        const maximoEl = document.getElementById('globalActionDelayMaxSlider') as HTMLInputElement | null;
        if (!minimoEl || !maximoEl) return;

        let minimo = parseInt(minimoEl.value, 10);
        let maximo = parseInt(maximoEl.value, 10);
        if (!Number.isFinite(minimo)) minimo = 200;
        if (!Number.isFinite(maximo)) maximo = minimo;

        if (alterado === 'min' && minimo > maximo) {
            maximo = minimo;
            maximoEl.value = String(maximo);
        } else if (alterado === 'max' && maximo < minimo) {
            minimo = maximo;
            minimoEl.value = String(minimo);
        }

        const faixaLabel = document.getElementById('globalActionDelayLabel');
        const minimoLabel = document.getElementById('globalActionDelayMinLabel');
        const maximoLabel = document.getElementById('globalActionDelayMaxLabel');
        if (faixaLabel) faixaLabel.textContent = `${fmtS(minimo)} – ${fmtS(maximo)}`;
        if (minimoLabel) minimoLabel.textContent = fmtS(minimo);
        if (maximoLabel) maximoLabel.textContent = fmtS(maximo);

        EstadoManager.update((st: any) => {
            st.globalActionDelayMinMs = minimo;
            st.globalActionDelayMaxMs = maximo;
            st.globalActionDelayMs = maximo;
        });
    };

    document.getElementById('globalActionDelayMinSlider')?.addEventListener('input', deb(() => atualizarIntervaloDelay('min')));
    document.getElementById('globalActionDelayMaxSlider')?.addEventListener('input', deb(() => atualizarIntervaloDelay('max')));

    document.getElementById('clickCooldownSlider')?.addEventListener('input', deb((e: Event) => {
        const valor = parseInt((e.target as HTMLInputElement).value, 10);
        const label = document.getElementById('clickCooldownLabel');
        if (label) label.textContent = fmtS(valor);
        EstadoManager.update((st: any) => { st.clickCooldownMs = valor; });
    }));

    // ---- Botão toggle principal
    document.getElementById('btnToggle')?.addEventListener('click', () => {
        const est = EstadoManager.get() as EstadoApp;
        if (est.pausado) WorkflowExecutor.togglePausar();
        else if (est.ativo) WorkflowExecutor.parar();
        else WorkflowExecutor.iniciar();
    });

    ItemMapManager.atualizarStatusUI(EstadoManager.get() as EstadoApp);
    document.getElementById('btnSsoEmpresasSalvar')?.addEventListener('click', () => {
        const textarea = document.getElementById('kmSsoEmpresasInput') as HTMLTextAreaElement | null;
        const empresas = SsoEmpresaAbas.salvarEmpresasMonitoradas(textarea?.value || '');
        SsoEmpresaAbas.definirMensagemMonitorSSO(empresas.length + ' empresa(s) salvas.');
        SsoEmpresaAbas.atualizarPainelSso();
        log('💾 Lista de empresas do SSO salva', 'info');
    });

    document.getElementById('btnSsoEmpresasAtualizar')?.addEventListener('click', () => {
        SsoEmpresaAbas.atualizarPainelSso();
        SsoEmpresaAbas.definirMensagemMonitorSSO('Status das abas atualizado.');
    });

    document.getElementById('btnSsoEmpresasAbrir')?.addEventListener('click', () => {
        const resultado = SsoEmpresaAbas.abrirEmpresasFaltantes();
        const mensagem = resultado.semLink > 0
            ? resultado.abertas + ' empresa(s) enviadas para abertura; ' + resultado.semLink + ' sem cartão encontrado.'
            : resultado.abertas + ' empresa(s) enviadas para abertura.';
        SsoEmpresaAbas.definirMensagemMonitorSSO(mensagem, resultado.semLink > 0);
        log('🚀 Abertura automática do SSO solicitada', 'info');
    });

    document.getElementById('btnAbrirHabitos')?.addEventListener('click', () => {
        window.open('http://localhost:5173/habits/index.html', '_blank');
    });

    SsoEmpresaAbas.atualizarPainelSso();
    atualizarListaDicasFiscais(estado);
    aplicarDicasFiscaisDoEstado();
    if (container) setupDragAndDrop(container);
}

