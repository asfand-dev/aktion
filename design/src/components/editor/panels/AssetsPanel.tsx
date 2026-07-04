"use client";
/**
 * Assets panel — per-project uploaded images. Upload via button or
 * drag-and-drop onto the panel; thumbnails drag onto the canvas (asset drag
 * protocol) or insert as an Image node in place.
 */
import { useEffect, useRef, useState, type DragEvent } from "react";
import { ImageIcon, ImagePlus, Trash2, Upload } from "lucide-react";
import { getSchemaIndex, type SchemaIndex } from "@/design/schema";
import { findFrame, findNode } from "@/design/document";
import type { AssetInfo, PropValue } from "@/design/types";
import { useEditor, type DropTarget } from "@/store/editor-store";
import { api, ApiError } from "@/lib/api";
import { ALLOWED_ASSET_MIME, MAX_ASSET_BYTES } from "@/lib/validation";
import { Spinner, toast } from "@/components/ui";
import { cn, formatBytes } from "@/lib/utils";

/** Same target logic as the palette: container node > frame > first frame. */
function resolveInsertTarget(index: SchemaIndex | null): DropTarget | null {
  const s = useEditor.getState();
  const doc = s.document;
  if (s.selection.length === 1) {
    const id = s.selection[0];
    const loc = findNode(doc, id);
    if (loc) {
      if (
        loc.node.type === "component" &&
        loc.node.component &&
        index?.byName.get(loc.node.component)?.acceptsChildren
      ) {
        return { containerId: id, index: 9999 };
      }
    } else if (findFrame(doc, id)) {
      return { containerId: id, index: 9999 };
    }
  }
  const page = doc.pages.find((p) => p.id === s.activePageId) ?? doc.pages[0];
  const frame = page?.frames[0];
  return frame ? { containerId: frame.id, index: 9999 } : null;
}

export function AssetsPanel() {
  const projectId = useEditor((s) => s.projectId);
  const readOnly = useEditor((s) => s.readOnly);
  const insertComponent = useEditor((s) => s.insertComponent);

  const [assets, setAssets] = useState<AssetInfo[] | null>(null);
  const [index, setIndex] = useState<SchemaIndex | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    getSchemaIndex()
      .then((i) => {
        if (alive) setIndex(i);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    api
      .get<{ assets: AssetInfo[] }>(`/api/projects/${projectId}/assets`)
      .then((r) => {
        if (alive) setAssets(r.assets);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setAssets([]);
        toast(e instanceof ApiError ? e.message : "Failed to load assets", "error");
      });
    return () => {
      alive = false;
    };
  }, [projectId]);

  const uploadFiles = async (files: File[]) => {
    if (readOnly || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        if (!ALLOWED_ASSET_MIME.has(file.type)) {
          toast(`Unsupported file type: ${file.name}`, "error");
          continue;
        }
        if (file.size > MAX_ASSET_BYTES) {
          toast(`${file.name} exceeds ${formatBytes(MAX_ASSET_BYTES)}`, "error");
          continue;
        }
        const form = new FormData();
        form.append("file", file);
        try {
          const res = await fetch(`/api/projects/${projectId}/assets`, {
            method: "POST",
            body: form,
          });
          const json: unknown = await res.json().catch(() => null);
          if (!res.ok) {
            const message =
              json && typeof json === "object" && "error" in json
                ? String((json as { error: unknown }).error)
                : `Upload failed (${res.status})`;
            throw new Error(message);
          }
          const asset = (json as { asset: AssetInfo }).asset;
          setAssets((prev) => [...(prev ?? []), asset]);
        } catch (err) {
          toast(err instanceof Error ? err.message : "Upload failed", "error");
        }
      }
    } finally {
      setUploading(false);
    }
  };

  const insertAsset = (asset: AssetInfo) => {
    if (readOnly) return;
    const target = resolveInsertTarget(index);
    if (!target) {
      toast("Add a frame to the canvas first", "error");
      return;
    }
    insertComponent(
      "Image",
      {
        src: `/api/assets/${asset.id}`,
        alt: asset.name,
        sx: { w: "100%" } as PropValue,
      },
      target,
    );
  };

  const deleteAsset = async (asset: AssetInfo) => {
    if (readOnly) return;
    if (!window.confirm(`Delete "${asset.name}"? Designs using it will lose the image.`)) {
      return;
    }
    try {
      await api.del(`/api/assets/${asset.id}`);
      setAssets((prev) => (prev ?? []).filter((a) => a.id !== asset.id));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Failed to delete asset", "error");
    }
  };

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  return (
    <div
      className={cn(
        "relative flex h-full flex-col bg-bg-1",
        dragOver && "ring-2 ring-inset ring-accent",
      )}
      onDragEnter={(e) => {
        if (readOnly || !hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragOver(true);
      }}
      onDragOver={(e) => {
        if (readOnly || !hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(e) => {
        if (readOnly || !hasFiles(e)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragOver(false);
      }}
      onDrop={(e) => {
        if (readOnly || !hasFiles(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragOver(false);
        void uploadFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border-0 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text-3">
          Assets{assets && assets.length > 0 ? ` · ${assets.length}` : ""}
        </span>
        {!readOnly && (
          <>
            <button
              className="flex items-center gap-1 rounded-md bg-bg-3 px-2 py-1 text-xs font-medium text-text-1 hover:bg-border-1 disabled:opacity-50"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <Spinner size={11} /> : <Upload size={11} />}
              Upload
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept={Array.from(ALLOWED_ASSET_MIME).join(",")}
              className="hidden"
              onChange={(e) => {
                void uploadFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto">
        {assets === null ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : assets.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
            <ImageIcon size={24} className="text-text-3" />
            <p className="text-xs text-text-3">
              {readOnly
                ? "No assets in this project."
                : "No assets yet. Upload images or drop them anywhere on this panel."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 p-3">
            {assets.map((asset) => (
              <div
                key={asset.id}
                className={cn(
                  "group overflow-hidden rounded-md border border-border-0 bg-bg-2",
                  !readOnly && "cursor-grab active:cursor-grabbing",
                )}
                title={asset.name}
                draggable={!readOnly}
                onDragStart={(e) => {
                  if (readOnly) return;
                  e.dataTransfer.setData(
                    "application/x-aktion-asset",
                    JSON.stringify({
                      url: `/api/assets/${asset.id}`,
                      name: asset.name,
                      width: asset.width,
                      height: asset.height,
                    }),
                  );
                  e.dataTransfer.effectAllowed = "copy";
                }}
              >
                <div className="checkerboard relative aspect-square">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/assets/${asset.id}`}
                    alt={asset.name}
                    loading="lazy"
                    draggable={false}
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                  {!readOnly && (
                    <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        title="Insert into design"
                        className="rounded-md bg-bg-2 p-1.5 text-text-1 hover:bg-accent hover:text-white"
                        onClick={() => insertAsset(asset)}
                      >
                        <ImagePlus size={13} />
                      </button>
                      <button
                        title="Delete asset"
                        className="rounded-md bg-bg-2 p-1.5 text-text-1 hover:bg-danger hover:text-white"
                        onClick={() => void deleteAsset(asset)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="px-1.5 py-1">
                  <p className="truncate text-[11px] text-text-1">{asset.name}</p>
                  <p className="text-[10px] text-text-3">{formatBytes(asset.size)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {dragOver && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-accent-muted">
          <p className="rounded-md bg-bg-2 px-3 py-1.5 text-xs font-medium text-text-1 shadow-lg">
            Drop images to upload
          </p>
        </div>
      )}
    </div>
  );
}

export default AssetsPanel;
