"use client";
/**
 * Export dialog: pick a frame of the active page and download it as a raster
 * image (PNG/JPEG via the offscreen render pipeline), an SVG (foreignObject
 * embed), or as source (.aktion / standalone .html).
 */
import { useEffect, useMemo, useState } from "react";
import { exportProgram, standaloneHtml } from "@/design/codegen";
import { findFrame, findNode } from "@/design/document";
import { getSchemaIndex } from "@/design/schema";
import {
  dataUrlToBlob,
  exportFrameJpeg,
  exportFramePng,
  exportFrameSvg,
} from "@/lib/export";
import { downloadBlob, downloadText } from "@/lib/utils";
import { useEditor } from "@/store/editor-store";
import { Button, Field, Modal, Segmented, toast } from "@/components/ui";

type ExportFormat = "png" | "jpeg" | "svg" | "aktion" | "html";
type RasterScale = "1" | "2" | "3";

function fileBase(name: string): string {
  const slug = name
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "frame";
}

export default function ExportModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const document = useEditor((s) => s.document);
  const selection = useEditor((s) => s.selection);
  const activePageId = useEditor((s) => s.activePageId);

  const activePage = useMemo(
    () =>
      document.pages.find((p) => p.id === activePageId) ?? document.pages[0],
    [document, activePageId],
  );
  const frames = activePage?.frames ?? [];

  // Same default-target logic as the code panel: selected frame, frame
  // containing the selected node, else the page's first frame.
  const defaultFrameId = useMemo(() => {
    for (const id of selection) {
      const frameHit = findFrame(document, id);
      if (frameHit) return frameHit.frame.id;
      const loc = findNode(document, id);
      if (loc) return loc.frame.id;
    }
    return frames[0]?.id ?? "";
  }, [document, selection, frames]);

  const [frameId, setFrameId] = useState(defaultFrameId);
  const [format, setFormat] = useState<ExportFormat>("png");
  const [scale, setScale] = useState<RasterScale>("2");
  const [busy, setBusy] = useState(false);

  // Re-seed the frame choice each time the dialog opens.
  useEffect(() => {
    if (open) setFrameId(defaultFrameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const frame = frames.find((f) => f.id === frameId) ?? frames[0] ?? null;
  const isRaster = format === "png" || format === "jpeg";

  const handleExport = async () => {
    if (!frame) return;
    setBusy(true);
    try {
      const schema = await getSchemaIndex();
      const target = { frame, doc: document, schema };
      const base = fileBase(frame.name);
      const factor = Number(scale);

      if (format === "png") {
        const dataUrl = await exportFramePng(target, factor);
        downloadBlob(dataUrlToBlob(dataUrl), `${base}.png`);
      } else if (format === "jpeg") {
        const dataUrl = await exportFrameJpeg(target, factor);
        downloadBlob(dataUrlToBlob(dataUrl), `${base}.jpg`);
      } else if (format === "svg") {
        const svg = await exportFrameSvg(target);
        downloadText(svg, `${base}.svg`, "image/svg+xml");
      } else if (format === "aktion") {
        downloadText(exportProgram(frame, document, schema), `${base}.aktion`);
      } else {
        const program = exportProgram(frame, document, schema);
        downloadText(
          standaloneHtml(program, frame.name, document.theme),
          `${base}.html`,
          "text/html",
        );
      }
      toast(`Exported ${frame.name}`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Export failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Export">
      {frames.length === 0 || !frame ? (
        <div className="py-6 text-center text-xs text-text-3">
          This page has no frames to export yet.
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="Frame">
            <select
              value={frame.id}
              onChange={(e) => setFrameId(e.target.value)}
              className="h-8 w-full rounded-md border border-border-1 bg-bg-2 px-2.5 text-[13px] text-text-1 focus:border-accent focus:outline-none"
            >
              {frames.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} — {f.width} × {f.height}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Format">
            <Segmented<ExportFormat>
              value={format}
              onChange={setFormat}
              options={[
                { value: "png", label: "PNG" },
                { value: "jpeg", label: "JPEG" },
                { value: "svg", label: "SVG" },
                { value: "aktion", label: "Aktion" },
                { value: "html", label: "HTML" },
              ]}
            />
          </Field>

          {isRaster && (
            <Field label="Scale">
              <Segmented<RasterScale>
                value={scale}
                onChange={setScale}
                options={[
                  { value: "1", label: "1x" },
                  { value: "2", label: "2x" },
                  { value: "3", label: "3x" },
                ]}
              />
            </Field>
          )}

          <p className="text-xs leading-relaxed text-text-3">
            {isRaster &&
              `Output: ${frame.width * Number(scale)} × ${
                frame.height * Number(scale)
              } px.`}
            {format === "svg" &&
              "SVG embeds live HTML via foreignObject — best for web use."}
            {format === "aktion" &&
              "The frame's Aktion program — open it in any Aktion runtime."}
            {format === "html" &&
              "A standalone page that loads the Aktion runtime from the CDN."}
          </p>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleExport} loading={busy}>
              Export
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
