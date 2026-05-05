# Documentação — FISCAL WEB 5.0

Este diretório centraliza a documentação operacional e técnica do projeto FISCAL 5.0 (Modular).

## Índice

### Operação

- `OPERACAO-RAPIDA.md` — **INÍCIO RÁPIDO**: Como instalar dependências, compilar o build e rodar.
- `RUNBOOK-OPERACIONAL.md` — Procedimentos de pré-execução, recuperação, diagnóstico e release.

### Configuração

- `CONFIGURACAO-USERSCRIPT.md` — Drawer lateral, ETA do lote, ações de workflow, bloco Reporting, mapa JSON por item e perfis.
- `SERVICO-LOCAL.md` — API local (endpoints, OCR, segurança, limites, variáveis de ambiente).

### Testes e qualidade

- `TESTES.md` — Como rodar testes Python e JS, fixtures manuais e validação de sintaxe.

### Referência

- `PROJECT-STRUCTURE.md` — Mapa de pastas (`src/`, `dist/`, etc) e arquivos do projeto.
- `CHANGELOG.md` — Histórico de versões e mudanças.
- `TROUBLESHOOTING.md` — Matriz de erros e procedimentos de diagnóstico rápido.

### Domínio e Contexto

- `guia_navegacao_klassmatt.md` — Passo-a-passo de login e navegação no portal Klassmatt (Rodonaves).
- `media_process_map.md` — Mapeamento detalhado do processo de mídia e histórico no Klassmatt, com auditoria do script.

### Legado

- `legacy/README-reporting-service.md` — Documentação antiga do serviço de relatórios.
- `legacy/TROUBLESHOOTING-REPORTING.md` — Troubleshooting antigo do serviço.
- `legacy/relatorio-html-site-ultracompleto.md` — Relatório HTML detalhado do site (referência).

## Fluxo recomendado

1. Ler `OPERACAO-RAPIDA.md` (Build & Instalação).
2. Rodar checklist em `RUNBOOK-OPERACIONAL.md`.
3. Validar `SERVICO-LOCAL.md` (token, limites e OCR).
4. Configurar painel via `CONFIGURACAO-USERSCRIPT.md`.
5. Rodar regressão de `TESTES.md` antes de atualizar em produção.
