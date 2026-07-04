"use client";
/**
 * Layers panel — pages strip, the layer tree of the active page (frames at
 * root, nodes below), and the document's symbols. Supports inline rename,
 * visibility/lock toggles, right-click context menus and drag reorder /
 * reparent.
 */
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import {
  Box,
  ChevronDown,
  ChevronRight,
  Component as ComponentIcon,
  Diamond,
  Ellipsis,
  Eye,
  EyeOff,
  FileText,
  Frame as FrameIcon,
  Image as ImageIcon,
  Lock,
  LockOpen,
  MousePointer,
  Plus,
  Type,
  type LucideIcon,
} from "lucide-react";
import { getSchemaIndex, type SchemaIndex } from "@/design/schema";
import { findNode, isDescendant } from "@/design/document";
import type { DesignNode, Frame } from "@/design/types";
import { useEditor } from "@/store/editor-store";
import { Menu } from "@/components/ui";
import { cn } from "@/lib/utils";

type DropPos = "before" | "after" | "inside";
interface DropHint {
  id: string;
  pos: DropPos;
}
interface CtxMenu {
  x: number;
  y: number;
  kind: "node" | "frame" | "symbol";
  id: string;
}
interface CtxItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

const NODE_ICONS: Record<string, LucideIcon> = {
  Text: Type,
  Heading: Type,
  Markdown: Type,
  Blockquote: Type,
  Label: Type,
  Caption: Type,
  Button: MousePointer,
  IconButton: MousePointer,
  Link: MousePointer,
  Image: ImageIcon,
  Avatar: ImageIcon,
};

function iconForNode(node: DesignNode, index: SchemaIndex | null): LucideIcon {
  if (node.type === "instance") return Diamond;
  const component = node.component ?? "";
  const mapped = NODE_ICONS[component];
  if (mapped) return mapped;
  if (index?.byName.get(component)?.acceptsChildren) return Box;
  return ComponentIcon;
}

