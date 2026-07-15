# Troubleshooting — FISCAL 5.0

## Verificação rápida

```powershell
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

## Problemas recorrentes

### 1. Suite JS não sobe

- Rodar `npm ci`
- Confirmar versão Node 22.x
- Rodar `npm run test:js`

### 2. Cobertura crítica JS falhando

- Rodar `npm run test:js:coverage`
- Rodar `node scripts/check-js-critical-coverage.mjs`

### 4. E2E local falhando

- Confirmar servidor de fixtures sobe via `playwright.config.js`
- Confirmar browser instalado (`npx playwright install chromium`)
- Consultar artefatos: `reports/playwright-html` e `test-results`
