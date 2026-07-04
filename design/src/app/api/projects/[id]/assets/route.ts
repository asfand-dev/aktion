import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getProjectAccess, canEdit } from "@/lib/access";
import { ALLOWED_ASSET_MIME, MAX_ASSET_BYTES } from "@/lib/validation";
import type { AssetInfo } from "@/design/types";

const MAX_ASSETS_PER_PROJECT = 100;

const assetSelect = {
  id: true,
  name: true,
  mime: true,
  size: true,
  width: true,
  height: true,
  createdAt: true,
} as const;

function toAssetInfo(row: {
  id: string;
  name: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  createdAt: Date;
}): AssetInfo {
  return {
    id: row.id,
    name: row.name,
    mime: row.mime,
    size: row.size,
    width: row.width,
    height: row.height,
    createdAt: row.createdAt.toISOString(),
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

  const rows = await db.asset.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "asc" },
    select: assetSelect,
  });

  return NextResponse.json({ assets: rows.map(toAssetInfo) });
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
  if (!canEdit(access.role)) {
    return NextResponse.json(
      { error: "You don't have edit access to this project" },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data" },
      { status: 400 },
    );
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: 'Missing "file" field' },
      { status: 400 },
    );
  }

  if (!ALLOWED_ASSET_MIME.has(file.type)) {
    return NextResponse.json(
      { error: "Unsupported file type" },
      { status: 415 },
    );
  }
  if (file.size > MAX_ASSET_BYTES) {
    return NextResponse.json(
      {
        error: `File too large (max ${Math.floor(MAX_ASSET_BYTES / (1024 * 1024))} MB)`,
      },
      { status: 413 },
    );
  }

  const count = await db.asset.count({ where: { projectId: id } });
  if (count >= MAX_ASSETS_PER_PROJECT) {
    return NextResponse.json(
      { error: `Asset limit reached (${MAX_ASSETS_PER_PROJECT} per project)` },
      { status: 400 },
    );
  }

  const data = Buffer.from(await file.arrayBuffer());
  const asset = await db.asset.create({
    data: {
      projectId: id,
      name: file.name || "asset",
      mime: file.type,
      data,
      size: data.byteLength,
    },
    select: assetSelect,
  });

  return NextResponse.json({ asset: toAssetInfo(asset) }, { status: 201 });
}
