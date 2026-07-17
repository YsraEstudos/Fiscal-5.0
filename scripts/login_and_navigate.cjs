const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

async function main() {
    console.log("Iniciando o navegador Chromium...");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
        viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();

    console.log("Navegando para https://sso2.klassmatt.com.br/painel.aspx ...");
    await page.goto('https://sso2.klassmatt.com.br/painel.aspx', { waitUntil: 'networkidle' });

    console.log("Realizando o preenchimento das credenciais...");
    await page.fill('#txtUsuario', 'israel.machado');
    await page.fill('#txtSenha', 'integra@2024');

    console.log("Clicando em Entrar...");
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle' }),
        page.click('#cmdEntrar')
    ]);

    console.log("Login efetuado!");
    console.log("URL após login:", page.url());
    console.log("Título após login:", await page.title());

    const artifactDir = 'C:\\Users\\israe\\.gemini\\antigravity\\brain\\cb627064-4615-4394-92a6-e61d5e7ae541';
    
    // Tirar screenshot da página do painel
    const screenshotPath = path.join(artifactDir, 'after_login.png');
    await page.screenshot({ path: screenshotPath });
    console.log("Screenshot do painel pós-login salvo em:", screenshotPath);

    // Listar todos os links e botões da página do painel
    const elements = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a')).map(el => ({
            tag: 'a',
            id: el.id || null,
            text: el.innerText ? el.innerText.trim() : null,
            href: el.getAttribute('href') || null,
            onclick: el.getAttribute('onclick') || null
        }));
        
        const inputs = Array.from(document.querySelectorAll('input')).map(el => ({
            tag: 'input',
            id: el.id || null,
            name: el.name || null,
            type: el.type || null,
            placeholder: el.placeholder || null,
            value: el.value || null
        }));

        return { anchors, inputs };
    });

    console.log(`Encontrados ${elements.anchors.length} links e ${elements.inputs.length} inputs.`);
    
    // Vamos filtrar links ou inputs que contenham RODONAVES
    const rodonavesLinks = elements.anchors.filter(a => a.text && a.text.toUpperCase().includes('RODONAVES') || (a.href && a.href.toUpperCase().includes('RODONAVES')));
    console.log("Links contendo RODONAVES:", JSON.stringify(rodonavesLinks, null, 2));

    const searchInputs = elements.inputs.filter(i => i.placeholder && i.placeholder.toLowerCase().includes('pesquisa') || i.id && i.id.toLowerCase().includes('busca') || i.id && i.id.toLowerCase().includes('search'));
    console.log("Inputs de busca:", JSON.stringify(searchInputs, null, 2));

    await browser.close();
}

main().catch(err => {
    console.error("Erro na execução:", err);
});
