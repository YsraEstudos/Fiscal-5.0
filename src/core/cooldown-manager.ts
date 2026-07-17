/**
 * Gerenciador de cooldowns baseado em timestamps.
 * Usado pelo anti-loop de clique e por throttling de ações.
 * Extraído do monólito (linhas 1381–1405).
 */

const cooldowns = new Map<string, number>();
const PRUNE_INTERVAL_MS = 30_000;
let proximaLimpeza = 0;

function limparExpirados(now: number = Date.now()): void {
    if (now < proximaLimpeza) return;
    proximaLimpeza = now + PRUNE_INTERVAL_MS;
    for (const [key, expira] of cooldowns) {
        if (expira <= now) cooldowns.delete(key);
    }
}

/** Registra um cooldown com duração em milissegundos. */
export function set(key: string, duracao: number): void {
    const now = Date.now();
    limparExpirados(now);
    cooldowns.set(key, now + duracao);
}

/** Retorna `true` se o cooldown ainda está ativo. */
export function isAtivo(key: string): boolean {
    const now = Date.now();
    limparExpirados(now);
    const expira = cooldowns.get(key);
    if (!expira) return false;
    if (now >= expira) {
        cooldowns.delete(key);
        return false;
    }
    return true;
}

/** Retorna o tempo restante em ms (0 se expirado). */
export function tempoRestante(key: string): number {
    const now = Date.now();
    limparExpirados(now);
    const expira = cooldowns.get(key);
    if (!expira) return 0;
    if (now >= expira) {
        cooldowns.delete(key);
        return 0;
    }
    return expira - now;
}

/** Limpa um cooldown específico ou todos se `key` for omitido. */
export function limpar(key?: string): void {
    if (key) cooldowns.delete(key);
    else {
        cooldowns.clear();
        proximaLimpeza = 0;
    }
}
