/**
 * FISCAL 5.0 — Entry Point
 *
 * Este arquivo é o ponto de entrada do build Vite.
 * Importa e inicializa todos os módulos na ordem correta.
 */

// --- Fase 1: Módulos folha ---
import { enableTrustedTypesBypass } from './security/trusted-types.ts';
import { CONFIG } from './config/constants.ts';
import { ACOES_WORKFLOW } from './config/workflow-actions.ts';
import * as misc from './utils/misc.ts';
import * as text from './utils/text.ts';
import * as CooldownManager from './core/cooldown-manager.ts';
import * as AudioManager from './interaction/audio-manager.ts';

// --- Fase 2: Módulos com dependências simples ---
import * as EstadoManager from './core/estado-manager.ts';
import { log } from './core/log-manager.ts';
import * as AspNetLifecycle from './core/aspnet-lifecycle.ts';
import * as domHelpers from './utils/dom-helpers.ts';
import * as selectors from './utils/selectors.ts';
import * as Validador from './validation/validador.ts';

// --- Fase 3: Módulos de negócio ---
import * as ItemMapManager from './data/item-map-manager.ts';
import * as Interacao from './interaction/interacao.ts';
import * as PaginaVerificador from './workflow/pagina-verificador.ts';

// --- Fase 4: Motor de Workflow ---
import * as flowControl from './workflow/handlers/flow-control.ts';
import * as atuarHandler from './workflow/handlers/atuar.ts';
import * as ncmHandlers from './workflow/handlers/ncm.ts';
import * as unspscHandlers from './workflow/handlers/unspsc.ts';
import * as WorkflowExecutor from './workflow/executor.ts';

// --- Fase 5: UI ---
import * as UIManager from './ui/ui-manager.ts';

// ---------------------------------------------------------------------------
// Ativar bypass de Trusted Types antes de qualquer manipulação DOM
enableTrustedTypesBypass();

// Inicializar hooks ASP.NET e interceptor de alertas NCM (Fase 4)
WorkflowExecutor.inicializarHooks();

// Registrar callback de interação no módulo Interacao (Fase 4 → Fase 3)
Interacao.setRegistrarInteracao((acaoId: string) => {
    if (WorkflowExecutor.registrarInteracao) {
        WorkflowExecutor.registrarInteracao(acaoId);
    }
});

// Inicializar UI (Fase 5) — cria painel, atalhos de teclado, retoma execução
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', UIManager.inicializar);
    } else {
        UIManager.inicializar();
    }
    // Inicializar AudioContext na primeira interação do usuário
    document.addEventListener('click', () => AudioManager.inicializar(), { once: true });
}

// Cleanup ao descarregar
if (typeof globalThis !== 'undefined') {
    globalThis.addEventListener('beforeunload', UIManager.limparTudo);
}

console.log('[FISCAL 5.0] Build modular carregado — Fase 5.');
