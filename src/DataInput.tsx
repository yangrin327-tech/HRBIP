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
import { recognizeHrWorkbook, prepareHrWorkbook } from "./hr-workbook";
import { useGuest } from "./guest";
type Props = {
  w: Workspace;
  setW: (fn: (w: Workspace) => void) => void;
  originals: Original[];
  setOriginals: (v: Original[]) => void;
  onNext: () => void;
  onSample: () => void;
  onSampleList: () => void;
  repeating?: boolean;
};
export function DataInput({
  w,
  setW,
  originals,
  setOriginals,
  onNext,
  onSample,
  onSampleList,
  repeating = false,
}: Props) {
  const guest = useGuest();
  const [localSheets, setLocalSheets] = useState<RawSheet[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [encoding, setEncoding] = useState<"utf-8" | "euc-kr">("utf-8");
  const sheets = guest.enabled ? guest.sheets : localSheets;
  const setSheets = guest.enabled ? guest.setSheets : setLocalSheets;
  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    setError("");
    setBusy(true);
    try {
      if (
        files.reduce((n, f) => n + f.size, 0) +
          (originals.length
            ? originals.reduce((n, o) => n + o.data.length * 0.75, 0)
            : Array.from(
                new Map(
                  sheets.map((s) => [s.fileId, s.fileBytes || 0]),
                ).values(),
              ).reduce((a, b) => a + b, 0)) >
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
  const recommended = !w.datasets.length && recognizeHrWorkbook(sheets);
  function applyRecommended() {
    try {
      const prepared = prepareHrWorkbook(sheets);
      setW((v) => {
        const retain = v.retainOriginals;
        const repeatSettings = repeating
          ? {
              title: v.title,
              filters: v.filters,
              design: v.design,
              exitInclusive: v.exitInclusive,
              report: {
                generated: "",
                notes: "",
                basisKey: "",
                reviewedKey: "",
              },
              audit: [...v.audit, ...prepared.audit],
            }
          : {};
        Object.assign(v, prepared, { retainOriginals: retain }, repeatSettings);
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
      {repeating && (
        <Notice>
          새 자료로 반복 보고 중이에요. 이번 보고에 필요한 파일을 올려주세요.
          기존 직원 정보와 보고 문장은 비워두었어요. 다음 단계에서 지난 설정을
          연결하고 다시 검증해요.
        </Notice>
      )}
      <section
        className="panel preparation-guide"
        aria-label="업로드 전 준비 안내"
      >
        <h2>파일을 올리기 전에, 필요한 자료부터 확인하세요.</h2>
        <p className="muted">
          기존 파일의 열 이름은 달라도 괜찮아요. 가지고 있는 영역만 만들 수
          있으며, 다른 인사 시스템에 직접 접속하지 않아요.
        </p>
        <div className="preparation-grid">
          <article>
            <h3>인원·입퇴사</h3>
            <p>
              <strong>필요:</strong> 사번·입사일·퇴사일과 이력이 빠짐없이 있는
              기간. 부서·고용형태는 선택이에요.
            </p>
            <p>
              <strong>없으면:</strong> 현재 명단과 기준일로 해당 날짜의 인원만
              계산해요. 과거 인원과 입퇴사는 추정하지 않아요.
            </p>
          </article>
          <article>
            <h3>근태·휴가</h3>
            <p>
              <strong>필요:</strong> 사번·날짜·항목·수치와 시간/일 단위. 기록 ID
              또는 사번·날짜·항목의 조합으로 중복을 확인해요.
            </p>
            <p>
              <strong>없으면:</strong> 근태·휴가 분석은 자료 없음으로 표시해요.
              일수를 시간으로 임의 변환하지 않아요.
            </p>
          </article>
          <article>
            <h3>인건비</h3>
            <p>
              <strong>필요:</strong> 사번·지급일/귀속월·지급 항목·금액과 원/천
              원/만 원 단위. 기록 ID 또는 복합 키가 필요해요.
            </p>
            <p>
              <strong>없으면:</strong> 비용을 추정하지 않아요. 제공한 일부
              항목을 회사 전체 인건비로 표현하지 않아요.
            </p>
          </article>
        </div>
        <details>
          <summary>지원하는 표 구조와 준비 예시</summary>
          <p>
            CSV 또는 XLSX · 첫 열 이름 행을 선택할 수 있어요. 기본은 한 행에 한
            직원의 재직 구간, 또는 한 직원·날짜·항목의 기록이에요.
          </p>
          <p>
            예: 사번 | 기준월 | 항목 | 값 → A001 | 2026-10-01 | 연장근무 | 8
            (시간)
          </p>
          <p>
            총근무시간·휴가일수처럼 수치가 여러 열에 있으면 ‘열별 수치’ 구조를
            선택할 수 있어요. 설명 행·중간 소계·병합된 교차표는 먼저 정리해
            주세요. XLS·XLSM·암호 파일은 지원하지 않아요.
          </p>
          <p>
            여러 파일을 함께 쓰면 같은 사번 기준이어야 해요.
            이름·연락처·생년월일은 보고용 집계에 필요하지 않아요.
          </p>
        </details>
      </section>
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
            <Notice tone="success">
              <div>
                <strong>
                  업로드 완료 · {sheets.length}개 시트를 읽었어요.
                </strong>
                <p>{originals.map((o) => o.name).join(", ")}</p>
                <span>다음으로 분석할 자료와 연결 기준을 확인해 주세요.</span>
              </div>
            </Notice>
          )}
          {recommended && (
            <section className="import-recommendation">
              <span className="tag">통합 인사 파일 연결 추천</span>
              <h3>이 파일은 한 번에 연결할 수 있어요.</h3>
              <p>
                직원 명단과 월별 인사·근태·인건비 4개 시트를 연결해요. 아래
                기준이 파일의 의미와 같은지 확인해 주세요.
              </p>
              <ul>
                <li>
                  입사일·퇴사일은 그대로 보존해요. 부서·고용형태는 사번별 마지막
                  관측값을 연결해요.
                </li>
                <li>
                  전체 인원 이력은 첫 기준월 직전 월말부터 마지막 기준월 말까지
                  확인된 것으로 처리해요. 더 오래된 입사일을 이력 전체가 있다는
                  뜻으로 해석하지 않아요.
                </li>
                <li>
                  이 파일의 퇴사일은 <strong>첫 미재직일</strong>로 제안해요.
                  다음 화면에서 바꿀 수 있어요.
                </li>
                <li>
                  총근무·연장은 시간, 총휴가는 일 단위예요. 총근무에는
                  연장시간이 포함돼요.
                </li>
                <li>
                  인건비는 총지급액 + 회사부담보험료 + 퇴직급여충당액을
                  합산해요. 별도 총인건비 열을 다시 더하지 않아요.
                </li>
                <li>
                  항목설명·집계기준 시트와 이름·생년월일은 집계에서 제외해요.
                  원본 파일은 그대로 유지돼요.
                </li>
              </ul>
              <Button variant="primary" onClick={applyRecommended}>
                추천 연결을 확인하고 적용 <ArrowRight size={19} />
              </Button>
            </section>
          )}
          {sheets.length > 0 && (
            <details className="sheet-list" open={!recommended}>
              <summary>시트별로 직접 연결하기</summary>
              {sheets.map((s) => (
                <SheetSetup
                  key={s.id}
                  s={s}
                  onChange={(next) =>
                    setSheets((v) => v.map((x) => (x.id === s.id ? next : x)))
                  }
                />
              ))}
            </details>
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
            <Button variant="ghost" onClick={onSampleList}>
              다른 샘플 보기
            </Button>
            <small>샘플도 업로드 파일과 같은 집계 과정을 거쳐요.</small>
          </section>
        </aside>
      </div>
      <section className="panel retention">
        <ShieldCheck />
        <div>
          <h3>원본은 보호하고, 필요한 자료만</h3>
          {guest.enabled ? (
            <>
              <p>
                파일 읽기와 대시보드 분석은 브라우저에서 진행해요. 계산
                검증·내보내기 시 분석 자료를, 회사 양식 검사·적용 시 양식 파일을
                서버에 보내 일회성으로 처리해요. HRBIP 데이터베이스나 파일
                저장소에는 보관하지 않아요.
              </p>
              <p>
                작업 데이터·편집 내용·양식 연결은 이 브라우저에 자동 저장해요.
                새로고침과 다음 방문에도 이어서 사용할 수 있어요. 브라우저
                데이터 삭제 시 함께 삭제되고 다른 기기에 동기화되지 않아요.
                포트폴리오 시연에는 가상·비식별 자료를 사용해 주세요. 호스팅
                서비스의 접속·오류 로그는 별도이며, 실제 인사자료에 대한
                보안·운영 검증은 완료하지 않았어요.
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
                업로드 원본 파일도 이 브라우저에 보관하기
              </label>
              <small>
                기본은 원본 파일 미보관이에요. 분석 데이터와 선택한 시트의
                작업용 복사본은 자동 저장해요.
              </small>
              <small>
                서버 전송은 압축 후 4MB, 압축 전 40MB까지 지원해요. 넘으면 자료
                분할이나 양식 이미지 축소를 안내하며 임시 저장소로 우회하지
                않아요.
              </small>
            </>
          ) : (
            <>
              <p>
                파일 읽기와 확인은 브라우저 메모리에서 진행해요. 저장·내보내기를
                요청할 때 필요한 자료를 현재 접속한 HRBIP 서버로 보내요. 큰
                자료는 전송 중 임시 보관되며, 처리 완료 시 삭제돼요. 중단된
                전송은 10분 후 접근이 차단되고 다음 전송 시작 시 정리돼요.
                로그인 후 저장하면 연결한 분석 데이터는 보관되고, 파일 원본은
                아래 선택에 따라 별도로 보관해요.
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
                기본은 원본 미보관이에요. 저장하지 않고 탭을 닫으면 작업은
                사라져요.
              </small>
            </>
          )}
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
