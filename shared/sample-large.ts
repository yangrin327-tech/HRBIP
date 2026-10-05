import data from "./samples/synthetic-20261005.json";
import {
  emptyWorkspace,
  newDataset,
  audit,
  type Workspace,
  type Role,
} from "./model";
import { recommendMapping } from "./import";

export function largeSampleWorkspace(): Workspace {
  const w = emptyWorkspace();
  w.title = "150명·24개월 가상 인사현황";
  w.sample = true;
  w.basisConfirmed = true;
  w.filters = {
    from: "2024-10",
    to: "2026-09",
    department: "",
    employmentType: "",
  };
  // The supplied workbook defines termination as the FIRST non-employed day.
  w.exitInclusive = false;
  const peopleHeaders = ["사번", "입사일", "퇴사일", "부서", "고용형태"];
  const people = newDataset(
    "가상 직원 이력 · 최종 관측 부서",
    peopleHeaders,
    data.people.map((row) =>
      Object.fromEntries(peopleHeaders.map((h, i) => [h, String(row[i])])),
    ),
    "large-people",
  );
  people.mapping = recommendMapping(peopleHeaders);
  people.confirmed = true;
  people.coverageStart = "2024-09-30";
  people.coverageEnd = "2026-09-30";
  w.datasets = [people];
  const measures: {
    column: number;
    name: string;
    role: Role;
    unit: "hours" | "days" | "won";
    meaning?: "work" | "overtime" | "leave";
  }[] = [
    {
      column: 2,
      name: "총근무시간",
      role: "attendance",
      unit: "hours",
      meaning: "work",
    },
    {
      column: 3,
      name: "연장근무시간",
      role: "attendance",
      unit: "hours",
      meaning: "overtime",
    },
    {
      column: 4,
      name: "총휴가일수",
      role: "attendance",
      unit: "days",
      meaning: "leave",
    },
    { column: 5, name: "총지급액(세전)", role: "payroll", unit: "won" },
    { column: 6, name: "회사부담보험료", role: "payroll", unit: "won" },
    { column: 7, name: "퇴직급여충당액", role: "payroll", unit: "won" },
  ];
  for (const measure of measures) {
    const rows = data.months.map((row) => ({
      "기록 ID": `${row[0]}|${row[1]}|${measure.column}`,
      사번: String(row[0]),
      기준일: String(row[1]),
      항목: measure.name,
      값: String(row[measure.column]),
    }));
    const d = newDataset(
      "가상 월별 자료 · " + measure.name,
      Object.keys(rows[0]),
      rows,
      "large-" + measure.column,
    );
    d.role = measure.role;
    d.mapping = recommendMapping(d.headers);
    d.unit = measure.unit;
    d.confirmed = true;
    if (measure.meaning) d.categoryMap[measure.name] = measure.meaning;
    w.datasets.push(d);
  }
  w.report.notes =
    "가상 데이터입니다. 기준월은 비용 귀속월이며 퇴사일은 첫 미재직일로 제외합니다. 근무시간에는 연장시간이 이미 포함되어 있어 두 지표를 다시 더하지 않습니다. 제공 인건비는 세전 총지급액·회사부담보험료·퇴직급여충당액의 합계입니다. 부서·고용형태 필터는 직원별 최종 관측 분류이며 당시 부서 이력을 재현하지 않습니다.";
  audit(
    w,
    "사용자 제공 가상 XLSX에서 180명 이력·3,414개 직원월 자료를 연결. 이름·생년월일은 샘플에서 제외.",
  );
  audit(
    w,
    "퇴사일 제외, 귀속월 기준. 최종 관측 부서로 분류. 합계와 구성 금액의 중복 합산 없음.",
  );
  return w;
}
