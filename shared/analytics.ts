import {
  type Workspace,
  type Dataset,
  type Issue,
  type Role,
  type Result,
  type Chart,
  type Metric,
  type Point,
  digest,
  roleNames,
} from "./model";
import {
  read,
  requiredFields,
  parseDate,
  numeric,
  monthEnd,
  priorMonth,
  months,
} from "./import";

type Person = {
  id: string;
  start: string;
  end: string;
  department: string;
  employmentType: string;
  source: Dataset;
  row: number;
};
const unique = (a: string[]) =>
  [...new Set(a)].sort((a, b) => a.localeCompare(b, "ko"));
function peopleRows(ds: Dataset[]): Person[] {
  return ds
    .filter((d) => d.role === "people" && !d.excluded)
    .flatMap((d) =>
      d.rows.map((r, i) => ({
        id: read(d, r, "employeeId"),
        start: parseDate(read(d, r, "startDate"), d.dateFormat) || "",
        end: parseDate(read(d, r, "endDate"), d.dateFormat) || "",
        department: read(d, r, "department"),
        employmentType: read(d, r, "employmentType"),
        source: d,
        row: i + 2,
      })),
    );
}
export function validate(w: Workspace): Issue[] {
  const issues: Issue[] = [];
  const keys = new Map<string, { d: Dataset; row: number }>();
  let count = 0;
  const push = (
    d: Dataset,
    code: string,
    message: string,
    field?: string,
    row?: number,
    severity: Issue["severity"] = "error",
  ) =>
    issues.push({
      datasetId: d.id,
      code,
      message,
      field,
      row,
      severity,
      impact:
        roleNames[d.role] +
        " 집계 " +
        (severity === "error" ? "중단" : "확인 필요"),
    });
  const active = w.datasets.filter((d) => !d.excluded);
  const ids = new Set<string>();
  for (const d of active) {
    count += d.rows.length;
    if (ids.has(d.id))
      push(d, "dataset_id", "표 ID가 중복됩니다. 파일을 다시 선택하세요.");
    ids.add(d.id);
    if (!d.confirmed)
      push(d, "confirmation", "항목 연결·행 의미·단위를 확인해 주세요.");
    if (!d.rows.length) push(d, "empty", "선택한 표에 데이터가 없습니다.");
    if (d.headers.length !== new Set(d.headers).size)
      push(d, "headers", "헤더 이름이 중복되어 구분할 수 없습니다.");
    for (const f of requiredFields(d))
      if (!d.mapping[f] || !d.headers.includes(d.mapping[f]))
        push(d, "mapping", "필수 항목을 연결하세요.", f);
    const mapped = Object.values(d.mapping).filter(Boolean);
    if (mapped.length !== new Set(mapped).size)
      push(
        d,
        "mapping_duplicate",
        "하나의 열을 여러 표준 항목에 연결할 수 없습니다.",
      );
    if (d.role === "people") {
      if (
        d.mode === "history" &&
        (!parseDate(d.coverageStart, "ymd") ||
          !parseDate(d.coverageEnd, "ymd") ||
          d.coverageStart > d.coverageEnd)
      )
        push(
          d,
          "coverage",
          "퇴사자를 포함한 완전 이력의 시작일과 종료일을 확인하세요.",
        );
      if (d.mode === "current" && !parseDate(d.asOf, "ymd"))
        push(d, "asof", "현재 명단의 기준일을 선택하세요.");
    }
    if (
      d.role === "payroll" &&
      !["won", "thousand", "tenThousand"].includes(d.unit)
    )
      push(d, "unit", "금액 단위를 원/천원/만원 중에서 확인하세요.");
    if (d.role === "attendance" && !["days", "hours"].includes(d.unit))
      push(d, "unit", "시간 또는 일 단위를 확인하세요.");
    d.rows.forEach((r, i) => {
      const row = i + 2,
        id = read(d, r, "employeeId");
      if (!id)
        push(d, "id_missing", "사번이 비어 있습니다.", "employeeId", row);
      if (d.role === "people") {
        const start = parseDate(read(d, r, "startDate"), d.dateFormat),
          end = parseDate(read(d, r, "endDate"), d.dateFormat);
        if (d.mode === "history" && !start)
          push(d, "date", "입사일을 해석할 수 없습니다.", "startDate", row);
        if (read(d, r, "endDate") && !end)
          push(d, "date", "퇴사일을 해석할 수 없습니다.", "endDate", row);
        if (start && end && end < start)
          push(
            d,
            "dates_order",
            "퇴사일이 입사일보다 앞섭니다.",
            "endDate",
            row,
          );
      } else {
        const dt = parseDate(read(d, r, "date"), d.dateFormat),
          cat = read(d, r, "category"),
          value = numeric(read(d, r, "value"));
        if (!dt) push(d, "date", "기준일을 해석할 수 없습니다.", "date", row);
        if (!cat) push(d, "category", "항목이 비어 있습니다.", "category", row);
        if (value === null)
          push(
            d,
            "number",
            "숫자로 해석할 수 없습니다. 단위 문자는 분리해 주세요.",
            "value",
            row,
          );
        if (d.role === "attendance" && value !== null && value < 0)
          push(d, "negative", "근태 값은 0 이상이어야 합니다.", "value", row);
        if (d.role === "attendance" && !d.categoryMap[cat])
          push(
            d,
            "category_map",
            "근태 항목의 의미를 연결하세요.",
            "category",
            row,
          );
        if (
          d.role === "attendance" &&
          d.unit === "days" &&
          d.categoryMap[cat] &&
          ["work", "overtime"].includes(d.categoryMap[cat])
        )
          push(
            d,
            "unit",
            "근무/연장근무는 시간 자료가 필요합니다. 일 단위는 휴가만 지원합니다.",
            "value",
            row,
          );
        const scaled =
          value === null
            ? 0
            : value *
              (d.unit === "thousand"
                ? 1000
                : d.unit === "tenThousand"
                  ? 10000
                  : 1);
        if (
          d.role === "payroll" &&
          value !== null &&
          !Number.isSafeInteger(scaled)
        )
          push(
            d,
            "money_precision",
            "원 환산 금액은 안전한 정수여야 합니다.",
            "value",
            row,
          );
        const record =
          d.grain === "id" ? read(d, r, "recordId") : [id, dt, cat].join("|");
        if (d.grain === "id" && !record)
          push(d, "record_id", "기록 ID가 필요합니다.", "recordId", row);
        const key = d.role + "|" + record,
          prev = keys.get(key);
        if (record && prev) {
          push(
            d,
            "duplicate",
            "다른 행과 기록 키가 같습니다. 이전 위치: " +
              prev.d.name +
              " " +
              prev.row +
              "행",
            d.grain === "id" ? "recordId" : "employeeId",
            row,
          );
          push(
            prev.d,
            "duplicate",
            "다른 표/행과 기록 키가 같습니다.",
            undefined,
            prev.row,
          );
        } else if (record) keys.set(key, { d, row });
      }
    });
  }
  if (count > 30000)
    issues.push({
      datasetId: "all",
      severity: "error",
      code: "limit",
      message: "전체 30,000행을 초과했습니다.",
      impact: "모든 집계 중단",
    });
  const pp = peopleRows(active),
    byId = new Map<string, Person[]>();
  for (const p of pp) {
    const list = byId.get(p.id) || [];
    list.push(p);
    byId.set(p.id, list);
  }
  for (const list of byId.values()) {
    list.sort((a, b) => a.start.localeCompare(b.start));
    let furthest = list[0];
    for (let j = 1; j < list.length; j++) {
      const b = list[j],
        a = furthest;
      if (
        a.source.mode === "current" ||
        b.source.mode === "current" ||
        !a.end ||
        (w.exitInclusive ? a.end >= b.start : a.end > b.start)
      )
        push(
          b.source,
          "overlap",
          "같은 사번의 재직 구간이 중복되거나 겹칩니다.",
          "employeeId",
          b.row,
        );
      if (a.end && (!b.end || b.end > a.end)) furthest = b;
    }
  }
  if (pp.length)
    for (const d of active.filter((d) => d.role !== "people"))
      d.rows.forEach((r, i) => {
        if (!byId.has(read(d, r, "employeeId")))
          push(
            d,
            "join",
            "인사 명단에서 연결할 사번을 찾지 못했습니다. 명단 누락을 확인하세요.",
            "employeeId",
            i + 2,
          );
      });
  return issues;
}
export function aggregate(w: Workspace): Result {
  const issues = validate(w),
    ds = w.datasets.filter((d) => !d.excluded),
    pp = peopleRows(ds),
    allMonths = months(w.filters.from, w.filters.to);
  const filters = w.filters;
  const available = {} as Record<Role, boolean>,
    reasons = {} as Record<Role, string>;
  const invalidPeriod = allMonths.length === 0;
  for (const role of ["people", "attendance", "payroll"] as Role[]) {
    const sources = ds.filter((d) => d.role === role),
      errors = issues.filter(
        (i) =>
          i.severity === "error" &&
          (i.datasetId === "all" || sources.some((d) => d.id === i.datasetId)),
      );
    available[role] =
      sources.length > 0 &&
      errors.length === 0 &&
      !invalidPeriod &&
      w.basisConfirmed;
    reasons[role] = !sources.length
      ? w.datasets.some((d) => d.role === role && d.excluded)
        ? "사용자가 해당 자료를 보류함"
        : "자료 없음"
      : !w.basisConfirmed
        ? "집계 기준 확인 필요"
        : invalidPeriod
          ? "기간은 올바른 월 순서로 최대 36개월"
          : errors.length
            ? "데이터 확인에서 오류 처리 필요"
            : "";
  }
  if (!available.people && pp.length) {
    for (const r of ["attendance", "payroll"] as Role[])
      if (available[r]) {
        available[r] = false;
        reasons[r] =
          "연결된 인사 자료 오류를 먼저 처리하거나 해당 표를 보류하세요.";
      }
  }
  const current = new Map<string, Person>();
  pp.slice()
    .sort((a, b) => a.start.localeCompare(b.start))
    .forEach((p) => current.set(p.id, p));
  const departments = unique(
    [
      ...pp.map((p) => p.department),
      ...ds
        .filter((d) => d.role !== "people")
        .flatMap((d) => d.rows.map((r) => read(d, r, "department"))),
    ].filter(Boolean),
  );
  const employmentTypes = unique(
    [
      ...pp.map((p) => p.employmentType),
      ...ds
        .filter((d) => d.role !== "people")
        .flatMap((d) => d.rows.map((r) => read(d, r, "employmentType"))),
    ].filter(Boolean),
  );
  const matches = (dep: string, emp: string) =>
    (!filters.department || dep === filters.department) &&
    (!filters.employmentType || emp === filters.employmentType);
  const personMatches = (p: Person) => {
    const latest = current.get(p.id)!;
    return matches(latest.department, latest.employmentType);
  };
  const peopleSources = ds.filter((d) => d.role === "people");
  const history =
    peopleSources.length > 0 &&
    peopleSources.every((d) => d.mode === "history");
  const covered = (date: string) =>
    history &&
    peopleSources.every(
      (d) => d.coverageStart <= date && d.coverageEnd >= date,
    );
  const fullMonth = (m: string) => covered(m + "-01") && covered(monthEnd(m));
  const onDate = (date: string) =>
    pp.filter(
      (p) =>
        personMatches(p) &&
        (p.source.mode === "current"
          ? p.source.asOf === date
          : p.start <= date &&
            (!p.end || (w.exitInclusive ? p.end >= date : p.end > date))),
    );
  const count = (date: string): number | null =>
    !available.people
      ? null
      : covered(date)
        ? new Set(onDate(date).map((p) => p.id)).size
        : peopleSources.every((d) => d.mode === "current" && d.asOf === date)
          ? new Set(onDate(date).map((p) => p.id)).size
          : null;
  const latest = monthEnd(filters.to),
    now = count(latest),
    prev = count(monthEnd(priorMonth(filters.to)));
  const event = (m: string, key: "start" | "end"): number | null =>
    available.people && fullMonth(m)
      ? new Set(
          pp
            .filter((p) => personMatches(p) && p[key].slice(0, 7) === m)
            .map((p) => p.id),
        ).size
      : null;
  const metrics: Metric[] = [
    {
      id: "headcount",
      label: filters.to + " 월말 인원",
      value: now,
      unit: "명",
      note: "말일 기준 유일 사번",
    },
    {
      id: "hired",
      label: filters.to + " 입사",
      value: event(filters.to, "start"),
      unit: "명",
      note: "해당월 입사한 유일 사번",
    },
    {
      id: "left",
      label: filters.to + " 퇴사",
      value: event(filters.to, "end"),
      unit: "명",
      note: "해당월 퇴사한 유일 사번",
    },
    {
      id: "delta",
      label: "전월 대비 인원 변화",
      value: now === null || prev === null ? null : now - prev,
      unit: "명",
      note: "당월 말 인원 − 전월 말 인원",
    },
  ];
  const charts: Chart[] = [];
  const trend = allMonths.map((label) => ({
    label,
    value: count(monthEnd(label)),
  }));
  if (available.people && trend.some((p) => p.value !== null)) {
    charts.push({
      id: "headcount",
      title: "월별 재직 인원",
      unit: "명",
      series: ["재직 인원"],
      points: trend,
      recommended:
        trend.filter((p) => p.value !== null).length > 1 ? "line" : "bar",
      allowed: ["line", "bar", "table"],
      reason:
        trend.filter((p) => p.value !== null).length > 1
          ? "시간에 따른 인원 변화를 비교하기 쉽도록 선그래프로 구성했어요."
          : "확인 가능한 시점이 하나여서 막대그래프로 현재 값을 보여드려요.",
      filter: "month",
    });
    if (now !== null) {
      const groups = new Map<string, Set<string>>();
      for (const p of onDate(latest)) {
        const dep = current.get(p.id)?.department || "부서 미입력";
        if (!groups.has(dep)) groups.set(dep, new Set());
        groups.get(dep)!.add(p.id);
      }
      charts.push({
        id: "department",
        title: "기준월 말 부서별 인원",
        unit: "명",
        series: ["재직 인원"],
        points: [...groups]
          .map(([label, ids]) => ({ label, value: ids.size }))
          .sort((a, b) => b.value - a.value),
        recommended: "horizontal",
        allowed: ["horizontal", "bar", "pie", "table"],
        reason:
          "부서 이름을 읽고 인원 규모를 비교하기 쉽게 가로 막대를 추천해요. 부서는 최신 제공 분류 기준이에요.",
        filter: "department",
      });
    }
  }
  if (available.people && allMonths.some(fullMonth))
    charts.push({
      id: "movement",
      title: "월별 입사·퇴사",
      unit: "명",
      series: ["입사", "퇴사"],
      points: allMonths.map((label) => ({
        label,
        value: event(label, "start"),
        value2: event(label, "end"),
      })),
      recommended: "bar",
      allowed: ["bar", "line", "table"],
      reason:
        "같은 달의 입사와 퇴사를 나란히 비교하도록 묶은 막대로 구성했어요.",
      filter: "month",
    });
  const notices: string[] = [];
  if (invalidPeriod) notices.push("기간은 1~36개월로 선택하세요.");
  if (!w.basisConfirmed) notices.push("생성 전에 집계 기준을 확인하세요.");
  if (peopleSources.some((d) => d.mode === "current"))
    notices.push(
      "현재 명단은 기준일 현재만 계산합니다. 과거 인원·입퇴사·추세를 추정하지 않습니다.",
    );
  if (history && trend.some((p) => p.value === null))
    notices.push(
      "완전 이력으로 확인된 기간 밖의 인원 값은 계산하지 않았습니다.",
    );
  if (pp.length)
    notices.push(
      "부서·고용형태는 최신 제공 분류입니다. 과거 조직 이력을 뜻하지 않습니다.",
    );
  let eventRowsCount = 0;
  for (const role of ["attendance", "payroll"] as const) {
    if (!available[role]) continue;
    const sources = ds.filter((d) => d.role === role);
    type Fact = {
      month: string;
      category: string;
      value: number;
      unit: string;
      meaning: string;
    };
    const facts: Fact[] = [];
    for (const d of sources)
      for (const r of d.rows) {
        const id = read(d, r, "employeeId"),
          p = current.get(id),
          dep = read(d, r, "department") || p?.department || "",
          emp = read(d, r, "employmentType") || p?.employmentType || "";
        const month = parseDate(read(d, r, "date"), d.dateFormat)!.slice(0, 7);
        if (month < filters.from || month > filters.to || !matches(dep, emp))
          continue;
        const value = numeric(read(d, r, "value"))!,
          category = read(d, r, "category"),
          meaning = d.categoryMap[category] || "";
        if (role === "attendance" && meaning === "ignore") continue;
        facts.push({
          month,
          category,
          value:
            role === "payroll"
              ? value *
                (d.unit === "thousand"
                  ? 1000
                  : d.unit === "tenThousand"
                    ? 10000
                    : 1)
              : value,
          unit: d.unit,
          meaning,
        });
      }
    eventRowsCount += facts.length;
    const sum = (a: Fact[]) =>
      a.length
        ? Math.round(a.reduce((n, f) => n + f.value, 0) * 1000) / 1000
        : null;
    const add = (id: string, title: string, unit: string, rows: Fact[]) => {
      const points = allMonths.map((label) => ({
        label,
        value: sum(rows.filter((f) => f.month === label)),
      }));
      metrics.push({
        id,
        label: title,
        value: sum(rows),
        unit,
        note: filters.from + " ~ " + filters.to + " 제공 자료 합계",
      });
      if (rows.length)
        charts.push({
          id,
          title,
          unit,
          series: [title],
          points,
          recommended:
            points.filter((p) => p.value !== null).length > 1 ? "line" : "bar",
          allowed: ["line", "bar", "table"],
          reason:
            "제공된 월별 합계를 비교해요. 자료가 없는 달은 0으로 채우지 않고 빈값으로 표시해요.",
          filter: "month",
        });
    };
    if (role === "attendance") {
      add(
        "workHours",
        "근무시간 합계",
        "시간",
        facts.filter((f) => f.meaning === "work" && f.unit === "hours"),
      );
      add(
        "overtime",
        "연장근무 합계",
        "시간",
        facts.filter((f) => f.meaning === "overtime" && f.unit === "hours"),
      );
      add(
        "leaveHours",
        "휴가 사용 합계",
        "시간",
        facts.filter((f) => f.meaning === "leave" && f.unit === "hours"),
      );
      add(
        "leaveDays",
        "휴가 사용 합계",
        "일",
        facts.filter((f) => f.meaning === "leave" && f.unit === "days"),
      );
    } else {
      const total = sum(facts);
      if (total !== null && !Number.isSafeInteger(total)) {
        available.payroll = false;
        reasons.payroll = "총액이 안전한 정수 범위를 초과함";
        notices.push(reasons.payroll);
        continue;
      }
      add("payTrend", "제공 지급액 합계", "원", facts);
      const categories = unique(facts.map((f) => f.category));
      if (facts.length)
        charts.push({
          id: "payItems",
          title: "지급 항목별 금액",
          unit: "원",
          series: ["제공 지급액"],
          points: categories.map((label) => ({
            label,
            value: sum(facts.filter((f) => f.category === label)),
          })),
          recommended: "horizontal",
          allowed: [
            "horizontal",
            "bar",
            "table",
            ...(facts.every((f) => f.value >= 0) ? ["pie" as const] : []),
          ],
          reason:
            "제공된 지급 항목별 규모를 비교해요. 이 합계가 회사 전체 인건비를 뜻하지는 않아요.",
        });
      notices.push(
        "인건비는 업로드한 지급 항목의 합계입니다. 누락된 급여·보험·복리후생 등을 포함하지 않습니다.",
      );
    }
  }
  for (const d of w.datasets.filter((d) => d.excluded))
    notices.push(d.name + ": 사용자 선택으로 분석 보류.");
  for (const d of ds.filter((d) => d.role === "attendance")) {
    const ignored = Object.entries(d.categoryMap)
      .filter(([, v]) => v === "ignore")
      .map(([k]) => k);
    if (ignored.length)
      notices.push(d.name + ": 집계 제외로 확인한 항목 " + ignored.join(", "));
  }
  const basis = [
    filters.from + " ~ " + filters.to,
    "퇴사일 " +
      (w.exitInclusive
        ? "재직 포함 (마지막 재직일)"
        : "재직 제외 (첫 비재직일)"),
    "부서: " +
      (filters.department || "전체") +
      " / 고용형태: " +
      (filters.employmentType || "전체"),
    "인원: 유일 사번 / 금액: 제공 항목 합계 / 휴가 일·시간 별도",
  ];
  const key = digest({
    datasets: w.datasets.map((d) => {
      const allowed = new Set(Object.values(d.mapping).filter(Boolean));
      return {
        ...d,
        headers: d.headers.filter((h) => allowed.has(h)),
        rows: d.rows.map((row) =>
          Object.fromEntries(
            Object.entries(row).filter(([k]) => allowed.has(k)),
          ),
        ),
      };
    }),
    filters,
    exitInclusive: w.exitInclusive,
    basisConfirmed: w.basisConfirmed,
  });
  return {
    metrics,
    charts,
    notices: unique(notices),
    issues,
    available,
    reasons,
    departments,
    employmentTypes,
    filters,
    basis,
    key,
    empty: (now === 0 && eventRowsCount === 0) || !charts.length,
  };
}
export function formatValue(value: number | null, unit = "") {
  return value === null
    ? "자료 없음 / 계산 불가"
    : value.toLocaleString("ko-KR", { maximumFractionDigits: 3 }) +
        (unit ? " " + unit : "");
}
export function draft(r: Result): string {
  const lines = [
    "주요 현황",
    ...r.metrics
      .filter((m) => m.value !== null)
      .map(
        (m) =>
          m.label + ": " + formatValue(m.value, m.unit) + " (" + m.note + ")",
      ),
  ];
  if (r.metrics.every((m) => m.value === null))
    lines.push("선택한 범위에서 계산 가능한 값이 없습니다.");
  lines.push("", "추가 확인 사항", ...r.notices.map((s) => "• " + s));
  for (const role of ["people", "attendance", "payroll"] as Role[])
    if (!r.available[role])
      lines.push("• " + roleNames[role] + ": " + r.reasons[role]);
  lines.push(
    "• 변동 원인은 데이터만으로 단정할 수 없습니다. 담당자 확인과 설명이 필요합니다.",
  );
  return lines.join("\n");
}
export function recommendedCards(r: Result) {
  return r.charts.map((c) => ({
    id: c.id,
    title: c.title,
    type: c.recommended,
    size: (c.id === "headcount" ? "wide" : "normal") as "wide" | "normal",
    visible: true,
  }));
}
export function effectiveCards(w: Pick<Workspace, "design">, r: Result) {
  return r.charts
    .map((c) => {
      const saved = w.design.cards.find((s) => s.id === c.id);
      return saved
        ? {
            ...saved,
            type: c.allowed.includes(saved.type) ? saved.type : c.recommended,
          }
        : {
            id: c.id,
            title: c.title,
            type: c.recommended,
            size: "normal" as const,
            visible: true,
          };
    })
    .sort((a, b) => {
      const ix = (id: string) => {
        const i = w.design.cards.findIndex((c) => c.id === id);
        return i < 0 ? 99 : i;
      };
      return ix(a.id) - ix(b.id);
    });
}
