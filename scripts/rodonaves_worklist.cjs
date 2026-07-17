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

    console.log("Realizando o login...");
    await page.fill('#txtUsuario', 'israel.machado');
    await page.fill('#txtSenha', 'integra@2024');

    console.log("Clicando em Entrar...");
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle' }),
        page.click('#cmdEntrar')
    ]);

    console.log("Login efetuado no SSO!");
    
    // Clicar no link do projeto RODONAVES
    console.log("Clicando no link RODONAVES para iniciar SSO...");
    // Localizar o primeiro link contendo "RODONAVES" no ID lkDest
    await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle' }),
        page.click('a#lkDest:has-text("RODONAVES")')
    ]);

    console.log("Redirecionamento efetuado!");
    console.log("URL atual do projeto:", page.url());
    console.log("Título atual do projeto:", await page.title());

    const artifactDir = 'C:\\Users\\israe\\.gemini\\antigravity\\brain\\cb627064-4615-4394-92a6-e61d5e7ae541';
    
    // Tirar screenshot
    const screenshotPath = path.join(artifactDir, 'after_redirect.png');
    await page.screenshot({ path: screenshotPath });
    console.log("Screenshot do ambiente Rodonaves salvo em:", screenshotPath);

    // Listar todos os links para achar "Worklist" ou "Acompanhamento"
    const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a')).map(el => ({
            id: el.id || null,
            text: el.innerText ? el.innerText.trim() : null,
            href: el.getAttribute('href') || null,
            onclick: el.getAttribute('onclick') || null
        }));
    });

    console.log(`Encontrados ${links.length} links no painel da Rodonaves.`);

    const worklistLinks = links.filter(l => l.text && (
        l.text.toLowerCase().includes('worklist') || 
        l.text.toLowerCase().includes('acompanhamento') || 
        l.text.toLowerCase().includes('solicita')
    ));
    console.log("Links de Worklist/Acompanhamento encontrados:", JSON.stringify(worklistLinks, null, 2));

    // Salvar o HTML para análise posterior se necessário
    const html = await page.content();
    fs.writeFileSync(path.join(artifactDir, 'rodonaves_main.html'), html);
    console.log("HTML do painel Rodonaves salvo.");

    await browser.close();
}

main().catch(err => {
    console.error("Erro na execução:", err);
});
