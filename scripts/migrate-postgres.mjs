import { existsSync, readFileSync, readdirSync } from "node:fs";
import pg from "pg";

// Always run against the dedicated HRBIP database. No local users or works are copied.
if (existsSync(".env.deploy.local")) process.loadEnvFile(".env.deploy.local");
if (!process.env.DATABASE_URL)
  throw new Error("Set DATABASE_URL in ignored .env.deploy.local.");
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15000,
});
try {
  await client.connect();
  for (const name of readdirSync("server/migrations")
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    await client.query(readFileSync("server/migrations/" + name, "utf8"));
    console.log("Applied " + name);
  }
} catch (error) {
  console.error(
    "Migration failed. Check the dedicated HRBIP database connection and permissions. Code:",
    error.code || "unknown",
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
