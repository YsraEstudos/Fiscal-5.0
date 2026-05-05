import { expect, test } from "@playwright/test";

async function runAndWait(page) {
  await page.locator("#runScenario").click();
  await expect(page.locator("#status")).toHaveText(/completed|paused|error/);
}

test("jornada feliz: elegível -> UNSPSC -> coleta -> envio", async ({ page }) => {
  let requests = 0;
  await page.route("**/reports/item", async (route) => {
    requests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, itemId: "1001" }),
    });
  });

  for (let i = 0; i < 3; i++) {
    await page.goto("/scenario/happy");
    await runAndWait(page);
    await expect(page.locator("#status")).toHaveText("completed");
    await expect(page.locator("#processedCount")).toHaveText("1");
    await expect(page.locator("#log")).toContainText("Relatório enviado");
  }
  expect(requests).toBe(3);
});

test("item em atuação é ignorado e próximo elegível é processado", async ({ page }) => {
  await page.route("**/reports/item", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

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
  let requests = 0;
  await page.route("**/reports/item", async (route) => {
    requests += 1;
    await route.fulfill({ status: 500, body: "x" });
  });

  for (let i = 0; i < 3; i++) {
    await page.goto("/scenario/ncm_erro");
    await runAndWait(page);
    await expect(page.locator("#status")).toHaveText("paused");
    await expect(page.locator("#processedCount")).toHaveText("0");
    await expect(page.locator("#log")).toContainText("Erro crítico de NCM/NBS detectado");
  }
  expect(requests).toBe(0);
});

test("sem mídia (Mídias 0) não quebra execução", async ({ page }) => {
  await page.route("**/reports/item", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  for (let i = 0; i < 3; i++) {
    await page.goto("/scenario/sem_midia");
    await runAndWait(page);
    await expect(page.locator("#status")).toHaveText("completed");
    await expect(page.locator("#log")).toContainText("Mídias (0)");
  }
});

test("erro de serviço com modo opcional segue fluxo", async ({ page }) => {
  await page.route("**/reports/item", async (route) => {
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ ok: false }),
    });
  });

  for (let i = 0; i < 3; i++) {
    await page.goto("/scenario/service_error_optional");
    await runAndWait(page);
    await expect(page.locator("#status")).toHaveText("completed");
    await expect(page.locator("#log")).toContainText("Modo opcional ativo: fluxo segue");
  }
});

test("confirmação via #butSimContinuar funciona", async ({ page }) => {
  await page.route("**/reports/item", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  for (let i = 0; i < 3; i++) {
    await page.goto("/scenario/confirmar_butSimContinuar");
    await runAndWait(page);
    await expect(page.locator("#status")).toHaveText("completed");
    await expect(page.locator("#butSimContinuar")).toHaveAttribute("data-clicked", "true");
    await expect(page.locator("#log")).toContainText("Confirmação via #butSimContinuar");
  }
});
