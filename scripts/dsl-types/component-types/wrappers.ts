/** Curated types for the components of src/library/components/wrappers.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  Css: {
    props: {
      child: "Children",
      style: "string",
      class: "string | readonly string[]",
    },
  },
  Link: {
    props: {
      label: "Children",
      onClick: "(event: DomMouseEvent) => void",
      download: "boolean | string",
    },
  },
  OnClick: {
    props: {
      child: "Children",
      onClick: "(event: DomMouseEvent | DomKeyboardEvent) => void",
      role: "\"button\" | \"link\" | \"none\" | \"presentation\" | \"menuitem\" | \"option\" | \"tab\" | (string & {})",
    },
  },
  OnFocus: {
    props: {
      child: "Children",
      onFocus: "(event: DomFocusEvent) => void",
      onBlur: "(event: DomFocusEvent) => void",
    },
  },
  OnIntersect: {
    types: {
      OnIntersectRect: `export interface OnIntersectRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
  toJSON(): unknown;
}`,
      OnIntersectEntry: `export interface OnIntersectEntry {
  readonly isIntersecting: boolean;
  readonly intersectionRatio: number;
  readonly target: DomElement;
  readonly time: number;
  readonly boundingClientRect: OnIntersectRect;
  readonly intersectionRect: OnIntersectRect;
  readonly rootBounds: OnIntersectRect | null;
}`,
      OnIntersectChange: "export interface OnIntersectChange {\n  /** `entry.isIntersecting`. */\n  readonly visible: boolean;\n  /** `entry.intersectionRatio`, 0–1. */\n  readonly ratio: number;\n}",
    },
    props: {
      child: "Children",
      onEnter: "(entry: OnIntersectEntry) => void",
      onLeave: "(entry: OnIntersectEntry) => void",
      onChange: "(change: OnIntersectChange) => void",
      rootMargin: "string",
      root: "string",
    },
  },
  OnKeyboard: {
    props: {
      child: "Children",
      onKeyDown: "(event: DomKeyboardEvent) => void",
      onKeyUp: "(event: DomKeyboardEvent) => void",
      onKeyPress: "(event: DomKeyboardEvent) => void",
    },
  },
  OnMount: {
    props: {
      child: "Children",
      onMount: "(node: DomElement) => void",
      onUnmount: "(node: DomElement) => void",
      deps: "readonly unknown[]",
    },
  },
  OnMouse: {
    props: {
      child: "Children",
      enter: "(event: DomMouseEvent) => void",
      leave: "(event: DomMouseEvent) => void",
      hover: "(event: DomMouseEvent) => void",
      move: "(event: DomMouseEvent) => void",
      down: "(event: DomMouseEvent) => void",
      up: "(event: DomMouseEvent) => void",
      click: "(event: DomMouseEvent) => void",
      doubleClick: "(event: DomMouseEvent) => void",
      contextMenu: "(event: DomMouseEvent) => void",
      scroll: "(event: DomEvent) => void",
      wheel: "(event: DomWheelEvent) => void",
      pointerDown: "(event: DomPointerEvent) => void",
      pointerMove: "(event: DomPointerEvent) => void",
      pointerUp: "(event: DomPointerEvent) => void",
      drag: "(event: DomDragEvent) => void",
      drop: "(event: DomDragEvent) => void",
      dragStart: "(event: DomDragEvent) => void",
      dragEnd: "(event: DomDragEvent) => void",
      dragEnter: "(event: DomDragEvent) => void",
      dragLeave: "(event: DomDragEvent) => void",
      dragOver: "(event: DomDragEvent) => void",
    },
  },
} satisfies ComponentTypeTable;
