import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";

test("integrated Excel upload preserves hire dates, confirms 2020–2026 and exports actual editable PPT", async ({
  page,
}) => {
  const wb = new ExcelJS.Workbook();
  const tables = [
    [
      ["사번", "입사일", "퇴사일"],
      ["A", "2017-12-02", ""],
    ],
    [
      ["사번", "기준월", "부서", "고용형태", "월말재직여부"],
      ["A", "2026-09-01", "인사총무", "정규직", "1"],
    ],
    [
      ["사번", "기준월", "총근무시간", "연장근무시간", "총휴가일수"],
      ["A", "2026-09-01", "168", "8", "2"],
    ],
    [
      [
        "사번",
        "기준월",
        "총지급액_원",
        "회사부담보험료_원",
        "퇴직급여충당액_원",
      ],
      ["A", "2026-09-01", "1000000", "100000", "50000"],
    ],
    [
      ["구분", "설명"],
      ["안내", "집계에서 제외"],
    ],
  ];
  tables.forEach((rows, i) =>
    wb.addWorksheet(i === 4 ? "집계기준" : "자료" + i).addRows(rows),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "대시보드 만들기", exact: true })
    .click();
  await page.getByLabel("파일 업로드").setInputFiles({
    name: "integrated.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
  });
  await page.getByRole("button", { name: "추천 연결을 확인하고 적용" }).click();
  await expect(
    page.getByRole("button", { name: "2행 입사일 수정" }),
  ).toContainText("2017-12-02");
  await page.getByLabel("시작 월", { exact: true }).fill("2020-01");
  await page.getByLabel("종료 월", { exact: true }).fill("2026-12");
  await page
    .getByLabel("위 기간·포함 대상·집계 기준으로 보고서를 만드는 데 동의해요.")
    .check();
  await page.getByRole("button", { name: "추천 결과 만들기" }).click();
  await expect(page.getByLabel("시작 월", { exact: true })).toHaveValue(
    "2020-01",
  );
  await expect(page.getByLabel("종료 월", { exact: true })).toHaveValue(
    "2026-12",
  );
  await expect(
    page.locator(".metric").filter({ hasText: "2026-12 월말 인원" }),
  ).toContainText("자료 없음");
  await expect(
    page.locator(".metric").filter({ hasText: "마지막 확인 인원" }),
  ).toContainText("1명");
  await page.getByRole("tab", { name: "보고서", exact: true }).click();
  await expect(page.getByLabel("담당자 설명·의견")).toHaveValue(
    /퇴사일은 첫 미재직일/,
  );
  await page.getByRole("button", { name: "최종 확인·내보내기" }).click();
  await page
    .getByLabel(
      "현재 수치·기간·필터와 보고서 문장, 직접 작성한 의견을 확인했어요.",
    )
    .check();
  await page.getByLabel("파일 형식").selectOption("pptx");
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "PPTX 다운로드", exact: true })
    .click();
  const downloaded = await downloading;
  const path = await downloaded.path();
  const zip = await JSZip.loadAsync(await readFile(path!));
  const cover = await zip.file("ppt/slides/slide1.xml")!.async("string");
  expect(cover).toContain("HRBIP");
  expect(cover).toContain("2020-01");
  expect(cover).toContain("2026-12");
  expect(
    Object.keys(zip.files).filter((p) => /ppt\/charts\/chart\d+\.xml$/.test(p))
      .length,
  ).toBeGreaterThan(0);
});
