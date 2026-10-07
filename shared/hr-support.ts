/** Deterministic checks. No generated legal conclusions or external AI calls. */
import { reviewContract, reviewRecruitment } from "./document-review.js";
import { reviewLaw } from "./law-review.js";
export const SOURCE_CHECKED = "2026-10-07";
export const sources = {
  payment: {
    name: "퇴직 시 지급기한 · 고용노동부",
    url: "https://1350.moel.go.kr/rtmview.do?id=1000271860",
    law: "근로기준법 제36조·근로자퇴직급여 보장법 제9조",
  },
  contract: {
    name: "근로조건 명시 · 고용노동부",
    url: "https://1350.moel.go.kr/rtmview.do?id=1000320012",
    law: "근로기준법 제17조",
  },
  leave: {
    name: "연차 산정 기준 · 고용노동부",
    url: "https://1350.moel.go.kr/rtmview.do?id=1000012468",
    law: "근로기준법 제60조·관련 행정해석",
  },
  paymentArticle: {
    name: "금품 청산 · 국가법령정보센터",
    url: "https://law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029728519",
    law: "근로기준법 제36조",
  },
  contractArticle: {
    name: "근로조건의 명시 · 국가법령정보센터",
    url: "https://law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1029728107",
    law: "근로기준법 제17조",
  },
  breaks: {
    name: "휴게시간과 시행일 · 고용노동부",
    url: "https://1350.moel.go.kr/rtmview.do?id=1000323934",
    law: "근로기준법 제54조",
  },
  penalties: {
    name: "위약 예정의 금지 · 국가법령정보센터",
    url: "https://law.go.kr/lsLawLinkInfo.do?chrClsCd=010202&lsJoLnkSeq=1000113024",
    law: "근로기준법 제20조",
  },
} as const;
export type SourceId = keyof typeof sources;
export type Finding = {
  title: string;
  level: "difference" | "check" | "unverified" | "info";
  evidence: string;
  action: string;
  source?: SourceId;
  reason?: string;
  suggestion?: string;
};
export type SupportResult = {
  title: string;
  summary: string;
  scope: string;
  columns: string[];
  rows: string[][];
  findings: Finding[];
  checklist: string[];
  context: string[];
  sourceIds: SourceId[];
  presentation?: "review" | "guide";
  steps?: string[];
};
export function dateValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("날짜를 YYYY-MM-DD 형식으로 입력해 주세요.");
  const date = new Date(value + "T00:00:00Z");
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value ||
    value < "1900-01-01" ||
    value > "2100-12-31"
  )
    throw new Error("실제로 존재하는 1900~2100년 날짜를 입력해 주세요.");
  return date;
}
export function amount(value: string, label: string, decimals = false) {
  const s = value.trim().replace(/원$/, "").trim();
  const pattern = decimals
    ? /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,4})?$/
    : /^(?:\d+|\d{1,3}(?:,\d{3})+)$/;
  if (!pattern.test(s))
    throw new Error(
      label +
        ": 빈 값이나 음수가 아닌 숫자로 입력해 주세요." +
        (decimals
          ? " 소수점 4자리까지 지원해요."
          : " 금액은 원 단위 정수예요."),
    );
  const n = Number(s.replaceAll(",", ""));
  if (!Number.isFinite(n) || n > 1e12)
    throw new Error(label + ": 지원 범위(0~1조)를 넘었어요.");
  return n;
}
const fmt = (n: number) =>
  n.toLocaleString("ko-KR", { maximumFractionDigits: 4 });
const base = (title: string, scope: string): SupportResult => ({
  title,
  scope,
  columns: [],
  summary: "",
  rows: [],
  findings: [],
  checklist: [],
  context: [],
  sourceIds: [],
});

