/**
 * The Markdown body behind the **Aktion: Show Language Reference** command.
 *
 * Every line is DERIVED from `aktion-runtime/language` — component groups,
 * builtins, namespace members, factory resource bags, keyword docs, theme names.
 * Nothing here is hand-listed, so the reference cannot drift from the runtime the
 * extension bundles (that is the whole point of
 * `.cursor/rules/editor-tooling-sync.mdc`: the editor owns no language data).
 *
 * Kept free of any `vscode` import so it stays a pure string function — it can be
 * exercised from plain Node, unlike the provider code around it.
 */

import {
  builtinCatalog,
  defaultLibrary,
  factoryResourceCatalog,
  getComponentCatalog,
  getLanguageSpec,
  getSnippets,
  grammarSpec,
  keywordDocs,
  namespaceCatalog,
  routeMembers,
  type ComponentEntry,
} from "aktion-runtime/language";

/** Build the whole reference document. */
export function buildLanguageReference(): string {
  const spec = getLanguageSpec();
  const components = getComponentCatalog();
  const namespaceMembers = namespaceCatalog.reduce((n, ns) => n + ns.members.length, 0);

  const out: string[] = [
    "# Aktion language reference",
    "",
    "Generated from the language surface this extension bundles — never hand-written.",
    "",
    "| | |",
    "| --- | --- |",
    `| Components | ${components.length} in ${groupNames().length} groups |`,
    `| \`$\`-builtins | ${builtinCatalog.length} |`,
    `| Namespaces | ${namespaceCatalog.length} (${namespaceMembers} members) |`,
    `| Factory resource bags | ${factoryResourceCatalog.length} |`,
    `| Snippets | ${getSnippets().length} |`,
    `| Built-in themes | ${spec.themeNames.length} — ${spec.themeNames.join(", ")} |`,
    "",
  ];

  out.push(...builtinsSection());
  out.push(...namespacesSection());
  out.push(...resourceBagsSection());
  out.push(...keywordsSection());
  out.push(...grammarSection());
  out.push(...componentsSection(components));

  return `${out.join("\n")}\n`;
}

/** Group names in registry order, which is the order authors should scan. */
function groupNames(): string[] {
  return (defaultLibrary.componentGroups ?? []).map((g) => g.name);
}

function builtinsSection(): string[] {
  const out = ["## `$`-builtins", ""];
  // Group by the catalog's own `category` rather than an invented taxonomy.
  const categories = [...new Set(builtinCatalog.map((b) => b.category))];
  for (const category of categories) {
    out.push(`### ${category}`, "");
    for (const b of builtinCatalog.filter((x) => x.category === category)) {
      out.push(`- \`${b.signature}\` — ${b.summary}`);
    }
    out.push("");
  }
  return out;
}

function namespacesSection(): string[] {
  const out = ["## Namespaces", ""];
  for (const ns of namespaceCatalog) {
    out.push(`### \`${ns.sigil}\` — ${ns.summary}`, "", `${ns.members.length} members:`, "");
    for (const member of ns.members) {
      out.push(`- \`${ns.sigil}.${member.signature}\` — ${member.summary}`);
    }
    out.push("");
  }
  out.push("### `route` (reactive handle)", "");
  for (const member of routeMembers) {
    out.push(`- \`route.${member.signature}\` — ${member.summary}`);
  }
  out.push("");
  return out;
}

function resourceBagsSection(): string[] {
  const out = [
    "## Factory resource bags",
    "",
    "What a binding assigned from a factory builtin exposes — e.g. `$todos = $http(…)`",
    "then `$todos.data` / `$todos.refetch()`.",
    "",
  ];
  for (const bag of factoryResourceCatalog) {
    out.push(`### \`$${bag.factory}(…)\` — ${bag.summary}`, "");
    for (const member of bag.members) {
      out.push(`- \`.${member.signature}\` — ${member.summary}`);
    }
    out.push("");
  }
  return out;
}

function keywordsSection(): string[] {
  const out = ["## Keywords and handles", ""];
  for (const [keyword, doc] of Object.entries(keywordDocs)) {
    out.push(`### \`${keyword}\``, "", doc.summary, "", "```aktion", doc.syntax, "```", "");
    if (doc.example && doc.example !== doc.syntax) {
      out.push("```aktion", doc.example, "```", "");
    }
  }
  return out;
}

function grammarSection(): string[] {
  return [
    "## Grammar",
    "",
    `- **Reserved words** — ${inlineCode(grammarSpec.keywords)}`,
    `- **Atoms** — ${inlineCode(grammarSpec.atoms)}`,
    `- **Operators** — ${inlineCode([...grammarSpec.operatorsLong, ...grammarSpec.operators])}`,
    `- **Brackets** — ${inlineCode(grammarSpec.brackets.map((b) => `${b.open}${b.close}`))}`,
    `- **Comments** — ${inlineCode([grammarSpec.comments.line, `${grammarSpec.comments.blockStart} … ${grammarSpec.comments.blockEnd}`])}`,
    `- **Strings** — ${inlineCode([...grammarSpec.strings.singleLineQuotes, grammarSpec.strings.multiLineQuote])}`,
    `- **Reactive sigil** — ${inlineCode([grammarSpec.sigils.state])}`,
    "",
  ];
}

function componentsSection(components: readonly ComponentEntry[]): string[] {
  const out = ["## Components", ""];
  const byGroup = new Map<string, ComponentEntry[]>();
  for (const entry of components) {
    const bucket = byGroup.get(entry.group);
    if (bucket) bucket.push(entry);
    else byGroup.set(entry.group, [entry]);
  }
  // Registry group order first, then anything the registry did not group (there
  // is nothing today, but a new group must not silently vanish from the doc).
  const ordered = [...groupNames(), ...[...byGroup.keys()].filter((g) => !groupNames().includes(g))];
  for (const group of ordered) {
    const entries = byGroup.get(group);
    if (!entries || entries.length === 0) continue;
    out.push(`### ${group} (${entries.length})`, "");
    for (const entry of entries) {
      out.push(`- \`${entry.signature}\``);
    }
    out.push("");
  }
  return out;
}

function inlineCode(values: readonly string[]): string {
  return values.map((v) => `\`${v}\``).join(" · ");
}
