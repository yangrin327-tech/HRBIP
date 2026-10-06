import { z } from "zod";
import type { Result, Workspace } from "./model";
export const bindingSchema = z.object({
  slot: z.string().max(200),
  field: z.string().max(100),
});
export type Binding = z.infer<typeof bindingSchema>;
export type FormatSlot = {
  id: string;
  page: string;
  label: string;
  kind: "text" | "table" | "chart" | "image";
  sample: string;
  suggestion: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  font?: string;
  size?: number;
  color?: string;
  cell?: { parent: string; row: number; column: number };
};
export type FormatInspection = {
  format: "pptx" | "xlsx";
  slots: FormatSlot[];
  warnings: string[];
  fonts: string[];
  brand: { font: string; color: string };
  pages: { id: string; label: string; width: number; height: number }[];
};
export type CompanyFormat = {
  id: string;
  title: string;
  format: "pptx" | "xlsx";
  version: number;
  created: string;
  inspection: FormatInspection;
  bindings: Binding[];
  brand: { font: string; color: string };
};
export const formatFields = [
  ["title", "보고서 제목"],
  ["period", "보고 기간"],
  ["filters", "적용 필터"],
  ["summary", "현황 요약"],
  ["opinion", "담당자 의견"],
  ["basis", "집계 기준"],
  ["metric:headcount", "월말 인원"],
  ["metric:hired", "입사 인원"],
  ["metric:left", "퇴사 인원"],
  ["metric:delta", "전월 대비 인원 변화"],
  ["metric:lastObservedHeadcount", "마지막 확인 인원"],
  ["metric:workHours", "근무시간 합계"],
  ["metric:overtime", "연장근무 합계"],
  ["metric:leaveHours", "휴가 사용 시간"],
  ["metric:leaveDays", "휴가 사용 일수"],
  ["metric:payTrend", "제공 지급액 합계"],
  ["table:metrics", "주요 지표 표"],
  ["chart:headcount", "월별 재직 인원"],
  ["chart:department", "부서별 인원"],
  ["chart:movement", "입사·퇴사 추이"],
  ["chart:workHours", "근무시간 추이"],
  ["chart:overtime", "연장근무 추이"],
  ["chart:leaveHours", "휴가 시간 추이"],
  ["chart:leaveDays", "휴가 일수 추이"],
  ["chart:payTrend", "지급액 추이"],
  ["chart:payItems", "지급 항목별 금액"],
] as const;
export function suggestField(text: string, kind: string): string {
  const token = text.match(/\{\{\s*([\w:]+)\s*\}\}/)?.[1];
  if (
    kind === "table" &&
    token &&
    !token.startsWith("chart:") &&
    token !== "table:metrics"
  )
    return "";
  if (
    token &&
    formatFields.some(([f]) => f === token) &&
    (kind === "chart"
      ? token.startsWith("chart:")
      : kind === "table"
        ? token.startsWith("chart:") || token === "table:metrics"
        : true)
  )
    return token;
  const s = text.replaceAll(/\s/g, "");
  const matches: [RegExp, string][] =
    kind === "chart" || kind === "table"
      ? [
          [/입사.*퇴사/, "chart:movement"],
          [/부서.*인원/, "chart:department"],
          [/재직|인원추이/, "chart:headcount"],
          [/근무시간/, "chart:workHours"],
          [/연장/, "chart:overtime"],
          [/지급|인건비/, "chart:payTrend"],
          [/주요지표/, "table:metrics"],
        ]
      : [
          [/보고기간/, "period"],
          [/보고서제목/, "title"],
          [/담당자.*의견/, "opinion"],
          [/현황요약/, "summary"],
          [/집계기준/, "basis"],
        ];
  const found = matches.filter(([re]) => re.test(s));
  return found.length === 1 ? found[0][1] : "";
}
export function fieldValue(
  field: string,
  w: Workspace,
  r: Result,
): string | number {
  if (field === "title") return w.title;
  if (field === "period") return `${w.filters.from} ~ ${w.filters.to}`;
  if (field === "filters")
    return `부서: ${w.filters.department || "전체"} / 고용형태: ${w.filters.employmentType || "전체"}`;
  if (field === "summary") return w.report.generated;
  if (field === "opinion") return w.report.notes;
  if (field === "basis") return r.basis.join("\n");
  if (field.startsWith("metric:")) {
    const m = r.metrics.find((m) => m.id === field.slice(7));
    return m?.value ?? "자료 없음 / 계산 불가";
  }
  return "";
}
