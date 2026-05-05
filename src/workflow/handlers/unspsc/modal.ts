import type { EstadoApp } from '../../../core/estado-manager.ts';
import { elementoVisivel } from '../../../utils/dom-helpers.ts';
import { buscarElementoDeep, buscarElementosDeep } from '../../../utils/selectors.ts';
import type { AcaoInfo, UnspscModo } from './types.ts';

export function obterModoUnspsc(
    estado: EstadoApp,
    getAcao: (id: string, estado: EstadoApp) => AcaoInfo,
    getUnspscModo?: ((seletorUnspsc: string, seletorSelecionar: string) => UnspscModo) | undefined
): UnspscModo {
    const acaoUnspsc = getAcao('unspsc', estado);
    const acaoSelecionar = getAcao('selecionar', estado);
    if (typeof getUnspscModo !== 'function') return 'none';
    return getUnspscModo(acaoUnspsc.seletor, acaoSelecionar.seletor);
}

export function obterCampoUnspscModal(
    seletor: string,
    getModalUnspscContainer: () => Element | null
): HTMLInputElement | null {
    const modalDiv1 = getModalUnspscContainer();
    return (modalDiv1
        ? modalDiv1.querySelector(seletor)
        : buscarElementoDeep(seletor)) as HTMLInputElement | null;
}

export function campoVisivel(campo: HTMLElement | null): boolean {
    return !!(campo && elementoVisivel(campo));
}

export function checkboxUnspscMarcado(): boolean {
    const checkboxMarcado = document.querySelector(
        '#ckSelUNSPSC[src*="check"]:not([src*="uncheck"]), input[src*="check.gif"]:not([src*="uncheck"])'
    ) as HTMLImageElement | null;
    return !!(checkboxMarcado && checkboxMarcado.src);
}

export function buscarResultadoUnspscVisivel(seletor: string): HTMLElement | null {
    const candidatos = buscarElementosDeep(seletor) as HTMLElement[];
    return candidatos.find(el => elementoVisivel(el)) || null;
}

export function buscarElementoVisivel(seletor: string): HTMLElement | null {
    const el = buscarElementoDeep(seletor) as HTMLElement | null;
    return el && elementoVisivel(el) ? el : null;
}
