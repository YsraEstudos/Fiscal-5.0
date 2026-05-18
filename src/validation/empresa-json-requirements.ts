import { buscarElementoDeep } from '../utils/selectors.ts';

export type CampoJsonEmpresa = 'ncm' | 'nbs' | 'cest' | 'unspsc' | 'lei116';

export interface ItemJsonEmpresa {
    ncm?: string | null;
    nbs?: string | null;
    cest?: string | null;
    unspsc?: string | null;
    lei116?: string | null;
}

export interface AvaliarCamposObrigatoriosOptions {
    empresa: string | null | undefined;
    itemId: string | null | undefined;
    entry: ItemJsonEmpresa | null | undefined;
    liberados?: string[];
}

export interface ResultadoCamposObrigatorios {
    valido: boolean;
    empresa: string | null;
    itemId: string | null;
    camposFaltantes: CampoJsonEmpresa[];
    mensagem: string;
}

type RegraEmpresa = {
    ncm?: boolean;
    cestQuandoNcm?: boolean;
    lei116QuandoNbs?: boolean;
    unspsc?: boolean;
};

const REGRAS_EMPRESA: Record<string, RegraEmpresa> = {
    BAHIAGAS: { ncm: true },
    BONDINHO: { ncm: true },
    CARMOENERGY: { ncm: true, lei116QuandoNbs: true },
    CEI: { ncm: true },
    CITROSUCO: { ncm: true, lei116QuandoNbs: true },
    GILBARCO: { ncm: true, lei116QuandoNbs: true, unspsc: true },
    'GRUPO SADA': { ncm: true, lei116QuandoNbs: true, unspsc: true },
    INTERCEMENT: { ncm: true, lei116QuandoNbs: true },
    'MAC ENG.': { ncm: true, lei116QuandoNbs: true, unspsc: true },
    'MAC ENG': { ncm: true, lei116QuandoNbs: true, unspsc: true },
    MOSAIC: { unspsc: true },
    NPE: { ncm: true, lei116QuandoNbs: true },
    ORIZON: { ncm: true, lei116QuandoNbs: true, unspsc: true },
    RODONAVES: { ncm: true, cestQuandoNcm: true, lei116QuandoNbs: true },
    SIEMENS: { ncm: true, lei116QuandoNbs: true, unspsc: true },
    VAXXINOVA: { ncm: true, lei116QuandoNbs: true, unspsc: true },
    VOPAK: { ncm: true, lei116QuandoNbs: true, unspsc: true },
};

function normalizarEspacosLocal(valor: unknown): string {
    return String(valor ?? '').replace(/\s+/g, ' ').trim();
}

function normalizarEmpresa(valor: unknown): string | null {
    const raw = normalizarEspacosLocal(valor);
    if (!raw) return null;
    return raw.toUpperCase();
}

function temValor(valor: unknown): boolean {
    return String(valor ?? '').trim() !== '';
}

function labelCampo(campo: CampoJsonEmpresa): string {
    if (campo === 'ncm') return 'NCM';
    if (campo === 'nbs') return 'NBS';
    if (campo === 'cest') return 'CEST';
    if (campo === 'unspsc') return 'UNSPSC';
    return 'Lei 116';
}

function montarMensagem(empresa: string, itemId: string | null, campos: CampoJsonEmpresa[], entry: ItemJsonEmpresa): string {
    const labels = campos.map(labelCampo).join(', ');
    const contexto = campos.includes('cest') && temValor(entry.ncm)
        ? ' para item com NCM no JSON'
        : campos.includes('lei116') && temValor(entry.nbs)
            ? ' para serviço com NBS no JSON'
            : '';
    const item = itemId ? ` do item ${itemId}` : '';
    return `${empresa} exige ${labels}${contexto}${item}. Continuar mesmo assim?`;
}

export function obterEmpresaAtual(): string | null {
    const el = buscarElementoDeep('#lblUsuario') || document.querySelector('#lblUsuario');
    const raw = normalizarEspacosLocal(el?.textContent || '');
    if (!raw) return null;
    const parts = raw.split('//').map((p) => normalizarEmpresa(p)).filter(Boolean);
    return parts.length >= 2 ? parts[1] : normalizarEmpresa(raw);
}

export function avaliarCamposObrigatoriosJsonEmpresa({
    empresa,
    itemId,
    entry,
    liberados = [],
}: AvaliarCamposObrigatoriosOptions): ResultadoCamposObrigatorios {
    const empresaNorm = normalizarEmpresa(empresa);
    const itemNorm = normalizarEspacosLocal(itemId) || null;
    const regra = empresaNorm ? REGRAS_EMPRESA[empresaNorm] : null;
    const dados = entry || {};
    if (!empresaNorm || !regra || !entry) {
        return { valido: true, empresa: empresaNorm, itemId: itemNorm, camposFaltantes: [], mensagem: '' };
    }

    const liberadosSet = new Set(liberados);
    const faltantes: CampoJsonEmpresa[] = [];
    const pareceServico = temValor(dados.nbs) || temValor(dados.lei116);

    if (regra.ncm && !pareceServico && !temValor(dados.ncm) && !liberadosSet.has('ncm')) {
        faltantes.push('ncm');
    }
    if (regra.cestQuandoNcm && temValor(dados.ncm) && !temValor(dados.cest) && !liberadosSet.has('cest')) {
        faltantes.push('cest');
    }
    if (regra.lei116QuandoNbs && temValor(dados.nbs) && !temValor(dados.lei116) && !liberadosSet.has('lei116')) {
        faltantes.push('lei116');
    }
    if (regra.unspsc && !temValor(dados.unspsc) && !liberadosSet.has('unspsc')) {
        faltantes.push('unspsc');
    }

    return {
        valido: faltantes.length === 0,
        empresa: empresaNorm,
        itemId: itemNorm,
        camposFaltantes: faltantes,
        mensagem: faltantes.length ? montarMensagem(empresaNorm, itemNorm, faltantes, dados) : '',
    };
}
