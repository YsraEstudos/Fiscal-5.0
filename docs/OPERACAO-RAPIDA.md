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


## 3) Executar

1. Abrir fila de itens no Klassmatt.
2. Clicar no botão **INICIAR CICLO** (verde).
3. Observar o cartão superior do drawer para acompanhar a ETA do lote.
4. (Opcional) Usar **Modo Simulação** para testar sem enviar dados.

### Pausa automática por reincidência

Se o item aberto mostrar uma mensagem como:

```html
<span id="lblExecucoes">Esta é a 2º vez que esta SIN passa por esta etapa</span>
```

o robô pausa automaticamente e marca o status como crítico. Nessa condição, revise o item manualmente antes de retomar.
