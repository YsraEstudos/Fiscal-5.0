# Troubleshooting — FISCAL 5.0

## Verificação rápida

```powershell
Invoke-RestMethod http://127.0.0.1:8765/health
npm run test:all
npm run coverage:check
```

Se E2E falhar por browser ausente:

```powershell
npx playwright install chromium
```

## Matriz de erro

| Código | Causa provável | Ação |
|---|---|---|
| `SERVICE_UNAVAILABLE` | backend fora, timeout, erro de geração | validar serviço e logs de `reporting_service.py` |
| `SERVICE_AUTH_MISSING` / `UNAUTHORIZED` | token ausente/inválido | alinhar `KM_REPORT_TOKEN` e `Token API` |
| `UPLOAD_LIMIT_EXCEEDED` | arquivo grande ou quantidade excedida | reduzir coleta ou elevar limites |
| `MEDIA_PARSE_ERROR` | HTML de mídia mudou | validar `tests_js/fixtures/midia_*.html` |
| `HISTORICO_PARSE_ERROR` | HTML de histórico mudou | validar `tests_js/fixtures/historico_*.html` |
| `409 busy` (delete sessão) | sessão com task OCR ainda ativa | aguardar conclusão da extração e tentar excluir novamente |
| `PDF_INVALID` | arquivo não parece PDF válido (`%PDF-`) | validar origem/URL e download do arquivo |
| `PDF_PREFLIGHT_FAILED` | backend não conseguiu abrir/ler estrutura PDF | tentar com `KM_OCR_PDF_ENABLE_REPAIR=1` |
| `PDF_ENCRYPTED_UNREADABLE` | PDF com senha não disponível | configurar `KM_OCR_PDF_PASSWORDS` |
| `PDF_RENDER_FAILED` | falha ao renderizar páginas para OCR | validar Poppler (`pdf2image`) e/ou `pypdfium2` |
| `PDF_TIMEOUT` | processamento excedeu timeout | aumentar `KM_OCR_PDF_TIMEOUT_SEC` |
| `OCR_EMPTY_RESULT` | pipeline concluiu sem texto | revisar qualidade do arquivo e DPI (`KM_OCR_PDF_DPI`) |

## Problemas recorrentes

### 1. Suite JS não sobe

- Rodar `npm ci`
- Confirmar versão Node 22.x
- Rodar `npm run test:js`

### 2. Cobertura crítica JS falhando

- Rodar `npm run test:js:coverage`
- Rodar `node scripts/check-js-critical-coverage.mjs`
- Verificar os 6 arquivos críticos em `reports/coverage/js`

### 3. Cobertura Python abaixo do gate

- Rodar `npm run test:py:coverage-check`
- Focar linhas faltantes em `reporting_service.py` reportadas pelo coverage

### 4. E2E local falhando

- Confirmar servidor de fixtures sobe via `playwright.config.js`
- Confirmar browser instalado (`npx playwright install chromium`)
- Consultar artefatos: `reports/playwright-html` e `test-results`

### 5. Preview do dashboard não renderiza índice

- Validar `GET /api/sessions/{id}/preview` retorna `toc` com itens.
- Validar que o markdown da sessão existe (`/api/sessions/{id}/md`).
- Se o HTML vier sem headings, revisar o conteúdo do `.md` (sem `#`/`##` não há TOC).

### 6. PDF ficou como erro sem texto extraído

- Verificar `extraction_status.json` do item e conferir `errorCode`, `errorDetail`, `backendChain`.
- Confirmar engines no `/health`: `pdfBackends` e `ocrCapabilities`.
- Para PDF protegido, definir `KM_OCR_PDF_PASSWORDS`.
- Para timeout, elevar `KM_OCR_PDF_TIMEOUT_SEC`.
- Para PDF escaneado ruim, aumentar `KM_OCR_PDF_DPI`.
