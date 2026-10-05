import test from "node:test";
import assert from "node:assert/strict";
import { largeSampleWorkspace } from "../shared/sample-large";
import data from "../shared/samples/synthetic-20261005.json";
import { aggregate, validate } from "../shared/analytics";
import { workspaceSchema } from "../shared/model";

test("uploaded fictional sample reconciles all 24 months to source workbook snapshots and costs", () => {
  const w = largeSampleWorkspace();
  workspaceSchema.parse(w);
  assert.equal(
    w.datasets.reduce((n, d) => n + d.rows.length, 0),
    20664,
  );
  assert.deepEqual(validate(w), []);
  assert.equal(w.exitInclusive, false);
  const full = aggregate(w);
  assert.equal(full.metrics.find((m) => m.id === "headcount")?.value, 150);
  assert.equal(full.departments.length, 7);
  for (const row of data.reference) {
    w.filters.from = w.filters.to = String(row[0]);
    const r = aggregate(w);
    const value = (id: string) => r.metrics.find((m) => m.id === id)?.value;
    assert.equal(value("headcount"), row[1], String(row[0]));
    assert.equal(value("hired"), row[2]);
    assert.equal(value("left"), row[3]);
    assert.equal(value("workHours"), row[4]);
    assert.equal(value("overtime"), row[5]);
    assert.equal(value("leaveDays"), row[6]);
    assert.equal(value("payTrend"), row[7]);
  }
  assert.ok(!JSON.stringify(w.datasets).includes("생년월일"));
  assert.ok(w.datasets.every((d) => !d.headers.includes("가상성명")));
});
