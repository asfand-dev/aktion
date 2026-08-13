import { describe, expect, it, vi, afterEach } from "vitest";
import { createEnvManager, type EnvManager } from "../src/runtime/env.js";
import type { EvaluationContext } from "../src/runtime/evaluator.js";

function mockContext(): EvaluationContext & { notifyCalls: number } {
  const disposers: Array<() => void> = [];
  const ctx = {
    notifyCalls: 0,
    notify: () => { ctx.notifyCalls++; },
    disposers,
  } as unknown as EvaluationContext & { notifyCalls: number };
  ctx.disposers = disposers;
  return ctx;
}

describe("createEnvManager()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an EnvManager with all namespace getters", () => {
    const ctx = mockContext();
    const env = createEnvManager(ctx);

    expect(env).toBeDefined();
    expect(typeof env.viewport).toBe("object");
    expect(typeof env.breakpoint).toBe("object");
    expect(typeof env.scroll).toBe("object");
    expect(typeof env.media).toBe("object");
    expect(typeof env.mouse).toBe("object");
  });

  describe("viewport", () => {
    it("returns width and height", () => {
      const ctx = mockContext();
      const env = createEnvManager(ctx);

      const vp = env.viewport;
      expect(typeof vp.width).toBe("number");
      expect(typeof vp.height).toBe("number");
      expect(vp.width).toBeGreaterThan(0);
      expect(vp.height).toBeGreaterThan(0);
    });

    it("registers a resize listener on first access", () => {
      const addSpy = vi.spyOn(window, "addEventListener");
      const ctx = mockContext();
      const env = createEnvManager(ctx);

      env.viewport;
      const resizeCalls = addSpy.mock.calls.filter(([e]) => e === "resize");
      expect(resizeCalls.length).toBeGreaterThanOrEqual(1);
      expect(ctx.disposers.length).toBeGreaterThan(0);
    });

    it("does not double-register listeners", () => {
      const addSpy = vi.spyOn(window, "addEventListener");
      const ctx = mockContext();
      const env = createEnvManager(ctx);

      env.viewport;
      const first = addSpy.mock.calls.filter(([e]) => e === "resize").length;
      env.viewport;
      const second = addSpy.mock.calls.filter(([e]) => e === "resize").length;
      expect(second).toBe(first);
    });
  });

  describe("breakpoint", () => {
    it("returns active breakpoint name", () => {
      const ctx = mockContext();
      const env = createEnvManager(ctx);

      const bp = env.breakpoint;
      expect(typeof bp.active).toBe("string");
      expect(["base", "sm", "md", "lg", "xl"]).toContain(bp.active);
      expect(typeof bp.sm).toBe("boolean");
      expect(typeof bp.md).toBe("boolean");
      expect(typeof bp.lg).toBe("boolean");
      expect(typeof bp.xl).toBe("boolean");
      expect(bp.width).toBe(env.viewport.width);
    });

    it("breakpoint flags are consistent with width", () => {
      const ctx = mockContext();
      const env = createEnvManager(ctx);

      const bp = env.breakpoint;
      expect(bp.sm).toBe(bp.width >= 640);
      expect(bp.md).toBe(bp.width >= 768);
      expect(bp.lg).toBe(bp.width >= 1024);
      expect(bp.xl).toBe(bp.width >= 1280);
    });
  });

  describe("scroll", () => {
    it("returns scroll state", () => {
      const ctx = mockContext();
      const env = createEnvManager(ctx);

      const sc = env.scroll;
      expect(typeof sc.x).toBe("number");
      expect(typeof sc.y).toBe("number");
      expect(typeof sc.progress).toBe("number");
      expect(typeof sc.direction).toBe("string");
      expect(["up", "down"]).toContain(sc.direction);
    });

    it("registers scroll listener on first access", () => {
      const addSpy = vi.spyOn(window, "addEventListener");
      const ctx = mockContext();
      const env = createEnvManager(ctx);

      env.scroll;
      const scrollCalls = addSpy.mock.calls.filter(([e]) => e === "scroll");
      expect(scrollCalls.length).toBeGreaterThanOrEqual(1);
    });

    it("also activates resize for progress calculation", () => {
      const ctx = mockContext();
      const env = createEnvManager(ctx);

      env.scroll;
      expect(ctx.disposers.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("media", () => {
    it("returns media query results", () => {
      const ctx = mockContext();
      const env = createEnvManager(ctx);

      const m = env.media;
      expect(typeof m.prefersDark).toBe("boolean");
      expect(typeof m.prefersReducedMotion).toBe("boolean");
      expect(typeof m.online).toBe("boolean");
      expect(typeof m.pointer).toBe("string");
      expect(["coarse", "fine"]).toContain(m.pointer);
      expect(typeof m.portrait).toBe("boolean");
    });
  });

  describe("mouse", () => {
    it("returns mouse coordinates", () => {
      const ctx = mockContext();
      const env = createEnvManager(ctx);

      const m = env.mouse;
      expect(typeof m.x).toBe("number");
      expect(typeof m.y).toBe("number");
    });

    it("registers mousemove listener on first access", () => {
      const addSpy = vi.spyOn(window, "addEventListener");
      const ctx = mockContext();
      const env = createEnvManager(ctx);

      env.mouse;
      const moveCalls = addSpy.mock.calls.filter(([e]) => e === "mousemove");
      expect(moveCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("disposers", () => {
    it("can be called to teardown all listeners", () => {
      const removeSpy = vi.spyOn(window, "removeEventListener");
      const ctx = mockContext();
      const env = createEnvManager(ctx);

      env.viewport;
      env.scroll;
      env.mouse;
      env.media;

      for (const dispose of ctx.disposers) dispose();

      expect(removeSpy.mock.calls.length).toBeGreaterThan(0);
    });
  });
});
