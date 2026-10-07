import type { Finding, SupportResult, SourceId } from "./hr-support.js";

type Line = { text: string; line: number };
export function documentLines(text: string): Line[] {
  if (text.trim().length < 10)
    throw new Error("점검할 내용을 10자 이상 입력해 주세요.");
  if (text.length > 200000)
    throw new Error("한 번에 20만 글자까지 점검할 수 있어요.");
  return text
    .split(/\r\n|\n|\r/)
    .map((text, i) => ({ text: text.trim(), line: i + 1 }))
    .filter((x) => x.text);
}
const cite = (lines: Line[]) =>
  lines
    .slice(0, 6)
    .map((x) => `${x.line}줄: ${x.text.slice(0, 400)}`)
    .join("\n");
const won = (value: number) => value.toLocaleString("ko-KR") + "원";
const moneyPattern =
  "(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?)\\s*(만\\s*원|원)";
function money(text: string): number | undefined {
  const m = new RegExp("(?<![\\d,.\\-])" + moneyPattern).exec(text);
  if (!m) return;
  const value =
    Number(m[1].replaceAll(",", "")) * (/만/.test(m[2]) ? 10000 : 1);
  return Number.isFinite(value) && value <= 1e12 ? value : undefined;
}
function empty(title: string, scope: string, text: string): SupportResult {
  return {
    title,
    scope,
    summary: "",
    columns: ["확인 항목", "읽어낸 조건", "원문 위치", "점검 결과·이유"],
    rows: [],
    findings: [],
    checklist: [],
    context: [
      `점검 범위: 입력 텍스트 ${text.length.toLocaleString()}자`,
      "금액·시간·조건이 명시된 문장만 대조해요. 발췌 범위 밖의 첨부자료는 읽지 않았어요.",
    ],
    sourceIds: [],
    presentation: "review",
  };
}
function finish(r: SupportResult) {
  const issues = r.findings.filter(
    (f) => f.level === "difference" || f.level === "check",
  );
  const differences = issues.filter((f) => f.level === "difference").length;
  r.summary =
    r.title === "근로계약 확인"
      ? `${r.rows.length}개 항목을 점검해 ${issues.length}개 확인 항목을 찾았어요. 계산·표기 불일치 ${differences}개, 조건 보완 ${issues.length - differences}개예요.`
      : `게시 전 확인할 ${issues.length}개 항목을 찾았어요. 표기 불일치 ${differences}개, 안내 보완 ${issues.length - differences}개예요.`;
  r.findings.sort(
    (a, b) =>
      ({ difference: 0, check: 1, unverified: 2, info: 3 })[a.level] -
      { difference: 0, check: 1, unverified: 2, info: 3 }[b.level],
  );
  if (!issues.length)
    r.findings.push({
      title: "이번 입력에서 확인한 내용",
      level: "info",
      evidence: r.rows
        .filter((row) => !row[3].startsWith("미확인"))
        .map((row) => `${row[0]}: ${row[1]}`)
        .join("\n"),
      reason:
        "지원하는 항목의 구체적 조건을 읽었고, 해당 범위에서 보완 신호나 불일치가 발견되지 않았어요.",
      action:
        "원문·첨부자료와 실제 적용 조건이 같은지 확인한 뒤 검토표에 담당자 확인을 남기세요.",
    });
  r.sourceIds = [
    ...new Set([
      ...r.sourceIds,
      ...r.findings.flatMap((f) => (f.source ? [f.source] : [])),
    ]),
  ];
  return r;
}
function reviewer(r: SupportResult, lines: Line[], source?: SourceId) {
  return (
    title: string,
    pattern: RegExp,
    complete: (text: string) => boolean,
    reason: string,
    action: string,
    suggestion: string,
  ) => {
    const hits = lines.filter((x) => pattern.test(x.text));
    const text = hits.map((x) => x.text).join("\n");
    const present = hits.length > 0 && complete(text);
    r.rows.push([
      title,
      text || "—",
      cite(hits) || "—",
      present
        ? "구체적 조건 확인 · 적법성 전체 판정은 별도"
        : `보완 필요 · ${reason}`,
    ]);
    if (!present)
      r.findings.push({
        title: title + (r.title === "근로계약 확인" ? " 확인" : " 안내 보완"),
        level: "check",
        evidence:
          cite(hits) || `입력 범위에서 ${title}의 구체적 조건을 찾지 못했어요.`,
        reason,
        action,
        suggestion,
        source,
      });
    return { hits, text, present };
  };
}
type Range = { start: number; end: number; label: string };
function clockText(text: string) {
  return text
    .replace(
      /(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/g,
      (_all, hour: string, minute?: string) =>
        `${hour.padStart(2, "0")}:${(minute || "0").padStart(2, "0")}`,
    )
    .replace(/(\d{2}:\d{2})\s*부터\s*/g, "$1~");
}
function range(text: string): Range | undefined {
  const m =
    /(\d{1,2}):(\d{2})\s*[~〜～\-–]\s*(?:익일|다음\s*날)?\s*(\d{1,2}):(\d{2})/.exec(
      clockText(text),
    );
  if (!m) return;
  const [h1, m1, h2, m2] = m.slice(1).map(Number);
  if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) return;
  const start = h1 * 60 + m1;
  let end = h2 * 60 + m2;
  if (end <= start && /익일|다음\s*날/.test(text)) end += 1440;
  if (end <= start) return;
  return { start, end, label: m[0] };
}
const minutes = (n: number) =>
  `${Math.floor(n / 60)}시간${n % 60 ? ` ${n % 60}분` : ""}`;

