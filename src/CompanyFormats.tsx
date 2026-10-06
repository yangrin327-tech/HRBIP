import { useEffect, useState } from "react";
import type { Workspace, Result } from "../shared/model";
import { audit } from "../shared/model";
import {
  formatFields,
  fieldValue,
  type CompanyFormat,
  type FormatInspection,
  type Binding,
} from "../shared/company-format";
import { api } from "./api";
import { Button, Modal, Notice } from "./ui";
export function CompanyFormats({
  w,
  r,
  setW,
  loggedIn,
  onLogin,
  onClose,
}: {
  w: Workspace;
  r: Result;
  setW: (f: (w: Workspace) => void) => void;
  loggedIn: boolean;
  onLogin: () => void;
  onClose: () => void;
}) {
  const [formats, setFormats] = useState<CompanyFormat[]>([]),
    [inspection, setInspection] = useState<FormatInspection | null>(null),
    [file, setFile] = useState<{ name: string; data: string } | null>(null),
    [bindings, setBindings] = useState<Binding[]>([]),
    [title, setTitle] = useState(""),
    [previousId, setPreviousId] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [brand, setBrand] = useState({ font: "맑은 고딕", color: "#166b4c" });
  const refresh = () =>
    api<CompanyFormat[]>("/company-formats").then(setFormats);
  useEffect(() => {
    if (loggedIn) void refresh().catch((e) => setError(e.message));
  }, [loggedIn]);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const apply = (f: CompanyFormat) => {
    setW((v) => {
      v.companyFormats = { ...v.companyFormats, [f.format]: f.id };
      v.design.brand = f.brand;
      v.report.reviewedKey = "";
      audit(
        v,
        "회사 양식 적용: " + f.title + " v" + f.version + " (" + f.format + ")",
      );
    });
    setMessage(
      f.title +
        " v" +
        f.version +
        " 적용됨. 작업 저장으로 이 선택도 보관하세요.",
    );
  };
  return (
    <Modal title="회사 양식 등록·적용" onClose={onClose} wide>
      <p>
        처음 한 번 위치를 연결하면, 다음 보고서도 회사 양식으로 만들 수 있어요.
        PPTX부터 등록하고 Excel 양식도 함께 저장하세요.
      </p>
      {!loggedIn && (
        <Notice>
          <p>
            양식은 로그인한 계정의 HRBIP 저장소에 보관해요. 파일 검사와 연결
            확인은 먼저 할 수 있어요.
          </p>
          <Button onClick={onLogin}>로그인하고 양식 저장하기</Button>
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {message && <Notice tone="success">{message}</Notice>}
      <section className="format-library">
        <h3>저장한 회사 양식</h3>
        {!formats.length && (
          <p className="muted">
            등록한 양식이 없어요. 아래에서 회사 파일을 선택하세요.
          </p>
        )}
        {(["pptx", "xlsx"] as const).map((kind) => (
          <div className="format-choice" key={kind}>
            <strong>{kind === "pptx" ? "PowerPoint" : "Excel"}</strong>
            <select
              aria-label={kind + " 회사 양식 선택"}
              value={w.companyFormats?.[kind] || ""}
              onChange={(e) => {
                const f = formats.find((f) => f.id === e.target.value);
                if (f) apply(f);
                else
                  setW((v) => {
                    v.companyFormats = {
                      ...v.companyFormats,
                      [kind]: undefined,
                    };
                    v.report.reviewedKey = "";
                    if (!Object.values(v.companyFormats).some(Boolean))
                      v.design.brand = undefined;
                  });
              }}
            >
              <option value="">HRBIP 기본 양식</option>
              {formats
                .filter((f) => f.format === kind)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title} · v{f.version}
                  </option>
                ))}
            </select>
          </div>
        ))}
        <details>
          <summary>버전·보관·삭제 관리</summary>
          {formats.map((f) => (
            <div className="format-choice" key={f.id}>
              <span>
                {f.title} · {f.format.toUpperCase()} · v{f.version}
              </span>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (
                      !confirm(
                        "이 양식을 삭제할까요? 저장한 작업이 사용 중이면 삭제할 수 없어요.",
                      )
                    )
                      return;
                    await api("/company-formats/" + f.id, "DELETE");
                    if (Object.values(w.companyFormats || {}).includes(f.id))
                      setW((v) => {
                        v.companyFormats = {
                          ...v.companyFormats,
                          [f.format]: undefined,
                        };
                      });
                    await refresh();
                    setMessage("양식을 삭제했어요.");
                  })
                }
              >
                삭제
              </Button>
            </div>
          ))}
          <p className="small">
            원본 분석 파일 보관 선택과 별개로, 정리한 양식 파일과 연결 설정을
            계정별로 보관해요. 새 버전은 기존 작업의 양식을 바꾸지 않아요.
          </p>
        </details>
      </section>
      <section className="soft-box">
        <h3>새 양식 등록</h3>
        <label>
          회사 양식 파일 (PPTX / XLSX · 10MB)
          <input
            aria-label="회사 양식 파일"
            type="file"
            accept=".pptx,.xlsx"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              void run(async () => {
                if (f.size > 10 * 1024 * 1024)
                  throw new Error("10MB 이하 양식을 선택하세요.");
                const data = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () =>
                    resolve(String(reader.result).split(",")[1]);
                  reader.onerror = () =>
                    reject(new Error("파일을 읽지 못했어요."));
                  reader.readAsDataURL(f);
                });
                const input = { name: f.name, data };
                const parsed = await api<FormatInspection>(
                  "/company-formats/inspect",
                  "POST",
                  input,
                );
                setFile(input);
                setInspection(parsed);
                setTitle(f.name.replace(/\.[^.]+$/, ""));
                setBindings(
                  parsed.slots.map((s) => ({
                    slot: s.id,
                    field: s.suggestion,
                  })),
                );
                setBrand(parsed.brand);
                setConfirmed(false);
                setPreviousId("");
              });
            }}
          />
        </label>
        <p className="small">
          기존 양식을 그대로 검사해요. 연결하지 않은 값은 비우고, 유지할
          제목·로고는 직접 선택해요. {"{{title}}"}, {"{{period}}"},{" "}
          {"{{chart:headcount}}"}처럼 적힌 자리도 자동 추천해요.
        </p>
      </section>
      {inspection && (
        <>
          <Notice>
            {inspection.warnings.map((s, i) => (
              <p key={i}>{s}</p>
            ))}
          </Notice>
          <label>
            양식 이름
            <input
              value={title}
              maxLength={160}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            버전 저장
            <select
              value={previousId}
              onChange={(e) => setPreviousId(e.target.value)}
            >
              <option value="">새 양식으로 등록</option>
              {formats
                .filter((f) => f.format === inspection.format)
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.title} v{f.version}의 새 버전
                  </option>
                ))}
            </select>
          </label>
          <div className="format-choice">
            <label>
              웹·새 차트 글꼴
              <input
                value={brand.font}
                maxLength={100}
                onChange={(e) => setBrand({ ...brand, font: e.target.value })}
              />
            </label>
            <label>
              웹·새 차트 강조색
              <input
                type="color"
                value={brand.color}
                onChange={(e) => setBrand({ ...brand, color: e.target.value })}
              />
            </label>
          </div>
          <p className="small">
            기존 문구의 글꼴·크기·색은 회사 양식의 서식을 유지해요. 위 설정은 웹
            대시보드와 새로 연결한 차트에 사용해요.
          </p>
          {inspection.pages.map((page) => (
            <section key={page.id} className="format-page">
              <h3>{page.label} · 연결 확인</h3>
              <div className="format-slots">
                {inspection.slots
                  .filter((s) => s.page === page.id)
                  .map((slot) => {
                    const binding =
                      bindings.find((b) => b.slot === slot.id)?.field || "";
                    return (
                      <div className="format-slot" key={slot.id}>
                        <div>
                          <strong>{slot.label}</strong>
                          <small>
                            {slot.kind === "text"
                              ? "문구/셀"
                              : slot.kind === "chart"
                                ? "차트"
                                : slot.kind === "table"
                                  ? "표"
                                  : "그림"}
                            {slot.w
                              ? ` · ${slot.w.toFixed(1)} × ${slot.h?.toFixed(1)}인치`
                              : ""}
                          </small>
                          <p className="format-source">
                            {slot.sample || "(내용 없는 자리)"}
                          </p>
                          {binding && binding !== "keep" && (
                            <p className="format-value">
                              연결 결과:{" "}
                              {binding.startsWith("chart:")
                                ? "현재 집계의 차트/표"
                                : binding === "table:metrics"
                                  ? "현재 주요 지표 표"
                                  : String(fieldValue(binding, w, r))}
                            </p>
                          )}
                        </div>
                        <label>
                          연결할 내용
                          <select
                            aria-label={"연결 · " + slot.label}
                            value={binding}
                            onChange={(e) => {
                              setBindings((v) =>
                                v.map((b) =>
                                  b.slot === slot.id
                                    ? { ...b, field: e.target.value }
                                    : (slot.kind === "table" &&
                                          inspection.slots.find(
                                            (s) => s.id === b.slot,
                                          )?.cell?.parent === slot.id) ||
                                        slot.cell?.parent === b.slot
                                      ? { ...b, field: "" }
                                      : b,
                                ),
                              );
                              setConfirmed(false);
                            }}
                          >
                            <option value="">비우기 / 제거</option>
                            {!["chart", "table"].includes(slot.kind) &&
                              !slot.sample.startsWith("[수식]") && (
                                <option value="keep">
                                  고정 문구·그림 유지
                                </option>
                              )}
                            {slot.kind !== "image" &&
                              formatFields
                                .filter(([key]) =>
                                  slot.kind === "chart"
                                    ? key.startsWith("chart:")
                                    : slot.kind === "table"
                                      ? key.startsWith("chart:") ||
                                        key === "table:metrics"
                                      : slot.cell
                                        ? !key.startsWith("chart:") &&
                                          key !== "table:metrics"
                                        : inspection.format === "pptx"
                                          ? key !== "table:metrics"
                                          : true,
                                )
                                .map(([key, label]) => (
                                  <option key={key} value={key}>
                                    {label}
                                  </option>
                                ))}
                          </select>
                        </label>
                      </div>
                    );
                  })}
              </div>
            </section>
          ))}
          <p className="small">
            이 화면은 위치·연결 내용 확인용이며 Office 렌더링 미리보기는
            아니에요. 첫 출력 파일에서 로고와 글꼴, 페이지 배치를 확인하세요.
            PDF는 회사 슬라이드 복제 없이 기본 보고서 배치로 출력해요.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            연결과 고정 문구·그림을 확인했어요. 과거 수치나 개인정보가 남아 있지
            않아요.
          </label>
          <Button
            variant="primary"
            busy={busy}
            disabled={
              !confirmed ||
              !title.trim() ||
              !loggedIn ||
              !brand.font.trim() ||
              !bindings.some((b) => b.field && b.field !== "keep")
            }
            onClick={() =>
              void run(async () => {
                const saved = await api<CompanyFormat>(
                  "/company-formats",
                  "POST",
                  {
                    ...file,
                    title,
                    bindings,
                    brand,
                    confirmed,
                    previousId: previousId || undefined,
                  },
                );
                await refresh();
                apply(saved);
                setInspection(null);
                setFile(null);
              })
            }
          >
            연결 저장하고 이 보고서에 적용
          </Button>
        </>
      )}
    </Modal>
  );
}