export type LawInput = {
  question: string;
  topic: "payment" | "leave" | "contract";
  eventDate: string;
  agreement: "unknown" | "yes" | "no";
  endMeaning: "unknown" | "last" | "ended";
  plannedDate?: string;
  workers?: "unknown" | "under5" | "fivePlus";
  weeklyHours?: string;
  tenure?: "unknown" | "underYear" | "yearPlus";
  attendance?: "unknown" | "under80" | "atLeast80";
  contractIssue?: "auto" | "written" | "includedPay" | "rest" | "penalty";
};
export function recommendTopics(question: string): SourceId[] {
  const found: SourceId[] = [];
  if (/퇴사|퇴직|근로관계\s*종료/.test(question)) found.push("payment");
  if (/연차|휴가|개근|출근율/.test(question)) found.push("leave");
  if (
    /계약|근로조건|휴게|근무시간|수당\s*포함|포괄|위약금|손해배상/.test(
      question,
    )
  )
    found.push("contract");
  return found;
}
export function lawGuide(input: LawInput): SupportResult {
  return reviewLaw(input, SOURCE_CHECKED);
}

export type SettlementLine = {
  name: string;
  kind: "pay" | "deduction";
  value: string;
  note: string;
};
export function settlementCheck(
  lines: SettlementLine[],
  claimed: string,
  scope: string,
): SupportResult {
  if (!scope.trim()) throw new Error("정산 기간·대상·범위를 입력해 주세요.");
  if (!lines.length || lines.length > 500)
    throw new Error("정산 항목은 1~500개까지 지원해요.");
  const r = base(
    "퇴사 정산 검토표",
    "입력된 지급·공제 항목의 합계 대조. 개별 산정·공제 적법성·퇴직급여·실제 지급은 별도 검토.",
  );
  let pay = 0,
    deduction = 0;
  r.columns = ["항목", "지급·공제", "금액 (원)", "산정 근거"];
  const names = new Set<string>();
  lines.forEach((line, i) => {
    if (!line.name.trim())
      throw new Error(i + 1 + "행: 항목명을 입력해 주세요.");
    if (line.kind !== "pay" && line.kind !== "deduction")
      throw new Error(i + 1 + "행: 지급·공제 구분을 확인해 주세요.");
    const v = amount(line.value, i + 1 + "행 " + line.name);
    if (line.kind === "pay") pay += v;
    else deduction += v;
    r.rows.push([
      line.name,
      line.kind === "pay" ? "지급" : "공제",
      fmt(v) + "원",
      line.note || "산정 근거 미제공",
    ]);
    if (names.has(line.name.trim()))
      r.findings.push({
        title: "항목명 중복 · " + line.name,
        level: "check",
        evidence:
          i + 1 + "행에 동일한 항목명이 있어요. 합계에는 모든 행을 포함했어요.",
        action:
          "중복 지급인지 서로 다른 기간·항목인지 확인하세요. 원본 행을 자동 제외하지 않아요.",
      });
    names.add(line.name.trim());
  });
  const total = pay - deduction;
  r.rows.push(
    ["지급 합계", "합계", fmt(pay) + "원", "모든 지급 행"],
    ["공제 합계", "합계", fmt(deduction) + "원", "모든 공제 행"],
    ["재계산 지급액", "검산", fmt(total) + "원", "지급 합계 − 공제 합계"],
  );
  r.context = ["정산 범위: " + scope, "단위: 원 · 입력된 항목의 합계만 계산"];
  if (claimed.trim()) {
    const entered = amount(claimed, "기재 지급액"),
      diff = total - entered;
    r.rows.push(
      ["기재 지급액", "대조", fmt(entered) + "원", "사용자가 확인할 대상"],
      ["차이", "재계산 − 기재액", fmt(diff) + "원", "추가 지급 확정액이 아님"],
    );
    r.summary =
      diff === 0
        ? "합계가 일치해요. 개별 항목의 산정과 실제 지급까지 검증된 것은 아니에요."
        : "합계가 " +
          fmt(Math.abs(diff)) +
          "원 달라요. 수식·집계 범위·누락 항목을 확인하세요.";
    r.findings.push({
      title: "지급액 대조",
      level: diff === 0 ? "info" : "difference",
      evidence:
        fmt(pay) +
        " − " +
        fmt(deduction) +
        " = " +
        fmt(total) +
        "원 / 기재액 " +
        fmt(entered) +
        "원",
      action:
        diff === 0
          ? "아래 미검증 항목을 따로 확인하세요."
          : "차이를 실제 미지급액으로 단정하지 말고 항목 원장과 합계 수식을 대조하세요.",
    });
  } else {
    r.summary =
      "입력 항목의 합계를 계산했어요. 기재 지급액이 없어 일치 여부는 확인하지 않았어요.";
    r.findings.push({
      title: "대조 지급액 미입력",
      level: "unverified",
      evidence: "재계산 지급액만 제공해요.",
      action: "회사 정산표의 지급액을 입력하면 차이를 대조할 수 있어요.",
    });
  }
  r.findings.push({
    title: "항목별 산정·공제와 지급",
    level: "unverified",
    evidence:
      "산정 근거 메모는 사용자 입력이에요. 금액의 타당성·공제 근거·지급 증빙은 자동 검증하지 않아요.",
    action: "급여·근태·연차 원장, 공제 상세, 지급 증빙을 확인하세요.",
  });
  r.checklist = [
    "정산 기간과 모든 지급·공제 항목의 포함 여부",
    "급여·근태·미사용 연차 원장 및 적용 단가",
    "공제 상세와 적용 근거",
    "퇴직급여의 별도 정산·지급 현황",
    "실제 지급액과 증빙",
  ];
  return r;
}

