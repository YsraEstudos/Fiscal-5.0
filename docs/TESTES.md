# Testes e Cobertura — FISCAL 5.0

Data do baseline consolidado: **2026-03-04**.

## Comandos oficiais

```powershell
npm run test:js
npm run test:js:coverage
npm run test:py
npm run test:py:coverage
npm run test:py:coverage-check
npm run test:e2e
npm run test:e2e:stress
npm run test:e2e:staging
npm run test:gate:js
npm run test:gate:py
npm run test:gate:local
npm run test:gate:release
npm run test:all
npm run coverage:check
```

## Baseline atual (2026-03-04)

- JS unit/integration (Vitest): **123 testes**, suite verde.
- JS coverage global: **93.15% lines/statements**, **56.64% branches**, **96.64% functions**.
- JS módulos críticos (gate `scripts/check-js-critical-coverage.mjs`):
  - `src/workflow/pagina-verificador.js`: **95.9%**
  - `src/data/item-map-manager.js`: **87.7%**
- E2E local (Playwright + fixtures): **6 cenários**, suite verde.

## Gates ativos

- `npm run test:gate:js`
  - roda `test:js:coverage`
  - roda verificação de arquivos críticos JS
- `npm run test:gate:py`
  - roda `test:py:coverage-check`
- `npm run test:gate:local`
  - roda `test:gate:js`
  - roda `test:gate:py`
  - roda `test:e2e`
- `npm run test:gate:release`
  - roda `test:gate:local`
  - roda `test:e2e:staging`

## Thresholds vigentes

- JS global: lines >=70, statements >=70, functions >=65, branches >=50.
- JS críticos: >=80% por arquivo crítico.

## Regras operacionais vigentes

- O E2E local roda de forma determinística:
  - `workers = 1`
  - `fullyParallel = false`
  - `retries = 0`
- O comando `test:e2e:stress` roda a mesma suite com `repeat-each=5`.
- O comando `test:e2e:staging` exige estas variáveis:
  - `STAGING_BASE_URL`
  - `STAGING_USER`
  - `STAGING_PASSWORD`
  - `STAGING_ITEM_HAPPY`
  - `STAGING_ITEM_REINCIDENCIA`

## Estrutura de testes

- JS unit/integration leve: `tests_js/`
- E2E local por fixtures: `tests_e2e/`
- Gate crítico JS: `scripts/check-js-critical-coverage.mjs`

## Requisitos de ambiente

- Node.js **22.x**
- Para E2E:
  - `npx playwright install chromium`

## Estado desta fase

- Fase 1 do plano está fechada e verde.
- O gate local já pode ser validado com:

```powershell
npm run test:gate:local
```

- O gate de release ficou preparado no `package.json`, mas depende da suite real de staging/homologação e do arquivo `tests_e2e/staging/smoke.spec.js`.
