import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile } from "node:fs/promises";
import JSZip from "jszip";

test("dashboard stays primary; calendar tools persist, validate and support navigation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "대표 도구 · 대시보드 자동화" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "대시보드 만들기", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "날짜·근속기간 계산기 열기", exact: true })
    .click();
  await page.getByLabel("시작일·입사일").fill("2024-02-29");
  await page.getByLabel("종료일·기준일").fill("2025-02-28");
  await page.getByRole("button", { name: "기간 계산하기" }).click();
  await expect(page.getByRole("status")).toContainText("1년 0개월 0일");
  await page.getByLabel("날짜 계산 기준일").fill("2024-03-01");
  await page.getByLabel("이동할 일수").fill("-1");
  await page
    .getByRole("button", { name: "날짜 계산하기", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("2024-02-29");
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "날짜·근속기간 계산기" }),
  ).toBeVisible();
  await expect(page.getByLabel("시작일·입사일")).toHaveValue("2024-02-29");
  await page.getByLabel("종료일·기준일").fill("2023-02-28");
  await page.getByRole("button", { name: "기간 계산하기" }).click();
  await expect(page.getByRole("alert")).toContainText("종료일은 시작일");
  await page
    .getByRole("button", { name: "모든 도구 보기", exact: true })
    .click();
  await page.goBack();
  await expect(page.getByLabel("시작일·입사일")).toHaveValue("2024-02-29");
  await page.getByRole("button", { name: "입력 지우기", exact: true }).click();
  await page.reload();
  await expect(page.getByLabel("시작일·입사일")).toHaveValue("");
});

test("list results and CSV reflect pasted values, duplicates, edits and local storage", async ({
  page,
}) => {
  const sent: string[] = [];
  page.on("request", (req) => {
    if (req.method() === "POST") sent.push(req.url());
  });
  await page.goto("/#tools/lists");
  const skipLink = page.getByRole("link", { name: "본문으로 건너뛰기" });
  await expect(skipLink).toBeAttached();
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
  await expect(page).toHaveURL(/#tools\/lists$/);
  await page
    .getByRole("textbox", { name: "명단 A", exact: true })
    .fill("001\n002\n002\n=1+1");
  await page
    .getByRole("textbox", { name: "명단 B", exact: true })
    .fill("002\n003");
  await page.getByRole("button", { name: "명단 비교하기" }).click();
  await expect(
    page.getByRole("button", { name: "A 안의 중복 1", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "A 안의 중복 1", exact: true })
    .click();
  await expect(
    page.getByRole("list", { name: "A 안의 중복", exact: true }),
  ).toContainText("원본 2, 3줄 · 2회");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "전체 결과 CSV 다운로드" }).click();
  const csv = await readFile((await (await downloading).path())!, "utf8");
  expect(csv).toContain("'=1+1");
  expect(csv).toContain('"001"');
  await page.getByRole("textbox", { name: "명단 B", exact: true }).fill("004");
  await expect(
    page.getByRole("region", { name: "명단 비교 결과" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "명단 B", exact: true }),
  ).toHaveValue("004");
  expect(sent).toEqual([]);
});

test("certificate preview, editable Word and print layout preserve Korean text safely", async ({
  page,
}) => {
  await page.goto("/#tools/documents");
  await page.getByLabel("문서 종류").selectOption("career");
  await page.getByLabel("성명 *", { exact: true }).fill("가상 직원");
  await page.getByLabel("회사명 *", { exact: true }).fill("예시 & 회사");
  await page.getByLabel("입사일 *", { exact: true }).fill("2024-01-01");
  await page.getByLabel("재직 종료일 *", { exact: true }).fill("2026-09-30");
  await page.getByLabel("작성일 *", { exact: true }).fill("2026-10-07");
  await page
    .getByLabel("담당업무", { exact: true })
    .fill("인사 보고서 작성\n<서류> 정리");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Word 다운로드" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("HRBIP_경력증명서.docx");
  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  const xml = await zip.file("word/document.xml")!.async("string");
  expect(xml).toContain("가상 직원");
  expect(xml).toContain("예시 &amp; 회사");
  expect(xml).toContain("&lt;서류&gt;");
  expect(xml).toContain("<w:br/>");
  const parsed = await page.evaluate(
    (source) =>
      new DOMParser()
        .parseFromString(source, "application/xml")
        .querySelector("parsererror")?.textContent ?? null,
    xml,
  );
  expect(parsed).toBeNull();
  await page.reload();
  await expect(page.getByLabel("성명 *", { exact: true })).toHaveValue(
    "가상 직원",
  );
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".quick-document-form")).not.toBeVisible();
  await expect(page.locator(".quick-document-preview")).toContainText(
    "가상 직원",
  );
  await mkdir("artifacts/verification/quick-tools", { recursive: true });
  await page.pdf({
    path: "artifacts/verification/quick-tools/certificate.pdf",
    format: "A4",
    preferCSSPageSize: true,
  });
  await page.screenshot({
    path: "artifacts/verification/quick-tools/print.png",
    fullPage: true,
  });
  await page.emulateMedia({ media: "screen" });
  await page.screenshot({
    path: "artifacts/verification/quick-tools/documents.png",
    fullPage: true,
  });
});

test("quick tools retain dashboard work and fit desktop/mobile with accessible controls", async ({
  page,
}) => {
  await mkdir("artifacts/verification/quick-tools", { recursive: true });
  await page.goto("/");
  await page.screenshot({
    path: "artifacts/verification/quick-tools/home.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "샘플로 체험하기", exact: true })
    .click();
  await page.getByRole("tab", { name: "보고서", exact: true }).click();
  await page
    .getByLabel("담당자 설명·의견")
    .fill("보조 도구를 사용해도 유지되는 의견");
  await expect(page.locator(".save-state")).toContainText("자동 저장했어요");
  await page
    .getByRole("button", { name: "날짜·기간 계산", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "날짜·근속기간 계산기" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "대시보드 자동화", exact: true })
    .click();
  await page.getByRole("tab", { name: "보고서", exact: true }).click();
  await expect(page.getByLabel("담당자 설명·의견")).toHaveValue(
    "보조 도구를 사용해도 유지되는 의견",
  );
  for (const [button, filename] of [
    ["날짜·기간 계산", "dates"],
    ["두 명단 비교", "lists"],
    ["인사 문서 작성", "documents"],
  ]) {
    await page.getByRole("button", { name: button, exact: true }).click();
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      audit.violations.map((v) => ({
        id: v.id,
        targets: v.nodes.map((n) => n.target),
      })),
    ).toEqual([]);
    await page.setViewportSize({ width: 375, height: 812 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "artifacts/verification/quick-tools/" + filename + "-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
});
