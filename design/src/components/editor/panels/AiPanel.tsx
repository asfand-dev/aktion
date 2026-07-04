"use client";
/**
 * AI designer panel: describe a design, stream the generated Aktion program
 * from OpenRouter, and apply it as a new frame or as changes to the selected
 * frame. Everything applied goes through the normal document mutation path,
 * so undo (⌘Z) always reverts an AI change.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles, Square, TriangleAlert } from "lucide-react";
import { useEditor } from "@/store/editor-store";
import { findFrame, findNode } from "@/design/document";
import { getSchemaIndex } from "@/design/schema";
import { exportProgram } from "@/design/codegen";
import { programToNodes, stripFences } from "@/design/aktion-import";
import { buildProjectContext } from "@/design/ai-context";
import { api } from "@/lib/api";
import { Button, Field, Segmented, Spinner, TextArea, toast } from "@/components/ui";
import { cn } from "@/lib/utils";

type Mode = "create" | "add" | "edit";

const CREATE_PRESETS = [
  { label: "Desktop", width: 1280, height: 800 },
  { label: "Phone", width: 393, height: 852 },
] as const;

const EXAMPLES: Record<Mode, string[]> = {
  create: [
    "A SaaS landing page with pricing",
    "A login screen with social sign-in",
    "An analytics dashboard with KPIs",
    "A checkout page for a sneaker store",
  ],
  add: [
    "A pricing card with three tiers",
    "A testimonial card with avatar",
    "A newsletter signup form",
    "A stats row with 4 KPIs",
  ],
  edit: [
    "Make the hero darker and more dramatic",
    "Add a testimonials section before the footer",
    "Tighten the spacing and round the buttons",
  ],
};

export function AiPanel() {
  const projectId = useEditor((s) => s.projectId);
  const readOnly = useEditor((s) => s.readOnly);
  const selection = useEditor((s) => s.selection);
  const doc = useEditor((s) => s.document);
  const activePageId = useEditor((s) => s.activePageId);

  const [config, setConfig] = useState<{ configured: boolean; model: string | null } | null>(null);
  const [mode, setMode] = useState<Mode>("create");
  const [preset, setPreset] = useState<(typeof CREATE_PRESETS)[number]["label"]>("Desktop");
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [streamed, setStreamed] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    api
      .get<{ configured: boolean; model: string | null }>(`/api/projects/${projectId}/ai`)
      .then(setConfig)
      .catch(() => setConfig({ configured: false, model: null }));
  }, [projectId]);

  // Frame the edit applies to: selected frame, or the frame containing the
  // selected node, else the first frame of the active page.
  const targetFrame = useMemo(() => {
    for (const id of selection) {
      const hit = findFrame(doc, id);
      if (hit) return hit.frame;
      const loc = findNode(doc, id);
      if (loc) return loc.frame;
    }
    const page = doc.pages.find((p) => p.id === activePageId) ?? doc.pages[0];
    return page?.frames[0] ?? null;
  }, [selection, doc, activePageId]);

  // Keep the streamed code scrolled to the bottom.
  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [streamed]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusy(false);
  }, []);

  const generate = async () => {
    if (busy || readOnly || prompt.trim().length < 3) return;
    setError(null);
    setWarnings([]);
    setStreamed("");
    setBusy(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const schema = await getSchemaIndex();

      const size =
        mode !== "create" && targetFrame
          ? { width: targetFrame.width, height: targetFrame.height }
          : CREATE_PRESETS.find((p) => p.label === preset)!;

      const currentProgram =
        mode === "edit" && targetFrame
          ? exportProgram(targetFrame, doc, schema, { inlineSymbols: true })
          : undefined;

      // Theme + page inventory + navigation, so results stay on-brand and
      // connected to the rest of the project.
      const context = buildProjectContext(
        doc,
        activePageId,
        mode === "edit" ? targetFrame?.id : undefined,
      );

      const requestBody = {
        prompt: prompt.trim(),
        mode: mode === "edit" ? "edit" : "create",
        scope: mode === "add" ? "component" : "page",
        width: Math.round(size.width),
        height: Math.round(size.height),
        currentProgram,
        context,
      };

      const streamOnce = async (extraInstruction?: string): Promise<string> => {
        const res = await fetch(`/api/projects/${projectId}/ai`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify(
            extraInstruction
              ? { ...requestBody, prompt: `${requestBody.prompt}\n\n(${extraInstruction})` }
              : requestBody,
          ),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(json?.error ?? `AI request failed (${res.status})`);
        }
        if (!res.body) throw new Error("No response stream");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let full = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          full += decoder.decode(value, { stream: true });
          setStreamed(full);
        }
        return full + decoder.decode();
      };

      const convert = async (raw: string) => {
        const code = stripFences(raw);
        if (!code.includes("$app")) {
          return { roots: [], warnings: ["The model returned no Aktion program"] };
        }
        return programToNodes(code, schema);
      };

      // One automatic retry with a corrective instruction when the result
      // doesn't convert cleanly — turns most flaky generations into usable ones.
      let { roots, warnings: importWarnings } = await convert(await streamOnce());
      const badness =
        roots.length === 0 ||
        importWarnings.filter((w) => /Unknown component|no Aktion program|Parse:/.test(w)).length >= 3;
      if (badness) {
        setStreamed("");
        setWarnings(["First attempt didn't convert cleanly — retrying…"]);
        ({ roots, warnings: importWarnings } = await convert(
          await streamOnce(
            "IMPORTANT: the previous attempt violated the output contract. Output ONLY a valid Aktion program starting with $app(, using ONLY documented components and literal props.",
          ),
        ));
      }
      setWarnings(importWarnings);
      if (roots.length === 0) {
        throw new Error("Could not convert the result into layers — try again");
      }

      const state = useEditor.getState();
      if (mode === "edit" && targetFrame) {
        state.replaceFrameChildren(targetFrame.id, roots);
        state.select([targetFrame.id]);
        toast(`Updated ${targetFrame.name} — ⌘Z to undo`, "success");
        void import("../frame-fit").then(({ fitFrameHeightToContent }) =>
          fitFrameHeightToContent(targetFrame.id),
        );
      } else if (mode === "add" && targetFrame) {
        // Insert into the selected container when one is selected, otherwise
        // free-place near the center of the target frame.
        const selected = state.selection[0];
        const loc = selected ? findNode(state.document, selected) : null;
        const container =
          loc &&
          loc.node.type === "component" &&
          loc.node.component &&
          schema.byName.get(loc.node.component)?.acceptsChildren
            ? loc.node.id
            : null;
        const ids: string[] = [];
        state.mutateDoc((draft) => {
          const frame = draft.pages
            .flatMap((p) => p.frames)
            .find((f) => f.id === targetFrame.id);
          if (!frame) return;
          roots.forEach((node, i) => {
            if (container) {
              const parent = findNode(draft, container);
              if (parent) parent.node.children.push(node);
            } else {
              node.layout = {
                x: Math.max(24, Math.round(frame.width / 2 - 160 + i * 24)),
                y: Math.max(24, Math.round(frame.height / 3 + i * 24)),
              };
              frame.children.push(node);
            }
            ids.push(node.id);
          });
        });
        if (ids.length) state.select(ids);
        toast(`Added ${ids.length} element${ids.length === 1 ? "" : "s"} — ⌘Z to undo`, "success");
      } else {
        const page = doc.pages.find((p) => p.id === activePageId) ?? doc.pages[0];
        const rightEdge = page?.frames.length
          ? Math.max(...page.frames.map((f) => f.x + f.width))
          : 0;
        const top = page?.frames.length ? Math.min(...page.frames.map((f) => f.y)) : 0;
        const name = titleFrom(prompt);
        const frameId = state.addFrame(name, rightEdge + 80, top, size.width, size.height);
        if (frameId) {
          state.replaceFrameChildren(frameId, roots);
          state.select([frameId]);
          // Grow the frame to show ALL generated content, then fit the view.
          const { fitFrameHeightToContent } = await import("../frame-fit");
          await fitFrameHeightToContent(frameId);
          const viewport = document
            .querySelector(".canvas-surface")
            ?.getBoundingClientRect();
          if (viewport) state.zoomToFit(viewport);
        }
        toast(`Created "${name}" — ⌘Z to undo`, "success");
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError(err instanceof Error ? err.message : "Generation failed");
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
    }
  };

  if (config === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!config.configured) {
    return (
      <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
        <div className="flex items-center gap-2 text-text-1">
          <Sparkles size={15} className="text-accent" />
          <h2 className="text-sm font-semibold">AI Designer</h2>
        </div>
        <p className="text-xs leading-relaxed text-text-2">
          Generate and edit designs from a text prompt. To enable it, add your
          OpenRouter credentials to <code className="rounded bg-bg-3 px-1">design/.env</code>:
        </p>
        <pre className="rounded-lg border border-border-0 bg-bg-2 p-3 text-[11px] leading-relaxed text-text-2">
          {`OPENROUTER_API_KEY="sk-or-..."\nOPENROUTER_MODEL="anthropic/claude-sonnet-4.5"`}
        </pre>
        <p className="text-xs text-text-3">
          Then restart the dev server. Any OpenRouter-hosted model works; strong
          coding models produce the best designs.
        </p>
      </div>
    );
  }

  const editDisabled = !targetFrame;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-3 border-b border-border-0 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-text-1">
            <Sparkles size={15} className="text-accent" />
            <h2 className="text-sm font-semibold">AI Designer</h2>
          </div>
          <span className="max-w-[130px] truncate text-[10px] text-text-3" title={config.model ?? ""}>
            {config.model}
          </span>
        </div>

        <Segmented
          value={mode}
          onChange={(m) => setMode(m)}
          options={[
            { value: "create", label: "New frame", title: "Generate a full screen as a new frame" },
            { value: "add", label: "Add", title: "Generate a single component into the current frame" },
            { value: "edit", label: "Edit", title: targetFrame ? `Modify ${targetFrame.name}` : "Modify the selected frame" },
          ]}
        />

        {mode === "create" && (
          <Segmented
            value={preset}
            onChange={setPreset}
            options={CREATE_PRESETS.map((p) => ({
              value: p.label,
              label: `${p.label} ${p.width}×${p.height}`,
            }))}
          />
        )}
        {mode !== "create" && (
          <p className="text-xs text-text-3">
            {editDisabled
              ? "Select a frame on the canvas first."
              : mode === "edit"
                ? `Rewrites “${targetFrame!.name}” with your change.`
                : `Adds the generated element to “${targetFrame!.name}” (into the selected container, or free-placed).`}
          </p>
        )}

        <Field
          label={
            mode === "edit"
              ? "Describe the change"
              : mode === "add"
                ? "Describe the component"
                : "Describe the design"
          }
        >
          <TextArea
            rows={4}
            value={prompt}
            placeholder={
              mode === "edit"
                ? "Make the hero darker and add a testimonials section…"
                : mode === "add"
                  ? "A pricing card with a highlighted Pro tier…"
                  : "A landing page for an AI note-taking app…"
            }
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void generate();
            }}
            disabled={busy || readOnly}
          />
        </Field>

        {!busy && prompt.trim().length === 0 && (
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES[mode].map((ex) => (
              <button
                key={ex}
                className="rounded-full border border-border-1 px-2 py-0.5 text-[11px] text-text-2 hover:border-accent hover:text-text-1"
                onClick={() => setPrompt(ex)}
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="primary"
            className="flex-1"
            disabled={
              readOnly || busy || prompt.trim().length < 3 || (mode !== "create" && editDisabled)
            }
            onClick={() => void generate()}
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {busy
              ? "Generating…"
              : mode === "edit"
                ? "Apply changes"
                : mode === "add"
                  ? "Generate & add"
                  : "Generate design"}
          </Button>
          {busy && (
            <Button variant="secondary" onClick={stop} title="Stop">
              <Square size={12} />
            </Button>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-2.5 py-2 text-xs text-[#ffb3a5]">
            <TriangleAlert size={13} className="mt-px shrink-0" />
            {error}
          </div>
        )}
        {warnings.length > 0 && (
          <ul className="space-y-1 rounded-md border border-border-0 bg-bg-2 px-2.5 py-2">
            {warnings.slice(0, 5).map((w, i) => (
              <li key={i} className="text-[11px] text-warning/90">
                {w}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Streaming program preview */}
      <div className="min-h-0 flex-1 overflow-hidden p-3">
        <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border-0 bg-bg-0">
          <div className="flex items-center justify-between border-b border-border-0 px-2.5 py-1.5">
            <span className="text-[10px] uppercase tracking-wide text-text-3">
              Generated Aktion
            </span>
            {busy && <Spinner size={11} />}
          </div>
          <pre
            ref={streamRef}
            className={cn(
              "min-h-0 flex-1 overflow-auto p-2.5 font-mono text-[10.5px] leading-relaxed",
              streamed ? "text-text-2" : "text-text-3",
            )}
          >
            {streamed ||
              "The generated program streams in here, then becomes editable layers on the canvas."}
          </pre>
        </div>
      </div>
    </div>
  );
}

function titleFrom(prompt: string): string {
  const words = prompt.trim().split(/\s+/).slice(0, 5).join(" ");
  const clean = words.replace(/[.,;:!?]+$/, "");
  return clean.length > 2 ? `AI · ${clean.charAt(0).toUpperCase()}${clean.slice(1)}` : "AI Frame";
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export default AiPanel;
