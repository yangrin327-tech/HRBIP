import { openBasicSample, openNewWork, openSavedWorks } from "../navigation";
import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import AxeBuilder from "@axe-core/playwright";

test("repeat saved report with renamed columns uses only new rows and exports preview edits", async ({
  page,
}) => {
  const registered = await page.request.post("/api/auth/register", {
    data: {
      username: "repeat" + Date.now(),
      password: "synthetic-repeat-password-12345",
    },
  });
  expect(registered.status()).toBe(201);
  await page.goto("/");
  await openBasicSample(page);
  await page.getByRole("tab", { name: "보고서", exact: true }).click();
  await page
    .getByLabel("담당자 설명·의견", { exact: true })
    .fill("이전 달 전용 의견");
  await page.getByRole("button", { name: "계정에 저장", exact: true }).click();
  await expect(page.locator(".save-state")).toContainText("저장한 작업이에요");
  const initial = await (await page.request.get("/api/works")).json();
  const old = await (
    await page.request.get("/api/works/" + initial[0].id)
  ).json();
  await openSavedWorks(page);
  await page
    .getByRole("button", { name: "새 자료로 반복 보고", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "업로드 전 준비 안내" }),
  ).toBeVisible();
  await expect(page.getByText("현재 작업에 연결한 표")).toHaveCount(0);
  await page.getByLabel("파일 업로드").setInputFiles({
    name: "October.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "사번,입사날짜,퇴사일,부서,고용형태\nNEW001,2026-10-02,,새부서,정규직\nNEW002,2026-10-03,,새부서,정규직",
    ),
  });
  await page.getByRole("button", { name: "항목 연결·데이터 확인" }).click();
  await expect(page.getByLabel("이번 보고 시작월")).toHaveValue("2026-10");
  await page.getByLabel("재사용할 설정 · October.csv").selectOption("0");
  await expect(page.getByText(/새 파일에 없는 열: 입사일/)).toBeVisible();
  await page.screenshot({
    path: "artifacts/verification/repeat-settings.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "설정 적용하고 새 자료 검증" })
    .click();
  await expect(page.getByLabel("이력 확인 시작일")).toHaveValue("");
  await expect(
    page.getByLabel(
      "연결된 항목, 한 행의 의미, 단위와 자료 범위를 확인했어요.",
    ),
  ).not.toBeChecked();
  await page
    .getByLabel("입사일", { exact: false })
    .filter({ has: page.locator("option") })
    .selectOption("입사날짜");
  await page.getByLabel("이력 확인 시작일").fill("2026-09-30");
  await page.getByLabel("이력 확인 종료일").fill("2026-10-31");
  await page
    .getByLabel("연결된 항목, 한 행의 의미, 단위와 자료 범위를 확인했어요.")
    .check();
  await page
    .getByLabel("위 기간·포함 대상·집계 기준으로 보고서를 만드는 데 동의해요.")
    .check();
  await page.getByRole("button", { name: "추천 결과 만들기" }).click();
  await expect(page.locator(".primary-metric strong")).toHaveText("2명");
  await page
    .getByRole("button", {
      name: "2026-10 월말 인원 (명) 계산 기준 보기",
      exact: true,
    })
    .click();
  const evidence = page.getByRole("dialog", { name: "지표 계산 근거" });
  await expect(evidence).toContainText("입사일 ← 입사날짜");
  await expect(evidence).toContainText("October.csv");
  await evidence.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "최종 확인·내보내기" }).click();
  await expect(page.getByLabel("출력할 담당자 의견")).toHaveValue("");
  await page.getByLabel("출력할 보고서 제목").fill("10월 검토 완료 보고서");
  await page.getByLabel("출력할 담당자 의견").fill("이번 달에 확인한 설명");
  await page.getByLabel("파일 형식").selectOption("xlsx");
  await page
    .getByLabel(
      "현재 수치·기간·필터와 보고서 문장, 직접 작성한 의견을 확인했어요.",
    )
    .check();
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "XLSX 다운로드", exact: true })
    .click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe("10월 검토 완료 보고서.xlsx");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile((await file.path())!);
  const content = JSON.stringify(wb.worksheets.map((s) => s.getSheetValues()));
  expect(content).toContain("이번 달에 확인한 설명");
  expect(content).not.toContain("이전 달 전용 의견");
  const all = await (await page.request.get("/api/works")).json();
  expect(all).toHaveLength(1); // Download alone does not upload the new work.
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  await page.getByRole("button", { name: "계정에 저장", exact: true }).click();
  await expect(page.locator(".save-state")).toContainText("저장한 작업이에요");
  const savedWorks = await (await page.request.get("/api/works")).json();
  expect(savedWorks).toHaveLength(2);
  const oldAfter = await (
    await page.request.get("/api/works/" + initial[0].id)
  ).json();
  expect(oldAfter.workspace).toEqual(old.workspace);
  const fresh = savedWorks.find((x: any) => x.id !== initial[0].id);
  const restored = await (
    await page.request.get("/api/works/" + fresh.id)
  ).json();
  expect(restored.workspace.datasets).toHaveLength(1);
  expect(restored.workspace.datasets[0].rows).toHaveLength(2);
  expect(JSON.stringify(restored.workspace.datasets)).not.toContain("E001");
  await page.reload();
  await openSavedWorks(page);
  await page
    .locator(".saved-list article")
    .filter({ hasText: "10월 검토 완료 보고서" })
    .getByRole("button", { name: "열기", exact: true })
    .click();
  await expect(page.locator(".primary-metric strong")).toHaveText("2명");
});

test("metric evidence and document preview remain accessible on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await openNewWork(page);
  await expect(
    page.getByRole("region", { name: "업로드 전 준비 안내" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "샘플 데이터 선택", exact: true })
    .click();
  await page.getByRole("button", { name: "추천 결과 만들기" }).click();
  await page
    .getByRole("button", { name: /2026-09 월말 인원.*계산 기준 보기/ })
    .click();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  await page.getByRole("button", { name: "최종 확인·내보내기" }).click();
  const preview = page.getByRole("region", { name: "보고 자료 미리보기" });
  await expect(preview).toBeVisible();
  await preview.locator(".preview-chart summary").first().click();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(
    await page
      .getByRole("dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/verification/report-preview-mobile.png",
  });
});
