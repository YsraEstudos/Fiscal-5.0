# Relatório Técnico Ultra-Completo: Sistema Klassmatt (AYOSHII)

## 1. Visão Geral e Arquitetura

O sistema **Klassmatt/AYOSHII** é uma aplicação corporativa baseada em **ASP.NET WebForms**, utilizando renderização do lado do servidor com atualizações parciais via **ASP.NET AJAX (UpdatePanels)**. A interface é estruturada em torno de um formulário principal (`form#aspnetForm`) que gerencia o estado da página via `ViewState`.

### Fluxo de Trabalho Principal

1. **Listagem e Triagem**: `SIN_Lista.aspx` (pagina itens.html) - Onde os analistas filtram e selecionam solicitações.
2. **Detalhamento e Ação**: `SIN_Item_Resultante.aspx` (Pagina acompanhamento.html) - O painel de controle de uma solicitação específica (SIN).
3. **Auditoria e Histórico**: `Historico.aspx` (acompanhamento da sai.html) - Log cronológico de todas as interações e mudanças de estado.

---

## 2. Análise Técnica Detalhada por Página

### 2.1. SIN_Lista.aspx (`pagina itens.html`)

**Função**: Dashboard de filtro e listagem de Solicitações de Item (SIN).

#### Estrutura do Formulário (`#aspnetForm`)

* **Action**: `./SIN_Lista.aspx?atalho=1&k=...&rk=...`
* **Hidden Fields Críticos**:
  * `__EVENTTARGET`, `__EVENTARGUMENT`: Controlam o disparo de eventos do servidor.
  * `__VSK`: `2cc743fb-e21c-449f-9be5-4417281bef2f` (Chave de sessão/validação).
  * `__VIEWSTATE`: Armazena o estado da árvore de controles.

#### Scripts e Bibliotecas

* **Core**: `jquery-3.6.0.js`, `jquery-ui-1.14.1.js`.
* **Klassmatt**: `km_main_v04.js`, `klassmatt-core.js`, `SIN_Lista_v06.js`.
* **AJAX**: `Siscomex.js`, `select2.min.js`.
* **Inicialização AJAX**: `Sys.WebForms.PageRequestManager._initialize` configurado para os UpdatePanels `tctl00$Body$TopMenu1$upPesquisa` e `upPesquisa`.

#### Filtros de Pesquisa (Seletores)

Os filtros são compostos por dropdowns (`<select>`) e campos de texto.

* **Opções de Visualização (`ddlOpcao`)**:
  * `SOMENTE_REC_ACAO`: Requerem atuação.
  * `M|FISCAL-KLASSMATT` (Selecionado): Aguardam FISCAL-KLASSMATT.
  * `T|FISCAL-AYOSHII`: Aguardam FISCAL-AYOSHII.
  * `3`, `4`, `5`, `6`: Todas pendentes, aprovadas, canceladas, todas.
* **Origem (`ddlOrigem`)**: Manual ("M"), Saneamento ("I"), Somente SAI ("S"), etc.
* **Critérios de Busca Dinâmica**:
  * **Campo (`ddlCampo`)**: `SIN.Id`, `sin.Solicitante`, `sin.NomeEtapaAtual`, `item.Codigo`, etc.
  * **Operador (`ddlOperador`)**: `Igual`, `Contem`, `Maior`, `Iniciado`.
  * **Valor (`txtValor`)**: `<textarea>` que aceita múltiplos valores separados por vírgula/quebra de linha.

#### Pesquisa Avançada Hidden (Display: None por padrão)

O HTML revela inputs prontos para serem exibidos via script:

* `ddlAnalista`: Lista de analistas (ANA.SOARES, GABRIELA.POERSCHKE, etc.).
* `ddlSolicitante`: Lista de solicitantes (EVELISE.DUARTE, THAYNA.LUZ, etc.).
* `ddlMacroEtapa`: CATALOGACAO, FISCAL, LIBERACAO, etc.
* `ddlFluxo`: Fluxos padrão (ex: "FLUXO PADRAO - ITEM NOVO SEM TRADUCAO").

#### Área de Resultados

* **Container**: `div#DIVResultado` (Conteúdo injetado dinamicamente).
* **Paginação/Controle**: Botões de ação como "Filtrar" (`butFiltrar`) e limpar filtro (`imgLimparFiltro`).
* **Tags/Marcadores**:
  * Prioridade com cores: Laranja (`!`), Verde (`N`), Vermelho (`U`).
  * Operador lógico: `btnOperMarcadores` ("Ou" / "E").

---

### 2.2. SIN_Item_Resultante.aspx (`Pagina acompanhamento.html`)

