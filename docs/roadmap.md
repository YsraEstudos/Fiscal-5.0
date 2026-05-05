# Roadmap FISCAL 5.0

Este documento consolida as próximas entregas de melhorias, refatorações e novas funcionalidades do sistema, ordenadas por prioridade técnica e de negócio.

## 🔴 P0 - Crítico e Funcionalidades Core (Curto Prazo)
Estas tarefas afetam diretamente o uso diário e agregam funcionalidades chave que afetam o produto.

- [ ] **[FIX] Fluxo direto na aba UNS**: Corrigir o problema de navegação do script quando o item é carregado e abre diretamente na aba "UNS", garantindo que ele vá para as abas fiscais corretas.
- [ ] **[FEATURE] Inserção de Comentários**: Adicionar a opção na interface do script para incluir e salvar comentários personalizados.
- [ ] **[FEATURE] Sistema "Side-by-side" de Acompanhamento**: Criar uma interface acoplada no script onde o usuário consiga ver as informações de acompanhamento (códigos, prazos, histórico) diretamente ao lado do item em análise.
- [ ] **Remover Tipagens Fracas**: Substituir os últimos `as any` e asserções forçadas do TypeScript por interfaces rigorosas, blindando contra bugs de tipagem introduzidos em runtime.
- [ ] **Centralizar Seletores do DOM**: Desacoplar seletores CSS (ex: `.gridItem`) soltos nos Handlers do workflow (ncm, unspsc) e movê-los estritamente para `src/utils/selectors.ts`.

---

## 🟡 P1 - Arquitetura, Estabilidade e Dívida Técnica (Médio Prazo)
Tarefas de arquitetura e saúde do software que aumentam a confiança sobre as mudanças futuras.

- [ ] **Migração da Suíte de Testes para TypeScript**: Renomear e migrar a pasta `tests_js/` para TS, trazendo checagem estática para os testes e prevendo erros de compilação nos arquivos de teste.
- [ ] **Tratamento Específico de Erros**: Evitar `throw` com strings puras. Criar instâncias dedicadas de erro (`ValidationError`, `NetworkError`) para o fluxo reagir adequadamente a falsos positivos da página do Klassmatt versus erros de rede reais.
- [ ] **Melhorar Branch Coverage de Erros**: Elevar o score de "Branch Coverage" (teste de lógicas de `if` ou blocos de falhas isoladas) de 60% para 80%, garantindo que os retornos com erros conhecidos no Painel UI comportem-se previsivelmente no Vitest.
- [ ] **Reduzir Complexidade Cognitiva das Funções**: Seguir as indicações do SonarLint e fatiar métodos cruciais muito longos (como os de parse ou `coletor-midia.ts`) em funções menores baseadas em SRP (Princípio de Responsabilidade Única).
- [ ] **Otimizar Lógica de Re-tentativas (Retry)**: Ao invés de pausas temporais fixas (1s, 1s, 1s) na chamada de API, migrar as funções de espera de rede para _Exponential Backoff_ (delay crescente progressivo) para poupar o backend original e impedir restrições (rate limits).
- [ ] **Refatorar Eventos do Painel (`painel-builder.ts`)**: Estabelecer um método construtor mais robusto (ou mini-fábricas de componentes) para o painel de HTML não usar strings densas.

---

## 🟢 P2 - Qualidade Fina, Limpeza e Modernização (Longo Prazo/Refatoração Constante)
São débitos antigos e de qualidade de modernidade da Web que não quebram o fluxo, mas o deixam excepcional aos termos de engenharia.

- [ ] **Remover "Magic Strings"**: Criar `Enum`s estritos ou objetos `Const` definidos para chaves comuns como `'ncm'`, `'unspsc'` e descrições de fluxo de relatórios, abolindo strings soltas pelas pastas.
- [ ] **Padronização de Operadores Modernos**: Corrigir problemas mapeados pelo linter envolvendo o uso indiscriminado do construtor de coalescência dupla (`??`) e preferir interpolação explícita `${String(var)}`.
- [ ] **Modernizar Expressões Regulares**: Eliminar referências antigas do JS (como `String.match`) em prol de `RegExp.exec()` e melhorar a hierarquia pre-existente nos RegExp predefinidos em compiladores antigos do ES6+.
- [ ] **Remover a Referência Global "Window"**: Trocar dependências fortes e injeções no namespace global da `window` utilizando a notação agnóstica moderna `globalThis`.
- [ ] **Atualizar Chamadas Old Clipboard**: Migrar implementações de `document.execCommand('copy')` para a API assíncrona recomendada atualmente `navigator.clipboard.writeText()`.
- [ ] **Esquemas de Transporte Rígido de API**: Nas rotinas em `transport.ts`, validar via um Schema a resposta dos objetos Django antes de prosseguir no app (adicionando "Contracts" entre Fronte e Back).
- [ ] **Pipeline Playwright Completa Estendida**: Desenvolver o cenário no framework End-to-End da pasta `tests_e2e` para fazer o run global do *script local + página local virtual*, agindo sem *mocks* e testando a injeção do userscript real e eventos visuais de click.
- [ ] **Desacoplar Lógica do Executor (`executor.ts`)**: Criar um motor de Auto-Registro de Handlers de fluxos (Design Pattern _Plugin/Strategy_). Deixa a escala muito mais simples para a criação de novos painéis em novos itens sem aumentar o arquivo core de `execute()`.
- [ ] **Remoção de Código Morto Final**: Limpa completa de `// TODO` e lógica de código comentada desnecessária (código zumbi remanescente das transições JS para TS).
- [ ] **Aprimoramento do Build e Tree Shaking**: Revisiones da flag do vite no Rollup. Inspecionar o export graph do userscript unificado com analyzers para cortar KB/s do build de injeção direta.
- [ ] **Atualização Geral do Walkthough Core**: Mapear na documentação qual o ecossistema e ferramentas usadas hoje. Adicionar Servidor de Fixtures simulando timeouts pesados de rede como manual aos desenvolvedores futuros.
