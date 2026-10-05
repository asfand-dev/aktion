/** Curated types for the components of src/library/components/media.ts. */
import type { ComponentTypeTable } from "./types.js";

export default {
  AudioPlayer: {
    types: {
      AudioPlayerSource: `export interface AudioPlayerSource {
  /** http(s), blob:, data:audio/…, or a same-origin path. */
  readonly src: string;
  /** MIME type (optionally with codecs) for the <source>. */
  readonly type?: "audio/mpeg" | "audio/ogg" | "audio/wav" | "audio/webm" | "audio/aac" | "audio/flac" | "audio/mp4" | (string & {});
}`,
    },
    props: {
      icon: "AktionIconName",
      src: "string",
      sources: "readonly AudioPlayerSource[]",
      onEnded: "() => unknown",
    },
  },
  Carousel: {
    types: {
      CarouselImage: "export interface CarouselImage {\n  readonly src: string;\n  /** Falls back to `caption`, then `title`. */\n  readonly alt?: string;\n  /** Shown as a figcaption; falls back to `title`. */\n  readonly caption?: string;\n  readonly title?: string;\n}",
    },
    props: {
      items: "readonly (AktionNode | string | CarouselImage)[]",
      ratio: "`${number}:${number}` | `${number}` | number",
      onChange: "(index: number) => unknown",
    },
  },
  Gallery: {
    generics: [{ name: "Item", default: "GalleryItem", constraint: "GalleryItem" }],
    types: {
      GalleryItemOf: "/** The item type `onSelect` receives: the inferred one, or `GalleryItem` when nothing was inferred (an empty list). */\nexport type GalleryItemOf<T> = [T] extends [never] ? GalleryItem : T;",
      GalleryImage: `export interface GalleryImage {
  readonly src: string;
  readonly alt?: string;
  readonly caption?: string;
}`,
      GalleryItem: "export type GalleryItem = string | GalleryImage | AktionNode;",
    },
    props: {
      items: "readonly Item[]",
      ratio: "`${number}:${number}` | `${number}` | number",
      onSelect: "(index: number, item: GalleryItemOf<Item>) => unknown",
    },
  },
  Lightbox: {
    types: {
      LightboxImage: `export interface LightboxImage {
  readonly src: string;
  readonly alt?: string;
  readonly caption?: string;
}`,
    },
    props: {
      items: "readonly (string | LightboxImage | AktionNode<\"Image\">)[]",
      onClose: "() => unknown",
    },
  },
  Map: {
    types: {
      MapMarker: `export interface MapMarker {
  /** -90…90 */
  readonly lat: number;
  /** -180…180 */
  readonly lng: number;
  /** Chip text under the map (default: the coordinates). */
  readonly label?: string;
}`,
    },
    props: {
      markers: "readonly MapMarker[]",
    },
  },
  VideoPlayer: {
    types: {
      VideoPlayerSource: `export interface VideoPlayerSource {
  /** http(s), blob:, data:video/…, or a same-origin path. */
  readonly src: string;
  /** MIME type (optionally with codecs) for the <source>. */
  readonly type?: "video/mp4" | "video/webm" | "video/ogg" | (string & {});
}`,
      VideoPlayerTrack: `export interface VideoPlayerTrack {
  /** WebVTT file: http(s), blob:, data:text/vtt, or a same-origin path. */
  readonly src: string;
  /** Unknown kinds are replaced by "subtitles". */
  readonly kind?: "subtitles" | "captions" | "descriptions" | "chapters" | "metadata";
  readonly label?: string;
  /** BCP 47 language tag, e.g. "en". */
  readonly srclang?: string;
  readonly default?: boolean;
}`,
    },
    props: {
      src: "string",
      sources: "readonly VideoPlayerSource[]",
      ratio: "`${number}:${number}` | `${number}` | number",
      tracks: "readonly VideoPlayerTrack[]",
      onEnded: "() => unknown",
      onError: "() => unknown",
    },
  },
} satisfies ComponentTypeTable;
