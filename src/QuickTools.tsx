import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Copy,
  Download,
  FileText,
  ListChecks,
  Printer,
} from "lucide-react";
import { Button, Notice, PageTitle } from "./ui";
import {
  calendarPeriod,
  offsetDate,
  compareLists,
  comparisonCsv,
  certificateLines,
  type Certificate,
  type ListComparison,
  type ListEntry,
} from "../shared/quick-tools";

export const quickTools = [
  {
    id: "dates",
    title: "날짜·근속기간 계산기",
    short: "날짜·기간 계산",
    description:
      "두 날짜 사이의 기간과 기준일에서 며칠 전·후인지 바로 계산해요.",
    icon: CalendarDays,
    label: "날짜 계산",
  },
  {
    id: "lists",
    title: "두 명단 비교기",
    short: "두 명단 비교",
    description: "명단 두 개를 붙여넣고 공통·누락·중복 항목을 확인해요.",
    icon: ListChecks,
    label: "명단 정리",
  },
  {
    id: "documents",
    title: "인사 문서 작성기",
    short: "인사 문서 작성",
    description:
      "재직·경력증명서를 작성하고 편집 가능한 Word 파일로 내려받아요.",
    icon: FileText,
    label: "문서 작성",
  },
] as const;
export type QuickToolId = (typeof quickTools)[number]["id"];
export function toolFromHash(): QuickToolId | undefined {
  return quickTools.find((tool) => location.hash === "#tools/" + tool.id)?.id;
}

