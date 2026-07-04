"use client";
/**
 * The editor screen: loads the project into the store, then composes the
 * toolbar, left panel (layers / components / assets / AI), canvas, right
 * panel (inspector or code), and the share/export/theme modals.
 */
import { useEffect, useRef, useState } from "react";
import { Component, Image as ImageIcon, Layers, Sparkles } from "lucide-react";
import { useEditor } from "@/store/editor-store";
import { api, ApiError } from "@/lib/api";
import type { ProjectDetail, ProjectSummary } from "@/design/types";
import { Spinner, Toaster, toast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Canvas } from "./Canvas";
import { Toolbar } from "./Toolbar";
import { useAutosave } from "./useAutosave";
import { useEditorShortcuts } from "./useEditorShortcuts";
import { LayersPanel } from "./panels/LayersPanel";
import { PalettePanel } from "./panels/PalettePanel";
import { AssetsPanel } from "./panels/AssetsPanel";
import { AiPanel } from "./panels/AiPanel";
import { InspectorPanel } from "./panels/InspectorPanel";
import CodePanel from "./panels/CodePanel";
import ExportModal from "./modals/ExportModal";
import ThemeModal from "./modals/ThemeModal";
import ShareModal from "@/components/dashboard/ShareModal";
import { exportProjectJson, readAktionFile } from "@/lib/project-transfer";

export function EditorShell({ projectId }: { projectId: string }) {
  const loaded = useEditor((s) => s.loaded && s.projectId === projectId);
  const readOnly = useEditor((s) => s.readOnly);
  const leftTab = useEditor((s) => s.leftTab);
  const setLeftTab = useEditor((s) => s.setLeftTab);
  const showCode = useEditor((s) => s.showCode);

  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const aktionFileRef = useRef<HTMLInputElement>(null);

  const importAktionFile = async (file: File) => {
    try {
      const [{ programToNodes }, { getSchemaIndex }] = await Promise.all([
        import("@/design/aktion-import"),
        import("@/design/schema"),
      ]);
      const text = await readAktionFile(file);
      const schema = await getSchemaIndex();
      const { roots, warnings } = await programToNodes(text, schema);
      if (roots.length === 0) {
        toast(warnings[0] ?? "No renderable components in that file", "error");
        return;
      }
      const state = useEditor.getState();
      const page =
        state.document.pages.find((p) => p.id === state.activePageId) ??
        state.document.pages[0];
      const rightEdge = page.frames.length
        ? Math.max(...page.frames.map((f) => f.x + f.width))
        : 0;
      const top = page.frames.length ? Math.min(...page.frames.map((f) => f.y)) : 0;
      const name = file.name.replace(/\.aktion$/i, "") || "Imported";
      const frameId = state.addFrame(name, rightEdge + 80, top, 1280, 800);
      if (frameId) {
        state.replaceFrameChildren(frameId, roots);
        state.select([frameId]);
        const { fitFrameHeightToContent } = await import("./frame-fit");
        await fitFrameHeightToContent(frameId);
        const viewport = document
          .querySelector(".canvas-surface")
          ?.getBoundingClientRect();
        if (viewport) state.zoomToFit(viewport);
      }
      toast(
        warnings.length
          ? `Imported with ${warnings.length} warning${warnings.length === 1 ? "" : "s"}`
          : `Imported "${name}"`,
        warnings.length ? "info" : "success",
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "Import failed", "error");
    }
  };

  const { saveNow } = useAutosave();
  useEditorShortcuts({ onSaveNow: saveNow });

  // Dev-only console access to the store + AI import pipeline for debugging.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    void (async () => {
      const [{ useEditor: store }, aktionImport, schema] = await Promise.all([
        import("@/store/editor-store"),
        import("@/design/aktion-import"),
        import("@/design/schema"),
      ]);
      (window as unknown as Record<string, unknown>).__designDebug = {
        store,
        programToNodes: aktionImport.programToNodes,
        getSchemaIndex: schema.getSchemaIndex,
      };
    })();
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ project: ProjectDetail }>(`/api/projects/${projectId}`)
      .then(({ project }) => {
        if (cancelled) return;
        useEditor.getState().loadProject(project);
        setProject(project);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError && err.status === 404
            ? "This project doesn't exist or you don't have access to it."
            : "Failed to load the project.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-bg-0">
        <p className="text-sm text-text-2">{error}</p>
        <a href="/projects" className="text-sm text-accent hover:underline">
          Back to projects
        </a>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-0">
        <Spinner size={22} />
      </div>
    );
  }

  const tabs = [
    { id: "layers" as const, icon: Layers, label: "Layers" },
    { id: "components" as const, icon: Component, label: "Components" },
    { id: "assets" as const, icon: ImageIcon, label: "Assets" },
    { id: "ai" as const, icon: Sparkles, label: "AI" },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg-0">
      <Toolbar
        onShare={() => setShareOpen(true)}
        onExport={() => setExportOpen(true)}
        onTheme={() => setThemeOpen(true)}
        onImportAktion={() => aktionFileRef.current?.click()}
        onExportProject={() => {
          toast("Preparing project export…", "info");
          exportProjectJson(projectId).catch((err) =>
            toast(err instanceof Error ? err.message : "Export failed", "error"),
          );
        }}
      />
      <input
        ref={aktionFileRef}
        type="file"
        accept=".aktion,text/plain"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void importAktionFile(file);
        }}
      />

      {readOnly && (
        <div className="border-b border-border-0 bg-accent-muted px-3 py-1.5 text-center text-xs text-text-1">
          You have view-only access — changes are disabled. Use Preview to interact
          with the design.
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* Left panel */}
        <aside className="flex w-[264px] shrink-0 flex-col border-r border-border-0 bg-bg-1">
          <div className="flex gap-0.5 border-b border-border-0 px-1.5 pt-1.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                title={tab.label}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 rounded-t-md px-1 pb-2 pt-2.5 text-[10px] font-medium tracking-wide",
                  leftTab === tab.id
                    ? "border-b-2 border-accent bg-bg-2/60 text-text-1"
                    : "border-b-2 border-transparent text-text-3 hover:bg-bg-2/40 hover:text-text-2",
                )}
                onClick={() => setLeftTab(tab.id)}
              >
                <tab.icon size={15} />
                {tab.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {leftTab === "layers" && <LayersPanel />}
            {leftTab === "components" && <PalettePanel />}
            {leftTab === "assets" && <AssetsPanel />}
            {leftTab === "ai" && <AiPanel />}
          </div>
        </aside>

        {/* Canvas */}
        <main className="relative min-w-0 flex-1">
          <Canvas />
        </main>

        {/* Right panel */}
        <aside className="flex w-[288px] shrink-0 flex-col border-l border-border-0 bg-bg-1">
          {showCode ? <CodePanel /> : <InspectorPanel />}
        </aside>
      </div>

      {project && (
        <ShareModal
          project={project}
          open={shareOpen}
          onClose={() => setShareOpen(false)}
        />
      )}
      <ExportModal open={exportOpen} onClose={() => setExportOpen(false)} />
      <ThemeModal open={themeOpen} onClose={() => setThemeOpen(false)} />
      <Toaster />
    </div>
  );
}
