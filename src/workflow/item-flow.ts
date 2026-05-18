import { log } from '../core/log-manager.ts';
import * as EstadoManager from '../core/estado-manager.ts';
import type { EstadoApp } from '../core/estado-manager.ts';
import * as ItemMapManager from '../data/item-map-manager.ts';
import * as Estimativa from './estimativa.ts';
import * as ItemTrace from './item-trace.ts';
import * as PaginaVerificador from './pagina-verificador.ts';
import { contarConcluidosEfetivos, normalizarItemKey, obterConcluidosSet } from './progress-totals.ts';

export type SkipMotivoItem = 'item_vermelho' | 'problema_imagem' | 'subgrupo_invalido';

function estaNaTelaListaItens(): boolean {
    const temFiltroLista = !!document.querySelector('#ddlOpcao');
    const temContainerResultado = !!document.querySelector('#DIVResultado');
    const temLinkItem = !!document.querySelector('#DIVResultado a[href*="abreSIN("]');
    return (temFiltroLista && temContainerResultado) || temLinkItem;
}

function itemExisteNoJsonAtivo(estado: EstadoApp, itemKey: string | null | undefined): boolean {
    const key = normalizarItemKey(itemKey);
    if (!estado?.itemMapAtivo || !key) return false;
    return !!ItemMapManager.getValoresParaItem(estado, key);
}

export function limparContextoTelaStaleSeNecessario(estado: EstadoApp): boolean {
    const itemTelaAtual = normalizarItemKey(ItemMapManager.obterItemIdAtual());
    if (itemTelaAtual) return false;
    if (!estaNaTelaListaItens()) return false;

    const estadoAny = estado as unknown as Record<string, unknown>;
    if (!estadoAny['itemAtualTelaId'] && !estadoAny['itemMapUltimoAplicadoId']) return false;

    EstadoManager.update((e: EstadoApp) => {
        const eAny = e as unknown as Record<string, unknown>;
        eAny['itemAtualTelaId'] = null;
        eAny['itemMapUltimoAplicadoId'] = null;
    });
    return true;
}

export function tratarItemSemJsonNaRodada(
    estado: EstadoApp,
    status: HTMLElement | null,
    pausarComAviso: (mensagem: string, opts?: { alertUser?: boolean; tipo?: string }) => void
): boolean {
    const itemTelaId = normalizarItemKey(ItemMapManager.obterItemIdAtual());
    if (!estado.itemMapAtivo) {
        const itemKey = itemTelaId || normalizarItemKey(estado.itemAtualKey);
        if (itemKey) {
            EstadoManager.update((e: EstadoApp) => {
                ItemTrace.registrarEventoItem(
                    e as Parameters<typeof ItemTrace.registrarEventoItem>[0],
                    itemKey,
                    'json_inativo',
                    {
                        itemTelaId: itemTelaId || itemKey,
                        resumo: 'JSON ativo obrigatório ausente',
                        payload: {
                            itemKey,
                            itemTelaId,
                            motivo: 'json_inativo',
                            somenteNestaRodada: false,
                        },
                        status: 'pausado',
                        now: Date.now(),
                    }
                );
            });
        }

        const mensagem = itemTelaId
            ? `Item ${itemTelaId} aberto na tela, mas não há JSON ativo. Aplique um JSON antes de retomar o robô.`
            : 'Não há JSON ativo. Aplique um JSON antes de retomar o robô.';
        if (status) {
            status.textContent = mensagem;
            status.style.color = '#d97706';
        }

        pausarComAviso(mensagem, { alertUser: false, tipo: 'json_inativo' });
        return true;
    }

    if (!itemTelaId || itemExisteNoJsonAtivo(estado, itemTelaId)) return false;

    EstadoManager.update((e: EstadoApp) => {
        const eAny = e as unknown as Record<string, unknown>;
        ItemTrace.registrarEventoItem(
            e as Parameters<typeof ItemTrace.registrarEventoItem>[0],
            itemTelaId,
            'item_sem_json',
            {
                itemTelaId,
                resumo: 'Item fora do JSON ativo',
                payload: {
                    itemKey: (eAny['itemAtualKey'] as string | null) || null,
                    itemTelaId,
                    motivo: 'sem_json_ativo',
                    somenteNestaRodada: false,
                },
                status: 'pausado',
                now: Date.now(),
            }
        );
    });

    const mensagem = `Item ${itemTelaId} aberto na tela não existe no JSON ativo. Revise o lote antes de retomar o robô.`;
    if (status) {
        status.textContent = mensagem;
        status.style.color = '#d97706';
    }

    pausarComAviso(mensagem, { alertUser: false, tipo: 'item_sem_json' });
    return true;
}

export function marcarItemConcluido(
    estado: EstadoApp,
    itemKey: string | null | undefined,
    { now = Date.now() } = {}
): ReturnType<typeof Estimativa.registrarConclusaoItem> {
    const key = normalizarItemKey(itemKey)
        || normalizarItemKey(estado?.itemAtualKey)
        || normalizarItemKey((estado as unknown as Record<string, unknown>)['itemAtualTelaId']);
    const concluidosSet = obterConcluidosSet(estado);
    if (key) concluidosSet.add(key);
    const prog = estado.progresso as unknown as Record<string, unknown>;
    prog['concluidosIds'] = [...concluidosSet];
    if (key) prog['ultimoProcessado'] = key;
    const concluidosEfetivos = contarConcluidosEfetivos(estado, concluidosSet);
    prog['atual'] = concluidosEfetivos;
    const estat = estado.estatisticas as unknown as Record<string, unknown>;
    estat['processados'] = concluidosEfetivos;
    return Estimativa.registrarConclusaoItem(estado as Parameters<typeof Estimativa.registrarConclusaoItem>[0], key, now);
}

