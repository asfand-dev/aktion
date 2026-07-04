"use client";
/**
 * Component palette — a searchable, categorized list of every Aktion
 * component, driven live by `componentSchema()`. Items drag onto the canvas
 * (see the drag protocol in the store) or insert on double-click.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  ChartColumn,
  ChevronDown,
  ChevronRight,
  Compass,
  Image as ImageIcon,
  LayoutGrid,
  Megaphone,
  MessageSquare,
  PersonStanding,
  Puzzle,
  Search,
  ShoppingCart,
  Sparkles,
  Square,
  Table,
  TextCursorInput,
  Type,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { getSchemaIndex, type ComponentInfo, type SchemaIndex } from "@/design/schema";
import { DEFAULT_CHILDREN, DEFAULT_PROPS, PINNED_COMPONENTS } from "@/design/presets";
import { findFrame, findNode } from "@/design/document";
import type { PropValue } from "@/design/types";
import { useEditor, type DropTarget } from "@/store/editor-store";
import { Spinner, TextInput, toast } from "@/components/ui";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Basics: Square,
  Layout: LayoutGrid,
  Typography: Type,
  Forms: TextCursorInput,
  Data: Table,
  Charts: ChartColumn,
  Navigation: Compass,
  Feedback: Bell,
  Media: ImageIcon,
  Marketing: Megaphone,
  Commerce: ShoppingCart,
  "Chat & Realtime": MessageSquare,
  Scheduling: CalendarDays,
  Motion: Sparkles,
  Accessibility: PersonStanding,
  Advanced: Wrench,
  Other: Puzzle,
};

/** How a palette insert should land. Frames use Figma-style free placement. */
interface InsertPlacement {
  target: DropTarget;
  /** Set when the target is a frame — free position at (roughly) its center. */
  layout?: { x: number; y: number };
}

/** Cascade successive center-inserts so nodes don't stack exactly on top. */
let insertCascade = 0;

/**
 * Where a palette insert should land: a single selected container node
 * (joins its flow), else the selected frame, else the first frame of the
 * active page (both freely placed near the center).
 */
function resolveInsertTarget(index: SchemaIndex | null): InsertPlacement | null {
  const s = useEditor.getState();
  const doc = s.document;
  const freeInto = (frameId: string): InsertPlacement | null => {
    const hit = findFrame(doc, frameId);
    if (!hit) return null;
    const offset = (insertCascade++ % 8) * 24;
    return {
      target: { containerId: frameId, index: 9999 },
      layout: {
        x: Math.max(16, Math.round(hit.frame.width / 2 - 120 + offset)),
        y: Math.max(16, Math.round(hit.frame.height / 3 + offset)),
      },
    };
  };
  if (s.selection.length === 1) {
    const id = s.selection[0];
    const loc = findNode(doc, id);
    if (loc) {
      if (
        loc.node.type === "component" &&
        loc.node.component &&
        index?.byName.get(loc.node.component)?.acceptsChildren
      ) {
        return { target: { containerId: id, index: 9999 } };
      }
    } else if (findFrame(doc, id)) {
      return freeInto(id);
    }
  }
  const page = doc.pages.find((p) => p.id === s.activePageId) ?? doc.pages[0];
  const frame = page?.frames[0];
  return frame ? freeInto(frame.id) : null;
}

function defaultPropsFor(info: ComponentInfo): Record<string, PropValue> {
  const preset = DEFAULT_PROPS[info.name];
  if (preset) return preset;
  const pos = info.positional;
  if (pos && pos.required && /string/.test(pos.type) && !/Node/.test(pos.type)) {
    return { [pos.name]: info.name };
  }
  return {};
}

