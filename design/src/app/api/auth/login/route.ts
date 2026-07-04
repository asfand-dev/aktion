import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loginSchema } from "@/lib/validation";
import {
  verifyPassword,
  createSessionToken,
  setSessionCookie,
} from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  const { email, password } = parsed.data;

  const ip = clientIp(req);
  const limited = rateLimit(`login:${ip}:${email}`, {
    limit: 10,
    windowMs: 5 * 60 * 1000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many login attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSeconds) },
      },
    );
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, passwordHash: true },
  });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json(
      { error: "Invalid email or password" },
      { status: 401 },
    );
  }

  const sessionUser = { id: user.id, email: user.email, name: user.name };
  const token = await createSessionToken(sessionUser);
  const res = NextResponse.json({ user: sessionUser });
  setSessionCookie(res, token);
  return res;
}
