import { test, expect } from "@playwright/test";
import { openBasicSample, openSavedWorks } from "../navigation";

test("a plain URL visit shows the introduction while preserving saved work", async ({ page }) => {
  await page.goto("/");
  await openBasicSample(page);
  await page.getByRole("tab", { name: "보고서", exact: true }).click();
  await page.getByLabel("담당자 설명·의견").fill("첫 화면 진입 후에도 보관되는 의견");
  await expect(page.locator(".save-state")).toContainText("자동 저장했어요");

  await page.goto("/");
  await expect(page.locator("#intro-title")).toBeVisible();
  await expect(page.getByRole("tab", { name: "대시보드", exact: true })).toHaveCount(0);
  await openSavedWorks(page);
  await page.locator(".saved-list article").getByRole("button", { name: "열기", exact: false }).click();
  await page.getByRole("tab", { name: "보고서", exact: true }).click();
  await expect(page.getByLabel("담당자 설명·의견")).toHaveValue("첫 화면 진입 후에도 보관되는 의견");
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`home reload starts at the first section at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await openBasicSample(page);
    await expect(page.locator(".save-state")).toContainText("자동 저장했어요");
    await page.getByRole("button", { name: "HRBIP 홈", exact: true }).click();
    if (viewport.width > 980) {
      await page.locator(".landing").evaluate((element) => { element.scrollTop = element.clientHeight * 2; });
      await expect.poll(() => page.locator(".landing").evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    } else {
      await page.locator("#support-intro").scrollIntoViewIfNeeded();
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    }
    await page.reload();
    await expect(page.locator("#intro-title")).toBeVisible();
    await expect.poll(() => page.locator(".landing").evaluate((element) => element.scrollTop)).toBe(0);
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  });
}

test("back and forward keep their view and returning home resets its section", async ({ page }) => {
  await page.goto("/");
  await openBasicSample(page);
  await expect(page.locator(".save-state")).toContainText("자동 저장했어요");
  await page.getByRole("button", { name: "HRBIP 홈", exact: true }).click();
  await page.locator(".landing").evaluate((element) => { element.scrollTop = element.clientHeight; });
  await page.goBack();
  await expect(page.getByRole("tab", { name: "대시보드", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.locator("#intro-title")).toBeVisible();
  await expect.poll(() => page.locator(".landing").evaluate((element) => element.scrollTop)).toBe(0);
});

test("saved work does not override a direct HR tool link or its refresh", async ({ page }) => {
  await page.goto("/");
  await openBasicSample(page);
  await expect(page.locator(".save-state")).toContainText("자동 저장했어요");
  await page.goto("/#tools/contract");
  await expect(page.getByRole("heading", { name: "근로계약 확인", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "대시보드", exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "근로계약 확인", exact: true })).toBeVisible();
});
