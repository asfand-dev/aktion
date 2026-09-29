/**
 * Aktion DevTools — web vitals, frame rate, and interactions.
 *
 * The render profiler measures the runtime's own work. Users experience
 * something else: how long a click takes to paint (INP), whether the largest
 * element arrived quickly (LCP), whether things jumped around (CLS), and
 * whether scrolling stayed at 60fps. Those come from the browser's own
 * performance timeline, observed here for as long as the panel is open.
 *
 * Every observer is optional — Safari and Firefox support a subset — and a
 * missing entry type is reported as "not supported", never as a zero.
 */

export interface InteractionRecord {
  id: number;
  type: string;
  target: string;
  /** `performance.now()` timestamp of the input event. */
  start: number;
  duration: number;
  /** Time from input to the first event handler starting. */
  inputDelay: number;
  /** Time spent running event handlers. */
  processing: number;
  /** Time from the handlers finishing to the next paint. */
  presentation: number;
}

export interface LongTaskRecord {
  start: number;
  duration: number;
  /** Long-animation-frame attribution, when supported. */
  scripts?: Array<{ source: string; invoker: string; duration: number }>;
  blocking?: number;
}

export interface LayoutShiftRecord {
  time: number;
  value: number;
  sources: string[];
}

export interface VitalsSnapshot {
  supported: { eventTiming: boolean; lcp: boolean; cls: boolean; longTasks: boolean; loaf: boolean; memory: boolean };
  fps: number | null;
  /** `[performance.now(), fps]`, oldest first. */
  fpsSamples: ReadonlyArray<readonly [number, number]>;
  /** Frames longer than 50ms since the monitor started. */
  droppedFrames: number;
  lcp: { value: number; element: string; size: number } | null;
  cls: { value: number; shifts: ReadonlyArray<LayoutShiftRecord> };
  inp: { value: number; interaction: InteractionRecord } | null;
  interactions: ReadonlyArray<InteractionRecord>;
  longTasks: ReadonlyArray<LongTaskRecord>;
  fcp: number | null;
  ttfb: number | null;
  heap: { used: number; total: number; limit: number } | null;
  heapSamples: ReadonlyArray<readonly [number, number]>;
}

export function emptyVitals(): VitalsSnapshot {
  return {
    supported: { eventTiming: false, lcp: false, cls: false, longTasks: false, loaf: false, memory: false },
    fps: null,
    fpsSamples: [],
    droppedFrames: 0,
    lcp: null,
    cls: { value: 0, shifts: [] },
    inp: null,
    interactions: [],
    longTasks: [],
    fcp: null,
    ttfb: null,
    heap: null,
    heapSamples: [],
  };
}

/** Core Web Vitals thresholds: [good, needs-improvement] upper bounds. */
export const THRESHOLDS = {
  lcp: [2500, 4000],
  inp: [200, 500],
  cls: [0.1, 0.25],
  fcp: [1800, 3000],
  ttfb: [800, 1800],
} as const;

export function rate(metric: keyof typeof THRESHOLDS, value: number | null | undefined): "good" | "needs-improvement" | "poor" | "unknown" {
  if (value === null || value === undefined || !Number.isFinite(value)) return "unknown";
  const [good, ni] = THRESHOLDS[metric];
  return value <= good ? "good" : value <= ni ? "needs-improvement" : "poor";
}

/**
 * INP per the web-vitals definition: the worst interaction, ignoring one
 * outlier for every 50 interactions (so one GC pause in a long session does
 * not define the page).
 */
export function computeInp(interactions: ReadonlyArray<InteractionRecord>): { value: number; interaction: InteractionRecord } | null {
  if (interactions.length === 0) return null;
  const sorted = [...interactions].sort((a, b) => b.duration - a.duration);
  const skip = Math.min(sorted.length - 1, Math.floor(interactions.length / 50));
  const pick = sorted[skip]!;
  return { value: pick.duration, interaction: pick };
}

/** CLS: the largest session window (gaps < 1s, windows ≤ 5s). */
export function computeCls(shifts: ReadonlyArray<LayoutShiftRecord>): number {
  let best = 0;
  let current = 0;
  let windowStart = -Infinity;
  let last = -Infinity;
  for (const shift of [...shifts].sort((a, b) => a.time - b.time)) {
    if (shift.time - last > 1000 || shift.time - windowStart > 5000) {
      current = 0;
      windowStart = shift.time;
    }
    current += shift.value;
    last = shift.time;
    if (current > best) best = current;
  }
  return best;
}

function describeNode(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const el = node as Element;
  if (typeof el.tagName !== "string") return "";
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const cls = typeof el.className === "string" && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : "";
  return `${tag}${id}${cls}`;
}