export function inicializarFlagsItemAtual(estado: EstadoApp, key: string): void {
    log(`🔖 Iniciando item ID: ${key}`, 'info');
    EstadoManager.update((e: EstadoApp) => {
        const eUpd = e as unknown as Record<string, unknown>;
        eUpd['itemAtualKey'] = key;
        eUpd['itemAtualTelaId'] = null;
        eUpd['itemMapUltimoAplicadoId'] = null;
        eUpd['itemFlags'] = eUpd['itemFlags'] || {};
        const itemFlags = eUpd['itemFlags'] as Record<string, Record<string, unknown>>;
        const atual = itemFlags[key] || {};
        const repAtual = (atual['reporting'] as Record<string, unknown>) || {};
        itemFlags[key] = {
            ...atual,
            unspscFeito: false,
            unspscModoDetectado: null,
            unspscInlinePostbackTentado: false,
            unspscInlineFallbackTentado: false,
            unspscInlineValorTentado: null,
            ncmValidacaoPendenteAte: 0,
            ncmValidacaoAvisada: false,
            reporting: {
                ...repAtual,
                mediaDone: false,
                acompanhamentoDone: false,
                reportDone: false,
                mediaError: null,
                mediaErrorCode: null,
                acompanhamentoError: null,
                acompanhamentoErrorCode: null,
                reportError: null,
                reportErrorCode: null
            }
        };
    });
}

export function marcarItemParaPularNestaRodada(
    estado: EstadoApp,
    itemKey: string | null | undefined,
    motivo: SkipMotivoItem,
    mensagem: string = '',
    aliases: Array<string | null | undefined> = []
): string | null {
    const key = normalizarItemKey(itemKey)
        || normalizarItemKey(estado?.itemAtualKey)
        || normalizarItemKey((estado as unknown as Record<string, unknown>)['itemAtualTelaId']);
    if (!key) return null;

    const aliasesNormalizados = [...new Set(
        aliases
            .map((alias) => normalizarItemKey(alias))
            .filter((alias): alias is string => !!alias && alias !== key)
    )];

    EstadoManager.update((e: EstadoApp) => {
        const eAny = e as unknown as Record<string, unknown>;
        eAny['itemFlags'] = eAny['itemFlags'] || {};
        const itemFlags = eAny['itemFlags'] as Record<string, Record<string, unknown>>;
        const atual = itemFlags[key] || {};
        itemFlags[key] = {
            ...atual,
            skipNestaRodada: true,
            skipMotivo: motivo,
            skipMensagem: mensagem || null,
            skipDetectadoEm: Date.now(),
            skipAliases: aliasesNormalizados,
        };

        aliasesNormalizados.forEach((alias) => {
            const aliasAtual = itemFlags[alias] || {};
            itemFlags[alias] = {
                ...aliasAtual,
                skipNestaRodada: true,
                skipMotivo: motivo,
                skipMensagem: mensagem || null,
                skipDetectadoEm: Date.now(),
                skipOrigem: key,
            };
        });

        ItemTrace.registrarEventoItem(
            e as Parameters<typeof ItemTrace.registrarEventoItem>[0],
            key,
            'item_pulado_na_rodada',
            {
                itemTelaId: normalizarItemKey(eAny['itemAtualTelaId']) || key,
                resumo: motivo === 'problema_imagem'
                    ? 'Item pulado por problema visual'
                    : motivo === 'subgrupo_invalido'
                        ? 'Item pulado por Sub Grupo inválido'
                        : 'Item pulado por marcação vermelha',
                payload: { motivo, mensagem, aliases: aliasesNormalizados },
                status: 'pausado',
                now: Date.now(),
            }
        );
    });

    return key;
}

export function registrarItemAberto(estado: EstadoApp, itemSincronizado: string): void {
    EstadoManager.update((e: EstadoApp) => {
        const eAny = e as unknown as Record<string, unknown>;
        ItemTrace.registrarEventoItem(
            e as Parameters<typeof ItemTrace.registrarEventoItem>[0],
            (eAny['itemAtualKey'] as string) || itemSincronizado,
            'item_aberto',
            {
                itemTelaId: (eAny['itemAtualTelaId'] as string) || itemSincronizado,
                resumo: 'Item aberto para processamento',
                payload: {
                    itemTelaId: (eAny['itemAtualTelaId'] as string) || itemSincronizado,
                    origem: 'sincronizacao_tela',
                },
                status: 'em_andamento',
                now: Date.now(),
            }
        );
    });
}

export function registrarInicioItemSeNecessario(estado: EstadoApp, itemSincronizado: string): void {
    const estAtualAny = estado as unknown as Record<string, unknown>;
    if ((estAtualAny['estimativa'] as Record<string, unknown>)?.['itemAtualId'] === itemSincronizado) return;

    EstadoManager.update((e: EstadoApp) => {
        const eAny = e as unknown as Record<string, unknown>;
        const itemLogico = (eAny['itemAtualKey'] as string) || itemSincronizado || (eAny['itemAtualTelaId'] as string);
        Estimativa.registrarInicioItem(e as Parameters<typeof Estimativa.registrarInicioItem>[0], itemLogico, Date.now());
    });
}
