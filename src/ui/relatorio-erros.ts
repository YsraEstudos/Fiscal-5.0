/**
 * Relatório de erros para diagnóstico e suporte.
 * Extraído do monólito — RelatorioErros (linhas 4508–4574).
 */

import * as EstadoManager from '../core/estado-manager.ts';
import { log } from '../core/log-manager.ts';
import { elementoVisivel } from '../utils/dom-helpers.ts';
import { serializarTrilhaParaRelatorio } from '../workflow/item-trace.ts';
import type { EstadoApp } from '../core/estado-manager.ts';

// ---------------------------------------------------------------------------
export function gerar(contexto: Record<string, any> = {}): string {
    const estado = EstadoManager.get() as EstadoApp;
    return JSON.stringify({
        timestamp: new Date().toISOString(),
        url: globalThis.location.href,
        userAgent: navigator.userAgent,
        estado: {
            ativo: estado.ativo,
            pausado: estado.pausado,
            progresso: estado.progresso,
            perfilAtivo: estado.perfilAtivo,
            itemMap: {
                ativo: estado.itemMapAtivo,
                total: Object.keys(estado.itemMap || {}).length,
                ultimoAplicadoId: estado.itemMapUltimoAplicadoId,
            },
            timers: {
                globalActionDelayMs: estado.globalActionDelayMs,
                clickCooldownMs: estado.clickCooldownMs,
            },
        },
        trilhaExecucao: serializarTrilhaParaRelatorio(estado),
        ultimosLogs: (estado.logs || []).slice(0, 10),
        contexto,
        domSnapshot: {
            title: document.title,
            visibleButtons: [...document.querySelectorAll('button, input[type="button"], input[type="submit"], a')]
                .filter(elementoVisivel)
                .slice(0, 20)
                .map((b) => ({
                    id: b.id,
                    name: (b as HTMLButtonElement | HTMLInputElement | HTMLAnchorElement).name || null,
                    text: ((b.textContent || (b as HTMLInputElement).value || '')).replace(/\s+/g, ' ').trim().slice(0, 60),
                })),
        },
    }, null, 2);
}

export async function copiar(): Promise<void> {
    const estado = EstadoManager.get() as EstadoApp;
    const relatorio = gerar({ ultimoErro: estado.estatisticas?.ultimoErro });

    try {
        await navigator.clipboard.writeText(relatorio);
        log('📋 Relatório copiado para clipboard!', 'info');
        globalThis.alert('Relatório de erro copiado! Cole em um arquivo ou envie ao suporte.');
    } catch {
        mostrarModal(relatorio);
    }
}

export function mostrarModal(relatorio: string): void {
    const modal = document.createElement('div');
    modal.id = 'modal-relatorio';
    modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:9999999;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML = `
        <div style="background:white;padding:20px;border-radius:8px;max-width:700px;width:90vw;max-height:80vh;overflow:auto;">
          <h3>📋 Relatório de Erro</h3>
          <textarea id="txtRelatorio" style="width:100%;height:320px;font-family:monospace;font-size:11px;"></textarea>
          <br><button id="btnFecharModal" style="margin-top:10px;padding:8px 16px;">Fechar</button>
        </div>
    `;
    document.body.appendChild(modal);
    (document.getElementById('txtRelatorio') as HTMLTextAreaElement).value = relatorio;
    document.getElementById('btnFecharModal')?.addEventListener('click', () => modal.remove());
}
