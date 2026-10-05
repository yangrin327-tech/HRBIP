import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  ChevronRight,
  FileSpreadsheet,
  FolderOpen,
  Grid2X2,
  Leaf,
  LogIn,
  LogOut,
  MessageSquarePlus,
  Plus,
  ShieldCheck,
  Sparkles,
  Users,
  Trash2,
  Copy,
  Check,
  FlaskConical,
  LockKeyhole,
  Settings2,
} from "lucide-react";
import {
  emptyWorkspace,
  type Workspace,
  type Result,
  type Filters,
  type Design,
  audit,
} from "../shared/model";
import { aggregate, draft, recommendedCards } from "../shared/analytics";
import { sampleWorkspace } from "../shared/sample";
import { api, download, ApiError } from "./api";
import type { Original } from "./files";
import { Button, Notice, Modal, PageTitle } from "./ui";
import { DataInput } from "./DataInput";
import { DataReview } from "./DataReview";
import { Results } from "./Results";

type User = { id: string; username: string };
type Stored = {
  id: string;
  title: string;
  updated: string;
  owned: number;
  revision: number;
  sharedCount: number;
  originalCount: number;
};
type Template = { id: string; title: string; design: Design };
export default function App() {
  const [w, rawSetW] = useState<Workspace>(emptyWorkspace),
    [route, setRoute] = useState("home"),
    [originals, setOriginals] = useState<Original[]>([]);
  const [user, setUser] = useState<User | null>(null),
    [authOpen, setAuthOpen] = useState(false),
    [accountOpen, setAccountOpen] = useState(false),
    [requestOpen, setRequestOpen] = useState(false);
  const [sampleListOpen, setSampleListOpen] = useState(false);
  const [workId, setWorkId] = useState(""),
    [revision, setRevision] = useState(0),
    [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const [stored, setStored] = useState<Stored[]>([]),
    [templates, setTemplates] = useState<Template[]>([]),
    [templateOpen, setTemplateOpen] = useState(false),
    [templateTitle, setTemplateTitle] = useState("");
  const [shareOpen, setShareOpen] = useState(false),
    [shares, setShares] = useState<User[]>([]),
    [targetId, setTargetId] = useState(""),
    [sharedId, setSharedId] = useState(""),
    [sharedResult, setSharedResult] = useState<Result | null>(null);
  const [originalMeta, setOriginalMeta] = useState<
      { id: string; name: string; size: number }[]
    >([]),
    [accountReady, setAccountReady] = useState(false);
  const setW = useCallback((fn: (value: Workspace) => void) => {
    rawSetW((v) => {
      const copy = structuredClone(v);
      fn(copy);
      return copy;
    });
    setDirty(true);
  }, []);
  const result = useMemo(
    () => (route === "shared" && sharedResult ? sharedResult : aggregate(w)),
    [w, route, sharedResult],
  );
  useEffect(() => {
    api("/me")
      .then((data) => setUser(data.user))
      .catch(() =>
        setError(
          "서버에 연결하지 못했어요. 실행 중인지 확인하고 새로고침해 주세요.",
        ),
      )
      .finally(() => setAccountReady(true));
  }, []);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty && w.datasets.length) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, w.datasets.length]);
  function navigate(next: string) {
    setRoute(next);
    setError("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function notify(message: string) {
    setStatus(message);
    setTimeout(() => setStatus(""), 7000);
  }
  function handleError(e: unknown) {
    setError((e as Error).message);
    if (e instanceof ApiError && e.status === 401) setAuthOpen(true);
  }
  function canReplace() {
    return (
      !dirty ||
      !w.datasets.length ||
      confirm(
        "현재 작업을 다른 자료로 바꿀까요? 저장하지 않은 변경 내용은 사라집니다.",
      )
    );
  }
  function start(sample = false, to = "input", design?: Design) {
    if (!canReplace()) return;
    const next = sample ? sampleWorkspace() : emptyWorkspace();
    openWorkspace(next, to, design);
  }
  function openWorkspace(next: Workspace, to: string, design?: Design) {
    if (design) next.design = structuredClone(design);
    if (to === "result") {
      const r = aggregate(next);
      next.design.cards = recommendedCards(r);
      next.report = {
        generated: draft(r),
        notes: next.report.notes,
        basisKey: r.key,
        reviewedKey: "",
      };
    }
    rawSetW(next);
    setOriginals([]);
    setOriginalMeta([]);
    setWorkId("");
    setRevision(0);
    setDirty(next.sample);
    setSampleListOpen(false);
    setSharedId("");
    setSharedResult(null);
    navigate(to);
  }
  async function startLargeSample() {
    if (!canReplace()) return;
    setBusy(true);
    setError("");
    try {
      const { largeSampleWorkspace } = await import("../shared/sample-large");
      openWorkspace(largeSampleWorkspace(), "result");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }
  async function loadSaved() {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const [a, b] = await Promise.all([
        api<Stored[]>("/works"),
        api<Template[]>("/templates"),
      ]);
      setStored(a);
      setTemplates(b);
      navigate("saved");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }
  async function save(asNew = false) {
    if (!user) {
      setAuthOpen(true);
      notify("로그인 후 저장을 다시 눌러 주세요. 현재 작성 내용은 유지돼요.");
      return null;
    }
    setBusy(true);
    setError("");
    try {
      const data = await api("/works", "POST", {
        workspace: w,
        ...(!asNew && workId ? { id: workId, revision } : {}),
        ...(!workId || originals.length
          ? { originals: w.retainOriginals ? originals : [] }
          : {}),
      });
      setWorkId(data.id);
      setRevision(data.revision);
      setDirty(false);
      notify("작업과 편집 내용을 이 PC에 저장했어요.");
      return data.id;
    } catch (e) {
      handleError(e);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function openWork(item: Stored) {
    if (!canReplace()) return;
    setBusy(true);
    setError("");
    try {
      if (!item.owned) {
        await openShared(item.id);
        return;
      }
      const data = await api("/works/" + item.id);
      rawSetW(data.workspace);
      setWorkId(data.id);
      setRevision(data.revision);
      setDirty(false);
      setOriginalMeta(data.originals);
      setOriginals([]);
      setSharedId("");
      navigate("result");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }
  async function openShared(id: string, filters?: Filters) {
    setBusy(true);
    setError("");
    try {
      const data = await api(
        "/works/" + id + "/view",
        "POST",
        filters ? { filters } : {},
      );
      const next = emptyWorkspace();
      next.title = data.title;
      next.filters = data.result.filters;
      next.design = data.design;
      next.report = data.report;
      next.exitInclusive = data.exitInclusive;
      next.sample = data.sample;
      rawSetW(next);
      setSharedResult(data.result);
      setSharedId(id);
      setDirty(false);
      setWorkId("");
      navigate("shared");
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!accountReady) return;
    const id = new URLSearchParams(window.location.search).get("share");
    if (!id) return;
    if (!user) {
      setAuthOpen(true);
      setError("공유 자료는 지정된 계정으로 로그인해야 볼 수 있어요.");
    } else void openShared(id);
  }, [accountReady, user?.id]);
  async function beginShare() {
    if (
      w.report.basisKey !== result.key ||
      w.report.reviewedKey !== result.key
    ) {
      setError(
        "공유 전에 ‘최종 확인·내보내기’에서 현재 수치와 보고 문장을 확인해 주세요. 파일을 내려받을 필요는 없어요.",
      );
      return;
    }
    if (!user) {
      setAuthOpen(true);
      return;
    }
    const id = await save();
    if (!id) return;
    try {
      setShares(await api("/works/" + id + "/shares"));
      setShareOpen(true);
      setTargetId("");
    } catch (e) {
      handleError(e);
    }
  }
  async function exportCurrent(format: string) {
    if (route === "shared") {
      await download(
        "/works/" + sharedId + "/export/" + format,
        { filters: w.filters },
        w.title + "." + format,
      );
      return;
    }
    if (user) {
      const id = await save();
      if (!id)
        throw new Error(
          "저장에 실패해 내보내기를 중단했어요. 저장 오류를 확인해 주세요.",
        );
      await download(
        "/works/" + id + "/export/" + format,
        {},
        w.title + "." + format,
      );
    } else
      await download(
        "/export/" + format,
        { workspace: w },
        w.title + "." + format,
      );
    notify(format.toUpperCase() + " 파일을 만들었어요.");
  }
  function createResult() {
    const r = aggregate(w);
    setW((v) => {
      if (!v.design.cards.length) v.design.cards = recommendedCards(r);
      if (!v.report.generated)
        v.report = {
          generated: draft(r),
          notes: "",
          basisKey: r.key,
          reviewedKey: "",
        };
    });
    navigate("result");
  }
  async function logout() {
    if (
      dirty &&
      !confirm(
        "로그아웃하면 저장하지 않은 현재 작업이 사라집니다. 로그아웃할까요?",
      )
    )
      return;
    try {
      await api("/auth/logout", "POST", {});
      setUser(null);
      rawSetW(emptyWorkspace());
      setDirty(false);
      setWorkId("");
      setOriginals([]);
      setOriginalMeta([]);
      setSharedResult(null);
      setSharedId("");
      setAccountOpen(false);
      navigate("home");
    } catch (e) {
      handleError(e);
    }
  }
  const shared = route === "shared";
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        본문으로 건너뛰기
      </a>
      <header className="topbar">
        <button
          className="brand"
          onClick={() => navigate("home")}
          aria-label="HRBIP 홈"
        >
          <span className="brand-mark">
            <BarChart3 size={23} />
          </span>
          <span>
            HRBIP<small>HR Business Intelligence Partner</small>
          </span>
        </button>
        <nav className="top-nav" aria-label="주요 메뉴">
          <button
            className={route === "home" ? "active" : ""}
            onClick={() => navigate("home")}
          >
            업무 도구
          </button>
          <button
            className={route === "saved" ? "active" : ""}
            onClick={loadSaved}
          >
            저장한 작업
          </button>
          <button onClick={() => setRequestOpen(true)}>기능 요청</button>
        </nav>
        <div className="account-nav">
          <span className="local-badge">
            <i />
            로컬 워크스페이스
          </span>
          {user ? (
            <Button onClick={() => setAccountOpen(true)}>
              <span className="avatar">{user.username[0].toUpperCase()}</span>
              {user.username}
            </Button>
          ) : (
            <Button onClick={() => setAuthOpen(true)}>
              <LogIn size={17} />
              로그인
            </Button>
          )}
        </div>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-label">WORKSPACE</div>
          <button
            className={route === "home" ? "selected" : ""}
            onClick={() => navigate("home")}
          >
            <Grid2X2 size={19} />
            모든 도구
          </button>
          <button
            className={
              ["input", "verify", "result"].includes(route) ? "selected" : ""
            }
            onClick={() =>
              w.datasets.length && !shared ? navigate("result") : start()
            }
          >
            <BarChart3 size={19} />
            인사현황 보고서
          </button>
          <button
            className={route === "saved" ? "selected" : ""}
            onClick={loadSaved}
          >
            <FolderOpen size={19} />
            저장한 작업
          </button>
          <div className="sidebar-bottom">
            <span className="round-icon">
              <Leaf size={20} />
            </span>
            <strong>
              반복은 줄이고,
              <br />
              사람에게 더 집중하세요.
            </strong>
            <p>
              인사 업무를 위한
              <br />
              작은 도구부터 함께.
            </p>
            <button onClick={() => setRequestOpen(true)}>
              필요한 기능 알려주기 <ArrowUpRight size={16} />
            </button>
          </div>
        </aside>
        <main id="main" tabIndex={-1}>
          <div className="breadcrumb">
            워크스페이스 <ChevronRight size={13} />{" "}
            {route === "home"
              ? "모든 도구"
              : route === "saved"
                ? "저장한 작업"
                : shared
                  ? "공유 보고서"
                  : "인사현황 보고서·대시보드"}
          </div>
          {error && (
            <Notice tone="error">
              {error}
              <Button variant="ghost" onClick={() => setError("")}>
                닫기
              </Button>
              {error.includes("다른 화면") && (
                <Button onClick={() => save(true)}>새 작업으로 저장</Button>
              )}
            </Notice>
          )}
          {status && (
            <div className="toast" role="status">
              <Check size={18} />
              {status}
            </div>
          )}
          {busy && (
            <div className="loading-line" role="status">
              작업을 처리하고 있어요…
            </div>
          )}
          {route === "home" && (
            <>
              <section className="home-intro">
                <div>
                  <div className="eyebrow">
                    <span className="tiny-dot" />
                    YOUR HR WORK PARTNER
                  </div>
                  <h1>
                    흩어진 인사 자료를
                    <br />
                    <span>한눈에 보는 현황으로.</span>
                  </h1>
                  <p>
                    자료 확인부터 대시보드, 보고서까지.
                    <br />
                    인사 업무의 다음 단계를 HRBIP와 함께하세요.
                  </p>
                </div>
                <div className="intro-illustration" aria-hidden="true">
                  <div className="paper back" />
                  <div className="paper front">
                    <div className="illus-label">
                      <span>PEOPLE INSIGHTS</span>
                      <BarChart3 size={18} />
                    </div>
                    <div className="illus-title">
                      우리 조직을 이해하는
                      <br />더 명확한 시선.
                    </div>
                    <div className="illus-bars">
                      {[40, 65, 52, 86, 72, 96].map((n, i) => (
                        <i key={i} style={{ height: n + "%" }} />
                      ))}
                    </div>
                    <span className="illus-footer">
                      DATA → INSIGHT → ACTION
                    </span>
                  </div>
                  <div className="floating-badge">
                    <CheckCircle />
                    자료에서 보고서까지
                  </div>
                </div>
              </section>
              <section className="tools-heading">
                <div>
                  <span className="eyebrow">TOOLS FOR YOUR WORK</span>
                  <h2>오늘의 업무, 여기서 시작해요.</h2>
                </div>
                <span className="count-pill">사용 가능한 도구 1</span>
              </section>
              <div className="home-tools">
                <article className="featured-tool">
                  <div className="tool-top">
                    <span className="tool-icon">
                      <BarChart3 size={26} />
                    </span>
                    <span className="tag">첫 번째 도구</span>
                  </div>
                  <h2>
                    인사현황 보고서·
                    <br />
                    대시보드 만들기
                  </h2>
                  <p>
                    기존 인사 파일을 연결하면, 보유한 자료에 맞춰
                    <br className="desktop-only" />
                    추천 대시보드와 수정 가능한 보고서 초안을 만들어요.
                  </p>
                  <div className="feature-chips">
                    <span>인원·입퇴사</span>
                    <span>근태·휴가</span>
                    <span>인건비</span>
                  </div>
                  <div className="tool-actions">
                    <Button variant="primary" onClick={() => start()}>
                      내 자료로 시작하기 <ArrowRight size={18} />
                    </Button>
                    <Button onClick={() => start(true, "result")}>
                      <FlaskConical size={17} />
                      샘플로 체험하기
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setSampleListOpen(true)}
                    >
                      샘플 목록
                    </Button>
                  </div>
                  <div className="tool-foot">
                    <ShieldCheck size={15} />
                    원본을 보호하고, 확인한 기준으로 집계해요.
                  </div>
                </article>
                <div className="stack">
                  <article className="panel how-to">
                    <h3>복잡한 설정 없이, 한 단계씩.</h3>
                    {[
                      [
                        "01",
                        "자료를 연결해요",
                        "기존 CSV·Excel 파일이나 가상 샘플로 시작해요.",
                      ],
                      [
                        "02",
                        "숫자의 기준을 확인해요",
                        "항목·오류·기간을 확인하고 추천 결과를 만들어요.",
                      ],
                      [
                        "03",
                        "내 업무에 맞게 완성해요",
                        "편집한 결과를 저장하고 문서로 내보내세요.",
                      ],
                    ].map(([n, t, d]) => (
                      <div className="how-step" key={n}>
                        <span>{n}</span>
                        <div>
                          <strong>{t}</strong>
                          <p>{d}</p>
                        </div>
                      </div>
                    ))}
                  </article>
                  <article className="coming-soon">
                    <div>
                      <span className="tag muted-tag">확장 예정</span>
                      <h3>다음 도구는, 실제 필요에서.</h3>
                      <p>반복해서 하는 인사 업무가 있나요?</p>
                    </div>
                    <Button
                      variant="ghost"
                      aria-label="원하는 기능 요청"
                      onClick={() => setRequestOpen(true)}
                    >
                      <Plus size={23} />
                    </Button>
                  </article>
                </div>
              </div>
              <section className="request-banner">
                <MessageSquarePlus size={26} />
                <div>
                  <h3>“이런 기능도 있으면 좋겠어요.”</h3>
                  <p>
                    원하는 기능이 있으면 요청해보세요. 다음 개선의 출발점이
                    돼요.
                  </p>
                </div>
                <Button onClick={() => setRequestOpen(true)}>
                  기능 요청하기 <ArrowUpRight size={16} />
                </Button>
              </section>
            </>
          )}
          {route === "input" && (
            <DataInput
              w={w}
              setW={setW}
              originals={originals}
              setOriginals={setOriginals}
              onNext={() => navigate("verify")}
              onSample={() => start(true, "verify")}
              onSampleList={() => setSampleListOpen(true)}
            />
          )}
          {route === "verify" && (
            <DataReview
              w={w}
              setW={setW}
              onBack={() => navigate("input")}
              onNext={createResult}
            />
          )}
          {(route === "result" || shared) && (
            <Results
              w={w}
              r={result}
              setW={setW}
              onFilters={(f) => {
                if (shared) void openShared(sharedId, f);
                else
                  setW((v) => {
                    v.filters = f;
                  });
              }}
              onSave={() => save()}
              onTemplate={() => {
                if (!user) {
                  setAuthOpen(true);
                  return;
                }
                setTemplateTitle(w.title + " 구성");
                setTemplateOpen(true);
              }}
              onShare={beginShare}
              onExport={exportCurrent}
              onBack={() => navigate("verify")}
              readOnly={shared}
              busy={busy}
            />
          )}
          {route === "saved" && (
            <>
              <PageTitle
                eyebrow="SAVED WORKSPACE"
                title="이어서, 더 가볍게."
                description="저장한 작업을 다시 열거나, 익숙한 구성에 새로운 자료를 적용하세요."
                actions={
                  <Button variant="primary" onClick={() => start()}>
                    <Plus size={17} />새 작업
                  </Button>
                }
              />
              <section className="panel">
                <div className="section-heading">
                  <h2>저장한 작업·공유받은 보고서</h2>
                  <span className="tag">{stored.length}</span>
                </div>
                {!stored.length ? (
                  <div className="empty-state">
                    <FolderOpen size={35} />
                    <h3>아직 저장한 작업이 없어요.</h3>
                    <p>보고서를 만든 뒤 저장하면 이곳에서 다시 열 수 있어요.</p>
                    <Button onClick={() => start(true, "result")}>
                      샘플로 시작하기
                    </Button>
                  </div>
                ) : (
                  <div className="saved-list">
                    {stored.map((item) => (
                      <article key={item.id}>
                        <span className="file-icon">
                          <FileSpreadsheet size={23} />
                        </span>
                        <div>
                          <h3>{item.title}</h3>
                          <p>
                            {item.owned ? "내 작업" : "공유받은 작업"} ·{" "}
                            {new Date(item.updated).toLocaleString("ko-KR")}
                          </p>
                          <small>
                            공유 {item.sharedCount}개 계정 · 원본{" "}
                            {item.originalCount
                              ? "보관 " + item.originalCount + "개"
                              : "미보관"}{" "}
                            · 분석 데이터 저장됨
                          </small>
                        </div>
                        <div className="actions">
                          <Button onClick={() => openWork(item)}>
                            열기 <ArrowRight size={15} />
                          </Button>
                          {!!item.owned && (
                            <Button
                              variant="ghost"
                              aria-label={item.title + " 삭제"}
                              onClick={async () => {
                                if (
                                  !confirm(
                                    "작업·분석 데이터·보관 원본·공유 권한을 삭제할까요? 되돌릴 수 없습니다.",
                                  )
                                )
                                  return;
                                try {
                                  await api("/works/" + item.id, "DELETE", {});
                                  if (workId === item.id) {
                                    setWorkId("");
                                    setRevision(0);
                                  }
                                  await loadSaved();
                                } catch (e) {
                                  handleError(e);
                                }
                              }}
                            >
                              <Trash2 size={17} />
                            </Button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
              <section className="panel">
                <div className="section-heading">
                  <h2>내 템플릿</h2>
                  <span className="tag">{templates.length}</span>
                </div>
                <p className="muted">
                  차트·제목·배치·색상만 저장해요. 이전 직원 정보와 수치는
                  포함되지 않아요.
                </p>
                {templates.length ? (
                  <div className="template-grid">
                    {templates.map((t) => (
                      <article key={t.id}>
                        <Settings2 size={21} />
                        <h3>{t.title}</h3>
                        <p>구성 카드 {t.design.cards.length}개</p>
                        <div className="actions">
                          <Button
                            onClick={() => start(false, "input", t.design)}
                          >
                            새 데이터 적용
                          </Button>
                          <Button
                            variant="ghost"
                            aria-label={t.title + " 템플릿 삭제"}
                            onClick={async () => {
                              if (confirm("이 템플릿을 삭제할까요?"))
                                try {
                                  await api("/templates/" + t.id, "DELETE", {});
                                  await loadSaved();
                                } catch (e) {
                                  handleError(e);
                                }
                            }}
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p>
                    결과 화면에서 마음에 드는 구성을 템플릿으로 저장해 보세요.
                  </p>
                )}
              </section>
              <Notice>
                저장 위치: 이 프로젝트의 .data 폴더. 목록의 삭제 버튼으로 해당
                작업의 분석 자료·원본·공유 권한을 함께 삭제해요. 별도로 만든
                출력 파일과 외부 백업은 직접 삭제해야 해요.
              </Notice>
            </>
          )}
          <footer className="footer">
            <span>
              HRBIP <small>HR Business Intelligence Partner</small>
            </span>
            <button onClick={() => setRequestOpen(true)}>
              더 나은 인사 업무를 함께 만들어요 <ArrowUpRight size={13} />
            </button>
          </footer>
        </main>
      </div>
      {authOpen && (
        <AuthModal
          onClose={() => setAuthOpen(false)}
          onSuccess={(u) => {
            setUser(u);
            setAuthOpen(false);
            notify("로그인했어요. 작성 중인 내용은 그대로 유지돼요.");
          }}
        />
      )}
      {accountOpen && user && (
        <Modal title="내 계정" onClose={() => setAccountOpen(false)}>
          <h3>{user.username}</h3>
          <p>공유를 받을 때 아래 계정 ID를 작업 소유자에게 알려주세요.</p>
          <label>
            공유용 계정 ID
            <input
              readOnly
              value={user.id}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(user.id);
                notify("계정 ID를 복사했어요.");
              } catch {
                notify("계정 ID 입력칸을 선택해서 복사해 주세요.");
              }
            }}
          >
            <Copy size={16} />
            ID 복사
          </Button>
          <Notice>
            이 PC에서 실행 중인 HRBIP 계정이에요. 비밀번호는 해시로 보관하고
            로그인 세션은 12시간 유지돼요. 이메일 인증·비밀번호 찾기는 제공하지
            않으니 비밀번호를 안전하게 보관해 주세요.
          </Notice>
          <Button onClick={logout}>
            <LogOut size={17} />
            로그아웃
          </Button>
        </Modal>
      )}
      {sampleListOpen && (
        <Modal
          title="샘플 데이터 선택"
          onClose={() => !busy && setSampleListOpen(false)}
        >
          <p>가상 데이터로 업로드 없이 대시보드와 보고서를 체험해요.</p>
          {error && <Notice tone="error">{error}</Notice>}
          <div className="stack">
            <section className="panel compact">
              <h3>기본 샘플 · 48명 이력</h3>
              <p>2026년 1~9월 · 5개 부서 · 기본 기능을 빠르게 확인해요.</p>
              <Button disabled={busy} onClick={() => start(true, "result")}>
                기본 샘플 열기
              </Button>
            </section>
            <section className="panel compact sample-panel">
              <span className="tag">사용자 제공 가상 데이터</span>
              <h3>150명·24개월 인사 데이터</h3>
              <p>
                2024년 10월~2026년 9월 · 최종 재직 150명 · 전체 이력 180명 · 7개
                부서
              </p>
              <p className="small">
                인원·입퇴사, 근무·휴가, 제공 인건비를 함께 살펴보세요. 원본의
                이름·생년월일은 샘플에 포함하지 않았어요.
              </p>
              <Notice>
                이 파일의 기준대로 퇴사일은 제외해요. 부서 필터는 최종 관측 소속
                기준이며 과거 부서 이동 분석은 포함하지 않아요.
              </Notice>
              <Button variant="primary" busy={busy} onClick={startLargeSample}>
                150명·24개월 샘플 열기
              </Button>
            </section>
          </div>
        </Modal>
      )}
      {requestOpen && <RequestModal onClose={() => setRequestOpen(false)} />}
      {templateOpen && (
        <Modal
          title="구성을 템플릿으로 저장"
          onClose={() => setTemplateOpen(false)}
        >
          {error && <Notice tone="error">{error}</Notice>}
          <label>
            템플릿 이름
            <input
              value={templateTitle}
              onChange={(e) => setTemplateTitle(e.target.value)}
              maxLength={160}
            />
          </label>
          <Notice>
            직원 데이터·집계 수치·보고 문장은 저장하지 않아요. 새 자료를 적용할
            때 다시 연결하고 검증해요.
          </Notice>
          <Button
            variant="primary"
            disabled={!templateTitle.trim()}
            onClick={async () => {
              try {
                await api("/templates", "POST", {
                  title: templateTitle,
                  design: w.design,
                });
                setTemplateOpen(false);
                notify("템플릿을 저장했어요.");
              } catch (e) {
                handleError(e);
              }
            }}
          >
            템플릿 저장
          </Button>
        </Modal>
      )}
      {shareOpen && (
        <Modal
          title="지정 계정에 공유"
          onClose={() => setShareOpen(false)}
          wide
        >
          <Notice>
            이 서버에 가입한 계정 ID를 추가하세요. 공유받은 사람은 조회·필터
            탐색·집계 파일 출력만 할 수 있어요. 직원별 행과 원본 파일은 공유하지
            않아요.
          </Notice>
          {error && <Notice tone="error">{error}</Notice>}
          <label>
            상대방 계정 ID
            <input
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder="상대방의 내 계정에서 복사한 ID"
            />
          </label>
          <Button
            disabled={!targetId.trim()}
            onClick={async () => {
              try {
                await api("/works/" + workId + "/shares", "POST", {
                  userId: targetId.trim(),
                });
                setShares(await api("/works/" + workId + "/shares"));
                setTargetId("");
                notify("지정 계정에 조회 권한을 추가했어요.");
              } catch (e) {
                handleError(e);
              }
            }}
          >
            조회 권한 추가
          </Button>
          <div className="share-list">
            {shares.length ? (
              shares.map((u) => (
                <div className="row between" key={u.id}>
                  <span>
                    {u.username}
                    <small>{u.id}</small>
                  </span>
                  <Button
                    variant="danger"
                    onClick={async () => {
                      try {
                        await api(
                          "/works/" + workId + "/shares/" + u.id,
                          "DELETE",
                          {},
                        );
                        setShares(await api("/works/" + workId + "/shares"));
                      } catch (e) {
                        handleError(e);
                      }
                    }}
                  >
                    권한 해제
                  </Button>
                </div>
              ))
            ) : (
              <p>추가된 공유 대상이 없어요.</p>
            )}
          </div>
          <label>
            웹 공유 링크
            <input
              readOnly
              value={location.origin + "/?share=" + workId}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <Button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  location.origin + "/?share=" + workId,
                );
                notify("공유 링크를 복사했어요.");
              } catch {
                notify("위 링크를 직접 선택해서 복사해 주세요.");
              }
            }}
          >
            <Copy size={16} />
            링크 복사
          </Button>
          <p className="small">
            현재는 내 컴퓨터에서만 실행 중이에요. 다른 컴퓨터에서 접속하려면
            별도 배포가 필요해요. 링크가 있어도 지정 계정으로 로그인하지 않으면
            볼 수 없어요.
          </p>
          {originalMeta.length > 0 && (
            <details>
              <summary>보관 원본 (소유자 전용)</summary>
              {originalMeta.map((o) => (
                <p key={o.id}>
                  <a href={"/api/works/" + workId + "/originals/" + o.id}>
                    {o.name} 내려받기
                  </a>
                </p>
              ))}
            </details>
          )}
        </Modal>
      )}
    </div>
  );
}
function CheckCircle() {
  return <Check size={15} />;
}
function AuthModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (u: User) => void;
}) {
  const [register, setRegister] = useState(false),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={register ? "HRBIP 계정 만들기" : "다시 만나 반가워요"}
      onClose={onClose}
    >
      <div className="auth-icon">
        <LockKeyhole size={26} />
      </div>
      <p>로그인하면 작업·보고서·템플릿을 이 PC에 저장하고 다시 열 수 있어요.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const data = await api(
              "/auth/" + (register ? "register" : "login"),
              "POST",
              { username, password },
            );
            onSuccess(data.user);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          아이디
          <input
            autoFocus
            autoComplete="username"
            value={username}
            pattern="[a-zA-Z0-9][a-zA-Z0-9_.\-]{2,31}"
            minLength={3}
            maxLength={32}
            required
            onChange={(e) => setUsername(e.target.value)}
            placeholder="영문·숫자·._- 조합 3~32자"
          />
        </label>
        <label>
          비밀번호
          <input
            type="password"
            autoComplete={register ? "new-password" : "current-password"}
            value={password}
            minLength={10}
            maxLength={128}
            required
            onChange={(e) => setPassword(e.target.value)}
            placeholder="10자 이상"
          />
        </label>
        {error && <Notice tone="error">{error}</Notice>}
        <Button
          type="submit"
          variant="primary"
          busy={busy}
          className="full-width"
        >
          {register ? "계정 만들고 시작" : "로그인"}
        </Button>
      </form>
      <Button
        variant="ghost"
        onClick={() => {
          setRegister(!register);
          setError("");
        }}
      >
        {register ? "이미 계정이 있어요 · 로그인" : "처음이신가요? 계정 만들기"}
      </Button>
      <small>
        실제 비밀번호 인증을 사용해요. 외부 서비스 계정과는 별개이며, 개인정보가
        있는 실무 자료는 보안 검토 후 사용하세요.
      </small>
    </Modal>
  );
}
function RequestModal({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState(""),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="어떤 업무를 더 도와드릴까요?" onClose={onClose}>
      <p>반복해서 만드는 자료나 불편한 업무를 알려주세요.</p>
      <label>
        원하는 기능
        <textarea
          rows={6}
          minLength={5}
          maxLength={2000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="어떤 상황에서, 무엇이 불편한지 적어주세요. 개인정보는 넣지 마세요."
        />
      </label>
      <small>
        이 PC의 기능 요청함에 저장해요. 운영자나 외부 서비스로 전송하지 않아요.
      </small>
      {status && <Notice tone="success">{status}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      <Button
        variant="primary"
        busy={busy}
        disabled={message.trim().length < 5}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const data = await api("/requests", "POST", { message });
            setStatus(data.message + " 요청 번호: " + data.id.slice(0, 8));
            setMessage("");
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        기능 요청 저장
      </Button>
    </Modal>
  );
}
