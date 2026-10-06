import JSZip from "jszip";
import pptxgen from "pptxgenjs";
import ExcelJS from "exceljs";
import { posix } from "node:path";
import {
  FormatError,
  safeOffice,
  readXml,
  xml,
  all,
  local,
  remove,
  serialize,
  relPath,
  targetPath,
  esc,
  prunePackage,
} from "./office-xml.js";
import {
  suggestField,
  fieldValue,
  formatFields,
  type Binding,
  type FormatInspection,
  type FormatSlot,
} from "../shared/company-format.js";
import type { Workspace, Result, Chart } from "../shared/model.js";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const slotsLimit = 700;
const textOf = (n: any) =>
  local(n, "t")
    .map((t) => t.textContent)
    .join(" ");
const shapeId = (n: any) => local(n, "cNvPr")[0]?.getAttribute("id");
const shapeNodes = (doc: any) =>
  local(doc, "spTree")[0]
    ? (Array.from(local(doc, "spTree")[0].childNodes).filter((n: any) =>
        ["sp", "graphicFrame", "pic"].includes(n.localName),
      ) as any[])
    : [];
function box(n: any) {
  const x = local(n, "xfrm")[0],
    o = x && local(x, "off")[0],
    s = x && local(x, "ext")[0];
  return {
    x: Number(o?.getAttribute("x") || 0) / 914400,
    y: Number(o?.getAttribute("y") || 0) / 914400,
    w: Number(s?.getAttribute("cx") || 0) / 914400,
    h: Number(s?.getAttribute("cy") || 0) / 914400,
  };
}
async function inheritedShape(
  zip: JSZip,
  part: string,
  n: any,
  depth = 0,
): Promise<any> {
  if ((box(n).w > 0 && box(n).h > 0) || depth > 1) return n;
  const ph = local(n, "ph")[0];
  if (!ph) return n;
  const rels = await relationships(zip, part),
    rel = local(rels, "Relationship").find((r) =>
      /slideLayout$|slideMaster$/.test(r.getAttribute("Type")),
    );
  if (!rel) return n;
  const path = targetPath(part, rel.getAttribute("Target")),
    doc = await readXml(zip, path),
    idx = ph.getAttribute("idx") || "0",
    type = ph.getAttribute("type") || "body";
  const match =
    shapeNodes(doc).find((s) => {
      const p = local(s, "ph")[0];
      return (
        p &&
        (p.getAttribute("idx") || "0") === idx &&
        (p.getAttribute("type") || "body") === type
      );
    }) ||
    shapeNodes(doc).find((s) => {
      const p = local(s, "ph")[0];
      return p && (p.getAttribute("type") || "body") === type;
    });
  return match ? inheritedShape(zip, path, match, depth + 1) : n;
}
async function relationships(zip: JSZip, path: string) {
  const rp = relPath(path);
  return zip.file(rp)
    ? readXml(zip, rp)
    : xml(
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`,
      );
}
function addRelationship(d: any, id: string, type: string, target: string) {
  const e = d.createElementNS(d.documentElement.namespaceURI, "Relationship");
  e.setAttribute("Id", id);
  e.setAttribute("Type", R + "/" + type);
  e.setAttribute("Target", target);
  d.documentElement.appendChild(e);
}
async function contentType(zip: JSZip, path: string, type: string) {
  const d = await readXml(zip, "[Content_Types].xml");
  if (
    !local(d, "Override").some((n) => n.getAttribute("PartName") === "/" + path)
  ) {
    const e = d.createElementNS(d.documentElement.namespaceURI, "Override");
    e.setAttribute("PartName", "/" + path);
    e.setAttribute("ContentType", type);
    d.documentElement.appendChild(e);
    zip.file("[Content_Types].xml", serialize(d));
  }
}
async function chartFor(zip: JSZip, part: string, node: any) {
  const ref = local(node, "chart")[0]?.getAttribute("r:id");
  const rels = await relationships(zip, part);
  const rel = local(rels, "Relationship").find(
    (n) => n.getAttribute("Id") === ref,
  );
  return rel ? targetPath(part, rel.getAttribute("Target")) : "";
}
async function sheetList(zip: JSZip) {
  const book = await readXml(zip, "xl/workbook.xml"),
    rels = await relationships(zip, "xl/workbook.xml");
  return local(book, "sheet").map((s) => ({
    name: s.getAttribute("name") as string,
    path: targetPath(
      "xl/workbook.xml",
      local(rels, "Relationship")
        .find((r) => r.getAttribute("Id") === s.getAttribute("r:id"))
        ?.getAttribute("Target") || "",
    ),
  }));
}
async function sharedStrings(zip: JSZip) {
  return zip.file("xl/sharedStrings.xml")
    ? local(await readXml(zip, "xl/sharedStrings.xml"), "si").map(textOf)
    : [];
}
function cellText(c: any, strings: string[]) {
  if (local(c, "f").length) return "[수식] " + local(c, "f")[0].textContent;
  return c.getAttribute("t") === "s"
    ? strings[Number(local(c, "v")[0]?.textContent)] || ""
    : c.getAttribute("t") === "inlineStr"
      ? textOf(c)
      : local(c, "v")[0]?.textContent || "";
}

export async function inspectCompanyFormat(
  data: Buffer,
): Promise<FormatInspection> {
  const zip = await safeOffice(data),
    ppt = !!zip.file("ppt/presentation.xml");
  if (!ppt && !zip.file("xl/workbook.xml"))
    throw new FormatError("PPTX 또는 XLSX 양식만 지원합니다.");
  const out: FormatInspection = {
    format: ppt ? "pptx" : "xlsx",
    slots: [],
    pages: [],
    warnings: [],
    fonts: [],
    brand: { font: "맑은 고딕", color: "#166b4c" },
  };
  const themePath = ppt ? "ppt/theme/theme1.xml" : "xl/theme/theme1.xml";
  if (zip.file(themePath)) {
    const th = await readXml(zip, themePath);
    const font = local(th, "minorFont")[0];
    const face =
      font &&
      [
        ...local(font, "font").filter(
          (n) => n.getAttribute("script") === "Hang",
        ),
        ...local(font, "latin"),
      ]
        .find((n) => n.getAttribute("typeface"))
        ?.getAttribute("typeface");
    if (face) out.brand.font = face;
    const c = local(local(th, "accent1")[0] || th, "srgbClr")[0]?.getAttribute(
      "val",
    );
    if (c) out.brand.color = "#" + c;
  }
  if (ppt) {
    const pres = await readXml(zip, "ppt/presentation.xml"),
      size = local(pres, "sldSz")[0];
    const rels = await relationships(zip, "ppt/presentation.xml");
    const slides = local(pres, "sldId").map((s) =>
      targetPath(
        "ppt/presentation.xml",
        local(rels, "Relationship")
          .find((r) => r.getAttribute("Id") === s.getAttribute("r:id"))!
          .getAttribute("Target"),
      ),
    );
    if (slides.length > 30)
      throw new FormatError(
        "양식은 30슬라이드까지 지원합니다. 필요한 페이지만 남겨주세요.",
      );
    for (const [i, path] of slides.entries()) {
      const d = await readXml(zip, path);
      if (
        local(d, "grpSp").length ||
        local(d, "oleObj").length ||
        local(d, "graphicData").some(
          (n) => !/chart|table/.test(n.getAttribute("uri")),
        )
      )
        throw new FormatError(
          `${i + 1}쪽에 그룹/SmartArt 등 지원하지 않는 요소가 있습니다. 그룹을 해제하거나 일반 텍스트·표·차트로 바꿔 주세요.`,
        );
      out.pages.push({
        id: path,
        label: `${i + 1}쪽`,
        width: Number(size.getAttribute("cx")) / 914400,
        height: Number(size.getAttribute("cy")) / 914400,
      });
      for (const n of shapeNodes(d)) {
        const kind =
          n.localName === "pic"
            ? "image"
            : local(n, "chart").length
              ? "chart"
              : local(n, "tbl").length
                ? "table"
                : "text";
        const id = path + "#" + shapeId(n);
        let sample = textOf(n);
        const label = local(n, "cNvPr")[0]?.getAttribute("name") || kind;
        if (kind === "chart") {
          const cp = await chartFor(zip, path, n);
          if (cp) sample = textOf(await readXml(zip, cp));
        }
        const inherited = await inheritedShape(zip, path, n),
          rp =
            local(n, "rPr")[0] ||
            local(n, "defRPr")[0] ||
            local(inherited, "defRPr")[0],
          font = rp && local(rp, "latin")[0]?.getAttribute("typeface"),
          sz = Number(rp?.getAttribute("sz") || 0) / 100,
          color = rp && local(rp, "srgbClr")[0]?.getAttribute("val");
        out.slots.push({
          id,
          page: path,
          label,
          kind,
          sample: sample.slice(0, 1000),
          suggestion: suggestField(sample + " " + label, kind),
          ...box(inherited),
          font: font || out.brand.font,
          size: sz || 18,
          color: color ? "#" + color : undefined,
        });
        if (font && !font.startsWith("+")) out.fonts.push(font);
        if (kind === "table")
          local(n, "tr").forEach((row, ri) =>
            local(row, "tc").forEach((cell, ci) => {
              const value = textOf(cell),
                props = local(cell, "rPr")[0],
                width =
                  Number(local(n, "gridCol")[ci]?.getAttribute("w") || 0) /
                  914400;
              out.slots.push({
                id: id + ":" + ri + ":" + ci,
                page: path,
                label: label + ` · ${ri + 1}행 ${ci + 1}열`,
                kind: "text",
                sample: value.slice(0, 1000),
                suggestion: suggestField(value, "text"),
                w: width,
                h: Number(row.getAttribute("h") || 0) / 914400,
                size: Number(props?.getAttribute("sz") || 1800) / 100,
                cell: { parent: id, row: ri, column: ci },
              });
            }),
          );
      }
    }
    out.warnings.push(
      "슬라이드·마스터·테마·배치를 유지합니다. 연결한 차트는 새 네이티브 차트로 교체하며 세부 차트 스타일은 달라질 수 있습니다. 발표자 노트·메모는 제거합니다.",
    );
  } else {
    const strings = await sharedStrings(zip),
      sheets = await sheetList(zip);
    if (sheets.length > 20)
      throw new FormatError("양식은 20시트까지 지원합니다.");
    for (const sheet of sheets) {
      const d = await readXml(zip, sheet.path);
      out.pages.push({
        id: sheet.path,
        label: sheet.name,
        width: 12,
        height: 8,
      });
      for (const c of local(d, "c")) {
        const text = cellText(c, strings);
        if (!text) continue;
        out.slots.push({
          id: sheet.path + "#" + c.getAttribute("r"),
          page: sheet.path,
          label: sheet.name + "!" + c.getAttribute("r"),
          kind: "text",
          sample: text.slice(0, 1000),
          suggestion: suggestField(text, "text"),
        });
      }
      const rels = await relationships(zip, sheet.path);
      for (const rel of local(rels, "Relationship").filter((r) =>
        /\/drawing$/.test(r.getAttribute("Type")),
      )) {
        const dp = targetPath(sheet.path, rel.getAttribute("Target")),
          drawing = await readXml(zip, dp);
        for (const pic of local(drawing, "pic"))
          out.slots.push({
            id: dp + "#" + shapeId(pic),
            page: sheet.path,
            label:
              sheet.name +
              " · " +
              (local(pic, "cNvPr")[0]?.getAttribute("name") || "그림"),
            kind: "image",
            sample: "회사 로고 또는 고정 그림인지 확인하세요.",
            suggestion: "",
          });
      }
    }
    for (const path of Object.keys(zip.files).filter((n) =>
      /^xl\/charts\/[^/]+\.xml$/.test(n),
    )) {
      const d = await readXml(zip, path);
      out.slots.push({
        id: path,
        page: sheets[0].path,
        label: posix.basename(path) + " (기존 차트)",
        kind: "chart",
        sample: textOf(d).slice(0, 1000),
        suggestion: suggestField(textOf(d), "chart"),
      });
    }
    out.warnings.push(
      "셀 위치·서식·병합·인쇄 설정을 유지합니다. 기존 수식은 새 결과값으로 연결하거나 비워야 합니다. 연결된 기존 차트는 새 네이티브 차트로 교체합니다. 표는 선택한 셀부터 비어 있는 영역에 작성합니다.",
    );
  }
  if (out.slots.length > slotsLimit)
    throw new FormatError(
      "연결 대상이 700개를 초과합니다. 보고용 빈 양식으로 정리해 주세요.",
    );
  out.fonts = [...new Set(out.fonts)];
  out.warnings.push('단일 인원 지표는 보고 종료월 기준이고, 금액은 원·근태는 시간·휴가는 시간/일을 따로 출력합니다. 고정 단위 문구를 같은 기준으로 맞춰 주세요. 양식의 천원·백만원 표기를 보고 값을 임의로 환산하지 않습니다.');
  out.warnings.push(
    "그림·고정 문구를 유지하면 그 안의 내용도 보관됩니다. 회사 로고·제목만 남겼는지 확인하세요. 글꼴 파일은 포함하지 않으며, 해당 글꼴이 없는 PC에서는 Office가 대체할 수 있습니다.",
  );
  return out;
}

function setText(n: any, text: string) {
  const body = local(n, "txBody")[0];
  if (!body) return;
  const old = local(body, "p")[0],
    props = old && local(old, "pPr")[0],
    run = local(body, "rPr")[0] || local(body, "defRPr")[0];
  for (const p of [...local(body, "p")]) remove(p);
  for (const line of text.split("\n")) {
    const p = body.ownerDocument.createElementNS(A, "a:p");
    if (props) p.appendChild(props.cloneNode(true));
    const r = body.ownerDocument.createElementNS(A, "a:r");
    if (run) r.appendChild(run.cloneNode(true));
    const t = body.ownerDocument.createElementNS(A, "a:t");
    t.appendChild(body.ownerDocument.createTextNode(line));
    r.appendChild(t);
    p.appendChild(r);
    body.appendChild(p);
  }
}
function setCell(c: any, value: string | number) {
  for (const child of [...Array.from(c.childNodes)] as any[]) remove(child);
  c.removeAttribute("t");
  if (typeof value === "number") {
    const v = c.ownerDocument.createElement("v");
    v.appendChild(c.ownerDocument.createTextNode(String(value)));
    c.appendChild(v);
  } else {
    c.setAttribute("t", "inlineStr");
    const is = c.ownerDocument.createElement("is"),
      t = c.ownerDocument.createElement("t");
    t.setAttribute("xml:space", "preserve");
    t.appendChild(c.ownerDocument.createTextNode(value));
    is.appendChild(t);
    c.appendChild(is);
  }
}
function validateBindings(inspection: FormatInspection, bindings: Binding[]) {
  if (new Set(bindings.map((b) => b.slot)).size !== bindings.length)
    throw new FormatError("같은 위치를 중복 연결할 수 없습니다.");
  for (const b of bindings) {
    const slot = inspection.slots.find((s) => s.id === b.slot);
    if (!slot)
      throw new FormatError(
        "양식 위치가 변경되었습니다. 파일을 다시 등록하세요.",
      );
    if (!["", "keep", ...formatFields.map(([k]) => k)].includes(b.field))
      throw new FormatError("지원하지 않는 연결 항목입니다.");
    if (
      b.field === "keep" &&
      (slot.kind === "chart" ||
        slot.kind === "table" ||
        slot.sample.startsWith("[수식]"))
    )
      throw new FormatError(
        "기존 차트·표·수식은 새 데이터로 연결하거나 비워 주세요.",
      );
    if (slot.kind === "image" && b.field && b.field !== "keep")
      throw new FormatError("그림은 유지 또는 제거를 선택하세요.");
    if (slot.kind === "chart" && b.field && !b.field.startsWith("chart:"))
      throw new FormatError("차트에는 차트 지표를 연결하세요.");
    if (
      slot.cell &&
      b.field &&
      (b.field.startsWith("chart:") || b.field === "table:metrics")
    )
      throw new FormatError(
        "표의 개별 칸에는 문구 또는 단일 지표를 연결하세요.",
      );
    if (
      slot.cell &&
      b.field &&
      bindings.some((x) => x.slot === slot.cell!.parent && x.field)
    )
      throw new FormatError(
        "표 전체 연결과 개별 칸 연결 중 한 가지 방식을 선택하세요.",
      );
    if (
      slot.kind === "table" &&
      b.field &&
      b.field !== "table:metrics" &&
      !b.field.startsWith("chart:")
    )
      throw new FormatError(
        "표에는 주요 지표 표 또는 차트 집계표를 연결하세요.",
      );
  }
  if (!bindings.some((b) => b.field && b.field !== "keep"))
    throw new FormatError("보고서에 연결할 항목을 한 개 이상 선택하세요.");
}

export async function sanitizeCompanyFormat(data: Buffer, bindings: Binding[]) {
  const inspection = await inspectCompanyFormat(data);
  validateBindings(inspection, bindings);
  const zip = await safeOffice(data),
    map = new Map(bindings.map((b) => [b.slot, b.field]));
  if (inspection.format === "pptx") {
    for (const page of inspection.pages) {
      const d = await readXml(zip, page.id),
        rels = await relationships(zip, page.id);
      for (const n of shapeNodes(d)) {
        const id = page.id + "#" + shapeId(n),
          field = map.get(id) || "",
          kind = inspection.slots.find((s) => s.id === id)!.kind;
        if (kind === "chart") {
          const cp = await chartFor(zip, page.id, n);
          for (const rel of local(rels, "Relationship"))
            if (targetPath(page.id, rel.getAttribute("Target")) === cp)
              remove(rel);
          const b = box(n),
            sid = shapeId(n);
          const replacement = xml(
            `<p:sp xmlns:p="${P}" xmlns:a="${A}"><p:nvSpPr><p:cNvPr id="${sid}" name="HRBIP chart"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(b.x * 914400)}" y="${Math.round(b.y * 914400)}"/><a:ext cx="${Math.round(b.w * 914400)}" cy="${Math.round(b.h * 914400)}"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t></a:t></a:r></a:p></p:txBody></p:sp>`,
          ).documentElement;
          n.parentNode.replaceChild(d.importNode(replacement, true), n);
        } else if (kind === "table") {
          local(n, "tr").forEach((row, ri) =>
            local(row, "tc").forEach((cell, ci) => {
              if (field || map.get(id + ":" + ri + ":" + ci) !== "keep")
                setText(cell, "");
            }),
          );
        } else if (kind === "image") {
          if (field !== "keep") remove(n);
        } else if (field !== "keep") setText(n, "");
      }
      zip.file(page.id, serialize(d));
      zip.file(relPath(page.id), serialize(rels));
    }
  } else {
    for (const page of inspection.pages) {
      const d = await readXml(zip, page.id);
      for (const c of local(d, "c"))
        if (map.get(page.id + "#" + c.getAttribute("r")) !== "keep")
          setCell(c, "");
      zip.file(page.id, serialize(d));
    }
    // Old shared strings otherwise retain all removed values even when cells are cleared.
    const strings = await sharedStrings(zip);
    for (const page of inspection.pages) {
      const d = await readXml(zip, page.id);
      for (const c of local(d, "c"))
        if (c.getAttribute("t") === "s")
          setCell(c, strings[Number(local(c, "v")[0]?.textContent)] || "");
      zip.file(page.id, serialize(d));
    }
    if (zip.file("xl/sharedStrings.xml"))
      zip.file(
        "xl/sharedStrings.xml",
        '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="0" uniqueCount="0"/>',
      );
    for (const s of inspection.slots.filter((s) => s.kind === "chart")) {
      // Remove every old cache/formula from the baseline. A new chart is written during export.
      zip.file(
        s.id,
        '<?xml version="1.0"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"/>',
      );
      if (zip.file(relPath(s.id))) zip.remove(relPath(s.id));
    }
    for (const path of Object.keys(zip.files).filter((n) =>
      /^xl\/drawings\/[^/]+\.xml$/.test(n),
    )) {
      const d = await readXml(zip, path);
      for (const pic of local(d, "pic"))
        if (map.get(path + "#" + shapeId(pic)) !== "keep") {
          let anchor = pic;
          while (anchor.parentNode && anchor.parentNode !== d.documentElement)
            anchor = anchor.parentNode;
          remove(anchor);
        }
      zip.file(path, serialize(d));
    }
  }
  // Remove values in document properties, notes/comments and unused embedded data.
  for (const name of ["docProps/core.xml", "docProps/app.xml"])
    if (zip.file(name)) {
      const d = await readXml(zip, name);
      for (const n of local(d, "creator").concat(
        local(d, "lastModifiedBy"),
        local(d, "title"),
        local(d, "subject"),
        local(d, "description"),
        local(d, "keywords"),
        local(d, "Company"),
      ))
        n.textContent = "";
      zip.file(name, serialize(d));
    }
  await prunePackage(zip);
  return { data: await zip.generateAsync({ type: "nodebuffer" }), inspection };
}

