#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const files = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === ".git") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(html|md|js|ts|txt|mjs)$/.test(name) && !/\.test\.(ts|js)$/.test(name)) files.push(p);
  }
}
walk(root);

function migrate(text) {
  let out = text;
  out = out.replace(/@FormatCurrency\(([^,)]+),\s*"([^"]+)"\)/g, '@Format($1, "currency", "$2")');
  out = out.replace(/@FormatCurrency\(([^)]+)\)/g, '@Format($1, "currency", "USD")');
  out = out.replace(/@FormatNumber\(([^)]+)\)/g, '@Format($1, "number")');
  out = out.replace(/@Camelcase\(([^)]+)\)/g, '@Case($1, "camel")');
  out = out.replace(/@Snakecase\(([^)]+)\)/g, '@Case($1, "snake")');
  out = out.replace(/@Kebabcase\(([^)]+)\)/g, '@Case($1, "kebab")');
  out = out.replace(/@Pascalcase\(([^)]+)\)/g, '@Case($1, "pascal")');
  out = out.replace(/@Push\((\$[^,]+),\s*([^)]+)\)/g, "[...$1, $2]");
  out = out.replace(/@Concat\(([^,]+),\s*([^)]+)\)/g, "[...$1, ...$2]");
  out = out.replace(/@Take\(([^,]+),\s*([^)]+)\)/g, "@Slice($1, 0, $2)");
  out = out.replace(/@Map\(([^,]+),\s*"([^"]+)"\)/g, "$1.$2");
  out = out.replace(/\bMetricGrid\(/g, "Stats(");
  out = out.replace(/\bAreaChart\(/g, "LineChart(");
  out = out.replace(/\bAuditTrail\(/g, "ActivityLog(");
  out = out.replace(/\bCover\(/g, "Hero(");
  out = out.replace(/\bSheet\(/g, "Drawer(");
  out = out.replace(/\bToasts\(/g, "Stack(");
  out = out.replace(/BreadcrumbPageHeader\(/g, "PageHeader(");
  out = out.replace(/SegmentedControl\(/g, "ToggleGroup(");
  out = out.replace(/OtpInput\(/g, 'PinInput(');
  return out;
}

let changed = 0;
for (const file of files) {
  if (file.endsWith("migrate-references.mjs")) continue;
  const before = readFileSync(file, "utf8");
  const after = migrate(before);
  if (after !== before) {
    writeFileSync(file, after);
    changed += 1;
  }
}
console.log(`Migrated ${changed} files`);
