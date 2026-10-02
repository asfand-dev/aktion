import "aktion-runtime"; // registers the <aktion-app> custom element
import type { AktionElement } from "aktion-runtime";

// The entry is an Aktion module written in JavaScript. The Vite plugin links
// its imports and hands back the compiled program to mount.
import app from "./app.aktion.js";

document.querySelector<AktionElement>("#app")?.mountCompiled(app);
