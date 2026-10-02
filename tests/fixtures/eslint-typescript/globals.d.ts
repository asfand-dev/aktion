/**
 * The ambient flavour (`aktion-runtime/dsl-globals`): components declared as
 * globals, called without an import. A script file — no import or export —
 * so the declaration is global.
 */
declare const Badge: typeof import("aktion-runtime/dsl").Badge;

/** A namespace member, aliased by `import … = Legacy.Callout` in import-equals.aktion.ts. */
declare namespace Legacy {
  function Callout(title: string, props?: { tone?: "info" | "warn" }): unknown;
}
