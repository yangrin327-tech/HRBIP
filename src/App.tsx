import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { api, download, ApiError, setGuestRequests } from "./api";
import { GuestContext, useGuest, type GuestFormat } from "./guest";
import type { Original, RawSheet } from "./files";
import {
  readBrowserSettings,
  readBrowserWork,
  writeBrowserWork,
  listBrowserWorks,
  listBrowserTemplates,
  writeBrowserTemplate,
  deleteBrowserTemplate,
  deleteBrowserWork,
  writeBrowserFormats,
  flushBrowserWrites,
  type BrowserWork,
} from "./browser-store";
import { Button, Notice, Modal, PageTitle } from "./ui";
import { DataInput } from "./DataInput";
import { DataReview } from "./DataReview";
import { Results } from "./Results";
import { HomePage } from "./HomePage";
import { InquiryForm } from "./InquiryForm";
import { SiteNavigation, type ResultView } from "./SiteNavigation";
import { prepareRepeat, type ReusePlan } from "../shared/reuse";
import { RepeatReview } from "./RepeatReview";
import {
  supportTools,
  toolFromHash,
  SupportToolCards,
  SupportToolPage,
} from "./SupportTools";

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
  const [resultEntry, setResultEntry] = useState<{ view: ResultView; revision: number }>({ view: "dashboard", revision: 0 });
  const [w, rawSetW] = useState<Workspace>(emptyWorkspace),
    [route, setRoute] = useState(() =>
      toolFromHash() ? "tool:" + toolFromHash() : "home",
    ),
    [originals, setOriginals] = useState<Original[]>([]);
  const [user, setUser] = useState<User | null>(null),
    [authOpen, setAuthOpen] = useState(false),
    [accountOpen, setAccountOpen] = useState(false),
    [requestOpen, setRequestOpen] = useState(false);
  const [sampleListOpen, setSampleListOpen] = useState(false);
  const [browserImport, setBrowserImport] = useState<BrowserWork[] | null>(
    null,
  );
  const [publicDemo, setPublicDemo] = useState(false);
  const [guestMode, setGuestMode] = useState(true);
  const [accountsEnabled, setAccountsEnabled] = useState(false);
  const migratedFormats = useRef(new Map<string, string>());
  const [guestFormats, setGuestFormats] = useState<GuestFormat[]>([]);
  const [pendingSheets, setPendingSheets] = useState<RawSheet[]>([]);
  const [browserReady, setBrowserReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const saveSequence = useRef(0);
  const workspaceRef = useRef(w);
  workspaceRef.current = w;
  const [returnToSaved, setReturnToSaved] = useState(false);
  const [reusePlan, setReusePlan] = useState<ReusePlan | null>(null);
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
    if (!accountReady) return;
    let cancelled = false;
    (async () => {
      try {
        const settings = await readBrowserSettings();
        if (cancelled) return;
        setGuestFormats(settings.formats);
        if (
          guestMode &&
          settings.activeWork &&
          !new URLSearchParams(location.search).has("share")
        ) {
          const saved = await readBrowserWork(settings.activeWork);
          if (cancelled) return;
          restoreBrowserWork(saved, true);
        }
      } catch (error) {
        if (!cancelled) setStorageError((error as Error).message);
      } finally {
        if (!cancelled) setBrowserReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountReady, guestMode]);
  useEffect(() => {
    if (!guestMode || !browserReady || !workId || route === "shared") return;
    const sequence = ++saveSequence.current;
    setDirty(true);
    void persistBrowserWork()
      .then(() => {
        if (sequence !== saveSequence.current) return;
        setDirty(false);
        setStorageError("");
      })
      .catch((error) => {
        if (sequence === saveSequence.current)
          setStorageError((error as Error).message);
      });
  }, [
    guestMode,
    browserReady,
    workId,
    w,
    pendingSheets,
    originals,
    reusePlan,
    route,
  ]);
  function persistBrowserWork(id = workId) {
    const savedRoute = ["input", "repeat", "verify", "result"].includes(route)
      ? route
      : w.datasets.length
        ? w.basisConfirmed
          ? "result"
          : "verify"
        : "input";
    return writeBrowserWork({
      id,
      workspace: w,
      route: savedRoute,
      sheets: pendingSheets,
      originals: w.retainOriginals ? originals : [],
      reusePlan,
    });
  }
  function restoreBrowserWork(saved: BrowserWork, preserveTool = false) {
    rawSetW(saved.workspace);
    setWorkId(saved.id);
    setRevision(saved.revision);
    setPendingSheets(saved.sheets || []);
    setOriginals(saved.originals || []);
    setOriginalMeta([]);
    setReusePlan(saved.reusePlan || null);
    setSharedId("");
    setSharedResult(null);
    setDirty(false);
    if (preserveTool && toolFromHash()) return;
    setRoute(
      ["input", "repeat", "verify", "result"].includes(saved.route)
        ? saved.route
        : "home",
    );
  }
  async function persistFormats(formats: GuestFormat[]) {
    await flushBrowserWrites();
    await writeBrowserFormats(formats);
    setGuestFormats(formats);
  }
  useEffect(() => {
    api("/me")
      .then((data) => {
        setUser(data.user);
        setPublicDemo(!!data.publicDemo);
        setAccountsEnabled(!!data.accountsEnabled);
        const guest = data.guestMode !== false;
        setGuestMode(guest);
        setGuestRequests(guest);
      })
      .catch(() =>
        setError(
          "서버에 연결하지 못했어요. 실행 중인지 확인하고 새로고침해 주세요.",
        ),
      )
      .finally(() => setAccountReady(true));
  }, []);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty && (w.datasets.length || pendingSheets.length)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, w.datasets.length, pendingSheets.length]);
  useEffect(() => {
    const syncRoute = () => {
      const tool = toolFromHash();
      const remembered = history.state?.hrbipRoute;
      setRoute(
        tool
          ? "tool:" + tool
          : typeof remembered === "string" && !remembered.startsWith("tool:")
            ? remembered
            : "home",
      );
    };
    window.addEventListener("popstate", syncRoute);
    window.addEventListener("hashchange", syncRoute);
    return () => {
      window.removeEventListener("popstate", syncRoute);
      window.removeEventListener("hashchange", syncRoute);
    };
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("home-scroll", route === "home");
    return () => document.documentElement.classList.remove("home-scroll");
  }, [route]);
  function openResult(view: ResultView, sample = false) {
    if (sample) {
      if (!canReplace()) return;
      setResultEntry({ view, revision: Date.now() });
      openWorkspace(sampleWorkspace(), "result");
    } else if (!shared && w.datasets.length && w.basisConfirmed) {
      setResultEntry({ view, revision: Date.now() });
      navigate("result");
    } else {
      if (!canReplace()) return;
      setResultEntry({ view, revision: Date.now() });
      openWorkspace(emptyWorkspace(), "input");
    }
  }
  function beginInput() { setResultEntry({ view: "dashboard", revision: Date.now() }); start(); }
  function showSamples() { setResultEntry({ view: "dashboard", revision: Date.now() }); setSampleListOpen(true); }
  function navigate(next: string) {
    const url = new URL(location.href);
    url.hash = next.startsWith("tool:") ? "tools/" + next.slice(5) : "";
    history.pushState({ hrbipRoute: next }, "", url);
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
    if (!guestMode && e instanceof ApiError && e.status === 401)
      setAuthOpen(true);
  }
  function canReplace() {
    if (busy) {
      notify("처리 중인 작업이 끝난 뒤 이동해 주세요.");
      return false;
    }
    if (guestMode)
      return (
        !storageError ||
        confirm("자동 저장에 실패했어요. 저장하지 못한 작업을 바꿀까요?")
      );
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
    setReusePlan(null);
    setStatus("");
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
    setPendingSheets([]);
    setWorkId(guestMode ? crypto.randomUUID() : "");
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
  function repeatWorkspace(source: Workspace) {
    const { workspace, plan } = prepareRepeat(source);
    openWorkspace(workspace, "input");
    setReusePlan(plan);
  }
  async function repeatStored(item: Stored) {
    if (!canReplace()) return;
    setBusy(true);
    setError("");
    try {
      const data = guestMode
        ? await readBrowserWork(item.id)
        : await api("/works/" + item.id);
      repeatWorkspace(data.workspace);
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }
  async function loadSaved() {
    if (!guestMode && !user) {
      setReturnToSaved(true);
      setAuthOpen(true);
      return;
    }
    await fetchSaved();
  }
  async function fetchSaved(browser = guestMode) {
    setBusy(true);
    setError("");
    try {
      const [a, b] = await Promise.all([
        browser
          ? listBrowserWorks().then((items) =>
              items.map((item) => ({
                id: item.id,
                title: item.workspace.title,
                updated: item.updated,
                owned: 1,
                revision: item.revision,
                sharedCount: 0,
                originalCount: item.originals.length,
              })),
            )
          : api<Stored[]>("/works"),
        browser ? listBrowserTemplates() : api<Template[]>("/templates"),
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
    if (guestMode) {
      const sequence = ++saveSequence.current;
      setDirty(true);
      try {
        const id = asNew || !workId ? crypto.randomUUID() : workId;
        await persistBrowserWork(id);
        if (id !== workId) setWorkId(id);
        if (sequence === saveSequence.current) setDirty(false);
        setStorageError("");
        notify("데이터와 편집 내용을 이 브라우저에 저장했어요.");
        return id;
      } catch (error) {
        setStorageError((error as Error).message);
        return null;
      }
    }
    if (!user) {
      setAuthOpen(true);
      notify("로그인 후 저장을 다시 눌러 주세요. 현재 작성 내용은 유지돼요.");
      return null;
    }
    setBusy(true);
    setError("");
    try {
      // Upload browser formats only after the explicit account-save action.
      const workspace = structuredClone(w);
      for (const kind of ["pptx", "xlsx"] as const) {
        const localId = workspace.companyFormats?.[kind];
        const local = guestFormats.find((f) => f.meta.id === localId);
        if (!local) continue;
        const key = user.id + ":" + local.meta.id;
        let id = migratedFormats.current.get(key);
        if (!id) {
          const format = await api("/company-formats", "POST", local.input);
          id = format.id as string;
          migratedFormats.current.set(key, id);
        }
        workspace.companyFormats![kind] = id;
      }
      const data = await api("/works", "POST", {
        workspace,
        ...(!asNew && workId ? { id: workId, revision } : {}),
        ...(!workId || originals.length
          ? { originals: w.retainOriginals ? originals : [] }
          : {}),
      });
      setWorkId(data.id);
      setRevision(data.revision);
      const editedDuringSave = workspaceRef.current !== w;
      rawSetW((current) => (current === w ? workspace : current));
      setDirty(editedDuringSave);
      notify("작업과 편집 내용을 HRBIP에 저장했어요.");
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
      if (guestMode) {
        restoreBrowserWork(await readBrowserWork(item.id));
        return;
      }
      if (!item.owned) {
        await openShared(item.id);
        return;
      }
      const data = await api("/works/" + item.id);
      rawSetW(data.workspace);
      setPendingSheets([]);
      setReusePlan(null);
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
      next.companyFormats = data.companyFormats;
      next.report = data.report;
      next.exitInclusive = data.exitInclusive;
      next.sample = data.sample;
      rawSetW(next);
      setPendingSheets([]);
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
    if (!accountsEnabled) {
      setError(
        "계정 공유를 사용하지 않는 버전이에요. 이전 공유 링크의 자료는 공개하지 않습니다. 파일이나 샘플로 새 작업을 시작하세요.",
      );
      return;
    }
    if (!user) {
      setAuthOpen(true);
      setError("공유 자료는 지정된 계정으로 로그인해야 볼 수 있어요.");
    } else void openShared(id);
  }, [accountReady, user?.id, accountsEnabled]);
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
    // Downloads are transient. Only account-save persists the analysis online.
    await download(
      "/export/" + format,
      {
        workspace: w,
        companyFormat: guestFormats.find(
          (f) => f.meta.id === w.companyFormats?.[format as "pptx" | "xlsx"],
        )?.input,
      },
      w.title + "." + format,
    );
    notify(
      format.toUpperCase() +
        " 파일을 만들었어요." +
        (guestMode
          ? " 다운로드 폴더에서 확인하세요. 작업은 이 브라우저에 자동 저장돼요."
          : !user
            ? " 작업 목록에 남기려면 로그인 후 저장해 주세요."
            : " 온라인 보관은 ‘계정에 저장’을 눌러 주세요."),
    );
  }
  function createResult() {
    const r = aggregate(w);
    setW((v) => {
      if (!v.design.cards.length) v.design.cards = recommendedCards(r);
      if (!v.report.generated)
        v.report = {
          generated: draft(r),
          notes: v.report.notes,
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
      setGuestMode(true);
      setGuestRequests(true);
      migratedFormats.current.clear();
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
  const activeTool = supportTools.find((tool) => route === "tool:" + tool.id);
  if (!accountReady || (guestMode && !browserReady))
    return (
      <main className="panel" role="status">
        저장한 작업을 불러오는 중이에요…
      </main>
    );
  return (
    <GuestContext.Provider
      value={{
        enabled: guestMode,
        formats: guestFormats,
        setFormats: persistFormats,
        sheets: pendingSheets,
        setSheets: setPendingSheets,
      }}
    >
      <div className={"app-shell refreshed-site " + (route === "home" ? "home-page" : "work-page")}>
        <a
          className="skip-link"
          href="#main"
          onClick={(event) => {
            event.preventDefault();
            document.getElementById("main")?.focus();
            document.getElementById("main")?.scrollIntoView();
          }}
        >
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
          <SiteNavigation onStart={beginInput} onSample={showSamples} onSaved={loadSaved}
            onTool={id => navigate("tool:" + id)} onResult={view => openResult(view)} onRequest={() => setRequestOpen(true)} />
          <div className="account-nav">
            {user ? (
              <Button onClick={() => setAccountOpen(true)}>
                <span className="avatar">{user.username[0].toUpperCase()}</span>
                {user.username}
              </Button>
            ) : accountsEnabled ? (
              <Button onClick={() => setAuthOpen(true)}>
                <LogIn size={17} />
                로그인
              </Button>
            ) : (
              <span className="muted">가입 없이 바로 사용</span>
            )}
          </div>
        </header>
        <div className="workspace">
          <main id="main" tabIndex={-1}>
            {route !== "home" && <div className="breadcrumb">
              워크스페이스 <ChevronRight size={13} />{" "}
              {route === "home"
                ? "모든 도구"
                : route === "saved"
                  ? "저장한 작업"
                  : activeTool
                    ? activeTool.title
                    : shared
                      ? "공유 보고서"
                      : "인사현황 보고서·대시보드"}
            </div>}
            {route !== "home" && guestMode && !activeTool ? (
              <Notice>
                로그인 없이 내 파일 또는 샘플로 시작하세요. 작업과 회사 양식은
                이 브라우저에 자동 저장돼요. 새로고침하거나 다시 방문해도
                ‘저장한 작업’에서 이어갈 수 있어요. 다른 기기·브라우저에는
                동기화되지 않으며, 브라우저 데이터를 지우면 삭제돼요.
                {accountsEnabled &&
                  " 로그인 후 ‘계정에 저장’을 누르면 온라인에도 보관할 수 있어요. 기존 작업을 자동 업로드하지 않아요."}
              </Notice>
            ) : (
              route !== "home" &&
              publicDemo &&
              !guestMode &&
              !activeTool && (
                <Notice>
                  포트폴리오 체험용 공개 버전이에요. 가상 데이터로 이용해
                  주세요. 저장한 작업은 온라인 HRBIP 저장소에 보관되며, 내
                  컴퓨터에서 만든 계정·작업과는 별개예요. 실제 인사자료를 위한
                  보안·운영 검증은 아직 완료하지 않았어요.
                </Notice>
              )
            )}
            {storageError && (
              <Notice tone="error">
                {storageError}
                <Button onClick={() => save()}>저장 다시 시도</Button>
                <Button onClick={() => save(true)}>사본 저장</Button>
              </Notice>
            )}
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
            {route === "home" && <HomePage onStart={beginInput} onSample={showSamples}
              onResult={openResult} onTool={id => navigate("tool:" + id)} />}
            {activeTool && (
              <SupportToolPage
                key={activeTool.id}
                id={activeTool.id}
                onHome={() => navigate("home")}
              />
            )}
            {route === "input" && (
              <DataInput
                w={w}
                setW={setW}
                originals={originals}
                setOriginals={setOriginals}
                repeating={!!reusePlan}
                onNext={() => navigate(reusePlan ? "repeat" : "verify")}
                onSample={() => start(true, "verify")}
                onSampleList={() => setSampleListOpen(true)}
              />
            )}
            {route === "repeat" && reusePlan && (
              <RepeatReview
                w={w}
                plan={reusePlan}
                setW={setW}
                onNext={() => navigate("verify")}
                onBack={() => navigate("input")}
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
              <>
                {!shared && (
                  <div className="save-state" role="status">
                    <strong>
                      {guestMode
                        ? storageError
                          ? "자동 저장에 실패했어요"
                          : dirty
                            ? "변경사항을 저장하고 있어요…"
                            : "이 브라우저에 자동 저장했어요"
                        : workId
                          ? dirty
                            ? "저장 후 변경사항이 있어요"
                            : "저장한 작업이에요"
                          : "아직 저장하지 않은 작업이에요"}
                    </strong>
                    <span>
                      {guestMode
                        ? "‘저장한 작업’에서 다시 열 수 있어요. 다른 기기에서 보관하려면 결과를 파일로 내려받으세요."
                        : workId && !dirty
                          ? "워크스페이스의 ‘저장한 작업’에서 다시 열 수 있어요."
                          : !user
                            ? "로그인 후 저장하면 다음 방문에도 이어서 볼 수 있어요. 파일 다운로드만으로는 작업 목록에 남지 않아요."
                            : "보고서의 저장 버튼으로 현재 데이터와 편집 내용을 작업 목록에 남겨주세요."}
                    </span>
                  </div>
                )}
                <Results
                  entry={resultEntry}
                  loggedIn={!!user}
                  accountsEnabled={accountsEnabled}
                  onLogin={() => setAuthOpen(true)}
                  sharedId={shared ? sharedId : undefined}
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
                  onRepeat={() => {
                    if (canReplace()) repeatWorkspace(w);
                  }}
                  onTemplate={() => {
                    if (!guestMode && !user) {
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
              </>
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
                {user && (
                  <Notice>
                    계정에 저장한 작업은 다른 기기에서도 다시 열 수 있어요. 기존
                    브라우저 작업은 자동 업로드하지 않아요.
                    <Button
                      onClick={async () => {
                        try {
                          setBrowserImport(await listBrowserWorks());
                        } catch (e) {
                          handleError(e);
                        }
                      }}
                    >
                      이 브라우저의 작업 가져오기
                    </Button>
                  </Notice>
                )}
                {!user && accountsEnabled && (
                  <Notice>
                    아래 목록은 이 브라우저에 저장한 작업이에요. 온라인 작업
                    목록은 로그인 후 확인할 수 있어요.
                    <Button
                      onClick={() => {
                        setReturnToSaved(true);
                        setAuthOpen(true);
                      }}
                    >
                      로그인하고 계정 작업 보기
                    </Button>
                  </Notice>
                )}
                <section className="panel">
                  <div className="section-heading">
                    <h2>
                      {guestMode
                        ? "이 브라우저에 저장한 작업"
                        : "저장한 작업·공유받은 보고서"}
                    </h2>
                    <span className="tag">{stored.length}</span>
                  </div>
                  {!stored.length ? (
                    <div className="empty-state">
                      <FolderOpen size={35} />
                      <h3>아직 저장한 작업이 없어요.</h3>
                      <p>
                        보고서를 만든 뒤 저장하면 이곳에서 다시 열 수 있어요.
                      </p>
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
                                onClick={() => repeatStored(item)}
                                busy={busy}
                              >
                                새 자료로 반복 보고
                              </Button>
                            )}
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
                                    if (guestMode)
                                      await deleteBrowserWork(item.id);
                                    else
                                      await api(
                                        "/works/" + item.id,
                                        "DELETE",
                                        {},
                                      );
                                    if (workId === item.id) {
                                      setWorkId("");
                                      setRevision(0);
                                      if (guestMode) {
                                        rawSetW(emptyWorkspace());
                                        setPendingSheets([]);
                                        setOriginals([]);
                                        setReusePlan(null);
                                        setDirty(false);
                                      }
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
                                    if (guestMode)
                                      await deleteBrowserTemplate(t.id);
                                    else
                                      await api(
                                        "/templates/" + t.id,
                                        "DELETE",
                                        {},
                                      );
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
                  {guestMode
                    ? "저장 위치: 지금 사용하는 브라우저의 IndexedDB. 이 사이트에 다시 방문하면 복원돼요. 목록에서 작업을 삭제할 수 있고, 브라우저 데이터를 지우면 이곳의 작업과 양식도 삭제돼요. 다른 기기와 자동 동기화되지 않아요."
                    : publicDemo
                      ? "저장 위치: HRBIP의 온라인 데이터베이스(Supabase). 로그인한 계정으로 다른 기기에서도 다시 열 수 있어요. 작업을 삭제하면 분석 자료·보관 원본·공유 권한도 삭제돼요."
                      : "저장 위치: 이 프로젝트의 .data 폴더. 작업을 삭제하면 분석 자료·원본·공유 권한도 삭제돼요."}
                  별도로 내려받은 출력 파일은 직접 삭제하세요.
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
        {accountsEnabled && authOpen && (
          <AuthModal
            onClose={() => {
              setAuthOpen(false);
              setReturnToSaved(false);
            }}
            onSuccess={(u) => {
              setUser(u);
              setGuestMode(false);
              setGuestRequests(false);
              if (guestMode) {
                setWorkId("");
                setRevision(0);
                setDirty(!!w.datasets.length);
              }
              setAuthOpen(false);
              notify("로그인했어요. 작성 중인 내용은 그대로 유지돼요.");
              if (returnToSaved) {
                setReturnToSaved(false);
                void fetchSaved(false);
              }
            }}
          />
        )}
        {browserImport && (
          <Modal
            title="브라우저 작업 가져오기"
            onClose={() => setBrowserImport(null)}
          >
            <p>
              작업을 열어 확인한 뒤 ‘계정에 저장’을 눌러 온라인에 보관하세요.
              선택만으로 업로드하지 않아요.
            </p>
            {!browserImport.length && (
              <p>이 브라우저에 저장한 작업이 없어요.</p>
            )}
            <div className="stack">
              {browserImport.map((saved) => (
                <Button
                  key={saved.id}
                  onClick={() => {
                    if (!canReplace()) return;
                    restoreBrowserWork(saved);
                    setWorkId("");
                    setRevision(0);
                    setDirty(true);
                    setBrowserImport(null);
                  }}
                >
                  {saved.workspace.title}
                </Button>
              ))}
            </div>
          </Modal>
        )}
        {!guestMode && accountOpen && user && (
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
              현재 접속한 HRBIP 서버의 계정이에요. 비밀번호는 해시로 보관하고
              로그인 세션은 12시간 유지돼요. 이메일 인증·비밀번호 찾기는
              제공하지 않으니 비밀번호를 안전하게 보관해 주세요.
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
                  2024년 10월~2026년 9월 · 최종 재직 150명 · 전체 이력 180명 ·
                  7개 부서
                </p>
                <p className="small">
                  인원·입퇴사, 근무·휴가, 제공 인건비를 함께 살펴보세요. 원본의
                  이름·생년월일은 샘플에 포함하지 않았어요.
                </p>
                <Notice>
                  이 파일의 기준대로 퇴사일은 제외해요. 부서 필터는 최종 관측
                  소속 기준이며 과거 부서 이동 분석은 포함하지 않아요.
                </Notice>
                <Button
                  variant="primary"
                  busy={busy}
                  onClick={startLargeSample}
                >
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
              직원 데이터·집계 수치·보고 문장은 저장하지 않아요. 새 자료를
              적용할 때 다시 연결하고 검증해요.
            </Notice>
            <Button
              variant="primary"
              disabled={!templateTitle.trim()}
              onClick={async () => {
                try {
                  if (guestMode)
                    await writeBrowserTemplate({
                      id: crypto.randomUUID(),
                      title: templateTitle.trim(),
                      design: w.design,
                    });
                  else
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
        {!guestMode && shareOpen && (
          <Modal
            title="지정 계정에 공유"
            onClose={() => setShareOpen(false)}
            wide
          >
            <Notice>
              이 서버에 가입한 계정 ID를 추가하세요. 공유받은 사람은 조회·필터
              탐색·집계 파일 출력만 할 수 있어요. 직원별 행과 원본 파일은
              공유하지 않아요.
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
              {publicDemo
                ? "이 주소에서 가입한 계정에 공유할 수 있어요. "
                : "내 컴퓨터의 로컬 주소는 다른 컴퓨터에서 열 수 없어요. "}
              링크가 있어도 지정 계정으로 로그인하지 않으면 볼 수 없어요.
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
    </GuestContext.Provider>
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
      <p>
        로그인하면 ‘계정에 저장’을 눌러 작업·보고서·템플릿을 온라인에 보관하고
        다른 기기에서도 다시 열 수 있어요. 브라우저의 기존 작업은 자동으로
        업로드하지 않아요.
      </p>
      <p className="small">
        아이디와 비밀번호 해시를 계정 인증에 사용해요. 저장을 선택한 분석 자료와
        회사 양식은 계정별로 보관해요. 포트폴리오 체험에는 가상 자료를 사용해
        주세요.
      </p>
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
  return <Modal title="문의·기능 제안" onClose={onClose}>
    <p>궁금한 점이나 필요한 기능을 이곳에 바로 남겨주세요.</p>
    <InquiryForm />
  </Modal>;
}