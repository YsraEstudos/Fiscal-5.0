/**
 * Coleta de mídia de um item (Midia.aspx).
 * Extraído do monólito — RelatorioItemManager.coletarMidia (~2374–2547).
 */

import { CONFIG, REPORTING_ERROR_CODES } from '../config/constants.ts';
import { absolutizarUrl } from '../utils/misc.ts';
import { getReportingConfig } from './session.ts';
import {
    getCacheItem,
    updateItemReportingState,
    fetchHtml,
    fetchPostHtml,
    fetchBlob,
} from './metadata.ts';
import {
    encontrarAbaMidia,
    extrairQtdMidiaDoTexto,
    montarUrlsMidiaCandidatas,
    extrairUrlOpenGenerica,
    detectarErroHtmlMidia,
    extrairItensMidiaDoDocumento,
    extrairCategoriasMidia,
    extrairViewState,
} from './parsers/midia-parser.ts';
import type { EstadoApp } from '../core/estado-manager.ts';

// ---------------------------------------------------------------------------
export interface MediaSummary {
    status: string;
    total: number;
    imagens: number;
    pdfs: number;
    unsupported: number;
    otherFiles?: number;
    itens: MediaItem[];
    sourceUrl?: string;
    requestedByUiCount?: number;
    diagnostic?: string | null;
}

export interface MediaItem {
    url: string;
    tipo: 'imagem' | 'pdf' | 'file' | 'unsupported';
    filename?: string;
    source?: string;
    downloadError?: string;
}

export interface MediaFile {
    kind: string;
    filename?: string;
    url: string;
    mimeType: string;
    blob: Blob;
    size: number;
}

export interface ColetaMidiaResult {
    ok: boolean;
    skipped?: boolean;
    summary: MediaSummary;
    files: MediaFile[];
}

// ---------------------------------------------------------------------------
function finalizarColetaMidiaSemArquivos(itemKey: string, summary: MediaSummary): ColetaMidiaResult {
    const cache = getCacheItem(itemKey) as Record<string, any> | undefined;
    if (cache) {
        cache.media = summary;
        cache.files = cache.files || [];
    }

    updateItemReportingState(itemKey, {
        mediaDone: true,
        mediaSummary: summary,
        mediaCollectedAt: new Date().toISOString(),
    });

    return { ok: true, summary, files: [] };
}

// ---------------------------------------------------------------------------
// Helpers — session token & URL enrichment
// ---------------------------------------------------------------------------

/**
 * Extrai o token de sessão 'k' da URL atual do navegador.
 * O Klassmatt exige esse parâmetro para autorizar requisições internas.
 */
function extrairSessionToken(): string | null {
    try {
        const params = new URLSearchParams(window.location.search);
        return params.get('k') || null;
    } catch {
        return null;
    }
}

/**
 * Garante que a URL contenha o token de sessão 'k' quando disponível.
 */
function anexarSessionToken(url: string, sessionKey: string | null): string {
    if (!sessionKey || !url) return url;
    try {
        const u = new URL(url, window.location.href);
        if (!u.searchParams.has('k')) {
            u.searchParams.set('k', sessionKey);
        }
        return u.toString();
    } catch {
        // fallback para string simples
        if (!url.includes('k=')) {
            return url + (url.includes('?') ? '&' : '?') + `k=${sessionKey}`;
        }
        return url;
    }
}

/**
 * Detecta se o contexto atual é de SIN (Solicitação de Item Novo)
 * com heurísticas mais amplas.
 */
