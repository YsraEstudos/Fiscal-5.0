import { beforeEach, describe, expect, it } from "vitest";

import { ESTADO_PADRAO, invalidar, normalizarReportingConfig, set } from "../src/core/estado-manager.ts";
import { REPORTING_DEFAULTS } from "../src/config/constants.ts";
import { gerar } from "../src/ui/relatorio-erros.ts";
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

describe("ui/relatorio-erros", () => {
  beforeEach(() => {
    document.body.innerHTML = '<button id="x">Ação</button>';
    localStorage.clear();
    invalidar();
  });

  it("inclui trilha compacta da rodada com limites de itens e eventos", () => {
    const estado = buildState({
      itemAtualKey: "320780",
      itemAtualTelaId: "320780",
      progresso: { atual: 3, total: 7, ultimoProcessado: "320781" },
    });
    resetarTrilhaExecucao(estado, { runId: "session_123", now: 1000 });

    for (let itemIndex = 0; itemIndex < 7; itemIndex += 1) {
      const itemKey = `32078${itemIndex}`;
      for (let eventIndex = 0; eventIndex < 15; eventIndex += 1) {
        registrarEventoItem(estado, itemKey, `evento_${eventIndex}`, {
          itemTelaId: itemKey,
          resumo: `Evento ${eventIndex}`,
          now: 1000 + itemIndex * 100 + eventIndex,
        });
      }
    }

    set(estado);
    const relatorio = JSON.parse(gerar());

    expect(relatorio.trilhaExecucao.runId).toBe("session_123");
    expect(relatorio.trilhaExecucao.itemAtualKey).toBe("320780");
    expect(relatorio.trilhaExecucao.ultimoProcessado).toBe("320781");
    expect(relatorio.trilhaExecucao.itensRecentes).toHaveLength(5);
    expect(relatorio.trilhaExecucao.itensRecentes[0].events).toHaveLength(12);
  });
});
