import { openBasicSample, openSavedWorks } from "../navigation";
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import pptxgen from "pptxgenjs";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import AxeBuilder from "@axe-core/playwright";

test("register PPT and Excel formats, persist/reopen, verify and export company report", async ({
  page,
}) => {
  await page.request.post("/api/auth/register", {
    data: {
      username: "company" + Date.now(),
      password: "company-e2e-only-123456",
    },
  });
  await page.goto("/");
  await openBasicSample(page);
  await page
    .getByRole("button", { name: "회사 양식 등록·적용", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "회사 양식 등록·적용" });
  const ppt = new pptxgen();
  ppt
    .addSlide()
    .addText("{{title}}", { x: 0.5, y: 0.5, w: 8, h: 0.8, fontSize: 22 })
    .addText("{{chart:headcount}}", {
      x: 0.5,
      y: 1.5,
      w: 8,
      h: 3.5,
      fontSize: 16,
    });
  await modal.getByLabel("회사 양식 파일", { exact: true }).setInputFiles({
    name: "테스트회사.pptx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    buffer: Buffer.from(
      (await ppt.write({ outputType: "nodebuffer" })) as Buffer,
    ),
  });
  await expect(modal.getByLabel("양식 이름", { exact: true })).toHaveValue(
    "테스트회사",
  );
  await modal
    .getByLabel(
      "연결과 고정 문구·그림을 확인했어요. 과거 수치나 개인정보가 남아 있지 않아요.",
    )
    .check();
  await modal
    .getByRole("button", { name: "연결 저장하고 이 보고서에 적용" })
    .click();
  await expect(modal.getByText(/테스트회사 v1 적용됨/)).toBeVisible();
  const excel = new ExcelJS.Workbook();
  const sheet = excel.addWorksheet("회사양식");
  sheet.getCell("B2").value = "{{title}}";
  sheet.getCell("B4").value = "{{metric:headcount}}";
  sheet.getCell("B6").value = "{{table:metrics}}";
  sheet.getColumn("B").width = 40;
  await modal.getByLabel("회사 양식 파일", { exact: true }).setInputFiles({
    name: "테스트회사.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await excel.xlsx.writeBuffer()),
  });
  await modal
    .getByLabel(
      "연결과 고정 문구·그림을 확인했어요. 과거 수치나 개인정보가 남아 있지 않아요.",
    )
    .check();
  await modal
    .getByRole("button", { name: "연결 저장하고 이 보고서에 적용" })
    .click();
  await expect(modal.getByLabel("xlsx 회사 양식 선택")).not.toHaveValue("");
  await page.screenshot({
    path: "artifacts/verification/company-formats-library.png",
    fullPage: true,
  });
  await modal.getByRole("button", { name: "닫기", exact: true }).click();
  await page
    .getByRole("button", { name: "계산 검증·검증표", exact: true })
    .click();
  const check = page.getByRole("dialog", { name: "계산 검증 결과" });
  await expect(
    check.getByText("계산 대조가 끝났어요.", { exact: false }),
  ).toBeVisible();
  const dl = page.waitForEvent("download");
  await check
    .getByRole("button", { name: "계산 검증표 Excel 다운로드" })
    .click();
  const file = await dl,
    wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile((await file.path())!);
  expect(wb.getWorksheet("계산 검증 상세")!.getCell("C2").value).toBe(42);
  await page.screenshot({
    path: "artifacts/verification/calculation-verification.png",
    fullPage: true,
  });
  await check.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "최종 확인·내보내기" }).click();
  await page.getByLabel("파일 형식").selectOption("pptx");
  await page
    .getByLabel(
      "현재 수치·기간·필터와 보고서 문장, 직접 작성한 의견을 확인했어요.",
    )
    .check();
  const pptDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "PPTX 다운로드", exact: true })
    .click();
  const deck = await pptDownload,
    zip = await JSZip.loadAsync(await readFile((await deck.path())!));
  expect(
    Object.keys(zip.files).some((n) => n.startsWith("ppt/charts/hrbip")),
  ).toBe(true);
  await page.getByLabel("파일 형식").selectOption("xlsx");
  const excelDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "XLSX 다운로드", exact: true })
    .click();
  const excelFile = await excelDownload,
    output = new ExcelJS.Workbook();
  await output.xlsx.readFile((await excelFile.path())!);
  expect(output.getWorksheet("회사양식")!.getCell("B4").value).toBe(42);
  await page
    .getByRole("dialog", { name: "최종 확인·내보내기" })
    .getByRole("button", { name: "닫기", exact: true })
    .click();
  await page.getByRole("button", { name: "계정에 저장", exact: true }).click();
  await openSavedWorks(page);
  await page.getByRole("button", { name: "열기", exact: true }).first().click();
  await expect(
    page.getByRole("button", {
      name: "회사 양식 등록·적용 · 적용 중",
      exact: true,
    }),
  ).toBeVisible();
});

test("mobile verification and format registration are accessible and do not overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await openBasicSample(page);
  await page.getByRole("button", { name: "계산 검증·검증표" }).click();
  await expect(
    page.getByText("계산 대조가 끝났어요.", { exact: false }),
  ).toBeVisible();
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(scan.violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "artifacts/verification/verification-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page
    .getByRole("button", { name: "회사 양식 등록·적용", exact: true })
    .click();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});
