import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const REPLACEMENTS = [
    ['config/constants.js', 'config/constants.ts'],
    ['config/workflow-actions.js', 'config/workflow-actions.ts'],
    ['security/trusted-types.js', 'security/trusted-types.ts'],
    ['validation/validador.js', 'validation/validador.ts'],
    ['utils/selectors.js', 'utils/selectors.ts'],
    ['core/cooldown-manager.js', 'core/cooldown-manager.ts'],
    ['core/aspnet-lifecycle.js', 'core/aspnet-lifecycle.ts'],
    ['core/log-manager.js', 'core/log-manager.ts'],
    ['core/estado-manager.js', 'core/estado-manager.ts'],
    ['interaction/audio-manager.js', 'interaction/audio-manager.ts'],
    ['interaction/interacao.js', 'interaction/interacao.ts'],
    ['data/item-map-manager.js', 'data/item-map-manager.ts'],
    ['workflow/item-trace.js', 'workflow/item-trace.ts'],
    ['workflow/pagina-verificador.js', 'workflow/pagina-verificador.ts'],
    ['workflow/estimativa.js', 'workflow/estimativa.ts'],
    ['workflow/executor.js', 'workflow/executor.ts'],
    ['workflow/handlers/flow-control.js', 'workflow/handlers/flow-control.ts'],
    ['workflow/handlers/atuar.js', 'workflow/handlers/atuar.ts'],
    ['workflow/handlers/unspsc.js', 'workflow/handlers/unspsc.ts'],
    ['workflow/handlers/ncm.js', 'workflow/handlers/ncm.ts'],
    ['ui/inspecao-manager.js', 'ui/inspecao-manager.ts'],
    ['ui/painel-builder.js', 'ui/painel-builder.ts'],
    ['ui/painel-events.js', 'ui/painel-events.ts'],
    ['ui/perfil-manager.js', 'ui/perfil-manager.ts'],
    ['ui/ui-manager.js', 'ui/ui-manager.ts'],
];

function processFile(filePath) {
    let content = readFileSync(filePath, 'utf8');
    let changed = false;
    for (const [from, to] of REPLACEMENTS) {
        if (content.includes(from)) {
            // Use simple string split+join to avoid any regex escaping issues
            content = content.split(from).join(to);
            changed = true;
        }
    }
    if (changed) {
        writeFileSync(filePath, content);
        console.log('Updated:', filePath);
    }
}

function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== 'node_modules') {
            walk(full);
        } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.ts'))) {
            processFile(full);
        }
    }
}

walk('src');
walk('tests_js');
console.log('Done!');
