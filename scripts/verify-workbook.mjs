// Run against an already running local HRBIP server. No account or data is saved.
import { chromium } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import assert from "node:assert/strict";
import JSZip from "jszip";

const [source, output, base = "http://127.0.0.1:4173"] = process.argv.slice(2);
if (!source || !output)
  throw new Error(
    "Usage: node scripts/verify-workbook.mjs input.xlsx output.pptx [local URL]",
  );
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base))
  throw new Error("Only a local verification server is supported.");
const digest = async () =>
  createHash("sha256")
    .update(await readFile(source))
    .digest("hex");
const before = await digest();
await mkdir(path.dirname(output), { recursive: true });
await mkdir("artifacts/verification", { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let sent;
page.on("request", (req) => {
  if (req.url().endsWith("/api/export/pptx") && req.method() === "POST")
    sent = req.postDataJSON();
});
try {
  await page.goto(base);
  await page.screenshot({
    path: "artifacts/verification/home-readable-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "보고서 만들기", exact: true })
    .click();
  await page.getByLabel("파일 업로드", { exact: true }).setInputFiles(source);
  await page
    .getByRole("button", { name: "추천 연결을 확인하고 적용", exact: true })
    .click();
  await page.getByLabel("시작 월", { exact: true }).fill("2020-01");
  await page.getByLabel("종료 월", { exact: true }).fill("2026-12");
  await page
    .getByLabel("위 기간·포함 대상·집계 기준으로 보고서를 만드는 데 동의해요.")
    .check();
  await page.screenshot({
    path: "artifacts/verification/provided-upload-review.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "추천 결과 만들기", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("시작 월", { exact: true }).inputValue(),
    "2020-01",
  );
  assert.equal(
    await page.getByLabel("종료 월", { exact: true }).inputValue(),
    "2026-12",
  );
  assert.equal(await page.getByLabel("부서", { exact: true }).inputValue(), "");
  assert.equal(
    await page.getByLabel("고용형태", { exact: true }).inputValue(),
    "",
  );
  const metrics = await page.locator(".metric").allTextContents();
  assert.match(metrics.join("\n"), /19,591,449,240/);
  assert.match(metrics.join("\n"), /마지막 확인 인원150명/);
  await page.screenshot({
    path: "artifacts/verification/provided-dashboard-2020-2026.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: "보고서", exact: true }).click();
  assert.match(
    await page.getByLabel("담당자 설명·의견").inputValue(),
    /퇴사일은 첫 미재직일/,
  );
  await page
    .getByRole("button", { name: "최종 확인·내보내기", exact: true })
    .click();
  await page
    .getByLabel(
      "현재 수치·기간·필터와 보고서 문장, 직접 작성한 의견을 확인했어요.",
    )
    .check();
  await page.getByLabel("파일 형식").selectOption("pptx");
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "PPTX 다운로드", exact: true })
    .click();
  await (await download).saveAs(output);
  const zip = await JSZip.loadAsync(await readFile(output));
  const cover = await zip.file("ppt/slides/slide1.xml").async("string");
  assert.match(cover, /HRBIP/);
  assert.match(cover, /2020-01/);
  assert.match(cover, /2026-12/);
  const w = sent.workspace;
  assert.ok(w.datasets[0].rows.some((r) => r.입사일.startsWith("2017-")));
  assert.deepEqual(errors, []);
  assert.equal(await digest(), before);
  const proof = {
    sourceSHA256: before,
    sourceUnchanged: true,
    filters: w.filters,
    exitInclusive: w.exitInclusive,
    analysisTables: w.datasets.length,
    analysisRows: w.datasets.reduce((n, d) => n + d.rows.length, 0),
    metrics,
    slides: Object.keys(zip.files).filter((p) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(p),
    ).length,
    nativeCharts: Object.keys(zip.files).filter((p) =>
      /^ppt\/charts\/chart\d+\.xml$/.test(p),
    ).length,
    errors,
  };
  await writeFile(
    "artifacts/verification/provided-workbook-export.json",
    JSON.stringify(proof, null, 2),
  );
  await writeFile(
    "artifacts/verification/provided-workspace.json",
    JSON.stringify(w),
  );
  console.log(JSON.stringify(proof, null, 2));
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await mobile.goto(base);
  assert.equal(
    await mobile.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await mobile.screenshot({
    path: "artifacts/verification/home-readable-mobile.png",
    fullPage: true,
  });
} finally {
  await browser.close();
}
