import { audit, emptyWorkspace, type Dataset, type Workspace } from "./model";

// A reuse plan contains definitions only. No rows, people, report text or old periods.
export type ReuseRule = Pick<
  Dataset,
  | "name"
  | "role"
  | "mapping"
  | "dateFormat"
  | "unit"
  | "grain"
  | "mode"
  | "categoryMap"
>;
export type ReusePlan = { sourceTitle: string; rules: ReuseRule[] };
export function prepareRepeat(source: Workspace): {
  workspace: Workspace;
  plan: ReusePlan;
} {
  const workspace = emptyWorkspace();
  const [year, month] = source.filters.to.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);
  workspace.title = next + " 인사현황 보고서";
  workspace.filters = {
    from: next,
    to: next,
    department: "",
    employmentType: "",
  };
  workspace.exitInclusive = source.exitInclusive;
  workspace.design = structuredClone(source.design);
  workspace.companyFormats = structuredClone(source.companyFormats);
  audit(
    workspace,
    "새 자료 반복 보고 시작. 이전 행·보고 문장·필터·확인 상태·원본 보관 선택은 가져오지 않음.",
  );
  return {
    workspace,
    plan: {
      sourceTitle: source.title,
      rules: source.datasets
        .filter((d) => !d.excluded && d.confirmed)
        .map((d) => ({
          name: d.name,
          role: d.role,
          mapping: structuredClone(d.mapping),
          dateFormat: d.dateFormat,
          unit: d.unit,
          grain: d.grain,
          mode: d.mode,
          categoryMap: structuredClone(d.categoryMap),
        })),
    },
  };
}
export function missingColumns(d: Dataset, rule: ReuseRule): string[] {
  return [
    ...new Set(
      Object.values(rule.mapping).filter((h) => h && !d.headers.includes(h)),
    ),
  ];
}
export function suggestedRule(d: Dataset, rules: ReuseRule[]): number {
  const compatible = rules
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => !missingColumns(d, r).length);
  // Match a sheet/expanded column name when filenames change; never guess between ambiguous sources.
  const suffix = (name: string) =>
    name.includes(" / ") ? name.split(" / ").slice(1).join(" / ") : name;
  const named = compatible.filter(({ r }) => suffix(r.name) === suffix(d.name));
  return named.length === 1
    ? named[0].i
    : compatible.length === 1
      ? compatible[0].i
      : -1;
}
export function applyReuseRule(d: Dataset, rule?: ReuseRule): Dataset {
  const next = structuredClone(d);
  next.confirmed = false;
  next.excluded = false;
  if (!rule) return next;
  Object.assign(next, {
    role: rule.role,
    dateFormat: rule.dateFormat,
    unit: rule.unit,
    grain: rule.grain,
    mode: rule.mode,
    mapping: Object.fromEntries(
      Object.entries(rule.mapping).filter(
        ([, h]) => h && next.headers.includes(h),
      ),
    ),
    categoryMap: structuredClone(rule.categoryMap),
  });
  // coverage/asOf come only from the NEW file (or remain blank); an old assertion is never copied.
  return next;
}
