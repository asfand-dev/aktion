import "aktion-runtime"; // registers the <aktion-app> custom element
import type { AktionElement } from "aktion-runtime";

// The entry is an Aktion module written in TypeScript. The Vite plugin erases
// its types, links its imports, and hands back a typed `CompiledProgram` —
// `export default $app(…)` is what makes this default import typed.
import app from "./app.aktion.ts";

document.querySelector<AktionElement>("#app")?.mountCompiled(app);
