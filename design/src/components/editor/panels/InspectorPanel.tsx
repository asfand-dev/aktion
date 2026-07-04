"use client";
/**
 * Inspector panel — context-sensitive right sidebar. Shows project settings
 * when nothing is selected, frame geometry for frames, schema-driven prop
 * editors plus a friendly `sx` style section for component nodes, and symbol
 * info for instances.
 */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { AlignCenter, AlignLeft, AlignRight, Info, X } from "lucide-react";
import { getSchemaIndex, type ComponentInfo, type PropInfo, type SchemaIndex } from "@/design/schema";
import { findFrame, findNode } from "@/design/document";
import { FRAME_PRESETS } from "@/design/presets";
import { isExprValue, type DesignNode, type Frame, type PropValue } from "@/design/types";
import { useEditor } from "@/store/editor-store";
import { Button, Segmented, Spinner, TextArea, TextInput, toast } from "@/components/ui";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Small local primitives
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-border-0 pb-3">
      <h3 className="sticky top-0 z-10 bg-bg-1 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-text-3">
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Row({
  label,
  required,
  title,
  children,
}: {
  label: string;
  required?: boolean;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-2 px-3">
      <span className="truncate text-xs text-text-2" title={title ?? label}>
        {label}
        {required && <span className="text-accent">*</span>}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-7 w-full rounded-md border border-border-1 bg-bg-2 px-1.5 text-xs text-text-1 focus:border-accent focus:outline-none disabled:opacity-50",
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

type DebouncedProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onCommit: (v: string) => void;
  mono?: boolean;
};

/** Text input that commits ~300ms after typing stops (and on blur/Enter). */
function DebouncedTextInput({ value, onCommit, mono, className, ...rest }: DebouncedProps) {
  const [text, setText] = useState(value);
  const committed = useRef(value);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    if (text === committed.current) return;
    const t = window.setTimeout(() => {
      committed.current = text;
      commitRef.current(text);
    }, 300);
    return () => window.clearTimeout(t);
  }, [text]);

  return (
    <TextInput
      {...rest}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== committed.current) {
          committed.current = text;
          commitRef.current(text);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      className={cn("h-7 text-xs", mono && "font-mono", className)}
    />
  );
}

function DebouncedTextArea({
  value,
  onCommit,
  disabled,
}: {
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value);
  const committed = useRef(value);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setText(value);
    }
  }, [value]);

  useEffect(() => {
    if (text === committed.current) return;
    const t = window.setTimeout(() => {
      committed.current = text;
      commitRef.current(text);
    }, 300);
    return () => window.clearTimeout(t);
  }, [text]);

  return (
    <TextArea
      rows={3}
      disabled={disabled}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text !== committed.current) {
          committed.current = text;
          commitRef.current(text);
        }
      }}
      className="min-h-16 text-xs"
    />
  );
}

function NumberField({
  value,
  onCommit,
  disabled,
  min,
}: {
  value: number;
  onCommit: (n: number) => void;
  disabled?: boolean;
  min?: number;
}) {
  return (
    <DebouncedTextInput
      type="number"
      disabled={disabled}
      value={String(Math.round(value * 100) / 100)}
      onCommit={(t) => {
        const n = Number(t);
        if (t.trim() === "" || Number.isNaN(n)) return;
        onCommit(min !== undefined ? Math.max(min, n) : n);
      }}
    />
  );
}

function toHex(value: string): string | null {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  const short = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/.exec(value);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  return null;
}