export type LeaveInput = {
  mode: "comparison" | "ledger";
  start: string;
  end: string;
  eligible: boolean;
  complete: boolean;
  monthly: boolean;
  prorataMonths: string;
  granted: string;
  carried: string;
  used: string;
  expired: string;
  adjustment: string;
  stated: string;
  companyRule: string;
};
function shifted(date: Date, months: number) {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1),
  );
  d.setUTCDate(
    Math.min(
      date.getUTCDate(),
      new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
      ).getUTCDate(),
    ),
  );
  return d;
}
export function leaveCheck(input: LeaveInput): SupportResult {
  if (input.mode !== "comparison" && input.mode !== "ledger")
    throw new Error("점검 방식을 다시 선택해 주세요.");
  const r = base(
    "연차 기준 비교·검산",
    input.mode === "ledger"
      ? "같은 범위의 입력 발생·이월·사용·소멸·조정 내역 검산. 법정 발생량 산정과 구분."
      : "확인한 단순 근무 조건과 회사의 1월 1일·개월 비례 기준으로 누적 부여량 비교. 현재 잔여·최종 수당과 구분.",
  );
  r.sourceIds = ["leave"];
  r.columns =
    input.mode === "ledger"
      ? ["항목", "일수 (일)"]
      : ["부여 항목", "입사일 기준 (일)", "회사 기준 (일)"];
  r.context = [
    "회사 기준·검토 범위: " + (input.companyRule || "미제공"),
    "자료 확인일: " + SOURCE_CHECKED,
  ];
  if (input.mode === "ledger") {
    const grant = amount(input.granted, "발생·부여", true),
      carry = amount(input.carried, "이월", true),
      use = amount(input.used, "사용", true),
      expire = amount(input.expired, "소멸", true),
      adjust = amount(input.adjustment, "추가 부여 조정", true);
    const result =
      Math.round((grant + carry + adjust - use - expire) * 10000) / 10000;
    r.rows = [
      ["발생·부여", fmt(grant) + "일"],
      ["이월", fmt(carry) + "일"],
      ["사용", fmt(use) + "일"],
      ["소멸", fmt(expire) + "일"],
      ["추가 부여 조정", fmt(adjust) + "일"],
      ["검산 잔여", fmt(result) + "일"],
    ];
    if (result < 0)
      r.findings.push({
        title: "음수 잔여",
        level: "check",
        evidence: "입력 차감량이 부여량보다 커요.",
        action: "집계 기간·휴가 종류·선사용 정책·누락 부여량을 확인하세요.",
      });
    if (input.stated.trim()) {
      const stated = amount(input.stated, "대장 잔여", true),
        difference = Math.round((result - stated) * 10000) / 10000;
      r.rows.push(
        ["대장 잔여", fmt(stated) + "일"],
        ["차이", fmt(difference) + "일"],
      );
      r.summary =
        difference === 0
          ? "입력 범위의 잔여 계산이 일치해요."
          : "잔여 계산이 " + fmt(Math.abs(difference)) + "일 달라요.";
      r.findings.push({
        title: "대장 대조",
        level: difference === 0 ? "info" : "difference",
        evidence: "발생 + 이월 + 조정 − 사용 − 소멸 = " + fmt(result) + "일",
        action:
          "서로 같은 기간·휴가 종류의 자료인지 확인하세요. 발생량의 법적 타당성은 별도예요.",
      });
    } else
      r.summary =
        "입력한 내역으로 잔여를 계산했어요. 대장 잔여는 미입력이라 대조하지 않았어요.";
    r.findings.push({
      title: "법정 발생량·자료 완전성",
      level: "unverified",
      evidence:
        "발생량과 내역은 사용자 입력이며 원장 진위·빠진 기록을 자동 확인하지 않아요.",
      action: "원장·발생 기준·조정 내역과 대조하세요.",
      source: "leave",
    });
  } else {
    const start = dateValue(input.start),
      end = dateValue(input.end);
    if (end < start)
      throw new Error("마지막 재직일은 입사일과 같거나 늦어야 해요.");
    r.context.push("입사일: " + input.start, "마지막 재직일: " + input.end);
    r.findings.push({
      title: "기간별 적용 법령",
      level: "unverified",
      evidence:
        "계산은 자료 확인일의 안내와 입력 조건을 사용해요. 재직 기간 전체의 과거·미래 법령 연혁은 검증하지 않았어요.",
      action: "사건 시점의 적용 기준과 회사 규정 변경 이력을 따로 확인하세요.",
      source: "leave",
    });
    if (
      !input.eligible ||
      !input.complete ||
      !input.monthly ||
      start.getUTCDate() > 28 ||
      end > shifted(start, 480) ||
      !input.companyRule.trim()
    ) {
      r.summary =
        "현재 지원 계산의 적용 조건을 확인하지 못해 부여량 계산을 보류했어요.";
      r.findings.push({
        title: "비교 계산 조건",
        level: "unverified",
        evidence:
          "상시 5인 이상·주 15시간 이상, 계속근로·출근율 80% 이상·휴직 없음, 첫해 매월 개근, 회사의 1월 1일·개월 비례 규칙 확인이 필요해요. 29~31일 입사와 40년 초과 재직은 이 도구의 산정 범위 밖이에요.",
        action:
          "조건에 맞지 않거나 모르면 근로·출근·규정 자료와 공식 상담으로 별도 검토하세요. 대장 숫자는 ‘잔여 검산’에서 대조할 수 있어요.",
        source: "leave",
      });
      r.checklist = [
        "사업장 적용 범위와 주 소정근로시간",
        "근로·출근·휴직 이력",
        "회사 비례 부여·반올림·퇴사 정산 규정",
      ];
      return r;
    }
    const months = amount(input.prorataMonths, "회사 첫해 비례 개월 수", true);
    if (months > 12) throw new Error("회사 비례 개월 수는 0~12 사이예요.");
    let entry = 0,
      company = 0;
    for (let m = 1; m <= 11; m++)
      if (shifted(start, m) <= end) {
        entry++;
        company++;
      }
    r.rows.push(["1년 미만 개근분", fmt(entry) + "일", fmt(company) + "일"]);
    for (let year = 1; year <= 40; year++) {
      const anniversary = shifted(start, year * 12);
      if (anniversary > end) break;
      const days = Math.min(25, 15 + Math.floor((year - 1) / 2));
      entry += days;
      r.rows.push([
        anniversary.toISOString().slice(0, 10) + " 입사일 기준 부여",
        fmt(days) + "일",
        "—",
      ]);
    }
    for (
      let year = start.getUTCFullYear() + 1;
      year <= end.getUTCFullYear();
      year++
    ) {
      const january = new Date(Date.UTC(year, 0, 1));
      if (january > end) break;
      let tenure = year - start.getUTCFullYear();
      if (shifted(start, tenure * 12) > january) tenure--;
      const days =
        year === start.getUTCFullYear() + 1
          ? (15 * months) / 12
          : Math.min(25, 15 + Math.floor((tenure - 1) / 2));
      company += days;
      r.rows.push([year + "-01-01 회사 기준 부여", "—", fmt(days) + "일"]);
    }
    const diff = Math.round((entry - company) * 10000) / 10000;
    r.rows.push(
      ["누적 부여량", fmt(entry) + "일", fmt(company) + "일"],
      [
        "입사일 기준 − 회사 기준",
        fmt(diff) + "일",
        "현재 잔여·지급 대상 일수가 아님",
      ],
    );
    r.summary =
      "누적 부여량은 입사일 기준 " +
      fmt(entry) +
      "일, 입력한 회사 기준 " +
      fmt(company) +
      "일이에요.";
    r.context.push(
      "확인 조건: 상시 5인 이상·주 15시간 이상, 출근율 80% 이상·휴직 없음·첫해 매월 개근",
      "회사 첫해 비례분: 15 × " + months + " ÷ 12. 소수 반올림 없음.",
    );
    r.findings.push(
      {
        title: "기준별 차이",
        level: diff === 0 ? "info" : "check",
        evidence:
          "누적 부여량 차이 " +
          fmt(diff) +
          "일. 발생 시점과 첫 비례 부여가 달라요.",
        action:
          "차이만으로 미지급 수당을 확정하지 말고 회사 규정과 공식 안내에 따른 퇴사 정산을 확인하세요.",
        source: "leave",
      },
      {
        title: "현재 잔여와 금액 정산",
        level: "unverified",
        evidence: "사용·소멸·기지급 수당과 적용 단가를 입력하지 않았어요.",
        action: "원장·지급 이력·정산 규정과 대조하세요.",
      },
    );
  }
  r.checklist = [
    "같은 재직·집계 범위의 원장",
    "사용·이월·소멸·조정·기지급 수당",
    "회사 부여·퇴사 정산 규정",
    "적용 단가와 근거",
  ];
  return r;
}

