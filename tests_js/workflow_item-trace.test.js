import { describe, expect, it } from "vitest";

import {
  TRILHA_EXECUCAO_PADRAO,
  formatarEventoTrilha,
  normalizarTrilhaExecucao,
  obterResumoTrilhaUI,
  registrarEventoItem,
  resetarTrilhaExecucao,
  serializarTrilhaParaRelatorio,
} from "../src/workflow/item-trace.ts";

function buildState(overrides = {}) {
  return {
    itemAtualKey: null,
    itemAtualTelaId: null,
    progresso: { atual: 0, total: 0, ultimoProcessado: null },
    trilhaExecucao: normalizarTrilhaExecucao(TRILHA_EXECUCAO_PADRAO),
    ...overrides,
  };
}

describe("workflow/item-trace", () => {
  it("reseta a trilha da rodada com runId e timestamps", () => {
    const estado = buildState();
    const trilha = resetarTrilhaExecucao(estado, { runId: "session_abc", now: 1000 });

    expect(trilha.runId).toBe("session_abc");
    expect(trilha.startedAtTs).toBe(1000);
    expect(trilha.lastEventSeq).toBe(0);
    expect(trilha.items).toEqual({});
  });

  it("cria item automaticamente, incrementa seq e evita duplicar item_aberto", () => {
    const estado = buildState();
    resetarTrilhaExecucao(estado, { runId: "run_1", now: 1000 });

    registrarEventoItem(estado, "320780", "item_aberto", {
      itemTelaId: "320780",
      resumo: "Item aberto para processamento",
      payload: { origem: "sincronizacao_tela" },
      status: "em_andamento",
      now: 1010,
    });
    registrarEventoItem(estado, "320780", "item_aberto", {
      itemTelaId: "320780",
      resumo: "duplicado",
      now: 1020,
    });
    registrarEventoItem(estado, "320780", "ncm_preenchido", {
      resumo: "NCM preenchido com 8471.30.12",
      payload: { valor: "8471.30.12" },
      now: 1030,
    });

    const item = estado.trilhaExecucao.items["320780"];
    expect(item.events).toHaveLength(2);
    expect(item.events[0].tipo).toBe("item_aberto");
    expect(item.events[1].seq).toBe(2);
    expect(estado.trilhaExecucao.lastEventSeq).toBe(2);
  });

  it("limita a trilha a 20 eventos por item", () => {
    const estado = buildState();
    resetarTrilhaExecucao(estado, { runId: "run_2", now: 1000 });

    for (let index = 0; index < 25; index += 1) {
      registrarEventoItem(estado, "320780", `evento_${index}`, {
        resumo: `Evento ${index}`,
        now: 1000 + index,
      });
    }

    const item = estado.trilhaExecucao.items["320780"];
    expect(item.events).toHaveLength(20);
    expect(item.events[0].tipo).toBe("evento_5");
    expect(item.events.at(-1)?.tipo).toBe("evento_24");
  });

  it("gera resumo de UI com item atual e ordem decrescente", () => {
    const estado = buildState({ itemAtualKey: "320780", itemAtualTelaId: "320780" });
    resetarTrilhaExecucao(estado, { runId: "run_3", now: 1000 });
    registrarEventoItem(estado, "320780", "item_aberto", {
      resumo: "Item aberto para processamento",
      now: 1010,
    });
    registrarEventoItem(estado, "320780", "relatorio_enviado", {
      resumo: "Relatório enviado com sucesso",
      now: 1050,
    });

    const resumo = obterResumoTrilhaUI(estado);
    expect(resumo.empty).toBe(false);
    expect(resumo.currentLabel).toBe("Item 320780");
    expect(resumo.events).toHaveLength(2);
    expect(resumo.events[0].tipo).toBe("relatorio_enviado");
    expect(formatarEventoTrilha(resumo.events[0]).texto).toContain("Relatório enviado com sucesso");
  });

  it("usa label amigável para evento de Lei 116", () => {
    const evento = formatarEventoTrilha({
      tipo: "lei116_preenchida",
      resumo: "",
      ts: Date.now(),
    });
    expect(evento.titulo).toBe("Lei 116 preenchida");
  });

  it("usa label amigável para evento de CEST", () => {
    const evento = formatarEventoTrilha({
      tipo: "cest_preenchido",
      resumo: "",
      ts: Date.now(),
    });
    expect(evento.titulo).toBe("CEST preenchido");
  });

  it("serializa trilha para relatório priorizando item atual e limitando eventos", () => {
    const estado = buildState({
      itemAtualKey: "320780",
      itemAtualTelaId: "320780",
      progresso: { atual: 2, total: 3, ultimoProcessado: "320779" },
    });
    resetarTrilhaExecucao(estado, { runId: "run_4", now: 1000 });

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

    const serializado = serializarTrilhaParaRelatorio(estado);
    expect(serializado.runId).toBe("run_4");
    expect(serializado.itemAtualKey).toBe("320780");
    expect(serializado.ultimoProcessado).toBe("320779");
    expect(serializado.itensRecentes).toHaveLength(5);
    expect(serializado.itensRecentes[0].itemKey).toBe("320780");
    expect(serializado.itensRecentes[0].events).toHaveLength(12);
  });
});
