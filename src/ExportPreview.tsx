import type { Workspace, Result } from "../shared/model";
import { effectiveCards, formatValue } from "../shared/analytics";
import { DataChart } from "./Charts";
import { datasetRange } from "../shared/metric-evidence";
export function ExportPreview({
  w,
  r,
  format,
  setW,
  readOnly,
}: {
  w: Workspace;
  r: Result;
  format: string;
  setW: (fn: (w: Workspace) => void) => void;
  readOnly: boolean;
}) {
  const cards = effectiveCards(w, r).filter((c) => c.visible);
  return (
    <section className="output-preview" aria-label="보고 자료 미리보기">
      <div className="preview-cover">
        <span className="eyebrow">HRBIP · REPORT PREVIEW</span>
        <h3>보고 자료 미리보기</h3>
        <label>
          출력할 보고서 제목
          <input
            value={w.title}
            maxLength={160}
            readOnly={readOnly}
            onChange={(e) =>
              setW((v) => {
                v.title = e.target.value;
                v.report.reviewedKey = "";
              })
            }
          />
        </label>
        <p>
          {w.filters.from} ~ {w.filters.to} ·{" "}
          {w.filters.department || "전체 부서"} ·{" "}
          {w.filters.employmentType || "전체 고용형태"}
        </p>
      </div>
      <h3>1. 자료 범위와 주요 수치</h3>
      {w.companyFormats?.[format as "pptx" | "xlsx"] && (
        <p className="soft-box">
          회사 양식에는 연결한 항목만 들어가요. 아래는 전체 분석 내용이며 회사
          양식의 실제 페이지 배치가 아니에요. 양식 등록·적용 화면에서 연결을
          확인하세요.
        </p>
      )}
      <p className="muted">
        보고 기간과 실제 자료 범위가 다를 수 있어요. 자료가 없는 시점은 0으로
        채우지 않아요.
      </p>
      {!readOnly && (
        <details>
          <summary>입력 자료별 확인 범위</summary>
          {w.datasets
            .filter((d) => !d.excluded)
            .map((d) => (
              <p key={d.id}>
                <strong>{d.name}</strong>
                <br />
                {datasetRange(d)}
              </p>
            ))}
        </details>
      )}
      {r.notices.map((s, i) => (
        <p className="small" key={i}>
          {s}
        </p>
      ))}
      <div className="export-review">
        {r.metrics.map((m) => (
          <div key={m.id}>
            <span>{m.label}</span>
            <strong>{formatValue(m.value, m.unit)}</strong>
            <small>{m.value === null ? "자료 없음 / 계산 불가" : m.note}</small>
          </div>
        ))}
      </div>
      <h3>2. 보고 문장과 담당자 의견</h3>
      <label>
        출력할 현황 요약
        <textarea
          rows={8}
          value={w.report.generated}
          readOnly={readOnly}
          onChange={(e) =>
            setW((v) => {
              v.report.generated = e.target.value;
              v.report.reviewedKey = "";
            })
          }
        />
      </label>
      <label>
        출력할 담당자 의견
        <textarea
          rows={4}
          value={w.report.notes}
          readOnly={readOnly}
          placeholder="필요한 설명과 확인한 배경을 적어주세요."
          onChange={(e) =>
            setW((v) => {
              v.report.notes = e.target.value;
              v.report.reviewedKey = "";
            })
          }
        />
      </label>
      <h3>3. {format === "xlsx" ? "Excel에 포함할 집계표" : "출력할 차트"}</h3>
      <p className="muted">
        {format === "xlsx"
          ? "Excel에는 표시 여부와 관계없이 전체 집계표가 들어가요. 차트 화면은 포함하지 않아요."
          : `표시한 차트 ${cards.length}개를 확인하세요. 아래는 내용 검토용이며 파일의 페이지·슬라이드 배치는 형식에 맞춰 달라져요.`}
      </p>
      {format === "xlsx"
        ? r.charts.map((c) => (
            <details key={c.id}>
              <summary>
                {c.title} · {c.unit} · {c.points.length}개 항목
              </summary>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>항목</th>
                      {c.series.map((s) => (
                        <th key={s}>{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {c.points.map((p, i) => (
                      <tr key={i}>
                        <td>{p.label}</td>
                        <td>{formatValue(p.value, c.unit)}</td>
                        {c.series.length > 1 && (
                          <td>{formatValue(p.value2 ?? null, c.unit)}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))
        : cards.map((card) => {
            const chart = r.charts.find((c) => c.id === card.id)!;
            return (
              <details className="preview-chart" key={card.id}>
                <summary>
                  {card.title} · {chart.unit}
                </summary>
                <DataChart chart={chart} card={card} theme={w.design.theme} />
              </details>
            );
          })}
    </section>
  );
}
