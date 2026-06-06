import "aktion-runtime"; // registers the <aktion-app> custom element
import type { AktionElement } from "aktion-runtime";

// `.aktion` files compile to a typed `CompiledProgram` (the Vite plugin runs
// the multi-file linker). `mountCompiled` renders the pre-parsed AST directly.
import app from "./app.aktion";

document.querySelector<AktionElement>("#app")?.mountCompiled(app);
