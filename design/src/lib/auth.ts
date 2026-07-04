import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { db } from "./db";
import type { SessionUser } from "@/design/types";

export const SESSION_COOKIE = "design_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be set to a random string of 32+ chars");
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
    };
  } catch {
    return null;
  }
}

/** Session user from the request cookie (route handlers / server components). */
export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Session user verified against the database — use in API routes so deleted
 * users lose access immediately even with a live token.
 */
export async function requireUser(): Promise<SessionUser | null> {
  const claims = await getSessionUser();
  if (!claims) return null;
  const user = await db.user.findUnique({
    where: { id: claims.id },
    select: { id: true, email: true, name: true },
  });
  return user;
}

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
