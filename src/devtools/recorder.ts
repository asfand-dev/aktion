/**
 * Aktion DevTools — interaction recorder and test generator.
 *
 * Click through a bug once; get a runnable test that reproduces it. That is the
 * whole idea: the slowest part of writing a regression test is not the
 * assertion, it is re-deriving the eight interactions that led to the broken
 * state and then guessing at selectors that will still match next week.
 *
 * The recorder listens on the app's render root (inside the shadow root, so
 * events are not retargeted to the host), turns each interaction into a
 * **query strategy** rather than a DOM path, and emits `aktion-runtime/test`
 * code. Query selection follows Testing Library's priority order — test id,
 * then role + accessible name, then label, then placeholder, then text — because
 * a test that finds a button by its accessible name keeps passing when the
 * markup around it changes, and one that finds it by `div > div:nth-child(3)`
 * does not.
 */

import { accessibleName, cssPath, implicitRole } from "./overlay.js";

/** How a recorded step locates its element. */
export interface QueryStrategy {
  kind: "testid" | "role" | "label" | "placeholder" | "text" | "css";
  /** Primary value: the id, role, label text, placeholder, or selector. */
  value: string;
  /** Accessible name, for `role` queries. */
  name?: string;
}

/** One recorded interaction. */
export interface RecordedStep {
  type: "click" | "type" | "select" | "check" | "uncheck" | "key" | "navigate" | "wait";
  query?: QueryStrategy;
  /** Typed text, selected option, or navigation path. */
  value?: string;
  /** Key name for a `key` step. */
  key?: string;
  time: number;
  /** Human-readable one-liner shown in the recorder list. */
  label: string;
}

/** Options for the generated test. */
export interface CodegenOptions {
  /** Test name. */
  title?: string;
  /** The program source to inline; omit to emit a `PROGRAM` placeholder. */
  program?: string;
  /** Reactive state to assert at the end, as `name → value` pairs. */
  assertions?: Array<{ name: string; value: unknown }>;
  /** Emit `import { describe, it, expect } from "vitest"` (default true). */
  vitestImports?: boolean;
  /** Package specifier for the testing entry. */
  packageName?: string;
}

/* -------------------------------------------------------------------------- */
/*  Query selection                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Choose the most robust query for an element.
 *
 * Ordered by how well each survives an unrelated edit to the UI. A `css`
 * strategy is the last resort and is flagged as such in the generated code, so
 * a brittle step is visible rather than silently fragile.
 */
export function chooseQuery(element: Element, root?: Node | null): QueryStrategy {
  const testId = element.getAttribute("data-testid") ?? element.getAttribute("data-test-id");
  if (testId) return { kind: "testid", value: testId };

  const role = element.getAttribute("role") ?? implicitRole(element);
  const name = accessibleName(element);

  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    const labels = element.labels;
    const labelText = labels && labels.length > 0
      ? (labels[0]!.textContent ?? "").replace(/\s+/g, " ").trim()
      : "";
    if (labelText) return { kind: "label", value: labelText };
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel?.trim()) return { kind: "label", value: ariaLabel.trim() };
    if (element instanceof HTMLInputElement && element.placeholder) {
      return { kind: "placeholder", value: element.placeholder };
    }
    if (role) return { kind: "role", value: role, name: name || undefined };
  }

  if (role && name) return { kind: "role", value: role, name };
  if (role) return { kind: "role", value: role };
  if (name) return { kind: "text", value: name };
  return { kind: "css", value: cssPath(element, root) };
}

