"use client";
/**
 * Full-screen interactive preview of a project's frames. Loads the project,
 * generates the clean Aktion program for the active frame, and renders it in
 * a live `<aktion-app>` — clicks, state, and navigation all work because the
 * Aktion runtime drives the frame, not a screenshot.
 */
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Frame as FrameIcon,
  Maximize,
} from "lucide-react";
import type { ProjectDetail } from "@/design/types";
import { exportProgram } from "@/design/codegen";
import { getSchemaIndex } from "@/design/schema";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Segmented, Spinner, Tooltip } from "@/components/ui";
import AktionHost from "@/components/aktion/AktionHost";

const STAGE_PADDING = 32;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "SELECT" ||
    tag === "TEXTAREA" ||
    target.isContentEditable
  );
}

function Select({
  value,
  onChange,
  children,
  ariaLabel,
}: {
  value: string;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  ariaLabel: string;
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={onChange}
      className="h-7 max-w-48 rounded-md border border-border-1 bg-bg-2 px-2 text-xs text-text-1 focus:border-accent focus:outline-none"
    >
      {children}
    </select>
  );
}

export default function PreviewShell({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activePageId, setActivePageId] = useState<string>("");
  const [activeFrameId, setActiveFrameId] = useState<string>("");
  const [fit, setFit] = useState(true);
  const [program, setProgram] = useState<string | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const stageRef = useRef<HTMLDivElement>(null);

  // -- Load the project ------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ project: ProjectDetail }>(`/api/projects/${projectId}`)
      .then(({ project }) => {
        if (cancelled) return;
        setProject(project);
        const page = project.document.pages[0];
        setActivePageId(page?.id ?? "");
        setActiveFrameId(page?.frames[0]?.id ?? "");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof ApiError ? err.message : "Failed to load project",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const doc = project?.document ?? null;
  const activePage = useMemo(
    () => doc?.pages.find((p) => p.id === activePageId) ?? doc?.pages[0] ?? null,
    [doc, activePageId],
  );
  const frames = activePage?.frames ?? [];
  const frameIndex = Math.max(
    0,
    frames.findIndex((f) => f.id === activeFrameId),
  );
  const frame = frames[frameIndex] ?? null;

  // -- Regenerate the program when the page/frame changes --------------------
  useEffect(() => {
    if (!doc || !frame) {
      setProgram(null);
      return;
    }
    let cancelled = false;
    getSchemaIndex()
      .then((index) => {
        if (!cancelled) setProgram(exportProgram(frame, doc, index));
      })
      .catch((err) => {
        console.error("Failed to load the Aktion runtime", err);
        if (!cancelled) setError("Failed to load the Aktion runtime");
      });
    return () => {
      cancelled = true;
    };
  }, [doc, frame]);

  // -- Stage measurement (fit-to-screen scaling) ------------------------------
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setStageSize({ width: rect.width, height: rect.height });
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [project]);

  const scale = useMemo(() => {
    if (!fit || !frame || stageSize.width === 0 || stageSize.height === 0) {
      return 1;
    }
    return Math.min(
      1,
      (stageSize.width - STAGE_PADDING * 2) / frame.width,
      (stageSize.height - STAGE_PADDING * 2) / frame.height,
    );
  }, [fit, frame, stageSize]);

  // -- Frame navigation --------------------------------------------------------
  const goToFrame = useCallback(
    (delta: number) => {
      if (frames.length === 0) return;
      const next =
        (frameIndex + delta + frames.length) % frames.length;
      setActiveFrameId(frames[next].id);
    },
    [frames, frameIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToFrame(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goToFrame(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goToFrame]);

  // -- Render states -----------------------------------------------------------
  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-bg-0">
        <p className="text-sm text-text-2">{error}</p>
        <Link href="/" className="text-xs text-accent hover:underline">
          Back to projects
        </Link>
      </div>
    );
  }

  if (!project || !doc) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg-0">
        <Spinner size={20} />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-bg-0">
      {/* Top bar */}
      <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border-0 bg-bg-1 px-3">
        <Tooltip label="Back to editor">
          <Link
            href={`/editor/${projectId}`}
            aria-label="Back to editor"
            className="rounded-md p-1.5 text-text-2 hover:bg-bg-3 hover:text-text-1"
          >
            <ArrowLeft size={15} />
          </Link>
        </Tooltip>
        <span className="max-w-56 truncate text-[13px] font-medium text-text-1">
          {project.name}
        </span>

        <div className="mx-1 h-4 w-px bg-border-1" />

        {doc.pages.length > 1 && (
          <Select
            ariaLabel="Page"
            value={activePage?.id ?? ""}
            onChange={(e) => {
              const page = doc.pages.find((p) => p.id === e.target.value);
              setActivePageId(e.target.value);
              setActiveFrameId(page?.frames[0]?.id ?? "");
            }}
          >
            {doc.pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        )}

        {frames.length > 0 && (
          <div className="flex items-center gap-1">
            <Tooltip label="Previous frame (←)">
              <button
                aria-label="Previous frame"
                onClick={() => goToFrame(-1)}
                disabled={frames.length < 2}
                className="rounded-md p-1 text-text-2 hover:bg-bg-3 hover:text-text-1 disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
            </Tooltip>
            <Select
              ariaLabel="Frame"
              value={frame?.id ?? ""}
              onChange={(e) => setActiveFrameId(e.target.value)}
            >
              {frames.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </Select>
            <Tooltip label="Next frame (→)">
              <button
                aria-label="Next frame"
                onClick={() => goToFrame(1)}
                disabled={frames.length < 2}
                className="rounded-md p-1 text-text-2 hover:bg-bg-3 hover:text-text-1 disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
            </Tooltip>
            <span className="ml-1 whitespace-nowrap text-xs tabular-nums text-text-3">
              {frameIndex + 1} / {frames.length}
            </span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-3">
          {frame && (
            <span className="whitespace-nowrap text-xs tabular-nums text-text-3">
              {frame.width} × {frame.height}
            </span>
          )}
          <Segmented
            value={fit ? "fit" : "full"}
            onChange={(v) => setFit(v === "fit")}
            options={[
              {
                value: "fit",
                label: <Maximize size={12} />,
                title: "Fit to screen",
              },
              { value: "full", label: "100%", title: "Actual size" },
            ]}
          />
        </div>
      </header>

      {/* Stage */}
      <div
        ref={stageRef}
        className={cn("relative flex-1", fit ? "overflow-hidden" : "overflow-auto")}
      >
        {!frame ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-text-3">
            <FrameIcon size={24} />
            <p className="text-sm">
              This page has no frames yet — add one in the editor.
            </p>
          </div>
        ) : (
          <div className="flex min-h-full" style={{ padding: STAGE_PADDING }}>
            {/* Auto margins center the frame when it fits and collapse to
                zero when it overflows, keeping every edge scroll-reachable. */}
            <div
              style={{
                position: "relative",
                width: frame.width * scale,
                height: frame.height * scale,
                flexShrink: 0,
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              <div
                className="overflow-hidden rounded-md bg-white shadow-2xl"
                style={{
                  position: "absolute",
                  left: "50%",
                  top: 0,
                  width: frame.width,
                  height: frame.height,
                  background: frame.background,
                  transform: `translateX(-50%) scale(${scale})`,
                  transformOrigin: "top center",
                }}
              >
                {program !== null ? (
                  <AktionHost
                    program={program}
                    theme={doc.theme}
                    className="h-full w-full"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Spinner size={18} />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
