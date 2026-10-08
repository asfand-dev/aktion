/**
 * Ambient module declarations for `.aktion` files, so TypeScript resolves
 * `import app from "./app.aktion"` to a typed `CompiledProgram` default export
 * (the artefact the `aktion-runtime/vite` plugin emits). Opt in with one line
 * in any `.d.ts` / `env.d.ts`:
 *
 *   /// <reference types="aktion-runtime/aktion-modules" />
 *
 * The type comes through an `import("…")` type query, resolved against this
 * file: in this package's own build it names `src/compiler/runtime.ts`, in the
 * published package `dist/types/compiler/runtime.d.ts`. An `import` DECLARATION
 * cannot do that — inside an ambient module it may not use a relative name
 * (TS2439), and `skipLibCheck` would hide the error and leave the default
 * export `any`.
 */

declare module "*.aktion" {
  const compiled: import("./compiler/runtime.js").CompiledProgram;
  export default compiled;
}
