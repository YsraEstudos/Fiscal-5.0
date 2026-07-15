import { escapeHtml } from '../utils/misc.ts';
import { buscarElementoDeep } from '../utils/selectors.ts';

export interface EmpresaMonitorada {
    nome: string;
    codigo: string;
}

export interface ProjetoSso {
    codigo: string;
    rotulo: string;
    href: string;
}

export interface AbaFiscalHeartbeat {
    id: string;
    identidades: string[];
    host: string;
    url: string;
    titulo: string;
    atualizadoEm: number;
}

export interface StatusEmpresaMonitorada extends EmpresaMonitorada {
    aberta: boolean;
    aba: AbaFiscalHeartbeat | null;
}

export interface ResultadoAberturaEmpresas {
    solicitadas: number;
    abertas: number;
    semLink: number;
}

const CONFIG_COOKIE = 'km_fiscal_sso_empresas_v1';
const TAB_COOKIE_PREFIX = 'km_fiscal_sso_tab_v1_';
const TAB_ID_STORAGE_KEY = 'km_fiscal_sso_tab_id';
const HEARTBEAT_INTERVAL_MS = 4_000;
const HEARTBEAT_TTL_MS = 15_000;
const HEARTBEAT_COOKIE_MAX_AGE = 25;
const CONFIG_COOKIE_MAX_AGE = 31_536_000;

let heartbeatTimer: number | null = null;
let monitorTimer: number | null = null;
let mensagemMonitor = '';
let mensagemMonitorErro = false;

function temDocumento(): boolean {
    return typeof document !== 'undefined' && typeof location !== 'undefined';
}

function obterDominioCookie(): string {
    if (typeof location !== 'undefined' && /(?:^|\.)klassmatt\.com\.br$/i.test(location.hostname)) {
        return '; domain=.klassmatt.com.br';
    }
    return '';
}

function definirCookie(nome: string, valor: string, maxAge: number): void {
    if (!temDocumento()) return;
    document.cookie = `${nome}=${encodeURIComponent(valor)}; path=/${obterDominioCookie()}; max-age=${maxAge}; samesite=lax`;
}

function removerCookie(nome: string): void {
    definirCookie(nome, '', 0);
}

function lerCookies(): Record<string, string> {
    if (!temDocumento()) return {};
    return document.cookie.split(';').reduce<Record<string, string>>((cookies, parte) => {
        const separador = parte.indexOf('=');
        if (separador < 0) return cookies;
        const nome = parte.slice(0, separador).trim();
        if (!nome) return cookies;
        const valor = parte.slice(separador + 1);
        try {
            cookies[nome] = decodeURIComponent(valor);
        } catch {
            cookies[nome] = valor;
        }
        return cookies;
    }, {});
}

function obterTabId(): string {
    try {
        const existente = sessionStorage.getItem(TAB_ID_STORAGE_KEY);
        if (existente) return existente;
        const cryptoApi = (globalThis as typeof globalThis & { crypto?: Crypto }).crypto;
        const novo = cryptoApi?.randomUUID?.() || `tab_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        sessionStorage.setItem(TAB_ID_STORAGE_KEY, novo);
        return novo;
    } catch {
        return `tab_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }
}

const TAB_ID = obterTabId();

export function ehPaginaSso(): boolean {
    if (!temDocumento()) return false;
    const host = location.hostname.toLowerCase();
    return (host === 'sso.klassmatt.com.br' || host === 'sso2.klassmatt.com.br')
        && /\/painel\.aspx$/i.test(location.pathname);
}

function normalizarLinhaEmpresa(valor: string): string {
    return valor
        .trim()
        .replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)/, '')
        .replace(/^(?:\*{1,3}|_{1,3})\s*/, '')
        .replace(/\s*(?:\*{1,3}|_{1,3})$/, '')
        .trim();
}