function today() {
  const date = new Date();
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function useToolDraft<T extends object>(id: QuickToolId, initial: T) {
  const key = "hrbip.quick-tools.v1." + id;
  const [loaded] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { data: initial, error: "" };
      const saved = JSON.parse(raw);
      if (!saved || typeof saved !== "object" || Array.isArray(saved))
        throw new Error();
      const data = { ...initial };
      for (const field of Object.keys(initial) as (keyof T)[]) {
        if (typeof saved[field] === typeof initial[field])
          data[field] = saved[field];
      }
      return { data, error: "" };
    } catch {
      return {
        data: initial,
        error:
          "저장된 입력을 불러오지 못했어요. 새로 입력한 결과는 다운로드해 보관해 주세요.",
      };
    }
  });
  const [data, setData] = useState<T>(loaded.data);
  const [error, setError] = useState(loaded.error);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      if (!loaded.error) setError("");
    } catch {
      setError(
        "입력 내용을 브라우저에 저장하지 못했어요. 창을 닫기 전에 결과를 다운로드해 주세요.",
      );
    }
  }, [data, key, loaded.error]);
  return { data, setData, error };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function DraftNotice({ error }: { error: string }) {
  return error ? (
    <Notice tone="error">{error}</Notice>
  ) : (
    <p className="quick-draft-note">
      입력 내용은 이 브라우저에 자동 저장돼요. 다른 기기에는 동기화되지 않아요.
      ‘입력 지우기’로 비울 수 있어요.
    </p>
  );
}
function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {label}
      <input
        type="date"
        min="1900-01-01"
        max="2100-12-31"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function QuickToolCards({
  onOpen,
}: {
  onOpen: (id: QuickToolId) => void;
}) {
  return (
    <section
      className="quick-tools-section"
      aria-labelledby="quick-tools-title"
    >
      <div className="tools-heading">
        <div>
          <span className="eyebrow">일상 업무 도구</span>
          <h2 id="quick-tools-title">필요할 때, 가볍게 꺼내 쓰세요.</h2>
        </div>
        <span className="count-pill">보조 도구 3</span>
      </div>
      <div className="quick-tool-grid">
        {quickTools.map(({ id, title, description, icon: Icon, label }) => (
          <article className="quick-tool-card" key={id}>
            <div className="quick-card-label">
              <Icon size={23} aria-hidden="true" />
              <span>{label}</span>
            </div>
            <h3>{title}</h3>
            <p>{description}</p>
            <Button onClick={() => onOpen(id)} aria-label={title + " 열기"}>
              도구 열기 <ArrowRight size={17} aria-hidden="true" />
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}

export function QuickToolPage({
  id,
  onHome,
}: {
  id: QuickToolId;
  onHome: () => void;
}) {
  const tool = quickTools.find((item) => item.id === id)!;
  return (
    <section className="quick-tool-page">
      <PageTitle
        eyebrow="HRBIP · 일상 업무 도구"
        title={tool.title}
        description={tool.description}
        actions={
          <Button variant="ghost" onClick={onHome}>
            모든 도구 보기
          </Button>
        }
      />
      {id === "dates" ? (
        <DateTool />
      ) : id === "lists" ? (
        <ListTool />
      ) : (
        <DocumentTool />
      )}
    </section>
  );
}

function DateTool() {
  const initial = {
    start: "",
    end: today(),
    includeEnd: false,
    base: today(),
    offset: "30",
  };
  const { data, setData, error } = useToolDraft("dates", initial);
  const [period, setPeriod] = useState<ReturnType<
    typeof calendarPeriod
  > | null>(null);
  const [target, setTarget] = useState("");
  const [periodError, setPeriodError] = useState("");
  const [targetError, setTargetError] = useState("");
  function update(patch: Partial<typeof initial>) {
    setData((previous) => ({ ...previous, ...patch }));
    setPeriod(null);
    setTarget("");
    setPeriodError("");
    setTargetError("");
  }
  return (
    <>
      <DraftNotice error={error} />
      <div className="quick-two-columns">
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              setPeriod(calendarPeriod(data.start, data.end, data.includeEnd));
              setPeriodError("");
            } catch (err) {
              setPeriod(null);
              setPeriodError((err as Error).message);
            }
          }}
        >
          <h2>두 날짜 사이의 기간</h2>
          <p className="muted">
            입사일부터 기준일까지, 또는 원하는 두 날짜를 비교해요.
          </p>
          <div className="quick-fields">
            <DateInput
              label="시작일·입사일"
              value={data.start}
              onChange={(start) => update({ start })}
            />
            <DateInput
              label="종료일·기준일"
              value={data.end}
              onChange={(end) => update({ end })}
            />
          </div>
          <label className="quick-checkbox">
            <input
              type="checkbox"
              checked={data.includeEnd}
              onChange={(e) => update({ includeEnd: e.target.checked })}
            />
            종료일도 포함해 계산 (+1일)
          </label>
          <p className="small">
            기본값은 두 날짜의 차이예요. 같은 날짜는 0일, 종료일을 포함하면
            1일로 계산해요.
          </p>
          <Button type="submit" variant="primary">
            기간 계산하기
          </Button>
          {periodError && <Notice tone="error">{periodError}</Notice>}
          {period && (
            <div className="quick-result" role="status">
              <span>달력상 기간</span>
              <strong>
                {period.years}년 {period.months}개월 {period.days}일
              </strong>
              <p>
                총 <b>{period.totalDays.toLocaleString()}일</b> · 종료일{" "}
                {data.includeEnd ? "포함" : "미포함"}
              </p>
            </div>
          )}
          <details className="quick-details">
            <summary>계산 기준 보기</summary>
            <p>
              연·월은 시작일과 같은 날짜를 기준으로 계산하고, 해당 날짜가 없는
              달은 말일을 사용해요. 남은 기간은 일수로 표시해요. 휴직·휴일을
              제외하지 않은 달력상 기간으로, 퇴직금·연차의 법정 산정 기준과는
              별개예요.
            </p>
          </details>
        </form>
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            try {
              setTarget(offsetDate(data.base, data.offset));
              setTargetError("");
            } catch (err) {
              setTarget("");
              setTargetError((err as Error).message);
            }
          }}
        >
          <h2>며칠 전·후의 날짜</h2>
          <p className="muted">
            기준일에서 일정 일수를 더하거나 빼서 날짜를 찾아요.
          </p>
          <div className="quick-fields">
            <DateInput
              label="날짜 계산 기준일"
              value={data.base}
              onChange={(base) => update({ base })}
            />
            <label>
              이동할 일수
              <input
                type="number"
                required
                min={-36500}
                max={36500}
                step={1}
                value={data.offset}
                onChange={(e) => update({ offset: e.target.value })}
              />
              <small>30은 30일 후, -30은 30일 전이에요.</small>
            </label>
          </div>
          <p className="small">
            기준일은 0일로 계산하며 주말·공휴일도 포함해요.
          </p>
          <Button type="submit" variant="primary">
            날짜 계산하기
          </Button>
          {targetError && <Notice tone="error">{targetError}</Notice>}
          {target && (
            <div className="quick-result" role="status">
              <span>
                {data.base}에서 {Math.abs(Number(data.offset))}일{" "}
                {Number(data.offset) < 0 ? "전" : "후"}
              </span>
              <strong>{target}</strong>
            </div>
          )}
        </form>
      </div>
      <Button
        onClick={() => {
          setData({
            start: "",
            end: "",
            includeEnd: false,
            base: "",
            offset: "",
          });
          setPeriod(null);
          setTarget("");
          setPeriodError("");
          setTargetError("");
        }}
      >
        입력 지우기
      </Button>
    </>
  );
}

