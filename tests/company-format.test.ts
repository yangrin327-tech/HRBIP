import test from "node:test";
import assert from "node:assert/strict";
import pptxgen from "pptxgenjs";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { mkdir, writeFile } from "node:fs/promises";
import {
  inspectCompanyFormat,
  sanitizeCompanyFormat,
  applyCompanyFormat,
} from "../server/company-format";
import { sampleWorkspace } from "../shared/sample";
import { aggregate, draft } from "../shared/analytics";
import { verifyOfficeOutput } from "../server/verify-output";

export async function pptFixture() {
  const deck = new pptxgen();
  deck.layout = "LAYOUT_WIDE";
  deck.theme = { headFontFace: "맑은 고딕", bodyFontFace: "맑은 고딕" };
  const s = deck.addSlide();
  s.background = { color: "F4F8F3" };
  s.addText("회사 인사 보고", {
    x: 0.5,
    y: 0.2,
    w: 10,
    h: 0.5,
    fontSize: 26,
    color: "145434",
  });
  s.addText("{{title}}", {
    x: 0.5,
    y: 1,
    w: 10,
    h: 0.5,
    fontSize: 22,
    color: "145434",
  });
  s.addText("{{period}}", { x: 0.5, y: 1.65, w: 5, h: 0.4, fontSize: 16 });
  s.addText("{{metric:headcount}}", {
    x: 10,
    y: 1.65,
    w: 2,
    h: 0.4,
    fontSize: 16,
  });
  s.addText("{{chart:headcount}}", {
    x: 0.5,
    y: 2.3,
    w: 11.5,
    h: 4.4,
    fontSize: 16,
  });
  s.addNotes("지난 직원 개인정보 SECRET-OLD-NOTES");
  return Buffer.from(
    (await deck.write({ outputType: "nodebuffer" })) as Buffer,
  );
}
export async function xlsxFixture() {
  const wb = new ExcelJS.Workbook(),
    s = wb.addWorksheet("월간 보고");
  s.getCell("B2").value = "회사 인사 보고";
  s.getCell("B3").value = "{{title}}";
  s.getCell("B4").value = "{{period}}";
  s.getCell("B5").value = "{{metric:headcount}}";
  s.getCell("B7").value = "{{table:metrics}}";
  s.getCell("K20").value = "SECRET-OLD-123";
  s.getCell("B3").font = {
    name: "맑은 고딕",
    size: 22,
    color: { argb: "FF145434" },
  };
  s.getColumn("B").width = 38;
  s.getColumn("C").width = 23;
  s.getColumn("D").width = 18;
  s.getRow(3).height = 36;
  s.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
test("PPT template retains native layout/styles, replaces values/charts, removes old notes; XLSX preserves styles and typed values", async () => {
  const w = sampleWorkspace(),
    r = aggregate(w);
  w.report.generated = draft(r);
  w.report.basisKey = r.key;
  w.report.reviewedKey = r.key;
  await mkdir("artifacts/verification", { recursive: true });
  for (const [format, data] of [
    ["pptx", await pptFixture()],
    ["xlsx", await xlsxFixture()],
  ] as const) {
    const inspection = await inspectCompanyFormat(data);
    assert.equal(inspection.format, format);
    const bindings = inspection.slots.map((s) => ({
      slot: s.id,
      field: s.sample === "회사 인사 보고" ? "keep" : s.suggestion,
    }));
    const clean = await sanitizeCompanyFormat(data, bindings);
    const applied = await applyCompanyFormat(
      clean.data,
      inspection,
      bindings,
      w,
      r,
      inspection.brand,
    );
    await verifyOfficeOutput(format, applied.data, w, r, {
      id: "test",
      title: "test",
      format,
      version: 1,
      created: "",
      inspection,
      bindings,
      brand: inspection.brand,
    });
    await writeFile(
      "artifacts/verification/company-" + format + "-input." + format,
      data,
    );
    await writeFile(
      "artifacts/verification/company-" + format + "-output." + format,
      applied.data,
    );
    const zip = await JSZip.loadAsync(applied.data),
      xmls = (
        await Promise.all(
          Object.keys(zip.files)
            .filter((n) => n.endsWith(".xml"))
            .map((n) => zip.file(n)!.async("string")),
        )
      ).join("");
    assert.ok(!xmls.includes("SECRET-OLD"));
    assert.ok(!xmls.includes("{{"));
    assert.ok(xmls.includes("회사 인사 보고"));
    if (format === "pptx") {
      const slide = await zip.file("ppt/slides/slide1.xml")!.async("string");
      assert.ok(slide.includes("145434"));
      assert.ok(slide.includes("F4F8F3"));
      assert.ok(slide.includes("c:chart"));
      const embeds = Object.keys(zip.files).filter((n) => n.endsWith(".xlsx"));
      assert.equal(embeds.length, 1);
      const chart = await zip.file("ppt/charts/hrbip1.xml")!.async("string");
      assert.ok(chart.includes("numCache"));
    } else {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(applied.data as never);
      const s = wb.getWorksheet("월간 보고")!;
      assert.equal(s.getCell("B5").value, r.metrics[0].value);
      assert.equal(s.getCell("B3").font.size, 22);
      assert.equal(s.getCell("B8").value, r.metrics[0].label);
    }
  }
});
test("PPT overflowing text blocks export without silently shrinking; formula/static chart keep is rejected", async () => {
  const data = await pptFixture(),
    i = await inspectCompanyFormat(data),
    bindings = i.slots.map((s) => ({ slot: s.id, field: s.suggestion })),
    c = await sanitizeCompanyFormat(data, bindings),
    w = sampleWorkspace();
  w.title = "가".repeat(160);
  await assert.rejects(
    () => applyCompanyFormat(c.data, i, bindings, w, aggregate(w), i.brand),
    /넘칠/,
  );
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("test").getCell("A1").value = { formula: "1+1", result: 2 };
  const b = Buffer.from(await wb.xlsx.writeBuffer()),
    ii = await inspectCompanyFormat(b);
  await assert.rejects(
    () => sanitizeCompanyFormat(b, [{ slot: ii.slots[0].id, field: "keep" }]),
    /수식/,
  );
});

test("fixed company table cells preserve labels and replace only connected values", async () => {
  const p = new pptxgen();
  p.addSlide().addTable(
    [
      ["월말 인원", "{{metric:headcount}}"],
      ["입사 인원", "{{metric:hired}}"],
      ["퇴사 인원", "OLD-SENSITIVE"],
    ].map(row=>row.map(text=>({text}))),
    {
      x: 1,
      y: 1,
      w: 8,
      h: 3,
      fontSize: 18,
      fontFace: "맑은 고딕",
      border: { color: "145434", pt: 1 },
    },
  );
  const data = Buffer.from(
      (await p.write({ outputType: "nodebuffer" })) as Buffer,
    ),
    inspection = await inspectCompanyFormat(data);
  const bindings = inspection.slots.map((s) => ({
    slot: s.id,
    field: s.cell?.column === 0 ? "keep" : s.suggestion,
  }));
  const clean = await sanitizeCompanyFormat(data, bindings),
    w = sampleWorkspace(),
    r = aggregate(w),
    output = await applyCompanyFormat(
      clean.data,
      inspection,
      bindings,
      w,
      r,
      inspection.brand,
    );
  await verifyOfficeOutput("pptx", output.data, w, r, {
    id: "test",
    title: "test",
    format: "pptx",
    version: 1,
    created: "",
    inspection,
    bindings,
    brand: inspection.brand,
  });
  const zip = await JSZip.loadAsync(output.data),
    text = await zip.file("ppt/slides/slide1.xml")!.async("string");
  assert.ok(text.includes("월말 인원"));
  assert.ok(text.includes(">42<"));
  assert.ok(!text.includes("OLD-SENSITIVE"));
  assert.ok(text.includes("145434"));
});
