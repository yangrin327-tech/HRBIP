import { openBasicSample, openSavedWorks } from "../navigation";
import { openSupportTool } from "../navigation";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
const titles = [
  "법령·대응 가이드",
  "퇴사 정산 검토",
  "연차 기준 비교·검산",
  "근로계약 확인",
  "채용공고 정보 점검",
];
const ids = ["law", "settlement", "leave", "contract", "recruitment"];
const output = (page: import("@playwright/test").Page) =>
  page.getByRole("region", { name: "업무 지원 점검 결과" });
async function example(page: import("@playwright/test").Page, id: string) {
  await page.goto("/#tools/" + id);
  await page
    .getByRole("button", { name: "가상 예시 불러오기", exact: true })
    .click();
  await page.getByRole("button", { name: "입력 자료 점검하기" }).click();
  await expect(output(page)).toBeVisible();
}

test("home exposes five separate support buttons and removes the previous three", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.locator("#support-title"),
  ).toBeVisible();
  for (const title of titles)
    await expect(
      page.locator("#support-intro").getByRole("button", { name: title, exact: true }),
    ).toBeVisible();
  await expect(page.locator(".landing-support-buttons .button")).toHaveCount(5);
  await page.screenshot({
    path: "artifacts/verification/hr-support/home.png",
    fullPage: true,
  });
  for (const label of [
    "일상 업무 도구",
    "날짜·근속기간 계산기",
    "두 명단 비교기",
    "인사 문서 작성기",
  ])
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  await openSupportTool(page, "근로계약 확인");
  await expect(page).toHaveURL(/#tools\/contract$/);
  await page.goBack();
  await expect(
    page.locator("#support-title"),
  ).toBeVisible();
  await page.goto("/#tools/dates");
  await expect(
    page.locator("#support-title"),
  ).toBeVisible();
});

test("all five examples produce checkable results with no input API requests; mobile and accessibility", async ({
  page,
}) => {
  const errors: string[] = [],
    posts: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (r.method() !== "GET" && r.url().includes("/api/")) posts.push(r.url());
  });
  for (const id of ids) {
    await example(page, id);
    await expect(output(page).locator(".status-difference")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "이렇게 사용하세요", exact: true }),
    ).toBeVisible();
    if (id === "law") await expect(output(page)).toContainText("14일");
    if (id === "settlement")
      await expect(output(page)).toContainText("2,130,000원");
    if (id === "leave") await expect(output(page)).toContainText("57일");
    if (id === "contract")
      await expect(output(page)).toContainText("0개 확인 항목");
    if (id === "recruitment")
      await expect(output(page)).toContainText("게시 전 확인할 0개 항목");
    await page
      .getByLabel("담당자 확인·의견", { exact: true })
      .fill("담당자 확인 기록");
    await expect(output(page)).toBeVisible(); // Opinion edits do not discard computed result.
    const a11y = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(a11y.violations).toEqual([]);
    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const finding of await output(page)
      .locator(".support-finding")
      .all()) {
      const width = await finding
        .locator(".support-evidence")
        .evaluate((e) => e.getBoundingClientRect().width);
      expect(width).toBeGreaterThan(220); // A status class must not inherit the checkbox row.
    }
    await page.screenshot({
      path: "artifacts/verification/hr-support/" + id + "-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  expect(errors).toEqual([]);
  expect(posts).toEqual([]);
});

