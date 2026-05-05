(function () {
  "use strict";

  globalThis.__KM_TEST_MODE__ = true;

  function ensureControlShell() {
    let shell = document.getElementById("fixtureControlShell");
    if (shell) return shell;

    shell = document.createElement("aside");
    shell.id = "fixtureControlShell";
    shell.setAttribute("data-testid", "fixture-control-shell");
    Object.assign(shell.style, {
      position: "fixed",
      top: "16px",
      right: "16px",
      zIndex: "2147483647",
      width: "260px",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      padding: "14px",
      borderRadius: "14px",
      background: "rgba(255, 255, 255, 0.98)",
      border: "1px solid rgba(0, 0, 0, 0.12)",
      boxShadow: "0 12px 28px rgba(0, 0, 0, 0.18)",
      fontFamily: "Segoe UI, sans-serif",
    });

    const title = document.createElement("strong");
    title.textContent = "Fixture Controls";
    title.style.fontSize = "14px";
    shell.appendChild(title);

    document.body.appendChild(shell);
    return shell;
  }

  function mountControlsInShell() {
    const shell = ensureControlShell();
    const ids = ["runScenario", "status", "processedCount", "ignoredCount"];
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el || shell.contains(el)) continue;

      if (id === "processedCount" || id === "ignoredCount") {
        const wrapper = el.parentElement;
        if (wrapper && wrapper !== document.body && !shell.contains(wrapper)) {
          shell.appendChild(wrapper);
          continue;
        }
      }

      shell.appendChild(el);
    }
  }

  function appendLog(msg) {
    const log = document.getElementById("log");
    if (!log) return;
    const li = document.createElement("li");
    li.textContent = msg;
    log.appendChild(li);
  }

  function setStatus(txt) {
    const el = document.getElementById("status");
    if (el) el.textContent = txt;
  }

  function setCounts(processed, ignored) {
    const p = document.getElementById("processedCount");
    const i = document.getElementById("ignoredCount");
    if (p) p.textContent = String(processed);
    if (i) i.textContent = String(ignored);
  }

  async function runScenario() {
    setStatus("running");
    let processed = 0;
    let ignored = 0;

    const items = [...document.querySelectorAll(".item")];
    for (const item of items) {
      if (item.classList.contains("emAtuacao")) {
        ignored += 1;
        appendLog(`Ignorado item em atuação: ${item.dataset.itemId}`);
        continue;
      }

      if (document.body.dataset.ncmError === "true") {
        appendLog("Erro crítico de NCM/NBS detectado");
        setCounts(processed, ignored);
        setStatus("paused");
        return;
      }

      appendLog(`UNSPSC selecionado para item ${item.dataset.itemId}`);

      if (document.body.dataset.noMedia === "true") {
        appendLog("Mídias (0) - sem mídia para coletar");
      }

      if (document.body.dataset.confirmButton === "butSimContinuar") {
        const btn = document.getElementById("butSimContinuar");
        if (btn) {
          btn.click();
          appendLog("Confirmação via #butSimContinuar");
        }
      }

      try {
        const resp = await fetch("/reports/item", {
          method: "POST",
          body: JSON.stringify({ itemId: item.dataset.itemId || "x" }),
          headers: { "content-type": "application/json" },
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        appendLog(`Relatório enviado para item ${item.dataset.itemId}`);
      } catch (err) {
        appendLog(`Erro de serviço: ${err.message || err}`);
        if (document.body.dataset.optionalServiceError === "true") {
          appendLog("Modo opcional ativo: fluxo segue");
        } else {
          setCounts(processed, ignored);
          setStatus("error");
          return;
        }
      }

      processed += 1;
    }

    setCounts(processed, ignored);
    setStatus("completed");
  }

  function maybeInjectDistScript() {
    if (document.body.dataset.injectDist !== "true") return;
    const s = document.createElement("script");
    s.src = "/dist-script.js";
    s.defer = true;
    document.head.appendChild(s);
  }

  function boot() {
    maybeInjectDistScript();
    mountControlsInShell();
    const runBtn = document.getElementById("runScenario");
    if (runBtn) runBtn.addEventListener("click", () => runScenario());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
