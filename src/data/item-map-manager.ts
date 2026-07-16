/**
 * Gerenciador de mapeamento JSON por item (ID → NCM/UNSPSC).
 * Permite carregar um JSON com mapa de valores e aplicar por item.
 * Extraído do monólito (linhas 1102–1375).
 *
 * @contract  ── NÃO ALTERAR SEM REVISAR TODOS OS CONSUMIDORES ──
 *
 * Este módulo é o coração do sistema "JSON por item". Sua interface pública,
 * seletores DOM que ele lê, e propriedades do estado que ele manipula formam
 * um contrato estável com o HTML do painel e o workflow do executor.
 *
 * ▸ API pública exportada (não renomear/remover):
 *   parseJsonParaMapa, aplicarJson, aplicarParaItemAtual,
 *   getValoresParaItem, getValorAcao, obterItemIdAtual,
 *   sincronizarItemAtual, atualizarStatusUI, gerarJsonDoItemAtual,
 *   normalizarCest
 *
 * ▸ Tipos exportados:
 *   ItemMapEntry, ParseResult
 *
 * ▸ Elemento DOM atualizado:
 *   #itemMapStatus  → atualizarStatusUI() define .textContent e .style.color
 *
 * ▸ Seletores DOM lidos para ID do item (obterItemIdAtual):
 *   URL params: IdItem, idItem, itemId, ItemId
 *   #txtIdItem, #hfIdItem, #hidIdItem, #txtNum, #txtNumero
 *   + variantes input[name$=...] e input[id$=...]
 *
 * ▸ Seletores DOM lidos para geração (gerarJsonDoItemAtual):
 *   #txtNBS, #txtCest, #txtCodigoUnspsc, #txtCodUNSPSC
 *   + encontrarCampoNcmPreferido, encontrarCampoLei116Grupo/Subgrupo
 *
 * ▸ Propriedades do EstadoApp manipuladas:
 *   itemMapAtivo, itemMapJson, itemMap, itemMapUltimoAplicadoId,
 *   itemAtualKey, itemAtualTelaId, itemFlags
 *
 * Consumidores principais: painel-events.ts, painel-sections.ts,
 * executor.ts, item-flow.ts, progress-totals.ts
 */

import { CONFIG } from '../config/constants.ts';
import * as EstadoManager from '../core/estado-manager.ts';
import type { EstadoApp } from '../core/estado-manager.ts';
import { log } from '../core/log-manager.ts';
import * as AudioManager from '../interaction/audio-manager.ts';
import { obterAssinaturaLoteJson, sincronizarSnapshotLoteJson } from '../workflow/progress-totals.ts';
import {
    buscarElementoDeep,
    encontrarCampoLei116Grupo,
    encontrarCampoLei116Subgrupo,
    encontrarCampoNcmPreferido,
} from '../utils/selectors.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ItemMapEntry {
    ncm: string | null;
    nbs: string | null;
    cest: string | null;
    unspsc: string | null;
    lei116: string | null;
}