const CAP = { fps: 240, interactions: 200, longTasks: 150, shifts: 200, heap: 240 };

const CHROME_TAGS = new Set(["AKTION-DEVTOOLS", "AKTION-DEVTOOLS-OVERLAY"]);

/**
 * True for a node inside the DevTools panel or its page overlay. Clicking the
 * debugger is not an interaction with the app, and counting it would make the
 * panel's own work show up as the app's INP.
 */
export function isDevtoolsNode(node: Node | null | undefined): boolean {
  let current: Node | null | undefined = node;
  for (let guard = 0; current && guard < 64; guard += 1) {
    if (current.nodeType === 1 && CHROME_TAGS.has((current as Element).tagName)) return true;
    const parent: Node | null = current.parentNode;
    current = parent && parent.nodeType === 11 ? (parent as ShadowRoot).host ?? null : parent;
  }
  return false;
}

/**
 * Observes the page while the panel is open. `onChange` is throttled to the
 * rate a status bar can usefully show; the panel decides whether to repaint.
 */
export class VitalsMonitor {
  private data = emptyVitals();
  private observers: PerformanceObserver[] = [];
  private frameHandle: number | null = null;
  private heapTimer: ReturnType<typeof setInterval> | null = null;
  private frames = 0;
  private windowStart = 0;
  private lastFrame = 0;
  private onChange: (() => void) | null = null;
  private notifyPending = false;
  private running = false;
  private readonly interactions = new Map<number, InteractionRecord>();

  get isRunning(): boolean {
    return this.running;
  }

  snapshot(): VitalsSnapshot {
    return this.data;
  }

  start(onChange: () => void): void {
    if (this.running) return;
    this.running = true;
    this.onChange = onChange;
    this.observeAll();
    this.readNavigation();
    this.startFrames();
    this.startHeap();
  }

