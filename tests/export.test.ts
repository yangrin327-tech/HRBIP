import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { sampleWorkspace } from "../shared/sample";
import { aggregate, draft, recommendedCards } from "../shared/analytics";
import { exportFile, pdfHtml } from "../server/export";
test("real XLSX/PPTX/PDF artifacts contain aligned aggregates and native chart workbooks", async () => {
  const w = sampleWorkspace(),
    r = aggregate(w);
  w.design.cards = recommendedCards(r);
  w.report = {
    generated: draft(r),
    notes: "가상 자료로 검증한 인사현황 보고서입니다.",
    basisKey: r.key,
    reviewedKey: r.key,
  };
  await mkdir("artifacts/verification", { recursive: true });
  const excel = await exportFile("xlsx", w);
  await writeFile("artifacts/verification/HRBIP-sample.xlsx", excel);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(excel as never);
  assert.equal(
    wb.getWorksheet("주요 지표")!.getCell("B2").value,
    r.metrics[0].value,
  );
  assert.ok(!wb.worksheets.some((s) => s.name.includes("원본")));
  const ppt = await exportFile("pptx", w);
  await writeFile("artifacts/verification/HRBIP-sample.pptx", ppt);
  const zip = await JSZip.loadAsync(ppt),
    names = Object.keys(zip.files),
    charts = names.filter((n) => /^ppt\/charts\/chart\d+\.xml$/.test(n));
  assert.equal(charts.length, r.charts.length);
  assert.equal(
    names.filter((n) => /^ppt\/embeddings\/.+\.xlsx$/.test(n)).length,
    charts.length,
  );
  const slides = await Promise.all(
    names
      .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
      .map((n) => zip.file(n)!.async("string")),
  );
  assert.ok(slides.some((s) => s.includes("<a:tbl>")));
  assert.ok(slides.some((s) => s.includes("2026년 3분기")));
  const chartXml = await zip.file(charts[0])!.async("string");
  assert.ok(chartXml.includes("<c:externalData"));
  assert.ok(chartXml.includes("<c:numCache>"));
  const pdf = await exportFile("pdf", w);
  await writeFile("artifacts/verification/HRBIP-sample.pdf", pdf);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  w.report.generated = "<script>alert(1)</script>";
  assert.ok(pdfHtml(w).includes("&lt;script&gt;"));
  w.filters.department = "경영지원";
  await assert.rejects(() => exportFile("xlsx", w), /최신 집계값/);
});
