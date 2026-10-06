import ExcelJS from "exceljs";
import pptxgen from "pptxgenjs";
import { launchPdfBrowser, pdfFontCss } from "./pdf-runtime.js";
import { aggregate, effectiveCards, formatValue } from "../shared/analytics.js";
import { parseDate } from "../shared/import.js";
import { verifyCalculations, sharedVerification } from "../shared/verification.js";
import { addVerificationSheets } from "./verification-export.js";
import {
  type Workspace,
  type Result,
  type Chart,
  type Card,
} from "../shared/model.js";
const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const palette = {
  green: ["166B4C", "8DBB43", "547F9A"],
  forest: ["234A3C", "6E9683", "B29C66"],
  lime: ["527A1D", "92BA4B", "547F9A"],
};
export function assertExportable(w: Workspace, r = aggregate(w)) {
  if (verifyCalculations(w, r).blocked)
    throw new Error(
      "계산 대조 결과가 일치하지 않아 내보내기를 중단했습니다. 계산 검증표를 확인하세요.",
    );
  if (!Object.values(r.available).some(Boolean))
    throw new Error(
      "계산 가능한 분석 영역이 없습니다. 데이터와 집계 기준을 확인하세요.",
    );
  if (w.report.basisKey !== r.key || w.report.reviewedKey !== r.key)
    throw new Error(
      "최신 집계값과 보고 문장을 확인한 뒤 최종 확인을 완료하세요.",
    );
  return r;
}
function pointRows(c: Chart) {
  return c.points.map((p) => [
    p.label,
    formatValue(p.value, c.unit),
    ...(c.series.length > 1 ? [formatValue(p.value2 ?? null, c.unit)] : []),
  ]);
}
export async function exportExcel(
  w: Workspace,
  r = aggregate(w),
  shared = false,
) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "HRBIP";
  wb.created = new Date();
  const basis = wb.addWorksheet("보고 기준");
  basis.addRows([
    ["HRBIP", w.title],
    ...r.basis.map((s) => ["기준", s]),
    ["생성 방식", "규칙 기반 초안 / 담당자 편집"],
    ...r.notices.map((s) => ["안내", s]),
    ...Object.entries(r.reasons)
      .filter(([, s]) => s)
      .map(([k, s]) => [k, s]),
  ]);
  const metrics = wb.addWorksheet("주요 지표");
  metrics.addRow(["지표", "값", "단위", "범위 및 계산 기준"]);
  for (const m of r.metrics)
    metrics.addRow([
      m.label,
      m.value === null ? "자료 없음 / 계산 불가" : m.value,
      m.unit,
      m.note,
    ]);
  for (const c of r.charts) {
    const s = wb.addWorksheet(c.title.slice(0, 25));
    s.addRow(["기간/범주", ...c.series.map((n) => n + " (" + c.unit + ")")]);
    for (const p of c.points)
      s.addRow([
        p.label,
        p.value === null ? "자료 없음" : p.value,
        ...(c.series.length > 1
          ? [p.value2 == null ? "자료 없음" : p.value2]
          : []),
      ]);
  }
  const report = wb.addWorksheet("보고 문장");
  report.addRow(["구분", "내용"]);
  report.addRow(["규칙 기반·담당자 편집", w.report.generated]);
  report.addRow(["담당자 의견", w.report.notes]);
  const change = wb.addWorksheet("처리 기록");
  change.addRow(["시각", "변경 내용"]);
  w.audit.forEach((a) => change.addRow([a.at, a.action]));
  wb.eachSheet((s) => {
    s.views = [{ state: "frozen", ySplit: 1 }];
    s.columns.forEach((col, i) => {
      col.width = i === 0 ? 32 : 48;
    });
    s.eachRow((row, i) => {
      row.font = { name: "맑은 고딕", size: 11 };
      row.alignment = { vertical: "top", wrapText: true };
      if (i === 1) {
        row.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF166B4C" },
        };
        row.font = {
          name: "맑은 고딕",
          bold: true,
          color: { argb: "FFFFFFFF" },
        };
      }
      row.height =
        i === 1
          ? 28
          : Math.min(
              180,
              22 +
                Math.ceil(String(row.getCell(2).value ?? "").length / 42) * 16,
            );
    });
  });
  const verification = verifyCalculations(w, r);
  addVerificationSheets(
    wb,
    shared ? sharedVerification(verification) : verification,
  );
  return Buffer.from(await wb.xlsx.writeBuffer());
}
function wrap(text: string, max = 65) {
  return text.split("\n").flatMap((line) => {
    const chars = Array.from(line);
    return chars.length
      ? Array.from({ length: Math.ceil(chars.length / max) }, (_, i) =>
          chars.slice(i * max, (i + 1) * max).join(""),
        )
      : [""];
  });
}
function groups<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );
}
// Keep each source sentence together when a slide boundary is reached.
// This prevents a new slide beginning with a trailing syllable or punctuation.
function textPages(text: string): string[] {
  const pages: string[] = [];
  let current: string[] = [],
    used = 0;
  const paragraphs = text.split("\n").filter(Boolean);
  for (let i = 0; i < paragraphs.length; i++) {
    let paragraph = paragraphs[i];
    if (/^(주요 현황|추가 확인 사항)$/.test(paragraph) && paragraphs[i + 1])
      paragraph += "\n" + paragraphs[++i];
    const lines = wrap(paragraph, 44);
    if (used && used + lines.length > 10) {
      pages.push(current.join("\n\n"));
      current = [];
      used = 0;
    }
    for (const part of groups(lines, 10)) {
      if (used && used + part.length > 10) {
        pages.push(current.join("\n\n"));
        current = [];
        used = 0;
      }
      current.push(part.join("\n"));
      used += part.length + 1;
    }
  }
  if (current.length) pages.push(current.join("\n\n"));
  return pages;
}
export async function exportPptx(w: Workspace, r = aggregate(w)) {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "HRBIP";
  pptx.subject = "인사현황 보고서";
  pptx.title = w.title;
  pptx.theme = { headFontFace: "맑은 고딕", bodyFontFace: "맑은 고딕" };
  const colors = palette[w.design.theme];
  let slideNumber = 0;
  const slide = (title: string) => {
    const s = pptx.addSlide();
    s.background = { color: "FFFFFF" };
    s.addShape(pptx.ShapeType.rect, {
      x: 0,
      y: 0,
      w: 13.333,
      h: 0.12,
      fill: { color: colors[0] },
      line: { color: colors[0] },
    });
    s.addText(title, {
      x: 0.6,
      y: 0.4,
      w: 12.1,
      h: 0.7,
      fontSize: 30,
      bold: true,
      color: "192C23",
      breakLine: false,
      fit: "shrink",
    });
    s.addText(
      "HRBIP  |  " +
        r.filters.from +
        " ~ " +
        r.filters.to +
        "  |  " +
        (r.filters.department || "전체 부서") +
        "  |  " +
        (r.filters.employmentType || "전체 고용형태"),
      { x: 0.6, y: 7.02, w: 11.6, h: 0.26, fontSize: 12, color: "52665B" },
    );
    s.addText(String(++slideNumber), {
      x: 12.1,
      y: 7.02,
      w: 0.6,
      h: 0.24,
      fontSize: 12,
      color: "52665B",
      align: "right",
    });
    return s;
  };
  const cover = slide("");
  cover.addText("HRBIP", {
    x: 0.7,
    y: 1.0,
    w: 11.9,
    h: 1.3,
    fontSize: 86,
    bold: true,
    color: colors[0],
    margin: 0,
  });
  cover.addText("HR Business Intelligence Partner", {
    x: 0.75,
    y: 2.5,
    w: 11.8,
    h: 0.5,
    fontSize: 24,
    color: colors[0],
    margin: 0,
  });
  cover.addText(w.title, {
    x: 0.75,
    y: 3.6,
    w: 11.8,
    h: 1,
    fontSize: 34,
    bold: true,
    color: "192C23",
    margin: 0,
    fit: "shrink",
  });
  cover.addText(r.filters.from + " ~ " + r.filters.to, {
    x: 0.75,
    y: 5.0,
    w: 11.8,
    h: 0.5,
    fontSize: 26,
    color: "192C23",
    margin: 0,
  });
  cover.addText(
    (r.filters.department || "전체 부서") +
      " · " +
      (r.filters.employmentType || "전체 고용형태") +
      "\n자료가 있는 구간만 집계하며, 확인 불가 구간은 별도로 표시합니다.",
    {
      x: 0.75,
      y: 5.7,
      w: 11.8,
      h: 0.9,
      fontSize: 18,
      color: "52665B",
      margin: 0,
    },
  );
  const scope = slide("요청 기간과 실제 자료 범위");
  const scopeLines = ["요청 기간: " + r.filters.from + " ~ " + r.filters.to];
  for (const role of ["people", "attendance", "payroll"] as const) {
    const tables = w.datasets.filter((d) => d.role === role && !d.excluded);
    if (role === "people") {
      const dates = tables
        .flatMap((d) =>
          d.rows
            .map((row) =>
              parseDate(row[d.mapping.startDate || ""] || "", d.dateFormat),
            )
            .filter(Boolean),
        )
        .sort();
      if (dates.length)
        scopeLines.push("파일 내 입사일: " + dates[0] + " ~ " + dates.at(-1));
      const ranges = [
        ...new Set(
          tables.map((d) =>
            d.mode === "history"
              ? d.coverageStart + " ~ " + d.coverageEnd
              : d.asOf,
          ),
        ),
      ];
      scopeLines.push(
        "인원 이력 확인 범위: " + (ranges.join(", ") || "자료 없음"),
      );
    } else {
      const dates = tables
        .flatMap((d) =>
          d.rows
            .map((row) =>
              parseDate(row[d.mapping.date || ""] || "", d.dateFormat)?.slice(
                0,
                7,
              ),
            )
            .filter(Boolean),
        )
        .sort();
      scopeLines.push(
        (role === "attendance" ? "근태·휴가" : "인건비") +
          " 기록: " +
          (dates.length ? dates[0] + " ~ " + dates.at(-1) : "자료 없음"),
      );
    }
  }
  scopeLines.push(
    "과거 입사일만으로 당시 전체 직원 명단과 퇴사 이력을 복원하지 않습니다.",
    "자료가 없는 월은 0이 아닌 ‘자료 없음’으로 표시합니다.",
  );
  scope.addText(scopeLines.join("\n\n"), {
    x: 0.7,
    y: 1.45,
    w: 11.9,
    h: 5.1,
    fontSize: 21,
    color: "192C23",
    margin: 0,
    paraSpaceAfter: 4,
    valign: "top",
  });
  for (const [idx, part] of groups(r.metrics, 5).entries()) {
    const s = slide(idx === 0 ? "주요 지표" : "주요 지표 (계속)");
    s.addTable(
      [
        ["지표", "값", "단위", "범위"],
        ...part.map((m) => [
          m.label,
          m.value === null ? "계산 불가" : formatValue(m.value),
          m.unit,
          m.note,
        ]),
      ].map((row) => row.map((text) => ({ text }))),
      {
        x: 0.6,
        y: 1.4,
        w: 12.1,
        h: 4.7,
        colW: [3.6, 2, 1, 5.5],
        fontFace: "맑은 고딕",
        fontSize: 17,
        border: { color: "DBE5DA", pt: 0.6 },
        fill: { color: "F5F8F2" },
        margin: 8,
        rowH: 0.4,
        color: "192C23",
      },
    );
  }
  for (const [title, text] of [
    ["보고서 초안 · 담당자 편집", w.report.generated],
    ["담당자 의견", w.report.notes],
    [
      "집계 기준과 안내",
      [
        ...r.basis,
        ...r.notices,
        ...Object.entries(r.reasons)
          .filter(([, s]) => s)
          .map(([k, s]) => k + ": " + s),
      ].join("\n"),
    ],
  ]) {
    if (!text) continue;
    for (const part of textPages(text)) {
      const s = slide(title);
      s.addText(part, {
        x: 0.65,
        y: 1.35,
        w: 12,
        h: 5.3,
        fontFace: "맑은 고딕",
        fontSize: 19,
        color: "192C23",
        breakLine: false,
        margin: 0,
        paraSpaceAfter: 7,
        valign: "top",
      });
    }
  }
  for (const card of effectiveCards(w, r).filter((c) => c.visible)) {
    const c = r.charts.find((c) => c.id === card.id)!;
    const first = c.points.findIndex((p) => p.value !== null);
    const last =
      c.points.length -
      1 -
      [...c.points].reverse().findIndex((p) => p.value !== null);
    const shown = first < 0 ? c.points : c.points.slice(first, last + 1);
    const trimmed = c.points.length - shown.length;
    for (const [page, points] of groups(
      shown,
      card.type === "table"
        ? 9
        : card.type === "horizontal" || card.type === "pie"
          ? 10
          : Math.max(1, Math.ceil(shown.length / Math.ceil(shown.length / 14))),
    ).entries()) {
      const s = slide(card.title + (page ? " (계속)" : ""));
      const millionAxis =
        c.unit === "원" &&
        points.some((p) => Math.abs(p.value || 0) >= 1000000);
      s.addText(
        (millionAxis ? "축 단위: 백만 원" : c.unit) +
          " / " +
          c.series.join("·") +
          (c.filter === "month" && points.length
            ? "  ·  " + points[0].label + " ~ " + points.at(-1)!.label
            : ""),
        {
          x: 0.65,
          y: 1.13,
          w: 12,
          h: 0.28,
          fontSize: 15,
          color: "52665B",
        },
      );
      if (card.type === "table") {
        s.addTable(
          [["기간/범주", ...c.series], ...pointRows({ ...c, points })].map(
            (row) => row.map((text) => ({ text })),
          ),
          {
            x: 0.65,
            y: 1.55,
            w: 12,
            h: 4.6,
            fontFace: "맑은 고딕",
            fontSize: 17,
            border: { color: "DBE5DA", pt: 0.5 },
            autoPage: true,
            autoPageRepeatHeader: true,
            margin: 5,
          },
        );
      } else {
        // Missing observations are omitted, never written as zero to native chart cells.
        const valid = points.filter(
          (p) =>
            p.value !== null && (c.series.length === 1 || p.value2 != null),
        );
        const missing = points.length - valid.length;
        const type =
          card.type === "line"
            ? missing
              ? pptx.ChartType.bar
              : pptx.ChartType.line
            : card.type === "pie"
              ? pptx.ChartType.pie
              : pptx.ChartType.bar;
        const data = c.series.map((name, i) => ({
          name,
          labels: valid.map((p) => p.label),
          values: valid.map((p) => (i === 0 ? p.value! : p.value2!)),
        }));
        if (valid.length)
          s.addChart(type, data, {
            x: 0.65,
            y: 1.6,
            w: 12,
            h: 4.35,
            catAxisLabelFontFace: "맑은 고딕",
            catAxisLabelFontSize: 14,
            valAxisLabelFontFace: "맑은 고딕",
            valAxisLabelFontSize: 14,
            valAxisLabelFormatCode: millionAxis ? '#,##0,,"백만"' : "#,##0.##",
            ...(c.unit === "명" &&
            Math.max(
              ...valid.map((p) => p.value || 0),
              ...valid.map((p) => p.value2 || 0),
            ) <= 10
              ? { valAxisMajorUnit: 1 }
              : {}),
            showLegend: c.series.length > 1 || card.type === "pie",
            legendFontFace: "맑은 고딕",
            legendFontSize: 14,
            showValue: false,
            chartColors: colors,
            valAxisMinVal: Math.min(
              0,
              ...valid.flatMap((p) => [p.value!, p.value2 ?? 0]),
            ),
            showTitle: false,
            showPercent: card.type === "pie",
            barDir: card.type === "horizontal" ? "bar" : "col",
            barGrouping: "clustered",
            displayBlanksAs: "gap",
          });
        if (missing || trimmed)
          s.addText(
            "요청 범위 중 자료가 있는 구간을 표시합니다." +
              (missing
                ? " 중간 결측은 제외하고 선그래프를 막대로 대체합니다."
                : "") +
              " 전체 기간·결측값은 Excel에서 확인할 수 있어요.",
            { x: 0.65, y: 6.08, w: 12, h: 0.4, fontSize: 13, color: "825A20" },
          );
      }
      s.addText(c.reason, {
        x: 0.65,
        y: 6.55,
        w: 12,
        h: 0.38,
        fontSize: 13,
        color: "52665B",
        fit: "shrink",
      });
    }
  }
  return Buffer.from(
    (await pptx.write({ outputType: "nodebuffer" })) as ArrayBuffer,
  );
}
function svgChart(c: Chart, card: Card, colors: string[]): string {
  const pts = c.points;
  const W = 940,
    H = 300;
  const values = pts.flatMap((p) =>
    [p.value, p.value2].filter((n): n is number => n != null),
  );
  if (!values.length) return "<p>자료 없음</p>";
  const max = Math.max(...values, 1),
    min = Math.min(...values, 0),
    range = max - min || 1;
  const x = (i: number) => 85 + (i * 810) / Math.max(1, pts.length - 1),
    y = (v: number) => 250 - ((v - min) / range) * 220;
  let shapes = "";
  if (
    card.type === "pie" &&
    values.every((v) => v >= 0) &&
    c.series.length === 1
  ) {
    const total = values.reduce((a, b) => a + b, 0);
    let angle = -Math.PI / 2;
    pts.forEach((p, i) => {
      if (p.value == null || !total) return;
      const end = angle + (p.value / total) * Math.PI * 2;
      const startX = 255 + 110 * Math.cos(angle),
        startY = 145 + 110 * Math.sin(angle),
        endX = 255 + 110 * Math.cos(end),
        endY = 145 + 110 * Math.sin(end);
      shapes +=
        p.value === total
          ? '<circle cx="255" cy="145" r="110" fill="#' +
            colors[i % colors.length] +
            '"/>'
          : '<path d="M255 145 L' +
            startX +
            " " +
            startY +
            " A110 110 0 " +
            (end - angle > Math.PI ? 1 : 0) +
            " 1 " +
            endX +
            " " +
            endY +
            ' Z" fill="#' +
            colors[i % colors.length] +
            '"/>';
      shapes +=
        '<text x="430" y="' +
        (40 + i * 21) +
        '">' +
        esc(p.label) +
        ": " +
        esc(formatValue(p.value, c.unit)) +
        "</text>";
      angle = end;
    });
  } else if (card.type === "horizontal") {
    const height = Math.max(300, pts.length * 31 + 30);
    return (
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 940 ' +
      height +
      '" role="img">' +
      pts
        .map(
          (p, i) =>
            '<text x="0" y="' +
            (25 + i * 31) +
            '">' +
            esc(p.label) +
            "</text>" +
            (p.value === null
              ? ""
              : '<rect x="' +
                (230 +
                  (Math.min(0, p.value) / range) * 570 -
                  (min / range) * 570) +
                '" y="' +
                (8 + i * 31) +
                '" width="' +
                (Math.abs(p.value) / range) * 570 +
                '" height="20" fill="#' +
                colors[0] +
                '"/><text x="820" y="' +
                (25 + i * 31) +
                '">' +
                esc(formatValue(p.value)) +
                "</text>"),
        )
        .join("") +
      "</svg>"
    );
  } else {
    for (let k = 0; k < 5; k++) {
      const v = min + (range * k) / 4;
      shapes +=
        '<line x1="75" y1="' +
        y(v) +
        '" x2="920" y2="' +
        y(v) +
        '" stroke="#e2e8e0"/><text x="0" y="' +
        (y(v) + 4) +
        '">' +
        esc(Math.round(v).toLocaleString("ko-KR")) +
        "</text>";
    }
    for (let j = 0; j < c.series.length; j++) {
      let segment: string[] = [];
      const flush = () => {
        if (segment.length)
          shapes +=
            '<polyline points="' +
            segment.join(" ") +
            '" fill="none" stroke="#' +
            colors[j] +
            '" stroke-width="3"/>';
        segment = [];
      };
      pts.forEach((p, i) => {
        const v = j === 0 ? p.value : (p.value2 ?? null);
        if (v === null) {
          flush();
          return;
        }
        if (card.type === "line") {
          segment.push(x(i) + "," + y(v));
          shapes +=
            '<circle cx="' +
            x(i) +
            '" cy="' +
            y(v) +
            '" r="4" fill="#' +
            colors[j] +
            '"/>';
        } else {
          const width = Math.min(28, 720 / pts.length / c.series.length);
          shapes +=
            '<rect x="' +
            (x(i) + j * width - (width * c.series.length) / 2) +
            '" y="' +
            Math.min(y(v), y(0)) +
            '" width="' +
            (width - 2) +
            '" height="' +
            Math.max(1, Math.abs(y(v) - y(0))) +
            '" fill="#' +
            colors[j] +
            '"/>';
        }
      });
      flush();
    }
    pts.forEach((p, i) => {
      if (i % Math.ceil(pts.length / 10) === 0 || i === pts.length - 1)
        shapes +=
          '<text text-anchor="middle" x="' +
          x(i) +
          '" y="282">' +
          esc(p.label) +
          "</text>";
    });
  }
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
    W +
    " " +
    H +
    '" role="img">' +
    shapes +
    "</svg>"
  );
}
export function pdfHtml(w: Workspace, r = aggregate(w)): string {
  const colors = palette[w.design.theme];
  const table = (headers: string[], rows: string[][]) =>
    "<table><thead><tr>" +
    headers.map((h) => "<th>" + esc(h) + "</th>").join("") +
    "</tr></thead><tbody>" +
    rows
      .map(
        (row) =>
          "<tr>" + row.map((x) => "<td>" + esc(x) + "</td>").join("") + "</tr>",
      )
      .join("") +
    "</tbody></table>";
  const cards = effectiveCards(w, r)
    .filter((c) => c.visible)
    .map((card) => {
      const c = r.charts.find((c) => c.id === card.id)!;
      return groups(c.points, 12)
        .map(
          (points, i) =>
            '<section class="chart"><h2>' +
            esc(card.title) +
            (i ? " (계속)" : "") +
            "</h2><p>" +
            esc(c.unit + " / " + c.series.join(" · ")) +
            "</p>" +
            (card.type === "table"
              ? ""
              : svgChart({ ...c, points }, card, colors)) +
            table(["기간/범주", ...c.series], pointRows({ ...c, points })) +
            '<p class="muted">' +
            esc(c.reason) +
            "</p></section>",
        )
        .join("");
    })
    .join("");
  return (
    '<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>@page{size:A4;margin:16mm 15mm 18mm}*{box-sizing:border-box}body{font-family:"Malgun Gothic","맑은 고딕",sans-serif;font-size:10pt;color:#192c23;line-height:1.6}h1{font-size:26pt;color:#' +
    colors[0] +
    ";margin:8px 0 20px}h2{font-size:16pt;margin-top:24px}p{margin:8px 0}.brand{letter-spacing:3px;font-weight:800;color:#" +
    colors[0] +
    "}.muted{color:#52665b;font-size:9pt}.basis{padding:14px;background:#f1f6eb;border-left:4px solid #" +
    colors[0] +
    ';margin-bottom:18px}.report{white-space:pre-wrap;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9pt}th,td{border:1px solid #d7e2d5;padding:7px;overflow-wrap:anywhere;text-align:left;vertical-align:top}th{background:#edf5e7}thead{display:table-header-group}tr{break-inside:avoid}h2{break-after:avoid}.chart{break-before:page}.chart svg{width:100%;max-height:290px;font:13px "Malgun Gothic",sans-serif}.cover{break-after:page}.report-section{break-before:page}</style></head><body><div class="cover"><div class="brand">HRBIP</div><h1>' +
    esc(w.title) +
    '</h1><div class="basis">' +
    r.basis.map(esc).join("<br>") +
    "</div>" +
    table(
      ["주요 지표", "값", "집계 기준"],
      r.metrics.map((m) => [m.label, formatValue(m.value, m.unit), m.note]),
    ) +
    '<p class="muted">개인정보 원본이 아닌 집계 결과입니다. 규칙 기반 초안을 담당자가 확인·편집한 문서입니다.</p></div><section><h2>보고서 초안 · 담당자 편집</h2><div class="report">' +
    esc(w.report.generated) +
    '</div><h2>담당자 의견</h2><div class="report">' +
    esc(w.report.notes || "작성된 의견 없음") +
    '</div></section><section class="report-section"><h2>집계 기준과 추가 확인</h2>' +
    r.notices.map((n) => "<p>" + esc(n) + "</p>").join("") +
    Object.entries(r.reasons)
      .filter(([, v]) => v)
      .map(([k, v]) => "<p>" + esc(k + ": " + v) + "</p>")
      .join("") +
    "</section>" +
    cards +
    "</body></html>"
  );
}
export async function exportPdf(w: Workspace, r = aggregate(w)) {
  const browser = await launchPdfBrowser();
  try {
    const page = await browser.newPage();
    await page.route("**/*", (route) => route.abort());
    const html = pdfHtml(w, r).replace("</style>", pdfFontCss() + '\nbody{font-family:"Noto Sans KR",sans-serif}.chart svg{font-family:"Noto Sans KR",sans-serif}</style>');
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    return await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate:
        '<div style="font-size:9px;width:100%;text-align:center;color:#52665b">HRBIP · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margin: { bottom: "18mm" },
    });
  } finally {
    await browser.close();
  }
}
export async function exportFile(
  format: string,
  w: Workspace,
  r = aggregate(w),
  shared = false,
) {
  assertExportable(w, r);
  switch (format) {
    case "xlsx":
      return exportExcel(w, r, shared);
    case "pptx":
      return exportPptx(w, r);
    case "pdf":
      return exportPdf(w, r);
    default:
      throw new Error("지원하지 않는 내보내기 형식입니다.");
  }
}
