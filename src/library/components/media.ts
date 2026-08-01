/**
 * Media components:
 *
 *   - VideoPlayer / AudioPlayer — Native media wrappers with consistent styling.
 *   - Carousel — Horizontal scrolling slider with prev/next + dot navigation.
 *   - Gallery — Responsive image grid with optional click-to-open Lightbox.
 *   - Lightbox — Full-viewport image viewer (controlled via $variable).
 *   - Map — Static map (OpenStreetMap tiles) given lat/lng coordinates.
 */

import type { ComponentSpec, InstanceStateSlot, RenderHelpers } from "../types.js";
import {
  el, asArray, asString, asBoolean, asNumber, renderIcon,
  sanitiseCssLength, sanitiseImageSrc, isComponentNode,
} from "../utils.js";
import { deferToPaint } from "../floating.js";
import { dialogKeydownHandler } from "./_internal.js";

const SAFE_MEDIA_SCHEMES = /^(https?:|blob:|data:(audio|video)\/)/i;
/** `<track>` payloads are WebVTT text documents, not audio/video streams. */
const SAFE_TRACK_SCHEMES = /^(https?:|blob:|data:text\/vtt)/i;

function sanitiseSubresource(raw: unknown, schemes: RegExp): string {
  const value = asString(raw).trim();
  if (!value) return "";
  // The protocol-relative check has to come FIRST: `//evil.example/x.mp4`
  // also satisfies `startsWith("/")`, so testing the same-origin shapes
  // ahead of it waved every protocol-relative URL straight through.
  if (value.startsWith("//")) return "";
  if (value.startsWith("/") || value.startsWith(".")) return value;
  return schemes.test(value) ? value : "";
}

const sanitiseMediaSrc = (raw: unknown): string => sanitiseSubresource(raw, SAFE_MEDIA_SCHEMES);
const sanitiseTrackSrc = (raw: unknown): string => sanitiseSubresource(raw, SAFE_TRACK_SCHEMES);

const TRACK_KINDS = ["subtitles", "captions", "descriptions", "chapters", "metadata"] as const;

/**
 * Inline layout for an overlay that lives inside an `overflow: hidden`,
 * `aspect-ratio`-sized media frame. These boxes are new to the stylesheet, and
 * an absolutely-positioned element with no CSS at all is either invisible or
 * clipped away — so the minimum needed to *be seen* travels with the render
 * output. Everything cosmetic stays in the theme.
 */
const MEDIA_OVERLAY_STYLE =
  "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;" +
  "gap:8px;padding:12px;text-align:center;color:#fff;font-size:13px;";
const MEDIA_PLAY_BUTTON_STYLE =
  "position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:56px;height:56px;" +
  "border:0;border-radius:50%;background:rgba(0,0,0,0.55);color:#fff;font-size:20px;" +
  "cursor:pointer;display:inline-flex;align-items:center;justify-content:center;";

/** Start or stop the media element that owns the clicked affordance. */
function toggleMediaPlayback(event: Event, frameSelector: string): void {
  const origin = (event.currentTarget ?? event.target) as Element | null;
  const live = origin?.closest(frameSelector)?.querySelector("video, audio") as HTMLMediaElement | null;
  if (!live) return;
  if (!live.paused) { live.pause(); return; }
  if (typeof live.play !== "function") return;
  const started = live.play() as Promise<void> | undefined;
  // A blocked autoplay policy rejects here; swallowing keeps it out of the
  // console as an unhandled rejection.
  if (started && typeof started.catch === "function") started.catch(() => { /* ignored */ });
}

/**
 * Keep a play/pause affordance and the `onEnded` callable wired to a media
 * element.
 *
 * `play` / `pause` / `ended` are NOT in the morph reconciler's transferable
 * handler list, so these properties are assigned once — on the mounted node —
 * and are never refreshed afterwards. That is safe for `reflect`, which only
 * reads the live DOM, but a captured `props.onEnded` would be frozen at the
 * first render, so the callable is read through an instance-state cell that
 * every later render overwrites. The resolved playing state goes into a cell
 * too: the render has to re-emit it, or morph resets the affordance from a
 * snapshot that always says "paused".
 */
function wireMediaState(
  media: HTMLMediaElement,
  selectors: { root: string; toggle: string },
  playing: InstanceStateSlot<boolean>,
  endedRef: InstanceStateSlot<unknown>,
  helpers: RenderHelpers,
): void {
  const reflect = (event: Event): void => {
    const live = (event.currentTarget ?? event.target) as HTMLMediaElement;
    const isPlaying = !live.paused && !live.ended;
    playing.set(isPlaying);
    const btn = live.closest(selectors.root)?.querySelector<HTMLElement>(selectors.toggle);
    if (!btn) return;
    btn.setAttribute("data-playing", isPlaying ? "true" : "false");
    btn.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
    const swap = renderIcon(isPlaying ? "pause" : "play");
    if (!swap) return;
    const previous = btn.querySelector(".rui-icon");
    if (previous) previous.replaceWith(swap);
    else btn.append(swap);
  };
  media.onplay = reflect;
  media.onpause = reflect;
  media.onended = (event) => {
    reflect(event as Event);
    helpers.invoke(endedRef.get());
  };
}

/** Play/pause button used when the native controls bar is suppressed. */
function renderPlayToggle(className: string, playing: boolean, style: string | null): HTMLElement {
  const btn = el("button", {
    type: "button",
    class: className,
    "data-playing": playing ? "true" : "false",
    "aria-label": playing ? "Pause" : "Play",
    style,
  });
  const icon = renderIcon(playing ? "pause" : "play");
  if (icon) btn.append(icon);
  return btn;
}

