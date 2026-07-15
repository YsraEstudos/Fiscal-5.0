/**
 * Definição das ações do workflow de automação.
 * Cada ação descreve um passo do fluxo com seletor, tipo e ordem.
 * Extraído do monólito (linhas 144–159).
 */

export type TipoAcao = 'click' | 'input' | 'custom';

export interface AcaoWorkflow {
    readonly id: string;
    readonly nome: string;
    readonly seletor: string;
    readonly tipo: TipoAcao;
    readonly ordem: number;
    readonly valorPadrao?: string;
}

export const ACOES_WORKFLOW: readonly AcaoWorkflow[] = Object.freeze([
    { id: 'atuar', nome: 'Atuar no Item', seletor: 'input[name$="butAcao3"]', tipo: 'click', ordem: 1 },
    { id: 'abaFiscal', nome: 'Aba Fiscal', seletor: 'text=Fiscal', tipo: 'click', ordem: 2 },
    { id: 'ncm', nome: 'Preencher NCM', seletor: '#txtNCMTIPI, #txtNBS', tipo: 'input', ordem: 3, valorPadrao: '8471.30.12' },
    { id: 'cest', nome: 'Preencher CEST', seletor: '#txtCest', tipo: 'custom', ordem: 4 },
    { id: 'lei116Servico', nome: 'Preencher Lei 116 (Serviço)', seletor: 'input.Cat90, input.Cat91', tipo: 'custom', ordem: 5 },
    { id: 'abaClassificacao', nome: 'Aba Classificações', seletor: 'text=Classificações', tipo: 'click', ordem: 6 },
    { id: 'lupaUnspsc', nome: 'Lupa UNSPSC', seletor: '#ibutUNSPSC', tipo: 'click', ordem: 7 },
    { id: 'unspsc', nome: 'Preencher UNSPSC', seletor: '#txtCodigoUnspsc, #txtCodUNSPSC, input[name$="txtCodigoUnspsc"], input[name$="txtCodUNSPSC"]', tipo: 'input', ordem: 8, valorPadrao: '30103618' },
    { id: 'pesquisar', nome: 'Pesquisar', seletor: 'input[name*="butPesquisar"]', tipo: 'click', ordem: 9 },
    { id: 'resultado', nome: 'Clique Resultado', seletor: 'a[id="txtDescricao"]', tipo: 'click', ordem: 10 },
    { id: 'selecionar', nome: 'Selecionar UNSPSC', seletor: '#butFechar', tipo: 'click', ordem: 11 },
    { id: 'prosseguir', nome: 'Prosseguir', seletor: '#butAcao2, #butAcao1, input[value="Prosseguir"]', tipo: 'click', ordem: 12 },
    { id: 'confirmar', nome: 'Confirmar (Sim)', seletor: '#butSim', tipo: 'click', ordem: 13 },
]);
