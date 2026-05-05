/**
 * Utilitários de normalização e manipulação de texto.
 * Sem dependências internas.
 * Extraído do monólito — Utils (funções de texto).
 */

/** Normaliza espaços e converte para lowercase. */
export function normalizarTexto(s: string | null | undefined): string {
    return String(s ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

/** Remove acentos de uma string via Unicode NFD. */
export function removerAcentos(s: string | null | undefined): string {
    const str = String(s ?? '');
    try {
        return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } catch {
        return str;
    }
}

/** Normaliza texto + remove acentos (para comparações insensíveis). */
export function normalizarTextoSemAcento(s: string | null | undefined): string {
    return removerAcentos(normalizarTexto(s));
}

/** Normaliza apenas espaços (sem lowercase). */
export function normalizarEspacos(s: string | null | undefined): string {
    return String(s ?? '').replace(/\s+/g, ' ').trim();
}
