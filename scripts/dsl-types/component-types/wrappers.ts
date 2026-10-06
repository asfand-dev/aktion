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
      onClick: "(event: DomMouseEvent) => unknown",
      download: "boolean | string",
    },
  },
  OnClick: {
    props: {
      child: "Children",
      onClick: "(event: DomMouseEvent | DomKeyboardEvent) => unknown",
      role: "\"button\" | \"link\" | \"none\" | \"presentation\" | \"menuitem\" | \"option\" | \"tab\" | (string & {})",
    },
  },
  OnFocus: {
    props: {
      child: "Children",
      onFocus: "(event: DomFocusEvent) => unknown",
      onBlur: "(event: DomFocusEvent) => unknown",
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
      onEnter: "(entry: OnIntersectEntry) => unknown",
      onLeave: "(entry: OnIntersectEntry) => unknown",
      onChange: "(change: OnIntersectChange) => unknown",
      rootMargin: "string",
      root: "string",
    },
  },
  OnKeyboard: {
    props: {
      child: "Children",
      onKeyDown: "(event: DomKeyboardEvent) => unknown",
      onKeyUp: "(event: DomKeyboardEvent) => unknown",
      onKeyPress: "(event: DomKeyboardEvent) => unknown",
    },
  },
  OnMount: {
    props: {
      child: "Children",
      onMount: "(node: DomElement) => unknown",
      onUnmount: "(node: DomElement) => unknown",
      deps: "readonly unknown[]",
    },
  },
  OnMouse: {
    props: {
      child: "Children",
      enter: "(event: DomMouseEvent) => unknown",
      leave: "(event: DomMouseEvent) => unknown",
      hover: "(event: DomMouseEvent) => unknown",
      move: "(event: DomMouseEvent) => unknown",
      down: "(event: DomMouseEvent) => unknown",
      up: "(event: DomMouseEvent) => unknown",
      click: "(event: DomMouseEvent) => unknown",
      doubleClick: "(event: DomMouseEvent) => unknown",
      contextMenu: "(event: DomMouseEvent) => unknown",
      scroll: "(event: DomEvent) => unknown",
      wheel: "(event: DomWheelEvent) => unknown",
      pointerDown: "(event: DomPointerEvent) => unknown",
      pointerMove: "(event: DomPointerEvent) => unknown",
      pointerUp: "(event: DomPointerEvent) => unknown",
      drag: "(event: DomDragEvent) => unknown",
      drop: "(event: DomDragEvent) => unknown",
      dragStart: "(event: DomDragEvent) => unknown",
      dragEnd: "(event: DomDragEvent) => unknown",
      dragEnter: "(event: DomDragEvent) => unknown",
      dragLeave: "(event: DomDragEvent) => unknown",
      dragOver: "(event: DomDragEvent) => unknown",
    },
  },
} satisfies ComponentTypeTable;
