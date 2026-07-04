"use client";
/**
 * Editor top bar: navigation, tools, project name, save state, zoom, and the
 * share/export/preview/code actions.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import {
  Code2,
  Download,
  FileUp,
  Frame as FrameIcon,
  Hand,
  Home,
  MousePointer2,
  Paintbrush,
  Play,
  Redo2,
  Share2,
  Undo2,
} from "lucide-react";
import { useEditor } from "@/store/editor-store";
import { Button, Menu, Segmented, Tooltip } from "@/components/ui";
import { cn } from "@/lib/utils";

export function Toolbar({
  onShare,
  onExport,
  onTheme,
  onImportAktion,
  onExportProject,
}: {
  onShare: () => void;
  onExport: () => void;
  onTheme: () => void;
  onImportAktion: () => void;
  onExportProject: () => void;
}) {
  const tool = useEditor((s) => s.tool);
  const setTool = useEditor((s) => s.setTool);
  const projectId = useEditor((s) => s.projectId);
  const projectName = useEditor((s) => s.projectName);
  const setProjectName = useEditor((s) => s.setProjectName);
  const saveState = useEditor((s) => s.saveState);
  const camera = useEditor((s) => s.camera);
  const zoomTo = useEditor((s) => s.zoomTo);
  const zoomToFit = useEditor((s) => s.zoomToFit);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const showCode = useEditor((s) => s.showCode);
  const setShowCode = useEditor((s) => s.setShowCode);
  const readOnly = useEditor((s) => s.readOnly);
  const role = useEditor((s) => s.role);

  const [editingName, setEditingName] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const viewportRect = () =>
    document.querySelector(".canvas-surface")?.getBoundingClientRect();

  const saveLabel =
    saveState === "saved"
      ? "Saved"
      : saveState === "saving"
        ? "Saving…"
        : saveState === "error"
          ? "Save failed"
          : "Unsaved changes";

  return (
    <header className="flex h-12 items-center gap-2 border-b border-border-0 bg-bg-1 px-2">
      {/* Left: home + tools + history */}
      <div className="flex items-center gap-1">
        <Tooltip label="Back to projects">
          <Link
            href="/projects"
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-2 hover:bg-bg-3 hover:text-text-1"
          >
            <Home size={15} />
          </Link>
        </Tooltip>
        <div className="mx-1 h-5 w-px bg-border-1" />
        <Segmented
          value={tool}
          onChange={setTool}
          options={[
            { value: "select", label: <MousePointer2 size={14} />, title: "Select (V)" },
            { value: "hand", label: <Hand size={14} />, title: "Hand (H)" },
            { value: "frame", label: <FrameIcon size={14} />, title: "Frame (F)" },
          ]}
        />
        <div className="mx-1 h-5 w-px bg-border-1" />
        <Tooltip label="Undo (⌘Z)">
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-2 hover:bg-bg-3 hover:text-text-1 disabled:opacity-30"
            disabled={!canUndo || readOnly}
            onClick={undo}
          >
            <Undo2 size={15} />
          </button>
        </Tooltip>
        <Tooltip label="Redo (⇧⌘Z)">
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-2 hover:bg-bg-3 hover:text-text-1 disabled:opacity-30"
            disabled={!canRedo || readOnly}
            onClick={redo}
          >
            <Redo2 size={15} />
          </button>
        </Tooltip>
      </div>

      {/* Center: project name + save state */}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
        {editingName && !readOnly ? (
          <input
            ref={nameRef}
            autoFocus
            defaultValue={projectName}
            className="h-7 w-56 rounded-md border border-accent bg-bg-2 px-2 text-center text-[13px] text-text-1 focus:outline-none"
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (value && value !== projectName) setProjectName(value);
              setEditingName(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditingName(false);
            }}
          />
        ) : (
          <button
            className="max-w-64 truncate rounded-md px-2 py-1 text-[13px] font-medium text-text-1 hover:bg-bg-3"
            onDoubleClick={() => setEditingName(true)}
            onClick={() => readOnly || setEditingName(true)}
            title={projectName}
          >
            {projectName || "Untitled"}
          </button>
        )}
        <span
          className={cn(
            "flex items-center gap-1.5 text-[11px]",
            saveState === "error" ? "text-danger" : "text-text-3",
          )}
        >
          <span
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              saveState === "saved" && "bg-success",
              saveState === "saving" && "bg-warning",
              saveState === "dirty" && "bg-text-3",
              saveState === "error" && "bg-danger",
            )}
          />
          {readOnly ? "View only" : saveLabel}
        </span>
        {role !== "owner" && (
          <span className="rounded-full border border-border-1 px-2 py-0.5 text-[10px] uppercase tracking-wide text-text-3">
            {role}
          </span>
        )}
      </div>

      {/* Right: zoom + actions */}
      <div className="flex items-center gap-1.5">
        <Menu
          align="end"
          trigger={
            <button className="h-8 rounded-md px-2 text-xs text-text-2 hover:bg-bg-3 hover:text-text-1">
              {Math.round(camera.zoom * 100)}%
            </button>
          }
          items={[
            { label: "Zoom to fit (⇧1)", onClick: () => { const r = viewportRect(); if (r) zoomToFit(r); } },
            { label: "50%", onClick: () => zoomTo(0.5, viewportRect()) },
            { label: "100% (⌘0)", onClick: () => zoomTo(1, viewportRect()) },
            { label: "200%", onClick: () => zoomTo(2, viewportRect()) },
          ]}
        />
        <Tooltip label="Project theme">
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-2 hover:bg-bg-3 hover:text-text-1"
            onClick={onTheme}
          >
            <Paintbrush size={15} />
          </button>
        </Tooltip>
        <Tooltip label="Aktion code">
          <button
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md",
              showCode
                ? "bg-accent-muted text-accent"
                : "text-text-2 hover:bg-bg-3 hover:text-text-1",
            )}
            onClick={() => setShowCode(!showCode)}
          >
            <Code2 size={15} />
          </button>
        </Tooltip>
        <Menu
          align="end"
          trigger={
            <Tooltip label="Import / export">
              <button className="flex h-8 w-8 items-center justify-center rounded-md text-text-2 hover:bg-bg-3 hover:text-text-1">
                <FileUp size={15} />
              </button>
            </Tooltip>
          }
          items={[
            { label: "Import .aktion file…", onClick: onImportAktion, disabled: readOnly },
            { label: "Export frame (PNG / SVG / code)…", onClick: onExport },
            "separator",
            { label: "Export project (.json)", onClick: onExportProject },
          ]}
        />
        <Tooltip label="Export frame">
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-2 hover:bg-bg-3 hover:text-text-1"
            onClick={onExport}
          >
            <Download size={15} />
          </button>
        </Tooltip>
        {role === "owner" && (
          <Button variant="secondary" size="sm" onClick={onShare}>
            <Share2 size={13} />
            Share
          </Button>
        )}
        <Button
          variant="primary"
          size="sm"
          onClick={() => window.open(`/preview/${projectId}`, "_blank")}
        >
          <Play size={13} />
          Preview
        </Button>
      </div>
    </header>
  );
}
