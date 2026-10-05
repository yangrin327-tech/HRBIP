import { useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Link2,
  Pencil,
  RotateCcw,
} from "lucide-react";
import {
  fields,
  roleNames,
  type Workspace,
  type Dataset,
  type Role,
  type Field,
  audit,
} from "../shared/model";
import { aggregate, validate } from "../shared/analytics";
import { read, roleFields, requiredFields, months } from "../shared/import";
import { Button, Notice, PageTitle, Steps, Modal } from "./ui";
export function DataReview({
  w,
  setW,
  onBack,
  onNext,
}: {
  w: Workspace;
  setW: (fn: (v: Workspace) => void) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [selected, setSelected] = useState(w.datasets[0]?.id || ""),
    [page, setPage] = useState(0),
    [issuePage, setIssuePage] = useState(0),
    [edit, setEdit] = useState<{
      index: number;
      header: string;
      value: string;
    } | null>(null);
  const d = w.datasets.find((x) => x.id === selected) || w.datasets[0],
    issues = useMemo(() => validate(w), [w]),
    result = useMemo(() => aggregate(w), [w]);
  const errors = issues.filter((i) => i.severity === "error");
  const update = (fn: (d: Dataset) => void, action?: string) =>
    setW((v) => {
      const x = v.datasets.find((s) => s.id === d.id)!;
      fn(x);
      if (action) audit(v, action);
    });
  const change = (key: keyof Dataset, value: unknown) =>
    update(
      (x) => {
        (x as Record<string, unknown>)[key] = value;
        x.confirmed = false;
      },
      d.name + "의 " + key + " 설정 변경",
    );
  const available = Object.values(result.available).some(Boolean);
  if (!d)
    return (
      <Notice>
        먼저 자료를 선택하세요. <Button onClick={onBack}>자료 선택으로</Button>
      </Notice>
    );
  const categories = [
    ...new Set(d.rows.map((r) => read(d, r, "category"))),
  ].filter(Boolean);
  return (
    <>
      <PageTitle
        eyebrow="CHECK YOUR DATA"
        title="숫자의 기준부터, 정확하게."
        description="항목 연결과 데이터 의미를 확인하면 계산 가능한 범위를 알려드려요."
      />
      <Steps current={1} />
      <div className="review-summary">
        {(["people", "attendance", "payroll"] as Role[]).map((role) => (
          <div
            className={"mini-status " + (result.available[role] ? "ready" : "")}
            key={role}
          >
            {result.available[role] ? (
              <CheckCircle2 size={20} />
            ) : (
              <AlertTriangle size={20} />
            )}
            <div>
              <strong>{roleNames[role]}</strong>
              <small>
                {result.available[role] ? "분석 준비됨" : result.reasons[role]}
              </small>
            </div>
          </div>
        ))}
      </div>
      <section className="panel">
        <div className="section-heading">
          <Link2 />
          <h2>자료 항목 연결</h2>
          <span className="tag">{w.datasets.length}개 표</span>
        </div>
        <div className="dataset-tabs">
          {w.datasets.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setSelected(s.id);
                setPage(0);
              }}
              className={s.id === d.id ? "selected" : ""}
            >
              {s.name}
              {s.excluded ? " · 보류" : ""}
            </button>
          ))}
        </div>
        <div className="form-grid">
          <label>
            이 자료의 역할
            <select
              value={d.role}
              onChange={(e) =>
                update((x) => {
                  x.role = e.target.value as Role;
                  x.unit = x.role === "payroll" ? "won" : "hours";
                  x.confirmed = false;
                }, d.name + " 역할 변경")
              }
            >
              {Object.entries(roleNames).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            날짜 해석 방식
            <select
              value={d.dateFormat}
              onChange={(e) => change("dateFormat", e.target.value)}
            >
              <option value="ymd">연-월-일 (YYYY-MM-DD)</option>
              <option value="dmy">일/월/연 (DD/MM/YYYY)</option>
              <option value="mdy">월/일/연 (MM/DD/YYYY)</option>
              <option value="excel">Excel 숫자 날짜 (1900 체계)</option>
            </select>
          </label>
          {d.role === "people" ? (
            <label>
              명단의 범위
              <select
                value={d.mode}
                onChange={(e) => change("mode", e.target.value)}
              >
                <option value="history">
                  퇴사자·재입사를 포함한 재직 이력
                </option>
                <option value="current">현재 재직자 명단만 있음</option>
              </select>
            </label>
          ) : (
            <>
              <label>
                값의 단위
                <select
                  value={d.unit}
                  onChange={(e) => change("unit", e.target.value)}
                >
                  {d.role === "payroll" ? (
                    <>
                      <option value="won">원 (KRW)</option>
                      <option value="thousand">천원 (KRW)</option>
                      <option value="tenThousand">만원 (KRW)</option>
                    </>
                  ) : (
                    <>
                      <option value="hours">시간</option>
                      <option value="days">일 (휴가만)</option>
                    </>
                  )}
                </select>
              </label>
              <label>
                한 행을 구분하는 방식
                <select
                  value={d.grain}
                  onChange={(e) => change("grain", e.target.value)}
                >
                  <option value="id">고유 기록 ID로 구분</option>
                  <option value="composite">사번 + 날짜 + 항목이 고유함</option>
                </select>
              </label>
            </>
          )}
        </div>
        <div className="mapping-grid">
          {roleFields(d.role).map((f) => (
            <label className="mapping" key={f}>
              <span>
                {fields[f]}{" "}
                {requiredFields(d).includes(f) ? (
                  <em>필수</em>
                ) : (
                  <small>선택</small>
                )}
              </span>
              <select
                aria-label={fields[f] + " 연결"}
                value={d.mapping[f] || ""}
                onChange={(e) =>
                  update(
                    (x) => {
                      x.mapping[f] = e.target.value;
                      x.confirmed = false;
                    },
                    d.name + " 항목 연결 변경: " + fields[f],
                  )
                }
              >
                <option value="">연결하지 않음</option>
                {d.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {d.role === "people" && (
          <div className="soft-box">
            {d.mode === "history" ? (
              <>
                <h3>이력이 완전한 기간</h3>
                <p>
                  이 기간의 재직자와 퇴사자 기록이 모두 포함되어 있어야 해요.
                  현재 명단만으로 과거를 계산할 수 없어요.
                </p>
                <div className="form-grid">
                  <label>
                    이력 확인 시작일
                    <input
                      type="date"
                      value={d.coverageStart}
                      onChange={(e) => change("coverageStart", e.target.value)}
                    />
                  </label>
                  <label>
                    이력 확인 종료일
                    <input
                      type="date"
                      value={d.coverageEnd}
                      onChange={(e) => change("coverageEnd", e.target.value)}
                    />
                  </label>
                </div>
              </>
            ) : (
              <label>
                명단 기준일
                <input
                  type="date"
                  value={d.asOf}
                  onChange={(e) => change("asOf", e.target.value)}
                />
                <small>
                  이 날짜가 보고월 말일이면 해당 시점 인원만 계산해요. 과거
                  인원과 입퇴사는 생성하지 않아요.
                </small>
              </label>
            )}
          </div>
        )}
        {d.role === "attendance" && (
          <div className="soft-box">
            <h3>근태 항목 의미 연결</h3>
            <p>
              서로 다른 회사의 항목을 임의로 해석하지 않아요. 근무시간과
              연장근무는 별도 합계로 표시해요.
            </p>
            <div className="form-grid">
              {categories.map((cat) => (
                <label key={cat}>
                  {cat}
                  <select
                    value={d.categoryMap[cat] || ""}
                    onChange={(e) =>
                      update(
                        (x) => {
                          if (e.target.value)
                            x.categoryMap[cat] = e.target.value as "work";
                          else delete x.categoryMap[cat];
                          x.confirmed = false;
                        },
                        d.name + " 근태 의미 연결 변경: " + cat,
                      )
                    }
                  >
                    <option value="">의미 선택</option>
                    <option value="work">근무시간</option>
                    <option value="overtime">연장근무시간</option>
                    <option value="leave">휴가 사용</option>
                    <option value="ignore">이번 집계에서 제외 (기록됨)</option>
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="confirmation">
          <label className="check">
            <input
              type="checkbox"
              checked={d.confirmed}
              disabled={d.excluded}
              onChange={(e) =>
                update((x) => {
                  x.confirmed = e.target.checked;
                }, d.name + " 항목·행 의미·단위 확인")
              }
            />
            연결된 항목, 한 행의 의미, 단위와 자료 범위를 확인했어요.
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={d.excluded}
              onChange={(e) =>
                update(
                  (x) => {
                    x.excluded = e.target.checked;
                  },
                  d.name +
                    (e.target.checked ? " 분석 보류" : " 분석 보류 해제"),
                )
              }
            />
            이 표를 이번 분석에서 보류하기
          </label>
        </div>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>데이터 미리보기</h2>
          <span className="tag">{d.rows.length.toLocaleString()}행</span>
          <small>값을 눌러 작업용 복사본을 수정할 수 있어요.</small>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>데이터 행</th>
                {d.headers.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.rows.slice(page * 10, page * 10 + 10).map((row, i) => (
                <tr key={page * 10 + i}>
                  <td>{page * 10 + i + 2}</td>
                  {d.headers.map((h) => (
                    <td key={h}>
                      <button
                        className="cell-button"
                        aria-label={page * 10 + i + 2 + "행 " + h + " 수정"}
                        onClick={() =>
                          setEdit({
                            index: page * 10 + i,
                            header: h,
                            value: row[h] || "",
                          })
                        }
                      >
                        {row[h] || <span className="muted">비어 있음</span>}
                        <Pencil size={11} />
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <Button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            이전
          </Button>
          <span>
            {page + 1} / {Math.max(1, Math.ceil(d.rows.length / 10))}
          </span>
          <Button
            disabled={(page + 1) * 10 >= d.rows.length}
            onClick={() => setPage((p) => p + 1)}
          >
            다음
          </Button>
        </div>
        <small>
          행 번호는 선택한 헤더 다음 데이터행을 2행으로 표시해요. 원본 헤더
          위치와 다를 수 있어요.
        </small>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>확인할 문제</h2>
          <span className={"tag " + (errors.length ? "warning" : "")}>
            {errors.length}건
          </span>
        </div>
        {!issues.length ? (
          <Notice tone="success">
            현재 연결 기준에서 검증을 통과했어요. 아래에서 보고 기간과 집계
            기준을 확인해 주세요.
          </Notice>
        ) : (
          <>
            <Notice tone="warning">
              문제 행을 자동으로 삭제하지 않아요. 항목 연결을 수정하거나, 작업용
              값을 고치거나, 원본을 수정해 다시 올리거나, 해당 표를 보류할 수
              있어요.
            </Notice>
            <div className="issue-list">
              {issues.slice(issuePage * 15, issuePage * 15 + 15).map((i, n) => {
                const source = w.datasets.find((s) => s.id === i.datasetId);
                return (
                  <div key={n} className="issue">
                    <AlertTriangle size={17} />
                    <div>
                      <strong>
                        {source?.name || "전체"} {i.row ? i.row + "행" : ""}{" "}
                        {i.field ? fields[i.field as Field] : ""}
                      </strong>
                      <p>{i.message}</p>
                      <small>{i.impact}</small>
                    </div>
                    {source && (
                      <Button
                        onClick={() => {
                          setSelected(source.id);
                          setPage(i.row ? Math.floor((i.row - 2) / 10) : 0);
                        }}
                      >
                        해당 자료 보기
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="pagination">
              <Button
                disabled={!issuePage}
                onClick={() => setIssuePage((p) => p - 1)}
              >
                이전 문제
              </Button>
              <span>
                {issuePage + 1} / {Math.ceil(issues.length / 15)}
              </span>
              <Button
                disabled={(issuePage + 1) * 15 >= issues.length}
                onClick={() => setIssuePage((p) => p + 1)}
              >
                다음 문제
              </Button>
            </div>
          </>
        )}
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>보고 기간·집계 기준</h2>
        </div>
        <div className="form-grid">
          <label>
            시작 월
            <input
              type="month"
              value={w.filters.from}
              onChange={(e) =>
                setW((v) => {
                  v.filters.from = e.target.value;
                  v.basisConfirmed = false;
                })
              }
            />
          </label>
          <label>
            종료 월
            <input
              type="month"
              value={w.filters.to}
              onChange={(e) =>
                setW((v) => {
                  v.filters.to = e.target.value;
                  v.basisConfirmed = false;
                })
              }
            />
          </label>
          <label>
            퇴사일의 의미
            <select
              value={w.exitInclusive ? "include" : "exclude"}
              onChange={(e) =>
                setW((v) => {
                  v.exitInclusive = e.target.value === "include";
                  v.basisConfirmed = false;
                  audit(v, "퇴사일 재직 포함 기준 변경");
                })
              }
            >
              <option value="include">마지막 재직일 (그날까지 포함)</option>
              <option value="exclude">첫 비재직일 (그날부터 제외)</option>
            </select>
          </label>
          <label>
            포함 부서
            <select
              value={w.filters.department}
              onChange={(e) =>
                setW((v) => {
                  v.filters.department = e.target.value;
                })
              }
            >
              <option value="">전체 부서</option>
              {result.departments.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <label>
            포함 고용형태
            <select
              value={w.filters.employmentType}
              onChange={(e) =>
                setW((v) => {
                  v.filters.employmentType = e.target.value;
                })
              }
            >
              <option value="">전체 고용형태</option>
              {result.employmentTypes.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="basis-list">
          <p>
            인원은 월말 기준 유일 사번 수예요. 입사·퇴사는 해당월 이벤트가 있는
            유일 사번을 세어요.
          </p>
          <p>
            전월 변화는 두 월말 인원의 차이예요. 입사−퇴사와 별도로 계산해요.
          </p>
          <p>
            부서·고용형태는 최신 제공 분류예요. 과거 부서 이력으로 해석하지
            않아요.
          </p>
          <p>
            휴가의 일·시간을 환산하지 않아요. 인건비는 제공 지급 항목의 합계이며
            급여를 새로 산정하지 않아요.
          </p>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={w.basisConfirmed}
            onChange={(e) =>
              setW((v) => {
                v.basisConfirmed = e.target.checked;
                audit(v, "보고 기간·포함 대상·집계 기준 확인");
              })
            }
          />
          위 기간·포함 대상·집계 기준으로 보고서를 만드는 데 동의해요.
        </label>
        {!months(w.filters.from, w.filters.to).length && (
          <Notice tone="error">
            보고 기간은 올바른 월 순서로 최대 36개월까지 선택하세요.
          </Notice>
        )}
      </section>
      <details className="panel">
        <summary>작업 변경 기록 ({w.audit.length})</summary>
        {w.audit.map((a, i) => (
          <p key={i} className="small">
            {a.at} · {a.action}
          </p>
        ))}
      </details>
      <div className="bottom-actions">
        <Button onClick={onBack}>
          <ArrowLeft size={17} />
          파일 다시 선택
        </Button>
        <Button
          variant="primary"
          onClick={onNext}
          disabled={errors.length > 0 || !available || !w.basisConfirmed}
        >
          추천 결과 만들기 <ArrowRight size={17} />
        </Button>
      </div>
      {edit && (
        <Modal title="작업용 복사본 수정" onClose={() => setEdit(null)}>
          <p>
            {d.name} / {edit.index + 2}행 / {edit.header}
          </p>
          <label>
            수정할 값
            <input
              autoFocus
              value={edit.value}
              onChange={(e) => setEdit({ ...edit, value: e.target.value })}
            />
          </label>
          <Notice>
            원본 파일은 변경하지 않아요. 변경 위치와 집계 영향을 기록하고 다시
            검증해요.
          </Notice>
          <Button
            variant="primary"
            onClick={() => {
              update(
                (x) => {
                  x.rows[edit.index][edit.header] = edit.value;
                },
                d.name +
                  " " +
                  (edit.index + 2) +
                  "행 " +
                  edit.header +
                  " 작업용 값 수정; " +
                  roleNames[d.role] +
                  " 재집계 대상",
              );
              setEdit(null);
            }}
          >
            수정하고 재검증
          </Button>
        </Modal>
      )}
    </>
  );
}
