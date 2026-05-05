# Relatório de Diagnóstico e Resolução: Coleta de Mídia e OCR

**Data:** 18/02/2026
**Contexto:** Projetos Rodonaves e Citrosuco (Klassmatt)
**Arquivos Afetados:** `coletor-midia.js`, `midia-parser.js`, `start-reporting-backend.bat`

---

## 1. O Problema Declarado (User Report)

O usuário reportou múltiplos cenários de falha na extração de dados de PDFs anexados aos itens:

1. **"TINHA PDF E O SISTEMA NAO ACHOU"**: Links diretos para galerias com PDFs mostravam que o arquivo existia, mas o robô relatava "0 PDFs" ou apenas baixava tabelas Excel irrelevantes.
2. **"4 MINUTOS DPS E NADA FOI EXPORTADO DO PDF"**: Mesmo quando o PDF era baixado (em alguns casos), o texto não aparecia no relatório final (Markdown).
3. **"6 MINUTOS DPS, ATE AGORA NADA"**: Lentidão e ausência de feedback sobre o processamento do OCR.

**Cenário Crítico (Citrosuco Item 240793/323562):**
O item tinha uma aba "PDF" (oculta por padrão, exigindo clique) contendo o arquivo técnico. O script falhava em "virar a página" e, quando tentava, buscava na galeria errada.

---

## 2. Cronologia da Investigação e Soluções (O que funcionou e o que falhou)

### Fase 1: O Mistério do OCR (Backend)

**Sintoma:** PDFs eram baixados (no caso do item 196911), mas o relatório `.md` permanecia sem a seção "Texto Extraído" após minutos.

* **Diagnóstico:** O backend Python usa bibliotecas wrapper (`pytesseract` e `pdf2image`) que dependem de executáveis instalados no Windows. Logs mostraram que o sistema não encontrava `tesseract.exe` nem `pdftoppm.exe` (Poppler).
* **Tentativa 1 (Falha):** Edição do `.bat` com blocos `if (...)` multi-linha para adicionar ao PATH.
  * *Resultado:* **ERRO DE SINTAXE**. O prompt do Windows interpretou mal a expansão de variáveis dentro do bloco, quebrando o script de inicialização.
* **Solução Definitiva:** Correção do `start-reporting-backend.bat` usando sintaxe de linha única (`if exist ... set ...`), adicionando robustamente:
  * `C:\Program Files\Tesseract-OCR`
  * `C:\Program Files\Calibre2\app\bin` (onde encontramos uma versão funcional do Poppler).

### Fase 2: Arquivos "Invisíveis" (Frontend)

**Sintoma:** No item Citrosuco, o PDF não vinha. O sistema reportava "unsupported: 2".

* **Diagnóstico:** O parser de mídia era estrito demais. Só aceitava arquivos se o título contivesse "PDF", "Foto" ou "Imagem". Arquivos com títulos genéricos ou sem extensão clara na URL (ex: `.ashx?file=...`) eram descartados.
* **Ação (Sucesso Parcial):** Atualização do `midia-parser.js` e `coletor-midia.js`.
  * Criação do tipo genérico `file` para aceitar `.xlsx`, `.docx`, `.zip` e extensões desconhecidas.
  * *Resultado:* O sistema passou a baixar as tabelas Excel (`unsupported` -> `file`), mas o PDF principal continuava ausente.

### Fase 3: O Clique na Aba "PDF" (Falha de Protocolo)

**Sintoma:** O PDF estava numa aba separada ("PDF"). O script tentava simular o clique (`__doPostBack`), mas a página recarregava voltando para a aba inicial ("Arquivos").

* **Diagnóstico:** O script estava enviando os dados do PostBack como `FormData` (multipart/form-data). O servidor legado do Klassmatt (ASP.NET WebForms) espera o formato clássico de formulário (`application/x-www-form-urlencoded`) e ignorava nosso payload multipart.
* **Solução (Sucesso Técnico):** Alteração no `coletor-midia.js` para usar `URLSearchParams` ao invés de `FormData`.
  * *Resultado:* O protocolo HTTP ficou correto, mas... o PDF **ainda** não aparecia no item 323562.

### Fase 4: O Pulo do Gato (Contexto SIN vs Item)

**Sintoma:** Mesmo com tudo consertado, o script entrava na página de mídia e via "0 PDFs". Link manual funcionava.

