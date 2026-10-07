import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp } from "../server/app";
import { noStorage } from "../server/guest";
import { fileInquiryWriter } from "../server/inquiries";

test("anonymous inquiries persist in private files; invalid/cross-origin requests cannot write or read them", async () => {
  const directory = await mkdtemp(join(tmpdir(), "hrbip-inquiries-test-"));
  const server = createApp(noStorage, {
    guestMode: true,
    inquiryWriter: fileInquiryWriter(directory),
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/requests`;
  const send = (message: string, origin = "http://127.0.0.1:4173") =>
    fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json", origin },
      body: JSON.stringify({ message }),
    });
  try {
    const text =
      "테스트 문의: 다음 달에도 이 내용을 확인하고 싶어요.\n기능 제안: 부서 필터 안내를 개선해 주세요.";
    const response = await send(text);
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.match(body.message, /폴더에 저장/);
    const files = await readdir(directory);
    assert.deepEqual(files, [body.id + ".txt"]);
    assert((await readFile(join(directory, files[0]), "utf8")).includes(text));
    assert.equal((await send("짧음")).status, 400);
    assert.equal((await send("a".repeat(2001))).status, 400);
    assert.equal(
      (await send("외부 사이트 문의", "https://untrusted.example")).status,
      403,
    );
    assert.equal((await readdir(directory)).length, 1);
    assert.equal((await fetch(base)).status, 403);
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
    assert(
      resolve(directory).startsWith(resolve(tmpdir()) + "\\") ||
        resolve(directory).startsWith(resolve(tmpdir()) + "/"),
    );
    assert(directory.includes("hrbip-inquiries-test-"));
    await rm(directory, { recursive: true, force: true });
  }
});

test("inquiry write failure never responds with saved status", async () => {
  const server = createApp(noStorage, {
    guestMode: true,
    inquiryWriter: async () => {
      throw new Error("simulated write failure");
    },
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const response = await fetch(
      `http://127.0.0.1:${(server.address() as { port: number }).port}/api/requests`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "저장 오류 검증을 위한 가상 문의" }),
      },
    );
    assert.equal(response.status, 500);
    assert(!("id" in (await response.json())));
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
  }
});
