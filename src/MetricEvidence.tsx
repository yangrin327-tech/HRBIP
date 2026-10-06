import type { Result, Workspace } from "../shared/model";
import { metricEvidence } from "../shared/metric-evidence";
import { formatValue } from "../shared/analytics";
import { Modal, Notice } from "./ui";
export function MetricEvidence({
  w,
  r,
  id,
  readOnly,
  onClose,
}: {
  w: Workspace;
  r: Result;
  id: string;
  readOnly: boolean;
  onClose: () => void;
}) {
  const e = metricEvidence(w, r, id);
  return (
    <Modal title="지표 계산 근거" onClose={onClose} wide>
      <h3>
        {e.metric.label} · {formatValue(e.metric.value, e.metric.unit)}
      </h3>
      <dl className="evidence-list">
        <dt>계산 방식</dt>
        <dd>{e.formula}</dd>
        <dt>계산 시점·기간</dt>
        <dd>{e.period}</dd>
        <dt>포함 대상</dt>
        <dd>
          {w.filters.department || "전체 부서"} ·{" "}
          {w.filters.employmentType || "전체 고용형태"}
        </dd>
        <dt>결과의 범위·한계</dt>
        <dd>{e.limitation}</dd>
      </dl>
      <h3>사용한 자료와 연결 항목</h3>
      {readOnly ? (
        <Notice>
          공유 화면에서는 원본 파일·열 정보를 제공하지 않아요. 아래 집계 기준과
          소유자가 제공한 자료 범위를 확인하세요.
        </Notice>
      ) : e.sources.length ? (
        e.sources.map((s, i) => (
          <article className="evidence-source" key={i}>
            <strong>{s.name}</strong>
            <p>{s.columns}</p>
            <p>
              {s.range} · 단위: {s.unit}
            </p>
          </article>
        ))
      ) : (
        <Notice>
          이 지표에 사용할 수 있는 자료가 없어요. 데이터 확인에서 해당 영역과
          연결 항목을 확인하세요.
        </Notice>
      )}
      <h3>공통 집계 기준</h3>
      {r.basis.map((s) => (
        <p key={s}>{s}</p>
      ))}
      <p>
        중복·연결 오류는 검증에서 처리해야 해요. 문제 행을 조용히 빼서 합산하지
        않아요. 부서·고용형태는 최신 제공 분류이며 과거 소속 이력을 추정하지
        않아요. 근태·금액에 분류 열이 없으면 사번으로 인사 자료의 최신 분류를
        연결해요.
      </p>
      {r.notices.length > 0 && (
        <details>
          <summary>이번 집계의 추가 유의사항</summary>
          {r.notices.map((s, i) => (
            <p key={i}>{s}</p>
          ))}
        </details>
      )}
    </Modal>
  );
}
