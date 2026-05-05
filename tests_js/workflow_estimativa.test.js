import { describe, expect, it } from "vitest";

import * as Estimativa from "../src/workflow/estimativa.ts";

function makeState() {
  return {
    progresso: { atual: 0, total: 0, ultimoProcessado: null },
    estimativa: null,
    estatisticas: { ultimoErro: null },
    pausado: false,
    itemAtualKey: null,
    itemAtualTelaId: null,
    itemMapAtivo: false,
    itemMap: {},
  };
}

describe("workflow/estimativa", () => {
  it("reseta a rodada e calcula total pelo JSON quando ativo", () => {
    const state = makeState();
    Estimativa.resetarRodada(state, { totalPlanejado: 4, fonteTotal: "json" });
    expect(state.estimativa.totalPlanejado).toBe(4);
    expect(state.estimativa.fonteTotal).toBe("json");
    expect(state.estimativa.restantes).toBe(4);
  });

  it("usa total da fila quando ainda não existe base definida", () => {
    const state = makeState();
    const changed = Estimativa.garantirTotalPlanejado(state, 3, "fila", 1000);
    expect(changed).toBe(true);
    expect(state.estimativa.totalPlanejado).toBe(3);
    expect(state.estimativa.fonteTotal).toBe("fila");
    expect(state.estimativa.restantes).toBe(3);
  });

  it("fixa o primeiro item como base e recalcula restantes", () => {
    const state = makeState();
    Estimativa.resetarRodada(state, { totalPlanejado: 3, fonteTotal: "json" });

    Estimativa.registrarInicioItem(state, "320780", 1000);
    state.progresso.atual = 1;
    const resultado = Estimativa.registrarConclusaoItem(state, "320780", 7000);

    expect(resultado.duracaoMs).toBe(6000);
    expect(state.estimativa.primeiroItemId).toBe("320780");
    expect(state.estimativa.primeiroItemDuracaoMs).toBe(6000);
    expect(state.estimativa.duracaoAmostras).toBe(1);
    expect(state.estimativa.duracaoTotalConcluidosMs).toBe(6000);
    expect(state.estimativa.tempoMedioReferenciaMs).toBe(6000);
    expect(state.estimativa.restantes).toBe(2);
    expect(state.estimativa.etaRestanteMs).toBe(12000);
  });

  it("recalcula média acumulada nas próximas conclusões", () => {
    const state = makeState();
    Estimativa.resetarRodada(state, { totalPlanejado: 3, fonteTotal: "json" });

    Estimativa.registrarInicioItem(state, "A", 1000);
    state.progresso.atual = 1;
    Estimativa.registrarConclusaoItem(state, "A", 5000);

    Estimativa.registrarInicioItem(state, "B", 8000);
    state.progresso.atual = 2;
    Estimativa.registrarConclusaoItem(state, "B", 14000);

    expect(state.estimativa.primeiroItemId).toBe("A");
    expect(state.estimativa.primeiroItemDuracaoMs).toBe(4000);
    expect(state.estimativa.duracaoAmostras).toBe(2);
    expect(state.estimativa.duracaoTotalConcluidosMs).toBe(10000);
    expect(state.estimativa.tempoMedioReferenciaMs).toBe(5000);
    expect(state.estimativa.restantes).toBe(1);
    expect(state.estimativa.etaRestanteMs).toBe(5000);
  });

  it("mantém duração quando conclusão chega com id divergente, usando item aberto", () => {
    const state = makeState();
    Estimativa.resetarRodada(state, { totalPlanejado: 2, fonteTotal: "fila" });
    Estimativa.registrarInicioItem(state, "K-001", 1000);
    state.progresso.atual = 1;
    const out = Estimativa.registrarConclusaoItem(state, "TELA-001", 5500);
    expect(out.duracaoMs).toBe(4500);
    expect(state.estimativa.tempoMedioReferenciaMs).toBe(4500);
  });

  it("gera resumo pronto para UI enquanto ainda mede o primeiro item", () => {
    const state = makeState();
    Estimativa.resetarRodada(state, { totalPlanejado: 2, fonteTotal: "json" });
    Estimativa.registrarInicioItem(state, "9001", 1000);
    state.itemAtualKey = "9001";
    state.itemAtualTelaId = "9001";

    const resumo = Estimativa.obterResumoUI(state, 4000);
    expect(resumo.itemAtualId).toBe("9001");
    expect(resumo.tempoBaseTexto).toContain("Medindo 1º item");
    expect(resumo.etaRestanteTexto).toBe("Aguardando base");
  });
});
