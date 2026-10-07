import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import ExcelJS from "exceljs";
import { readFile, mkdir } from "node:fs/promises";
const result = (page: Page) =>
  page.getByRole("region", { name: "업무 지원 점검 결과", exact: true });
const run = (page: Page) =>
  page.getByRole("button", { name: "입력 자료 점검하기" }).click();
const screenshotRoot = "artifacts/verification/support-review";
async function verifyView(page: Page, name: string) {
  await result(page)
    .getByRole("heading", { name: "점검 결과", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${screenshotRoot}/${name}-desktop.png` });
  const audit = await new AxeBuilder({ page })
    .include(".quick-tool-page")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    audit.violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await result(page)
    .getByRole("heading", { name: "점검 결과", exact: true })
    .scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: `${screenshotRoot}/${name}-mobile.png` });
  await page.setViewportSize({ width: 1440, height: 1000 });
}
test.beforeAll(async () => {
  await mkdir(screenshotRoot, { recursive: true });
});
test("contract shows actual calculations, reasons and proposed revisions; corrections change results and exports", async ({
  page,
}) => {
  const sent: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes("/api/"))
      sent.push(req.url());
  });
  await page.goto("/#tools/contract");
  await page
    .getByRole("button", { name: "점검이 필요한 예시", exact: true })
    .click();
  await run(page);
  const pay = result(page)
    .locator(".support-finding")
    .filter({
      has: page.getByRole("heading", {
        name: "월 임금 합계 불일치",
        exact: true,
      }),
    });
  await expect(pay).toContainText("200,000원");
  await expect(
    pay.getByText("왜 확인해야 하나요?", { exact: true }),
  ).toBeVisible();
  await expect(pay.locator(".support-review-suggestion")).toContainText(
    "3,000,000원",
  );
  await expect(result(page)).toContainText("8시간 30분");
  await expect(result(page)).toContainText("근로기준법 제54조");
  await verifyView(page, "contract");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "검토표 Excel 다운로드" }).click();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile((await (await downloading).path())!);
  const findings = workbook.getWorksheet("확인 항목")!;
  expect(findings.getRow(1).values).toContain("이유");
  const row = findings
    .getRows(2, findings.rowCount - 1)!
    .find((row) => row.getCell(1).text === "월 임금 합계 불일치")!;
  expect(row.getCell(4).text).toContain("200,000원");
  expect(row.getCell(6).text).toContain("3,000,000원");
  const text = page.getByRole("textbox", {
    name: "계약 내용 (발췌·첨부 규정은 구분해 입력)",
    exact: true,
  });
  await text.fill(
    (await text.inputValue())
      .replace("320만원", "300만원")
      .replace("12:30", "13:00"),
  );
  await expect(result(page)).toHaveCount(0);
  await run(page);
  await expect(
    result(page).getByRole("heading", {
      name: "월 임금 합계 불일치",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    result(page).getByRole("heading", {
      name: "휴게 분량 재검토",
      exact: true,
    }),
  ).toHaveCount(0);
  expect(sent).toEqual([]);
});
test("recruitment distinguishes clear information from placeholders and keeps suggestions in text export", async ({
  page,
}) => {
  await page.goto("/#tools/recruitment");
  await page
    .getByRole("button", { name: "점검이 필요한 예시", exact: true })
    .click();
  await run(page);
  await expect(result(page)).toContainText("최초 고용형태");
  await expect(result(page)).toContainText("실제 접수 경로");
  await expect(
    result(page).locator(".support-review-suggestion").first(),
  ).toBeVisible();
  await verifyView(page, "recruitment");
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "텍스트 다운로드", exact: true })
    .click();
  const text = await readFile((await (await downloading).path())!, "utf8");
  expect(text).toContain("수정·확인 예시:");
  expect(text).toContain("지원 URL");
  await page
    .getByRole("button", { name: "가상 예시 불러오기", exact: true })
    .click();
  await run(page);
  await expect(result(page)).toContainText("게시 전 확인할 0개 항목");
  await expect(result(page).locator(".status-difference")).toHaveCount(0);
  await expect(result(page)).toContainText("이번 입력에서 확인한 내용");
});
test("law guide changes actions for a late payment, leave applicability and the exact contract issue", async ({
  page,
}) => {
  await page.goto("/#tools/law");
  await page
    .getByRole("button", { name: "가상 예시 불러오기", exact: true })
    .click();
  await page
    .getByLabel("지급 예정일 (비교하려면 입력)", { exact: true })
    .fill("2026-10-30");
  await run(page);
  await expect(result(page)).toContainText("23일");
  await expect(result(page)).toContainText("2026-10-21");
  await expect(
    result(page).getByRole("region", { name: "상황별 처리 순서", exact: true }),
  ).toBeVisible();
  await expect(
    result(page)
      .getByRole("link", {
        name: "근로기준법 제36조 · 금품 청산 · 국가법령정보센터 ↗",
        exact: true,
      })
      .first(),
  ).toHaveAttribute("href", /1029728519/);
  await verifyView(page, "law");
  await page.getByLabel("확인할 쟁점", { exact: true }).selectOption("leave");
  await expect(
    page.getByLabel("지급기일 연장 합의", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("상시근로자 수", { exact: true })
    .selectOption("fivePlus");
  await page.getByLabel("4주 평균 주 소정근로시간", { exact: true }).fill("40");
  await page
    .getByLabel("계속근로기간", { exact: true })
    .selectOption("yearPlus");
  await page
    .getByLabel("1년간 출근율", { exact: true })
    .selectOption("atLeast80");
  await run(page);
  await expect(result(page)).toContainText("연 단위 15일 기준");
  await page.getByLabel("4주 평균 주 소정근로시간", { exact: true }).fill("14");
  await run(page);
  await expect(result(page)).toContainText("회사가 별도로 약정한 휴가");
  await page
    .getByLabel("확인할 쟁점", { exact: true })
    .selectOption("contract");
  await page
    .getByLabel("근로조건 세부 쟁점", { exact: true })
    .selectOption("penalty");
  await run(page);
  await expect(result(page)).toContainText("근로기준법 제20조");
  await page
    .getByLabel("이 브라우저에 입력·의견 보관", { exact: true })
    .check();
  await page.reload();
  await expect(
    page.getByLabel("근로조건 세부 쟁점", { exact: true }),
  ).toHaveValue("penalty");
});
