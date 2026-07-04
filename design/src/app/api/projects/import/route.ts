import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { ALLOWED_ASSET_MIME, MAX_ASSET_BYTES } from "@/lib/validation";

const bundleSchema = z.object({
  format: z.literal("aktion-design-project"),
  version: z.number().int().min(1).max(1),
  name: z.string().trim().min(1).max(120),
  document: z
    .object({
      version: z.literal(1),
      theme: z.string().max(64),
      pages: z.array(z.unknown()).min(1).max(200),
      symbols: z.array(z.unknown()).max(500),
    })
    .passthrough(),
  assets: z
    .array(
      z.object({
        id: z.string().max(64),
        name: z.string().max(200),
        mime: z.string().max(100),
        dataBase64: z.string().max(12 * 1024 * 1024),
      }),
    )
    .max(100)
    .default([]),
});

/** POST: recreate a project from an exported bundle (document + assets). */
export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const limited = rateLimit(`import:${user.id}`, { limit: 10, windowMs: 10 * 60_000 });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many imports — try again shortly" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bundleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Invalid project file: ${parsed.error.issues[0].message}` },
      { status: 400 },
    );
  }
  const bundle = parsed.data;

  // Recreate assets first so document references can be rewritten.
  const project = await db.project.create({
    data: {
      name: bundle.name,
      ownerId: user.id,
      document: {} as Prisma.InputJsonValue, // placeholder until refs are mapped
    },
    select: { id: true, name: true },
  });

  let documentJson = JSON.stringify(bundle.document);
  for (const asset of bundle.assets) {
    if (!ALLOWED_ASSET_MIME.has(asset.mime)) continue;
    let data: Buffer;
    try {
      data = Buffer.from(asset.dataBase64, "base64");
    } catch {
      continue;
    }
    if (data.length === 0 || data.length > MAX_ASSET_BYTES) continue;
    const created = await db.asset.create({
      data: {
        projectId: project.id,
        name: asset.name || "asset",
        mime: asset.mime,
        data: new Uint8Array(data),
        size: data.length,
      },
      select: { id: true },
    });
    documentJson = documentJson.split(`/api/assets/${asset.id}`).join(`/api/assets/${created.id}`);
  }

  await db.project.update({
    where: { id: project.id },
    data: { document: JSON.parse(documentJson) as Prisma.InputJsonValue },
  });

  return NextResponse.json({ project }, { status: 201 });
}
