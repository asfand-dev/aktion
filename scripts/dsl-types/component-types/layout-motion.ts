/** Curated types for the components of src/library/components/layout-motion.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  Bento: {
    props: {
      items: "readonly AktionNode[]",
      rowHeight: "string | number | Responsive<string | number>",
    },
  },
  BentoCell: {
    types: {
      BentoCellGridSpan: `export interface BentoCellGridSpan {
  /** Column span, clamped to 1-8 (default 1). */
  readonly col?: number;
  /** Row span, clamped to 1-4 (default 1). */
  readonly row?: number;
}`,
    },
    props: {
      span: "BentoCellSpan | number | BentoCellGridSpan",
    },
  },
  Draggable: {
    generics: [{ name: "Data", default: "unknown" }],
    props: {
      data: "Data",
      onDragStart: "(data: NoInfer<Data>) => unknown",
      onDragEnd: "() => unknown",
    },
  },
  DropZone: {
    props: {
      onDrop: "(data: unknown) => unknown",
    },
  },
  OnGesture: {
    types: {
      OnGestureSwipeDirection: "export type OnGestureSwipeDirection = \"left\" | \"right\" | \"up\" | \"down\";",
      OnGesturePanOffset: `export interface OnGesturePanOffset {
  /** Horizontal travel in px since pointerdown (positive = right). */
  readonly dx: number;
  /** Vertical travel in px since pointerdown (positive = down). */
  readonly dy: number;
}`,
    },
    props: {
      swipe: "(direction: OnGestureSwipeDirection) => unknown",
      longPress: "() => unknown",
      doubleTap: "() => unknown",
      pan: "(offset: OnGesturePanOffset) => unknown",
      onPanEnd: "(offset: OnGesturePanOffset) => unknown",
    },
  },
  Parallax: {
    props: {
      maxOffset: "number | `${number}` | `${number}px` | `${number}%`",
    },
  },
  ReadingProgress: {
    props: {
      target: "\"page\" | (string & {})",
      color: "string",
    },
  },
  Sortable: {
    props: {
      items: "readonly (AktionNode | string | number)[]",
      onReorder: "(fromIndex: number, toIndex: number) => unknown",
    },
  },
  Split: {
    types: {
      SplitRatio: "export type SplitRatio = \"1/1\" | \"1/2\" | \"2/1\" | \"2/3\" | \"3/2\" | \"1/3\" | \"3/1\" | \"2/5\" | \"5/2\" | (`${number}/${number}` & {}) | (`${number}:${number}` & {});",
    },
    props: {
      ratio: "SplitRatio",
    },
  },
  Transition: {
    props: {
      onExited: "() => unknown",
    },
  },
} satisfies ComponentTypeTable;
