import { elementoVisivel } from '../../../utils/dom-helpers.ts';
import { buscarElementoDeep } from '../../../utils/selectors.ts';
import { normalizarTextoSemAcento } from '../../../utils/text.ts';

interface AcaoInfo {
    seletor: string;
}

export function encontrarAbaClassificacao(acaoAbaClass: AcaoInfo): HTMLAnchorElement | null {
    let abaClass = buscarElementoDeep(acaoAbaClass.seletor) as HTMLAnchorElement | null;
    if (abaClass && elementoVisivel(abaClass)) return abaClass;

    const tabRoot = document.querySelector('#dlTab');
    const links = tabRoot
        ? [...tabRoot.querySelectorAll('a')]
        : [...document.querySelectorAll('a[href*="lbutMenu"], a[href*="lbutSelMenu"]')];

    const byTexto = links.find(a => {
        const texto = normalizarTextoSemAcento(a.textContent || '');
        return texto.includes('classificaco');
    }) as HTMLAnchorElement | undefined;
    if (byTexto && elementoVisivel(byTexto)) return byTexto;

    const byHref = links.find(a => /ctl\d+\$lbutMenu/.test(String(a.getAttribute('href') || ''))) as HTMLAnchorElement | undefined;
    if (byHref && elementoVisivel(byHref)) return byHref;

    return null;
}

export function encontrarAbaFiscal(seletor: string): HTMLElement | null {
    let abaFiscalEl = buscarElementoDeep(seletor) as HTMLElement | null;
    if (abaFiscalEl) return abaFiscalEl;

    const tabRoot = document.querySelector('#dlTab');
    const candidatos = tabRoot
        ? [...tabRoot.querySelectorAll('a')]
        : [...document.querySelectorAll('a[href*="lbutMenu"], a[href*="lbutSelMenu"]')];

    abaFiscalEl = candidatos.find(a => normalizarTextoSemAcento(a.textContent || '').includes('fiscal')) as HTMLElement | undefined || null;
    return abaFiscalEl;
}
