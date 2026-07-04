import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getProjectAccess, canEdit } from "@/lib/access";
import { rateLimit } from "@/lib/rate-limit";
import {
  buildMessages,
  getAktionSystemPrompt,
  getOpenRouterConfig,
  streamCompletion,
} from "@/lib/ai";

const generateSchema = z.object({
  prompt: z.string().trim().min(3, "Describe what to design").max(4000),
  mode: z.enum(["create", "edit"]),
  /** page = full screen; component = a single focused element/section. */
  scope: z.enum(["page", "component"]).default("page"),
  width: z.number().int().min(120).max(4000).default(1280),
  height: z.number().int().min(120).max(6000).default(800),
  /** Current frame program for edit mode (generated client-side). */
  currentProgram: z.string().max(200_000).optional(),
  /** Client-built project context (theme, pages, navigation). */
  context: z.string().max(16_000).optional(),
});

/** GET: AI availability + model (no secrets). */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const access = await getProjectAccess(id, user.id);
  if (!access) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const config = getOpenRouterConfig();
  return NextResponse.json({
    configured: config !== null,
    model: config?.model ?? null,
  });
}

/** POST: stream an Aktion program for the requested design. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const access = await getProjectAccess(id, user.id);
  if (!access) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!canEdit(access.role)) {
    return NextResponse.json({ error: "View-only access" }, { status: 403 });
  }

  const limited = rateLimit(`ai:${user.id}`, { limit: 20, windowMs: 10 * 60_000 });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many AI requests — try again in a minute" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  const config = getOpenRouterConfig();
  if (!config) {
    return NextResponse.json(
      {
        error:
          "AI is not configured. Set OPENROUTER_API_KEY (and optionally OPENROUTER_MODEL) in design/.env and restart the server.",
      },
      { status: 501 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  try {
    const aktionPrompt = await getAktionSystemPrompt();
    const messages = buildMessages({
      prompt: parsed.data.prompt,
      mode: parsed.data.mode,
      scope: parsed.data.scope,
      width: parsed.data.width,
      height: parsed.data.height,
      currentProgram: parsed.data.currentProgram,
      context: parsed.data.context,
      aktionPrompt,
    });
    const stream = await streamCompletion(config, messages, req.signal);
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
