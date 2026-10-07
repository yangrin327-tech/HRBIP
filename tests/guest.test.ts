import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import JSZip from "jszip";
import pptxgen from "pptxgenjs";
import { createApp } from "../server/app";
import { noStorage } from "../server/guest";
import { sampleWorkspace } from "../shared/sample";
import { aggregate, draft } from "../shared/analytics";
import { request } from "../src/api";

test("guest API never touches storage, blocks old sessions and supports memory-only verification and exports", async () => {
  const server = createApp(noStorage, { guestMode: true }).listen(
    0,
    "127.0.0.1",
  );
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  const call = (path: string, method = "GET", body?: unknown) =>
    fetch(base + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        Cookie: "hrbip_session=old-session",
      },
      body: method === "GET" ? undefined : JSON.stringify(body || {}),
    });
  try {
    const health = await (await call("/health")).json();
    assert.equal(health.storage, "none");
    assert.equal(health.guestMode, true);
    const me = await call("/me");
    assert.equal(me.headers.get("set-cookie"), null);
    assert.deepEqual(await me.json(), {
      user: null,
      guestMode: true,
      publicDemo: false,
      accountsEnabled: false,
    });
    for (const [path, method] of [
      ["/auth/register", "POST"],
      ["/auth/login", "POST"],
      ["/auth/logout", "POST"],
      ["/works", "GET"],
      ["/works", "POST"],
      ["/works/old", "GET"],
      ["/works/old", "DELETE"],
      ["/works/old/originals/file", "GET"],
      ["/works/old/export/pptx", "POST"],
      ["/works/old/shares", "POST"],
      ["/works/old/verification", "POST"],
      ["/templates", "GET"],
      ["/templates", "POST"],
      ["/company-formats", "GET"],
      ["/company-formats", "POST"],
      ["/transfers", "POST"],
      ["/transfers/part", "POST"],
      ["/requests", "POST"],
    ])
      assert.equal((await call(path, method)).status, 403, method + " " + path);

    const w = sampleWorkspace(),
      r = aggregate(w);
    w.report = {
      generated: draft(r),
      notes: "",
      basisKey: r.key,
      reviewedKey: r.key,
    };
    const verify = await call("/verification", "POST", { workspace: w });
    assert.equal(verify.status, 200);
    assert.equal((await verify.json()).blocked, false);
    for (const ext of ["xlsx", "pptx", "pdf"]) {
      const response = await call("/export/" + ext, "POST", { workspace: w });
      assert.equal(response.status, 200, ext + " export");
      const file = Buffer.from(await response.arrayBuffer());
      if (ext === "pdf") assert.equal(file.subarray(0, 4).toString(), "%PDF");
      else {
        const zip = await JSZip.loadAsync(file);
        assert.ok(zip.file("[Content_Types].xml"));
        if (ext === "pptx")
          assert.ok(zip.file(/^ppt\/charts\/chart\d+\.xml$/).length > 0);
      }
    }
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
    const inspected = await (
      await call("/company-formats/inspect", "POST", {
        name: "guest.pptx",
        data,
      })
    ).json();
    const prepared = await call("/company-formats/prepare", "POST", {
      name: "guest.pptx",
      data,
      title: "Guest format",
      confirmed: true,
      brand: inspected.brand,
      bindings: inspected.slots.map((s: any) => ({
        slot: s.id,
        field: s.suggestion,
      })),
    });
    assert.equal(prepared.status, 200);
    const f = await prepared.json();
    w.companyFormats = { pptx: f.meta.id };
    assert.equal(
      (await call("/export/pptx", "POST", { workspace: w })).status,
      422,
    );
    const output = await call("/export/pptx", "POST", {
      workspace: w,
      companyFormat: f.input,
    });
    assert.equal(output.status, 200);
    const zip = await JSZip.loadAsync(await output.arrayBuffer());
    assert.match(
      await zip.file("ppt/slides/slide1.xml")!.async("string"),
      />42</,
    );
    assert.equal(
      (
        await call("/export/pptx", "POST", {
          workspace: w,
          companyFormat: { ...f.input, confirmed: false },
        })
      ).status,
      400,
    );

    // Exercises Express gzip decoding above the former database transfer threshold.
    const compressed = await fetch(base + "/verification", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
      },
      body: gzipSync(
        JSON.stringify({ workspace: w, padding: "x".repeat(5 * 1024 * 1024) }),
      ),
    });
    assert.equal(compressed.status, 200);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("browser transport compresses large guest requests without transfers and reports oversized files", async () => {
  const fetchBefore = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push(url);
    assert.equal(new Headers(init.headers).get("Content-Encoding"), "gzip");
    const parsed = JSON.parse(
      gunzipSync(Buffer.from(init.body as ArrayBuffer)).toString(),
    );
    assert.equal(parsed.padding.length, 5 * 1024 * 1024);
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    await request("/verification", "POST", {
      padding: "x".repeat(5 * 1024 * 1024),
    });
    assert.deepEqual(calls, ["/api/verification"]);
    await assert.rejects(
      request("/company-formats/inspect", "POST", {
        data: randomBytes(5 * 1024 * 1024).toString("base64"),
      }),
      /일회성 처리 용량/,
    );
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = fetchBefore;
  }
});
