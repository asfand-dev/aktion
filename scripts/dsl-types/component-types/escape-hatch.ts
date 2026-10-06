/** Curated types for the components of src/library/components/escape-hatch.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  HTMLTag: {
    types: {
      HTMLTagName: `export type HTMLTagName =
  | "div" | "span" | "p" | "section" | "article" | "header" | "footer" | "main"
  | "nav" | "aside" | "figure" | "figcaption" | "details" | "summary"
  | "h1" | "h2" | "h3" | "h4" | "h5" | "h6"
  | "ul" | "ol" | "li" | "dl" | "dt" | "dd"
  | "table" | "thead" | "tbody" | "tfoot" | "tr" | "td" | "th" | "caption"
  | "colgroup" | "col"
  | "a" | "img" | "picture" | "source" | "video" | "audio" | "track"
  | "small" | "strong" | "em" | "b" | "i" | "u" | "s" | "mark" | "code" | "pre"
  | "kbd" | "samp" | "var" | "sub" | "sup" | "abbr" | "cite" | "blockquote" | "q"
  | "time" | "address" | "ins" | "del" | "ruby" | "rt" | "rp" | "bdi" | "bdo"
  | "br" | "hr" | "wbr" | "hgroup"
  | "label" | "fieldset" | "legend" | "progress" | "meter" | "output";`,
      HTMLTagAttributes: "export interface HTMLTagAttributes {\n  /** Attribute name → value. `true` renders an empty (boolean) attribute; `false`/`null`/`undefined` omit it; numbers are stringified. `on*` handlers, `srcset`, `srcdoc`, `data`, `html`, `is` and similar names are dropped; `href`/`src`/`style` are sanitised. */\n  readonly [name: string]: string | number | boolean | null | undefined;\n}",
    },
    props: {
      tag: "HTMLTagName",
      attributes: "HTMLTagAttributes",
    },
  },
} satisfies ComponentTypeTable;
