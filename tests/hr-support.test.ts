import test from "node:test";
import assert from "node:assert/strict";
import {
  lawGuide,
  leaveCheck,
  settlementCheck,
  contractCheck,
  recruitmentCheck,
  amount,
  dateValue,
  resultText,
  recommendTopics,
  type LeaveInput,
  type LawInput,
} from "../shared/hr-support";

const leave: LeaveInput = {
  mode: "comparison",
  start: "2024-07-01",
  end: "2026-09-30",
  eligible: true,
  complete: true,
  monthly: true,
  prorataMonths: "6",
  granted: "15",
  carried: "0",
  used: "7.5",
  expired: "0",
  adjustment: "0",
  stated: "6.5",
  companyRule: "1월 1일, 개월 비례. 입사~마지막 재직일 누적 부여",
};
const law: LawInput = {
  question:
    "10월 20일 마지막 재직일까지 근무한 직원의 정산을 다음 급여일에 해도 될까요?",
  topic: "payment",
  eventDate: "2026-10-20",
  agreement: "unknown",
  endMeaning: "last",
};
const row = (r: ReturnType<typeof leaveCheck>, name: string) =>
  r.rows.find((x) => x[0] === name);

test("law guide separates unknown facts, source date and agreement efficacy", () => {
  const r = lawGuide(law);
  assert.match(r.summary, /정기 급여일만으로/);
  assert.ok(
    r.findings.some(
      (x) => x.title === "사건 시점의 법령 확인" && x.level === "unverified",
    ),
  );
  assert.ok(r.findings.some((x) => x.title === "종료일 의미 확인"));
  assert.match(
    lawGuide({ ...law, agreement: "yes" }).findings.find(
      (x) => x.title === "지급기일 연장 합의",
    )!.evidence,
    /효력은 검증하지/,
  );
  assert.ok(!r.rows.some((x) => x[0] === "확인된 사실"));
  assert.deepEqual(recommendTopics("퇴사 직원의 연차 정산과 계약"), [
    "payment",
    "leave",
    "contract",
  ]);
});
test("law guide validates dates/topics and does not invent an unrelated legal answer", () => {
  assert.throws(() => lawGuide({ ...law, eventDate: "2026-02-30" }), /실제로/);
  assert.throws(
    () => lawGuide({ ...law, topic: "invalid" as LawInput["topic"] }),
    /쟁점/,
  );
  const r = lawGuide({
    ...law,
    question: "채용 홍보 예산은 얼마가 적절할까요?",
  });
  assert.ok(r.findings.some((x) => x.title === "질문과 지원 쟁점 확인"));
  assert.equal(
    lawGuide({ ...law, eventDate: "2026-10-07" }).findings.some(
      (x) => x.title === "사건 시점의 법령 확인",
    ),
    false,
  );
});
test("settlement uses every row; a duplicate warns rather than silently excluding it", () => {
  const lines = [
    {
      name: "급여",
      kind: "pay" as const,
      value: "1,800,000",
      note: "급여대장",
    },
    { name: "수당", kind: "pay" as const, value: "120000", note: "" },
    { name: "수당", kind: "pay" as const, value: "300000", note: "" },
    { name: "공제", kind: "deduction" as const, value: "90000", note: "" },
  ];
  const r = settlementCheck(lines, "2030000", "10월 최종 정산");
  assert.equal(row(r, "재계산 지급액")![2], "2,130,000원");
  assert.equal(row(r, "차이")![2], "100,000원");
  assert.ok(r.findings.some((x) => x.title.startsWith("항목명 중복")));
  assert.ok(
    r.findings.some(
      (x) => x.title === "항목별 산정·공제와 지급" && x.level === "unverified",
    ),
  );
  assert.match(settlementCheck(lines, "2130000", "10월").summary, /일치/);
});
test("settlement missing or invalid amounts are errors; actual zero and missing comparison differ", () => {
  const line = { name: "급여", kind: "pay" as const, value: "0", note: "" };
  const r = settlementCheck([line], "", "가상 직원");
  assert.equal(row(r, "재계산 지급액")![2], "0원");
  assert.ok(r.findings.some((x) => x.title === "대조 지급액 미입력"));
  for (const value of ["", "-1", "12,34", "10.5", "1e5", "=1+2"])
    assert.throws(() => settlementCheck([{ ...line, value }], "", "범위"));
  assert.throws(() => settlementCheck([line], "", ""), /범위/);
});
test("amount/date parsers reject rollover and malformed grouping; leap days are real", () => {
  assert.equal(amount("1,000원", "원"), 1000);
  assert.equal(dateValue("2024-02-29").getUTCDate(), 29);
  for (const value of ["2023-02-29", "2024-13-01", "1899-12-31", "2101-01-01"])
    assert.throws(() => dateValue(value));
});
test("annual comparison exposes each award and sample difference, not unused/payout days", () => {
  const r = leaveCheck(leave);
  assert.deepEqual(row(r, "누적 부여량"), ["누적 부여량", "41일", "33.5일"]);
  assert.equal(row(r, "입사일 기준 − 회사 기준")![1], "7.5일");
  assert.match(r.scope, /현재 잔여·최종 수당과 구분/);
  assert.ok(
    r.findings.some(
      (x) => x.title === "기간별 적용 법령" && x.level === "unverified",
    ),
  );
});
test("one-year contract ending before anniversary has only 11 monthly awards", () => {
  const before = leaveCheck({ ...leave, end: "2025-06-30" });
  const after = leaveCheck({ ...leave, end: "2025-07-01" });
  assert.equal(row(before, "누적 부여량")![1], "11일");
  assert.equal(row(after, "누적 부여량")![1], "26일");
});
test("first month boundary and same-day hire are handled without invented monthly grants", () => {
  assert.equal(
    row(leaveCheck({ ...leave, end: "2024-07-31" }), "누적 부여량")![1],
    "0일",
  );
  assert.equal(
    row(leaveCheck({ ...leave, end: "2024-08-01" }), "누적 부여량")![1],
    "1일",
  );
  assert.equal(
    row(leaveCheck({ ...leave, end: leave.start }), "누적 부여량")![1],
    "0일",
  );
});
test("January hire matching company basis and tenure increments are transparent", () => {
  const r = leaveCheck({
    ...leave,
    start: "2023-01-01",
    end: "2026-01-01",
    prorataMonths: "12",
  });
  assert.deepEqual(row(r, "누적 부여량"), ["누적 부여량", "57일", "57일"]);
  const cap = leaveCheck({
    ...leave,
    start: "2000-01-01",
    end: "2024-01-01",
    prorataMonths: "12",
  });
  assert.equal(row(cap, "2024-01-01 입사일 기준 부여")![1], "25일");
});
test("unconfirmed attendance/company rule, month-end hire and unsupported periods yield no zero placeholders", () => {
  for (const patch of [
    { eligible: false },
    { complete: false },
    { monthly: false },
    { companyRule: "" },
    { start: "2024-07-31" },
    { start: "1980-01-01", end: "2026-09-30" },
  ]) {
    const r = leaveCheck({ ...leave, ...patch });
    assert.equal(r.rows.length, 0);
    assert.match(r.summary, /보류/);
  }
  assert.throws(
    () => leaveCheck({ ...leave, end: "2023-01-01" }),
    /마지막 재직일/,
  );
  assert.throws(() => leaveCheck({ ...leave, prorataMonths: "13" }), /0~12/);
});
test("ledger uses confirmed units, reports difference and does not turn missing into zero", () => {
  const r = leaveCheck({ ...leave, mode: "ledger" });
  assert.equal(row(r, "검산 잔여")![1], "7.5일");
  assert.equal(row(r, "차이")![1], "1일");
  assert.throws(() => leaveCheck({ ...leave, mode: "ledger", carried: "" }));
  assert.match(
    leaveCheck({ ...leave, mode: "ledger", stated: "7.5" }).summary,
    /일치/,
  );
  assert.ok(
    leaveCheck({ ...leave, mode: "ledger", used: "20" }).findings.some(
      (x) => x.title === "음수 잔여",
    ),
  );
  assert.equal(
    row(
      leaveCheck({
        ...leave,
        mode: "ledger",
        granted: "0.1",
        carried: "0.2",
        used: "0.3",
        stated: "0",
      }),
      "검산 잔여",
    )![1],
    "0일",
  );
});
test("contract text preserves original blank line positions and never certifies keyword presence", () => {
  const r = contractCheck(
    "임금: 월 300만원, 수당을 포함한다.\n\n근무시간: 09:00~18:00\n연차·휴일은 회사 규정에 따른다.",
  );
  assert.match(row(r, "소정근로시간")![2], /3줄/);
  assert.match(row(r, "연차")![3], /보완 필요/);
  assert.ok(r.findings.some((x) => x.title === "수당 포함 조건"));
  assert.ok(r.findings.some((x) => x.title === "참조 규정 확인"));
  assert.ok(r.findings.some((x) => x.title === "지급방법 확인"));
  assert.match(r.scope, /적법성 판정.*별도/);
});
test("recruitment contrasts named terms, treats addresses cautiously and labels recommendations", () => {
  const r = recruitmentCheck(
    "고용형태: 정규직\n근무지: 서울\n본문 고용형태: 6개월 계약직 후 정규직 전환 검토\n근무지: 판교\n수습 3개월\n서류 → 면접",
  );
  assert.ok(
    r.findings.some(
      (x) => x.title === "고용형태 불일치" && x.level === "difference",
    ),
  );
  assert.ok(
    r.findings.some(
      (x) => x.title === "근무지 표기 차이" && x.level === "check",
    ),
  );
  assert.match(
    r.findings.find((x) => x.title === "급여 조건 안내 보완")!.action,
    /법적 필수라는 의미는 아니/,
  );
  assert.deepEqual(r.sourceIds, []);
  assert.equal(
    recruitmentCheck(
      "고용형태: 정규직\n근무지: 서울\n본문 고용형태: 정규직\n근무지: 서울",
    ).findings.some((x) => x.title === "고용형태 불일치"),
    false,
  );
});
test("text limits and result exports include reasons, sources and user opinion", () => {
  assert.throws(() => contractCheck(""), /10자/);
  assert.throws(() => recruitmentCheck("가".repeat(200001)), /20만/);
  const text = resultText(lawGuide(law), "담당자가 합의를 확인할 예정");
  assert.match(text, /1350.moel.go.kr/);
  assert.match(text, /담당자가 합의를 확인할 예정/);
  assert.match(text, /근로기준법 제36조/);
});
