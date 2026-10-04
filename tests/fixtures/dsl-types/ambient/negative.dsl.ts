// Ambient flavour, negative: the globals carry the real declarations (an `any`
// here would make every ambient fixture pass vacuously). Not `*.aktion.ts`, so
// repo sweeps over Aktion modules never pick it up.

// @ts-expect-error enum mismatch — the global `Card` is the typed component
Card([Text("x")], { variant: "nope" });
// @ts-expect-error a boolean child — the global `Column` keeps the Children type
Column([1 > 2 && Text("x")]);
// @ts-expect-error a non-trigger string — the global `$effect` keeps its dependency check
$effect(() => {}, ["evry(1000)"]);

export {};
