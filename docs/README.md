# Documentação — FISCAL WEB 5.0

Este diretório centraliza a documentação operacional e técnica do projeto FISCAL 5.0 (Modular).

## Índice

### Operação

- `OPERACAO-RAPIDA.md` — **INÍCIO RÁPIDO**: Como instalar dependências, compilar o build e rodar.
- `RUNBOOK-OPERACIONAL.md` — Procedimentos de pré-execução, recuperação, diagnóstico e release.

### Configuração

- `CONFIGURACAO-USERSCRIPT.md` — Drawer lateral, ETA do lote, ações de workflow, mapa JSON por item e perfis.

### Testes e qualidade

- `TESTES.md` — Como rodar testes JS e E2E, fixtures manuais e validação de sintaxe.

### Referência

- `PROJECT-STRUCTURE.md` — Mapa de pastas (`src/`, `dist/`, etc) e arquivos do projeto.
- `CHANGELOG.md` — Histórico de versões e mudanças.
- `TROUBLESHOOTING.md` — Matriz de erros e procedimentos de diagnóstico rápido.

### Domínio e Contexto

- `guia_navegacao_klassmatt.md` — Passo-a-passo de login e navegação no portal Klassmatt (Rodonaves).

### Legado

- `legacy/relatorio-html-site-ultracompleto.md` — Relatório HTML detalhado do site (referência).

## Fluxo recomendado

1. Ler `OPERACAO-RAPIDA.md` (Build & Instalação).
2. Rodar checklist em `RUNBOOK-OPERACIONAL.md`.
3. Configurar painel via `CONFIGURACAO-USERSCRIPT.md`.
4. Rodar regressão de `TESTES.md` antes de atualizar em produção.
