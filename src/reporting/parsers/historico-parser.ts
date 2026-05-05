/**
 * Parser de histórico (Historico.aspx / Acompanhamento da SAI).
 * Implementa strategy strict (DOM estruturado) + loose (texto bruto) com fallback.
 * Extraído do monólito — RelatorioItemManager (funções de parsing de histórico).
 */

import { CONFIG } from '../../config/constants.ts';
import { normalizarEspacos, normalizarTextoSemAcento } from '../../utils/text.ts';

// ---------------------------------------------------------------------------
// NCM detection helpers
// ---------------------------------------------------------------------------
function normalizarCodigoNcm(raw: string | null): string | null {
    const digits = String(raw || '').replace(/\D/g, '');
    if (digits.length !== 8) return null;
    return `${digits.slice(0, 4)}.${digits.slice(4, 6)}.${digits.slice(6, 8)}`;
}

export interface NcmDetectionResult {
    keywordMention: boolean;
    formattedCodes: string[];
    unformattedCodes: string[];
}

export function detectarMencoesNcmEvento(texto: string | null): NcmDetectionResult {
    const src = normalizarEspacos(texto || '');
    if (!src) {
        return { keywordMention: false, formattedCodes: [], unformattedCodes: [] };
    }

    const norm = normalizarTextoSemAcento(src).toLowerCase();
    const keywordMention = /\bn\.?\s*c\.?\s*m\b|\bncm\b/i.test(norm);
    const contextoNcm = keywordMention || /(classificac[aã]o\s*fiscal|codigo\s*ncm|cod\.?\s*ncm)/i.test(norm);

    const formattedMatch = src.match(/\b\d{4}\.\d{2}\.\d{2}\b/g) || [];
    const formatted = [...new Set(formattedMatch
        .map(normalizarCodigoNcm)
        .filter((c): c is string => Boolean(c)))];

    const unformattedMatch = src.match(/\b\d{8}\b/g) || [];
    const unformatted = contextoNcm
        ? [...new Set(unformattedMatch
            .map(normalizarCodigoNcm)
            .filter((c): c is string => Boolean(c)))]
        : [];

    return { keywordMention, formattedCodes: formatted, unformattedCodes: unformatted };
}

// ---------------------------------------------------------------------------
// Consolidação de histórico
// ---------------------------------------------------------------------------
export interface EventoRaw {
    dia: string;
    hora: string;
    usuario: string | null;
    descricao: string;
    descricaoHtml?: string;
    yellowComments?: string[];
}

export interface TimelineTransition {
    dia: string;
    hora: string;
    usuario: string | null;
    stage: string;
}

export interface TimelineEvent {
    dia: string;
    hora: string;
    usuario: string | null;
    descricao: string;
    descricaoHtml: string;
    stage: string | null;
    yellowComments: string[];
}

export interface ImportantSignal {
    tipo: string;
    dia?: string;
    hora?: string;
    usuario?: string | null;
    descricao?: string;
    comentario?: string;
    campos?: string[];
    score?: number;
}

export interface NcmEvidence {
    dia: string;
    hora: string;
    usuario: string | null;
    codigo: string;
    trecho: string;
}

export interface ParseHistoricoSummary {
    totalEventos: number;
    totalTransicoes: number;
    fiscalTransitionsCount: number;
    criticalFiscalRework: boolean;
    stageTransitions: TimelineTransition[];
    importantSignals: ImportantSignal[];
    ncmMentions: {
        found: boolean;
        keywordMentions: number;
        formattedMatches: number;
        unformattedMatchesWithContext: number;
        codes: string[];
        evidences: NcmEvidence[];
    };
}

export interface ParseHistoricoResult {
    timeline: TimelineEvent[];
    summary: ParseHistoricoSummary;
}

