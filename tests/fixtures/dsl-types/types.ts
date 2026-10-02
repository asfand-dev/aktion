// Native TypeScript (not an Aktion module): types shared with host code, imported
// by the Aktion modules with `import type` so erasure leaves nothing behind.
export interface Todo {
  id: number;
  title: string;
  isCompleted: boolean;
}