export interface ParseResult {
    map?: Record<string, ItemMapEntry>;
    warnings?: string[];
    empty?: boolean;
    error?: string;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------
function normalizarId(id: unknown): string | null {
    const s = String(id ?? '').trim();
    return s || null;
}

function normalizarValor(valor: unknown): string | null {
    const s = String(valor ?? '').trim();
    return s ? s : null;
}

function normalizarLei116(valor: unknown): string | null {
    const raw = normalizarValor(valor);
    if (!raw) return null;
    const normalizado = raw.replace(',', '.');
    return normalizado || null;
}

export function normalizarCest(valor: unknown): string | null {
    const raw = normalizarValor(valor);
    if (!raw) return null;
    const digits = raw.replace(/\D/g, '');
    if (digits.length !== 7) return raw;
    const codigo = `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 7)}`;
    const descricao = raw.match(/^\s*[\d.\s]+-\s*(.+)$/)?.[1]?.trim();
    return descricao ? `${codigo} - ${descricao}` : codigo;
}

function obterParametroUrl(nomes: string[]): string | null {
    try {
        const url = new URL(window.location.href);
        for (const nome of nomes) {
            const valor = normalizarId(url.searchParams.get(nome));
            if (valor) return valor;
        }
    } catch {
        /* ignore */
    }
    return null;
}

function ehValorNbs(valor: unknown): boolean {
    const raw = normalizarValor(valor);
    if (!raw) return false;
    return CONFIG.VALIDADORES.nbs.regex.test(raw);
}

interface ExtrairParteNumericaOptions {
    min?: number;
    max?: number;
}

function extrairParteNumerica(valor: unknown, { min = 1, max = 2 }: ExtrairParteNumericaOptions = {}): string | null {
    const raw = normalizarValor(valor);
    if (!raw) return null;
    if (/[<]/.test(raw)) return null;
    const digits = raw.replace(/\D/g, '');
    if (!digits || digits.length < min || digits.length > max) return null;
    return digits;
}

function extrairLei116DosCampos(valorGrupo: unknown, valorSubgrupo: unknown): string | null {
    const grupoRaw = normalizarLei116(valorGrupo);
    if (grupoRaw && CONFIG.VALIDADORES.lei116Servico.regex.test(grupoRaw)) {
        return grupoRaw;
    }

    const grupo = extrairParteNumerica(valorGrupo, { min: 1, max: 2 });
    const subgrupo = extrairParteNumerica(valorSubgrupo, { min: 1, max: 2 });
    if (!grupo || !subgrupo) return null;
    return `${String(Number.parseInt(grupo, 10))}.${subgrupo.padStart(2, '0').slice(-2)}`;
}

function extrairCampos(entry: unknown): ItemMapEntry {
    if (!entry || typeof entry !== 'object') return { ncm: null, nbs: null, cest: null, unspsc: null, lei116: null };
    const e = entry as Record<string, unknown>;
    const nbsExplicito = normalizarValor(e['nbs'] ?? e['NBS'] ?? e['Nbs']);
    const ncmRaw = normalizarValor(e['ncm'] ?? e['NCM'] ?? e['Ncm']);
    let ncm = ncmRaw;
    let nbs = nbsExplicito;
    if (!nbs && ehValorNbs(ncmRaw)) {
        nbs = ncmRaw;
        ncm = null;
    }
    const cest = normalizarCest(e['cest'] ?? e['CEST'] ?? e['Cest'] ?? e['codCest'] ?? e['codigoCest'] ?? e['codigoCEST']);
    const unspsc = normalizarValor(e['unspsc'] ?? e['UNSPSC'] ?? e['Unspsc']);
    const lei116 = normalizarLei116(e['lei116'] ?? e['Lei116'] ?? e['lei_116'] ?? e['LEI116']);
    return { ncm, nbs, cest, unspsc, lei116 };
}

// ---------------------------------------------------------------------------
// Parser e aplicação do JSON
// ---------------------------------------------------------------------------
export function parseJsonParaMapa(jsonText: string): ParseResult {
    const raw = String(jsonText ?? '').trim();
    if (!raw) return { map: {}, warnings: [], empty: true };

    let data: unknown;
    try {
        data = JSON.parse(raw);
    } catch (e) {
        return { error: `JSON inválido: ${(e as Error).message}` };
    }

    const map: Record<string, ItemMapEntry> = {};
    const warnings: string[] = [];

    const addEntry = (id: unknown, entryObj: unknown): void => {
        const idNorm = normalizarId(id);
        if (!idNorm) return;

        const campos = extrairCampos(entryObj);
        if (!campos.ncm && !campos.nbs && !campos.cest && !campos.unspsc && !campos.lei116) {
            warnings.push(`Item ${idNorm}: sem NCM, NBS, CEST, UNSPSC ou Lei 116`);
        }
        if (campos.ncm && !CONFIG.VALIDADORES.ncm.regex.test(campos.ncm)) {
            warnings.push(`Item ${idNorm}: NCM inválido (${campos.ncm})`);
        }
        if (campos.nbs && !CONFIG.VALIDADORES.nbs.regex.test(campos.nbs)) {
            warnings.push(`Item ${idNorm}: NBS inválido (${campos.nbs})`);
        }
        if (campos.cest && !CONFIG.VALIDADORES.cest.regex.test(campos.cest)) {
            warnings.push(`Item ${idNorm}: CEST inválido (${campos.cest})`);
        }
        if (campos.unspsc && !CONFIG.VALIDADORES.unspsc.regex.test(campos.unspsc)) {
            warnings.push(`Item ${idNorm}: UNSPSC inválido (${campos.unspsc})`);
        }
        if (campos.lei116 && !CONFIG.VALIDADORES.lei116Servico.regex.test(campos.lei116)) {
            warnings.push(`Item ${idNorm}: Lei 116 inválida (${campos.lei116})`);
        }

        map[idNorm] = campos;
    };

    if (Array.isArray(data)) {
        data.forEach((item) => {
            if (!item || typeof item !== 'object') return;
            const i = item as Record<string, unknown>;
            const id = i['id'] ?? i['ID'] ?? i['itemId'] ?? i['ItemId'] ?? i['codigo'] ?? i['Codigo'];
            addEntry(id, item);
        });
        return { map, warnings };
    }

    if (data && typeof data === 'object') {
        const d = data as Record<string, unknown>;
        const list = Array.isArray(d['itens']) ? d['itens'] as unknown[] : Array.isArray(d['items']) ? d['items'] as unknown[] : null;
        if (list) {
            list.forEach((item) => {
                if (!item || typeof item !== 'object') return;
                const i = item as Record<string, unknown>;
                const id = i['id'] ?? i['ID'] ?? i['itemId'] ?? i['ItemId'] ?? i['codigo'] ?? i['Codigo'];
                addEntry(id, item);
            });
        } else {
            Object.entries(d).forEach(([id, val]) => {
                if (id === 'itens' || id === 'items') return;
                if (val && typeof val === 'object') addEntry(id, val);
                else addEntry(id, { ncm: val });
            });
        }
        return { map, warnings };
    }

    return { error: 'JSON deve ser um objeto ou array.' };
}

// ---------------------------------------------------------------------------
// Item ID do DOM
// ---------------------------------------------------------------------------
export function obterItemIdAtual(): string | null {
    const idUrl = obterParametroUrl(['IdItem', 'idItem', 'itemId', 'ItemId']);
    if (idUrl) return idUrl;

    const campo = buscarElementoDeep('#txtIdItem') ||
        buscarElementoDeep('input[name$="txtIdItem"]') ||
        buscarElementoDeep('input[id$="txtIdItem"]') ||
        buscarElementoDeep('#hfIdItem') ||
        buscarElementoDeep('input[name$="hfIdItem"]') ||
        buscarElementoDeep('input[id$="hfIdItem"]') ||
        buscarElementoDeep('#hidIdItem') ||
        buscarElementoDeep('input[name$="hidIdItem"]') ||
        buscarElementoDeep('input[id$="hidIdItem"]') ||
        buscarElementoDeep('input[name$="IdItem"]') ||
        buscarElementoDeep('input[id$="IdItem"]') ||
        buscarElementoDeep('#txtNum') ||
        buscarElementoDeep('input[name="ctl00$Body$txtNum"]') ||
        buscarElementoDeep('input[name$="txtNum"]') ||
        buscarElementoDeep('#txtNumero') ||
        buscarElementoDeep('input[name="ctl00$Body$txtNumero"]') ||
        buscarElementoDeep('input[name$="txtNumero"]') ||
        buscarElementoDeep('input[id$="txtNumero"]');
    const valor = (campo as HTMLInputElement)?.value ?? campo?.getAttribute?.('value');
    return normalizarId(valor);
}

function resolverItemMapIdAtual(estado: EstadoApp): string | null {
    return normalizarId(estado.itemAtualTelaId) || obterItemIdAtual();
}

// ---------------------------------------------------------------------------
// Sincronizar item
// ---------------------------------------------------------------------------
export function sincronizarItemAtual(estado: EstadoApp): string | null {
    const idAtual = obterItemIdAtual();
    if (!idAtual) return estado.itemAtualKey || null;

    const houveMudancaTela = estado.itemAtualTelaId !== idAtual;
    if (houveMudancaTela) {
        estado.itemAtualTelaId = idAtual;
    }

    if (!estado.itemAtualKey) {
        estado.itemAtualKey = idAtual;
        estado.itemFlags = estado.itemFlags || {};
        if (!estado.itemFlags[idAtual]) estado.itemFlags[idAtual] = { unspscFeito: false };
        estado.itemMapUltimoAplicadoId = null;
        EstadoManager.set(estado);
        log(`🔖 Item atual detectado: ${idAtual}`, 'info');
        return idAtual;
    }

    if (houveMudancaTela) {
        EstadoManager.set(estado);
        if (estado.itemAtualKey !== idAtual) {
            log(`🔎 ID tela=${idAtual} | item processamento=${estado.itemAtualKey} (mantendo item do lote)`, 'info');
        }
    }

    return estado.itemAtualKey || idAtual;
}

// ---------------------------------------------------------------------------
// Consultar valores do mapa
// ---------------------------------------------------------------------------
export function getValoresParaItem(estado: EstadoApp, itemId: string | null | undefined): ItemMapEntry | null {
    if (!estado.itemMapAtivo) return null;
    const id = normalizarId(itemId);
    if (!id) return null;
    return (estado.itemMap as Record<string, ItemMapEntry>)[id] || null;
}

export function getValorAcao(acaoId: string, estado: EstadoApp): string | null {
    const acao = estado.acoes?.[acaoId];
    if (!acao) return null;

    if (!estado.itemMapAtivo || (acaoId !== 'ncm' && acaoId !== 'cest' && acaoId !== 'unspsc' && acaoId !== 'lei116Servico')) return acao.valor;

    const idAtual = resolverItemMapIdAtual(estado);
    const entry = getValoresParaItem(estado, idAtual);
    if (!entry) return null;

    const campoNbs = buscarElementoDeep('#txtNBS') || buscarElementoDeep('input[name$="txtNBS"]');
    const campoIncideNbs = buscarElementoDeep('#txtIncideNBS') || buscarElementoDeep('input[name$="txtIncideNBS"]');
    const incideNbs = String((campoIncideNbs as HTMLInputElement)?.value ?? (campoIncideNbs as HTMLElement)?.textContent ?? '').trim().toUpperCase() === 'SIM';
    const modoServico = !!(
        entry.nbs
        || normalizarLei116(entry.lei116)
        || (entry.ncm && ehValorNbs(entry.ncm))
        || (campoNbs && incideNbs)
    );
    if (acaoId === 'ncm') {
        const valorFiscal = modoServico
            ? (entry.nbs || (ehValorNbs(entry.ncm) ? entry.ncm : null))
            : entry.ncm;
        return valorFiscal != null ? valorFiscal : (modoServico ? null : acao.valor);
    }

    const valor = acaoId === 'cest' ? entry.cest : (acaoId === 'unspsc' ? entry.unspsc : entry.lei116);
    return valor != null ? valor : acao.valor;
}

// ---------------------------------------------------------------------------
// Aplicar JSON + status UI
// ---------------------------------------------------------------------------
interface AplicarJsonOptions {
    silent?: boolean;
}

export function aplicarJson(jsonText: string, { silent = false }: AplicarJsonOptions = {}): { ok: boolean; warnings?: string[]; error?: string } {
    const estado = EstadoManager.get();
    const assinaturaAnterior = obterAssinaturaLoteJson(estado);
    const rawJson = String(jsonText ?? '');
    estado.itemMapJson = rawJson;

    const parsed = parseJsonParaMapa(rawJson);
    if (parsed.error) {
        EstadoManager.set(estado);
        if (!silent) {
            log(`❌ JSON inválido: ${parsed.error}`, 'error');
            AudioManager.tocar('error');
        }
        atualizarStatusUI(estado);
        return { ok: false, error: parsed.error };
    }

    if (parsed.empty) {
        estado.itemMap = {};
        estado.itemMapAtivo = false;
        estado.itemMapUltimoAplicadoId = null;
        const progresso = estado.progresso as unknown as Record<string, unknown>;
        progresso['loteJsonAssinatura'] = null;
        EstadoManager.set(estado);
        if (!silent) {
            log('🧹 JSON vazio: mapa limpo e desativado', 'info');
            AudioManager.tocar('warning');
        }
        atualizarStatusUI(estado);
        return { ok: true, warnings: [] };
    }

    estado.itemMap = parsed.map || {};
    estado.itemMapAtivo = true;
    estado.itemMapUltimoAplicadoId = null;
    const assinaturaNova = obterAssinaturaLoteJson(estado);
    sincronizarSnapshotLoteJson(estado, { reiniciar: assinaturaAnterior !== assinaturaNova });
    EstadoManager.set(estado);

    if (!silent) {
        const total = Object.keys(estado.itemMap).length;
        log(`🧾 JSON aplicado: ${total} itens carregados`, 'info');
        if (parsed.warnings?.length) {
            const resumo = parsed.warnings.slice(0, 3).join(' | ');
            log(`⚠️ JSON: ${resumo}${parsed.warnings.length > 3 ? ' ...' : ''}`, 'warn');
        }
        AudioManager.tocar('success');
    }

    atualizarStatusUI(estado);
    return { ok: true, warnings: parsed.warnings || [] };
}

export function aplicarParaItemAtual(estado: EstadoApp): ItemMapEntry | null {
    if (!estado.itemMapAtivo) {
        atualizarStatusUI(estado);
        return null;
    }

    const idAtual = resolverItemMapIdAtual(estado);
    if (!idAtual) {
        atualizarStatusUI(estado);
        return null;
    }

    const entry = getValoresParaItem(estado, idAtual);
    if (entry && estado.itemMapUltimoAplicadoId !== idAtual) {
        log(`🧾 JSON aplicado ao item ${idAtual}: NCM ${entry.ncm || '-'} / NBS ${entry.nbs || '-'} / CEST ${entry.cest || '-'} / UNSPSC ${entry.unspsc || '-'} / Lei116 ${entry.lei116 || '-'}`, 'info');
        estado.itemMapUltimoAplicadoId = idAtual;
        EstadoManager.set(estado);
    }

    atualizarStatusUI(estado, { itemId: idAtual, entry: entry ?? undefined });
    return entry;
}

interface AtualizarStatusUIOptions {
    itemId?: string;
    entry?: ItemMapEntry;
}

export function atualizarStatusUI(estado: EstadoApp, { itemId, entry }: AtualizarStatusUIOptions = {}): void {
    const el = document.getElementById('itemMapStatus');
    if (!el) return;

    const ativo = !!estado.itemMapAtivo;
    const total = Object.keys(estado.itemMap || {}).length;
    const idAtual = itemId || resolverItemMapIdAtual(estado) || estado.itemAtualKey;
    const dados = entry || (idAtual ? (estado.itemMap as Record<string, ItemMapEntry>)[idAtual] : null);

    let texto = ativo ? `JSON ativo: ${total} itens.` : 'JSON por ID desativado.';
    if (ativo && idAtual) {
        if (dados) texto += ` Item ${idAtual}: NCM ${dados.ncm || '-'} / NBS ${dados.nbs || '-'} / CEST ${dados.cest || '-'} / UNSPSC ${dados.unspsc || '-'} / Lei116 ${dados.lei116 || '-'}.`;
        else texto += ` Item ${idAtual}: sem entrada no JSON.`;
    }

    el.textContent = texto;
    el.style.color = ativo ? '#0b7285' : '#666';
}

export function gerarJsonDoItemAtual(textareaEl: HTMLTextAreaElement | null): void {
    const estado = EstadoManager.get();
    const idAtual = resolverItemMapIdAtual(estado) || estado.itemAtualKey;
    if (!idAtual) {
        log('⚠️ Não foi possível localizar o ID do item atual (#txtNum)', 'warn');
        AudioManager.tocar('warning');
        return;
    }

    const campoNcm = encontrarCampoNcmPreferido(estado.acoes?.['ncm']?.seletor ?? '');
    const campoNbs = buscarElementoDeep('#txtNBS') || buscarElementoDeep('input[name$="txtNBS"]');
    const campoCest = buscarElementoDeep('#txtCest') || buscarElementoDeep('input[name$="txtCest"]');
    const campoUnspsc = buscarElementoDeep('#txtCodigoUnspsc, #txtCodUNSPSC')
        || buscarElementoDeep('input[name$="txtCodigoUnspsc"], input[name$="txtCodUNSPSC"]');
    const campoLei116Grupo = encontrarCampoLei116Grupo();
    const campoLei116Subgrupo = encontrarCampoLei116Subgrupo();
    let ncm = normalizarValor((campoNcm as HTMLInputElement)?.value) || normalizarValor(estado.acoes?.['ncm']?.valor);
    let nbs = normalizarValor((campoNbs as HTMLInputElement)?.value);
    if (!nbs && ehValorNbs(ncm)) {
        nbs = ncm;
        ncm = null;
    }
    const unspsc = normalizarValor((campoUnspsc as HTMLInputElement)?.value) || normalizarValor(estado.acoes?.['unspsc']?.valor);
    const cest = normalizarCest((campoCest as HTMLInputElement)?.value) || normalizarCest(estado.acoes?.['cest']?.valor);
    const lei116 = extrairLei116DosCampos((campoLei116Grupo as HTMLInputElement)?.value, (campoLei116Subgrupo as HTMLInputElement)?.value);

    if (!ncm && !nbs && !cest && !unspsc && !lei116) {
        log('⚠️ Não foi possível ler NCM, NBS, CEST, UNSPSC ou Lei 116 para montar o JSON', 'warn');
        AudioManager.tocar('warning');
        return;
    }

    const rawAtual = textareaEl ? textareaEl.value : estado.itemMapJson;
    const parsed = parseJsonParaMapa(rawAtual);
    if (parsed.error && rawAtual.trim()) {
        log('⚠️ JSON atual inválido. Criando novo mapa.', 'warn');
    }
    const map: Record<string, ItemMapEntry> = parsed.error ? {} : (parsed.map || {});
    map[idAtual] = { ncm: ncm || null, nbs: nbs || null, cest: cest || null, unspsc: unspsc || null, lei116: lei116 || null };

    const jsonFinal = JSON.stringify(map, null, 2);
    if (textareaEl) textareaEl.value = jsonFinal;

    aplicarJson(jsonFinal, { silent: true });
    log(`🧾 JSON criado/atualizado para item ${idAtual}`, 'info');
    AudioManager.tocar('success');
}
