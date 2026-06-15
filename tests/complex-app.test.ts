/**
 * Complex application, end-to-end.
 *
 * This mounts a realistic "Task Board" app — the kind of thing a front-end
 * developer actually builds — into a live `<aktion-app>` element and drives it
 * the way a user would: clicking buttons, searching, filtering, toggling, and
 * adding/removing rows. It exercises, in one coherent program, nearly every
 * language pillar at once:
 *
 *   - reactive `$state` (arrays, scalars) + computed atoms (`$visible`)
 *   - actions that mutate state immutably (`map` / `filter` / spread)
 *   - user components (`App`, `TaskRow`) and the implicit children slot
 *   - list rendering via `.map`, conditional rendering (empty state)
 *   - lambda closures captured per-row in a `.map` (the click handler must
 *     remember ITS task id) — the classic loop-capture correctness case
 *   - `$i18n` translations resolved inside a component render
 *   - two-way-ish search filtering, alphabetical sorting (relational compare),
 *     `==` predicates (loose equality), and string `.includes` search
 *
 * Together these assert the runtime behaves the way the author expects when
 * the pieces are combined, not just in isolation.
 */

import { afterEach, describe, expect, it } from "vitest";
import "../src/index.js";

const flush = (): Promise<void> => new Promise<void>((resolve) => queueMicrotask(() => resolve()));
const settle = async (turns = 12): Promise<void> => {
  for (let i = 0; i < turns; i += 1) {
    await flush();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
};

interface El extends HTMLElement {
  setResponse(text: string): void;
  state: { set: (k: string, v: unknown) => void; get: (k: string) => unknown };
}

const mount = (): El => {
  const el = document.createElement("aktion-app") as unknown as El;
  document.body.appendChild(el);
  return el;
};

const TASK_BOARD = (lang = "en"): string => `
const { t, setCurrentLanguage } = $i18n({
  defaultLanguage: "en",
  currentLanguage: "${lang}",
  translations: {
    title:  { en: "Task Board", fr: "Tableau" },
    add:    { en: "Add", fr: "Ajouter" },
    remove: { en: "Remove", fr: "Retirer" },
    empty:  { en: "No tasks match", fr: "Aucune tâche" },
    done:   { en: "Done", fr: "Fait" },
    active: { en: "Active", fr: "Actif" },
    summary: { en: "{active} active, {done} done", fr: "{active} actifs, {done} faits" }
  }
})

$tasks = [
  { id: 1, title: "Write tests", done: false },
  { id: 2, title: "Fix bug", done: true },
  { id: 3, title: "Ship release", done: false }
]
$filter = "all"
$query = ""
$draft = ""
$nextId = 4

$visible = $tasks
  .filter(task => $filter == "all" ? true : ($filter == "active" ? !task.done : task.done))
  .filter(task => $query.trim() == "" ? true : task.title.toLowerCase().includes($query.toLowerCase()))
  .sort((a, b) => a.title > b.title ? 1 : -1)

$activeCount = $tasks.filter(task => !task.done).length
$doneCount = $tasks.filter(task => task.done).length

function addTask() {
  let title = $draft.trim()
  if (title == "") return
  $tasks = [...$tasks, { id: $nextId, title: title, done: false }]
  $nextId = $nextId + 1
  $draft = ""
}
function toggleTask(id) {
  $tasks = $tasks.map(task => task.id == id ? { ...task, done: !task.done } : task)
}
function removeTask(id) {
  $tasks = $tasks.filter(task => task.id != id)
}

function TaskRow(task) {
  return Card([
    Stack([
      Text(task.title, { variant: "body-heavy" }),
      Button(task.done ? t("done") : t("active"), { onClick: () => toggleTask(task.id), variant: task.done ? "secondary" : "primary" }),
      Button(t("remove"), { onClick: () => removeTask(task.id), variant: "danger" })
    ], { direction: "row", gap: "s" })
  ])
}

function App() {
  return Stack([
    Text(t("title"), { variant: "large-heavy" }),
    Text(t("summary", { active: $activeCount, done: $doneCount }), { tone: "muted" }),
    Stack([
      Input({ id: "draft", value: $draft, onChange: (v) => $draft = v, placeholder: "New task" }),
      Button(t("add"), { onClick: () => addTask(), variant: "primary" })
    ], { direction: "row", gap: "s" }),
    $visible.length == 0
      ? Text(t("empty"), { tone: "muted" })
      : Stack($visible.map(task => TaskRow(task)), { gap: "s" })
  ], { gap: "m" })
}

aktion = App()
`;

describe("Complex app — Task Board (end-to-end)", () => {
  afterEach(() => { document.body.innerHTML = ""; });

  const shadowText = (el: El): string => el.shadowRoot?.textContent ?? "";
  const cards = (el: El): Element[] => Array.from(el.shadowRoot?.querySelectorAll(".rui-card") ?? []);
  const cardTitles = (el: El): string[] =>
    cards(el).map((c) => c.querySelector(".rui-text")?.textContent?.trim() ?? "");
  const rowButton = (el: El, taskTitle: string, btnText: string): HTMLButtonElement | undefined => {
    const card = cards(el).find((c) => (c.textContent ?? "").includes(taskTitle));
    if (!card) return undefined;
    return Array.from(card.querySelectorAll("button")).find(
      (b) => (b.textContent ?? "").includes(btnText),
    ) as HTMLButtonElement | undefined;
  };
  const addButton = (el: El): HTMLButtonElement | undefined =>
    Array.from(el.shadowRoot?.querySelectorAll("button") ?? []).find(
      (b) => (b.textContent ?? "").trim() === "Add",
    ) as HTMLButtonElement | undefined;

  it("renders the title, i18n summary, and all initial tasks", async () => {
    const el = mount();
    el.setResponse(TASK_BOARD());
    await settle();
    expect(shadowText(el)).toContain("Task Board");
    // i18n placeholder interpolation inside a component render.
    expect(shadowText(el)).toContain("2 active, 1 done");
    expect(cards(el)).toHaveLength(3);
    expect(shadowText(el)).toContain("Write tests");
    expect(shadowText(el)).toContain("Fix bug");
    expect(shadowText(el)).toContain("Ship release");
  });

  it("sorts the visible tasks alphabetically (relational string compare)", async () => {
    const el = mount();
    el.setResponse(TASK_BOARD());
    await settle();
    // "Fix bug" < "Ship release" < "Write tests" lexicographically.
    expect(cardTitles(el)).toEqual(["Fix bug", "Ship release", "Write tests"]);
  });

  it("filters by search query (computed + .includes + toLowerCase)", async () => {
    const el = mount();
    el.setResponse(TASK_BOARD());
    await settle();
    el.state.set("query", "ship");
    await settle();
    expect(cards(el)).toHaveLength(1);
    expect(cardTitles(el)).toEqual(["Ship release"]);
  });

  it("filters to active / done tasks (loose `==` predicate)", async () => {
    const el = mount();
    el.setResponse(TASK_BOARD());
    await settle();

    el.state.set("filter", "active");
    await settle();
    expect(cardTitles(el)).toEqual(["Ship release", "Write tests"]);

    el.state.set("filter", "done");
    await settle();
    expect(cardTitles(el)).toEqual(["Fix bug"]);
  });

  it("shows the empty state when nothing matches", async () => {
    const el = mount();
    el.setResponse(TASK_BOARD());
    await settle();
    el.state.set("query", "zzz-nonexistent");
    await settle();
    expect(cards(el)).toHaveLength(0);
    expect(shadowText(el)).toContain("No tasks match");
  });

  it("toggles a task's done state via its row button (per-row closure capture)", async () => {
    const el = mount();
    el.setResponse(TASK_BOARD());
    await settle();
    // "Write tests" starts active → its toggle button reads "Active".
    rowButton(el, "Write tests", "Active")?.click();
    await settle();
    // Now it's done → the summary recomputes (1 active, 2 done).
    expect(shadowText(el)).toContain("1 active, 2 done");
    // And its toggle button now reads "Done".
    expect(rowButton(el, "Write tests", "Done")).toBeTruthy();
  });

  it("removes the correct task via its row button", async () => {
    const el = mount();
    el.setResponse(TASK_BOARD());
    await settle();
    expect(cards(el)).toHaveLength(3);
    rowButton(el, "Fix bug", "Remove")?.click();
    await settle();
    expect(cards(el)).toHaveLength(2);
    expect(shadowText(el)).not.toContain("Fix bug");
    expect(shadowText(el)).toContain("Write tests");
  });

  it("adds a new task from the draft state via the Add button", async () => {
    const el = mount();
    el.setResponse(TASK_BOARD());
    await settle();
    el.state.set("draft", "Deploy docs");
    await settle();
    addButton(el)?.click();
    await settle();
    expect(cards(el)).toHaveLength(4);
    expect(shadowText(el)).toContain("Deploy docs");
    // The new task is active → summary becomes 3 active, 1 done.
    expect(shadowText(el)).toContain("3 active, 1 done");
    // The new task sorts into place ("Deploy docs" before "Fix bug").
    expect(cardTitles(el)).toEqual(["Deploy docs", "Fix bug", "Ship release", "Write tests"]);
  });

  it("ignores an empty / whitespace-only draft (guard clause)", async () => {
    const el = mount();
    el.setResponse(TASK_BOARD());
    await settle();
    el.state.set("draft", "   ");
    await settle();
    addButton(el)?.click();
    await settle();
    expect(cards(el)).toHaveLength(3);
  });

  it("survives a full multi-step session (add, toggle, remove, search) consistently", async () => {
    const el = mount();
    el.setResponse(TASK_BOARD());
    await settle();

    // Add two tasks.
    el.state.set("draft", "Alpha");
    await settle();
    addButton(el)?.click();
    await settle();
    el.state.set("draft", "Omega");
    await settle();
    addButton(el)?.click();
    await settle();
    expect(cards(el)).toHaveLength(5);

    // Complete "Alpha".
    rowButton(el, "Alpha", "Active")?.click();
    await settle();

    // Remove "Omega".
    rowButton(el, "Omega", "Remove")?.click();
    await settle();
    expect(cards(el)).toHaveLength(4);

    // Filter to done — "Alpha" + "Fix bug".
    el.state.set("filter", "done");
    await settle();
    expect(cardTitles(el)).toEqual(["Alpha", "Fix bug"]);

    // Narrow by search within the done filter.
    el.state.set("query", "fix");
    await settle();
    expect(cardTitles(el)).toEqual(["Fix bug"]);
  });

  it("renders the same app in French when the i18n currentLanguage is fr", async () => {
    const el = mount();
    el.setResponse(TASK_BOARD("fr"));
    await settle();
    expect(shadowText(el)).toContain("Tableau");
    expect(shadowText(el)).toContain("2 actifs, 1 faits");
    // Row action buttons are translated too.
    expect(shadowText(el)).toContain("Retirer");
  });
});