**Função**: Visualização completa de uma SIN e execução de tarefas.

#### Dados Identificadores (Read-only inputs)

* **Id-SAI**: `#txtNumero` (ex: 274867).
* **Solicitante**: `#txtSolicitante`.
* **Empresa**: `#txtEmpresa`.
* **Status Atual**: `#txtStatus` (ex: FISCAL-KLASSMATT).
* **Código do Item**: `#txtCodigo` (ex: 47053).
* **NCM**: `#txtNCM`.
* **Padrão Descritivo**: `#txtPD`.

#### Navegação e Ações (Links e Botões)

* **Log Integração**: `#hButLogIntegracao`.
* **Workflow (SLA)**: `#hButVerSLA`.
* **Mídias**: `#hButMidiaSIN`.
* **Acompanhamento da SAI**: `#hButAcompanhamentoSIN` (Chama `OpenWindowsWHR('Historico.aspx...')`).
* **Ver Item**: `#hButVerItem`.
* **Botões de Comando (Footer)**:
  * `Imprimir` (`butImprimir`)
  * `Pesquisar` (`butPesquisar`)
  * `Retornar Etapa` (`lkbutTrazerDeVolta`)
  * `Atuar no Item` (`butAcao3`) - **Crítico para automação**.
  * `Voltar` (`butVoltar`).

#### Descrição do Item

Apresenta descrições em múltiplas versões dentro de `#divReferencias`:

* **Completa**: `#txtD0`.
* **Média**: `#txtD1`.
* **Resumida**: `#txtD2`.
* Obs: Ícone de idioma (`#imgD0`) indica a língua (bandeira do Brasil).

---

### 2.3. Historico.aspx (`acompanhamento da sai.html`)

**Função**: Timeline auditável de eventos.

#### Estrutura Cronológica

* **Container Principal**: `table#tableobj` dentro de `div.divScroll`.
* **Agrupamento**: `<fieldset class="hist-fieldset">` para cada dia.
* **Cabeçalho do Dia**: `<legend class="hist-legend">` (ex: "quarta-feira, 28 de janeiro de 2026").

#### Blocos de Evento (`.row`)

Cada evento é composto por blocos `.row`. Um bloco identifica o **Usuário** e os subsequentes `.row.result` listam as ações.

* **Usuário Responsável**: Link dentro de `.row > .d > a` (ex: `ISRAEL.MACHADO*`).
* **Linha de Ação (`.row.result`)**:
  * **Hora**: `span#lblHora` (Nota: ID duplicado na página, usar classe ou contexto).
  * **Descrição**: `span#lblDescricao`.
    * **Exemplos de Conteúdo**:
      * "Solicitação enviada para FISCAL-AYOSHII"
      * "O Usuário forçou o retorno da Solicitação..."
      * Alterações de campo: `<B>SOLICITACAO ALTERADA</B><br/>[DT] DESCRICAO de [] para [...]`
      * Comentários de destaque: `<span style="color: black; background-color: Yellow;"><strong>...</strong></span>`

---

## 3. Menu Superior e Navegação Global

O header (`.ks-header`) é consistente entre as páginas e contém o "Menu Hambúrguer" que revela um dropdown complexo (`.ks-menu__dropdown`).

### Menu Dropdown (`.ks-menu__dropdown`)

Dividido em colunas (`.ks-menu__dropdown__col`):

1. **Busca Rápida**: Input `#IdItemPesquisa` e botão lupa `#btnItem`.
2. **Configurações/Outros**: Links para "Padrões Em Análise/Revisão".
3. **Atalhos de Teclado (Referência)**:
    * `Shift + S`: Acompanhamento
    * `Shift + P`: Padrões
    * `Shift + I`: Itens
    * `Shift + F`: Fabricantes
    * `Shift + Z`: Vassoura
    * *Nota*: A automação pode simular esses atalhos ou clicar nos elementos correspondentes.

---

## 4. Pontos Críticos para Automação (Tampermonkey/Selenium)

### 4.1. Seletores Confiáveis

Evite IDs que podem mudar dinamicamente ou se repetir indevidamente. Prefira combinações de ID + Hierarquia.

* **Identificar Número da SIN na Lista**:
    `#DIVResultado .result label[title] b`
* **Clicar em "Atuar no Item"**:
    `input[name$="butAcao3"]` ou `#butAcao3`
* **Extrair Histórico**:
    Iterar sobre `fieldset.hist-fieldset`. Dentro, capturar a `legend` (data). Depois, iterar sobre `.row` para capturar usuário e `.row.result` para capturar hora e descrição.

