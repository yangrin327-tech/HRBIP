import { useEffect, useId, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Scale,
  Calculator,
  CalendarCheck,
  FileCheck2,
  BriefcaseBusiness,
  Copy,
  Download,
} from "lucide-react";
import { Button, Notice, PageTitle } from "./ui";
import { parseFile, type RawSheet } from "./files";
import {
  lawGuide,
  leaveCheck,
  settlementCheck,
  contractCheck,
  recruitmentCheck,
  recommendTopics,
  resultText,
  SOURCE_CHECKED,
  sources,
  type SupportResult,
  type LawInput,
  type LeaveInput,
  type SettlementLine,
} from "../shared/hr-support";

export const supportTools = [
  {
    id: "law",
    title: "법령·대응 가이드",
    short: "법령·대응 가이드",
    description:
      "인사 상황의 쟁점과 조건을 확인하고, 공식 근거와 처리 체크리스트를 연결해요.",
    icon: Scale,
    label: "기준 확인",
  },
  {
    id: "settlement",
    title: "퇴사 정산 검토",
    short: "퇴사 정산 검토",
    description:
      "지급·공제 내역의 합계와 기재액을 대조하고, 더 확인할 자료를 정리해요.",
    icon: Calculator,
    label: "계산 대조",
  },
  {
    id: "leave",
    title: "연차 기준 비교·검산",
    short: "연차 기준 비교·검산",
    description:
      "입사일·회사 기준의 부여 내역을 비교하거나 연차대장 잔여를 검산해요.",
    icon: CalendarCheck,
    label: "기준 비교",
  },
  {
    id: "contract",
    title: "근로계약 확인",
    short: "근로계약 확인",
    description:
      "계약 내용에서 더 확인할 항목과 참조 규정을 원문 위치와 함께 보여줘요.",
    icon: FileCheck2,
    label: "계약 점검",
  },
  {
    id: "recruitment",
    title: "채용공고 정보 점검",
    short: "채용공고 정보 점검",
    description:
      "고용형태·근무지의 표기 차이와 지원자 안내 정보를 게시 전에 점검해요.",
    icon: BriefcaseBusiness,
    label: "게시 전 점검",
  },
] as const;
export type SupportToolId = (typeof supportTools)[number]["id"];
export const toolFromHash = () =>
  supportTools.find((t) => location.hash === "#tools/" + t.id)?.id;
const lawExample: LawInput = {
  question:
    "직원이 10월 20일까지만 일하겠다고 합니다. 다음 급여일인 11월 10일에 퇴사 정산도 같이 해도 되나요?",
  topic: "payment",
  eventDate: "2026-10-20",
  agreement: "unknown",
  endMeaning: "last",
};
const lineExamples: SettlementLine[] = [
  { name: "최종 월 급여", kind: "pay", value: "1800000", note: "" },
  { name: "연장근로수당", kind: "pay", value: "120000", note: "" },
  { name: "미사용 연차수당", kind: "pay", value: "300000", note: "" },
  { name: "공제 합계", kind: "deduction", value: "90000", note: "" },
];
const leaveExample: LeaveInput = {
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
  companyRule:
    "회계연도 1월 1일 부여, 첫해 비례분은 재직 개월 기준, 월별 개근분은 별도. 비교 범위는 입사~퇴사 누적 부여량.",
};
const contractExample =
  "제3조 임금: 월 300만원. 연장근로수당을 포함한다.\n제4조 근무: 월~금 09:00~18:00.\n제5조 휴게: 회사 운영에 따른다.\n제6조 휴일·연차: 회사 규정에 따른다.";
const recruitmentExample =
  "상단 고용형태: 정규직\n상단 근무지: 서울 강남\n본문 고용형태: 6개월 계약직 후 정규직 전환 검토\n본문 근무지: 판교 사무실\n수습 3개월\n전형: 서류 → 면접";
