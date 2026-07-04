/**
 * Edge-safe session verification for the middleware. Imports ONLY "jose" —
 * no Prisma, no node-only modules — so it can run on the edge runtime.
 * SESSION_COOKIE must match the value in @/lib/auth.
 */
import { jwtVerify } from "jose";

export const SESSION_COOKIE = "design_session";

export interface EdgeSessionUser {
  id: string;
  email: string;
  name: string;
}

export async function verifySessionEdge(
  token: string,
): Promise<EdgeSessionUser | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) return null;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret),
    );
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