function ListTool() {
  const { data, setData, error } = useToolDraft("lists", {
    left: "",
    right: "",
    ignoreCase: false,
  });
  const [result, setResult] = useState<ListComparison | null>(null);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState("onlyLeft");
  function update(patch: Partial<typeof data>) {
    setData((old) => ({ ...old, ...patch }));
    setResult(null);
    setMessage("");
  }
  const groups: {
    key: keyof Pick<
      ListComparison,
      "onlyLeft" | "onlyRight" | "common" | "duplicateLeft" | "duplicateRight"
    >;
    title: string;
    description: string;
  }[] = [
    {
      key: "onlyLeft",
      title: "A에만 있음",
      description: "명단 A에는 있고 B에는 없는 항목이에요.",
    },
    {
      key: "onlyRight",
      title: "B에만 있음",
      description: "명단 B에는 있고 A에는 없는 항목이에요.",
    },
    {
      key: "common",
      title: "공통",
      description:
        "양쪽에 있는 항목이에요. 표시 내용과 줄 번호는 A 기준이에요.",
    },
    {
      key: "duplicateLeft",
      title: "A 안의 중복",
      description: "명단 A에서 두 번 이상 나온 항목과 원본 줄 번호예요.",
    },
    {
      key: "duplicateRight",
      title: "B 안의 중복",
      description: "명단 B에서 두 번 이상 나온 항목과 원본 줄 번호예요.",
    },
  ];
  const selected = groups.find((group) => group.key === tab)!;
  const entries: ListEntry[] = result ? result[selected.key] : [];
  return (
    <>
      <DraftNotice error={error} />
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          try {
            setResult(compareLists(data.left, data.right, data.ignoreCase));
            setTab("onlyLeft");
            setMessage("");
          } catch (err) {
            setResult(null);
            setMessage((err as Error).message);
          }
        }}
      >
        <div className="section-heading">
          <h2>비교할 한 열씩 붙여넣으세요.</h2>
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              update({
                left: "HR001\nHR002\nHR003\nHR003",
                right: "HR002\nHR003\nHR004",
              })
            }
          >
            예시 넣기
          </Button>
        </div>
        <p className="muted">
          한 줄에 한 항목, 제목 행 없이 입력해 주세요. 앞뒤 공백·빈 줄은
          제외하고 비교해요. 동명이인을 구분하려면 사번이나 이메일처럼 고유한
          값을 사용하세요.
        </p>
        <div className="quick-two-columns">
          <label>
            명단 A
            <textarea
              rows={9}
              maxLength={500000}
              value={data.left}
              onChange={(e) => update({ left: e.target.value })}
              placeholder={"HR001\nHR002\nHR003"}
            />
          </label>
          <label>
            명단 B
            <textarea
              rows={9}
              maxLength={500000}
              value={data.right}
              onChange={(e) => update({ right: e.target.value })}
              placeholder={"HR002\nHR003\nHR004"}
            />
          </label>
        </div>
        <label className="quick-checkbox">
          <input
            type="checkbox"
            checked={data.ignoreCase}
            onChange={(e) => update({ ignoreCase: e.target.checked })}
          />
          영문 대소문자를 구분하지 않기
        </label>
        <div className="actions">
          <Button type="submit" variant="primary">
            명단 비교하기
          </Button>
          <Button
            type="button"
            onClick={() => update({ left: "", right: "", ignoreCase: false })}
          >
            입력 지우기
          </Button>
        </div>
        {message && <Notice tone="error">{message}</Notice>}
      </form>
      {result && (
        <section className="panel" aria-label="명단 비교 결과">
          <div className="section-heading">
            <h2>비교 결과</h2>
            <Button
              onClick={() =>
                downloadBlob(
                  new Blob([comparisonCsv(result)], {
                    type: "text/csv;charset=utf-8",
                  }),
                  "HRBIP_명단비교.csv",
                )
              }
            >
              <Download size={17} aria-hidden="true" />
              전체 결과 CSV 다운로드
            </Button>
          </div>
          <p>
            A {result.leftCount}건 (고유 {result.leftUnique}개) · B{" "}
            {result.rightCount}건 (고유 {result.rightUnique}개)
          </p>
          <div
            className="quick-result-filters"
            role="group"
            aria-label="결과 종류"
          >
            {groups.map((group) => (
              <Button
                key={group.key}
                aria-pressed={tab === group.key}
                variant={tab === group.key ? "primary" : "secondary"}
                onClick={() => setTab(group.key)}
              >
                {group.title} {result[group.key].length}
              </Button>
            ))}
          </div>
          <p className="muted">{selected.description}</p>
          {entries.length ? (
            <ul className="quick-entry-list" aria-label={selected.title}>
              {entries.slice(0, 200).map((entry) => (
                <li key={entry.value}>
                  <strong>{entry.value}</strong>
                  <small>
                    원본 {entry.lines.join(", ")}줄 · {entry.lines.length}회
                  </small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="quick-empty">해당하는 항목이 없어요.</p>
          )}
          {entries.length > 200 && (
            <p>
              처음 200개를 표시했어요. 전체 {entries.length.toLocaleString()}
              개는 CSV에서 확인하세요.
            </p>
          )}
        </section>
      )}
    </>
  );
}

async function documentBlob(lines: string[]) {
  const { default: JSZip } = await import("jszip");
  const xml = (text: string) =>
    text
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      lines
        .map(
          (line, i) =>
            '<w:p><w:pPr><w:spacing w:after="240" w:line="360" w:lineRule="auto"/>' +
            (i === 0 ? '<w:jc w:val="center"/>' : "") +
            '</w:pPr><w:r><w:rPr><w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="맑은 고딕"/><w:sz w:val="' +
            (i === 0 ? "40" : "24") +
            '"/>' +
            (i === 0 ? "<w:b/>" : "") +
            "</w:rPr>" +
            line
              .split(/\r\n|\n|\r/)
              .map(
                (part, n) =>
                  (n ? "<w:br/>" : "") +
                  '<w:t xml:space="preserve">' +
                  xml(part) +
                  "</w:t>",
              )
              .join("") +
            "</w:r></w:p>",
        )
        .join("") +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>',
  );
  return zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    compression: "DEFLATE",
  });
}

