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
- Efeito: pausa imediata do ciclo, sem continuar para `Prosseguir`
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

Ordem padrão (13 ações):

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
| 11 | `prosseguir` | Prosseguir | click |
| 12 | `confirmar` | Confirmar (Sim) | click |

Todas as ações podem ser habilitadas/desabilitadas individualmente e reordenadas via drag-and-drop no painel.


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
  "251133": { "ncm": "8471.30.12", "cest": "01.075.00", "unspsc": "30103618" },
  "251134": { "nbs": "1111.22.33", "cest": null, "unspsc": "30103618", "lei116": "7.02" }
}
```

Formato lista:

```json
[
  { "id": "251133", "ncm": "8471.30.12", "cest": "01.075.00", "unspsc": "30103618" },
  { "id": "251134", "nbs": "1111.22.33", "cest": null, "unspsc": "30103618", "lei116": "7.02" }
]
```

Observação:

- Quando o JSON por item estiver ativo, ele também passa a definir o total planejado usado pela ETA do lote.
- `nbs` é aceito como alias de valor fiscal no mesmo campo lógico da ação `ncm`.
- `cest` é opcional e aceita código com ou sem máscara (ex.: `0107500` ou `01.075.00`).
- `lei116` é opcional e ativa o modo serviço para o item (preenchimento Cat90/Cat91).
- Formato aceito de `lei116`: `d.dd` ou `dd.dd` (ex.: `7.02`, `12.15`).


## Para Desenvolvedores (Alterar Defaults)

Como o projeto agora é modular, as configurações padrão não ficam mais no topo do arquivo final. Elas estão em:

| Configuração | Arquivo Fonte |
|---|---|
| Ações (`atuar`, `ncm`, etc) | `src/config/workflow-actions.js` |
| Variáveis globais/Timeout | `src/config/constants.js` (objeto `CONFIG`) |

Apos alterar qualquer valor, lembre-se de rodar:

```powershell
npm run build
```