function tableValues(
  field: string,
  w: Workspace,
  r: Result,
): (string | number)[][] {
  if (field === "table:metrics")
    return [
      ["지표", "값", "단위"],
      ...r.metrics.map((m) => [m.label, m.value ?? "자료 없음", m.unit]),
    ];
  const c = r.charts.find((c) => c.id === field.slice(6));
  if (!c) return [["자료 없음 / 계산 불가"]];
  return [
    ["기간/범주", ...c.series.map((s) => s + " (" + c.unit + ")")],
    ...c.points.map((p) => [
      p.label,
      p.value ?? "자료 없음",
      ...(c.series.length > 1 ? [p.value2 ?? "자료 없음"] : []),
    ]),
  ];
}
export type AppliedFormat = { data: Buffer; warnings: string[] };
export async function applyCompanyFormat(
  data: Buffer,
  inspection: FormatInspection,
  bindings: Binding[],
  w: Workspace,
  r: Result,
  brand: { font: string; color: string },
): Promise<AppliedFormat> {
  const zip = await safeOffice(data),
    warnings: string[] = [],
    map = new Map(bindings.map((b) => [b.slot, b.field]));
  let seq = 0;
  const ppt = inspection.format === "pptx";
  async function newChart(field: string) {
    const chart = r.charts.find((c) => c.id === field.slice(6));
    if (!chart)
      throw new FormatError(
        "양식에 연결한 " +
          field +
          " 자료가 없습니다. 연결을 해제하거나 자료를 추가하세요.",
      );
    const valid = chart.points.filter(
      (p) =>
        p.value !== null && (chart.series.length === 1 || p.value2 != null),
    );
    if (!valid.length)
      throw new FormatError("양식에 연결한 차트의 자료가 없습니다.");
    const card = w.design.cards.find((c) => c.id === chart.id);
    let kind = card?.type || chart.recommended;
    if (kind === "table") kind = chart.recommended;
    if (kind === "line" && valid.length !== chart.points.length) {
      kind = "bar";
      warnings.push(
        chart.title + ": 자료 없는 구간을 제외한 막대로 출력합니다.",
      );
    }
    const deck = new pptxgen();
    deck.addSlide().addChart(
      kind === "line"
        ? deck.ChartType.line
        : kind === "pie"
          ? deck.ChartType.pie
          : deck.ChartType.bar,
      chart.series.map((name, i) => ({
        name,
        labels: valid.map((p) => p.label),
        values: valid.map((p) => (i === 0 ? p.value! : p.value2!)),
      })),
      {
        x: 0,
        y: 0,
        w: 8,
        h: 4,
        catAxisLabelFontFace: brand.font,
        valAxisLabelFontFace: brand.font,
        catAxisLabelFontSize: 12,
        valAxisLabelFontSize: 12,
        showLegend: chart.series.length > 1,
        chartColors: [brand.color.slice(1), "77998A", "A1BE85"],
        barDir: kind === "horizontal" ? "bar" : "col",
        barGrouping: "clustered",
        showTitle: true,
        title: chart.title + " (" + chart.unit + ")",
        titleFontFace: brand.font,
        titleFontSize: 16,
        showValue: false,
        displayBlanksAs: "gap",
      },
    );
    const chartZip = await JSZip.loadAsync(
      (await deck.write({ outputType: "nodebuffer" })) as Buffer,
    );
    const path = Object.keys(chartZip.files).find((n) =>
      /^ppt\/charts\/chart\d+\.xml$/.test(n),
    )!;
    return { zip: chartZip, chart, path };
  }
  for (const page of inspection.pages) {
    const d = await readXml(zip, page.id),
      rels = await relationships(zip, page.id);
    for (const slot of inspection.slots.filter(
      (s) => s.page === page.id && !(s.kind === "chart" && !ppt),
    )) {
      const field = map.get(slot.id) || "";
      if (!field || field === "keep") continue;
      if (ppt) {
        if (slot.cell) {
          const node = shapeNodes(d).find(
              (n) => page.id + "#" + shapeId(n) === slot.cell!.parent,
            ),
            cell =
              node &&
              local(local(node, "tr")[slot.cell.row], "tc")[slot.cell.column];
          if (!cell)
            throw new FormatError(
              "표의 연결 위치를 찾지 못했습니다. 양식을 다시 등록하세요.",
            );
          const value = String(fieldValue(field, w, r));
          if (value.length * (slot.size || 18) > (slot.w || 1) * 72 * 2)
            throw new FormatError(
              slot.label +
                ": 값이 칸보다 깁니다. 양식 칸을 넓히거나 짧은 문구를 연결하세요.",
            );
          setText(cell, value);
          continue;
        }
        const n = shapeNodes(d).find(
          (n) => page.id + "#" + shapeId(n) === slot.id,
        );
        if (!n) continue;
        if (field.startsWith("chart:") && slot.kind !== "table") {
          const built = await newChart(field);
          const index = ++seq,
            cp = `ppt/charts/hrbip${index}.xml`,
            ep = `ppt/embeddings/hrbip${index}.xlsx`,
            rid = "hrbipChart" + index;
          const cd = await readXml(built.zip, built.path);
          zip.file(cp, serialize(cd));
          const embedded = Object.keys(built.zip.files).find((n) =>
            /^ppt\/embeddings\/.*\.xlsx$/.test(n),
          )!;
          zip.file(ep, await built.zip.file(embedded)!.async("nodebuffer"));
          const cr = await relationships(built.zip, built.path);
          for (const rel of local(cr, "Relationship"))
            rel.setAttribute("Target", "../embeddings/" + posix.basename(ep));
          zip.file(relPath(cp), serialize(cr));
          await contentType(
            zip,
            cp,
            "application/vnd.openxmlformats-officedocument.drawingml.chart+xml",
          );
          await contentType(
            zip,
            ep,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          );
          addRelationship(
            rels,
            rid,
            "chart",
            "../charts/" + posix.basename(cp),
          );
          const b = {
            x: slot.x || 0,
            y: slot.y || 0,
            w: slot.w || 0,
            h: slot.h || 0,
          };
          const f = xml(
            `<p:graphicFrame xmlns:p="${P}" xmlns:a="${A}" xmlns:r="${R}"><p:nvGraphicFramePr><p:cNvPr id="${shapeId(n)}" name="${esc(built.chart.title)}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${Math.round(b.x * 914400)}" y="${Math.round(b.y * 914400)}"/><a:ext cx="${Math.round(b.w * 914400)}" cy="${Math.round(b.h * 914400)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${rid}"/></a:graphicData></a:graphic></p:graphicFrame>`,
          ).documentElement;
          n.parentNode.replaceChild(d.importNode(f, true), n);
        } else if (slot.kind === "table") {
          const rows = tableValues(field, w, r),
            tr = local(n, "tr"),
            cols = local(n, "gridCol").length;
          if (rows.length > tr.length || rows.some((row) => row.length > cols))
            throw new FormatError(
              `${page.label} ${slot.label}: 표 칸이 부족합니다 (${rows.length}행 × ${Math.max(...rows.map((r) => r.length))}열 필요). 양식 표를 늘리거나 보고 기간을 줄여 주세요.`,
            );
          tr.forEach((row, i) =>
            local(row, "tc").forEach((cell, j) =>
              setText(cell, String(rows[i]?.[j] ?? "")),
            ),
          );
        } else {
          if (field === "table:metrics")
            throw new FormatError("주요 지표 표는 PPT의 표 요소에 연결하세요.");
          const value = String(fieldValue(field, w, r)),
            fontSize = slot.size || 18,
            b = { w: slot.w || 0, h: slot.h || 0 },
            charsPerLine = Math.max(1, Math.floor((b.w * 72) / fontSize)),
            lines = value
              .split("\n")
              .reduce(
                (n, s) => n + Math.max(1, Math.ceil(s.length / charsPerLine)),
                0,
              );
          if (lines * fontSize * 1.15 > b.h * 72 + fontSize)
            throw new FormatError(
              `${page.label} ${slot.label}: 글 상자에 내용이 넘칠 수 있습니다. 문장을 줄이거나 회사 양식의 글 상자를 넓혀 주세요. 글씨를 자동 축소하지 않았습니다.`,
            );
          setText(n, value);
        }
      } else {
        const address = slot.id.split("#")[1],
          cell = local(d, "c").find((c) => c.getAttribute("r") === address);
        if (!cell) continue;
        if (field.startsWith("chart:") || field === "table:metrics") {
          const rows = tableValues(field, w, r),
            match = address.match(/^([A-Z]+)(\d+)$/)!;
          const startCol = [...match[1]].reduce(
              (n, c) => n * 26 + c.charCodeAt(0) - 64,
              0,
            ),
            startRow = Number(match[2]);
          const colName = (n: number): string =>
            n
              ? colName(Math.floor((n - 1) / 26)) +
                String.fromCharCode(65 + ((n - 1) % 26))
              : "";
          const sheetData = local(d, "sheetData")[0];
          for (const [i, values] of rows.entries())
            for (const [j, value] of values.entries()) {
              const addr = colName(startCol + j) + (startRow + i);
              let dest = local(d, "c").find(
                (c) => c.getAttribute("r") === addr,
              );
              const other = inspection.slots.find(
                  (s) => s.id === page.id + "#" + addr,
                ),
                bound = other && map.get(other.id);
              const merged = local(d, "mergeCell").some((n) => {
                const [a, b] = n.getAttribute("ref").split(":");
                const parse = (s: string) => {
                  const m = s.match(/^([A-Z]+)(\d+)$/)!;
                  return {
                    c: [...m[1]].reduce(
                      (v, c) => v * 26 + c.charCodeAt(0) - 64,
                      0,
                    ),
                    r: Number(m[2]),
                  };
                };
                const first = parse(a),
                  last = parse(b || a);
                return (
                  startCol + j >= first.c &&
                  startCol + j <= last.c &&
                  startRow + i >= first.r &&
                  startRow + i <= last.r
                );
              });
              if (merged)
                throw new FormatError(
                  `${slot.label}: 표 범위 ${addr}에 병합 셀이 있습니다. 표 출력 영역의 병합을 해제해 주세요.`,
                );
              if (
                addr !== address &&
                (bound || (dest && cellText(dest, []) !== ""))
              )
                throw new FormatError(
                  `${slot.label}: 표를 넣을 범위 ${addr}에 고정 문구 또는 다른 연결값이 있습니다. 비어 있는 영역을 확보하세요.`,
                );
              if (!dest) {
                let row = local(sheetData, "row").find(
                  (n) => Number(n.getAttribute("r")) === startRow + i,
                );
                if (!row) {
                  row = d.createElement("row");
                  row.setAttribute("r", String(startRow + i));
                  sheetData.appendChild(row);
                }
                dest = cell.cloneNode(true);
                dest.setAttribute("r", addr);
                row.appendChild(dest);
              }
              setCell(dest, value);
            }
        } else setCell(cell, fieldValue(field, w, r));
      }
    }
    if (!ppt) {
      const sheetData = local(d, "sheetData")[0];
      for (const row of local(sheetData, "row").sort(
        (a, b) => Number(a.getAttribute("r")) - Number(b.getAttribute("r")),
      )) {
        sheetData.appendChild(row);
        for (const cell of local(row, "c").sort((a, b) => {
          const col = (s: string) =>
            [...s.replace(/\d/g, "")].reduce(
              (v, c) => v * 26 + c.charCodeAt(0) - 64,
              0,
            );
          return col(a.getAttribute("r")) - col(b.getAttribute("r"));
        }))
          row.appendChild(cell);
      }
      for (const n of local(d, "dimension")) remove(n);
    }
    zip.file(page.id, serialize(d));
    if (ppt) zip.file(relPath(page.id), serialize(rels));
  }
  if (!ppt) {
    for (const slot of inspection.slots.filter((s) => s.kind === "chart")) {
      const field = map.get(slot.id) || "";
      if (!field) {
        // remove references to unused charts so blank old caches cannot be displayed
        for (const name of Object.keys(zip.files).filter((n) =>
          /^xl\/drawings\/.*\.xml$/.test(n),
        )) {
          const d = await readXml(zip, name),
            rels = await relationships(zip, name);
          for (const node of local(d, "chart")) {
            const rel = local(rels, "Relationship").find(
              (r) => r.getAttribute("Id") === node.getAttribute("r:id"),
            );
            if (
              rel &&
              targetPath(name, rel.getAttribute("Target")) === slot.id
            ) {
              let anchor = node;
              while (
                anchor.parentNode &&
                anchor.parentNode !== d.documentElement
              )
                anchor = anchor.parentNode;
              remove(anchor);
              remove(rel);
            }
          }
          zip.file(name, serialize(d));
          zip.file(relPath(name), serialize(rels));
        }
        continue;
      }
      const built = await newChart(field),
        cd = await readXml(built.zip, built.path);
      const existingSheets = await sheetList(zip);
      let name = "HRBIP_차트" + ++seq;
      while (existingSheets.some((s) => s.name === name))
        name = "HRBIP_차트" + ++seq;
      const sheetIndex =
        Math.max(
          0,
          ...Object.keys(zip.files).map((n) =>
            Number(n.match(/^xl\/worksheets\/sheet(\d+)\.xml$/)?.[1] || 0),
          ),
        ) + 1;
      const path = `xl/worksheets/sheet${sheetIndex}.xml`;
      const embedded = Object.keys(built.zip.files).find((n) =>
          /^ppt\/embeddings\/.*\.xlsx$/.test(n),
        )!,
        wb = new ExcelJS.Workbook();
      await wb.xlsx.load(
        (await built.zip.file(embedded)!.async("nodebuffer")) as never,
      );
      let rowXml = "";
      wb.worksheets[0].eachRow((row, i) => {
        rowXml += `<row r="${i}">`;
        row.eachCell((c, j) => {
          const a = String.fromCharCode(64 + j) + i,
            v = c.value;
          rowXml +=
            typeof v === "number"
              ? `<c r="${a}"><v>${v}</v></c>`
              : `<c r="${a}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
        });
        rowXml += "</row>";
      });
      zip.file(
        path,
        `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`,
      );
      const book = await readXml(zip, "xl/workbook.xml"),
        br = await relationships(zip, "xl/workbook.xml"),
        sheet = book.createElement("sheet"),
        rid = "hrbipSheet" + seq;
      sheet.setAttribute("name", name);
      sheet.setAttribute(
        "sheetId",
        String(
          Math.max(
            ...local(book, "sheet").map((n) =>
              Number(n.getAttribute("sheetId")),
            ),
          ) + 1,
        ),
      );
      sheet.setAttribute("r:id", rid);
      local(book, "sheets")[0].appendChild(sheet);
      addRelationship(
        br,
        rid,
        "worksheet",
        "worksheets/" + posix.basename(path),
      );
      zip.file("xl/workbook.xml", serialize(book));
      zip.file(relPath("xl/workbook.xml"), serialize(br));
      await contentType(
        zip,
        path,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml",
      );
      for (const f of local(cd, "f"))
        f.textContent = f.textContent.replace(/^[^!]+!/, "'" + name + "'!");
      for (const e of local(cd, "externalData")) remove(e);
      zip.file(slot.id, serialize(cd));
    }
  }
  await prunePackage(zip);
  return { data: await zip.generateAsync({ type: "nodebuffer" }), warnings };
}
