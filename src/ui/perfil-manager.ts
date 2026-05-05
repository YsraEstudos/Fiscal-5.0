/**
 * Gerenciamento de perfis de configuração.
 * Extraído do monólito — PerfilManager (linhas 4221–4387).
 */

import * as EstadoManager from '../core/estado-manager.ts';
import { normalizarReportingConfig } from '../core/estado-manager.ts';
import { log } from '../core/log-manager.ts';
import * as AudioManager from '../interaction/audio-manager.ts';
import { ACOES_WORKFLOW } from '../config/workflow-actions.ts';
import { REPORTING_DEFAULTS, CONFIG } from '../config/constants.ts';
import { clone, escapeHtml } from '../utils/misc.ts';
import type { EstadoApp } from '../core/estado-manager.ts';

// ---------------------------------------------------------------------------
export function criar(nome: string): void {
    const estado = EstadoManager.get() as EstadoApp;
    if (!estado.perfis) estado.perfis = {};
    estado.perfis[nome] = clone(estado.acoes || {});
    estado.perfilConfigs = estado.perfilConfigs || {};
    estado.perfilConfigs[nome] = {
        reporting: normalizarReportingConfig(estado.reporting),
    };
    EstadoManager.set(estado);
    log(`📁 Perfil "${nome}" criado`, 'info');
    renderizarSeletor();
}

export function carregar(nome: string): void {
    const estado = EstadoManager.get() as EstadoApp;
    if (!estado.perfis || !estado.perfis[nome]) {
        log(`❌ Perfil "${nome}" não encontrado`, 'error');
        return;
    }
    estado.acoes = clone(estado.perfis[nome]);
    estado.perfilAtivo = nome;
    const cfgPerfil = estado.perfilConfigs?.[nome]?.reporting;
    estado.reporting = normalizarReportingConfig(cfgPerfil || REPORTING_DEFAULTS);
    EstadoManager.set(estado);
    log(`📂 Perfil "${nome}" carregado`, 'info');
    
    // Na UI de browser extension, mockado no teste
    if (typeof globalThis.location !== 'undefined') {
        globalThis.location.reload();
    }
}

export function excluir(nome: string): void {
    if (nome === 'default') {
        log('⚠️ Não é possível excluir o perfil padrão', 'warn');
        return;
    }
    const estado = EstadoManager.get() as EstadoApp;
    if (estado.perfis) delete estado.perfis[nome];
    if (estado.perfilConfigs) delete estado.perfilConfigs[nome];
    
    if (estado.perfilAtivo === nome) {
        estado.perfilAtivo = 'default';
        estado.acoes = (estado.perfis && estado.perfis.default) ? estado.perfis.default : {};
        const defaultCfg = estado.perfilConfigs?.default?.reporting;
        estado.reporting = normalizarReportingConfig(defaultCfg || REPORTING_DEFAULTS);
    }
    EstadoManager.set(estado);
    renderizarSeletor();
}

export function exportar(): void {
    const estado = EstadoManager.get() as EstadoApp;
    const perfilAtual = (estado.perfis && estado.perfilAtivo) ? estado.perfis[estado.perfilAtivo] : estado.acoes;

    const dadosExport = {
        versao: '5.4.1',
        schema: CONFIG.SCHEMA_VERSION,
        nome: estado.perfilAtivo || 'default',
        acoes: perfilAtual,
        reporting: normalizarReportingConfig(estado.reporting),
        exportadoEm: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(dadosExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `perfil_${estado.perfilAtivo || 'default'}_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    log(`📤 Perfil "${estado.perfilAtivo || 'default'}" exportado`, 'info');
    AudioManager.tocar('success');
}

export function importar(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.addEventListener('change', (e: Event) => {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event: ProgressEvent<FileReader>) => {
            try {
                if (typeof event.target?.result !== 'string') throw new Error('Falha ao ler o arquivo');
                const dados = JSON.parse(event.target.result);

                if (!dados.acoes || typeof dados.acoes !== 'object') {
                    throw new Error('Formato inválido: falta objeto "acoes"');
                }

                if (dados.schema && dados.schema > CONFIG.SCHEMA_VERSION) {
                    log('⚠️ Perfil de versão mais nova, pode haver incompatibilidades', 'warn');
                }

                const nomePerfil = dados.nome || `importado_${Date.now()}`;
                const estado = EstadoManager.get() as EstadoApp;

                if (!estado.perfis) estado.perfis = {};
                if (estado.perfis[nomePerfil]) {
                    if (!globalThis.confirm(`Perfil "${nomePerfil}" já existe. Sobrescrever?`)) return;
                }

                const acoesValidadas: Record<string, any> = {};
                ACOES_WORKFLOW.forEach((acao) => {
                    const importada = dados.acoes[acao.id];
                    acoesValidadas[acao.id] = {
                        ativo: importada?.ativo ?? true,
                        seletor: importada?.seletor || acao.seletor,
                        valor: importada?.valor ?? (acao.valorPadrao || null),
                        ordem: importada?.ordem ?? acao.ordem,
                    };
                });

                estado.perfis[nomePerfil] = acoesValidadas;
                estado.perfilConfigs = estado.perfilConfigs || {};
                estado.perfilConfigs[nomePerfil] = {
                    reporting: normalizarReportingConfig(dados.reporting || REPORTING_DEFAULTS),
                };
                estado.reporting = normalizarReportingConfig(dados.reporting || estado.reporting || REPORTING_DEFAULTS);
                EstadoManager.set(estado);

                log(`📥 Perfil "${nomePerfil}" importado com sucesso`, 'info');
                AudioManager.tocar('success');
                renderizarSeletor();
            } catch (erro: any) {
                log(`❌ Erro ao importar: ${erro.message}`, 'error');
                AudioManager.tocar('error');
            }
        };
        reader.readAsText(file);
    });

    input.click();
}

export function renderizarSeletor(): void {
    const container = document.getElementById('perfil-container');
    if (!container) return;

    const estado = EstadoManager.get() as EstadoApp;
    const perfis = Object.keys(estado.perfis || {});
    if (perfis.length === 0) perfis.push('default');

    container.innerHTML = `
        <select id="seletorPerfil" style="width:45%; padding:4px; font-size:11px;">
          ${perfis.map((p) => `<option value="${escapeHtml(p)}" ${p === estado.perfilAtivo ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}
        </select>
        <button id="btnCriarPerfil" title="Criar novo perfil" style="padding:4px 6px; font-size:10px;">➕</button>
        <button id="btnExcluirPerfil" title="Excluir perfil" style="padding:4px 5px; font-size:10px;">🗑️</button>
        <button id="btnExportarPerfil" title="Exportar perfil" style="padding:4px 5px; font-size:10px;">📤</button>
        <button id="btnImportarPerfil" title="Importar perfil" style="padding:4px 5px; font-size:10px;">📥</button>
    `;

    document.getElementById('seletorPerfil')?.addEventListener('change', (e: Event) => carregar((e.target as HTMLSelectElement).value));
    document.getElementById('btnCriarPerfil')?.addEventListener('click', () => {
        const nome = globalThis.prompt('Nome do novo perfil:');
        if (nome?.trim()) criar(nome.trim());
    });
    document.getElementById('btnExcluirPerfil')?.addEventListener('click', () => {
        const est = EstadoManager.get() as EstadoApp;
        if (globalThis.confirm(`Excluir perfil "${est.perfilAtivo}"?`)) excluir(est.perfilAtivo || 'default');
    });
    document.getElementById('btnExportarPerfil')?.addEventListener('click', () => exportar());
    document.getElementById('btnImportarPerfil')?.addEventListener('click', () => importar());
}
