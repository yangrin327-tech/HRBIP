import type { LawInput, SupportResult } from "./hr-support.js";
import { documentLines } from "./document-review.js";

const DAY = 86400000;
function date(value: string) {
  const parsed = new Date(value + "T00:00:00Z");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value ||
    value < "1900-01-01" ||
    value > "2100-12-31"
  )
    throw new Error("실제로 존재하는 1900~2100년 날짜를 입력해 주세요.");
  return parsed;
}
export function reviewLaw(input: LawInput, checked: string): SupportResult {
  if (!["payment", "leave", "contract"].includes(input.topic))
    throw new Error("확인할 쟁점을 다시 선택해 주세요.");
  if (
    !["unknown", "yes", "no"].includes(input.agreement) ||
    !["unknown", "last", "ended"].includes(input.endMeaning)
  )
    throw new Error("입력 조건을 다시 확인해 주세요.");
  documentLines(input.question);
  if (input.eventDate) date(input.eventDate);
  const r: SupportResult = {
    title: "상황 기반 법령·대응 가이드",
    scope:
      "확인한 조건에 따른 대응 준비와 공식 조문 설명이에요. 개별 사건의 법적 판정·사건 시점의 연혁 검증은 별도예요.",
    summary: "",
    columns: ["판단에 쓰는 조건", "입력·계산 결과", "대응에 미치는 영향"],
    rows: [],
    findings: [],
    checklist: [],
    context: [
      "입력 상황: " + input.question,
      "사건 기준일: " + (input.eventDate || "미확인"),
      "공식 자료 확인일: " + checked,
    ],
    sourceIds: [],
    presentation: "guide",
    steps: [],
  };
  if (!input.eventDate || input.eventDate !== checked)
    r.findings.push({
      title: "사건 시점의 법령 확인",
      level: "unverified",
      evidence: `입력한 사건일 ${input.eventDate || "미확인"}, 자료 확인일 ${checked}.`,
      reason:
        "사건일에 시행 중인 법령·부칙은 자동 대조하지 않았어요. 다른 시점의 안내를 그대로 적용하면 기준이 달라질 수 있어요.",
      action:
        "연결한 공식 원문에서 사건일의 시행일·연혁·부칙을 먼저 확인하세요.",
      source: input.topic,
    });
  if (input.topic === "payment") {
    r.summary =
      "정기 급여일만으로 퇴직 정산일을 확정할 수 없어요. 종료 시점·지급 계획·연장 합의를 대조해 처리 순서를 정리했어요.";
    r.sourceIds = ["paymentArticle", "payment"];
    r.rows.push([
      "지급사유 발생일",
      input.eventDate || "미확인",
      input.endMeaning === "ended"
        ? "근로관계 종료 시점으로 입력했어요. 그 사실은 종료 기록으로 확인하세요."
        : "마지막 근무일과 지급사유 발생일을 같은 날로 자동 취급하지 않아요.",
    ]);
    r.findings.push({
      title: "이 상황에서 14일 기준을 확인하는 이유",
      level: "info",
      evidence: "선택한 쟁점은 퇴직한 직원의 임금 등 최종 정산이에요.",
      reason:
        "제36조는 퇴직 시 금품 청산을 지급사유 발생 후 14일 안에 하도록 정해요. 평소 급여일이 있다는 사실만으로 이 기준이 연장되지 않아요. 퇴직급여는 해당 제도와 별도 근거도 확인해야 해요.",
      action:
        "종료 기록으로 지급사유 발생일을 확인하고, 미지급 금품과 지급 계획을 목록으로 만드세요.",
      source: "paymentArticle",
    });
    if (input.endMeaning !== "ended" || !input.eventDate)
      r.findings.push({
        title: "종료일 의미 확인",
        level: "check",
        evidence:
          input.endMeaning === "last"
            ? "입력 날짜는 마지막 근무·재직일이에요."
            : "지급사유 발생일 또는 입력 날짜의 의미가 미확인이에요.",
        reason:
          "출근을 마지막으로 한 날과 근로관계가 종료된 시점이 다르면 지급기한의 출발점도 달라질 수 있어요.",
        action:
          "퇴사 승인·근로관계 종료 기록으로 기준일을 확정하세요. 그 전에는 비교일을 계산하지 않아요.",
      });
    const plan = input.plannedDate || "";
    if (plan) date(plan);
    if (input.eventDate && input.endMeaning === "ended") {
      const start = date(input.eventDate),
        reference = new Date(start.getTime() + 14 * DAY);
      const referenceText = reference.toISOString().slice(0, 10);
      r.rows.push([
        "14일 단순 비교일",
        referenceText,
        "발생일 다음 날부터 14일을 더한 달력값. 초일 산입·말일 휴일·합의·법령 연혁을 반영한 확정 만료일은 아니에요.",
      ]);
      if (plan) {
        const elapsed = Math.round(
          (date(plan).getTime() - start.getTime()) / DAY,
        );
        if (elapsed < 0)
          throw new Error(
            "지급 예정일은 입력한 근로관계 종료 시점과 같거나 늦어야 해요.",
          );
        r.rows.push([
          "지급 계획의 경과일",
          `${plan} · ${elapsed}일 경과`,
          elapsed > 14
            ? "일반 14일 달력 범위를 넘는 계획"
            : "일반 14일 달력 범위 안의 계획 · 실제 지급은 별도 확인",
        ]);
        if (elapsed > 14)
          r.findings.push({
            title: "지급 계획 재검토",
            level: "check",
            evidence: `입력 종료 시점 ${input.eventDate} → 예정일 ${plan}: ${elapsed}일. 14일 단순 비교일은 ${referenceText}예요.`,
            reason:
              input.agreement === "yes"
                ? "지급 계획이 일반 14일 범위를 넘어요. 합의가 있다는 선택만으로 특별한 사정·기한·합의의 효력이 확인되지는 않아요."
                : "지급 계획이 일반 14일 범위를 넘고, 유효한 기일 연장 합의가 확인되지 않았어요. 단순히 다음 급여일에 묶어 처리하기에는 추가 확인이 필요해요.",
            action:
              "법적 기간 계산과 연장 합의를 먼저 확인하고, 합의가 확인되지 않으면 담당자에게 별도 정산 일정을 요청하세요.",
            suggestion: `지급사유 발생일: ${input.eventDate}. 지급 계획: ${plan}. 일반 비교일: ${referenceText}. [기간 계산·연장 합의 확인 결과]에 따라 지급일을 재확인한다.`,
            source: "paymentArticle",
          });
      } else
        r.rows.push([
          "지급 예정일",
          "미입력",
          "계획이 일반 14일 범위 안인지 아직 비교하지 않았어요.",
        ]);
    }
    r.findings.push({
      title: "지급기일 연장 합의",
      level: input.agreement === "unknown" ? "check" : "info",
      evidence:
        input.agreement === "yes"
          ? "합의가 있다고 입력했지만 내용과 효력은 검증하지 않았어요."
          : input.agreement === "no"
            ? "연장 합의가 없다고 입력했어요."
            : "합의 여부를 아직 확인하지 않았어요.",
      reason:
        "제36조의 연장은 특별한 사정과 당사자 합의가 관련돼요. 회사의 정기 지급일이나 일방 통보만으로 합의가 확인되지는 않아요.",
      action:
        input.agreement === "no"
          ? "정기 급여일과 분리해서 지급 일정을 확인하고 미지급 항목별 금액·처리일을 담당자에게 요청하세요."
          : "합의 내용·사유·시점·새 지급기일·증빙을 확보하고 효력이 쟁점이면 해당 자료로 상담하세요.",
      source: "paymentArticle",
    });
    r.steps = [
      "종료 기록에서 지급사유 발생일 확인",
      "미지급 임금·수당·기타 금품과 퇴직급여 제도를 구분해 목록 작성",
      "14일 기준과 지급 계획 비교 → 특별한 사정·연장 합의 확인",
      "항목별 금액·지급일을 서면으로 요청하고 지급 내역을 보관; 미지급이 계속되면 1350·관할 노동관서 상담 준비",
    ];
    r.checklist = [
      "퇴사 승인·근로관계 종료 기록",
      "근로계약서·급여명세서·실제 입금 내역",
      "미지급 항목·금액·지급 예정일 목록",
      "기일 연장 합의와 회사 답변 기록",
    ];
  } else if (input.topic === "leave") {
    const workers = input.workers || "unknown",
      tenure = input.tenure || "unknown",
      attendance = input.attendance || "unknown";
    if (
      !["unknown", "under5", "fivePlus"].includes(workers) ||
      !["unknown", "underYear", "yearPlus"].includes(tenure) ||
      !["unknown", "under80", "atLeast80"].includes(attendance)
    )
      throw new Error("연차 적용 조건을 다시 선택해 주세요.");
    const hoursText = input.weeklyHours || "";
    if (
      hoursText &&
      (!/^\d+(?:\.\d{1,2})?$/.test(hoursText) || Number(hoursText) > 168)
    )
      throw new Error("주 소정근로시간은 0~168 사이의 숫자로 입력해 주세요.");
    const hours = hoursText ? Number(hoursText) : undefined;
    r.sourceIds = ["leave"];
    r.rows = [
      [
        "상시근로자 수",
        workers === "under5"
          ? "5인 미만"
          : workers === "fivePlus"
            ? "5인 이상"
            : "미확인",
        "제60조 적용 범위 확인",
      ],
      [
        "4주 평균 주 소정근로시간",
        hours === undefined ? "미확인" : `${hours}시간`,
        "주 15시간 미만 여부 확인",
      ],
      [
        "계속근로기간",
        tenure === "underYear"
          ? "1년 미만"
          : tenure === "yearPlus"
            ? "1년 이상"
            : "미확인",
        "월별 개근과 연 단위 부여를 구분",
      ],
      [
        "출근율",
        attendance === "atLeast80"
          ? "80% 이상"
          : attendance === "under80"
            ? "80% 미만"
            : "미확인",
        "출근율·개근·법정 간주 출근 기간 확인",
      ],
    ];
    if (workers === "under5" || (hours !== undefined && hours < 15)) {
      r.summary =
        "입력 조건에서는 제60조의 일반 연차 기준을 바로 적용하기 어려워요. 회사가 별도로 약정한 휴가를 먼저 확인하세요.";
      r.findings.push({
        title: "일반 연차 기준 적용 범위",
        level: "check",
        evidence: `${workers === "under5" ? "상시근로자 5인 미만. " : ""}${hours !== undefined ? `4주 평균 주 소정근로시간 ${hours}시간.` : ""}`,
        reason:
          "상시 5인 이상·주 15시간 이상 등 적용 조건을 확인해야 제60조 기준으로 계산할 수 있어요. 적용 제외와 회사 약정 휴가는 별개예요.",
        action:
          "상시 인원 산정·근로시간을 재확인하고 계약서·취업규칙의 별도 유급휴가 약정을 확인하세요. 연차를 0일로 확정하지 않아요.",
        source: "leave",
      });
    } else if (
      workers === "unknown" ||
      hours === undefined ||
      tenure === "unknown" ||
      (tenure === "yearPlus" && attendance === "unknown")
    ) {
      r.summary =
        "적용 조건이 일부 미확인이어서 발생 일수를 확정하지 않았어요. 아래 조건부터 채우면 어떤 기준을 확인할지 좁힐 수 있어요.";
      r.findings.push({
        title: "연차 계산 전 필요한 조건",
        level: "check",
        evidence: r.rows
          .filter((x) => x[1] === "미확인")
          .map((x) => x[0])
          .join(", "),
        reason:
          "입사일만으로는 적용 범위·출근 조건·발생 시점을 확인할 수 없어요.",
        action:
          "인원·4주 평균 소정근로시간·계속근로기간·출근 자료를 확인해서 다시 점검하세요.",
        source: "leave",
      });
    } else {
      const monthly = tenure === "underYear" || attendance === "under80";
      r.summary = monthly
        ? "입력 조건에서는 월별 개근에 따른 부여를 확인할 차례예요. 입사·출근 기록과 월별 발생 내역을 대조하세요."
        : "입력 조건에서는 연 단위 15일 기준과 근속 가산을 확인할 차례예요. 실제 발생일·재직·부여 내역과 대조하세요.";
      r.findings.push({
        title: monthly
          ? "월별 개근 기준을 확인하는 이유"
          : "연 단위 부여 기준을 확인하는 이유",
        level: "info",
        evidence: r.rows.map((x) => `${x[0]}: ${x[1]}`).join("\n"),
        reason: monthly
          ? "제60조제2항은 1년 미만 또는 1년간 출근율 80% 미만인 경우 월별 개근에 따른 1일 부여 기준을 두고 있어요. 실제 개근 월은 입력하지 않아 합계는 계산하지 않았어요."
          : "제60조제1항은 1년간 80% 이상 출근한 경우 15일 기준을 두고, 계속근로연수에 따른 가산은 제4항에서 다뤄요. 실제 계속근로·발생일과 추가 조건은 재확인이 필요해요.",
        action:
          "연차대장의 발생·사용·소멸을 같은 기간으로 맞춰 대조하고, 입사일·회사 기준 비교가 필요하면 연차 기준 비교·검산 도구를 사용하세요.",
        source: "leave",
      });
    }
    r.steps = [
      "상시 인원·근로시간과 제60조 적용 여부 확인",
      "계속근로기간·출근율·월별 개근·휴직 및 간주 출근 기간 정리",
      "입사일/회사 기준의 발생일·부여 내역을 같은 재직 범위로 비교",
      "사용·소멸·기지급 내역을 대조하고 차이가 나는 월·조항을 담당자에게 확인",
    ];
    r.checklist = [
      "근로계약서·근로시간·상시 인원 자료",
      "입사·휴직·출근·개근 기록",
      "취업규칙·회사 부여 기준",
      "연차대장·휴가 사용·수당 지급 이력",
    ];
  } else {
    const chosen = input.contractIssue || "auto";
    if (!["auto", "written", "includedPay", "rest", "penalty"].includes(chosen))
      throw new Error("근로조건 세부 쟁점을 다시 선택해 주세요.");
    const issue =
      chosen !== "auto"
        ? chosen
        : /위약금|손해배상/.test(input.question)
          ? "penalty"
          : /휴게|점심시간/.test(input.question)
            ? "rest"
            : /포괄|수당.{0,15}포함/.test(input.question)
              ? "includedPay"
              : "written";
    const branch = {
      written: {
        source: "contractArticle" as const,
        title: "서면 근로조건을 확인하는 이유",
        summary:
          "계약서가 있다는 사실보다 임금 구성·근로시간·휴일·연차 등의 실제 명시와 교부 여부를 확인해야 해요.",
        reason:
          "제17조는 주요 근로조건의 명시와 해당 사항의 서면 교부를 다뤄요. 제목이나 '회사 규정'이라는 문구만으로 실제 조건과 제공 자료를 확인할 수 없어요.",
        action:
          "전체 계약서와 임금 구성표·참조 규정을 모으고, 실제 금액·시각·휴일·지급방법을 근로계약 확인 도구에서 대조하세요.",
        example:
          "누락된 항목: [항목명]. 명시할 조건: [금액·시간·방법]. 연결할 첨부: [규정명·조항]. 교부일: [확인한 날짜].",
      },
      includedPay: {
        source: "contractArticle" as const,
        title: "수당 포함 약정에서 확인할 조건",
        summary:
          "'수당 포함'만으로 정산 범위를 알 수 없어요. 기본급·포함 금액·시간·초과분 처리를 분리해서 확인하세요.",
        reason:
          "임금의 구성·계산·지급방법이 읽혀야 포함된 수당을 실제 근로와 대조할 수 있어요. 포함 문구가 있다는 사실만으로 약정의 효력이나 지급 완료를 인정하지 않아요.",
        action:
          "수당별 금액, 포함 시간, 계산방법, 실제 근로 기록, 초과분 정산 내역을 요청하고 서로 대조하세요.",
        example:
          "기본급 [금액]원 / 고정 수당 [금액]원 / 월 [시간]시간분 / 계산 [산식] / 초과분 [정산 기준].",
      },
      rest: {
        source: "breaks" as const,
        title: "출퇴근 시각과 휴게를 분리하는 이유",
        summary:
          "먼저 근무 구간에서 실제 휴게를 분리하세요. 출퇴근 시각만으로 근로시간과 휴게 기준을 확인할 수 없어요.",
        reason:
          "자료 확인일의 제54조 일반 기준은 4시간 근로 시 30분, 8시간 근로 시 1시간 이상의 휴게를 근로시간 도중에 두는 방식이에요. 근로자의 자유 이용도 확인해야 해요. 4시간 근로의 명시적 휴게 면제 요청 관련 개정은 2026-12-10 시행 예정이므로 사건 시점을 확인해야 해요.",
        action:
          "실제 근무 구간·휴게 시각·휴게 중 지시나 대기 여부를 정리하세요. 계약서의 명시된 시간은 근로계약 확인 도구에서 검산할 수 있어요.",
        example:
          "근무 [시작]~[종료] / 휴게 [시작]~[종료] / 근로시간=근무 구간−실제 휴게 / 휴게 중 업무 지시 [확인 결과].",
      },
      penalty: {
        source: "penalties" as const,
        title: "퇴사 위약금 약정을 먼저 검토하는 이유",
        summary:
          "퇴사·계약 불이행에 고정 위약금이나 손해배상액을 연결한 조항은 지급·공제 전에 구체적으로 검토해야 해요.",
        reason:
          "제20조는 근로계약 불이행에 대한 위약금·손해배상액을 미리 정하는 계약을 금지해요. 실제 발생 손해나 교육비 반환 약정은 사실관계를 구분해서 검토해야 해요.",
        action:
          "문제 조항·약정 경위·비용과 실제 손해 증빙을 모으고, 자동 공제나 지급 요구 전에 약정의 성격을 상담하세요.",
        example:
          "문제 조항 [원문] / 약정 대상 [위약금·교육비 등] / 금액·산식 [내용] / 실제 비용 증빙 [자료] / 상담 질문 [제20조 적용 여부].",
      },
    }[issue];
    r.summary = branch.summary;
    r.sourceIds = [branch.source];
    r.rows = [
      [
        "확인할 세부 쟁점",
        issue === "written"
          ? "서면 명시·교부"
          : issue === "rest"
            ? "근무·휴게시간"
            : issue === "penalty"
              ? "위약금·손해배상 약정"
              : "수당 포함 약정",
        chosen === "auto"
          ? "질문의 표현으로 제안했어요. 세부 쟁점을 직접 선택해서 수정할 수 있어요."
          : "사용자가 직접 선택한 쟁점으로 검토 범위를 정했어요.",
      ],
    ];
    r.findings.push({
      title: branch.title,
      level: "info",
      evidence: input.question,
      reason: branch.reason,
      action: branch.action,
      suggestion: branch.example,
      source: branch.source,
    });
    r.steps = [
      "세부 쟁점과 해당 계약 조항·첨부자료 확보",
      "명시된 조건과 실제 지급·근무·교부 기록 대조",
      "부족하거나 다른 항목을 금액·시각·규정명 단위로 정리해서 담당자에게 확인",
      "답변·수정 계약·교부 기록을 보관하고 효력이 다투어지면 해당 자료로 상담",
    ];
    r.checklist = [
      "전체 계약서와 문제 조항 원문",
      "임금 구성표·참조 규정·교부 또는 변경 기록",
      "해당 지급·근무·휴게·비용의 실제 증빙",
      "담당자 답변 및 확인되지 않은 사실 목록",
    ];
  }
  const unrelated = /홍보\s*예산|마케팅|광고\s*예산/.test(input.question);
  if (unrelated) {
    r.summary =
      "이 질문은 지원하는 근로관계 쟁점과의 연결을 확인하지 못했어요. 법령 대응을 만들기 전에 검토할 인사 상황을 구체화해 주세요.";
    r.findings = [
      {
        title: "질문과 지원 쟁점 확인",
        level: "check",
        evidence: input.question,
        reason: "선택한 쟁점과 질문의 사업·홍보 예산 내용이 연결되지 않아요.",
        action:
          "지급·연차·근로조건 중 실제 확인할 사실을 적거나 해당 업무의 별도 자료를 확인하세요.",
      },
    ];
    r.rows = [];
    r.sourceIds = [];
    r.steps = [];
    r.checklist = [];
  }
  const history = r.findings.find((f) => f.title === "사건 시점의 법령 확인");
  if (history) history.source = r.sourceIds[0];
  return r;
}
