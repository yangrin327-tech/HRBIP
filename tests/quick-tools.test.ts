import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarPeriod,
  offsetDate,
  compareLists,
  comparisonCsv,
  certificateLines,
  type Certificate,
} from "../shared/quick-tools";

test("calendar periods handle leap days, month ends and explicit inclusive dates", () => {
  assert.deepEqual(calendarPeriod("2024-02-29", "2025-02-28", false), {
    years: 1,
    months: 0,
    days: 0,
    totalDays: 365,
  });
  assert.deepEqual(calendarPeriod("2026-01-31", "2026-02-28", false), {
    years: 0,
    months: 1,
    days: 0,
    totalDays: 28,
  });
  assert.equal(calendarPeriod("2026-10-07", "2026-10-07", false).totalDays, 0);
  assert.equal(calendarPeriod("2026-10-07", "2026-10-07", true).totalDays, 1);
  assert.equal(calendarPeriod("2024-02-28", "2024-03-01", false).totalDays, 2);
  assert.throws(() => calendarPeriod("2026-02-30", "2026-03-01", false));
  assert.throws(() => calendarPeriod("2026-10-07", "2026-10-06", false));
});

test("date offsets cross leap-year and year boundaries without local timezone shifts", () => {
  assert.equal(offsetDate("2024-03-01", "-1"), "2024-02-29");
  assert.equal(offsetDate("2026-12-31", "1"), "2027-01-01");
  assert.equal(offsetDate("2026-10-07", "0"), "2026-10-07");
  for (const invalid of ["", "1.5", "Infinity", "36501"])
    assert.throws(() => offsetDate("2026-10-07", invalid));
  assert.throws(() => offsetDate("2100-12-31", "1"));
});

test("list matching preserves identifiers and tracks duplicates at original line numbers", () => {
  const r = compareLists(" 001 \r\n\r\n002\r\n002\r\nA", "001\na\n003", false);
  assert.deepEqual(
    r.onlyLeft.map((x) => x.value),
    ["002", "A"],
  );
  assert.deepEqual(
    r.onlyRight.map((x) => x.value),
    ["a", "003"],
  );
  assert.deepEqual(
    r.common.map((x) => x.value),
    ["001"],
  );
  assert.deepEqual(r.duplicateLeft, [{ value: "002", lines: [3, 4] }]);
  assert.equal(r.leftCount, 4);
  assert.equal(compareLists("A\na", "a", true).common.length, 1);
  assert.throws(() => compareLists("x\ty", "x", false));
  assert.throws(() => compareLists("\n ", "x", false));
  assert.throws(() => compareLists("a\n".repeat(10001), "a", false));
});

test("CSV export retains quotes and disables spreadsheet formula injection", () => {
  const csv = comparisonCsv(
    compareLists('=1+1\n+SUM(1)\n001\nA,"B"', "other", false),
  );
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"\'+SUM(1)"'));
  assert.ok(csv.includes('"A,""B"""'));
  assert.ok(csv.includes('"001"'));
});

test("certificates validate period and do not leak a hidden career end date into employment output", () => {
  const data: Certificate = {
    kind: "employment",
    name: "가상 직원",
    company: "예시 회사",
    start: "2024-01-01",
    end: "2025-01-01",
    issued: "2026-10-07",
    department: "인사",
    position: "",
    purpose: "",
    duties: "자료 정리\n보고서 작성",
    representative: "",
  };
  const lines = certificateLines(data);
  assert.ok(lines.includes("재직기간: 2024-01-01 ~ 현재 (2026-10-07 기준)"));
  assert.ok(!lines.join("\n").includes("2025-01-01"));
  assert.ok(
    certificateLines({ ...data, kind: "career" })
      .join("\n")
      .includes("2025-01-01"),
  );
  assert.throws(() => certificateLines({ ...data, name: " " }));
  assert.throws(() => certificateLines({ ...data, start: "2027-01-01" }));
  assert.throws(() =>
    certificateLines({ ...data, kind: "career", end: "2027-01-01" }),
  );
});
