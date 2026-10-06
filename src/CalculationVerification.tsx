import { useEffect, useState } from "react";
import { api, download } from "./api";
import type { Workspace, Result } from "../shared/model";
import type { Verification } from "../shared/verification";
import { statusNames } from "../shared/verification";
import { Modal, Button, Notice } from "./ui";
export function CalculationVerification({
  w,
  r,
  sharedId,
  onClose,
}: {
  w: Workspace;
  r: Result;
  sharedId?: string;
  onClose: () => void;
}) {
  const [value, setValue] = useState<Verification | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("all"),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setValue(null);
    setError("");
    api<Verification>(
      sharedId ? "/works/" + sharedId + "/verification" : "/verification",
      "POST",
      sharedId ? { filters: w.filters } : { workspace: w },
    )
      .then((v) => {
        if (active) setValue(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [r.key, w.report.generated, w.report.notes, sharedId, refresh]);
  return (
    <Modal title="계산 검증 결과" onClose={onClose} wide>
      <p>
        원자료를 별도 방식으로 다시 집계하고 지표·차트와 대조해요. 자료가 부족한
        항목은 통과로 표시하지 않아요.
      </p>
      {error && <Notice tone="error">{error}</Notice>}
      {!value && !error && (
        <p role="status">입력 자료와 계산값을 대조하고 있어요…</p>
      )}
      {value && (
        <>
          <Notice tone={value.blocked ? "error" : "info"}>
            {value.blocked
              ? "계산 불일치가 있어 최종 내보내기를 중단해요."
              : "계산 대조가 끝났어요. 아래 확인 필요·검증 불가 항목도 함께 확인하세요."}
          </Notice>
          <div className="verification-counts">
            {Object.entries(value.counts).map(([key, count]) => (
              <div key={key}>
                <span>{statusNames[key as keyof typeof statusNames]}</span>
                <strong>{count.toLocaleString()}건</strong>
              </div>
            ))}
          </div>
          <p className="small">
            검증 시각: {new Date(value.checkedAt).toLocaleString("ko-KR")} ·
            검증 버전: {value.key}
          </p>
          <label>
            검증 항목 보기
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">전체</option>
              {Object.entries(statusNames).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <div
            className="verification-table"
            tabIndex={0}
            role="region"
            aria-label="계산 검증 상세"
          >
            <table>
              <thead>
                <tr>
                  <th>검증 항목</th>
                  <th>상태</th>
                  <th>집계값</th>
                  <th>대조값</th>
                  <th>차이</th>
                  <th>검증 방법·안내</th>
                </tr>
              </thead>
              <tbody>
                {value.checks
                  .filter((c) => filter === "all" || c.status === filter)
                  .map((c) => (
                    <tr key={c.id}>
                      <th scope="row">{c.label}</th>
                      <td>{statusNames[c.status]}</td>
                      <td>
                        {c.actual === null
                          ? "—"
                          : c.actual.toLocaleString() + " " + c.unit}
                      </td>
                      <td>
                        {c.expected === null
                          ? "—"
                          : c.expected.toLocaleString() + " " + c.unit}
                      </td>
                      <td>
                        {c.difference === null
                          ? "—"
                          : c.difference.toLocaleString()}
                      </td>
                      <td>
                        {c.method}
                        <br />
                        {c.detail}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="small">
            {value.limitation} 데이터·필터가 바뀌면 검증 결과도 새로 계산해요.
            내보내기 직전 서버에서도 다시 검증해요.
          </p>
          <div className="actions">
            <Button onClick={() => setRefresh((v) => v + 1)}>
              다시 검증하기
            </Button>
            {!sharedId && (
              <Button
                variant="primary"
                busy={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await download(
                      "/verification/download",
                      { workspace: w },
                      w.title + "-계산검증표.xlsx",
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                계산 검증표 Excel 다운로드
              </Button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
