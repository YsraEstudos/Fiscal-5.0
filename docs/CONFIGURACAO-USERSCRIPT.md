# Configuração do UserScript — FISCAL 5.0

## Drawer lateral

O painel do userscript agora funciona como um drawer lateral fixado à esquerda.

- Recolhido: mostra apenas a aba compacta do robô.
- Expandido: abre todas as opções do workflow e de operação.
- Seções internas: cada bloco do drawer pode ser aberto/fechado individualmente.
- Persistência de UI: estado das seções e scroll interno do drawer são mantidos após recarga.
- Arraste: o header permite reposicionamento vertical.
- Atalhos:
  - `F7` abre/fecha o drawer
  - `F8` pausa/retoma o ciclo
  - `ESC` ativa o kill switch

## Resumo de execução e ETA

No topo do drawer existe um cartão de resumo do lote com:

- item atual
- total planejado
- quantidade concluída
- tempo do primeiro item
- tempo base de referência
- ETA restante
- horário previsto de término

Regras da ETA:

- Se o JSON por item estiver ativo, o total do lote vem de `Object.keys(itemMap).length`.
- Caso contrário, o total inicial vem da fila detectada em tela.
- O tempo-base é fixado pelo primeiro item concluído.
- Antes da primeira conclusão, a UI mostra `Medindo 1º item...`.

## Paradas automáticas

Além das validações de NCM/NBS, o robô agora pausa automaticamente quando o item aberto exibir `#lblExecucoes` indicando que a SIN já passou 2 vezes ou mais pela etapa atual.

- Origem: `#lblExecucoes`
- Regra: contagem `>= 2`
- Efeito: pausa imediata do ciclo, sem continuar para coleta, relatório ou `Prosseguir`
- Exibição: o cartão superior do drawer muda para estado crítico

## UNSPSC

O fluxo de UNSPSC agora cobre dois formatos de tela:

- **Fluxo antigo**: abre a lupa, pesquisa, seleciona o resultado e confirma.
- **Fluxo novo inline**: usa o campo `#txtCodUNSPSC`, dispara `__doPostBack`, valida o readonly `#txtUNSPSC` e só libera o próximo passo quando a tela confirma a classificação.

Regras práticas:

- O modo é detectado automaticamente pela presença dos elementos da tela.
- O fluxo antigo continua funcionando sem mudança de comportamento.
- Se o inline não confirmar o valor após postback e fallback, o robô pausa o item em vez de seguir para `Prosseguir`.

## Ações de workflow

Ordem padrão (15 ações):

| # | ID | Nome | Tipo |
|---|---|---|---|
| 1 | `atuar` | Atuar no Item | click |
| 2 | `abaFiscal` | Aba Fiscal | click |
| 3 | `ncm` | NCM | input |
| 4 | `lei116Servico` | Lei 116 (Serviço) | custom |
| 5 | `abaClassificacao` | Aba Classificação | click |
| 6 | `lupaUnspsc` | Lupa UNSPSC | click |
| 7 | `unspsc` | UNSPSC | input |
| 8 | `pesquisar` | Pesquisar | click |
| 9 | `resultado` | Resultado | click |
| 10 | `selecionar` | Selecionar | click |
| 11 | `coletarMidia` | Coletar Mídia | custom |
| 12 | `coletarAcompanhamento` | Coletar Acompanhamento | custom |
| 13 | `gerarRelatorioItem` | Gerar Relatório Item | custom |
| 14 | `prosseguir` | Prosseguir | click |
| 15 | `confirmar` | Confirmar (Sim) | click |

Todas as ações podem ser habilitadas/desabilitadas individualmente e reordenadas via drag-and-drop no painel.

## Bloco Reporting (por perfil)

| Parâmetro | Tipo | Default | Descrição |
|---|---|---|---|
| `enabledMedia` | boolean | `false` | Habilita coleta de mídia |
| `clickMediaTabBeforeCollect` | boolean | `false` | Clica na aba Mídias antes da coleta |
| `enabledAcompanhamento` | boolean | `false` | Habilita coleta de histórico |
| `enabledReport` | boolean | `false` | Habilita geração de relatório PDF/MD |
| `blockOnReportError` | boolean | `false` | Pausa o ciclo em erro crítico |
| `serviceUrl` | string | `http://127.0.0.1:8765` | URL da API local |
| `apiToken` | string | `""` | Enviado no header `X-KM-Token` |
| `transport` | string | `auto` | `auto` / `gm_xhr` / `fetch` |
| `maxFileSizeMb` | number | `25` | Limite local para anexos (MB) |
| `maxFilesPerItem` | number | `20` | Quantidade máxima de anexos por item |
| `sessionRunId` | string | (gerado) | Gerado automaticamente ao iniciar ciclo |

## Defaults e limites (cliente × servidor)

| Parâmetro | UserScript (cliente) | Serviço local (servidor) | Observação |
|---|---|---|---|
| `serviceUrl` | `http://127.0.0.1:8765` | n/a | Base da API local |
| `transport` | `auto` | n/a | `auto` tenta `gm_xhr`, depois `fetch` |
| `SERVICE_TIMEOUT_MS` | `120000` ms | n/a | Timeout do POST `/reports/item` |
| `FETCH_TIMEOUT_MS` | `30000` ms | n/a | Timeout por download HTML/binário |
| `RETRY_ATTEMPTS` | `3` | n/a | Retry em transporte e coletas |
| `maxFileSizeMb` | `25` | `KM_MAX_FILE_SIZE_MB` (default `25`) | Vale o mais restritivo |
| `maxFilesPerItem` | `20` | `KM_MAX_FILES_PER_ITEM` (default `20`) | Vale o mais restritivo |

