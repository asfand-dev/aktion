// Native TypeScript, types only — shared by the Aktion modules (through
// `import type`, erased before linking) and the tests.

/** A todo as the REST API returns it. */
export interface Todo {
  id: number;
  title: string;
  isCompleted: boolean;
}
