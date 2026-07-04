import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { registerSchema } from "@/lib/validation";
import {
  hashPassword,
  createSessionToken,
  setSessionCookie,
} from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const limited = rateLimit(`register:${ip}`, {
    limit: 5,
    windowMs: 10 * 60 * 1000,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSeconds) },
      },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  const { name, email, password } = parsed.data;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with that email already exists" },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);
  let user: { id: string; email: string; name: string };
  try {
    user = await db.user.create({
      data: { name, email, passwordHash },
      select: { id: true, email: true, name: true },
    });
  } catch (err) {
    // Unique-violation race: someone registered the same email between the
    // existence check and the insert.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "An account with that email already exists" },
        { status: 409 },
      );
    }
    throw err;
  }

  const token = await createSessionToken(user);
  const res = NextResponse.json({ user }, { status: 201 });
  setSessionCookie(res, token);
  return res;
}
