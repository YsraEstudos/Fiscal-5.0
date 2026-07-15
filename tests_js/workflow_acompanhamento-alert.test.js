import { beforeEach, describe, expect, it } from 'vitest';
import { scanAcompanhamento } from '../src/workflow/acompanhamento-alert.ts';

function buildLayout({ state = '', body = '', hidden = false } = {}) {
  document.body.innerHTML = `
    <div class="kl-view">
      <input id="txtNumero" value="320780">
      <div class="km-sin-layout" data-km-sin-root="1">
        <aside class="km-sin-aside"${hidden ? ' hidden' : ''}>
          <div class="km-sin-state">${state}</div>
          <div class="km-sin-body">${body}</div>
        </aside>
      </div>
    </div>
  `;
}

describe('scanner de alertas do Acompanhamento', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('detecta palavra e códigos em cartão vermelho fora de links', () => {
    buildLayout({
      body: `
        <article class="km-sin-item is-attention">
          <div class="km-sin-desc">Revisar NCM e NC 8408.20.90</div>
          <div class="km-sin-note">Validar NBS 1.0101.00.00 e NSPSC</div>
        </article>
      `,
    });

    const result = scanAcompanhamento('320780');

    expect(result.status).toBe('ready');
    expect(result.alert?.matches).toEqual(['NCM', 'NC', 'NBS', 'NSPSC', '8408.20.90', '1.0101.00.00']);
    expect(result.alert?.evidence).toContain('Revisar NCM');
  });

  it('ignora cartão vermelho cujo único conteúdo destacável está dentro de link', () => {
    buildLayout({
      body: `
        <article class="km-sin-item is-attention">
          <div class="km-sin-desc">Solicitação enviada para CATALOGACAO</div>
          <div class="km-sin-note"><a href="https://example.test/NCM/8408.20.90">https://example.test/NCM/8408.20.90</a></div>
        </article>
      `,
    });

    const result = scanAcompanhamento('320780');

    expect(result).toEqual({ status: 'ready', alert: null });
  });

  it('aguarda o painel do Acompanhamento terminar de carregar', () => {
    buildLayout({ state: 'Carregando historico...', body: 'Buscando o conteudo de KM Acompanhamento...' });

    expect(scanAcompanhamento('320780')).toEqual({ status: 'loading', alert: null });
  });

  it('não aguarda painel fechado e não confunde outro item residual', () => {
    document.body.innerHTML = `
      <div class="kl-view">
        <input id="txtNumero" value="320780">
        <div class="km-sin-layout" data-km-sin-root="1">
          <aside class="km-sin-aside"><div class="km-sin-body">
            <article class="km-sin-item is-attention"><div class="km-sin-desc">NCM 8408.20.90</div></article>
          </div></aside>
        </div>
      </div>
      <div class="kl-view">
        <input id="txtNumero" value="999999">
        <div class="km-sin-layout" data-km-sin-root="1">
          <aside class="km-sin-aside" hidden><div class="km-sin-state">Carregando historico...</div></aside>
        </div>
      </div>
    `;

    expect(scanAcompanhamento('999999')).toEqual({ status: 'absent', alert: null });
  });
});
