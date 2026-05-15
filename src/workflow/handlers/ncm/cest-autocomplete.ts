import { log } from '../../../core/log-manager.ts';
import { normalizarCest } from '../../../data/item-map-manager.ts';
import { elementoVisivel } from '../../../utils/dom-helpers.ts';
import { sleep } from '../../../utils/misc.ts';
import { digitarSilencioso } from './lei116-autocomplete.ts';

export interface CestParsed {
    codigo: string;
    texto: string;
}

export function normalizarCodigoCest(valor: unknown): string | null {
    const normalizado = normalizarCest(valor);
    if (!normalizado) return null;
    const digits = normalizado.replace(/\D/g, '');
    if (digits.length !== 7) return null;
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 7)}`;
}

export function normalizarCestAlvo(valor: unknown): CestParsed | null {
    const texto = normalizarCest(valor);
    const codigo = normalizarCodigoCest(texto);
    if (!texto || !codigo) return null;
    return { codigo, texto };
}

export function textoCombinaOpcaoCest(textoOpcao: unknown, valorAlvo: unknown): boolean {
    const alvo = normalizarCestAlvo(valorAlvo);
    if (!alvo) return false;

    const texto = String(textoOpcao ?? '').replace(/\s+/g, ' ').trim();
    if (!texto) return false;

    const codigoOpcao = normalizarCodigoCest(texto);
    if (codigoOpcao && codigoOpcao === alvo.codigo) return true;

    const textoUpper = texto.toUpperCase();
    const alvoUpper = alvo.texto.toUpperCase();
    return textoUpper === alvoUpper || textoUpper.startsWith(`${alvo.codigo} `) || textoUpper.startsWith(`${alvo.codigo} -`);
}

function obterContainersAutocomplete(campo: HTMLElement): HTMLElement[] {
    const nameAttr = String(campo.getAttribute('name') || '').trim();
    const idAttr = String(campo.id || '').trim();

    const candidateIds = [];
    if (nameAttr) candidateIds.push(`divAuto_${nameAttr}`);
    if (idAttr) candidateIds.push(`divAuto_${idAttr}`);

    const found: HTMLElement[] = [];
    for (const id of candidateIds) {
        const el = document.getElementById(id)
            || (() => { try { return document.querySelector(`div[id="${CSS.escape(id)}"]`); } catch { return null; } })();
        if (el && !found.includes(el as HTMLElement)) found.push(el as HTMLElement);
    }

    if (found.length > 0) return found;
    return [...document.querySelectorAll('div[id^="divAuto_"]')] as HTMLElement[];
}

function encontrarOpcaoAutocompleteCest(container: HTMLElement, valorAlvo: string): HTMLElement | null {
    const anchors = [...container.querySelectorAll('a[id^="asel"]')] as HTMLAnchorElement[];
    for (const a of anchors) {
        if (!elementoVisivel(a)) continue;
        if (textoCombinaOpcaoCest(a.textContent, valorAlvo)) return a;
    }

    const candidatos = [...container.querySelectorAll('a, li, div, span, td, option')] as HTMLElement[];
    for (const candidato of candidatos) {
        if (!elementoVisivel(candidato)) continue;
        if (textoCombinaOpcaoCest(candidato.textContent, valorAlvo)) return candidato;
    }
    return null;
}

async function selecionarOpcaoAutocompleteCest(campo: HTMLElement, valorAlvo: string, timeoutMs = 3000): Promise<boolean> {
    const fim = Date.now() + timeoutMs;

    while (Date.now() <= fim) {
        const containers = obterContainersAutocomplete(campo);
        for (const container of containers) {
            const cs = window.getComputedStyle(container);
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;

            const opcao = encontrarOpcaoAutocompleteCest(container, valorAlvo);
            if (!opcao) continue;

            const texto = String(opcao.textContent || '').trim();
            log(`✅ CEST: opção selecionada "${texto.substring(0, 80)}"`, 'info');

            const anchorToUse = (opcao.tagName === 'A' && (opcao as HTMLAnchorElement).id?.startsWith('asel'))
                ? opcao as HTMLAnchorElement
                : opcao.querySelector?.('a[id^="asel"]') as HTMLAnchorElement | null;

            if (anchorToUse) {
                const hrefVal = anchorToUse.getAttribute('href') || '';
                const onclickVal = anchorToUse.getAttribute('onclick') || '';
                const selMatch = hrefVal.match(/sel\((\d+)\)/) || onclickVal.match(/sel\((\d+)\)/);
                if (selMatch) {
                    const selIndex = selMatch[1];
                    try {
                        const injectScript = document.createElement('script');
                        injectScript.textContent = `try { sel(${selIndex}); } catch(e) { console.error('FISCAL 5.0 sel() CEST error:', e); }`;
                        document.body.appendChild(injectScript);
                        injectScript.remove();
                        return true;
                    } catch (e: any) {
                        log(`⚠️ CEST: erro na injeção de script sel(${selIndex}): ${e.message}`, 'warn');
                    }
                }
            }

            for (const attr of ['onmousedown', 'onclick']) {
                const inline = opcao.getAttribute(attr) || '';
                if (!inline) continue;
                try {
                    const injectScript = document.createElement('script');
                    injectScript.textContent = inline;
                    document.body.appendChild(injectScript);
                    injectScript.remove();
                    return true;
                } catch {
                    /* fallback abaixo */
                }
            }

            opcao.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: null }));
            opcao.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: null }));
            opcao.click();
            return true;
        }

        await sleep(150);
    }

    log(`⚠️ CEST: opção não encontrada para "${valorAlvo}"`, 'warn');
    return false;
}

export async function preencherCestAutocomplete(campo: HTMLElement, valorCest: unknown): Promise<boolean> {
    const alvo = normalizarCestAlvo(valorCest);
    if (!alvo) {
        log(`⚠️ CEST: valor inválido no JSON (${String(valorCest ?? '')})`, 'warn');
        return false;
    }

    await digitarSilencioso(campo, alvo.codigo);
    log(`⌨️ CEST: digitado "${alvo.codigo}"...`, 'info');
    await sleep(700);

    const selecionou = await selecionarOpcaoAutocompleteCest(campo, alvo.texto);
    if (!selecionou) return false;

    await sleep(1000);
    return true;
}
