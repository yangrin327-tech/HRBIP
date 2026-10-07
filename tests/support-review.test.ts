import test from "node:test";
import assert from "node:assert/strict";
import {
  contractCheck,
  recruitmentCheck,
  lawGuide,
  recommendTopics,
  resultText,
  type LawInput,
} from "../shared/hr-support";
import {
  contractExample,
  recruitmentExample,
  contractReviewExample,
  recruitmentReviewExample,
} from "../shared/support-samples";

test("contract review adds computed discrepancy, missing condition, reason and editable suggestion", () => {
  const r = contractCheck(contractReviewExample);
  const pay = r.findings.find((f) => f.title === "월 임금 합계 불일치")!;
  assert.match(pay.reason!, /3,000,000원.*3,200,000원.*200,000원/);
  assert.match(pay.evidence, /3줄/);
  assert.match(pay.suggestion!, /3,000,000원/);
  const rest = r.findings.find((f) => f.title === "휴게 분량 재검토")!;
  assert.match(rest.reason!, /8시간 30분.*60분.*30분/);
  assert.equal(rest.source, "breaks");
  assert.match(
    r.findings.find((f) => f.title === "수당 포함 조건")!.reason!,
    /금액.*근로시간.*산정/,
  );
  assert.match(
    r.findings.find((f) => f.title === "참조 규정 확인")!.suggestion!,
    /조.*첨부/,
  );
  assert.ok(
    r.findings
      .filter((f) => f.level !== "info")
      .every((f) => !!f.reason && !!f.action),
  );
});
test("valid contract calculates hours and wage total without fake blanket approval", () => {
  const r = contractCheck(contractExample);
  assert.match(
    r.rows.find((row) => row[0] === "시간 검산")![1],
    /9시간.*1시간.*8시간/,
  );
  assert.match(
    r.rows.find((row) => row[0] === "월 임금 합계 검산")![3],
    /3,000,000원.*일치/,
  );
  assert.equal(
    r.findings.filter((f) => f.level === "check" || f.level === "difference")
      .length,
    0,
  );
  assert.ok(!/적법성 통과|법적 문제 없음|완벽/.test(r.summary));
  const changed = contractCheck(
    contractExample.replace("월 지급액 300만원", "월 지급액 310만원"),
  );
  assert.match(
    changed.findings.find((f) => f.title === "월 임금 합계 불일치")!.reason!,
    /100,000원/,
  );
});
test("contract ranges outside the shift and penalty clauses receive specific reasons without inventing liability", () => {
  const r = contractCheck(
    "근무시간: 월~금 09:00~18:00. 휴게시간: 19:00~20:00.\n퇴사 시 위약금 300만원을 지급한다.",
  );
  assert.ok(r.findings.some((f) => f.title === "근무·휴게 구간 불일치"));
  assert.equal(
    r.findings.find((f) => f.title === "퇴사·계약 불이행 배상 조항")!.source,
    "penalties",
  );
  assert.ok(
    !contractCheck(
      "퇴사 시 위약금은 없다. 근로시간은 주 40시간이다.",
    ).findings.some((f) => f.title === "퇴사·계약 불이행 배상 조항"),
  );
  const korean = contractCheck(
    "근무시간: 월~금 9시부터 18시까지. 휴게시간: 12시부터 13시까지.",
  );
  assert.match(korean.rows.find((row) => row[0] === "시간 검산")![1], /8시간/);
  const multiple = contractCheck(
    "근무시간: 월~금 09:00~18:00. 휴게시간: 12:00~12:30, 15:00~15:30.",
  );
  assert.ok(
    multiple.findings.some(
      (f) => f.title === "복수 시간표 대조 필요" && f.level === "unverified",
    ),
  );
  assert.ok(!multiple.findings.some((f) => f.title === "휴게 분량 재검토"));
  const night = contractCheck(
    "근무시간: 월~금 18:00~익일 03:00. 휴게시간: 00:00~01:00.",
  );
  assert.match(night.rows.find((row) => row[0] === "시간 검산")![1], /8시간/);
  assert.ok(!night.findings.some((f) => f.title === "근무·휴게 구간 불일치"));
});
test("recruitment review catches useless placeholders and distinguishes initial employment from conversion", () => {
  const r = recruitmentCheck(recruitmentReviewExample);
  const type = r.findings.find((f) => f.title === "고용형태 불일치")!;
  assert.match(type.reason!, /최초.*정규직.*계약직/);
  for (const title of [
    "급여 조건 안내 보완",
    "지원 방법 안내 보완",
    "마감 방식 안내 보완",
    "근무지 안내 보완",
  ]) {
    assert.ok(
      r.findings.some((f) => f.title === title && f.reason && f.suggestion),
      title,
    );
  }
  assert.equal(
    recruitmentCheck(recruitmentExample).findings.filter(
      (f) => f.level === "check" || f.level === "difference",
    ).length,
    0,
  );
});
test("recruitment compares explicit same-unit salaries; ranges, different units and choices are not contradictions", () => {
  const issue = recruitmentCheck(
    "상단 연봉: 3600만원\n본문 연봉: 3000만원\n고용형태: 정규직",
  ).findings.find((f) => f.title === "급여 금액 불일치")!;
  assert.match(issue.reason!, /36,000,000원.*30,000,000원/);
  for (const text of [
    "연봉: 3000~4000만원\n월 급여: 300만원",
    "고용형태: 정규직 또는 계약직 중 선택\n본문 고용형태: 계약직",
    "연봉: 3600만원\n월 급여: 300만원",
  ]) {
    const r = recruitmentCheck(text);
    assert.ok(
      !r.findings.some(
        (f) => f.title === "급여 금액 불일치" || f.title === "고용형태 불일치",
      ),
    );
  }
  assert.ok(
    recruitmentCheck(
      "마감: 2026-02-30\n지원 방법: hr@example.com",
    ).findings.some((f) => f.title === "마감일 날짜 오류"),
  );
});
const payment: LawInput = {
  question: "퇴사 직원의 정산을 다음 급여일에 지급하려고 합니다.",
  topic: "payment",
  eventDate: "2026-10-07",
  endMeaning: "ended",
  agreement: "no",
  plannedDate: "2026-10-30",
};
test("law payment branches on termination meaning, actual plan and agreement evidence", () => {
  const r = lawGuide(payment);
  assert.ok(
    r.rows.some(
      (row) => row[0] === "14일 단순 비교일" && row[1] === "2026-10-21",
    ),
  );
  assert.match(
    r.findings.find((f) => f.title === "지급 계획 재검토")!.evidence,
    /23일/,
  );
  assert.ok(r.steps!.some((step) => /서면.*1350/.test(step)));
  const unknown = lawGuide({ ...payment, endMeaning: "last" });
  assert.ok(!unknown.rows.some((row) => row[0] === "14일 단순 비교일"));
  const agreed = lawGuide({ ...payment, agreement: "yes" });
  assert.match(
    agreed.findings.find((f) => f.title === "지급 계획 재검토")!.reason!,
    /효력.*확인되지는/,
  );
  assert.ok(
    !lawGuide({ ...payment, plannedDate: "2026-10-20" }).findings.some(
      (f) => f.title === "지급 계획 재검토",
    ),
  );
  assert.throws(
    () => lawGuide({ ...payment, plannedDate: "2026-02-30" }),
    /실제로/,
  );
  assert.throws(
    () => lawGuide({ ...payment, plannedDate: "2026-10-01" }),
    /예정일/,
  );
});
test("same leave question produces different next steps when applicability facts change", () => {
  const input: LawInput = {
    ...payment,
    topic: "leave",
    question: "직원의 연차 부여 기준을 확인하려고 합니다.",
    workers: "fivePlus",
    weeklyHours: "40",
    tenure: "yearPlus",
    attendance: "atLeast80",
  };
  const annual = lawGuide(input),
    monthly = lawGuide({ ...input, tenure: "underYear" }),
    excluded = lawGuide({ ...input, weeklyHours: "14" });
  assert.match(annual.summary, /15일/);
  assert.match(monthly.summary, /월별 개근/);
  assert.match(excluded.summary, /회사.*약정/);
  assert.match(
    excluded.findings.find((f) => f.title === "일반 연차 기준 적용 범위")!
      .action,
    /0일로 확정하지/,
  );
  assert.match(lawGuide({ ...input, weeklyHours: "" }).summary, /미확인/);
});
test("contract guide links the issue's article and exports reasons, revisions and sequence", () => {
  const rest = lawGuide({
    ...payment,
    topic: "contract",
    question: "8시간 근무에 휴게시간 30분만 부여해도 되나요?",
    contractIssue: "rest",
  });
  assert.deepEqual(rest.sourceIds, ["breaks"]);
  assert.match(
    rest.findings.find((f) => f.source === "breaks")!.reason!,
    /2026-12-10/,
  );
  const text = resultText(
    contractCheck(contractReviewExample),
    "급여 총액 확인 예정",
  );
  assert.match(text, /이유:.*200,000원/);
  assert.match(text, /수정·확인 예시:/);
  assert.match(text, /근로기준법 제17조/);
  assert.match(resultText(rest, ""), /처리 순서 1/);
  const historical = lawGuide({
    ...payment,
    topic: "contract",
    eventDate: "2026-09-01",
    contractIssue: "penalty",
  });
  assert.equal(
    historical.findings.find((f) => f.title === "사건 시점의 법령 확인")!
      .source,
    "penalties",
  );
  assert.deepEqual(
    recommendTopics("계약서의 임금에 수당 포함이라고 되어 있어요"),
    ["contract"],
  );
  assert.deepEqual(
    recommendTopics("퇴직자의 미지급 임금을 확인하려고 합니다"),
    ["payment"],
  );
});