function DocumentTool() {
  const blank: Certificate = {
    kind: "employment",
    name: "",
    company: "",
    department: "",
    position: "",
    start: "",
    end: "",
    duties: "",
    purpose: "",
    issued: today(),
    representative: "",
  };
  const { data, setData, error } = useToolDraft("documents", blank);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  let lines: string[] = [],
    validation = "";
  try {
    lines = certificateLines(data);
  } catch (err) {
    validation = (err as Error).message;
  }
  function update(patch: Partial<Certificate>) {
    setData((old) => ({ ...old, ...patch }));
    setMessage("");
    setCopied(false);
  }
  const field = (key: keyof Certificate, label: string, required = false) => (
    <label>
      {label}
      {required ? " *" : ""}
      <input
        required={required}
        maxLength={150}
        value={data[key]}
        onChange={(e) => update({ [key]: e.target.value })}
      />
    </label>
  );
  return (
    <>
      <DraftNotice error={error} />
      <div className="quick-document-layout">
        <form
          className="panel quick-document-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setMessage("");
            if (validation) {
              setMessage(validation);
              return;
            }
            setBusy(true);
            try {
              downloadBlob(
                await documentBlob(lines),
                "HRBIP_" + lines[0] + ".docx",
              );
            } catch {
              setMessage("문서를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>문서에 넣을 정보</h2>
          <p className="small">
            * 표시는 필수 항목이에요. 회사 확인·날인에 사용할 작성용 문서를
            만들어요.
          </p>
          <label>
            문서 종류
            <select
              value={data.kind}
              onChange={(e) =>
                update({ kind: e.target.value as Certificate["kind"] })
              }
            >
              <option value="employment">재직증명서</option>
              <option value="career">경력증명서</option>
            </select>
          </label>
          <div className="quick-fields">
            {field("name", "성명", true)}
            {field("company", "회사명", true)}
            {field("department", "부서")}
            {field("position", "직위")}
            <DateInput
              label="입사일 *"
              value={data.start}
              onChange={(start) => update({ start })}
            />
            {data.kind === "career" && (
              <DateInput
                label="재직 종료일 *"
                value={data.end}
                onChange={(end) => update({ end })}
              />
            )}
            <DateInput
              label="작성일 *"
              value={data.issued}
              onChange={(issued) => update({ issued })}
            />
            {field("purpose", "용도")}
            {field("representative", "대표자")}
          </div>
          <label>
            담당업무
            <textarea
              rows={3}
              maxLength={3000}
              value={data.duties}
              onChange={(e) => update({ duties: e.target.value })}
            />
          </label>
          {message && <Notice tone="error">{message}</Notice>}
          <div className="actions">
            <Button type="submit" variant="primary" busy={busy}>
              <Download size={17} aria-hidden="true" />
              Word 다운로드
            </Button>
            <Button
              type="button"
              onClick={() => {
                setData({ ...blank, issued: "" });
                setMessage("");
                setCopied(false);
              }}
            >
              입력 지우기
            </Button>
          </div>
        </form>
        <section
          className="panel quick-document-output"
          aria-label="문서 미리보기"
        >
          <div className="section-heading">
            <h2>문서 미리보기</h2>
            <span className="tag">작성용</span>
          </div>
          {validation ? (
            <div className="quick-empty">
              <FileText size={32} aria-hidden="true" />
              <p>{validation}</p>
              <small>필수 항목을 입력하면 문서가 여기에 표시돼요.</small>
            </div>
          ) : (
            <>
              <article className="quick-document-preview">
                <h3>{lines[0]}</h3>
                {lines
                  .slice(1)
                  .map((line, index) =>
                    line ? (
                      <p key={index}>{line}</p>
                    ) : (
                      <div className="quick-document-space" key={index} />
                    ),
                  )}
              </article>
              <div className="actions quick-document-actions">
                <Button
                  disabled={busy}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(lines.join("\n"));
                      setMessage("");
                      setCopied(true);
                    } catch {
                      setCopied(false);
                      setMessage(
                        "복사하지 못했어요. Word 파일을 다운로드하거나 미리보기의 문장을 선택해 복사하세요.",
                      );
                    }
                  }}
                >
                  <Copy size={17} aria-hidden="true" />
                  {copied ? "복사 완료" : "내용 복사"}
                </Button>
                <Button onClick={() => window.print()}>
                  <Printer size={17} aria-hidden="true" />
                  인쇄·PDF 저장
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
