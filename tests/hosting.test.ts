import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { createApp } from "../server/app";
import { openStore } from "../server/store";
import { postgresSql, sqliteStore, type Store } from "../server/database";
import { sampleWorkspace } from "../shared/sample";
import { aggregate, draft } from "../shared/analytics";
import { serverConfig } from "../server/config";

test("SQLite async transactions isolate requests and roll back failed writes", async () => {
  const raw = openStore(":memory:"),
    db = sqliteStore(raw);
  const first = db.transaction(async () => {
    await db
      .prepare("INSERT INTO requests VALUES(?,?,?)")
      .run("first", "one", "now");
    await new Promise((resolve) => setTimeout(resolve, 20));
    throw new Error("rollback");
  });
  const second = db
    .prepare("INSERT INTO requests VALUES(?,?,?)")
    .run("second", "two", "now");
  await assert.rejects(first, /rollback/);
  await second;
  assert.deepEqual(
    (await db.prepare("SELECT id FROM requests").all()).map((r) => r.id),
    ["second"],
  );
  await db.close();
});

test("hosted config requires remote storage on Vercel", () => {
  assert.throws(
    () => serverConfig({ VERCEL: "1", DATA_DIR: "/tmp" }),
    /DATABASE_URL/,
  );
  assert.equal(
    serverConfig({
      PUBLIC_DEMO: "true",
      APP_ORIGIN: "https://hrbip.example",
      COOKIE_SECURE: "true",
      DATABASE_URL: "postgres://not-a-real-connection",
    }).publicDemo,
    true,
  );
});

// Real PostgreSQL engine via WASM validates SQL/types/RLS. Remote pooler/TLS require a live deployment.
test("PostgreSQL schema and API: accounts, BYTEA originals, shares, revocation, revisions and templates", async () => {
  const pg = new PGlite();
  await pg.exec(readFileSync("server/migrations/001-postgres.sql", "utf8"));
  await pg.exec(readFileSync("server/migrations/002-transfers.sql", "utf8"));
  const context = new AsyncLocalStorage<Transaction>();
  const query = (sql: string, values: unknown[]) =>
    (context.getStore() || pg).query(postgresSql(sql), values);
  const db: Store = {
    prepare: (sql) => ({
      get: async (...v) => (await query(sql, v)).rows[0] as never,
      all: async (...v) => (await query(sql, v)).rows as never,
      run: async (...v) => ({
        changes: (await query(sql, v)).affectedRows || 0,
      }),
    }),
    transaction: (fn) => pg.transaction((tx) => context.run(tx, fn)),
    close: () => pg.close(),
  };
  const server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  const request = (path: string, method = "GET", body?: unknown, cookie = "") =>
    fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: method === "GET" ? undefined : JSON.stringify(body || {}),
    });
  try {
    const account = async (username: string) => {
      const r = await request("/auth/register", "POST", {
        username,
        password: "only-for-isolated-tests",
      });
      assert.equal(r.status, 201);
      return {
        cookie: r.headers.getSetCookie().at(-1)!.split(";")[0],
        user: (await r.json()).user,
      };
    };
    const a = await account("owner"),
      b = await account("viewer"),
      c = await account("outsider");
    const w = sampleWorkspace(),
      result = aggregate(w);
    w.report = {
      generated: draft(result),
      notes: "Test",
      basisKey: result.key,
      reviewedKey: result.key,
    };
    w.retainOriginals = true;
    const saved = await request(
      "/works",
      "POST",
      {
        workspace: w,
        originals: [
          {
            id: "one",
            name: "test.csv",
            data: Buffer.from("synthetic").toString("base64"),
          },
        ],
      },
      a.cookie,
    );
    assert.equal(saved.status, 200);
    const { id, revision } = await saved.json();
    const list = await (
      await request("/works", "GET", undefined, a.cookie)
    ).json();
    assert.equal(list[0].originalCount, 1);
    assert.equal(list[0].sharedCount, 0);
    assert.equal(list[0].owned, true);
    assert.equal(
      await (
        await request(`/works/${id}/originals/one`, "GET", undefined, a.cookie)
      ).text(),
      "synthetic",
    );
    assert.equal(
      (
        await request(
          `/works/${id}/shares`,
          "POST",
          { userId: b.user.id },
          a.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          `/works/${id}/shares`,
          "POST",
          { userId: b.user.id },
          a.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await request(`/works/${id}/view`, "POST", {}, b.cookie)).status,
      200,
    );
    assert.equal(
      (await request(`/works/${id}`, "GET", undefined, c.cookie)).status,
      403,
    );
    assert.equal(
      (await request(`/works/${id}/originals/one`, "GET", undefined, b.cookie))
        .status,
      403,
    );
    assert.equal(
      (
        await request(
          "/works",
          "POST",
          { id, revision, workspace: w },
          a.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          "/works",
          "POST",
          { id, revision, workspace: w },
          a.cookie,
        )
      ).status,
      409,
    );
    const template = await request(
      "/templates",
      "POST",
      { title: "PG template", design: w.design },
      a.cookie,
    );
    assert.equal(template.status, 200);
    assert.equal(
      (
        await (await request("/templates", "GET", undefined, a.cookie)).json()
      )[0].title,
      "PG template",
    );
    assert.equal(
      (
        await request(
          `/works/${id}/shares/${b.user.id}`,
          "DELETE",
          {},
          a.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await request(`/works/${id}/export/xlsx`, "POST", {}, b.cookie)).status,
      403,
    );
    assert.equal(
      (await request(`/works/${id}`, "DELETE", {}, a.cookie)).status,
      200,
    );
    assert.equal((await db.prepare("SELECT * FROM originals").all()).length, 0);
    // An unprivileged browser role cannot read any HRBIP tables.
    await pg.exec("CREATE ROLE browser_user; SET ROLE browser_user;");
    await assert.rejects(
      () => pg.query("SELECT * FROM hrbip.users"),
      /permission denied/,
    );
    await pg.exec("RESET ROLE;");
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await db.close();
  }
});