/** The `screen.*` expression that resolves a strategy. */
export function queryExpression(query: QueryStrategy): string {
  switch (query.kind) {
    case "testid": return `screen.getByTestId(${str(query.value)})`;
    case "role":
      return query.name
        ? `screen.getByRole(${str(query.value)}, { name: ${str(query.name)} })`
        : `screen.getByRole(${str(query.value)})`;
    case "label": return `screen.getByLabelText(${str(query.value)})`;
    case "placeholder": return `screen.getByPlaceholderText(${str(query.value)})`;
    case "text": return `screen.getByText(${str(query.value)})`;
    // The app paints inside its shadow root, so a raw selector has to go
    // through `shadowRoot` — `container.querySelector` would search the host's
    // (empty) light DOM and always return null.
    case "css": return `(screen.container.shadowRoot!.querySelector(${str(query.value)}) as HTMLElement)`;
  }
}

/** Short human description of a strategy, for the recorder list. */
export function queryLabel(query: QueryStrategy): string {
  switch (query.kind) {
    case "testid": return `testid "${query.value}"`;
    case "role": return query.name ? `${query.value} "${query.name}"` : query.value;
    case "label": return `label "${query.value}"`;
    case "placeholder": return `placeholder "${query.value}"`;
    case "text": return `text "${query.value}"`;
    case "css": return query.value;
  }
}

function str(value: string): string {
  return JSON.stringify(value);
}

/* -------------------------------------------------------------------------- */
/*  The recorder                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Records interactions on one app's render root.
 *
 * Typing is coalesced: a text field receives one `type` step carrying its final
 * value, not one per keystroke — a 12-step test for typing "ada@example.com" is
 * unreadable and slower to run for no benefit.
 */
export class InteractionRecorder {
  private readonly steps: RecordedStep[] = [];
  private target: Element | null = null;
  private listeners: Array<[string, EventListener]> = [];
  private recording = false;
  private onChange: (() => void) | null = null;
  /** Element whose typing is still being coalesced into the last step. */
  private typingElement: Element | null = null;

  /** True while events are being captured. */
  get isRecording(): boolean {
    return this.recording;
  }

  /** Steps recorded so far, oldest first. */
  list(): ReadonlyArray<RecordedStep> {
    return this.steps;
  }

  /** Drop every recorded step. */
  clear(): void {
    this.steps.length = 0;
    this.typingElement = null;
    this.onChange?.();
  }

  /** Remove one step by index (a misclick should not poison the test). */
  remove(index: number): void {
    if (index < 0 || index >= this.steps.length) return;
    this.steps.splice(index, 1);
    this.typingElement = null;
    this.onChange?.();
  }

  /**
   * Start capturing on `root`.
   *
   * Listeners are attached in the CAPTURE phase so a handler that calls
   * `stopPropagation()` (a menu closing itself, a form intercepting submit)
   * cannot hide the interaction from the recorder.
   */
  start(root: Element | null, onChange: () => void): boolean {
    if (this.recording || !root) return false;
    this.target = root;
    this.onChange = onChange;
    this.recording = true;

    const add = (type: string, handler: EventListener): void => {
      root.addEventListener(type, handler, true);
      this.listeners.push([type, handler]);
    };
    add("click", (event) => this.onClick(event as MouseEvent));
    add("input", (event) => this.onInput(event as Event));
    add("change", (event) => this.onChangeEvent(event as Event));
    add("keydown", (event) => this.onKeyDown(event as KeyboardEvent));
    return true;
  }

  /** Stop capturing, keeping the recorded steps. */
  stop(): void {
    if (!this.recording) return;
    const root = this.target;
    if (root) {
      for (const [type, handler] of this.listeners) {
        root.removeEventListener(type, handler, true);
      }
    }
    this.listeners = [];
    this.recording = false;
    this.target = null;
  }

  /**
   * Append a step the DOM cannot report — a route change, or an explicit wait.
   * The panel calls this when it sees a `route` event while recording, so a test
   * that navigates mid-flow reproduces the navigation instead of silently
   * depending on it.
   */
  addStep(step: Omit<RecordedStep, "time">): void {
    if (!this.recording) return;
    // Collapse consecutive navigations to the same path: a hash router fires on
    // both the click and the resulting hashchange.
    const last = this.steps[this.steps.length - 1];
    if (last && last.type === "navigate" && step.type === "navigate" && last.value === step.value) return;
    this.steps.push({ ...step, time: Date.now() });
    this.typingElement = null;
    this.onChange?.();
  }