test("settlement imports CSV/XLSX only after mapping and exports verified total and opinion", async ({
  page,
}) => {
  await page.goto("/#tools/settlement");
  await page
    .getByLabel("정산 기간·대상·범위", { exact: true })
    .fill("2026년 10월 최종 정산");
  await page
    .getByText("기존 CSV·XLSX 정산표에서 항목 가져오기", { exact: true })
    .click();
  const file = page.getByLabel("정산 자료 파일 (CSV·XLSX, 10MB)", {
    exact: true,
  });
  await file.setInputFiles({
    name: "settlement.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "항목명,구분,금액,비고\n급여,지급,1800000,가상자료\n수당,지급,420000,\n공제,공제,90000,\n",
    ),
  });
  await expect(page.getByLabel("금액 열", { exact: true })).toHaveValue("금액");
  await page
    .getByRole("button", { name: "연결 확인 후 항목 적용", exact: true })
    .click();
  await expect(output(page)).toHaveCount(0); // Apply is not submit.
  await expect(page.getByLabel("항목명 1", { exact: true })).toHaveValue(
    "급여",
  );
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("설명").addRow(["가상 안내"]);
  const s = wb.addWorksheet("정산");
  s.addRows([
    ["항목명", "구분", "금액", "비고"],
    ["급여", "지급", 1800000, "가상자료"],
    ["수당", "지급", 420000, ""],
    ["공제", "공제", 90000, ""],
  ]);
  await file.setInputFiles({
    name: "settlement.xlsx",
    mimeType: "application/octet-stream",
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
  });
  await page
    .getByLabel("정산 시트", { exact: true })
    .selectOption({ label: "settlement.xlsx / 정산" });
  await page
    .getByRole("button", { name: "연결 확인 후 항목 적용", exact: true })
    .click();
  await page
    .getByLabel("정산표 기재 지급액 (원, 선택)", { exact: true })
    .fill("2030000");
  await page.getByRole("button", { name: "입력 자료 점검하기" }).click();
  await expect(output(page)).toContainText("100,000원");
  await page
    .getByLabel("담당자 확인·의견", { exact: true })
    .fill("가상 정산표 집계 범위 확인");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "검토표 Excel 다운로드", exact: true })
    .click();
  const got = await download;
  const exported = new ExcelJS.Workbook();
  await exported.xlsx.readFile((await got.path())!);
  const table = exported.getWorksheet("대조표")!;
  const values = table.getSheetValues();
  expect(JSON.stringify(values)).toContain("2130000");
  expect(JSON.stringify(values)).toContain("100000");
  const total = table.getRow(7).getCell(3);
  expect(total.value).toBe(2130000);
  expect(total.numFmt).toContain("원");
  expect(
    JSON.stringify(exported.getWorksheet("담당자 확인")!.getSheetValues()),
  ).toContain("가상 정산표 집계 범위 확인");
  expect(exported.worksheets).toHaveLength(4);
  await got.saveAs("artifacts/verification/hr-support/settlement.xlsx");
  const textDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "텍스트 다운로드", exact: true })
    .click();
  expect(
    await readFile((await (await textDownload).path())!, "utf8"),
  ).toContain("가상 정산표 집계 범위 확인");
});

test("bad settlement rows block import and missing amounts do not become zero", async ({
  page,
}) => {
  await page.goto("/#tools/settlement");
  await page
    .getByText("기존 CSV·XLSX 정산표에서 항목 가져오기", { exact: true })
    .click();
  await page
    .getByLabel("정산 자료 파일 (CSV·XLSX, 10MB)", { exact: true })
    .setInputFiles({
      name: "bad.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("항목명,구분,금액\n급여,기타,1000\n"),
    });
  await page
    .getByRole("button", { name: "연결 확인 후 항목 적용", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "행을 자동 제외하지 않아요",
  );
  await page
    .getByRole("button", { name: "가상 예시 불러오기", exact: true })
    .click();
  await page.getByLabel("금액 1 (원)", { exact: true }).fill("");
  await page.getByRole("button", { name: "입력 자료 점검하기" }).click();
  await expect(output(page)).toHaveCount(0);
  await expect(page.getByRole("alert").last()).toContainText("빈 값");
});

test("DOCX and TXT excerpts are editable and produce original line citations", async ({
  page,
}) => {
  await page.goto("/#tools/contract");
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>임금: 월 300만원, 수당을 포함한다.</w:t></w:r></w:p><w:p><w:r><w:t>휴일·연차: 회사 규정에 따른다.</w:t></w:r></w:p></w:body></w:document>',
  );
  await page
    .getByLabel("문서 가져오기 (UTF-8 TXT·DOCX, 3MB)", { exact: true })
    .setInputFiles({
      name: "contract.docx",
      mimeType: "application/octet-stream",
      buffer: await zip.generateAsync({ type: "nodebuffer" }),
    });
  await expect(
    page.getByLabel("계약 내용 (발췌·첨부 규정은 구분해 입력)", {
      exact: true,
    }),
  ).toHaveValue(/회사 규정/);
  await page.getByRole("button", { name: "입력 자료 점검하기" }).click();
  await expect(output(page)).toContainText("2줄: 휴일");
  await page.goto("/#tools/recruitment");
  await page
    .getByLabel("문서 가져오기 (UTF-8 TXT·DOCX, 3MB)", { exact: true })
    .setInputFiles({
      name: "job.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(
        "고용형태: 정규직\n본문 고용형태: 계약직 6개월\n근무지: 서울",
      ),
    });
  await page.getByRole("button", { name: "입력 자료 점검하기" }).click();
  await expect(output(page)).toContainText("고용형태 불일치");
});

