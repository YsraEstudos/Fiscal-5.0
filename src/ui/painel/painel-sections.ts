import { CONFIG, REPORTING_DEFAULTS } from '../../config/constants.ts';
import { normalizarReportingConfig } from '../../core/estado-manager.ts';
import { escapeHtml } from '../../utils/misc.ts';
import { obterResumoUI } from '../../workflow/estimativa.ts';
import { obterResumoTrilhaUI } from '../../workflow/item-trace.ts';
import type { EstadoApp } from '../../core/estado-manager.ts';

function formatarSegundos(ms: number | string | null | undefined): string {
    return `${(Number(ms || 0) / 1000).toFixed(1)}s`;
}

export function renderResumoExecucao(estado: EstadoApp): string {
    const resumo = obterResumoUI(estado);
    const classeCard = resumo.pausadoPorReincidencia ? 'km-card km-summary-card is-critical' : 'km-card km-summary-card';

    return `
        <section class="${classeCard}">
            <div class="km-card-head">
                <div>
                    <p class="km-kicker">Lote</p>
                    <h2 class="km-card-title">Resumo da execução</h2>
                </div>
                <span class="km-badge">${escapeHtml(resumo.fonteTotal)}</span>
            </div>
            <p id="etaResumo" class="km-summary-copy">${escapeHtml(resumo.resumo)}</p>
            <div class="km-summary-grid">
                <div class="km-summary-metric">
                    <span class="km-summary-label">1º item</span>
                    <strong class="km-summary-value" data-role="eta-primeiro-item">${escapeHtml(resumo.primeiroItemTexto)}</strong>
                </div>
                <div class="km-summary-metric">
                    <span class="km-summary-label">Tempo base</span>
                    <strong id="etaTempoBase" class="km-summary-value">${escapeHtml(resumo.tempoBaseTexto)}</strong>
                </div>
                <div class="km-summary-metric">
                    <span class="km-summary-label">ETA</span>
                    <strong id="etaRestante" class="km-summary-value">${escapeHtml(resumo.etaRestanteTexto)}</strong>
                </div>
                <div class="km-summary-metric">
                    <span class="km-summary-label">Término</span>
                    <strong id="etaPrevisao" class="km-summary-value">${escapeHtml(resumo.previsaoTexto)}</strong>
                </div>
            </div>
        </section>
    `;
}

export function renderTrilhaSection(estado: EstadoApp): string {
    const trilha = obterResumoTrilhaUI(estado);
    const eventosHtml = trilha.events.map((evento: any) => `
        <li class="km-trace-item" data-event-type="${escapeHtml(evento.tipo)}">
            <span class="km-trace-time">${escapeHtml(evento.horario)}</span>
            <span class="km-trace-copy">${escapeHtml(evento.resumo)}</span>
        </li>
    `).join('');

    return `
        <section id="itemTraceCard" class="${trilha.cardClassName}">
            <div id="itemTraceHeader" class="km-card-head km-card-head--tight">
                <label class="km-section-label">Trilha do item</label>
            </div>
            <div id="itemTraceCurrent" class="km-trace-current">${escapeHtml(trilha.empty ? 'Sem eventos nesta rodada.' : trilha.currentLabel)}</div>
            <ul id="itemTraceList" class="km-trace-list" style="${trilha.empty ? 'display:none;' : ''}">
                ${eventosHtml}
            </ul>
            <div id="itemTraceEmpty" class="km-helper-text" style="${trilha.empty ? '' : 'display:none;'}">Sem eventos nesta rodada.</div>
        </section>
    `;
}

export function renderPerfilSection(): string {
    return `
        <section class="km-card">
            <label class="km-section-label">Perfil</label>
            <div id="perfil-container"></div>
        </section>
    `;
}

export function renderWorkflowSection(): string {
    return `
        <section class="km-card">
            <label class="km-section-label">Ações do workflow</label>
            <div id="lista-acoes-wrapper" class="km-lista-acoes-wrapper">
                <div id="lista-acoes"></div>
            </div>
        </section>
    `;
}

