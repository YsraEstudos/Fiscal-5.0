import { describe, it, expect } from 'vitest';
import { __test_ncm_internals__ } from '../src/workflow/handlers/ncm.ts';

const {
    textoCombinaOpcaoLei116,
    normalizarLei116,
    campoLei116EhPlaceholder
} = __test_ncm_internals__;

describe('NCM Handler - Regras de Negócio', () => {

    describe('textoCombinaOpcaoLei116() - Agrupador Semântico de SubGrupos', () => {
        it('deve rejeitar "00. NAO APLICAVEL" false matches', () => {
            expect(textoCombinaOpcaoLei116('00. NAO APLICAVEL / SEM CLASSIFICACAO', '7')).toBe(false);
            expect(textoCombinaOpcaoLei116('00. NAO APLICAVEL / SEM CLASSIFICACAO', '02')).toBe(false);
        });

        it('deve aceitar "00. NAO APLICAVEL" apenas se for o alvo explícito', () => {
            expect(textoCombinaOpcaoLei116('00. NAO APLICAVEL / SEM CLASSIFICACAO', '00')).toBe(true);
            expect(textoCombinaOpcaoLei116('00. NAO APLICAVEL', 'NAO APLICAVEL')).toBe(true);
        });

        it('deve fazer match do Grupo isolado ignorando zeros à esquerda', () => {
            expect(textoCombinaOpcaoLei116('07. Serviços relativos a engenharia...', '7')).toBe(true);
            expect(textoCombinaOpcaoLei116('07. Serviços relativos a engenharia...', '07')).toBe(true);
        });

        it('deve fazer match do SubGrupo isolado contra strings da UI', () => {
            // O caso principal do bug do loop infinito: buscar "02" na string "07.02. Execução..."
            expect(textoCombinaOpcaoLei116('07.02. Execução...', '02')).toBe(true);
            expect(textoCombinaOpcaoLei116('07.10. Limpeza, paisagismo...', '10')).toBe(true);
        });

        it('deve rejeitar SubGrupos parecidos ou incorretos', () => {
            expect(textoCombinaOpcaoLei116('07.02. Execução...', '03')).toBe(false);
            expect(textoCombinaOpcaoLei116('07.10. Limpeza...', '01')).toBe(false);
        });

        it('deve aceitar SubGrupo completo da mesma família', () => {
            expect(textoCombinaOpcaoLei116('07.02. Execução...', '07.02')).toBe(true);
            expect(textoCombinaOpcaoLei116('07.02. Execução...', '7.02')).toBe(true);
        });
    });

    describe('normalizarLei116() - Parser de entradas sujas', () => {
        it('deve transformar strings completas em formato grupo/subgrupo', () => {
            const result = normalizarLei116('07.02');
            expect(result).toEqual({ grupo: '7', subgrupo: '02', valor: '7.02' });
        });

        it('deve converter vírgula e espaços', () => {
            const result = normalizarLei116('  7,02  ');
            expect(result).toEqual({ grupo: '7', subgrupo: '02', valor: '7.02' });
        });

        it('deve retornar null para dados vazios ou inválidos', () => {
            expect(normalizarLei116('')).toBeNull();
            expect(normalizarLei116('abc')).toBeNull();
            expect(normalizarLei116('7')).toBeNull();
        });
    });

    describe('campoLei116EhPlaceholder() - Detecção de Dropdown Vazio', () => {
        it('deve identificar os placeholders clássicos da UI', () => {
            expect(campoLei116EhPlaceholder('< nao definido >')).toBe(true);
            expect(campoLei116EhPlaceholder('< não definido >')).toBe(true);
            expect(campoLei116EhPlaceholder('< nao aplicavel >')).toBe(true);
            expect(campoLei116EhPlaceholder('')).toBe(true);
            expect(campoLei116EhPlaceholder(null)).toBe(true);
        });

        it('NAO deve tratar opções reais como placeholder', () => {
            expect(campoLei116EhPlaceholder('00. NAO APLICAVEL / SEM CLASSIFICACAO')).toBe(false);
            expect(campoLei116EhPlaceholder('07. Serviços')).toBe(false);
        });
    });

});
