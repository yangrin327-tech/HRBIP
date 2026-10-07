import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { openStore } from "./store.js";
import { createApp } from "./app.js";
import express from "express";
import { serverConfig } from "./config.js";
import { postgresStore, sqliteStore } from "./database.js";
import { noStorage } from "./guest.js";
import { fileInquiryWriter } from "./inquiries.js";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
else if (existsSync(".env")) process.loadEnvFile(".env");
const { port, host, origin, publicDemo, guestMode, trustProxyHops } =
  serverConfig();
const production = process.argv.includes("--production");
const db = guestMode
  ? noStorage
  : process.env.DATABASE_URL
    ? postgresStore(process.env.DATABASE_URL)
    : sqliteStore(openStore());
const app = createApp(db, {
  production,
  origin,
  publicDemo,
  guestMode,
  trustProxyHops,
  inquiryWriter: publicDemo ? undefined : fileInquiryWriter(),
});
if (production) {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true, hmr: { port: port + 1 } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const server = app.listen(port, host, () =>
  console.log(
    "HRBIP: http://" +
      host +
      ":" +
      port +
      " (" +
      (production ? "production" : "development") +
      ")",
  ),
);
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(async () => {
    await db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