export function reviewContract(text: string): SupportResult {
  const lines = documentLines(text),
    r = empty(
      "근로계약 확인",
      "제공한 계약 내용의 구체적 조건·시간·금액을 대조해요. 전체 적법성 판정·서면 교부 사실 확인은 별도예요.",
      text,
    );
  r.sourceIds = ["contractArticle"];
  const check = reviewer(r, lines, "contractArticle");
  const wage = check(
    "임금",
    /임금|월급|급여|연봉|시급|기본급/,
    (s) => money(s) !== undefined && /기본급|시급|일급|수당|식대|구성/.test(s),
    "급여라는 제목이나 총액만으로는 기본급·수당의 구성과 계산 기준을 알 수 없어요.",
    "기본급과 수당별 금액, 월급·시급 등 지급 단위 및 계산방법을 기재하세요.",
    "임금: [월/시급] [금액]원. 기본급 [금액]원, [수당명] [금액]원. 계산방법: [산식·해당 조건].",
  );
  check(
    "지급일",
    /지급|급여일|월급날/,
    (s) =>
      /(?:매월|매\s*월|익월|다음\s*달|당월)\s*\d{1,2}\s*일|매월\s*말일|매주\s*[월화수목금토일]요일/.test(
        s,
      ),
    "언제 지급하는지 특정할 수 없어 정기 지급일을 확인할 수 없어요.",
    "지급 주기와 특정 지급일을 명시하고 휴일 처리도 정하세요.",
    "임금은 매월 [일]일 지급하며 지급일이 휴일인 경우 [처리 기준]에 따른다.",
  );
  check(
    "지급방법",
    /지급방법|계좌|이체|현금/,
    (s) => /계좌.*(?:이체|지급)|이체|현금/.test(s),
    "지급방법이라는 제목만으로는 실제 지급 수단을 확인할 수 없어요.",
    "본인 명의 계좌 이체 등 실제 지급 수단을 적으세요.",
    "근로자 본인 명의 계좌로 지급한다.",
  );
  const working = check(
    "소정근로시간",
    /근로시간|근무시간|소정|\d{1,2}:\d{2}/,
    (s) =>
      (!!range(s) || /주\s*\d+(?:\.\d+)?\s*시간/.test(s)) &&
      /월\s*[~〜～\-]\s*금|주\s*[1-7]\s*일|월요일|화요일|수요일|목요일|금요일|토요일|일요일/.test(
        s,
      ),
    "시간 또는 근무일 중 하나가 없어 주당 소정근로시간을 확인하기 어려워요.",
    "근무일·시작/종료 시각과 휴게시간을 각각 적으세요.",
    "근무일: [요일/주당 일수], 근무시간: [시작]~[종료], 휴게시간: [시작]~[종료].",
  );
  const breakLines = lines.filter((x) =>
    /휴게|점심시간|점심\s*시간/.test(x.text),
  );
  const breakText = breakLines
    .map((x) => x.text.slice(Math.max(0, x.text.search(/휴게|점심/))))
    .join("\n");
  const restRange = range(breakText);
  const restNumber =
    /(?:휴게(?:시간)?|점심\s*시간)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*(시간|분)/.exec(
      breakText,
    );
  const restMinutes = restRange
    ? restRange.end - restRange.start
    : restNumber
      ? Number(restNumber[1]) * (restNumber[2] === "시간" ? 60 : 1)
      : undefined;
  r.rows.push([
    "휴게시간",
    restMinutes !== undefined ? minutes(restMinutes) : "구체적 시간 미확인",
    cite(breakLines) || "—",
    restMinutes !== undefined
      ? "명시한 시간을 근로시간에서 분리해 대조"
      : "보완 필요 · 휴게 시간량을 확인할 수 없음",
  ]);
  if (restMinutes === undefined)
    r.findings.push({
      title: "휴게시간 확인",
      level: "check",
      evidence: cite(breakLines) || cite(working.hits),
      reason:
        "출퇴근 시각이 있어도 휴게시간이 빠져 있으면 실제 근로시간과 휴게 기준을 계산할 수 없어요.",
      action:
        "근로시간 도중의 휴게 구간 또는 휴게 분량과 자유 이용 조건을 명시하세요.",
      suggestion:
        "휴게시간: [시작 시각]~[종료 시각], 해당 시간은 근로시간에서 제외하며 자유롭게 이용한다.",
      source: "breaks",
    });
  const shiftLine = working.hits.find((x) =>
    /근로시간|근무시간|소정/.test(x.text),
  );
  const shift = shiftLine && range(shiftLine.text);
  const schedules = working.hits
    .filter((x) => /근로시간|근무시간|소정/.test(x.text))
    .flatMap((x) => {
      const parsed = range(x.text);
      return parsed ? [parsed.label] : [];
    });
  const restSegments =
    clockText(breakText).match(/\d{1,2}:\d{2}\s*[~〜～\-–]\s*\d{1,2}:\d{2}/g) ||
    [];
  const multiple = new Set(schedules).size > 1 || restSegments.length > 1;
  if (multiple)
    r.findings.push({
      title: "복수 시간표 대조 필요",
      level: "unverified",
      evidence: cite(working.hits),
      reason:
        "근무·휴게 구간이 여러 개라 어느 날·근무표에 속하는지 자동 연결하지 않았어요. 첫 구간만으로 휴게 부족을 판정하지 않아요.",
      action:
        "하나의 근무표와 그 휴게 구간을 구분해 입력하거나 근무표별 실제 근로시간을 확인하세요.",
      source: "breaks",
    });
  if (shift && restMinutes !== undefined && !multiple) {
    const span = shift.end - shift.start;
    const actual = span - restMinutes;
    const restStart =
      restRange && shift.end > 1440 && restRange.start < shift.start
        ? restRange.start + 1440
        : restRange?.start;
    const restEnd =
      restStart !== undefined && restRange
        ? restStart + restRange.end - restRange.start
        : undefined;
    const inside =
      !restRange || (restStart! >= shift.start && restEnd! <= shift.end);
    if (restMinutes > span || !inside)
      r.findings.push({
        title: "근무·휴게 구간 불일치",
        level: "difference",
        evidence: cite([
          shiftLine!,
          ...breakLines.filter((x) => x !== shiftLine),
        ]),
        reason:
          "휴게가 근무시간을 넘거나 입력한 근무 구간 밖에 있어 근로시간에서 뺄 수 없어요.",
        action: "근무 구간 안의 실제 휴게 시각으로 수정한 뒤 재점검하세요.",
        source: "breaks",
      });
    else {
      r.rows.push([
        "시간 검산",
        `${minutes(span)} − 휴게 ${minutes(restMinutes)} = 하루 ${minutes(actual)}`,
        cite([shiftLine!]),
        "입력한 근무·휴게 구간의 단순 차이",
      ]);
      const required = actual >= 480 ? 60 : actual >= 240 ? 30 : 0;
      if (restMinutes < required)
        r.findings.push({
          title: "휴게 분량 재검토",
          level: "check",
          evidence: `${cite([shiftLine!])}\n계산: 체류 ${minutes(span)} − 휴게 ${minutes(restMinutes)} = 근로 ${minutes(actual)}`,
          reason: `입력 구간의 근로시간은 ${minutes(actual)}이고, 자료 확인일의 일반 휴게 기준 ${required}분보다 기재한 휴게가 ${required - restMinutes}분 짧아요. 실제 근로·적용 예외는 별도로 확인해야 해요.`,
          action:
            "실제 근로시간을 확인하고 근무 구간 안에 필요한 휴게를 확보해 계약 시각을 수정하세요.",
          suggestion:
            "근무시간과 휴게시간을 각각 명시하고, 휴게 변경 후 실제 근로시간을 다시 계산한다.",
          source: "breaks",
        });
    }
  }
  check(
    "휴일",
    /휴일|주휴/,
    (s) => /[월화수목금토일]요일|주\s*\d\s*회|매주\s*\S+/.test(s),
    "휴일이라는 단어 또는 회사 규정만으로는 주휴일이 언제인지 알 수 없어요.",
    "주휴일과 기타 유급휴일을 구분해 명시하거나 해당 첨부 규정을 연결하세요.",
    "주휴일: 매주 [요일]. 기타 유급휴일: [적용 기준·첨부 규정명].",
  );
  check(
    "연차",
    /연차|유급휴가/,
    (s) => /근로기준법|법령.*기준|법.*정하는|\d+\s*일/.test(s),
    "회사 규정에 따른다는 문구만으로는 적용 기준과 첨부자료를 확인할 수 없어요.",
    "적용 법령·구체적 부여 기준 또는 규정명·조항과 제공 자료를 연결하세요.",
    "연차유급휴가는 적용 법령 및 [규정명·조항]에 따른다. 해당 규정을 첨부·교부한다.",
  );
  check(
    "근무장소",
    /근무지|근무장소|근무\s*장소/,
    (s) =>
      /(?:근무지|근무장소|근무\s*장소)\s*[:：]\s*\S{2}/.test(s) &&
      !/추후\s*(?:안내|결정)|회사\s*(?:지정|지침)/.test(s),
    "배치되는 장소가 구체적으로 기재되지 않았어요.",
    "실제 근무 장소와 변경 가능한 범위를 적으세요.",
    "근무장소: [주소·사업장]. 변경 시 [협의·통지 기준]을 따른다.",
  );
  check(
    "담당업무",
    /담당업무|종사업무|직무|업무\s*내용/,
    (s) =>
      /(?:담당업무|종사업무|직무|업무\s*내용)\s*[:：]\s*\S{2}/.test(s) &&
      !/추후\s*(?:안내|결정)|회사\s*지정/.test(s),
    "업무명만 있거나 업무 범위가 비어 있어 맡는 일을 특정하기 어려워요.",
    "수행 업무와 범위를 구체적으로 적으세요.",
    "담당업무: [주요 수행 업무·범위].",
  );
  const included = lines.filter((x) =>
    /수당.{0,15}포함|포괄임금|포괄.{0,10}수당/.test(x.text),
  );
  if (included.length) {
    const s = included.map((x) => x.text).join("\n");
    const missing = [
      !/(?:연장|고정).{0,15}수당\s*[:：]?\s*\d[\d,.]*\s*(?:만원|원)/.test(s) &&
        "포함 수당의 구분·금액",
      !/(?:월|매월|주).{0,10}\d+(?:\.\d+)?\s*시간/.test(s) && "포함 근로시간",
      !/계산|산식|통상.{0,6}임금|시급/.test(s) && "산정 기준",
    ].filter(Boolean);
    r.findings.push({
      title: "수당 포함 조건",
      level: "check",
      evidence: cite(included),
      reason: missing.length
        ? `빠진 조건: ${missing.join(", ")}. '포함'이라고만 쓰면 금액과 실제 근로의 대조가 불가능해요.`
        : "금액·시간 표현은 있지만 실제 연장근로 기록 및 정산과의 대조가 남아 있어요.",
      action:
        "기본급과 고정 수당을 분리하고 포함 시간·계산방법·초과 근로 정산 방식을 명시한 뒤 근로 기록과 대조하세요.",
      suggestion:
        "기본급 [금액]원, 고정 연장수당 [금액]원(월 [시간]시간분, 계산 [산식]). 포함 시간을 초과한 근로는 [정산 기준]에 따라 별도 지급한다.",
      source: "contractArticle",
    });
  }
  const refs = lines.filter(
    (x) =>
      /회사\s*규정|취업규칙|내규/.test(x.text) &&
      !/첨부|교부|제공|제\s*\d+\s*조/.test(x.text),
  );
  if (refs.length)
    r.findings.push({
      title: "참조 규정 확인",
      level: "check",
      evidence: cite(refs),
      reason:
        "참조 문구는 있으나 규정명·조항 또는 첨부·제공 정보가 없어 연결된 조건을 읽을 수 없어요.",
      action: "규정명·적용 조항을 적고 실제 첨부·교부 자료와 대조하세요.",
      suggestion:
        "[규정명] 제[조]조에 따른다. 해당 규정을 첨부하고 근로자에게 제공한다.",
      source: "contractArticle",
    });
  const components = [
    ...text.matchAll(
      new RegExp(
        `(기본급|식대|직책수당|직무수당|교통비|고정연장수당|고정 연장수당)\\s*[:：]?\\s*${moneyPattern}`,
        "g",
      ),
    ),
  ].map((m) => ({
    name: m[1],
    value: Number(m[2].replaceAll(",", "")) * (/만/.test(m[3]) ? 10000 : 1),
  }));
  const total = new RegExp(
    `(?:월\\s*지급액|월\\s*총액|총\\s*월급|총\\s*지급액)\\s*[:：]?\\s*${moneyPattern}`,
  ).exec(wage.text);
  if (
    total &&
    components.length >= 2 &&
    !/연봉|연\s*기본급/.test(wage.text) &&
    new Set(components.map((c) => c.name)).size === components.length
  ) {
    const sum = components.reduce((s, c) => s + c.value, 0);
    const declared =
      Number(total[1].replaceAll(",", "")) * (/만/.test(total[2]) ? 10000 : 1);
    r.rows.push([
      "월 임금 합계 검산",
      `${components.map((c) => c.name + " " + won(c.value)).join(" + ")} = ${won(sum)}`,
      cite(wage.hits),
      sum === declared
        ? `기재 월 지급액 ${won(declared)}과 일치`
        : `불일치 · 기재액 ${won(declared)}, 차이 ${won(Math.abs(declared - sum))}`,
    ]);
    if (sum !== declared)
      r.findings.push({
        title: "월 임금 합계 불일치",
        level: "difference",
        evidence: cite(wage.hits),
        reason: `구성항목 합계 ${won(sum)}와 기재 월 지급액 ${won(declared)}의 차이는 ${won(Math.abs(declared - sum))}예요.`,
        action:
          "승인된 급여 내역과 대조해 구성항목 또는 총액을 수정하세요. 계산 결과만으로 어느 금액이 맞는지는 정하지 않아요.",
        suggestion: `현재 입력 구성항목의 합계는 ${won(sum)}예요. 실제 급여 내역과 확인한 금액을 반영하세요.`,
      });
  }
  const penalties = lines.filter(
    (x) =>
      /(?:퇴사|퇴직|계약\s*불이행).{0,50}(?:위약금|손해배상)|(?:위약금|손해배상).{0,50}(?:퇴사|퇴직|계약\s*불이행)/.test(
        x.text,
      ) && !/(?:위약금|손해배상).{0,12}(?:없|아니|하지\s*않)/.test(x.text),
  );
  if (penalties.length)
    r.findings.push({
      title: "퇴사·계약 불이행 배상 조항",
      level: "check",
      evidence: cite(penalties),
      reason:
        "퇴사·계약 불이행과 예정된 위약금·손해배상을 연결하는 문구가 있어 제20조 검토가 필요해요. 실제 손해배상이나 교육비 반환 약정과는 구분해야 해요.",
      action:
        "자동 공제·고정 위약금 처리를 진행하기 전에 약정의 성격·예외·실제 비용을 확인하고 해당 조항을 검토받으세요.",
      suggestion:
        "계약 불이행에 대한 위약금·손해배상액을 미리 정하지 않는다. 별도 비용 반환 약정이 있다면 성격과 근거를 분리해 검토한다.",
      source: "penalties",
    });
  r.checklist = [
    "전체 계약서·임금 구성표와 비교",
    "참조 규정의 해당 조항 및 실제 교부 기록",
    "실제 근무·휴게·급여 내역과 입력 조건의 일치",
    "수정한 계약 문구에 담당자 확인과 변경일 기록",
  ];
  return finish(r);
}

