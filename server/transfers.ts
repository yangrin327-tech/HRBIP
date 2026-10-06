import type { Express, Request } from "express";
import { createHash, randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { z } from "zod";
import type { Store } from "./database.js";

const CHUNK = 1024 * 1024;
const MAX_BODY = 40 * CHUNK;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const subject = (req: Request) =>
  hash(req.cookies?.hrbip_session || "anonymous");
const allowed =
  /^\/api\/(works|company-formats(?:\/inspect)?|verification(?:\/download)?|export\/(?:pdf|pptx|xlsx))$/;
export class TransferError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, error: string) =>
  new TransferError(status, error);

/** Temporary request bodies, never a public file store. Endpoint + session bound, single-use. */
export function installTransfers(app: Express, db: Store) {
  app.post("/api/transfers", async (req, res) => {
    const body = z
      .object({
        path: z.string().regex(allowed),
        bytes: z.number().int().min(1).max(MAX_BODY),
      })
      .parse(req.body);
    const token = randomBytes(32).toString("hex");
    await db.transaction(async () => {
      await db
        .prepare("DELETE FROM transfers WHERE expires<=?")
        .run(Date.now());
      const used = await db
        .prepare("SELECT COALESCE(SUM(bytes),0) AS total FROM transfers")
        .get();
      if (Number(used?.total) + body.bytes > 160 * CHUNK)
        throw fail(
          429,
          "큰 파일 전송이 진행 중입니다. 잠시 후 다시 시도하세요.",
        );
      await db
        .prepare(
          "INSERT INTO transfers(id,subject,path,bytes,expires,claimed) VALUES(?,?,?,?,?,0)",
        )
        .run(
          hash(token),
          subject(req),
          body.path,
          body.bytes,
          Date.now() + 10 * 60000,
        );
    });
    res.json({ token, chunkSize: CHUNK });
  });
  const lookup = async (req: Request) => {
    const token = req.get("x-hrbip-upload") || "";
    if (!/^[a-f0-9]{64}$/.test(token))
      throw fail(400, "파일 전송 정보가 올바르지 않습니다.");
    const row = await db
      .prepare(
        "SELECT * FROM transfers WHERE id=? AND subject=? AND expires>? AND claimed=0",
      )
      .get(hash(token), subject(req), Date.now());
    if (!row)
      throw fail(
        410,
        "파일 전송이 만료되었거나 로그인 상태가 변경되었습니다. 다시 시도하세요.",
      );
    return row;
  };
  app.post("/api/transfers/part", async (req, res) => {
    const body = z
      .object({
        index: z.number().int().min(0).max(39),
        data: z
          .string()
          .max(Math.ceil(CHUNK / 3) * 4)
          .regex(/^[A-Za-z0-9+/]*={0,2}$/),
      })
      .parse(req.body);
    const row = await lookup(req),
      data = Buffer.from(body.data, "base64");
    const expected = Math.min(CHUNK, Number(row.bytes) - body.index * CHUNK);
    if (expected <= 0 || data.length !== expected)
      throw fail(400, "파일 조각의 크기가 맞지 않습니다. 다시 업로드하세요.");
    await db
      .prepare(
        "INSERT INTO transfer_parts(transfer_id,part,data) VALUES(?,?,?) ON CONFLICT(transfer_id,part) DO UPDATE SET data=excluded.data",
      )
      .run(String(row.id), body.index, data);
    res.json({ ok: true });
  });
  app.delete("/api/transfers", async (req, res) => {
    const row = await lookup(req);
    await db.prepare("DELETE FROM transfers WHERE id=?").run(String(row.id));
    res.json({ ok: true });
  });
  // Runs after normal JSON, cookie, origin and rate-limit middleware. Route handlers still enforce ACL.
  app.use("/api", async (req, _res, next) => {
    if (!req.get("x-hrbip-upload")) return next();
    const path = req.originalUrl.split("?")[0];
    const data = await db.transaction(async () => {
      const row = await lookup(req);
      if (req.method !== "POST" || row.path !== path)
        throw fail(403, "이 요청에 사용할 수 없는 파일 전송입니다.");
      const claim = await db
        .prepare("UPDATE transfers SET claimed=1 WHERE id=? AND claimed=0")
        .run(String(row.id));
      if (!claim.changes) throw fail(409, "이미 처리 중인 파일 전송입니다.");
      const parts = await db
        .prepare(
          "SELECT part,data FROM transfer_parts WHERE transfer_id=? ORDER BY part",
        )
        .all(String(row.id));
      if (
        parts.length !== Math.ceil(Number(row.bytes) / CHUNK) ||
        parts.some((p, i) => Number(p.part) !== i)
      )
        throw fail(400, "파일 전송이 완료되지 않았습니다. 다시 시도하세요.");
      const joined = Buffer.concat(
        parts.map((p) => Buffer.from(p.data as Uint8Array)),
      );
      if (joined.length !== Number(row.bytes))
        throw fail(400, "전송한 파일 크기가 일치하지 않습니다.");
      await db.prepare("DELETE FROM transfers WHERE id=?").run(String(row.id));
      return joined;
    });
    try {
      req.body = JSON.parse(data.toString("utf8"));
    } catch {
      throw fail(400, "전송한 자료를 읽지 못했습니다. 다시 시도하세요.");
    }
    next();
  });
}

/** Stream large authorized responses instead of Vercel's buffered 4.5 MB response path. */
export function streamLargeResponses(app: Express) {
  app.use("/api", (_req, res, next) => {
    const send = res.send.bind(res);
    res.send = ((body: unknown) => {
      if (typeof body !== "string" && !Buffer.isBuffer(body)) return send(body);
      const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body);
      if (buffer.length < 3 * CHUNK) return send(body);
      if (!res.getHeader("Content-Type"))
        res.type(Buffer.isBuffer(body) ? "application/octet-stream" : "html");
      res.removeHeader("Content-Length");
      res.flushHeaders();
      function* chunks() {
        for (let offset = 0; offset < buffer.length; offset += 64 * 1024)
          yield buffer.subarray(offset, offset + 64 * 1024);
      }
      const stream = Readable.from(chunks());
      stream.on("error", () => res.destroy());
      res.on("close", () => stream.destroy());
      stream.pipe(res);
      return res;
    }) as typeof res.send;
    next();
  });
}