### 4.2. Manipulação de AJAX

Como o sistema usa `UpdatePanel`, o DOM muda sem recarregar a página.

* **Detecção de Carregamento**: Monitorar `Sys.WebForms.PageRequestManager.getInstance().get_isInAsyncPostBack()`.
* **Hook pós-update**:

    ```javascript
    Sys.WebForms.PageRequestManager.getInstance().add_endRequest(function(sender, args) {
        // Seu código de re-aplicação de DOM listeners aqui
    });
    ```

### 4.3. IDs Duplicados

O HTML analisado mostra violações da unicidade de IDs (ex: `span#lblHora` e `span#lblDescricao` repetidos centenas de vezes no histórico).

* **Solução**: **NUNCA** use `document.getElementById('lblDescricao')`.
* **Use**: `document.querySelectorAll('span[id="lblDescricao"]')` ou seletores baseados em classe `.result .d span`.

### 4.4. Extração de Dados do Histórico (Regex Patterns)

Para parsear o conteúdo de `#lblDescricao`:

* **Envio de etapa**: `/^Solicitação enviada para (.+)$/`
* **Alteração de campo**: `/^\[DT\] (.+) de \[(.*)\] para \[(.*)\]$/`
* **Comentário**: Capturar o texto dentro de `span[style*="background-color: Yellow"]`.

---

## 5. Dicionário de Dados Observados

| Campo | IDs HTML | Exemplo de Valor | Notas |
| :--- | :--- | :--- | :--- |
| **SIN ID** | `#txtNumero`, `textarea#txtValor` | `274867` | Chave primária |
| **Status** | `#txtStatus` | `FISCAL-KLASSMATT` | Controla fluxo |
| **Solicitante** | `#txtSolicitante`, `ddlSolicitante` | `EVELISE.DUARTE` | Usuário origem |
| **NCM** | `#txtNCM` | `3824.50.00` | Dado fiscal |
| **Descrição** | `#txtDescricaoOriginal` | "ARGAMASSA..." | Link abre popup |
| **Prioridade** | `#dlTags`, `#dlPrioridade` | `[NORMAL]`, `[URGENTE]` | Tags visuais |

---

## 6. Conclusão

O sistema apresenta uma arquitetura clássica Enterprise (WebForms + jQuery + AJAX). A automação deve ser resiliente a postbacks parciais e atenta à estrutura de tabelas aninhadas e IDs repetidos no histórico. A presença de muitos campos "ocultos" (display: none) nos filtros sugere que o sistema é altamente configurável e permite buscas muito mais complexas do que a interface padrão sugere à primeira vista.

---

## 7. Plano de Correção e Ajustes de Automação (04/02/2026)

**Falhas Observadas**
- IDs duplicados em tabs (`lbutMenu`) geravam clique em “Descrições” ao invés de “Classificações”.
- O campo fiscal visível em itens de serviço é `#txtNBS`, mas o script buscava apenas `#txtNCMTIPI`.
- Existiam múltiplos timers de fluxo (loop/ação/início/UNSPSC), gerando comportamento inconsistente no espaçamento.
- O gancho do ASP.NET (`endRequest`) podia acordar o fluxo antes do esperado quando combinado com timers concorrentes.

**Correções Aplicadas no UserScript**
- Seleção de abas por texto (`text=Fiscal`, `text=Classificações`) com fallback no `#dlTab`, evitando ambiguidade de IDs.
- Resolução automática do campo fiscal: preferência por `#txtNCMTIPI`, com fallback para `#txtNBS`.
- Comparação tolerante de valor para não reescrever quando já preenchido.
- Temporização unificada: apenas `Delay global entre ações` (`globalActionDelayMs`) controla o espaçamento entre ações executadas (click e input).
- O `wake` continua ativo para reavaliação, mas não quebra o gate temporal global.
- Fallback técnico de modal UNSPSC permanece fixo em constante (`CONFIG.DELAYS.UNSPSC_MODAL`), sem slider dedicado.
- `clickCooldownMs` permanece separado como defesa anti-loop de clique no mesmo alvo.

**Checklist de Validação Operacional**
1. Confirmar que o clique vai direto em “Classificações”.
2. Ajustar o `Delay global entre ações` para 30000ms e observar o espaçamento real entre ações.
3. Validar que o espaçamento se aplica tanto em clique quanto em input (ex.: `Atuar` -> 30s -> `Aba Fiscal` -> 30s -> `Preencher NCM`).
4. Em itens com NBS, validar que o campo é reconhecido e não reescrito sem necessidade.
5. Confirmar que eventos `endRequest` não antecipam ações antes do fim do delay global.