export const VideoPlayer: ComponentSpec = {
  name: "VideoPlayer",
  description:
    "Themed native `<video>` wrapper. Pass a `src` URL (or `sources` array " +
    "for multi-codec fallback) and optional `poster`. Standard controls " +
    "are visible by default; `controls=false` swaps them for a single " +
    "play/pause button (click the video too). `autoplay` only works " +
    "alongside `muted` — browsers block unmuted autoplay. Add `tracks` for " +
    "captions/subtitles (required for prerecorded video, WCAG 1.2.2). " +
    "`onEnded` fires on completion; a missing, unsafe, or failing source " +
    "shows `fallback` and calls `onError`. Use for product demos, " +
    "tutorials, and any inline video.",
  props: [
    { name: "src", type: "string", optional: true, description: "Video URL (mp4 / webm / etc.)" },
    { name: "sources", type: "object[]", optional: true, description: "Array of {src, type} entries for multi-codec fallback" },
    { name: "poster", type: "string", optional: true, description: "Thumbnail image URL shown before playback" },
    { name: "caption", type: "string", optional: true },
    { name: "controls", type: "boolean", optional: true, description: "Show native controls (default true); false renders a play/pause button instead" },
    { name: "autoplay", type: "boolean", optional: true, description: "Requires `muted: true` — browsers block unmuted autoplay" },
    { name: "loop", type: "boolean", optional: true },
    { name: "muted", type: "boolean", optional: true },
    { name: "ratio", type: "string", optional: true, description: "Aspect ratio (default 16:9)" },
    { name: "tracks", type: "object[]", optional: true, description: "Caption/subtitle tracks: {src, label?, srclang?, kind?, default?} (kind: subtitles|captions|descriptions|chapters|metadata)" },
    { name: "onEnded", type: "callable", optional: true, aliases: ["onended"], description: "Callable invoked when playback reaches the end" },
    { name: "fallback", type: "string", optional: true, description: "Message shown when the source is missing/unsafe or fails to load" },
    { name: "onError", type: "callable", optional: true, aliases: ["onerror"], description: "Callable invoked when the video fails to load" },
  ],
  render: (_node, props, helpers) => {
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
    // The `muted` IDL attribute is initialised from the content attribute only
    // while the element is being created; `el` sets attributes afterwards, so
    // the attribute alone moves `defaultMuted` and leaves `video.muted` false —
    // which is enough for the autoplay policy to block playback outright.
    if (asBoolean(props.muted)) {
      video.muted = true;
      video.defaultMuted = true;
    }
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
    for (const raw of asArray<unknown>(props.tracks)) {
      if (!raw || typeof raw !== "object") continue;
      const t = raw as { src?: unknown; label?: unknown; srclang?: unknown; kind?: unknown; default?: unknown };
      const safeSrc = sanitiseTrackSrc(t.src);
      if (!safeSrc) continue;
      const kind = asString(t.kind, "subtitles");
      video.append(el("track", {
        src: safeSrc,
        kind: (TRACK_KINDS as readonly string[]).includes(kind) ? kind : "subtitles",
        label: asString(t.label) || null,
        srclang: asString(t.srclang) || null,
        default: asBoolean(t.default) ? "" : null,
      }));
    }
    playerWrap.append(video);

    const playing = helpers.useInstanceState<boolean>("playing", false);
    const endedRef = helpers.useInstanceState<unknown>("onEnded", undefined);
    endedRef.set(props.onEnded);
    wireMediaState(
      video,
      { root: ".rui-video-player", toggle: ".rui-video-player-play" },
      playing,
      endedRef,
      helpers,
    );

    const fallbackText = asString(props.fallback);
    const hasSource = video.hasAttribute("src") || video.querySelector("source") !== null;
    if (!hasSource) {
      // A blocked scheme, an omitted `src`, or a typo used to render as a bare
      // black rectangle — indistinguishable from "still loading".
      playerWrap.append(renderMediaFallback(fallbackText || "No video source — check `src`."));
    }
    // `onerror` IS transferable, so this closure stays current across renders.
    video.onerror = (event) => {
      const live = ((event as Event).currentTarget ?? (event as Event).target) as Element | null;
      const frame = live?.closest(".rui-video-player-frame");
      if (frame && !frame.querySelector(".rui-video-player-empty")) {
        frame.append(renderMediaFallback(fallbackText || "This video could not be loaded."));
      }
      helpers.invoke(props.onError);
    };

    if (!showControls) {
      // `controls: false` used to leave no way at all to start playback: no
      // handler, no transport UI, and autoplay blocked by the muted defect.
      const playBtn = renderPlayToggle("rui-video-player-play", playing.get(), MEDIA_PLAY_BUTTON_STYLE);
      playBtn.onclick = (event) => toggleMediaPlayback(event, ".rui-video-player-frame");
      video.onclick = (event) => toggleMediaPlayback(event, ".rui-video-player-frame");
      playerWrap.append(playBtn);
    }

    root.append(playerWrap);
    const caption = asString(props.caption);
    if (caption) root.append(el("figcaption", { class: "rui-video-player-caption" }, [caption]));
    return root;
  },
};

function renderMediaFallback(label: string): HTMLElement {
  const box = el("div", { class: "rui-video-player-empty", style: MEDIA_OVERLAY_STYLE });
  const icon = renderIcon("circle-exclamation", { className: "rui-video-player-empty-icon" });
  if (icon) box.append(icon);
  box.append(el("span", { class: "rui-video-player-empty-text" }, [label]));
  return box;
}

let audioIdSeq = 0;