function useDraft(id: SupportToolId) {
  const key = "hrbip.support-tools.v1." + id;
  const [initial] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { data: {}, save: false, error: "" };
      const saved = JSON.parse(raw);
      if (
        !saved ||
        !saved.data ||
        typeof saved.data !== "object" ||
        Array.isArray(saved.data)
      )
        throw new Error("Invalid draft");
      for (const [field, value] of Object.entries(saved.data)) {
        if (field === "lines") {
          if (
            !Array.isArray(value) ||
            value.length < 1 ||
            value.length > 500 ||
            value.some(
              (line) =>
                !line ||
                typeof line.name !== "string" ||
                typeof line.value !== "string" ||
                typeof line.note !== "string" ||
                !["pay", "deduction"].includes(line.kind),
            )
          )
            throw new Error("Invalid lines");
        } else if (typeof value !== "string" && typeof value !== "boolean")
          throw new Error("Invalid field");
      }
      return {
        data: saved.data as Record<string, unknown>,
        save: true,
        error: "",
      };
    } catch {
      return {
        data: {},
        save: false,
        error:
          "저장된 입력을 읽지 못했어요. 새로 입력하거나 입력 지우기를 선택해 주세요.",
      };
    }
  });
  const [data, setData] = useState<Record<string, unknown>>(initial.data);
  const [save, setSave] = useState(initial.save);
  const [error, setError] = useState(initial.error);
  useEffect(() => {
    try {
      if (save) localStorage.setItem(key, JSON.stringify({ data }));
      else localStorage.removeItem(key);
      setError((previous) => (previous === initial.error ? previous : ""));
    } catch {
      setError(
        "브라우저 보관에 실패했어요. 입력과 결과를 별도로 내려받아 주세요.",
      );
    }
  }, [key, data, save, initial.error]);
  const value = (key: string, fallback = "") =>
    typeof data[key] === "string" ? (data[key] as string) : fallback;
  const bool = (key: string) => data[key] === true;
  return {
    data,
    setData,
    save,
    setSave,
    error,
    clearError: () => setError(""),
    value,
    bool,
  };
}
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function SupportToolCards({
  onOpen,
}: {
  onOpen: (id: SupportToolId) => void;
}) {
  return (
    <section
      className="quick-tools-section"
      aria-labelledby="support-tools-title"
    >
      <div className="tools-heading">
        <div>
          <span className="eyebrow">HRBIP · 업무 지원</span>
          <h2 id="support-tools-title">추가 업무 지원 도구</h2>
          <p>필요한 점검을 선택하고, 근거와 계산 과정을 확인하세요.</p>
        </div>
        <span className="count-pill">도구 5</span>
      </div>
      <div className="quick-tool-grid">
        {supportTools.map(({ id, title, description, icon: Icon, label }) => (
          <article className="quick-tool-card" key={id}>
            <div className="quick-card-label">
              <Icon size={23} aria-hidden="true" />
              {label}
            </div>
            <h3>{title}</h3>
            <p>{description}</p>
            <Button onClick={() => onOpen(id)} aria-label={title + " 열기"}>
              {title} <ArrowRight size={17} aria-hidden="true" />
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}
async function readDocument(file: File) {
  if (file.size > 3 * 1024 * 1024)
    throw new Error("TXT/DOCX 파일은 3MB까지 지원해요.");
  const buffer = await file.arrayBuffer();
  let text = "";
  if (/\.txt$/i.test(file.name))
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  else if (/\.docx$/i.test(file.name)) {
    const v = new DataView(buffer);
    let total = 0,
      entries = 0;
    for (let i = 0; i + 46 < v.byteLength; i++)
      if (v.getUint32(i, true) === 0x02014b50) {
        total += v.getUint32(i + 24, true);
        entries++;
        if (total > 20 * 1024 * 1024 || entries > 2000)
          throw new Error("문서 압축 해제 크기가 20MB를 넘어요.");
        i +=
          45 +
          v.getUint16(i + 28, true) +
          v.getUint16(i + 30, true) +
          v.getUint16(i + 32, true);
      }
    if (!entries) throw new Error("올바른 DOCX 압축 구조가 아니에요.");
    const { default: JSZip } = await import("jszip"),
      zip = await JSZip.loadAsync(buffer);
    const body = zip.file("word/document.xml");
    if (!body) throw new Error("DOCX 본문을 찾지 못했어요.");
    const xml = new DOMParser().parseFromString(
      await body.async("string"),
      "application/xml",
    );
    if (xml.querySelector("parsererror"))
      throw new Error("DOCX 본문 구조를 읽지 못했어요.");
    const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    text = Array.from(xml.getElementsByTagNameNS(ns, "p"))
      .map((p) =>
        Array.from(p.getElementsByTagNameNS(ns, "t"))
          .map((t) => t.textContent)
          .join(""),
      )
      .join("\n");
  } else
    throw new Error(
      "TXT 또는 DOCX를 선택해 주세요. PDF·이미지는 내용을 복사해 붙여넣어 주세요.",
    );
  if (!text.trim() || text.length > 200000)
    throw new Error("읽을 수 있는 본문이 없거나 20만 글자를 넘어요.");
  return text;
}
function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  const labelId = useId();
  return (
    <label>
      <span id={labelId}>{label}</span>
      <input
        aria-labelledby={labelId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  const labelId = useId();
  return (
    <label>
      <span id={labelId}>{label}</span>
      <select
        aria-labelledby={labelId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([value, label]) => (
          <option value={value} key={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SettlementImport({
  onApply,
}: {
  onApply: (lines: SettlementLine[]) => void;
}) {
  const [sheets, setSheets] = useState<RawSheet[]>([]),
    [selected, setSelected] = useState(""),
    [header, setHeader] = useState(0),
    [mapping, setMapping] = useState({
      name: "",
      kind: "",
      value: "",
      note: "",
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [encoding, setEncoding] = useState<"utf-8" | "euc-kr">("utf-8");
  const sheet = sheets.find((s) => s.id === selected),
    headers = sheet?.matrix[header] || [];
  function choose(s: RawSheet) {
    setSelected(s.id);
    setHeader(0);
    const h = s.matrix[0] || [];
    setMapping({
      name: h.find((x) => /항목|내역|항목명/.test(x)) || "",
      kind: h.find((x) => /구분|지급.*공제|종류/.test(x)) || "",
      value: h.find((x) => /금액|값|amount/i.test(x)) || "",
      note: h.find((x) => /근거|메모|비고/.test(x)) || "",
    });
  }
  return (
    <details className="quick-details">
      <summary>기존 CSV·XLSX 정산표에서 항목 가져오기</summary>
      <p>
        항목명·지급/공제 구분·금액 열을 직접 확인해 연결해요. 첫 5행을 미리 보고
        적용하며, 현재 입력 항목을 교체해요. 원본 파일은 수정·보관하지 않아요.
      </p>
      <SelectField
        label="CSV 문자 인코딩"
        value={encoding}
        onChange={(v) => setEncoding(v as typeof encoding)}
        options={[
          ["utf-8", "UTF-8"],
          ["euc-kr", "한글 Excel CSV (EUC-KR)"],
        ]}
      />
      <label>
        정산 자료 파일 (CSV·XLSX, 10MB)
        <input
          type="file"
          accept=".csv,.xlsx"
          disabled={busy}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setBusy(true);
            setError("");
            try {
              const parsed = await parseFile(f, encoding);
              if (!parsed.sheets.length)
                throw new Error("읽을 수 있는 시트가 없어요.");
              setSheets(parsed.sheets);
              choose(parsed.sheets[0]);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "파일을 읽지 못했어요.",
              );
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {busy && <p role="status">자료를 읽고 있어요.</p>}
      {sheet && (
        <>
          <div className="quick-fields">
            <SelectField
              label="정산 시트"
              value={selected}
              onChange={(id) => choose(sheets.find((s) => s.id === id)!)}
              options={sheets.map((s) => [s.id, s.name])}
            />
            <SelectField
              label="열 이름이 있는 행"
              value={String(header)}
              onChange={(v) => {
                setHeader(Number(v));
                setMapping({ name: "", kind: "", value: "", note: "" });
              }}
              options={sheet.matrix
                .slice(0, 30)
                .map((_, i) => [String(i), i + 1 + "행"])}
            />
            {(
              [
                ["name", "항목명"],
                ["kind", "지급·공제 구분"],
                ["value", "금액"],
                ["note", "근거 메모 (선택)"],
              ] as const
            ).map(([key, label]) => (
              <SelectField
                key={key}
                label={label + " 열"}
                value={mapping[key]}
                onChange={(v) => setMapping({ ...mapping, [key]: v })}
                options={[
                  ["", "연결 선택"],
                  ...headers
                    .filter(Boolean)
                    .map((h) => [h, h] as [string, string]),
                ]}
              />
            ))}
          </div>
          <div className="support-table-wrap">
            <table>
              <caption>선택 시트의 첫 5개 데이터 행</caption>
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th key={i}>{h || "이름 없음"}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.matrix.slice(header + 1, header + 6).map((row, i) => (
                  <tr key={i}>
                    {headers.map((_, j) => (
                      <td key={j}>{row[j]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            type="button"
            onClick={() => {
              try {
                if (!mapping.name || !mapping.kind || !mapping.value)
                  throw new Error("항목명·지급/공제·금액 열을 연결해 주세요.");
                if (
                  new Set(headers).size !== headers.length ||
                  headers.some((h) => !h)
                )
                  throw new Error(
                    "열 이름이 비어 있거나 중복돼요. 헤더 행과 원본을 확인해 주세요.",
                  );
                const index = (key: keyof typeof mapping) =>
                  headers.indexOf(mapping[key]);
                const rows = sheet.matrix
                  .slice(header + 1)
                  .filter((r) => r.some(Boolean));
                if (rows.length > 500)
                  throw new Error("500개 항목까지 가져올 수 있어요.");
                const lines = rows.map((row, i) => {
                  const k = (row[index("kind")] || "").trim();
                  if (!/^(지급|공제|pay|deduction)$/i.test(k))
                    throw new Error(
                      header +
                        i +
                        2 +
                        "행 구분은 지급/pay 또는 공제/deduction이어야 해요. 행을 자동 제외하지 않아요.",
                    );
                  return {
                    name: row[index("name")] || "",
                    kind: /^(지급|pay)$/i.test(k)
                      ? ("pay" as const)
                      : ("deduction" as const),
                    value: row[index("value")] || "",
                    note: row[index("note")] || "",
                  };
                });
                settlementCheck(lines, "", "파일에서 가져온 항목");
                onApply(lines);
                setError("");
                setSheets([]);
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "항목 연결을 확인해 주세요.",
                );
              }
            }}
          >
            연결 확인 후 항목 적용
          </Button>
        </>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </details>
  );
}

export function SupportToolPage({
  id,
  onHome,
}: {
  id: SupportToolId;
  onHome: () => void;
}) {
  const tool = supportTools.find((t) => t.id === id)!;
  const draft = useDraft(id);
  const [result, setResult] = useState<SupportResult | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const v = draft.value,
    b = draft.bool;
  function update(patch: Record<string, unknown>) {
    draft.clearError();
    draft.setData((old) => ({ ...old, ...patch }));
    setResult(null);
    setError("");
    setMessage("");
  }
  function sample() {
    if (id === "law") update({ ...lawExample });
    else if (id === "settlement")
      update({
        lines: lineExamples,
        claimed: "2030000",
        scope: "2026년 10월 최종 급여 정산 · 퇴직급여 별도",
      });
    else if (id === "leave") update({ ...leaveExample });
    else
      update({
        text: id === "contract" ? contractExample : recruitmentExample,
      });
  }
  const lines = Array.isArray(draft.data.lines)
    ? (draft.data.lines as SettlementLine[])
    : [{ name: "", kind: "pay" as const, value: "", note: "" }];
  function run() {
    try {
      let next: SupportResult;
      if (id === "law")
        next = lawGuide({
          question: v("question"),
          topic: v("topic", "payment") as LawInput["topic"],
          eventDate: v("eventDate"),
          agreement: v("agreement", "unknown") as LawInput["agreement"],
          endMeaning: v("endMeaning", "unknown") as LawInput["endMeaning"],
        });
      else if (id === "settlement")
        next = settlementCheck(lines, v("claimed"), v("scope"));
      else if (id === "leave")
        next = leaveCheck({
          mode: v("mode", "comparison") as LeaveInput["mode"],
          start: v("start"),
          end: v("end"),
          eligible: b("eligible"),
          complete: b("complete"),
          monthly: b("monthly"),
          prorataMonths: v("prorataMonths"),
          granted: v("granted"),
          carried: v("carried"),
          used: v("used"),
          expired: v("expired"),
          adjustment: v("adjustment"),
          stated: v("stated"),
          companyRule: v("companyRule"),
        });
      else
        next =
          id === "contract"
            ? contractCheck(v("text"))
            : recruitmentCheck(v("text"));
      setResult(next);
      setError("");
      setMessage("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "입력 자료를 확인해 주세요.");
      setResult(null);
    }
  }
  const field = (key: string, label: string, type = "text") => (
    <Field
      label={label}
      type={type}
      value={v(key)}
      onChange={(val) => update({ [key]: val })}
    />
  );
  const select = (
    key: string,
    label: string,
    fallback: string,
    options: [string, string][],
  ) => (
    <SelectField
      label={label}
      value={v(key, fallback)}
      onChange={(val) => update({ [key]: val })}
      options={options}
    />
  );
  const area = (key: string, label: string) => (
    <label>
      {label}
      <textarea
        aria-label={label}
        rows={8}
        maxLength={200000}
        value={v(key)}
        onChange={(e) => update({ [key]: e.target.value })}
      />
    </label>
  );
  let input: ReactNode;
  if (id === "law")
    input = (
      <>
        {area("question", "어떤 인사 상황인지 입력해 주세요")}
        <div className="support-topic-suggestions">
          {recommendTopics(v("question")).map((topic) => (
            <Button
              type="button"
              key={topic}
              variant="ghost"
              onClick={() => update({ topic })}
            >
              {topic === "payment"
                ? "지급기한"
                : topic === "leave"
                  ? "연차"
                  : "근로조건"}{" "}
              쟁점 선택
            </Button>
          ))}
        </div>
        <div className="quick-fields">
          {select("topic", "확인할 쟁점", "payment", [
            ["payment", "퇴직 시 지급기한"],
            ["leave", "연차·휴가 기준"],
            ["contract", "근로조건 명시"],
          ])}
          {field("eventDate", "사건 기준일 (모르면 비워두기)", "date")}
          {select("endMeaning", "입력 날짜의 의미", "unknown", [
            ["unknown", "미확인 / 해당 없음"],
            ["last", "마지막 근무·재직일"],
            ["ended", "근로관계 종료 시점"],
          ])}
          {select("agreement", "지급기일 연장 합의", "unknown", [
            ["unknown", "모름 / 해당 없음"],
            ["yes", "있음 · 효력은 별도 확인"],
            ["no", "없음"],
          ])}
        </div>
        <Notice>
          지급기한·연차·근로조건 명시를 지원해요. 공식 자료 확인일은{" "}
          {SOURCE_CHECKED}이며 실시간 법령 검색이나 외부 AI 답변이 아니에요.
          다른 주제와 사건 시점의 변경 법령은 공식 자료·상담에서 확인하세요.
        </Notice>
      </>
    );
  else if (id === "settlement")
    input = (
      <>
        {field("scope", "정산 기간·대상·범위")}
        <SettlementImport onApply={(lines) => update({ lines })} />
        <div className="support-settlement-lines">
          {lines.map((line, i) => (
            <fieldset key={i}>
              <legend>정산 항목 {i + 1}</legend>
              <div className="quick-fields">
                <Field
                  label={"항목명 " + (i + 1)}
                  value={line.name}
                  onChange={(name) =>
                    update({
                      lines: lines.map((l, j) =>
                        j === i ? { ...l, name } : l,
                      ),
                    })
                  }
                />
                <SelectField
                  label={"지급·공제 " + (i + 1)}
                  value={line.kind}
                  onChange={(kind) =>
                    update({
                      lines: lines.map((l, j) =>
                        j === i ? { ...l, kind } : l,
                      ),
                    })
                  }
                  options={[
                    ["pay", "지급"],
                    ["deduction", "공제"],
                  ]}
                />
                <Field
                  label={"금액 " + (i + 1) + " (원)"}
                  value={line.value}
                  onChange={(value) =>
                    update({
                      lines: lines.map((l, j) =>
                        j === i ? { ...l, value } : l,
                      ),
                    })
                  }
                />
                <Field
                  label={"산정 근거 메모 " + (i + 1)}
                  value={line.note}
                  onChange={(note) =>
                    update({
                      lines: lines.map((l, j) =>
                        j === i ? { ...l, note } : l,
                      ),
                    })
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  update({ lines: lines.filter((_, j) => j !== i) })
                }
                disabled={lines.length <= 1}
              >
                항목 {i + 1} 삭제
              </Button>
            </fieldset>
          ))}
        </div>
        <Button
          type="button"
          disabled={lines.length >= 500}
          onClick={() =>
            update({
              lines: [...lines, { name: "", kind: "pay", value: "", note: "" }],
            })
          }
        >
          항목 추가
        </Button>
        {field("claimed", "정산표 기재 지급액 (원, 선택)")}
        <Notice>
          합계 일치와 개별 금액·공제 근거의 타당성은 달라요. 입력되지 않은 값은
          0으로 채우지 않아요. 퇴직급여 산정·세금 계산은 포함하지 않아요.
        </Notice>
      </>
    );
  else if (id === "leave")
    input = (
      <>
        {select("mode", "점검 방식", "comparison", [
          ["comparison", "입사일·회사 기준 누적 부여 비교"],
          ["ledger", "연차대장 잔여 검산"],
        ])}
        {area("companyRule", "회사 기준과 검토 범위")}
        {v("mode", "comparison") === "comparison" ? (
          <>
            <div className="quick-fields">
              {field("start", "입사일", "date")}
              {field("end", "마지막 재직일", "date")}
              {field("prorataMonths", "회사 첫해 비례 개월 수 (0~12)")}
            </div>
            {(
              [
                [
                  "eligible",
                  "상시 5인 이상·주 소정근로시간 15시간 이상을 확인했어요",
                ],
                [
                  "complete",
                  "계속근로·매년 출근율 80% 이상·휴직 없음을 확인했어요",
                ],
                [
                  "monthly",
                  "첫해 매월 개근과 회사의 1월 1일·개월 비례 부여 규칙을 확인했어요",
                ],
              ] as const
            ).map(([key, label]) => (
              <label className="quick-checkbox" key={key}>
                <input
                  type="checkbox"
                  checked={b(key)}
                  onChange={(e) => update({ [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
            <Notice>
              확인한 조건에서만 계산해요. 회사의 첫 비례분은 15 × 입력 개월 ÷
              12로, 소수 반올림 없이 비교해요. 다른 기준·휴직·출근율
              미달·29~31일 입사·40년 초과 재직은 계산을 보류해요. 누적 부여량은
              현재 잔여나 지급 대상 일수가 아니에요.
            </Notice>
          </>
        ) : (
          <>
            <div className="quick-fields">
              {field("granted", "발생·부여 (일)")}
              {field("carried", "이월 (일)")}
              {field("used", "사용 (일)")}
              {field("expired", "소멸 (일)")}
              {field("adjustment", "추가 부여 조정 (일)")}
              {field("stated", "대장 잔여 (일, 선택)")}
            </div>
            <Notice>
              같은 기간·휴가 종류의 일 단위 자료로 입력해 주세요. 없음이 확인된
              값은 직접 0을 입력해요. 시간→일 자동 환산이나 법정 발생량 판단은
              하지 않아요.
            </Notice>
          </>
        )}
      </>
    );
  else
    input = (
      <>
        <label>
          문서 가져오기 (UTF-8 TXT·DOCX, 3MB)
          <input
            type="file"
            accept=".txt,.docx"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              try {
                const text = await readDocument(file);
                update({ text });
                setMessage(
                  "본문을 읽었어요. 추출된 내용과 줄을 확인한 뒤 점검하세요. 머리말·꼬리말·도형·이미지 텍스트는 포함하지 않아요.",
                );
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "문서를 읽지 못했어요.",
                );
              } finally {
                setBusy(false);
                e.target.value = "";
              }
            }}
          />
        </label>
        {area(
          "text",
          id === "contract"
            ? "계약 내용 (발췌·첨부 규정은 구분해 입력)"
            : "채용공고 내용",
        )}
        <p className="quick-draft-note">
          PDF·이미지는 텍스트를 복사해 붙여넣어 주세요. 결과의 줄 번호는 이 입력
          텍스트 기준이에요. 이름·연락처 등 점검에 불필요한 개인정보는 빼주세요.
        </p>
        <Notice>
          {id === "contract"
            ? "핵심 표현과 명시 항목을 점검해요. 표현 발견은 기준 충족을 뜻하지 않고 전체 계약의 적법성을 자동 판정하지 않아요."
            : "고용형태·근무지 비교와 안내 정보 점검이에요. 정보 보완 권장사항과 법적 의무를 구분하며, 법적 적합성·지원자 평가는 하지 않아요."}
        </Notice>
      </>
    );
  return (
    <section className="quick-tool-page">
      <PageTitle
        eyebrow="HRBIP · 추가 업무 지원 도구"
        title={tool.title}
        description={tool.description}
        actions={
          <Button variant="ghost" onClick={onHome}>
            모든 도구 보기
          </Button>
        }
      />
      <div className="support-privacy">
        <label className="quick-checkbox">
          <input
            type="checkbox"
            checked={draft.save}
            onChange={(e) => draft.setSave(e.target.checked)}
          />
          이 브라우저에 입력·의견 보관
        </label>
        <p>
          계산·문서 점검은 브라우저에서 처리해요. 입력을 서버·외부 AI로 보내지
          않아요. 보관을 선택하면 같은 브라우저·주소에서 복원돼요.
        </p>
        {draft.error && <Notice tone="error">{draft.error}</Notice>}
      </div>
      <form
        className="panel support-input"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <div className="section-heading">
          <h2>자료 입력·조건 확인</h2>
          <div className="actions">
            <Button type="button" onClick={sample}>
              가상 예시 불러오기
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                draft.clearError();
                draft.setData({});
                draft.setSave(false);
                setResult(null);
                setError("");
                setMessage("");
              }}
            >
              입력 지우기
            </Button>
          </div>
        </div>
        {input}
        {error && <Notice tone="error">{error}</Notice>}
        {message && <p role="status">{message}</p>}
        <Button type="submit" variant="primary" busy={busy}>
          입력 자료 점검하기 <ArrowRight size={17} />
        </Button>
      </form>
      {result && (
        <SupportOutput
          result={result}
          note={v("opinion")}
          onNote={(opinion) => draft.setData((old) => ({ ...old, opinion }))}
        />
      )}
    </section>
  );
}
function SupportOutput({
  result,
  note,
  onNote,
}: {
  result: SupportResult;
  note: string;
  onNote: (s: string) => void;
}) {
  const [feedback, setFeedback] = useState("");
  useEffect(() => setFeedback(""), [result]);
  async function excel() {
    try {
      const ExcelJS = (await import("exceljs")).default,
        wb = new ExcelJS.Workbook();
      const criteria = wb.addWorksheet("보고 기준");
      [result.title, result.summary, result.scope, ...result.context].forEach(
        (x) => criteria.addRow([x]),
      );
      result.sourceIds.forEach((id) =>
        criteria.addRow([sources[id].name, sources[id].url, SOURCE_CHECKED]),
      );
      const rows = wb.addWorksheet("대조표");
      rows.addRow(result.columns);
      result.rows.forEach((values) => {
        const row = rows.addRow(
          values.map((value, j) =>
            j > 0 && /^-?[\d,]+(?:\.\d{1,4})?[원일]$/.test(value)
              ? Number(value.slice(0, -1).replaceAll(",", ""))
              : value,
          ),
        );
        values.forEach((value, j) => {
          if (j > 0 && typeof row.getCell(j + 1).value === "number")
            row.getCell(j + 1).numFmt = '#,##0.####"' + value.slice(-1) + '"';
        });
      });
      const findings = wb.addWorksheet("확인 항목");
      findings.addRow(["항목", "상태", "근거·원문 위치", "다음 행동"]);
      result.findings.forEach((f) =>
        findings.addRow([f.title, names[f.level], f.evidence, f.action]),
      );
      const checklist = wb.addWorksheet("담당자 확인");
      result.checklist.forEach((x) => checklist.addRow([x]));
      checklist.addRow(["담당자 의견", note]);
      for (const s of wb.worksheets) {
        s.columns.forEach((c) => (c.width = 36));
        s.eachRow((r) =>
          r.eachCell((c) => {
            c.alignment = { wrapText: true, vertical: "top" };
          }),
        );
      }
      download(
        new Blob([(await wb.xlsx.writeBuffer()) as ArrayBuffer], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        "HRBIP_" + result.title + "_검토표.xlsx",
      );
      setFeedback("검토표를 내려받았어요.");
    } catch {
      setFeedback(
        "검토표를 만들지 못했어요. 텍스트 다운로드로 보관하고 다시 시도해 주세요.",
      );
    }
  }
  const names = {
    difference: "불일치",
    check: "확인 필요",
    unverified: "미검증",
    info: "안내·계산 확인",
  };
  return (
    <section className="panel support-output" aria-label="업무 지원 점검 결과">
      <h2>점검 결과</h2>
      <Notice>{result.summary}</Notice>
      <p className="support-scope">{result.scope}</p>
      <details>
        <summary>입력·검토 기준 확인</summary>
        <ul>
          {result.context.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </details>
      {result.rows.length > 0 && (
        <div className="support-table-wrap">
          <table>
            <caption>입력 자료·계산 대조표</caption>
            <thead>
              <tr>
                {result.columns.map((column) => (
                  <th scope="col" key={column}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) =>
                    j === 0 ? (
                      <th scope="row" key={j}>
                        {cell}
                      </th>
                    ) : (
                      <td key={j}>{cell}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="support-findings">
        {result.findings.map((f, i) => (
          <article key={i} className={"support-finding status-" + f.level}>
            <span className="tag">{names[f.level]}</span>
            <h3>{f.title}</h3>
            <p className="support-evidence">{f.evidence}</p>
            <p>
              <strong>다음 행동</strong> · {f.action}
            </p>
            {f.source && (
              <a href={sources[f.source].url} target="_blank" rel="noreferrer">
                {sources[f.source].name} ↗
              </a>
            )}
          </article>
        ))}
      </div>
      <h3>준비할 자료·체크리스트</h3>
      <ul>
        {result.checklist.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      {result.sourceIds.length > 0 && (
        <>
          <h3>관련 공식 근거</h3>
          <p>
            자료 확인일 {SOURCE_CHECKED} · 사건 시점의 시행일·연혁은 원문에서
            확인하세요.
          </p>
          <ul>
            {result.sourceIds.map((id) => (
              <li key={id}>
                <a href={sources[id].url} target="_blank" rel="noreferrer">
                  {sources[id].law} · {sources[id].name} ↗
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
      <label>
        담당자 확인·의견
        <textarea
          aria-label="담당자 확인·의견"
          rows={4}
          value={note}
          onChange={(e) => onNote(e.target.value)}
        />
      </label>
      <div className="actions">
        <Button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(resultText(result, note));
              setFeedback("검토 내용을 복사했어요.");
            } catch {
              setFeedback(
                "클립보드에 접근하지 못했어요. 텍스트 다운로드로 보관해 주세요.",
              );
            }
          }}
        >
          <Copy size={17} />
          결과 복사
        </Button>
        <Button
          onClick={() =>
            download(
              new Blob([resultText(result, note)], {
                type: "text/plain;charset=utf-8",
              }),
              "HRBIP_" + result.title + ".txt",
            )
          }
        >
          <Download size={17} />
          텍스트 다운로드
        </Button>
        <Button onClick={excel}>
          <Download size={17} />
          검토표 Excel 다운로드
        </Button>
      </div>
      {feedback && <p role="status">{feedback}</p>}
    </section>
  );
}
