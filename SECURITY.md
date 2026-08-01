# Security

## Reporting a vulnerability

Please report security issues privately via
[GitHub Security Advisories](https://github.com/asfand-dev/aktion/security/advisories/new)
rather than opening a public issue. We aim to acknowledge within 3 working days.

---

## The trust model, stated plainly

Aktion has **two distinct inputs**, and they carry very different privileges.
Conflating them is the mistake that leads to a vulnerability, so this section is
the most important one in this file.

### 1. The program text is TRUSTED CODE

An Aktion program is as privileged as a `<script>` tag in the host page.

By default the evaluator resolves any unshadowed identifier against the host
realm, which means a program can reach `eval`, `Function`, `document`, `fetch`,
`localStorage`, and everything else on `globalThis`:

```
aktion = Button("go", { onClick: () => { Function("/* anything */")() } })
```

This is deliberate — it is what lets a program call `crypto.randomUUID()`,
`new URL(...)`, or a host helper without ceremony. The consequence is:

> **Treat authoring an Aktion program exactly as you would treat shipping a
> JavaScript file.** Program text must come from a source you trust as much as
> your own repository.

If that is not true for your deployment — the program is written by a
prompt-injectable LLM, loaded from a multi-tenant database, or editable by your
users — narrow the surface before you mount anything:

```ts
import { setGlobalAccessPolicy } from "aktion-runtime";

// Data, formatting, and encoding only: no eval/Function, no DOM, no network,
// no storage. `$http` and `storage` remain available as vetted namespaces.
setGlobalAccessPolicy("safe");

// …or name exactly what you want to permit:
setGlobalAccessPolicy(["btoa", "URL", "Intl"]);
```

`setGlobalAccessPolicy("safe")` is a meaningful reduction in blast radius, but it
is **not** a hardened sandbox and has not been adversarially audited as one.
Known limitations, stated so you can judge the residual risk:

- The curated namespaces (`Math`, `JSON`, `Object`, `Array`, `Date`, …) remain
  available under every policy. `Object` in particular still exposes
  `getPrototypeOf` and `assign`, which can be combined to reach and mutate
  shared prototypes — so `"safe"` bounds *capability* (no code execution, DOM,
  network, or storage) but does not fully isolate the realm.
- `$http`, `storage`, and `$socket`/`$sse` remain available by design. They are
  the vetted paths, but they still reach the network and persistence; restrict
  them at the host level (interceptors, CSP `connect-src`) if that matters.
- Property reads of `constructor` / `__proto__` / `prototype` are blocked on
  every access path, which is what prevents a lambda from yielding `Function`.

For genuinely untrusted program text, also run the whole thing in a cross-origin
iframe with a restrictive `sandbox` attribute so a residual escape cannot reach
your origin's cookies or DOM.

### 2. Everything the program *renders* is UNTRUSTED DATA

This is the surface the library actively defends, and it is the one that matters
in the common deployment: **a trusted program rendering untrusted content.**
That content includes

- LLM output rendered as Markdown or chat messages,
- HTTP / WebSocket / SSE response bodies,
- URL query and hash parameters,
- `localStorage` / `sessionStorage` / cookies,
- user input echoed back into the UI.

Every such value flows through a sanitiser before it reaches the DOM. These are
the guarantees the library makes and tests:

| Surface | Guard | What it stops |
| --- | --- | --- |
| Anchor `href` (`Link`, `NavbarItem`, `BreadcrumbItem`, Markdown links) | `sanitiseHref` | Allow-lists `http(s):`, `mailto:`, `tel:`, fragments, root-relative paths. Rejects `javascript:`, `vbscript:`, `data:text/html`, control-character bypasses (`java\tscript:`), and protocol-relative `//host/…`. |
| Image `src` (`Image`, `Avatar`, `MediaCard`, `Hero`, `ChatBubble`) | `sanitiseImageSrc` | Allow-lists `http(s):`, `data:image/*`, `blob:`, and relative paths. |
| Inline SVG (`Svg`, `$theme({ icons })`) | `sanitiseSvgMarkup` | Parses in an inert document and applies an element/attribute **allow-list**. Drops `<script>`, `<foreignObject>`, `<a>` (SVG anchors execute `javascript:`), `<style>`, `<image>`, SMIL `<animate attributeName="href">`, and every `on*` handler. Never assigns `innerHTML` on the live document. |
| Markdown | text/attribute escapers | Escapes both text and attribute contexts, decodes entities before scheme checks (`&#106;avascript:`), and isolates generated markup so a later pass cannot rewrite the inside of an earlier one. |
| `$head({...})` | per-field allow-lists | `<base>` restricted to same-origin paths; `<link>` restricted to metadata/hint `rel` values (no `stylesheet`/`preload`/`modulepreload`); `<html>` attributes restricted to `lang`/`dir`/`class`/`data-*`; attribute *names* validated so they cannot inject a second attribute in the SSR output. |
| `HTMLTag` escape hatch | tag + attribute allow-list | Tag names outside the allow-list collapse to `div`; `on*` dropped; `href`/`src` sanitised; `srcset`/`srcdoc`/`data`/`background` dropped; `target="_blank"` forced to carry `rel="noopener noreferrer"`. |
| `Styles` escape hatch | CSS filter + `textContent` | CSS is set as text (never parsed as HTML) and `@import` / `expression(` / `javascript:` payloads are dropped. |
| Inline `style` props, colours, lengths | `sanitiseCssColor`, `sanitiseCssLength`, `sx` filters | Restricted alphabets so a value cannot close its declaration and open another. |
| Cookies (`storage.cookies`) | attribute validation | Name and value percent-encoded; `path`/`domain` validated so a `;` cannot append attributes; `SameSite` always emitted (defaults to `Lax`). |
| State writes (`$a.b.c = …`) | forbidden-segment check | `__proto__` / `constructor` / `prototype` path segments are refused, so untrusted keys cannot reach `Object.prototype`. |
| CSV export (`DataGrid`) | formula-injection guard | Cells starting `=`, `+`, `-`, `@`, TAB, or CR are prefixed so a spreadsheet reads them as text, not as a live formula. |
| `helpers.openUrl(...)` | `sanitiseHref` | External windows open with `noopener,noreferrer`. |

### Shadow DOM is not a security boundary

Components render into a shadow root. That provides **style** encapsulation, not
a security boundary: script executing inside a shadow root runs with the host
page's full origin privileges. A shadow-DOM XSS is a same-origin XSS.

---

## Node-side tooling

The Vite plugin, the `create-aktion` scaffolder, and the VS Code extension read
files, so they treat a `.aktion` file as data that may have arrived with an
untrusted repository:

- **Vite plugin** — `.aktion` imports are confined to the Vite project root. A
  specifier like `../../../../etc/passwd` is refused rather than read (and, under
  `vite dev`, served to the browser). Opt out per-project with
  `aktion({ allowOutsideRoot: true })` only for trusted monorepo layouts.
- **`create-aktion`** — the project name becomes a filesystem path, so `..`
  segments, absolute paths, `~`, control characters, reserved device names, and a
  leading `-` are refused. The scaffold cannot be written outside the current
  directory.

---

## Content Security Policy

The runtime does not use `eval` or `new Function` internally, so it does not
require `unsafe-eval`. It does inject `<style>` elements (theme tokens, component
CSS, the `Styles` component), so a strict CSP needs either `style-src 'self'
'unsafe-inline'` or a nonce/hash strategy for those elements.

Setting `setGlobalAccessPolicy("safe")` (see above) additionally prevents a
*program* from reaching `eval`/`Function`, which is what makes a
`script-src` without `unsafe-eval` meaningful in the presence of
less-than-fully-trusted program text.

---

## Reporting scope

In scope:

- Any way untrusted **data** (props, Markdown, HTTP/WS payloads, URL params,
  storage) achieves script execution, reaches `document.head`, or escapes a
  sanitiser.
- Path traversal, arbitrary file read/write, or command execution in the Node
  tooling.
- A bypass of `setGlobalAccessPolicy("safe")` that regains `eval`, `Function`,
  DOM, network, or storage access.

Out of scope:

- A program authored under the default `"all"` policy reaching host globals.
  That is documented behaviour, not a vulnerability — see section 1.