* **Análise Profunda:**
  * Link manual funcional: `Midia.aspx?...id=240793...` (ID da **Solicitação/SIN**).
  * Link que o script gerava: `Midia.aspx?...id=323562...` (ID do **Item**).
* **A Descoberta:** Quando um item está sendo criado ou alterado via fluxo de Solicitação (SIN), os anexos ficam vinculados à **SIN**, não ao Item final. O script estava buscando na "gaveta" errada (a do Item, que estava vazia), enquanto o PDF estava na "gaveta" da Solicitação.
* **Solução (Definitiva):** Lógica inteligente no `coletor-midia.js`:
  * Se a URL da página atual indicar contexto de SIN (ex: `ITEM_Edita.aspx?...IdSIN=...`), o script **captura o `IdSIN`** da URL e o utiliza para montar o link da mídia, ignorando o ID do item.

---

## 3. Resumo Técnico das Alterações

### `src/reporting/midia-parser.js`

- **Tipagem Flexível:** Introduzido tipo `file` para capturar tudo que não for explicitamente proibido.
* **Robustez:** Extração de `ViewState` agora tenta buscar por `name=` se o `id=` falhar.

### `src/reporting/coletor-midia.js`

- **Protocolo de Rede:** PostBacks migrados de `FormData` para `URLSearchParams`.
* **Log:** Adicionados logs detalhados da resposta do PostBack para diagnóstico.
* **Lógica de Negócio (FIX FINAL):** Detecção de contexto SIN prioriza `IdSIN` sobre `IdItem` na construção da URL de mídia.

### `start-reporting-backend.bat`

- **Ambiente:** Adição automática de dependências (Tesseract/Calibre) ao `PATH` em tempo de execução.

---

## 4. Status Atual

O sistema agora está capaz de:

1. Navegar por todas as abas de mídia (simulando cliques corretamente).
2. Identificar a galeria correta (Solicitação vs Item).
3. Baixar qualquer tipo de arquivo anexado.
4. Executar OCR corretamente no backend (com as dependências no path).

---
---

# Histórico Anterior (Backup)

# Changelog — FISCAL WEB

## v5.6.0 — OCR PDF Max-Compat + rastreabilidade avançada

### Serviço local (`reporting_service.py`)

* Pipeline OCR de PDF evoluído para estratégia robusta (`max_compat`) com etapas explícitas:
  * preflight por conteúdo (`%PDF-`)
  * tentativa de abertura com senhas (`KM_OCR_PDF_PASSWORDS`)
  * reparo best-effort com `pikepdf` (quando disponível)
  * extração nativa por página (`pypdf` + fallback `PyMuPDF`)
  * renderização para OCR com prioridade `pypdfium2` e fallback `pdf2image`
  * OCR por página com fallback `tesseract`/`paddleocr`
* Novos metadados aditivos em `extraction_status.json` por arquivo:
  * `pipeline`, `backendChain`, `encrypted`, `passwordSource`, `repaired`
  * `renderBackend`, `ocrBackend`, `durationMs`, `errorCode`, `errorDetail`
* Timeout por arquivo (`KM_OCR_PDF_TIMEOUT_SEC`) com erro classificado `PDF_TIMEOUT`.
* `GET /health` ampliado com:
  * `pdfBackends`
  * `ocrCapabilities`
  * `repairAvailable`
* `POST /reports/item` ampliado com campos aditivos:
  * `extractionProfileUsed`
  * `extractionWarnings`
* SSE enriquecido com `phase` e `errorCode` mantendo compatibilidade de campos existentes.

### Parser de mídia (UserScript)

* Correção de classificação para handlers `GetTempFile.ashx?file=...pdf`:
  * agora o parser prioriza extensão do `file=` sobre a extensão `.ashx`,
  * eliminando falso `unsupported` em links de PDF via handler.

### Dependências e documentação

* `requirements-reporting.txt` atualizado com:
  * `PyMuPDF`, `pikepdf`, `pypdfium2` (e `opencv-python-headless` opcional comentado).
* Documentação atualizada:
  * `docs/SERVICO-LOCAL.md`
  * `docs/TROUBLESHOOTING.md`

### Testes

* Cobertura Python expandida para novo contrato OCR/health/status.
* Teste JS adicionado para garantir classificação correta de PDF via `.ashx?file=...pdf`.

## v5.5.1 — Sincronização de documentação de testes

### Documentação

