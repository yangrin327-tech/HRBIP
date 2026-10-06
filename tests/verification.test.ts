import test from "node:test";
import assert from "node:assert/strict";
import { sampleWorkspace } from "../shared/sample";
import { aggregate, draft } from "../shared/analytics";
import { verifyCalculations } from "../shared/verification";
import { emptyWorkspace, newDataset } from "../shared/model";
import { exportVerification } from "../server/verification-export";
import ExcelJS from "exceljs";
import { largeSampleWorkspace } from "../shared/sample-large";
test("independent verification detects changed metrics, chart values and missing-vs-zero", () => {
  const w = sampleWorkspace(),
    r = aggregate(w);
  w.report.generated = draft(r);
  w.report.basisKey = r.key;
  const clean = verifyCalculations(w, r);
  assert.equal(
    clean.blocked,
    false,
    JSON.stringify(clean.checks.filter((c) => c.status === "fail")),
  );
  r.metrics[0].value!++;
  let bad = verifyCalculations(w, r);
  assert.ok(bad.blocked);
  assert.equal(
    bad.checks.find((c) => c.id === "metric:headcount")?.difference,
    1,
  );
  r.metrics[0].value!--;
  r.charts[0].points[0].value = null;
  assert.ok(verifyCalculations(w, r).blocked);
});
test("event-sweep handles last-day exits, same-day join/exit, rehire and null coverage", () => {
  for (const inclusive of [true, false]) {
    const w = emptyWorkspace();
    w.filters = {
      from: "2026-01",
      to: "2026-03",
      department: "",
      employmentType: "",
    };
    w.exitInclusive = inclusive;
    w.basisConfirmed = true;
    const d = newDataset(
      "history",
      ["id", "start", "end", "department"],
      [
        { id: "A", start: "2025-01-01", end: "2026-01-31", department: "개발" },
        { id: "A", start: "2026-02-02", end: "", department: "인사" },
        { id: "B", start: "2026-02-28", end: "2026-02-28", department: "개발" },
      ],
    );
    Object.assign(d, {
      mapping: {
        employeeId: "id",
        startDate: "start",
        endDate: "end",
        department: "department",
      },
      confirmed: true,
      coverageStart: "2025-12-31",
      coverageEnd: "2026-03-31",
    });
    w.datasets = [d];
    for (const dep of ["", "인사", "개발"]) {
      w.filters.department = dep;
      const r = aggregate(w),
        v = verifyCalculations(w, r);
      assert.equal(
        v.blocked,
        false,
        JSON.stringify(v.checks.filter((c) => c.status === "fail")),
      );
    }
    w.filters.to = "2026-04";
    const r = aggregate(w),
      v = verifyCalculations(w, r);
    assert.equal(v.blocked, false);
    assert.equal(
      v.checks.find((c) => c.id === "metric:headcount")?.status,
      "unavailable",
    );
  }
});
test("verification Excel contains typed comparison values, criteria, sources without employee rows", async () => {
  const w = sampleWorkspace(),
    r = aggregate(w),
    b = await exportVerification(w, r),
    wb = new ExcelJS.Workbook();
  await wb.xlsx.load(b as never);
  assert.equal(wb.worksheets.length, 2);
  assert.equal(
    wb.getWorksheet("계산 검증 상세")!.getCell("C2").value,
    r.metrics[0].value,
  );
  const before = verifyCalculations(w, r);
  w.filters.department = "경영지원";
  const after = verifyCalculations(w, aggregate(w));
  assert.notEqual(before.key, after.key);
});

test("provided 24-month sample independently reconciles all sources across requested 2020–2026", () => {
  const w = largeSampleWorkspace();
  w.filters = {
    from: "2020-01",
    to: "2026-12",
    department: "",
    employmentType: "",
  };
  const r = aggregate(w),
    v = verifyCalculations(w, r);
  assert.equal(
    v.blocked,
    false,
    JSON.stringify(v.checks.filter((c) => c.status === "fail")),
  );
  assert.equal(
    v.checks.find((c) => c.id === "metric:lastObservedHeadcount")?.expected,
    150,
  );
  assert.equal(
    v.checks.find((c) => c.id === "metric:headcount")?.status,
    "unavailable",
  );
  assert.equal(
    v.checks.find((c) => c.id === "metric:payTrend")?.expected,
    19591449240,
  );
});
