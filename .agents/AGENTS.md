# Regras do Projeto — FISCAL 5.0

## Sistema JSON por Item — Contrato Estável

O sistema "JSON por item" (item-map) está em produção e funciona corretamente.
Ele possui contratos documentados com `@contract` nos arquivos-chave.

### Arquivos protegidos (não alterar contratos sem revisão):

| Arquivo | Contrato |
|---------|----------|
| `src/data/item-map-manager.ts` | API pública, seletores DOM, propriedades do estado |
| `src/ui/painel/painel-sections.ts` | IDs HTML gerados por `renderJsonSection` |
| `src/ui/painel-events.ts` | Wiring de eventos (IDs + chamadas) |
| `src/core/estado/types.ts` | Propriedades `itemMap*`, `itemAtual*`, `itemFlags` |

### Regras para alterações nestes arquivos:

1. **Não renomear** IDs de elementos HTML: `chkItemMapAtivo`, `itemMapJson`, `btnItemMapAplicar`, `btnItemMapCriar`, `itemMapStatus`.
2. **Não renomear** propriedades do estado: `itemMapAtivo`, `itemMapJson`, `itemMap`, `itemMapUltimoAplicadoId`, `itemAtualKey`, `itemAtualTelaId`, `itemFlags`.
3. **Não alterar** as assinaturas das funções públicas exportadas por `item-map-manager.ts`.
4. **Não alterar** os seletores DOM lidos por `obterItemIdAtual()` e `gerarJsonDoItemAtual()`.
5. Se for necessário alterar qualquer contrato, **atualizar todos os consumidores** e os testes de contrato em `tests_js/ui_json-section-contract.test.js` e `tests_js/data_item-map-manager.test.js`.
