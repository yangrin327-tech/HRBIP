import { openSampleList } from "../navigation";
import { test, expect } from "@playwright/test";

test("sample library opens the supplied 24-month data and filters September consistently", async ({
  page,
}) => {
  await page.goto("/");
  await openSampleList(page);
  await expect(
    page.getByRole("dialog", { name: "샘플 데이터 선택" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "150명·24개월 샘플 열기", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "150명·24개월 가상 인사현황",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByLabel("시작 월", { exact: true })).toHaveValue(
    "2024-10",
  );
  await expect(
    page.getByLabel("부서", { exact: true }).locator("option"),
  ).toHaveCount(8);
  await page.getByLabel("시작 월", { exact: true }).fill("2026-09");
  await expect(
    page.getByText("777,134,313", { exact: false }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("26,799", { exact: false }).first(),
  ).toBeVisible();
  await page.getByRole("tab", { name: "보고서", exact: true }).click();
  await expect(page.getByLabel("담당자 설명·의견")).toHaveValue(
    /최종 관측 분류/,
  );
  await page.getByRole("tab", { name: "대시보드", exact: true }).click();
  await page.screenshot({
    path: "artifacts/verification/large-sample-dashboard.png",
    fullPage: true,
  });
});
