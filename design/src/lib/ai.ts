/**
 * Server-side AI generation support: assembles the system prompt for the LLM
 * (Aktion's own generated system prompt + the design-canvas output contract)
 * and calls OpenRouter with streaming enabled.
 */
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const REMOTE_PROMPT_URL =
  "https://asfand-dev.github.io/aktion/dist/system_prompt.txt";
const PROMPT_TTL_MS = 60 * 60 * 1000;

let cachedPrompt: { text: string; at: number } | null = null;

/**
 * The Aktion system prompt, fetched from the published URL so it always
 * matches the latest language/library (per deployment cache: 1h). Falls back
 * to the prompt bundled with the installed aktion-runtime when offline.
 */
export async function getAktionSystemPrompt(): Promise<string> {
  if (cachedPrompt && Date.now() - cachedPrompt.at < PROMPT_TTL_MS) {
    return cachedPrompt.text;
  }
  let text: string | null = null;
  try {
    const res = await fetch(REMOTE_PROMPT_URL, {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) text = await res.text();
  } catch {
    // fall through to the local copy
  }
  if (!text) {
    try {
      const nodeRequire = createRequire(process.cwd() + "/package.json");
      text = await readFile(
        nodeRequire.resolve("aktion-runtime/system_prompt.txt"),
        "utf8",
      );
    } catch {
      // final fallback below
    }
  }
  if (!text) {
    throw new Error(
      "Could not load the Aktion system prompt (network and local fallback both failed)",
    );
  }
  cachedPrompt = { text, at: Date.now() };
  return text;
}

export type DesignScope = "page" | "component";

/**
 * Constraints that make the LLM's output convertible into editable canvas
 * layers: a single component tree with literal props — no runtime features.
 * The `scope` switches between full-page composition and a single focused
 * component/section.
 */
export function designContract(
  width: number,
  height: number,
  scope: DesignScope,
): string {
  const rootRule =
    scope === "component"
      ? `2. The user is asking for a SPECIFIC component or section — NOT a full page. The first statement MUST be \`$app(<TheComponent>(...))\` where the root is exactly what was asked for (a card, a form, a pricing table, ...), sized naturally. Do NOT add page chrome (no Navbar, no Footer, no Hero, no full-page Column wrapper) unless it was explicitly requested.`
      : `2. The first statement MUST be \`$app(Column([ ... ]))\` — a single Column root containing the whole design. You MAY factor sections into \`name = Expression()\` bindings below it and reference them by name inside $app.`;
  const sizeRule =
    scope === "component"
      ? `5. The component will be placed on a ${width}×${height}px frame — size it to its content, not to the page.`
      : `5. The design targets a ${width}×${height}px frame. Fill the full width; content may extend taller than the frame.`;

  return `

## Design-canvas output contract (OVERRIDES anything above when in conflict)

You are generating a STATIC DESIGN for a visual canvas editor, not a running application. In addition to the language rules above:

1. Output ONLY Aktion code. No prose, no markdown fences, no comments before $app.
${rootRule}
3. STRICTLY FORBIDDEN: \`function\` declarations, reactive atoms (\`$name = ...\`), \`$state\`, \`$effect\`, \`$router\`, \`$store\`, \`$form\`, \`$http\`, \`$query\`, \`$mutation\`, \`$socket\`, \`$sse\`, \`$head\`, \`$theme\`, \`$i18n\`, imports, timers.
4. Every prop value must be a literal: string, number, boolean, array, or object. No template literals, no \`.map(...)\` over data — write list items out explicitly. The ONLY exception: event handlers (onClick, ...) may be inline arrows calling \`$toast.*\`, e.g. \`onClick: () => $toast.info("Clicked")\` — or simply omit handlers.
${sizeRule}
6. Write real, specific copy — product names, numbers, believable labels. Never "Lorem ipsum".
7. Compose with the library's layout and pattern components (Section, Split, Grid, Bento, Row, Column, Card, Hero, Navbar, Footer, PricingTable, Testimonial, StatCard, ...) and style with the token-aware \`sx\` prop for spacing, color, radius, and typography.
8. Images: use Unsplash URLs like https://images.unsplash.com/photo-<id>?w=1200&q=80.
9. PROJECT CONSISTENCY: when a "Project context" block is provided, treat it as the source of truth — reuse its theme colors semantically (don't fight the theme), keep navigation labels/links consistent with the existing pages, match the established tone, and design the requested screen so it feels like part of the same product.
10. LAYOUT QUALITY: give every section breathing room (\`sx: { py: "2xl", px: "xl" }\` or a Section/Container wrapper); vertical rhythm comes from Column gaps, not empty Text spacers. The frame auto-grows to fit content — never cram or truncate; include every section the request implies at full quality.
11. VALID COMPONENTS ONLY: use only components documented above, with their documented props. If unsure a component exists, build the pattern from Column/Row/Card/Text/Button primitives instead of guessing a name.

### Shape example (structure and style conventions to imitate — NOT content to copy)

$app(Column([
  Navbar("Acme", { items: [{ label: "Home", to: "/" }, { label: "Pricing", to: "/pricing" }], actions: [Button("Sign in", { variant: "ghost" })] }),
  Section([
    Column([
      Heading("Clear, benefit-led headline"),
      Text("One supporting sentence that sharpens the promise.", { tone: "muted", variant: "large" }),
      Row([Button("Primary action", { variant: "primary", size: "lg" }), Button("Secondary", { variant: "outline", size: "lg" })], { gap: "sm" })
    ], { gap: "md", align: "center" })
  ], { sx: { py: "3xl", px: "xl", textAlign: "center" } }),
  Section([
    Grid([
      Card([CardHeader("Feature one", { subtitle: "Why it matters in one line" })]),
      Card([CardHeader("Feature two", { subtitle: "Why it matters in one line" })]),
      Card([CardHeader("Feature three", { subtitle: "Why it matters in one line" })])
    ], { columns: 3, gap: "lg" })
  ], { sx: { py: "2xl", px: "xl" } })
]))`;
}

export function buildMessages(options: {
  prompt: string;
  mode: "create" | "edit";
  scope: DesignScope;
  width: number;
  height: number;
  currentProgram?: string;
  context?: string;
  aktionPrompt: string;
}): Array<{ role: "system" | "user"; content: string }> {
  const { prompt, mode, scope, width, height, currentProgram, context, aktionPrompt } =
    options;
  const system = aktionPrompt + designContract(width, height, scope);

  const contextBlock = context?.trim()
    ? `Project context (existing design system state — stay consistent with it):\n${context.trim()}\n\n---\n\n`
    : "";

  const user =
    mode === "edit" && currentProgram
      ? `${contextBlock}Here is the current design program:\n\n${currentProgram}\n\n---\n\nModify it as follows, and return the FULL updated program (same output contract — only the code): ${prompt}`
      : `${contextBlock}Create this design: ${prompt}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
}

export function getOpenRouterConfig(): OpenRouterConfig | null {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();
  const model =
    process.env.OPENROUTER_MODEL?.trim() || "anthropic/claude-sonnet-4.5";
  if (!apiKey) return null;
  return { apiKey, model };
}

/**
 * Call OpenRouter with streaming and return a plain-text stream of content
 * deltas (SSE parsing happens here so the client just reads text chunks).
 */
export async function streamCompletion(
  config: OpenRouterConfig,
  messages: Array<{ role: string; content: string }>,
  signal: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/asfand-dev/aktion",
      "X-Title": "Aktion Design",
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      // Lower temperature: design output should be reliable and on-contract,
      // not exploratory — variety comes from the prompt, not sampling noise.
      temperature: 0.4,
      max_tokens: 16000,
    }),
  });

  if (!res.ok || !res.body) {
    let detail = `OpenRouter error (${res.status})`;
    try {
      const json = (await res.json()) as { error?: { message?: string } };
      if (json.error?.message) detail = json.error.message;
    } catch {
      // keep the generic message
    }
    throw new Error(detail);
  }

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      // SSE frames are newline-delimited "data: {...}" lines.
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const content = json.choices?.[0]?.delta?.content;
          if (content) controller.enqueue(encoder.encode(content));
        } catch {
          // Partial/keep-alive frame — ignore.
        }
      }
    },
  });

  return res.body.pipeThrough(transform);
}
