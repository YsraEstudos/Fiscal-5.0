import type { WorkflowContext, HandlerMap } from './types.ts';
import { confirmar, prosseguir } from './handlers/flow-control.js';
import { atuar } from './handlers/atuar.js';
import { ncm, lei116Servico, abaFiscal, abaClassificacao } from './handlers/ncm.js';
import { unspsc, lupaUnspsc, pesquisar, resultado, selecionar } from './handlers/unspsc.js';

export function createHandlerMap(ctx: WorkflowContext): HandlerMap {
    return {
        confirmar: (e, s) => confirmar(e, s, ctx),
        atuar: (e, s) => atuar(e, s, ctx),
        selecionar: (e, s) => selecionar(e, s, ctx),
        resultado: (e, s) => resultado(e, s, ctx),
        pesquisar: (e, s) => pesquisar(e, s, ctx),
        unspsc: (e, s) => unspsc(e, s, ctx),
        lupaUnspsc: (e, s) => lupaUnspsc(e, s, ctx),
        abaClassificacao: (e, s) => abaClassificacao(e, s, ctx),
        ncm: (e, s) => ncm(e, s, ctx),
        lei116Servico: (e, s) => lei116Servico(e, s, ctx),
        abaFiscal: (e, s) => abaFiscal(e, s, ctx),
        prosseguir: (e, s) => prosseguir(e, s, ctx),
    };
}
