import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { openStore } from "./store";
import { createApp } from "./app";
import express from "express";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
else if (existsSync(".env")) process.loadEnvFile(".env");
const port = Number(process.env.PORT || 4173),
  host = process.env.HOST || "127.0.0.1",
  production = process.argv.includes("--production");
const app = createApp(openStore(), { production });
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
process.on("SIGTERM", () => server.close(() => process.exit(0)));
