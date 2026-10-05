import type { RawSheet } from "./files";
import { recommendMapping } from "../shared/import";
export function SheetSetup({
  s,
  onChange,
}: {
  s: RawSheet;
  onChange: (s: RawSheet) => void;
}) {
  const headers = s.matrix[s.headerRow] || [],
    suggested = recommendMapping(headers);
  return (
    <div className="sheet-choice">
      <label className="check">
        <input
          type="checkbox"
          checked={s.selected}
          onChange={(e) => onChange({ ...s, selected: e.target.checked })}
        />
        <strong>{s.name}</strong>
      </label>
      <label>
        헤더 행
        <select
          value={s.headerRow}
          onChange={(e) =>
            onChange({
              ...s,
              headerRow: Number(e.target.value),
              valueColumns: [],
            })
          }
        >
          {s.matrix.slice(0, 20).map((row, i) => (
            <option key={i} value={i}>
              {i + 1}행 · {row.slice(0, 4).join(" / ").slice(0, 80)}
            </option>
          ))}
        </select>
      </label>
      <label>
        표 구조
        <select
          value={s.shape || "records"}
          onChange={(e) =>
            onChange({
              ...s,
              shape: e.target.value as RawSheet["shape"],
              idColumn: s.idColumn || suggested.employeeId,
              dateColumn: s.dateColumn || suggested.date,
            })
          }
        >
          <option value="records">항목·값이 행으로 쌓인 자료 / 인사명단</option>
          <option value="columns">
            근무시간·휴가·금액이 서로 다른 열에 있는 자료
          </option>
        </select>
      </label>
      {s.shape === "columns" && (
        <div className="wide-setup">
          <p className="small">
            분석할 수치 열만 선택하면 작업용 표로 펼쳐요. 총액과 세부 항목,
            총근무시간과 정규·연장시간을 함께 선택하면 이중 합산돼요. 잔여 휴가
            같은 잔액이나 기준월급은 사용량·지급액이 아니므로 선택하지 마세요.
          </p>
          <div className="form-grid">
            <label>
              분석 영역
              <select
                value={s.wideRole || "attendance"}
                onChange={(e) =>
                  onChange({
                    ...s,
                    wideRole: e.target.value as RawSheet["wideRole"],
                  })
                }
              >
                <option value="attendance">근태·휴가</option>
                <option value="payroll">제공 인건비</option>
              </select>
            </label>
            <label>
              사번 열
              <select
                aria-label="사번 열"
                value={s.idColumn || ""}
                onChange={(e) => onChange({ ...s, idColumn: e.target.value })}
              >
                <option value="">선택</option>
                {headers.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </label>
            <label>
              기준일·귀속월 열
              <select
                aria-label="기준일·귀속월 열"
                value={s.dateColumn || ""}
                onChange={(e) => onChange({ ...s, dateColumn: e.target.value })}
              >
                <option value="">선택</option>
                {headers.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="numeric-columns">
            <legend>분석할 수치 열 (한 열씩 별도 단위 확인)</legend>
            {headers
              .filter((h) => h !== s.idColumn && h !== s.dateColumn)
              .map((h) => (
                <label className="check" key={h}>
                  <input
                    type="checkbox"
                    checked={s.valueColumns?.includes(h) || false}
                    onChange={(e) =>
                      onChange({
                        ...s,
                        valueColumns: e.target.checked
                          ? [...(s.valueColumns || []), h]
                          : (s.valueColumns || []).filter((c) => c !== h),
                      })
                    }
                  />
                  {h}
                </label>
              ))}
          </fieldset>
          <small>
            한 직원·날짜·항목은 한 행이어야 해요. 여러 기록이 있다면 기록 ID가
            있는 세로 자료로 연결하세요. 단위·항목 의미는 다음 단계에서
            확인해요.
          </small>
        </div>
      )}
      <small>
        {Math.max(0, s.matrix.length - s.headerRow - 1).toLocaleString()}개
        데이터행
      </small>
    </div>
  );
}
