import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import JSZip from "jszip";

test("qualified SpreadsheetML imports sheets, dates, numbers and literal text", async ({
  page,
}) => {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("인사 명단").addRows([
    ["사번", "입사일", "부서", "메모"],
    [
      "E01",
      new Date("2026-01-01T00:00:00Z"),
      "경영지원",
      "<x:workbook> & 한글 그대로",
    ],
  ]);
  wb.addWorksheet("지급 내역").addRows([
    ["사번", "지급일", "지급항목", "지급액"],
    ["E01", new Date("2026-09-25T00:00:00Z"), "기본급", 3123456],
  ]);
  wb.getWorksheet("지급 내역")!.addTable({
    name: "PayTable",
    ref: "A1",
    headerRow: true,
    columns: ["사번", "지급일", "지급항목", "지급액"].map((name) => ({ name })),
    rows: [["E01", new Date("2026-09-25T00:00:00Z"), "기본급", 3123456]],
  });
  const zip = await JSZip.loadAsync(await wb.xlsx.writeBuffer());
  for (const part of zip.file(
    /^xl\/(?:workbook|styles|sharedStrings|worksheets\/sheet\d+|tables\/table\d+)\.xml$/,
  )) {
    let xml = await part.async("string");
    if (part.name === "xl/worksheets/sheet1.xml")
      xml = xml.replace(
        /<c r="B2"[^>]*>.*?<\/c>/,
        '<c r="B2" t="d"><v>2026-01-01T00:00:00.000Z</v></c>',
      );
    zip.file(
      part.name,
      xml
        .replace(
          /xmlns="http:\/\/schemas.openxmlformats.org\/spreadsheetml\/2006\/main"/g,
          'xmlns:s="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
        )
        .replace(/<(\/?)([A-Za-z][\w.-]*)(?=[\s/>])/g, "<$1s:$2")
        .replace(/xmlns:r=/g, "xmlns:link=")
        .replace(/ r:id=/g, " link:id="),
    );
  }
  for (const part of zip.file(/^xl\/worksheets\/_rels\/sheet\d+\.xml\.rels$/)) {
    zip.file(
      part.name,
      "\uFEFF" +
        (await part.async("string")).replace(
          /Target="\.\.\/tables\//g,
          'Target="/xl/tables/',
        ),
    );
  }
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  // The first prefixed ZIP entry determines whether ExcelJS fails on sheets or sheetNo.
  await expect(
    new ExcelJS.Workbook().xlsx.load(buffer as never),
  ).rejects.toThrow(/sheets|sheetNo/);
  await page.goto("/");
  const normalized = await page.evaluate(async (bytes) => {
    // @ts-expect-error Vite serves this browser module in the test server.
    const { compatibleXlsx } = await import("/src/xlsx-compat.ts");
    return Array.from(
      new Uint8Array(await compatibleXlsx(new Uint8Array(bytes).buffer)),
    );
  }, Array.from(buffer));
  const verified = await new ExcelJS.Workbook().xlsx.load(
    Buffer.from(normalized) as never,
  );
  expect(verified.worksheets).toHaveLength(2);
  expect(verified.getWorksheet("지급 내역")!.getTable("PayTable")).toBeTruthy();
  await page.getByRole("button", { name: "내 자료로 시작하기" }).click();
  await page.getByLabel("파일 업로드").setInputFiles({
    name: "namespace.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });
  await expect(page.locator(".sheet-choice")).toHaveCount(2);
  await page.getByRole("button", { name: "항목 연결·데이터 확인" }).click();
  await expect(
    page.getByText("<x:workbook> & 한글 그대로", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("2026-01-01", { exact: true })).toBeVisible();
  await page.locator(".dataset-tabs button").nth(1).click();
  await expect(page.getByText("3123456", { exact: true })).toBeVisible();
  await expect(page.getByText("2026-09-25", { exact: true })).toBeVisible();
});

test("invalid XLSX gives a recovery message rather than an internal property error", async ({
  page,
}) => {
  const zip = new JSZip();
  zip.file("xl/workbook.xml", "<not-a-workbook/>");
  await page.goto("/");
  await page.getByRole("button", { name: "내 자료로 시작하기" }).click();
  await page.getByLabel("파일 업로드").setInputFiles({
    name: "invalid.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await zip.generateAsync({ type: "nodebuffer" }),
  });
  await expect(page.getByText(/Excel 문서를 읽지 못했어요/)).toBeVisible();
  await expect(page.getByText(/Cannot read properties/)).toHaveCount(0);
  await expect(page.locator(".sheet-choice")).toHaveCount(0);
});
