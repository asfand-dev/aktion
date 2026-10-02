// Host code (native TypeScript): imports the TS entry module and mounts it.
// Type-checked only against the REAL runtime types (fixture tsconfig.json), so
// the `CompiledProgram` that `$app` returns must be the one `mountCompiled` takes.
import "aktion-runtime";
import type { AktionElement } from "aktion-runtime";
import type { CompiledProgram } from "aktion-runtime/dsl";
import app from "./app.aktion.ts";

const compiled: CompiledProgram = app;
const source: string = app.source;
document.querySelector<AktionElement>("#app")?.mountCompiled(compiled);

export { source };
