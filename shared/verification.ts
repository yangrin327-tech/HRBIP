import type { Workspace, Result, Dataset, Role } from "./model";
import { digest, roleNames } from "./model";
import { parseDate, months, monthEnd, priorMonth } from "./import";

export type CheckStatus = "pass" | "attention" | "fail" | "unavailable";
export type CalculationCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  actual: number | null;
  expected: number | null;
  difference: number | null;
  unit: string;
  method: string;
  detail: string;
  tolerance: number;
};
export type Verification = {
  key: string;
  checkedAt: string;
  blocked: boolean;
  counts: Record<CheckStatus, number>;
  checks: CalculationCheck[];
  basis: string[];
  sources: { name: string; role: string; rows: number; state: string }[];
  limitation: string;
};
export const statusNames: Record<CheckStatus, string> = {
  pass: "통과",
  attention: "확인 필요",
  fail: "불일치",
  unavailable: "검증 불가",
};
export function sharedVerification(v: Verification): Verification {
  const checks = v.checks.filter((c) => !c.id.startsWith("source:")),
    counts = { pass: 0, attention: 0, fail: 0, unavailable: 0 };
  checks.forEach((c) => counts[c.status]++);
  return { ...v, sources: [], checks, counts };
}

// This path deliberately never calls aggregate(), its row selectors, or its sum helper.
// Date parsing is the shared input contract. Counts use an event sweep; amounts use buckets.
export function verifyCalculations(w: Workspace, result: Result): Verification {
  const checks: CalculationCheck[] = [];
  const note = (
    id: string,
    label: string,
    status: CheckStatus,
    detail: string,
  ) =>
    checks.push({
      id,
      label,
      status,
      detail,
      actual: null,
      expected: null,
      difference: null,
      unit: "",
      method: "입력·범위 확인",
      tolerance: 0,
    });
  const compare = (
    id: string,
    label: string,
    actual: number | null,
    expected: number | null,
    unit: string,
    method: string,
    detail = "",
  ) => {
    const tolerance = unit === "시간" || unit === "일" ? 0.000001 : 0;
    const difference =
      actual !== null && expected !== null ? actual - expected : null;
    checks.push({
      id,
      label,
      actual,
      expected,
      difference,
      unit,
      method,
      detail,
      tolerance,
      status:
        actual === null && expected === null
          ? "unavailable"
          : actual === null ||
              expected === null ||
              !Number.isFinite(difference!) ||
              Math.abs(difference!) > tolerance
            ? "fail"
            : "pass",
    });
  };
  const datasets = w.datasets.filter((d) => !d.excluded);
  const val = (d: Dataset, row: Record<string, string>, key: string) =>
    (row[d.mapping[key]] || "").trim();
  const peopleDs = datasets.filter((d) => d.role === "people");
  const people = peopleDs.flatMap((d) =>
    d.rows.map((row) => ({
      id: val(d, row, "employeeId"),
      start: parseDate(val(d, row, "startDate"), d.dateFormat) || "",
      end: parseDate(val(d, row, "endDate"), d.dateFormat) || "",
      dep: val(d, row, "department"),
      emp: val(d, row, "employmentType"),
      d,
    })),
  );
  const latest = new Map<string, (typeof people)[number]>();
  for (const p of people)
    if (!latest.has(p.id) || p.start >= latest.get(p.id)!.start)
      latest.set(p.id, p);
  const matches = (dep: string, emp: string) =>
    (!w.filters.department || dep === w.filters.department) &&
    (!w.filters.employmentType || emp === w.filters.employmentType);
  const selectedPeople = people.filter((p) =>
    matches(latest.get(p.id)!.dep, latest.get(p.id)!.emp),
  );
  const history =
    peopleDs.length > 0 && peopleDs.every((d) => d.mode === "history");
  const covered = (day: string) =>
    history &&
    peopleDs.every((d) => d.coverageStart <= day && day <= d.coverageEnd);
  const nextDay = (s: string) =>
    new Date(Date.parse(s + "T00:00:00Z") + 86400000)
      .toISOString()
      .slice(0, 10);
  const activeIds = (day: string): Set<string> | null => {
    if (!result.available.people) return null;
    if (peopleDs.every((d) => d.mode === "current" && d.asOf === day))
      return new Set(selectedPeople.map((p) => p.id));
    if (!covered(day)) return null;
    const changes: { day: string; id: string; delta: number }[] = [];
    for (const p of selectedPeople) {
      changes.push({ day: p.start, id: p.id, delta: 1 });
      if (p.end)
        changes.push({
          day: w.exitInclusive ? nextDay(p.end) : p.end,
          id: p.id,
          delta: -1,
        });
    }
    const balances = new Map<string, number>();
    for (const c of changes.sort((a, b) => a.day.localeCompare(b.day))) {
      if (c.day > day) break;
      balances.set(c.id, (balances.get(c.id) || 0) + c.delta);
    }
    return new Set([...balances].filter(([, v]) => v > 0).map(([id]) => id));
  };
  const hc = (m: string) => activeIds(monthEnd(m))?.size ?? null;
  const event = (m: string, field: "start" | "end") =>
    result.available.people && covered(m + "-01") && covered(monthEnd(m))
      ? new Set(
          selectedPeople
            .filter((p) => p[field] >= m + "-01" && p[field] <= monthEnd(m))
            .map((p) => p.id),
        ).size
      : null;
  const lastMonth = months(w.filters.from, w.filters.to)
    .filter((m) => hc(m) !== null)
    .at(-1);
  const expected = new Map<string, number | null>([
    ["headcount", hc(w.filters.to)],
    ["hired", event(w.filters.to, "start")],
    ["left", event(w.filters.to, "end")],
    [
      "delta",
      hc(w.filters.to) === null || hc(priorMonth(w.filters.to)) === null
        ? null
        : hc(w.filters.to)! - hc(priorMonth(w.filters.to))!,
    ],
    ["lastObservedHeadcount", lastMonth ? hc(lastMonth) : null],
  ]);
  type Fact = {
    month: string;
    category: string;
    metric: string;
    amount: number;
    department: string;
  };
  const facts: Fact[] = [];
  for (const d of datasets.filter(
    (d) => d.role !== "people" && result.available[d.role],
  )) {
    for (const row of d.rows) {
      const p = latest.get(val(d, row, "employeeId"));
      const department = val(d, row, "department") || p?.dep || "";
      const employment = val(d, row, "employmentType") || p?.emp || "";
      const date = parseDate(val(d, row, "date"), d.dateFormat);
      if (
        !date ||
        date.slice(0, 7) < w.filters.from ||
        date.slice(0, 7) > w.filters.to ||
        !matches(department, employment)
      )
        continue;
      const category = val(d, row, "category");
      const meaning = d.categoryMap[category];
      const metric =
        d.role === "payroll"
          ? "payTrend"
          : meaning === "work"
            ? "workHours"
            : meaning === "overtime"
              ? "overtime"
              : meaning === "leave"
                ? d.unit === "days"
                  ? "leaveDays"
                  : "leaveHours"
                : "";
      if (!metric) continue;
      const scale =
        d.role === "payroll"
          ? d.unit === "tenThousand"
            ? 10000
            : d.unit === "thousand"
              ? 1000
              : 1
          : 1;
      facts.push({
        month: date.slice(0, 7),
        category,
        department,
        metric,
        amount: Number(val(d, row, "value").replaceAll(",", "")) * scale,
      });
    }
  }
  const total = (rows: Fact[], money: boolean) => {
    if (!rows.length) return null;
    if (money) return Number(rows.reduce((n, f) => n + BigInt(f.amount), 0n));
    // Sort by magnitude and compensated summation, unlike the production row-order reduce.
    let sum = 0,
      correction = 0;
    for (const f of [...rows].sort(
      (a, b) => Math.abs(a.amount) - Math.abs(b.amount),
    )) {
      const y = f.amount - correction,
        t = sum + y;
      correction = t - sum - y;
      sum = t;
    }
    return Math.round(sum * 1000) / 1000;
  };
  for (const id of [
    "workHours",
    "overtime",
    "leaveHours",
    "leaveDays",
    "payTrend",
  ])
    expected.set(
      id,
      total(
        facts.filter((f) => f.metric === id),
        id === "payTrend",
      ),
    );
  for (const m of result.metrics)
    compare(
      "metric:" + m.id,
      m.label,
      m.value,
      expected.get(m.id) ?? null,
      m.unit,
      m.unit === "명"
        ? "원자료 입·퇴사 이벤트 재구성 / 사번 중복 제거"
        : "원자료 별도 합산 / 금액 정수·시간 보정 합산",
      m.note,
    );
  for (const c of result.charts) {
    for (const p of c.points) {
      let value: number | null = null;
      if (c.id === "headcount") value = hc(p.label);
      else if (c.id === "movement") value = event(p.label, "start");
      else if (c.id === "department") {
        const ids = lastMonth ? activeIds(monthEnd(lastMonth)) : null;
        value = ids
          ? [...ids].filter(
              (id) => (latest.get(id)?.dep || "부서 미입력") === p.label,
            ).length
          : null;
      } else
        value = total(
          facts.filter((f) =>
            c.id === "payItems"
              ? f.metric === "payTrend" && f.category === p.label
              : f.metric === c.id && f.month === p.label,
          ),
          c.unit === "원",
        );
      compare(
        "chart:" + c.id + ":" + p.label,
        c.title + " · " + p.label,
        p.value,
        value,
        c.unit,
        "원자료를 기간/범주별로 별도 집계",
      );
      if (c.id === "movement")
        compare(
          "chart:left:" + p.label,
          "퇴사 · " + p.label,
          p.value2 ?? null,
          event(p.label, "end"),
          "명",
          "퇴사일의 월과 유일 사번 대조",
        );
    }
  }
  for (const role of ["people", "attendance", "payroll"] as Role[])
    if (!result.available[role])
      note(
        "scope:" + role,
        roleNames[role],
        "unavailable",
        result.reasons[role],
      );
  for (const d of w.datasets) {
    const issues = result.issues.filter((i) => i.datasetId === d.id);
    note(
      "source:" + d.id,
      d.name,
      d.excluded || issues.length ? "attention" : "pass",
      d.excluded
        ? "사용자 선택으로 분석 보류"
        : issues.length
          ? issues
              .map((i) => (i.row ? i.row + "행: " : "") + i.message)
              .slice(0, 8)
              .join(" / ")
          : d.rows.length + "행 · 입력 검증에서 오류·경고 없음",
    );
  }
  if (w.report.basisKey !== result.key)
    note(
      "report",
      "보고 문장 기준",
      "attention",
      "이전 기준의 문장입니다. 새 초안으로 갱신하거나 직접 확인하세요.",
    );
  note(
    "opinion",
    "사용자 편집 문장·원자료 사실성",
    "attention",
    "자유롭게 작성한 문장의 수치·원인과 원자료의 사실성은 자동 검증하지 않습니다. 구조화된 지표·차트는 위 결과를 사용합니다.",
  );
  const counts = { pass: 0, attention: 0, fail: 0, unavailable: 0 };
  for (const c of checks) counts[c.status]++;
  return {
    key: digest({ data: result.key, report: w.report, checks }),
    checkedAt: new Date().toISOString(),
    blocked: counts.fail > 0,
    counts,
    checks,
    basis: result.basis,
    sources: w.datasets.map((d) => ({
      name: d.name,
      role: roleNames[d.role],
      rows: d.rows.length,
      state: d.excluded
        ? "보류"
        : result.available[d.role]
          ? "분석 대상"
          : "계산 불가",
    })),
    limitation:
      "독립 재집계와 대조한 결과입니다. 날짜 해석은 공통 입력 규칙을 사용합니다. 원자료의 사실성·항목 의미·자유 문장의 정확성을 보증하지 않습니다.",
  };
}
