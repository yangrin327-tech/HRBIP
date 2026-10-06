import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import pptxgen from "pptxgenjs";
import JSZip from "jszip";
import { openStore } from "../server/store";
import { createApp } from "../server/app";
import { sampleWorkspace } from "../shared/sample";
import { aggregate, draft } from "../shared/analytics";
test("company format ownership, immutable versions, referenced deletion, real export and shared checks", async () => {
  const db = openStore(":memory:"),
    server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = "http://127.0.0.1:" + (server.address() as any).port;
  const call = (
    path: string,
    body?: unknown,
    cookie?: string,
    method = body ? "POST" : "GET",
  ) =>
    fetch(base + "/api" + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
    });
  try {
    const register = async (username: string) => {
      const r = await call("/auth/register", {
        username,
        password: "test-safe-pass-123456",
      });
      return {
        cookie: r.headers.getSetCookie().at(-1)!.split(";")[0],
        user: (await r.json()).user,
      };
    };
    const a = await register("format_owner"),
      b = await register("format_other");
    const deck = new pptxgen();
    deck.addSlide().addText("{{metric:headcount}}", {
      x: 1,
      y: 1,
      w: 4,
      h: 1,
      fontSize: 22,
    });
    const data = Buffer.from(
      (await deck.write({ outputType: "nodebuffer" })) as Buffer,
    ).toString("base64");
    const i = await (
      await call("/company-formats/inspect", { name: "company.pptx", data })
    ).json();
    const body = {
      name: "company.pptx",
      data,
      title: "회사 보고",
      bindings: i.slots.map((s: any) => ({ slot: s.id, field: s.suggestion })),
      brand: i.brand,
      confirmed: true,
    };
    assert.equal((await call("/company-formats", body)).status, 401);
    const saved = await (await call("/company-formats", body, a.cookie)).json();
    assert.equal(saved.version, 1);
    assert.equal(
      (
        await call(
          "/company-formats",
          { ...body, previousId: saved.id },
          b.cookie,
        )
      ).status,
      403,
    );
    const version2 = await (
      await call(
        "/company-formats",
        { ...body, previousId: saved.id },
        a.cookie,
      )
    ).json();
    assert.equal(version2.version, 2);
    assert.notEqual(saved.id, version2.id);
    assert.deepEqual(
      await (await call("/company-formats", undefined, b.cookie)).json(),
      [],
    );
    const w = sampleWorkspace();
    w.datasets[0].name = "INTERNAL-SOURCE-PRIVATE";
    const r = aggregate(w);
    w.report = {
      generated: draft(r),
      notes: "",
      basisKey: r.key,
      reviewedKey: r.key,
    };
    w.companyFormats = { pptx: saved.id };
    assert.equal(
      (await call("/works", { workspace: w }, b.cookie)).status,
      403,
    );
    assert.equal((await call("/export/pptx", { workspace: w })).status, 401);
    assert.equal(
      (await call("/export/pptx", { workspace: w }, b.cookie)).status,
      403,
    );
    const work = await (
      await call("/works", { workspace: w }, a.cookie)
    ).json();
    assert.ok(work.id);
    assert.equal(
      (
        await call(
          "/company-formats/" + saved.id,
          undefined,
          a.cookie,
          "DELETE",
        )
      ).status,
      409,
    );
    const output = await call(
      "/works/" + work.id + "/export/pptx",
      {},
      a.cookie,
    );
    assert.equal(
      output.status,
      200,
      output.status === 200 ? "" : await output.text(),
    );
    assert.equal(
      (await call("/works/" + work.id + "/verification", {}, b.cookie)).status,
      403,
    );
    await call(
      "/works/" + work.id + "/shares",
      { userId: b.user.id },
      a.cookie,
    );
    const shared = await (
      await call("/works/" + work.id + "/verification", {}, b.cookie)
    ).json();
    assert.deepEqual(shared.sources, []);
    assert.ok(!shared.checks.some((c: any) => c.id.startsWith("source:")));
    const sharedFile = await call(
      "/works/" + work.id + "/export/xlsx",
      {},
      b.cookie,
    );
    assert.equal(sharedFile.status, 200);
    const zip = await JSZip.loadAsync(await sharedFile.arrayBuffer());
    const content = (
      await Promise.all(
        Object.keys(zip.files)
          .filter((n) => n.endsWith(".xml"))
          .map((n) => zip.file(n)!.async("string")),
      )
    ).join("");
    assert.ok(!content.includes("INTERNAL-SOURCE-PRIVATE"));
    assert.equal(
      (await call("/works/" + work.id + "/export/pptx", {}, b.cookie)).status,
      200,
    );
    await call(
      "/works/" + work.id + "/shares/" + b.user.id,
      undefined,
      a.cookie,
      "DELETE",
    );
    assert.equal(
      (await call("/works/" + work.id + "/export/pptx", {}, b.cookie)).status,
      403,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  }
});