test("opt-in storage restores inputs/opinions; corrupt or blocked storage is explained", async ({
  page,
}) => {
  await example(page, "leave");
  expect(
    await page.evaluate(() =>
      localStorage.getItem("hrbip.support-tools.v1.leave"),
    ),
  ).toBeNull();
  await page
    .getByLabel("이 브라우저에 입력·의견 보관", { exact: true })
    .check();
  await page
    .getByLabel("담당자 확인·의견", { exact: true })
    .fill("연차대장 별도 확인");
  await page.reload();
  await expect(page.getByLabel("입사일", { exact: true })).toHaveValue(
    "2023-01-01",
  );
  await page.getByRole("button", { name: "입력 자료 점검하기" }).click();
  await expect(
    page.getByLabel("담당자 확인·의견", { exact: true }),
  ).toHaveValue("연차대장 별도 확인");
  await page.getByLabel("점검 방식", { exact: true }).selectOption("ledger");
  await page.getByRole("button", { name: "입력 자료 점검하기" }).click();
  await expect(output(page)).toContainText("7.5일");
  await page.getByRole("button", { name: "입력 지우기", exact: true }).click();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("hrbip.support-tools.v1.leave"),
    ),
  ).toBeNull();
  await page.evaluate(() =>
    localStorage.setItem(
      "hrbip.support-tools.v1.settlement",
      JSON.stringify({ data: { lines: [null] } }),
    ),
  );
  await page.goto("/#tools/settlement");
  await expect(page.getByRole("alert")).toContainText(
    "저장된 입력을 읽지 못했어요",
  );
  await page.getByRole("button", { name: "입력 지우기", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("full", "QuotaExceededError");
    };
  });
  await page
    .getByLabel("이 브라우저에 입력·의견 보관", { exact: true })
    .check();
  await expect(page.getByRole("alert")).toContainText("브라우저 보관에 실패");
});

test("support navigation retains the dashboard report and filters", async ({
  page,
}) => {
  await page.goto("/");
  await openBasicSample(page);
  await page.getByLabel("시작 월", { exact: true }).fill("2026-08");
  await page.getByRole("tab", { name: "보고서", exact: true }).click();
  await page.getByLabel("담당자 설명·의견").fill("대표 도구 의견 유지");
  await expect(page.locator(".save-state")).toContainText("자동 저장했어요");
  await openSupportTool(page, "퇴사 정산 검토");
  await page
    .getByRole("button", { name: "가상 예시 불러오기", exact: true })
    .click();
  await page.getByRole("button", { name: "입력 자료 점검하기" }).click();
  await expect(output(page)).toContainText("2,130,000원");
  await openSavedWorks(page);
  await page
    .locator(".saved-list article")
    .filter({ hasText: "2026년 3분기 인사현황" })
    .getByRole("button", { name: "열기", exact: false })
    .click();
  await expect(page.getByLabel("시작 월", { exact: true })).toHaveValue(
    "2026-08",
  );
  await page.getByRole("tab", { name: "보고서", exact: true }).click();
  await expect(page.getByLabel("담당자 설명·의견")).toHaveValue(
    "대표 도구 의견 유지",
  );
});
