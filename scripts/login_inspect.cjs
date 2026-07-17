const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

async function main() {
    console.log("Iniciando o navegador Chromium...");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    console.log("Navegando para https://sso2.klassmatt.com.br/painel.aspx ...");
    await page.goto('https://sso2.klassmatt.com.br/painel.aspx', { waitUntil: 'networkidle' });

    console.log("URL atual:", page.url());
    console.log("Título da página:", await page.title());

    const artifactDir = 'C:\\Users\\israe\\.gemini\\antigravity\\brain\\cb627064-4615-4394-92a6-e61d5e7ae541';
    
    // Tirar screenshot
    const screenshotPath = path.join(artifactDir, 'login_initial.png');
    await page.screenshot({ path: screenshotPath });
    console.log("Screenshot inicial salvo em:", screenshotPath);

    // Obter todos os inputs
    const inputs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input, select, button')).map(el => ({
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            name: el.name || null,
            type: el.type || null,
            placeholder: el.placeholder || null,
            value: el.value || null,
            className: el.className || null
        }));
    });

    console.log("Elementos de entrada encontrados:");
    console.log(JSON.stringify(inputs, null, 2));

    // Salvar o HTML
    const html = await page.content();
    const htmlPath = path.join(artifactDir, 'login_page.html');
    fs.writeFileSync(htmlPath, html);
    console.log("HTML salvo em:", htmlPath);

    await browser.close();
}

main().catch(err => {
    console.error("Erro na execução:", err);
});
