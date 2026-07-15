import { log } from '../../../core/log-manager.ts';
import { elementoVisivel } from '../../../utils/dom-helpers.ts';
import { sleep } from '../../../utils/misc.ts';
import { textoCombinaOpcaoLei116 } from './domain.ts';

/**
 * Digita texto em um input simulando comportamento humano, mas omite o disparo final
 * do evento 'change' para evitar a validação prematura da página.
 */
export async function digitarSilencioso(elemento: HTMLElement, valor: unknown): Promise<void> {
    const proto = (elemento instanceof HTMLTextAreaElement)
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    elemento.focus();
    const str = String(valor ?? '');
    if (!setter) {
        (elemento as HTMLInputElement | HTMLTextAreaElement).value = str;
        elemento.dispatchEvent(new Event('input', { bubbles: true }));
        return;
    }
    if ((elemento as HTMLInputElement | HTMLTextAreaElement).value) {
        setter.call(elemento, '');
        elemento.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(80);
    }
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const valorAtual = str.substring(0, i + 1);
        elemento.dispatchEvent(new KeyboardEvent('keydown', { key: char, bubbles: true }));
        elemento.dispatchEvent(new KeyboardEvent('keypress', { key: char, bubbles: true }));
        setter.call(elemento, valorAtual);
        elemento.dispatchEvent(new InputEvent('input', { bubbles: true, data: char }));
        elemento.dispatchEvent(new KeyboardEvent('keyup', { key: char, bubbles: true }));
        await sleep(Math.floor(Math.random() * 60) + 40);
    }
}

function obterContainersAutocompleteLei116(campo: HTMLElement): HTMLElement[] {
    const nameAttr = String(campo?.getAttribute?.('name') || '').trim();
    const idAttr = String(campo?.id || '').trim();

    const candidateIds = [];
    if (nameAttr) candidateIds.push(`divAuto_${nameAttr}`);
    if (idAttr) candidateIds.push(`divAuto_${idAttr}`);

    const found: HTMLElement[] = [];
    for (const id of candidateIds) {
        const el = document.getElementById(id)
            || (() => { try { return document.querySelector(`div[id="${CSS.escape(id)}"]`); } catch (e) { return null; } })();
        if (el && !found.includes(el as HTMLElement)) found.push(el as HTMLElement);
    }

    if (found.length > 0) return found;
    return [...document.querySelectorAll('div[id^="divAuto_"]')] as HTMLElement[];
}

function encontrarOpcaoAutocompleteLei116(container: HTMLElement, valorAlvo: string): HTMLElement | null {
    const anchors = [...container.querySelectorAll('a[id^="asel"]')] as HTMLAnchorElement[];
    for (const a of anchors) {
        if (!elementoVisivel(a)) continue;
        const texto = String(a.textContent || '').trim();
        if (texto && textoCombinaOpcaoLei116(texto, valorAlvo)) return a;
    }

    const candidatos = [...container.querySelectorAll('a, li, div, span, td, option')] as HTMLElement[];
    for (const candidato of candidatos) {
        if (!elementoVisivel(candidato)) continue;
        const texto = String(candidato.textContent || '').trim();
        if (!texto) continue;
        if (textoCombinaOpcaoLei116(texto, valorAlvo)) return candidato;
    }
    return null;
}

/**
 * Realiza a seleção de um item no dropdown de autocomplete.
 * Extrai o argumento real de sel(N) da página quando possível.
 */
export async function selecionarOpcaoAutocompleteLei116(campo: HTMLElement, valorAlvo: string, acaoId: string, timeoutMs: number = 3000): Promise<boolean> {
    const fim = Date.now() + timeoutMs;

    while (Date.now() <= fim) {
        const containers = obterContainersAutocompleteLei116(campo);

        for (const container of containers) {
            if (!container) continue;
            const cs = window.getComputedStyle(container);
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;

            const opcao = encontrarOpcaoAutocompleteLei116(container, valorAlvo);
            if (!opcao) continue;

            log(`✅ Lei 116: opção encontrada no container #${container.id} — "${(opcao.textContent || '').substring(0, 60)}" [${opcao.tagName}#${opcao.id || 'sem-id'}]`, 'info');

            const anchorToUse = (opcao.tagName === 'A' && opcao.id?.startsWith('asel'))
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
                        injectScript.textContent = `try { sel(${selIndex}); } catch(e) { console.error('FISCAL 5.0 sel() error:', e); }`;
                        document.body.appendChild(injectScript);
                        injectScript.remove();
                        log(`✅ Lei 116: seleção via sel(${selIndex}) extraído de href/onclick — sucesso`, 'info');
                        return true;
                    } catch (e: any) {
                        log(`⚠️ Lei 116: erro na injeção de script sel(${selIndex}): ${e.message}`, 'warn');
                    }
                } else {
                    log(`⚠️ Lei 116: âncora ${anchorToUse.id} não tem sel() no href/onclick. href="${hrefVal}" onclick="${onclickVal}"`, 'warn');
                }
            }

            const inlineOnclick = opcao.getAttribute('onclick') || '';
            const inlineMousedown = opcao.getAttribute('onmousedown') || '';
            if (inlineMousedown) {
                try {
                    const injectScript = document.createElement('script');
                    injectScript.textContent = inlineMousedown;
                    document.body.appendChild(injectScript);
                    injectScript.remove();
                    log(`✅ Lei 116: executado onmousedown inline — sucesso`, 'info');
                    return true;
                } catch (e) { /* ignora */ }
            }
            if (inlineOnclick) {
                try {
                    const injectScript = document.createElement('script');
                    injectScript.textContent = inlineOnclick;
                    document.body.appendChild(injectScript);
                    injectScript.remove();
                    log(`✅ Lei 116: executado onclick inline — sucesso`, 'info');
                    return true;
                } catch (e) { /* ignora */ }
            }

            log(`⚠️ Lei 116: Fallback de clique físico em ${opcao.tagName}#${opcao.id || 'sem-id'} (${acaoId})`, 'warn');
            opcao.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: null }));
            opcao.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: null }));
            opcao.click();

            return true;
        }

        await sleep(150);
    }

    log(`⚠️ Lei 116: nenhuma opção visível com valor "${valorAlvo}" encontrada após ${timeoutMs}ms`, 'warn');
    return false;
}
