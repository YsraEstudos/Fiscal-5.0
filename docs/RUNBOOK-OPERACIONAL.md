# Runbook Operacional — FISCAL 5.0

## 1. Pré-execução

1. Subir backend local:

```powershell
python reporting_service.py
```

2. Validar saúde:

```powershell
Invoke-RestMethod http://127.0.0.1:8765/health
```

3. No painel do userscript, conferir:
- URL do serviço (`http://127.0.0.1:8765`)
- `Token API` alinhado com `KM_REPORT_TOKEN`
- Limites de upload compatíveis
- Drawer expandido (`F7`) para acompanhar logs e ETA

## 2. Diagnóstico rápido

```powershell
npm run test:js
npm run test:py
npm run test:e2e
npm run coverage:check
```

Dashboard local:

```text
http://127.0.0.1:8765/
```

## 3. Recuperação de lote interrompido

1. Corrigir causa raiz (token, serviço, parser, limite, OCR).
2. Não apagar `reports/<sessionRunId>/`.
3. Retomar ciclo.
4. Validar:
- `index.jsonl` íntegro
- `item_<id>.pdf` e `item_<id>.md` existentes para itens já processados

## 4. Falhas comuns

- `SERVICE_UNAVAILABLE`: backend fora, timeout, erro de merge.
- `SERVICE_AUTH_MISSING`/`UNAUTHORIZED`: token divergente.
- `UPLOAD_LIMIT_EXCEEDED`: tamanho/quantidade acima do limite.
- `MEDIA_PARSE_ERROR` / `HISTORICO_PARSE_ERROR`: HTML mudou ou parsing inválido.
- `reincidencia_etapa`: o item exibiu `#lblExecucoes` com 2x ou mais passagens na etapa atual.

## 5. Parada por reincidência de etapa

Sintoma:

- o drawer fica em estado crítico
- o botão principal muda para retomar
- o log registra a mensagem do portal

Ação:

1. Abrir o item pausado.
2. Confirmar o texto de `#lblExecucoes`.
3. Decidir manualmente se o item deve continuar ou sair do lote.
4. Só depois retomar com `F8` ou pelo botão do drawer.

## 6. Gate de release

1. Executar:

```powershell
npm run coverage:check
```

2. Garantir cobertura mínima:
- JS global >=70 (escopo configurado)
- JS crítico >=80 por arquivo crítico
- `reporting_service.py` >=82

3. Executar E2E local:

```powershell
npm run test:e2e
```

## 7. Compatibilidade recomendada

- Python 3.13.x
- Node 22.x
- Playwright Chromium instalado (`npx playwright install chromium`)
