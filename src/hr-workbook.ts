import { type RawSheet, sheetToDataset, sheetToDatasets } from "./files";
import { emptyWorkspace, audit } from "../shared/model";
import {
  monthEnd,
  priorMonth,
  recommendMapping,
  parseDate,
} from "../shared/import";

const specs = [
  ["사번", "입사일", "퇴사일"],
  ["사번", "기준월", "부서", "고용형태", "월말재직여부"],
  ["사번", "기준월", "총근무시간", "연장근무시간", "총휴가일수"],
  ["사번", "기준월", "총지급액_원", "회사부담보험료_원", "퇴직급여충당액_원"],
];
export function recognizeHrWorkbook(sheets: RawSheet[]) {
  const matches = specs.map((fields) =>
    sheets.filter((s) =>
      fields.every((h) => s.matrix[s.headerRow]?.includes(h)),
    ),
  );
  return (
    matches.every((a) => a.length === 1) &&
    new Set(sheets.map((s) => s.fileId)).size === 1 &&
    sheets.every(
      (s) =>
        matches.some((a) => a.includes(s)) ||
        /(?:^|\/\s*)(항목설명|집계기준)$/.test(s.name),
    )
  );
}
export function prepareHrWorkbook(sheets: RawSheet[]) {
  if (!recognizeHrWorkbook(sheets))
    throw new Error("지원하는 인사 통합 파일 구조를 확인할 수 없습니다.");
  const [staff, snapshots, attendance, payroll] = specs.map((fields) =>
    sheets.find((s) =>
      fields.every((h) => s.matrix[s.headerRow]?.includes(h)),
    )!,
  );
  const history = sheetToDataset(snapshots).rows;
  if (!history.length) throw new Error("월별인사현황에 연결할 행이 없습니다.");
  const dates = history.map((r) => parseDate(r.기준월, "ymd"));
  if (dates.some((d) => !d))
    throw new Error("월별인사현황의 기준월을 날짜로 읽을 수 없습니다.");
  const months = [...new Set(dates as string[])].sort();
  const latest = new Map<string, Record<string, string>>();
  const keys = new Set<string>();
  for (const r of history) {
    const key = r.사번 + "|" + parseDate(r.기준월, "ymd");
    if (keys.has(key))
      throw new Error(
        "월별인사현황에 같은 사번·기준월이 중복되어 있습니다. 원본을 확인하세요.",
      );
    keys.add(key);
    if (!latest.has(r.사번) || latest.get(r.사번)!.기준월 < r.기준월)
      latest.set(r.사번, r);
  }
  const people = sheetToDataset(staff);
  // Explicit preview explains this latest-classification join. No row multiplication.
  people.headers = ["사번", "입사일", "퇴사일", "부서", "고용형태"];
  people.rows = people.rows.map((r) => ({
    사번: r.사번,
    입사일: r.입사일,
    퇴사일: r.퇴사일,
    부서: latest.get(r.사번)?.부서 || "",
    고용형태: latest.get(r.사번)?.고용형태 || "",
  }));
  people.mapping = recommendMapping(people.headers);
  people.coverageStart = monthEnd(priorMonth(months[0].slice(0, 7)));
  people.coverageEnd = monthEnd(months.at(-1)!.slice(0, 7));
  people.confirmed = true;
  const a = sheetToDatasets({
    ...attendance,
    shape: "columns",
    wideRole: "attendance",
    idColumn: "사번",
    dateColumn: "기준월",
    valueColumns: ["총근무시간", "연장근무시간", "총휴가일수"],
  });
  for (const d of a) {
    d.confirmed = true;
    d.grain = "composite";
    const name = d.rows[0]?.항목;
    d.unit = name === "총휴가일수" ? "days" : "hours";
    d.categoryMap[name] =
      name === "총근무시간"
        ? "work"
        : name === "연장근무시간"
          ? "overtime"
          : "leave";
  }
  const p = sheetToDatasets({
    ...payroll,
    shape: "columns",
    wideRole: "payroll",
    idColumn: "사번",
    dateColumn: "기준월",
    valueColumns: ["총지급액_원", "회사부담보험료_원", "퇴직급여충당액_원"],
  });
  p.forEach((d) => {
    d.confirmed = true;
    d.grain = "composite";
  });
  const w = emptyWorkspace();
  w.title = "업로드 인사현황 보고서";
  w.datasets = [people, ...a, ...p];
  w.filters = {
    from: months[0].slice(0, 7),
    to: months.at(-1)!.slice(0, 7),
    department: "",
    employmentType: "",
  };
  w.exitInclusive = false;
  w.report.notes =
    "업로드 파일의 기준월은 귀속월입니다. 퇴사일은 첫 미재직일로 제외하며 근무시간에는 연장시간이 포함됩니다. 인건비는 총지급액·회사부담보험료·퇴직급여충당액을 합산합니다. 부서·고용형태는 최종 관측 소속 기준입니다. 과거 입사일은 보존하지만 전체 인원 이력의 확인 범위는 월별 자료로 확인한 기간입니다.";
  audit(
    w,
    "사용자가 통합 파일 추천 연결을 확인·적용. 설명 시트는 집계에서 제외. 이름·생년월일은 분석용 표에서 제외. 원본 변경 없음.",
  );
  return w;
}