export function renderOpcoesSection(estado: EstadoApp): string {
    const reporting = estado.reporting as Record<string, any> || normalizarReportingConfig(REPORTING_DEFAULTS);
    return `
        <section class="km-card">
            <label class="km-section-label">Opções</label>
            <div class="km-form-stack">
                <label class="km-checkline">
                    <input type="checkbox" id="chkSimulacao" ${estado.modoSimulacao ? 'checked' : ''}>
                    <span>Modo simulação</span>
                </label>
                <label class="km-checkline">
                    <input type="checkbox" id="chkPausarReincidencia" ${estado.pausarEmReincidencia !== false ? 'checked' : ''}>
                    <span>Pausar ao detectar 2ª passagem na etapa</span>
                </label>

                <div class="km-field">
                    <label>Delay global entre ações <span id="globalActionDelayLabel">${formatarSegundos(estado.globalActionDelayMs ?? 1200)}</span></label>
                    <input type="range" id="globalActionDelaySlider" min="200" max="60000" step="100" value="${Number(estado.globalActionDelayMs ?? 1200)}">
                </div>

                <div class="km-field">
                    <label>Anti-clique <span id="clickCooldownLabel">${formatarSegundos(estado.clickCooldownMs)}</span></label>
                    <input type="range" id="clickCooldownSlider" min="0" max="20000" step="500" value="${Number(estado.clickCooldownMs || 3000)}">
                </div>

                <div class="km-divider"></div>

                <label class="km-checkline">
                    <input type="checkbox" id="chkReportingEnabled" ${reporting.enabledReport ? 'checked' : ''}>
                    <span>Gerar relatório PDF/MD</span>
                </label>
                <label class="km-checkline">
                    <input type="checkbox" id="chkReportingMedia" ${reporting.enabledMedia ? 'checked' : ''}>
                    <span>Coletar mídia</span>
                </label>
                <label class="km-checkline">
                    <input type="checkbox" id="chkReportingClickMediaTab" ${reporting.clickMediaTabBeforeCollect ? 'checked' : ''}>
                    <span>Clicar na aba Mídias antes da coleta</span>
                </label>
                <label class="km-checkline">
                    <input type="checkbox" id="chkReportingAcompanhamento" ${reporting.enabledAcompanhamento ? 'checked' : ''}>
                    <span>Coletar acompanhamento</span>
                </label>
                <label class="km-checkline">
                    <input type="checkbox" id="chkReportingBlock" ${reporting.blockOnReportError ? 'checked' : ''}>
                    <span>Bloquear em erro de relatório</span>
                </label>

                <div class="km-field">
                    <label for="txtReportingServiceUrl">Serviço local</label>
                    <input type="text" id="txtReportingServiceUrl" value="${escapeHtml(reporting.serviceUrl || CONFIG.REPORTING.SERVICE_DEFAULT)}">
                </div>
                <div class="km-field">
                    <label for="txtReportingApiToken">Token API</label>
                    <input type="text" id="txtReportingApiToken" value="${escapeHtml(reporting.apiToken || '')}" placeholder="X-KM-Token">
                </div>
                <div class="km-field">
                    <label for="selReportingTransport">Transporte</label>
                    <select id="selReportingTransport">
                        <option value="auto" ${reporting.transport === 'auto' ? 'selected' : ''}>auto</option>
                        <option value="gm_xhr" ${reporting.transport === 'gm_xhr' ? 'selected' : ''}>gm_xhr</option>
                        <option value="fetch" ${reporting.transport === 'fetch' ? 'selected' : ''}>fetch</option>
                    </select>
                </div>

                <div class="km-field-grid">
                    <div class="km-field">
                        <label for="numReportingMaxFileMb">Max MB/arquivo</label>
                        <input type="number" id="numReportingMaxFileMb" min="1" max="200" value="${Number(reporting.maxFileSizeMb || CONFIG.REPORTING.MAX_FILE_SIZE_MB)}">
                    </div>
                    <div class="km-field">
                        <label for="numReportingMaxFiles">Max arquivos/item</label>
                        <input type="number" id="numReportingMaxFiles" min="1" max="200" value="${Number(reporting.maxFilesPerItem || CONFIG.REPORTING.MAX_FILES_PER_ITEM)}">
                    </div>
                </div>
            </div>
        </section>
    `;
}

export function renderJsonSection(estado: EstadoApp): string {
    return `
        <section class="km-card">
            <label class="km-section-label">JSON por item</label>
            <label class="km-checkline">
                <input type="checkbox" id="chkItemMapAtivo" ${estado.itemMapAtivo ? 'checked' : ''}>
                <span>Usar JSON por ID</span>
            </label>
            <textarea id="itemMapJson" class="km-textarea" placeholder='{
  &quot;320780&quot;: { &quot;ncm&quot;: &quot;8471.30.12&quot;, &quot;cest&quot;: &quot;01.075.00&quot;, &quot;unspsc&quot;: &quot;30103618&quot; }
}'></textarea>
            <div class="km-button-row">
                <button id="btnItemMapAplicar" class="km-secondary-button" type="button">Aplicar JSON</button>
                <button id="btnItemMapCriar" class="km-secondary-button" type="button">Criar JSON do item</button>
            </div>
            <div id="itemMapStatus" class="km-helper-text"></div>
        </section>
    `;
}

export function renderProgressoSection(): string {
    return `
        <section id="progressBar" class="km-card km-progress-card" style="display:none;">
            <div class="km-progress-track">
                <div id="progressFill" class="km-progress-fill"></div>
            </div>
            <div id="progressText" class="km-progress-text">0 / 0</div>
        </section>
    `;
}

export function renderControleSection(estado: EstadoApp): string {
    return `
        <button id="btnToggle" class="km-primary-button" type="button">
            ${estado.ativo ? 'Parar robô' : 'Iniciar ciclo'}
        </button>
        <div id="statusRobo" class="km-status">
            ${estado.ativo ? (estado.pausado ? 'Pausado' : 'Executando...') : 'Aguardando comando.'}
        </div>
    `;
}

export function renderLogsSection(): string {
    return `
        <section class="km-card">
            <div class="km-card-head km-card-head--tight">
                <label class="km-section-label">Log</label>
                <div class="km-log-actions">
                    <button id="btnCopiarLogs" class="km-inline-button" type="button">Copiar tudo</button>
                    <button id="btnLimparLogs" class="km-inline-button km-inline-button--danger" type="button">Apagar</button>
                    <button id="btnCopiarRelatorio" class="km-inline-button" type="button">Copiar erro</button>
                </div>
            </div>
            <div class="km-log-resizer">
                <div id="log-area" class="km-log-area"></div>
                <div class="km-log-resize-handle" data-log-resize-handle title="Arraste para redimensionar logs"></div>
            </div>
            <div class="km-shortcuts">F7 abre/fecha • F8 pausa • ESC para tudo</div>
        </section>
    `;
}