export function normalizarNomeMonitorado(valor: unknown): string {
    return String(valor ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[_\-/.]+/g, ' ')
        .replace(/[^A-Z0-9 ]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function chavesComparacao(valor: unknown): string[] {
    const normalizado = normalizarNomeMonitorado(valor);
    if (!normalizado) return [];
    const semAmbiente = normalizado
        .replace(/\b(PRD|PRODUCAO|HOMOLOGACAO|HOMOLOG|FERRAMENTAS|FER)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return [...new Set([normalizado, semAmbiente].filter(Boolean))];
}

function identidadesCombinam(primeiro: unknown, segundo: unknown): boolean {
    const chavesPrimeiro = chavesComparacao(primeiro);
    const chavesSegundo = new Set(chavesComparacao(segundo));
    if (chavesPrimeiro.some((chave) => chavesSegundo.has(chave))) return true;
    return chavesPrimeiro.some((chavePrimeiro) => [...chavesSegundo].some((chaveSegundo) => {
        const menor = chavePrimeiro.length <= chaveSegundo.length ? chavePrimeiro : chaveSegundo;
        const maior = chavePrimeiro.length <= chaveSegundo.length ? chaveSegundo : chavePrimeiro;
        return menor.length >= 3 && maior.startsWith(menor);
    }));
}

function deduplicarEmpresas(empresas: EmpresaMonitorada[]): EmpresaMonitorada[] {
    const vistos = new Set<string>();
    return empresas.filter((empresa) => {
        const chave = normalizarNomeMonitorado(empresa.codigo || empresa.nome);
        if (!chave || vistos.has(chave)) return false;
        vistos.add(chave);
        return true;
    });
}

function criarEmpresaMonitorada(nome: string, projetos: ProjetoSso[]): EmpresaMonitorada {
    const nomeLimpo = nome.trim();
    const projeto = projetos.find((candidato) => {
        return [candidato.codigo, candidato.rotulo].some((valor) => identidadesCombinam(nomeLimpo, valor));
    });
    return {
        nome: nomeLimpo,
        codigo: projeto?.codigo || nomeLimpo,
    };
}

export function obterProjetosSso(): ProjetoSso[] {
    if (!temDocumento()) return [];
    return Array.from(document.querySelectorAll<HTMLAnchorElement>('a#lkDest[title]'))
        .map((link) => ({
            codigo: String(link.getAttribute('title') || '').trim(),
            rotulo: String(link.textContent || '').replace(/\s+/g, ' ').trim(),
            href: String(link.getAttribute('href') || '').trim(),
        }))
        .filter((projeto) => projeto.codigo && projeto.href);
}

export function analisarListaEmpresas(valor: string): string[] {
    return [...new Set(
        String(valor || '')
            .split(/\r?\n/)
            .map((linha) => normalizarLinhaEmpresa(linha))
            .filter(Boolean),
    )];
}

export function obterEmpresasMonitoradas(): EmpresaMonitorada[] {
    const bruto = lerCookies()[CONFIG_COOKIE];
    if (!bruto) return [];

    try {
        const salvo: unknown = JSON.parse(bruto);
        const entradas = Array.isArray(salvo)
            ? salvo
            : (salvo && typeof salvo === 'object' && Array.isArray((salvo as { empresas?: unknown }).empresas)
                ? (salvo as { empresas: unknown[] }).empresas
                : []);
        return deduplicarEmpresas(entradas.map((entrada) => {
            if (typeof entrada === 'string') return criarEmpresaMonitorada(entrada, []);
            const objeto = entrada && typeof entrada === 'object' ? entrada as Record<string, unknown> : {};
            const nome = String(objeto['nome'] || objeto['codigo'] || '').trim();
            return {
                nome,
                codigo: String(objeto['codigo'] || nome).trim(),
            };
        }).filter((empresa) => empresa.nome));
    } catch {
        return [];
    }
}

export function salvarEmpresasMonitoradas(valor: string): EmpresaMonitorada[] {
    const projetos = obterProjetosSso();
    const empresas = deduplicarEmpresas(analisarListaEmpresas(valor).map((nome) => criarEmpresaMonitorada(nome, projetos)));
    definirCookie(CONFIG_COOKIE, JSON.stringify(empresas), CONFIG_COOKIE_MAX_AGE);
    mensagemMonitor = empresas.length ? `${empresas.length} empresa(s) configurada(s).` : 'Nenhuma empresa configurada.';
    mensagemMonitorErro = false;
    atualizarPainelSso();
    return empresas;
}

function lerBatimentos(): AbaFiscalHeartbeat[] {
    const agora = Date.now();
    return Object.entries(lerCookies())
        .filter(([nome]) => nome.startsWith(TAB_COOKIE_PREFIX))
        .map(([nome, valor]) => {
            try {
                const batimento = JSON.parse(valor) as AbaFiscalHeartbeat;
                if (!batimento || !batimento.id || !Number.isFinite(batimento.atualizadoEm)) return null;
                if (agora - batimento.atualizadoEm > HEARTBEAT_TTL_MS) {
                    removerCookie(nome);
                    return null;
                }
                return batimento;
            } catch {
                return null;
            }
        })
        .filter((batimento): batimento is AbaFiscalHeartbeat => !!batimento);
}

export function empresaMonitoradaEstaAberta(empresa: EmpresaMonitorada, abas: AbaFiscalHeartbeat[]): AbaFiscalHeartbeat | null {
    return abas.find((aba) => aba.identidades.some((identidade) => {
        return identidadesCombinam(empresa.nome, identidade) || identidadesCombinam(empresa.codigo, identidade);
    })) || null;
}

export function obterStatusEmpresas(): StatusEmpresaMonitorada[] {
    const abas = lerBatimentos();
    return obterEmpresasMonitoradas().map((empresa) => {
        const aba = empresaMonitoradaEstaAberta(empresa, abas);
        return { ...empresa, aberta: !!aba, aba };
    });
}

function adicionarIdentidade(lista: string[], valor: unknown): void {
    const texto = String(valor || '').replace(/\s+/g, ' ').trim();
    if (!texto) return;
    const partes = texto.split(/\/\//).map((parte) => parte.trim()).filter(Boolean);
    [...partes, texto].forEach((parte) => {
        if (!lista.some((existente) => identidadesCombinam(existente, parte))) lista.push(parte);
    });
}

function obterIdentidadesDaAba(): string[] {
    if (!temDocumento()) return [];
    const identidades: string[] = [];
    const usuario = buscarElementoDeep('#lblUsuario')?.textContent
        || document.querySelector('#lblUsuario')?.textContent;
    adicionarIdentidade(identidades, usuario);
    const infoSin = document.querySelector('#Label_infoSIN')?.textContent || '';
    const empresaInfo = infoSin.match(/Empresa\s*:\s*(.+)$/i)?.[1];
    adicionarIdentidade(identidades, empresaInfo);
    adicionarIdentidade(identidades, document.title);
    adicionarIdentidade(identidades, location.hostname.split('.')[0]);
    return identidades.slice(0, 12);
}

function publicarBatimento(): void {
    if (!temDocumento() || ehPaginaSso()) return;
    const batimento: AbaFiscalHeartbeat = {
        id: TAB_ID,
        identidades: obterIdentidadesDaAba(),
        host: location.host,
        url: location.href,
        titulo: document.title,
        atualizadoEm: Date.now(),
    };
    definirCookie(`${TAB_COOKIE_PREFIX}${TAB_ID.replace(/[^a-zA-Z0-9_-]/g, '_')}`, JSON.stringify(batimento), HEARTBEAT_COOKIE_MAX_AGE);
}

function removerBatimento(): void {
    removerCookie(`${TAB_COOKIE_PREFIX}${TAB_ID.replace(/[^a-zA-Z0-9_-]/g, '_')}`);
    if (heartbeatTimer !== null && typeof globalThis !== 'undefined') {
        globalThis.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }
}

export function iniciarBatimentoAba(): void {
    if (!temDocumento() || ehPaginaSso() || heartbeatTimer !== null) return;
    publicarBatimento();
    heartbeatTimer = globalThis.setInterval(publicarBatimento, HEARTBEAT_INTERVAL_MS) as unknown as number;
    globalThis.addEventListener('pagehide', removerBatimento, { once: true });
    globalThis.addEventListener('beforeunload', removerBatimento, { once: true });
}

export function definirMensagemMonitorSSO(mensagem: string, erro = false): void {
    mensagemMonitor = mensagem;
    mensagemMonitorErro = erro;
    const status = document.getElementById('kmSsoEmpresasStatus');
    if (!status) return;
    status.textContent = mensagem;
    status.classList.toggle('is-error', erro);
}

export function renderSsoEmpresasSection(): string {
    if (!ehPaginaSso()) return '';
    const empresas = obterEmpresasMonitoradas();
    return `
        <section id="kmSsoEmpresas" class="km-card km-sso-card">
            <div class="km-card-head km-card-head--tight">
                <div>
                    <label class="km-section-label">Empresas no SSO</label>
                    <div class="km-helper-text km-sso-subtitle">Monitore e abra automaticamente as empresas desejadas.</div>
                </div>
                <span id="kmSsoEmpresasResumo" class="km-badge">0/0 abertas</span>
            </div>
            <div class="km-field">
                <label for="kmSsoEmpresasInput">Uma empresa por linha</label>
                <textarea id="kmSsoEmpresasInput" class="km-textarea km-sso-input" placeholder="TRES_CORACOES_S4HANA - PRD\nRODONAVES - PRD">${escapeHtml(empresas.map((empresa) => empresa.nome).join('\n'))}</textarea>
                <div class="km-helper-text">Use o nome/código exibido no cartão do SSO. A lista fica disponível entre os subdomínios Klassmatt.</div>
            </div>
            <div class="km-button-row">
                <button id="btnSsoEmpresasSalvar" class="km-secondary-button" type="button">Salvar lista</button>
                <button id="btnSsoEmpresasAtualizar" class="km-secondary-button" type="button">Atualizar status</button>
            </div>
            <button id="btnSsoEmpresasAbrir" class="km-primary-button km-sso-open-button" type="button">Abrir empresas fechadas</button>
            <div id="kmSsoEmpresasStatus" class="km-status ${mensagemMonitorErro ? 'is-error' : ''}">${escapeHtml(mensagemMonitor)}</div>
            <div id="kmSsoEmpresasLista" class="km-sso-list"></div>
        </section>
    `;
}

export function atualizarPainelSso(): void {
    const root = document.getElementById('kmSsoEmpresas');
    if (!root) return;

    const status = obterStatusEmpresas();
    const abertas = status.filter((empresa) => empresa.aberta).length;
    const faltantes = status.length - abertas;
    const resumo = document.getElementById('kmSsoEmpresasResumo');
    const lista = document.getElementById('kmSsoEmpresasLista');
    const botaoAbrir = document.getElementById('btnSsoEmpresasAbrir') as HTMLButtonElement | null;

    if (resumo) resumo.textContent = `${abertas}/${status.length} abertas`;
    if (botaoAbrir) {
        botaoAbrir.disabled = faltantes === 0;
        botaoAbrir.textContent = faltantes ? `Abrir empresas fechadas (${faltantes})` : 'Todas as empresas estão abertas';
    }
    if (lista) {
        lista.innerHTML = status.length
            ? status.map((empresa) => `
                <div class="km-sso-company-row ${empresa.aberta ? 'is-open' : 'is-closed'}">
                    <span class="km-sso-company-dot" aria-hidden="true">●</span>
                    <span class="km-sso-company-name">${escapeHtml(empresa.nome)}</span>
                    <strong class="km-sso-company-status">${empresa.aberta ? 'ABERTA' : 'FECHADA'}</strong>
                </div>
            `).join('')
            : '<div class="km-helper-text">Nenhuma empresa configurada.</div>';
    }
}

function aplicarPesquisaSso(valor: string): void {
    const input = document.querySelector<HTMLInputElement>('#pesquisar');
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, valor);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'Enter' }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
}

function encontrarLinkProjeto(empresa: EmpresaMonitorada): HTMLAnchorElement | null {
    const projetos = obterProjetosSso();
    const projeto = projetos.find((candidato) => [empresa.codigo, empresa.nome].some((valor) => {
        return [candidato.codigo, candidato.rotulo].some((nome) => identidadesCombinam(valor, nome));
    }));
    if (!projeto) return null;
    return Array.from(document.querySelectorAll<HTMLAnchorElement>('a#lkDest[title]'))
        .find((link) => link.getAttribute('href') === projeto.href) || null;
}

export function abrirLinkProjetoSso(link: HTMLAnchorElement): 'gm_open_in_tab' | 'anchor_click' {
    const gmOpen = (globalThis as typeof globalThis & {
        GM_openInTab?: (url: string, options?: { active?: boolean; insert?: boolean; setParent?: boolean }) => unknown;
    }).GM_openInTab;
    if (typeof gmOpen === 'function') {
        gmOpen(link.href, { active: false, insert: true, setParent: true });
        return 'gm_open_in_tab';
    }
    link.click();
    return 'anchor_click';
}
export function abrirEmpresasFaltantes(): ResultadoAberturaEmpresas {
    if (!ehPaginaSso()) return { solicitadas: 0, abertas: 0, semLink: 0 };
    const faltantes = obterStatusEmpresas().filter((empresa) => !empresa.aberta);
    let abertas = 0;
    let semLink = 0;

    faltantes.forEach((empresa) => {
        const link = encontrarLinkProjeto(empresa);
        if (!link) {
            semLink += 1;
            return;
        }
        aplicarPesquisaSso(empresa.codigo || empresa.nome);
        abrirLinkProjetoSso(link);
        abertas += 1;
    });

    atualizarPainelSso();
    return { solicitadas: faltantes.length, abertas, semLink };
}

export function iniciarMonitorSso(): void {
    if (!temDocumento() || !ehPaginaSso() || monitorTimer !== null) return;
    atualizarPainelSso();
    monitorTimer = globalThis.setInterval(atualizarPainelSso, 3_000) as unknown as number;
}