type Salary = { value: number; period: "연봉" | "월급" | "시급"; line: Line };
function salary(line: Line): Salary | undefined {
  const period = /연봉/.test(line.text)
    ? "연봉"
    : /시급/.test(line.text)
      ? "시급"
      : /월급|월\s*급여|월\s*\d/.test(line.text)
        ? "월급"
        : undefined;
  const value = money(line.text);
  // Ranges, alternatives and unspecified units cannot be compared as a single amount.
  if (
    !period ||
    value === undefined ||
    /\d\s*[~〜～\-]\s*\d|부터|이상|이하|협의|직무별/.test(line.text)
  )
    return;
  return { value, period, line };
}
function initialEmployment(text: string) {
  if (/계약직|기간제/.test(text)) return "계약직";
  if (/인턴/.test(text)) return "인턴";
  if (/정규직/.test(text)) return "정규직";
  return "";
}
export function reviewRecruitment(text: string): SupportResult {
  const lines = documentLines(text),
    r = empty(
      "채용공고 정보 점검",
      "공고의 조건·누락·모호한 안내와 같은 공고 안의 표기를 대조해요. 정보 품질 점검이며 법적 필수 항목·채용 적법성 판정은 별도예요.",
      text,
    );
  const check = reviewer(r, lines);
  const employment = check(
    "고용형태",
    /고용형태|채용형태|채용구분|근무형태|정규직|계약직|기간제|인턴/,
    (s) => !!initialEmployment(s),
    "고용형태가 없어 지원자가 계약의 종류를 알 수 없어요.",
    "채용 시 실제 고용형태와 계약기간·전환 가능성을 구분해 적으세요. 정보 품질 권장사항이며 법적 필수라는 의미는 아니에요.",
    "고용형태: [정규직/계약직/인턴]. 계약기간: [해당 시 기간]. 전환: [조건·평가·보장 여부].",
  );
  const explicit = employment.hits.filter((x) =>
    /고용형태|채용형태|채용구분|근무형태/.test(x.text),
  );
  const types = new Set(
    explicit.map((x) => initialEmployment(x.text)).filter(Boolean),
  );
  const alternatives =
    /(?:고용형태|채용형태).*(?:또는|중\s*선택|직무별|각각|모집\s*분야별)/.test(
      text,
    );
  if (types.size > 1 && !alternatives)
    r.findings.push({
      title: "고용형태 불일치",
      level: "difference",
      evidence: cite(explicit),
      reason: `상단·본문의 최초 고용형태가 ${[...types].join(" / ")}로 달라요. 계약직 후 전환 검토는 채용 시 정규직과 같은 조건이 아니에요.`,
      action:
        "직무별 모집인지 하나의 채용 조건인지 확인하고 상단·본문을 같은 실제 조건으로 수정하세요.",
      suggestion:
        "고용형태: [최초 고용형태]. [기간] 후 [평가·전환 조건]에 따라 전환 여부를 검토한다.",
    });
  const fixed = employment.hits.filter((x) =>
    /계약직|기간제|인턴/.test(x.text),
  );
  if (
    fixed.length &&
    !/\d+\s*(개월|년)|\d{4}[.\-/년]/.test(fixed.map((x) => x.text).join("\n"))
  )
    r.findings.push({
      title: "계약기간 안내",
      level: "check",
      evidence: cite(fixed),
      reason:
        "계약직·기간제·인턴은 표시했지만 계약 기간이 없어 지원자가 종료 시점을 알 수 없어요.",
      action: "최초 계약기간과 갱신·전환 기준을 각각 기재하세요.",
      suggestion:
        "계약기간: 입사일부터 [개월/종료일]. 갱신·전환은 [판단 기준]에 따라 결정한다.",
    });
  const locations = check(
    "근무지",
    /근무지|근무장소|근무\s*장소/,
    (s) =>
      /(?:근무지|근무장소|근무\s*장소)\s*[:：]\s*\S{2}/.test(s) &&
      !/추후\s*(?:안내|결정)|미정/.test(s),
    "근무지 항목이 있어도 '추후 안내'만으로는 실제 배치를 알 수 없어요.",
    "근무 주소·원격 여부·복수 배치 기준을 명시하세요. 정보 품질 권장사항이에요.",
    "근무지: [주소/지역·사업장]. 원격·복수 배치: [조건].",
  );
  const places = new Set(
    locations.hits.map((x) =>
      x.text
        .replace(/^.*?(?:근무지|근무장소|근무\s*장소)\s*[:：]/, "")
        .trim()
        .replace(/\s+/g, " "),
    ),
  );
  if (places.size > 1)
    r.findings.push({
      title: "근무지 표기 차이",
      level: "check",
      evidence: cite(locations.hits),
      reason:
        "표기된 근무지가 여러 개예요. 같은 주소의 축약·복수 배치·실제 변경 중 무엇인지 원문만으로 구분되지 않아요.",
      action:
        "같은 주소이면 표기를 통일하고, 복수 배치이면 배치 기준을 설명하세요.",
      suggestion:
        "근무지: [대표 주소]. 다른 배치가 가능하다면 [주소·대상 직무·선택 기준]을 별도로 안내한다.",
    });
  const pay = check(
    "급여 조건",
    /급여|연봉|월급|시급|보수|임금/,
    (s) => money(s) !== undefined,
    "'협의'·'회사 내규'만으로는 지원자가 금액과 기대 조건을 판단하기 어려워요.",
    "급여 단위·금액 범위·세전 여부와 협의 기준을 안내하세요. 정보 품질 권장사항이며 법적 필수라는 의미는 아니에요.",
    "급여: [연봉/월급/시급] [금액 또는 범위]원(세전). [포함 수당·협의 기준].",
  );
  if (pay.present && !/연봉|월급|시급|일급|월\s*급여|월\s*\d/.test(pay.text))
    r.findings.push({
      title: "급여 지급 단위",
      level: "check",
      evidence: cite(pay.hits),
      reason:
        "금액은 있지만 연봉·월급·시급 중 어떤 단위인지 없어 금액을 비교할 수 없어요.",
      action: "숫자 앞에 급여 단위를 적으세요.",
      suggestion: "급여: [급여 단위] [금액]원(세전).",
    });
  const amounts = pay.hits.map(salary).filter((x): x is Salary => !!x);
  for (const period of ["연봉", "월급", "시급"] as const) {
    const same = amounts.filter((x) => x.period === period);
    if (
      new Set(same.map((x) => x.value)).size > 1 &&
      !/직무별|경력별|수습|포함|제외/.test(
        same.map((x) => x.line.text).join("\n"),
      )
    )
      r.findings.push({
        title: "급여 금액 불일치",
        level: "difference",
        evidence: cite(same.map((x) => x.line)),
        reason: `동일한 ${period} 단위의 기재 금액이 ${[...new Set(same.map((x) => won(x.value)))].join(" / ")}로 달라요.`,
        action:
          "승인된 채용 금액과 대조해 상단·본문의 같은 항목을 수정하세요. 연봉과 월급은 상여 등 포함 범위가 달라 자동 비교하지 않아요.",
        suggestion: `${period}: [확정한 동일 금액 또는 범위]원. 다른 금액이면 [적용 대상·포함 범위]를 설명한다.`,
      });
  }
  check(
    "담당업무",
    /담당업무|업무내용|업무\s*내용|주요업무|직무/,
    (s) => /[:：]\s*\S{2}/.test(s) && !/추후\s*안내|회사\s*지정/.test(s),
    "직무명이 있어도 수행할 업무가 구체적으로 설명되지 않았어요.",
    "주요 수행 업무·범위를 지원자가 이해할 수 있게 적으세요.",
    "담당업무: [주요 업무 1], [주요 업무 2].",
  );
  check(
    "지원 방법",
    /지원방법|지원\s*방법|이메일|접수방법|접수\s*방법|지원.*링크/,
    (s) =>
      /https?:\/\/[^\s]+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:사람인|잡코리아|워크넷|고용24).{0,20}(?:지원|접수)/i.test(
        s,
      ),
    "'지원 링크'·'이메일 접수'라는 문구만으로는 실제 접수 경로가 없어 지원할 수 없어요.",
    "실제 URL·이메일·채용 플랫폼을 적고 공고 담당자가 경로를 열어 확인하세요.",
    "지원 방법: [실제 지원 URL 또는 접수 이메일]. 제출서류: [서류].",
  );
  const closing = check(
    "마감 방식",
    /마감|채용\s*시|상시\s*채용/,
    (s) =>
      /상시|채용\s*시|\d{4}\s*[.\-/년]\s*\d{1,2}\s*[.\-/월]\s*\d{1,2}/.test(s),
    "마감 항목만 있거나 날짜가 모호해 접수 종료 시점을 알 수 없어요.",
    "정확한 마감 날짜·시각 또는 채용 시 마감 여부를 적으세요.",
    "마감: [YYYY-MM-DD] [시각] 또는 채용 시 마감. 조기 종료 시 [안내 방식].",
  );
  const date = /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/.exec(
    closing.text,
  );
  if (date) {
    const iso = `${date[1]}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}`;
    const value = new Date(iso + "T00:00:00Z");
    if (
      !Number.isFinite(value.getTime()) ||
      value.toISOString().slice(0, 10) !== iso
    )
      r.findings.push({
        title: "마감일 날짜 오류",
        level: "difference",
        evidence: cite(closing.hits),
        reason: `${iso}는 달력에 존재하지 않는 날짜예요.`,
        action: "승인된 실제 마감일로 수정하세요.",
        suggestion: "마감: [실제로 존재하는 YYYY-MM-DD] [시각].",
      });
  }
  check(
    "전형 안내",
    /전형|면접|서류.*심사|서류.*합격/,
    (s) => /서류|면접/.test(s),
    "선발 단계가 없어 지원자가 이후 절차를 알 수 없어요.",
    "전형 순서와 결과·일정 안내 방법을 기재하세요. 정보 품질 권장사항이에요.",
    "전형: [단계 1] → [단계 2] → 결과 안내([안내 방법]).",
  );
  const probation = lines.filter((x) => /수습/.test(x.text));
  if (
    probation.length &&
    !/\d+\s*(개월|주|일)/.test(probation.map((x) => x.text).join("\n"))
  )
    r.findings.push({
      title: "수습기간 안내",
      level: "check",
      evidence: cite(probation),
      reason: "수습이라는 문구는 있지만 기간을 알 수 없어요.",
      action: "수습기간과 본채용·계약 전환 관계를 구분해 적으세요.",
      suggestion:
        "수습기간: 입사일부터 [기간]. 고용형태는 [형태]이며 계약 전환과 [관계]가 있다.",
    });
  if (
    probation.length &&
    !/(?:수습.{0,25}(?:급여|동일|감액|\d+\s*%))|(?:급여.{0,25}수습)/.test(text)
  )
    r.findings.push({
      title: "수습 중 급여 안내",
      level: "check",
      evidence: cite(probation),
      reason:
        "수습기간은 있지만 공고 급여가 수습 중에도 동일하게 적용되는지 알 수 없어요.",
      action:
        "수습 중 급여 조건과 수습 이후 조건을 구분해 안내하세요. 감액 가능 여부는 적용 법령·계약 조건을 별도로 확인하세요.",
      suggestion:
        "수습기간의 급여: [동일/금액·비율과 적용 근거]. 수습 종료 후: [조건].",
    });
  r.checklist = [
    "실제 승인된 고용형태·급여·근무지와 대조",
    "같은 공고의 제목·상단·본문·첨부에 수정 내용 반영",
    "지원 URL·이메일·마감일을 게시 전에 직접 확인",
    "법적 의무·차별·개인정보 쟁점은 적용 범위를 따로 검토",
  ];
  return finish(r);
}
