import { useState } from "react";
import {
  Save,
  Download,
  Share2,
  SlidersHorizontal,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  X,
  CheckCircle2,
  FileText,
  LayoutDashboard,
  ArrowLeft,
  BookmarkPlus,
} from "lucide-react";
import type { Workspace, Result, Card, Filters } from "../shared/model";
import { roleNames, audit } from "../shared/model";
import {
  draft,
  recommendedCards,
  effectiveCards,
  formatValue,
} from "../shared/analytics";
import { DataChart } from "./Charts";
import { Button, Notice, PageTitle, Steps, Modal } from "./ui";
export function Results({
  w,
  r,
  setW,
  onFilters,
  onSave,
  onTemplate,
  onShare,
  onExport,
  onBack,
  readOnly = false,
  busy = false,
}: {
  w: Workspace;
  r: Result;
  setW: (fn: (v: Workspace) => void) => void;
  onFilters: (f: Filters) => void;
  onSave: () => void;
  onTemplate: () => void;
  onShare: () => void;
  onExport: (format: string) => Promise<void>;
  onBack: () => void;
  readOnly?: boolean;
  busy?: boolean;
}) {
  const [baseFilters] = useState(w.filters);
  const [tab, setTab] = useState("dashboard"),
    [editing, setEditing] = useState(false),
    [exporting, setExporting] = useState(false),
    [format, setFormat] = useState("pdf"),
    [error, setError] = useState(""),
    [exportBusy, setExportBusy] = useState(false);
  const cards = effectiveCards(w, r),
    stale = w.report.basisKey !== r.key,
    reviewed = w.report.reviewedKey === r.key && !stale;
  const changeCard = (id: string, fn: (c: Card) => void) =>
    setW((v) => {
      v.design.cards = effectiveCards(v, r);
      fn(v.design.cards.find((c) => c.id === id)!);
    });
  const move = (id: string, dir: number) =>
    setW((v) => {
      v.design.cards = effectiveCards(v, r);
      const i = v.design.cards.findIndex((c) => c.id === id),
        j = i + dir;
      if (j >= 0 && j < v.design.cards.length)
        [v.design.cards[i], v.design.cards[j]] = [
          v.design.cards[j],
          v.design.cards[i],
        ];
    });
  const select = (chartId: string, value: string) => {
    const c = r.charts.find((c) => c.id === chartId);
    if (c?.filter === "department" && value !== "부서 미입력")
      onFilters({ ...w.filters, department: value });
    if (c?.filter === "month")
      onFilters({ ...w.filters, from: value, to: value });
  };
  const unavailableTemplate = w.design.cards.filter(
    (c) => !r.charts.some((x) => x.id === c.id),
  );
  const adaptedCards = w.design.cards.filter(c => {
    const chart = r.charts.find(x => x.id === c.id);
    return chart && !chart.allowed.includes(c.type);
  });
  return (
    <>
      <PageTitle
        eyebrow={readOnly ? "SHARED REPORT" : "YOUR PEOPLE INSIGHTS"}
        title={w.title}
        description={
          readOnly
            ? "공유받은 자료예요. 필터로 탐색할 수 있고 원본 작업은 변경되지 않아요."
            : "확인된 데이터로 만든 현황이에요. 필요한 부분만 조정하고 보고에 활용하세요."
        }
        actions={
          <>
            {!readOnly && (
              <>
                <Button busy={busy} onClick={onSave}>
                  <Save size={17} />
                  저장
                </Button>
                <Button onClick={onShare}>
                  <Share2 size={17} />
                  공유
                </Button>
              </>
            )}
            <Button variant="primary" onClick={() => setExporting(true)}>
              <Download size={17} />
              최종 확인·내보내기
            </Button>
          </>
        }
      />
      {!readOnly && <Steps current={reviewed ? 3 : 2} />}
      <section className="filter-bar" aria-label="대시보드 필터">
        <label>
          시작 월
          <input
            type="month"
            value={w.filters.from}
            onChange={(e) => onFilters({ ...w.filters, from: e.target.value })}
          />
        </label>
        <label>
          종료 월
          <input
            type="month"
            value={w.filters.to}
            onChange={(e) => onFilters({ ...w.filters, to: e.target.value })}
          />
        </label>
        <label>
          부서
          <select
            aria-label="부서"
            value={w.filters.department}
            onChange={(e) =>
              onFilters({ ...w.filters, department: e.target.value })
            }
          >
            <option value="">전체 부서</option>
            {r.departments.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          고용형태
          <select
            aria-label="고용형태"
            value={w.filters.employmentType}
            onChange={(e) =>
              onFilters({ ...w.filters, employmentType: e.target.value })
            }
          >
            <option value="">전체 고용형태</option>
            {r.employmentTypes.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <Button
          onClick={() =>
            onFilters({ ...baseFilters, department: "", employmentType: "" })
          }
        >
          <RotateCcw size={16} />
          전체 필터 초기화
        </Button>
      </section>
      <div className="basis-chips">
        <span>{w.sample ? "가상 샘플 데이터" : "선택한 인사 자료"}</span>
        <span>
          {w.filters.from} ~ {w.filters.to}
        </span>
        <span>
          {w.filters.department || "전체 부서"} ·{" "}
          {w.filters.employmentType || "전체 고용형태"}
        </span>
        <span>퇴사일 {w.exitInclusive ? "포함" : "제외"}</span>
      </div>
      {stale && (
        <Notice tone="warning">
          데이터 또는 필터가 바뀌었어요. 기존 보고 문장은 보호되어 있으며 최신
          수치와 다를 수 있어요. 보고서 탭에서 비교·갱신한 뒤 최종 확인해
          주세요.
        </Notice>
      )}
      {adaptedCards.length > 0 && <Notice>현재 데이터에는 {adaptedCards.map(c=>c.title).join(", ")}의 저장된 차트 종류가 맞지 않아 추천 차트로 표시해요. 편집 패널에서 사용 가능한 대안을 선택하세요. 지표와 계산값은 유지돼요.</Notice>}
      {readOnly && !reviewed && <Notice tone="warning">소유자가 최신 보고서를 최종 확인하기 전이에요. 조회는 가능하며, 다운로드는 소유자의 확인 후 사용할 수 있어요.</Notice>}
      {unavailableTemplate.length > 0 && (
        <Notice>
          템플릿의 {unavailableTemplate.map((c) => c.title).join(", ")} 카드는
          새 자료로 만들 수 없어 표시하지 않았어요. 이전 직원 정보와 수치는
          가져오지 않았어요.
        </Notice>
      )}
      <div className="result-toolbar">
        <div className="tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "dashboard"}
            onClick={() => setTab("dashboard")}
          >
            <LayoutDashboard size={18} />
            대시보드
          </button>
          <button
            role="tab"
            aria-selected={tab === "report"}
            onClick={() => setTab("report")}
          >
            <FileText size={18} />
            보고서
          </button>
        </div>
        {!readOnly && (
          <div className="actions">
            <Button onClick={onTemplate}>
              <BookmarkPlus size={16} />
              템플릿 저장
            </Button>
            <Button
              onClick={() => setEditing(!editing)}
              aria-expanded={editing}
            >
              <SlidersHorizontal size={16} />
              구성 편집
            </Button>
          </div>
        )}
      </div>
      <div className={"result-layout " + (editing ? "with-editor" : "")}>
        <div className="result-main">
          {tab === "dashboard" ? (
            <>
              <div className="metric-grid">
                {r.metrics.map((m, i) => (
                  <article
                    className={"metric " + (i === 0 ? "primary-metric" : "")}
                    key={m.id}
                  >
                    <span>{m.label}</span>
                    <strong>
                      {m.value === null
                        ? "—"
                        : m.value.toLocaleString("ko-KR", {
                            maximumFractionDigits: 2,
                          })}
                      <small>{m.value !== null ? m.unit : ""}</small>
                    </strong>
                    <p>{m.value === null ? "자료 없음 / 계산 불가" : m.note}</p>
                  </article>
                ))}
              </div>
              {r.empty && (
                <Notice>
                  선택한 필터에서 표시할 차트가 없어요. 필터를 초기화하거나 자료
                  범위를 확인해 주세요.
                </Notice>
              )}
              <div className={"dashboard-grid " + w.design.layout}>
                {cards
                  .filter((c) => c.visible)
                  .map((card) => {
                    const chart = r.charts.find((c) => c.id === card.id)!;
                    return (
                      <article
                        className={"chart-card " + card.size}
                        key={card.id}
                      >
                        <div className="chart-heading">
                          <h3>{card.title}</h3>
                          <span>{chart.unit}</span>
                        </div>
                        <DataChart
                          chart={chart}
                          card={card}
                          theme={w.design.theme}
                          onSelect={
                            chart.filter
                              ? (value) => select(chart.id, value)
                              : undefined
                          }
                        />
                        {chart.filter && (
                          <small className="chart-hint">
                            차트 항목 또는 상세 수치의 항목을 선택하면 관련
                            현황이 함께 바뀌어요.
                          </small>
                        )}
                      </article>
                    );
                  })}
              </div>
              <section className="recommendation">
                <span className="round-icon">
                  <CheckCircle2 size={21} />
                </span>
                <div>
                  <h3>이렇게 구성한 이유</h3>
                  {cards
                    .filter((c) => c.visible)
                    .map((card) => (
                      <p key={card.id}>
                        <strong>{card.title}</strong> ·{" "}
                        {r.charts.find((c) => c.id === card.id)!.reason}
                      </p>
                    ))}
                </div>
              </section>
            </>
          ) : (
            <section className="panel report-editor">
              <div className="section-heading">
                <h2>보고서 초안</h2>
                <span className="tag">규칙 기반 생성</span>
              </div>
              <p className="muted">
                확인된 수치와 담당자 의견을 구분해요. 외부 AI에 데이터를 보내지
                않아요.
              </p>
              {stale && !readOnly && (
                <div className="soft-box">
                  <h3>현재 조건으로 다시 계산한 초안</h3>
                  <pre>{draft(r)}</pre>
                  <div className="actions">
                    <Button
                      variant="primary"
                      onClick={() => {
                        if (
                          confirm(
                            "아래 생성·편집 문장을 새 초안으로 바꿀까요? 담당자 의견은 그대로 유지됩니다.",
                          )
                        )
                          setW((v) => {
                            v.report.generated = draft(r);
                            v.report.basisKey = r.key;
                            v.report.reviewedKey = "";
                            audit(
                              v,
                              "사용자 확인 후 생성 문장 갱신 (담당자 의견 유지)",
                            );
                          });
                      }}
                    >
                      새 초안으로 갱신
                    </Button>
                    <Button
                      onClick={() =>
                        setW((v) => {
                          v.report.basisKey = r.key;
                          v.report.reviewedKey = "";
                          audit(
                            v,
                            "담당자가 기존 보고 문장을 최신 집계와 직접 비교 확인",
                          );
                        })
                      }
                    >
                      직접 수정했고 현재 기준과 맞아요
                    </Button>
                  </div>
                </div>
              )}
              <label>
                현황 요약 · 변화 · 추가 확인
                <textarea
                  value={w.report.generated}
                  readOnly={readOnly}
                  rows={18}
                  onChange={(e) =>
                    setW((v) => {
                      v.report.generated = e.target.value;
                      v.report.reviewedKey = "";
                    })
                  }
                />
              </label>
              <label>
                담당자 설명·의견
                <textarea
                  value={w.report.notes}
                  readOnly={readOnly}
                  rows={5}
                  placeholder="수치의 배경, 확인한 내용, 후속 조치를 기록하세요."
                  onChange={(e) =>
                    setW((v) => {
                      v.report.notes = e.target.value;
                      v.report.reviewedKey = "";
                    })
                  }
                />
              </label>
              <small>
                자동 갱신으로 작성한 문장을 덮어쓰지 않아요. 직접 작성한 해석과
                수치는 최종 확인 단계에서 검토해 주세요.
              </small>
            </section>
          )}
          <section className="panel compact">
            <h3>이번 보고서의 분석 범위</h3>
            <div className="coverage-grid">
              {Object.entries(r.available).map(([k, v]) => (
                <div key={k}>
                  <strong>{roleNames[k as keyof typeof roleNames]}</strong>
                  <p>
                    {v
                      ? "제공 자료로 집계함"
                      : r.reasons[k as keyof typeof roleNames]}
                  </p>
                </div>
              ))}
            </div>
            <details>
              <summary>집계 기준과 유의사항</summary>
              {[...r.basis, ...r.notices].map((s, i) => (
                <p className="small" key={i}>
                  {s}
                </p>
              ))}
            </details>
          </section>
        </div>
        {editing && !readOnly && (
          <aside className="editor-panel">
            <div className="row between">
              <h2>구성 편집</h2>
              <Button
                variant="ghost"
                aria-label="편집 패널 닫기"
                onClick={() => setEditing(false)}
              >
                <X size={19} />
              </Button>
            </div>
            <label>
              보고서 제목
              <input
                value={w.title}
                maxLength={160}
                onChange={(e) =>
                  setW((v) => {
                    v.title = e.target.value;
                  })
                }
              />
            </label>
            <label>
              색상 테마
              <select
                value={w.design.theme}
                onChange={(e) =>
                  setW((v) => {
                    v.design.theme = e.target.value as typeof v.design.theme;
                  })
                }
              >
                <option value="green">그린 · 기본</option>
                <option value="forest">포레스트</option>
                <option value="lime">라임</option>
              </select>
            </label>
            <label>
              기본 틀
              <select
                value={w.design.layout}
                onChange={(e) =>
                  setW((v) => {
                    v.design.layout = e.target.value as typeof v.design.layout;
                  })
                }
              >
                <option value="balanced">균형 있게 (2열)</option>
                <option value="focus">하나씩 집중 (1열)</option>
                <option value="compact">간결하게 (3열)</option>
              </select>
            </label>
            {cards.map((card, i) => {
              const chart = r.charts.find((c) => c.id === card.id)!;
              const names: Record<string, string> = {
                line: "선그래프",
                bar: "막대그래프",
                horizontal: "가로 막대",
                pie: "원형 차트",
                table: "표",
              };
              return (
                <div className="card-settings" key={card.id}>
                  <div className="row between">
                    <label className="check">
                      <input
                        type="checkbox"
                        checked={card.visible}
                        onChange={(e) =>
                          changeCard(
                            card.id,
                            (c) => (c.visible = e.target.checked),
                          )
                        }
                      />
                      표시
                    </label>
                    <div className="actions">
                      <Button
                        aria-label={card.title + " 위로"}
                        disabled={!i}
                        onClick={() => move(card.id, -1)}
                      >
                        <ArrowUp size={16} />
                      </Button>
                      <Button
                        aria-label={card.title + " 아래로"}
                        disabled={i === cards.length - 1}
                        onClick={() => move(card.id, 1)}
                      >
                        <ArrowDown size={16} />
                      </Button>
                    </div>
                  </div>
                  <label>
                    카드 제목
                    <input
                      value={card.title}
                      onChange={(e) =>
                        changeCard(card.id, (c) => (c.title = e.target.value))
                      }
                      maxLength={160}
                    />
                  </label>
                  <label>
                    그래프
                    <select
                      value={card.type}
                      onChange={(e) =>
                        changeCard(
                          card.id,
                          (c) => (c.type = e.target.value as Card["type"]),
                        )
                      }
                    >
                      {chart.allowed.map((t) => (
                        <option key={t} value={t}>
                          {names[t]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    카드 크기
                    <select
                      value={card.size}
                      onChange={(e) =>
                        changeCard(
                          card.id,
                          (c) => (c.size = e.target.value as Card["size"]),
                        )
                      }
                    >
                      <option value="normal">기본</option>
                      <option value="wide">넓게</option>
                    </select>
                  </label>
                  {!chart.allowed.includes("pie") && (
                    <small>
                      시간 흐름·입퇴사 비교는 부분의 비율이 아니므로 원형 차트를
                      제공하지 않아요. 선·막대로 비교해 주세요.
                    </small>
                  )}
                </div>
              );
            })}
            <Button
              onClick={() => {
                if (
                  confirm(
                    "카드 구성·제목·색상을 추천값으로 되돌릴까요? 보고서 문장은 유지됩니다.",
                  )
                )
                  setW((v) => {
                    v.design = {
                      theme: "green",
                      layout: "balanced",
                      cards: recommendedCards(r),
                    };
                  });
              }}
            >
              <RotateCcw size={16} />
              추천 구성으로 되돌리기
            </Button>
          </aside>
        )}
      </div>
      {!readOnly && (
        <div className="bottom-actions">
          <Button onClick={onBack}>
            <ArrowLeft size={17} />
            데이터 확인으로
          </Button>
          <span className="muted">
            {reviewed
              ? "최종 확인 완료"
              : "내보내기 전 수치와 문장을 함께 확인해 주세요."}
          </span>
        </div>
      )}
      {exporting && (
        <Modal
          title="최종 확인·내보내기"
          onClose={() => !exportBusy && setExporting(false)}
          wide
        >
          <p>대시보드와 보고서는 아래 집계 기준을 함께 사용해요.</p>
          <div className="soft-box">
            {r.basis.map((b) => (
              <p key={b}>{b}</p>
            ))}
          </div>
          {stale && (
            <Notice tone="warning">
              보고 문장이 이전 기준으로 작성되어 있어요. 보고서 탭에서
              갱신하거나 직접 비교 확인한 뒤 출력하세요.
            </Notice>
          )}
          <div className="export-review">
            {r.metrics
              .filter((m) => m.value !== null)
              .map((m) => (
                <div key={m.id}>
                  <span>{m.label}</span>
                  <strong>{formatValue(m.value, m.unit)}</strong>
                </div>
              ))}
          </div>
          <details>
            <summary>출력할 보고 문장 확인</summary>
            <pre>{w.report.generated}</pre>
            <pre>{w.report.notes}</pre>
          </details>
          {!readOnly && (
            <label className="check">
              <input
                type="checkbox"
                checked={reviewed}
                disabled={stale}
                onChange={(e) =>
                  setW((v) => {
                    v.report.reviewedKey = e.target.checked ? r.key : "";
                  })
                }
              />
              현재 수치·기간·필터와 보고서 문장, 직접 작성한 의견을 확인했어요.
            </label>
          )}
          <label>
            파일 형식
            <select value={format} onChange={(e) => setFormat(e.target.value)}>
              <option value="pdf">PDF · 문서와 차트</option>
              <option value="pptx">
                PowerPoint · 편집 가능한 텍스트·표·차트
              </option>
              <option value="xlsx">Excel · 집계표와 기준</option>
            </select>
          </label>
          {format === "pptx" && (
            <Notice>
              PPTX에는 네이티브 차트와 데이터가 들어가요. 웹 필터는 포함되지
              않아요. 빈 구간이 있는 선그래프는 자료 없는 구간을 제외한 막대로
              출력하고 안내를 함께 넣어요.
            </Notice>
          )}
          <small>
            내보내기에는 직원별 원본을 포함하지 않아요. 표시를 끈 차트는
            PDF/PPTX에서 제외돼요. Excel에는 전체 집계표가 포함돼요.
          </small>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="bottom-actions">
            <Button
              onClick={() => {
                setExporting(false);
                setTab("report");
              }}
            >
              보고서 검토
            </Button>
            <Button
              busy={exportBusy}
              disabled={!reviewed}
              variant="primary"
              onClick={async () => {
                setExportBusy(true);
                setError("");
                try {
                  await onExport(format);
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setExportBusy(false);
                }
              }}
            >
              <Download size={17} />
              {format.toUpperCase()} 다운로드
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
