# Mapa do Processo de Mídia e Auditoria do Script

Este documento detalha o fluxo de interação com a página de Mídias no Klassmatt (projeto Rodonaves) e audita o script atual (`FISCAL 5.0.user.js`) em busca de falhas na coleta.

## Visão Geral do Processo (Mídias)

1. **Acesso**: O usuário clica no link "Mídias (N)" (`id="hButMidiaSIN"`) na tela de detalhe da solicitação (SIN).
2. **Popup**: Uma janela popup abre com a URL `Midia.aspx?tipo=SIN&id=...`.
3. **Estrutura da Página**:
    * **Sidebar de Categorias (`#dlMidias`)**: Tabela à esquerda listando tipos (ex: "Fotos (1)", "PDF (2)"). Clicar aqui dispara um `__doPostBack`.
    * **Lista de Mídias (`.carrousel`)**: Container scrollável horizontal com thumbnails (`.slide`).
    * **Área de Visualização (`#divFotos`)**: Exibe a mídia selecionada.
4. **Metadados**: Detalhes como "Usuário" e "Data" aparecem apenas no mouseover (função JS `abre()`), atualizando o campo `#idInfos`.

---

## Auditoria de Falhas no Script (Pontos Críticos)

A análise do script revelou os seguintes problemas que impedem a coleta correta e completa das mídias.

### 1. URL de Fallback Incorreta (Crítico para SIN)

* **O Problema**: Se o script não conseguir extrair a URL do botão "Mídias", ele tenta "adivinhar" a URL.
* **Código Atual**: `Midia.aspx?tipo=Itens&id=${itemId}...`
* **O Erro**: Para solicitações de item novo (SIN), o parâmetro `tipo` correto é **SIN** (ex: `tipo=SIN`). O link real é `Midia.aspx?tipo=SIN&id=32743...`.
* **Consequência**: O script abre a galeria errada (do cadastro "Itens" mestre) que pode estar vazia ou conter dados obsoletos, ignorando as mídias da solicitação atual.

### 2. Ausência de Indicadores Visuais de Validação

* **Descoberta**: **NÃO EXISTE** indicador visual (ícone de check, texto "Aprovado") nas miniaturas.
* **Contexto is King**: A "validação" é determinada pelo contexto.
  * **Contexto SIN (`tipo=SIN`)**: Mídias em análise/trabalho.
  * **Contexto Item (`tipo=Itens`)**: Mídias oficiais/catalogadas.
* **Estratégia**: O script deve extrair tudo do contexto atual. Se o objetivo é pegar "mídias validadas", ele deve privilegiar o contexto de **Item** (se existir e o item já estiver catalogado) ou aceitar o contexto **SIN** (se for um item novo em fluxo). Não é possível filtrar por "status" dentro da popup.

### 3. Navegação por Categorias (PostBack)

* **O Problema**: O script atual carrega apenas a visualização padrão (que geralmente exibe só "Fotos").
* **O Erro**: Categorias como "PDF", "Documentos", "Desenhos" estão em links laterais (`#dlMidias`) que usam `__doPostBack` para recarregar a lista. O `fetchHtml` padrão (GET) não aciona isso.
* **Consequência**: O script perde qualquer mídia que não esteja na categoria inicial "Fotos".
* **Correção**: O script precisa identificar os links em `#dlMidias` e iterar sobre eles (simulando o PostBack ou navegando real se em modo assistido).

### 4. Seletores de Container Limitados

* **O Problema**: O script busca em `.slide`, `.carrousel`, mas a estrutura exata varia.
* **Correção**: Devemos incluir explicitamente `#dlMidias` (para descobrir categorias) e garantir que o parsing busque dentro de `.slide` (para pegar o link direto do atributo `onclick` ou `href`).

### 5. Download Links e Handlers

* **Estrutura Confirmada**:
  * Imagem Direta: `Banco_Imagens/[HASH].png`
  * Handler: `GetTempFile.ashx?path=banco_imagens&file=[HASH].pdf`
* **Ação**: O script já tem lógica para isso, mas precisa ser testado contra o padrão `.ashx` para garantir que detecta a extensão `.pdf` corretamente através da query string.

---

## Estratégia de Correção Recomendada

1. **Ajustar Fallback**: Usar `tipo=SIN` quando estiver em tela de solicitação.
2. **Iterar Categorias**: Implementar lógica para identificar e "clicar" (fetch/post) em cada categoria listada no sidebar `#dlMidias`.
3. **Contexto sem Filtro Visual**: Aceitar todas as mídias retornadas no contexto correto, já que não há validação visual individual.
