/**
 * Event listeners do painel de controle.
 * Extraído do monólito — criarPainel() event wiring (linhas 4912–5176).
 */

import { CONFIG, REPORTING_DEFAULTS } from '../config/constants.ts';
import { ACOES_WORKFLOW } from '../config/workflow-actions.ts';
import * as EstadoManager from '../core/estado-manager.ts';
import { normalizarReportingConfig } from '../core/estado-manager.ts';
import { log } from '../core/log-manager.ts';
import * as LogManager from '../core/log-manager.ts';
import * as AudioManager from '../interaction/audio-manager.ts';
import * as Interacao from '../interaction/interacao.ts';
import * as ItemMapManager from '../data/item-map-manager.ts';
import * as Validador from '../validation/validador.ts';
import { debounce, clone } from '../utils/misc.ts';
import * as PerfilManager from './perfil-manager.js';
import * as InspecaoManager from './inspecao-manager.ts';
import * as RelatorioErros from './relatorio-erros.ts';
import { construirListaAcoes } from './painel-builder.ts';
import * as WorkflowExecutor from '../workflow/executor.ts';
import type { EstadoApp } from '../core/estado-manager.ts';

// ---------------------------------------------------------------------------
// Drag & drop de reordenação de ações
// ---------------------------------------------------------------------------
export function setupDragAndDrop(container: HTMLElement): void {
    let draggedElement: HTMLElement | null = null;

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
        container.querySelectorAll('.acao-item').forEach((i) => i.classList.remove('drag-over'));
    });

    container.addEventListener('dragover', (e: DragEvent) => {
        e.preventDefault();
        const item = (e.target as HTMLElement).closest('.acao-item') as HTMLElement;
        if (!item || item === draggedElement || !e.dataTransfer) return;
        container.querySelectorAll('.acao-item').forEach((i) => i.classList.remove('drag-over'));
        item.classList.add('drag-over');
        e.dataTransfer.dropEffect = 'move';
    });

    container.addEventListener('dragleave', (e: Event) => {
        const item = (e.target as HTMLElement).closest('.acao-item');
        if (item) item.classList.remove('drag-over');
    });

    container.addEventListener('drop', (e: DragEvent) => {
        e.preventDefault();
        const targetItem = (e.target as HTMLElement).closest('.acao-item') as HTMLElement;
        if (!targetItem || !draggedElement || targetItem === draggedElement) return;

        targetItem.classList.remove('drag-over');

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

// ---------------------------------------------------------------------------
// Wiring principal de eventos
// ---------------------------------------------------------------------------
export function wireEvents(toggleMinimizar: () => void): void {
    const estado = EstadoManager.get() as EstadoApp;
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
        estado.perfilConfigs = estado.perfilConfigs || {};
        estado.perfilConfigs.default = estado.perfilConfigs.default || {
            reporting: normalizarReportingConfig(estado.reporting || REPORTING_DEFAULTS),
        };
        EstadoManager.set(estado);
    }
    PerfilManager.renderizarSeletor();

    // ---- Logs existentes
    const logsAtuais = LogManager.preloadParaUI?.() || [];
    logsAtuais.slice(0, 20).reverse().forEach((entry: any) => LogManager.atualizarUI?.(entry));

    // ---- Botões e sliders
    document.getElementById('drawerToggle')?.addEventListener('click', toggleMinimizar);
    document.getElementById('btnCopiarRelatorio')?.addEventListener('click', () => RelatorioErros.copiar());

    document.getElementById('chkSimulacao')?.addEventListener('change', (e: Event) => {
        EstadoManager.update((st: any) => { st.modoSimulacao = (e.target as HTMLInputElement).checked; });
        const novoEstado = EstadoManager.get() as EstadoApp;
        log(novoEstado.modoSimulacao ? '🧪 Modo simulação ATIVADO' : '▶️ Modo simulação desativado', 'info');
    });
    document.getElementById('chkPausarReincidencia')?.addEventListener('change', (e: Event) => {
        const ativo = !!(e.target as HTMLInputElement).checked;
        EstadoManager.update((st: any) => { st.pausarEmReincidencia = ativo; });
        log(ativo ? '⛔ Pausa por reincidência ATIVADA' : '✅ Pausa por reincidência DESATIVADA', 'info');
    });

    // ---- ItemMap
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

    // ---- Sliders de delay
    const deb = (fn: any) => debounce(fn, 80);

    document.getElementById('globalActionDelaySlider')?.addEventListener('input', deb((e: Event) => {
        const valor = parseInt((e.target as HTMLInputElement).value, 10);
        const label = document.getElementById('globalActionDelayLabel');
        if (label) label.textContent = fmtS(valor);
        EstadoManager.update((st: any) => { st.globalActionDelayMs = valor; });
    }));

    document.getElementById('clickCooldownSlider')?.addEventListener('input', deb((e: Event) => {
        const valor = parseInt((e.target as HTMLInputElement).value, 10);
        const label = document.getElementById('clickCooldownLabel');
        if (label) label.textContent = fmtS(valor);
        EstadoManager.update((st: any) => { st.clickCooldownMs = valor; });
    }));

    // ---- Reporting
    const persistReporting = (mutator: (cfg: Record<string, any>) => void) => {
        EstadoManager.update((st: any) => {
            st.reporting = normalizarReportingConfig(st.reporting || REPORTING_DEFAULTS);
            mutator(st.reporting);
            EstadoManager.persistirAcoes(st);
        });
    };

    document.getElementById('chkReportingMedia')?.addEventListener('change', (e: Event) => {
        persistReporting((cfg) => { cfg.enabledMedia = !!(e.target as HTMLInputElement).checked; });
        log(`🖼️ Coleta de mídia ${(e.target as HTMLInputElement).checked ? 'ativada' : 'desativada'}`, 'info');
    });

    document.getElementById('chkReportingEnabled')?.addEventListener('change', (e: Event) => {
        persistReporting((cfg) => { cfg.enabledReport = !!(e.target as HTMLInputElement).checked; });
        log(`📝 Geração de relatório PDF/MD ${(e.target as HTMLInputElement).checked ? 'ativada' : 'desativada'}`, 'info');
    });

    document.getElementById('chkReportingClickMediaTab')?.addEventListener('change', (e: Event) => {
        persistReporting((cfg) => { cfg.clickMediaTabBeforeCollect = !!(e.target as HTMLInputElement).checked; });
        log(`🖱️ Clique na aba Mídias antes da coleta ${(e.target as HTMLInputElement).checked ? 'ativado' : 'desativado'}`, 'info');
    });

    document.getElementById('chkReportingAcompanhamento')?.addEventListener('change', (e: Event) => {
        persistReporting((cfg) => { cfg.enabledAcompanhamento = !!(e.target as HTMLInputElement).checked; });
        log(`📜 Coleta de acompanhamento ${(e.target as HTMLInputElement).checked ? 'ativada' : 'desativada'}`, 'info');
    });

    document.getElementById('chkReportingBlock')?.addEventListener('change', (e: Event) => {
        persistReporting((cfg) => { cfg.blockOnReportError = !!(e.target as HTMLInputElement).checked; });
        log(`🧱 Bloqueio em erro de relatório ${(e.target as HTMLInputElement).checked ? 'ativado' : 'desativado'}`, 'info');
    });

    document.getElementById('txtReportingServiceUrl')?.addEventListener('change', (e: Event) => {
        const input = (e.target as HTMLInputElement);
        const novo = String(input.value || '').trim() || CONFIG.REPORTING.SERVICE_DEFAULT;
        persistReporting((cfg) => { cfg.serviceUrl = novo; });
        input.value = novo;
        log(`🔗 Serviço de relatório: ${novo}`, 'info');
    });

    document.getElementById('txtReportingApiToken')?.addEventListener('change', (e: Event) => {
        const input = (e.target as HTMLInputElement);
        const token = String(input.value || '').trim();
        persistReporting((cfg) => { cfg.apiToken = token || null; });
        input.value = token;
        log(`🔐 Token de API ${token ? 'configurado' : 'removido'}`, 'info');
    });

    document.getElementById('selReportingTransport')?.addEventListener('change', (e: Event) => {
        const transport = String((e.target as HTMLSelectElement).value || 'auto').trim() as any;
        persistReporting((cfg) => { cfg.transport = transport; });
        log(`🚚 Transporte de relatório: ${transport}`, 'info');
    });

    document.getElementById('numReportingMaxFileMb')?.addEventListener('change', (e: Event) => {
        const input = (e.target as HTMLInputElement);
        const val = Math.max(1, Math.min(200, Number(input.value || CONFIG.REPORTING.MAX_FILE_SIZE_MB)));
        persistReporting((cfg) => { cfg.maxFileSizeMb = val; });
        input.value = String(val);
        log(`📦 Limite por arquivo: ${val}MB`, 'info');
    });

    document.getElementById('numReportingMaxFiles')?.addEventListener('change', (e: Event) => {
        const input = (e.target as HTMLInputElement);
        const val = Math.max(1, Math.min(200, Number(input.value || CONFIG.REPORTING.MAX_FILES_PER_ITEM)));
        persistReporting((cfg) => { cfg.maxFilesPerItem = val; });
        input.value = String(val);
        log(`📚 Limite de arquivos por item: ${val}`, 'info');
    });

    // ---- Botão toggle principal
    document.getElementById('btnToggle')?.addEventListener('click', () => {
        const est = EstadoManager.get() as EstadoApp;
        if (est.pausado) WorkflowExecutor.togglePausar();
        else if (est.ativo) WorkflowExecutor.parar();
        else WorkflowExecutor.iniciar();
    });

    ItemMapManager.atualizarStatusUI(EstadoManager.get() as EstadoApp);
    if (container) setupDragAndDrop(container);
}
