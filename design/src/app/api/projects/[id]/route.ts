import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getProjectAccess, canEdit } from "@/lib/access";
import { projectPatchSchema } from "@/lib/validation";
import type {
  DesignDocument,
  ProjectDetail,
  ProjectSummary,
} from "@/design/types";

const summarySelect = {
  id: true,
  name: true,
  thumbnail: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, name: true, email: true } },
  _count: { select: { shares: true } },
} as const;

type SummaryRow = Prisma.ProjectGetPayload<{ select: typeof summarySelect }>;

function toSummary(
  row: SummaryRow,
  role: ProjectSummary["role"],
): ProjectSummary {
  return {
    id: row.id,
    name: row.name,
    thumbnail: row.thumbnail,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    owner: row.owner,
    role,
    shareCount: row._count.shares,
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

  const row = await db.project.findUnique({
    where: { id },
    select: { ...summarySelect, document: true },
  });
  if (!row) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { document, ...summary } = row;
  const project: ProjectDetail = {
    ...toSummary(summary, access.role),
    document: document as unknown as DesignDocument,
  };
  return NextResponse.json({ project });
}

export async function PATCH(req: Request, { params }: Params) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const { id } = await params;

  const access = await getProjectAccess(id, user.id);
  if (!access) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!canEdit(access.role)) {
    return NextResponse.json(
      { error: "You don't have edit access to this project" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = projectPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const data: Prisma.ProjectUpdateInput = {};
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.document !== undefined) {
    data.document = parsed.data.document as unknown as Prisma.InputJsonValue;
  }
  if (parsed.data.thumbnail !== undefined) {
    data.thumbnail = parsed.data.thumbnail;
  }

  const updated = await db.project.update({
    where: { id },
    data,
    select: summarySelect,
  });

  return NextResponse.json({ project: toSummary(updated, access.role) });
}

export async function DELETE(_req: Request, { params }: Params) {
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
      { error: "Only the owner can delete a project" },
      { status: 403 },
    );
  }

  await db.project.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
