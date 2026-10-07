const DAY = 86_400_000;

export function parseCalendarDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("날짜를 모두 입력해 주세요.");
  const date = new Date(value + "T00:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value ||
    value < "1900-01-01" ||
    value > "2100-12-31"
  )
    throw new Error("1900년부터 2100년 사이의 올바른 날짜를 입력해 주세요.");
  return date;
}

function addMonths(date: Date, months: number) {
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), last));
  return target;
}

/** Calendar duration, with month-end anniversaries clamped to the last day. */
export function calendarPeriod(
  startValue: string,
  endValue: string,
  includeEnd: boolean,
) {
  const start = parseCalendarDate(startValue);
  const end = parseCalendarDate(endValue);
  if (end < start) throw new Error("종료일은 시작일과 같거나 늦어야 해요.");
  if (includeEnd) end.setUTCDate(end.getUTCDate() + 1);
  let months =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
    end.getUTCMonth() -
    start.getUTCMonth();
  if (addMonths(start, months) > end) months--;
  return {
    years: Math.floor(months / 12),
    months: months % 12,
    days: Math.round(
      (end.getTime() - addMonths(start, months).getTime()) / DAY,
    ),
    totalDays: Math.round((end.getTime() - start.getTime()) / DAY),
  };
}

export function offsetDate(value: string, offset: string) {
  const date = parseCalendarDate(value);
  if (!/^-?\d+$/.test(offset) || Math.abs(Number(offset)) > 36500)
    throw new Error(
      "이동할 일수는 -36,500부터 36,500 사이의 정수로 입력해 주세요.",
    );
  date.setUTCDate(date.getUTCDate() + Number(offset));
  const result = date.toISOString().slice(0, 10);
  parseCalendarDate(result);
  return result;
}

export type ListEntry = { value: string; lines: number[] };
export function compareLists(left: string, right: string, ignoreCase: boolean) {
  const parse = (raw: string) => {
    if (raw.length > 500_000)
      throw new Error("한 명단은 50만 글자 이하로 나누어 비교해 주세요.");
    const lines = raw.split(/\r\n|\n|\r/);
    if (lines.length > 10_000)
      throw new Error("한 명단은 10,000줄 이하로 나누어 비교해 주세요.");
    const entries = new Map<string, ListEntry>();
    let count = 0;
    lines.forEach((rawValue, index) => {
      const value = rawValue.trim();
      if (!value) return;
      if (value.includes("\t"))
        throw new Error(
          "여러 열이 붙여넣어졌어요. 비교할 한 열만 복사해 주세요.",
        );
      count++;
      const key = ignoreCase ? value.toLowerCase() : value;
      const existing = entries.get(key);
      if (existing) existing.lines.push(index + 1);
      else entries.set(key, { value, lines: [index + 1] });
    });
    return { entries, count };
  };
  const a = parse(left),
    b = parse(right);
  if (!a.count || !b.count)
    throw new Error("두 명단에 비교할 항목을 각각 한 줄 이상 입력해 주세요.");
  return {
    leftCount: a.count,
    rightCount: b.count,
    leftUnique: a.entries.size,
    rightUnique: b.entries.size,
    onlyLeft: [...a.entries]
      .filter(([key]) => !b.entries.has(key))
      .map(([, entry]) => entry),
    onlyRight: [...b.entries]
      .filter(([key]) => !a.entries.has(key))
      .map(([, entry]) => entry),
    common: [...a.entries]
      .filter(([key]) => b.entries.has(key))
      .map(([, entry]) => entry),
    duplicateLeft: [...a.entries.values()].filter(
      (entry) => entry.lines.length > 1,
    ),
    duplicateRight: [...b.entries.values()].filter(
      (entry) => entry.lines.length > 1,
    ),
  };
}

export type ListComparison = ReturnType<typeof compareLists>;
export function comparisonCsv(result: ListComparison) {
  const cell = (value: string) => {
    // Keep pasted spreadsheet formulas inert when the CSV is opened in Excel.
    const safe = /^[\s]*[=+\-@]/.test(value) ? "'" + value : value;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const rows = [["구분", "항목", "원본 줄 번호", "등장 횟수"]];
  for (const [name, entries] of [
    ["A에만 있음", result.onlyLeft],
    ["B에만 있음", result.onlyRight],
    ["공통 (A 기준)", result.common],
    ["A 안의 중복", result.duplicateLeft],
    ["B 안의 중복", result.duplicateRight],
  ] as const) {
    for (const entry of entries)
      rows.push([
        name,
        entry.value,
        entry.lines.join(", "),
        String(entry.lines.length),
      ]);
  }
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}

export type Certificate = {
  kind: "employment" | "career";
  name: string;
  company: string;
  department: string;
  position: string;
  start: string;
  end: string;
  duties: string;
  purpose: string;
  issued: string;
  representative: string;
};
export function certificateLines(data: Certificate) {
  if (!data.name.trim() || !data.company.trim())
    throw new Error("성명과 회사명을 입력해 주세요.");
  const start = parseCalendarDate(data.start),
    issued = parseCalendarDate(data.issued);
  const end = data.kind === "career" ? parseCalendarDate(data.end) : issued;
  if (end < start)
    throw new Error("재직 종료일은 입사일과 같거나 늦어야 해요.");
  if (end > issued)
    throw new Error("작성일은 재직 종료일과 같거나 늦어야 해요.");
  return [
    data.kind === "employment" ? "재직증명서" : "경력증명서",
    "성명: " + data.name.trim(),
    "회사명: " + data.company.trim(),
    ...(data.department.trim() ? ["부서: " + data.department.trim()] : []),
    ...(data.position.trim() ? ["직위: " + data.position.trim()] : []),
    "재직기간: " +
      data.start +
      " ~ " +
      (data.kind === "career" ? data.end : "현재 (" + data.issued + " 기준)"),
    ...(data.duties.trim() ? ["담당업무: " + data.duties.trim()] : []),
    ...(data.purpose.trim() ? ["용도: " + data.purpose.trim()] : []),
    "",
    data.kind === "employment"
      ? "위 사람은 당사에 재직 중임을 증명합니다."
      : "위 사람은 위와 같이 당사에 근무하였음을 증명합니다.",
    "",
    data.issued,
    data.company.trim(),
    "대표자: " + (data.representative.trim() || "________________") + " (인)",
  ];
}
