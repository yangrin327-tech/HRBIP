import { emptyWorkspace, newDataset, type Workspace } from "./model";
import { recommendMapping } from "./import";
export function sampleWorkspace(): Workspace {
  const w = emptyWorkspace();
  w.title = "2026년 3분기 인사현황";
  w.sample = true;
  w.basisConfirmed = true;
  const depts = ["경영지원", "제품개발", "영업", "마케팅", "고객경험"];
  const people: Record<string, string>[] = [];
  for (let i = 1; i <= 48; i++) {
    people.push({
      사번: "E" + String(i).padStart(3, "0"),
      입사일:
        i <= 30
          ? "2025-11-03"
          : "2026-" +
            String(3 + Math.floor((i - 31) / 3)).padStart(2, "0") +
            "-05",
      퇴사일: i % 11 === 0 ? "2026-08-21" : i % 17 === 0 ? "2026-09-15" : "",
      부서: depts[i % 5],
      고용형태: i % 7 === 0 ? "계약직" : "정규직",
    });
  }
  const attendance: Record<string, string>[] = [],
    payroll: Record<string, string>[] = [];
  for (let m = 1; m <= 9; m++)
    for (const p of people) {
      const date = "2026-" + String(m).padStart(2, "0") + "-15";
      if (p["입사일"] > date || (p["퇴사일"] && p["퇴사일"] < date)) continue;
      const n = Number(p["사번"].slice(1));
      attendance.push({
        "기록 ID": p["사번"] + "-" + m + "-W",
        사번: p["사번"],
        기준일: date,
        항목: "근무",
        값: String(144 + (n % 4) * 8),
      });
      attendance.push({
        "기록 ID": p["사번"] + "-" + m + "-L",
        사번: p["사번"],
        기준일: date,
        항목: "휴가",
        값: String(((n + m) % 3) * 4),
      });
      payroll.push({
        "기록 ID": p["사번"] + "-" + m + "-P",
        사번: p["사번"],
        기준일: date,
        항목: "기본급",
        값: String(2800000 + (n % 8) * 210000),
      });
      payroll.push({
        "기록 ID": p["사번"] + "-" + m + "-B",
        사번: p["사번"],
        기준일: date,
        항목: "식대",
        값: "200000",
      });
    }
  const make = (
    name: string,
    rows: Record<string, string>[],
    role: "people" | "attendance" | "payroll",
  ) => {
    const d = newDataset(name, Object.keys(rows[0]), rows, "sample-" + role);
    d.role = role;
    d.mapping = recommendMapping(d.headers);
    d.confirmed = true;
    d.coverageStart = "2026-01-01";
    d.coverageEnd = "2026-09-30";
    d.asOf = "2026-09-30";
    d.unit = role === "payroll" ? "won" : "hours";
    d.categoryMap = { 근무: "work", 휴가: "leave" };
    return d;
  };
  w.datasets = [
    make("가상 인사이력", people, "people"),
    make("가상 근태기록", attendance, "attendance"),
    make("가상 지급내역", payroll, "payroll"),
  ];
  return w;
}
