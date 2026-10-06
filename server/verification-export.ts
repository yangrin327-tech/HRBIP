import ExcelJS from "exceljs";
import {
  verifyCalculations,
  statusNames,
  type Verification,
} from "../shared/verification.js";
import type { Workspace, Result } from "../shared/model.js";
export function addVerificationSheets(wb: ExcelJS.Workbook, v: Verification) {
  const unique = (name: string) => {
    let n = name,
      i = 1;
    while (wb.getWorksheet(n)) n = name + " " + i++;
    return n;
  };
  const summary = wb.addWorksheet(unique("계산 검증 요약"));
  summary.addRows([
    ["계산 검증표", ""],
    ["검증 시각", v.checkedAt],
    ["검증 대상 버전", v.key],
    ["불일치", v.counts.fail],
    ["확인 필요", v.counts.attention],
    ["검증 불가", v.counts.unavailable],
    ...v.basis.map((b) => ["보고 기준", b]),
    ["검증 범위", v.limitation],
    [],
    ["입력 자료", "영역", "행 수", "처리 상태"],
    ...v.sources.map((s) => [s.name, s.role, s.rows, s.state]),
  ]);
  const details = wb.addWorksheet(unique("계산 검증 상세"));
  details.addRows([
    [
      "검증 항목",
      "상태",
      "집계값",
      "대조값",
      "차이",
      "단위",
      "허용 오차",
      "대조 방법",
      "사유·다음 조치",
    ],
    ...v.checks.map((c) => [
      c.label,
      statusNames[c.status],
      c.actual ?? "자료 없음",
      c.expected ?? "자료 없음",
      c.difference ?? "대조 불가",
      c.unit,
      c.tolerance,
      c.method,
      c.detail,
    ]),
  ]);
  for (const sheet of [summary, details]) {
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.columns.forEach((c, i) => {
      c.width = i === 0 ? 36 : i < 7 ? 22 : 55;
    });
    sheet.eachRow((row, i) => {
      row.font = { name: "맑은 고딕", size: 11 };
      row.alignment = { wrapText: true, vertical: "top" };
      row.height = i === 1 ? 28 : 44;
      if (i === 1) {
        row.font = {
          name: "맑은 고딕",
          size: 11,
          bold: true,
          color: { argb: "FFFFFFFF" },
        };
        row.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF166B4C" },
        };
      }
    });
  }
}
export async function exportVerification(w: Workspace, r: Result) {
  const wb = new ExcelJS.Workbook();
  addVerificationSheets(wb, verifyCalculations(w, r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}
