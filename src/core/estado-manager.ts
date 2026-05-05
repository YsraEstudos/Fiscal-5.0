/**
 * Fachada pública do estado persistido.
 * A implementação fica em módulos menores em ./estado para manter este
 * contrato estável para UI, workflow, reporting e testes.
 */

export type {
    AcaoEstado,
    EstadoApp,
    EstimativaEstado,
    PainelPosicao,
    PainelSecoes,
    PerfilConfig,
    ProgressoEstado,
    UltimoErro,
} from './estado/types.ts';

export {
    ESTADO_PADRAO,
    ESTIMATIVA_PADRAO,
    PAINEL_SECOES_PADRAO,
} from './estado/defaults.ts';

export {
    normalizarEstimativa,
    normalizarPainelPosicao,
    normalizarPainelScrollTop,
    normalizarPainelSecoes,
    normalizarReportingConfig,
} from './estado/normalizers.ts';

export {
    get,
    invalidar,
    persistirAcoes,
    set,
    update,
} from './estado/storage.ts';