export const AudioPlayer: ComponentSpec = {
  name: "AudioPlayer",
  description:
    "Themed native `<audio>` wrapper with a title, optional artist, and " +
    "standard transport controls. Pass `src` (or `sources`) plus a " +
    "`title` — the title names the player for assistive tech. " +
    "`controls=false` replaces the native bar with a single play/pause " +
    "button so the row still works. `autoplay` needs `muted: true` to be " +
    "allowed by the browser. `onEnded` fires on completion (advance a " +
    "playlist, mark an episode listened). Use for podcasts, voice notes, " +
    "and demo audio.",
  props: [
    { name: "src", type: "string", optional: true, description: "Audio URL (mp3 / ogg / wav / etc.)" },
    { name: "sources", type: "object[]", optional: true, description: "Array of {src, type} entries for multi-codec fallback" },
    { name: "title", type: "string", optional: true },
    { name: "artist", type: "string", optional: true },
    { name: "controls", type: "boolean", optional: true, description: "Show native controls (default true); false renders a play/pause button instead" },
    { name: "autoplay", type: "boolean", optional: true, description: "Requires `muted: true` — browsers block unmuted autoplay" },
    { name: "loop", type: "boolean", optional: true },
    { name: "icon", type: "string", optional: true, description: "Leading icon (default `music`)" },
    { name: "muted", type: "boolean", optional: true },
    { name: "onEnded", type: "callable", optional: true, aliases: ["onended"], description: "Callable invoked when playback reaches the end" },
  ],
  render: (_node, props, helpers) => {
    const root = el("div", { class: "rui-audio-player" });
    const meta = el("div", { class: "rui-audio-player-meta" });
    const iconNode = renderIcon(asString(props.icon, "music"), { className: "rui-audio-player-icon" });
    if (iconNode) meta.append(iconNode);
    const text = el("div", { class: "rui-audio-player-text" });
    // Stable ids so the title/artist can name the transport control: five
    // episodes on a page otherwise expose five identical "audio player"s.
    const idSlot = helpers.useInstanceState<string>("labelId", "");
    if (!idSlot.get()) idSlot.set(`rui-audio-player-${(audioIdSeq += 1)}`);
    const baseId = idSlot.get();
    const title = asString(props.title);
    if (title) text.append(el("div", { class: "rui-audio-player-title", id: `${baseId}-title` }, [title]));
    const artist = asString(props.artist);
    if (artist) text.append(el("div", { class: "rui-audio-player-artist", id: `${baseId}-artist` }, [artist]));
    meta.append(text);
    root.append(meta);
    const labelledBy = [title ? `${baseId}-title` : "", artist ? `${baseId}-artist` : ""]
      .filter(Boolean).join(" ");
    const showControls = props.controls === undefined ? true : asBoolean(props.controls);
    const audio = el("audio", {
      class: "rui-audio-player-audio",
      controls: showControls ? "" : null,
      autoplay: asBoolean(props.autoplay) ? "" : null,
      loop: asBoolean(props.loop) ? "" : null,
      muted: asBoolean(props.muted) ? "" : null,
      preload: "metadata",
      "aria-labelledby": labelledBy || null,
      "aria-label": labelledBy ? null : "Audio player",
    });
    // See VideoPlayer: the content attribute alone never sets `.muted`.
    if (asBoolean(props.muted)) {
      audio.muted = true;
      audio.defaultMuted = true;
    }
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

    const playing = helpers.useInstanceState<boolean>("playing", false);
    const endedRef = helpers.useInstanceState<unknown>("onEnded", undefined);
    endedRef.set(props.onEnded);
    wireMediaState(
      audio,
      { root: ".rui-audio-player", toggle: ".rui-audio-player-toggle" },
      playing,
      endedRef,
      helpers,
    );

    if (!showControls) {
      // Hiding the native bar used to leave the row unplayable — the promise
      // that it "still looks like a player" needs an actual transport.
      const toggle = renderPlayToggle("rui-audio-player-toggle", playing.get(), null);
      toggle.onclick = (event) => toggleMediaPlayback(event, ".rui-audio-player");
      root.append(toggle);
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
  if (isComponentNode(item)) {
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

/** Minimum horizontal travel, in px, that counts as a swipe rather than a tap. */
const SWIPE_THRESHOLD = 40;

/**
 * Hide an off-screen slide from both the tab order and the accessibility tree.
 *
 * Without this a keyboard user tabs into a slide that is scrolled out of view;
 * the browser then scrolls the `overflow: hidden` frame to reveal it, which
 * desyncs `scrollLeft` from the track transform permanently. A screen-reader
 * user hears every slide as one flat run of content.
 */
function markCarouselSlide(slide: Element, isActive: boolean): void {
  if (isActive) {
    slide.removeAttribute("aria-hidden");
    slide.removeAttribute("inert");
  } else {
    slide.setAttribute("aria-hidden", "true");
    slide.setAttribute("inert", "");
  }
}

/**
 * `translateX(0%)` is still a transform, and *any* transform makes the track a
 * containing block for `position: fixed` descendants — which is how a Modal or
 * Lightbox inside a slide ends up rendered inside that slide's box. There is
 * nothing to offset at index 0, so drop the declaration entirely there.
 */
function setTrackOffset(track: HTMLElement, index: number): void {
  if (index <= 0) track.style.removeProperty("transform");
  else track.style.transform = `translateX(${index * -100}%)`;
}

export const Carousel: ComponentSpec = {
  name: "Carousel",
  description:
    "Horizontal slider with prev/next buttons, dot navigation, arrow-key " +
    "and swipe support. Each child slide takes full width. Slides may be " +
    "Component nodes (Image, Card, MediaCard, …), URL strings, or plain " +
    "`{src, alt, caption?}` image objects — bare image objects are " +
    "auto-wrapped into a captioned figure. Bind a `$variable` to " +
    "`activeIndex` to drive or observe the active slide, or use `onChange`. " +
    "`autoplay` rotates every `interval` ms (paused while hovered or " +
    "focused) for hero banners. Give it a `label` so screen readers can " +
    "tell two carousels apart, and `empty`/`emptyText` for the no-slides " +
    "case. The active slide is preserved across re-renders via instance state.",
  props: [
    { name: "items", type: "Node[]", description: "Slide nodes, image URLs, or {src, alt, caption?} objects" },
    { name: "activeIndex", type: "number", optional: true, description: "0-indexed active slide (default 0); bind a $variable to control it" },
    { name: "ratio", type: "string", optional: true, description: "Aspect ratio of the frame (default `16:9`)" },
    { name: "showDots", type: "boolean", optional: true, description: "Show indicator dots (default true)" },
    { name: "showArrows", type: "boolean", optional: true, description: "Show prev/next arrows (default true)" },
    { name: "onChange", type: "callable", optional: true, aliases: ["onchange"], description: "Callable invoked with the new slide index whenever it changes" },
    { name: "autoplay", type: "boolean", optional: true, description: "Rotate slides automatically (pauses on hover / focus)" },
    { name: "interval", type: "number", optional: true, description: "Autoplay delay in ms (default 5000, minimum 1500)" },
    { name: "label", type: "string", optional: true, description: "Accessible name for the carousel region" },
    { name: "empty", type: "Node", optional: true, description: "Node rendered when `items` is empty" },
    { name: "emptyText", type: "string", optional: true, description: "Message shown when `items` is empty (default `No slides to show.`)" },
  ],
  render: (node, props, helpers) => {
    const items = asArray<unknown>(props.items);
    const count = items.length;
    const label = asString(props.label);
    const root = el("div", {
      class: "rui-carousel",
      role: "group",
      "aria-roledescription": "carousel",
      "aria-label": label || null,
    });
    if (count === 0) {
      // A data-driven gallery used to render a blank grey 16:9 box here.
      const custom = props.empty === undefined ? null : helpers.renderNode(props.empty);
      root.append(custom ?? el("div", { class: "rui-carousel-empty" }, [
        asString(props.emptyText, "No slides to show."),
      ]));
      return root;
    }

    // `activeIndex` used to be read once to seed the slot, so a $variable
    // could never move the carousel. Adopt the prop on the first render and
    // again whenever it CHANGES — the contract Tabs uses for `defaultValue` —
    // so programmatic control works without freezing user clicks.
    const indexStateName = node.argMeta?.[1]?.stateRef;
    const slot = helpers.useInstanceState<number>("active", 0);
    const seed = helpers.useInstanceState<number | null>("activeSeed", null);
    if (props.activeIndex !== undefined) {
      const wanted = Math.floor(asNumber(props.activeIndex, 0));
      if (seed.get() !== wanted) { seed.set(wanted); slot.set(wanted); }
    }
    let active = slot.get();
    if (!Number.isInteger(active) || active < 0 || active >= count) { active = 0; slot.set(active); }

    const showDots = props.showDots === undefined ? true : asBoolean(props.showDots);
    const showArrows = props.showArrows === undefined ? true : asBoolean(props.showArrows);
    const ratio = parseRatio(asString(props.ratio, "16:9"));
    const frame = el("div", {
      class: "rui-carousel-frame",
      style: `aspect-ratio:${ratio};`,
      // Only claim a tab stop when there is no other way in — with arrows or
      // dots on screen, focusing one of those is enough to reach the keys.
      tabindex: count > 1 && !showArrows && !showDots ? "0" : null,
    });
    const track = el("div", { class: "rui-carousel-track" });
    // Written through the CSSOM rather than as an attribute string so the
    // render output serialises identically to the live patch below — otherwise
    // morph rewrites `style` on every single re-render.
    setTrackOffset(track, active);
    items.forEach((item, i) => {
      const slide = el("div", {
        class: "rui-carousel-slide",
        role: "group",
        "aria-roledescription": "slide",
        "aria-label": `${i + 1} of ${count}`,
        "aria-hidden": i === active ? null : "true",
        inert: i === active ? null : "",
      });
      const rendered = renderCarouselSlide(item, helpers);
      if (rendered) slide.append(rendered);
      track.append(slide);
    });
    frame.append(track);

    /** Patch the LIVE subtree — instance-state writes do not re-render. */
    const applySlide = (liveRoot: Element, index: number): void => {
      const liveTrack = liveRoot.querySelector<HTMLElement>(".rui-carousel-track");
      if (liveTrack) setTrackOffset(liveTrack, index);
      const liveFrame = liveRoot.querySelector<HTMLElement>(".rui-carousel-frame");
      // A focus- or swipe-induced scroll of the clipped frame would otherwise
      // stay, offsetting every later slide by that amount for good.
      if (liveFrame && liveFrame.scrollLeft !== 0) liveFrame.scrollLeft = 0;
      liveRoot.querySelectorAll<HTMLElement>(".rui-carousel-slide").forEach((slide, i) => {
        markCarouselSlide(slide, i === index);
      });
      liveRoot.querySelectorAll<HTMLElement>(".rui-carousel-dot").forEach((dot, i) => {
        // `data-active` carries the paint; `aria-current` is what AT reads.
        dot.setAttribute("data-active", i === index ? "true" : "false");
        dot.setAttribute("aria-current", i === index ? "true" : "false");
      });
    };

    const move = (origin: Element, next: number): void => {
      const clamped = ((next % count) + count) % count;
      const previous = slot.get();
      slot.set(clamped);
      // Publish through the bound $variable when there is one, so the rest of
      // the app (a thumbnail strip, a step counter) can follow along.
      if (indexStateName) helpers.setState(indexStateName, clamped);
      const liveRoot = origin.closest(".rui-carousel");
      if (liveRoot) applySlide(liveRoot, clamped);
      if (previous !== clamped) helpers.invoke(props.onChange, clamped);
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

    if (count > 1) {
      // Pointer-based swipe: the frame cannot scroll natively (overflow is
      // hidden), so without this the natural touch gesture does nothing.
      const dragFrom = helpers.useInstanceState<number | null>("dragX", null);
      frame.onpointerdown = (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        dragFrom.set(event.clientX);
      };
      frame.onpointerup = (event) => {
        const startX = dragFrom.get();
        dragFrom.set(null);
        if (startX === null) return;
        const dx = event.clientX - startX;
        if (Math.abs(dx) < SWIPE_THRESHOLD) return;
        move(event.currentTarget as Element, slot.get() + (dx < 0 ? 1 : -1));
      };
      frame.onpointercancel = () => dragFrom.set(null);

      root.onkeydown = (event) => {
        // Never steal arrow keys from a control inside a slide.
        const target = event.target as Element | null;
        if (target?.closest("input,textarea,select,[contenteditable='true']")) return;
        const origin = (event.currentTarget ?? event.target) as Element;
        if (event.key === "ArrowLeft") move(origin, slot.get() - 1);
        else if (event.key === "ArrowRight") move(origin, slot.get() + 1);
        else if (event.key === "Home") move(origin, 0);
        else if (event.key === "End") move(origin, count - 1);
        else return;
        event.preventDefault();
      };
    }
    root.append(frame);

    if (showDots && count > 1) {
      const dots = el("div", { class: "rui-carousel-dots" });
      items.forEach((_item, i) => {
        const dot = el("button", {
          type: "button",
          class: "rui-carousel-dot",
          "data-active": i === active ? "true" : "false",
          "aria-current": i === active ? "true" : "false",
          "aria-label": `Go to slide ${i + 1}`,
        });
        dot.onclick = (event) => move(event.currentTarget as Element, i);
        dots.append(dot);
      });
      root.append(dots);
    }

    if (asBoolean(props.autoplay) && count > 1) {
      const interval = Math.max(1500, Math.floor(asNumber(props.interval, 5000)));
      // Resolve the live node before starting the timer: on a re-render `root`
      // is the snapshot morph discards, and registering the same disposer key
      // from it would tear down the mounted instance's working timer.
      deferToPaint(() => {
        if (!root.isConnected) return;
        const timer = setInterval(() => {
          if (!root.isConnected) { clearInterval(timer); return; }
          // WCAG 2.2.2 — do not yank the slide away from someone reading or
          // interacting with it.
          const doc = root.getRootNode() as Document | ShadowRoot;
          if (root.contains(doc.activeElement)) return;
          try { if (root.matches(":hover")) return; } catch { /* :hover unsupported */ }
          move(root, slot.get() + 1);
        }, interval);
        helpers.registerDisposer(() => clearInterval(timer), "rui-carousel-autoplay");
      });
    }
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Gallery + Lightbox
 * ----------------------------------------------------------------------- */

const GALLERY_FIT = ["cover", "contain"] as const;

export const Gallery: ComponentSpec = {
  name: "Gallery",
  description:
    "Responsive image grid. Pass items as plain URL strings, " +
    "`{src, alt, caption?}` objects, or `Image(...)` nodes (rendered in " +
    "full, so their own `fit`/`fallback`/`srcset` apply). `fit: \"contain\"` " +
    "stops logos and screenshots being centre-cropped. When " +
    "`onSelect` is provided each tile becomes a button; bind it through " +
    "an Action that opens a `Lightbox`. `empty`/`emptyText` cover the " +
    "no-results case.",
  props: [
    { name: "items", type: "any[]" },
    { name: "columns", type: "number", optional: true, description: "Preferred column count 1–6 (default auto)" },
    { name: "ratio", type: "string", optional: true, description: "Per-tile aspect ratio (default `1:1`)" },
    { name: "onSelect", type: "callable", optional: true, description: "Callable fired when a tile is clicked" },
    { name: "fit", type: "string", optional: true, enum: GALLERY_FIT, description: "How each image fills its tile (default `cover`)" },
    { name: "label", type: "string", optional: true, description: "Accessible name for the grid" },
    { name: "empty", type: "Node", optional: true, description: "Node rendered when `items` is empty" },
    { name: "emptyText", type: "string", optional: true, description: "Message shown when `items` is empty (default `No images to show.`)" },
  ],
  render: (_node, props, helpers) => {
    const items = asArray<unknown>(props.items);
    // `Number("auto")` is NaN and NaN propagates through Math.min/max, so the
    // old expression only avoided emitting `data-columns="NaN"` by accident.
    const rawColumns = props.columns === undefined || props.columns === null
      ? NaN
      : asNumber(props.columns, NaN);
    const columns = Number.isFinite(rawColumns)
      ? Math.max(1, Math.min(6, Math.floor(rawColumns)))
      : null;
    const fit = asString(props.fit, "cover") === "contain" ? "contain" : "cover";
    const ratio = parseRatio(asString(props.ratio, "1:1"));
    const label = asString(props.label);
    const root = el("div", {
      class: "rui-gallery",
      "data-columns": columns === null ? null : String(columns),
      "data-fit": fit,
      role: label ? "group" : null,
      "aria-label": label || null,
    });
    if (items.length === 0) {
      const custom = props.empty === undefined ? null : helpers.renderNode(props.empty);
      root.append(custom ?? el("div", { class: "rui-gallery-empty" }, [
        asString(props.emptyText, "No images to show."),
      ]));
      return root;
    }
    const clickable = typeof props.onSelect === "function";
    items.forEach((raw, i) => {
      const tile = el(clickable ? "button" : "figure" as "figure", {
        type: clickable ? "button" : null,
        class: "rui-gallery-tile",
        "data-clickable": clickable ? "true" : null,
        style: `aspect-ratio:${ratio};`,
        "data-index": String(i),
      });
      if (isComponentNode(raw)) {
        // Component slides are rendered in full — scraping `args[0..2]` threw
        // away `fit`, `fallback`, `srcset`, … and turned any non-Image node
        // into an empty placeholder.
        tile.append(helpers.renderNode(raw));
      } else {
        const { src, alt, caption } = extractGalleryItem(raw);
        const safeSrc = sanitiseImageSrc(src);
        if (safeSrc) {
          // Inline so `fit` works without a per-tile stylesheet hook; the
          // sheet's `object-fit: cover` default stays for untouched galleries.
          tile.append(el("img", { src: safeSrc, alt, loading: "lazy", style: `object-fit:${fit};` }));
        } else {
          const placeholder = renderIcon("image", { className: "rui-gallery-placeholder" });
          if (placeholder) tile.append(placeholder);
        }
        if (caption) {
          tile.append(el("span", { class: "rui-gallery-caption" }, [caption]));
        }
        // A button whose only content is an `alt=""` image has no accessible
        // name at all, so fall back to its position in the grid.
        if (clickable && !alt && !caption) tile.setAttribute("aria-label", `Image ${i + 1}`);
      }
      if (clickable) {
        tile.onclick = () => helpers.invoke(props.onSelect, i, raw);
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

interface LightboxEntry { src: string; alt: string; caption: string }

/**
 * The UA stylesheet gives `[popover]` fit-content sizing, `margin: auto` and a
 * solid border — which would repaint the full-viewport scrim as a small bordered
 * box once it is promoted into the top layer. Neutralising them from the render
 * output (rather than at runtime) means morph keeps the value in sync for free.
 */
const LIGHTBOX_POPOVER_RESET =
  "width:auto;height:auto;max-width:none;max-height:none;border:0;overflow:hidden;";

function lightboxLabel(entry: LightboxEntry, index: number, total: number): string {
  return entry.alt || entry.caption || `Image ${index + 1} of ${total}`;
}

export const Lightbox: ComponentSpec = {
  name: "Lightbox",
  description:
    "Image overlay. Pass `items` (string URLs or `{src, alt, caption?}` " +
    "objects). `open` and `index` work as literals or as `$variable` " +
    "bindings; without a bound `open` the component manages itself and " +
    "renders a clickable thumbnail of the current image (suppress it with " +
    "`showThumbnail: false` when something else does the opening). " +
    "Clicking the backdrop or ×, or pressing Escape, closes and fires " +
    "`onClose`; the arrows and ArrowLeft/ArrowRight step through the array. " +
    "Focus moves into the viewer on open, is trapped while it is open, and " +
    "is restored on close.",
  props: [
    { name: "items", type: "any[]" },
    { name: "open", type: "boolean", optional: true, description: "Open/closed; bind a $variable to control externally" },
    { name: "index", type: "number", optional: true, description: "0-indexed current image; typically a $variable" },
    { name: "onClose", type: "callable", optional: true, aliases: ["onclose"], description: "Callable invoked whenever the viewer closes" },
    { name: "showThumbnail", type: "boolean", optional: true, description: "Render the clickable thumbnail (default: only when `open` is not bound)" },
  ],
  render: (node, props, helpers) => {
    const items: LightboxEntry[] = asArray<unknown>(props.items)
      .map((raw) => extractGalleryItem(raw))
      .filter((entry) => sanitiseImageSrc(entry.src) !== "");
    const total = items.length;
    const indexStateName = node.argMeta?.[2]?.stateRef;
    const openStateName = node.argMeta?.[1]?.stateRef;

    // Self-managed open/index when no $variable is bound — clicking the
    // thumbnail toggles the overlay, prev/next step through `items`.
    const openGiven = props.open !== undefined;
    const indexGiven = props.index !== undefined;
    const internalOpen = helpers.useInstanceState<boolean>("open", openGiven ? asBoolean(props.open) : false);
    const internalIndex = helpers.useInstanceState<number>(
      "index", indexGiven ? Math.floor(asNumber(props.index, 0)) : 0,
    );
    // A literal `open`/`index` used to be ignored outright — both were only
    // read when the call site happened to bind a $variable. Seed from the
    // literal and re-adopt whenever the author changes it, so the declared
    // props work either way without freezing the internal toggle.
    const openSeed = helpers.useInstanceState<boolean | null>("openSeed", null);
    if (!openStateName && openGiven) {
      const wanted = asBoolean(props.open);
      if (openSeed.get() !== wanted) { openSeed.set(wanted); internalOpen.set(wanted); }
    }
    const indexSeed = helpers.useInstanceState<number | null>("indexSeed", null);
    if (!indexStateName && indexGiven) {
      const wanted = Math.floor(asNumber(props.index, 0));
      if (indexSeed.get() !== wanted) { indexSeed.set(wanted); internalIndex.set(wanted); }
    }
    const isOpen = openStateName ? asBoolean(props.open) : internalOpen.get();
    const normalise = (raw: number): number => (total === 0 ? 0 : ((raw % total) + total) % total);
    const currentIndex = (): number => normalise(
      indexStateName ? Math.floor(asNumber(props.index, 0)) : internalIndex.get(),
    );
    const idx = currentIndex();

    const wasOpen = helpers.useInstanceState<boolean>("wasOpen", false);
    const focusPrev = helpers.useInstanceState<HTMLElement | null>("focusPrev", null);
    const scrollLock = helpers.useInstanceState<string | null>("scrollLock", null);
    const liveRootRef = helpers.useInstanceState<HTMLElement | null>("liveRoot", null);

    const lockScroll = (): void => {
      const body = typeof document === "undefined" ? null : document.body;
      if (!body || scrollLock.get() !== null) return;
      scrollLock.set(body.style.overflow);
      body.style.overflow = "hidden";
    };
    const unlockScroll = (): void => {
      const body = typeof document === "undefined" ? null : document.body;
      const previous = scrollLock.get();
      if (!body || previous === null) return;
      body.style.overflow = previous;
      scrollLock.set(null);
    };
    // Registered once per instance (the flag guards the keyed-disposer trap,
    // where re-registering runs the previous cleanup immediately) so an
    // unmount while open cannot leave the page permanently unscrollable.
    const lockDisposer = helpers.useInstanceState<boolean>("scrollDisposer", false);
    if (!lockDisposer.get()) {
      lockDisposer.set(true);
      helpers.registerDisposer(() => unlockScroll(), "rui-lightbox-scroll");
    }

    /**
     * Promote the scrim into the browser top layer. `position: fixed` alone is
     * re-trapped by any ancestor that establishes a containing block — a
     * `transform` from the universal `animate` channel, or a Carousel track —
     * which collapses the "full-viewport" viewer into that ancestor's box.
     * `showPopover()` escapes clipping AND containing blocks without
     * reparenting, so morph still sees the tree it rendered.
     */
    const promote = (overlayEl: HTMLElement, next: boolean): void => {
      const api = overlayEl as unknown as { showPopover?: () => void; hidePopover?: () => void };
      if (typeof api.showPopover !== "function") return;
      try {
        if (next) api.showPopover();
        else api.hidePopover?.();
      } catch { /* already in that state, or detached — the fixed scrim still shows */ }
    };

    const applyIndex = (liveRoot: Element, next: number): void => {
      const entry = items[next];
      if (!entry) return;
      const safeSrc = sanitiseImageSrc(entry.src);
      const dialog = liveRoot.querySelector<HTMLElement>(".rui-lightbox");
      if (dialog) {
        dialog.setAttribute("aria-label", lightboxLabel(entry, next, total));
        const img = dialog.querySelector<HTMLImageElement>(".rui-lightbox-image-wrap img");
        if (img && safeSrc) { img.setAttribute("src", safeSrc); img.setAttribute("alt", entry.alt); }
        const caption = dialog.querySelector(".rui-lightbox-caption");
        if (caption) {
          caption.textContent = entry.caption;
          caption.toggleAttribute("hidden", !entry.caption);
        }
        const counter = dialog.querySelector(".rui-lightbox-counter");
        if (counter) counter.textContent = `${next + 1} / ${total}`;
      }
      const thumb = liveRoot.querySelector<HTMLElement>(".rui-lightbox-thumb");
      if (thumb) {
        thumb.setAttribute("aria-label", entry.alt || "Open image");
        const thumbImg = thumb.querySelector<HTMLImageElement>("img");
        if (thumbImg && safeSrc) { thumbImg.setAttribute("src", safeSrc); thumbImg.setAttribute("alt", entry.alt); }
      }
    };

    const applyOpen = (liveRoot: HTMLElement, next: boolean): void => {
      const overlayEl = liveRoot.querySelector<HTMLElement>(".rui-lightbox-overlay");
      if (!overlayEl) return;
      overlayEl.setAttribute("data-open", next ? "true" : "false");
      promote(overlayEl, next);
      const doc = liveRoot.getRootNode() as Document | ShadowRoot;
      if (next) {
        focusPrev.set((doc.activeElement as HTMLElement | null) ?? null);
        lockScroll();
        const dialog = overlayEl.querySelector<HTMLElement>(".rui-lightbox") ?? overlayEl;
        deferToPaint(() => { if (dialog.isConnected) dialog.focus?.(); });
      } else {
        unlockScroll();
        const restore = focusPrev.get();
        focusPrev.set(null);
        deferToPaint(() => { if (restore?.isConnected) restore.focus?.(); });
      }
    };

    const liveRootFrom = (event: Event): HTMLElement | null => {
      const origin = (event.currentTarget ?? event.target) as Element | null;
      return (origin?.closest(".rui-lightbox-root") as HTMLElement | null) ?? liveRootRef.get();
    };

    const setOpen = (next: boolean, liveRoot: HTMLElement | null): void => {
      // Recorded before the state write so a synchronous re-render does not
      // also see a transition and apply it twice.
      wasOpen.set(next);
      if (openStateName) helpers.setState(openStateName, next);
      else internalOpen.set(next);
      if (liveRoot) applyOpen(liveRoot, next);
      if (!next) helpers.invoke(props.onClose);
    };
    const setIndex = (next: number, liveRoot: HTMLElement | null): void => {
      if (total === 0) return;
      const clamped = normalise(next);
      if (indexStateName) helpers.setState(indexStateName, clamped);
      else internalIndex.set(clamped);
      if (liveRoot) applyIndex(liveRoot, clamped);
    };

    const root = el("div", { class: "rui-lightbox-root" });
    // Remember the mounted root: an externally driven `open` never passes
    // through a handler, so the transition below has to be applied to the node
    // from an earlier render — this snapshot is the one morph discards.
    if (!liveRootRef.get()?.isConnected) {
      deferToPaint(() => { if (root.isConnected) liveRootRef.set(root); });
    }
    if (isOpen !== wasOpen.get()) {
      wasOpen.set(isOpen);
      deferToPaint(() => {
        const live = root.isConnected ? root : liveRootRef.get();
        if (live?.isConnected) applyOpen(live, isOpen);
      });
    }

    const showThumb = props.showThumbnail === undefined
      ? !openStateName
      : asBoolean(props.showThumbnail);
    if (showThumb && total > 0) {
      const current = items[idx]!;
      const thumb = el("button", {
        type: "button",
        class: "rui-lightbox-thumb",
        "aria-label": current.alt || "Open image",
      });
      const safeThumb = sanitiseImageSrc(current.src);
      if (safeThumb) thumb.append(el("img", { src: safeThumb, alt: current.alt, loading: "lazy" }));
      thumb.onclick = (event) => {
        event.stopPropagation();
        setOpen(true, liveRootFrom(event));
      };
      root.append(thumb);
    }

    const overlay = el("div", {
      class: "rui-lightbox-overlay",
      "data-open": isOpen ? "true" : "false",
      // `manual` only: dismissal stays entirely ours, so native light-dismiss
      // cannot fight the Escape handler below.
      popover: "manual",
      style: LIGHTBOX_POPOVER_RESET,
    });
    root.append(overlay);
    if (total === 0) return root;
    const current = items[idx]!;
    const safeSrc = sanitiseImageSrc(current.src);
    overlay.onclick = (event) => {
      // Backdrop only — a click on the dialog must not close it.
      if (event.target !== event.currentTarget) return;
      setOpen(false, liveRootFrom(event));
    };
    const closeFromKeys = dialogKeydownHandler(".rui-lightbox", (origin) => {
      setOpen(false, (origin.closest(".rui-lightbox-root") as HTMLElement | null) ?? liveRootRef.get());
    });
    overlay.onkeydown = (event) => {
      if (total > 1 && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        setIndex(currentIndex() + (event.key === "ArrowLeft" ? -1 : 1), liveRootFrom(event));
        return;
      }
      // Escape closes; Tab cycles inside the dialog (focus trap).
      closeFromKeys(event);
    };
    const dialog = el("div", {
      class: "rui-lightbox",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": lightboxLabel(current, idx, total),
      // Focusable so focus can move in on open and be trapped while open.
      tabindex: "-1",
    });
    const closeBtn = el("button", {
      type: "button",
      class: "rui-lightbox-close",
      "aria-label": "Close lightbox",
    }, ["×"]);
    closeBtn.onclick = (event) => {
      event.stopPropagation();
      setOpen(false, liveRootFrom(event));
    };
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
      prev.onclick = (event) => {
        event.stopPropagation();
        setIndex(currentIndex() - 1, liveRootFrom(event));
      };
      const next = el("button", {
        type: "button",
        class: "rui-lightbox-arrow",
        "data-direction": "next",
        "aria-label": "Next image",
      });
      const nextIcon = renderIcon("chevron-right");
      if (nextIcon) next.append(nextIcon);
      next.onclick = (event) => {
        event.stopPropagation();
        setIndex(currentIndex() + 1, liveRootFrom(event));
      };
      dialog.append(prev, next);
    }
    const imageWrap = el("div", { class: "rui-lightbox-image-wrap" });
    if (safeSrc) {
      imageWrap.append(el("img", { src: safeSrc, alt: current.alt }));
    }
    dialog.append(imageWrap);
    // Caption and counter are rendered unconditionally (hidden when empty) so
    // stepping through images has a node to write into — the alternative is a
    // caption that can never appear once the first image lacked one.
    dialog.append(el("div", {
      class: "rui-lightbox-caption",
      hidden: current.caption ? null : "",
    }, [current.caption]));
    if (total > 1) {
      dialog.append(el("div", { class: "rui-lightbox-counter" }, [`${idx + 1} / ${total}`]));
    }
    // The dialog lives in the DOM whether or not the viewer is open: the
    // overlay's `data-open` is the only thing that changes, which is what makes
    // a self-managed open/close a live-DOM patch instead of a lost re-render.
    overlay.append(dialog);
    return root;
  },
};

/* ----------------------------------------------------------------------- *
 * Map — static OpenStreetMap embed
 * ----------------------------------------------------------------------- */

/** Web Mercator tiles stop at ±85.05°; longitudes wrap at ±180°. */
const MAX_LAT = 85;
const MAX_LNG = 180;
const clampLat = (value: number): number => Math.max(-MAX_LAT, Math.min(MAX_LAT, value));
const clampLng = (value: number): number => Math.max(-MAX_LNG, Math.min(MAX_LNG, value));

function parseLatLng(raw: unknown): { lat: number; lng: number } | null {
  if (!raw) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const r = raw as { lat?: unknown; lng?: unknown; latitude?: unknown; longitude?: unknown };
    const lat = asNumber(r.lat ?? r.latitude, NaN);
    const lng = asNumber(r.lng ?? r.longitude, NaN);
    if (isLatLng(lat, lng)) return { lat, lng };
  }
  if (Array.isArray(raw) && raw.length >= 2) {
    const lat = asNumber(raw[0], NaN);
    const lng = asNumber(raw[1], NaN);
    if (isLatLng(lat, lng)) return { lat, lng };
  }
  if (typeof raw === "string") {
    const parts = raw.split(",").map((s) => Number(s.trim()));
    if (parts.length >= 2 && isLatLng(parts[0]!, parts[1]!)) {
      return { lat: parts[0]!, lng: parts[1]! };
    }
  }
  return null;
}

/**
 * Finite is not enough: `Map(lat: 999, lng: 5000)` — a swapped pair, or an LLM
 * hallucinating coordinates — used to be accepted verbatim and produced a grey
 * frame with no error. Out-of-range input is invalid input.
 */
function isLatLng(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= MAX_LNG;
}

export const Map: ComponentSpec = {
  name: "Map",
  description:
    "Static map view centered on a lat/lng coordinate. Renders an " +
    "OpenStreetMap embed inside a sandboxed `<iframe>` (no external JS, no " +
    "API key). Pass `lat` (-90…90) and `lng` (-180…180) as bare numbers; " +
    "`zoom` controls the level (1–18, default 13). Optional `markers` are " +
    "projected onto the map as pins and listed as labelled chips beneath " +
    "it. Use for store locators, address cards, itinerary previews.",
  props: [
    { name: "lat", type: "number", description: "Latitude of the map center (-90…90)" },
    { name: "lng", type: "number", description: "Longitude of the map center (-180…180)" },
    { name: "zoom", type: "number", optional: true, description: "1–18 (default 13)" },
    { name: "markers", type: "object[]", optional: true, aliases: ["locations"], description: "Array of {lat, lng, label?} — drawn as pins over the map and listed beneath it" },
    { name: "height", type: "string", optional: true, description: "CSS height (default 320px)" },
    { name: "caption", type: "string", optional: true },
    { name: "title", type: "string", optional: true, description: "Accessible name for the map frame (defaults to the caption)" },
  ],
  render: (_node, props) => {
    const root = el("figure", { class: "rui-map" });
    const height = sanitiseCssLength(props.height, "320px");
    const frameWrap = el("div", { class: "rui-map-frame", style: `height:${height};` });
    const caption = asString(props.caption);
    const lat = asNumber(props.lat, NaN);
    const lng = asNumber(props.lng, NaN);
    const center = isLatLng(lat, lng) ? { lat, lng } : null;
    if (!center) {
      const finite = Number.isFinite(lat) && Number.isFinite(lng);
      frameWrap.append(el("div", { class: "rui-map-empty" }, [
        finite
          ? "Out of range — lat must be -90…90 and lng -180…180."
          : "Pass lat & lng (numbers) to render the map.",
      ]));
      root.append(frameWrap);
      if (caption) root.append(el("figcaption", { class: "rui-map-caption" }, [caption]));
      return root;
    }
    const zoom = Math.max(1, Math.min(18, Math.floor(asNumber(props.zoom, 13))));
    // Approximate bounding box from a span that scales with zoom — small
    // enough that the requested center stays prominent in the embed. Every
    // edge is clamped: at zoom 1 the raw span is ±128° of longitude and ±64°
    // of latitude, which pushed the north edge past the legal 90° and made
    // the embed render blank.
    const span = 1 / Math.pow(2, zoom - 8);
    const west = clampLng(center.lng - span);
    const east = clampLng(center.lng + span);
    const south = clampLat(center.lat - span / 2);
    const north = clampLat(center.lat + span / 2);
    const bbox = [west, south, east, north].join(",");
    const url = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${center.lat},${center.lng}`;
    const iframe = el("iframe", {
      class: "rui-map-iframe",
      src: url,
      loading: "lazy",
      title: asString(props.title) || caption || "Map view",
      referrerpolicy: "no-referrer",
      // Tiles and pan/zoom need scripts; nothing else. Without a sandbox the
      // third-party frame keeps the ability to navigate the host page's
      // top-level browsing context on user activation.
      sandbox: "allow-scripts",
    });
    frameWrap.append(iframe);
    const markers = asArray<unknown>(props.markers)
      .map((raw) => {
        const pin = parseLatLng(raw);
        const label = raw && typeof raw === "object" ? asString((raw as { label?: unknown }).label) : "";
        return pin ? { ...pin, label } : null;
      })
      .filter((p): p is { lat: number; lng: number; label: string } => p !== null);
    if (markers.length > 0) {
      // The embed endpoint carries exactly one `marker` parameter — the centre
      // — so every other location is projected into the bbox and drawn over
      // the frame. `pointer-events: none` keeps the map itself draggable.
      const pins = el("div", {
        class: "rui-map-pins",
        style: "position:absolute;inset:0;pointer-events:none;",
        "aria-hidden": "true",
      });
      for (const m of markers) {
        const x = ((m.lng - west) / (east - west)) * 100;
        const y = ((north - m.lat) / (north - south)) * 100;
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        if (x < 0 || x > 100 || y < 0 || y > 100) continue;
        const pin = el("span", {
          class: "rui-map-pin",
          style: `position:absolute;left:${x.toFixed(3)}%;top:${y.toFixed(3)}%;`
            + "transform:translate(-50%,-100%);color:var(--rui-color-primary);font-size:18px;"
            + "text-shadow:0 1px 2px rgba(0,0,0,0.45);",
        });
        const pinIcon = renderIcon("location-dot");
        if (pinIcon) pin.append(pinIcon);
        pins.append(pin);
      }
      if (pins.childElementCount > 0) frameWrap.append(pins);
    }
    root.append(frameWrap);
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
    if (caption) root.append(el("figcaption", { class: "rui-map-caption" }, [caption]));
    return root;
  },
};

function parseRatio(input: string): string {
  if (input.includes(":")) {
    const [w, h] = input.split(":");
    const num = Number(w);
    const den = Number(h);
    // `num` needs the same positivity check as `den`: `-16:9` and `0:9` are
    // invalid `aspect-ratio` values, so the browser drops the declaration and
    // the frame collapses to zero height instead of falling back to 16:9.
    if (Number.isFinite(num) && Number.isFinite(den) && num > 0 && den > 0) return `${num} / ${den}`;
  }
  const n = Number(input);
  return Number.isFinite(n) && n > 0 ? `${n} / 1` : "16 / 9";
}