  stop(): void {
    this.running = false;
    for (const observer of this.observers) {
      try { observer.disconnect(); } catch { /* ignore */ }
    }
    this.observers = [];
    if (this.frameHandle !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
    if (this.heapTimer !== null) clearInterval(this.heapTimer);
    this.heapTimer = null;
    this.onChange = null;
  }

  /** Pause the frame loop while the panel is hidden — sampling FPS is not free. */
  setFrameSampling(enabled: boolean): void {
    if (!this.running) return;
    if (enabled && this.frameHandle === null) this.startFrames();
    if (!enabled && this.frameHandle !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }
  }

  private notify(): void {
    if (this.notifyPending || !this.onChange) return;
    this.notifyPending = true;
    setTimeout(() => {
      this.notifyPending = false;
      this.onChange?.();
    }, 250);
  }

  private mutate(patch: Partial<VitalsSnapshot>): void {
    this.data = { ...this.data, ...patch };
    this.notify();
  }

  private observe(type: string, handler: (entries: PerformanceEntryList) => void, extra: Record<string, unknown> = {}): boolean {
    if (typeof PerformanceObserver !== "function") return false;
    const supported = (PerformanceObserver as unknown as { supportedEntryTypes?: readonly string[] }).supportedEntryTypes;
    if (supported && !supported.includes(type)) return false;
    try {
      const observer = new PerformanceObserver((list) => {
        try {
          handler(list.getEntries());
        } catch {
          /* one malformed entry must not stop observation */
        }
      });
      observer.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
      this.observers.push(observer);
      return true;
    } catch {
      return false;
    }
  }

  private observeAll(): void {
    const supported = { ...this.data.supported };

    supported.eventTiming = this.observe("event", (entries) => {
      let changed = false;
      for (const raw of entries) {
        const entry = raw as PerformanceEntry & {
          interactionId?: number; processingStart: number; processingEnd: number; target?: Node | null;
        };
        const id = entry.interactionId ?? 0;
        if (!id || isDevtoolsNode(entry.target)) continue;
        const record: InteractionRecord = {
          id,
          type: entry.name,
          target: describeNode(entry.target),
          start: entry.startTime,
          duration: entry.duration,
          inputDelay: Math.max(0, entry.processingStart - entry.startTime),
          processing: Math.max(0, entry.processingEnd - entry.processingStart),
          presentation: Math.max(0, entry.startTime + entry.duration - entry.processingEnd),
        };
        // Several events make up one interaction (pointerdown, pointerup, click);
        // the interaction is as long as its longest event.
        const existing = this.interactions.get(id);
        if (!existing || record.duration > existing.duration) {
          this.interactions.set(id, existing ? { ...record, target: record.target || existing.target } : record);
          changed = true;
        }
      }
      if (!changed) return;
      let list = [...this.interactions.values()].sort((a, b) => a.start - b.start);
      if (list.length > CAP.interactions) {
        list = list.slice(-CAP.interactions);
        this.interactions.clear();
        for (const item of list) this.interactions.set(item.id, item);
      }
      this.mutate({ interactions: list, inp: computeInp(list) });
    }, { durationThreshold: 16 });

    supported.lcp = this.observe("largest-contentful-paint", (entries) => {
      const last = entries[entries.length - 1] as (PerformanceEntry & { renderTime?: number; loadTime?: number; element?: Element | null; size?: number }) | undefined;
      if (!last) return;
      this.mutate({ lcp: { value: last.renderTime || last.loadTime || last.startTime, element: describeNode(last.element), size: last.size ?? 0 } });
    });

    supported.cls = this.observe("layout-shift", (entries) => {
      const shifts = [...this.data.cls.shifts];
      for (const raw of entries) {
        const entry = raw as PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: Array<{ node?: Node | null }> };
        if (entry.hadRecentInput) continue;
        shifts.push({ time: entry.startTime, value: entry.value, sources: (entry.sources ?? []).map((s) => describeNode(s.node)).filter(Boolean) });
      }
      const capped = shifts.slice(-CAP.shifts);
      this.mutate({ cls: { value: computeCls(capped), shifts: capped } });
    });

    // Long animation frames carry script attribution; prefer them over plain long tasks.
    supported.loaf = this.observe("long-animation-frame", (entries) => {
      const tasks = [...this.data.longTasks];
      for (const raw of entries) {
        const entry = raw as PerformanceEntry & { blockingDuration?: number; scripts?: Array<{ sourceURL?: string; sourceFunctionName?: string; invoker?: string; duration: number }> };
        tasks.push({
          start: entry.startTime,
          duration: entry.duration,
          blocking: entry.blockingDuration,
          scripts: (entry.scripts ?? []).slice(0, 5).map((s) => ({
            source: [s.sourceFunctionName, s.sourceURL ? s.sourceURL.split("/").pop() : ""].filter(Boolean).join(" @ ") || "(anonymous)",
            invoker: s.invoker ?? "",
            duration: s.duration,
          })),
        });
      }
      this.mutate({ longTasks: tasks.slice(-CAP.longTasks) });
    });
    if (!supported.loaf) {
      supported.longTasks = this.observe("longtask", (entries) => {
        const tasks = [...this.data.longTasks];
        for (const entry of entries) tasks.push({ start: entry.startTime, duration: entry.duration });
        this.mutate({ longTasks: tasks.slice(-CAP.longTasks) });
      });
    } else {
      supported.longTasks = true;
    }

    this.observe("paint", (entries) => {
      const fcp = entries.find((entry) => entry.name === "first-contentful-paint");
      if (fcp) this.mutate({ fcp: fcp.startTime });
    });

    const memory = (typeof performance !== "undefined" ? (performance as unknown as { memory?: unknown }).memory : undefined);
    supported.memory = memory !== undefined;
    this.data = { ...this.data, supported };
  }

  private readNavigation(): void {
    try {
      const [nav] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
      if (nav) this.data = { ...this.data, ttfb: nav.responseStart };
      const fcp = performance.getEntriesByName("first-contentful-paint")[0];
      if (fcp) this.data = { ...this.data, fcp: fcp.startTime };
    } catch {
      /* not available */
    }
  }

  private startFrames(): void {
    if (typeof requestAnimationFrame !== "function" || typeof performance === "undefined") return;
    this.frames = 0;
    this.windowStart = performance.now();
    this.lastFrame = this.windowStart;
    const tick = (now: number): void => {
      if (!this.running) return;
      this.frames += 1;
      if (now - this.lastFrame > 50) this.data.droppedFrames += 1;
      this.lastFrame = now;
      const elapsed = now - this.windowStart;
      if (elapsed >= 500) {
        const fps = Math.round((this.frames * 1000) / elapsed);
        const samples = [...this.data.fpsSamples, [now, fps] as const].slice(-CAP.fps);
        this.frames = 0;
        this.windowStart = now;
        this.mutate({ fps, fpsSamples: samples });
      }
      this.frameHandle = requestAnimationFrame(tick);
    };
    this.frameHandle = requestAnimationFrame(tick);
  }

  private startHeap(): void {
    const sample = (): void => {
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      if (!memory) return;
      const heap = { used: memory.usedJSHeapSize, total: memory.totalJSHeapSize, limit: memory.jsHeapSizeLimit };
      const samples = [...this.data.heapSamples, [performance.now(), heap.used] as const].slice(-CAP.heap);
      this.mutate({ heap, heapSamples: samples });
    };
    try {
      sample();
      this.heapTimer = setInterval(sample, 2000);
    } catch {
      /* no memory API */
    }
  }
}
