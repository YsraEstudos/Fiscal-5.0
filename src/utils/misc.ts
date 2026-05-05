/**
 * Utilitários gerais sem dependência de outros módulos internos.
 * Funções puras ou com dependência apenas de APIs nativas do browser.
 * Extraído do monólito — Utils (funções não-DOM, não-texto).
 */

/** Escapa uma string para uso em seletores CSS. */
export function cssEscape(s: string | null | undefined): string {
    const str = String(s ?? '');
    if (window.CSS?.escape) return window.CSS.escape(str);
    return str.replace(/[^a-zA-Z0-9_-]/g, (m) => `\\${m}`);
}

/** Deep clone de um objeto. */
export function clone<T>(obj: T): T {
    if (typeof structuredClone === 'function') {
        try {
            return structuredClone(obj);
        } catch { /* fallback */ }
    }
    return JSON.parse(JSON.stringify(obj));
}

/** Escapa strings para exibição segura em HTML. */
export function escapeHtml(str: string | null | undefined): string {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
}

/** Promise que resolve após `ms` milissegundos. */
export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Indica se execução está em modo determinístico de teste. */
export function isTestMode(): boolean {
    return !!(globalThis as any).__KM_TEST_MODE__;
}

/** Cria uma versão debounced de uma função. */
export function debounce<T extends (...args: any[]) => any>(
    fn: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: number | ReturnType<typeof setTimeout>;
    return function (this: any, ...args: Parameters<T>) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

/** Gera um ID de execução único com prefixo + timestamp + random. */
export function gerarRunId(prefixo: string = 'run'): string {
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefixo}_${Date.now()}_${rand}`;
}

/** Converte uma URL relativa em absoluta usando location.href como base. */
export function absolutizarUrl(url: string | null | undefined): string | null {
    try {
        return new URL(String(url ?? ''), window.location.href).toString();
    } catch {
        return null;
    }
}

/**
 * Extrai URL de uma chamada JavaScript em um atributo href.
 * Exemplo: "javascript:openFile('url')" → URL absoluta de 'url'.
 */
export function extrairUrlDaFuncaoJs(href: string | null | undefined, nomesFuncoes: string | string[] = []): string | null {
    const raw = String(href ?? '');
    if (!raw) return null;

    const nomes = Array.isArray(nomesFuncoes) ? nomesFuncoes : [nomesFuncoes];
    for (const nome of nomes) {
        if (!nome) continue;
        const rx = new RegExp(`${nome}\\s*\\(\\s*['"]([^'"]+)['"]`, 'i');
        const m = raw.match(rx);
        if (m?.[1]) return absolutizarUrl(m[1]);
    }
    return null;
}

/** Transforma um nome de arquivo em slug seguro para filesystem. */
export function slugifyArquivo(nome: string | null | undefined, fallback: string = 'arquivo'): string {
    const base = String(nome ?? '').trim() || fallback;
    const limpo = base
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
    return limpo || fallback;
}

/** Hash FNV-1a de uma string, retornado em base36. */
export function hashTexto(texto: string | null | undefined): string {
    const raw = String(texto ?? '');
    let h = 2166136261;
    for (let i = 0; i < raw.length; i++) {
        h ^= raw.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
}

/** Compara valor de campo vs valor alvo com normalização de espaços. */
export function valoresSaoIguais(valorCampo: any, valorAlvo: any): boolean {
    if (!valorCampo || !valorAlvo) return valorCampo == valorAlvo;
    const v1 = String(valorCampo).trim();
    const v2 = String(valorAlvo).trim();
    return v1 === v2;
}
