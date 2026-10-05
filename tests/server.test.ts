import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { openStore } from "../server/store";
import { createApp } from "../server/app";
import { sampleWorkspace } from "../shared/sample";
import { aggregate, draft, recommendedCards } from "../shared/analytics";

test("real auth, persistence, viewer ACL, exports, revocation and deletion", async () => {
  const db = openStore(":memory:"),
    server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port,
    base = "http://127.0.0.1:" + port;
  const request = async (
    path: string,
    method = "GET",
    body?: unknown,
    cookie?: string,
    origin?: string,
  ) =>
    fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
        ...(origin ? { Origin: origin } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try {
    const register = async (username: string) => {
      const res = await request("/auth/register", "POST", {
        username,
        password: "test-only-" + username + "-123456",
      });
      assert.equal(res.status, 201);
      const c = res.headers.getSetCookie().at(-1)!;
      assert.ok(c.includes("HttpOnly"));
      assert.ok(c.includes("SameSite=Strict"));
      return { ...(await res.json()), cookie: c.split(";")[0] };
    };
    const a = await register("owner"),
      b = await register("viewer"),
      c = await register("outsider");
    assert.equal(
      (
        await request("/auth/login", "POST", {
          username: "owner",
          password: "incorrect-password",
        })
      ).status,
      401,
    );
    const w = sampleWorkspace();
    w.datasets[0].headers.push("연락처");
    w.datasets[0].rows.forEach(
      (r) => (r["연락처"] = "PRIVATE-NOT-FOR-STORAGE"),
    );
    const r = aggregate(w);
    w.design.cards = recommendedCards(r);
    w.report = {
      generated: draft(r),
      notes: "담당자 확인 완료",
      basisKey: r.key,
      reviewedKey: r.key,
    };
    w.retainOriginals = true;
    const save = await request(
      "/works",
      "POST",
      {
        workspace: w,
        originals: [
          {
            id: "test-file",
            name: "synthetic.csv",
            data: Buffer.from("synthetic-only").toString("base64"),
          },
        ],
      },
      a.cookie,
    );
    assert.equal(save.status, 200);
    const saved = await save.json(),
      id = saved.id;
    const loaded = await request("/works/" + id, "GET", undefined, a.cookie);
    const payload = await loaded.json();
    assert.equal(payload.workspace.report.notes, "담당자 확인 완료");
    assert.ok(!JSON.stringify(payload.workspace).includes("PRIVATE-NOT"));
    assert.equal(aggregate(payload.workspace).key, r.key);
    assert.equal((await request("/works/" + id)).status, 401);
    assert.equal(
      (await request("/works/" + id, "GET", undefined, c.cookie)).status,
      403,
    );
    assert.equal(
      (await request("/works/" + id + "/export/xlsx", "POST", {}, c.cookie))
        .status,
      403,
    );
    assert.equal(
      (
        await request(
          "/works/" + id + "/originals/test-file",
          "GET",
          undefined,
          c.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          "/works",
          "POST",
          { id, revision: saved.revision, workspace: w },
          c.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          "/works/" + id + "/shares",
          "POST",
          { userId: b.user.id },
          a.cookie,
        )
      ).status,
      200,
    );
    const viewed = await request(
      "/works/" + id + "/view",
      "POST",
      { filters: { ...w.filters, department: "경영지원" } },
      b.cookie,
    );
    assert.equal(viewed.status, 200);
    const view = await viewed.json();
    assert.ok(view.result.metrics[0].value < r.metrics[0].value!);
    assert.ok(!JSON.stringify(view).includes("E001"));
    assert.ok(!("datasets" in view));
    assert.equal(view.report.basisKey, view.result.key);
    const sharedMeta = await (
      await request("/works/" + id, "GET", undefined, b.cookie)
    ).json();
    assert.ok(!("workspace" in sharedMeta));
    assert.equal(
      (await request("/works/" + id, "DELETE", {}, b.cookie)).status,
      403,
    );
    assert.equal(
      (
        await request(
          "/works/" + id + "/originals/test-file",
          "GET",
          undefined,
          b.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          "/works/" + id + "/shares",
          "POST",
          { userId: c.user.id },
          b.cookie,
        )
      ).status,
      403,
    );
    const exported = await request(
      "/works/" + id + "/export/xlsx",
      "POST",
      { filters: { ...w.filters, department: "경영지원" } },
      b.cookie,
    );
    assert.equal(exported.status, 200);
    assert.ok((await exported.arrayBuffer()).byteLength > 1000);
    const template = await request(
      "/templates",
      "POST",
      { title: "재사용 구성", design: w.design },
      a.cookie,
    );
    assert.equal(template.status, 200);
    assert.equal(
      (await (await request("/templates", "GET", undefined, b.cookie)).json())
        .length,
      0,
    );
    assert.equal(
      (
        await request(
          "/works",
          "POST",
          { id, revision: 0, workspace: w },
          a.cookie,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await request(
          "/works/" + id + "/shares/" + b.user.id,
          "DELETE",
          {},
          a.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await request("/works/" + id + "/view", "POST", {}, b.cookie)).status,
      403,
    );
    assert.equal(
      (await request("/works/" + id + "/export/xlsx", "POST", {}, b.cookie))
        .status,
      403,
    );
    w.retainOriginals = false;
    assert.equal(
      (
        await request(
          "/works",
          "POST",
          { id, revision: saved.revision, workspace: w },
          a.cookie,
        )
      ).status,
      200,
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM originals").get()!.n, 0);
    assert.equal(
      (
        await request("/requests", "POST", {
          message: "가상의 자동 테스트 기능 요청",
        })
      ).status,
      201,
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM requests").get()!.n, 1);
    assert.equal(
      (
        await request(
          "/auth/logout",
          "POST",
          {},
          a.cookie,
          "http://malicious.example",
        )
      ).status,
      403,
    );
    assert.equal(
      (await request("/works/" + id, "DELETE", {}, a.cookie)).status,
      200,
    );
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM works").get()!.n, 0);
    await request("/auth/logout", "POST", {}, a.cookie);
    assert.equal(
      (await request("/works", "GET", undefined, a.cookie)).status,
      401,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  }
});
