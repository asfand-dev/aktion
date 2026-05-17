/**
 * Media components:
 *
 *   - VideoPlayer / AudioPlayer — Native media wrappers with consistent styling.
 *   - Carousel — Horizontal scrolling slider with prev/next + dot navigation.
 *   - Gallery — Responsive image grid with optional click-to-open Lightbox.
 *   - Lightbox — Full-viewport image viewer (controlled via $variable).
 *   - Map — Static map (OpenStreetMap tiles) given lat/lng coordinates.
 */

import type { ComponentSpec } from "../types.js";
import { isActionPayload } from "../../runtime/builtins.js";
import {
  el, asArray, asString, asBoolean, asNumber, renderIcon,
  sanitiseCssLength, sanitiseImageSrc,
} from "../utils.js";

const SAFE_MEDIA_SCHEMES = /^(https?:|blob:|data:(audio|video)\/)/i;

function sanitiseMediaSrc(raw: unknown): string {
  const value = asString(raw).trim();
  if (!value) return "";
  if (value.startsWith("/") || value.startsWith(".")) return value;
  if (value.startsWith("//")) return "";
  return SAFE_MEDIA_SCHEMES.test(value) ? value : "";
}

export const VideoPlayer: ComponentSpec = {
  name: "VideoPlayer",
  description:
    "Themed native `<video>` wrapper. Pass a `src` URL (or `sources` array " +
    "for multi-codec fallback) and optional `poster`. Standard controls " +
    "are visible by default; pass `autoplay`, `loop`, `muted`, or " +
    "`controls=false` to override. Use for product demos, tutorials, " +
    "and any inline video.",
  props: [
    { name: "src", type: "string", optional: true, description: "Video URL (mp4 / webm / etc.)" },
    { name: "sources", type: "object[]", optional: true, description: "Array of {src, type} entries for multi-codec fallback" },
    { name: "poster", type: "string", optional: true, description: "Thumbnail image URL shown before playback" },
    { name: "caption", type: "string", optional: true },
    { name: "controls", type: "boolean", optional: true, description: "Show native controls (default true)" },
    { name: "autoplay", type: "boolean", optional: true },
    { name: "loop", type: "boolean", optional: true },
    { name: "muted", type: "boolean", optional: true },
    { name: "ratio", type: "string", optional: true, description: "Aspect ratio (default 16:9)" },
  ],
  render: (_node, props) => {
    const root = el("figure", { class: "rui-video-player" });
    const ratio = parseRatio(asString(props.ratio, "16:9"));
    const playerWrap = el("div", {
      class: "rui-video-player-frame",
      style: `aspect-ratio:${ratio};`,
    });
    const showControls = props.controls === undefined ? true : asBoolean(props.controls);
    const video = el("video", {
      class: "rui-video-player-video",
      controls: showControls ? "" : null,
      autoplay: asBoolean(props.autoplay) ? "" : null,
      loop: asBoolean(props.loop) ? "" : null,
      muted: asBoolean(props.muted) ? "" : null,
      poster: sanitiseImageSrc(props.poster) || null,
      playsinline: "",
      preload: "metadata",
    });
    const sources = asArray<unknown>(props.sources);
    if (sources.length > 0) {
      for (const raw of sources) {
        if (!raw || typeof raw !== "object") continue;
        const s = raw as { src?: unknown; type?: unknown };
        const safeSrc = sanitiseMediaSrc(s.src);
        if (!safeSrc) continue;
        video.append(el("source", { src: safeSrc, type: asString(s.type) || null }));
      }
    } else {
      const safeSrc = sanitiseMediaSrc(props.src);
      if (safeSrc) video.setAttribute("src", safeSrc);
    }
    playerWrap.append(video);
    root.append(playerWrap);
    const caption = asString(props.caption);
    if (caption) root.append(el("figcaption", { class: "rui-video-player-caption" }, [caption]));
    return root;
  },
};

