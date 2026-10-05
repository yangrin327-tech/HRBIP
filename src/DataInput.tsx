import { useState, type ChangeEvent } from "react";
import {
  Upload,
  FileSpreadsheet,
  ArrowRight,
  FlaskConical,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { Workspace, Dataset } from "../shared/model";
import {
  parseFile,
  sheetToDatasets,
  type RawSheet,
  type Original,
} from "./files";
import { Button, Notice, PageTitle, Steps } from "./ui";
import { SheetSetup } from "./SheetSetup";
type Props = {
  w: Workspace;
  setW: (fn: (w: Workspace) => void) => void;
  originals: Original[];
  setOriginals: (v: Original[]) => void;
  onNext: () => void;
  onSample: () => void;
};
export function DataInput({
  w,
  setW,
  originals,
  setOriginals,
  onNext,
  onSample,
}: Props) {
  const [sheets, setSheets] = useState<RawSheet[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [encoding, setEncoding] = useState<"utf-8" | "euc-kr">("utf-8");
  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    setError("");
    setBusy(true);
    try {
      if (
        files.reduce((n, f) => n + f.size, 0) +
          originals.reduce((n, o) => n + o.data.length * 0.75, 0) >
        20 * 1024 * 1024
      )
        throw new Error(
          "선택한 파일 합계는 20MB까지 지원합니다. 새 작업에서 파일을 나누어 주세요.",
        );
      const parsed: Awaited<ReturnType<typeof parseFile>>[] = [];
      for (const file of files) parsed.push(await parseFile(file, encoding));
      setSheets((prev) => [...prev, ...parsed.flatMap((p) => p.sheets)]);
      setOriginals([...originals, ...parsed.map((p) => p.original)]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function apply() {
    try {
      const chosen = sheets.filter((s) => s.selected).flatMap(sheetToDatasets);
      if (
        w.datasets.reduce((n, d) => n + d.rows.length, 0) +
          chosen.reduce((n, d) => n + d.rows.length, 0) >
        30000
      )
        throw new Error("전체 데이터는 30,000행까지 지원합니다.");
      if (w.datasets.length + chosen.length > 24)
        throw new Error("한 작업에서 표 24개까지 지원합니다.");
      setW((v) => {
        v.datasets.push(...chosen);
        v.basisConfirmed = false;
        v.audit.push({
          at: new Date().toISOString(),
          action:
            "파일에서 " + chosen.length + "개 표를 선택함. 원본 변경 없음.",
        });
      });
      setSheets([]);
      onNext();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="PEOPLE REPORT"
        title="어떤 자료로 시작할까요?"
        description="쓰고 있는 파일을 그대로 가져오세요. 필요한 항목은 다음 단계에서 연결해요."
      />
      <Steps current={0} />
      <div className="input-grid">
        <section className="panel">
          <div className="section-heading">
            <FileSpreadsheet />
            <h2>내 자료 불러오기</h2>
            <span className="tag">CSV · XLSX</span>
          </div>
          <label className={"dropzone " + (busy ? "loading" : "")}>
            <span className="upload-icon">
              <Upload size={29} />
            </span>
            <strong>
              {busy ? "파일과 시트를 읽고 있어요…" : "클릭해서 파일 선택"}
            </strong>
            <span>여러 파일을 한 번에 선택할 수 있어요</span>
            <input
              type="file"
              accept=".csv,.xlsx"
              multiple
              onChange={upload}
              disabled={busy}
              aria-label="파일 업로드"
            />
          </label>
          <div className="row between">
            <small>파일당 10MB · 합계 20MB · 표당 10,000행</small>
            <label className="inline-field">
              CSV 인코딩
              <select
                value={encoding}
                onChange={(e) => setEncoding(e.target.value as typeof encoding)}
              >
                <option value="utf-8">UTF-8</option>
                <option value="euc-kr">EUC-KR</option>
              </select>
            </label>
          </div>
          <p className="muted small">
            XLSX 수식은 파일에 저장된 계산 결과를 읽어요. 암호
            파일·XLS·XLSM·교차표·합계 행이 섞인 표는 먼저 정리가 필요해요. 헤더
            위치는 아래에서 선택할 수 있어요.
          </p>
          {error && <Notice tone="error">{error}</Notice>}
          {sheets.length > 0 && (
            <div className="sheet-list">
              <h3>가져올 시트와 헤더 행</h3>
              {sheets.map((s) => (
                <SheetSetup
                  key={s.id}
                  s={s}
                  onChange={(next) =>
                    setSheets((v) => v.map((x) => (x.id === s.id ? next : x)))
                  }
                />
              ))}
            </div>
          )}
          {w.datasets.length > 0 && (
            <div className="sheet-list">
              <h3>현재 작업에 연결한 표</h3>
              {w.datasets.map((d) => (
                <div key={d.id} className="row between">
                  <span>
                    {d.name} <small>{d.rows.length.toLocaleString()}행</small>
                  </span>
                  <Button
                    variant="ghost"
                    aria-label={d.name + " 제거"}
                    onClick={() => {
                      if (
                        confirm(
                          "이 표를 작업에서 제거할까요? 원본 파일은 변경하지 않습니다.",
                        )
                      )
                        setW((v) => {
                          v.datasets = v.datasets.filter((x) => x.id !== d.id);
                          v.basisConfirmed = false;
                          v.audit.push({
                            at: new Date().toISOString(),
                            action: d.name + " 표를 작업에서 제거함",
                          });
                        });
                    }}
                  >
                    <Trash2 size={17} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
        <aside className="stack">
          <section className="panel sample-panel">
            <FlaskConical size={25} />
            <h2>자료 없이 먼저 둘러보기</h2>
            <p>가상 인사·근태·지급 자료로 모든 단계를 체험해 보세요.</p>
            <Button onClick={onSample}>
              샘플 데이터 선택 <ArrowRight size={16} />
            </Button>
            <small>샘플도 업로드 파일과 같은 집계 과정을 거쳐요.</small>
          </section>
          <section className="panel compact">
            <h3>어떤 자료를 준비하면 되나요?</h3>
            <dl className="requirements">
              <dt>인원·입퇴사</dt>
              <dd>
                사번, 입사일, 퇴사일
                <br />
                선택: 부서, 고용형태
              </dd>
              <dt>근태·휴가</dt>
              <dd>
                사번, 기준일, 항목, 값<br />
                기록 ID와 시간·일 단위
              </dd>
              <dt>인건비</dt>
              <dd>
                사번, 지급일, 지급 항목, 금액
                <br />
                기록 ID와 금액 단위
              </dd>
            </dl>
          </section>
        </aside>
      </div>
      <section className="panel retention">
        <ShieldCheck />
        <div>
          <h3>원본은 보호하고, 필요한 자료만</h3>
          <p>
            파일 읽기와 확인은 브라우저 메모리에서 진행해요. 저장·내보내기를
            요청할 때 필요한 자료를 이 PC의 서버로 보내요. 로그인 후 저장하면
            연결한 분석 데이터는 보관되고, 파일 원본은 아래 선택에 따라 별도로
            보관해요.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={w.retainOriginals}
              onChange={(e) =>
                setW((v) => {
                  v.retainOriginals = e.target.checked;
                })
              }
            />
            저장할 때 업로드 원본 파일도 함께 보관하기
          </label>
          <small>
            기본은 원본 미보관이에요. 저장하지 않고 탭을 닫으면 작업은 사라져요.
          </small>
        </div>
      </section>
      <div className="bottom-actions">
        <span className="muted">
          있는 자료로만 분석해요. 세 종류를 모두 준비하지 않아도 괜찮아요.
        </span>
        <Button
          variant="primary"
          disabled={
            busy || (!w.datasets.length && !sheets.some((s) => s.selected))
          }
          onClick={apply}
        >
          항목 연결·데이터 확인 <ArrowRight size={18} />
        </Button>
      </div>
    </>
  );
}