export function consolidarHistorico(eventos: EventoRaw[]): ParseHistoricoResult {
    const timeline: TimelineEvent[] = [];
    const stageTransitions: TimelineTransition[] = [];
    const importantes: ImportantSignal[] = [];
    const ncmCodesSet = new Set<string>();
    const evidences: NcmEvidence[] = [];
    let ncmKeywordMentions = 0;
    let formattedMatches = 0;
    let unformattedMatchesWithContext = 0;
    let fiscalCount = 0;

    for (const evento of eventos) {
        const dia = normalizarEspacos(evento?.dia || '');
        const hora = normalizarEspacos(evento?.hora || '');
        const usuarioAtual = normalizarEspacos(evento?.usuario || '') || null;
        const descricao = normalizarEspacos(evento?.descricao || '');
        if (!descricao) continue;
        const descricaoHtml = String(evento?.descricaoHtml || '').trim();
        const yellowComments = Array.isArray(evento?.yellowComments)
            ? evento.yellowComments.map((s) => normalizarEspacos(s || '')).filter(Boolean)
            : [];
        const fontesNcm = [descricao, ...yellowComments];

        const mStage = descricao.match(/Solicita[cç][aã]o enviada para\s+(.+)$/i)
            || descricao.match(/Solicita.*o enviada para\s+(.+)$/i);
        const stage = mStage ? normalizarEspacos(mStage[1]).toUpperCase() : null;

        if (stage) {
            stageTransitions.push({ dia, hora, usuario: usuarioAtual, stage });
            if (stage.includes('FISCAL-INTEGRA') || stage.includes('FISCAL-KLASSMATT')) fiscalCount++;
        }

        if (/retorn|forçou o retorno|trazer de volta/i.test(descricao)) {
            importantes.push({ tipo: 'RETORNO_ETAPA', dia, hora, usuario: usuarioAtual, descricao });
        }

        if (/SOLICITACAO ALTERADA/i.test(descricao)) {
            const keys = CONFIG.REPORTING.ALTERACAO_CAMPOS_CHAVE
                .filter((k) => descricao.toUpperCase().includes(k));
            if (keys.length > 0) {
                importantes.push({
                    tipo: 'ALTERACAO_CHAVE',
                    dia, hora,
                    usuario: usuarioAtual,
                    campos: keys,
                    descricao,
                });
            }
        }

        for (const yc of yellowComments) {
            const norm = normalizarTextoSemAcento(yc);
            const score = CONFIG.REPORTING.IMPORTANT_YELLOW_KEYWORDS
                .reduce((acc, kw) => acc + (norm.includes(kw) ? 1 : 0), 0);
            if (score > 0) {
                importantes.push({
                    tipo: 'COMENTARIO_AMARELO_IMPORTANTE',
                    score, dia, hora,
                    usuario: usuarioAtual,
                    comentario: yc,
                });
            }
        }

        for (const fonte of fontesNcm) {
            const det = detectarMencoesNcmEvento(fonte);
            if (det.keywordMention) ncmKeywordMentions++;
            if (det.formattedCodes.length > 0) formattedMatches += det.formattedCodes.length;
            if (det.unformattedCodes.length > 0) unformattedMatchesWithContext += det.unformattedCodes.length;

            const codigos = [...det.formattedCodes, ...det.unformattedCodes];
            for (const codigo of codigos) {
                ncmCodesSet.add(codigo);
                if (evidences.length < 8) {
                    evidences.push({
                        dia, hora,
                        usuario: usuarioAtual,
                        codigo,
                        trecho: fonte.slice(0, 220),
                    });
                }
            }
        }

        timeline.push({
            dia, hora,
            usuario: usuarioAtual,
            descricao, descricaoHtml,
            stage,
            yellowComments,
        });
    }

    const criticalFiscalRework = fiscalCount > 2;
    if (criticalFiscalRework) {
        importantes.unshift({
            tipo: 'ALERTA_FISCAL_REINCIDENCIA',
            descricao: `Etapas FISCAL-INTEGRA/FISCAL-KLASSMATT apareceram ${fiscalCount} vezes (limite > 2)`,
        });
    }

    return {
        timeline,
        summary: {
            totalEventos: timeline.length,
            totalTransicoes: stageTransitions.length,
            fiscalTransitionsCount: fiscalCount,
            criticalFiscalRework,
            stageTransitions,
            importantSignals: importantes,
            ncmMentions: {
                found: ncmKeywordMentions > 0 || ncmCodesSet.size > 0,
                keywordMentions: ncmKeywordMentions,
                formattedMatches,
                unformattedMatchesWithContext,
                codes: [...ncmCodesSet],
                evidences,
            },
        },
    };
}

