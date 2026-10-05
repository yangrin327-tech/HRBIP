import test from "node:test";
import assert from "node:assert/strict";
import { prepareHrWorkbook, recognizeHrWorkbook } from "../src/hr-workbook";
import type { RawSheet } from "../src/files";
import { aggregate, validate } from "../shared/analytics";
import { largeSampleWorkspace } from "../shared/sample-large";
import { months } from "../shared/import";
import { workspaceSchema } from "../shared/model";

function fixture(): RawSheet[] {
  return [
    [
      ["사번", "입사일", "퇴사일", "가상성명"],
      ["A", "2017-12-02", "", "가상 직원"],
    ],
    [
      ["사번", "기준월", "부서", "고용형태", "월말재직여부"],
      ["A", "2024-10-01", "개발", "정규직", "1"],
    ],
    [
      ["사번", "기준월", "총근무시간", "연장근무시간", "총휴가일수"],
      ["A", "2024-10-01", "160", "10", "2"],
    ],
    [
      [
        "사번",
        "기준월",
        "총지급액_원",
        "회사부담보험료_원",
        "퇴직급여충당액_원",
        "총인건비_원",
      ],
      ["A", "2024-10-01", "1000000", "100000", "50000", "1150000"],
    ],
    [
      ["구분", "설명"],
      ["자료", "설명 시트"],
    ],
  ].map((matrix, i) => ({
    id: "test-" + i,
    fileId: "test",
    name: i === 4 ? "집계기준" : "sheet" + i,
    matrix,
    headerRow: 0,
    selected: true,
  }));
}
test("integrated upload keeps old hire dates, avoids salary double count, and excludes metadata", () => {
  const sheets = fixture();
  const before = JSON.stringify(sheets);
  assert.equal(recognizeHrWorkbook(sheets), true);
  const w = prepareHrWorkbook(sheets);
  assert.equal(w.datasets.length, 7);
  assert.equal(w.datasets[0].rows[0].입사일, "2017-12-02");
  assert.equal(w.datasets[0].coverageStart, "2024-09-30");
  assert.equal(w.basisConfirmed, false);
  assert.equal(w.exitInclusive, false);
  assert.equal(JSON.stringify(sheets), before);
  assert.deepEqual(validate(w), []);
  w.basisConfirmed = true;
  workspaceSchema.parse(w);
  const r = aggregate(w);
  assert.equal(r.metrics.find((m) => m.id === "payTrend")?.value, 1150000);
  assert.equal(r.metrics.find((m) => m.id === "workHours")?.value, 160);
  assert.equal(r.metrics.find((m) => m.id === "leaveDays")?.value, 2);
  sheets[1].matrix.push([...sheets[1].matrix[1]]);
  assert.throws(() => prepareHrWorkbook(sheets), /중복/);
});
test("2020–2026 request retains 84 months without inventing historical or future values", () => {
  const w = largeSampleWorkspace();
  w.filters.from = "2020-01";
  w.filters.to = "2026-12";
  const r = aggregate(w);
  assert.equal(months(w.filters.from, w.filters.to).length, 84);
  const trend = r.charts.find((c) => c.id === "headcount")!;
  assert.equal(trend.points.length, 84);
  assert.equal(trend.points[0].value, null);
  assert.equal(trend.points.at(-1)?.value, null);
  assert.equal(r.metrics.find((m) => m.id === "headcount")?.value, null);
  assert.equal(
    r.metrics.find((m) => m.id === "lastObservedHeadcount")?.value,
    150,
  );
  assert.equal(r.metrics.find((m) => m.id === "payTrend")?.value, 19591449240);
  const depts = r.charts.find((c) => c.id === "department")!;
  assert.match(depts.title, /2026-09/);
  assert.equal(
    depts.points.reduce((n, p) => n + (p.value || 0), 0),
    150,
  );
});
