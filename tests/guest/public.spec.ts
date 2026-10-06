import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import pptxgen from "pptxgenjs";
import ExcelJS from "exceljs";
import JSZip from "jszip";

// Run existing upload/metric/accessibility scenarios against the account-free server too.
import "../e2e/integrated-upload.spec";
import "../e2e/sample-large.spec";
import "../e2e/accessibility.spec";

test("public mode exposes no account actions; sample, edits, exports and external feedback work", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/")) requests.push(req.url());
  });
  await page.goto("/");
  await expect(
    page.getByText("가입 없이 바로 사용", { exact: true }),
  ).toBeVisible();
  for (const label of ["로그인", "저장한 작업"])
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toHaveCount(0);
  await page
    .getByRole("button", { name: "기능 제안하기", exact: false })
    .first()
    .click();
  await expect(
    page.getByRole("link", { name: "GitHub에서 제안 작성하기 ↗" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/yangrin327-tech/HRBIP/issues/new",
  );
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await page
    .getByRole("button", { name: "샘플로 체험하기", exact: true })
    .click();
  for (const label of ["저장", "공유", "템플릿 저장"])
    await expect(
      page.getByRole("button", { name: label, exact: true }),
    ).toHaveCount(0);
  await expect(page.locator(".save-state")).toContainText(
    "현재 탭에서 작업 중",
  );
  await page.getByRole("tab", { name: "보고서", exact: true }).click();
  await page
    .getByLabel("담당자 설명·의견")
    .fill("내가 작성한 의견이 유지됩니다.");
  await page.getByRole("button", { name: "최종 확인·내보내기" }).click();
  await page
    .getByLabel(
      "현재 수치·기간·필터와 보고서 문장, 직접 작성한 의견을 확인했어요.",
    )
    .check();
  for (const format of ["pdf", "pptx", "xlsx"]) {
    await page.getByLabel("파일 형식").selectOption(format);
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: format.toUpperCase() + " 다운로드",
        exact: true,
      })
      .click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(new RegExp("\\." + format + "$"));
    expect((await readFile((await file.path())!)).length).toBeGreaterThan(1000);
  }
  await page.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.getByLabel("담당자 설명·의견")).toHaveValue(
    "내가 작성한 의견이 유지됩니다.",
  );
  expect(
    requests.some((p) =>
      /\/api\/(works|auth|templates|transfers|requests)/.test(p),
    ),
  ).toBe(false);
  expect(await page.context().cookies()).toHaveLength(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "artifacts/verification/guest-mobile.png" });
});

test("guest company PPTX and XLSX stay in the tab, export editable values, and disappear on reload", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "샘플로 체험하기", exact: true })
    .click();
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
  const wb = new ExcelJS.Workbook(),
    sheet = wb.addWorksheet("회사양식");
  sheet.getCell("B2").value = "{{title}}";
  sheet.getCell("B4").value = "{{metric:headcount}}";
  sheet.getColumn("B").width = 40;
  for (const [name, buffer] of [
    [
      "company.pptx",
      Buffer.from((await ppt.write({ outputType: "nodebuffer" })) as Buffer),
    ],
    ["company.xlsx", Buffer.from(await wb.xlsx.writeBuffer())],
  ] as const) {
    await modal
      .getByLabel("회사 양식 파일", { exact: true })
      .setInputFiles({ name, mimeType: "application/octet-stream", buffer });
    await expect(modal.getByLabel("양식 이름", { exact: true })).toHaveValue(
      "company",
    );
    await modal
      .getByLabel(
        "연결과 고정 문구·그림을 확인했어요. 과거 수치나 개인정보가 남아 있지 않아요.",
      )
      .check();
    await modal
      .getByRole("button", { name: "연결 확인하고 이 보고서에 적용" })
      .click();
    await expect(modal.getByText(/company v1 적용됨/)).toBeVisible();
  }
  await modal.getByRole("button", { name: "닫기", exact: true }).click();
  await page
    .getByRole("button", { name: "회사 양식 등록·적용 · 적용 중", exact: true })
    .click();
  for (const kind of ["pptx", "xlsx"])
    await expect(modal.getByLabel(kind + " 회사 양식 선택")).not.toHaveValue(
      "",
    );
  await modal.getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "최종 확인·내보내기" }).click();
  await page
    .getByLabel(
      "현재 수치·기간·필터와 보고서 문장, 직접 작성한 의견을 확인했어요.",
    )
    .check();
  for (const kind of ["pptx", "xlsx"]) {
    await page.getByLabel("파일 형식").selectOption(kind);
    const dl = page.waitForEvent("download");
    await page
      .getByRole("button", {
        name: kind.toUpperCase() + " 다운로드",
        exact: true,
      })
      .click();
    const output = await dl;
    if (kind === "pptx") {
      const zip = await JSZip.loadAsync(await readFile((await output.path())!));
      expect(zip.file(/^ppt\/charts\/hrbip.*\.xml$/).length).toBeGreaterThan(0);
      expect(zip.file(/^ppt\/embeddings\/.*\.xlsx$/).length).toBeGreaterThan(0);
    } else {
      const result = new ExcelJS.Workbook();
      await result.xlsx.readFile((await output.path())!);
      expect(result.getWorksheet("회사양식")!.getCell("B4").value).toBe(42);
    }
  }
  page.once("dialog", (d) => d.accept());
  await page.reload();
  await page
    .getByRole("button", { name: "샘플로 체험하기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "회사 양식 등록·적용", exact: true })
    .click();
  await expect(
    modal.getByText("등록한 양식이 없어요. 아래에서 회사 파일을 선택하세요."),
  ).toBeVisible();
});

test("old share URLs do not request account data or prompt sign-in", async ({
  page,
}) => {
  await page.goto("/?share=old-private-work");
  await expect(page.getByRole("alert")).toContainText(
    "이전 공유 링크의 자료는 공개하지 않습니다",
  );
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "로그인", exact: true }),
  ).toHaveCount(0);
});
