function isNode(value) {
  if (typeof value !== "object" || value === null) return false;
  const kind = value.kind;
  if (typeof kind !== "string" || kind.length === 0) return false;
  const first = kind.charCodeAt(0);
  return first >= 65 && first <= 90;
}
function walk(program, visit) {
  for (const stmt of program.statements) visitNode(stmt, null, null, null, 0, visit);
}
function visitNode(node, parent, key2, index, depth, visit) {
  if (visit({ node, parent, key: key2, index, depth }) === false) return;
  for (const childKey of Object.keys(node)) {
    if (childKey === "loc") continue;
    const value = node[childKey];
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        const item = value[i];
        if (isNode(item)) visitNode(item, node, childKey, i, depth + 1, visit);
        else if (item && typeof item === "object") visitRecord(item, node, childKey, depth, visit);
      }
      continue;
    }
    if (isNode(value)) visitNode(value, node, childKey, null, depth + 1, visit);
    else if (value && typeof value === "object") {
      visitRecord(value, node, childKey, depth, visit);
    }
  }
}
function visitRecord(record, owner, key2, depth, visit) {
  for (const inner of Object.keys(record)) {
    if (inner === "loc") continue;
    const value = record[inner];
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        const item = value[i];
        if (isNode(item)) visitNode(item, owner, key2, i, depth + 1, visit);
        else if (item && typeof item === "object") visitRecord(item, owner, key2, depth, visit);
      }
      continue;
    }
    if (isNode(value)) visitNode(value, owner, key2, null, depth + 1, visit);
    else if (value && typeof value === "object") {
      visitRecord(value, owner, key2, depth, visit);
    }
  }
}
const MODULE_LOCAL_SYMBOL = /^__a(\d+)_(.+)$/;
function moduleLocalBaseName(symbol) {
  const match = MODULE_LOCAL_SYMBOL.exec(symbol);
  return match ? match[2] : null;
}
const INLINE_SOURCE_PATH = "<inline>";
const STORE_KEY = "__AKTION_COVERAGE_V1__";
function store() {
  const holder = globalThis;
  let existing = holder[STORE_KEY];
  if (!existing) {
    existing = { enabled: false, accumulators: /* @__PURE__ */ new Map(), registered: /* @__PURE__ */ new WeakSet() };
    holder[STORE_KEY] = existing;
  }
  return existing;
}
function accumulatorFor(path) {
  const { accumulators } = store();
  let acc = accumulators.get(path);
  if (!acc) {
    acc = { path, lines: /* @__PURE__ */ new Map(), functions: /* @__PURE__ */ new Map(), branches: /* @__PURE__ */ new Map() };
    accumulators.set(path, acc);
  }
  return acc;
}
const key = (line, column) => `${line}:${column}`;
function functionName(node) {
  switch (node.kind) {
    case "ComponentDeclaration":
    case "ActionDeclaration":
    case "HookDeclaration":
      return moduleLocalBaseName(node.name) ?? (node.name || "(anonymous)");
    case "EffectDeclaration":
      return "effect";
    case "Lambda":
      return "(anonymous)";
    default:
      return null;
  }
}
function branchShape(node) {
  switch (node.kind) {
    case "IfStatement":
      return { kind: "if", arms: 2 };
    case "Ternary":
      return { kind: "ternary", arms: 2 };
    case "Binary":
      return node.operator === "&&" || node.operator === "||" || node.operator === "??" ? { kind: "logical", arms: 2 } : null;
    case "SwitchStatement":
      return { kind: "switch", arms: Math.max(node.cases.length, 1) };
    default:
      return null;
  }
}
function registerProgram(program, path) {
  const sources = program.sources ?? [path ?? INLINE_SOURCE_PATH];
  const files = sources.map((source) => accumulatorFor(source));
  const { registered } = store();
  if (registered.has(program.statements)) return { files };
  registered.add(program.statements);
  walk(program, ({ node }) => {
    const loc = node.loc;
    if (!loc) return;
    const file = files[loc.source ?? 0] ?? files[0];
    if (node.kind !== "Block" && !file.lines.has(loc.line)) file.lines.set(loc.line, 0);
    const fnName = functionName(node);
    if (fnName !== null) {
      const k = key(loc.line, loc.column);
      if (!file.functions.has(k)) {
        file.functions.set(k, { name: fnName, line: loc.line, column: loc.column, hits: 0 });
      }
    }
    const branch = branchShape(node);
    if (branch) {
      const k = key(loc.line, loc.column);
      if (!file.branches.has(k)) {
        file.branches.set(k, {
          kind: branch.kind,
          line: loc.line,
          column: loc.column,
          arms: new Array(branch.arms).fill(0)
        });
      }
    }
  });
  return { files };
}
function recordLine(scope, loc) {
  const file = scope.files[loc.source ?? 0];
  if (!file) return;
  file.lines.set(loc.line, (file.lines.get(loc.line) ?? 0) + 1);
}
function recordFunction(scope, loc) {
  if (!loc) return;
  const file = scope.files[loc.source ?? 0];
  if (!file) return;
  const record = file.functions.get(key(loc.line, loc.column));
  if (record) record.hits += 1;
}
function recordBranch(scope, loc, arm) {
  if (!loc) return;
  const file = scope.files[loc.source ?? 0];
  if (!file) return;
  const record = file.branches.get(key(loc.line, loc.column));
  if (!record) return;
  if (arm >= 0 && arm < record.arms.length) record.arms[arm] = record.arms[arm] + 1;
}
function start() {
  store().enabled = true;
}
function stop() {
  store().enabled = false;
}
function isEnabled() {
  return store().enabled;
}
function reset() {
  store().accumulators.clear();
}
function metric(covered, total) {
  return {
    covered,
    total,
    pct: total === 0 ? 100 : Math.round(covered / total * 1e4) / 100
  };
}
function addMetric(into, part) {
  into.covered += part.covered;
  into.total += part.total;
}
function report(options = {}) {
  const files = [];
  const totals = {
    lines: metric(0, 0),
    functions: metric(0, 0),
    branches: metric(0, 0)
  };
  const selected = [...store().accumulators.values()].filter((acc) => options.filter ? options.filter(acc.path) : true).sort((a, b) => a.path.localeCompare(b.path));
  for (const acc of selected) {
    const lineEntries = [...acc.lines.entries()].sort((a, b) => a[0] - b[0]);
    const lines = {};
    const uncoveredLines = [];
    let coveredLines = 0;
    for (const [line, hits] of lineEntries) {
      lines[line] = hits;
      if (hits > 0) coveredLines += 1;
      else uncoveredLines.push(line);
    }
    const functions = [...acc.functions.values()].sort(
      (a, b) => a.line - b.line || a.column - b.column
    );
    const branches = [...acc.branches.values()].sort(
      (a, b) => a.line - b.line || a.column - b.column
    );
    const armTotal = branches.reduce((n, b) => n + b.arms.length, 0);
    const armCovered = branches.reduce((n, b) => n + b.arms.filter((h) => h > 0).length, 0);
    const summary = {
      lines: metric(coveredLines, lineEntries.length),
      functions: metric(functions.filter((f) => f.hits > 0).length, functions.length),
      branches: metric(armCovered, armTotal)
    };
    addMetric(totals.lines, summary.lines);
    addMetric(totals.functions, summary.functions);
    addMetric(totals.branches, summary.branches);
    files.push({
      path: acc.path,
      lines,
      uncoveredLines,
      functions: functions.map((f) => ({ ...f })),
      branches: branches.map((b) => ({ ...b, arms: [...b.arms] })),
      summary
    });
  }
  return {
    files,
    summary: {
      lines: metric(totals.lines.covered, totals.lines.total),
      functions: metric(totals.functions.covered, totals.functions.total),
      branches: metric(totals.branches.covered, totals.branches.total)
    },
    version: 1
  };
}
function merge(reports, options = {}) {
  const { accumulators } = store();
  const previous = new Map(accumulators);
  accumulators.clear();
  try {
    for (const input of reports) {
      for (const file of input.files) {
        const acc = accumulatorFor(file.path);
        for (const [line, hits] of Object.entries(file.lines)) {
          const n = Number(line);
          acc.lines.set(n, (acc.lines.get(n) ?? 0) + hits);
        }
        for (const fn of file.functions) {
          const k = key(fn.line, fn.column);
          const existing = acc.functions.get(k);
          if (existing) existing.hits += fn.hits;
          else acc.functions.set(k, { ...fn });
        }
        for (const branch of file.branches) {
          const k = key(branch.line, branch.column);
          const existing = acc.branches.get(k);
          if (existing) {
            for (let i = 0; i < branch.arms.length; i += 1) {
              existing.arms[i] = (existing.arms[i] ?? 0) + branch.arms[i];
            }
          } else {
            acc.branches.set(k, { ...branch, arms: [...branch.arms] });
          }
        }
      }
    }
    return report(options);
  } finally {
    accumulators.clear();
    for (const [path, acc] of previous) accumulators.set(path, acc);
  }
}
function toLcov(input = report()) {
  const out = [];
  for (const file of input.files) {
    out.push("TN:");
    out.push(`SF:${file.path}`);
    const names = /* @__PURE__ */ new Map();
    for (const fn of file.functions) {
      const k = key(fn.line, fn.column);
      const unique = `${fn.name}:${fn.line}`;
      names.set(k, unique);
      out.push(`FN:${fn.line},${unique}`);
    }
    for (const fn of file.functions) {
      out.push(`FNDA:${fn.hits},${names.get(key(fn.line, fn.column))}`);
    }
    out.push(`FNF:${file.summary.functions.total}`);
    out.push(`FNH:${file.summary.functions.covered}`);
    let block = 0;
    for (const branch of file.branches) {
      for (let i = 0; i < branch.arms.length; i += 1) {
        const hits = branch.arms[i];
        out.push(`BRDA:${branch.line},${block},${i},${hits === 0 ? "-" : hits}`);
      }
      block += 1;
    }
    out.push(`BRF:${file.summary.branches.total}`);
    out.push(`BRH:${file.summary.branches.covered}`);
    for (const [line, hits] of Object.entries(file.lines)) out.push(`DA:${line},${hits}`);
    out.push(`LF:${file.summary.lines.total}`);
    out.push(`LH:${file.summary.lines.covered}`);
    out.push("end_of_record");
  }
  return out.length > 0 ? `${out.join("\n")}
` : "";
}
const coverage = {
  start,
  stop,
  reset,
  isEnabled,
  report,
  merge,
  toLcov,
  formatSummary
};
function formatSummary(input = report()) {
  const rows = input.files.map((file) => ({
    name: file.path.split("/").slice(-2).join("/"),
    lines: `${file.summary.lines.pct.toFixed(2)}% (${file.summary.lines.covered}/${file.summary.lines.total})`,
    functions: `${file.summary.functions.pct.toFixed(2)}%`,
    branches: `${file.summary.branches.pct.toFixed(2)}%`,
    uncovered: file.uncoveredLines.slice(0, 12).join(",") + (file.uncoveredLines.length > 12 ? ",…" : "")
  }));
  const width = Math.max(4, ...rows.map((r) => r.name.length));
  const header = `${"file".padEnd(width)}  lines                 funcs    branch   uncovered lines`;
  const body = rows.map(
    (r) => `${r.name.padEnd(width)}  ${r.lines.padEnd(20)}  ${r.functions.padEnd(7)}  ${r.branches.padEnd(7)}  ${r.uncovered}`
  );
  const s = input.summary;
  const footer = `ALL: lines ${s.lines.pct.toFixed(2)}% (${s.lines.covered}/${s.lines.total}) · functions ${s.functions.pct.toFixed(2)}% (${s.functions.covered}/${s.functions.total}) · branches ${s.branches.pct.toFixed(2)}% (${s.branches.covered}/${s.branches.total})`;
  return [header, ...body, "", footer].join("\n");
}
export {
  INLINE_SOURCE_PATH,
  coverage,
  formatSummary,
  isEnabled,
  merge,
  recordBranch,
  recordFunction,
  recordLine,
  registerProgram,
  report,
  reset,
  start,
  stop,
  toLcov
};
//# sourceMappingURL=coverage.js.map
