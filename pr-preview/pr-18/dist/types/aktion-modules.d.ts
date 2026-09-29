/**
 * Ambient module declarations for `.aktion` files, so TypeScript resolves
 * `import app from "./app.aktion"` to a typed `CompiledProgram` default export
 * (the artefact the `aktion-runtime/vite` plugin emits). Opt in with one line
 * in any `.d.ts` / `env.d.ts`:
 *
 *   /// <reference types="aktion-runtime/aktion-modules" />
 *
 * The relative import resolves both in this package's own build
 * (`src/compiler/runtime.ts`) and in the published package
 * (`dist/types/aktion-modules.d.ts` → `dist/types/compiler/runtime.d.ts`).
 */

declare module "*.aktion" {
  import type { CompiledProgram } from "./compiler/runtime.js";
  const compiled: CompiledProgram;
  export default compiled;
}
