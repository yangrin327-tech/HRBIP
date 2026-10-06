import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { serverConfig } from "../server/config";
import { createApp } from "../server/app";
import { openStore } from "../server/store";

test("public hosting fails closed for missing HTTPS, secure cookies or data location", () => {
  assert.equal(serverConfig({}).host, "127.0.0.1");
  assert.throws(() => serverConfig({ PUBLIC_DEMO: "true" }), /HTTPS/);
  const publicEnv = {
    PUBLIC_DEMO: "true",
    APP_ORIGIN: "https://hrbip.example",
    COOKIE_SECURE: "true",
  };
  assert.throws(() => serverConfig(publicEnv), /DATA_DIR/);
  const env = {
    ...publicEnv,
    DATA_DIR: "/data",
    HOST: "0.0.0.0",
    PORT: "8080",
    TRUST_PROXY_HOPS: "1",
  };
  assert.equal(serverConfig(env).port, 8080);
  assert.equal(serverConfig(env).publicDemo, true);
  assert.throws(
    () => serverConfig({ ...env, APP_ORIGIN: "https://hrbip.example/path" }),
    /origin/,
  );
  assert.throws(
    () => serverConfig({ ...env, TRUST_PROXY_HOPS: "true" }),
    /TRUST_PROXY/,
  );
  assert.throws(() => serverConfig({ ...env, PORT: "0" }), /PORT/);
});

test("public origin is enforced and demo metadata is available without authentication", async () => {
  const db = openStore(":memory:");
  const server = createApp(db, {
    production: true,
    publicDemo: true,
    origin: "https://hrbip.example",
    trustProxyHops: 1,
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const health = await fetch(base + "/api/health");
    assert.equal((await health.json()).publicDemo, true);
    const bad = await fetch(base + "/api/requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://other.example",
      },
      body: "{}",
    });
    assert.equal(bad.status, 403);
    const same = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://hrbip.example",
        "X-Forwarded-For": "198.51.100.9",
      },
      body: JSON.stringify({
        username: "nonexistent",
        password: "fictional-password-only",
      }),
    });
    assert.equal(same.status, 401);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  }
});
