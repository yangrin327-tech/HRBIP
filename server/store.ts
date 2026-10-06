import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
export function openStore(
  path = resolve(process.env.DATA_DIR || ".data", "hrbip.sqlite"),
) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
 PRAGMA foreign_keys=ON;
 PRAGMA journal_mode=WAL;
 PRAGMA secure_delete=ON;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL, created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS works(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,payload TEXT NOT NULL,updated TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS originals(id TEXT NOT NULL,work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,name TEXT NOT NULL,data BLOB NOT NULL,PRIMARY KEY(id,work_id));
 CREATE TABLE IF NOT EXISTS shares(work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,PRIMARY KEY(work_id,user_id));
 CREATE TABLE IF NOT EXISTS templates(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,payload TEXT NOT NULL,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY,body TEXT NOT NULL,created TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS company_formats(id TEXT PRIMARY KEY,owner TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,format TEXT NOT NULL,version INTEGER NOT NULL,created TEXT NOT NULL,payload TEXT NOT NULL,data BLOB NOT NULL);
 `);
  return db;
}
