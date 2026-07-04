"use client";
/**
 * React bridge to the `<aktion-app>` custom element. The Aktion runtime is
 * client-only (importing it registers the custom element), so the element is
 * created imperatively after `loadAktion()` resolves. The same element
 * instance is kept alive across `program` / `theme` changes — updates go
 * through `setResponse` / the `theme` attribute so runtime state survives
 * where possible.
 */
import { useEffect, useRef, type CSSProperties } from "react";
import { loadAktion } from "@/design/schema";

/** Minimal surface of the registered custom element. */
type AktionAppElement = HTMLElement & { setResponse(program: string): void };

export interface AktionHostProps {
  program: string;
  theme?: string;
  className?: string;
  style?: CSSProperties;
  onReady?: (el: HTMLElement) => void;
}

export default function AktionHost({
  program,
  theme = "light",
  className,
  style,
  onReady,
}: AktionHostProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<AktionAppElement | null>(null);

  // Latest-value refs so the async mount effect applies current props without
  // re-running (the element must be created exactly once).
  const programRef = useRef(program);
  const themeRef = useRef(theme);
  const onReadyRef = useRef(onReady);
  programRef.current = program;
  themeRef.current = theme;
  onReadyRef.current = onReady;

  // Mount: load the runtime, create the element once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadAktion();
      } catch {
        return; // SSR or runtime failed to load — nothing to render.
      }
      if (cancelled) return;
      const container = containerRef.current;
      if (!container) return;

      const el = document.createElement("aktion-app") as AktionAppElement;
      el.setAttribute("theme", themeRef.current);
      // No default app margin — previews and exports render edge-to-edge.
      el.setAttribute("margin", "0");
      el.style.display = "block";
      el.style.width = "100%";
      el.style.height = "100%";
      // Clear anything left behind (e.g. from fast refresh) before mounting.
      while (container.firstChild) container.removeChild(container.firstChild);
      container.appendChild(el);
      el.setResponse(programRef.current);
      elRef.current = el;
      onReadyRef.current?.(el);
    })();
    return () => {
      cancelled = true;
      elRef.current?.remove();
      elRef.current = null;
    };
  }, []);

  // Theme changes update the attribute on the live element.
  useEffect(() => {
    elRef.current?.setAttribute("theme", theme);
  }, [theme]);

  // Program changes re-feed the SAME element — never recreate it.
  useEffect(() => {
    elRef.current?.setResponse(program);
  }, [program]);

  return <div ref={containerRef} className={className} style={style} />;
}

/**
 * Best-effort settle helper for exports and thumbnails: resolves once the
 * element's shadow root has rendered content and stayed rendered for two
 * consecutive animation frames, or after `timeoutMs`.
 */
export function waitForAktionRender(
  el: HTMLElement,
  timeoutMs = 1500,
): Promise<void> {
  return new Promise((resolve) => {
    const start = performance.now();
    let stable = 0;
    const tick = () => {
      const rendered = (el.shadowRoot?.childElementCount ?? 0) > 0;
      stable = rendered ? stable + 1 : 0;
      if (stable >= 2 || performance.now() - start >= timeoutMs) {
        resolve();
        return;
      }
      // Timer-based, not requestAnimationFrame: rAF pauses entirely in
      // hidden/background tabs and the deadline check only runs in here.
      setTimeout(tick, 50);
    };
    setTimeout(tick, 0);
  });
}
