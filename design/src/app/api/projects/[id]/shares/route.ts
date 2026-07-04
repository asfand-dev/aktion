import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getProjectAccess } from "@/lib/access";
import { shareCreateSchema } from "@/lib/validation";
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

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id } = await params;

  const access = await getProjectAccess(id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const rows = await db.projectShare.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "asc" },
    select: shareSelect,
  });

  return NextResponse.json({ shares: rows.map(toShareInfo) });
}

export async function POST(req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id } = await params;

  const access = await getProjectAccess(id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (access.role !== "owner") {
    return NextResponse.json(
      { error: "Only the owner can share a project" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = shareCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }
  const { email, canEdit } = parsed.data;

  const target = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json(
      { error: "No user with that email" },
      { status: 404 },
    );
  }
  if (target.id === user.id) {
    return NextResponse.json(
      { error: "You can't share a project with yourself" },
      { status: 400 },
    );
  }

  const share = await db.projectShare.upsert({
    where: { projectId_userId: { projectId: id, userId: target.id } },
    update: { canEdit },
    create: { projectId: id, userId: target.id, canEdit },
    select: shareSelect,
  });

  return NextResponse.json({ share: toShareInfo(share) }, { status: 201 });
}
