import JSZip from "jszip";
import ExcelJS from "exceljs";
import { readXml, local, FormatError } from "./office-xml";
import { fieldValue, type CompanyFormat } from "../shared/company-format";
import { effectiveCards, formatValue } from "../shared/analytics";
import type { Workspace, Result } from "../shared/model";
const text = (n: any) =>
  local(n, "t")
    .map((x) => x.textContent)
    .join("");
const fail = (name: string) => {
  throw new FormatError(
    "출력 파일의 " +
      name +
      " 값이 현재 결과와 일치하지 않아 다운로드를 중단했습니다.",
  );
};
// Read back the exported Office package. Verification metadata is not used as evidence.
export async function verifyOfficeOutput(
  format: string,
  data: Buffer,
  w: Workspace,
  r: Result,
  company?: CompanyFormat,
) {
  if (format !== "xlsx" && format !== "pptx") return;
  const zip = await JSZip.loadAsync(data);
  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(data as never);
    if (!company) {
      const sheet = wb.getWorksheet("주요 지표");
      r.metrics.forEach((m, i) => {
        if (
          sheet?.getCell(i + 2, 2).value !==
          (m.value ?? "자료 없음 / 계산 불가")
        )
          fail(m.label);
      });
      for (const c of r.charts) {
        const sheet = wb.getWorksheet(c.title.slice(0, 25));
        c.points.forEach((p, i) => {
          if (sheet?.getCell(i + 2, 2).value !== (p.value ?? "자료 없음"))
            fail(c.title);
          if (
            c.series.length > 1 &&
            sheet?.getCell(i + 2, 3).value !== (p.value2 ?? "자료 없음")
          )
            fail(c.title);
        });
      }
      if (
        wb.getWorksheet("보고 문장")?.getCell("B2").value !== w.report.generated
      )
        fail("보고 문장");
      if (wb.getWorksheet("보고 문장")?.getCell("B3").value !== w.report.notes)
        fail("담당자 의견");
    } else {
      for (const b of company.bindings) {
        if (
          !b.field ||
          b.field === "keep" ||
          b.field.startsWith("chart:") ||
          b.field === "table:metrics"
        )
          continue;
        const slot = company.inspection.slots.find((s) => s.id === b.slot)!;
        const name = company.inspection.pages.find(
          (p) => p.id === slot.page,
        )!.label;
        const cell = wb.getWorksheet(name)?.getCell(slot.id.split("#")[1]);
        if (cell?.value !== fieldValue(b.field, w, r)) fail(slot.label);
      }
    }
  } else {
    const paths = Object.keys(zip.files).filter((n) =>
        /^ppt\/slides\/[^/]+\.xml$/.test(n),
      ),
      docs = await Promise.all(paths.map((p) => readXml(zip, p)));
    if (company) {
      for (const b of company.bindings) {
        if (
          !b.field ||
          b.field === "keep" ||
          b.field.startsWith("chart:") ||
          b.field === "table:metrics"
        )
          continue;
        const slot = company.inspection.slots.find((s) => s.id === b.slot)!;
        const [path, id] = (slot.cell?.parent || b.slot).split("#"),
          doc = docs[paths.indexOf(path)];
        let n = local(doc, "cNvPr").find((n) => n.getAttribute("id") === id);
        if (!n) fail(b.slot);
        while (n && n.localName !== "sp" && n.localName !== "graphicFrame")
          n = n.parentNode;
        if (slot.cell)
          n = local(local(n, "tr")[slot.cell.row], "tc")[slot.cell.column];
        if (
          text(n).replaceAll(/\s/g, "") !==
          String(fieldValue(b.field, w, r)).replaceAll(/\s/g, "")
        )
          fail(b.field);
      }
    } else {
      const rows = docs
        .flatMap((d) => local(d, "tr"))
        .map((row) => local(row, "tc").map(text));
      for (const m of r.metrics) {
        const row = rows.find((row) => row[0] === m.label && row[2] === m.unit);
        if (
          !row ||
          row[1] !== (m.value === null ? "계산 불가" : formatValue(m.value))
        )
          fail(m.label);
      }
    }
  }
  const actual: string[] = [],
    expected: string[] = [];
  // Native chart caches are checked against the current selected chart points.
  const chartParts = Object.keys(zip.files).filter((n) =>
    new RegExp(
      "^" + (format === "pptx" ? "ppt" : "xl") + "/charts/[^/]+\\.xml$",
    ).test(n),
  );
  for (const part of chartParts) {
    const d = await readXml(zip, part);
    for (const s of local(d, "ser")) {
      const tx = local(s, "tx")[0],
        name = tx && local(tx, "v")[0]?.textContent,
        cat = local(s, "cat")[0],
        val = local(s, "val")[0];
      if (!cat || !val) continue;
      const labels = local(cat, "pt").map((p) => local(p, "v")[0]?.textContent),
        values = local(val, "pt").map((p) =>
          Number(local(p, "v")[0]?.textContent),
        );
      values.forEach((v, i) =>
        actual.push(JSON.stringify([name, labels[i], v])),
      );
    }
  }
  const selected = company
    ? company.bindings
        .filter(
          (b) =>
            b.field.startsWith("chart:") &&
            (format === "pptx"
              ? company.inspection.slots.find((s) => s.id === b.slot)?.kind !==
                "table"
              : company.inspection.slots.find((s) => s.id === b.slot)?.kind ===
                "chart"),
        )
        .map((b) => r.charts.find((c) => c.id === b.field.slice(6))!)
        .filter(Boolean)
    : format === "pptx"
      ? effectiveCards(w, r)
          .filter((c) => c.visible && c.type !== "table")
          .map((c) => r.charts.find((x) => x.id === c.id)!)
      : [];
  for (const c of selected)
    for (const p of c.points.filter(
      (p) => p.value !== null && (c.series.length === 1 || p.value2 != null),
    ))
      c.series.forEach((name, i) =>
        expected.push(
          JSON.stringify([name, p.label, i === 0 ? p.value : p.value2]),
        ),
      );
  if (JSON.stringify(actual.sort()) !== JSON.stringify(expected.sort()))
    fail("네이티브 차트");
}