## Fluxo de transporte (`transport`)

- **`auto`**: ordem `gm_xhr` → `fetch` com retry exponencial + jitter.
- **`gm_xhr`**: prioriza `GM_xmlhttpRequest`; se indisponível, cai para `fetch`.
- **`fetch`**: usa apenas `fetch` (`mode: cors`), sem fallback.

Sinais comuns:

- Erro imediato de conexão: serviço fora do ar (`SERVICE_UNAVAILABLE`)
- `401/token`: token ausente ou inválido (`SERVICE_AUTH_MISSING`)
- `413/limit`: excedeu limite de arquivo/quantidade (`UPLOAD_LIMIT_EXCEEDED`)

## Regras de bloqueio

Com `blockOnReportError=true`, o fluxo bloqueia em:

- Falha crítica de coleta (`MEDIA_PARSE_ERROR`, `HISTORICO_PARSE_ERROR`)
- Falha de envio/serviço (`SERVICE_*`, `UPLOAD_LIMIT_EXCEEDED`)

## Matriz rápida de erros

| Código | Causa comum | Comportamento | Ação recomendada |
|---|---|---|---|
| `MEDIA_PARSE_ERROR` | HTML de Mídia inesperado, links inválidos ou download falhou | Pausa (se `blockOnReportError=true`) | Validar aba Mídias, fixture e links reais |
| `HISTORICO_PARSE_ERROR` | Link/HTML de Histórico não parseado | Pausa (se `blockOnReportError=true`) | Validar `#hlkObs`/`#hButAcompanhamentoSIN`, estrutura de fieldsets e timeline |
| `SERVICE_UNAVAILABLE` | API local indisponível, timeout ou falha de rede | Pausa (se `blockOnReportError=true`) | Subir serviço e testar `GET /health` |
| `SERVICE_AUTH_MISSING` | Token faltando ou divergente | Pausa (se `blockOnReportError=true`) | Alinhar `KM_REPORT_TOKEN` e `Token API` do painel |
| `UPLOAD_LIMIT_EXCEEDED` | Arquivo maior que limite ou quantidade excedida | Pausa (se `blockOnReportError=true`) | Ajustar limites cliente/servidor ou reduzir coleta |

## Seletor robusto

O script suporta múltiplos formatos de seletor:

| Formato | Exemplo | Uso |
|---|---|---|
| CSS puro | `#ibutUNSPSC` | Elementos com ID único |
| CSS + filtro texto | `a#lbutMenu\|\|Descrições` | ID + texto de confirmação |
| KM selector | `km:tag=a;id=lbutMenu;text=descrições` | Busca robusta quando IDs são duplicados |
| Texto global | `text=Descrições` | Busca por texto visível |
| Postback | `postback=ctl00$Body$...$lbutMenu` | Busca por target de `__doPostBack` |

## Mapa JSON por item

Formato objeto:

```json
{
  "251133": { "ncm": "8471.30.12", "unspsc": "30103618" },
  "251134": { "nbs": "1111.22.33", "unspsc": "30103618", "lei116": "7.02" }
}
```

Formato lista:

```json
[
  { "id": "251133", "ncm": "8471.30.12", "unspsc": "30103618" },
  { "id": "251134", "nbs": "1111.22.33", "unspsc": "30103618", "lei116": "7.02" }
]
```

Observação:

- Quando o JSON por item estiver ativo, ele também passa a definir o total planejado usado pela ETA do lote.
- `nbs` é aceito como alias de valor fiscal no mesmo campo lógico da ação `ncm`.
- `lei116` é opcional e ativa o modo serviço para o item (preenchimento Cat90/Cat91).
- Formato aceito de `lei116`: `d.dd` ou `dd.dd` (ex.: `7.02`, `12.15`).

## Exemplos de perfil

**Perfil conservador (produção):**

```json
{
  "enabledReport": false,
  "enabledMedia": true,
  "clickMediaTabBeforeCollect": false,
  "enabledAcompanhamento": true,
  "blockOnReportError": true,
  "serviceUrl": "http://127.0.0.1:8765",
  "apiToken": "seu-token",
  "transport": "auto",
  "maxFileSizeMb": 25,
  "maxFilesPerItem": 20
}
```

**Perfil diagnóstico (coleta sem travar lote):**

```json
{
  "enabledReport": false,
  "enabledMedia": true,
  "clickMediaTabBeforeCollect": false,
  "enabledAcompanhamento": true,
  "blockOnReportError": false,
  "serviceUrl": "http://127.0.0.1:8765",
  "apiToken": "seu-token",
  "transport": "gm_xhr",
  "maxFileSizeMb": 15,
  "maxFilesPerItem": 10
}
```

## Para Desenvolvedores (Alterar Defaults)

Como o projeto agora é modular, as configurações padrão não ficam mais no topo do arquivo final. Elas estão em:

| Configuração | Arquivo Fonte |
|---|---|
| Ações (`atuar`, `ncm`, etc) | `src/config/workflow-actions.js` |
| Reporting (liga/desliga, limites, URL) | `src/config/constants.js` (objeto `REPORTING_DEFAULTS`) |
| Variáveis globais/Timeout | `src/config/constants.js` (objeto `CONFIG`) |

Apos alterar qualquer valor, lembre-se de rodar:

```powershell
npm run build
```