* `README.md` atualizado com comandos oficiais de testes e cobertura (`test:js`, `test:py`, `coverage:check`).
* `docs/PROJECT-STRUCTURE.md` atualizado para refletir stack atual de testes (`Vitest + jsdom` e `tests_e2e/` com Playwright).
* `docs/README.md` ajustado para evitar referência fixa de versão no índice.
* `docs/SERVICO-LOCAL.md` ajustado para remover contagem estática de linhas do backend.

## v4.0.0 — Rebranding para FISCAL 4.0

### Geral

* Renomeado projeto para FISCAL 4.0.
* Script principal renomeado para `FISCAL 4.0.user.js` (anteriormente `km-ayoshii-fiscal-report.user.js`).
* Metadata do UserScript atualizada (`@name`, `@version`, `@description`).
* Toda documentação reescrita e ampliada para refletir a versão atual.

### Documentação reescrita

* `README.md` — Visão geral completa com funcionalidades, variáveis de ambiente e início rápido.
* `docs/README.md` — Índice central categorizado (Operação, Configuração, Testes, Referência, Domínio).
* `docs/PROJECT-STRUCTURE.md` — Mapa detalhado de todos os arquivos com tamanhos e contagens.
* `docs/CONFIGURACAO-USERSCRIPT.md` — Tabelas de ações, parâmetros, transporte, seletor robusto e perfis.
* `docs/SERVICO-LOCAL.md` — Endpoints, pipeline OCR, contratos de payload e estrutura de saída.
* `docs/TESTES.md` — Cobertura por teste individual (Python e JS).
* `docs/RUNBOOK-OPERACIONAL.md` — Cenários de OCR, compatibilidade mínima e critério de rollback.
* `docs/TROUBLESHOOTING.md` — Cenários de diagnóstico expandidos (OCR, dashboard, parser de mídia/histórico).
* `docs/CHANGELOG.md` — Este arquivo.

## v5.4.1 — Hardening e Organização

### UserScript

* `SCHEMA_VERSION` atualizado para `7`.
* Adicionados campos de reporting por perfil:
  * `apiToken`
  * `transport`
  * `maxFileSizeMb`
  * `maxFilesPerItem`
* Adicionada opção `clickMediaTabBeforeCollect` no Reporting (padrão `false`) para controlar clique na aba Mídias antes da coleta.
* Transporte resiliente com fallback (`gm_xhr` → `fetch`) e retry exponencial.
* Timeout/retry para coleta de HTML/binário.
* Parser de mídia mais restrito e erros tipados.
* `manifestVersion: 2` no envio do item.
* Bloqueio ampliado para erros críticos de coleta.

### Serviço local

* Autenticação por `X-KM-Token`.
* Limites de upload por tamanho/quantidade.
* Upload em streaming (chunks).
* Lock de arquivo para `index.jsonl`.
* `GET /health` com metadados de limite e auth.
* Limpeza de artefatos temporários de PDF base.
* Dashboard web com SSE para acompanhamento em tempo real.
* API REST para sessões, itens, extração e rebuild de markdown.
* Extração de texto via OCR (Tesseract/PaddleOCR) em background assíncrono.

### Qualidade

* Testes Python e JS com fixtures.
* Cenário incremental parcial automatizado.
* Documentação centralizada em `docs/`.

## v5.5.0 — Refatoração Modular (Fase 1-5)

### Arquitetura

* **Modularização ES6**: Monólito de user script dividido em 38 módulos (`src/`).
* **Build System**: Implementado **Vite** + `vite-plugin-monkey` para bundling.
* **Estrutura**: Separação clara de responsabilidades:
  * `src/core/`: Estado, Log, Lifecycle.
  * `src/data/`: ItemMap.
  * `src/ui/`: Painel, Perfis, Inspeção.
  * `src/workflow/`: Motor de execução e handlers.
  * `src/reporting/`: Coleta, parse e envio.

### UI / UX

* **Painel Responsivo**: Largura adaptável (`clamp`) e altura máxima com scroll interno.
* **Mobile-friendly**: Inicia minimizado em telas pequenas (< 400px).
* **Performance**: Renderização otimizada e cleanup de eventos (`AbortController`).

### Desenvolvedor

* `npm run build`: Comando único para gerar o `dist/FISCAL 5.0.user.js` final.
* `src/main.js`: Ponto de entrada limpo e organizado.
