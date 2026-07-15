# FISCAL WEB 5.0

Automação modular do fluxo Klassmatt com UserScript (ES6 + Vite), painel operacional e workflow configurável.

## Componentes principais

- `dist/FISCAL 5.0.user.js` — **Build final** da automação no navegador.
- `src/` — Código-fonte modular da automação (requer `npm run build`).
- `docs/` — Documentação operacional, técnica e changelog.

## Início rápido

### 1. Build do UserScript (Novo!)

O projeto agora é modular. Você precisa compilar antes de usar.

```powershell
npm install
npm run build
```

Isso gera `dist/FISCAL 5.0.user.js`. Instale este arquivo no Tampermonkey.

### 2. Configurar

No painel do script, ajuste as ações do workflow, o modo de simulação, os atrasos e os perfis conforme o ambiente.

### 3. Verificar

Abra a fila de itens no Klassmatt e confirme no painel se o ciclo inicia, processa os itens elegíveis e pausa em reincidências quando configurado.

## Funcionalidades (v5.x Modular)

### UserScript (Modular)

- **UI Operacional**: Drawer lateral recolhível na esquerda, arraste vertical, modo inspeção visual e atalhos (`F7`, `F8`, `ESC`).
- **Workflow**: 13 ações configuráveis, reordenáveis via drag-and-drop.
- **Estimativa de lote**: ETA e horário previsto de término com base no tempo do primeiro item concluído.
- **Robustez**: Retry automático, fallback de transporte (`GM_xhr` → `fetch`), validação de NCM/UNSPSC.
- **UNSPSC**: suporta fluxo antigo por modal e fluxo novo inline, com detecção automática do tipo de tela.
- **Segurança operacional**: pausa imediata quando o item atual indicar reincidência de etapa via `#lblExecucoes` (2x ou mais).
- **Perfis**: Gerenciamento completo de configurações (Importar/Exportar).


## Documentação (`docs/`)

| Arquivo | Conteúdo |
|---|---|
| `docs/README.md` | Índice central |
| `docs/OPERACAO-RAPIDA.md` | Guia "Como Buildar e Rodar" |
| `docs/PROJECT-STRUCTURE.md` | Mapa de pastas (`src/`, `dist/`, etc) |
| `docs/RUNBOOK-OPERACIONAL.md` | Procedimentos de recuperação |
| `docs/CONFIGURACAO-USERSCRIPT.md` | Detalhes avançados de configuração |

## Manutenção

- **Build**: `npm run build`
- **Testes JS**: `npm run test:js`
- **Cobertura JS**: `npm run test:js:coverage`
- **Gate consolidado de cobertura**: `npm run coverage:check`
