import test from "node:test";
import assert from "node:assert/strict";
import {
  lawGuide,
  settlementCheck,
  leaveCheck,
  contractCheck,
  recruitmentCheck,
} from "../shared/hr-support";
import {
  lawExample,
  settlementExample,
  leaveExample,
  contractExample,
  recruitmentExample,
} from "../shared/support-samples";
import { sampleWorkspace } from "../shared/sample";
import { largeSampleWorkspace } from "../shared/sample-large";
import { aggregate, draft } from "../shared/analytics";
import { verifyCalculations } from "../shared/verification";

test("first-use support samples contain no deliberate discrepancies or missing expressions", () => {
  const results = [
    lawGuide(lawExample),
    settlementCheck(
      settlementExample.lines,
      settlementExample.claimed,
      settlementExample.scope,
    ),
    leaveCheck(leaveExample),
    leaveCheck({ ...leaveExample, mode: "ledger" }),
    contractCheck(contractExample),
    recruitmentCheck(recruitmentExample),
  ];
  for (const r of results)
    assert.equal(
      r.findings.filter((f) => f.level === "difference" || f.level === "check")
        .length,
      0,
      r.title,
    );
  assert.ok(results[1].rows.some((row) => row.includes("2,130,000원")));
  assert.ok(
    results[2].rows.some((row) => row.join("|") === "누적 부여량|57일|57일"),
  );
});

test("both dashboard samples pass the independent calculation comparison", () => {
  for (const w of [sampleWorkspace(), largeSampleWorkspace()]) {
    const r = aggregate(w);
    w.report = {
      generated: draft(r),
      notes: "",
      basisKey: r.key,
      reviewedKey: r.key,
    };
    const v = verifyCalculations(w, r);
    assert.equal(v.blocked, false, w.title);
    assert.equal(v.counts.fail, 0);
  }
});
