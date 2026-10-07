import { expect, type Page } from "@playwright/test";

export async function openSampleList(page: Page) {
  await page.getByRole("button", { name: "HRBIP 홈", exact: true }).click();
  await page.locator("#intro").getByRole("button", { name: "샘플로 체험하기", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "샘플 데이터 선택" })).toBeVisible();
}
export async function openBasicSample(page: Page) {
  await openSampleList(page);
  await page.getByRole("dialog", { name: "샘플 데이터 선택" }).getByRole("button", { name: "기본 샘플 열기", exact: true }).click();
}
export async function openNewWork(page: Page) {
  await page.getByRole("button", { name: "HRBIP 홈", exact: true }).click();
  await page.locator("#intro").getByRole("button", { name: "대시보드 만들기", exact: true }).click();
}
export async function openSavedWorks(page: Page) {
  await page.getByRole("navigation", { name: "주요 기능" }).getByRole("button", { name: "인사현황 분석·보고", exact: true }).click();
  await page.locator("#site-menu-reports").getByRole("button", { name: /^저장한 작업/ }).click();
}
export async function openInquiry(page: Page) {
  await page.getByRole("navigation", { name: "주요 기능" }).getByRole("button", { name: "문의·기능 제안", exact: true }).click();
  await page.locator("#site-menu-contact").getByRole("button", { name: /^사용 중 문의·기능 요청/ }).click();
}
export async function openSupportTool(page: Page, title: string) {
  await page.getByRole("navigation", { name: "주요 기능" }).getByRole("button", { name: "인사 실무 도구", exact: true }).click();
  await page.locator("#site-menu-support").getByRole("button", { name: title }).click();
}
