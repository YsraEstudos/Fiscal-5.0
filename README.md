# FISCAL WEB 5.0

Automação modular de fluxo Klassmatt com UserScript (ES6 + Vite) + serviço local opcional para relatório incremental por item (`PDF + MD`), com extração de texto via OCR e dashboard em tempo real.

## Componentes principais

- `dist/FISCAL 5.0.user.js` — **Build final** da automação no navegador.
- `src/` — Código-fonte modular da automação (requer `npm run build`).
- `reporting_service.py` — API local FastAPI (`http://127.0.0.1:8765`). Gera `item_<id>.pdf` e `item_<id>.md` quando o reporting estiver habilitado, extrai texto de mídias (OCR), consolida sessões e oferece dashboard web com SSE.
- `start-reporting-backend.bat` — Script de inicialização rápida do backend.
- `docs/` — Documentação operacional, técnica e changelog.

## Início rápido

### 1. Build do UserScript (Novo!)

O projeto agora é modular. Você precisa compilar antes de usar.

```powershell
npm install
npm run build
```

Isso gera `dist/FISCAL 5.0.user.js`. Instale este arquivo no Tampermonkey.

### 2. Subir Backend (Reporting)

**Opção automática (Windows):**
Execute `start-reporting-backend.bat`.

**Opção manual:**

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-reporting.txt
$env:KM_REPORT_TOKEN="seu-token"
python reporting_service.py
```

### 3. Configurar

No painel do script (Tampermonkey):

- **Gerar relatório PDF/MD**: desativado por padrão
- **Serviço local**: `http://127.0.0.1:8765`
- **Token API**: mesmo valor de `KM_REPORT_TOKEN`
- **Transporte**: `auto` (recomendado)

### 4. Verificar

- `http://127.0.0.1:8765/health` → `ok: true`
- `http://127.0.0.1:8765/` → Dashboard

## Funcionalidades (v5.x Modular)

### UserScript (Modular)

- **UI Operacional**: Drawer lateral recolhível na esquerda, arraste vertical, modo inspeção visual e atalhos (`F7`, `F8`, `ESC`).
- **Workflow**: 14 ações configuráveis, reordenáveis via drag-and-drop.
- **Estimativa de lote**: ETA e horário previsto de término com base no tempo do primeiro item concluído.
- **Robustez**: Retry automático, fallback de transporte (`GM_xhr` → `fetch`), validação de NCM/UNSPSC.
- **UNSPSC**: suporta fluxo antigo por modal e fluxo novo inline, com detecção automática do tipo de tela.
- **Segurança operacional**: pausa imediata quando o item atual indicar reincidência de etapa via `#lblExecucoes` (2x ou mais).
- **Coleta**: Mídia (PDF/Imagem), Histórico (timeline), Detecção de NCM.
- **Perfis**: Gerenciamento completo de configurações (Importar/Exportar).

### Backend (Reporting)

- Geração opcional de PDF/MD com imagens.
- OCR (Tesseract) em background.
- Dashboard Real-time (SSE).
- API REST completa.

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
- **Testes Python**: `npm run test:py`
- **Cobertura Python (gate)**: `npm run test:py:coverage-check`
- **Gate consolidado de cobertura**: `npm run coverage:check`