export function LayersPanel() {
  const doc = useEditor((s) => s.document);
  const activePageId = useEditor((s) => s.activePageId);
  const selection = useEditor((s) => s.selection);
  const hoveredId = useEditor((s) => s.hoveredId);
  const readOnly = useEditor((s) => s.readOnly);

  const select = useEditor((s) => s.select);
  const clearSelection = useEditor((s) => s.clearSelection);
  const setHovered = useEditor((s) => s.setHovered);
  const setActivePage = useEditor((s) => s.setActivePage);
  const addPage = useEditor((s) => s.addPage);
  const renamePage = useEditor((s) => s.renamePage);
  const removePage = useEditor((s) => s.removePage);
  const updateFrame = useEditor((s) => s.updateFrame);
  const updateNodeMeta = useEditor((s) => s.updateNodeMeta);
  const moveNodeTo = useEditor((s) => s.moveNodeTo);
  const mutateDoc = useEditor((s) => s.mutateDoc);
  const duplicateSelection = useEditor((s) => s.duplicateSelection);
  const deleteSelection = useEditor((s) => s.deleteSelection);
  const groupSelection = useEditor((s) => s.groupSelection);
  const ungroupSelection = useEditor((s) => s.ungroupSelection);
  const makeSymbol = useEditor((s) => s.makeSymbol);
  const detachSymbolInstance = useEditor((s) => s.detachSymbolInstance);
  const removeSymbol = useEditor((s) => s.removeSymbol);
  const renameSymbol = useEditor((s) => s.renameSymbol);
  const setDraggingSymbolId = useEditor((s) => s.setDraggingSymbolId);

  const [index, setIndex] = useState<SchemaIndex | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const seenFrames = useRef<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<CtxMenu | null>(null);
  const dragItem = useRef<{ kind: "node" | "frame"; id: string } | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);

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

  const page = doc.pages.find((p) => p.id === activePageId) ?? doc.pages[0];

  // Frames are expanded by default (including freshly created ones).
  useEffect(() => {
    const fresh = page?.frames.filter((f) => !seenFrames.current.has(f.id)) ?? [];
    if (fresh.length === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const f of fresh) {
        next.add(f.id);
        seenFrames.current.add(f.id);
      }
      return next;
    });
  }, [page]);

  const selSet = useMemo(() => new Set(selection), [selection]);

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openMenu = (e: ReactMouseEvent, kind: CtxMenu["kind"], id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (readOnly) return;
    if (kind !== "symbol" && !selSet.has(id)) select([id]);
    setMenu({ x: e.clientX, y: e.clientY, kind, id });
  };

  const clearDrag = () => {
    dragItem.current = null;
    setDropHint(null);
  };

  // -- Drag handlers ---------------------------------------------------------

  const onNodeDragOver = (e: DragEvent<HTMLDivElement>, node: DesignNode) => {
    const drag = dragItem.current;
    if (readOnly || !drag || drag.kind !== "node" || drag.id === node.id) return;
    const dragLoc = findNode(useEditor.getState().document, drag.id);
    if (!dragLoc || isDescendant(dragLoc.node, node.id)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const canInside =
      node.type === "component" &&
      (index
        ? Boolean(index.byName.get(node.component ?? "")?.acceptsChildren)
        : node.children.length > 0);
    let pos: DropPos;
    if (y < rect.height * 0.25) pos = "before";
    else if (y > rect.height * 0.75) pos = "after";
    else if (canInside) pos = "inside";
    else pos = y < rect.height / 2 ? "before" : "after";
    setDropHint((prev) =>
      prev && prev.id === node.id && prev.pos === pos ? prev : { id: node.id, pos },
    );
  };

  const onNodeDrop = (e: DragEvent<HTMLDivElement>, node: DesignNode) => {
    e.preventDefault();
    e.stopPropagation();
    const drag = dragItem.current;
    const hint = dropHint;
    clearDrag();
    if (!drag || drag.kind !== "node" || !hint || hint.id !== node.id) return;
    if (hint.pos === "inside") {
      moveNodeTo(drag.id, node.id, 9999);
      setExpanded((prev) => new Set(prev).add(node.id));
      return;
    }
    const loc = findNode(useEditor.getState().document, node.id);
    if (!loc) return;
    const containerId = loc.parent ? loc.parent.id : loc.frame.id;
    moveNodeTo(drag.id, containerId, hint.pos === "before" ? loc.index : loc.index + 1);
  };

  const onFrameDragOver = (e: DragEvent<HTMLDivElement>, frame: Frame) => {
    const drag = dragItem.current;
    if (readOnly || !drag) return;
    let pos: DropPos;
    if (drag.kind === "node") {
      pos = "inside";
    } else {
      if (drag.id === frame.id) return;
      const rect = e.currentTarget.getBoundingClientRect();
      pos = e.clientY - rect.top < rect.height / 2 ? "before" : "after";
    }
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    setDropHint((prev) =>
      prev && prev.id === frame.id && prev.pos === pos ? prev : { id: frame.id, pos },
    );
  };

  const onFrameDrop = (e: DragEvent<HTMLDivElement>, frame: Frame) => {
    e.preventDefault();
    e.stopPropagation();
    const drag = dragItem.current;
    const hint = dropHint;
    clearDrag();
    if (!drag || !hint || hint.id !== frame.id) return;
    if (drag.kind === "node") {
      moveNodeTo(drag.id, frame.id, 9999);
      setExpanded((prev) => new Set(prev).add(frame.id));
      return;
    }
    // Frames cannot nest — reorder within the page's frame list.
    const pageId = page?.id;
    if (!pageId) return;
    mutateDoc((draft) => {
      const p = draft.pages.find((pg) => pg.id === pageId);
      if (!p) return;
      const from = p.frames.findIndex((f) => f.id === drag.id);
      let to = p.frames.findIndex((f) => f.id === frame.id);
      if (from < 0 || to < 0 || from === to) return;
      if (hint.pos === "after") to += 1;
      const [moved] = p.frames.splice(from, 1);
      if (from < to) to -= 1;
      p.frames.splice(Math.max(0, Math.min(to, p.frames.length)), 0, moved);
    });
  };

  const onRowDragLeave = (e: DragEvent<HTMLDivElement>, id: string) => {
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setDropHint((prev) => (prev?.id === id ? null : prev));
  };

  // -- Context menu items ----------------------------------------------------

  const menuItemsFor = (m: CtxMenu): Array<CtxItem | "separator"> => {
    if (m.kind === "frame") {
      return [
        { label: "Duplicate", onClick: duplicateSelection },
        "separator",
        { label: "Delete", danger: true, onClick: deleteSelection },
      ];
    }
    if (m.kind === "symbol") {
      return [
        { label: "Rename", onClick: () => setRenaming(m.id) },
        "separator",
        { label: "Delete symbol", danger: true, onClick: () => removeSymbol(m.id) },
      ];
    }
    const loc = findNode(doc, m.id);
    if (!loc) return [];
    const node = loc.node;
    const items: Array<CtxItem | "separator"> = [
      { label: "Duplicate", onClick: duplicateSelection },
      { label: "Group selection", onClick: groupSelection },
    ];
    if (node.children.length > 0) {
      items.push({ label: "Ungroup", onClick: ungroupSelection });
    }
    if (node.type === "component") {
      items.push({ label: "Create symbol", onClick: () => makeSymbol(node.id) });
    }
    if (node.type === "instance") {
      items.push({
        label: "Detach instance",
        onClick: () => detachSymbolInstance(node.id),
      });
    }
    items.push("separator", { label: "Delete", danger: true, onClick: deleteSelection });
    return items;
  };

  // -- Row renderers ---------------------------------------------------------

  const renderNode = (node: DesignNode, depth: number): ReactNode => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    const isSelected = selSet.has(node.id);
    const hint = dropHint?.id === node.id ? dropHint.pos : null;
    const Icon = iconForNode(node, index);
    const dimmed = node.locked || !node.visible;

    return (
      <Fragment key={node.id}>
        <div
          className={cn(
            "group relative flex h-7 select-none items-center gap-1 pr-1.5 text-[13px]",
            isSelected
              ? "bg-accent-muted text-text-1"
              : hoveredId === node.id
                ? "bg-bg-2 text-text-2"
                : "text-text-2 hover:bg-bg-2",
            hint === "inside" && "drop-indicator ring-1 ring-inset ring-accent",
          )}
          style={{ paddingLeft: 8 + depth * 12 }}
          draggable={!readOnly && renaming !== node.id}
          onDragStart={(e) => {
            if (readOnly) return;
            e.stopPropagation();
            dragItem.current = { kind: "node", id: node.id };
            e.dataTransfer.setData("application/x-aktion-layer", node.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => onNodeDragOver(e, node)}
          onDragLeave={(e) => onRowDragLeave(e, node.id)}
          onDrop={(e) => onNodeDrop(e, node)}
          onDragEnd={clearDrag}
          onClick={(e) => {
            e.stopPropagation();
            select([node.id], e.shiftKey);
          }}
          onContextMenu={(e) => openMenu(e, "node", node.id)}
          onMouseEnter={() => setHovered(node.id)}
          onMouseLeave={() => setHovered(null)}
        >
          {hasChildren ? (
            <button
              className="shrink-0 rounded p-0.5 text-text-3 hover:text-text-1"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpanded(node.id);
              }}
              aria-label={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <Icon
            size={13}
            className={cn(
              "shrink-0",
              node.type === "instance" ? "text-accent" : "text-text-3",
              dimmed && "opacity-50",
            )}
          />
          {renaming === node.id ? (
            <RenameInput
              initial={node.name}
              onCommit={(name) => {
                updateNodeMeta(node.id, { name });
                setRenaming(null);
              }}
              onCancel={() => setRenaming(null)}
            />
          ) : (
            <span
              className={cn("min-w-0 flex-1 truncate", dimmed && "opacity-50")}
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (!readOnly) setRenaming(node.id);
              }}
            >
              {node.name}
            </span>
          )}
          {!readOnly && renaming !== node.id && (
            <span
              className={cn(
                "ml-auto shrink-0 items-center gap-0.5",
                !node.visible || node.locked ? "flex" : "hidden group-hover:flex",
              )}
            >
              <button
                className="rounded p-0.5 text-text-3 hover:bg-bg-3 hover:text-text-1"
                title={node.visible ? "Hide" : "Show"}
                onClick={(e) => {
                  e.stopPropagation();
                  updateNodeMeta(node.id, { visible: !node.visible });
                }}
              >
                {node.visible ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
              <button
                className="rounded p-0.5 text-text-3 hover:bg-bg-3 hover:text-text-1"
                title={node.locked ? "Unlock" : "Lock"}
                onClick={(e) => {
                  e.stopPropagation();
                  updateNodeMeta(node.id, { locked: !node.locked });
                }}
              >
                {node.locked ? <Lock size={12} /> : <LockOpen size={12} />}
              </button>
            </span>
          )}
          {hint === "before" && (
            <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-accent" />
          )}
          {hint === "after" && (
            <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-accent" />
          )}
        </div>
        {hasChildren && isExpanded && node.children.map((c) => renderNode(c, depth + 1))}
      </Fragment>
    );
  };

  const renderFrame = (frame: Frame): ReactNode => {
    const isExpanded = expanded.has(frame.id);
    const isSelected = selSet.has(frame.id);
    const hint = dropHint?.id === frame.id ? dropHint.pos : null;

    return (
      <Fragment key={frame.id}>
        <div
          className={cn(
            "group relative flex h-7 select-none items-center gap-1 px-2 text-[13px] font-medium",
            isSelected
              ? "bg-accent-muted text-text-1"
              : hoveredId === frame.id
                ? "bg-bg-2 text-text-1"
                : "text-text-1 hover:bg-bg-2",
            hint === "inside" && "drop-indicator ring-1 ring-inset ring-accent",
          )}
          draggable={!readOnly && renaming !== frame.id}
          onDragStart={(e) => {
            if (readOnly) return;
            e.stopPropagation();
            dragItem.current = { kind: "frame", id: frame.id };
            e.dataTransfer.setData("application/x-aktion-layer", frame.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => onFrameDragOver(e, frame)}
          onDragLeave={(e) => onRowDragLeave(e, frame.id)}
          onDrop={(e) => onFrameDrop(e, frame)}
          onDragEnd={clearDrag}
          onClick={(e) => {
            e.stopPropagation();
            select([frame.id], e.shiftKey);
          }}
          onContextMenu={(e) => openMenu(e, "frame", frame.id)}
          onMouseEnter={() => setHovered(frame.id)}
          onMouseLeave={() => setHovered(null)}
        >
          <button
            className="shrink-0 rounded p-0.5 text-text-3 hover:text-text-1"
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded(frame.id);
            }}
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
          <FrameIcon size={13} className="shrink-0 text-text-3" />
          {renaming === frame.id ? (
            <RenameInput
              initial={frame.name}
              onCommit={(name) => {
                updateFrame(frame.id, { name });
                setRenaming(null);
              }}
              onCancel={() => setRenaming(null)}
            />
          ) : (
            <span
              className="min-w-0 flex-1 truncate"
              onDoubleClick={(e) => {
                e.stopPropagation();
                if (!readOnly) setRenaming(frame.id);
              }}
            >
              {frame.name}
            </span>
          )}
          <span className="ml-auto shrink-0 pr-1 text-[10px] text-text-3">
            {frame.children.length}
          </span>
          {hint === "before" && (
            <span className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-accent" />
          )}
          {hint === "after" && (
            <span className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-accent" />
          )}
        </div>
        {isExpanded && frame.children.map((c) => renderNode(c, 1))}
      </Fragment>
    );
  };

  return (
    <div className="flex h-full flex-col bg-bg-1">
      {/* Pages */}
      <div className="shrink-0 border-b border-border-0">
        <div className="flex items-center justify-between px-3 pb-1 pt-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-3">
            Pages
          </span>
          {!readOnly && (
            <button
              className="rounded p-0.5 text-text-3 hover:bg-bg-3 hover:text-text-1"
              title="Add page"
              onClick={addPage}
            >
              <Plus size={14} />
            </button>
          )}
        </div>
        <div className="max-h-36 overflow-y-auto pb-1">
          {doc.pages.map((p) => (
            <div
              key={p.id}
              className={cn(
                "group flex h-7 cursor-pointer select-none items-center gap-2 px-3 text-[13px]",
                p.id === page?.id
                  ? "bg-bg-2 text-text-1"
                  : "text-text-2 hover:bg-bg-2 hover:text-text-1",
              )}
              onClick={() => setActivePage(p.id)}
            >
              <FileText size={12} className="shrink-0 text-text-3" />
              {renaming === p.id ? (
                <RenameInput
                  initial={p.name}
                  onCommit={(name) => {
                    renamePage(p.id, name);
                    setRenaming(null);
                  }}
                  onCancel={() => setRenaming(null)}
                />
              ) : (
                <span
                  className="min-w-0 flex-1 truncate"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (!readOnly) setRenaming(p.id);
                  }}
                >
                  {p.name}
                </span>
              )}
              {!readOnly && renaming !== p.id && (
                <span
                  className="shrink-0 opacity-0 group-hover:opacity-100"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Menu
                    align="end"
                    trigger={
                      <button
                        className="rounded p-0.5 text-text-3 hover:bg-bg-3 hover:text-text-1"
                        aria-label="Page menu"
                      >
                        <Ellipsis size={13} />
                      </button>
                    }
                    items={[
                      { label: "Rename", onClick: () => setRenaming(p.id) },
                      {
                        label: "Delete",
                        danger: true,
                        disabled: doc.pages.length <= 1,
                        onClick: () => removePage(p.id),
                      },
                    ]}
                  />
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Layer tree */}
      <div
        className="flex-1 overflow-y-auto py-1"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) clearSelection();
        }}
      >
        {!page || page.frames.length === 0 ? (
          <p className="px-3 py-4 text-xs text-text-3">
            No frames yet — press F and draw one on the canvas.
          </p>
        ) : (
          page.frames.map(renderFrame)
        )}
      </div>

      {/* Symbols */}
      <div className="shrink-0 border-t border-border-0">
        <div className="flex items-center justify-between px-3 pb-1 pt-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-3">
            Symbols
          </span>
          {doc.symbols.length > 0 && (
            <span className="text-[10px] text-text-3">{doc.symbols.length}</span>
          )}
        </div>
        {doc.symbols.length === 0 ? (
          <p className="px-3 pb-3 text-xs text-text-3">
            Select a layer and press ⌘⌥K to create a symbol.
          </p>
        ) : (
          <div className="max-h-40 overflow-y-auto pb-1">
            {doc.symbols.map((sym) => (
              <div
                key={sym.id}
                className={cn(
                  "flex h-7 select-none items-center gap-2 px-3 text-[13px] text-text-2 hover:bg-bg-2 hover:text-text-1",
                  !readOnly && "cursor-grab active:cursor-grabbing",
                )}
                draggable={!readOnly && renaming !== sym.id}
                onDragStart={(e) => {
                  if (readOnly) return;
                  e.dataTransfer.setData("application/x-aktion-symbol", sym.id);
                  e.dataTransfer.effectAllowed = "copy";
                  setDraggingSymbolId(sym.id);
                }}
                onDragEnd={() => setDraggingSymbolId(null)}
                onContextMenu={(e) => openMenu(e, "symbol", sym.id)}
              >
                <Diamond size={12} className="shrink-0 text-accent" />
                {renaming === sym.id ? (
                  <RenameInput
                    initial={sym.name}
                    onCommit={(name) => {
                      renameSymbol(sym.id, name);
                      setRenaming(null);
                    }}
                    onCancel={() => setRenaming(null)}
                  />
                ) : (
                  <span
                    className="min-w-0 flex-1 truncate"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (!readOnly) setRenaming(sym.id);
                    }}
                  >
                    {sym.name}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Context menu */}
      {menu && (
        <div
          className="fixed inset-0 z-50"
          onMouseDown={() => setMenu(null)}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu(null);
          }}
        >
          <div
            className="absolute min-w-44 rounded-lg border border-border-1 bg-bg-2 py-1 shadow-xl"
            style={{
              left: Math.min(menu.x, (typeof window !== "undefined" ? window.innerWidth : 800) - 190),
              top: Math.min(menu.y, (typeof window !== "undefined" ? window.innerHeight : 600) - 240),
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {menuItemsFor(menu).map((item, i) =>
              item === "separator" ? (
                <div key={i} className="my-1 border-t border-border-0" />
              ) : (
                <button
                  key={i}
                  disabled={item.disabled}
                  className={cn(
                    "block w-full px-3 py-1.5 text-left text-[13px] hover:bg-bg-3 disabled:opacity-40",
                    item.danger ? "text-danger" : "text-text-1",
                  )}
                  onClick={() => {
                    setMenu(null);
                    item.onClick();
                  }}
                >
                  {item.label}
                </button>
              ),
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Tiny controlled input for inline renames: Enter commits, Escape cancels. */
function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);

  const commit = () => {
    if (done.current) return;
    done.current = true;
    const trimmed = value.trim();
    if (trimmed && trimmed !== initial) onCommit(trimmed);
    else onCancel();
  };

  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") {
          done.current = true;
          onCancel();
        }
      }}
      className="h-5 min-w-0 flex-1 rounded border border-accent bg-bg-2 px-1 text-[13px] text-text-1 focus:outline-none"
    />
  );
}

export default LayersPanel;