// ---------------------------------------------------------------------------
// Parser estrito (DOM estruturado com classes hist-*)
// ---------------------------------------------------------------------------
export function parseHistoricoEstrito(doc: Document): ParseHistoricoResult {
    const eventos: EventoRaw[] = [];

    const fieldsets = [...doc.querySelectorAll('fieldset.hist-fieldset')];
    for (const fs of fieldsets) {
        const dia = normalizarEspacos(fs.querySelector('legend.hist-legend')?.textContent || '');
        let usuarioAtual: string | null = null;

        const rows = [...fs.querySelectorAll('.row')];
        for (const row of rows) {
            const isResult = row.classList.contains('result');
            if (!isResult) {
                const userLink = row.querySelector('a#hlinkUsuario, a[href*="USUARIO_show"]');
                if (userLink) usuarioAtual = normalizarEspacos(userLink.textContent || '').replace(/\*+$/, '');
                continue;
            }

            const hora = normalizarEspacos(row.querySelector('span[id="lblHora"]')?.textContent || '');
            const descEl = row.querySelector('span[id="lblDescricao"]');
            const descricao = normalizarEspacos(descEl?.textContent || '');
            const descricaoHtml = (descEl?.innerHTML || '').trim();
            const yellowNodes = descEl
                ? [...descEl.querySelectorAll('span[style*="background-color"]')]
                : [];
            const yellowComments = yellowNodes
                .map((n) => normalizarEspacos(n.textContent || ''))
                .filter(Boolean);

            eventos.push({
                dia, hora,
                usuario: usuarioAtual,
                descricao, descricaoHtml,
                yellowComments,
            });
        }
    }

    return consolidarHistorico(eventos);
}

// ---------------------------------------------------------------------------
// Parser loose (fallback para layouts sem hist-*)
// ---------------------------------------------------------------------------
export function parseHistoricoLoose(doc: Document): ParseHistoricoResult {
    const eventos: EventoRaw[] = [];
    const fieldsets = [...doc.querySelectorAll('fieldset')];
    for (const fs of fieldsets) {
        const dia = normalizarEspacos(fs.querySelector('legend')?.textContent || '');
        let usuarioAtual: string | null = null;
        const textoBruto = String((fs as HTMLElement).innerText || fs.textContent || '');
        const linhas = textoBruto
            .split(/\r?\n+/)
            .map((s) => normalizarEspacos(s))
            .filter(Boolean);

        let eventoAtual: EventoRaw | null = null;

        for (const linha of linhas) {
            if (dia && linha === dia) continue;

            const candidatoUsuario = linha.replace(/\*+$/, '');
            if (
                /^[a-zA-Z0-9._-]{3,}$/.test(candidatoUsuario) &&
                !/\s/.test(candidatoUsuario) &&
                !/solicita[cç][aã]o|retorn|aprov|catalog|revis/i.test(candidatoUsuario)
            ) {
                if (eventoAtual) { eventos.push(eventoAtual); eventoAtual = null; }
                usuarioAtual = candidatoUsuario;
                continue;
            }

            const mHora = linha.match(/^(\d{1,2}:\d{2})(?:\s*[-–]\s*|\s+)(.+)$/);
            if (mHora?.[2]) {
                if (eventoAtual) eventos.push(eventoAtual);
                eventoAtual = {
                    dia, hora: mHora[1],
                    usuario: usuarioAtual,
                    descricao: normalizarEspacos(mHora[2]),
                    descricaoHtml: '',
                    yellowComments: [],
                };
            } else if (eventoAtual) {
                eventoAtual.descricao += ' ' + linha;
            } else {
                eventos.push({
                    dia, hora: '',
                    usuario: usuarioAtual,
                    descricao: linha,
                    descricaoHtml: '',
                    yellowComments: [],
                });
            }
        }
        if (eventoAtual) eventos.push(eventoAtual);
    }

    return consolidarHistorico(eventos);
}

// ---------------------------------------------------------------------------
// Orquestrador: strict vs loose
// ---------------------------------------------------------------------------
export function parseHistorico(doc: Document): ParseHistoricoResult {
    const parsedEstrito = parseHistoricoEstrito(doc);
    const estritoTotal = (parsedEstrito?.timeline || []).length;

    if (estritoTotal > 0) return parsedEstrito;
    return parseHistoricoLoose(doc);
}
