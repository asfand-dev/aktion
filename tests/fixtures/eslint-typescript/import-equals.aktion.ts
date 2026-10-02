// Lint fixture for `aktion/props-literal`: an `import X = N.Y` alias (which
// the `.aktion.ts` frontend rejects anyway) binds a user name, so it is not
// checked — and it must not crash the rule, which reads import sources.
import Callout = Legacy.Callout;

const calloutOpts = { tone: "info" } as const;

export const callout = Callout("Heads up", calloutOpts);
