import type { LawInput, LeaveInput, SettlementLine } from "./hr-support";

// Normal fictional examples, not legally approved document forms.
// Deliberate contradictions belong in regression tests.
export const lawExample: LawInput = {
  question:
    "퇴사가 완료된 직원의 최종 급여 정산을 준비하고 있습니다. 지급 시점과 준비할 자료를 확인하고 싶어요.",
  topic: "payment",
  eventDate: "2026-10-07",
  agreement: "no",
  endMeaning: "ended",
  plannedDate: "2026-10-20",
};
export const lineExamples: SettlementLine[] = [
  {
    name: "최종 월 급여",
    kind: "pay",
    value: "1800000",
    note: "가상 급여대장",
  },
  {
    name: "연장근로수당",
    kind: "pay",
    value: "120000",
    note: "가상 근태·지급 내역",
  },
  {
    name: "미사용 연차수당",
    kind: "pay",
    value: "300000",
    note: "가상 지급 내역",
  },
  {
    name: "공제 합계",
    kind: "deduction",
    value: "90000",
    note: "가상 공제 내역",
  },
];
export const settlementExample = {
  lines: lineExamples,
  claimed: "2130000",
  scope: "2026년 10월 최종 급여 정산 · 퇴직급여 별도",
};
export const leaveExample: LeaveInput = {
  mode: "comparison",
  start: "2023-01-01",
  end: "2026-01-01",
  eligible: true,
  complete: true,
  monthly: true,
  prorataMonths: "12",
  granted: "15",
  carried: "0",
  used: "7.5",
  expired: "0",
  adjustment: "0",
  stated: "7.5",
  companyRule:
    "회계연도 1월 1일 부여, 첫해 비례분은 재직 개월 기준, 월별 개근분은 별도. 비교는 입사~기준일의 누적 부여량, 잔여 검산은 이번 연차대장 기간의 부여·사용 내역으로 한정.",
};
export const contractExample = [
  "제1조 근무장소: 서울시 강남구 가상로 10. 담당업무: 인사 운영 지원.",
  "제2조 소정근로시간: 월~금 09:00~18:00, 휴게시간 12:00~13:00(근로시간에서 제외).",
  "제3조 임금: 월 기본급 280만원, 식대 20만원. 월 지급액 300만원. 연장근로 발생 시 별도 산정.",
  "제4조 지급방법: 매월 25일 본인 명의 계좌로 이체.",
  "제5조 휴일: 매주 일요일은 주휴일, 공휴일의 유급휴일 적용 여부는 적용 법령과 사업장 조건을 확인.",
  "제6조 연차유급휴가: 적용 법령의 기준에 따라 부여하며, 부여·사용 내역은 연차대장에 기록.",
].join("\n");
export const recruitmentExample = [
  "상단 고용형태: 정규직",
  "상단 근무지: 서울 강남 가상로 10",
  "본문 고용형태: 정규직",
  "본문 근무지: 서울 강남 가상로 10",
  "담당업무: 인사 운영 및 자료 정리",
  "급여: 연봉 3600만원(가상 예시)",
  "지원 방법: https://example.com/careers/hr 에서 이력서 접수(가상 경로)",
  "마감: 2026년 10월 31일",
  "전형: 서류 심사 → 실무 면접 → 결과 안내",
].join("\n");
export const contractReviewExample = [
  "근무장소: 서울 가상로 10. 담당업무: 인사 운영 지원.",
  "근무시간: 월~금 09:00~18:00. 휴게시간: 12:00~12:30.",
  "임금: 기본급 280만원, 식대 20만원. 월 지급액 320만원. 모든 수당을 포함한다.",
  "지급방법: 매월 25일 본인 명의 계좌로 이체.",
  "휴일·연차는 회사 규정에 따른다.",
].join("\n");
export const recruitmentReviewExample = [
  "상단 고용형태: 정규직",
  "본문 고용형태: 6개월 계약직 후 정규직 전환 검토",
  "근무지: 추후 안내",
  "담당업무: 인사 자료 정리 및 채용 운영 지원",
  "급여: 회사 내규에 따라 협의",
  "지원 방법: 지원 링크에서 접수",
  "마감: 추후 안내",
  "전형: 서류 → 면접",
].join("\n");
