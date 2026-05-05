# Serviço Local de Relatórios — FISCAL 5.0

**Arquivo:** `reporting_service.py` (FastAPI)
**Versão da API:** `2.0.0`

## Endpoints

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/` | Dashboard web (progresso de extração + preview) |
| `GET` | `/health` | Status do serviço + engines OCR + backends PDF (`pdfBackends`, `ocrCapabilities`, `repairAvailable`) |
| `POST` | `/reports/item` | Upload e geração de relatório (multipart/form-data) |
| `POST` | `/reports/session/touch` | Criar/atualizar sessão + gerar MD consolidado |
| `GET` | `/api/sessions` | Listar sessões com metadados estendidos (status, início/fim, duração, origem) |
| `GET` | `/api/sessions/{id}/items` | Itens de uma sessão com status de extração + `hasMarkdown` |
| `GET` | `/api/sessions/{id}/preview` | Preview renderizado (HTML + TOC) do consolidado da sessão |
| `GET` | `/api/sessions/{id}/md` | Markdown consolidado da sessão (texto plano) |
| `GET` | `/api/sessions/{id}/items/{item}/preview` | Preview renderizado (HTML + TOC) do item selecionado |
| `GET` | `/api/sessions/{id}/items/{item}/md` | Markdown do item (texto plano) |
| `POST` | `/api/items/{session}/{item}/rebuild-md` | Reconstruir MD com texto extraído |
| `DELETE` | `/api/sessions/{id}` | Excluir sessão (hard delete) |
| `POST` | `/api/sessions/delete-bulk` | Excluir múltiplas sessões |
| `GET` | `/api/extraction/events` | SSE para progresso em tempo real |

## Dashboard

Acesse `http://127.0.0.1:8765/` para ver:

- Lista de sessões à esquerda
- Itens com status de extração de texto (pendente/rodando/concluído/erro) no centro
- Preview do markdown à direita (item clicado ou consolidado)
- Índice navegável (TOC) no preview
- Ações de exclusão de sessão (individual e em lote)
- Atualização em tempo real via Server-Sent Events (SSE)

O dashboard é servido diretamente pelo backend (HTML embutido), sem dependências externas.

## Extração de Texto (OCR)

### Pipeline de extração

1. Ao receber um item com mídias (PDF/imagens), o backend salva os arquivos em `media/`
1. Se `ocrEnabled=true` no manifest, uma **background task** assíncrona é disparada
1. PDFs com texto nativo: extração por página (`pypdf`, fallback `PyMuPDF`)
1. PDFs híbridos: combina texto nativo e OCR por página
1. PDFs difíceis: fallback de renderização (`pypdfium2` → `pdf2image`) + OCR (`tesseract`/`paddleocr`)
1. PDFs protegidos: tenta senha vazia e lista de `KM_OCR_PDF_PASSWORDS`
1. PDFs parcialmente corrompidos: tentativa de reparo com `pikepdf` (quando habilitado)
1. Texto extraído salvo como `{arquivo}.extracted.txt` (sidecar) no diretório `media/`
1. Status de cada arquivo registrado em `extraction_status.json`
1. Markdown do item reconstruído automaticamente com seção "Texto Extraído das Mídias"
1. Markdown consolidado da sessão atualizado em seguida
1. Eventos SSE emitidos para cada progresso e conclusão

### Engines suportados

| Engine | Tipo | Instalação |
|---|---|---|
| `pypdf` | Texto nativo de PDF | Incluído em `requirements-reporting.txt` |
| `PyMuPDF` | Fallback de extração nativa por página | Incluído em `requirements-reporting.txt` |
| `tesseract` | OCR (padrão) | Requer instalação separada |
| `paddleocr` | OCR alternativo | Opcional, pip install |
| `pypdfium2` | Renderização preferencial de páginas PDF para OCR | Incluído em `requirements-reporting.txt` |
| `pikepdf` | Reparo/normalização de PDFs | Incluído em `requirements-reporting.txt` |

### Configuração no UserScript

No manifest do item (enviado automaticamente):

- `ocrEnabled`: `true` (padrão) — habilita extração
- `ocrEngine`: `'tesseract'` (padrão) | `'paddleocr'` | `'none'`

### Instalação do Tesseract (Windows)

1. Baixe o instalador: <https://github.com/UB-Mannheim/tesseract/wiki>
1. Instale em `C:\Program Files\Tesseract-OCR`
1. Durante instalação, marque **Additional language data > Portuguese**
1. Adicione ao PATH: `C:\Program Files\Tesseract-OCR`
1. Verifique: `tesseract --version`

### Instalação do Poppler (para pdf2image — PDFs escaneados)

