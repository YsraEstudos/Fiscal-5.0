import { CONFIG } from '../../../config/constants.ts';
import type { EstadoApp } from '../../../core/estado-manager.ts';
import { getValoresParaItem } from '../../../data/item-map-manager.ts';
import { normalizarTextoSemAcento } from '../../../utils/text.ts';

export interface Lei116Parsed {
    grupo: string;
    subgrupo: string;
    valor: string;
}

export type CampoFiscal = 'NCM' | 'NBS';
export type OrigemValorFiscal = 'json' | 'json_legacy_ncm' | 'perfil';

export interface ItemFiscalEntry {
    ncm?: unknown;
    nbs?: unknown;
    cest?: unknown;
    lei116?: unknown;
}

export function ehValorNbs(valor: unknown): boolean {
    const raw = String(valor ?? '').trim();
    return !!raw && CONFIG.VALIDADORES.nbs.regex.test(raw);
}

export function campoLei116EhPlaceholder(valor: unknown): boolean {
    const raw = normalizarTextoSemAcento(String(valor ?? ''));
    if (!raw) return true;
    return raw.includes('< nao definido >') || raw.includes('< nao aplicavel >');
}

export function normalizarLei116(valor: unknown): Lei116Parsed | null {
    const raw = String(valor ?? '').trim().replaceAll(',', '.');
    if (!raw) return null;
    const m = raw.match(/^(\d{1,2})\.(\d{2})$/);
    if (!m) return null;
    return {
        grupo: String(Number.parseInt(m[1], 10)),
        subgrupo: m[2],
        valor: `${String(Number.parseInt(m[1], 10))}.${m[2]}`,
    };
}

export function obterEntradaItem(estado: EstadoApp): ItemFiscalEntry | null {
    const estadoAny = estado as unknown as Record<string, unknown>;
    const itemId = estadoAny['itemAtualTelaId'] || estadoAny['itemAtualKey'];
    return getValoresParaItem(estado, itemId as string) || null;
}

export function resolverOrigemValorFiscal(estado: EstadoApp, valorFiscal: unknown, campoFiscal: CampoFiscal): OrigemValorFiscal {
    const entry = obterEntradaItem(estado);
    if (!entry) return 'perfil';
    if (campoFiscal === 'NBS') {
        if (entry.nbs === valorFiscal) return 'json';
        if (!entry.nbs && entry.ncm === valorFiscal && ehValorNbs(entry.ncm)) return 'json_legacy_ncm';
        return 'perfil';
    }
    return entry.ncm && entry.ncm === valorFiscal ? 'json' : 'perfil';
}

/**
 * Compara o texto renderizado na opção do dropdown (Klassmatt) com o valor procurado.
 * Lida com formatação complexa ("00. NAO APLICAVEL", "07.02. Execução...") e garante
 * match exato da parte numérica decompondo em [grupo, subgrupo].
 */
export function textoCombinaOpcaoLei116(textoOpcao: string | null | undefined, valorAlvo: string | null | undefined): boolean {
    const opcao = String(textoOpcao || '').replaceAll(/\s+/g, ' ').trim().toUpperCase();
    const alvo = String(valorAlvo || '').trim().toUpperCase();
    if (!opcao || !alvo) return false;

    if (opcao.includes('NAO APLICAVEL') || opcao.includes('NÃO APLICÁVEL')) {
        return alvo === '00' || alvo.includes('NAO APLICAVEL') || alvo.includes('NÃO APLICÁVEL');
    }

    if (opcao === alvo) {
        return true;
    }

    const matchOpcao = opcao.match(/^(\d{1,2})(?:\.(\d{1,2}))?/);
    const matchAlvo = alvo.match(/^(\d{1,2})(?:\.(\d{1,2}))?/);

    if (matchOpcao && matchAlvo) {
        const grupoOpcao = Number.parseInt(matchOpcao[1], 10);
        const subOpcao = matchOpcao[2] !== undefined ? Number.parseInt(matchOpcao[2], 10) : null;
        const grupoAlvo = Number.parseInt(matchAlvo[1], 10);
        const subAlvo = matchAlvo[2] !== undefined ? Number.parseInt(matchAlvo[2], 10) : null;

        if (subOpcao !== null && subAlvo !== null) {
            return grupoOpcao === grupoAlvo && subOpcao === subAlvo;
        }

        if (subOpcao === null && subAlvo === null) {
            return grupoOpcao === grupoAlvo;
        }

        if (subOpcao !== null && subAlvo === null) {
            return subOpcao === grupoAlvo;
        }

        return false;
    }

    return (
        opcao.startsWith(`${alvo} `)
        || opcao.startsWith(`${alvo}-`)
        || opcao.startsWith(`${alvo} -`)
    );
}
