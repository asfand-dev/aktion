"use client";
/**
 * Whole-project portability + .aktion import.
 *
 * Export bundles the document AND every asset (base64) into one JSON file, so
 * a project can move between databases/instances. Import posts the bundle to
 * the server, which recreates the assets and rewrites `/api/assets/<id>`
 * references inside the document.
 */
import type { AssetInfo, DesignDocument, ProjectDetail } from "@/design/types";
import { api } from "@/lib/api";
import { downloadText } from "@/lib/utils";

export const PROJECT_BUNDLE_VERSION = 1;

export interface ProjectBundle {
  format: "aktion-design-project";
  version: number;
  exportedAt: string;
  name: string;
  document: DesignDocument;
  assets: Array<{
    id: string;
    name: string;
    mime: string;
    dataBase64: string;
  }>;
}

/** Fetch a project + its assets and download the portable JSON bundle. */
export async function exportProjectJson(projectId: string): Promise<void> {
  const { project } = await api.get<{ project: ProjectDetail }>(
    `/api/projects/${projectId}`,
  );
  const { assets } = await api.get<{ assets: AssetInfo[] }>(
    `/api/projects/${projectId}/assets`,
  );

  const packed: ProjectBundle["assets"] = [];
  for (const asset of assets) {
    const res = await fetch(`/api/assets/${asset.id}`);
    if (!res.ok) continue;
    const buf = await res.arrayBuffer();
    packed.push({
      id: asset.id,
      name: asset.name,
      mime: asset.mime,
      dataBase64: arrayBufferToBase64(buf),
    });
  }

  const bundle: ProjectBundle = {
    format: "aktion-design-project",
    version: PROJECT_BUNDLE_VERSION,
    exportedAt: new Date().toISOString(),
    name: project.name,
    document: project.document,
    assets: packed,
  };
  downloadText(
    JSON.stringify(bundle, null, 2),
    `${safeFilename(project.name)}.aktion-project.json`,
    "application/json",
  );
}

/** Parse + validate a bundle file and create the project server-side. */
export async function importProjectJson(
  file: File,
): Promise<{ id: string; name: string }> {
  if (file.size > 40 * 1024 * 1024) {
    throw new Error("Project file is too large (max 40 MB)");
  }
  let bundle: ProjectBundle;
  try {
    bundle = JSON.parse(await file.text()) as ProjectBundle;
  } catch {
    throw new Error("Not a valid JSON file");
  }
  if (bundle.format !== "aktion-design-project" || !bundle.document?.pages) {
    throw new Error("Not an Aktion Design project file");
  }
  const { project } = await api.post<{ project: { id: string; name: string } }>(
    "/api/projects/import",
    bundle,
  );
  return project;
}

/** Read a .aktion file's text (with a light size guard). */
export async function readAktionFile(file: File): Promise<string> {
  if (file.size > 2 * 1024 * 1024) {
    throw new Error(".aktion file is too large (max 2 MB)");
  }
  return file.text();
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function safeFilename(name: string): string {
  return name.replace(/[^\w\-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "project";
}
