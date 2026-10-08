import { test, expect } from "@playwright/test";
import { openBasicSample, openSavedWorks } from "../navigation";

test("account refresh opens home and saved account work can be reopened", async ({ page }) => {
  const response = await page.request.post("/api/auth/register", {
    data: { username: "homeentry" + Date.now(), password: "Only-Test-Home-Entry-2026!" },
  });
  expect(response.status()).toBe(201);
  await page.goto("/");
  await openBasicSample(page);
  await page.getByRole("tab", { name: "보고서", exact: true }).click();
  await page.getByLabel("담당자 설명·의견").fill("계정 저장 의견은 유지돼요");
  await page.getByRole("button", { name: "계정에 저장", exact: true }).click();
  await expect(page.locator(".save-state")).toContainText("저장한 작업이에요");
  await page.reload();
  await expect(page.locator("#intro-title")).toBeVisible();
  await expect(page.getByRole("tab", { name: "대시보드", exact: true })).toHaveCount(0);
  await openSavedWorks(page);
  await page.locator(".saved-list article").getByRole("button", { name: "열기", exact: false }).click();
  await page.getByRole("tab", { name: "보고서", exact: true }).click();
  await expect(page.getByLabel("담당자 설명·의견")).toHaveValue("계정 저장 의견은 유지돼요");
});
