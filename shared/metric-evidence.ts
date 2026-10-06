import {
  fields,
  type Workspace,
  type Result,
  type Field,
  type Role,
  type Dataset,
} from "./model";
import { monthEnd, priorMonth, parseDate } from "./import";

export function datasetRange(d: Dataset): string {
  if (d.role === "people")
    return d.mode === "history"
      ? `확인된 이력: ${d.coverageStart || "미확인"} ~ ${d.coverageEnd || "미확인"}`
      : `명단 기준일: ${d.asOf || "미확인"}`;
  const dates = d.rows
    .map((row) => parseDate(row[d.mapping.date], d.dateFormat))
    .filter((s): s is string => !!s)
    .sort();
  return dates.length
    ? `파일의 날짜 범위: ${dates[0]} ~ ${dates.at(-1)} (중간 누락 가능)`
    : "날짜 범위 확인 불가";
}

export function metricEvidence(w: Workspace, r: Result, id: string) {
  const metric = r.metrics.find((m) => m.id === id)!;
  const role: Role = [
    "workHours",
    "overtime",
    "leaveHours",
    "leaveDays",
  ].includes(id)
    ? "attendance"
    : id === "payTrend"
      ? "payroll"
      : "people";
  const definitions: Record<string, string> = {
    headcount:
      "기준일에 재직 조건을 충족하는 사번을 중복 없이 셉니다. 현재 명단은 명단 기준일과 일치할 때만 계산합니다.",
    lastObservedHeadcount:
      "요청 기간 중 계산 가능한 마지막 월말의 유일 사번 수입니다. 요청 종료월의 값으로 대신 사용하지 않습니다.",
    hired:
      "보고 종료월에 입사일이 있는 유일 사번 수입니다. 월 전체 이력이 확인되어야 하며 같은 달 재입사도 동일 사번은 한 명으로 셉니다.",
    left: "보고 종료월에 퇴사일이 있는 유일 사번 수입니다. 월 전체 이력이 확인되어야 합니다. 재직 포함 여부와 퇴사 이벤트 월은 구분합니다.",
    delta:
      "보고 종료월 말 재직 인원 − 직전 월말 재직 인원. 두 시점 모두 확인되어야 하며 입사−퇴사로 대체하지 않습니다.",
    workHours:
      "선택 기간·대상에서 ‘근무’로 연결하고 시간 단위를 확인한 제공 수치를 합산합니다. 연장근무 포함 여부는 원자료 정의에 따릅니다.",
    overtime:
      "선택 기간·대상에서 ‘연장’으로 연결하고 시간 단위를 확인한 제공 수치를 합산합니다.",
    leaveHours:
      "‘휴가’로 연결한 시간 단위 수치만 합산합니다. 일 단위와 합치거나 환산하지 않습니다.",
    leaveDays:
      "‘휴가’로 연결한 일 단위 수치만 합산합니다. 시간 단위와 합치거나 환산하지 않습니다.",
    payTrend:
      "선택 기간·대상의 제공 지급 항목을 합산합니다. 천 원은 ×1,000, 만 원은 ×10,000으로 원 단위 환산합니다. 미제공 항목·세금·수당을 새로 산정하지 않습니다.",
  };
  const meaning =
    id === "workHours" ? "work" : id === "overtime" ? "overtime" : "leave";
  const sources = w.datasets
    .filter((d) => !d.excluded && d.role === role)
    .filter(
      (d) =>
        role !== "attendance" ||
        (d.unit === (id === "leaveDays" ? "days" : "hours") &&
          Object.values(d.categoryMap).includes(meaning)),
    );
  return {
    metric,
    role,
    formula: definitions[id] || metric.note,
    period:
      id === "headcount"
        ? monthEnd(w.filters.to)
        : id === "delta"
          ? monthEnd(priorMonth(w.filters.to)) + " → " + monthEnd(w.filters.to)
          : ["hired", "left"].includes(id)
            ? w.filters.to
            : id === "lastObservedHeadcount"
              ? metric.label
              : w.filters.from + " ~ " + w.filters.to,
    limitation:
      metric.value === null
        ? !r.available[role]
          ? r.reasons[role]
          : role === "people"
            ? "이력 범위·명단 기준일 또는 비교에 필요한 시점을 확인할 수 없어 계산하지 않았습니다."
            : "선택한 기간·대상·항목·단위에 해당하는 자료가 없습니다."
        : metric.note,
    sources: sources.map((d) => {
      return {
        name: d.name,
        columns: Object.entries(d.mapping)
          .filter(([key, value]) => value && key in fields)
          .map(([key, value]) => `${fields[key as Field]} ← ${value}`)
          .join(" / "),
        range: datasetRange(d),
        unit:
          d.role === "people"
            ? "유일 사번 · 명"
            : {
                hours: "시간",
                days: "일",
                won: "원",
                thousand: "천 원",
                tenThousand: "만 원",
              }[d.unit],
      };
    }),
  };
}
