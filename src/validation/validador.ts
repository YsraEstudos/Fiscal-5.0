/**
 * Validação de dados (NCM, UNSPSC).
 * Extraído do monólito (linhas 1065–1096).
 */

import { CONFIG } from '../config/constants.ts';
import { buscarElementoDeep } from '../utils/selectors.ts';
import { normalizarTextoSemAcento } from '../utils/text.ts';

export interface ResultadoValidacao {
    valido: boolean;
    mensagem: string;
}

/** Valida um valor contra o pattern definido em CONFIG.VALIDADORES. */
export function validar(key: string, valor: unknown): ResultadoValidacao {
    const validador = CONFIG.VALIDADORES[key];
    if (!validador) return { valido: true, mensagem: '' };
    const str = String(valor ?? '');
    const valido = validador.regex.test(str);
    return { valido, mensagem: valido ? '' : validador.mensagem };
}

/** Aplica feedback visual (borda verde/vermelha) num campo input. */
export function aplicarVisual(inputElement: HTMLElement, resultado: ResultadoValidacao): void {
    inputElement.style.border = resultado.valido ? '1px solid #28a745' : '2px solid #dc3545';
    inputElement.title = resultado.mensagem;
}

function normalizarValor(valor: unknown): string | null {
    const texto = String(valor ?? '').trim();
    return texto || null;
}

function obterEntradaItemDoEstado(estado: Record<string, unknown>): Record<string, unknown> | null {
    const itemId = String((estado?.itemAtualTelaId as string) || (estado?.itemAtualKey as string) || '').trim();
    if (!estado?.itemMapAtivo || !itemId) return null;
    const itemMap = estado?.itemMap as Record<string, unknown> | undefined;
    const entry = itemMap?.[itemId];
    return (entry && typeof entry === 'object') ? entry as Record<string, unknown> : null;
}

function detectarContextoServico(estado: Record<string, unknown>, valorInformado: unknown): boolean {
    const valor = normalizarValor(valorInformado);
    const entry = obterEntradaItemDoEstado(estado);
    const campoNbs = buscarElementoDeep('#txtNBS') || buscarElementoDeep('input[name$="txtNBS"]');
    const campoIncideNbs = buscarElementoDeep('#txtIncideNBS') || buscarElementoDeep('input[name$="txtIncideNBS"]');
    const incideNbsText = (campoIncideNbs as HTMLInputElement)?.value ?? (campoIncideNbs as HTMLElement)?.textContent ?? '';
    const incideNbs = normalizarTextoSemAcento(incideNbsText) === 'sim';
    const valorPareceNbs = !!(valor && CONFIG.VALIDADORES.nbs.regex.test(valor));
    const entryPareceServico = !!(
        normalizarValor(entry?.nbs)
        || normalizarValor(entry?.lei116)
        || (normalizarValor(entry?.ncm) && CONFIG.VALIDADORES.nbs.regex.test(String(entry?.ncm)))
    );
    const possuiCampoNbs = !!campoNbs;
    return valorPareceNbs || entryPareceServico || (possuiCampoNbs && incideNbs);
}

function resolverValidadorDaAcao(acaoId: string, estado: Record<string, unknown>, valorAtual: unknown): string {
    if (acaoId !== 'ncm') return acaoId;
    return detectarContextoServico(estado, valorAtual) ? 'nbs' : 'ncm';
}

/**
 * Valida as ações obrigatórias (NCM, UNSPSC).
 *
 * @param getEstado - Função que retorna o estado atual
 * @param getValorAcao - Função que retorna o valor de uma ação para o item atual
 * @param logFn - Função de log
 * @param tocarErro - Função para tocar som de erro
 */
export function validarAcoesObrigatorias(
    getEstado: () => Record<string, unknown>,
    getValorAcao: (acaoId: string, estado: Record<string, unknown>) => unknown,
    logFn: (msg: string, level: string) => void,
    tocarErro: (tipo: string) => void,
): boolean {
    const estado = getEstado();
    const acoes = estado.acoes as Record<string, { ativo?: boolean }> | undefined;
    for (const acaoId of ['ncm', 'cest', 'unspsc', 'lei116Servico']) {
        const acao = acoes?.[acaoId];
        if (acao?.ativo) {
            const valorAtual = getValorAcao(acaoId, estado);
            if (valorAtual == null || String(valorAtual).trim() === '') continue;
            const validadorId = resolverValidadorDaAcao(acaoId, estado, valorAtual);
            const resultado = validar(validadorId, valorAtual);
            if (!resultado.valido) {
                logFn(`❌ Validação falhou: ${validadorId} - ${resultado.mensagem}`, 'error');
                tocarErro('error');
                return false;
            }
        }
    }
    return true;
}
