import { log } from '../../../core/log-manager.ts';
import { elementoVisivel } from '../../../utils/dom-helpers.ts';
import { buscarElementoDeep } from '../../../utils/selectors.ts';
import { normalizarTextoSemAcento } from '../../../utils/text.ts';

export function lerDescricaoUnspscInline(): string {
    const campoDescricao = buscarElementoDeep('#txtUNSPSC, input[name$="txtUNSPSC"]') as HTMLInputElement | null;
    return String(
        campoDescricao?.value
        ?? campoDescricao?.getAttribute?.('value')
        ?? ''
    ).trim();
}

export function descricaoUnspscInlineDefinida(): boolean {
    const valor = normalizarTextoSemAcento(lerDescricaoUnspscInline());
    return !!valor && !valor.includes('nao definido');
}

export function extrairTargetPostbackInline(campo: HTMLInputElement): string | null {
    const onchange = String(campo.getAttribute('onchange') || '');
    const match = onchange.match(/__doPostBack\(\s*\\?'([^'\\]+)\\?'\s*,/i)
        || onchange.match(/__doPostBack\(\s*'([^']+)'\s*,/i)
        || onchange.match(/__doPostBack\(\s*"([^"]+)"\s*,/i);
    if (match?.[1]) return match[1];
    const name = String(campo.getAttribute('name') || '').trim();
    return name || null;
}

export function dispararPostbackInline(campo: HTMLInputElement, target: string): boolean {
    const globalAny = globalThis as typeof globalThis & {
        __doPostBack?: (eventTarget: string, eventArgument: string) => void;
    };

    if (typeof globalAny.__doPostBack === 'function') {
        globalAny.__doPostBack(target, '');
        return true;
    }

    try {
        campo.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    } catch {
        const form = campo.form;
        const eventTarget = form?.querySelector('input[name="__EVENTTARGET"]') as HTMLInputElement | null;
        const eventArgument = form?.querySelector('input[name="__EVENTARGUMENT"]') as HTMLInputElement | null;
        if (!form || !eventTarget || !eventArgument) return false;
        eventTarget.value = target;
        eventArgument.value = '';
        form.submit();
        return true;
    }
}

export function obterCampoUnspscInline(): HTMLInputElement | null {
    return buscarElementoDeep('#txtCodUNSPSC, input[name$="txtCodUNSPSC"]') as HTMLInputElement | null;
}

export function obterBotaoUnspscInline(): HTMLElement | null {
    return buscarElementoDeep('#ibutUNSPSC, input[name$="ibutUNSPSC"]') as HTMLElement | null;
}

export function botaoUnspscInlineVisivel(): HTMLElement | null {
    const botaoInline = obterBotaoUnspscInline();
    return botaoInline && elementoVisivel(botaoInline) ? botaoInline : null;
}

export function pausarFalhaUnspscInline(
    pausarComAviso: ((mensagem: string, opts?: { alertUser?: boolean; tipo?: string }) => void) | undefined,
    valorUnspsc: unknown
): boolean {
    const valorInfo = valorUnspsc == null ? '' : ` (${String(valorUnspsc)})`;
    const mensagem = `UNSPSC inline não foi definido após postback e fallback${valorInfo}`.trim();
    if (typeof pausarComAviso === 'function') {
        pausarComAviso(mensagem, { alertUser: false, tipo: 'unspsc_inline_falha' });
        return true;
    }
    log(`⚠️ ${mensagem}`, 'warn');
    return false;
}
