/**
 * Gerenciador de cooldowns baseado em timestamps.
 * Usado pelo anti-loop de clique e por throttling de ações.
 * Extraído do monólito (linhas 1381–1405).
 */

const cooldowns = new Map<string, number>();

/** Registra um cooldown com duração em milissegundos. */
export function set(key: string, duracao: number): void {
    cooldowns.set(key, Date.now() + duracao);
}

/** Retorna `true` se o cooldown ainda está ativo. */
export function isAtivo(key: string): boolean {
    const expira = cooldowns.get(key);
    if (!expira) return false;
    if (Date.now() >= expira) {
        cooldowns.delete(key);
        return false;
    }
    return true;
}

/** Retorna o tempo restante em ms (0 se expirado). */
export function tempoRestante(key: string): number {
    const expira = cooldowns.get(key);
    if (!expira) return 0;
    return Math.max(0, expira - Date.now());
}

/** Limpa um cooldown específico ou todos se `key` for omitido. */
export function limpar(key?: string): void {
    if (key) cooldowns.delete(key);
    else cooldowns.clear();
}
