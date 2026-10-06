import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import pptxgen from "pptxgenjs";
import JSZip from "jszip";
import { mkdir, writeFile } from "node:fs/promises";
import {
  inspectCompanyFormat,
  sanitizeCompanyFormat,
  applyCompanyFormat,
} from "../server/company-format";
import { verifyOfficeOutput } from "../server/verify-output";
import { sampleWorkspace } from "../shared/sample";
import { aggregate } from "../shared/analytics";
test("existing Excel chart uses new typed data and retains native anchor; removed image is not retained", async () => {
  const wb = new ExcelJS.Workbook(),
    sheet = wb.addWorksheet("회사 대시보드");
  sheet.getCell("A1").value = "{{title}}";
  sheet.getCell("A2").value = "OLD-SOURCE-SECRET";
  const image = wb.addImage({
    base64:
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXN8AAAAASUVORK5CYII=",
    extension: "png",
  });
  sheet.addImage(image, "K1:L2");
  const zip = await JSZip.loadAsync(await wb.xlsx.writeBuffer());
  const deck = new pptxgen();
  deck
    .addSlide()
    .addChart(
      deck.ChartType.line,
      [{ name: "월별 재직 인원", labels: ["2020-01"], values: [99999] }],
      { x: 1, y: 1, w: 8, h: 4, showTitle: true, title: "월별 재직 인원" },
    );
  const ppt = await JSZip.loadAsync(
    (await deck.write({ outputType: "nodebuffer" })) as Buffer,
  );
  let chart = await ppt.file("ppt/charts/chart1.xml")!.async("string");
  chart = chart
    .replace(/<c:externalData[\s\S]*?<\/c:externalData>/g, "")
    .replaceAll("Sheet1!", "회사 대시보드!");
  zip.file("xl/charts/chart1.xml", chart);
  let drawing = await zip.file("xl/drawings/drawing1.xml")!.async("string");
  drawing = drawing.replace(
    "</xdr:wsDr>",
    `<xdr:twoCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>3</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>9</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>22</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="22" name="인원 차트"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="hrChart"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`,
  );
  zip.file("xl/drawings/drawing1.xml", drawing);
  const rels = await zip
    .file("xl/drawings/_rels/drawing1.xml.rels")!
    .async("string");
  zip.file(
    "xl/drawings/_rels/drawing1.xml.rels",
    rels.replace(
      "</Relationships>",
      '<Relationship Id="hrChart" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>',
    ),
  );
  const ct = await zip.file("[Content_Types].xml")!.async("string");
  zip.file(
    "[Content_Types].xml",
    ct.replace(
      "</Types>",
      '<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>',
    ),
  );
  const data = await zip.generateAsync({ type: "nodebuffer" }),
    inspection = await inspectCompanyFormat(data),
    bindings = inspection.slots.map((s) => ({
      slot: s.id,
      field: s.kind === "chart" ? "chart:headcount" : s.suggestion,
    }));
  assert.ok(inspection.slots.some((s) => s.kind === "image"));
  const cleaned = await sanitizeCompanyFormat(data, bindings),
    w = sampleWorkspace(),
    r = aggregate(w),
    output = await applyCompanyFormat(
      cleaned.data,
      inspection,
      bindings,
      w,
      r,
      inspection.brand,
    );
  await verifyOfficeOutput("xlsx", output.data, w, r, {
    id: "test",
    title: "test",
    created: "",
    version: 1,
    format: "xlsx",
    inspection,
    bindings,
    brand: inspection.brand,
  });
  const result = await JSZip.loadAsync(output.data);
  assert.equal(
    Object.keys(result.files).filter((n) => /^xl\/media\/[^/]+$/.test(n))
      .length,
    0,
  );
  const outputChart = await result
    .file("xl/charts/chart1.xml")!
    .async("string");
  assert.ok(!outputChart.includes("99999"));
  assert.ok(outputChart.includes("HRBIP_차트1"));
  const read = new ExcelJS.Workbook();
  await read.xlsx.load(output.data as never);
  assert.ok(
    read.getWorksheet("HRBIP_차트1"),
    await result.file("xl/workbook.xml")!.async("string"),
  );
  assert.equal(
    read.getWorksheet("HRBIP_차트1")!.getCell("B2").value,
    r.charts[0].points[0].value,
  );
  await mkdir("artifacts/verification", { recursive: true });
  await writeFile(
    "artifacts/verification/company-native-chart.xlsx",
    output.data,
  );
});
