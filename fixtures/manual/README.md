# Fixtures manuais (HTML) — Guia

Este diretório guarda capturas reais para reprodução manual de cenários não cobertos por teste automatizado.

## Convenção obrigatória

- Nome de arquivo em ASCII, minúsculo, com `_`:
  - exemplo: `historico_fiscal_reincidencia.html`
- Um cenário por arquivo.
- Sem dados sensíveis (anonimizar nomes, e-mails, tokens, IDs internos).

## Metadados mínimos (arquivo `.md` ao lado)

Use `<arquivo>.meta.md` com:

```text
Cenario:
Origem:
Data captura (YYYY-MM-DD):
Objetivo:
Sinais esperados:
Riscos conhecidos:
```

## Checklist antes de commitar

1. O HTML abre localmente sem dependência externa crítica.
2. Elementos relevantes do fluxo permanecem no DOM.
3. Dados sensíveis foram mascarados.
4. O cenário pode ser reproduzido por outro dev só com o arquivo.

## Cenários prioritários

1. UNSPSC sem resultado.
2. Confirmação com `#butSimContinuar`.
3. Itens mistos com “em atuação”.
4. Mídia com erro de acesso (`Erro.aspx` / acesso negado).
5. Histórico com reincidência fiscal (>2).
