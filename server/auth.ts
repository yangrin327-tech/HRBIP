import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
import type { Store } from "./database.js";
import type { Request, Response } from "express";
const scrypt = promisify(scryptCallback);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)) as Buffer;
  return salt + ":" + hash.toString("hex");
}
export async function verifyPassword(password: string, stored: string) {
  const [salt, hex] = stored.split(":");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const hash = Buffer.from(hex, "hex");
  return hash.length === derived.length && timingSafeEqual(derived, hash);
}
const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export async function currentUser(
  db: Store,
  req: Request,
): Promise<{
  id: string;
  username: string;
} | null> {
  const token = req.cookies?.hrbip_session;
  if (typeof token !== "string") return null;
  const row = await db
    .prepare(
      "SELECT u.id,u.username FROM sessions s JOIN users u ON s.user_id=u.id WHERE s.token=? AND s.expires>?",
    )
    .get(tokenHash(token), Date.now());
  return row ? { id: String(row.id), username: String(row.username) } : null;
}
export async function endSession(db: Store, req: Request, res: Response) {
  if (req.cookies?.hrbip_session)
    await db
      .prepare("DELETE FROM sessions WHERE token=?")
      .run(tokenHash(req.cookies.hrbip_session));
  res.clearCookie("hrbip_session", { path: "/" });
}
export async function startSession(
  db: Store,
  id: string,
  req: Request,
  res: Response,
) {
  await endSession(db, req, res);
  await db.prepare("DELETE FROM sessions WHERE expires<=?").run(Date.now());
  const token = randomBytes(32).toString("hex"),
    maxAge = 12 * 60 * 60 * 1000;
  await db
    .prepare("INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)")
    .run(tokenHash(token), id, Date.now() + maxAge);
  res.cookie("hrbip_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.COOKIE_SECURE === "true",
    maxAge,
    path: "/",
  });
}
