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
  type: "click" | "type" | "select" | "check" | "uncheck" | "key" | "navigate" | "wait" | "assert";
  query?: QueryStrategy;
  /** Typed text, selected option, navigation path, or an assertion's expected value. */
  value?: string;
  /** Key name for a `key` step. */
  key?: string;
  /**
   * What an `assert` step checks. `route` is recorded automatically when an
   * interaction navigates: the test then asserts the click LED somewhere,
   * instead of replaying the navigation and hiding a broken link.
   */
  assertion?: "visible" | "text" | "value" | "checked" | "route";
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

/** Steps a user performs — a navigation right after one of these was caused by it. */
const INTERACTIONS = new Set<RecordedStep["type"]>(["click", "type", "select", "check", "uncheck", "key"]);
/** How soon after an interaction a route change still counts as its effect. */
const NAVIGATION_WINDOW_MS = 1500;

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
    const last = this.steps[this.steps.length - 1];
    if (step.type === "navigate" && last) {
      // Collapse repeats of the same path: a hash router fires on both the
      // click and the resulting hashchange.
      if ((last.type === "navigate" || (last.type === "assert" && last.assertion === "route")) && last.value === step.value) return;
      // A navigation straight after an interaction was CAUSED by it. Replaying
      // it as a navigate step would pass even when the link is broken, so it
      // becomes an assertion that the interaction got there.
      if (INTERACTIONS.has(last.type) && Date.now() - last.time < NAVIGATION_WINDOW_MS) {
        const path = step.value ?? "/";
        this.steps.push({ type: "assert", assertion: "route", value: path, label: `route is ${path}`, time: Date.now() });
        this.typingElement = null;
        this.onChange?.();
        return;
      }
    }
    this.steps.push({ ...step, time: Date.now() });
    this.typingElement = null;
    this.onChange?.();
  }

  /**
   * Record an assertion about `element` — "this is visible", "this says X",
   * "this field holds Y", "this box is checked". Allowed while stopped too:
   * assertions are usually added after the interactions they check.
   */
  addAssertion(element: Element, assertion: NonNullable<RecordedStep["assertion"]>, root?: Node | null): RecordedStep {
    const query = chooseQuery(element, root ?? this.target);
    let value: string | undefined;
    if (assertion === "text") value = (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (assertion === "value") value = (element as HTMLInputElement).value ?? "";
    if (assertion === "checked") value = String((element as HTMLInputElement).checked === true);
    const label = assertion === "visible"
      ? `expect ${queryLabel(query)} to be visible`
      : assertion === "checked"
        ? `expect ${queryLabel(query)} to be ${value === "true" ? "checked" : "unchecked"}`
        : `expect ${queryLabel(query)} to ${assertion === "text" ? "say" : "hold"} ${JSON.stringify(value)}`;
    const step: RecordedStep = { type: "assert", query, assertion, value, label, time: Date.now() };
    this.steps.push(step);
    this.typingElement = null;
    this.onChange?.();
    return step;
  }

  /** Move a step (for reordering in the recorder list). */
  move(from: number, to: number): void {
    if (from < 0 || from >= this.steps.length || to < 0 || to >= this.steps.length || from === to) return;
    const [step] = this.steps.splice(from, 1);
    this.steps.splice(to, 0, step!);
    this.typingElement = null;
    this.onChange?.();
  }

  /** Replace the whole list (loading a saved flow). */
  load(steps: ReadonlyArray<RecordedStep>): void {
    this.steps.length = 0;
    this.steps.push(...steps.map((step) => ({ ...step })));
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
    case "assert":
      switch (step.assertion) {
        case "text": return `expect(${query}.textContent).toContain(${str(step.value ?? "")});`;
        case "value": return `expect((${query} as HTMLInputElement).value).toBe(${str(step.value ?? "")});`;
        case "checked": return `expect((${query} as HTMLInputElement).checked).toBe(${step.value === "true"});`;
        case "route": return `expect(screen.route).toBe(${str(step.value ?? "/")});`;
        default: return `expect(${query}).toBeTruthy();`;
      }
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

/* -------------------------------------------------------------------------- */
/*  Playwright                                                                 */
/* -------------------------------------------------------------------------- */

export interface PlaywrightOptions {
  title?: string;
  /** Page URL the test opens (defaults to the current page). */
  url?: string;
  /** `hash` routers navigate by fragment, `history` routers by path. */
  routerMode?: string;
}

/**
 * The Playwright locator for a strategy.
 *
 * Playwright's role, text, label, and CSS engines pierce open shadow roots, so
 * the same query that works in the in-process test finds the element inside
 * `<aktion-app>` without any shadow-DOM plumbing.
 */
export function playwrightLocator(query: QueryStrategy): string {
  switch (query.kind) {
    case "testid": return `page.getByTestId(${str(query.value)})`;
    case "role":
      return query.name
        ? `page.getByRole(${str(query.value)}, { name: ${str(query.name)}, exact: true })`
        : `page.getByRole(${str(query.value)})`;
    case "label": return `page.getByLabel(${str(query.value)}, { exact: true })`;
    case "placeholder": return `page.getByPlaceholder(${str(query.value)}, { exact: true })`;
    case "text": return `page.getByText(${str(query.value)}, { exact: true })`;
    case "css": return `page.locator(${str(query.value)})`;
  }
}

const PW_KEYS: Record<string, string> = { Escape: "Escape", Enter: "Enter", Tab: "Tab", ArrowUp: "ArrowUp", ArrowDown: "ArrowDown", ArrowLeft: "ArrowLeft", ArrowRight: "ArrowRight" };

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

/** Emit a runnable `@playwright/test` spec from recorded steps. */
export function generatePlaywrightTest(steps: ReadonlyArray<RecordedStep>, options: PlaywrightOptions = {}): string {
  const url = options.url ?? (typeof location !== "undefined" ? `${location.origin}${location.pathname}${location.search}` : "http://localhost:5173/");
  const lines: string[] = [
    `import { test, expect } from "@playwright/test";`,
    "",
    `test(${str(options.title ?? "reproduces the recorded interaction")}, async ({ page }) => {`,
    `  await page.goto(${str(url)});`,
    `  await expect(page.locator("aktion-app").first()).toBeVisible();`,
  ];
  let usesCss = false;
  for (const step of steps) {
    const locator = step.query ? playwrightLocator(step.query) : "";
    if (step.query?.kind === "css") usesCss = true;
    switch (step.type) {
      case "click": lines.push(`  await ${locator}.click();`); break;
      case "type": lines.push(`  await ${locator}.fill(${str(step.value ?? "")});`); break;
      case "select": lines.push(`  await ${locator}.selectOption(${str(step.value ?? "")});`); break;
      case "check": lines.push(`  await ${locator}.check();`); break;
      case "uncheck": lines.push(`  await ${locator}.uncheck();`); break;
      case "key": lines.push(`  await ${locator}.press(${str(PW_KEYS[step.key ?? ""] ?? step.key ?? "Enter")});`); break;
      case "navigate": {
        const path = step.value ?? "/";
        lines.push(options.routerMode === "history"
          ? `  await page.goto(new URL(${str(path)}, page.url()).toString());`
          : `  await page.evaluate((path) => { location.hash = path; }, ${str(path)});`);
        break;
      }
      case "wait": lines.push("  await page.waitForTimeout(100);"); break;
      case "assert":
        switch (step.assertion) {
          case "text": lines.push(`  await expect(${locator}).toContainText(${str(step.value ?? "")});`); break;
          case "value": lines.push(`  await expect(${locator}).toHaveValue(${str(step.value ?? "")});`); break;
          case "checked": lines.push(step.value === "true" ? `  await expect(${locator}).toBeChecked();` : `  await expect(${locator}).not.toBeChecked();`); break;
          case "route": {
            const path = step.value ?? "/";
            const tail = options.routerMode === "history" ? path : `#${path}`;
            lines.push(`  await expect(page).toHaveURL(new RegExp(${str(`${escapeRegExp(tail)}$`)}));`);
            break;
          }
          default: lines.push(`  await expect(${locator}).toBeVisible();`); break;
        }
        break;
    }
  }
  lines.push("});");
  if (usesCss) {
    lines.push("", "// NOTE: steps using page.locator(css) fell back to a DOM path because the element had no", "// test id, role, label, or text. Add `testId:` to those components to make the test robust.");
  }
  return lines.join("\n");
}

/* -------------------------------------------------------------------------- */
/*  Query resolution + replay                                                  */
/* -------------------------------------------------------------------------- */

function ownText(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Resolve a strategy against a rendered tree with Testing Library semantics:
 * roles match explicit or implicit roles and (optionally) the exact accessible
 * name; text matches the deepest element whose normalised text is exactly the
 * string.
 */
export function resolveQuery(root: Element | ShadowRoot | null, query: QueryStrategy): Element[] {
  if (!root) return [];
  let all: Element[];
  try {
    all = [...root.querySelectorAll("*")];
  } catch {
    return [];
  }
  switch (query.kind) {
    case "testid":
      return all.filter((el) => el.getAttribute("data-testid") === query.value || el.getAttribute("data-test-id") === query.value);
    case "role": {
      const role = query.value.toLowerCase();
      return all.filter((el) => (el.getAttribute("role") ?? implicitRole(el))?.toLowerCase() === role
        && (query.name === undefined || accessibleName(el).trim() === query.name.trim()));
    }
    case "label":
      return all.filter((el) => {
        const isField = el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
        if (isField) {
          const labels = (el as HTMLInputElement).labels;
          const labelText = labels && labels.length > 0 ? ownText(labels[0]!) : "";
          if (labelText === query.value) return true;
        }
        return (el.getAttribute("aria-label") ?? "").trim() === query.value;
      });
    case "placeholder":
      return all.filter((el) => el.getAttribute("placeholder") === query.value);
    case "text": {
      const matches = all.filter((el) => el.tagName !== "STYLE" && el.tagName !== "SCRIPT" && ownText(el) === query.value);
      // Keep the deepest matches: a wrapper whose only content is the match is not the match.
      return matches.filter((el) => !matches.some((other) => other !== el && el.contains(other)));
    }
    case "css":
      try {
        return [...root.querySelectorAll(query.value)];
      } catch {
        return [];
      }
  }
}

export interface ReplayResult {
  index: number;
  ok: boolean;
  message: string;
  element?: Element;
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  const proto = Object.getPrototypeOf(element) as object;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
}

/**
 * Perform one recorded step against the live app. Events are dispatched the
 * way a user's input produces them (`input` then `change`, composed, bubbling),
 * so the app cannot tell a replay from a person.
 */
export async function replayStep(
  step: RecordedStep,
  root: Element | ShadowRoot | null,
  navigate?: (path: string) => void,
  currentRoute?: () => string,
): Promise<{ ok: boolean; message: string; element?: Element }> {
  if (step.type === "assert" && step.assertion === "route") {
    if (!currentRoute) return { ok: false, message: "This app does not expose its route." };
    // The navigation an interaction triggers can land a tick later.
    const want = step.value ?? "/";
    for (let attempt = 0; attempt < 10 && currentRoute() !== want; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 30));
    const got = currentRoute();
    return { ok: got === want, message: got === want ? `route is ${want}` : `expected route ${want}, got ${got}` };
  }
  if (step.type === "navigate") {
    if (!navigate) return { ok: false, message: "This app cannot be navigated from DevTools." };
    navigate(step.value ?? "/");
    return { ok: true, message: `navigated to ${step.value ?? "/"}` };
  }
  if (step.type === "wait") {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { ok: true, message: "waited" };
  }
  if (!step.query) return { ok: false, message: "step has no target" };
  const matches = resolveQuery(root, step.query);
  if (matches.length === 0) return { ok: false, message: `no element matches ${queryLabel(step.query)}` };
  const element = matches[0]!;
  const fire = (type: string, init: EventInit = {}): void => {
    element.dispatchEvent(new Event(type, { bubbles: true, composed: true, ...init }));
  };
  switch (step.type) {
    case "click":
      (element as HTMLElement).click();
      return { ok: true, message: `clicked ${queryLabel(step.query)}`, element };
    case "type": {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return { ok: false, message: "target is not a text field", element };
      (element as HTMLElement).focus();
      setNativeValue(element, step.value ?? "");
      fire("input");
      fire("change");
      return { ok: true, message: `typed ${JSON.stringify(step.value ?? "")}`, element };
    }
    case "select": {
      if (!(element instanceof HTMLSelectElement)) return { ok: false, message: "target is not a select", element };
      setNativeValue(element, step.value ?? "");
      fire("input");
      fire("change");
      return { ok: true, message: `selected ${JSON.stringify(step.value ?? "")}`, element };
    }
    case "check":
    case "uncheck": {
      const want = step.type === "check";
      const box = element as HTMLInputElement;
      if (box.checked !== want || box.type === "radio") box.click();
      return { ok: box.checked === want, message: `${step.type}ed`, element };
    }
    case "key": {
      const key = step.key ?? "Enter";
      (element as HTMLElement).focus();
      element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, composed: true, cancelable: true }));
      element.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, composed: true }));
      return { ok: true, message: `pressed ${key}`, element };
    }
    case "assert": {
      switch (step.assertion) {
        case "text": {
          const text = ownText(element);
          const ok = text.includes(step.value ?? "");
          return { ok, message: ok ? "text matches" : `expected ${JSON.stringify(step.value)}, got ${JSON.stringify(text.slice(0, 80))}`, element };
        }
        case "value": {
          const value = (element as HTMLInputElement).value ?? "";
          const ok = value === (step.value ?? "");
          return { ok, message: ok ? "value matches" : `expected ${JSON.stringify(step.value)}, got ${JSON.stringify(value)}`, element };
        }
        case "checked": {
          const ok = String((element as HTMLInputElement).checked === true) === step.value;
          return { ok, message: ok ? "checked state matches" : `expected ${step.value === "true" ? "checked" : "unchecked"}`, element };
        }
        default: {
          const ok = isVisible(element);
          return { ok, message: ok ? "visible" : "not visible", element };
        }
      }
    }
    default:
      return { ok: false, message: `cannot replay a ${step.type as string} step` };
  }
}

/**
 * Visible the way a user means it: connected, not `display: none` /
 * `visibility: hidden` / `[hidden]` anywhere up the composed tree, and — when
 * the environment does layout at all — occupying some area.
 */
export function isVisible(element: Element): boolean {
  if (!element.isConnected) return false;
  let current: Element | null = element;
  for (let guard = 0; current && guard < 60; guard += 1) {
    if ((current as HTMLElement).hidden) return false;
    if (typeof getComputedStyle === "function") {
      try {
        const style = getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden") return false;
      } catch {
        /* exotic node */
      }
    }
    current = current.parentElement ?? ((current.getRootNode() as ShadowRoot).host ?? null);
  }
  // A DOM without layout (tests, SSR) reports zero boxes for everything; only
  // treat "no area" as hidden when the document itself has a box.
  const hasLayout = typeof document !== "undefined" && document.documentElement.getBoundingClientRect().width > 0;
  if (!hasLayout) return true;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}