function detectarContextoSin(): boolean {
    const href = window.location.href;
    const params = new URLSearchParams(window.location.search);

    // Verifica padrões de URL conhecidos para SIN
    if (/SIN_Item|SIN_Resumo|sin_lista|SIN_Classificacao|SIN_Detalhes|SIN_Novo/i.test(href)) return true;

    // Verifica parâmetro IdSIN (case-insensitive)
    const keys = Array.from(params.keys()).map(k => k.toLowerCase());
    return keys.includes('idsin');
}

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------
export async function coletarMidia(estado: EstadoApp, itemKey: string): Promise<ColetaMidiaResult> {
    const reporting = getReportingConfig(estado);
    if (!reporting.enabledMedia) {
        const summary: MediaSummary = { status: 'SKIPPED_DISABLED', total: 0, imagens: 0, pdfs: 0, unsupported: 0, itens: [] };
        updateItemReportingState(itemKey, { mediaDone: true, mediaSummary: summary, mediaSkipped: true });
        return { ok: true, skipped: true, summary, files: [] };
    }

    // --- Mudança 1: Extrair token de sessão 'k' da URL atual ---
    const sessionKey = extrairSessionToken();

    const abaMidia = encontrarAbaMidia(itemKey);
    if (!abaMidia) {
        const summary: MediaSummary = { status: 'ABA_MIDIA_NAO_ENCONTRADA', total: 0, imagens: 0, pdfs: 0, unsupported: 0, itens: [] };
        updateItemReportingState(itemKey, { mediaDone: true, mediaSummary: summary });
        return { ok: true, skipped: true, summary, files: [] };
    }

    const qtdMidia = extrairQtdMidiaDoTexto(abaMidia.textContent || '') ?? 0;
    if (qtdMidia === 0) {
        const summary: MediaSummary = { status: 'SEM_MIDIA_UI_ZERO', total: 0, imagens: 0, pdfs: 0, unsupported: 0, itens: [] };
        updateItemReportingState(itemKey, { mediaDone: true, mediaSummary: summary });
        const cache = getCacheItem(itemKey) as Record<string, any> | undefined;
        if (cache) cache.media = summary;
        return { ok: true, summary, files: [] };
    }

    const hrefMidia = abaMidia.getAttribute('href') || '';
    let midiaUrl = extrairUrlOpenGenerica(hrefMidia, ['OpenNewTab', 'opennewtab']);
    if (!midiaUrl) {
        const itemId = itemKey || new URLSearchParams(window.location.search).get('IdItem');
        // --- Mudança 2: Detecção ampliada de contexto SIN e uso do ID correto ---
        const isSinContext = detectarContextoSin();
        const tipo = isSinContext ? 'SIN' : 'Itens';

        let targetId = itemId;
        // Se for contexto SIN, preferir o IdSIN da URL se disponível
        if (isSinContext) {
            const params = new URLSearchParams(window.location.search);
            const idSin = params.get('IdSIN') || params.get('idsin');
            if (idSin) targetId = idSin;
        }

        if (targetId) {
            midiaUrl = absolutizarUrl(`Midia.aspx?tipo=${tipo}&id=${targetId}&Alterar=0&Session=${tipo}`);
        }
        if (!midiaUrl) {
            const summary: MediaSummary = {
                status: 'SEM_MIDIA_URL', total: 0, imagens: 0, pdfs: 0, unsupported: 0,
                requestedByUiCount: qtdMidia,
                diagnostic: 'Não foi possível extrair URL de Midia.aspx',
                itens: [],
            };
            return finalizarColetaMidiaSemArquivos(itemKey, summary);
        }
    }

    // --- Mudança 1 (cont.): Anexar token k a todas as URLs de mídia ---
    midiaUrl = anexarSessionToken(midiaUrl, sessionKey);

    let itens: MediaItem[] = [];
    let baseMidiaUsada = midiaUrl;
    const urlsCandidatas = montarUrlsMidiaCandidatas(midiaUrl, itemKey).map(
        (u: string) => anexarSessionToken(u, sessionKey),
    );
    let lastErr: unknown = null;

    for (const urlCandidata of urlsCandidatas) {
        try {
            const html = await fetchHtml(urlCandidata);
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const erroMidia = detectarErroHtmlMidia(doc, html, urlCandidata);
            if (erroMidia) {
                const summary: MediaSummary = {
                    status: 'SEM_MIDIA_ERRO_PAGINA', total: 0, imagens: 0, pdfs: 0, unsupported: 0,
                    sourceUrl: urlCandidata, requestedByUiCount: qtdMidia,
                    diagnostic: erroMidia, itens: [],
                };
                return finalizarColetaMidiaSemArquivos(itemKey, summary);
            }
            const candidatos = extrairItensMidiaDoDocumento(doc, urlCandidata);
            if (candidatos.length > 0) {
                itens = candidatos;
                baseMidiaUsada = urlCandidata;
            }

            // --- Mudança 3: Iterar categorias do #dlMidias (PostBack links) ---
            const categorias = extrairCategoriasMidia(doc, urlCandidata);
            const categoriasVisitadas = new Set<string>([urlCandidata]);

            const viewStateInicial = extrairViewState(doc);

            for (const cat of categorias) {
                let catHtml: string | null = null;
                let catUrl: string | null = null;

                try {
                    if (cat.type === 'link' && cat.url) {
                        catUrl = anexarSessionToken(cat.url, sessionKey);
                        if (categoriasVisitadas.has(catUrl)) continue;
                        categoriasVisitadas.add(catUrl);
                        catHtml = await fetchHtml(catUrl);
                    } else if (cat.type === 'postback' && cat.target) {
                        const key = `pb:${cat.target}`;
                        if (categoriasVisitadas.has(key)) continue;
                        categoriasVisitadas.add(key);

                        const formData = new FormData();
                        formData.append('__EVENTTARGET', cat.target);
                        formData.append('__EVENTARGUMENT', cat.argument || '');
                        formData.append('__VIEWSTATE', viewStateInicial.__VIEWSTATE || '');
                        formData.append('__VIEWSTATEGENERATOR', viewStateInicial.__VIEWSTATEGENERATOR || '');
                        formData.append('__EVENTVALIDATION', viewStateInicial.__EVENTVALIDATION || '');

                        const postUrl = anexarSessionToken(urlCandidata, sessionKey);
                        catHtml = await fetchPostHtml(postUrl, formData);
                        
                        if (catHtml) {
                            console.log(`[ColetorMidia] PostBack '${cat.label}' retornou ${catHtml.length} chars. Início: ${catHtml.substring(0, 500)}...`);
                        } else {
                            console.warn(`[ColetorMidia] PostBack '${cat.label}' retornou VAZIO.`);
                        }

                        catUrl = `${urlCandidata}#cat=${cat.label}`;
                    }

                    if (!catHtml) continue;

                    const catDoc = new DOMParser().parseFromString(catHtml, 'text/html');
                    const err = detectarErroHtmlMidia(catDoc, catHtml, catUrl || urlCandidata);
                    if (err) {
                        console.warn(`[ColetorMidia] Erro detectado na resposta do PostBack '${cat.label}': ${err}`);
                        continue;
                    }

                    const catItens = extrairItensMidiaDoDocumento(catDoc, catUrl || urlCandidata);
                    for (const ci of catItens) {
                        if (!itens.some((existing) => existing.url === ci.url)) {
                            ci.source = `Midia.aspx/cat:${cat.label || 'extra'}`;
                            itens.push(ci);
                        }
                    }
                } catch (_catErr) {
                    console.warn(`[ColetorMidia] Erro ao buscar categoria ${cat.label}:`, _catErr);
                }
            }

            if (itens.length > 0) break;
        } catch (err) {
            lastErr = err;
        }
    }

    if (itens.length === 0 && lastErr) {
        const summary: MediaSummary = {
            status: 'SEM_MIDIA_FETCH_ERROR', total: 0, imagens: 0, pdfs: 0, unsupported: 0,
            sourceUrl: baseMidiaUsada, requestedByUiCount: qtdMidia,
            diagnostic: `Falha ao buscar Midia.aspx: ${(lastErr as Error)?.message || lastErr}`,
            itens: [],
        };
        return finalizarColetaMidiaSemArquivos(itemKey, summary);
    }

    if (itens.length === 0) {
        const summary: MediaSummary = {
            status: 'SEM_MIDIA_PARSE', total: 0, imagens: 0, pdfs: 0, unsupported: 0,
            sourceUrl: baseMidiaUsada, requestedByUiCount: qtdMidia,
            diagnostic: null, itens: [],
        };
        return finalizarColetaMidiaSemArquivos(itemKey, summary);
    }

    const files: MediaFile[] = [];
    const limitByUi = Math.max(1, Number(reporting.maxFilesPerItem || CONFIG.REPORTING.MAX_FILES_PER_ITEM));
    const limit = Math.min(CONFIG.REPORTING.MAX_MEDIA_DOWNLOADS, limitByUi);
    const maxBytes = Math.max(1, Number(reporting.maxFileSizeMb || CONFIG.REPORTING.MAX_FILE_SIZE_MB)) * 1024 * 1024;
    for (const item of itens.slice(0, limit)) {
        if (item.tipo !== 'imagem' && item.tipo !== 'pdf' && item.tipo !== 'file') continue;
        try {
            const downloadUrl = anexarSessionToken(item.url, sessionKey);
            const blob = await fetchBlob(downloadUrl);
            if (blob.size > maxBytes) {
                item.downloadError = `${REPORTING_ERROR_CODES.UPLOAD_LIMIT_EXCEEDED}: arquivo excede limite de ${reporting.maxFileSizeMb}MB`;
                continue;
            }
            let mime = blob.type;
            if (!mime || mime === 'application/octet-stream') {
                if (item.tipo === 'pdf') mime = 'application/pdf';
                else if (item.tipo === 'imagem') mime = 'image/*';
                else mime = 'application/octet-stream';
            }
            files.push({
                kind: item.tipo,
                filename: item.filename,
                url: item.url,
                mimeType: mime,
                blob,
                size: blob.size,
            });
        } catch (err) {
            item.downloadError = `${REPORTING_ERROR_CODES.MEDIA_PARSE_ERROR}: ${String((err as Error)?.message || err)}`;
        }
    }

    const imagens = itens.filter((i) => i.tipo === 'imagem').length;
    const pdfs = itens.filter((i) => i.tipo === 'pdf').length;
    const filesCount = itens.filter((i) => i.tipo === 'file').length;

    const unsupported = itens.filter((i) => i.tipo === 'unsupported').length;

    const summary: MediaSummary = {
        status: 'OK', total: itens.length, imagens, pdfs, otherFiles: filesCount, unsupported,
        sourceUrl: baseMidiaUsada, requestedByUiCount: qtdMidia, itens,
    };

    const cache = getCacheItem(itemKey) as Record<string, any> | undefined;
    if (cache) {
        cache.media = summary;
        cache.files = (cache.files || []).concat(files);
    }

    updateItemReportingState(itemKey, {
        mediaDone: true,
        mediaSummary: summary,
        mediaCollectedAt: new Date().toISOString(),
    });
    return { ok: true, summary, files };
}