export function contractCheck(text: string): SupportResult {
  return reviewContract(text);
}
export function recruitmentCheck(text: string): SupportResult {
  return reviewRecruitment(text);
}
export function resultText(result: SupportResult, note: string) {
  return [
    result.title,
    result.summary,
    "검토 범위: " + result.scope,
    ...result.context,
    "",
    "[대조표]",
    result.columns.join(" | "),
    ...result.rows.map((row) => row.join(" | ")),
    "",
    "[확인 항목]",
    ...result.findings.map((f) =>
      [
        f.title,
        f.evidence,
        ...(f.reason ? ["이유: " + f.reason] : []),
        "다음 행동: " + f.action,
        ...(f.suggestion ? ["수정·확인 예시: " + f.suggestion] : []),
        ...(f.source
          ? [sources[f.source].law + " " + sources[f.source].url]
          : []),
      ].join("\n"),
    ),
    "",
    "[준비할 자료·체크리스트]",
    ...(result.steps || []).map(
      (step, i) => "처리 순서 " + (i + 1) + ": " + step,
    ),
    ...result.checklist.map((x) => "- " + x),
    ...result.sourceIds.map(
      (id) =>
        sources[id].name +
        " / " +
        sources[id].law +
        " / " +
        sources[id].url +
        " / 확인일 " +
        SOURCE_CHECKED,
    ),
    "",
    "[담당자 의견]",
    note || "미작성",
  ].join("\n");
}
