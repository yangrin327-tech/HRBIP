import { useState } from "react";
import { audit, roleNames, type Workspace } from "../shared/model";
import {
  applyReuseRule,
  missingColumns,
  suggestedRule,
  type ReusePlan,
} from "../shared/reuse";
import { Button, Notice, PageTitle } from "./ui";
const units = {
  hours: "시간",
  days: "일",
  won: "원",
  thousand: "천 원",
  tenThousand: "만 원",
};
export function RepeatReview({
  w,
  plan,
  setW,
  onNext,
  onBack,
}: {
  w: Workspace;
  plan: ReusePlan;
  setW: (fn: (w: Workspace) => void) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [picks, setPicks] = useState(
    w.datasets.map((d) => suggestedRule(d, plan.rules)),
  );
  return (
    <>
      <PageTitle
        eyebrow="REPEAT YOUR REPORT"
        title="새 자료에 지난 설정을 연결해요."
        description="숫자와 보고 문장은 새로 만들어요. 연결이 모호한 표는 직접 선택하고, 단위와 이력 범위는 다음 단계에서 다시 확인하세요."
      />
      <Notice>
        기준 작업: {plan.sourceTitle} · 이전 직원 정보·숫자·의견은 가져오지
        않았어요. 열 이름이 같아도 단위나 의미가 같다는 뜻은 아니에요.
      </Notice>
      <section className="panel">
        <h2>이번 보고 기간</h2>
        <p className="muted">
          지난 보고 종료월의 다음 달을 제안했어요. 새 파일의 자료 범위에 맞게
          바꿔주세요.
        </p>
        <div className="form-grid">
          <label>
            이번 보고 시작월
            <input
              type="month"
              value={w.filters.from}
              onChange={(e) =>
                setW((v) => {
                  v.filters.from = e.target.value;
                })
              }
            />
          </label>
          <label>
            이번 보고 종료월
            <input
              type="month"
              value={w.filters.to}
              onChange={(e) =>
                setW((v) => {
                  v.filters.to = e.target.value;
                })
              }
            />
          </label>
        </div>
        <p>
          퇴사일 기준:{" "}
          {w.exitInclusive
            ? "마지막 재직일 · 재직 포함"
            : "첫 미재직일 · 재직 제외"}{" "}
          (다음 단계에서 변경 가능)
        </p>
      </section>
      {w.datasets.map((d, i) => {
        const rule = plan.rules[picks[i]],
          missing = rule ? missingColumns(d, rule) : [];
        return (
          <section className="panel" key={d.id}>
            <h3>{d.name}</h3>
            <p>이번 파일 {d.rows.length.toLocaleString()}행</p>
            <label>
              재사용할 설정 · {d.name}
              <select
                value={picks[i]}
                onChange={(e) =>
                  setPicks((p) =>
                    p.map((n, j) => (i === j ? Number(e.target.value) : n)),
                  )
                }
              >
                <option value={-1}>직접 연결하기 · 이전 설정 사용 안 함</option>
                {plan.rules.map((r, j) => (
                  <option value={j} key={j}>
                    {r.name} · {roleNames[r.role]}
                  </option>
                ))}
              </select>
            </label>
            {rule ? (
              <>
                <p>
                  불러올 기준: {roleNames[rule.role]} · 날짜{" "}
                  {
                    {
                      ymd: "연-월-일",
                      dmy: "일/월/연",
                      mdy: "월/일/연",
                      excel: "Excel 숫자 날짜",
                    }[rule.dateFormat]
                  }{" "}
                  ·{" "}
                  {rule.role === "people"
                    ? rule.mode === "history"
                      ? "재직 이력"
                      : "현재 명단"
                    : units[rule.unit]}{" "}
                  ·{" "}
                  {rule.role === "people"
                    ? "사번 기준 · 재직 구간 중복 확인"
                    : rule.grain === "id"
                      ? "기록 ID 기준"
                      : "사번·날짜·항목 기준"}
                </p>
                <p className="small">
                  항목 연결:{" "}
                  {Object.values(rule.mapping).filter(Boolean).join(" / ")}
                </p>
                {missing.length > 0 && (
                  <Notice tone="warning">
                    새 파일에 없는 열: {missing.join(", ")}. 이 연결은 적용하지
                    않아요. 다음 단계에서 새 열을 연결해야 해요.
                  </Notice>
                )}
              </>
            ) : (
              <Notice>
                연결을 확정하지 않았어요. 새 파일의 추천 연결을 다음 단계에서
                확인하세요.
              </Notice>
            )}
          </section>
        );
      })}
      <div className="bottom-actions">
        <Button onClick={onBack}>자료 선택으로</Button>
        <Button
          variant="primary"
          onClick={() => {
            setW((v) => {
              v.datasets = v.datasets.map((d, i) =>
                applyReuseRule(d, plan.rules[picks[i]]),
              );
              v.basisConfirmed = false;
              v.report = {
                generated: "",
                notes: "",
                basisKey: "",
                reviewedKey: "",
              };
              audit(
                v,
                "새 자료에 이전 연결 설정 적용. 모든 표의 단위·의미·기간을 다시 확인하도록 초기화.",
              );
              v.datasets.forEach((d, i) => {
                const rule = plan.rules[picks[i]];
                audit(
                  v,
                  d.name +
                    ": " +
                    (rule
                      ? "이전 설정 " + rule.name + " 연결"
                      : "직접 연결 선택") +
                    (rule && missingColumns(d, rule).length
                      ? " / 누락 열 연결 해제: " +
                        missingColumns(d, rule).join(", ")
                      : ""),
                );
              });
            });
            onNext();
          }}
        >
          설정 적용하고 새 자료 검증
        </Button>
      </div>
    </>
  );
}
