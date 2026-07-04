import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getProjectAccess, canEdit } from "@/lib/access";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id } = await params;

  const asset = await db.asset.findUnique({
    where: { id },
    select: { id: true, mime: true, data: true, projectId: true },
  });
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const access = await getProjectAccess(asset.projectId, user.id);
  if (!access) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const body = new Uint8Array(Buffer.from(asset.data));
  const headers = new Headers({
    "Content-Type": asset.mime,
    "Content-Length": String(body.byteLength),
    "Cache-Control": "private, max-age=31536000, immutable",
  });
  if (asset.mime === "image/svg+xml") {
    headers.set("Content-Security-Policy", "script-src 'none'");
    headers.set("X-Content-Type-Options", "nosniff");
  }

  return new NextResponse(body, { headers });
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id } = await params;

  const asset = await db.asset.findUnique({
    where: { id },
    select: { id: true, projectId: true },
  });
  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const access = await getProjectAccess(asset.projectId, user.id);
  if (!access) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
  if (!canEdit(access.role)) {
    return NextResponse.json(
      { error: "You don't have edit access to this project" },
      { status: 403 },
    );
  }

  await db.asset.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
