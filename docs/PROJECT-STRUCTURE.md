# Estrutura do Projeto — FISCAL 5.0

## Raiz

| Arquivo/Pasta | Descrição |
|---|---|
| `FISCAL 5.0.user.js` | **(LEGADO/DEV)** Versão antiga ou link simbólico (não editar diretamente). |
| `dist/FISCAL 5.0.user.js` | **Build Final**. Este é o arquivo a ser instalado no Tampermonkey. |
| `src/` | Código-fonte modular (ES6). **Edite aqui.** |
| `reporting_service.py` | API local FastAPI de geração de relatórios e OCR. |
| `package.json` | Dependências Node.js e scripts de build (`npm run build`). |
| `vite.config.js` | Configuração do Vite + plugin Monkey. |
| `docs/` | Documentação do projeto. |

## Código-fonte (`src/`)

A automação agora é modular. O build (`npm run build`) agrupa tudo em um único arquivo.

| Pasta | Conteúdo |
|---|---|
| `src/main.js` | **Entry Point**. Importa e inicializa todos os módulos. |
| `src/config/` | Constantes (`constants.js`) e ações (`workflow-actions.js`). |
| `src/core/` | Gerenciadores de estado, log, lifecycle ASP.NET. |
| `src/data/` | Gerenciamento de dados (ItemMap). |
| `src/interaction/` | Interação com DOM (cliques, inputs) e áudio. |
| `src/reporting/` | Coleta de dados, parsers (mídia/histórico) e envio p/ API. |
| `src/security/` | Bypass de Trusted Types. |
| `src/ui/` | Drawer lateral, perfis, inspeção, logs, ETA e controle visual do robô. |
| `src/utils/` | Helpers genéricos (DOM, texto, seletores). |
| `src/validation/` | Regras de validação de input (NCM, UNSPSC). |
| `src/workflow/` | Motor de execução (`executor.js`), ETA do lote (`estimativa.js`), verificações de página e handlers de ação. |

## Documentação (`docs/`)

| Arquivo | Conteúdo |
|---|---|
| `README.md` | Índice central. |
| `OPERACAO-RAPIDA.md` | Checklist: Build, Instalação e Execução. |
| `RUNBOOK-OPERACIONAL.md` | Procedimentos de recuperação e diagnóstico. |
| `CONFIGURACAO-USERSCRIPT.md` | Detalhes de perfis, ações e parâmetros. |
| `SERVICO-LOCAL.md` | API local, OCR e endpoints. |
| `TESTES.md` | Como rodar testes (Python/JS) e verificar o build. |
| `PROJECT-STRUCTURE.md` | Este arquivo. |

## Testes (`tests_py/`, `tests_js/` e `tests_e2e/`)

| Arquivo | Conteúdo |
|---|---|
| `tests_py/` | Testes unitários do backend Python (`reporting_service.py`). |
| `tests_js/` | Testes unitários/integration leve de módulos reais em `src/` (Vitest + jsdom). |
| `tests_e2e/` | Testes E2E locais com Playwright e servidor de fixtures (sem portal real). |
| `fixtures/` | HTMLs de referência para testes. |

## Artefatos gerados (gitignored)

- `dist/` — Resultado do build (UserScript final).
- `node_modules/` — Dependências Node.js.
- `reports/` — Relatórios gerados por sessão.
- `.venv/` — Ambiente virtual Python.
