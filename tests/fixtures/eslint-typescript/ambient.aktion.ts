// Lint fixture for `aktion/props-literal`: a component reached as an ambient
// global (the `aktion-runtime/dsl-globals` flavour, see ./globals.d.ts) is a
// library component even though nothing in this file declares it.
const badgeOpts = { tone: "success" } as const;

export const literal = Badge("New", { tone: "success" });
export const fromVariable = Badge("New", badgeOpts); // expect: propsNotLiteral