  private push(step: Omit<RecordedStep, "time">): void {
    this.steps.push({ ...step, time: Date.now() });
    this.onChange?.();
  }

  private onClick(event: MouseEvent): void {
    const element = eventTarget(event);
    if (!element) return;
    // A click on a checkbox / radio is a check, not a generic click: the
    // generated test should assert the intent, and `user.check` waits for the
    // change event the way a real user's click does.
    if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
      const query = chooseQuery(element, this.target);
      // `checked` is read BEFORE the default action, so it still holds the
      // pre-click value — the recorded intent is the state it is moving to.
      const willCheck = !element.checked;
      this.push({
        type: element.type === "radio" || willCheck ? "check" : "uncheck",
        query,
        label: `${willCheck ? "check" : "uncheck"} ${queryLabel(query)}`,
      });
      this.typingElement = null;
      return;
    }
    // Ignore clicks that land on a container rather than a control: recording
    // them produces steps that pass but exercise nothing.
    const control = closestInteractive(element);
    if (!control) return;
    const query = chooseQuery(control, this.target);
    this.push({ type: "click", query, label: `click ${queryLabel(query)}` });
    this.typingElement = null;
  }

  private onInput(event: Event): void {
    const element = eventTarget(event);
    if (!element) return;
    if (element instanceof HTMLSelectElement) return; // handled by `change`
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;
    if (element.type === "checkbox" || element.type === "radio") return;
    const value = element.value;
    const query = chooseQuery(element, this.target);
    const last = this.steps[this.steps.length - 1];
    if (this.typingElement === element && last?.type === "type") {
      last.value = value;
      last.label = `type ${JSON.stringify(value)} into ${queryLabel(query)}`;
      this.onChange?.();
      return;
    }
    this.typingElement = element;
    this.push({
      type: "type",
      query,
      value,
      label: `type ${JSON.stringify(value)} into ${queryLabel(query)}`,
    });
  }

  private onChangeEvent(event: Event): void {
    const element = eventTarget(event);
    if (!(element instanceof HTMLSelectElement)) return;
    const query = chooseQuery(element, this.target);
    this.push({
      type: "select",
      query,
      value: element.value,
      label: `select ${JSON.stringify(element.value)} in ${queryLabel(query)}`,
    });
    this.typingElement = null;
  }

  private onKeyDown(event: KeyboardEvent): void {
    // Only keys that carry meaning on their own — every other keystroke is
    // already covered by the coalesced `type` step.
    if (!["Enter", "Escape", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const element = eventTarget(event);
    if (!element) return;
    const query = chooseQuery(element, this.target);
    this.push({
      type: "key",
      query,
      key: event.key,
      label: `press ${event.key} on ${queryLabel(query)}`,
    });
  }
}

/** Real event target, piercing shadow retargeting. */
function eventTarget(event: Event): Element | null {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  const first = path[0] ?? event.target;
  return first instanceof Element ? first : null;
}

/** Nearest ancestor that is (or acts as) a control. */
function closestInteractive(element: Element): Element | null {
  let current: Element | null = element;
  let guard = 0;
  while (current && guard++ < 12) {
    const tag = current.tagName.toLowerCase();
    if (tag === "button" || tag === "a" || tag === "summary" || tag === "input" || tag === "select" || tag === "textarea") return current;
    const role = current.getAttribute("role");
    if (role && ["button", "link", "tab", "menuitem", "option", "switch", "checkbox", "radio"].includes(role)) return current;
    if (current.hasAttribute("data-testid")) return current;
    current = current.parentElement;
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/*  Code generation                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Emit a runnable `aktion-runtime/test` test from recorded steps.
 *
 * The program is inlined as a template literal so the file is self-contained —
 * a test that references a program you have to reconstruct is not a
 * reproduction. Assertions come from the state the app ended in, which is
 * usually exactly the invariant that broke.
 */
export function generateTest(
  steps: ReadonlyArray<RecordedStep>,
  options: CodegenOptions = {},
): string {
  const pkg = options.packageName ?? "aktion-runtime/test";
  const title = options.title ?? "reproduces the recorded interaction";
  const lines: string[] = [];

  if (options.vitestImports !== false) {
    lines.push(`import { afterEach, expect, it } from "vitest";`);
  }
  lines.push(`import { render, cleanup } from ${str(pkg)};`);
  lines.push("");
  if (options.vitestImports !== false) {
    lines.push("afterEach(cleanup);");
    lines.push("");
  }
  lines.push(`const program = \`${escapeTemplate(options.program ?? "$app(Text(\"replace me\"))")}\`;`);
  lines.push("");
  lines.push(`it(${str(title)}, async () => {`);
  lines.push("  const screen = render(program);");
  lines.push("  await screen.flush();");

  let usesCss = false;
  for (const step of steps) {
    if (step.query?.kind === "css") usesCss = true;
    lines.push(`  ${stepCode(step)}`);
  }

  if (options.assertions && options.assertions.length > 0) {
    lines.push("");
    for (const assertion of options.assertions) {
      lines.push(`  expect(screen.state.get(${str(assertion.name)})).toEqual(${literal(assertion.value)});`);
    }
  }
  lines.push("});");
  if (usesCss) {
    lines.push("");
    lines.push("// NOTE: one or more steps fell back to a CSS selector because the element");
    lines.push("// had no test id, role, label, or text to match on. Those steps will break");
    lines.push("// when the markup around them changes — add `testId:` or a label instead.");
  }
  return lines.join("\n");
}

/** One line of test code for one step. */
function stepCode(step: RecordedStep): string {
  const query = step.query ? queryExpression(step.query) : "";
  switch (step.type) {
    case "click": return `await screen.click(${query});`;
    case "type": return `await screen.type(${query}, ${str(step.value ?? "")});`;
    case "select": return `await screen.user.selectOption(${query}, ${str(step.value ?? "")});`;
    case "check": return `await screen.user.check(${query});`;
    case "uncheck": return `await screen.user.uncheck(${query});`;
    case "key": return `await screen.user.keyboard(${query}, ${str(step.key ?? "Enter")});`;
    case "navigate": return `await screen.navigate(${str(step.value ?? "/")});`;
    case "wait": return `await screen.flush();`;
  }
}

/** Escape a program for embedding in a template literal. */
function escapeTemplate(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

/** JS literal for an asserted value. */
function literal(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "undefined";
  } catch {
    return "undefined";
  }
}

/**
 * A one-off snapshot test: the current rendered HTML plus the current state.
 *
 * Useful as a baseline before a refactor — the assertion is not "this is
 * right", it is "this did not change".
 */
export function generateSnapshotTest(
  program: string,
  state: Record<string, unknown>,
  options: { title?: string; packageName?: string } = {},
): string {
  const pkg = options.packageName ?? "aktion-runtime/test";
  return [
    `import { afterEach, expect, it } from "vitest";`,
    `import { render, cleanup } from ${str(pkg)};`,
    "",
    "afterEach(cleanup);",
    "",
    `const program = \`${escapeTemplate(program)}\`;`,
    "",
    `it(${str(options.title ?? "renders the recorded snapshot")}, async () => {`,
    "  const screen = render(program);",
    "  await screen.flush();",
    `  expect(screen.state.snapshot()).toEqual(${JSON.stringify(state, null, 2).split("\n").join("\n  ")});`,
    "  expect(screen.html()).toMatchSnapshot();",
    "});",
  ].join("\n");
}