1. Baixe: <https://github.com/oschwartz10612/poppler-windows/releases>
1. Extraia em `C:\poppler` (ou onde preferir)
1. Adicione ao PATH: `C:\poppler\Library\bin`
1. Verifique: `pdftoppm -h`

### PaddleOCR (opcional)

```bash
pip install paddleocr paddlepaddle       # CPU
pip install paddleocr paddlepaddle-gpu   # GPU (NVIDIA + CUDA)
```

PaddleOCR é detectado automaticamente. Se instalado, o backend usa GPU quando disponível.

## Segurança

- Header `X-KM-Token` obrigatório quando `KM_REPORT_TOKEN` estiver configurado.
- Resposta `401` para token ausente/inválido.
- CORS habilitado para todas as origens (uso local).

## Limites

| Variável | Default | Descrição |
|---|---|---|
| `KM_MAX_FILE_SIZE_MB` | `25` | Tamanho máximo por arquivo |
| `KM_MAX_FILES_PER_ITEM` | `20` | Quantidade máxima de arquivos por item |

Excesso retorna `413` com `UPLOAD_LIMIT_EXCEEDED`.

## Variáveis de ambiente

| Variável | Default | Descrição |
|---|---|---|
| `KM_REPORT_TOKEN` | `km-local-token` | Token de autenticação |
| `KM_MAX_FILE_SIZE_MB` | `25` | Limite de tamanho (1–200 MB) |
| `KM_MAX_FILES_PER_ITEM` | `20` | Limite de quantidade (1–200) |
| `KM_REPORTS_DIR` | `./reports` | Diretório de saída |
| `KM_REPORT_RETENTION_DAYS` | `0` (desativado) | Limpeza automática de sessões antigas (0–3650 dias) |
| `KM_OCR_PDF_STRATEGY` | `max_compat` | Estratégia OCR PDF (`legacy` ou `max_compat`) |
| `KM_OCR_PDF_PASSWORDS` | vazio | Lista de senhas (`;` ou `,`) para PDFs protegidos |
| `KM_OCR_PDF_TIMEOUT_SEC` | `120` | Timeout por arquivo PDF |
| `KM_OCR_PDF_MAX_PAGES` | `120` | Máximo de páginas processadas por PDF |
| `KM_OCR_PDF_DPI` | `300` | DPI da renderização de páginas para OCR |
| `KM_OCR_PDF_ENABLE_REPAIR` | `true` | Habilita tentativa de reparo com `pikepdf` |

## Contrato de payload

### `POST /reports/item` (multipart/form-data)

**Campos:**

- `manifest` — JSON string com metadados do item
- `files` — 0..N arquivos binários (mídia)

**Campos mínimos do manifest:**

| Campo | Tipo | Obrigatório | Default |
|---|---|---|---|
| `manifestVersion` | number | recomendado | `1` |
| `itemId` | string | sim | — |
| `sessionRunId` | string | sim | gerado |
| `mediaSummary` | object | sim | `{}` |
| `historicoSummary` | object | sim | `{}` |
| `historicoTimeline` | array | sim | `[]` |
| `ocrEnabled` | boolean | não | `true` |
| `ocrEngine` | string | não | `tesseract` |

### `POST /reports/session/touch` (JSON)

| Campo | Tipo | Descrição |
|---|---|---|
| `sessionRunId` | string | Identificador da sessão |
| `projectName` | string | Nome do projeto |
| `reason` | string | Motivo do touch (ex: `manual-stop`) |
| `itemRef` | string | Referência do item atual |

## Saída por item

Em `reports/<sessionRunId>/item_<itemId>/`:

| Arquivo | Descrição |
|---|---|
| `item_<itemId>.pdf` | PDF consolidado (metadados + imagens + PDFs) |
| `item_<itemId>.md` | Markdown detalhado do item |
| `extraction_status.json` | Status por arquivo com metadados de pipeline (`pipeline`, `backendChain`, `errorCode`, `durationMs`, etc.) |
| `media/*.extracted.txt` | Texto extraído de cada mídia |

Na raiz da sessão:

| Arquivo | Descrição |
|---|---|
| `index.jsonl` | Índice incremental (1 linha JSON por item, com lock) |
| `session_meta.json` | Metadados da sessão (projeto, timestamps) |
| `session_<sessionRunId>.md` | Markdown consolidado de todos os itens |

## Dependências Python

```
fastapi>=0.116.0
uvicorn[standard]>=0.35.0
python-multipart>=0.0.20
reportlab>=4.4.0
pypdf>=5.9.0
Pillow>=11.3.0
pytesseract>=0.3.13
pdf2image>=1.17.0
sse-starlette>=2.0.0
Markdown>=3.7
bleach>=6.1.0
```

Opcionais: `paddleocr`, `paddlepaddle` (ou `paddlepaddle-gpu`).
