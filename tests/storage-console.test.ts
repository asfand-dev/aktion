/**
 * Aktion — `storage` and `console` global namespaces.
 *
 * Exercises:
 *   - method-call parsing for `storage.set`, `storage.local.get`, etc.
 *   - named-arg flattening into a trailing options object for
 *     `storage.cookies.set("k", "v", expires: 1, path: "/")`.
 *   - localStorage / sessionStorage / cookies round-trip semantics.
 *   - `console.log/error/warn/info/debug` forwarding to the host console.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "../src/parser/index.js";
import {
  StateStore,
  createContext,
  evaluate,
  storage,
} from "../src/runtime/index.js";
import { defaultLibrary } from "../src/library/index.js";

const SCRATCH_KEY = "rui:test:scratch";

function buildContext(source: string) {
  const program = parse(source);
  const state = new StateStore();
  const ctx = createContext(state, { library: defaultLibrary, notify: () => {} });
  return { program, ctx, state };
}

function evalExpr(source: string): unknown {
  const { ctx, program } = buildContext(`__rui_test__ = ${source}`);
  const stmt = program.statements[0];
  if (!stmt || stmt.kind !== "Assignment") throw new Error("expected assignment");
  return evaluate(stmt.expression, ctx);
}

beforeEach(() => {
  try { window.localStorage.clear(); } catch { /* */ }
  try { window.sessionStorage.clear(); } catch { /* */ }
});
afterEach(() => {
  try { window.localStorage.clear(); } catch { /* */ }
  try { window.sessionStorage.clear(); } catch { /* */ }
});

describe("parser — method call", () => {
  it("parses `obj.method(args)` as a MethodCall expression", () => {
    const program = parse(`x = storage.set("k", "v")`);
    expect(program.errors).toEqual([]);
    const stmt = program.statements[0];
    if (!stmt || stmt.kind !== "Assignment") throw new Error("expected assignment");
    expect(stmt.expression).toMatchObject({
      kind: "MethodCall",
      method: "set",
      object: { kind: "Identifier", name: "storage" },
    });
  });

  it("parses chained namespace methods `storage.local.get(...)`", () => {
    const program = parse(`x = storage.local.get("k")`);
    expect(program.errors).toEqual([]);
    const stmt = program.statements[0];
    if (!stmt || stmt.kind !== "Assignment") throw new Error("expected assignment");
    expect(stmt.expression).toMatchObject({
      kind: "MethodCall",
      method: "get",
      object: { kind: "Member", property: "local" },
    });
  });

  it("parses optional chaining method calls `obj?.method(args)`", () => {
    const program = parse(`x = $res?.refetch()`);
    expect(program.errors).toEqual([]);
    const stmt = program.statements[0];
    if (!stmt || stmt.kind !== "Assignment") throw new Error("expected assignment");
    expect(stmt.expression).toMatchObject({
      kind: "MethodCall",
      method: "refetch",
      optional: true,
    });
  });

  it("collects positional + named args inside a method call", () => {
    const program = parse(`x = storage.cookies.set("name", "John", expires: 1, path: "/")`);
    expect(program.errors).toEqual([]);
    const stmt = program.statements[0];
    if (!stmt || stmt.kind !== "Assignment") throw new Error("expected assignment");
    if (stmt.expression.kind !== "MethodCall") throw new Error("expected MethodCall");
    expect(stmt.expression.arguments).toHaveLength(4);
    expect(stmt.expression.arguments[2]).toMatchObject({ kind: "NamedArg", name: "expires" });
    expect(stmt.expression.arguments[3]).toMatchObject({ kind: "NamedArg", name: "path" });
  });
});

describe("storage — localStorage default namespace", () => {
  it("stores and retrieves a string value", () => {
    evalExpr(`storage.set("${SCRATCH_KEY}", "John")`);
    expect(evalExpr(`storage.get("${SCRATCH_KEY}")`)).toBe("John");
  });

  it("round-trips objects through JSON serialisation", () => {
    evalExpr(`storage.set("${SCRATCH_KEY}", {a: 1, b: [2, 3]})`);
    expect(evalExpr(`storage.get("${SCRATCH_KEY}")`)).toEqual({ a: 1, b: [2, 3] });
  });

  it("removes and clears items", () => {
    evalExpr(`storage.set("${SCRATCH_KEY}", "x")`);
    evalExpr(`storage.remove("${SCRATCH_KEY}")`);
    expect(evalExpr(`storage.get("${SCRATCH_KEY}")`)).toBeNull();
    evalExpr(`storage.set("${SCRATCH_KEY}", "y")`);
    evalExpr(`storage.clear()`);
    expect(evalExpr(`storage.get("${SCRATCH_KEY}")`)).toBeNull();
  });

  it("`storage.local.*` is an alias for the default namespace", () => {
    evalExpr(`storage.local.set("${SCRATCH_KEY}", 42)`);
    expect(evalExpr(`storage.get("${SCRATCH_KEY}")`)).toBe(42);
    expect(evalExpr(`storage.local.get("${SCRATCH_KEY}")`)).toBe(42);
  });
});

describe("storage — sessionStorage namespace", () => {
  it("writes and reads from sessionStorage independently of localStorage", () => {
    evalExpr(`storage.session.set("${SCRATCH_KEY}", "session-value")`);
    expect(evalExpr(`storage.session.get("${SCRATCH_KEY}")`)).toBe("session-value");
    expect(evalExpr(`storage.local.get("${SCRATCH_KEY}")`)).toBeNull();
  });
});

describe("storage — cookies namespace", () => {
  it("writes and reads cookies with named-arg options", () => {
    storage.cookies.clear();
    evalExpr(`storage.cookies.set("user", "John", path: "/", maxAge: 60)`);
    expect(evalExpr(`storage.cookies.get("user")`)).toBe("John");
  });

  it("removes a cookie by key", () => {
    storage.cookies.clear();
    evalExpr(`storage.cookies.set("user", "John", path: "/")`);
    expect(evalExpr(`storage.cookies.get("user")`)).toBe("John");
    evalExpr(`storage.cookies.remove("user", path: "/")`);
    // Some hosts (notably happy-dom) keep expired cookies in the
    // document.cookie string with an empty value rather than purging
    // them outright — the `get` helper still treats that as "missing"
    // because removal succeeded from the script's point of view.
    const after = evalExpr(`storage.cookies.get("user")`);
    expect(after === null || after === "").toBe(true);
  });

  it("returns null for missing cookies", () => {
    storage.cookies.clear();
    expect(evalExpr(`storage.cookies.get("nope")`)).toBeNull();
  });
});

describe("console — forwards to host console", () => {
  it("forwards `console.log` calls to the host console.log", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    evalExpr(`console.log("hello", 42)`);
    expect(logSpy).toHaveBeenCalledWith("hello", 42);
    logSpy.mockRestore();
  });

  it("forwards every supported level", () => {
    const spies = {
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      info: vi.spyOn(console, "info").mockImplementation(() => {}),
      debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
    };
    evalExpr(`console.error("e")`);
    evalExpr(`console.warn("w")`);
    evalExpr(`console.info("i")`);
    evalExpr(`console.debug("d")`);
    expect(spies.error).toHaveBeenCalledWith("e");
    expect(spies.warn).toHaveBeenCalledWith("w");
    expect(spies.info).toHaveBeenCalledWith("i");
    expect(spies.debug).toHaveBeenCalledWith("d");
    for (const spy of Object.values(spies)) spy.mockRestore();
  });
});
