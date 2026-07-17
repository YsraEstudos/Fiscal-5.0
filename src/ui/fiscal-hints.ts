import { CONFIG } from '../config/constants.ts';
import { escapeHtml } from '../utils/misc.ts';

export interface FiscalHint {
    termo: string;
    ncm?: string;
    unspsc?: string;
    empresa?: string;
}

export interface FiscalHintsApplyOptions {
    ativo: boolean;
    dicas: Record<string, FiscalHint>;
}

export interface FiscalHintsImportResult {
    ok: boolean;
    dicas: Record<string, FiscalHint>;
    erros: string[];
}

const ORIGINAL_TEXT_ATTR = 'data-km-fiscal-original-text';
const MARK_CLASS = 'km-fiscal-hint-mark';
const POPUP_ID = 'km-fiscal-hint-popup';

export function normalizarTermoFiscal(valor: unknown): string {
    return String(valor ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function criarSlugDica(termo: string, index = 0): string {
    const slug = normalizarTermoFiscal(termo)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return index > 0 ? `${slug || 'dica'}-${index + 1}` : (slug || 'dica');
}

function normalizarCodigo(valor: unknown): string | undefined {
    const texto = String(valor ?? '').trim();
    return texto || undefined;
}

function obterUnspsc(raw: Record<string, unknown>): string | undefined {
    return normalizarCodigo(raw.unspsc ?? raw.UNSPSC ?? raw.NSPSC ?? raw.nspsc);
}

function validarDica(dica: FiscalHint, indice: number): string[] {
    const erros: string[] = [];
    if (!normalizarTermoFiscal(dica.termo)) erros.push(`Regra ${indice}: termo obrigatório`);
    if (!dica.ncm && !dica.unspsc) erros.push(`Regra ${indice}: informe NCM ou UNSPSC`);
    if (dica.ncm && !CONFIG.VALIDADORES.ncm.regex.test(dica.ncm)) {
        erros.push(`Regra ${indice}: NCM inválido (${dica.ncm})`);
    }
    if (dica.unspsc && !CONFIG.VALIDADORES.unspsc.regex.test(dica.unspsc)) {
        erros.push(`Regra ${indice}: UNSPSC inválido (${dica.unspsc})`);
    }
    return erros;
}

export function importarDicasFiscaisJson(json: string): FiscalHintsImportResult {
    const erros: string[] = [];
    const dicas: Record<string, FiscalHint> = {};

    try {
        const parsed = JSON.parse(String(json || '[]'));
        const lista = Array.isArray(parsed)
            ? parsed
            : Object.entries(parsed || {}).map(([id, value]) => ({ id, ...(value as Record<string, unknown>) }));

        lista.forEach((raw: unknown, idx: number) => {
            if (!raw || typeof raw !== 'object') {
                erros.push(`Regra ${idx + 1}: objeto inválido`);
                return;
            }
            const record = raw as Record<string, unknown>;
            const dica: FiscalHint = {
                termo: String(record.termo ?? record.frase ?? record.term ?? '').trim(),
                ncm: normalizarCodigo(record.ncm ?? record.NCM),
                unspsc: obterUnspsc(record),
                empresa: record.empresa ? String(record.empresa).trim().toUpperCase() : undefined,
            };
            const errosDica = validarDica(dica, idx + 1);
            if (errosDica.length) {
                erros.push(...errosDica);
                return;
            }
            const id = String(record.id || criarSlugDica(dica.termo, idx)).trim();
            dicas[id] = dica;
        });
    } catch (err: any) {
        erros.push(`JSON inválido: ${err?.message || err}`);
    }

    return { ok: erros.length === 0, dicas, erros };
}

export function exportarDicasFiscaisJson(dicas: Record<string, FiscalHint>): string {
    const lista = Object.entries(dicas || {}).map(([id, dica]) => ({
        id,
        termo: dica.termo,
        ...(dica.ncm ? { ncm: dica.ncm } : {}),
        ...(dica.unspsc ? { unspsc: dica.unspsc } : {}),
        ...(dica.empresa ? { empresa: dica.empresa } : {}),
    }));
    return JSON.stringify(lista, null, 2);
}

function criarMapaNormalizado(texto: string): { normalizado: string; indices: number[] } {
    let normalizado = '';
    const indices: number[] = [];
    let ultimoFoiEspaco = false;

    for (let i = 0; i < texto.length; i += 1) {
        const chars = texto[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        for (const char of chars) {
            if (/\s/.test(char)) {
                if (!ultimoFoiEspaco) {
                    normalizado += ' ';
                    indices.push(i);
                    ultimoFoiEspaco = true;
                }
                continue;
            }
            normalizado += char;
            indices.push(i);
            ultimoFoiEspaco = false;
        }
    }

    return { normalizado, indices };
}

function ehCaractereDePalavra(char: string | undefined): boolean {
    return Boolean(char && /[\p{L}\p{N}_]/u.test(char));
}

function encontrarTermo(
    texto: string,
    termo: string,
    mapa = criarMapaNormalizado(texto),
): { inicio: number; fim: number } | null {
    const alvo = normalizarTermoFiscal(termo);
    if (!alvo) return null;

    let inicioNormalizado = mapa.normalizado.indexOf(alvo);

    while (inicioNormalizado >= 0) {
        const fimNormalizado = inicioNormalizado + alvo.length;
        const termoComecaNoLimite = !ehCaractereDePalavra(mapa.normalizado[inicioNormalizado - 1]);
        const termoTerminaNoLimite = !ehCaractereDePalavra(mapa.normalizado[fimNormalizado]);

        if (termoComecaNoLimite && termoTerminaNoLimite) {
            const inicio = mapa.indices[inicioNormalizado] ?? 0;
            const fim = (mapa.indices[fimNormalizado - 1] ?? inicio) + 1;
            return { inicio, fim };
        }

        inicioNormalizado = mapa.normalizado.indexOf(alvo, inicioNormalizado + 1);
    }

    return null;
}

function obterDicasOrdenadas(dicas: Record<string, FiscalHint>, empresaAtual?: string | null): FiscalHint[] {
    const empNorm = empresaAtual ? empresaAtual.trim().toUpperCase() : null;
    return Object.values(dicas || {})
        .filter((dica) => {
            const termoValido = normalizarTermoFiscal(dica.termo) && (dica.ncm || dica.unspsc);
            if (!termoValido) return false;
            if (dica.empresa) {
                return empNorm === dica.empresa.toUpperCase();
            }
            return true;
        })
        .sort((a, b) => normalizarTermoFiscal(b.termo).length - normalizarTermoFiscal(a.termo).length);
}

function limparPopup(): void {
    document.getElementById(POPUP_ID)?.remove();
}

async function copiarTexto(texto: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(texto);
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = texto;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
    } finally {
        textarea.remove();
    }
}

function abrirPopup(alvo: HTMLElement, dica: FiscalHint): void {
    limparPopup();

    const rect = alvo.getBoundingClientRect();
    const popup = document.createElement('div');
    popup.id = POPUP_ID;
    popup.innerHTML = `
        <div class="km-fiscal-popup-title">${escapeHtml(dica.termo)}</div>
        <div class="km-fiscal-popup-actions">
            ${dica.ncm ? `<button type="button" data-km-copy-fiscal="ncm">NCM ${escapeHtml(dica.ncm)}</button>` : ''}
            ${dica.unspsc ? `<button type="button" data-km-copy-fiscal="unspsc">UNSPSC ${escapeHtml(dica.unspsc)}</button>` : ''}
        </div>
    `;
    popup.style.top = `${Math.max(8, rect.bottom + 6)}px`;
    popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 260))}px`;

    popup.addEventListener('click', async (event) => {
        const button = (event.target as HTMLElement).closest('[data-km-copy-fiscal]') as HTMLElement | null;
        if (!button) return;
        const tipo = button.getAttribute('data-km-copy-fiscal');
        const valor = tipo === 'ncm' ? dica.ncm : dica.unspsc;
        if (!valor) return;
        await copiarTexto(valor);
        button.textContent = 'Copiado';
    });

    document.body.appendChild(popup);
}

function restaurarDescricao(el: HTMLElement): string {
    const original = el.getAttribute(ORIGINAL_TEXT_ATTR);
    if (original != null) {
        el.textContent = original;
        return original;
    }

    const texto = el.textContent || '';
    el.setAttribute(ORIGINAL_TEXT_ATTR, texto);
    return texto;
}

function destacarDescricao(el: HTMLElement, dicas: FiscalHint[]): void {
    const texto = restaurarDescricao(el);
    const mapa = criarMapaNormalizado(texto);
    const match = dicas
        .map((dica) => ({ dica, pos: encontrarTermo(texto, dica.termo, mapa) }))
        .find((entry) => entry.pos);

    if (!match?.pos) return;

    const antes = texto.slice(0, match.pos.inicio);
    const trecho = texto.slice(match.pos.inicio, match.pos.fim);
    const depois = texto.slice(match.pos.fim);
    el.innerHTML = `${escapeHtml(antes)}<button type="button" class="${MARK_CLASS}">${escapeHtml(trecho)}</button>${escapeHtml(depois)}`;
    const mark = el.querySelector(`.${MARK_CLASS}`) as HTMLElement | null;
    mark?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        abrirPopup(mark, match.dica);
    });
}

export function aplicarDicasFiscais(options: FiscalHintsApplyOptions, empresaAtual?: string | null): void {
    limparPopup();
    const descricoes = Array.from(document.querySelectorAll('#divDescricaoCompleta .descricao, .descricao[id^="txtD"], #txtDescricao')) as HTMLElement[];
    descricoes.forEach(restaurarDescricao);

    if (!options.ativo) return;
    const dicas = obterDicasOrdenadas(options.dicas, empresaAtual);
    if (!dicas.length) return;

    descricoes.forEach((el) => destacarDescricao(el, dicas));
}

export function fecharPopupDicasFiscais(): void {
    limparPopup();
}
