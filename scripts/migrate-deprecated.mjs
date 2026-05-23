#!/usr/bin/env node
/**
 * One-shot migration: rewrite legacy component names in Aktion
 * sources to the canonical replacements introduced in May 2026.
 *
 *   Tag(label, icon, size, variant)   → Badge(label, variant, icon, size)
 *   TagBlock(tags, variant?, size?)   → BadgeList(labels, variant?, size?)
 *   Note(content, tone?, icon?)       → Callout(tone, content, null, icon, true)
 *   Alert(title, message?, variant?)  → Callout(variant, title, message)
 *   Header(title, subtitle?)          → PageHeader(title, subtitle?)
 *   Divider() / Divider(label)        → Separator() / Separator("horizontal", label)
 *
 * Run with: node scripts/migrate-deprecated.mjs path1.html path2.html …
 */

import fs from "node:fs";
import path from "node:path";

/**
 * Split a `Name(...)` call's argument list at the top-level commas so we can
 * shuffle / re-order positional arguments. Respects strings (single, double,
 * backtick), nested parens, brackets, braces, and template literals.
 */
function splitArgs(text) {
  const args = [];
  let depth = 0;
  let buf = "";
  let i = 0;
  let inStr = null; // current quote char or null
  let escape = false;
  while (i < text.length) {
    const ch = text[i];
    if (inStr) {
      buf += ch;
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === inStr) {
        inStr = null;
      }
      i += 1;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      inStr = ch;
      buf += ch;
      i += 1;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth += 1;
      buf += ch;
      i += 1;
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      depth -= 1;
      buf += ch;
      i += 1;
      continue;
    }
    if (ch === "," && depth === 0) {
      args.push(buf);
      buf = "";
      i += 1;
      continue;
    }
    buf += ch;
    i += 1;
  }
  if (buf.length > 0 || args.length > 0) args.push(buf);
  return args;
}

/**
 * Find every top-level `Name(...)` call inside the input string and rewrite
 * its argument list with the supplied function.
 *
 * The replacer receives an array of *raw* argument strings (whitespace and
 * comments intact) and must return either a replacement argument array or
 * `null` to leave the call untouched.
 */
function rewriteCalls(source, name, rewriter) {
  const out = [];
  const re = new RegExp(`(^|[^A-Za-z0-9_])${name}\\(`, "g");
  let last = 0;
  let match;
  while ((match = re.exec(source)) !== null) {
    const start = match.index + match[1].length;
    let depth = 1;
    let i = start + name.length + 1;
    let inStr = null;
    let escape = false;
    while (i < source.length && depth > 0) {
      const ch = source[i];
      if (inStr) {
        if (escape) escape = false;
        else if (ch === "\\") escape = true;
        else if (ch === inStr) inStr = null;
      } else if (ch === "'" || ch === '"' || ch === "`") {
        inStr = ch;
      } else if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
      i += 1;
    }
    if (depth !== 0) break;
    const argsText = source.slice(start + name.length + 1, i - 1);
    const args = argsText.length === 0 ? [] : splitArgs(argsText);
    const replacement = rewriter(args);
    if (replacement === null) {
      out.push(source.slice(last, i));
    } else {
      out.push(source.slice(last, start));
      const body = replacement.joined ?? replacement.args.join(",");
      out.push(`${replacement.name}(${body})`);
    }
    last = i;
    re.lastIndex = i;
  }
  out.push(source.slice(last));
  return out.join("");
}

/** Pretty-emit a positional argument: stripped of surrounding whitespace. */
function clean(arg) {
  return (arg ?? "").trim();
}

function joinArgs(args) {
  return args.map((a, i) => (i === 0 ? clean(a) : " " + clean(a))).join(",");
}

function migrate(source) {
  let out = source;

  // Tag(label, icon?, size?, variant?) → Badge(label, variant, icon, size)
  out = rewriteCalls(out, "Tag", (args) => {
    if (args.length === 0) return null;
    const label = clean(args[0]);
    const icon = clean(args[1] ?? "");
    const size = clean(args[2] ?? "");
    const variant = clean(args[3] ?? "");
    const ordered = [label, variant || "null", icon || "null", size || "null"];
    while (ordered.length > 1 && ordered[ordered.length - 1] === "null") ordered.pop();
    return { name: "Badge", args: ordered, joined: joinArgs(ordered) };
  });

  // TagBlock(tags, variant?, size?) → BadgeList(labels, variant?, size?)
  out = rewriteCalls(out, "TagBlock", (args) => {
    if (args.length === 0) return null;
    const ordered = args.map(clean);
    return { name: "BadgeList", args: ordered, joined: joinArgs(ordered) };
  });

  // Note(content, tone?, icon?) → Callout(tone, content, null, icon, true)
  out = rewriteCalls(out, "Note", (args) => {
    if (args.length === 0) return null;
    const content = clean(args[0]);
    const tone = clean(args[1] ?? "") || `"info"`;
    const icon = clean(args[2] ?? "") || "null";
    const ordered = [tone, content, "null", icon, "true"];
    return { name: "Callout", args: ordered, joined: joinArgs(ordered) };
  });

  // Alert(title, message?, variant?) → Callout(variant, title, message)
  out = rewriteCalls(out, "Alert", (args) => {
    if (args.length === 0) return null;
    const title = clean(args[0]);
    const message = clean(args[1] ?? "");
    const variant = clean(args[2] ?? "") || `"info"`;
    const ordered = [variant, title];
    if (message && message !== "null") ordered.push(message);
    return { name: "Callout", args: ordered, joined: joinArgs(ordered) };
  });

  // Header(title, subtitle?) → PageHeader(title, subtitle?)
  // CAREFUL: only the bare `Header(` call, NOT CardHeader / PageHeader / SectionHeader.
  out = rewriteCalls(out, "Header", (args) => {
    if (args.length === 0) return null;
    const ordered = args.map(clean);
    return { name: "PageHeader", args: ordered, joined: joinArgs(ordered) };
  });

  // Divider() / Divider(label) → Separator() / Separator("horizontal", label)
  out = rewriteCalls(out, "Divider", (args) => {
    if (args.length === 0) return { name: "Separator", args: [], joined: "" };
    const label = clean(args[0]);
    const ordered = [`"horizontal"`, label];
    return { name: "Separator", args: ordered, joined: joinArgs(ordered) };
  });

  return out;
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: node scripts/migrate-deprecated.mjs <file>...");
  process.exit(1);
}

let touched = 0;
for (const file of files) {
  const abs = path.resolve(file);
  const before = fs.readFileSync(abs, "utf8");
  const after = migrate(before);
  if (after !== before) {
    fs.writeFileSync(abs, after);
    touched += 1;
    console.log(`✔ migrated ${path.relative(process.cwd(), abs)}`);
  }
}
console.log(`\nTotal files touched: ${touched}`);
