import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getProjectAccess } from "@/lib/access";
import { projectCreateSchema } from "@/lib/validation";
import { newDocument } from "@/design/document";
import type { ProjectSummary } from "@/design/types";

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

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const [owned, shared] = await Promise.all([
    db.project.findMany({
      where: { ownerId: user.id },
      select: summarySelect,
    }),
    db.projectShare.findMany({
      where: { userId: user.id },
      select: { canEdit: true, project: { select: summarySelect } },
    }),
  ]);

  const projects: ProjectSummary[] = [
    ...owned.map((p) => toSummary(p, "owner")),
    ...shared.map((s) =>
      toSummary(s.project, s.canEdit ? "editor" : "viewer"),
    ),
  ].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  return NextResponse.json({ projects });
}

export async function POST(req: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = projectCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const duplicateOf =
    typeof body === "object" &&
    body !== null &&
    typeof (body as Record<string, unknown>).duplicateOf === "string"
      ? ((body as Record<string, unknown>).duplicateOf as string)
      : null;

  let document: unknown;
  if (duplicateOf) {
    const access = await getProjectAccess(duplicateOf, user.id);
    if (!access) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const source = await db.project.findUnique({
      where: { id: duplicateOf },
      select: { document: true },
    });
    if (!source) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    document = source.document;
  } else {
    document = newDocument();
  }

  const project = await db.project.create({
    data: {
      name: parsed.data.name,
      ownerId: user.id,
      document: document as unknown as Prisma.InputJsonValue,
    },
    select: summarySelect,
  });

  return NextResponse.json(
    { project: toSummary(project, "owner") },
    { status: 201 },
  );
}
