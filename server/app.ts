import express, { type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  workspaceSchema,
  filtersSchema,
  designSchema,
  type Workspace,
} from "../shared/model";
import { aggregate, draft, effectiveCards } from "../shared/analytics";
import {
  currentUser,
  hashPassword,
  verifyPassword,
  startSession,
  endSession,
} from "./auth";
import { exportFile } from "./export";

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const credentials = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9_.-]{2,31}$/),
  password: z.string().min(10).max(128),
});
const originalSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(200),
  data: z.string().max(14000000),
});
function cleanWorkspace(w: Workspace): Workspace {
  // Persist only explicitly mapped columns. Names/contact numbers in unrelated columns are removed.
  return {
    ...w,
    datasets: w.datasets.map((d) => {
      const allowed = new Set(Object.values(d.mapping).filter(Boolean));
      return {
        ...d,
        headers: d.headers.filter((h) => allowed.has(h)),
        rows: d.rows.map((r) =>
          Object.fromEntries(Object.entries(r).filter(([k]) => allowed.has(k))),
        ),
      };
    }),
  };
}
export function createApp(
  db: DatabaseSync,
  options: { origin?: string; production?: boolean } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: options.production
        ? {
            directives: {
              "default-src": ["'self'"],
              "script-src": ["'self'"],
              "style-src": ["'self'", "'unsafe-inline'"],
              "img-src": ["'self'", "data:", "blob:"],
              "font-src": ["'self'", "data:"],
              "connect-src": ["'self'"],
              "object-src": ["'none'"],
              "frame-ancestors": ["'none'"],
              "upgrade-insecure-requests": null,
            },
          }
        : false,
    }),
  );
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: "요청이 많습니다. 1분 뒤 다시 시도하세요." },
    }),
  );
  app.use(express.json({ limit: "40mb" }));
  app.use(cookieParser());
  app.use("/api", (req, _res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      const origin = req.get("origin");
      const expected =
        options.origin || process.env.APP_ORIGIN || "http://127.0.0.1:4173";
      if (
        origin &&
        origin !== expected &&
        !(
          expected === "http://127.0.0.1:4173" &&
          origin === "http://localhost:4173"
        )
      )
        return next(
          new HttpError(403, "다른 사이트에서 보낸 요청을 차단했습니다."),
        );
      if (!req.is("application/json"))
        return next(new HttpError(415, "JSON 형식으로 요청해 주세요."));
    }
    next();
  });
  const auth = (req: Request) => {
    const u = currentUser(db, req);
    if (!u)
      throw new HttpError(
        401,
        "로그인이 만료되었거나 필요합니다. 작성 내용은 화면에 유지됩니다. 다시 로그인하세요.",
      );
    return u;
  };
  const getWork = (req: Request, id: string, ownerOnly = false) => {
    const u = auth(req),
      row = db.prepare("SELECT * FROM works WHERE id=?").get(id);
    if (!row) throw new HttpError(404, "작업이 없거나 삭제되었습니다.");
    const owner = row.owner === u.id,
      shared = db
        .prepare("SELECT 1 FROM shares WHERE work_id=? AND user_id=?")
        .get(id, u.id);
    if (!owner && (ownerOnly || !shared))
      throw new HttpError(
        403,
        "이 작업을 볼 권한이 없습니다. 소유자에게 계정 ID를 알려주세요.",
      );
    return {
      row,
      owner,
      u,
      w: workspaceSchema.parse(JSON.parse(String(row.payload))),
    };
  };
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, reportProvider: "rules", storage: "local" }),
  );
  app.get("/api/me", (req, res) => res.json({ user: currentUser(db, req) }));
  const authLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "로그인 시도가 많습니다. 잠시 후 다시 시도하세요." },
  });
  app.post("/api/auth/register", authLimit, async (req, res) => {
    const body = credentials.parse(req.body);
    if (db.prepare("SELECT 1 FROM users WHERE username=?").get(body.username))
      throw new HttpError(409, "이미 사용 중인 아이디입니다.");
    const user = { id: randomUUID(), username: body.username },
      password = await hashPassword(body.password);
    db.prepare(
      "INSERT INTO users(id,username,password,created) VALUES(?,?,?,?)",
    ).run(user.id, user.username, password, new Date().toISOString());
    startSession(db, user.id, req, res);
    res.status(201).json({ user });
  });
  app.post("/api/auth/login", authLimit, async (req, res) => {
    const body = credentials.parse(req.body),
      row = db
        .prepare("SELECT * FROM users WHERE username=?")
        .get(body.username);
    const stored = row?.password
      ? String(row.password)
      : "00000000000000000000000000000000:" + "0".repeat(128);
    const matches = await verifyPassword(body.password, stored);
    if (!row || !matches)
      throw new HttpError(401, "아이디 또는 비밀번호를 확인하세요.");
    const user = { id: String(row.id), username: String(row.username) };
    startSession(db, user.id, req, res);
    res.json({ user });
  });
  app.post("/api/auth/logout", (req, res) => {
    endSession(db, req, res);
    res.json({ ok: true });
  });
  app.get("/api/works", (req, res) => {
    const u = auth(req);
    res.json(
      db
        .prepare(
          `SELECT w.id,w.title,w.updated,w.revision,w.owner=? AS owned,
   (SELECT COUNT(*) FROM shares WHERE work_id=w.id) AS sharedCount,
   (SELECT COUNT(*) FROM originals WHERE work_id=w.id) AS originalCount
   FROM works w WHERE w.owner=? OR EXISTS(SELECT 1 FROM shares s WHERE s.work_id=w.id AND s.user_id=?) ORDER BY w.updated DESC`,
        )
        .all(u.id, u.id, u.id),
    );
  });
  app.get("/api/works/:id", (req, res) => {
    const { row, w, owner } = getWork(req, String(req.params.id));
    if (!owner) {
      res.json({
        id: row.id,
        revision: row.revision,
        owner: false,
        title: w.title,
        filters: w.filters,
        design: w.design,
        report: w.report,
      });
      return;
    }
    const originals = db
      .prepare(
        "SELECT id,name,length(data) AS size FROM originals WHERE work_id=?",
      )
      .all(String(row.id));
    res.json({
      id: row.id,
      revision: row.revision,
      owner: true,
      workspace: w,
      originals,
    });
  });
  app.post("/api/works", async (req, res) => {
    const u = auth(req),
      body = z
        .object({
          workspace: workspaceSchema,
          id: z.string().optional(),
          revision: z.number().int().optional(),
          originals: z.array(originalSchema).max(24).optional(),
        })
        .parse(req.body);
    const w = cleanWorkspace(body.workspace);
    if (w.datasets.reduce((n, d) => n + d.rows.length, 0) > 30000)
      throw new HttpError(413, "전체 30,000행까지 저장할 수 있습니다.");
    const existing = body.id ? getWork(req, body.id, true) : null;
    if (existing && body.revision !== Number(existing.row.revision))
      throw new HttpError(
        409,
        "다른 화면에서 이 작업이 변경되었습니다. 현재 내용을 새 작업으로 저장하거나 다시 열어 주세요.",
      );
    const id = body.id || randomUUID(),
      revision = existing ? Number(existing.row.revision) + 1 : 1,
      updated = new Date().toISOString();
    const originals = (body.originals || []).map((o) => ({
      ...o,
      buffer: Buffer.from(o.data, "base64"),
    }));
    if (
      originals.some((o) => o.buffer.length > 10 * 1024 * 1024) ||
      originals.reduce((n, o) => n + o.buffer.length, 0) > 20 * 1024 * 1024
    )
      throw new HttpError(413, "원본은 파일당 10MB, 합계 20MB까지 보관합니다.");
    db.exec("BEGIN");
    try {
      db.prepare(
        "INSERT INTO works(id,owner,title,payload,updated,revision) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,payload=excluded.payload,updated=excluded.updated,revision=excluded.revision",
      ).run(id, u.id, w.title, JSON.stringify(w), updated, revision);
      if (!w.retainOriginals)
        db.prepare("DELETE FROM originals WHERE work_id=?").run(id);
      else if (body.originals !== undefined) {
        db.prepare("DELETE FROM originals WHERE work_id=?").run(id);
        for (const o of originals)
          db.prepare(
            "INSERT INTO originals(id,work_id,name,data) VALUES(?,?,?,?)",
          ).run(o.id, id, o.name, o.buffer);
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    res.json({ id, revision, updated });
  });
  app.delete("/api/works/:id", (req, res) => {
    const { row } = getWork(req, String(req.params.id), true);
    db.prepare("DELETE FROM works WHERE id=?").run(String(row.id));
    res.json({ ok: true });
  });
  app.get("/api/works/:id/originals/:originalId", (req, res) => {
    getWork(req, String(req.params.id), true);
    const row = db
      .prepare("SELECT name,data FROM originals WHERE work_id=? AND id=?")
      .get(String(req.params.id), String(req.params.originalId));
    if (!row) throw new HttpError(404, "보관된 원본이 없습니다.");
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      "attachment; filename*=UTF-8''" + encodeURIComponent(String(row.name)),
    );
    res.send(Buffer.from(row.data as Uint8Array));
  });
  app.post("/api/works/:id/view", (req, res) => {
    const { w, owner } = getWork(req, String(req.params.id));
    const filters = filtersSchema.parse(req.body.filters || w.filters);
    w.filters = filters;
    const result = aggregate(w);
    const report =
      w.report.basisKey === result.key
        ? w.report
        : {
            generated: draft(result),
            notes: "",
            basisKey: result.key,
            reviewedKey: result.key,
          };
    // No row-level data or validation row identifiers cross the sharing boundary.
    res.json({
      result: { ...result, issues: [] },
      title: w.title,
      exitInclusive: w.exitInclusive,
      sample: w.sample,
      design: { ...w.design, cards: effectiveCards(w, result) },
      report,
      owner,
    });
  });
  app.get("/api/works/:id/shares", (req, res) => {
    getWork(req, String(req.params.id), true);
    res.json(
      db
        .prepare(
          "SELECT u.id,u.username FROM shares s JOIN users u ON u.id=s.user_id WHERE s.work_id=?",
        )
        .all(String(req.params.id)),
    );
  });
  app.post("/api/works/:id/shares", (req, res) => {
    const { u, w } = getWork(req, String(req.params.id), true),
      target = z.object({ userId: z.string().uuid() }).parse(req.body).userId;
    const result = aggregate(w);
    if (w.report.basisKey !== result.key || w.report.reviewedKey !== result.key)
      throw new HttpError(422, "현재 보고서를 최종 확인한 뒤 공유 대상을 추가하세요.");
    if (target === u.id) throw new HttpError(400, "본인은 이미 소유자입니다.");
    if (!db.prepare("SELECT 1 FROM users WHERE id=?").get(target))
      throw new HttpError(
        404,
        "가입된 계정 ID를 찾지 못했습니다. 상대방의 내 계정에서 ID를 확인하세요.",
      );
    db.prepare("INSERT OR IGNORE INTO shares(work_id,user_id) VALUES(?,?)").run(
      String(req.params.id),
      target,
    );
    res.json({ ok: true });
  });
  app.delete("/api/works/:id/shares/:userId", (req, res) => {
    getWork(req, String(req.params.id), true);
    db.prepare("DELETE FROM shares WHERE work_id=? AND user_id=?").run(
      String(req.params.id),
      String(req.params.userId),
    );
    res.json({ ok: true });
  });
  app.get("/api/templates", (req, res) => {
    const u = auth(req);
    res.json(
      db
        .prepare(
          "SELECT id,title,payload,created FROM templates WHERE owner=? ORDER BY created DESC",
        )
        .all(u.id)
        .map((r) => ({
          ...r,
          design: JSON.parse(String(r.payload)),
          payload: undefined,
        })),
    );
  });
  app.post("/api/templates", (req, res) => {
    const u = auth(req),
      body = z
        .object({
          title: z.string().trim().min(1).max(160),
          design: designSchema,
        })
        .parse(req.body),
      id = randomUUID();
    db.prepare("INSERT INTO templates VALUES(?,?,?,?,?)").run(
      id,
      u.id,
      body.title,
      JSON.stringify(body.design),
      new Date().toISOString(),
    );
    res.json({ id });
  });
  app.delete("/api/templates/:id", (req, res) => {
    const u = auth(req);
    const result = db
      .prepare("DELETE FROM templates WHERE id=? AND owner=?")
      .run(String(req.params.id), u.id);
    if (!result.changes)
      throw new HttpError(404, "템플릿이 없거나 접근 권한이 없습니다.");
    res.json({ ok: true });
  });
  app.post(
    "/api/requests",
    rateLimit({
      windowMs: 3600000,
      limit: 20,
      message: { error: "기능 요청이 많습니다. 잠시 후 다시 시도해 주세요." },
    }),
    (req, res) => {
      const body = z
        .object({ message: z.string().trim().min(5).max(2000) })
        .parse(req.body);
      const id = randomUUID();
      db.prepare("INSERT INTO requests VALUES(?,?,?)").run(
        id,
        body.message,
        new Date().toISOString(),
      );
      res
        .status(201)
        .json({
          id,
          message: "이 PC의 요청함에 저장했습니다. 외부로 전송하지 않았습니다.",
        });
    },
  );
  const exportLimit = rateLimit({
    windowMs: 60000,
    limit: 20,
    message: { error: "출력이 많습니다. 1분 뒤 다시 시도해 주세요." },
  });
  let activeExports = 0;
  const sendExport = async (res: Response, format: string, w: Workspace) => {
    if (activeExports >= 2)
      throw new HttpError(
        429,
        "다른 출력 작업이 진행 중입니다. 잠시 후 다시 시도하세요.",
      );
    activeExports++;
    try {
      if (!["pdf", "pptx", "xlsx"].includes(format))
        throw new HttpError(400, "PDF·PPTX·Excel 중에서 선택하세요.");
      const r = aggregate(w);
      if (!Object.values(r.available).some(Boolean))
        throw new HttpError(
          422,
          "계산 가능한 자료가 없습니다. 데이터 확인으로 돌아가 주세요.",
        );
      if (w.report.basisKey !== r.key || w.report.reviewedKey !== r.key)
        throw new HttpError(
          422,
          "현재 수치와 보고 문장을 최종 확인한 뒤 내보내 주세요.",
        );
      const file = await exportFile(format, w, r);
      res.type(
        format === "pdf"
          ? "application/pdf"
          : format === "xlsx"
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      );
      res.setHeader(
        "Content-Disposition",
        "attachment; filename*=UTF-8''" +
          encodeURIComponent(w.title + "." + format),
      );
      res.send(file);
    } finally {
      activeExports--;
    }
  };
  app.post("/api/export/:format", exportLimit, async (req, res) => {
    const w = workspaceSchema.parse(req.body.workspace);
    await sendExport(res, String(req.params.format), w);
  });
  app.post("/api/works/:id/export/:format", exportLimit, async (req, res) => {
    const { w, owner } = getWork(req, String(req.params.id));
    if (req.body.filters) w.filters = filtersSchema.parse(req.body.filters);
    const result = aggregate(w);
    if (!owner && w.report.basisKey !== result.key)
      w.report = {
        generated: draft(result),
        notes: "",
        basisKey: result.key,
        reviewedKey: result.key,
      };
    await sendExport(res, String(req.params.format), w);
  });
  app.use("/api", (_req, _res, next) =>
    next(new HttpError(404, "요청한 기능을 찾지 못했습니다.")),
  );
  app.use(
    (
      err: unknown,
      _req: Request,
      res: Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof z.ZodError) {
        res
          .status(400)
          .json({
            error:
              "입력 형식이 올바르지 않습니다. 필수 항목과 입력 길이를 확인하세요.",
            details: err.issues
              .slice(0, 6)
              .map((i) => ({ path: i.path.join("."), message: i.message })),
          });
        return;
      }
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      if (err instanceof SyntaxError) {
        res
          .status(400)
          .json({ error: "요청 내용을 읽지 못했습니다. 다시 시도하세요." });
        return;
      }
      const error = err as { status?: number; message?: string };
      if (error.status === 413) {
        res
          .status(413)
          .json({ error: "저장할 데이터가 용량 제한을 초과했습니다." });
        return;
      }
      // Do not log submitted HR rows, request bodies, passwords or session tokens.
      res
        .status(500)
        .json({
          error:
            "작업을 완료하지 못했습니다. 입력 기준·최종 확인 또는 서버 실행 상태를 확인한 뒤 다시 시도하세요.",
        });
    },
  );
  return app;
}
