import { beforeEach, describe, expect, it } from "vitest";

import { ESTADO_PADRAO, get, invalidar, normalizarReportingConfig, set } from "../src/core/estado-manager.ts";
import { REPORTING_DEFAULTS } from "../src/config/constants.ts";
import { construirPainel, injetarEstilos } from "../src/ui/painel-builder.ts";
import { wireEvents } from "../src/ui/painel-events.ts";
import { atualizarIndicadorProgresso, inicializar, toggleMinimizar } from "../src/ui/ui-manager.ts";
import { registrarEventoItem, resetarTrilhaExecucao } from "../src/workflow/item-trace.ts";

function buildState(overrides = {}) {
  return {
    ...ESTADO_PADRAO,
    perfilAtivo: "default",
    perfis: { default: {} },
    perfilConfigs: { default: { reporting: normalizarReportingConfig(REPORTING_DEFAULTS) } },
    reporting: normalizarReportingConfig(REPORTING_DEFAULTS),
    ...overrides,
  };
}

describe("ui/drawer", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    localStorage.clear();
    invalidar();
  });

  it("renderiza o drawer recolhido na esquerda", () => {
    set(buildState({ minimizado: true }));
    injetarEstilos();
    const painel = construirPainel(true);
    document.body.appendChild(painel);

    expect(painel.id).toBe("painel-robo-pro");
    expect(painel.classList.contains("is-collapsed")).toBe(true);
    expect(document.getElementById("drawerToggle")).not.toBeNull();
  });

  it("mostra CEST no JSON padrão do painel", () => {
    set(buildState({ minimizado: false }));
    injetarEstilos();
    const painel = construirPainel(false);
    document.body.appendChild(painel);

    const textarea = document.getElementById("itemMapJson");
    expect(textarea?.getAttribute("placeholder")).toContain('"cest": "01.075.00"');
  });

  it("abre e fecha ao clicar e persiste o estado recolhido", () => {
    set(buildState({ minimizado: true }));
    injetarEstilos();
    const painel = construirPainel(true);
    document.body.appendChild(painel);

    toggleMinimizar();
    expect(painel.classList.contains("is-collapsed")).toBe(false);
    expect(get().minimizado).toBe(false);

    toggleMinimizar();
    expect(painel.classList.contains("is-collapsed")).toBe(true);
    expect(get().minimizado).toBe(true);
  });

  it("atualiza o bloco de ETA e progresso", () => {
    const estado = buildState({
      minimizado: false,
      ativo: true,
      progresso: { atual: 1, total: 4, ultimoProcessado: "1000" },
      itemAtualKey: "1001",
      itemAtualTelaId: "1001",
      estimativa: {
        totalPlanejado: 4,
        fonteTotal: "json",
        itemAtualId: "1001",
        itemAtualInicioTs: Date.now() - 2000,
        primeiroItemId: "1000",
        primeiroItemDuracaoMs: 6000,
        tempoMedioReferenciaMs: 6000,
        restantes: 3,
        etaRestanteMs: 18000,
        previsaoTerminoTs: Date.now() + 18000,
        ultimoItemConcluidoTs: Date.now() - 5000,
      },
    });
    resetarTrilhaExecucao(estado, { runId: "session_1", now: Date.now() - 10000 });
    registrarEventoItem(estado, "1001", "item_aberto", {
      resumo: "Item aberto para processamento",
      now: Date.now() - 3000,
    });
    registrarEventoItem(estado, "1001", "relatorio_enviado", {
      resumo: "Relatório enviado com sucesso",
      now: Date.now() - 1000,
    });
    set(estado);

    injetarEstilos();
    const painel = construirPainel(false);
    document.body.appendChild(painel);

    atualizarIndicadorProgresso();

    expect(document.getElementById("etaResumo")?.textContent).toContain("1/4");
    expect(document.getElementById("etaTempoBase")?.textContent).not.toBe("—");
    expect(document.getElementById("etaRestante")?.textContent).not.toBe("Aguardando base");
    expect(document.getElementById("progressText")?.textContent).toContain("Concluídos 1 de 4");
    expect(document.getElementById("itemTraceCurrent")?.textContent).toContain("Item 1001");
    expect(document.getElementById("itemTraceList")?.textContent).toContain("Relatório enviado com sucesso");
  });

  it("marca o card da trilha como crítico para pausa por reincidência", () => {
    const estado = buildState({
      minimizado: false,
      ativo: true,
      pausado: true,
      progresso: { atual: 1, total: 4, ultimoProcessado: "1001" },
      itemAtualKey: "1001",
      itemAtualTelaId: "1001",
    });
    resetarTrilhaExecucao(estado, { runId: "session_2", now: Date.now() - 10000 });
    registrarEventoItem(estado, "1001", "pausado_por_reincidencia", {
      resumo: "Pausado por reincidência da etapa",
      status: "pausado",
      now: Date.now() - 1000,
    });
    set(estado);

    injetarEstilos();
    const painel = construirPainel(false);
    document.body.appendChild(painel);

    atualizarIndicadorProgresso();

    expect(document.getElementById("itemTraceCard")?.classList.contains("is-critical")).toBe(true);
  });

  it("abre/fecha seção e persiste estado em painelSecoes", () => {
    set(buildState({ minimizado: false, painelSecoes: { ...ESTADO_PADRAO.painelSecoes, logs: false } }));
    injetarEstilos();
    const painel = construirPainel(false);
    document.body.appendChild(painel);
    wireEvents(() => {});

    const secao = document.querySelector('.km-collapsible[data-section="logs"]');
    const botao = document.querySelector('[data-section-toggle="logs"]');
    expect(secao?.classList.contains("is-collapsed")).toBe(true);

    botao?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(secao?.classList.contains("is-collapsed")).toBe(false);
    expect(get().painelSecoes.logs).toBe(true);

    botao?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(secao?.classList.contains("is-collapsed")).toBe(true);
    expect(get().painelSecoes.logs).toBe(false);
  });

  it("persiste scroll interno e restaura após recriar o painel", async () => {
    set(buildState({ minimizado: false, painelScrollTop: 0 }));
    injetarEstilos();
    const painel = construirPainel(false);
    document.body.appendChild(painel);
    wireEvents(() => {});

    const conteudo = document.getElementById("painelConteudo");
    expect(conteudo).not.toBeNull();

    // Em vez de depender do DOM real aplicar o scroll (o que falha no JSDOM às vezes),
    // vamos mockar a propriedade
    Object.defineProperty(conteudo, 'scrollTop', { value: 180, writable: true });
    
    conteudo.dispatchEvent(new Event("scroll"));
    
    // Aguarda o debounce de 150ms do scroll
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(get().painelScrollTop).toBe(180);

    // Limpa e recria
    document.body.innerHTML = "";
    inicializar();
    await new Promise((resolve) => setTimeout(resolve, 50));

    const conteudoRestaurado = document.getElementById("painelConteudo");
    expect(conteudoRestaurado).not.toBeNull();
    // O ui-manager seta o scrollTop diretamente logo após criar o painelConteudo
    // no JSDOM isso reflete na propriedade
    expect(conteudoRestaurado?.scrollTop).toBe(180);
  });
});
