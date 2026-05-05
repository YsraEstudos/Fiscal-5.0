# Operação Rápida — FISCAL 5.0

## 1) Build e Instalação (UserScript)

O código-fonte (`src/`) deve ser compilado antes de usar.

1. **Instalar dependências** (uma única vez):

   ```powershell
   npm install
   ```

2. **Gerar build**:

   ```powershell
   npm run build
   ```

   Isso criará o arquivo `dist/FISCAL 5.0.user.js`.

3. **Instalar no Tampermonkey**:
   - Abra o arquivo `dist/FISCAL 5.0.user.js` no navegador (drag-and-drop) OU copie o conteúdo para um novo script no Tampermonkey.
   - Confirme a instalação/atualização.

---

## 2) Subir serviço local (Backend Reporting)

**Opção automática:**

```powershell
.\start-reporting-backend.bat
```

**Opção manual:**

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-reporting.txt
$env:KM_REPORT_TOKEN="seu-token"
python reporting_service.py
```

## 3) Validar saúde

Abrir no navegador:

- `http://127.0.0.1:8765/health` → deve retornar `ok: true` e `authEnabled: true`
- `http://127.0.0.1:8765/` → dashboard de sessões com extração em tempo real

## 4) Configurar UserScript (Painel UI)

No drawer lateral esquerdo do userscript:

- `Gerar relatório PDF/MD`: desativado por padrão
- `Serviço local`: `http://127.0.0.1:8765`
- `Token API`: mesmo valor de `KM_REPORT_TOKEN`
- `Transporte`: `auto` (recomendado)
- `Bloquear em erro de relatório`: ligado (recomendado para produção)
- `F7`: recolhe/expande o drawer
- `F8`: pausa/retoma a execução

## 5) Executar

1. Abrir fila de itens no Klassmatt.
2. Clicar no botão **INICIAR CICLO** (verde).
3. Monitorar logs no painel e dashboard em `http://127.0.0.1:8765/`.
4. Observar o cartão superior do drawer para acompanhar a ETA do lote.
5. (Opcional) Usar **Modo Simulação** para testar sem enviar dados.
6. Se quiser gerar `PDF/MD`, ative `Gerar relatório PDF/MD` no painel.

### Pausa automática por reincidência

Se o item aberto mostrar uma mensagem como:

```html
<span id="lblExecucoes">Esta é a 2º vez que esta SIN passa por esta etapa</span>
```

o robô pausa automaticamente e marca o status como crítico. Nessa condição, revise o item manualmente antes de retomar.

### Fluxo no dashboard (novo)

1. Selecionar a sessão desejada no painel esquerdo.
2. Clicar em um item no painel central para abrir o **preview do item**.
3. Usar **Ver Consolidado** para voltar ao markdown de todos os itens da sessão.
4. Navegar pelo **índice (TOC)** no painel de preview.
5. Organizar sessões com:
   - **Excluir Sessão Atual** (individual)
   - **Excluir Selecionadas** (lote)

## 6) Resultado esperado por item

Em `reports/<sessionRunId>/item_<id>/`:

- Quando `Gerar relatório PDF/MD` estiver ativo:
  - `item_<id>.pdf` — PDF consolidado
  - `item_<id>.md` — Markdown detalhado
  - `extraction_status.json` — Status de extração OCR (se habilitado)
  - `media/*.extracted.txt` — Texto extraído de mídias
- Quando estiver desativado, o lote segue sem gerar esses arquivos.

Na raiz da sessão:

- `index.jsonl` — Índice incremental com lock de arquivo.
- `session_<sessionRunId>.md` — Markdown consolidado de todos os itens, quando o relatório estiver habilitado.
