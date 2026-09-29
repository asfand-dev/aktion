/**
 * Styles for the `<aktion-devtools>` panel. Injected once into the panel's
 * own shadow root so it is fully isolated from both the host page and the
 * inspected `<aktion-app>` — the inspector can never be restyled by the app
 * it is inspecting, and vice versa.
 *
 * This file holds the chrome and the original three tabs; `styles-extra.ts`
 * holds the tabs added in 0.6. They are concatenated below into the single
 * stylesheet the panel adopts.
 */
/** The panel's complete stylesheet: chrome + original tabs + the 0.6 tabs. */
export declare const devtoolsStyles: string;