function ColorField({
  value,
  onChange,
  disabled,
  placeholder = "#hex or token",
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="checkerboard relative h-6 w-6 shrink-0 overflow-hidden rounded border border-border-1">
        <span className="absolute inset-0" style={{ background: value || "transparent" }} />
        <input
          type="color"
          value={toHex(value) ?? "#ffffff"}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
          aria-label="Pick color"
        />
      </span>
      <DebouncedTextInput
        mono
        className="h-6 flex-1"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onCommit={onChange}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prop rows (schema-driven)
// ---------------------------------------------------------------------------

type EditorKind = "string" | "number" | "boolean" | "enum" | "expr";

function editorKind(prop: PropInfo): EditorKind {
  if (prop.enum && prop.enum.length > 0) return "enum";
  if (prop.type === "string") return "string";
  if (prop.type === "number") return "number";
  if (prop.type === "boolean") return "boolean";
  return "expr"; // callable / union / unknown / complex
}

function asDisplayString(value: PropValue | undefined): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function PropRow({
  prop,
  value,
  readOnly,
  onChange,
}: {
  prop: PropInfo;
  value: PropValue | undefined;
  readOnly: boolean;
  onChange: (v: PropValue | undefined) => void;
}) {
  const kind = editorKind(prop);
  const isExpr = isExprValue(value);
  const [exprMode, setExprMode] = useState(isExpr);
  useEffect(() => {
    if (isExpr) setExprMode(true);
  }, [isExpr]);

  const showExpr = kind === "expr" || exprMode || isExpr;
  const isSet = value !== undefined;

  let editor: ReactNode;
  if (showExpr) {
    editor = (
      <DebouncedTextInput
        mono
        disabled={readOnly}
        value={isExpr ? (value as { $expr: string }).$expr : ""}
        placeholder="expression…"
        onCommit={(t) => onChange(t.trim() ? { $expr: t } : undefined)}
      />
    );
  } else if (kind === "boolean") {
    editor = (
      <input
        type="checkbox"
        checked={value === true}
        disabled={readOnly}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-(--accent)"
      />
    );
  } else if (kind === "enum") {
    editor = (
      <Select
        disabled={readOnly}
        value={typeof value === "string" ? value : ""}
        options={[
          { value: "", label: "—" },
          ...(prop.enum ?? []).map((v) => ({ value: v, label: v })),
        ]}
        onChange={(v) => onChange(v === "" ? undefined : v)}
      />
    );
  } else if (kind === "number") {
    editor = (
      <DebouncedTextInput
        type="number"
        disabled={readOnly}
        value={typeof value === "number" ? String(value) : ""}
        onCommit={(t) => {
          if (t.trim() === "") {
            onChange(undefined);
            return;
          }
          const n = Number(t);
          if (!Number.isNaN(n)) onChange(n);
        }}
      />
    );
  } else {
    const text = asDisplayString(value);
    const longText = /content|text|description/i.test(prop.name) && text.length > 40;
    editor = longText ? (
      <DebouncedTextArea
        disabled={readOnly}
        value={text}
        onCommit={(t) => onChange(t)}
      />
    ) : (
      <DebouncedTextInput
        disabled={readOnly}
        value={text}
        onCommit={(t) => onChange(t)}
      />
    );
  }

  return (
    <Row label={prop.name} required={prop.required} title={prop.description || prop.name}>
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">{editor}</div>
        {kind !== "expr" && !readOnly && (
          <button
            title={showExpr ? "Switch to value" : "Bind to expression"}
            className={cn(
              "h-7 w-6 shrink-0 rounded text-[10px] font-semibold italic",
              showExpr
                ? "bg-accent-muted text-accent"
                : "text-text-3 hover:bg-bg-3 hover:text-text-1",
            )}
            onClick={() => {
              if (showExpr) {
                if (isExprValue(value)) {
                  let parsed: PropValue | undefined;
                  try {
                    parsed = JSON.parse(value.$expr) as PropValue;
                  } catch {
                    parsed = undefined;
                  }
                  onChange(parsed);
                }
                setExprMode(false);
              } else {
                if (value !== undefined && !isExprValue(value)) {
                  onChange({ $expr: JSON.stringify(value) });
                }
                setExprMode(true);
              }
            }}
          >
            fx
          </button>
        )}
        {kind === "expr" && (
          <span className="flex h-7 w-6 shrink-0 items-center justify-center rounded bg-accent-muted text-[10px] font-semibold italic text-accent">
            fx
          </span>
        )}
        {isSet && !readOnly && (
          <button
            title="Reset"
            className="flex h-7 w-5 shrink-0 items-center justify-center rounded text-text-3 hover:bg-bg-3 hover:text-text-1"
            onClick={() => {
              onChange(undefined);
              setExprMode(false);
            }}
          >
            <X size={11} />
          </button>
        )}
      </div>
    </Row>
  );
}

// ---------------------------------------------------------------------------
// Style (sx) section
// ---------------------------------------------------------------------------

const FONT_SIZES = ["xs", "sm", "md", "lg", "xl", "2xl"];

function str(v: PropValue | undefined): string {
  return typeof v === "string" ? v : "";
}

function unsetOr(values: string[]): Array<{ value: string; label: string }> {
  return [{ value: "", label: "—" }, ...values.map((v) => ({ value: v, label: v }))];
}

function SxSection({
  node,
  isContainer,
  readOnly,
}: {
  node: DesignNode;
  isContainer: boolean;
  readOnly: boolean;
}) {
  const updateNodeProps = useEditor((s) => s.updateNodeProps);

  const raw = node.props.sx;
  const sx: Record<string, PropValue> =
    raw && typeof raw === "object" && !Array.isArray(raw) && !isExprValue(raw)
      ? (raw as Record<string, PropValue>)
      : {};

  const patch = (delta: Record<string, string | undefined>) => {
    const next: Record<string, PropValue> = { ...sx };
    for (const [key, v] of Object.entries(delta)) {
      if (v === undefined || v === "") delete next[key];
      else next[key] = v;
    }
    updateNodeProps(node.id, {
      sx: Object.keys(next).length > 0 ? (next as PropValue) : undefined,
    });
  };

  const align = str(sx.textAlign);

  return (
    <Section title="Style">
      <Row label="padding">
        <DebouncedTextInput
          disabled={readOnly}
          value={str(sx.p)}
          placeholder="md · 16px"
          onCommit={(v) => patch({ p: v })}
        />
      </Row>
      <Row label="gap">
        <DebouncedTextInput
          disabled={readOnly}
          value={str(sx.gap)}
          placeholder="md · 8px"
          onCommit={(v) => patch({ gap: v })}
        />
      </Row>
      <Row label="background">
        <ColorField disabled={readOnly} value={str(sx.bg)} onChange={(v) => patch({ bg: v })} />
      </Row>
      <Row label="text color">
        <ColorField
          disabled={readOnly}
          value={str(sx.color)}
          onChange={(v) => patch({ color: v })}
        />
      </Row>
      <Row label="font size">
        <>
          <DebouncedTextInput
            disabled={readOnly}
            value={str(sx.fontSize)}
            placeholder="md · 18px"
            list={`fontsize-${node.id}`}
            onCommit={(v) => patch({ fontSize: v })}
          />
          <datalist id={`fontsize-${node.id}`}>
            {FONT_SIZES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </>
      </Row>
      <Row label="weight">
        <Select
          disabled={readOnly}
          value={str(sx.weight)}
          options={unsetOr(["normal", "medium", "semibold", "bold"])}
          onChange={(v) => patch({ weight: v })}
        />
      </Row>
      <Row label="radius">
        <Select
          disabled={readOnly}
          value={str(sx.radius)}
          options={unsetOr(["none", "sm", "md", "lg", "xl", "full"])}
          onChange={(v) => patch({ radius: v })}
        />
      </Row>
      <Row label="shadow">
        <Select
          disabled={readOnly}
          value={str(sx.shadow)}
          options={unsetOr(["none", "sm", "md", "lg"])}
          onChange={(v) => patch({ shadow: v })}
        />
      </Row>
      <Row label="text align">
        <div className={cn(readOnly && "pointer-events-none opacity-50")}>
          <Segmented
            value={align}
            onChange={(v) => patch({ textAlign: v === align ? undefined : v })}
            options={[
              { value: "left", label: <AlignLeft size={12} />, title: "Left" },
              { value: "center", label: <AlignCenter size={12} />, title: "Center" },
              { value: "right", label: <AlignRight size={12} />, title: "Right" },
            ]}
          />
        </div>
      </Row>
      {isContainer && (
        <>
          <Row label="direction">
            <Select
              disabled={readOnly}
              value={str(sx.direction)}
              options={unsetOr(["row", "column"])}
              onChange={(v) => patch({ direction: v })}
            />
          </Row>
          <Row label="align">
            <Select
              disabled={readOnly}
              value={str(sx.align)}
              options={unsetOr(["start", "center", "end", "stretch"])}
              onChange={(v) => patch({ align: v })}
            />
          </Row>
          <Row label="justify">
            <Select
              disabled={readOnly}
              value={str(sx.justify)}
              options={unsetOr(["start", "center", "end", "between", "around"])}
              onChange={(v) => patch({ justify: v })}
            />
          </Row>
        </>
      )}
      <Row label="width">
        <DebouncedTextInput
          disabled={readOnly}
          value={str(sx.w)}
          placeholder="100% · 240px"
          onCommit={(v) => patch({ w: v })}
        />
      </Row>
      <Row label="height">
        <DebouncedTextInput
          disabled={readOnly}
          value={str(sx.h)}
          placeholder="auto · 120px"
          onCommit={(v) => patch({ h: v })}
        />
      </Row>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Inspector bodies
// ---------------------------------------------------------------------------

const SHORTCUTS: Array<[string, string]> = [
  ["V", "Select tool"],
  ["H", "Hand tool"],
  ["F", "Frame tool"],
  ["⌘Z / ⇧⌘Z", "Undo / redo"],
  ["⌘C / ⌘V", "Copy / paste"],
  ["⌘D", "Duplicate"],
  ["⌘G", "Group"],
  ["⌘⌥K", "Create symbol"],
  ["⌫", "Delete"],
  ["Space + drag", "Pan canvas"],
  ["⌘ + scroll", "Zoom"],
];

function ProjectInspector({
  index,
  readOnly,
}: {
  index: SchemaIndex | null;
  readOnly: boolean;
}) {
  const projectName = useEditor((s) => s.projectName);
  const theme = useEditor((s) => s.document.theme);
  const setTheme = useEditor((s) => s.setTheme);

  return (
    <>
      <Section title="Project">
        <Row label="name">
          <span className="truncate text-[13px] text-text-1" title={projectName}>
            {projectName || "Untitled"}
          </span>
        </Row>
        <Row label="theme">
          <Select
            disabled={readOnly || !index}
            value={theme}
            options={
              index && index.themes.length > 0
                ? index.themes.map((t) => ({ value: t, label: t }))
                : [{ value: theme, label: theme }]
            }
            onChange={setTheme}
          />
        </Row>
        <p className="px-3 pt-1 text-xs leading-relaxed text-text-3">
          The theme applies to every frame. Select a frame on the canvas to edit
          its size, position and page background.
        </p>
      </Section>
      <Section title="Shortcuts">
        <div className="space-y-1 px-3">
          {SHORTCUTS.map(([keys, what]) => (
            <div key={keys} className="flex items-center justify-between gap-2">
              <span className="text-xs text-text-3">{what}</span>
              <kbd className="shrink-0 rounded border border-border-1 bg-bg-2 px-1.5 py-0.5 text-[10px] text-text-2">
                {keys}
              </kbd>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function FrameInspector({ frame, readOnly }: { frame: Frame; readOnly: boolean }) {
  const updateFrame = useEditor((s) => s.updateFrame);
  const presetName =
    FRAME_PRESETS.find((p) => p.width === frame.width && p.height === frame.height)?.name ?? "";

  return (
    <>
      <Section title="Frame">
        <Row label="name">
          <DebouncedTextInput
            disabled={readOnly}
            value={frame.name}
            onCommit={(v) => {
              if (v.trim()) updateFrame(frame.id, { name: v.trim() });
            }}
          />
        </Row>
        <Row label="preset">
          <Select
            disabled={readOnly}
            value={presetName}
            options={[
              { value: "", label: "Custom" },
              ...FRAME_PRESETS.map((p) => ({
                value: p.name,
                label: `${p.name} — ${p.width}×${p.height}`,
              })),
            ]}
            onChange={(name) => {
              const preset = FRAME_PRESETS.find((p) => p.name === name);
              if (preset) updateFrame(frame.id, { width: preset.width, height: preset.height });
            }}
          />
        </Row>
      </Section>
      <Section title="Geometry">
        <Row label="X">
          <NumberField
            disabled={readOnly}
            value={frame.x}
            onCommit={(n) => updateFrame(frame.id, { x: n })}
          />
        </Row>
        <Row label="Y">
          <NumberField
            disabled={readOnly}
            value={frame.y}
            onCommit={(n) => updateFrame(frame.id, { y: n })}
          />
        </Row>
        <Row label="W">
          <NumberField
            disabled={readOnly}
            min={1}
            value={frame.width}
            onCommit={(n) => updateFrame(frame.id, { width: n })}
          />
        </Row>
        <Row label="H">
          <NumberField
            disabled={readOnly}
            min={1}
            value={frame.height}
            onCommit={(n) => updateFrame(frame.id, { height: n })}
          />
        </Row>
        {!readOnly && (
          <button
            className="mt-1 w-full rounded-md border border-border-1 px-2 py-1 text-xs text-text-2 hover:border-accent hover:text-text-1"
            title="Resize the frame to exactly fit its rendered content"
            onClick={() => {
              void import("../frame-fit").then(async ({ fitFrameHeightToContent }) => {
                const applied = await fitFrameHeightToContent(frame.id);
                toast(
                  applied
                    ? `Frame height fitted to ${applied}px`
                    : "Frame already fits its content",
                  "info",
                );
              });
            }}
          >
            Fit height to content
          </button>
        )}
      </Section>
      <Section title="Background">
        <Row label="color">
          <ColorField
            disabled={readOnly}
            value={frame.background}
            onChange={(v) => updateFrame(frame.id, { background: v || "#ffffff" })}
          />
        </Row>
      </Section>
    </>
  );
}

function NodeInspector({
  node,
  index,
  readOnly,
}: {
  node: DesignNode;
  index: SchemaIndex | null;
  readOnly: boolean;
}) {
  const updateNodeMeta = useEditor((s) => s.updateNodeMeta);
  const updateNodeProps = useEditor((s) => s.updateNodeProps);
  const info: ComponentInfo | undefined = node.component
    ? index?.byName.get(node.component)
    : undefined;

  const editableProps = useMemo(
    () =>
      (info?.props ?? []).filter(
        (p) => !/Node/.test(p.type) && p.name !== "children" && p.name !== "sx",
      ),
    [info],
  );

  return (
    <>
      <div className="border-b border-border-0 px-3 py-3">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-text-1">
            {node.component ?? "Component"}
          </span>
          {info?.description && (
            <span title={info.description} className="text-text-3">
              <Info size={12} />
            </span>
          )}
        </div>
        <DebouncedTextInput
          disabled={readOnly}
          className="mt-2"
          value={node.name}
          aria-label="Layer name"
          onCommit={(v) => {
            if (v.trim()) updateNodeMeta(node.id, { name: v.trim() });
          }}
        />
      </div>

      <Section title="Props">
        {!index ? (
          <div className="flex justify-center py-4">
            <Spinner />
          </div>
        ) : editableProps.length === 0 ? (
          <p className="px-3 text-xs text-text-3">This component has no editable props.</p>
        ) : (
          editableProps.map((prop) => (
            <PropRow
              key={`${node.id}:${prop.name}`}
              prop={prop}
              value={node.props[prop.name]}
              readOnly={readOnly}
              onChange={(v) => updateNodeProps(node.id, { [prop.name]: v })}
            />
          ))
        )}
      </Section>

      <SxSection
        node={node}
        isContainer={Boolean(info?.acceptsChildren)}
        readOnly={readOnly}
      />
    </>
  );
}

function InstanceInspector({ node, readOnly }: { node: DesignNode; readOnly: boolean }) {
  const symbol = useEditor((s) =>
    node.symbolId ? s.document.symbols.find((x) => x.id === node.symbolId) ?? null : null,
  );
  const updateNodeMeta = useEditor((s) => s.updateNodeMeta);
  const detachSymbolInstance = useEditor((s) => s.detachSymbolInstance);

  return (
    <>
      <div className="border-b border-border-0 px-3 py-3">
        <div className="text-sm font-semibold text-accent">
          {symbol?.name ?? "Missing symbol"}
        </div>
        <p className="mt-0.5 text-xs text-text-3">
          Instance of {symbol ? `“${symbol.name}”` : "a deleted symbol"}
        </p>
        <DebouncedTextInput
          disabled={readOnly}
          className="mt-2"
          value={node.name}
          aria-label="Layer name"
          onCommit={(v) => {
            if (v.trim()) updateNodeMeta(node.id, { name: v.trim() });
          }}
        />
      </div>
      <div className="space-y-3 px-3 py-3">
        <p className="text-xs leading-relaxed text-text-3">
          Instances stay in sync with their symbol. To edit this copy directly,
          detach it first.
        </p>
        {!readOnly && (
          <Button size="sm" onClick={() => detachSymbolInstance(node.id)}>
            Detach instance
          </Button>
        )}
      </div>
    </>
  );
}

function MultiInspector({ count, readOnly }: { count: number; readOnly: boolean }) {
  const deleteSelection = useEditor((s) => s.deleteSelection);
  const groupSelection = useEditor((s) => s.groupSelection);
  return (
    <div className="space-y-3 px-3 py-4">
      <p className="text-[13px] text-text-1">{count} layers selected</p>
      {!readOnly && (
        <div className="flex gap-2">
          <Button size="sm" onClick={groupSelection}>
            Group
          </Button>
          <Button size="sm" variant="danger" onClick={deleteSelection}>
            Delete
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export function InspectorPanel() {
  const selection = useEditor((s) => s.selection);
  const doc = useEditor((s) => s.document);
  const readOnly = useEditor((s) => s.readOnly);

  const [index, setIndex] = useState<SchemaIndex | null>(null);
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

  const sel = useMemo(() => {
    const nodes: DesignNode[] = [];
    const frames: Frame[] = [];
    for (const id of selection) {
      const loc = findNode(doc, id);
      if (loc) {
        nodes.push(loc.node);
        continue;
      }
      const hit = findFrame(doc, id);
      if (hit) frames.push(hit.frame);
    }
    return { nodes, frames };
  }, [selection, doc]);

  const total = sel.nodes.length + sel.frames.length;

  let body: ReactNode;
  if (total === 0) {
    body = <ProjectInspector index={index} readOnly={readOnly} />;
  } else if (total > 1) {
    body = <MultiInspector count={total} readOnly={readOnly} />;
  } else if (sel.frames.length === 1) {
    const frame = sel.frames[0];
    body = <FrameInspector key={frame.id} frame={frame} readOnly={readOnly} />;
  } else {
    const node = sel.nodes[0];
    body =
      node.type === "instance" ? (
        <InstanceInspector key={node.id} node={node} readOnly={readOnly} />
      ) : (
        <NodeInspector key={node.id} node={node} index={index} readOnly={readOnly} />
      );
  }

  return <div className="h-full overflow-y-auto bg-bg-1">{body}</div>;
}

export default InspectorPanel;
