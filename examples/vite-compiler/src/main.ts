import "aktion-runtime"; // registers the <aktion-app> custom element
import type { AktionElement } from "aktion-runtime";

// `.aktion` files compile to typed `CompiledProgram` default exports (the Vite
// plugin runs the multi-file linker). `app` imports a sibling module via the
// DSL's own `import`/`export`; `dashboard` is a single file.
import dashboard from "./dashboard.aktion";
import app from "./app.aktion";

// `mountCompiled` renders the pre-parsed AST directly — no parsing in the browser.
document.querySelector<AktionElement>("#dashboard")?.mountCompiled(dashboard);
document.querySelector<AktionElement>("#app")?.mountCompiled(app);
