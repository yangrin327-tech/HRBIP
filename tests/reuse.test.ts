import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareRepeat,
  suggestedRule,
  applyReuseRule,
  missingColumns,
} from "../shared/reuse";
import { sampleWorkspace } from "../shared/sample";
import { newDataset } from "../shared/model";
import { aggregate } from "../shared/analytics";
import { metricEvidence } from "../shared/metric-evidence";

test("repeat carries only definitions; old data, filters, periods, report and retention never leak", () => {
  const source = sampleWorkspace();
  source.filters.department = "old-department";
  source.retainOriginals = true;
  source.report.notes = "PRIVATE OLD OPINION";
  const before = JSON.stringify(source),
    { workspace, plan } = prepareRepeat(source);
  assert.equal(workspace.filters.from, "2026-10");
  assert.equal(workspace.filters.department, "");
  assert.equal(workspace.datasets.length, 0);
  assert.equal(workspace.report.notes, "");
  assert.equal(workspace.report.generated, "");
  assert.equal(workspace.retainOriginals, false);
  assert.equal(workspace.basisConfirmed, false);
  assert.equal(JSON.stringify(plan).includes("PRIVATE OLD OPINION"), false);
  plan.rules.forEach((rule) => {
    assert.equal("rows" in rule, false);
    assert.equal("coverageStart" in rule, false);
    assert.equal("asOf" in rule, false);
  });
  workspace.design.theme = "lime";
  assert.equal(JSON.stringify(source), before);
});
test("repeat links exact columns, clears confirmations, preserves only NEW rows and NEW coverage", () => {
  const { plan } = prepareRepeat(sampleWorkspace());
  const rule = plan.rules[0];
  const d = newDataset(
    "October.csv",
    Object.values(rule.mapping).filter(Boolean),
    [{ [rule.mapping.employeeId]: "NEW-ONLY" }],
    "new-source",
  );
  d.coverageStart = "2026-10-01";
  d.coverageEnd = "2026-10-31";
  d.confirmed = true;
  assert.equal(suggestedRule(d, [rule]), 0);
  const out = applyReuseRule(d, rule);
  assert.equal(out.confirmed, false);
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0][rule.mapping.employeeId], "NEW-ONLY");
  assert.equal(out.coverageStart, "2026-10-01");
  assert.equal(out.coverageEnd, "2026-10-31");
  assert.equal(out.id, "new-source");
  assert.equal(d.confirmed, true);
});
test("ambiguous rules are not guessed and renamed columns cannot reuse old connections", () => {
  const { plan } = prepareRepeat(sampleWorkspace());
  const a = plan.rules[0],
    b = { ...a, name: "other.xlsx / roster" };
  const d = newDataset(
    "new.csv",
    Object.values(a.mapping).filter(Boolean),
    [],
    "new",
  );
  assert.equal(suggestedRule(d, [a, b]), -1);
  d.headers = d.headers.filter((h) => h !== a.mapping.startDate);
  assert.ok(missingColumns(d, a).includes(a.mapping.startDate));
  assert.equal(suggestedRule(d, [a]), -1);
  assert.equal(applyReuseRule(d, a).mapping.startDate, undefined);
  assert.equal(applyReuseRule(d, a).coverageStart, "");
});
test("unit reuse is explicit configuration, new values are not converted until normal aggregation", () => {
  const { plan } = prepareRepeat(sampleWorkspace());
  const rule = plan.rules.find((r) => r.role === "payroll")!;
  rule.unit = "thousand";
  const d = newDataset(
    "new",
    Object.values(rule.mapping).filter(Boolean),
    [{ [rule.mapping.value]: "123" }],
    "new",
  );
  const out = applyReuseRule(d, rule);
  assert.equal(out.unit, "thousand");
  assert.equal(out.confirmed, false);
  assert.equal(out.rows[0][rule.mapping.value], "123");
});
test("metric evidence identifies current basis and missing comparison without inventing history", () => {
  const w = sampleWorkspace(),
    r = aggregate(w);
  const e = metricEvidence(w, r, "headcount");
  assert.equal(
    e.metric.value,
    r.metrics.find((m) => m.id === "headcount")!.value,
  );
  assert.equal(e.period, "2026-09-30");
  assert.ok(e.sources.length > 0);
  assert.ok(e.sources[0].columns.includes("사번"));
  w.filters.to = "2027-01";
  const later = aggregate(w),
    last = metricEvidence(w, later, "lastObservedHeadcount");
  assert.ok(last.formula.includes("요청 종료월"));
  assert.match(
    metricEvidence(w, later, "headcount").limitation,
    /확인할 수 없어/,
  );
});