export function PalettePanel() {
  const readOnly = useEditor((s) => s.readOnly);
  const setDraggingComponent = useEditor((s) => s.setDraggingComponent);
  const insertComponent = useEditor((s) => s.insertComponent);

  const [index, setIndex] = useState<SchemaIndex | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Set<string>>(() => new Set(["Basics", "Layout"]));

  useEffect(() => {
    let alive = true;
    getSchemaIndex()
      .then((i) => {
        if (alive) setIndex(i);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load components");
      });
    return () => {
      alive = false;
    };
  }, []);

  const pinned = useMemo(() => {
    if (!index) return [];
    return PINNED_COMPONENTS.map((n) => index.byName.get(n)).filter(
      (c): c is ComponentInfo => Boolean(c),
    );
  }, [index]);

  const results = useMemo(() => {
    if (!index) return null;
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return index.components.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
    );
  }, [index, query]);

  const toggleCategory = (name: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const insert = (info: ComponentInfo) => {
    if (readOnly) return;
    const placement = resolveInsertTarget(index);
    if (!placement) {
      toast("Add a frame to the canvas first", "error");
      return;
    }
    if (
      !insertComponent(
        info.name,
        defaultPropsFor(info),
        placement.target,
        placement.layout,
        DEFAULT_CHILDREN[info.name]?.(),
      )
    ) {
      toast("Could not insert component", "error");
    }
  };

  return (
    <div className="flex h-full flex-col bg-bg-1">
      {/* Search */}
      <div className="relative shrink-0 border-b border-border-0 p-2">
        <Search
          size={13}
          className="pointer-events-none absolute left-4.5 top-1/2 -translate-y-1/2 text-text-3"
        />
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search components…"
          className="h-7 pl-7 text-xs"
          aria-label="Search components"
        />
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {error ? (
          <p className="px-3 py-4 text-xs text-danger">{error}</p>
        ) : !index ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : results ? (
          // Flat search results with category labels.
          <div className="px-2">
            {results.length === 0 ? (
              <p className="px-1 py-4 text-xs text-text-3">
                No components match “{query.trim()}”.
              </p>
            ) : (
              results.map((info) => (
                <PaletteItem
                  key={info.name}
                  info={info}
                  showCategory
                  readOnly={readOnly}
                  onInsert={insert}
                  onDragState={setDraggingComponent}
                />
              ))
            )}
          </div>
        ) : (
          <>
            {/* Pinned */}
            {pinned.length > 0 && (
              <section>
                <h3 className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-text-3">
                  Pinned
                </h3>
                <div className="px-2">
                  {pinned.map((info) => (
                    <PaletteItem
                      key={info.name}
                      info={info}
                      readOnly={readOnly}
                      onInsert={insert}
                      onDragState={setDraggingComponent}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Categories */}
            {index.categories.map((cat) => {
              const isOpen = open.has(cat.name);
              return (
                <section key={cat.name}>
                  <button
                    className="flex w-full items-center gap-1 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-3 hover:text-text-1"
                    onClick={() => toggleCategory(cat.name)}
                  >
                    {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <span>{cat.name}</span>
                    <span className="ml-auto text-[10px] font-normal">
                      {cat.components.length}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-2 pb-1">
                      {cat.components.map((info) => (
                        <PaletteItem
                          key={info.name}
                          info={info}
                          readOnly={readOnly}
                          onInsert={insert}
                          onDragState={setDraggingComponent}
                        />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </>
        )}
      </div>

      {index && (
        <footer className="shrink-0 border-t border-border-0 px-3 py-2 text-[11px] text-text-3">
          {index.components.length} components — powered by componentSchema()
        </footer>
      )}
    </div>
  );
}

function PaletteItem({
  info,
  showCategory,
  readOnly,
  onInsert,
  onDragState,
}: {
  info: ComponentInfo;
  showCategory?: boolean;
  readOnly: boolean;
  onInsert: (info: ComponentInfo) => void;
  onDragState: (name: string | null) => void;
}) {
  const Icon = CATEGORY_ICONS[info.category] ?? Puzzle;
  return (
    <div
      title={info.description || info.name}
      draggable={!readOnly}
      onDragStart={(e) => {
        if (readOnly) return;
        e.dataTransfer.setData("application/x-aktion-component", info.name);
        e.dataTransfer.effectAllowed = "copy";
        onDragState(info.name);
      }}
      onDragEnd={() => onDragState(null)}
      onDoubleClick={() => onInsert(info)}
      className={cn(
        "group flex h-7 select-none items-center gap-2 rounded-md px-2 text-[13px] text-text-2 hover:bg-bg-2 hover:text-text-1",
        readOnly ? "cursor-default" : "cursor-grab active:cursor-grabbing",
      )}
    >
      <Icon size={13} className="shrink-0 text-text-3 group-hover:text-accent" />
      <span className="flex-1 truncate">{info.name}</span>
      {showCategory && (
        <span className="shrink-0 text-[10px] text-text-3">{info.category}</span>
      )}
    </div>
  );
}

export default PalettePanel;