export const AudioPlayer: ComponentSpec = {
  name: "AudioPlayer",
  description:
    "Themed native `<audio>` wrapper with a title, optional artist, and " +
    "standard transport controls. Pass `src` (or `sources`) plus a " +
    "`title` so the bar still looks like a player when the controls bar " +
    "is hidden. Use for podcasts, voice notes, and demo audio.",
  props: [
    { name: "src", type: "string", optional: true, description: "Audio URL (mp3 / ogg / wav / etc.)" },
    { name: "sources", type: "object[]", optional: true, description: "Array of {src, type} entries for multi-codec fallback" },
    { name: "title", type: "string", optional: true },
    { name: "artist", type: "string", optional: true },
    { name: "controls", type: "boolean", optional: true, description: "Show native controls (default true)" },
    { name: "autoplay", type: "boolean", optional: true },
    { name: "loop", type: "boolean", optional: true },
    { name: "icon", type: "string", optional: true, description: "Leading icon (default `music`)" },
  ],
  render: (_node, props) => {
    const root = el("div", { class: "rui-audio-player" });
    const meta = el("div", { class: "rui-audio-player-meta" });
    const iconNode = renderIcon(asString(props.icon, "music"), { className: "rui-audio-player-icon" });
    if (iconNode) meta.append(iconNode);
    const text = el("div", { class: "rui-audio-player-text" });
    const title = asString(props.title);
    if (title) text.append(el("div", { class: "rui-audio-player-title" }, [title]));
    const artist = asString(props.artist);
    if (artist) text.append(el("div", { class: "rui-audio-player-artist" }, [artist]));
    meta.append(text);
    root.append(meta);
    const showControls = props.controls === undefined ? true : asBoolean(props.controls);
    const audio = el("audio", {
      class: "rui-audio-player-audio",
      controls: showControls ? "" : null,
      autoplay: asBoolean(props.autoplay) ? "" : null,
      loop: asBoolean(props.loop) ? "" : null,
      preload: "metadata",
    });
    const sources = asArray<unknown>(props.sources);
    if (sources.length > 0) {
      for (const raw of sources) {
        if (!raw || typeof raw !== "object") continue;
        const s = raw as { src?: unknown; type?: unknown };
        const safeSrc = sanitiseMediaSrc(s.src);
        if (!safeSrc) continue;
        audio.append(el("source", { src: safeSrc, type: asString(s.type) || null }));
      }
    } else {
      const safeSrc = sanitiseMediaSrc(props.src);
      if (safeSrc) audio.setAttribute("src", safeSrc);
    }
    root.append(audio);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Carousel — horizontal slider with prev/next + dot navigation
 * ----------------------------------------------------------------------- */

interface SlideHelpers {
  renderNode: (node: unknown) => Node;
}

function renderCarouselSlide(item: unknown, helpers: SlideHelpers): Node | null {
  if (item === null || item === undefined) return null;
  if (typeof item === "object" && (item as { __kind?: string }).__kind === "Component") {
    return helpers.renderNode(item);
  }
  if (typeof item === "string") {
    const safeSrc = sanitiseImageSrc(item);
    if (!safeSrc) return null;
    return el("img", { src: safeSrc, alt: "", loading: "lazy", class: "rui-carousel-image" });
  }
  if (typeof item === "object") {
    const obj = item as { src?: unknown; alt?: unknown; caption?: unknown; title?: unknown };
    const safeSrc = sanitiseImageSrc(obj.src);
    if (safeSrc) {
      const wrap = el("figure", { class: "rui-carousel-figure" });
      wrap.append(el("img", {
        src: safeSrc,
        alt: asString(obj.alt ?? obj.caption ?? obj.title),
        loading: "lazy",
        class: "rui-carousel-image",
      }));
      const captionText = asString(obj.caption ?? obj.title);
      if (captionText) {
        wrap.append(el("figcaption", { class: "rui-carousel-caption" }, [captionText]));
      }
      return wrap;
    }
  }
  return helpers.renderNode(item);
}

export const Carousel: ComponentSpec = {
  name: "Carousel",
  description:
    "Horizontal slider with prev/next buttons and dot navigation. Each " +
    "child slide takes full width. Slides may be Component nodes " +
    "(Image, Card, MediaCard, …), URL strings, or plain " +
    "`{src, alt, caption?}` image objects — bare image objects are " +
    "auto-wrapped into a captioned figure. Use for image galleries, " +
    "onboarding carousels, hero banners, and product image strips. The " +
    "active slide is preserved across re-renders via instance state.",
  props: [
    { name: "items", type: "Node[]", description: "Slide nodes, image URLs, or {src, alt, caption?} objects" },
    { name: "activeIndex", type: "number", optional: true, description: "0-indexed initial slide (default 0)" },
    { name: "ratio", type: "string", optional: true, description: "Aspect ratio of the frame (default `16:9`)" },
    { name: "showDots", type: "boolean", optional: true, description: "Show indicator dots (default true)" },
    { name: "showArrows", type: "boolean", optional: true, description: "Show prev/next arrows (default true)" },
  ],
  render: (_node, props, helpers) => {
    const items = asArray<unknown>(props.items);
    const count = items.length;
    const defaultIdx = Math.max(0, Math.min(Math.max(count - 1, 0), Math.floor(asNumber(props.activeIndex, 0))));
    const slot = helpers.useInstanceState<number>("active", defaultIdx);
    let active = slot.get();
    if (active >= count) { active = 0; slot.set(active); }
    const showDots = props.showDots === undefined ? true : asBoolean(props.showDots);
    const showArrows = props.showArrows === undefined ? true : asBoolean(props.showArrows);
    const ratio = parseRatio(asString(props.ratio, "16:9"));
    const root = el("div", { class: "rui-carousel" });
    const frame = el("div", {
      class: "rui-carousel-frame",
      style: `aspect-ratio:${ratio};`,
    });
    const track = el("div", {
      class: "rui-carousel-track",
      style: `transform:translateX(${active * -100}%);`,
    });
    items.forEach((item) => {
      const slide = el("div", { class: "rui-carousel-slide" });
      const rendered = renderCarouselSlide(item, helpers);
      if (rendered) slide.append(rendered);
      track.append(slide);
    });
    frame.append(track);

    const move = (origin: Element, next: number): void => {
      const clamped = ((next % count) + count) % count;
      slot.set(clamped);
      const liveRoot = origin.closest(".rui-carousel");
      const liveTrack = liveRoot?.querySelector(".rui-carousel-track") as HTMLElement | null;
      if (liveTrack) liveTrack.style.transform = `translateX(${clamped * -100}%)`;
      liveRoot?.querySelectorAll<HTMLElement>(".rui-carousel-dot").forEach((dot, i) => {
        dot.setAttribute("data-active", i === clamped ? "true" : "false");
      });
    };

    if (showArrows && count > 1) {
      const prev = el("button", {
        type: "button",
        class: "rui-carousel-arrow",
        "data-direction": "prev",
        "aria-label": "Previous slide",
      });
      const prevIcon = renderIcon("chevron-left");
      if (prevIcon) prev.append(prevIcon);
      const next = el("button", {
        type: "button",
        class: "rui-carousel-arrow",
        "data-direction": "next",
        "aria-label": "Next slide",
      });
      const nextIcon = renderIcon("chevron-right");
      if (nextIcon) next.append(nextIcon);
      prev.onclick = (event) => move(event.currentTarget as Element, slot.get() - 1);
      next.onclick = (event) => move(event.currentTarget as Element, slot.get() + 1);
      frame.append(prev, next);
    }
    root.append(frame);

    if (showDots && count > 1) {
      const dots = el("div", { class: "rui-carousel-dots" });
      items.forEach((_item, i) => {
        const dot = el("button", {
          type: "button",
          class: "rui-carousel-dot",
          "data-active": i === active ? "true" : "false",
          "aria-label": `Go to slide ${i + 1}`,
        });
        dot.onclick = (event) => move(event.currentTarget as Element, i);
        dots.append(dot);
      });
      root.append(dots);
    }
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Gallery + Lightbox
 * ----------------------------------------------------------------------- */

export const Gallery: ComponentSpec = {
  name: "Gallery",
  description:
    "Responsive image grid. Pass items as plain URL strings, " +
    "`{src, alt, caption?}` objects, or `Image(...)` nodes. When " +
    "`onSelect` is provided each tile becomes a button; bind it through " +
    "an Action that opens a `Lightbox`.",
  props: [
    { name: "items", type: "any[]" },
    { name: "columns", type: "number", optional: true, description: "Preferred column count (default auto)" },
    { name: "ratio", type: "string", optional: true, description: "Per-tile aspect ratio (default `1:1`)" },
    { name: "onSelect", type: "Action", optional: true, description: "Action fired when a tile is clicked" },
  ],
  render: (_node, props, helpers) => {
    const items = asArray<unknown>(props.items);
    const columns = Math.max(1, Math.min(6, Number(props.columns ?? "auto")));
    const ratio = parseRatio(asString(props.ratio, "1:1"));
    const root = el("div", {
      class: "rui-gallery",
      "data-columns": columns > 0 ? String(columns) : null,
    });
    items.forEach((raw, i) => {
      const { src, alt, caption } = extractGalleryItem(raw);
      const safeSrc = sanitiseImageSrc(src);
      const clickable = isActionPayload(props.onSelect);
      const tile = el(clickable ? "button" : "figure" as "figure", {
        type: clickable ? "button" : null,
        class: "rui-gallery-tile",
        style: `aspect-ratio:${ratio};`,
        "data-index": String(i),
      });
      if (safeSrc) {
        tile.append(el("img", { src: safeSrc, alt, loading: "lazy" }));
      } else {
        const placeholder = renderIcon("image", { className: "rui-gallery-placeholder" });
        if (placeholder) tile.append(placeholder);
      }
      if (caption) {
        tile.append(el("span", { class: "rui-gallery-caption" }, [caption]));
      }
      if (clickable) {
        tile.onclick = () => helpers.runAction(props.onSelect);
      }
      root.append(tile);
    });
    return root;
  },
};

function extractGalleryItem(raw: unknown): { src: string; alt: string; caption: string } {
  if (typeof raw === "string") return { src: raw, alt: "", caption: "" };
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if ((r as { __kind?: string }).__kind === "Component" && Array.isArray(r.args)) {
      return {
        src: asString(r.args[0]),
        alt: asString(r.args[1]),
        caption: asString(r.args[2]),
      };
    }
    return {
      src: asString(r.src),
      alt: asString(r.alt),
      caption: asString(r.caption),
    };
  }
  return { src: "", alt: "", caption: "" };
}

export const Lightbox: ComponentSpec = {
  name: "Lightbox",
  description:
    "Full-viewport image overlay shown when `open` is true. Bind " +
    "`$variable` to `open` and `index` for control. Pass `items` (string " +
    "URLs or `{src, alt, caption?}` objects) — clicking the backdrop or " +
    "pressing × closes; prev/next arrows step through the array.",
  props: [
    { name: "items", type: "any[]" },
    { name: "open", type: "boolean", description: "Open/closed; typically a $variable" },
    { name: "index", type: "number", optional: true, description: "0-indexed current image; typically a $variable" },
  ],
  render: (node, props, helpers) => {
    const items = asArray<unknown>(props.items)
      .map((raw) => extractGalleryItem(raw))
      .filter((entry) => sanitiseImageSrc(entry.src) !== "");
    const isOpen = asBoolean(props.open);
    const rawIndex = Math.floor(asNumber(props.index, 0));
    const total = items.length;
    const indexStateName = node.argMeta?.[2]?.stateRef;
    const openStateName = node.argMeta?.[1]?.stateRef;
    const idx = total === 0 ? 0 : ((rawIndex % total) + total) % total;
    const overlay = el("div", {
      class: "rui-lightbox-overlay",
      "data-open": isOpen ? "true" : "false",
    });
    if (!isOpen || total === 0) return overlay;
    const current = items[idx];
    if (!current) return overlay;
    const safeSrc = sanitiseImageSrc(current.src);
    const close = () => {
      if (openStateName) {
        helpers.runAction({ kind: "Action", steps: [{ kind: "Set", name: openStateName, value: false }] });
      }
    };
    const move = (delta: number) => {
      if (!indexStateName) return;
      const next = ((idx + delta) % total + total) % total;
      helpers.runAction({ kind: "Action", steps: [{ kind: "Set", name: indexStateName, value: next }] });
    };
    overlay.onclick = (event) => {
      if (event.target === overlay) close();
    };
    const dialog = el("div", { class: "rui-lightbox", role: "dialog", "aria-modal": "true" });
    const closeBtn = el("button", {
      type: "button",
      class: "rui-lightbox-close",
      "aria-label": "Close lightbox",
    }, ["×"]);
    closeBtn.onclick = close;
    dialog.append(closeBtn);
    if (total > 1) {
      const prev = el("button", {
        type: "button",
        class: "rui-lightbox-arrow",
        "data-direction": "prev",
        "aria-label": "Previous image",
      });
      const prevIcon = renderIcon("chevron-left");
      if (prevIcon) prev.append(prevIcon);
      prev.onclick = () => move(-1);
      const next = el("button", {
        type: "button",
        class: "rui-lightbox-arrow",
        "data-direction": "next",
        "aria-label": "Next image",
      });
      const nextIcon = renderIcon("chevron-right");
      if (nextIcon) next.append(nextIcon);
      next.onclick = () => move(1);
      dialog.append(prev, next);
    }
    const imageWrap = el("div", { class: "rui-lightbox-image-wrap" });
    if (safeSrc) {
      imageWrap.append(el("img", { src: safeSrc, alt: current.alt }));
    }
    dialog.append(imageWrap);
    if (current.caption) {
      dialog.append(el("div", { class: "rui-lightbox-caption" }, [current.caption]));
    }
    if (total > 1) {
      dialog.append(el("div", { class: "rui-lightbox-counter" }, [`${idx + 1} / ${total}`]));
    }
    overlay.append(dialog);
    return overlay;
  },
};

/* ----------------------------------------------------------------------- *
 * Map — static OpenStreetMap embed
 * ----------------------------------------------------------------------- */

function parseLatLng(raw: unknown): { lat: number; lng: number } | null {
  if (!raw) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const r = raw as { lat?: unknown; lng?: unknown; latitude?: unknown; longitude?: unknown };
    const lat = asNumber(r.lat ?? r.latitude, NaN);
    const lng = asNumber(r.lng ?? r.longitude, NaN);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  if (Array.isArray(raw) && raw.length >= 2) {
    const lat = asNumber(raw[0], NaN);
    const lng = asNumber(raw[1], NaN);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }
  if (typeof raw === "string") {
    const parts = raw.split(",").map((s) => Number(s.trim()));
    if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
      return { lat: parts[0]!, lng: parts[1]! };
    }
  }
  return null;
}

export const Map: ComponentSpec = {
  name: "Map",
  description:
    "Static map view centered on a lat/lng coordinate. Renders an " +
    "OpenStreetMap embed inside an `<iframe>` (no external JS, no API " +
    "key). Pass `lat` and `lng` as bare numbers; `zoom` controls the " +
    "level (1–18, default 13). Optional `markers` array adds map pins " +
    "(rendered as a labelled list alongside the map). Use for store " +
    "locators, address cards, itinerary previews.",
  props: [
    { name: "lat", type: "number", description: "Latitude of the map center" },
    { name: "lng", type: "number", description: "Longitude of the map center" },
    { name: "zoom", type: "number", optional: true, description: "1–18 (default 13)" },
    { name: "markers", type: "object[]", optional: true, description: "Array of {lat, lng, label?} markers (informational; rendered alongside the map)" },
    { name: "height", type: "string", optional: true, description: "CSS height (default 320px)" },
    { name: "caption", type: "string", optional: true },
  ],
  render: (_node, props) => {
    const root = el("figure", { class: "rui-map" });
    const height = sanitiseCssLength(props.height, "320px");
    const frameWrap = el("div", { class: "rui-map-frame", style: `height:${height};` });
    const lat = asNumber(props.lat, NaN);
    const lng = asNumber(props.lng, NaN);
    const center = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    if (!center) {
      frameWrap.append(el("div", { class: "rui-map-empty" }, [
        "Pass lat & lng (numbers) to render the map.",
      ]));
      root.append(frameWrap);
      const caption = asString(props.caption);
      if (caption) root.append(el("figcaption", { class: "rui-map-caption" }, [caption]));
      return root;
    }
    const zoom = Math.max(1, Math.min(18, Math.floor(asNumber(props.zoom, 13))));
    // Approximate bounding box from a span that scales with zoom — small
    // enough that the requested center stays prominent in the embed.
    const span = 1 / Math.pow(2, zoom - 8);
    const bbox = [
      center.lng - span,
      center.lat - span / 2,
      center.lng + span,
      center.lat + span / 2,
    ].join(",");
    const url = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${center.lat},${center.lng}`;
    const iframe = el("iframe", {
      class: "rui-map-iframe",
      src: url,
      loading: "lazy",
      title: "Map view",
      referrerpolicy: "no-referrer",
    });
    frameWrap.append(iframe);
    root.append(frameWrap);
    const markers = asArray<unknown>(props.markers)
      .map((raw) => {
        const pin = parseLatLng(raw);
        const label = raw && typeof raw === "object" ? asString((raw as { label?: unknown }).label) : "";
        return pin ? { ...pin, label } : null;
      })
      .filter((p): p is { lat: number; lng: number; label: string } => p !== null);
    if (markers.length > 0) {
      const list = el("ul", { class: "rui-map-markers" });
      for (const m of markers) {
        const li = el("li", { class: "rui-map-marker" });
        const pinIcon = renderIcon("location-dot", { className: "rui-map-marker-icon" });
        if (pinIcon) li.append(pinIcon);
        li.append(el("span", { class: "rui-map-marker-label" }, [
          m.label || `${m.lat.toFixed(4)}, ${m.lng.toFixed(4)}`,
        ]));
        list.append(li);
      }
      root.append(list);
    }
    const caption = asString(props.caption);
    if (caption) root.append(el("figcaption", { class: "rui-map-caption" }, [caption]));
    return root;
  },
};

function parseRatio(input: string): string {
  if (input.includes(":")) {
    const [w, h] = input.split(":");
    const num = Number(w);
    const den = Number(h);
    if (Number.isFinite(num) && Number.isFinite(den) && den > 0) return `${num} / ${den}`;
  }
  const n = Number(input);
  return Number.isFinite(n) && n > 0 ? `${n} / 1` : "16 / 9";
}
