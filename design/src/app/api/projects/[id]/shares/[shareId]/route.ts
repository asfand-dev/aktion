import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getProjectAccess } from "@/lib/access";
import { sharePatchSchema } from "@/lib/validation";
import type { ShareInfo } from "@/design/types";

const shareSelect = {
  id: true,
  canEdit: true,
  createdAt: true,
  user: { select: { id: true, name: true, email: true } },
} as const;

function toShareInfo(row: {
  id: string;
  canEdit: boolean;
  createdAt: Date;
  user: { id: string; name: string; email: string };
}): ShareInfo {
  return {
    id: row.id,
    canEdit: row.canEdit,
    createdAt: row.createdAt.toISOString(),
    user: row.user,
  };
}

type Params = { params: Promise<{ id: string; shareId: string }> };

export async function PATCH(req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id, shareId } = await params;

  const access = await getProjectAccess(id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (access.role !== "owner") {
    return NextResponse.json(
      { error: "Only the owner can change share permissions" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = sharePatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const existing = await db.projectShare.findFirst({
    where: { id: shareId, projectId: id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  const share = await db.projectShare.update({
    where: { id: shareId },
    data: { canEdit: parsed.data.canEdit },
    select: shareSelect,
  });

  return NextResponse.json({ share: toShareInfo(share) });
}

export async function DELETE(_req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id, shareId } = await params;

  const access = await getProjectAccess(id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const share = await db.projectShare.findFirst({
    where: { id: shareId, projectId: id },
    select: { id: true, userId: true },
  });
  if (!share) {
    return NextResponse.json({ error: "Share not found" }, { status: 404 });
  }

  // Owners can remove anyone; a shared user may only remove themselves.
  if (access.role !== "owner" && share.userId !== user.id) {
    return NextResponse.json(
      { error: "Only the owner can remove this share" },
      { status: 403 },
    );
  }

  await db.projectShare.delete({ where: { id: shareId } });
  return NextResponse.json({ ok: true });
}
