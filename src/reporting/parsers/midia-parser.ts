/**
 * Parser de mídia — extrai itens de mídia de um documento HTML (Midia.aspx).
 * Extraído do monólito — RelatorioItemManager (funções de parsing de mídia).
 */

import { normalizarEspacos, normalizarTextoSemAcento } from '../../utils/text.ts';
import { absolutizarUrl, extrairUrlDaFuncaoJs, slugifyArquivo } from '../../utils/misc.ts';

const IMG_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp']);
const PDF_EXT = new Set(['pdf']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function absolutizarComBase(href: string | null | undefined, baseUrl?: string): string | null {
    try {
        return new URL(String(href ?? ''), baseUrl || window.location.href).toString();
    } catch {
        return null;
    }
}

export interface MidiaClassification {
    tipo: 'imagem' | 'pdf' | 'file' | 'unsupported';
    ext: string | null;
}

export function classificarMidia(url: string, title = ''): MidiaClassification {
    const cleanTitle = normalizarEspacos(title);
    let ext = '';
    let fileExt = '';
    try {
        const parsedUrl = new URL(url, window.location.href);
        const pathname = parsedUrl.pathname || '';
        const mPath = pathname.toLowerCase().match(/\.([a-z0-9]+)$/);
        ext = mPath?.[1] || '';
        const fileParam = parsedUrl.searchParams.get('file') || '';
        const mFile = fileParam.toLowerCase().match(/\.([a-z0-9]+)$/);
        fileExt = mFile?.[1] || '';
    } catch {
        ext = '';
        fileExt = '';
    }

    // Para handlers (ex: GetTempFile.ashx?file=doc.pdf), a extensão real vem no query param.
    if (fileExt) ext = fileExt;

    if (IMG_EXT.has(ext)) return { tipo: 'imagem', ext };
    if (PDF_EXT.has(ext)) return { tipo: 'pdf', ext };
    if (/\bpdf\b/i.test(cleanTitle)) return { tipo: 'pdf', ext: ext || 'pdf' };

    // Se tem extensão conhecida de documento (office, etc), classifica como 'file' ou 'pdf' fallback
    if (/xlsx?|docx?|pptx?|txt|csv|zip|rar|7z/i.test(ext)) {
        return { tipo: 'file', ext }; // 'file' será baixado como blob genérico
    }

    if (/\bfoto|\bimagem|\banexo|\barquivo/i.test(cleanTitle)) return { tipo: 'unsupported', ext };

    // Fallback: se tem extensão mas não conhecemos, assumimos que é arquivo baixável
    if (ext && ext.length <= 5) return { tipo: 'file', ext };

    return { tipo: 'unsupported', ext };
}

export function isLinkAcaoInvalida(href: string | null | undefined, title = '', text = ''): boolean {
    const rawHref = String(href || '');
    const rawMeta = `${title || ''} ${text || ''}`.toLowerCase();
    if (!rawHref || rawHref.startsWith('#')) return true;
    if (/^javascript:/i.test(rawHref) && !/open[\w]*\s*\(/i.test(rawHref)) return true;
    if (/__doPostBack/i.test(rawHref) && !/dlMidias|Foto|PDF|Midia/i.test(rawHref + ' ' + rawMeta)) return true;
    if (/excluir|adicionar|remover|editar/i.test(rawMeta)) return true;
    return false;
}

export function extrairUrlOpenGenerica(href: string | null | undefined, nomesFuncoes: string[] = []): string | null {
    const fromKnown = extrairUrlDaFuncaoJs(href, nomesFuncoes);
    if (fromKnown) return fromKnown;
    const raw = String(href ?? '');
    if (!raw) return null;
    const m = raw.match(/open[\w]*\s*\(\s*['"]([^'"]+)['"]/i);
    if (m?.[1]) return absolutizarUrl(m[1]);
    const mAbre = raw.match(/abre(?:PDF)?\s*\(\s*['"]([^'"]+)['"]/i);
    if (mAbre?.[1]) return absolutizarUrl(mAbre[1]);
    return null;
}

// ---------------------------------------------------------------------------
// Localização de aba de mídia
// ---------------------------------------------------------------------------
export function encontrarAbaMidia(itemKey: string | null = null): Element | null {
    const tabRoot = document.querySelector('#dlTab');
    const links = tabRoot
        ? [...tabRoot.querySelectorAll('a')]
        : [...document.querySelectorAll('a[href*="Midia.aspx"], a#lbutMenu')];

    const linksMidia = links.filter((a) => {
        const txt = normalizarTextoSemAcento(a.textContent || '');
        return txt.includes('midias (') || txt.includes('midia (') || txt.startsWith('midias');
    });

    if (linksMidia.length === 0) return null;

    const candidatoHref = linksMidia.find((a) => {
        const href = String(a.getAttribute('href') || '');
        const midiaUrl = extrairUrlOpenGenerica(href, ['OpenNewTab', 'opennewtab', 'OpenWindowsWHR', 'OpenWindowsWHRNS']);
        if (!midiaUrl) return false;
        try {
            const u = new URL(midiaUrl, window.location.href);
            const id = u.searchParams.get('id');
            if (itemKey && id && String(id) !== String(itemKey)) return false;
            return /Midia\.aspx/i.test(u.pathname || '');
        } catch {
            return false;
        }
    });

    return candidatoHref || linksMidia[0] || null;
}

export function extrairQtdMidiaDoTexto(texto: string | null | undefined): number | null {
    const raw = normalizarEspacos(texto || '');
    const m = raw.match(/Mídias?\s*\((\d+)\)/i);
    if (!m) return null;
    const n = Number.parseInt(m[1], 10);
    return Number.isFinite(n) ? n : null;
}

export function montarUrlsMidiaCandidatas(midiaUrl: string | null | undefined, _itemKey?: string): string[] {
    const url = String(midiaUrl || '').trim();
    return url ? [url] : [];
}

// ---------------------------------------------------------------------------
// Detecção de erro na página de mídia
// ---------------------------------------------------------------------------
export function detectarErroHtmlMidia(doc: Document | null, html: string, requestUrl = ''): string | null {
    const titulo = normalizarTextoSemAcento(doc?.querySelector('title')?.textContent || '');
    const texto = normalizarTextoSemAcento(doc?.body?.textContent || html || '');
    const url = normalizarTextoSemAcento(requestUrl || '');

    const ehErroAspx = titulo.includes('erro') || url.includes('/erro.aspx');
    const acessoNegado = texto.includes('acesso nao autorizado') || texto.includes('nao edite a url');
    const excecao = texto.includes('ocorreu uma excecao') || texto.includes('object reference not set to an instance of an object');

    if (ehErroAspx || acessoNegado || excecao) {
        if (acessoNegado) return 'Acesso não autorizado na Midia.aspx (URL protegida do Klassmatt)';
        if (excecao) return 'Midia.aspx retornou página de exceção do Klassmatt';
        return 'Midia.aspx retornou página de erro do Klassmatt';
    }

    return null;
}

// ---------------------------------------------------------------------------
// Extração de categorias de mídia (#dlMidias sidebar)
// ---------------------------------------------------------------------------
export interface CategoriaMidia {
    label: string;
    type: 'postback' | 'link';
    target: string | null;
    argument: string | null;
    url: string | null;
}

/**
 * Extrai links de categorias de mídia (Fotos, PDF, Documentos, etc.)
 * do menu lateral #dlMidias da Midia.aspx.
 *
 * Cada categoria pode ser um __doPostBack que carrega um conjunto
 * diferente de mídias. Retorna URLs absolutas para fetch posterior.
 */
export function extrairCategoriasMidia(doc: Document | null | undefined, baseUrl?: string): CategoriaMidia[] {
    const categorias: CategoriaMidia[] = [];
    if (!doc) return categorias;

    // O menu lateral usa #dlMidias ou [id*="dlMidias"]
    const sidebars = doc.querySelectorAll('#dlMidias, [id*="dlMidias"]');
    if (sidebars.length === 0) return categorias;

    const vistos = new Set<string>();
    for (const sidebar of sidebars) {
        const links = sidebar.querySelectorAll('a[href]');
        for (const a of links) {
            const href = a.getAttribute('href') || '';
            const text = normalizarEspacos(a.textContent || '');

            // Ignorar links de ação (Adicionar, Excluir, etc.)
            if (/adicionar|excluir|remover|editar/i.test(text)) continue;

            let cat: CategoriaMidia | null = null;
            if (/javascript:/i.test(href) && /__doPostBack/i.test(href)) {
                // PostBack: Extrair argumentos para fetch POST
                const m = href.match(/__doPostBack\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]\s*\)/);
                if (m?.[1]) {
                    cat = {
                        label: text,
                        type: 'postback',
                        target: m[1],
                        argument: m[2] || '',
                        url: null
                    };
                }
            } else if (/Midia\.aspx/i.test(href)) {
                // Link direto
                const url = absolutizarComBase(href, baseUrl || window.location.href);
                if (url) {
                    cat = {
                        label: text,
                        type: 'link',
                        url: url,
                        target: null,
                        argument: null
                    };
                }
            }

            if (cat) {
                const key = cat.type === 'postback' ? `pb:${cat.target}` : `lnk:${cat.url}`;
                if (!vistos.has(key)) {
                    vistos.add(key);
                    categorias.push(cat);
                }
            }
        }
    }

    return categorias;
}

export function extrairViewState(doc: Document | null | undefined): Record<string, string> {
    if (!doc) return {};
    const getVal = (id: string) => {
        const el = doc.querySelector(`#${id}`) || doc.querySelector(`input[name="${id}"]`);
        return (el as HTMLInputElement)?.value || '';
    };
    return {
        __VIEWSTATE: getVal('__VIEWSTATE'),
        __VIEWSTATEGENERATOR: getVal('__VIEWSTATEGENERATOR'),
        __EVENTVALIDATION: getVal('__EVENTVALIDATION'),
    };
}

// ---------------------------------------------------------------------------
// Extração principal de itens de mídia
// ---------------------------------------------------------------------------
export interface ItemMidiaInfo {
    url: string;
    tipo: 'imagem' | 'pdf' | 'file' | 'unsupported';
    ext: string | null;
    title: string | null;
    filename: string;
    source: string;
}

export function extrairItensMidiaDoDocumento(doc: Document, baseUrl?: string): ItemMidiaInfo[] {
    const containers = [
        ...doc.querySelectorAll('.slide, .carrousel, #dlMidias, [id*="dlMidias"], [class*="midia"], [class*="galeria"], .wme-galeria, .wme-galeria-g, .wme-galeria-lista, #divFotos'),
    ];
    const roots = containers.length > 0 ? containers : [doc.body];

    const vistos = new Set<string>();
    const itens: ItemMidiaInfo[] = [];

    const pushItem = (url: string | null, meta: any = {}) => {
        if (!url || vistos.has(url)) return;
        vistos.add(url);
        const title = String(meta.title || '');
        const cls = classificarMidia(url, title);
        if (cls.tipo === 'unsupported' && !title && !/GetTempFile|Banco_Imagens/i.test(url)) return;
        itens.push({
            url,
            tipo: cls.tipo,
            ext: cls.ext || null,
            title: normalizarEspacos(title) || null,
            filename: slugifyArquivo(meta.filename || url.split('/').pop() || `midia_${itens.length + 1}`),
            source: meta.source || 'Midia.aspx',
        });
    };

    for (const root of roots) {
        const anchors = [...root.querySelectorAll('a[href]')];
        for (const a of anchors) {
            const href = a.getAttribute('href') || '';
            const title = a.getAttribute('title') || '';
            const text = a.textContent || '';
            const onmouse = a.getAttribute('onmouseover') || '';
            const mMouse = onmouse.match(/abre(?:PDF)?\s*\(\s*this\s*,\s*["'](.+?)["']\s*\)/);
            const enrichedTitle = title || (mMouse?.[1] ? normalizarEspacos(mMouse[1]) : '') || text;
            if (isLinkAcaoInvalida(href, title, text)) continue;
            const url = absolutizarComBase(href, baseUrl);
            if (!url) continue;
            pushItem(url, {
                title: enrichedTitle,
                filename: a.getAttribute('download') || null,
                source: 'Midia.aspx',
            });
        }

        const dataImgAnchors = [...root.querySelectorAll('a[data-image], a[data-zoom-image]')];
        for (const a of dataImgAnchors) {
            const dataUrl = a.getAttribute('data-image') || a.getAttribute('data-zoom-image') || '';
            const url = absolutizarComBase(dataUrl, baseUrl);
            if (!url) continue;
            pushItem(url, {
                title: a.getAttribute('title') || '',
                filename: a.getAttribute('download') || null,
                source: 'Midia.aspx/data-attr',
            });
        }

        const imgs = [...root.querySelectorAll('img[src]')];
        for (const img of imgs) {
            const src = img.getAttribute('src') || '';
            if (/^imagens\//i.test(src) || /\/imagens\//i.test(src)) continue;
            if (!src || src === '#') continue;
            const url = absolutizarComBase(src, baseUrl);
            if (!url) continue;
            pushItem(url, {
                title: img.getAttribute('alt') || img.getAttribute('title') || 'Imagem',
                source: 'Midia.aspx/img',
            });
        }
    }

    // Fallback: search entire body
    if (itens.length === 0 && doc.body) {
        const allAnchors = [...doc.body.querySelectorAll('a[href]')];
        for (const a of allAnchors) {
            const href = a.getAttribute('href') || '';
            const title = a.getAttribute('title') || '';
            const text = a.textContent || '';
            if (isLinkAcaoInvalida(href, title, text)) continue;
            const url = absolutizarComBase(href, baseUrl);
            if (!url) continue;
            pushItem(url, { title, filename: a.getAttribute('download') || null, source: 'Midia.aspx/fallback' });
        }

        const allDataImgs = [...doc.body.querySelectorAll('a[data-image], a[data-zoom-image]')];
        for (const a of allDataImgs) {
            const dataUrl = a.getAttribute('data-image') || a.getAttribute('data-zoom-image') || '';
            const url = absolutizarComBase(dataUrl, baseUrl);
            if (!url) continue;
            pushItem(url, {
                title: a.getAttribute('title') || '',
                filename: a.getAttribute('download') || null,
                source: 'Midia.aspx/fallback-data',
            });
        }

        const allImgs = [...doc.body.querySelectorAll('img[src]')];
        for (const img of allImgs) {
            const src = img.getAttribute('src') || '';
            if (/^imagens\//i.test(src) || /\/imagens\//i.test(src)) continue;
            if (!src || src === '#') continue;
            const url = absolutizarComBase(src, baseUrl);
            if (!url) continue;
            pushItem(url, {
                title: img.getAttribute('alt') || img.getAttribute('title') || 'Imagem',
                source: 'Midia.aspx/fallback-img',
            });
        }
    }

    return itens;
}
