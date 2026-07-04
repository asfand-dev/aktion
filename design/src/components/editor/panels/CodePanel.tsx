"use client";
/**
 * Live Aktion code panel: shows the clean, exportable program for the frame
 * the user is working in (selected frame, frame containing the selected node,
 * or the first frame of the active page), regenerated on every document
 * mutation. Copy / download actions mirror the export pipeline.
 */
import { useEffect, useMemo, useState } from "react";
import { Copy, Download, FileCode2, Frame as FrameIcon } from "lucide-react";
import { exportProgram, standaloneHtml } from "@/design/codegen";
import { findFrame, findNode } from "@/design/document";
import { getSchemaIndex } from "@/design/schema";
import { useEditor } from "@/store/editor-store";
import { downloadText } from "@/lib/utils";
import { toast, Tooltip } from "@/components/ui";

// ---------------------------------------------------------------------------
// Tiny tokenizer — regex alternation, rendered as spans (no innerHTML).
// ---------------------------------------------------------------------------

interface Token {
  text: string;
  className?: string;
}

const TOKEN_RE =
  /(\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*")|(\$[A-Za-z_]\w*)|([A-Z]\w*(?=\s*\())|(\b\d+(?:\.\d+)?\b)/g;

const TOKEN_CLASSES = [
  "text-text-3", // 1: comment
  "text-[#9ece6a]", // 2: string
  "text-[#bb9af7]", // 3: $atom
  "text-[#7aa2f7]", // 4: Component call
  "text-[#ff9e64]", // 5: number
];

function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(code)) !== null) {
    if (match.index > last) tokens.push({ text: code.slice(last, match.index) });
    let className: string | undefined;
    for (let g = 1; g <= 5; g++) {
      if (match[g] !== undefined) {
        className = TOKEN_CLASSES[g - 1];
        break;
      }
    }
    tokens.push({ text: match[0], className });
    last = match.index + match[0].length;
  }
  if (last < code.length) tokens.push({ text: code.slice(last) });
  return tokens;
}

function fileBase(name: string): string {
  const slug = name
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "frame";
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export default function CodePanel() {
  const document = useEditor((s) => s.document);
  const docRevision = useEditor((s) => s.docRevision);
  const selection = useEditor((s) => s.selection);
  const activePageId = useEditor((s) => s.activePageId);

  const [code, setCode] = useState<string | null>(null);

  // Target frame: selected frame > frame containing the selected node >
  // first frame of the active page.
  const targetFrame = useMemo(() => {
    for (const id of selection) {
      const frameHit = findFrame(document, id);
      if (frameHit) return frameHit.frame;
      const loc = findNode(document, id);
      if (loc) return loc.frame;
    }
    const page =
      document.pages.find((p) => p.id === activePageId) ?? document.pages[0];
    return page?.frames[0] ?? null;
  }, [document, selection, activePageId]);

  const targetFrameId = targetFrame?.id ?? null;

  useEffect(() => {
    if (!targetFrame) {
      setCode(null);
      return;
    }
    let cancelled = false;
    getSchemaIndex()
      .then((index) => {
        if (!cancelled) setCode(exportProgram(targetFrame, document, index));
      })
      .catch(() => {
        if (!cancelled) setCode("// Failed to load the Aktion runtime");
      });
    return () => {
      cancelled = true;
    };
    // Regenerate on every document mutation and frame-target change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docRevision, targetFrameId]);

  const tokens = useMemo(() => (code ? tokenize(code) : []), [code]);

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      toast("Copied");
    } catch {
      toast("Copy failed", "error");
    }
  };

  const downloadAktion = () => {
    if (!code || !targetFrame) return;
    downloadText(code, `${fileBase(targetFrame.name)}.aktion`);
  };

  const downloadHtml = () => {
    if (!code || !targetFrame) return;
    downloadText(
      standaloneHtml(code, targetFrame.name, document.theme),
      `${fileBase(targetFrame.name)}.html`,
      "text/html",
    );
  };

  if (!targetFrame) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-bg-1 text-text-3">
        <FrameIcon size={20} />
        <p className="text-xs">Add a frame to see its Aktion code.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-1">
      <div className="flex shrink-0 items-center gap-2 border-b border-border-0 px-3 py-2">
        <span className="text-xs font-semibold text-text-1">Aktion code</span>
        <span className="truncate text-xs text-text-3">{targetFrame.name}</span>
        <div className="ml-auto flex items-center gap-0.5">
          <Tooltip label="Copy code">
            <button
              aria-label="Copy code"
              onClick={copy}
              className="rounded-md p-1.5 text-text-2 hover:bg-bg-3 hover:text-text-1"
            >
              <Copy size={13} />
            </button>
          </Tooltip>
          <Tooltip label="Download .aktion">
            <button
              aria-label="Download .aktion"
              onClick={downloadAktion}
              className="rounded-md p-1.5 text-text-2 hover:bg-bg-3 hover:text-text-1"
            >
              <Download size={13} />
            </button>
          </Tooltip>
          <Tooltip label="Download .html">
            <button
              aria-label="Download .html"
              onClick={downloadHtml}
              className="rounded-md p-1.5 text-text-2 hover:bg-bg-3 hover:text-text-1"
            >
              <FileCode2 size={13} />
            </button>
          </Tooltip>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <pre className="p-3 font-mono text-xs leading-relaxed text-text-2">
          {tokens.map((t, i) =>
            t.className ? (
              <span key={i} className={t.className}>
                {t.text}
              </span>
            ) : (
              <span key={i}>{t.text}</span>
            ),
          )}
        </pre>
      </div>
    </div>
  );
}