test("large transfers remain session/endpoint bound, one-use, size checked; originals stream after owner ACL", async () => {
  const raw = openStore(":memory:"),
    server = createApp(raw).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  const request = (
    path: string,
    body: unknown,
    cookie = "",
    token = "",
    method = "POST",
  ) =>
    fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
        ...(token ? { "X-HRBIP-Upload": token } : {}),
      },
      body: method === "GET" ? undefined : JSON.stringify(body),
    });
  try {
    const reg = await request("/auth/register", {
      username: "largefile",
      password: "isolated-fixture-password",
    });
    const cookie = reg.headers.getSetCookie().at(-1)!.split(";")[0];
    const w = sampleWorkspace();
    w.retainOriginals = true;
    const original = Buffer.alloc(5 * 1024 * 1024, 65);
    const bytes = Buffer.from(
      JSON.stringify({
        workspace: w,
        originals: [
          {
            id: "test",
            name: "synthetic.csv",
            data: original.toString("base64"),
          },
        ],
      }),
    );
    const start = await request(
      "/transfers",
      { path: "/api/works", bytes: bytes.length },
      cookie,
    );
    assert.equal(start.status, 200);
    const { token, chunkSize } = await start.json();
    assert.equal((await request("/works", {}, "", token)).status, 410);
    assert.equal(
      (await request("/company-formats", {}, cookie, token)).status,
      403,
    );
    assert.equal((await request("/works", {}, cookie, token)).status, 400);
    assert.equal(
      (
        await request(
          "/transfers/part",
          { index: 0, data: "AA==" },
          cookie,
          token,
        )
      ).status,
      400,
    );
    for (
      let offset = 0, index = 0;
      offset < bytes.length;
      offset += chunkSize, index++
    )
      assert.equal(
        (
          await request(
            "/transfers/part",
            {
              index,
              data: bytes
                .subarray(offset, offset + chunkSize)
                .toString("base64"),
            },
            cookie,
            token,
          )
        ).status,
        200,
      );
    const saved = await request("/works", {}, cookie, token);
    assert.equal(saved.status, 200);
    const { id } = await saved.json();
    assert.equal((await request("/works", {}, cookie, token)).status, 410);
    assert.equal(
      raw.prepare("SELECT COUNT(*) AS n FROM transfer_parts").get()!.n,
      0,
    );
    assert.equal(
      (await request(`/works/${id}/originals/test`, {}, "", "", "GET")).status,
      401,
    );
    const file = await request(
      `/works/${id}/originals/test`,
      {},
      cookie,
      "",
      "GET",
    );
    assert.equal(file.status, 200);
    assert.equal(file.headers.get("content-length"), null);
    assert.equal(
      createHash("sha256")
        .update(Buffer.from(await file.arrayBuffer()))
        .digest("hex"),
      createHash("sha256").update(original).digest("hex"),
    );
    const expired = await (
      await request("/transfers", { path: "/api/works", bytes: 1 }, cookie)
    ).json();
    raw.prepare("UPDATE transfers SET expires=0").run();
    assert.equal(
      (await request("/works", {}, cookie, expired.token)).status,
      410,
    );
    assert.equal(
      (await request("/transfers", { path: "/api/auth/register", bytes: 1 }))
        .status,
      400,
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    raw.close();
  }
});
