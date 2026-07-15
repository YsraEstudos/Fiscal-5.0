import { expect, test } from "@playwright/test";

async function runAndWait(page) {
  await page.locator("#runScenario").click();
  await expect(page.locator("#status")).toHaveText(/completed|paused|error/);
}

test("jornada feliz: elegível -> UNSPSC -> finalização", async ({ page }) => {
  for (let i = 0; i < 3; i++) {
    await page.goto("/scenario/happy");
    await runAndWait(page);
    await expect(page.locator("#status")).toHaveText("completed");
    await expect(page.locator("#processedCount")).toHaveText("1");
  }
});

test("item em atuação é ignorado e próximo elegível é processado", async ({ page }) => {

  for (let i = 0; i < 3; i++) {
    await page.goto("/scenario/em_atuacao");
    await runAndWait(page);
    await expect(page.locator("#status")).toHaveText("completed");
    await expect(page.locator("#ignoredCount")).toHaveText("1");
    await expect(page.locator("#processedCount")).toHaveText("1");
    await expect(page.locator("#log")).toContainText("Ignorado item em atuação");
  }
});

test("erro crítico de NCM/NBS pausa fluxo", async ({ page }) => {
  for (let i = 0; i < 3; i++) {
    await page.goto("/scenario/ncm_erro");
    await runAndWait(page);
    await expect(page.locator("#status")).toHaveText("paused");
    await expect(page.locator("#processedCount")).toHaveText("0");
    await expect(page.locator("#log")).toContainText("Erro crítico de NCM/NBS detectado");
  }
});



test("confirmação via #butSimContinuar funciona", async ({ page }) => {
  for (let i = 0; i < 3; i++) {
    await page.goto("/scenario/confirmar_butSimContinuar");
    await runAndWait(page);
    await expect(page.locator("#status")).toHaveText("completed");
    await expect(page.locator("#butSimContinuar")).toHaveAttribute("data-clicked", "true");
    await expect(page.locator("#log")).toContainText("Confirmação via #butSimContinuar");
  }
});
