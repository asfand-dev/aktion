var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key2, value) => key2 in obj ? __defProp(obj, key2, { enumerable: true, configurable: true, writable: true, value }) : obj[key2] = value;
var __publicField = (obj, key2, value) => __defNormalProp(obj, typeof key2 !== "symbol" ? key2 + "" : key2, value);
const HOOK_KEY = "__AKTION_DEVTOOLS_HOOK__";
const DEVTOOLS_PROTOCOL_VERSION = 3;
const DEFAULT_OPTIONS = {
  captureProps: true,
  tagDom: true,
  captureSnapshots: true,
  captureNetwork: true,
  measureDom: true
};
function hookGlobal() {
  return globalThis;
}
function getDevtoolsHook() {
  return hookGlobal()[HOOK_KEY];
}
function isDevtoolsActive() {
  const hook = getDevtoolsHook();
  return hook !== void 0 && hook.active;
}
function devtoolsOption(key2) {
  const hook = getDevtoolsHook();
  if (hook === void 0 || !hook.active) return false;
  return hook.options[key2];
}
function installDevtoolsHook(libraryVersion) {
  const existing = getDevtoolsHook();
  if (existing) {
    if (libraryVersion) existing.libraryVersion = libraryVersion;
    return existing;
  }
  const eventListeners = /* @__PURE__ */ new Set();
  const appListeners = /* @__PURE__ */ new Set();
  const apps = /* @__PURE__ */ new Map();
  const buffer = [];
  const options = { ...DEFAULT_OPTIONS };
  const hook = {
    aktion: true,
    protocolVersion: DEVTOOLS_PROTOCOL_VERSION,
    libraryVersion: libraryVersion ?? "unknown",
    apps,
    buffer,
    bufferLimit: 2e3,
    options,
    get active() {
      return eventListeners.size > 0 || appListeners.size > 0;
    },
    setOptions(patch2) {
      for (const [key2, value] of Object.entries(patch2)) {
        if (typeof value === "boolean" && key2 in options) {
          options[key2] = value;
        }
      }
    },
    emit(event) {
      buffer.push(event);
      if (buffer.length > hook.bufferLimit) {
        buffer.splice(0, buffer.length - hook.bufferLimit);
      }
      for (const listener of [...eventListeners]) {
        try {
          listener(event);
        } catch (err) {
          console.error("[aktion-devtools] event listener threw", err);
        }
      }
    },
    registerApp(app) {
      apps.set(app.id, app);
      for (const listener of [...appListeners]) {
        try {
          listener("register", app);
        } catch (err) {
          console.error("[aktion-devtools] app listener threw", err);
        }
      }
    },
    unregisterApp(id) {
      const app = apps.get(id);
      if (!app) return;
      apps.delete(id);
      for (const listener of [...appListeners]) {
        try {
          listener("unregister", app);
        } catch (err) {
          console.error("[aktion-devtools] app listener threw", err);
        }
      }
    },
    subscribe(listener) {
      eventListeners.add(listener);
      return () => eventListeners.delete(listener);
    },
    subscribeApps(listener) {
      appListeners.add(listener);
      return () => appListeners.delete(listener);
    },
    clearBuffer() {
      buffer.length = 0;
    }
  };
  hookGlobal()[HOOK_KEY] = hook;
  return hook;
}
const PREVIEW_LIMIT = 120;
const JSON_LIMIT = 2e4;
const DEPTH_LIMIT = 6;
const BREADTH_LIMIT = 200;
function valueKind(value) {
  if (value === null) return "null";
  if (value === void 0) return "undefined";
  if (Array.isArray(value)) return "array";
  const t = typeof value;
  if (t !== "object") return t;
  const rec = value;
  if (rec.__kind === "Store") return "store";
  if (typeof rec.refetch === "function" && "state" in rec && "loading" in rec) return "resource";
  if (typeof rec.send === "function" && "connected" in rec) return "socket";
  if (typeof Node !== "undefined" && value instanceof Node) return "node";
  if (value instanceof Date) return "date";
  if (value instanceof Map) return "map";
  if (value instanceof Set) return "set";
  if (value instanceof RegExp) return "regexp";
  if (value instanceof Error) return "error";
  return "object";
}
function truncate(text2, limit = PREVIEW_LIMIT) {
  if (text2.length <= limit) return text2;
  return `${text2.slice(0, limit)}…`;
}
function previewOf(value) {
  const kind = valueKind(value);
  try {
    switch (kind) {
      case "string":
        return truncate(JSON.stringify(value) ?? '""');
      case "number":
      case "boolean":
        return String(value);
      case "null":
        return "null";
      case "undefined":
        return "undefined";
      case "function": {
        const name = value.name;
        return name ? `ƒ ${name}()` : "ƒ ()";
      }
      case "symbol":
        return String(value);
      case "bigint":
        return `${String(value)}n`;
      case "date":
        return value.toISOString();
      case "regexp":
        return String(value);
      case "error":
        return `${value.name}: ${value.message}`;
      case "node": {
        const el = value;
        return `<${(el.tagName ?? "node").toLowerCase()}>`;
      }
      case "map":
        return `Map(${value.size})`;
      case "set":
        return `Set(${value.size})`;
      case "array": {
        const arr = value;
        if (arr.length === 0) return "[]";
        const head = arr.slice(0, 3).map((v) => shortPreview$1(v)).join(", ");
        return truncate(`[${head}${arr.length > 3 ? `, …${arr.length - 3} more` : ""}]`);
      }
      case "store": {
        const methods = Object.keys(value.__methods ?? {});
        return `Store { ${methods.slice(0, 3).join(", ")}${methods.length > 3 ? ", …" : ""} }`;
      }
      case "resource": {
        const res = value;
        return `Resource(${String(res.state ?? "?")}${res.status != null ? ` ${String(res.status)}` : ""})`;
      }
      case "socket": {
        const sock = value;
        return `Socket(${String(sock.status ?? "?")})`;
      }
      default: {
        const keys2 = safeKeys(value);
        if (keys2.length === 0) return "{}";
        const head = keys2.slice(0, 4).join(", ");
        return truncate(`{ ${head}${keys2.length > 4 ? ", …" : ""} }`);
      }
    }
  } catch {
    return "<unreadable>";
  }
}
function shortPreview$1(value) {
  const kind = valueKind(value);
  switch (kind) {
    case "string":
      return truncate(JSON.stringify(value) ?? '""', 24);
    case "array":
      return `Array(${value.length})`;
    case "object":
      return "{…}";
    case "function":
      return "ƒ";
    default:
      return truncate(String(value), 24);
  }
}
function safeKeys(value) {
  try {
    return Object.keys(value);
  } catch {
    return [];
  }
}
function toPlain(value, depth, seen) {
  const kind = valueKind(value);
  switch (kind) {
    case "string":
    case "number":
    case "boolean":
    case "null":
      return value;
    case "undefined":
      return "[undefined]";
    case "function": {
      const name = value.name;
      return name ? `[Function ${name}]` : "[Function]";
    }
    case "symbol":
      return String(value);
    case "bigint":
      return `${String(value)}n`;
    case "date":
      return value.toISOString();
    case "regexp":
      return String(value);
    case "error":
      return `[${value.name}: ${value.message}]`;
    case "node":
      return `[Node <${(value.tagName ?? "node").toLowerCase()}>]`;
    case "store":
      return `[Store]`;
    case "resource":
      return `[Resource]`;
    case "socket":
      return `[Socket]`;
    case "map": {
      const out = {};
      let i = 0;
      for (const [k, v] of value) {
        if (i++ >= BREADTH_LIMIT) {
          out["…"] = `${value.size - BREADTH_LIMIT} more`;
          break;
        }
        out[String(k)] = depth >= DEPTH_LIMIT ? previewOf(v) : toPlain(v, depth + 1, seen);
      }
      return out;
    }
    case "set": {
      const arr = [];
      let i = 0;
      for (const v of value) {
        if (i++ >= BREADTH_LIMIT) {
          arr.push(`…${value.size - BREADTH_LIMIT} more`);
          break;
        }
        arr.push(depth >= DEPTH_LIMIT ? previewOf(v) : toPlain(v, depth + 1, seen));
      }
      return arr;
    }
    case "array": {
      const arr = value;
      if (seen.has(arr)) return "[Circular]";
      if (depth >= DEPTH_LIMIT) return `[Array(${arr.length})]`;
      seen.add(arr);
      try {
        const out = arr.slice(0, BREADTH_LIMIT).map((v) => toPlain(v, depth + 1, seen));
        if (arr.length > BREADTH_LIMIT) out.push(`…${arr.length - BREADTH_LIMIT} more`);
        return out;
      } finally {
        seen.delete(arr);
      }
    }
    default: {
      const obj = value;
      if (seen.has(obj)) return "[Circular]";
      if (depth >= DEPTH_LIMIT) return previewOf(obj);
      seen.add(obj);
      try {
        const out = {};
        const keys2 = safeKeys(obj);
        for (const key2 of keys2.slice(0, BREADTH_LIMIT)) {
          let entry;
          try {
            entry = obj[key2];
          } catch {
            entry = "[getter threw]";
          }
          out[key2] = toPlain(entry, depth + 1, seen);
        }
        if (keys2.length > BREADTH_LIMIT) out["…"] = `${keys2.length - BREADTH_LIMIT} more`;
        return out;
      } finally {
        seen.delete(obj);
      }
    }
  }
}
function toJsonText(value, indent = 2) {
  const kind = valueKind(value);
  if (kind === "function" || kind === "node" || kind === "resource" || kind === "socket" || kind === "symbol") {
    return null;
  }
  try {
    const plain = toPlain(value, 0, /* @__PURE__ */ new WeakSet());
    const text2 = JSON.stringify(plain, null, indent);
    if (text2 === void 0) return null;
    if (text2.length > JSON_LIMIT) return null;
    return text2;
  } catch {
    return null;
  }
}
function toDevtoolsValue(value) {
  const type = valueKind(value);
  const out = { type, preview: previewOf(value) };
  const json = toJsonText(value, 0);
  if (json !== null) out.json = json;
  if (type === "array") out.size = value.length;
  else if (type === "object") out.size = safeKeys(value).length;
  else if (type === "string") out.size = value.length;
  return out;
}
function parseEditedValue(raw) {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  if (trimmed === "undefined") return void 0;
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}
function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`);
}
function ruleMatches(rule, method, url) {
  if (!rule.enabled) return false;
  if (rule.method && rule.method.toUpperCase() !== method.toUpperCase()) return false;
  const pattern = rule.pattern.trim();
  if (pattern === "" || pattern === "*") return true;
  if (pattern.includes("*")) {
    try {
      return globToRegExp(pattern).test(url);
    } catch {
      return false;
    }
  }
  return url.includes(pattern);
}
function findMatchingRule(rules, method, url, random = Math.random) {
  for (const rule of rules) {
    if (!ruleMatches(rule, method, url)) continue;
    const p = rule.probability;
    if (typeof p === "number" && Number.isFinite(p) && p < 1 && random() >= Math.max(0, p)) continue;
    return rule;
  }
  return null;
}
function verdictFor(rule) {
  const label = rule.label || rule.pattern || rule.action;
  switch (rule.action) {
    case "delay":
      return { delayMs: Math.max(0, rule.delayMs ?? 0), rule: label };
    case "fail":
      return { error: rule.message || `blocked by DevTools rule "${label}"`, rule: label, delayMs: rule.delayMs };
    case "offline":
      return { error: rule.message || "Failed to fetch (DevTools offline mode)", rule: label, delayMs: rule.delayMs };
    case "mock": {
      let body = rule.body ?? "";
      if (typeof rule.body === "string" && rule.body.trim() !== "") {
        try {
          body = JSON.parse(rule.body);
        } catch {
          body = rule.body;
        }
      }
      const headers = { "content-type": "application/json", ...rule.headers ?? {} };
      return {
        response: { status: rule.status ?? 200, headers, body },
        rule: label,
        delayMs: rule.delayMs
      };
    }
    default:
      return { rule: label };
  }
}
function newRule(seed = {}) {
  return {
    id: `rule-${Math.random().toString(36).slice(2, 9)}`,
    pattern: "",
    enabled: true,
    action: "delay",
    delayMs: 0,
    status: 200,
    body: "",
    ...seed
  };
}
const SEGMENT_STARTS = /* @__PURE__ */ new Set(["/", ">", "#"]);
function parentKeyOf(key2, keys2) {
  for (let i = key2.length - 1; i > 0; i -= 1) {
    if (!SEGMENT_STARTS.has(key2[i])) continue;
    const candidate = key2.slice(0, i);
    if (candidate !== key2 && keys2.has(candidate)) return candidate;
  }
  return null;
}
function ancestorKeyCandidates(key2) {
  const out = [];
  for (let i = 1; i < key2.length; i += 1) {
    if (SEGMENT_STARTS.has(key2[i])) out.push(key2.slice(0, i));
  }
  return out;
}
function ancestorsOf(key2, keys2) {
  const out = [];
  let current = parentKeyOf(key2, keys2);
  let guard = 0;
  while (current !== null && guard++ < 200) {
    out.push(current);
    current = parentKeyOf(current, keys2);
  }
  return out.reverse();
}
function componentNameFromKey(key2) {
  const hash2 = key2.lastIndexOf("#");
  if (hash2 < 0) return key2;
  const tail = key2.slice(hash2 + 1);
  const cut = tail.search(/[@=/>]/);
  return cut < 0 ? tail : tail.slice(0, cut);
}
function shortInstanceLabel(key2) {
  const hash2 = key2.lastIndexOf("#");
  return hash2 < 0 ? key2 : key2.slice(hash2 + 1);
}
function buildInstanceTree(records) {
  const byKey = /* @__PURE__ */ new Map();
  const counts = /* @__PURE__ */ new Map();
  for (const record of records) {
    byKey.set(record.instanceKey, record);
    counts.set(record.instanceKey, (counts.get(record.instanceKey) ?? 0) + 1);
  }
  const keys2 = new Set(byKey.keys());
  const depthCache = /* @__PURE__ */ new Map();
  const depthOf = (key2) => {
    const cached = depthCache.get(key2);
    if (cached !== void 0) return cached;
    const parent = parentKeyOf(key2, keys2);
    const depth = parent === null ? 0 : depthOf(parent) + 1;
    depthCache.set(key2, depth);
    return depth;
  };
  const nodes = [];
  for (const [key2, record] of byKey) {
    nodes.push({
      instanceKey: key2,
      name: record.name,
      kind: record.kind,
      parentKey: parentKeyOf(key2, keys2),
      depth: depthOf(key2),
      phase: record.phase,
      selfTime: record.selfTime,
      source: record.source,
      explicitKey: record.explicitKey,
      propCount: record.props?.length ?? 0,
      renders: counts.get(key2) ?? 1
    });
  }
  return sortTree(nodes);
}
function sortTree(nodes) {
  const children = /* @__PURE__ */ new Map();
  for (const node of nodes) {
    const bucket = children.get(node.parentKey);
    if (bucket) bucket.push(node);
    else children.set(node.parentKey, [node]);
  }
  const out = [];
  const visit = (parent) => {
    for (const node of children.get(parent) ?? []) {
      out.push(node);
      visit(node.instanceKey);
    }
  };
  visit(null);
  if (out.length < nodes.length) {
    const seen = new Set(out.map((n) => n.instanceKey));
    for (const node of nodes) {
      if (!seen.has(node.instanceKey)) out.push(node);
    }
  }
  return out;
}
function descendantsOf(key2, nodes) {
  const out = [];
  for (const node of nodes) {
    if (node.instanceKey !== key2 && node.instanceKey.startsWith(key2)) {
      const next = node.instanceKey[key2.length];
      if (next !== void 0 && SEGMENT_STARTS.has(next)) out.push(node.instanceKey);
    }
  }
  return out;
}
const CAPS = {
  commits: 300,
  effects: 600,
  network: 300,
  routes: 200,
  emits: 200,
  logs: 500,
  errors: 200,
  /** State snapshots retained for time travel. */
  history: 60,
  /** Changes remembered per atom for the change log. */
  atomLog: 60
};
function emptyModel() {
  return {
    commits: [],
    effects: [],
    network: [],
    routes: [],
    emits: [],
    logs: [],
    errors: [],
    state: {},
    changed: /* @__PURE__ */ new Map(),
    changeCounts: /* @__PURE__ */ new Map(),
    history: [],
    programHistory: [],
    longTasks: [],
    firstTime: null,
    lastTime: 0,
    rev: 0,
    revs: { commit: 0, state: 0, effect: 0, network: 0, route: 0, emit: 0, log: 0, error: 0 },
    atomLog: /* @__PURE__ */ new Map(),
    renderCounts: /* @__PURE__ */ new Map(),
    totals: {
      commits: 0,
      effects: 0,
      network: 0,
      routes: 0,
      emits: 0,
      logs: 0,
      errors: 0,
      stateFlushes: 0
    }
  };
}
function rootOf(path) {
  const dot = path.indexOf(".");
  return dot < 0 ? path : path.slice(0, dot);
}
function eventTime(event) {
  switch (event.kind) {
    case "commit":
      return event.startTime;
    default:
      return event.time;
  }
}
function cap(list, limit) {
  if (list.length > limit) list.splice(0, list.length - limit);
}
function ingest(model, event, fromBuffer = false) {
  const time = eventTime(event);
  if (model.firstTime === null || time < model.firstTime) model.firstTime = time;
  if (time > model.lastTime) model.lastTime = time;
  model.rev += 1;
  model.revs[event.kind] += 1;
  switch (event.kind) {
    case "commit":
      ingestCommit(model, event);
      break;
    case "state":
      ingestState(model, event, fromBuffer);
      break;
    case "effect":
      model.effects.push(event);
      model.totals.effects += 1;
      cap(model.effects, CAPS.effects);
      break;
    case "network":
      ingestNetwork(model, event);
      break;
    case "route":
      model.routes.push(event);
      model.totals.routes += 1;
      cap(model.routes, CAPS.routes);
      break;
    case "emit":
      model.emits.push(event);
      model.totals.emits += 1;
      cap(model.emits, CAPS.emits);
      break;
    case "log":
      ingestLog(model, {
        level: event.level,
        text: event.args.join(" "),
        args: event.args,
        origin: event.origin,
        time: event.time,
        count: event.count ?? 1
      });
      break;
    case "error":
      model.errors.push(event);
      model.totals.errors += 1;
      cap(model.errors, CAPS.errors);
      break;
  }
}
function ingestCommit(model, event) {
  model.commits.push(event);
  model.totals.commits += 1;
  cap(model.commits, CAPS.commits);
  for (const record of event.components) {
    if (record.phase === "memo") continue;
    model.renderCounts.set(record.instanceKey, (model.renderCounts.get(record.instanceKey) ?? 0) + 1);
  }
  if (event.snapshot && !model.suspendHistory) {
    model.history.push({
      commitId: event.commitId,
      time: event.startTime,
      changedPaths: event.changedPaths,
      snapshot: event.snapshot
    });
    cap(model.history, CAPS.history);
  }
}
const LOG_VALUE_LIMIT = 4e3;
function smallEnough(value) {
  if (value === null || typeof value !== "object") return true;
  try {
    return (JSON.stringify(value)?.length ?? 0) <= LOG_VALUE_LIMIT;
  } catch {
    return false;
  }
}
function ingestState(model, event, fromBuffer) {
  const previous = model.state;
  model.state = event.snapshot;
  model.totals.stateFlushes += 1;
  const byRoot = /* @__PURE__ */ new Map();
  for (const path of event.changedPaths) {
    const root = rootOf(path);
    const bucket = byRoot.get(root);
    if (bucket) bucket.push(path);
    else byRoot.set(root, [path]);
  }
  for (const [root, paths] of byRoot) {
    const before = previous[root];
    const after = event.snapshot[root];
    const change = { time: event.time, paths, before: previewOf(before), after: previewOf(after) };
    if (smallEnough(before) && smallEnough(after)) {
      change.beforeValue = before;
      change.afterValue = after;
    }
    let log = model.atomLog.get(root);
    if (!log) {
      log = [];
      model.atomLog.set(root, log);
    }
    log.push(change);
    cap(log, CAPS.atomLog);
  }
  for (const path of event.changedPaths) {
    const root = rootOf(path);
    if (!fromBuffer) model.changed.set(root, event.time);
    model.changeCounts.set(root, (model.changeCounts.get(root) ?? 0) + 1);
  }
}
function ingestNetwork(model, event) {
  if (event.phase === "start") {
    model.network.push({
      requestId: event.requestId,
      method: event.method,
      url: event.url,
      phase: "pending",
      startTime: event.time,
      requestHeaders: event.requestHeaders,
      requestBody: event.requestBody
    });
    model.totals.network += 1;
    cap(model.network, CAPS.network);
    return;
  }
  const existing = model.network.find((r) => r.requestId === event.requestId);
  const target = existing ?? {
    requestId: event.requestId,
    method: event.method,
    url: event.url,
    phase: "pending",
    startTime: event.time - (event.duration ?? 0)
  };
  target.phase = event.phase;
  target.endTime = event.time;
  target.duration = event.duration;
  target.status = event.status;
  target.responseHeaders = event.responseHeaders;
  target.responseBody = event.responseBody;
  target.responseSize = event.responseSize;
  target.error = event.error;
  target.rule = event.rule;
  target.injectedDelay = event.injectedDelay;
  if (!existing) {
    model.network.push(target);
    model.totals.network += 1;
    cap(model.network, CAPS.network);
  }
}
function ingestLog(model, entry) {
  const last = model.logs[model.logs.length - 1];
  model.totals.logs += 1;
  model.rev += 1;
  model.revs.log += 1;
  if (last && last.level === entry.level && last.text === entry.text && last.origin === entry.origin) {
    last.count += entry.count;
    last.time = entry.time;
    return;
  }
  model.logs.push(entry);
  cap(model.logs, CAPS.logs);
}
function clearModel(model) {
  model.commits.length = 0;
  model.effects.length = 0;
  model.network.length = 0;
  model.routes.length = 0;
  model.emits.length = 0;
  model.logs.length = 0;
  model.errors.length = 0;
  model.history.length = 0;
  model.longTasks.length = 0;
  model.changed.clear();
  model.changeCounts.clear();
  model.atomLog.clear();
  model.renderCounts.clear();
  model.firstTime = null;
  model.lastTime = 0;
  model.rev += 1;
  for (const key2 of Object.keys(model.revs)) model.revs[key2] += 1;
}
function componentAggregates(commits) {
  const aggs = /* @__PURE__ */ new Map();
  for (const commit of commits) {
    for (const record of commit.components) {
      let agg = aggs.get(record.name);
      if (!agg) {
        agg = { name: record.name, kind: record.kind, renders: 0, memo: 0, total: 0, max: 0, instances: 0, keys: /* @__PURE__ */ new Set() };
        aggs.set(record.name, agg);
      }
      agg.keys.add(record.instanceKey);
      if (record.phase === "memo") agg.memo += 1;
      else {
        agg.renders += 1;
        agg.total += record.selfTime;
        if (record.selfTime > agg.max) agg.max = record.selfTime;
      }
    }
  }
  return [...aggs.values()].map(({ keys: keys2, ...agg }) => ({ ...agg, instances: keys2.size }));
}
function instanceAggregates(commits) {
  const out = /* @__PURE__ */ new Map();
  for (const commit of commits) {
    for (const record of commit.components) {
      let agg = out.get(record.instanceKey);
      if (!agg) {
        agg = { renders: 0, memo: 0, total: 0, max: 0 };
        out.set(record.instanceKey, agg);
      }
      agg.last = record;
      if (record.phase === "memo") agg.memo += 1;
      else {
        agg.renders += 1;
        agg.total += record.selfTime;
        if (record.selfTime > agg.max) agg.max = record.selfTime;
      }
    }
  }
  return out;
}
function hotAtoms(commits, limit = 10) {
  const counts = /* @__PURE__ */ new Map();
  for (const commit of commits) {
    for (const path of commit.changedPaths) {
      counts.set(path, (counts.get(path) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}
function effectAggregates(events) {
  const aggs = /* @__PURE__ */ new Map();
  for (const event of events) {
    let agg = aggs.get(event.effectKey);
    if (!agg) {
      agg = {
        effectKey: event.effectKey,
        label: event.label,
        triggers: event.triggers,
        instanceKey: event.instanceKey,
        mounts: 0,
        runs: 0,
        cleanups: 0,
        errors: 0,
        total: 0,
        max: 0,
        lastReason: event.reason,
        lastTime: event.time
      };
      aggs.set(event.effectKey, agg);
    }
    agg.lastTime = event.time;
    switch (event.phase) {
      case "mount":
        agg.mounts += 1;
        break;
      case "run":
        agg.runs += 1;
        agg.total += event.duration ?? 0;
        if ((event.duration ?? 0) > agg.max) agg.max = event.duration ?? 0;
        agg.lastReason = event.reason;
        break;
      case "cleanup":
        agg.cleanups += 1;
        break;
      case "error":
        agg.errors += 1;
        break;
    }
  }
  return [...aggs.values()];
}
function networkStats(requests) {
  let pending = 0, failed = 0, mocked = 0, bytes = 0, durationSum = 0, durationCount = 0;
  let slowest = null;
  for (const request of requests) {
    if (request.phase === "pending") pending += 1;
    if (request.phase === "error" || request.phase === "blocked" || (request.status ?? 0) >= 400) failed += 1;
    if (request.phase === "mock") mocked += 1;
    bytes += request.responseSize ?? 0;
    if (request.duration !== void 0) {
      durationSum += request.duration;
      durationCount += 1;
      if (!slowest || request.duration > (slowest.duration ?? 0)) slowest = request;
    }
  }
  return {
    total: requests.length,
    pending,
    failed,
    mocked,
    bytes,
    avgDuration: durationCount > 0 ? durationSum / durationCount : 0,
    slowest
  };
}
function buildTimeline(model, kinds) {
  const out = [];
  if (kinds.has("commit")) {
    for (const commit of model.commits) {
      out.push({
        kind: "commit",
        time: commit.startTime,
        label: `commit #${commit.commitId}`,
        detail: commit.initial ? "initial mount" : commit.changedPaths.length > 0 ? commit.changedPaths.join(", ") : "forced",
        tone: commit.fullRender ? "amber" : "blue",
        duration: commit.duration,
        ref: String(commit.commitId)
      });
    }
  }
  if (kinds.has("effect")) {
    for (const effect of model.effects) {
      out.push({
        kind: "effect",
        time: effect.time,
        label: effect.label,
        detail: `${effect.phase} · ${effect.reason}`,
        tone: effect.phase === "error" ? "red" : effect.phase === "run" ? "green" : "grey",
        duration: effect.duration,
        ref: effect.effectKey
      });
    }
  }
  if (kinds.has("network")) {
    for (const request of model.network) {
      out.push({
        kind: "network",
        time: request.startTime,
        label: `${request.method} ${urlTail(request.url)}`,
        detail: request.phase === "pending" ? "pending" : `${request.status ?? request.phase}${request.duration !== void 0 ? ` · ${Math.round(request.duration)}ms` : ""}`,
        tone: request.phase === "error" || request.phase === "blocked" ? "red" : request.phase === "mock" ? "purple" : "cyan",
        duration: request.duration,
        ref: request.requestId
      });
    }
  }
  if (kinds.has("route")) {
    for (const route of model.routes) {
      out.push({
        kind: "route",
        time: route.time,
        label: `→ ${route.to}`,
        detail: route.pattern ? `matched ${route.pattern}` : "no match",
        tone: "purple",
        ref: route.to
      });
    }
  }
  if (kinds.has("emit")) {
    for (const emitted of model.emits) {
      out.push({
        kind: "emit",
        time: emitted.time,
        label: `emit ${emitted.name}`,
        detail: emitted.detail.preview,
        tone: "green",
        ref: emitted.name
      });
    }
  }
  if (kinds.has("log")) {
    for (const log of model.logs) {
      out.push({
        kind: "log",
        time: log.time,
        label: log.level,
        detail: log.count > 1 ? `${log.text} ×${log.count}` : log.text,
        tone: log.level === "error" ? "red" : log.level === "warn" ? "amber" : "grey"
      });
    }
  }
  if (kinds.has("error")) {
    for (const error of model.errors) {
      out.push({
        kind: "error",
        time: error.time,
        label: `${error.phase} error`,
        detail: error.message,
        tone: "red",
        ref: error.subject
      });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}
function urlTail(url) {
  const withoutQuery = url.split("?")[0] ?? url;
  const parts = withoutQuery.split("/").filter(Boolean);
  return parts.length > 0 ? `/${parts[parts.length - 1]}` : url;
}
const ZERO_SIDES = { top: 0, right: 0, bottom: 0, left: 0 };
function px(style, prop) {
  const value = Number.parseFloat(style.getPropertyValue(prop));
  return Number.isFinite(value) ? value : 0;
}
function sides(style, prefix, suffix = "") {
  return {
    top: px(style, `${prefix}-top${suffix}`),
    right: px(style, `${prefix}-right${suffix}`),
    bottom: px(style, `${prefix}-bottom${suffix}`),
    left: px(style, `${prefix}-left${suffix}`)
  };
}
function measureBox(element) {
  if (typeof getComputedStyle !== "function" || typeof element.getBoundingClientRect !== "function") return null;
  const rect = element.getBoundingClientRect();
  let style;
  try {
    style = getComputedStyle(element);
  } catch {
    return {
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      margin: { ...ZERO_SIDES },
      border: { ...ZERO_SIDES },
      padding: { ...ZERO_SIDES },
      content: { width: rect.width, height: rect.height }
    };
  }
  const margin = sides(style, "margin");
  const border = sides(style, "border", "-width");
  const padding = sides(style, "padding");
  return {
    rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    margin,
    border,
    padding,
    content: {
      width: Math.max(0, rect.width - border.left - border.right - padding.left - padding.right),
      height: Math.max(0, rect.height - border.top - border.bottom - padding.top - padding.bottom)
    }
  };
}
function describeElement(element) {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const classes = typeof element.className === "string" && element.className.trim() !== "" ? `.${element.className.trim().split(/\s+/).slice(0, 3).join(".")}` : "";
  return `${tag}${id}${classes}`;
}
function cssPath(element, root) {
  const parts = [];
  let current = element;
  let guard = 0;
  while (current && current !== root && guard++ < 30) {
    let part = current.tagName.toLowerCase();
    if (current.id) {
      parts.unshift(`#${current.id}`);
      break;
    }
    const parent = current.parentElement;
    if (parent) {
      const sameTag = [...parent.children].filter((c) => c.tagName === current.tagName);
      if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    current = parent;
  }
  return parts.join(" > ");
}
const COMPUTED_GROUPS = [
  { title: "Layout", props: ["display", "position", "top", "right", "bottom", "left", "z-index", "float", "clear", "overflow", "box-sizing"] },
  { title: "Flex / Grid", props: ["flex-direction", "flex-wrap", "flex", "align-items", "justify-content", "gap", "grid-template-columns", "grid-template-rows", "grid-area"] },
  { title: "Box", props: ["width", "height", "min-width", "min-height", "max-width", "max-height", "margin", "padding", "border", "border-radius"] },
  { title: "Type", props: ["font-family", "font-size", "font-weight", "line-height", "letter-spacing", "text-align", "text-transform", "white-space", "color"] },
  { title: "Paint", props: ["background-color", "background-image", "opacity", "box-shadow", "filter", "mix-blend-mode", "visibility"] },
  { title: "Interaction", props: ["cursor", "pointer-events", "user-select", "touch-action", "transition", "transform", "animation"] }
];
function computedGroup(element, props) {
  if (typeof getComputedStyle !== "function") return [];
  let style;
  try {
    style = getComputedStyle(element);
  } catch {
    return [];
  }
  const out = [];
  for (const prop of props) {
    const value = style.getPropertyValue(prop).trim();
    if (value === "" || value === "none" || value === "normal" || value === "auto" || value === "0px") continue;
    out.push([prop, value]);
  }
  return out;
}
function cssVariables(element, prefix = "--rui-") {
  if (typeof getComputedStyle !== "function") return [];
  const seen = /* @__PURE__ */ new Map();
  let current = element;
  let guard = 0;
  while (current && guard++ < 40) {
    let style = null;
    try {
      style = getComputedStyle(current);
    } catch {
      style = null;
    }
    if (style) {
      for (let i = 0; i < style.length; i += 1) {
        const name = style.item(i);
        if (!name.startsWith(prefix)) continue;
        if (!seen.has(name)) seen.set(name, style.getPropertyValue(name).trim());
      }
    }
    const parent = current.parentElement;
    current = parent ?? (current.getRootNode().host ?? null);
  }
  return [...seen.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}
function a11ySummary(element) {
  const out = [];
  const role = element.getAttribute("role") ?? implicitRole(element);
  if (role) out.push(["role", role]);
  const name = accessibleName(element);
  if (name) out.push(["name", name]);
  for (const attr of ["aria-label", "aria-labelledby", "aria-describedby", "aria-expanded", "aria-selected", "aria-checked", "aria-disabled", "aria-hidden", "aria-live", "aria-current", "tabindex", "title", "alt", "for", "id"]) {
    const value = element.getAttribute(attr);
    if (value !== null) out.push([attr, value]);
  }
  if (element instanceof HTMLElement && element.tagName === "INPUT") {
    const input = element;
    out.push(["type", input.type]);
    if (input.required) out.push(["required", "true"]);
    if (input.disabled) out.push(["disabled", "true"]);
  }
  return out;
}
function implicitRole(element) {
  const tag = element.tagName.toLowerCase();
  switch (tag) {
    case "a":
      return element.hasAttribute("href") ? "link" : null;
    case "button":
      return "button";
    case "input": {
      const type = element.type;
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "range") return "slider";
      if (type === "number") return "spinbutton";
      if (type === "search") return "searchbox";
      if (type === "submit" || type === "button" || type === "reset") return "button";
      return "textbox";
    }
    case "select":
      return element.multiple ? "listbox" : "combobox";
    case "textarea":
      return "textbox";
    case "img":
      return element.getAttribute("alt") === "" ? "presentation" : "img";
    case "nav":
      return "navigation";
    case "main":
      return "main";
    case "header":
      return "banner";
    case "footer":
      return "contentinfo";
    case "aside":
      return "complementary";
    case "form":
      return "form";
    case "table":
      return "table";
    case "ul":
    case "ol":
      return "list";
    case "li":
      return "listitem";
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return "heading";
    case "dialog":
      return "dialog";
    case "progress":
      return "progressbar";
    default:
      return null;
  }
}
function accessibleName(element) {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const root = element.getRootNode();
    const parts = labelledBy.split(/\s+/).map((id) => {
      try {
        return root.getElementById?.(id)?.textContent ?? "";
      } catch {
        return "";
      }
    }).filter(Boolean);
    if (parts.length > 0) return parts.join(" ").trim();
  }
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel?.trim()) return ariaLabel.trim();
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    const labels = element.labels;
    if (labels && labels.length > 0) {
      const text22 = [...labels].map((l) => l.textContent ?? "").join(" ").trim();
      if (text22) return text22;
    }
    if (element instanceof HTMLInputElement && element.placeholder) return element.placeholder;
  }
  const alt = element.getAttribute("alt");
  if (alt?.trim()) return alt.trim();
  const title = element.getAttribute("title");
  if (title?.trim()) return title.trim();
  const text2 = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  return text2.length > 80 ? `${text2.slice(0, 80)}…` : text2;
}
function deepElementFromPoint(x, y) {
  if (typeof document === "undefined" || typeof document.elementFromPoint !== "function") return null;
  let element = document.elementFromPoint(x, y);
  let guard = 0;
  while (element && guard++ < 20) {
    const shadow = element.shadowRoot;
    if (!shadow || typeof shadow.elementFromPoint !== "function") break;
    const inner = shadow.elementFromPoint(x, y);
    if (!inner || inner === element) break;
    element = inner;
  }
  return element;
}
const OVERLAY_TAG = "aktion-devtools-overlay";
const OVERLAY_CSS = `
:host {
  all: initial;
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147482000;
  font: 500 11px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;
}
.layer { position: fixed; pointer-events: none; box-sizing: border-box; transition: none; }
.margin { background: rgba(255, 155, 90, 0.22); }
.border { background: rgba(255, 206, 102, 0.30); }
.padding { background: rgba(92, 206, 148, 0.26); }
.content { background: rgba(98, 160, 255, 0.30); }
.frame { position: fixed; pointer-events: none; box-sizing: border-box; border: 1.5px solid #8b7bff; border-radius: 2px; box-shadow: 0 0 0 1px rgba(139, 123, 255, 0.25), 0 0 18px rgba(139, 123, 255, 0.25); }
.frame.is-pinned { border-style: solid; border-color: #a99dff; }
.tip {
  position: fixed; pointer-events: none;
  max-width: 380px; padding: 8px 10px 8px; border-radius: 10px;
  background: rgba(16, 18, 26, 0.94); color: #e9ebf2;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 16px 40px -12px rgba(0, 0, 0, 0.6);
  -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  white-space: nowrap;
}
.tip-row { display: flex; align-items: center; gap: 8px; overflow: hidden; }
.tip-row + .tip-row { margin-top: 3px; }
.tip .name { color: #b6adff; font-weight: 700; font-size: 12px; }
.tip .el { color: #e3b3ff; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; }
.tip .dim { color: #9aa2b6; font-variant-numeric: tabular-nums; }
.tip .chip { padding: 1px 6px; border-radius: 5px; font-size: 9.5px; font-weight: 700; background: rgba(139, 123, 255, 0.2); color: #c8c1ff; }
.tip .chip.lib { background: rgba(154, 162, 182, 0.18); color: #c5cad6; }
.tip .chip.bad { background: rgba(255, 107, 118, 0.2); color: #ff9aa2; }
.tip .chip.good { background: rgba(61, 220, 151, 0.18); color: #7ff0bd; }
.tip .a11y { color: #c5cad6; overflow: hidden; text-overflow: ellipsis; }
.tip .a11y b { color: #7fd8ff; font-weight: 650; }
.crosshair { position: fixed; inset: 0; cursor: crosshair; pointer-events: auto; background: transparent; }
.hint {
  position: fixed; left: 50%; top: 14px; transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px;
  padding: 7px 14px 7px 10px; border-radius: 999px;
  background: rgba(16, 18, 26, 0.92); color: #e9ebf2;
  border: 1px solid rgba(139, 123, 255, 0.45);
  box-shadow: 0 12px 30px -8px rgba(0, 0, 0, 0.55), 0 0 0 4px rgba(139, 123, 255, 0.14);
  -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  font-weight: 600; font-size: 12px; pointer-events: none;
  animation: hint-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.hint .dot { width: 8px; height: 8px; border-radius: 50%; background: #8b7bff; box-shadow: 0 0 0 4px rgba(139, 123, 255, 0.25); animation: pulse 1.4s ease-in-out infinite; }
.hint kbd { font: 700 10px/1 inherit; padding: 2px 5px; border-radius: 4px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.16); }
.hint .sub { color: #9aa2b6; font-weight: 500; }
@keyframes hint-in { from { opacity: 0; transform: translate(-50%, -6px); } to { opacity: 1; transform: translate(-50%, 0); } }
@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
.scan { position: fixed; inset: 0; pointer-events: none; }
.marker {
  position: fixed; pointer-events: none; box-sizing: border-box;
  border: 2px solid var(--c); border-radius: 4px;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 18%, transparent);
}
.marker-badge {
  position: fixed; pointer-events: none;
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px;
  display: flex; align-items: center; justify-content: center;
  background: var(--c); color: #fff; font-size: 10px; font-weight: 800;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35), 0 0 0 2px rgba(255, 255, 255, 0.9);
  font-variant-numeric: tabular-nums;
}
.tabpath { position: fixed; inset: 0; pointer-events: none; overflow: visible; }
.landmark {
  position: fixed; pointer-events: none; box-sizing: border-box;
  border: 2px dashed var(--c); border-radius: 6px; background: color-mix(in srgb, var(--c) 7%, transparent);
}
.landmark-label {
  position: fixed; pointer-events: none; padding: 2px 7px; border-radius: 0 0 6px 0;
  background: var(--c); color: #fff; font-size: 10px; font-weight: 800; letter-spacing: 0.02em;
}
.testid {
  position: fixed; pointer-events: none; padding: 1px 6px; border-radius: 5px;
  background: rgba(14, 165, 233, 0.92); color: #fff;
  font: 700 10px/1.5 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}
.update-flash {
  position: fixed; pointer-events: none; border: 1px solid rgba(90, 209, 155, 0.9); border-radius: 2px;
  animation: dt-update-fade 320ms ease-out forwards;
}
@keyframes dt-update-fade { from { opacity: 1; } to { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .hint, .hint .dot { animation: none; } }
`;
const CHROME_TAGS$1 = /* @__PURE__ */ new Set([OVERLAY_TAG, "aktion-devtools"]);
function isPanelChrome(element) {
  let current = element;
  let guard = 0;
  while (current && guard++ < 60) {
    if (current instanceof Element && CHROME_TAGS$1.has(current.tagName.toLowerCase())) return true;
    const parent = current.parentNode;
    current = parent ?? current.host ?? null;
  }
  return false;
}
const TONE = {
  red: "#ff5d6c",
  amber: "#f2a93b",
  blue: "#4f8cff",
  grey: "#8a93a7",
  purple: "#9b6bff",
  green: "#22c55e"
};
const LANDMARK_TONES = ["#8b5cf6", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#6366f1"];
function scanColor(count) {
  const t = Math.max(0, Math.min(1, (count - 1) / 14));
  const stops = [[61, 220, 151], [247, 185, 85], [255, 107, 118]];
  const scaled = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [Math.round(a[0] + (b[0] - a[0]) * f), Math.round(a[1] + (b[1] - a[1]) * f), Math.round(a[2] + (b[2] - a[2]) * f)];
}
const raf$2 = typeof requestAnimationFrame === "function" ? (fn) => requestAnimationFrame(fn) : (fn) => setTimeout(() => fn(Date.now()), 16);
class InspectOverlay {
  constructor() {
    __publicField(this, "host", null);
    __publicField(this, "root", null);
    __publicField(this, "layers", /* @__PURE__ */ new Map());
    __publicField(this, "frame", null);
    __publicField(this, "tip", null);
    __publicField(this, "crosshair", null);
    __publicField(this, "hint", null);
    /** Element currently drawn, so scroll / resize can re-measure it. */
    __publicField(this, "tracked", null);
    __publicField(this, "trackedLabel", {});
    __publicField(this, "trackedPinned", false);
    /**
     * The SELECTED element, kept separately from the hovered one: hovering a
     * second row must not overwrite the pin, and leaving the hover must return to
     * the selection rather than leaving the hovered element highlighted.
     */
    __publicField(this, "pinnedElement", null);
    __publicField(this, "pinnedLabel", {});
    __publicField(this, "reflowBound", null);
    __publicField(this, "reflowPending", false);
    /* ---- highlight-updates (the first-generation flash) ---- */
    __publicField(this, "updateFlashes", []);
    __publicField(this, "updateFlashTimer", null);
    /* ---- render scan ---- */
    __publicField(this, "scanCanvas", null);
    __publicField(this, "scanFlashes", []);
    __publicField(this, "scanAnimating", false);
    /* ---- persistent layers ---- */
    __publicField(this, "markerNodes", []);
    __publicField(this, "markers", []);
    __publicField(this, "tabOrder", null);
    __publicField(this, "tabNodes", []);
    __publicField(this, "tabSvg", null);
    __publicField(this, "landmarks", null);
    __publicField(this, "landmarkNodes", []);
    __publicField(this, "badges", null);
    __publicField(this, "badgeNodes", []);
    /* ---- picking ---- */
    __publicField(this, "picking", false);
    __publicField(this, "onPick", null);
    __publicField(this, "onHover", null);
    __publicField(this, "onCancel", null);
    __publicField(this, "labelFor", null);
    __publicField(this, "boundsFn", null);
    __publicField(this, "moveHandler", null);
    __publicField(this, "clickHandler", null);
    __publicField(this, "keyHandler", null);
    __publicField(this, "wheelHandler", null);
    __publicField(this, "pickTargetEl", null);
    /** Ancestor steps taken with Alt+wheel / ↑ while picking. */
    __publicField(this, "pickDepth", 0);
    __publicField(this, "pickBase", null);
  }
  /** True while the element picker is armed. */
  get isPicking() {
    return this.picking;
  }
  ensureHost() {
    if (this.root) return this.root;
    if (typeof document === "undefined" || typeof document.createElement !== "function" || !document.body) return null;
    const host = document.createElement(OVERLAY_TAG);
    host.setAttribute("aria-hidden", "true");
    let root;
    try {
      root = host.attachShadow({ mode: "open" });
    } catch {
      return null;
    }
    const style = document.createElement("style");
    style.textContent = OVERLAY_CSS;
    root.appendChild(style);
    for (const name of ["margin", "border", "padding", "content"]) {
      const layer = document.createElement("div");
      layer.className = `layer ${name}`;
      layer.style.display = "none";
      root.appendChild(layer);
      this.layers.set(name, layer);
    }
    this.frame = document.createElement("div");
    this.frame.className = "frame";
    this.frame.style.display = "none";
    root.appendChild(this.frame);
    this.tip = document.createElement("div");
    this.tip.className = "tip";
    this.tip.style.display = "none";
    root.appendChild(this.tip);
    document.body.appendChild(host);
    this.host = host;
    this.root = root;
    return root;
  }
  /**
   * Draw the box model around `element`.
   *
   * `pin` marks the highlight as a selection rather than a hover: a pinned
   * highlight survives `hideHover()` and follows the element through scrolling.
   */
  highlight(element, label = {}, pin = false) {
    if (pin) {
      this.pinnedElement = element && element.isConnected ? element : null;
      this.pinnedLabel = label;
    }
    if (!element || !element.isConnected) {
      if (this.pinnedElement) this.drawTarget(this.pinnedElement, this.pinnedLabel, true);
      else this.clear();
      return;
    }
    if (!this.ensureHost()) return;
    this.drawTarget(element, label, pin || element === this.pinnedElement);
  }
  /** Remove a transient hover highlight, restoring the selection if there is one. */
  hideHover() {
    if (this.pinnedElement?.isConnected) {
      this.drawTarget(this.pinnedElement, this.pinnedLabel, true);
      return;
    }
    this.clearBox();
  }
  /**
   * Briefly outline every element that just re-rendered — the first-generation
   * "highlight updates", kept for callers of that API. The panel itself uses the
   * richer {@link scanRender}.
   */
  flashUpdated(elements) {
    const root = this.ensureHost();
    if (!root) return;
    for (const stale of this.updateFlashes) stale.remove();
    this.updateFlashes = [];
    if (this.updateFlashTimer !== null) clearTimeout(this.updateFlashTimer);
    for (const element of elements) {
      if (!element.isConnected) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const box = document.createElement("div");
      box.className = "update-flash";
      box.style.top = `${rect.top}px`;
      box.style.left = `${rect.left}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;
      root.appendChild(box);
      this.updateFlashes.push(box);
    }
    if (this.updateFlashes.length === 0) return;
    this.updateFlashTimer = setTimeout(() => {
      for (const box of this.updateFlashes) box.remove();
      this.updateFlashes = [];
      this.updateFlashTimer = null;
    }, 320);
  }
  /** Remove any update flashes and render-scan outlines without touching the highlight. */
  clearUpdateFlashes() {
    if (this.updateFlashTimer !== null) clearTimeout(this.updateFlashTimer);
    this.updateFlashTimer = null;
    for (const box of this.updateFlashes) box.remove();
    this.updateFlashes = [];
    this.scanFlashes = [];
    this.paintScan();
  }
  /**
   * Render scan: outline what re-rendered in this commit, labelled with a
   * running render count and coloured by it (green → amber → red), fading out
   * over a second. Drawn on one canvas, so a 200-component commit costs one
   * draw per frame instead of 200 DOM nodes.
   */
  scanRender(entries) {
    const root = this.ensureHost();
    if (!root || entries.length === 0) return;
    if (!this.scanCanvas) {
      this.scanCanvas = document.createElement("canvas");
      this.scanCanvas.className = "scan";
      root.insertBefore(this.scanCanvas, root.firstChild?.nextSibling ?? null);
    }
    const now = performance.now();
    for (const entry of entries) {
      if (!entry.element.isConnected) continue;
      const rect = entry.element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      this.scanFlashes = this.scanFlashes.filter((f) => !(f.rect.left === rect.left && f.rect.top === rect.top && f.rect.width === rect.width && f.rect.height === rect.height));
      this.scanFlashes.push({ rect, name: entry.name, count: entry.count, wasted: entry.wasted === true, born: now });
    }
    if (this.scanFlashes.length > 400) this.scanFlashes.splice(0, this.scanFlashes.length - 400);
    if (!this.scanAnimating) {
      this.scanAnimating = true;
      raf$2(() => this.animateScan());
    }
  }
  animateScan() {
    this.paintScan();
    if (this.scanFlashes.length === 0) {
      this.scanAnimating = false;
      return;
    }
    raf$2(() => this.animateScan());
  }
  paintScan() {
    const canvas = this.scanCanvas;
    if (!canvas) return;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = window.innerWidth;
    const h2 = window.innerHeight;
    if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h2 * dpr)) {
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h2 * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h2}px`;
    }
    let g = null;
    try {
      g = canvas.getContext("2d");
    } catch {
      g = null;
    }
    if (!g) {
      this.scanFlashes = [];
      return;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h2);
    const now = performance.now();
    const LIFE = 1100;
    this.scanFlashes = this.scanFlashes.filter((f) => now - f.born < LIFE);
    g.font = "700 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif";
    g.textBaseline = "middle";
    for (const flash of this.scanFlashes) {
      const age = (now - flash.born) / LIFE;
      const alpha = age < 0.15 ? 1 : 1 - (age - 0.15) / 0.85;
      const [r, gg, b] = flash.wasted ? [187, 143, 255] : scanColor(flash.count);
      const { left, top, width, height } = flash.rect;
      g.strokeStyle = `rgba(${r}, ${gg}, ${b}, ${0.95 * alpha})`;
      g.fillStyle = `rgba(${r}, ${gg}, ${b}, ${0.08 * alpha})`;
      g.lineWidth = 1.5;
      g.fillRect(left, top, width, height);
      g.strokeRect(left + 0.75, top + 0.75, Math.max(0, width - 1.5), Math.max(0, height - 1.5));
      if (width > 40 && height > 14) {
        const label = `${flash.name} ×${flash.count}${flash.wasted ? " · forced" : ""}`;
        const tw = g.measureText(label).width + 10;
        const ly = top >= 16 ? top - 15 : top + 1;
        g.fillStyle = `rgba(${r}, ${gg}, ${b}, ${0.95 * alpha})`;
        g.fillRect(left, ly, Math.min(tw, Math.max(40, width)), 14);
        g.fillStyle = `rgba(12, 14, 20, ${alpha})`;
        g.fillText(label, left + 5, ly + 7, Math.max(30, width - 10));
      }
    }
  }
  /* ---- persistent layers ------------------------------------------------ */
  /** Numbered outlines over elements (audit findings). `[]` clears. */
  setMarkers(markers) {
    this.markers = [...markers];
    this.drawLayers();
  }
  /** Visualise keyboard focus order: numbered stops joined by a path. `null` clears. */
  setTabOrder(elements) {
    this.tabOrder = elements ? [...elements] : null;
    this.drawLayers();
  }
  /** Outline landmark regions with their role. `null` clears. */
  setLandmarks(items) {
    this.landmarks = items ? [...items] : null;
    this.drawLayers();
  }
  /** Small labels pinned to elements (test ids). `null` clears. */
  setBadges(items) {
    this.badges = items ? [...items] : null;
    this.drawLayers();
  }
  hasLayers() {
    return this.markers.length > 0 || this.tabOrder !== null || this.landmarks !== null || this.badges !== null;
  }
  drawLayers() {
    for (const node of [...this.markerNodes, ...this.tabNodes, ...this.landmarkNodes, ...this.badgeNodes]) node.remove();
    this.markerNodes = [];
    this.tabNodes = [];
    this.landmarkNodes = [];
    this.badgeNodes = [];
    this.tabSvg?.remove();
    this.tabSvg = null;
    if (!this.hasLayers()) {
      if (!this.tracked) this.unbindReflow();
      return;
    }
    const root = this.ensureHost();
    if (!root) return;
    this.bindReflow();
    const place = (el, rect) => {
      el.style.left = `${rect.left}px`;
      el.style.top = `${rect.top}px`;
      if (rect.width !== void 0) el.style.width = `${rect.width}px`;
      if (rect.height !== void 0) el.style.height = `${rect.height}px`;
    };
    (this.landmarks ?? []).forEach((item, i) => {
      if (!item.element.isConnected) return;
      const rect = item.element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const tone = LANDMARK_TONES[i % LANDMARK_TONES.length];
      const box = document.createElement("div");
      box.className = "landmark";
      box.style.setProperty("--c", tone);
      place(box, { left: rect.left, top: rect.top, width: rect.width, height: rect.height });
      const label = document.createElement("div");
      label.className = "landmark-label";
      label.style.setProperty("--c", tone);
      label.textContent = item.label;
      place(label, { left: rect.left, top: rect.top });
      root.append(box, label);
      this.landmarkNodes.push(box, label);
    });
    this.markers.forEach((marker, i) => {
      if (!marker.element.isConnected) return;
      const rect = marker.element.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) return;
      const color = TONE[marker.tone];
      const box = document.createElement("div");
      box.className = "marker";
      box.style.setProperty("--c", color);
      place(box, { left: rect.left - 2, top: rect.top - 2, width: rect.width + 4, height: rect.height + 4 });
      const badge = document.createElement("div");
      badge.className = "marker-badge";
      badge.style.setProperty("--c", color);
      badge.textContent = marker.label || String(i + 1);
      place(badge, { left: Math.max(2, rect.left - 9), top: Math.max(2, rect.top - 9) });
      root.append(box, badge);
      this.markerNodes.push(box, badge);
    });
    if (this.tabOrder) {
      const points = [];
      this.tabOrder.forEach((element, i) => {
        if (!element.isConnected) return;
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 && rect.height <= 0) return;
        const cx = rect.left + Math.min(rect.width / 2, 14);
        const cy = rect.top + Math.min(rect.height / 2, 14);
        points.push([cx, cy]);
        const badge = document.createElement("div");
        badge.className = "marker-badge";
        badge.style.setProperty("--c", "#6d5dfc");
        badge.textContent = String(i + 1);
        place(badge, { left: cx - 9, top: cy - 9 });
        this.tabNodes.push(badge);
      });
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "tabpath");
      svg.setAttribute("width", String(window.innerWidth));
      svg.setAttribute("height", String(window.innerHeight));
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" "));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "rgba(109, 93, 252, 0.75)");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-dasharray", "5 4");
      path.setAttribute("stroke-linejoin", "round");
      svg.appendChild(path);
      root.appendChild(svg);
      this.tabSvg = svg;
      for (const node of this.tabNodes) root.appendChild(node);
    }
    for (const item of this.badges ?? []) {
      if (!item.element.isConnected) continue;
      const rect = item.element.getBoundingClientRect();
      if (rect.width <= 0 && rect.height <= 0) continue;
      const badge = document.createElement("div");
      badge.className = "testid";
      badge.textContent = item.text;
      place(badge, { left: rect.left, top: Math.max(0, rect.top - 17) });
      root.appendChild(badge);
      this.badgeNodes.push(badge);
    }
  }
  /** Remove every highlight and stop tracking. Persistent layers stay. */
  clear() {
    this.tracked = null;
    this.pinnedElement = null;
    this.pinnedLabel = {};
    this.clearBox();
  }
  clearBox() {
    this.tracked = null;
    for (const layer of this.layers.values()) layer.style.display = "none";
    if (this.frame) this.frame.style.display = "none";
    if (this.tip) this.tip.style.display = "none";
    if (!this.hasLayers()) this.unbindReflow();
  }
  /** Drop the selection, so the next `hideHover()` clears the highlight. */
  unpin() {
    this.pinnedElement = null;
    this.pinnedLabel = {};
  }
  drawTarget(element, label, pinned) {
    if (!this.ensureHost()) return;
    this.tracked = element;
    this.trackedLabel = label;
    this.trackedPinned = pinned;
    this.draw();
    this.bindReflow();
  }
  draw() {
    const element = this.tracked;
    if (!element) return;
    const box = measureBox(element);
    if (!box) return;
    const { rect, margin, border, padding } = box;
    const place = (name2, top2, left, width, height) => {
      const layer = this.layers.get(name2);
      if (!layer) return;
      if (width <= 0 || height <= 0) {
        layer.style.display = "none";
        return;
      }
      layer.style.display = "block";
      layer.style.top = `${top2}px`;
      layer.style.left = `${left}px`;
      layer.style.width = `${width}px`;
      layer.style.height = `${height}px`;
    };
    place(
      "margin",
      rect.top - margin.top,
      rect.left - margin.left,
      rect.width + margin.left + margin.right,
      rect.height + margin.top + margin.bottom
    );
    place("border", rect.top, rect.left, rect.width, rect.height);
    place(
      "padding",
      rect.top + border.top,
      rect.left + border.left,
      rect.width - border.left - border.right,
      rect.height - border.top - border.bottom
    );
    place(
      "content",
      rect.top + border.top + padding.top,
      rect.left + border.left + padding.left,
      box.content.width,
      box.content.height
    );
    if (this.frame) {
      this.frame.style.display = rect.width > 0 && rect.height > 0 ? "block" : "none";
      this.frame.className = `frame ${this.trackedPinned ? "is-pinned" : ""}`;
      this.frame.style.top = `${rect.top}px`;
      this.frame.style.left = `${rect.left}px`;
      this.frame.style.width = `${rect.width}px`;
      this.frame.style.height = `${rect.height}px`;
    }
    const tip2 = this.tip;
    if (!tip2) return;
    tip2.replaceChildren();
    const row2 = () => {
      const r = document.createElement("div");
      r.className = "tip-row";
      tip2.appendChild(r);
      return r;
    };
    const span = (parent, cls, text2) => {
      const s = document.createElement("span");
      s.className = cls;
      s.textContent = text2;
      parent.appendChild(s);
      return s;
    };
    const first = row2();
    span(first, "name", this.trackedLabel.component ?? describeElement(element));
    if (this.trackedLabel.kind) span(first, `chip ${this.trackedLabel.kind === "library" ? "lib" : ""}`, this.trackedLabel.kind);
    span(first, "dim", `${round(rect.width)} × ${round(rect.height)}`);
    if (this.trackedLabel.component) {
      const second = row2();
      span(second, "el", describeElement(element));
    }
    const role = element.getAttribute("role") ?? implicitRole(element);
    const name = role ? accessibleName(element) : "";
    if (role) {
      const a11y = row2();
      const text2 = document.createElement("span");
      text2.className = "a11y";
      if (role) {
        const b = document.createElement("b");
        b.textContent = role;
        text2.appendChild(b);
      }
      if (name) text2.appendChild(document.createTextNode(`${role ? " · " : ""}"${name.length > 48 ? `${name.slice(0, 48)}…` : name}"`));
      a11y.appendChild(text2);
    }
    const contrast2 = textContrast(element);
    if (contrast2) {
      const c = row2();
      span(c, "dim", "Contrast");
      span(c, `chip ${contrast2.ok ? "good" : "bad"}`, `${contrast2.ratio.toFixed(2)}:1 ${contrast2.ok ? "✓" : "✗"}`);
      span(c, "dim", contrast2.large ? "large text · needs 3:1" : "needs 4.5:1");
    }
    tip2.style.display = "block";
    const tipHeight = tip2.offsetHeight || 44;
    const tipWidth = tip2.offsetWidth || 220;
    const area = this.bounds();
    const above = rect.top - margin.top - tipHeight - 8;
    const top = above > area.top + 6 ? above : Math.min(area.bottom - tipHeight - 6, rect.top + rect.height + margin.bottom + 8);
    tip2.style.top = `${Math.max(area.top + 6, top)}px`;
    tip2.style.left = `${Math.max(area.left + 6, Math.min(area.right - tipWidth - 6, rect.left - margin.left))}px`;
  }
  bindReflow() {
    if (this.reflowBound || typeof window === "undefined") return;
    const handler = () => {
      if (this.reflowPending) return;
      this.reflowPending = true;
      raf$2(() => {
        this.reflowPending = false;
        if (this.tracked) {
          if (!this.tracked.isConnected) this.clearBox();
          else this.draw();
        }
        if (this.hasLayers()) this.drawLayers();
      });
    };
    this.reflowBound = handler;
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
  }
  unbindReflow() {
    if (!this.reflowBound || typeof window === "undefined") return;
    window.removeEventListener("scroll", this.reflowBound, true);
    window.removeEventListener("resize", this.reflowBound);
    this.reflowBound = null;
  }
  /** Redraw every persistent layer (after a commit moved things). */
  refreshLayers() {
    if (this.hasLayers()) this.drawLayers();
    if (this.tracked?.isConnected) this.draw();
  }
  /* ---- picker ---------------------------------------------------------- */
  /**
   * Arm the element picker. Hovering highlights, clicking selects, Escape
   * cancels; Alt + wheel (or ↑ / ↓) walks to the parent / back down. A
   * full-viewport crosshair layer takes the pointer events so the app under it
   * never sees the picking click — you can safely pick a "Delete" button.
   */
  /**
   * The part of the viewport the page is actually visible in. A docked panel
   * covers one edge, and a tooltip placed under it is a tooltip nobody sees.
   */
  setBounds(fn) {
    this.boundsFn = fn;
  }
  bounds() {
    const fallback = { left: 0, top: 0, right: typeof window !== "undefined" ? window.innerWidth : 1280, bottom: typeof window !== "undefined" ? window.innerHeight : 800 };
    try {
      return this.boundsFn?.() ?? fallback;
    } catch {
      return fallback;
    }
  }
  startPicking(handlers) {
    const root = this.ensureHost();
    if (!root || this.picking) return;
    this.picking = true;
    this.onPick = handlers.onPick;
    this.onHover = handlers.onHover ?? null;
    this.onCancel = handlers.onCancel ?? null;
    this.labelFor = handlers.labelFor ?? null;
    this.pickDepth = 0;
    this.pickBase = null;
    const crosshair = document.createElement("div");
    crosshair.className = "crosshair";
    root.appendChild(crosshair);
    this.crosshair = crosshair;
    const hint = document.createElement("div");
    hint.className = "hint";
    const dot = document.createElement("span");
    dot.className = "dot";
    const text2 = document.createElement("span");
    text2.textContent = "Click an element to inspect it";
    const sub = document.createElement("span");
    sub.className = "sub";
    sub.append("Esc cancels · ");
    const kbdEl = document.createElement("kbd");
    kbdEl.textContent = "↑";
    sub.append(kbdEl, " parent");
    hint.append(dot, text2, sub);
    root.appendChild(hint);
    this.hint = hint;
    const show = (element) => {
      this.pickTargetEl = element;
      this.highlight(element, this.labelFor?.(element) ?? {}, false);
      this.onHover?.(element);
    };
    this.moveHandler = (event) => {
      const element = this.pickTarget(event);
      if (!element) {
        this.hideHover();
        return;
      }
      if (element !== this.pickBase) {
        this.pickBase = element;
        this.pickDepth = 0;
      }
      show(this.ancestorAt(element, this.pickDepth));
    };
    this.clickHandler = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const element = this.pickTargetEl ?? this.pickTarget(event);
      if (!element) return;
      const pick = this.onPick;
      this.stopPicking();
      pick?.(element);
    };
    this.wheelHandler = (event) => {
      if (!event.altKey || !this.pickBase) return;
      event.preventDefault();
      this.pickDepth = Math.max(0, this.pickDepth + (event.deltaY < 0 ? 1 : -1));
      show(this.ancestorAt(this.pickBase, this.pickDepth));
    };
    this.keyHandler = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        const cancel = this.onCancel;
        this.stopPicking();
        cancel?.();
      } else if ((event.key === "ArrowUp" || event.key === "ArrowDown") && this.pickBase) {
        event.preventDefault();
        event.stopPropagation();
        this.pickDepth = Math.max(0, this.pickDepth + (event.key === "ArrowUp" ? 1 : -1));
        show(this.ancestorAt(this.pickBase, this.pickDepth));
      } else if (event.key === "Enter" && this.pickTargetEl) {
        event.preventDefault();
        const element = this.pickTargetEl;
        const pick = this.onPick;
        this.stopPicking();
        pick?.(element);
      }
    };
    crosshair.addEventListener("mousemove", this.moveHandler);
    crosshair.addEventListener("click", this.clickHandler);
    crosshair.addEventListener("wheel", this.wheelHandler, { passive: false });
    if (typeof window !== "undefined") window.addEventListener("keydown", this.keyHandler, true);
  }
  /** `depth` steps up from `element`, crossing shadow boundaries, never past the app host. */
  ancestorAt(element, depth) {
    let current = element;
    for (let i = 0; i < depth; i += 1) {
      const parent = current.parentElement ?? (current.getRootNode().host ?? null);
      if (!parent || parent === document.body || parent === document.documentElement) {
        this.pickDepth = i;
        break;
      }
      current = parent;
    }
    return current;
  }
  /** Disarm the picker, leaving any pinned highlight in place. */
  stopPicking() {
    if (!this.picking) return;
    this.picking = false;
    if (this.crosshair) {
      if (this.moveHandler) this.crosshair.removeEventListener("mousemove", this.moveHandler);
      if (this.clickHandler) this.crosshair.removeEventListener("click", this.clickHandler);
      if (this.wheelHandler) this.crosshair.removeEventListener("wheel", this.wheelHandler);
      this.crosshair.remove();
      this.crosshair = null;
    }
    this.hint?.remove();
    this.hint = null;
    if (this.keyHandler && typeof window !== "undefined") window.removeEventListener("keydown", this.keyHandler, true);
    this.moveHandler = null;
    this.clickHandler = null;
    this.keyHandler = null;
    this.wheelHandler = null;
    this.onPick = null;
    this.onHover = null;
    this.onCancel = null;
    this.labelFor = null;
    this.pickTargetEl = null;
    this.pickBase = null;
    this.hideHover();
  }
  /**
   * Element under a picking event. The crosshair layer is on top, so it is
   * hidden for the hit test instead of reading `event.target` (always itself).
   */
  pickTarget(event) {
    const crosshair = this.crosshair;
    if (crosshair) crosshair.style.display = "none";
    let element = null;
    try {
      element = deepElementFromPoint(event.clientX, event.clientY);
    } finally {
      if (crosshair) crosshair.style.display = "";
    }
    return isPanelChrome(element) ? null : element;
  }
  /** Remove the overlay host from the page. */
  destroy() {
    this.stopPicking();
    this.clearUpdateFlashes();
    this.clear();
    this.markers = [];
    this.tabOrder = null;
    this.landmarks = null;
    this.badges = null;
    this.drawLayers();
    this.host?.remove();
    this.host = null;
    this.root = null;
    this.layers.clear();
    this.tip = null;
    this.frame = null;
    this.scanCanvas = null;
  }
}
function round(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}
function textContrast(element) {
  if (typeof getComputedStyle !== "function") return null;
  let hasText = false;
  for (const node of element.childNodes) {
    if (node.nodeType === 3 && (node.textContent ?? "").trim() !== "") {
      hasText = true;
      break;
    }
  }
  if (!hasText) return null;
  try {
    const style = getComputedStyle(element);
    const fg = parseCssColor(style.color);
    const bg = backgroundBehind(element);
    if (!fg || !bg) return null;
    const composite = {
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a)
    };
    const ratio = contrast(composite, bg);
    const size = Number.parseFloat(style.fontSize);
    const weight = Number.parseInt(style.fontWeight, 10);
    const large = size >= 24 || size >= 18.66 && weight >= 700;
    return { ratio, ok: ratio >= (large ? 3 : 4.5), large };
  } catch {
    return null;
  }
}
function parseCssColor(css) {
  const m = /^rgba?\(([^)]+)\)$/.exec(css.trim());
  if (!m) return null;
  const parts = m[1].split(/[,/\s]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.some((v) => !Number.isFinite(v))) return null;
  return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
}
function backgroundBehind(element) {
  const layers2 = [];
  let current = element;
  let guard = 0;
  while (current && guard++ < 40) {
    const color = parseCssColor(getComputedStyle(current).backgroundColor || "");
    if (color && color.a > 0) {
      layers2.push(color);
      if (color.a >= 1) break;
    }
    current = current.parentElement ?? (current.getRootNode().host ?? null);
  }
  let result = { r: 255, g: 255, b: 255 };
  for (let i = layers2.length - 1; i >= 0; i -= 1) {
    const layer = layers2[i];
    result = {
      r: layer.r * layer.a + result.r * (1 - layer.a),
      g: layer.g * layer.a + result.g * (1 - layer.a),
      b: layer.b * layer.a + result.b * (1 - layer.a)
    };
  }
  return result;
}
function contrast(a, b) {
  const lum = (c) => {
    const ch = (v) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  };
  const l1 = lum(a);
  const l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
const RULE_INFO = {
  "image-alt": { wcag: ["1.1.1"], category: "names", title: "Images have alternative text" },
  "button-name": { wcag: ["4.1.2"], category: "names", title: "Buttons have an accessible name" },
  "link-name": { wcag: ["2.4.4", "4.1.2"], category: "names", title: "Links have an accessible name" },
  "form-field-label": { wcag: ["1.3.1", "4.1.2"], category: "forms", title: "Form fields have labels" },
  "label-placeholder-only": { wcag: ["3.3.2"], category: "forms", title: "Labels are not placeholder-only" },
  "label-title-only": { wcag: ["3.3.2"], category: "forms", title: "Labels are not title-only" },
  "heading-order": { wcag: ["1.3.1"], category: "structure", title: "Heading levels increase by one" },
  "empty-heading": { wcag: ["1.3.1", "2.4.6"], category: "structure", title: "Headings have text" },
  "duplicate-id": { wcag: ["4.1.2"], category: "aria", title: "ids are unique" },
  "aria-dangling-reference": { wcag: ["1.3.1", "4.1.2"], category: "aria", title: "ARIA references resolve" },
  "aria-role-unknown": { wcag: ["4.1.2"], category: "aria", title: "Roles are valid" },
  "aria-valid-attr-value": { wcag: ["4.1.2"], category: "aria", title: "ARIA states have valid values" },
  "aria-required-parent": { wcag: ["1.3.1"], category: "aria", title: "Roles sit inside their required parent" },
  "presentation-role-conflict": { wcag: ["4.1.2"], category: "aria", title: "Presentational elements are not interactive" },
  "tabindex-positive": { wcag: ["2.4.3"], category: "keyboard", title: "No positive tabindex" },
  "aria-hidden-focus": { wcag: ["4.1.2"], category: "keyboard", title: "Hidden content is not focusable" },
  "nested-interactive": { wcag: ["4.1.2"], category: "keyboard", title: "Controls are not nested" },
  "scrollable-region-focusable": { wcag: ["2.1.1"], category: "keyboard", title: "Scrollable regions are keyboard-reachable" },
  "target-size": { wcag: ["2.5.8"], category: "keyboard", title: "Targets are at least 24×24px" },
  "color-contrast": { wcag: ["1.4.3"], category: "contrast", title: "Text has enough contrast" },
  "non-text-contrast": { wcag: ["1.4.11"], category: "contrast", title: "Control boundaries have 3:1 contrast" },
  "table-headers": { wcag: ["1.3.1"], category: "structure", title: "Tables have header cells" },
  "link-destination": { wcag: ["2.4.4"], category: "names", title: "Links go somewhere" },
  "list-structure": { wcag: ["1.3.1"], category: "structure", title: "List items are inside lists" },
  "svg-img-alt": { wcag: ["1.1.1"], category: "names", title: "SVG images have a name" },
  "role-img-alt": { wcag: ["1.1.1"], category: "names", title: "role=img elements have a name" },
  "iframe-title": { wcag: ["4.1.2"], category: "names", title: "Frames have a title" },
  "summary-name": { wcag: ["4.1.2"], category: "names", title: "Disclosure summaries have text" },
  "video-caption": { wcag: ["1.2.2"], category: "media", title: "Videos have captions" },
  "autocomplete-valid": { wcag: ["1.3.5"], category: "forms", title: "autocomplete uses valid tokens" },
  "landmark-main": { wcag: ["1.3.1"], category: "structure", title: "Content sits in a main landmark" }
};
const IMPACT_ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 };
const KNOWN_ROLES = /* @__PURE__ */ new Set([
  "alert",
  "alertdialog",
  "application",
  "article",
  "banner",
  "blockquote",
  "button",
  "caption",
  "cell",
  "checkbox",
  "code",
  "columnheader",
  "combobox",
  "complementary",
  "contentinfo",
  "definition",
  "deletion",
  "dialog",
  "directory",
  "document",
  "emphasis",
  "feed",
  "figure",
  "form",
  "generic",
  "grid",
  "gridcell",
  "group",
  "heading",
  "img",
  "insertion",
  "link",
  "list",
  "listbox",
  "listitem",
  "log",
  "main",
  "marquee",
  "math",
  "menu",
  "menubar",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "meter",
  "navigation",
  "none",
  "note",
  "option",
  "paragraph",
  "presentation",
  "progressbar",
  "radio",
  "radiogroup",
  "region",
  "row",
  "rowgroup",
  "rowheader",
  "scrollbar",
  "search",
  "searchbox",
  "separator",
  "slider",
  "spinbutton",
  "status",
  "strong",
  "subscript",
  "superscript",
  "switch",
  "tab",
  "table",
  "tablist",
  "tabpanel",
  "term",
  "textbox",
  "time",
  "timer",
  "toolbar",
  "tooltip",
  "tree",
  "treegrid",
  "treeitem"
]);
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "[tabindex]",
  '[contenteditable="true"]'
].join(",");
function parseColor(css) {
  const text2 = css.trim().toLowerCase();
  if (text2 === "" || text2 === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const rgb = /^rgba?\(([^)]+)\)$/.exec(text2);
  if (rgb) {
    const parts = rgb[1].split(/[,/\s]+/).filter(Boolean).map(Number);
    const [r, g, b, a] = parts;
    if (r === void 0 || g === void 0 || b === void 0) return null;
    return { r, g, b, a: a === void 0 ? 1 : a };
  }
  const hex = /^#([0-9a-f]{3,8})$/.exec(text2);
  if (hex) {
    const digits = hex[1];
    const expand = (s) => Number.parseInt(s.length === 1 ? s + s : s, 16);
    if (digits.length === 3 || digits.length === 4) {
      return {
        r: expand(digits[0]),
        g: expand(digits[1]),
        b: expand(digits[2]),
        a: digits.length === 4 ? expand(digits[3]) / 255 : 1
      };
    }
    if (digits.length === 6 || digits.length === 8) {
      return {
        r: Number.parseInt(digits.slice(0, 2), 16),
        g: Number.parseInt(digits.slice(2, 4), 16),
        b: Number.parseInt(digits.slice(4, 6), 16),
        a: digits.length === 8 ? Number.parseInt(digits.slice(6, 8), 16) / 255 : 1
      };
    }
  }
  return null;
}
function relativeLuminance(color) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}
function contrastRatio(fg, bg) {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
function over(fg, bg) {
  return {
    r: Math.round(fg.r * fg.a + bg.r * (1 - fg.a)),
    g: Math.round(fg.g * fg.a + bg.g * (1 - fg.a)),
    b: Math.round(fg.b * fg.a + bg.b * (1 - fg.a))
  };
}
function effectiveBackground(element) {
  if (typeof getComputedStyle !== "function") return null;
  const stack = [];
  let current = element;
  let guard = 0;
  while (current && guard++ < 40) {
    let style = null;
    try {
      style = getComputedStyle(current);
    } catch {
      style = null;
    }
    if (style) {
      const parsed2 = parseColor(style.backgroundColor || "transparent");
      if (parsed2 && parsed2.a > 0) {
        stack.push(parsed2);
        if (parsed2.a >= 1) break;
      }
    }
    const parent = current.parentElement;
    current = parent ?? (current.getRootNode().host ?? null);
  }
  if (stack.length === 0) return { r: 255, g: 255, b: 255 };
  let result = { r: 255, g: 255, b: 255 };
  for (let i = stack.length - 1; i >= 0; i -= 1) {
    result = over(stack[i], result);
  }
  return result;
}
function isLargeText(style) {
  const size = Number.parseFloat(style.fontSize);
  const weight = Number.parseInt(style.fontWeight, 10);
  if (!Number.isFinite(size)) return false;
  if (size >= 24) return true;
  return size >= 18.66 && Number.isFinite(weight) && weight >= 700;
}
function auditAccessibility(root, options = {}) {
  if (!root) return { findings: [], examined: 0, truncated: false };
  const limit = options.limit ?? 4e3;
  const all = [...root.querySelectorAll("*")];
  const elements = all.slice(0, limit);
  const findings = [];
  const ctx = {
    root,
    elements,
    push: (finding) => findings.push(finding)
  };
  for (const rule of RULES) {
    try {
      rule(ctx);
    } catch {
    }
  }
  for (const finding of findings) {
    const info = RULE_INFO[finding.rule];
    if (info) {
      finding.wcag ?? (finding.wcag = info.wcag);
      finding.category ?? (finding.category = info.category);
    }
  }
  findings.sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact]);
  return { findings, examined: elements.length, truncated: all.length > elements.length };
}
function a11yScore(findings) {
  const weight = { critical: 12, serious: 8, moderate: 4, minor: 1.5 };
  const byRule = /* @__PURE__ */ new Map();
  for (const finding of findings) {
    const existing = byRule.get(finding.rule);
    if (!existing) byRule.set(finding.rule, { impact: finding.impact, count: 1 });
    else {
      existing.count += 1;
      if (IMPACT_ORDER[finding.impact] < IMPACT_ORDER[existing.impact]) existing.impact = finding.impact;
    }
  }
  let penalty = 0;
  for (const { impact, count } of byRule.values()) {
    penalty += weight[impact] + Math.min(weight[impact], (count - 1) * weight[impact] * 0.08);
  }
  return Math.max(0, Math.round(100 - penalty));
}
const RULES = [
  /* ---- names ---- */
  (ctx) => {
    for (const element of ctx.elements) {
      if (element.tagName !== "IMG") continue;
      if (element.hasAttribute("alt")) continue;
      if (element.getAttribute("role") === "presentation" || element.getAttribute("role") === "none") continue;
      ctx.push({
        rule: "image-alt",
        impact: "critical",
        message: `<img> has no alt attribute (${shortSrc(element)}).`,
        help: 'Pass `alt:` on Image(...). Use `alt: ""` for a purely decorative image.',
        element
      });
    }
  },
  (ctx) => {
    for (const element of ctx.elements) {
      const role = element.getAttribute("role") ?? implicitRole(element);
      if (role !== "button" && role !== "link") continue;
      if (accessibleName(element) !== "") continue;
      ctx.push({
        rule: role === "button" ? "button-name" : "link-name",
        impact: "critical",
        message: `${describe$1(element)} has no accessible name.`,
        help: role === "button" ? 'Give the Button a label, or set `aria: { label: "Close" }` for an icon-only button.' : "Give the Link text, or set `aria: { label: … }`.",
        element
      });
    }
  },
  (ctx) => {
    for (const element of ctx.elements) {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) continue;
      if (element instanceof HTMLInputElement && (element.type === "hidden" || element.type === "submit" || element.type === "button" || element.type === "reset")) continue;
      const labels = element.labels;
      const hasLabel = labels && labels.length > 0 || element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby");
      if (hasLabel) continue;
      const placeholder = element.getAttribute("placeholder");
      if (placeholder) {
        ctx.push({
          rule: "label-placeholder-only",
          impact: "serious",
          message: `${describe$1(element)} is labelled only by its placeholder ("${placeholder}").`,
          help: "A placeholder disappears on focus and is not a label. Add `label:` to the field.",
          element
        });
      } else {
        ctx.push({
          rule: "form-field-label",
          impact: "critical",
          message: `${describe$1(element)} has no label.`,
          help: "Add `label:` to the field, or wire `aria: { labelledby: … }` to visible text.",
          element
        });
      }
    }
  },
  /* ---- structure ---- */
  (ctx) => {
    const headings = ctx.elements.filter((el) => /^H[1-6]$/.test(el.tagName));
    let previous = 0;
    for (const heading of headings) {
      const level = Number(heading.tagName[1]);
      if (previous !== 0 && level > previous + 1) {
        ctx.push({
          rule: "heading-order",
          impact: "moderate",
          message: `Heading level jumps from h${previous} to h${level} ("${text$1(heading)}").`,
          help: "Headings form the page outline a screen-reader user navigates by. Use the next level down, or restructure.",
          element: heading,
          detail: `h${previous} → h${level}`
        });
      }
      previous = level;
    }
  },
  (ctx) => {
    const ids = /* @__PURE__ */ new Map();
    for (const element of ctx.elements) {
      const id = element.id;
      if (!id) continue;
      const bucket = ids.get(id);
      if (bucket) bucket.push(element);
      else ids.set(id, [element]);
    }
    for (const [id, elements] of ids) {
      if (elements.length < 2) continue;
      ctx.push({
        rule: "duplicate-id",
        impact: "serious",
        message: `id "${id}" is used ${elements.length} times.`,
        help: "`aria-labelledby`, `for`, and anchor links all resolve the FIRST match, so duplicates silently mis-wire. Use `key:` or a unique `id:`.",
        element: elements[1]
      });
    }
  },
  (ctx) => {
    const rootNode = ctx.root.getRootNode();
    const lookup = (id) => {
      try {
        return rootNode.getElementById?.(id) ?? ctx.root.querySelector(`[id="${id.replace(/(["\\])/g, "\\$1")}"]`);
      } catch {
        return null;
      }
    };
    for (const element of ctx.elements) {
      for (const attr of ["aria-labelledby", "aria-describedby", "aria-controls", "aria-owns"]) {
        const value = element.getAttribute(attr);
        if (!value) continue;
        const missing = value.split(/\s+/).filter((id) => id !== "" && lookup(id) === null);
        if (missing.length === 0) continue;
        ctx.push({
          rule: "aria-dangling-reference",
          impact: "serious",
          message: `${describe$1(element)} has ${attr}="${value}" but ${missing.join(", ")} does not exist.`,
          help: "A dangling reference makes the whole attribute inert — the name or description is simply not announced.",
          element
        });
      }
    }
  },
  (ctx) => {
    for (const element of ctx.elements) {
      const role = element.getAttribute("role");
      if (!role) continue;
      const unknown = role.split(/\s+/).filter((r) => r !== "" && !KNOWN_ROLES.has(r));
      if (unknown.length === 0) continue;
      ctx.push({
        rule: "aria-role-unknown",
        impact: "moderate",
        message: `${describe$1(element)} has an unrecognised role "${unknown.join(" ")}".`,
        help: "An invalid role is ignored, so the element falls back to its implicit role — usually `generic`.",
        element
      });
    }
  },
  /* ---- focus ---- */
  (ctx) => {
    for (const element of ctx.elements) {
      const raw = element.getAttribute("tabindex");
      if (raw === null) continue;
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) continue;
      ctx.push({
        rule: "tabindex-positive",
        impact: "moderate",
        message: `${describe$1(element)} has tabindex="${raw}".`,
        help: 'A positive tabindex jumps ahead of every natural stop and makes tab order unpredictable. Use DOM order, or tabindex="0".',
        element
      });
    }
  },
  (ctx) => {
    for (const element of ctx.elements) {
      if (element.getAttribute("aria-hidden") !== "true") continue;
      let focusable = [];
      try {
        focusable = [...element.querySelectorAll(FOCUSABLE_SELECTOR)];
      } catch {
        focusable = [];
      }
      const reachable = focusable.filter((el) => el.getAttribute("tabindex") !== "-1" && !el.disabled);
      if (reachable.length === 0) continue;
      ctx.push({
        rule: "aria-hidden-focus",
        impact: "serious",
        message: `${describe$1(element)} is aria-hidden but contains ${reachable.length} focusable element(s).`,
        help: "A keyboard user can tab into content a screen reader cannot see. Remove the focusable elements from the tab order, or stop hiding the container.",
        element
      });
    }
  },
  (ctx) => {
    for (const element of ctx.elements) {
      const role = element.getAttribute("role") ?? implicitRole(element);
      if (role !== "button" && role !== "link" && role !== "checkbox" && role !== "radio" && role !== "switch") continue;
      let nested = [];
      try {
        nested = [...element.querySelectorAll("a[href],button,input,select,textarea")];
      } catch {
        nested = [];
      }
      if (nested.length === 0) continue;
      ctx.push({
        rule: "nested-interactive",
        impact: "serious",
        message: `${describe$1(element)} contains another interactive element (${describe$1(nested[0])}).`,
        help: "Nested controls have no reliable keyboard or screen-reader behaviour. Put them side by side instead.",
        element
      });
    }
  },
  (ctx) => {
    if (typeof getComputedStyle !== "function") return;
    for (const element of ctx.elements) {
      const role = element.getAttribute("role") ?? implicitRole(element);
      if (role !== "button" && role !== "link" && role !== "checkbox" && role !== "switch") continue;
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (rect.width >= 24 && rect.height >= 24) continue;
      ctx.push({
        rule: "target-size",
        impact: "minor",
        message: `${describe$1(element)} is ${Math.round(rect.width)}×${Math.round(rect.height)}px.`,
        help: "WCAG 2.2 asks for a 24×24 minimum target. Add padding, or increase the icon button's size.",
        element,
        detail: `${Math.round(rect.width)}×${Math.round(rect.height)}`
      });
    }
  },
  /* ---- contrast ---- */
  (ctx) => {
    if (typeof getComputedStyle !== "function") return;
    let reported = 0;
    for (const element of ctx.elements) {
      if (reported >= 25) return;
      if (!hasOwnText(element)) continue;
      let style;
      try {
        style = getComputedStyle(element);
      } catch {
        continue;
      }
      if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") continue;
      const fg = parseColor(style.color);
      if (!fg || fg.a === 0) continue;
      const bg = effectiveBackground(element);
      if (!bg) continue;
      const ratio = contrastRatio(over(fg, bg), bg);
      const large = isLargeText(style);
      const required = large ? 3 : 4.5;
      if (ratio >= required) continue;
      reported += 1;
      ctx.push({
        rule: "color-contrast",
        impact: ratio < required - 1.5 ? "serious" : "moderate",
        message: `"${text$1(element)}" has a contrast of ${ratio.toFixed(2)}:1 (needs ${required}:1).`,
        help: "Adjust the theme token behind this text — `colorText`, `colorTextMuted`, or the status *Text tokens for coloured labels.",
        element,
        detail: `${ratio.toFixed(2)}:1 vs ${required}:1`
      });
    }
  },
  /* ---- tables + links ---- */
  (ctx) => {
    for (const element of ctx.elements) {
      if (element.tagName !== "TABLE") continue;
      if (element.querySelector("th")) continue;
      if (element.getAttribute("role") === "presentation" || element.getAttribute("role") === "none") continue;
      ctx.push({
        rule: "table-headers",
        impact: "moderate",
        message: "A <table> has no header cells.",
        help: "Without <th>, every cell is announced without context. Declare columns so the header row is rendered.",
        element
      });
    }
  },
  (ctx) => {
    for (const element of ctx.elements) {
      if (element.tagName !== "A") continue;
      const href = element.getAttribute("href");
      if (href === null) continue;
      if (href.trim() !== "" && href.trim() !== "#") continue;
      ctx.push({
        rule: "link-destination",
        impact: "minor",
        message: `Link "${text$1(element)}" has no destination (href="${href}").`,
        help: "A link with no destination is a button. Use Button(...) with `onClick`, or give the link a real `href`.",
        element
      });
    }
  },
  /* ---- more structure + ARIA ---- */
  (ctx) => {
    for (const element of ctx.elements) {
      if (!/^H[1-6]$/.test(element.tagName) && element.getAttribute("role") !== "heading") continue;
      if (accessibleName(element) !== "") continue;
      ctx.push({
        rule: "empty-heading",
        impact: "serious",
        message: `${describe$1(element)} is an empty heading.`,
        help: "Screen-reader users jump between headings; an empty one is a stop with nothing to announce. Give it text or remove it.",
        element
      });
    }
  },
  (ctx) => {
    for (const element of ctx.elements) {
      const isItem = element.tagName === "LI" || element.getAttribute("role") === "listitem";
      if (!isItem) continue;
      const parent = element.parentElement;
      const parentRole = parent?.getAttribute("role");
      const ok = parent && (parent.tagName === "UL" || parent.tagName === "OL" || parent.tagName === "MENU" || parentRole === "list" || parentRole === "group");
      if (ok) continue;
      if (parentRole === "none" || parentRole === "presentation") continue;
      ctx.push({
        rule: "list-structure",
        impact: "moderate",
        message: `${describe$1(element)} is a list item outside a list.`,
        help: 'Assistive tech announces "list, N items" from the parent. Put the item inside a List, or drop the item role.',
        element
      });
    }
  },
  (ctx) => {
    const TRISTATE = /* @__PURE__ */ new Set(["aria-checked", "aria-pressed"]);
    const BOOLEAN = ["aria-expanded", "aria-selected", "aria-hidden", "aria-disabled", "aria-required", "aria-readonly", "aria-busy", "aria-modal", "aria-multiselectable"];
    for (const element of ctx.elements) {
      for (const attr of [...BOOLEAN, ...TRISTATE]) {
        const value = element.getAttribute(attr);
        if (value === null) continue;
        const valid = value === "true" || value === "false" || TRISTATE.has(attr) && value === "mixed" || attr === "aria-expanded" && value === "undefined";
        if (valid) continue;
        ctx.push({
          rule: "aria-valid-attr-value",
          impact: "serious",
          message: `${describe$1(element)} has ${attr}="${value}".`,
          help: `${attr} takes "true" or "false"${TRISTATE.has(attr) ? ' (or "mixed")' : ""}. Anything else — including an empty string — is ignored or read as the wrong state.`,
          element,
          detail: `${attr}="${value}"`
        });
      }
      const invalid = element.getAttribute("aria-invalid");
      if (invalid !== null && !["true", "false", "grammar", "spelling"].includes(invalid)) {
        ctx.push({
          rule: "aria-valid-attr-value",
          impact: "moderate",
          message: `${describe$1(element)} has aria-invalid="${invalid}".`,
          help: 'aria-invalid takes "true", "false", "grammar", or "spelling".',
          element
        });
      }
    }
  },
  (ctx) => {
    const REQUIRED_PARENT = {
      tab: ["tablist"],
      option: ["listbox", "combobox", "group"],
      menuitem: ["menu", "menubar", "group"],
      menuitemcheckbox: ["menu", "menubar", "group"],
      menuitemradio: ["menu", "menubar", "group"],
      treeitem: ["tree", "group"],
      row: ["table", "grid", "treegrid", "rowgroup"],
      cell: ["row"],
      gridcell: ["row"],
      columnheader: ["row"],
      rowheader: ["row"]
    };
    for (const element of ctx.elements) {
      const role = element.getAttribute("role");
      if (!role) continue;
      const parents = REQUIRED_PARENT[role];
      if (!parents) continue;
      let ancestor = element.parentElement;
      let found = false;
      for (let i = 0; ancestor && i < 6; i += 1, ancestor = ancestor.parentElement) {
        const ancestorRole = ancestor.getAttribute("role") ?? implicitRole(ancestor);
        if (ancestorRole && parents.includes(ancestorRole)) {
          found = true;
          break;
        }
        if (ancestorRole && !["generic", "none", "presentation"].includes(ancestorRole) && ancestor.tagName !== "DIV" && ancestor.tagName !== "SPAN") break;
      }
      if (found) continue;
      ctx.push({
        rule: "aria-required-parent",
        impact: "serious",
        message: `${describe$1(element)} has role="${role}" outside a ${parents.join(" / ")}.`,
        help: `A ${role} only means something inside its container — without it, arrow-key navigation and "1 of N" announcements break.`,
        element
      });
    }
  },
  (ctx) => {
    for (const element of ctx.elements) {
      const role = element.getAttribute("role");
      if (role !== "presentation" && role !== "none") continue;
      const focusable = element.matches(FOCUSABLE_SELECTOR) && element.getAttribute("tabindex") !== "-1" && !element.disabled;
      const named = element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby");
      if (!focusable && !named) continue;
      ctx.push({
        rule: "presentation-role-conflict",
        impact: "serious",
        message: `${describe$1(element)} is role="${role}" but is ${focusable ? "focusable" : "named"}.`,
        help: "A presentational element is removed from the accessibility tree; if it is focusable or labelled, the role is ignored and users land on an unexplained stop.",
        element
      });
    }
  },
  (ctx) => {
    for (const element of ctx.elements) {
      const tag = element.tagName.toLowerCase();
      const role = element.getAttribute("role");
      if (tag === "svg" && role === "img") {
        const titled = element.querySelector("title")?.textContent?.trim();
        if (titled || element.getAttribute("aria-label")?.trim() || element.hasAttribute("aria-labelledby")) continue;
        ctx.push({
          rule: "svg-img-alt",
          impact: "serious",
          message: 'An <svg role="img"> has no name.',
          help: 'Give the icon an aria-label, or mark it decorative with aria-hidden="true" if a visible label is next to it.',
          element
        });
      } else if (tag !== "svg" && tag !== "img" && role === "img" && accessibleName(element) === "") {
        ctx.push({
          rule: "role-img-alt",
          impact: "serious",
          message: `${describe$1(element)} has role="img" and no name.`,
          help: "Add aria-label describing the image.",
          element
        });
      }
      if (tag === "iframe" && !element.getAttribute("title")?.trim() && !element.getAttribute("aria-label")?.trim()) {
        ctx.push({
          rule: "iframe-title",
          impact: "serious",
          message: "An <iframe> has no title.",
          help: "Screen readers announce frames by title — add one that says what the frame contains.",
          element
        });
      }
      if (tag === "summary" && (element.textContent ?? "").trim() === "" && !element.getAttribute("aria-label")) {
        ctx.push({
          rule: "summary-name",
          impact: "serious",
          message: "A <summary> has no text.",
          help: "The summary is the disclosure's button; give it a label.",
          element
        });
      }
      if (tag === "video" && !element.querySelector('track[kind="captions"], track[kind="subtitles"]') && !element.hasAttribute("muted")) {
        ctx.push({
          rule: "video-caption",
          impact: "critical",
          message: "A <video> has no captions track.",
          help: 'Add <track kind="captions" srclang="en" src="…"> so deaf and hard-of-hearing users get the audio.',
          element
        });
      }
    }
  },
  (ctx) => {
    for (const element of ctx.elements) {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) continue;
      const labels = element.labels;
      if (labels && labels.length > 0 || element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby") || element.getAttribute("placeholder")) continue;
      if (!element.getAttribute("title")) continue;
      ctx.push({
        rule: "label-title-only",
        impact: "moderate",
        message: `${describe$1(element)} is labelled only by its title attribute.`,
        help: "Tooltips are not shown on touch or to keyboard users. Add `label:` to the field.",
        element
      });
    }
  },
  (ctx) => {
    const TOKENS = /* @__PURE__ */ new Set([
      "on",
      "off",
      "name",
      "honorific-prefix",
      "given-name",
      "additional-name",
      "family-name",
      "honorific-suffix",
      "nickname",
      "email",
      "username",
      "new-password",
      "current-password",
      "one-time-code",
      "organization-title",
      "organization",
      "street-address",
      "address-line1",
      "address-line2",
      "address-line3",
      "address-level4",
      "address-level3",
      "address-level2",
      "address-level1",
      "country",
      "country-name",
      "postal-code",
      "cc-name",
      "cc-given-name",
      "cc-additional-name",
      "cc-family-name",
      "cc-number",
      "cc-exp",
      "cc-exp-month",
      "cc-exp-year",
      "cc-csc",
      "cc-type",
      "transaction-currency",
      "transaction-amount",
      "language",
      "bday",
      "bday-day",
      "bday-month",
      "bday-year",
      "sex",
      "tel",
      "tel-country-code",
      "tel-national",
      "tel-area-code",
      "tel-local",
      "tel-extension",
      "impp",
      "url",
      "photo",
      "webauthn",
      "shipping",
      "billing",
      "home",
      "work",
      "mobile",
      "fax",
      "pager"
    ]);
    for (const element of ctx.elements) {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) continue;
      const value = element.getAttribute("autocomplete");
      if (!value) continue;
      const bad = value.trim().toLowerCase().split(/\s+/).filter((token) => token && !TOKENS.has(token) && !token.startsWith("section-"));
      if (bad.length === 0) continue;
      ctx.push({
        rule: "autocomplete-valid",
        impact: "moderate",
        message: `${describe$1(element)} has autocomplete="${value}".`,
        help: `"${bad.join(" ")}" is not an autocomplete token, so browsers and assistive tech cannot fill or identify the field.`,
        element
      });
    }
  },
  (ctx) => {
    if (typeof getComputedStyle !== "function") return;
    for (const element of ctx.elements) {
      let style;
      try {
        style = getComputedStyle(element);
      } catch {
        continue;
      }
      const overflowY = style.overflowY;
      if (overflowY !== "auto" && overflowY !== "scroll") continue;
      const el = element;
      if (!(el.scrollHeight > el.clientHeight + 4) || el.clientHeight === 0) continue;
      if (el.tabIndex >= 0 && el.hasAttribute("tabindex")) continue;
      let hasFocusable = false;
      try {
        hasFocusable = el.querySelector(FOCUSABLE_SELECTOR) !== null;
      } catch {
        hasFocusable = false;
      }
      if (hasFocusable) continue;
      ctx.push({
        rule: "scrollable-region-focusable",
        impact: "moderate",
        message: `${describe$1(element)} scrolls but cannot be reached with the keyboard.`,
        help: 'Keyboard users scroll with arrow keys on a focused element. Add tabindex="0" and an accessible name (role="region" + aria-label).',
        element
      });
    }
  },
  (ctx) => {
    if (typeof getComputedStyle !== "function") return;
    let reported = 0;
    for (const element of ctx.elements) {
      if (reported >= 10) return;
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) continue;
      if (element instanceof HTMLInputElement && ["hidden", "checkbox", "radio", "range", "color", "file", "submit", "button", "reset", "image"].includes(element.type)) continue;
      let style;
      try {
        style = getComputedStyle(element);
      } catch {
        continue;
      }
      const width = Number.parseFloat(style.borderBottomWidth);
      if (!(width > 0)) continue;
      const border = parseColor(style.borderBottomColor);
      const fieldBg = parseColor(style.backgroundColor);
      const parent = element.parentElement;
      const outside = parent ? effectiveBackground(parent) : null;
      if (!border || !outside || border.a === 0) continue;
      const fillSeparates = fieldBg && fieldBg.a > 0.5 && contrastRatio(over(fieldBg, outside), outside) >= 3;
      if (fillSeparates) continue;
      const ratio = contrastRatio(over(border, outside), outside);
      if (ratio >= 3) continue;
      reported += 1;
      ctx.push({
        rule: "non-text-contrast",
        impact: "moderate",
        message: `${describe$1(element)}'s border has ${ratio.toFixed(2)}:1 contrast against its background (needs 3:1).`,
        help: "Low-vision users find fields by their outline. Raise the theme's `colorBorderControl` token.",
        element,
        detail: `${ratio.toFixed(2)}:1 vs 3:1`
      });
    }
  },
  (ctx) => {
    const root = ctx.root;
    const headings = ctx.elements.filter((el) => /^H[1-6]$/.test(el.tagName)).length;
    if (headings < 3 && ctx.elements.length < 150) return;
    const hasMain = ctx.elements.some((el) => el.tagName === "MAIN" || el.getAttribute("role") === "main");
    if (hasMain) return;
    let node = root;
    for (let i = 0; node && i < 40; i += 1) {
      if (node instanceof Element && (node.tagName === "MAIN" || node.getAttribute("role") === "main")) return;
      node = node.parentNode ?? node.host ?? null;
    }
    ctx.push({
      rule: "landmark-main",
      impact: "minor",
      message: "The app has no main landmark (and is not inside one).",
      help: 'Screen-reader users jump to "main" to skip navigation. Wrap the primary content in a Main / role="main" region.',
      element: root
    });
  }
];
function hasOwnText(element) {
  for (const node of element.childNodes) {
    if (node.nodeType === 3 && (node.textContent ?? "").trim() !== "") return true;
  }
  return false;
}
function describe$1(element) {
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute("role");
  const label = text$1(element);
  const bits = [`<${tag}${role ? ` role="${role}"` : ""}>`];
  if (label) bits.push(`"${label}"`);
  return bits.join(" ");
}
function text$1(element) {
  const raw = (element.textContent ?? "").replace(/\s+/g, " ").trim();
  return raw.length > 40 ? `${raw.slice(0, 40)}…` : raw;
}
function shortSrc(element) {
  const src = element.getAttribute("src") ?? "";
  const parts = src.split("/");
  return parts[parts.length - 1] || "no src";
}
function groupFindings(findings) {
  const groups = /* @__PURE__ */ new Map();
  for (const finding of findings) {
    const existing = groups.get(finding.rule);
    if (existing) existing.count += 1;
    else groups.set(finding.rule, { rule: finding.rule, impact: finding.impact, count: 1, first: finding });
  }
  return [...groups.values()].sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact]);
}
function isHiddenFromAll(element) {
  if (element.hidden) return true;
  if (element.closest("[inert]")) return true;
  if (typeof getComputedStyle !== "function") return false;
  try {
    const style = getComputedStyle(element);
    return style.display === "none" || style.visibility === "hidden";
  } catch {
    return false;
  }
}
function tabOrder(root, limit = 400) {
  if (!root) return [];
  let candidates = [];
  try {
    candidates = [...root.querySelectorAll(FOCUSABLE_SELECTOR)];
  } catch {
    return [];
  }
  const positive = [];
  const natural = [];
  candidates.forEach((element, index) => {
    const raw = element.getAttribute("tabindex");
    const tab = raw === null ? 0 : Number(raw);
    if (!Number.isFinite(tab) || tab < 0) return;
    if (element.disabled) return;
    if (element instanceof HTMLInputElement && element.type === "hidden") return;
    if (element.tagName === "A" && !element.hasAttribute("href") && raw === null) return;
    if (isHiddenFromAll(element)) return;
    if (tab > 0) positive.push({ element, index, tab });
    else natural.push(element);
  });
  positive.sort((a, b) => a.tab - b.tab || a.index - b.index);
  return [...positive.map((p) => p.element), ...natural].slice(0, limit);
}
const LANDMARK_ROLES = /* @__PURE__ */ new Set(["banner", "navigation", "main", "complementary", "contentinfo", "region", "search", "form"]);
function landmarks(root) {
  if (!root) return [];
  const out = [];
  let all = [];
  try {
    all = [root, ...root.querySelectorAll("*")];
  } catch {
    return [];
  }
  for (const element of all) {
    let role = element.getAttribute("role") ?? implicitRole(element);
    const tag = element.tagName;
    if (!role && tag === "SECTION" && (element.hasAttribute("aria-label") || element.hasAttribute("aria-labelledby"))) role = "region";
    if (!role || !LANDMARK_ROLES.has(role)) continue;
    if ((role === "region" || role === "form") && !element.hasAttribute("aria-label") && !element.hasAttribute("aria-labelledby")) continue;
    const name = element.getAttribute("aria-label") ?? (element.hasAttribute("aria-labelledby") ? accessibleName(element) : "");
    out.push({ element, role, label: name ? `${role} “${name}”` : role });
  }
  return out;
}
function headingOutline(root) {
  if (!root) return [];
  const out = [];
  let previous = 0;
  let nodes = [];
  try {
    nodes = [...root.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')];
  } catch {
    return [];
  }
  for (const element of nodes) {
    const level = /^H[1-6]$/.test(element.tagName) ? Number(element.tagName[1]) : Number(element.getAttribute("aria-level") ?? 2) || 2;
    out.push({ element, level, text: accessibleName(element), skipped: previous !== 0 && level > previous + 1 });
    previous = level;
  }
  return out;
}
const STATE_ATTRS = [
  ["aria-expanded", (v) => v === "true" ? "expanded" : v === "false" ? "collapsed" : null],
  ["aria-checked", (v) => v === "true" ? "checked" : v === "mixed" ? "mixed" : v === "false" ? "not checked" : null],
  ["aria-pressed", (v) => v === "true" ? "pressed" : v === "false" ? "not pressed" : null],
  ["aria-selected", (v) => v === "true" ? "selected" : null],
  ["aria-disabled", (v) => v === "true" ? "disabled" : null],
  ["aria-required", (v) => v === "true" ? "required" : null],
  ["aria-invalid", (v) => v && v !== "false" ? "invalid entry" : null],
  ["aria-current", (v) => v && v !== "false" ? "current" : null]
];
const SPOKEN_ROLE = {
  textbox: "edit text",
  searchbox: "search text field",
  combobox: "combo box",
  listbox: "list box",
  checkbox: "checkbox",
  radio: "radio button",
  switch: "switch",
  link: "link",
  button: "button",
  heading: "heading",
  img: "image",
  slider: "slider",
  spinbutton: "stepper",
  tab: "tab",
  tablist: "tab list",
  tabpanel: "tab panel",
  dialog: "dialog",
  alertdialog: "alert dialog",
  navigation: "navigation",
  main: "main",
  banner: "banner",
  contentinfo: "content information",
  complementary: "complementary",
  region: "region",
  list: "list",
  listitem: "list item",
  menu: "menu",
  menuitem: "menu item",
  progressbar: "progress indicator",
  table: "table",
  row: "row",
  cell: "cell",
  columnheader: "column header",
  option: "option",
  tree: "tree",
  treeitem: "tree item",
  alert: "alert",
  status: "status"
};
function statesOf(element) {
  const out = [];
  for (const [attr, read] of STATE_ATTRS) {
    const value = element.getAttribute(attr);
    if (value === null) continue;
    const spoken = read(value);
    if (spoken) out.push(spoken);
  }
  if (element.disabled && !out.includes("disabled")) out.push("disabled");
  if (element instanceof HTMLInputElement) {
    if ((element.type === "checkbox" || element.type === "radio") && !element.hasAttribute("aria-checked")) out.push(element.checked ? "checked" : "not checked");
    if (element.required && !out.includes("required")) out.push("required");
  }
  if (/^H[1-6]$/.test(element.tagName)) out.unshift(`level ${element.tagName[1]}`);
  return out;
}
function accessibilityTree(root, limit = 3e3) {
  if (!root) return [];
  let count = 0;
  let seq = 0;
  const visit = (element) => {
    if (count >= limit) return [];
    if (element.getAttribute("aria-hidden") === "true" || isHiddenFromAll(element)) return [];
    const tag = element.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEMPLATE") return [];
    const explicit = element.getAttribute("role");
    const role = explicit === "none" || explicit === "presentation" ? null : explicit ?? implicitRole(element);
    const children = [];
    for (const child of element.children) children.push(...visit(child));
    const hasOwnText2 = [...element.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "");
    const focusable = element.matches(FOCUSABLE_SELECTOR) && element.getAttribute("tabindex") !== "-1" && !element.disabled;
    if (!role && !hasOwnText2 && !focusable) return children;
    count += 1;
    const effectiveRole = role ?? (hasOwnText2 ? "text" : "generic");
    return [{
      id: `ax${seq += 1}`,
      role: effectiveRole,
      name: effectiveRole === "text" ? (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 120) : accessibleName(element),
      element,
      states: statesOf(element),
      focusable,
      children: effectiveRole === "text" ? [] : children
    }];
  };
  return visit(root);
}
function announce(element) {
  const role = element.getAttribute("role") ?? implicitRole(element) ?? "";
  const name = accessibleName(element);
  const spoken = SPOKEN_ROLE[role] ?? role;
  const parts = [name ? `“${name}”` : "(unnamed)", spoken, ...statesOf(element)].filter(Boolean);
  const description = element.getAttribute("aria-describedby");
  if (description) {
    const rootNode = element.getRootNode();
    const text2 = description.split(/\s+/).map((id) => {
      try {
        return rootNode.getElementById?.(id)?.textContent?.trim() ?? "";
      } catch {
        return "";
      }
    }).filter(Boolean).join(" ");
    if (text2) parts.push(text2);
  }
  return parts.join(", ");
}
function chooseQuery(element, root) {
  const testId = element.getAttribute("data-testid") ?? element.getAttribute("data-test-id");
  if (testId) return { kind: "testid", value: testId };
  const role = element.getAttribute("role") ?? implicitRole(element);
  const name = accessibleName(element);
  if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
    const labels = element.labels;
    const labelText = labels && labels.length > 0 ? (labels[0].textContent ?? "").replace(/\s+/g, " ").trim() : "";
    if (labelText) return { kind: "label", value: labelText };
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel?.trim()) return { kind: "label", value: ariaLabel.trim() };
    if (element instanceof HTMLInputElement && element.placeholder) {
      return { kind: "placeholder", value: element.placeholder };
    }
    if (role) return { kind: "role", value: role, name: name || void 0 };
  }
  if (role && name) return { kind: "role", value: role, name };
  if (role) return { kind: "role", value: role };
  if (name) return { kind: "text", value: name };
  return { kind: "css", value: cssPath(element, root) };
}
function queryExpression(query) {
  switch (query.kind) {
    case "testid":
      return `screen.getByTestId(${str(query.value)})`;
    case "role":
      return query.name ? `screen.getByRole(${str(query.value)}, { name: ${str(query.name)} })` : `screen.getByRole(${str(query.value)})`;
    case "label":
      return `screen.getByLabelText(${str(query.value)})`;
    case "placeholder":
      return `screen.getByPlaceholderText(${str(query.value)})`;
    case "text":
      return `screen.getByText(${str(query.value)})`;
    case "css":
      return `(screen.container.shadowRoot!.querySelector(${str(query.value)}) as HTMLElement)`;
  }
}
function queryLabel(query) {
  switch (query.kind) {
    case "testid":
      return `testid "${query.value}"`;
    case "role":
      return query.name ? `${query.value} "${query.name}"` : query.value;
    case "label":
      return `label "${query.value}"`;
    case "placeholder":
      return `placeholder "${query.value}"`;
    case "text":
      return `text "${query.value}"`;
    case "css":
      return query.value;
  }
}
function str(value) {
  return JSON.stringify(value);
}
const INTERACTIONS = /* @__PURE__ */ new Set(["click", "type", "select", "check", "uncheck", "key"]);
const NAVIGATION_WINDOW_MS = 1500;
class InteractionRecorder {
  constructor() {
    __publicField(this, "steps", []);
    __publicField(this, "target", null);
    __publicField(this, "listeners", []);
    __publicField(this, "recording", false);
    __publicField(this, "onChange", null);
    /** Element whose typing is still being coalesced into the last step. */
    __publicField(this, "typingElement", null);
  }
  /** True while events are being captured. */
  get isRecording() {
    return this.recording;
  }
  /** Steps recorded so far, oldest first. */
  list() {
    return this.steps;
  }
  /** Drop every recorded step. */
  clear() {
    this.steps.length = 0;
    this.typingElement = null;
    this.onChange?.();
  }
  /** Remove one step by index (a misclick should not poison the test). */
  remove(index) {
    if (index < 0 || index >= this.steps.length) return;
    this.steps.splice(index, 1);
    this.typingElement = null;
    this.onChange?.();
  }
  /**
   * Start capturing on `root`.
   *
   * Listeners are attached in the CAPTURE phase so a handler that calls
   * `stopPropagation()` (a menu closing itself, a form intercepting submit)
   * cannot hide the interaction from the recorder.
   */
  start(root, onChange) {
    if (this.recording || !root) return false;
    this.target = root;
    this.onChange = onChange;
    this.recording = true;
    const add = (type, handler) => {
      root.addEventListener(type, handler, true);
      this.listeners.push([type, handler]);
    };
    add("click", (event) => this.onClick(event));
    add("input", (event) => this.onInput(event));
    add("change", (event) => this.onChangeEvent(event));
    add("keydown", (event) => this.onKeyDown(event));
    return true;
  }
  /** Stop capturing, keeping the recorded steps. */
  stop() {
    if (!this.recording) return;
    const root = this.target;
    if (root) {
      for (const [type, handler] of this.listeners) {
        root.removeEventListener(type, handler, true);
      }
    }
    this.listeners = [];
    this.recording = false;
    this.target = null;
  }
  /**
   * Append a step the DOM cannot report — a route change, or an explicit wait.
   * The panel calls this when it sees a `route` event while recording, so a test
   * that navigates mid-flow reproduces the navigation instead of silently
   * depending on it.
   */
  addStep(step) {
    if (!this.recording) return;
    const last = this.steps[this.steps.length - 1];
    if (step.type === "navigate" && last) {
      if ((last.type === "navigate" || last.type === "assert" && last.assertion === "route") && last.value === step.value) return;
      if (INTERACTIONS.has(last.type) && Date.now() - last.time < NAVIGATION_WINDOW_MS) {
        const path = step.value ?? "/";
        this.steps.push({ type: "assert", assertion: "route", value: path, label: `route is ${path}`, time: Date.now() });
        this.typingElement = null;
        this.onChange?.();
        return;
      }
    }
    this.steps.push({ ...step, time: Date.now() });
    this.typingElement = null;
    this.onChange?.();
  }
  /**
   * Record an assertion about `element` — "this is visible", "this says X",
   * "this field holds Y", "this box is checked". Allowed while stopped too:
   * assertions are usually added after the interactions they check.
   */
  addAssertion(element, assertion, root) {
    const query = chooseQuery(element, root ?? this.target);
    let value;
    if (assertion === "text") value = (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (assertion === "value") value = element.value ?? "";
    if (assertion === "checked") value = String(element.checked === true);
    const label = assertion === "visible" ? `expect ${queryLabel(query)} to be visible` : assertion === "checked" ? `expect ${queryLabel(query)} to be ${value === "true" ? "checked" : "unchecked"}` : `expect ${queryLabel(query)} to ${assertion === "text" ? "say" : "hold"} ${JSON.stringify(value)}`;
    const step = { type: "assert", query, assertion, value, label, time: Date.now() };
    this.steps.push(step);
    this.typingElement = null;
    this.onChange?.();
    return step;
  }
  /** Move a step (for reordering in the recorder list). */
  move(from, to) {
    if (from < 0 || from >= this.steps.length || to < 0 || to >= this.steps.length || from === to) return;
    const [step] = this.steps.splice(from, 1);
    this.steps.splice(to, 0, step);
    this.typingElement = null;
    this.onChange?.();
  }
  /** Replace the whole list (loading a saved flow). */
  load(steps) {
    this.steps.length = 0;
    this.steps.push(...steps.map((step) => ({ ...step })));
    this.typingElement = null;
    this.onChange?.();
  }
  push(step) {
    this.steps.push({ ...step, time: Date.now() });
    this.onChange?.();
  }
  onClick(event) {
    const element = eventTarget(event);
    if (!element) return;
    if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
      const query2 = chooseQuery(element, this.target);
      const willCheck = !element.checked;
      this.push({
        type: element.type === "radio" || willCheck ? "check" : "uncheck",
        query: query2,
        label: `${willCheck ? "check" : "uncheck"} ${queryLabel(query2)}`
      });
      this.typingElement = null;
      return;
    }
    const control = closestInteractive(element);
    if (!control) return;
    const query = chooseQuery(control, this.target);
    this.push({ type: "click", query, label: `click ${queryLabel(query)}` });
    this.typingElement = null;
  }
  onInput(event) {
    const element = eventTarget(event);
    if (!element) return;
    if (element instanceof HTMLSelectElement) return;
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;
    if (element.type === "checkbox" || element.type === "radio") return;
    const value = element.value;
    const query = chooseQuery(element, this.target);
    const last = this.steps[this.steps.length - 1];
    if (this.typingElement === element && last?.type === "type") {
      last.value = value;
      last.label = `type ${JSON.stringify(value)} into ${queryLabel(query)}`;
      this.onChange?.();
      return;
    }
    this.typingElement = element;
    this.push({
      type: "type",
      query,
      value,
      label: `type ${JSON.stringify(value)} into ${queryLabel(query)}`
    });
  }
  onChangeEvent(event) {
    const element = eventTarget(event);
    if (!(element instanceof HTMLSelectElement)) return;
    const query = chooseQuery(element, this.target);
    this.push({
      type: "select",
      query,
      value: element.value,
      label: `select ${JSON.stringify(element.value)} in ${queryLabel(query)}`
    });
    this.typingElement = null;
  }
  onKeyDown(event) {
    if (!["Enter", "Escape", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
    const element = eventTarget(event);
    if (!element) return;
    const query = chooseQuery(element, this.target);
    this.push({
      type: "key",
      query,
      key: event.key,
      label: `press ${event.key} on ${queryLabel(query)}`
    });
  }
}
function eventTarget(event) {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  const first = path[0] ?? event.target;
  return first instanceof Element ? first : null;
}
function closestInteractive(element) {
  let current = element;
  let guard = 0;
  while (current && guard++ < 12) {
    const tag = current.tagName.toLowerCase();
    if (tag === "button" || tag === "a" || tag === "summary" || tag === "input" || tag === "select" || tag === "textarea") return current;
    const role = current.getAttribute("role");
    if (role && ["button", "link", "tab", "menuitem", "option", "switch", "checkbox", "radio"].includes(role)) return current;
    if (current.hasAttribute("data-testid")) return current;
    current = current.parentElement;
  }
  return null;
}
function generateTest(steps, options = {}) {
  const pkg = options.packageName ?? "aktion-runtime/test";
  const title = options.title ?? "reproduces the recorded interaction";
  const lines2 = [];
  if (options.vitestImports !== false) {
    lines2.push(`import { afterEach, expect, it } from "vitest";`);
  }
  lines2.push(`import { render, cleanup } from ${str(pkg)};`);
  lines2.push("");
  if (options.vitestImports !== false) {
    lines2.push("afterEach(cleanup);");
    lines2.push("");
  }
  lines2.push(`const program = \`${escapeTemplate(options.program ?? '$app(Text("replace me"))')}\`;`);
  lines2.push("");
  lines2.push(`it(${str(title)}, async () => {`);
  lines2.push("  const screen = render(program);");
  lines2.push("  await screen.flush();");
  let usesCss = false;
  for (const step of steps) {
    if (step.query?.kind === "css") usesCss = true;
    lines2.push(`  ${stepCode(step)}`);
  }
  if (options.assertions && options.assertions.length > 0) {
    lines2.push("");
    for (const assertion of options.assertions) {
      lines2.push(`  expect(screen.state.get(${str(assertion.name)})).toEqual(${literal(assertion.value)});`);
    }
  }
  lines2.push("});");
  if (usesCss) {
    lines2.push("");
    lines2.push("// NOTE: one or more steps fell back to a CSS selector because the element");
    lines2.push("// had no test id, role, label, or text to match on. Those steps will break");
    lines2.push("// when the markup around them changes — add `testId:` or a label instead.");
  }
  return lines2.join("\n");
}
function stepCode(step) {
  const query = step.query ? queryExpression(step.query) : "";
  switch (step.type) {
    case "click":
      return `await screen.click(${query});`;
    case "type":
      return `await screen.type(${query}, ${str(step.value ?? "")});`;
    case "select":
      return `await screen.user.selectOption(${query}, ${str(step.value ?? "")});`;
    case "check":
      return `await screen.user.check(${query});`;
    case "uncheck":
      return `await screen.user.uncheck(${query});`;
    case "key":
      return `await screen.user.keyboard(${query}, ${str(step.key ?? "Enter")});`;
    case "navigate":
      return `await screen.navigate(${str(step.value ?? "/")});`;
    case "wait":
      return `await screen.flush();`;
    case "assert":
      switch (step.assertion) {
        case "text":
          return `expect(${query}.textContent).toContain(${str(step.value ?? "")});`;
        case "value":
          return `expect((${query} as HTMLInputElement).value).toBe(${str(step.value ?? "")});`;
        case "checked":
          return `expect((${query} as HTMLInputElement).checked).toBe(${step.value === "true"});`;
        case "route":
          return `expect(screen.route).toBe(${str(step.value ?? "/")});`;
        default:
          return `expect(${query}).toBeTruthy();`;
      }
  }
}
function escapeTemplate(text2) {
  return text2.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}
function literal(value) {
  try {
    return JSON.stringify(value) ?? "undefined";
  } catch {
    return "undefined";
  }
}
function generateSnapshotTest(program, state, options = {}) {
  const pkg = options.packageName ?? "aktion-runtime/test";
  return [
    `import { afterEach, expect, it } from "vitest";`,
    `import { render, cleanup } from ${str(pkg)};`,
    "",
    "afterEach(cleanup);",
    "",
    `const program = \`${escapeTemplate(program)}\`;`,
    "",
    `it(${str(options.title ?? "renders the recorded snapshot")}, async () => {`,
    "  const screen = render(program);",
    "  await screen.flush();",
    `  expect(screen.state.snapshot()).toEqual(${JSON.stringify(state, null, 2).split("\n").join("\n  ")});`,
    "  expect(screen.html()).toMatchSnapshot();",
    "});"
  ].join("\n");
}
function playwrightLocator(query) {
  switch (query.kind) {
    case "testid":
      return `page.getByTestId(${str(query.value)})`;
    case "role":
      return query.name ? `page.getByRole(${str(query.value)}, { name: ${str(query.name)}, exact: true })` : `page.getByRole(${str(query.value)})`;
    case "label":
      return `page.getByLabel(${str(query.value)}, { exact: true })`;
    case "placeholder":
      return `page.getByPlaceholder(${str(query.value)}, { exact: true })`;
    case "text":
      return `page.getByText(${str(query.value)}, { exact: true })`;
    case "css":
      return `page.locator(${str(query.value)})`;
  }
}
const PW_KEYS = { Escape: "Escape", Enter: "Enter", Tab: "Tab", ArrowUp: "ArrowUp", ArrowDown: "ArrowDown", ArrowLeft: "ArrowLeft", ArrowRight: "ArrowRight" };
function escapeRegExp(text2) {
  return text2.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}
function generatePlaywrightTest(steps, options = {}) {
  const url = options.url ?? (typeof location !== "undefined" ? `${location.origin}${location.pathname}${location.search}` : "http://localhost:5173/");
  const lines2 = [
    `import { test, expect } from "@playwright/test";`,
    "",
    `test(${str(options.title ?? "reproduces the recorded interaction")}, async ({ page }) => {`,
    `  await page.goto(${str(url)});`,
    `  await expect(page.locator("aktion-app").first()).toBeVisible();`
  ];
  let usesCss = false;
  for (const step of steps) {
    const locator = step.query ? playwrightLocator(step.query) : "";
    if (step.query?.kind === "css") usesCss = true;
    switch (step.type) {
      case "click":
        lines2.push(`  await ${locator}.click();`);
        break;
      case "type":
        lines2.push(`  await ${locator}.fill(${str(step.value ?? "")});`);
        break;
      case "select":
        lines2.push(`  await ${locator}.selectOption(${str(step.value ?? "")});`);
        break;
      case "check":
        lines2.push(`  await ${locator}.check();`);
        break;
      case "uncheck":
        lines2.push(`  await ${locator}.uncheck();`);
        break;
      case "key":
        lines2.push(`  await ${locator}.press(${str(PW_KEYS[step.key ?? ""] ?? step.key ?? "Enter")});`);
        break;
      case "navigate": {
        const path = step.value ?? "/";
        lines2.push(options.routerMode === "history" ? `  await page.goto(new URL(${str(path)}, page.url()).toString());` : `  await page.evaluate((path) => { location.hash = path; }, ${str(path)});`);
        break;
      }
      case "wait":
        lines2.push("  await page.waitForTimeout(100);");
        break;
      case "assert":
        switch (step.assertion) {
          case "text":
            lines2.push(`  await expect(${locator}).toContainText(${str(step.value ?? "")});`);
            break;
          case "value":
            lines2.push(`  await expect(${locator}).toHaveValue(${str(step.value ?? "")});`);
            break;
          case "checked":
            lines2.push(step.value === "true" ? `  await expect(${locator}).toBeChecked();` : `  await expect(${locator}).not.toBeChecked();`);
            break;
          case "route": {
            const path = step.value ?? "/";
            const tail = options.routerMode === "history" ? path : `#${path}`;
            lines2.push(`  await expect(page).toHaveURL(new RegExp(${str(`${escapeRegExp(tail)}$`)}));`);
            break;
          }
          default:
            lines2.push(`  await expect(${locator}).toBeVisible();`);
            break;
        }
        break;
    }
  }
  lines2.push("});");
  if (usesCss) {
    lines2.push("", "// NOTE: steps using page.locator(css) fell back to a DOM path because the element had no", "// test id, role, label, or text. Add `testId:` to those components to make the test robust.");
  }
  return lines2.join("\n");
}
function ownText(element) {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim();
}
function resolveQuery(root, query) {
  if (!root) return [];
  let all;
  try {
    all = [...root.querySelectorAll("*")];
  } catch {
    return [];
  }
  switch (query.kind) {
    case "testid":
      return all.filter((el) => el.getAttribute("data-testid") === query.value || el.getAttribute("data-test-id") === query.value);
    case "role": {
      const role = query.value.toLowerCase();
      return all.filter((el) => (el.getAttribute("role") ?? implicitRole(el))?.toLowerCase() === role && (query.name === void 0 || accessibleName(el).trim() === query.name.trim()));
    }
    case "label":
      return all.filter((el) => {
        const isField = el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement;
        if (isField) {
          const labels = el.labels;
          const labelText = labels && labels.length > 0 ? ownText(labels[0]) : "";
          if (labelText === query.value) return true;
        }
        return (el.getAttribute("aria-label") ?? "").trim() === query.value;
      });
    case "placeholder":
      return all.filter((el) => el.getAttribute("placeholder") === query.value);
    case "text": {
      const matches = all.filter((el) => el.tagName !== "STYLE" && el.tagName !== "SCRIPT" && ownText(el) === query.value);
      return matches.filter((el) => !matches.some((other) => other !== el && el.contains(other)));
    }
    case "css":
      try {
        return [...root.querySelectorAll(query.value)];
      } catch {
        return [];
      }
  }
}
function setNativeValue(element, value) {
  const proto = Object.getPrototypeOf(element);
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
}
async function replayStep(step, root, navigate, currentRoute) {
  if (step.type === "assert" && step.assertion === "route") {
    if (!currentRoute) return { ok: false, message: "This app does not expose its route." };
    const want = step.value ?? "/";
    for (let attempt = 0; attempt < 10 && currentRoute() !== want; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 30));
    const got = currentRoute();
    return { ok: got === want, message: got === want ? `route is ${want}` : `expected route ${want}, got ${got}` };
  }
  if (step.type === "navigate") {
    if (!navigate) return { ok: false, message: "This app cannot be navigated from DevTools." };
    navigate(step.value ?? "/");
    return { ok: true, message: `navigated to ${step.value ?? "/"}` };
  }
  if (step.type === "wait") {
    await new Promise((resolve) => setTimeout(resolve, 100));
    return { ok: true, message: "waited" };
  }
  if (!step.query) return { ok: false, message: "step has no target" };
  const matches = resolveQuery(root, step.query);
  if (matches.length === 0) return { ok: false, message: `no element matches ${queryLabel(step.query)}` };
  const element = matches[0];
  const fire = (type, init = {}) => {
    element.dispatchEvent(new Event(type, { bubbles: true, composed: true, ...init }));
  };
  switch (step.type) {
    case "click":
      element.click();
      return { ok: true, message: `clicked ${queryLabel(step.query)}`, element };
    case "type": {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return { ok: false, message: "target is not a text field", element };
      element.focus();
      setNativeValue(element, step.value ?? "");
      fire("input");
      fire("change");
      return { ok: true, message: `typed ${JSON.stringify(step.value ?? "")}`, element };
    }
    case "select": {
      if (!(element instanceof HTMLSelectElement)) return { ok: false, message: "target is not a select", element };
      setNativeValue(element, step.value ?? "");
      fire("input");
      fire("change");
      return { ok: true, message: `selected ${JSON.stringify(step.value ?? "")}`, element };
    }
    case "check":
    case "uncheck": {
      const want = step.type === "check";
      const box = element;
      if (box.checked !== want || box.type === "radio") box.click();
      return { ok: box.checked === want, message: `${step.type}ed`, element };
    }
    case "key": {
      const key2 = step.key ?? "Enter";
      element.focus();
      element.dispatchEvent(new KeyboardEvent("keydown", { key: key2, bubbles: true, composed: true, cancelable: true }));
      element.dispatchEvent(new KeyboardEvent("keyup", { key: key2, bubbles: true, composed: true }));
      return { ok: true, message: `pressed ${key2}`, element };
    }
    case "assert": {
      switch (step.assertion) {
        case "text": {
          const text2 = ownText(element);
          const ok = text2.includes(step.value ?? "");
          return { ok, message: ok ? "text matches" : `expected ${JSON.stringify(step.value)}, got ${JSON.stringify(text2.slice(0, 80))}`, element };
        }
        case "value": {
          const value = element.value ?? "";
          const ok = value === (step.value ?? "");
          return { ok, message: ok ? "value matches" : `expected ${JSON.stringify(step.value)}, got ${JSON.stringify(value)}`, element };
        }
        case "checked": {
          const ok = String(element.checked === true) === step.value;
          return { ok, message: ok ? "checked state matches" : `expected ${step.value === "true" ? "checked" : "unchecked"}`, element };
        }
        default: {
          const ok = isVisible(element);
          return { ok, message: ok ? "visible" : "not visible", element };
        }
      }
    }
    default:
      return { ok: false, message: `cannot replay a ${step.type} step` };
  }
}
function isVisible(element) {
  if (!element.isConnected) return false;
  let current = element;
  for (let guard = 0; current && guard < 60; guard += 1) {
    if (current.hidden) return false;
    if (typeof getComputedStyle === "function") {
      try {
        const style = getComputedStyle(current);
        if (style.display === "none" || style.visibility === "hidden") return false;
      } catch {
      }
    }
    current = current.parentElement ?? (current.getRootNode().host ?? null);
  }
  const hasLayout = typeof document !== "undefined" && document.documentElement.getBoundingClientRect().width > 0;
  if (!hasLayout) return true;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 || rect.height > 0;
}
const LEVELS = ["log", "info", "warn", "error", "debug"];
const TAP_KEY = "__AKTION_DEVTOOLS_CONSOLE_TAP_V1__";
function sharedTap() {
  const holder = globalThis;
  let tap = holder[TAP_KEY];
  if (!tap) {
    tap = { sinks: /* @__PURE__ */ new Set(), originals: /* @__PURE__ */ new Map(), inSink: false, errorHandler: null, rejectionHandler: null };
    holder[TAP_KEY] = tap;
  }
  return tap;
}
function emit(level, args, stack) {
  const tap = sharedTap();
  if (tap.sinks.size === 0 || tap.inSink) return;
  tap.inSink = true;
  try {
    const rendered = args.map((arg) => typeof arg === "string" ? arg : previewOf(arg));
    const first = rendered[0] ?? "";
    const entry = {
      level,
      args: rendered,
      // The runtime prefixes every diagnostic it owns, which is the only
      // reliable way to tell its output from the program's.
      origin: first.startsWith("[aktion") ? "runtime" : "program",
      time: Date.now(),
      stack
    };
    for (const sink of [...tap.sinks]) {
      try {
        sink(entry);
      } catch {
      }
    }
  } catch {
  } finally {
    tap.inSink = false;
  }
}
function patch$1() {
  const tap = sharedTap();
  if (tap.originals.size > 0) return;
  const target = globalThis;
  const native = target.console;
  if (!native) return;
  for (const level of LEVELS) {
    const original = native[level];
    if (typeof original !== "function") continue;
    tap.originals.set(level, original);
    const forward = original;
    native[level] = (...args) => {
      try {
        forward.apply(native, args);
      } catch {
      }
      emit(level, args);
    };
  }
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    tap.errorHandler = (event) => {
      const error = event;
      emit("error", [error.message ?? "Uncaught error"], error.error instanceof Error ? error.error.stack : void 0);
    };
    tap.rejectionHandler = (event) => {
      const rejection = event;
      const reason = rejection.reason;
      emit(
        "error",
        [`Unhandled rejection: ${reason instanceof Error ? reason.message : previewOf(reason)}`],
        reason instanceof Error ? reason.stack : void 0
      );
    };
    window.addEventListener("error", tap.errorHandler);
    window.addEventListener("unhandledrejection", tap.rejectionHandler);
  }
}
function unpatch() {
  const tap = sharedTap();
  const target = globalThis;
  const native = target.console;
  if (native) {
    for (const [level, original] of tap.originals) {
      native[level] = original;
    }
  }
  tap.originals.clear();
  if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
    if (tap.errorHandler) window.removeEventListener("error", tap.errorHandler);
    if (tap.rejectionHandler) window.removeEventListener("unhandledrejection", tap.rejectionHandler);
  }
  tap.errorHandler = null;
  tap.rejectionHandler = null;
}
class ConsoleCapture {
  constructor() {
    __publicField(this, "sink", null);
  }
  get active() {
    return this.sink !== null;
  }
  /** Begin capturing. Calling twice replaces this instance's sink. */
  start(sink) {
    const tap = sharedTap();
    if (this.sink) tap.sinks.delete(this.sink);
    this.sink = sink;
    tap.sinks.add(sink);
    patch$1();
  }
  /** Stop capturing. The console is restored once no panel is listening. */
  stop() {
    const tap = sharedTap();
    if (this.sink) tap.sinks.delete(this.sink);
    this.sink = null;
    if (tap.sinks.size === 0) unpatch();
  }
}
class Widget {
  constructor(props) {
    __publicField(this, "props");
    /** The root element `mount` returned. */
    __publicField(this, "el");
    this.props = props;
  }
  /** New props arrived; `this.props` already holds them. */
  update(_previous) {
  }
  /** The node left the tree. Release listeners, observers, and timers here. */
  unmount() {
  }
}
function isWidgetCtor(value) {
  return typeof value === "function" && value.prototype instanceof Widget;
}
const EMPTY_PROPS = Object.freeze({});
function h(tag, props, ...children) {
  if (typeof tag === "string") {
    const p = props ?? EMPTY_PROPS;
    return {
      type: "e",
      tag,
      props: p,
      children: normalize(children),
      key: p.key,
      dom: null
    };
  }
  if (isWidgetCtor(tag)) {
    const p = props ?? {};
    return { type: "w", ctor: tag, props: p, key: p.key, dom: null, inst: null };
  }
  if (typeof tag === "function") {
    const p = { ...props ?? {}, children };
    return tag(p);
  }
  throw new TypeError("[aktion-devtools] h(): unsupported tag");
}
function text(value) {
  return { type: "t", text: String(value), key: void 0, dom: null };
}
function normalize(children) {
  const out = [];
  const visit = (child) => {
    if (child === null || child === void 0 || child === false || child === true) {
      out.push(text(""));
      return;
    }
    if (Array.isArray(child)) {
      for (const inner of child) visit(inner);
      return;
    }
    if (typeof child === "string" || typeof child === "number") {
      out.push(text(child));
      return;
    }
    out.push(child);
  };
  visit(children);
  return out;
}
const SVG_NS = "http://www.w3.org/2000/svg";
const ROOT_KEY = "__dtVNodes";
const LISTENERS_KEY = "__dtListeners";
function render$g(container, children) {
  const next = normalize(children);
  const state = container;
  const previous = state[ROOT_KEY] ?? [];
  patchChildren(container, previous, next, namespaceOf(container));
  state[ROOT_KEY] = next;
}
function unmountAll(container) {
  const state = container;
  const previous = state[ROOT_KEY];
  if (!previous) return;
  for (const node of previous) {
    destroy(node);
    if (node.dom && node.dom.parentNode === container) container.removeChild(node.dom);
  }
  state[ROOT_KEY] = [];
}
function namespaceOf(container) {
  if (container instanceof Element && container.namespaceURI === SVG_NS && container.tagName.toLowerCase() !== "foreignobject") {
    return SVG_NS;
  }
  return null;
}
function childNamespace(tag, ns) {
  if (tag === "svg") return SVG_NS;
  if (ns === SVG_NS && tag === "foreignObject") return null;
  return ns;
}
function create(node, ns) {
  switch (node.type) {
    case "t": {
      const dom = document.createTextNode(node.text);
      node.dom = dom;
      return dom;
    }
    case "w": {
      const inst = new node.ctor(node.props);
      let dom;
      try {
        dom = inst.mount();
      } catch (err) {
        console.error("[aktion-devtools] widget mount threw", err);
        dom = document.createElement("div");
        dom.className = "dt-widget-error";
        dom.textContent = `This view failed to load: ${err instanceof Error ? err.message : String(err)}`;
      }
      inst.el = dom;
      node.inst = inst;
      node.dom = dom;
      return dom;
    }
    case "e": {
      const elementNs = childNamespace(node.tag, ns);
      const dom = elementNs ? document.createElementNS(elementNs, node.tag) : document.createElement(node.tag);
      node.dom = dom;
      const inner = elementNs === SVG_NS && node.tag === "foreignObject" ? null : elementNs;
      for (const child of node.children) dom.appendChild(create(child, inner));
      const isSvg = elementNs === SVG_NS;
      for (const name in node.props) setProp(dom, name, void 0, node.props[name], isSvg);
      const ref = node.props.ref;
      if (typeof ref === "function") ref(dom);
      return dom;
    }
  }
}
function sameShape(a, b) {
  if (a.type !== b.type || a.key !== b.key) return false;
  if (a.type === "e") return a.tag === b.tag;
  if (a.type === "w") return a.ctor === b.ctor;
  return true;
}
function patch(parent, previous, next, ns) {
  if (previous === next) return;
  if (!sameShape(previous, next)) {
    const dom = create(next, ns);
    if (previous.dom && previous.dom.parentNode === parent) parent.replaceChild(dom, previous.dom);
    else parent.appendChild(dom);
    destroy(previous);
    return;
  }
  switch (next.type) {
    case "t": {
      const old = previous;
      const dom = old.dom;
      if (old.text !== next.text) dom.data = next.text;
      next.dom = dom;
      return;
    }
    case "w": {
      const old = previous;
      const inst = old.inst;
      const before = inst.props;
      inst.props = next.props;
      next.inst = inst;
      next.dom = old.dom;
      try {
        inst.update(before);
      } catch (err) {
        console.error("[aktion-devtools] widget update threw", err);
      }
      return;
    }
    case "e": {
      const old = previous;
      const dom = old.dom;
      next.dom = dom;
      const elementNs = childNamespace(next.tag, ns);
      const inner = elementNs === SVG_NS && next.tag === "foreignObject" ? null : elementNs;
      patchChildren(dom, old.children, next.children, inner);
      patchProps(dom, old.props, next.props, elementNs === SVG_NS);
      return;
    }
  }
}
function patchChildren(parent, previous, next, ns) {
  if (previous.length === 0 && next.length === 0) return;
  if (previous.length === 0) {
    for (const child of next) parent.appendChild(create(child, ns));
    return;
  }
  if (next.length === 0) {
    for (const child of previous) removeNode(parent, child);
    return;
  }
  if (previous.length === next.length) {
    let aligned = true;
    for (let i = 0; i < next.length; i += 1) {
      if (!sameShape(previous[i], next[i])) {
        aligned = false;
        break;
      }
    }
    if (aligned) {
      for (let i = 0; i < next.length; i += 1) patch(parent, previous[i], next[i], ns);
      return;
    }
  }
  const keyed = /* @__PURE__ */ new Map();
  const unkeyed = [];
  for (const child of previous) {
    if (child.key !== void 0) keyed.set(child.key, child);
    else unkeyed.push(child);
  }
  const used = /* @__PURE__ */ new Set();
  let ordinal = 0;
  for (const child of next) {
    let match;
    if (child.key !== void 0) {
      const candidate = keyed.get(child.key);
      if (candidate && !used.has(candidate) && sameShape(candidate, child)) match = candidate;
    } else {
      const candidate = unkeyed[ordinal];
      ordinal += 1;
      if (candidate && !used.has(candidate) && sameShape(candidate, child)) match = candidate;
    }
    if (match) {
      used.add(match);
      patch(parent, match, child, ns);
    } else {
      create(child, ns);
    }
  }
  for (const child of previous) {
    if (!used.has(child)) removeNode(parent, child);
  }
  let ref = null;
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const dom = next[i].dom;
    if (dom.parentNode !== parent || dom.nextSibling !== ref) parent.insertBefore(dom, ref);
    ref = dom;
  }
}
function removeNode(parent, node) {
  destroy(node);
  if (node.dom && node.dom.parentNode === parent) parent.removeChild(node.dom);
}
function destroy(node) {
  if (node.type === "w") {
    try {
      node.inst?.unmount();
    } catch (err) {
      console.error("[aktion-devtools] widget unmount threw", err);
    }
    return;
  }
  if (node.type === "e") {
    for (const child of node.children) destroy(child);
    const ref = node.props.ref;
    if (typeof ref === "function") ref(null);
  }
}
function patchProps(dom, previous, next, isSvg) {
  if (previous === next) return;
  for (const name in previous) {
    if (!(name in next)) setProp(dom, name, previous[name], void 0, isSvg);
  }
  const controlled = typeof next.onInput === "function";
  for (const name in next) {
    const value = next[name];
    const old = previous[name];
    if (value !== old || name === "value" && controlled || name === "checked") setProp(dom, name, old, value, isSvg);
  }
}
const autofocused = /* @__PURE__ */ new WeakSet();
function autofocus(options = {}) {
  return (element) => {
    if (!element || autofocused.has(element)) return;
    autofocused.add(element);
    queueMicrotask(() => {
      if (!element.isConnected) return;
      element.focus({ preventScroll: true });
      if (options.select) element.select?.();
    });
  };
}
function dispatchEvent(event) {
  const map = this[LISTENERS_KEY];
  const handler = map?.[event.type];
  if (handler) handler(event);
}
function setListener(dom, name, handler) {
  const type = name.slice(2).toLowerCase();
  const holder = dom;
  let map = holder[LISTENERS_KEY];
  if (!map) {
    map = {};
    holder[LISTENERS_KEY] = map;
  }
  const fn = typeof handler === "function" ? handler : void 0;
  if (!(type in map)) {
    if (!fn) return;
    dom.addEventListener(type, dispatchEvent, type === "wheel" || type === "touchmove" ? { passive: false } : void 0);
  }
  map[type] = fn;
}
function classString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(classString).filter(Boolean).join(" ");
  if (typeof value === "object") {
    const out = [];
    for (const [name, on] of Object.entries(value)) if (on) out.push(name);
    return out.join(" ");
  }
  return String(value);
}
function kebab(name) {
  if (name.startsWith("--")) return name;
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}
function setStyle(dom, previous, value) {
  const style = dom.style;
  if (!style) return;
  if (value == null || value === false) {
    dom.removeAttribute("style");
    return;
  }
  if (typeof value === "string") {
    if (style.cssText !== value) style.cssText = value;
    return;
  }
  const next = value;
  const old = typeof previous === "object" && previous !== null ? previous : {};
  if (typeof previous === "string") style.cssText = "";
  for (const name in old) {
    if (!(name in next)) style.removeProperty(kebab(name));
  }
  for (const name in next) {
    const v = next[name];
    if (v === old[name] && typeof previous !== "string") continue;
    if (v == null || v === false || v === "") style.removeProperty(kebab(name));
    else style.setProperty(kebab(name), String(v));
  }
}
const DOM_PROPERTIES = /* @__PURE__ */ new Set(["checked", "indeterminate", "selected", "muted"]);
function setProp(dom, name, previous, value, isSvg) {
  if (name === "key" || name === "children" || name === "ref") return;
  if (name.length > 2 && name[0] === "o" && name[1] === "n") {
    setListener(dom, name, value);
    return;
  }
  if (name === "class" || name === "className") {
    const cls = classString(value);
    if (isSvg) {
      if (cls) dom.setAttribute("class", cls);
      else dom.removeAttribute("class");
    } else if (dom.className !== cls) {
      dom.className = cls;
    }
    return;
  }
  if (name === "style") {
    setStyle(dom, previous, value);
    return;
  }
  if (name === "value" && !isSvg) {
    const field2 = dom;
    const next = value == null ? "" : String(value);
    if (field2.value !== next) field2.value = next;
    return;
  }
  if (DOM_PROPERTIES.has(name) && !isSvg) {
    dom[name] = Boolean(value);
    return;
  }
  if (typeof value === "boolean" && name.startsWith("aria-")) {
    const spelled = value ? "true" : "false";
    if (dom.getAttribute(name) !== spelled) dom.setAttribute(name, spelled);
    return;
  }
  if (value == null || value === false) {
    dom.removeAttribute(name);
    return;
  }
  const attr = value === true ? "" : String(value);
  if (dom.getAttribute(name) !== attr) dom.setAttribute(name, attr);
}
const FALLBACK_VIEWPORT = 480;
const raf$1 = typeof requestAnimationFrame === "function" ? (fn) => {
  requestAnimationFrame(() => fn());
} : (fn) => {
  setTimeout(fn, 16);
};
class VirtualList extends Widget {
  constructor() {
    super(...arguments);
    __publicField(this, "sizer");
    __publicField(this, "windowEl");
    __publicField(this, "emptyEl");
    __publicField(this, "framePending", false);
    __publicField(this, "resizeObserver", null);
    __publicField(this, "lastRange", "");
    __publicField(this, "atBottom", true);
    __publicField(this, "onScroll", () => {
      const el = this.el;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
      if (atBottom !== this.atBottom) {
        this.atBottom = atBottom;
        this.props.onStickChange?.(atBottom);
      }
      if (this.framePending) return;
      this.framePending = true;
      raf$1(() => {
        this.framePending = false;
        this.paint(false);
      });
    });
  }
  mount() {
    const props = this.props;
    const focusable = props.focusable ?? props.onKeyDown !== void 0;
    const root = document.createElement("div");
    root.className = `vlist ${props.className ?? ""}`;
    if (props.role) root.setAttribute("role", props.role);
    if (props.ariaLabel) root.setAttribute("aria-label", props.ariaLabel);
    if (props.testid) root.setAttribute("data-dt", props.testid);
    if (focusable) root.tabIndex = 0;
    this.sizer = document.createElement("div");
    this.sizer.className = "vlist-sizer";
    this.windowEl = document.createElement("div");
    this.windowEl.className = "vlist-window";
    this.windowEl.setAttribute("role", "presentation");
    this.sizer.appendChild(this.windowEl);
    this.emptyEl = document.createElement("div");
    this.emptyEl.className = "vlist-empty";
    root.append(this.sizer, this.emptyEl);
    root.addEventListener("scroll", this.onScroll, { passive: true });
    root.addEventListener("keydown", (event) => this.props.onKeyDown?.(event));
    this.el = root;
    if (typeof ResizeObserver === "function") {
      this.resizeObserver = new ResizeObserver(() => this.paint(false));
      this.resizeObserver.observe(root);
    }
    this.paint(true);
    return root;
  }
  update(previous) {
    const props = this.props;
    const el = this.el;
    if (props.className !== previous.className) el.className = `vlist ${props.className ?? ""}`;
    if (props.ariaLabel !== previous.ariaLabel) {
      if (props.ariaLabel) el.setAttribute("aria-label", props.ariaLabel);
      else el.removeAttribute("aria-label");
    }
    const dataChanged = props.items !== previous.items || props.version !== previous.version || props.rowHeight !== previous.rowHeight || props.empty !== previous.empty;
    const follow = props.stickToBottom === true && this.atBottom && props.items.length > previous.items.length;
    if (dataChanged) this.paint(true);
    if (follow) {
      el.scrollTop = el.scrollHeight;
      this.paint(true);
    }
    if (props.scrollTo !== previous.scrollTo && props.scrollTo !== null && props.scrollTo !== void 0) {
      this.reveal(props.scrollTo);
    }
  }
  unmount() {
    this.el.removeEventListener("scroll", this.onScroll);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    unmountAll(this.windowEl);
    unmountAll(this.emptyEl);
  }
  /** Scroll the minimum distance needed to show `index`. */
  reveal(index) {
    const el = this.el;
    const { rowHeight } = this.props;
    const viewport = el.clientHeight || FALLBACK_VIEWPORT;
    const top = index * rowHeight;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + rowHeight > el.scrollTop + viewport) el.scrollTop = top + rowHeight - viewport;
    this.paint(true);
  }
  paint(force) {
    const props = this.props;
    const el = this.el;
    const count = props.items.length;
    const rowHeight = Math.max(1, props.rowHeight);
    if (count === 0) {
      this.sizer.style.height = "0px";
      if (this.lastRange !== "empty" || force) {
        render$g(this.windowEl, null);
        render$g(this.emptyEl, props.empty ?? null);
        this.lastRange = "empty";
      }
      return;
    }
    if (this.lastRange === "empty") render$g(this.emptyEl, null);
    const total = count * rowHeight;
    this.sizer.style.height = `${total}px`;
    const viewport = el.clientHeight || FALLBACK_VIEWPORT;
    const maxTop = Math.max(0, total - viewport);
    const scrollTop = Math.min(el.scrollTop, maxTop);
    const overscan = props.overscan ?? 6;
    const start2 = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const end = Math.min(count, Math.ceil((scrollTop + viewport) / rowHeight) + overscan);
    const range = `${start2}:${end}`;
    if (!force && range === this.lastRange) return;
    this.lastRange = range;
    const rows = [];
    for (let i = start2; i < end; i += 1) {
      const item = props.items[i];
      const key2 = props.rowKey ? props.rowKey(item, i) : i;
      rows.push(h("div", { key: key2, class: "vrow", role: "presentation", style: { height: `${rowHeight}px` } }, props.renderRow(item, i)));
    }
    this.windowEl.style.transform = `translateY(${start2 * rowHeight}px)`;
    render$g(this.windowEl, rows);
  }
}
function virtualList(props) {
  return h(VirtualList, props);
}
const ICONS = {
  /* ---- sections ---- */
  overview: "r:3.5,3.5,7,9,1.5|r:13.5,3.5,7,5,1.5|r:13.5,11.5,7,9,1.5|r:3.5,15.5,7,5,1.5",
  inspect: "M12 3l8 4.5v9L12 21l-8-4.5v-9z|M12 12l8-4.5|M12 12v9|M12 12L4 7.5",
  state: "M8 4H7a2 2 0 0 0-2 2v3.5a2.5 2.5 0 0 1-2 2.5 2.5 2.5 0 0 1 2 2.5V18a2 2 0 0 0 2 2h1|M16 4h1a2 2 0 0 1 2 2v3.5a2.5 2.5 0 0 0 2 2.5 2.5 2.5 0 0 0-2 2.5V18a2 2 0 0 1-2 2h-1|f:c:12,12,1.6",
  data: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z|M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6|M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  routes: "c:6,19,2|c:18,5,2|M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16",
  timeline: "M4 6h8|M8 12h11|M6 18h7|M3.5 3v18",
  network: "M7 4v16|M3.5 7.5L7 4l3.5 3.5|M17 20V4|M13.5 16.5L17 20l3.5-3.5",
  console: "r:3,4,18,16,2.5|M7.5 9.5l3 2.5-3 2.5|M13 15h3.5",
  effects: "M13 2.5L4.5 13.5H11l-1 8 8.5-11H12z",
  profiler: "M4.6 18.5a9 9 0 1 1 14.8 0|M12 13.5l3.8-3.8|f:c:12,13.5,1.6",
  a11y: "c:12,12,9|f:c:12,7.3,1.4|M7.5 10l4.5 1.1 4.5-1.1|M12 11.1v3.1|M12 14.2l-2.4 3.8|M12 14.2l2.4 3.8",
  security: "M12 3l7 2.8v5.4c0 4.8-3.2 8.3-7 9.8-3.8-1.5-7-5-7-9.8V5.8z|M9 12l2.2 2.2L15.2 10",
  test: "M9 3h6|M10 3v6.2l-5.3 9.2A1.8 1.8 0 0 0 6.3 21h11.4a1.8 1.8 0 0 0 1.6-2.6L14 9.2V3|M7.3 15.5h9.4",
  source: "M8 7l-5 5 5 5|M16 7l5 5-5 5|M13.6 4.5l-3.2 15",
  theme: "M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.5-1.1-.3-.3-.5-.7-.5-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5c0-4.3-4-7.6-9-7.6z|f:c:7.5,11,1.2|f:c:10.5,7,1.2|f:c:15,7.5,1.2",
  settings: "M4 7h9|M17 7h3|M4 17h3|M11 17h9|c:15,7,2|c:9,17,2",
  /* ---- actions ---- */
  pick: "M4.5 9V5.5a1 1 0 0 1 1-1H9|M15 4.5h3.5a1 1 0 0 1 1 1V9|M9 19.5H5.5a1 1 0 0 1-1-1V15|M11 11l8.5 3.2-3.7 1.3-1.4 3.9z",
  search: "c:10.5,10.5,6.5|M20 20l-4.8-4.8",
  close: "M6 6l12 12|M18 6L6 18",
  plus: "M12 5v14|M5 12h14",
  minus: "M5 12h14",
  check: "M5 12.5l4.5 4.5L19 7.5",
  chevronRight: "M9.5 6l6 6-6 6",
  chevronDown: "M6 9.5l6 6 6-6",
  chevronLeft: "M14.5 6l-6 6 6 6",
  chevronUp: "M6 14.5l6-6 6 6",
  arrowRight: "M5 12h14|M13 6l6 6-6 6",
  arrowUpRight: "M7 17L17 7|M8 7h9v9",
  copy: "r:8.5,8.5,11.5,11.5,2|M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5",
  download: "M12 4v11|M7 10.5l5 4.5 5-4.5|M5 20h14",
  upload: "M12 15V4|M7 8.5L12 4l5 4.5|M5 20h14",
  trash: "M4 7h16|M10 11v6|M14 11v6|M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12|M9 7V4.5h6V7",
  refresh: "M20 11a8 8 0 0 0-14.6-4.5|M4.5 3.5v4h4|M4 13a8 8 0 0 0 14.6 4.5|M19.5 20.5v-4h-4",
  play: "f:M8 5.2v13.6a.6.6 0 0 0 .9.5l10.3-6.8a.6.6 0 0 0 0-1L8.9 4.7a.6.6 0 0 0-.9.5z",
  pause: "M8.5 5v14|M15.5 5v14",
  stop: "f:r:6.5,6.5,11,11,2",
  record: "f:c:12,12,6",
  stepBack: "M18 6l-8 6 8 6z|M6 6v12",
  stepForward: "M6 6l8 6-8 6z|M18 6v12",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z|c:12,12,3",
  eyeOff: "M3 3l18 18|M10.6 5.6A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4|M6.6 6.7C4 8.4 2.5 12 2.5 12S6 18.5 12 18.5c1.8 0 3.4-.6 4.7-1.4|M9.9 9.9a3 3 0 0 0 4.2 4.2",
  pin: "M15 4l5 5|M16.5 5.5l-4.3 4.3-4.7 1 5.7 5.7 1-4.7 4.3-4.3|M9.3 14.7L4 20",
  filter: "M4 5h16l-6.2 7.6V19l-3.6 2v-8.4z",
  more: "f:c:5.5,12,1.5|f:c:12,12,1.5|f:c:18.5,12,1.5",
  moreVertical: "f:c:12,5.5,1.5|f:c:12,12,1.5|f:c:12,18.5,1.5",
  dockRight: "r:3,4.5,18,15,2|M14.5 4.5v15",
  dockBottom: "r:3,4.5,18,15,2|M3 13.5h18",
  dockLeft: "r:3,4.5,18,15,2|M9.5 4.5v15",
  dockFloat: "r:5.5,7.5,15,12,2|M3.5 15V6a1.5 1.5 0 0 1 1.5-1.5h11",
  popout: "M14 4h6v6|M20 4l-8.5 8.5|M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10",
  sun: "c:12,12,4|M12 2.5v2|M12 19.5v2|M4.6 4.6l1.4 1.4|M18 18l1.4 1.4|M2.5 12h2|M19.5 12h2|M4.6 19.4L6 18|M18 6l1.4-1.4",
  moon: "M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z",
  keyboard: "r:2.5,6,19,12,2.5|M6.5 10h.01|M10 10h.01|M14 10h.01|M17.5 10h.01|M7.5 14h9",
  command: "M9 9H6.5A2.5 2.5 0 1 1 9 6.5z|M15 9V6.5A2.5 2.5 0 1 1 17.5 9z|M15 15h2.5a2.5 2.5 0 1 1-2.5 2.5z|M9 15v2.5A2.5 2.5 0 1 1 6.5 15z|r:9,9,6,6,0",
  info: "c:12,12,9|M12 11v5.5|f:c:12,7.8,1.1",
  warning: "M12 3.5l9.5 16.5h-19z|M12 10v4.5|f:c:12,17.3,1.1",
  error: "c:12,12,9|M15 9l-6 6|M9 9l6 6",
  checkCircle: "c:12,12,9|M8 12.3l2.8 2.8L16.2 9.5",
  clock: "c:12,12,9|M12 7.5V12l3 2",
  link: "M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1|M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1",
  external: "M14 4h6v6|M20 4l-9 9|M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5",
  target: "c:12,12,8|c:12,12,3|M12 2v3|M12 19v3|M2 12h3|M19 12h3",
  layers: "M12 3.5l9 4.8-9 4.8-9-4.8z|M3 12.4l9 4.8 9-4.8|M3 16.4l9 4.8 9-4.8",
  box: "M21 8l-9-5-9 5v8l9 5 9-5z|M3 8l9 5 9-5|M12 13v8",
  flame: "M12 21c-3.9 0-6.5-2.7-6.5-6.2 0-3.8 3-5.7 3.9-9.3.3-1.3 1.8-1.8 2.6-.8 1.1 1.4 1.6 3 1.7 4.4.9-.5 1.5-1.4 1.8-2.3.3-.9 1.5-1.1 2 0 1 1.9 1.5 4 1.5 6 0 5-3.1 8.2-7 8.2z|M12 21c-1.6 0-2.8-1.2-2.8-2.8 0-1.8 1.4-2.6 2.2-4 .2-.4.8-.4 1 0 .9 1.4 2.4 2.4 2.4 4 0 1.6-1.2 2.8-2.8 2.8z",
  graph: "c:5,6,2|c:19,6,2|c:12,18,2.5|c:12,9,1.6|M6.8 7l3.8 1.4|M17.2 7l-3.8 1.4|M12 10.6v4.9",
  bug: "r:7,7.5,10,13,5|M12 11v9|M7 13H3.5|M20.5 13H17|M7.5 9L5 6.5|M16.5 9L19 6.5|M7.2 17.5L4.5 20|M16.8 17.5l2.7 2.5|M9 7.5a3 3 0 0 1 6 0",
  wand: "M4 20L15 9|M13.5 7.5l3 3|M17 3v3|M15.5 4.5h3|M20 8.5v2|M19 9.5h2|M8.5 4v2|M7.5 5h2",
  sparkles: "M12 3.5l1.9 5.1L19 10.5l-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z|M18.5 16l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z",
  offline: "M3 3l18 18|M8.5 16.5a5 5 0 0 1 7 0|M5 12.9a10 10 0 0 1 3.9-2.5|M12.6 9.5A10 10 0 0 1 19 12.9|M1.5 9.5A15 15 0 0 1 6 6.6|M11 4.5a15 15 0 0 1 11.5 5|f:c:12,19.8,1.2",
  gauge: "M4.6 18.5a9 9 0 1 1 14.8 0|M12 13.5l3.8-3.8|f:c:12,13.5,1.6",
  cpu: "r:6,6,12,12,2|r:9.5,9.5,5,5,1|M9 2.5V6|M15 2.5V6|M9 18v3.5|M15 18v3.5|M2.5 9H6|M2.5 15H6|M18 9h3.5|M18 15h3.5",
  list: "M9 6h11|M9 12h11|M9 18h11|f:c:4.5,6,1.2|f:c:4.5,12,1.2|f:c:4.5,18,1.2",
  tree: "M5 4v13a2 2 0 0 0 2 2h3|M5 9h5|f:r:12,6.5,8,5,1.5|f:r:12,16.5,8,5,1.5",
  grid: "r:4,4,7,7,1.5|r:13,4,7,7,1.5|r:4,13,7,7,1.5|r:13,13,7,7,1.5",
  history: "M3.5 12a8.5 8.5 0 1 0 2.5-6|M3 3.5V8h4.5|M12 8v4l3 2",
  bookmark: "M6.5 3.5h11a1 1 0 0 1 1 1V21l-6.5-4.5L5.5 21V4.5a1 1 0 0 1 1-1z",
  save: "M5 3.5h11l3.5 3.5v12a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5z|M8 3.5V8h7V3.5|r:7.5,13,9,7.5,1",
  undo: "M9 14L4 9l5-5|M4 9h10.5a5.5 5.5 0 0 1 0 11H11",
  redo: "M15 14l5-5-5-5|M20 9H9.5a5.5 5.5 0 0 0 0 11H13",
  edit: "M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z|M13.5 6.5l4 4",
  hash: "M4 9h16|M4 15h16|M10 3.5L8 20.5|M16 3.5l-2 17",
  type: "M5 7V5h14v2|M12 5v14|M9 19h6",
  image: "r:3.5,4.5,17,15,2|f:c:9,9.5,1.6|M20.5 15.5l-5-5-9.5 9",
  cursor: "M5 3.5l13 7.1-5.6 1.5-2.6 5.4z|M12.4 12.1l5.1 6.4",
  lock: "r:5,10.5,14,10,2|M8 10.5V7.5a4 4 0 0 1 8 0v3",
  unlock: "r:5,10.5,14,10,2|M8 10.5V7.5a4 4 0 0 1 7.7-1.5",
  key: "c:8,15,4.5|M11.2 11.8L20 3|M16.5 6.5l2.5 2.5|M14 9l2 2",
  cookie: "M12 3a9 9 0 1 0 9 9 3.5 3.5 0 0 1-4-3.5A3.5 3.5 0 0 1 13.5 5 2 2 0 0 1 12 3z|f:c:8.5,10,1.1|f:c:11,15.5,1.1|f:c:15.5,14,1.1",
  globe: "c:12,12,9|M3 12h18|M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z",
  server: "r:3.5,4,17,7,2|r:3.5,13,17,7,2|f:c:7.5,7.5,1.1|f:c:7.5,16.5,1.1",
  send: "M21 3L10.5 13.5|M21 3l-6.5 18-4-7.5-7.5-4z",
  user: "c:12,8,4|M4.5 20.5a7.5 7.5 0 0 1 15 0",
  star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z",
  contrast: "c:12,12,9|f:M12 3a9 9 0 0 1 0 18z",
  droplet: "M12 3.5s6.5 7 6.5 11.5a6.5 6.5 0 0 1-13 0C5.5 10.5 12 3.5 12 3.5z",
  ruler: "M3.5 16.5L16.5 3.5l4 4-13 13z|M7.5 12.5l2 2|M10.5 9.5l2 2|M13.5 6.5l2 2",
  diff: "c:6,6,2.5|c:18,18,2.5|M13 6h3a2 2 0 0 1 2 2v7.5|M11 18H8a2 2 0 0 1-2-2V8.5|M15.5 3.5L13 6l2.5 2.5|M8.5 15.5L11 18l-2.5 2.5",
  file: "M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z|M14 3.5v5h5",
  folder: "M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z",
  puzzle: "M10 4.5a2 2 0 0 1 4 0V6h3.5a1 1 0 0 1 1 1v3.5H20a2 2 0 0 1 0 4h-1.5V18a1 1 0 0 1-1 1H14v-1.5a2 2 0 0 0-4 0V19H6.5a1 1 0 0 1-1-1v-3.5H7a2 2 0 0 0 0-4H5.5V7a1 1 0 0 1 1-1H10z",
  live: "c:12,12,2.5|M7.8 16.2a6 6 0 0 1 0-8.4|M16.2 7.8a6 6 0 0 1 0 8.4|M4.9 19.1a10 10 0 0 1 0-14.2|M19.1 4.9a10 10 0 0 1 0 14.2",
  camera: "M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z|c:12,13,3.5",
  dice: "r:4,4,16,16,3.5|f:c:8.5,8.5,1.3|f:c:15.5,8.5,1.3|f:c:12,12,1.3|f:c:8.5,15.5,1.3|f:c:15.5,15.5,1.3",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  zap: "M13 2.5L4.5 13.5H11l-1 8 8.5-11H12z",
  split: "r:3.5,4.5,17,15,2|M12 4.5v15",
  maximize: "M4 9V4h5|M15 4h5v5|M20 15v5h-5|M9 20H4v-5",
  minimize: "M9 4v5H4|M20 9h-5V4|M15 20v-5h5|M4 15h5v5",
  panel: "r:3.5,4.5,17,15,2|M3.5 9h17",
  dot: "f:c:12,12,3",
  move: "M12 3v18|M3 12h18|M9 5.5l3-2.5 3 2.5|M9 18.5l3 2.5 3-2.5|M5.5 9L3 12l2.5 3|M18.5 9l2.5 3-2.5 3",
  mail: "r:3,5,18,14,2|M3.5 6l8.5 7 8.5-7",
  inbox: "M4 13.5l2-8a1.5 1.5 0 0 1 1.5-1h9a1.5 1.5 0 0 1 1.5 1l2 8V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z|M4 13.5h4.5l1.5 2.5h4l1.5-2.5H20",
  scan: "M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8|M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8|M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16|M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16|M4 12h16",
  focus: "c:12,12,3|M3.5 8V5a1.5 1.5 0 0 1 1.5-1.5h3|M16 3.5h3A1.5 1.5 0 0 1 20.5 5v3|M20.5 16v3a1.5 1.5 0 0 1-1.5 1.5h-3|M8 20.5H5A1.5 1.5 0 0 1 3.5 19v-3",
  heading: "M6 4v16|M18 4v16|M6 12h12",
  landmark: "M3.5 20.5h17|M5.5 17V10|M10 17V10|M14 17V10|M18.5 17V10|M3 8l9-4.5L21 8z",
  tabOrder: "M4 7h8|M8 3.5L12 7l-4 3.5|M20 17h-8|M16 13.5L12 17l4 3.5",
  vision: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z|f:M12 9a3 3 0 0 1 0 6z|c:12,12,3",
  code: "M8 7l-5 5 5 5|M16 7l5 5-5 5",
  brackets: "M8 4H5v16h3|M16 4h3v16h-3",
  replay: "M3.5 12a8.5 8.5 0 1 0 2.5-6|M3 3.5V8h4.5|f:M10.5 9.2v5.6a.4.4 0 0 0 .6.4l4.3-2.8a.4.4 0 0 0 0-.7l-4.3-2.8a.4.4 0 0 0-.6.3z",
  assert: "r:4,4,16,16,3|M8 12.3l2.8 2.8L16.2 9.5",
  wait: "M7 3.5h10|M7 20.5h10|M8 3.5c0 4 8 4.5 8 8.5s-8 4.5-8 8.5|M16 3.5c0 4-8 4.5-8 8.5s8 4.5 8 8.5",
  keyboardKey: "r:4,4,16,16,3|M9 12h6",
  scenario: "M4 5.5h16|M4 12h10|M4 18.5h7|M17.5 14.5l3.5 2.5-3.5 2.5z",
  tag: "M3.5 11.6V4.5a1 1 0 0 1 1-1h7.1a1 1 0 0 1 .7.3l8.4 8.4a1 1 0 0 1 0 1.4l-7.1 7.1a1 1 0 0 1-1.4 0l-8.4-8.4a1 1 0 0 1-.3-.7z|f:c:8,8,1.5"
};
const parsed = /* @__PURE__ */ new Map();
function parseShapes(source) {
  const cached = parsed.get(source);
  if (cached) return cached;
  const shapes = [];
  for (let raw of source.split("|")) {
    let filled = false;
    if (raw.startsWith("f:")) {
      filled = true;
      raw = raw.slice(2);
    }
    if (raw.startsWith("c:")) {
      const [cx, cy, r] = raw.slice(2).split(",");
      shapes.push({ tag: "circle", attrs: { cx, cy, r }, filled });
    } else if (raw.startsWith("r:")) {
      const [x, y, width, height, rx] = raw.slice(2).split(",");
      shapes.push({ tag: "rect", attrs: { x, y, width, height, rx: rx ?? "0" }, filled });
    } else {
      shapes.push({ tag: "path", attrs: { d: raw }, filled });
    }
  }
  parsed.set(source, shapes);
  return shapes;
}
function icon(name, options = {}) {
  const size = options.size ?? 16;
  const shapes = parseShapes(ICONS[name]);
  return h(
    "svg",
    {
      class: `ic ${options.className ?? ""}`,
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "1.75",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": options.label ? void 0 : "true",
      role: options.label ? "img" : void 0,
      "aria-label": options.label,
      focusable: "false"
    },
    ...shapes.map((shape) => h(shape.tag, shape.filled ? { ...shape.attrs, fill: "currentColor", stroke: "none" } : shape.attrs))
  );
}
let markSeq = 0;
function logoMark(size = 18) {
  const id = `dt-mark-${markSeq += 1}`;
  return h(
    "svg",
    { class: "dt-mark", width: size, height: size, viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true", focusable: "false" },
    h(
      "defs",
      {},
      h(
        "linearGradient",
        { id, x1: "3", y1: "21", x2: "21", y2: "3", gradientUnits: "userSpaceOnUse" },
        h("stop", { offset: "0", "stop-color": "#6366f1" }),
        h("stop", { offset: "0.55", "stop-color": "#7c6cff" }),
        h("stop", { offset: "1", "stop-color": "#38bdf8" })
      )
    ),
    h("path", {
      d: "M3.8 20.2L10.3 5.2c.6-1.3 2.3-1.3 2.9 0l2 4.4",
      stroke: `url(#${id})`,
      "stroke-width": "3",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    }),
    h("path", {
      d: "M8.2 15.6L19.6 5.4",
      stroke: `url(#${id})`,
      "stroke-width": "3",
      "stroke-linecap": "round"
    }),
    h("path", {
      d: "M13.8 4.9h6.1v6.1",
      stroke: `url(#${id})`,
      "stroke-width": "3",
      "stroke-linecap": "round",
      "stroke-linejoin": "round"
    })
  );
}
function fuzzyScore(query, text2) {
  if (query === "") return 0;
  const q = query.toLowerCase();
  const t = text2.toLowerCase();
  let score = 0;
  let ti = 0;
  let lastHit = -2;
  for (const char of q) {
    const found = t.indexOf(char, ti);
    if (found < 0) return null;
    const atWordStart = found === 0 || /[\s·:/(-]/.test(t[found - 1] ?? "");
    score += found - ti;
    if (found === lastHit + 1) score -= 1;
    if (atWordStart) score -= 2;
    lastHit = found;
    ti = found + 1;
  }
  return score + text2.length / 100;
}
function fuzzyPositions(query, text2) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const t = text2.toLowerCase();
  const contiguous = t.indexOf(q);
  if (contiguous >= 0) return Array.from({ length: q.length }, (_, i) => contiguous + i);
  const out = [];
  let ti = 0;
  for (const char of q) {
    if (char === " ") continue;
    let found = -1;
    for (let i = ti; i < t.length; i += 1) {
      if (t[i] === char && (i === 0 || /[\s·:/(-]/.test(t[i - 1]))) {
        found = i;
        break;
      }
    }
    if (found < 0) found = t.indexOf(char, ti);
    if (found < 0) return [];
    out.push(found);
    ti = found + 1;
  }
  return out;
}
function rankCommands(commands, query) {
  const trimmed = query.trim();
  if (trimmed === "") return [...commands];
  const needle = trimmed.toLowerCase();
  const scored = [];
  for (const command of commands) {
    const haystack = `${command.group} · ${command.label} ${command.keywords ?? ""}`;
    const base2 = fuzzyScore(trimmed, haystack);
    if (base2 === null) continue;
    const label = command.label.toLowerCase();
    let score = base2;
    if (label === needle) score -= 100;
    else if (label.startsWith(needle)) score -= 20;
    if (command.group === "Go to") score -= 3;
    scored.push({ command, score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.map((entry) => entry.command);
}
const SHORTCUT_GROUPS = [
  {
    title: "Anywhere on the page",
    items: [
      ["Shift Alt D", "Show or hide DevTools"],
      ["Shift Alt C", "Pick an element to inspect"],
      ["Shift Alt K", "Open the command palette"]
    ]
  },
  {
    title: "In the panel",
    items: [
      ["⌘/Ctrl K", "Command palette"],
      ["Alt 1…9", "Jump to a section"],
      ["Alt [  Alt ]", "Previous / next section"],
      ["/", "Focus the view's search"],
      ["?", "This list"],
      ["Esc", "Close a menu or dialog, cancel the picker or an edit"]
    ]
  },
  {
    title: "Lists and trees",
    items: [
      ["↑ ↓", "Move the selection"],
      ["← →", "Collapse / expand"],
      ["Enter", "Edit the value · open the detail"],
      ["Home End", "First / last row"]
    ]
  },
  {
    title: "Element picker",
    items: [
      ["↑ ↓", "Walk to the parent / back to the child"],
      ["Alt wheel", "Same, with the mouse"],
      ["Enter", "Select the highlighted element"]
    ]
  },
  {
    title: "Charts",
    items: [
      ["Wheel", "Zoom around the pointer"],
      ["Shift wheel  Drag", "Pan"],
      ["Shift drag", "Select a time range (Timeline)"],
      ["Double-click", "Zoom to a span / reset"],
      ["← →", "Previous / next commit"]
    ]
  },
  {
    title: "Editors",
    items: [
      ["Enter", "Commit an inline edit"],
      ["⌘/Ctrl Enter", "Apply a program edit"],
      ["Tab  Shift Tab", "Indent / outdent"],
      ["↑ ↓", "REPL history"]
    ]
  }
];
const SHORTCUTS = SHORTCUT_GROUPS.flatMap((group) => group.items);
function highlighted(text2, query) {
  const positions = new Set(fuzzyPositions(query, text2));
  if (positions.size === 0) return text2;
  const out = [];
  let run = "";
  let marked = false;
  for (let i = 0; i < text2.length; i += 1) {
    const hit = positions.has(i);
    if (hit !== marked && run) {
      out.push(marked ? h("mark", {}, run) : run);
      run = "";
    }
    marked = hit;
    run += text2[i];
  }
  if (run) out.push(marked ? h("mark", {}, run) : run);
  return out;
}
const ROW_HEIGHT = 36;
function paletteView(options) {
  const ranked = rankCommands(options.commands, options.query).slice(0, 300);
  const index = Math.max(0, Math.min(options.index, ranked.length - 1));
  const run = (command) => {
    if (command) options.onRun(command);
  };
  return h(
    "div",
    {
      class: "scrim",
      "data-dt": "palette",
      onPointerDown: (event) => {
        if (event.target === event.currentTarget) options.onClose();
      }
    },
    h(
      "div",
      { class: "palette", role: "dialog", "aria-modal": "true", "aria-label": "Command palette" },
      h(
        "div",
        { class: "palette-input" },
        icon("search", { size: 16 }),
        h("input", {
          "data-dt": "palette-input",
          value: options.query,
          placeholder: "Search sections, actions, components, state, routes…",
          "aria-label": "Command",
          "aria-controls": "dt-palette-list",
          "aria-activedescendant": ranked[index] ? `pal-${ranked[index].id}` : void 0,
          role: "combobox",
          "aria-expanded": true,
          spellcheck: "false",
          autocomplete: "off",
          ref: autofocus({ select: true }),
          onInput: (event) => options.onQuery(event.target.value),
          onKeyDown: (event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              options.onIndex(Math.min(ranked.length - 1, index + 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              options.onIndex(Math.max(0, index - 1));
            } else if (event.key === "PageDown") {
              event.preventDefault();
              options.onIndex(Math.min(ranked.length - 1, index + 8));
            } else if (event.key === "PageUp") {
              event.preventDefault();
              options.onIndex(Math.max(0, index - 8));
            } else if (event.key === "Enter") {
              event.preventDefault();
              run(ranked[index]);
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              options.onClose();
            }
          }
        }),
        h("span", { class: "kbd" }, "esc")
      ),
      ranked.length === 0 ? h("div", { class: "palette-empty" }, `Nothing matches “${options.query}”.`) : h(
        "div",
        { class: "palette-list", id: "dt-palette-list", role: "listbox", style: { height: `${Math.min(ranked.length, 11) * ROW_HEIGHT + 12}px` } },
        virtualList({
          items: ranked,
          rowHeight: ROW_HEIGHT,
          rowKey: (command) => command.id,
          version: [options.query, index],
          scrollTo: index,
          renderRow: (command, i) => h(
            "button",
            {
              type: "button",
              id: `pal-${command.id}`,
              role: "option",
              "aria-selected": i === index,
              class: ["palette-item", i === index ? "is-active" : ""],
              "data-dt": `palette-item`,
              "data-command": command.id,
              onMouseMove: () => {
                if (i !== index) options.onIndex(i);
              },
              onClick: () => run(command)
            },
            h("span", { class: "pi-icon" }, icon(command.icon ?? "arrowRight", { size: 13 })),
            h("span", { class: "pi-label" }, highlighted(command.label, options.query)),
            h("span", { class: "pi-group" }, command.group),
            command.hint ? h("span", { class: "kbd" }, command.hint) : null
          )
        })
      ),
      h(
        "div",
        { class: "palette-foot" },
        h("span", {}, h("span", { class: "kbd" }, "↑"), h("span", { class: "kbd" }, "↓"), " navigate"),
        h("span", {}, h("span", { class: "kbd" }, "↵"), " run"),
        h("span", {}, h("span", { class: "kbd" }, "esc"), " close"),
        h("span", { class: "grow" }),
        h("span", {}, `${ranked.length} result${ranked.length === 1 ? "" : "s"}`)
      )
    )
  );
}
const SESSION_FORMAT = "aktion-devtools-session";
function exportSessionJson(ctx, extras = {}) {
  const { model } = ctx;
  const payload = {
    format: SESSION_FORMAT,
    formatVersion: 2,
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    protocolVersion: ctx.hook.protocolVersion,
    libraryVersion: ctx.hook.libraryVersion,
    environment: environment(),
    app: ctx.app ? { id: ctx.app.id, label: ctx.app.label } : null,
    note: extras.note,
    program: safe(() => ctx.app?.getProgram() ?? null, null),
    diagnostics: safe(() => typeof ctx.app?.getDiagnostics === "function" ? ctx.app.getDiagnostics() : [], []),
    stats: safe(() => typeof ctx.app?.getStats === "function" ? ctx.app.getStats() : null, null),
    route: safe(() => typeof ctx.app?.getRoute === "function" ? ctx.app.getRoute() : null, null),
    state: model.state,
    totals: model.totals,
    commits: model.commits,
    effects: model.effects,
    network: model.network,
    routes: model.routes,
    emits: model.emits,
    errors: model.errors,
    logs: model.logs,
    longTasks: model.longTasks,
    history: model.history,
    steps: extras.steps ?? [],
    // The program history cannot be reconstructed from the events, and it is
    // exactly what an "it broke after my edit" report needs.
    programVersions: model.programHistory.map((version) => ({
      at: new Date(version.at).toISOString(),
      lines: version.lines,
      text: version.text
    }))
  };
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return JSON.stringify({ ...payload, state: "<unserialisable>", history: [] }, null, 2);
  }
}
function asArray(value) {
  return Array.isArray(value) ? value : [];
}
function importSessionJson(text2, fileName = "session.json") {
  const raw = JSON.parse(text2);
  if (!raw || typeof raw !== "object") throw new Error("Not a session file: expected a JSON object.");
  if (raw.format !== void 0 && raw.format !== SESSION_FORMAT) throw new Error(`Not an Aktion DevTools session (format "${String(raw.format)}").`);
  if (!Array.isArray(raw.commits) && !Array.isArray(raw.network) && !raw.state) {
    throw new Error("Not an Aktion DevTools session: no commits, requests, or state.");
  }
  const model = emptyModel();
  model.commits = asArray(raw.commits);
  model.effects = asArray(raw.effects);
  model.network = asArray(raw.network);
  model.routes = asArray(raw.routes);
  model.emits = asArray(raw.emits);
  model.errors = asArray(raw.errors);
  model.logs = asArray(raw.logs);
  model.longTasks = asArray(raw.longTasks);
  model.history = asArray(raw.history);
  model.state = raw.state && typeof raw.state === "object" ? raw.state : {};
  if (raw.totals && typeof raw.totals === "object") model.totals = { ...model.totals, ...raw.totals };
  const versions = asArray(raw.programVersions);
  model.programHistory = versions.filter((v) => typeof v.text === "string").map((v) => ({ text: v.text, at: v.at ? Date.parse(v.at) || Date.now() : Date.now(), lines: v.lines ?? v.text.split("\n").length }));
  for (const commit of model.commits) {
    for (const record of commit.components ?? []) {
      if (record.phase !== "memo") model.renderCounts.set(record.instanceKey, (model.renderCounts.get(record.instanceKey) ?? 0) + 1);
    }
  }
  const times = [
    ...model.commits.map((c) => c.startTime),
    ...model.effects.map((e) => e.time),
    ...model.network.map((r) => r.startTime),
    ...model.routes.map((r) => r.time),
    ...model.errors.map((e) => e.time)
  ].filter((t) => Number.isFinite(t));
  model.firstTime = times.length > 0 ? Math.min(...times) : null;
  model.lastTime = times.length > 0 ? Math.max(...times) : 0;
  model.rev += 1;
  const app = raw.app;
  const program = typeof raw.program === "string" ? raw.program : model.programHistory[model.programHistory.length - 1]?.text ?? null;
  if (program && model.programHistory.length === 0) model.programHistory.push({ text: program, at: Date.now(), lines: program.split("\n").length });
  return {
    label: `${app?.label ?? "Imported app"} · ${fileName}`,
    model,
    program,
    exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : null,
    environment: raw.environment && typeof raw.environment === "object" ? raw.environment : null,
    steps: asArray(raw.steps),
    note: typeof raw.note === "string" ? raw.note : void 0
  };
}
function bugReportMarkdown(ctx, extras = {}) {
  const { model } = ctx;
  const env = environment();
  const lines2 = [];
  lines2.push(`## ${extras.title ?? `Bug report — ${ctx.app?.label ?? "Aktion app"}`}`);
  lines2.push("");
  lines2.push("**Environment**");
  lines2.push("");
  lines2.push(`- URL: ${String(env.url ?? "")}`);
  lines2.push(`- Browser: ${String(env.userAgent ?? "")}`);
  lines2.push(`- Viewport: ${String(env.viewport ?? "")} @${String(env.devicePixelRatio ?? 1)}x`);
  lines2.push(`- Aktion runtime: ${ctx.hook.libraryVersion} (DevTools protocol ${ctx.hook.protocolVersion})`);
  const route = safe(() => typeof ctx.app?.getRoute === "function" ? ctx.app.getRoute().path : null, null);
  if (route) lines2.push(`- Route: \`${route}\``);
  lines2.push(`- Captured: ${(/* @__PURE__ */ new Date()).toISOString()}`);
  if (extras.steps && extras.steps.length > 0) {
    lines2.push("", "**Steps to reproduce**", "");
    extras.steps.forEach((step, i) => lines2.push(`${i + 1}. ${step.label}`));
  }
  const errors = model.errors.slice(-10);
  const errorLogs = model.logs.filter((l) => l.level === "error").slice(-10);
  if (errors.length > 0 || errorLogs.length > 0) {
    lines2.push("", "**Errors**", "", "```");
    for (const error of errors) lines2.push(`[${error.phase}] ${error.subject ? `${error.subject}: ` : ""}${error.message}`);
    for (const log of errorLogs) lines2.push(`[console.error] ${log.text}${log.count > 1 ? ` (×${log.count})` : ""}`);
    lines2.push("```");
  }
  const warnings = model.logs.filter((l) => l.level === "warn").slice(-6);
  if (warnings.length > 0) {
    lines2.push("", "**Warnings**", "", "```");
    for (const log of warnings) lines2.push(log.text.length > 300 ? `${log.text.slice(0, 300)}…` : log.text);
    lines2.push("```");
  }
  const failed = model.network.filter((r) => r.phase === "error" || r.phase === "blocked" || (r.status ?? 0) >= 400).slice(-10);
  if (failed.length > 0) {
    lines2.push("", "**Failed requests**", "", "| Method | URL | Status | Time |", "| --- | --- | --- | --- |");
    for (const request of failed) {
      lines2.push(`| ${request.method} | \`${request.url.replace(/\|/g, "\\|")}\` | ${request.status ?? request.error ?? request.phase} | ${request.duration !== void 0 ? `${Math.round(request.duration)}ms` : "—"} |`);
    }
  }
  if (extras.vitals && extras.vitals.length > 0) {
    lines2.push("", "**Performance**", "");
    for (const line of extras.vitals) lines2.push(`- ${line}`);
  }
  lines2.push("", "**State at capture**", "", "```json");
  let state;
  try {
    state = JSON.stringify(model.state, null, 2);
  } catch {
    state = "<unserialisable>";
  }
  lines2.push(state.length > 4e3 ? `${state.slice(0, 4e3)}
… (truncated — attach the session file for the full state)` : state);
  lines2.push("```", "", "_Generated by Aktion DevTools. Attach the exported session (.json) to replay this in the panel._");
  return lines2.join("\n");
}
function environment() {
  if (typeof window === "undefined") return {};
  return {
    url: typeof location !== "undefined" ? location.href : "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    language: typeof navigator !== "undefined" ? navigator.language : "",
    viewport: `${window.innerWidth}×${window.innerHeight}`,
    devicePixelRatio: window.devicePixelRatio,
    colorScheme: typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    reducedMotion: typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches
  };
}
function safe(read, fallback) {
  try {
    return read();
  } catch {
    return fallback;
  }
}
const SEVERITY_WEIGHT = { high: 18, medium: 7, low: 2, info: 0 };
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2, info: 3 };
const JWT_RE = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{0,}$/;
const API_KEY_PATTERNS = [
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key"],
  [/\bsk_(live|test)_[0-9A-Za-z]{16,}\b/, "Stripe secret key"],
  [/\bgh[pousr]_[0-9A-Za-z]{30,}\b/, "GitHub token"],
  [/\bxox[baprs]-[0-9A-Za-z-]{10,}\b/, "Slack token"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "Google API key"],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/, "API secret key"]
];
const SECRET_NAME_RE = /(^|[_\-.])(token|access[_-]?token|refresh[_-]?token|id[_-]?token|jwt|secret|password|passwd|pwd|api[_-]?key|apikey|auth|session|sid|credential|bearer|private[_-]?key)($|[_\-.])/i;
const SESSION_COOKIE_RE = /(^|[_\-.])(session|sess|sid|auth|token|jwt|remember|login|connect\.sid|phpsessid|jsessionid)($|[_\-.])/i;
const URL_SECRET_PARAMS = /^(token|access_token|refresh_token|id_token|auth|authorization|api_key|apikey|key|secret|password|pwd|session|sessionid|sid|sig|signature|jwt|code)$/i;
function base64UrlDecode(part) {
  try {
    const padded = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    if (typeof atob !== "function") return null;
    return atob(padded);
  } catch {
    return null;
  }
}
function decodeJwt(value, now = Date.now()) {
  const text2 = value.trim().replace(/^Bearer\s+/i, "");
  if (!JWT_RE.test(text2)) return null;
  const [headerPart, payloadPart] = text2.split(".");
  const header2 = base64UrlDecode(headerPart ?? "");
  const payload = base64UrlDecode(payloadPart ?? "");
  if (!header2 || !payload) return null;
  try {
    const h2 = JSON.parse(header2);
    const p = JSON.parse(payload);
    if (typeof h2 !== "object" || h2 === null || typeof p !== "object" || p === null) return null;
    if (!("alg" in h2) && !("typ" in h2)) return null;
    return {
      alg: h2.alg,
      exp: typeof p.exp === "number" ? p.exp : void 0,
      iat: typeof p.iat === "number" ? p.iat : void 0,
      sub: typeof p.sub === "string" ? p.sub : void 0,
      iss: typeof p.iss === "string" ? p.iss : void 0,
      aud: Array.isArray(p.aud) ? p.aud.join(", ") : typeof p.aud === "string" ? p.aud : void 0,
      expired: typeof p.exp === "number" ? p.exp * 1e3 < now : void 0
    };
  } catch {
    return null;
  }
}
function classifySecret(key2, value) {
  const jwt = decodeJwt(value);
  if (jwt) return { kind: "jwt", label: "JWT", jwt };
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value)) return { kind: "private-key", label: "private key" };
  for (const [re, label] of API_KEY_PATTERNS) if (re.test(value)) return { kind: "api-key", label };
  if (value.length < 2e4 && (value.startsWith("{") || value.startsWith("["))) {
    try {
      const parsed2 = JSON.parse(value);
      const stack = [parsed2];
      let budget = 200;
      while (stack.length > 0 && budget-- > 0) {
        const current = stack.pop();
        if (current && typeof current === "object") {
          for (const [k, v] of Object.entries(current)) {
            if (typeof v === "string") {
              const inner = decodeJwt(v);
              if (inner) return { kind: "jwt", label: `JWT in "${k}"`, jwt: inner };
              if (SECRET_NAME_RE.test(k) && v.length >= 12) return { kind: "secret-name", label: `"${k}" field` };
            } else if (v && typeof v === "object") stack.push(v);
          }
        }
      }
    } catch {
    }
  }
  if (SECRET_NAME_RE.test(key2) && value.length >= 12 && !/^(true|false|null|\d+)$/.test(value)) return { kind: "secret-name", label: "secret-named key" };
  return { kind: "none" };
}
function isLocalHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost") || host.endsWith(".test") || host === "0.0.0.0";
}
function safeUrl(raw, base2) {
  try {
    return new URL(raw, base2);
  } catch {
    return null;
  }
}
function describe(element) {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : "";
  const cls = typeof element.className === "string" && element.className.trim() ? `.${element.className.trim().split(/\s+/).slice(0, 2).join(".")}` : "";
  return `<${tag}${id}${cls}>`;
}
function scanSecurity(input) {
  const findings = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (finding) => {
    if (seen.has(finding.id)) return;
    seen.add(finding.id);
    findings.push(finding);
  };
  const loc = input.location ?? null;
  const pageOrigin = loc?.origin ?? "";
  const pageSecure = loc ? loc.protocol === "https:" || isLocalHost(loc.hostname) : true;
  const pageHttps = loc?.protocol === "https:";
  const base2 = loc?.href ?? "http://localhost/";
  if (loc && loc.protocol === "http:" && !isLocalHost(loc.hostname)) {
    push({
      id: "insecure-page",
      rule: "insecure-page",
      severity: "high",
      category: "transport",
      title: "Page served over plain HTTP",
      detail: `${loc.origin} is not a secure context: anyone on the network path can read and rewrite the program text itself — and program text is trusted code.`,
      fix: "Serve the page over HTTPS and redirect http:// to it (add Strict-Transport-Security once it works).",
      evidence: loc.origin
    });
  }
  const profile = input.profile;
  if (profile) {
    if (profile.policy === "all") {
      push({
        id: "policy-all",
        rule: "policy-all",
        severity: profile.dynamicCode.length > 0 ? "medium" : "info",
        category: "program",
        title: 'Global access policy is "all"',
        detail: "Program text can reach every host global (eval, document, fetch, storage). That is the documented default for trusted programs; it is wrong for a program written by an LLM, loaded from a database, or editable by users.",
        fix: 'If the program text is not as trusted as your own code, call setGlobalAccessPolicy("safe") before mounting — and for fully untrusted text, run it in a sandboxed cross-origin iframe.'
      });
    }
    for (const entry of profile.dynamicCode) {
      push({
        id: `dynamic-code:${entry.line}:${entry.column}`,
        rule: "dynamic-code",
        severity: "high",
        category: "program",
        title: `Dynamic code execution: ${entry.what}`,
        detail: "Building code from strings at runtime is the one construct that turns an injection bug in DATA into arbitrary code execution.",
        fix: 'Replace it with a lambda or a lookup table. setGlobalAccessPolicy("safe") blocks eval/Function outright.',
        line: entry.line,
        evidence: `line ${entry.line}`
      });
    }
    for (const entry of profile.hostGlobals) {
      if (entry.risk === "high") continue;
      const bypass = entry.name === "fetch" || entry.name === "XMLHttpRequest";
      push({
        id: `host-global:${entry.name}`,
        rule: "host-global",
        severity: entry.risk === "medium" ? bypass ? "medium" : "low" : "info",
        category: "program",
        title: `Program reaches the host global \`${entry.name}\``,
        detail: bypass ? `Direct ${entry.name} calls bypass $http: no interceptors (auth headers, CSRF tokens), no DevTools network tap, no mocking — and they are invisible to this panel's Network view.` : `\`${entry.name}\` is used ${entry.count}× (first at line ${entry.line}). Under the "safe" policy it would resolve to nothing; under "all" it is full page access.`,
        fix: bypass ? "Use $query / $mutation / Http({…}) so requests go through the runtime." : "Prefer the runtime's vetted namespaces ($util, storage, $router) over raw host objects.",
        line: entry.line,
        evidence: `${entry.name} ×${entry.count}`
      });
    }
    for (const entry of profile.escapeHatches) {
      push({
        id: `escape-hatch:${entry.component}:${entry.line}`,
        rule: "escape-hatch",
        severity: entry.dynamic && entry.component !== "Markdown" ? "medium" : "info",
        category: "program",
        title: `${entry.component}(…) escape hatch${entry.dynamic ? " with dynamic content" : ""}`,
        detail: entry.component === "Markdown" ? "Markdown output is escaped by the library; this is listed so a reviewer knows where rendered rich text comes from." : `${entry.component} writes markup or CSS the component library does not construct. It is allow-listed, but it is where a review should start.`,
        fix: entry.dynamic ? "Keep untrusted values out of tag names, attribute names, and CSS text; pass them as text children or props instead." : "No action needed if the content is static.",
        line: entry.line,
        evidence: `line ${entry.line}`
      });
    }
    for (const entry of profile.openUrls) {
      if (!entry.dynamic) continue;
      push({
        id: `open-url:${entry.line}:${entry.column}`,
        rule: "open-dynamic-url",
        severity: "low",
        category: "program",
        title: `${entry.via} with a computed URL`,
        detail: "A URL built from state or input can become an open redirect or a phishing hop if any part of it is attacker-controlled.",
        fix: "Allow-list destinations, or build the URL from a fixed origin plus encoded path/query parts.",
        line: entry.line,
        evidence: entry.target ?? "${…}"
      });
    }
    for (const endpoint of profile.endpoints) {
      const url = endpoint.dynamic ? null : safeUrl(endpoint.url, base2);
      if (url && url.protocol === "http:" && !isLocalHost(url.hostname)) {
        push({
          id: `http-endpoint:${endpoint.url}`,
          rule: "insecure-endpoint",
          severity: "high",
          category: "program",
          title: "Program calls a plain-HTTP endpoint",
          detail: `${endpoint.via} → ${endpoint.url} (line ${endpoint.line}) travels unencrypted${pageHttps ? " and will be blocked as mixed content" : ""}.`,
          fix: "Use https:// for every endpoint.",
          line: endpoint.line,
          evidence: endpoint.url
        });
      }
      const inUrl = checkUrlSecrets(endpoint.url);
      if (inUrl) {
        push({
          id: `endpoint-secret:${endpoint.url}`,
          rule: "secret-in-url",
          severity: "high",
          category: "program",
          title: `Credential in a request URL (${inUrl})`,
          detail: `The program puts \`${inUrl}\` in the URL of ${endpoint.via} (line ${endpoint.line}). URLs land in server logs, proxies, browser history, and Referer headers.`,
          fix: "Send credentials in an Authorization header via an interceptor ($util.onRequest) instead.",
          line: endpoint.line,
          evidence: endpoint.url
        });
      }
    }
  }
  let examined = 0;
  const root = input.root;
  if (root) {
    let elements = [];
    try {
      elements = [...root.querySelectorAll("*")].slice(0, input.limit ?? 6e3);
    } catch {
      elements = [];
    }
    examined = elements.length;
    for (const element of elements) {
      const tag = element.tagName.toLowerCase();
      for (const attr of ["href", "src", "action", "formaction", "xlink:href"]) {
        const value = element.getAttribute(attr);
        if (!value) continue;
        const normalised = value.replace(/[\u0000- ]/g, "").toLowerCase();
        if (normalised.startsWith("javascript:") || normalised.startsWith("vbscript:") || normalised.startsWith("data:text/html")) {
          push({
            id: `script-url:${describe(element)}:${attr}`,
            rule: "script-url",
            severity: "high",
            category: "dom",
            element,
            title: `Executable URL in ${attr}`,
            detail: `${describe(element)} has ${attr}="${value.slice(0, 60)}". The component library's sanitisers refuse this scheme, so it came from an escape hatch or from outside the runtime.`,
            fix: "Remove the URL, or route it through Link/Image so sanitiseHref/sanitiseImageSrc applies.",
            evidence: value.slice(0, 120)
          });
        }
        if (pageHttps && (attr === "src" || attr === "href" && tag === "link") && normalised.startsWith("http://")) {
          const active = tag === "script" || tag === "iframe" || tag === "link" || tag === "object" || tag === "embed";
          push({
            id: `mixed-dom:${value}`,
            rule: "mixed-content",
            severity: active ? "high" : "medium",
            category: "transport",
            element,
            title: `${active ? "Active" : "Passive"} mixed content`,
            detail: `${describe(element)} loads ${value} over HTTP on an HTTPS page.${active ? " Browsers block active mixed content outright." : " It can be read and replaced in transit."}`,
            fix: "Load it over https://.",
            evidence: value
          });
        }
      }
      for (let i = 0; i < element.attributes.length; i += 1) {
        const attr = element.attributes[i];
        if (/^on[a-z]+$/i.test(attr.name)) {
          push({
            id: `inline-handler:${describe(element)}:${attr.name}`,
            rule: "inline-handler",
            severity: "medium",
            category: "dom",
            element,
            title: `Inline event handler (${attr.name})`,
            detail: `${describe(element)} carries ${attr.name}="${attr.value.slice(0, 50)}". Aktion never renders these; an inline handler is script living in markup, and it forces a CSP to allow 'unsafe-inline'.`,
            fix: "Attach behaviour with onClick/onInput props so it goes through the runtime.",
            evidence: `${attr.name}="${attr.value.slice(0, 80)}"`
          });
        }
      }
      if (tag === "script") {
        push({
          id: `script-element:${describe(element)}`,
          rule: "script-element",
          severity: "high",
          category: "dom",
          element,
          title: "<script> inside the app's render tree",
          detail: "The runtime never emits script elements. One inside the shadow root was injected by host code or an escape hatch.",
          fix: "Find what inserted it; keep scripts out of rendered content entirely."
        });
      }
      if (tag === "iframe") {
        const sandbox = element.getAttribute("sandbox");
        if (sandbox === null) {
          push({
            id: `iframe-sandbox:${element.getAttribute("src") ?? describe(element)}`,
            rule: "iframe-sandbox",
            severity: "medium",
            category: "dom",
            element,
            title: "iframe without a sandbox",
            detail: `${describe(element)} (${element.getAttribute("src") ?? "no src"}) runs with full privileges for its origin.`,
            fix: 'Add sandbox with only the capabilities it needs (e.g. sandbox="allow-scripts").'
          });
        } else if (/allow-scripts/.test(sandbox) && /allow-same-origin/.test(sandbox)) {
          push({
            id: `iframe-escape:${element.getAttribute("src") ?? describe(element)}`,
            rule: "iframe-sandbox-escape",
            severity: "medium",
            category: "dom",
            element,
            title: "Sandbox allows scripts AND same-origin",
            detail: "With both flags a same-origin frame can remove its own sandbox attribute — the sandbox is decorative.",
            fix: "Drop allow-same-origin, or serve the frame from a separate origin."
          });
        }
        if (element.hasAttribute("srcdoc")) {
          push({
            id: `srcdoc:${describe(element)}`,
            rule: "srcdoc",
            severity: "medium",
            category: "dom",
            element,
            title: "iframe srcdoc markup",
            detail: "srcdoc renders raw HTML; the library drops it from HTMLTag, so this one was set outside the runtime.",
            fix: "Render the content with components instead."
          });
        }
      }
      if ((tag === "object" || tag === "embed") && !seen.has(`plugin:${tag}`)) {
        push({
          id: `plugin:${tag}`,
          rule: "plugin-element",
          severity: "low",
          category: "dom",
          element,
          title: `<${tag}> element`,
          detail: "Plugin containers can load active content outside the page's normal policies.",
          fix: "Use <img>, <video>, or a sandboxed iframe."
        });
      }
      if (tag === "a" && element.getAttribute("target") === "_blank") {
        const rel = (element.getAttribute("rel") ?? "").toLowerCase();
        if (!rel.includes("noopener") && !rel.includes("noreferrer")) {
          push({
            id: `blank-opener:${element.getAttribute("href") ?? describe(element)}`,
            rule: "target-blank",
            severity: "low",
            category: "dom",
            element,
            title: 'target="_blank" without rel="noopener"',
            detail: `${describe(element)} → ${element.getAttribute("href") ?? ""}. Older browsers let the opened page navigate this one (reverse tabnabbing).`,
            fix: 'Add rel="noopener noreferrer" (Link and HTMLTag do this automatically).'
          });
        }
      }
      if (tag === "form") {
        const action = element.getAttribute("action");
        const url = action ? safeUrl(action, base2) : null;
        if (url && url.protocol === "http:" && !isLocalHost(url.hostname)) {
          push({
            id: `form-http:${action}`,
            rule: "form-insecure-action",
            severity: "high",
            category: "transport",
            element,
            title: "Form submits over plain HTTP",
            detail: `${describe(element)} posts to ${action}. Anything typed into it travels unencrypted.`,
            fix: "Submit to an https:// endpoint."
          });
        } else if (url && pageOrigin && url.origin !== pageOrigin) {
          push({
            id: `form-offsite:${url.origin}`,
            rule: "form-third-party",
            severity: "low",
            category: "transport",
            element,
            title: "Form submits to another origin",
            detail: `${describe(element)} posts to ${url.origin}.`,
            fix: "Confirm the destination is intended; prefer $mutation so the request is visible and interceptable."
          });
        }
      }
      if (tag === "input" && element.type === "password") {
        if (loc && !pageSecure) {
          push({
            id: "password-http",
            rule: "password-insecure",
            severity: "high",
            category: "transport",
            element,
            title: "Password field on an insecure page",
            detail: 'Browsers flag this page as "Not secure" and the password travels in clear text.',
            fix: "Serve the page over HTTPS."
          });
        }
        const ac = (element.getAttribute("autocomplete") ?? "").toLowerCase();
        if (!ac.includes("current-password") && !ac.includes("new-password") && !ac.includes("one-time-code")) {
          push({
            id: `password-ac:${describe(element)}`,
            rule: "password-autocomplete",
            severity: "low",
            category: "dom",
            element,
            title: "Password field without a precise autocomplete",
            detail: `${describe(element)} has autocomplete="${ac || "(none)"}". Password managers — the strongest defence against reuse and phishing — work best with an exact token.`,
            fix: 'Set autocomplete to "current-password" (sign-in) or "new-password" (sign-up / change).'
          });
        }
      }
    }
  }
  const origins = /* @__PURE__ */ new Map();
  for (const request of input.requests) {
    const url = safeUrl(request.url, base2);
    if (!url) continue;
    const origin = url.origin === "null" ? url.protocol : url.origin;
    const firstParty = pageOrigin !== "" ? url.origin === pageOrigin : url.hostname === "" || isLocalHost(url.hostname);
    const headers = request.requestHeaders ?? {};
    const credentials = Object.keys(headers).some((h2) => /^(authorization|cookie|x-api-key|x-auth-token|x-csrf-token|x-xsrf-token|proxy-authorization)$/i.test(h2));
    let summary = origins.get(origin);
    if (!summary) {
      summary = { origin, requests: 0, failed: 0, firstParty, secure: url.protocol === "https:" || isLocalHost(url.hostname), credentials: false };
      origins.set(origin, summary);
    }
    summary.requests += 1;
    if (request.phase === "error" || request.phase === "blocked" || (request.status ?? 0) >= 400) summary.failed += 1;
    if (credentials) summary.credentials = true;
    if (url.protocol === "http:" && !isLocalHost(url.hostname)) {
      push({
        id: `http-request:${origin}`,
        rule: pageHttps ? "mixed-content" : "insecure-request",
        severity: "high",
        category: "transport",
        title: pageHttps ? "Request blocked as mixed content" : "Request over plain HTTP",
        detail: `${request.method} ${request.url} is unencrypted${credentials ? " and carries credentials" : ""}.`,
        fix: "Use https:// for every endpoint.",
        requestId: request.requestId,
        evidence: request.url
      });
    }
    const secretParam = checkUrlSecrets(request.url);
    if (secretParam) {
      push({
        id: `url-secret:${url.origin}${url.pathname}:${secretParam}`,
        rule: "secret-in-url",
        severity: "high",
        category: "transport",
        title: `Credential in a request URL (${secretParam})`,
        detail: `${request.method} ${url.origin}${url.pathname} sends \`${secretParam}\` in the query string, where it is logged by servers and proxies and leaks through Referer.`,
        fix: "Move it into an Authorization header (via $util.onRequest).",
        requestId: request.requestId,
        evidence: request.url
      });
    }
    if (credentials && !firstParty) {
      push({
        id: `third-party-credentials:${origin}`,
        rule: "third-party-credentials",
        severity: "medium",
        category: "transport",
        title: "Credentials sent to a third party",
        detail: `Requests to ${origin} carry an Authorization/Cookie/API-key header. Make sure this origin is meant to receive your users' credentials.`,
        fix: "Scope the auth interceptor to your own API origin(s).",
        requestId: request.requestId,
        evidence: origin
      });
    }
  }
  const thirdParty = [...origins.values()].filter((o) => !o.firstParty);
  if (thirdParty.length > 0) {
    push({
      id: "third-party-origins",
      rule: "third-party-origins",
      severity: "info",
      category: "transport",
      title: `${thirdParty.length} third-party origin${thirdParty.length === 1 ? "" : "s"} contacted`,
      detail: thirdParty.map((o) => `${o.origin} (${o.requests})`).join(", "),
      fix: "Every origin here needs a connect-src entry in your CSP; unexpected ones deserve a look."
    });
  }
  const storageItems = [];
  const store2 = input.storage;
  if (store2) {
    const areas = [["local", store2.local], ["session", store2.session], ["cookie", store2.cookies]];
    for (const [area, entries] of areas) {
      for (const [key2, value] of entries) {
        const verdict = classifySecret(key2, value);
        storageItems.push({ area, key: key2, size: key2.length + value.length, kind: verdict.kind, jwt: verdict.jwt });
        if (verdict.kind === "none") {
          if (area === "cookie" && SESSION_COOKIE_RE.test(key2)) {
            push({
              id: `cookie-readable:${key2}`,
              rule: "cookie-not-httponly",
              severity: "medium",
              category: "storage",
              storageKey: key2,
              title: `Session-like cookie readable by JavaScript: ${key2}`,
              detail: `document.cookie exposes "${key2}", so it is NOT HttpOnly — any XSS can steal it.`,
              fix: "Set session cookies from the server with HttpOnly; Secure; SameSite=Lax (or Strict).",
              evidence: key2
            });
          }
          continue;
        }
        const where = area === "cookie" ? "a JavaScript-readable cookie" : `${area}Storage`;
        push({
          id: `storage-secret:${area}:${key2}`,
          rule: "storage-secret",
          severity: verdict.kind === "private-key" ? "high" : "medium",
          category: "storage",
          storageKey: key2,
          title: `${verdict.label ?? "Secret"} in ${where}: ${key2}`,
          detail: `${where} is readable by every script on the origin, so a single XSS exfiltrates it.${verdict.jwt?.exp ? ` The token ${verdict.jwt.expired ? "has EXPIRED" : `expires ${new Date(verdict.jwt.exp * 1e3).toISOString()}`}.` : ""}`,
          fix: area === "cookie" ? "Mark the cookie HttpOnly so script cannot read it." : "Keep session tokens in HttpOnly cookies; if a token must live in JS, keep it in memory and scope it tightly.",
          evidence: key2
        });
      }
    }
  }
  let headerChecks = null;
  const cspMeta2 = input.cspMeta ?? null;
  if (input.headers) {
    headerChecks = checkHeaders$1(input.headers, cspMeta2, pageHttps);
    for (const check of headerChecks) {
      if (check.status === "good" || check.status === "info") continue;
      const severity = check.header === "content-security-policy" ? "medium" : "low";
      push({
        id: `header:${check.header}`,
        rule: `header-${check.header}`,
        severity,
        category: "headers",
        title: check.status === "missing" ? `Missing ${check.header}` : `Weak ${check.header}`,
        detail: check.note,
        fix: headerFix(check.header),
        evidence: check.value ?? void 0
      });
    }
  } else if (cspMeta2 === null && typeof document !== "undefined") {
    push({
      id: "csp-unknown",
      rule: "csp-unknown",
      severity: "info",
      category: "headers",
      title: "No <meta> Content-Security-Policy",
      detail: "A CSP may still be sent as a response header — run the header check to find out.",
      fix: "Run “Check response headers”."
    });
  }
  for (const violation of input.violations ?? []) {
    push({
      id: `csp:${violation.directive}:${violation.blocked}`,
      rule: "csp-violation",
      severity: violation.disposition === "report" ? "low" : "medium",
      category: "csp",
      title: `CSP ${violation.disposition === "report" ? "report" : "blocked"}: ${violation.directive}`,
      detail: `Blocked ${violation.blocked || "(inline)"}${violation.source ? ` from ${violation.source}` : ""}.`,
      fix: violation.directive.startsWith("style-src") ? "Aktion injects <style> elements (theme tokens, component CSS): style-src needs 'unsafe-inline' or a nonce/hash strategy." : "Either allow the resource explicitly or stop loading it.",
      evidence: violation.sample
    });
  }
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.category.localeCompare(b.category));
  const counts = { high: 0, medium: 0, low: 0, info: 0 };
  let penalty = 0;
  for (const finding of findings) {
    counts[finding.severity] += 1;
    penalty += SEVERITY_WEIGHT[finding.severity];
  }
  return {
    at: Date.now(),
    findings,
    score: Math.max(0, Math.min(100, 100 - penalty)),
    counts,
    origins: [...origins.values()].sort((a, b) => Number(a.firstParty) - Number(b.firstParty) || b.requests - a.requests),
    storage: storageItems.sort((a, b) => Number(b.kind !== "none") - Number(a.kind !== "none") || a.key.localeCompare(b.key)),
    headers: headerChecks,
    profile,
    examined,
    pageOrigin,
    secureContext: pageSecure
  };
}
function checkUrlSecrets(raw) {
  const q = raw.indexOf("?");
  if (q < 0) return null;
  const query = raw.slice(q + 1).split("#")[0] ?? "";
  for (const pair of query.split("&")) {
    const [rawKey, rawValue = ""] = pair.split("=");
    let key2 = rawKey ?? "";
    let value = rawValue;
    try {
      key2 = decodeURIComponent(key2);
    } catch {
    }
    try {
      value = decodeURIComponent(value);
    } catch {
    }
    if (value === "" || value.startsWith("${")) {
      if (URL_SECRET_PARAMS.test(key2) && value.startsWith("${")) return key2;
      continue;
    }
    if (URL_SECRET_PARAMS.test(key2) && key2.toLowerCase() !== "code") return key2;
    if (JWT_RE.test(value) && decodeJwt(value)) return key2 || "JWT";
  }
  return null;
}
function checkHeaders$1(headers, cspMeta2, https) {
  const get = (name) => {
    const key2 = Object.keys(headers).find((k) => k.toLowerCase() === name);
    return key2 ? headers[key2] : null;
  };
  const out = [];
  const csp = get("content-security-policy") ?? cspMeta2;
  if (!csp) {
    out.push({ header: "content-security-policy", value: null, status: "missing", note: "No CSP: an injected script runs with full origin privileges and nothing reports it." });
  } else {
    const problems = [];
    const scriptSrc = /(?:^|;)\s*script-src\s+([^;]+)/i.exec(csp)?.[1] ?? /(?:^|;)\s*default-src\s+([^;]+)/i.exec(csp)?.[1] ?? "";
    if (/'unsafe-inline'/.test(scriptSrc) && !/'nonce-|'sha(256|384|512)-|'strict-dynamic'/.test(scriptSrc)) problems.push("script-src allows 'unsafe-inline'");
    if (/'unsafe-eval'/.test(scriptSrc)) problems.push("script-src allows 'unsafe-eval' (the Aktion runtime does not need it)");
    if (/(^|\s)\*(\s|$)/.test(scriptSrc)) problems.push("script-src allows any host (*)");
    if (!/object-src\s+'none'/i.test(csp) && !/default-src\s+'none'/i.test(csp)) problems.push("object-src is not 'none'");
    if (!/frame-ancestors/i.test(csp)) problems.push("no frame-ancestors (clickjacking)");
    out.push({
      header: "content-security-policy",
      value: csp,
      status: problems.length === 0 ? "good" : "warn",
      note: problems.length === 0 ? `Strict policy${get("content-security-policy") ? "" : " (from <meta>)"}.` : problems.join("; ")
    });
  }
  const hsts = get("strict-transport-security");
  if (https) {
    out.push(hsts ? { header: "strict-transport-security", value: hsts, status: /max-age=(\d+)/.test(hsts) && Number(/max-age=(\d+)/.exec(hsts)[1]) >= 15552e3 ? "good" : "warn", note: /max-age=(\d+)/.test(hsts) ? "HTTPS is enforced for returning visitors." : "max-age is missing." } : { header: "strict-transport-security", value: null, status: "missing", note: "Without HSTS the first request can be downgraded to HTTP." });
  }
  const xcto = get("x-content-type-options");
  out.push(xcto && /nosniff/i.test(xcto) ? { header: "x-content-type-options", value: xcto, status: "good", note: "MIME sniffing disabled." } : { header: "x-content-type-options", value: xcto, status: "missing", note: "Browsers may sniff a response into an executable type." });
  const xfo = get("x-frame-options");
  const frameAncestors = csp && /frame-ancestors/i.test(csp);
  out.push(xfo || frameAncestors ? { header: "x-frame-options", value: xfo ?? "(frame-ancestors in CSP)", status: "good", note: "Framing is restricted." } : { header: "x-frame-options", value: null, status: "missing", note: "Any site can frame this page (clickjacking)." });
  const referrer = get("referrer-policy");
  out.push(referrer ? { header: "referrer-policy", value: referrer, status: /unsafe-url|no-referrer-when-downgrade/i.test(referrer) ? "warn" : "good", note: /unsafe-url/i.test(referrer) ? "Full URLs (including query strings) leak to other sites." : "Referrer data is limited." } : { header: "referrer-policy", value: null, status: "info", note: "Browser default (strict-origin-when-cross-origin) applies." });
  const permissions = get("permissions-policy");
  out.push({ header: "permissions-policy", value: permissions, status: permissions ? "good" : "info", note: permissions ? "Powerful features are scoped." : "No Permissions-Policy; camera/microphone/geolocation follow browser defaults." });
  const coop = get("cross-origin-opener-policy");
  out.push({ header: "cross-origin-opener-policy", value: coop, status: coop ? "good" : "info", note: coop ? "Cross-origin windows cannot reach this one." : "No COOP; cross-origin popups keep a reference to this window." });
  return out;
}
function headerFix(header2) {
  switch (header2) {
    case "content-security-policy":
      return "Start from: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-ancestors 'self'; base-uri 'self'. Aktion needs style-src 'unsafe-inline' (or nonces) for its injected <style> elements, and never needs 'unsafe-eval'.";
    case "strict-transport-security":
      return "Send Strict-Transport-Security: max-age=31536000; includeSubDomains.";
    case "x-content-type-options":
      return "Send X-Content-Type-Options: nosniff.";
    case "x-frame-options":
      return "Send frame-ancestors 'self' in your CSP (or X-Frame-Options: SAMEORIGIN).";
    case "referrer-policy":
      return "Send Referrer-Policy: strict-origin-when-cross-origin.";
    default:
      return "Set it on the server response.";
  }
}
function readPageStorage() {
  const read = (area) => {
    const out = [];
    try {
      if (!area) return out;
      for (let i = 0; i < area.length; i += 1) {
        const key2 = area.key(i);
        if (key2 === null || key2.startsWith("aktion-devtools")) continue;
        out.push([key2, area.getItem(key2) ?? ""]);
      }
    } catch {
    }
    return out;
  };
  let cookies = [];
  try {
    cookies = (document.cookie || "").split(";").map((c) => c.trim()).filter(Boolean).map((c) => {
      const eq = c.indexOf("=");
      const name = eq < 0 ? c : c.slice(0, eq);
      const value = eq < 0 ? "" : c.slice(eq + 1);
      let decoded = value;
      try {
        decoded = decodeURIComponent(value);
      } catch {
      }
      return [name, decoded];
    });
  } catch {
    cookies = [];
  }
  return {
    local: read(typeof localStorage !== "undefined" ? localStorage : void 0),
    session: read(typeof sessionStorage !== "undefined" ? sessionStorage : void 0),
    cookies
  };
}
function emptyVitals() {
  return {
    supported: { eventTiming: false, lcp: false, cls: false, longTasks: false, loaf: false, memory: false },
    fps: null,
    fpsSamples: [],
    droppedFrames: 0,
    lcp: null,
    cls: { value: 0, shifts: [] },
    inp: null,
    interactions: [],
    longTasks: [],
    fcp: null,
    ttfb: null,
    heap: null,
    heapSamples: []
  };
}
const THRESHOLDS = {
  lcp: [2500, 4e3],
  inp: [200, 500],
  cls: [0.1, 0.25],
  fcp: [1800, 3e3],
  ttfb: [800, 1800]
};
function rate(metric2, value) {
  if (value === null || value === void 0 || !Number.isFinite(value)) return "unknown";
  const [good, ni] = THRESHOLDS[metric2];
  return value <= good ? "good" : value <= ni ? "needs-improvement" : "poor";
}
function computeInp(interactions) {
  if (interactions.length === 0) return null;
  const sorted = [...interactions].sort((a, b) => b.duration - a.duration);
  const skip = Math.min(sorted.length - 1, Math.floor(interactions.length / 50));
  const pick = sorted[skip];
  return { value: pick.duration, interaction: pick };
}
function computeCls(shifts) {
  let best = 0;
  let current = 0;
  let windowStart = -Infinity;
  let last = -Infinity;
  for (const shift of [...shifts].sort((a, b) => a.time - b.time)) {
    if (shift.time - last > 1e3 || shift.time - windowStart > 5e3) {
      current = 0;
      windowStart = shift.time;
    }
    current += shift.value;
    last = shift.time;
    if (current > best) best = current;
  }
  return best;
}
function describeNode(node) {
  if (!node || typeof node !== "object") return "";
  const el = node;
  if (typeof el.tagName !== "string") return "";
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const cls = typeof el.className === "string" && el.className.trim() ? `.${el.className.trim().split(/\s+/).slice(0, 2).join(".")}` : "";
  return `${tag}${id}${cls}`;
}
const CAP = { interactions: 200 };
const CHROME_TAGS = /* @__PURE__ */ new Set(["AKTION-DEVTOOLS", "AKTION-DEVTOOLS-OVERLAY"]);
function isDevtoolsNode(node) {
  let current = node;
  for (let guard = 0; current && guard < 64; guard += 1) {
    if (current.nodeType === 1 && CHROME_TAGS.has(current.tagName)) return true;
    const parent = current.parentNode;
    current = parent && parent.nodeType === 11 ? parent.host ?? null : parent;
  }
  return false;
}
class VitalsMonitor {
  constructor() {
    __publicField(this, "data", emptyVitals());
    __publicField(this, "observers", []);
    __publicField(this, "frameHandle", null);
    __publicField(this, "heapTimer", null);
    __publicField(this, "frames", 0);
    __publicField(this, "windowStart", 0);
    __publicField(this, "lastFrame", 0);
    __publicField(this, "onChange", null);
    __publicField(this, "notifyPending", false);
    __publicField(this, "running", false);
    __publicField(this, "interactions", /* @__PURE__ */ new Map());
  }
  get isRunning() {
    return this.running;
  }
  snapshot() {
    return this.data;
  }
  start(onChange) {
    if (this.running) return;
    this.running = true;
    this.onChange = onChange;
    this.observeAll();
    this.readNavigation();
    this.startFrames();
    this.startHeap();
  }
  stop() {
    this.running = false;
    for (const observer of this.observers) {
      try {
        observer.disconnect();
      } catch {
      }
    }
    this.observers = [];
    if (this.frameHandle !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
    if (this.heapTimer !== null) clearInterval(this.heapTimer);
    this.heapTimer = null;
    this.onChange = null;
  }
  /** Pause the frame loop while the panel is hidden — sampling FPS is not free. */
  setFrameSampling(enabled) {
    if (!this.running) return;
    if (enabled && this.frameHandle === null) this.startFrames();
    if (!enabled && this.frameHandle !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }
  }
  notify() {
    if (this.notifyPending || !this.onChange) return;
    this.notifyPending = true;
    setTimeout(() => {
      this.notifyPending = false;
      this.onChange?.();
    }, 250);
  }
  mutate(patch2) {
    this.data = { ...this.data, ...patch2 };
    this.notify();
  }
  observe(type, handler, extra = {}) {
    if (typeof PerformanceObserver !== "function") return false;
    const supported = PerformanceObserver.supportedEntryTypes;
    if (supported && !supported.includes(type)) return false;
    try {
      const observer = new PerformanceObserver((list) => {
        try {
          handler(list.getEntries());
        } catch {
        }
      });
      observer.observe({ type, buffered: true, ...extra });
      this.observers.push(observer);
      return true;
    } catch {
      return false;
    }
  }
  observeAll() {
    const supported = { ...this.data.supported };
    supported.eventTiming = this.observe("event", (entries) => {
      let changed = false;
      for (const raw of entries) {
        const entry = raw;
        const id = entry.interactionId ?? 0;
        if (!id || isDevtoolsNode(entry.target)) continue;
        const record = {
          id,
          type: entry.name,
          target: describeNode(entry.target),
          start: entry.startTime,
          duration: entry.duration,
          inputDelay: Math.max(0, entry.processingStart - entry.startTime),
          processing: Math.max(0, entry.processingEnd - entry.processingStart),
          presentation: Math.max(0, entry.startTime + entry.duration - entry.processingEnd)
        };
        const existing = this.interactions.get(id);
        if (!existing || record.duration > existing.duration) {
          this.interactions.set(id, existing ? { ...record, target: record.target || existing.target } : record);
          changed = true;
        }
      }
      if (!changed) return;
      let list = [...this.interactions.values()].sort((a, b) => a.start - b.start);
      if (list.length > CAP.interactions) {
        list = list.slice(-200);
        this.interactions.clear();
        for (const item of list) this.interactions.set(item.id, item);
      }
      this.mutate({ interactions: list, inp: computeInp(list) });
    }, { durationThreshold: 16 });
    supported.lcp = this.observe("largest-contentful-paint", (entries) => {
      const last = entries[entries.length - 1];
      if (!last) return;
      this.mutate({ lcp: { value: last.renderTime || last.loadTime || last.startTime, element: describeNode(last.element), size: last.size ?? 0 } });
    });
    supported.cls = this.observe("layout-shift", (entries) => {
      const shifts = [...this.data.cls.shifts];
      for (const raw of entries) {
        const entry = raw;
        if (entry.hadRecentInput) continue;
        shifts.push({ time: entry.startTime, value: entry.value, sources: (entry.sources ?? []).map((s) => describeNode(s.node)).filter(Boolean) });
      }
      const capped = shifts.slice(-200);
      this.mutate({ cls: { value: computeCls(capped), shifts: capped } });
    });
    supported.loaf = this.observe("long-animation-frame", (entries) => {
      const tasks = [...this.data.longTasks];
      for (const raw of entries) {
        const entry = raw;
        tasks.push({
          start: entry.startTime,
          duration: entry.duration,
          blocking: entry.blockingDuration,
          scripts: (entry.scripts ?? []).slice(0, 5).map((s) => ({
            source: [s.sourceFunctionName, s.sourceURL ? s.sourceURL.split("/").pop() : ""].filter(Boolean).join(" @ ") || "(anonymous)",
            invoker: s.invoker ?? "",
            duration: s.duration
          }))
        });
      }
      this.mutate({ longTasks: tasks.slice(-150) });
    });
    if (!supported.loaf) {
      supported.longTasks = this.observe("longtask", (entries) => {
        const tasks = [...this.data.longTasks];
        for (const entry of entries) tasks.push({ start: entry.startTime, duration: entry.duration });
        this.mutate({ longTasks: tasks.slice(-150) });
      });
    } else {
      supported.longTasks = true;
    }
    this.observe("paint", (entries) => {
      const fcp = entries.find((entry) => entry.name === "first-contentful-paint");
      if (fcp) this.mutate({ fcp: fcp.startTime });
    });
    const memory = typeof performance !== "undefined" ? performance.memory : void 0;
    supported.memory = memory !== void 0;
    this.data = { ...this.data, supported };
  }
  readNavigation() {
    try {
      const [nav] = performance.getEntriesByType("navigation");
      if (nav) this.data = { ...this.data, ttfb: nav.responseStart };
      const fcp = performance.getEntriesByName("first-contentful-paint")[0];
      if (fcp) this.data = { ...this.data, fcp: fcp.startTime };
    } catch {
    }
  }
  startFrames() {
    if (typeof requestAnimationFrame !== "function" || typeof performance === "undefined") return;
    this.frames = 0;
    this.windowStart = performance.now();
    this.lastFrame = this.windowStart;
    const tick = (now) => {
      if (!this.running) return;
      this.frames += 1;
      if (now - this.lastFrame > 50) this.data.droppedFrames += 1;
      this.lastFrame = now;
      const elapsed = now - this.windowStart;
      if (elapsed >= 500) {
        const fps = Math.round(this.frames * 1e3 / elapsed);
        const samples = [...this.data.fpsSamples, [now, fps]].slice(-240);
        this.frames = 0;
        this.windowStart = now;
        this.mutate({ fps, fpsSamples: samples });
      }
      this.frameHandle = requestAnimationFrame(tick);
    };
    this.frameHandle = requestAnimationFrame(tick);
  }
  startHeap() {
    const sample = () => {
      const memory = performance.memory;
      if (!memory) return;
      const heap = { used: memory.usedJSHeapSize, total: memory.totalJSHeapSize, limit: memory.jsHeapSizeLimit };
      const samples = [...this.data.heapSamples, [performance.now(), heap.used]].slice(-240);
      this.mutate({ heap, heapSamples: samples });
    };
    try {
      sample();
      this.heapTimer = setInterval(sample, 2e3);
    } catch {
    }
  }
}
function commitRate(model, window2 = 20) {
  const recent = model.commits.slice(-window2);
  if (recent.length < 5) return 0;
  const span = recent[recent.length - 1].startTime - recent[0].startTime;
  if (span <= 0) return 0;
  return (recent.length - 1) / (span / 1e3);
}
function healthIssues(model, diagnostics) {
  const out = [];
  const errorDiagnostics = diagnostics.filter((d) => d.severity === "error");
  if (errorDiagnostics.length > 0) {
    const first = errorDiagnostics[0];
    out.push({
      id: "program-errors",
      tone: "bad",
      tab: "source",
      title: `${errorDiagnostics.length} program error${errorDiagnostics.length === 1 ? "" : "s"}`,
      detail: `${first.line ? `Line ${first.line}: ` : ""}${first.message}`,
      fix: "Fix the first one first — later errors are often its echo."
    });
  }
  if (model.errors.length > 0) {
    const last = model.errors[model.errors.length - 1];
    out.push({
      id: "runtime-errors",
      tone: "bad",
      tab: "console",
      title: `${model.errors.length} runtime error${model.errors.length === 1 ? "" : "s"}`,
      detail: `${last.phase}${last.subject ? ` · ${last.subject}` : ""}: ${last.message}`
    });
  }
  let errorLogs = 0;
  let warnLogs = 0;
  let firstWarn = "";
  for (const log of model.logs) {
    if (log.level === "error") errorLogs += log.count;
    if (log.level === "warn") {
      warnLogs += log.count;
      if (!firstWarn) firstWarn = log.text;
    }
  }
  if (errorLogs > 0) out.push({ id: "console-errors", tone: "bad", tab: "console", title: `${errorLogs} console error${errorLogs === 1 ? "" : "s"}`, detail: "Logged by the program, the runtime, or an uncaught exception." });
  const failed = model.network.filter((r) => r.phase === "error" || r.phase === "blocked" || (r.status ?? 0) >= 400);
  if (failed.length > 0) {
    const last = failed[failed.length - 1];
    out.push({
      id: "failed-requests",
      tone: failed.some((r) => (r.status ?? 0) >= 500 || r.phase === "error") ? "bad" : "warn",
      tab: "network",
      title: `${failed.length} failed request${failed.length === 1 ? "" : "s"}`,
      detail: `${last.method} ${last.url} → ${last.status ?? last.error ?? last.phase}`
    });
  }
  if (warnLogs > 0) {
    out.push({
      id: "warnings",
      tone: "warn",
      tab: "console",
      title: `${warnLogs} warning${warnLogs === 1 ? "" : "s"}`,
      detail: firstWarn.length > 160 ? `${firstWarn.slice(0, 160)}…` : firstWarn,
      fix: "Runtime warnings (prefixed [aktion]) are usually the direct explanation of a reactivity bug."
    });
  }
  const rate2 = commitRate(model);
  if (rate2 > 30) {
    out.push({
      id: "commit-loop",
      tone: "bad",
      tab: "profiler",
      title: `Commits at ${rate2.toFixed(0)}/s`,
      detail: "Something is writing state in a loop — an effect that writes what it reads, or an interval that is too fast.",
      fix: "Check the Effects view for a hot trigger and State → sort by activity for the atom being churned."
    });
  }
  const slow = model.commits.filter((c) => !c.initial && c.duration > 16);
  if (slow.length >= 3) {
    const worst = slow.reduce((a, b) => b.duration > a.duration ? b : a);
    out.push({
      id: "slow-commits",
      tone: "warn",
      tab: "profiler",
      commitId: worst.commitId,
      title: `${slow.length} commits over the 16ms frame budget`,
      detail: `Worst: commit #${worst.commitId} at ${worst.duration.toFixed(1)}ms.`,
      fix: "Open it in the flame chart to see which component spent the time."
    });
  }
  return out;
}
function performanceInsights(model, vitals) {
  const out = [];
  const commits = model.commits;
  if (commits.length === 0) return out;
  const aggregates = componentAggregates(commits);
  for (const agg of aggregates) {
    if (agg.renders === 0) continue;
    const avg = agg.total / agg.renders;
    if (avg >= 8) {
      out.push({
        id: `slow:${agg.name}`,
        tone: avg >= 16 ? "bad" : "warn",
        tab: "profiler",
        component: agg.name,
        title: `${agg.name} averages ${avg.toFixed(1)}ms per render`,
        detail: `${agg.renders} renders across ${agg.instances} instance${agg.instances === 1 ? "" : "s"}; slowest ${agg.max.toFixed(1)}ms.`,
        fix: "Move expensive derivations into a $memo, or split the component so the costly part re-renders less."
      });
    }
  }
  for (const agg of aggregates) {
    if (agg.kind !== "user" || commits.length < 4) continue;
    if (agg.renders >= 12 && agg.memo === 0) {
      out.push({
        id: `unmemo:${agg.name}`,
        tone: "warn",
        tab: "profiler",
        component: agg.name,
        title: `${agg.name} re-rendered ${agg.renders}× and was never skipped`,
        detail: "It reads a $state path that changes on every commit, or receives a new object/array/lambda argument each render.",
        fix: "Read narrower paths ($user.name, not $user), and hoist constant arguments out of the render."
      });
    }
  }
  let wasted = 0;
  let rendered = 0;
  for (const commit of commits) {
    for (const record of commit.components) {
      if (record.phase === "memo") continue;
      rendered += 1;
      if (record.reason === "full render") wasted += 1;
    }
  }
  if (rendered >= 50 && wasted / rendered > 0.35) {
    out.push({
      id: "wasted",
      tone: "warn",
      tab: "profiler",
      title: `${Math.round(wasted / rendered * 100)}% of renders changed nothing`,
      detail: `${wasted} component renders ran only because a commit was forced (an async resolution, an effect, a timer), with identical arguments and no changed dependency.`,
      fix: "Forced commits skip memoisation. Batch async updates, and prefer $state writes over notify-style updates so the render gate can skip unchanged components."
    });
  }
  const forced = commits.filter((c) => c.fullRender && !c.initial).length;
  if (forced >= 3 && forced / commits.length > 0.5) {
    out.push({
      id: "forced",
      tone: "info",
      tab: "profiler",
      title: `${forced} of ${commits.length} commits were full renders`,
      detail: "Full renders re-evaluate every component. They come from resource resolutions, effects, timers, and custom events."
    });
  }
  const morphHeavy = commits.filter((c) => (c.morphTime ?? 0) > 0.6 * c.duration && c.duration > 4);
  if (morphHeavy.length >= 5) {
    out.push({
      id: "morph",
      tone: "warn",
      tab: "profiler",
      title: `${morphHeavy.length} commits spent most of their time diffing the DOM`,
      detail: "The program evaluated quickly, but reconciling the output took the time — the tree is large or reshapes a lot.",
      fix: "Paginate or virtualise long lists (DataGrid, VirtualList), and give list rows a stable `key:`."
    });
  }
  const last = commits[commits.length - 1];
  if ((last.domNodes ?? 0) > 5e3) {
    out.push({
      id: "dom-size",
      tone: (last.domNodes ?? 0) > 12e3 ? "bad" : "warn",
      tab: "profiler",
      title: `${(last.domNodes ?? 0).toLocaleString("en-US")} DOM nodes`,
      detail: "Large DOMs make every layout, style recalculation, and reconcile slower.",
      fix: "Virtualise long lists and lazy-render hidden tabs and collapsed sections."
    });
  }
  const rate2 = commitRate(model);
  if (rate2 > 30) {
    out.push({
      id: "loop",
      tone: "bad",
      tab: "effects",
      title: `Commits arriving at ${rate2.toFixed(0)}/s`,
      detail: "Something is writing state in a loop.",
      fix: "Look for an effect whose body writes an atom it also triggers on."
    });
  }
  if (vitals) {
    const slowInteractions = vitals.interactions.filter((i) => i.duration > 200);
    if (slowInteractions.length > 0) {
      const worst = slowInteractions.reduce((a, b) => b.duration > a.duration ? b : a);
      const phase = worst.processing >= worst.inputDelay && worst.processing >= worst.presentation ? "processing (your handlers and the commit they trigger)" : worst.inputDelay >= worst.presentation ? "input delay (the main thread was busy before the handler could run)" : "presentation (layout and paint after the handlers)";
      out.push({
        id: "inp",
        tone: worst.duration > 500 ? "bad" : "warn",
        tab: "profiler",
        title: `${slowInteractions.length} interaction${slowInteractions.length === 1 ? "" : "s"} slower than 200ms`,
        detail: `Worst: ${worst.type} on ${worst.target || "an element"} took ${Math.round(worst.duration)}ms, mostly ${phase}.`,
        fix: "Keep handlers small and move heavy work off the input path (debounce, $util.defer, a worker)."
      });
    }
    const blocked = vitals.longTasks.filter((t) => t.duration > 50);
    if (blocked.length >= 3) {
      const scripts = blocked.flatMap((t) => t.scripts ?? []).sort((a, b) => b.duration - a.duration);
      out.push({
        id: "long-tasks",
        tone: "warn",
        tab: "profiler",
        title: `${blocked.length} long tasks blocked the main thread`,
        detail: scripts[0] ? `Top script: ${scripts[0].source} (${Math.round(scripts[0].duration)}ms).` : "A long task delays input handling and rendering for its whole duration."
      });
    }
  }
  if (out.length === 0) {
    out.push({ id: "healthy", tone: "good", title: "No render hot-spots detected", detail: "Commits fit the frame budget, memoisation is working, and nothing is looping." });
  }
  const order = { bad: 0, warn: 1, info: 2, good: 3 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]).slice(0, 12);
}
function layoutFlame(commit, previous) {
  const records = /* @__PURE__ */ new Map();
  for (const record of commit.components) records.set(record.instanceKey, record);
  const keys2 = new Set(records.keys());
  const children = /* @__PURE__ */ new Map();
  for (const key2 of records.keys()) {
    const parent = parentKeyOf(key2, keys2);
    const bucket = children.get(parent);
    if (bucket) bucket.push(key2);
    else children.set(parent, [key2]);
  }
  let sumSelf = 0;
  for (const record of records.values()) sumSelf += record.selfTime;
  const epsilon = Math.max(1e-3, sumSelf * 4e-3);
  const totals = /* @__PURE__ */ new Map();
  const estimated = /* @__PURE__ */ new Set();
  const inclusive = (key2, guard) => {
    const cached = totals.get(key2);
    if (cached !== void 0) return cached;
    const record = records.get(key2);
    let childSum = 0;
    if (guard < 400) for (const child of children.get(key2) ?? []) childSum += inclusive(child, guard + 1);
    let value;
    if (record.phase === "memo") {
      const prior = previous?.get(key2);
      value = Math.max(prior ?? epsilon, childSum);
      estimated.add(key2);
    } else if (record.kind === "library") {
      value = Math.max(record.selfTime, childSum);
    } else {
      value = record.selfTime + childSum;
    }
    totals.set(key2, value);
    return value;
  };
  const nodes = [];
  let maxDepth = 0;
  let maxSelf = 0;
  const place = (key2, start2, depth, guard) => {
    const record = records.get(key2);
    const total = inclusive(key2, 0);
    let childSum = 0;
    for (const child of children.get(key2) ?? []) childSum += totals.get(child) ?? inclusive(child, 0);
    const self = record.phase === "memo" ? 0 : Math.max(0, total - childSum);
    if (depth > maxDepth) maxDepth = depth;
    if (self > maxSelf) maxSelf = self;
    nodes.push({
      key: key2,
      name: record.name,
      kind: record.kind,
      phase: record.phase,
      self,
      total,
      start: start2,
      depth,
      reason: record.reason,
      deps: record.deps,
      estimated: estimated.has(key2) || void 0
    });
    if (guard > 400) return;
    let cursor2 = start2 + (record.kind === "user" && record.phase !== "memo" ? record.selfTime : 0);
    for (const child of children.get(key2) ?? []) {
      place(child, cursor2, depth + 1, guard + 1);
      cursor2 += totals.get(child) ?? 0;
    }
  };
  let cursor = 0;
  for (const root of children.get(null) ?? []) {
    place(root, cursor, 0, 0);
    cursor += totals.get(root) ?? 0;
  }
  return { nodes, total: cursor, maxDepth, maxSelf };
}
function inclusiveTimes(layout2) {
  const out = /* @__PURE__ */ new Map();
  for (const node of layout2.nodes) if (!node.estimated) out.set(node.key, node.total);
  return out;
}
function packLanes(spans, maxLanes = 8, gap = 0) {
  const order = spans.map((span, index) => ({ span, index })).sort((a, b) => a.span.start - b.span.start || a.index - b.index);
  const laneEnds = [];
  const lanes = new Array(spans.length).fill(0);
  for (const { span, index } of order) {
    let lane = laneEnds.findIndex((end) => end + gap <= span.start);
    if (lane < 0) {
      if (laneEnds.length < maxLanes) {
        lane = laneEnds.length;
        laneEnds.push(span.end);
      } else {
        lane = laneEnds.indexOf(Math.min(...laneEnds));
        laneEnds[lane] = Math.max(laneEnds[lane], span.end);
      }
    } else {
      laneEnds[lane] = span.end;
    }
    lanes[index] = lane;
  }
  return { lanes, count: Math.max(1, laneEnds.length) };
}
function niceTicks(start2, end, targetCount = 8) {
  const span = end - start2;
  if (!(span > 0) || !Number.isFinite(span)) return [start2];
  const raw = span / Math.max(1, targetCount);
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const residual = raw / magnitude;
  const step = (residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1) * magnitude;
  const first = Math.ceil(start2 / step) * step;
  const out = [];
  for (let t = first; t <= end + step * 1e-9 && out.length < 200; t += step) out.push(Number(t.toFixed(10)));
  return out;
}
function tickLabel(ms, span) {
  if (span >= 12e4) return `${Math.round(ms / 1e3)}s`;
  if (span >= 5e3) return `${(ms / 1e3).toFixed(1)}s`;
  if (span >= 200) return `${Math.round(ms)}ms`;
  if (span >= 10) return `${ms.toFixed(1)}ms`;
  return `${ms.toFixed(2)}ms`;
}
function shellQuote(value) {
  if (value === "") return "''";
  if (/^[A-Za-z0-9_\-./:=@%+,]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
function toCurl(request) {
  const lines2 = [`curl ${shellQuote(request.url)}`];
  const method = request.method.toUpperCase();
  if (method !== "GET" || request.requestBody) lines2.push(`-X ${method}`);
  for (const [name, value] of Object.entries(request.requestHeaders ?? {})) {
    lines2.push(`-H ${shellQuote(`${name}: ${value}`)}`);
  }
  if (request.requestBody) lines2.push(`--data-raw ${shellQuote(request.requestBody)}`);
  return lines2.join(" \\\n  ");
}
function toFetch(request) {
  const init = { method: request.method.toUpperCase() };
  const headers = request.requestHeaders ?? {};
  if (Object.keys(headers).length > 0) init.headers = headers;
  if (request.requestBody) init.body = request.requestBody;
  return `await fetch(${JSON.stringify(request.url)}, ${JSON.stringify(init, null, 2)});`;
}
function pairs(record) {
  return Object.entries(record ?? {}).map(([name, value]) => ({ name, value }));
}
function queryPairs(url) {
  try {
    return [...new URL(url, "http://localhost").searchParams.entries()].map(([name, value]) => ({ name, value }));
  } catch {
    return [];
  }
}
function header(record, name) {
  const key2 = Object.keys(record ?? {}).find((k) => k.toLowerCase() === name);
  return key2 ? record[key2] : void 0;
}
function toHar(requests, options) {
  const started = requests.length > 0 ? Math.min(...requests.map((r) => r.startTime)) : 0;
  const pageId = "page_1";
  const doc = {
    log: {
      version: "1.2",
      creator: { name: options.creator ?? "Aktion DevTools", version: options.version ?? "3" },
      pages: [{
        startedDateTime: new Date(options.epochOffset + started).toISOString(),
        id: pageId,
        title: options.pageTitle ?? (typeof document !== "undefined" ? document.title : ""),
        pageTimings: {}
      }],
      entries: requests.map((request) => {
        const duration = Math.max(0, request.duration ?? 0);
        const contentType = header(request.responseHeaders, "content-type") ?? "";
        return {
          pageref: pageId,
          startedDateTime: new Date(options.epochOffset + request.startTime).toISOString(),
          time: duration,
          request: {
            method: request.method.toUpperCase(),
            url: request.url,
            httpVersion: "HTTP/1.1",
            headers: pairs(request.requestHeaders),
            queryString: queryPairs(request.url),
            cookies: [],
            headersSize: -1,
            bodySize: request.requestBody ? request.requestBody.length : 0,
            ...request.requestBody ? { postData: { mimeType: header(request.requestHeaders, "content-type") ?? "application/json", text: request.requestBody } } : {}
          },
          response: {
            status: request.status ?? 0,
            statusText: request.phase === "error" || request.phase === "blocked" ? request.error ?? "failed" : "",
            httpVersion: "HTTP/1.1",
            headers: pairs(request.responseHeaders),
            cookies: [],
            content: { size: request.responseSize ?? 0, mimeType: contentType, text: request.responseBody ?? "" },
            redirectURL: "",
            headersSize: -1,
            bodySize: request.responseSize ?? -1,
            ...request.error ? { _error: request.error } : {}
          },
          cache: {},
          timings: { blocked: -1, dns: -1, connect: -1, ssl: -1, send: 0, wait: duration, receive: 0 },
          ...request.rule ? { _aktionRule: request.rule } : {},
          ...request.phase === "mock" ? { _aktionMocked: true } : {}
        };
      })
    }
  };
  return JSON.stringify(doc, null, 2);
}
function defaultUiState() {
  return {
    tab: "overview",
    paused: false,
    dock: "float",
    theme: "system",
    light: false,
    compact: false,
    motion: "system",
    minimized: false,
    collapsed: false,
    railWide: false,
    showLauncher: true,
    pushPage: true,
    toasts: [],
    toast: null,
    paletteOpen: false,
    paletteQuery: "",
    paletteIndex: 0,
    shortcutsOpen: false,
    menu: null,
    dialog: null,
    tipsDismissed: false,
    highlightUpdates: false,
    perfMarks: false,
    flashOnCommit: false,
    edit: null,
    sizes: {},
    inspectFilter: "",
    inspectCollapsed: /* @__PURE__ */ new Set(),
    selectedInstance: null,
    selectedElement: null,
    inspectPane: "props",
    inspectShowLibrary: true,
    inspectReveal: null,
    propsExpanded: /* @__PURE__ */ new Set(),
    computedFilter: "",
    overrideDraft: { name: "", value: "" },
    stateFilter: "",
    stateExpanded: /* @__PURE__ */ new Set(),
    stateSort: "name",
    stateShowReserved: false,
    timeTravel: null,
    stateView: "tree",
    diffFrom: null,
    diffTo: null,
    breakOnChange: /* @__PURE__ */ new Set(),
    importDraft: null,
    stateSelected: null,
    statePages: /* @__PURE__ */ new Map(),
    bookmarks: [],
    graphHover: null,
    dataPane: "queries",
    storageKind: "local",
    dataExpanded: /* @__PURE__ */ new Set(),
    selectedQuery: null,
    selectedStore: null,
    storageFilter: "",
    storageSelected: null,
    invalidateDraft: "",
    storageDraft: { key: "", value: "" },
    storeArgs: {},
    storageEdit: null,
    routeDraft: "",
    routeParams: {},
    routeFilter: "",
    timelineKinds: /* @__PURE__ */ new Set(["commit", "state", "effect", "network", "route", "emit", "error", "interaction", "longtask"]),
    timelineView: null,
    timelineBrush: null,
    timelineSelected: null,
    timelineFilter: "",
    networkFilter: "",
    networkOnlyProblems: false,
    networkStatus: "all",
    selectedRequest: null,
    networkPane: "response",
    networkResponseView: "tree",
    networkSort: null,
    showRules: false,
    rules: [],
    throttle: "none",
    networkExpanded: /* @__PURE__ */ new Set(),
    logFilter: "",
    logLevels: /* @__PURE__ */ new Set(["log", "info", "warn", "error", "debug"]),
    logOrigin: "all",
    captureConsole: true,
    repl: [],
    replDraft: "",
    replHistory: [],
    replCursor: -1,
    watches: [],
    consoleSelected: null,
    replExpanded: /* @__PURE__ */ new Set(),
    phaseFilter: /* @__PURE__ */ new Set(["mount", "run", "cleanup", "unmount", "error"]),
    effectView: "mounted",
    selectedEffect: null,
    effectFilter: "",
    selectedCommitId: null,
    profilerView: "flame",
    rankedSort: { key: "self", dir: -1 },
    componentSort: { key: "total", dir: -1 },
    perfFilter: "",
    flameSelected: null,
    a11yRun: null,
    a11yRequested: false,
    a11ySelected: null,
    a11yPane: "issues",
    a11yImpacts: /* @__PURE__ */ new Set(["critical", "serious", "moderate", "minor"]),
    a11yShowOnPage: false,
    a11yTabOrder: false,
    a11yLandmarks: false,
    a11yVision: "none",
    a11yAuto: false,
    a11yTreeCollapsed: /* @__PURE__ */ new Set(),
    a11yTreeSelected: null,
    a11yTreeFilter: "",
    a11yCategory: "all",
    a11yFilter: "",
    a11yCollapsed: /* @__PURE__ */ new Set(),
    a11yPrevScore: null,
    a11yWalk: -1,
    contrastFg: "#6b7280",
    contrastBg: "#ffffff",
    securityRun: null,
    securityRequested: false,
    securityPane: "findings",
    securitySelected: null,
    securitySeverities: /* @__PURE__ */ new Set(["high", "medium", "low", "info"]),
    securityCategory: "all",
    securityHeaders: null,
    securityHeadersState: "idle",
    securityHeadersError: null,
    testPane: "record",
    testFormat: "aktion",
    queryProbe: "",
    queryProbeKind: "role",
    queryProbeName: "",
    fuzzRun: null,
    fuzzRunning: false,
    generatedTest: null,
    replaying: null,
    scenarios: [],
    showTestIds: false,
    emulateDir: "auto",
    emulateTextScale: 1,
    replayResults: [],
    scenariosFor: null,
    scenarioDraft: "",
    testIncludeState: true,
    chaosClicks: 100,
    chaosTyping: true,
    chaosSeed: "",
    sourceIndex: 0,
    sourceFocusLine: null,
    sourceDraft: null,
    sourceOutline: true,
    sourceFilter: "",
    sourceHistoryOpen: false,
    sourceDiff: null,
    sourceSidebar: null,
    sourceShowDraftDiff: false,
    themeFilter: "",
    themeEditedOnly: false
  };
}
const STORAGE_KEY = "aktion-devtools-ui";
function loadPersisted() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed2 = JSON.parse(raw);
    return parsed2 && typeof parsed2 === "object" ? parsed2 : {};
  } catch {
    return {};
  }
}
function savePersisted(state) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
  }
}
function loadAppData(appLabel, kind, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(`aktion-devtools:${kind}:${appLabel}`);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function saveAppData(appLabel, kind, value) {
  try {
    globalThis.localStorage?.setItem(`aktion-devtools:${kind}:${appLabel}`, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
function can(app, capability) {
  return app !== null && typeof app[capability] === "function";
}
function renderRootElement(app) {
  if (!can(app, "getRenderRoot")) return null;
  const root = app.getRenderRoot();
  if (root === null) return null;
  if (root instanceof Element) return root;
  return root.firstElementChild ?? null;
}
function button(options) {
  const cls = [
    "btn",
    options.variant && options.variant !== "default" ? `is-${options.variant}` : "",
    options.size && options.size !== "md" ? `is-${options.size}` : "",
    options.active ? "is-on" : ""
  ];
  return h(
    "button",
    {
      type: "button",
      class: cls,
      disabled: options.disabled || void 0,
      "data-tip": options.tip,
      "data-kbd": options.kbd,
      "data-dt": options.testid,
      "aria-pressed": options.active === void 0 ? void 0 : options.active,
      onClick: options.onClick,
      ...options.attrs
    },
    options.icon ? icon(options.icon, { size: options.size === "sm" ? 13 : 14 }) : null,
    options.label ?? null,
    options.trailing ?? null
  );
}
function iconButton(options) {
  const size = options.size ?? "md";
  return h(
    "button",
    {
      type: "button",
      class: ["ibtn", size !== "md" ? `is-${size}` : "", options.active ? "is-on" : "", options.danger ? "is-danger" : ""],
      "aria-label": options.label,
      "data-tip": options.label,
      "data-kbd": options.kbd,
      "data-dt": options.testid,
      "aria-pressed": options.active === void 0 ? void 0 : options.active,
      disabled: options.disabled || void 0,
      onClick: options.onClick,
      ...options.attrs
    },
    icon(options.icon, { size: size === "sm" ? 13 : size === "lg" ? 17 : 15 }),
    options.dot ? h("span", { class: "dot" }) : null
  );
}
function segmented(choices, value, onChange, options = {}) {
  return h(
    "div",
    { class: "seg", role: "tablist", "aria-label": options.label, "data-dt": options.testid },
    ...choices.map(
      (choice) => h(
        "button",
        {
          key: choice.value,
          type: "button",
          role: "tab",
          class: choice.value === value ? "is-on" : "",
          "aria-selected": choice.value === value,
          "data-tip": choice.tip,
          "data-dt": choice.testid ?? `seg-${choice.value}`,
          onClick: () => onChange(choice.value)
        },
        choice.icon ? icon(choice.icon, { size: 13 }) : null,
        choice.label,
        choice.count !== void 0 && choice.count !== null && choice.count !== 0 ? h("span", { class: "seg-count" }, String(choice.count)) : null
      )
    )
  );
}
function tabs(choices, value, onChange, options = {}) {
  return h(
    "div",
    { class: "tabs", role: "tablist", "aria-label": options.label },
    ...choices.map(
      (choice) => h(
        "button",
        {
          key: choice.value,
          type: "button",
          role: "tab",
          class: choice.value === value ? "is-on" : "",
          "aria-selected": choice.value === value,
          "data-tip": choice.tip,
          "data-dt": choice.testid ?? `tab-${choice.value}`,
          onClick: () => onChange(choice.value)
        },
        choice.icon ? icon(choice.icon, { size: 13 }) : null,
        choice.label,
        choice.count !== void 0 && choice.count !== null && choice.count !== 0 ? h("span", { class: ["tab-count", choice.tone ? `t-${choice.tone}` : ""] }, String(choice.count)) : null
      )
    ),
    options.trailing ? h("span", { class: "grow" }) : null,
    options.trailing ?? null
  );
}
function filterChip(options) {
  return h(
    "button",
    {
      type: "button",
      class: ["fchip", options.on ? "is-on" : ""],
      "aria-pressed": options.on,
      "data-tip": options.tip,
      "data-dt": options.testid,
      onClick: options.onToggle
    },
    options.swatch ? h("span", { class: "swatch", style: { background: options.swatch } }) : null,
    options.label,
    options.count !== void 0 ? h("span", { class: "fcount" }, String(options.count)) : null
  );
}
function toggleSwitch(options) {
  return h(
    "label",
    { class: "switch", "data-dt": options.testid },
    h("input", {
      type: "checkbox",
      role: "switch",
      checked: options.checked,
      disabled: options.disabled || void 0,
      onChange: (event) => options.onChange(event.target.checked)
    }),
    h("span", { class: "track", "aria-hidden": "true" }),
    options.label ? h("span", { class: "switch-label" }, options.label) : null
  );
}
function searchField(options) {
  return h(
    "div",
    { class: "search", style: options.width ? { flexBasis: options.width } : void 0 },
    icon("search", { size: 13 }),
    h("input", {
      class: "input",
      type: "search",
      "data-search": "",
      "data-dt": options.testid,
      placeholder: options.placeholder ?? "Filter…",
      "aria-label": options.placeholder ?? "Filter",
      spellcheck: "false",
      autocomplete: "off",
      value: options.value,
      onInput: (event) => options.onInput(event.target.value),
      onKeyDown: (event) => {
        if (event.key === "Escape" && options.value !== "") {
          event.stopPropagation();
          options.onInput("");
        }
        options.onKeyDown?.(event);
      }
    }),
    options.meta ? h("span", { class: "search-meta" }, options.meta) : null,
    options.value ? iconButton({ icon: "close", label: "Clear filter", size: "sm", onClick: () => options.onInput(""), attrs: { class: "ibtn is-sm search-clear" } }) : null
  );
}
function field(options) {
  return h("input", {
    class: ["input", options.mono ? "is-mono" : "", options.invalid ? "is-invalid" : ""],
    type: options.type ?? "text",
    value: options.value,
    placeholder: options.placeholder,
    "aria-label": options.label ?? options.placeholder,
    "aria-invalid": options.invalid || void 0,
    "data-dt": options.testid,
    spellcheck: "false",
    autocomplete: "off",
    style: options.width ? { width: options.width } : void 0,
    onInput: options.onInput ? (event) => options.onInput(event.target.value) : void 0,
    onKeyDown: (event) => {
      if (event.key === "Enter" && options.onCommit) {
        event.preventDefault();
        options.onCommit(event.target.value);
      }
      options.onKeyDown?.(event);
    },
    onChange: options.commitOnBlur && options.onCommit ? (event) => options.onCommit(event.target.value) : void 0,
    ...options.attrs
  });
}
function textarea(options) {
  return h("textarea", {
    class: ["textarea", options.mono ? "is-mono" : "", options.invalid ? "is-invalid" : ""],
    rows: options.rows ?? 6,
    value: options.value,
    placeholder: options.placeholder,
    "aria-label": options.label ?? options.placeholder,
    "data-dt": options.testid,
    spellcheck: "false",
    onInput: (event) => options.onInput(event.target.value),
    onKeyDown: options.onKeyDown
  });
}
function select(options) {
  return h(
    "select",
    {
      class: "select",
      value: options.value,
      "aria-label": options.label,
      "data-dt": options.testid,
      style: options.width ? { width: options.width } : void 0,
      onChange: (event) => options.onChange(event.target.value)
    },
    ...options.options.map((option) => h("option", { key: option.value, value: option.value }, option.label))
  );
}
function chip(label, tone = "grey", options = {}) {
  const cls = ["chip", tone !== "grey" ? `t-${tone}` : "", options.mono ? "is-mono" : "", options.outline ? "is-outline" : ""];
  return h(
    options.onClick ? "button" : "span",
    {
      class: cls,
      type: options.onClick ? "button" : void 0,
      "data-tip": options.tip,
      "data-dt": options.testid,
      onClick: options.onClick
    },
    options.icon ? icon(options.icon, { size: 11 }) : null,
    label
  );
}
function kbd(keys2) {
  return h("span", { class: "kbd" }, keys2);
}
function keys(combo) {
  return h("span", { class: "row-flex", style: { gap: "3px" } }, ...combo.split(/\s+/).filter(Boolean).map((k) => kbd(k)));
}
function spinner() {
  return h("span", { class: "spinner", role: "status", "aria-label": "Loading" });
}
function stat(options) {
  return h(
    options.onClick ? "button" : "div",
    {
      class: ["stat", options.tone ? `t-${options.tone}` : ""],
      type: options.onClick ? "button" : void 0,
      "data-tip": options.tip,
      "data-dt": options.testid,
      onClick: options.onClick
    },
    h("span", { class: "stat-label" }, options.icon ? icon(options.icon, { size: 11 }) : null, options.label),
    h(
      "span",
      { class: "stat-main" },
      h("span", { class: "stat-value" }, options.value, options.unit ? h("small", {}, options.unit) : null),
      options.spark ? h("span", { class: "spark" }, options.spark) : null
    ),
    options.foot !== void 0 ? h("span", { class: "stat-foot" }, options.foot) : null
  );
}
function statGrid(...stats) {
  return h("div", { class: "grid-stats" }, ...stats);
}
function meter(fraction, tone) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  return h("span", { class: ["meter", tone ? `t-${tone}` : ""], role: "presentation" }, h("span", { style: { width: `${(pct * 100).toFixed(1)}%` } }));
}
function emptyState(options) {
  return h(
    "div",
    { class: "empty", "data-dt": options.testid ?? "empty" },
    h("div", { class: "empty-art" }, icon(options.icon ?? "inbox", { size: 22 })),
    h("div", { class: "empty-title" }, options.title),
    options.body ? h("div", { class: "empty-body" }, options.body) : null,
    options.actions && options.actions.length > 0 ? h("div", { class: "empty-actions" }, ...options.actions) : null
  );
}
function note(tone, body, options = {}) {
  const glyph = options.icon ?? (tone === "warn" ? "warning" : tone === "error" ? "error" : tone === "good" ? "checkCircle" : tone === "accent" ? "sparkles" : "info");
  return h(
    "div",
    { class: ["note", tone !== "plain" ? `t-${tone}` : ""], "data-dt": options.testid, role: tone === "error" ? "alert" : void 0 },
    icon(glyph, { size: 14 }),
    h("div", { class: "grow" }, body),
    options.actions ?? null
  );
}
function kv(rows) {
  const out = [];
  for (const row2 of rows) {
    if (!row2) continue;
    out.push(h("dt", {}, row2[0]), h("dd", {}, row2[1]));
  }
  return h("dl", { class: "kv" }, ...out);
}
function card(options) {
  return h(
    "section",
    { class: ["card", options.className ?? ""], "data-dt": options.testid },
    options.title !== void 0 || options.actions ? h(
      "div",
      { class: "card-head" },
      options.title !== void 0 ? h("h3", { class: "card-title", style: { margin: "0" } }, options.icon ? icon(options.icon, { size: 14 }) : null, options.title) : null,
      options.sub ? h("span", { class: "card-sub" }, options.sub) : null,
      h("span", { class: "grow" }),
      ...options.actions ?? []
    ) : null,
    h("div", { class: ["card-body", options.flush ? "is-flush" : ""] }, options.body)
  );
}
function viewbar(...children) {
  return h("div", { class: "viewbar", role: "toolbar" }, ...children);
}
function spacer() {
  return h("span", { class: "grow" });
}
function vsep() {
  return h("span", { class: "vb-sep", "aria-hidden": "true" });
}
function sparkline(values2, options = {}) {
  const width = options.width ?? 64;
  const height = options.height ?? 20;
  const color = options.color ?? "var(--dt-accent)";
  if (values2.length < 2) {
    return h(
      "svg",
      { width, height, viewBox: `0 0 ${width} ${height}`, "aria-hidden": "true" },
      h("line", { x1: 0, y1: height - 1, x2: width, y2: height - 1, stroke: "var(--dt-border-strong)", "stroke-width": "1" })
    );
  }
  const max = Math.max(options.max ?? 0, ...values2, 1e-9);
  const step = width / (values2.length - 1);
  const points = values2.map((v, i) => [i * step, height - 1.5 - Math.max(0, v) / max * (height - 3)]);
  const d = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  return h(
    "svg",
    { width, height, viewBox: `0 0 ${width} ${height}`, "aria-hidden": "true", style: { overflow: "visible" } },
    options.fill !== false ? h("path", { d: `${d}L${width} ${height}L0 ${height}Z`, fill: color, opacity: "0.14", stroke: "none" }) : null,
    h("path", { d, fill: "none", stroke: color, "stroke-width": "1.5", "stroke-linejoin": "round", "stroke-linecap": "round" })
  );
}
function microBars(values2, options = {}) {
  const width = options.width ?? 80;
  const height = options.height ?? 22;
  const n = Math.max(1, values2.length);
  const gap = n > 40 ? 0.5 : 1;
  const bw = Math.max(1, width / n - gap);
  const max = Math.max(...values2, 1e-9);
  return h(
    "svg",
    { width, height, viewBox: `0 0 ${width} ${height}`, "aria-hidden": "true" },
    ...values2.map((v, i) => {
      const bh = Math.max(1, v / max * height);
      return h("rect", {
        key: i,
        x: (i * (width / n)).toFixed(1),
        y: (height - bh).toFixed(1),
        width: bw.toFixed(1),
        height: bh.toFixed(1),
        rx: "1",
        fill: options.highlight?.(v) ?? options.color ?? "var(--dt-accent)"
      });
    })
  );
}
function scoreRing(score, options = {}) {
  const size = options.size ?? 64;
  const stroke = Math.max(4, Math.round(size / 11));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const value = score === null ? 0 : Math.max(0, Math.min(100, score));
  const color = score === null ? "var(--dt-text-4)" : value >= 90 ? "var(--dt-green)" : value >= 50 ? "var(--dt-amber)" : "var(--dt-red)";
  return h(
    "div",
    { class: "score-ring", style: { width: `${size}px`, height: `${size}px` }, role: "img", "aria-label": `${options.label ?? "Score"}: ${score === null ? "not run" : Math.round(value)}` },
    h(
      "svg",
      { width: size, height: size, viewBox: `0 0 ${size} ${size}`, "aria-hidden": "true" },
      h("circle", { cx: size / 2, cy: size / 2, r, fill: "none", stroke: "var(--dt-bg-active)", "stroke-width": stroke }),
      h("circle", {
        cx: size / 2,
        cy: size / 2,
        r,
        fill: "none",
        stroke: color,
        "stroke-width": stroke,
        "stroke-linecap": "round",
        "stroke-dasharray": `${(value / 100 * c).toFixed(2)} ${c.toFixed(2)}`,
        transform: `rotate(-90 ${size / 2} ${size / 2})`,
        style: { transition: "stroke-dasharray 600ms var(--dt-ease)" }
      })
    ),
    h("span", { class: "score-num", style: { color } }, score === null ? "–" : String(Math.round(value)))
  );
}
function fmtMs(n) {
  if (n === void 0 || n === null || !Number.isFinite(n)) return "—";
  if (n >= 6e4) return `${Math.floor(n / 6e4)}m ${Math.round(n % 6e4 / 1e3)}s`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n >= 1e4 ? 1 : 2)}s`;
  if (n >= 100) return `${n.toFixed(0)}ms`;
  if (n >= 10) return `${n.toFixed(1)}ms`;
  if (n >= 1) return `${n.toFixed(2)}ms`;
  if (n === 0) return "0ms";
  return `${(n * 1e3).toFixed(0)}µs`;
}
function fmtBytes(n) {
  if (n === void 0 || n === null || !Number.isFinite(n)) return "—";
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${Math.round(n)} B`;
}
function fmtCount(n) {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return n.toLocaleString("en-US");
}
function fmtPct(fraction, digits = 0) {
  if (!Number.isFinite(fraction)) return "—";
  return `${(fraction * 100).toFixed(digits)}%`;
}
function fmtClock(epochMs) {
  const d = new Date(epochMs);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
function fmtAgo(ms, now) {
  const delta = Math.max(0, now - ms);
  if (delta < 1e3) return "just now";
  if (delta < 6e4) return `${Math.floor(delta / 1e3)}s ago`;
  if (delta < 36e5) return `${Math.floor(delta / 6e4)}m ago`;
  if (delta < 864e5) return `${Math.floor(delta / 36e5)}h ago`;
  return `${Math.floor(delta / 864e5)}d ago`;
}
function truncateMiddle(text2, limit = 60) {
  if (text2.length <= limit) return text2;
  const head = Math.ceil((limit - 1) / 2);
  const tail = Math.floor((limit - 1) / 2);
  return `${text2.slice(0, head)}…${text2.slice(text2.length - tail)}`;
}
function plural(n, one, many = `${one}s`) {
  return `${fmtCount(n)} ${n === 1 ? one : many}`;
}
function richText(text2) {
  const parts = text2.split("`");
  if (parts.length % 2 === 0) parts.splice(parts.length - 2, 2, `${parts[parts.length - 2]}\`${parts[parts.length - 1]}`);
  const out = [];
  parts.forEach((part, i) => {
    if (part === "") return;
    out.push(i % 2 === 1 ? h("code", {}, part) : part);
  });
  return out;
}
function copyText(text2) {
  const clipboard = typeof navigator !== "undefined" ? navigator : void 0;
  if (clipboard?.clipboard?.writeText) {
    return clipboard.clipboard.writeText(text2).then(() => true, () => legacyCopy(text2));
  }
  return Promise.resolve(legacyCopy(text2));
}
function legacyCopy(text2) {
  try {
    const area = document.createElement("textarea");
    area.value = text2;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
function downloadText(filename, text2, mime = "application/json") {
  try {
    const blob = new Blob([text2], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e4);
  } catch {
  }
}
function split(options) {
  const col = options.direction === "col";
  const min = options.min ?? 140;
  const max = options.max ?? 4e3;
  const clamp2 = (n) => Math.round(Math.max(min, Math.min(max, n)));
  const size = clamp2(options.size);
  return h(
    "div",
    { class: ["split", col ? "is-col" : ""], "data-dt": options.testid },
    h("div", {
      class: "pane is-first",
      style: col ? { height: `${size}px`, maxHeight: "calc(100% - 60px)" } : { width: `${size}px`, maxWidth: "calc(100% - 140px)" }
    }, options.first),
    h("div", {
      class: "gutter",
      role: "separator",
      tabindex: 0,
      "aria-orientation": col ? "horizontal" : "vertical",
      "aria-label": options.label ?? "Resize panes",
      "aria-valuenow": size,
      "aria-valuemin": min,
      "aria-valuemax": max,
      onPointerDown: (event) => {
        if (event.button !== 0) return;
        const gutter = event.currentTarget;
        const pane = gutter.previousElementSibling;
        if (!pane) return;
        event.preventDefault();
        const start2 = col ? event.clientY : event.clientX;
        const initial = col ? pane.getBoundingClientRect().height : pane.getBoundingClientRect().width;
        let current = initial;
        gutter.classList.add("is-active");
        try {
          gutter.setPointerCapture(event.pointerId);
        } catch {
        }
        const move = (e) => {
          current = clamp2(initial + ((col ? e.clientY : e.clientX) - start2));
          if (col) pane.style.height = `${current}px`;
          else pane.style.width = `${current}px`;
        };
        const up = () => {
          gutter.classList.remove("is-active");
          gutter.removeEventListener("pointermove", move);
          gutter.removeEventListener("pointerup", up);
          gutter.removeEventListener("pointercancel", up);
          if (current !== initial) options.onResize(current);
        };
        gutter.addEventListener("pointermove", move);
        gutter.addEventListener("pointerup", up);
        gutter.addEventListener("pointercancel", up);
      },
      onKeyDown: (event) => {
        const step = event.shiftKey ? 64 : 16;
        const back = col ? "ArrowUp" : "ArrowLeft";
        const forward = col ? "ArrowDown" : "ArrowRight";
        if (event.key === back) {
          event.preventDefault();
          options.onResize(clamp2(size - step));
        } else if (event.key === forward) {
          event.preventDefault();
          options.onResize(clamp2(size + step));
        }
      }
    }),
    h("div", { class: "pane is-second" }, options.second)
  );
}
function cellStyle(col) {
  return col.width !== void 0 ? { width: `${col.width}px`, flex: "none" } : { flex: `${col.flex ?? 1} 1 0`, minWidth: "0" };
}
function sortRows(rows, columns, sort) {
  if (!sort) return rows;
  const col = columns.find((c) => c.key === sort.key);
  if (!col?.sort) return rows;
  const read = col.sort;
  return rows.map((row2, index) => ({ row: row2, index, v: read(row2) })).sort((a, b) => {
    let cmp;
    if (typeof a.v === "number" && typeof b.v === "number") cmp = a.v - b.v;
    else cmp = String(a.v).localeCompare(String(b.v), void 0, { numeric: true, sensitivity: "base" });
    return cmp !== 0 ? cmp * sort.dir : a.index - b.index;
  }).map((entry) => entry.row);
}
function dataTable(options) {
  const rows = sortRows(options.rows, options.columns, options.sort);
  const selectedIndex = options.selected === void 0 || options.selected === null ? -1 : rows.findIndex((row2) => options.rowKey(row2) === options.selected);
  const move = (delta) => {
    if (!options.onSelect || rows.length === 0) return;
    const next = Math.max(0, Math.min(rows.length - 1, (selectedIndex < 0 ? delta > 0 ? -1 : rows.length : selectedIndex) + delta));
    options.onSelect(rows[next], next);
  };
  return h(
    "div",
    { class: "table", "data-dt": options.testid, role: "grid", "aria-label": options.ariaLabel, "aria-rowcount": rows.length },
    h(
      "div",
      { class: "thead", role: "row" },
      ...options.columns.map((col) => {
        const active = options.sort?.key === col.key;
        const sortable = col.sort !== void 0 && options.onSort !== void 0;
        return h(
          sortable ? "button" : "div",
          {
            key: col.key,
            type: sortable ? "button" : void 0,
            role: "columnheader",
            class: ["th", col.align === "right" ? "is-num" : ""],
            style: cellStyle(col),
            "data-tip": col.tip,
            "aria-sort": active ? options.sort.dir === 1 ? "ascending" : "descending" : void 0,
            onClick: sortable ? () => options.onSort(active ? { key: col.key, dir: options.sort.dir === 1 ? -1 : 1 } : { key: col.key, dir: col.align === "right" ? -1 : 1 }) : void 0
          },
          col.label,
          active ? icon(options.sort.dir === 1 ? "chevronUp" : "chevronDown", { size: 10 }) : null
        );
      })
    ),
    virtualList({
      items: rows,
      rowHeight: options.rowHeight,
      rowKey: (row2) => options.rowKey(row2),
      version: [options.version, options.selected, options.sort?.key, options.sort?.dir],
      stickToBottom: options.stickToBottom,
      scrollTo: selectedIndex >= 0 ? selectedIndex : null,
      empty: options.empty,
      role: "rowgroup",
      ariaLabel: options.ariaLabel,
      onKeyDown: (event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          move(1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          move(-1);
        } else if (event.key === "PageDown") {
          event.preventDefault();
          move(10);
        } else if (event.key === "PageUp") {
          event.preventDefault();
          move(-10);
        } else if (event.key === "Home") {
          event.preventDefault();
          move(-rows.length);
        } else if (event.key === "End") {
          event.preventDefault();
          move(rows.length);
        } else if (event.key === "Enter" && selectedIndex >= 0) {
          event.preventDefault();
          options.onActivate?.(rows[selectedIndex]);
        }
      },
      renderRow: (row2, index) => {
        const key2 = options.rowKey(row2);
        return h(
          "div",
          {
            class: ["trow", key2 === options.selected ? "is-selected" : "", options.rowClass?.(row2) ?? ""],
            role: "row",
            "aria-selected": key2 === options.selected,
            "data-key": String(key2),
            onClick: options.onSelect ? () => options.onSelect(row2, index) : void 0,
            onDblClick: options.onActivate ? () => options.onActivate(row2) : void 0,
            onMouseEnter: options.onHover ? () => options.onHover(row2) : void 0,
            onMouseLeave: options.onHover ? () => options.onHover(null) : void 0,
            onContextMenu: options.onContextMenu ? (event) => {
              event.preventDefault();
              options.onContextMenu(row2, event);
            } : void 0
          },
          ...options.columns.map((col) => h("div", { key: col.key, role: "gridcell", class: ["td", col.align === "right" ? "is-num" : ""], style: cellStyle(col) }, col.render(row2, index)))
        );
      }
    })
  );
}
function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  if (value instanceof Map) return "map";
  if (value instanceof Set) return "set";
  return typeof value;
}
function entriesOf(value) {
  if (Array.isArray(value)) return value.map((v, i) => [String(i), v]);
  if (value instanceof Map) return [...value.entries()].map(([k, v]) => [String(k), v]);
  if (value instanceof Set) return [...value.values()].map((v, i) => [String(i), v]);
  if (value !== null && typeof value === "object") {
    try {
      return Object.keys(value).map((k) => {
        let v;
        try {
          v = value[k];
        } catch {
          v = "[getter threw]";
        }
        return [k, v];
      });
    } catch {
      return [];
    }
  }
  return [];
}
function isContainer(value) {
  const t = valueType(value);
  return t === "object" || t === "array" || t === "map" || t === "set";
}
function matchesFilter(key2, value, needle) {
  if (key2.toLowerCase().includes(needle)) return true;
  if (!isContainer(value)) return previewValue(value).toLowerCase().includes(needle);
  let budget = 400;
  const visit = (v) => {
    for (const [k, child] of entriesOf(v)) {
      if (budget-- <= 0) return false;
      if (k.toLowerCase().includes(needle)) return true;
      if (isContainer(child) ? visit(child) : previewValue(child).toLowerCase().includes(needle)) return true;
    }
    return false;
  };
  return visit(value);
}
function flattenValue(value, options) {
  const rows = [];
  const pageSize = options.pageSize ?? 200;
  const needle = (options.filter ?? "").trim().toLowerCase();
  const walk = (container, prefix, depth, containerPath) => {
    const entries = entriesOf(container);
    const limit = pageSize * (options.pages?.get(containerPath) ?? 1);
    const containerType = valueType(container);
    let shown = 0;
    for (const [key2, child] of entries) {
      if (depth === 0 && needle && !matchesFilter(key2, child, needle)) continue;
      if (shown >= limit) break;
      shown += 1;
      const path = prefix ? `${prefix}.${key2}` : key2;
      const expandable = isContainer(child) && entriesOf(child).length > 0;
      const open = expandable && options.expanded.has(path);
      rows.push({ path, key: key2, depth, value: child, type: valueType(child), expandable, open, isIndex: containerType === "array" || containerType === "set" });
      if (open) walk(child, path, depth + 1, path);
    }
    const total = depth === 0 && needle ? shown : entries.length;
    if (total > shown) {
      rows.push({ path: `${containerPath}::more`, key: "", depth, value: null, type: "more", expandable: false, open: false, isIndex: false, special: "more", hidden: total - shown, container: containerPath });
    }
    if (options.editable && containerPath !== "" && (containerType === "object" || containerType === "array") && options.editable(containerPath, depth - 1)) {
      rows.push({ path: `${containerPath}::add`, key: "", depth, value: null, type: "add", expandable: false, open: false, isIndex: false, special: "add", container: containerPath, containerType });
    }
  };
  walk(value, "", 0, "");
  return rows;
}
function previewValue(value) {
  const t = valueType(value);
  switch (t) {
    case "string": {
      const text2 = value;
      return JSON.stringify(text2.length > 200 ? `${text2.slice(0, 200)}…` : text2);
    }
    case "number":
    case "boolean":
      return String(value);
    case "bigint":
      return `${String(value)}n`;
    case "null":
      return "null";
    case "undefined":
      return "undefined";
    case "function": {
      const name = value.name;
      return name ? `ƒ ${name}()` : "ƒ ()";
    }
    case "date":
      return value.toISOString();
    case "array": {
      const arr = value;
      if (arr.length === 0) return "[]";
      const head = arr.slice(0, 4).map(shortPreview).join(", ");
      return `(${arr.length}) [${head}${arr.length > 4 ? ", …" : ""}]`;
    }
    case "map":
      return `Map(${value.size})`;
    case "set":
      return `Set(${value.size})`;
    case "object": {
      const entries = entriesOf(value);
      if (entries.length === 0) return "{}";
      const head = entries.slice(0, 3).map(([k, v]) => `${k}: ${shortPreview(v)}`).join(", ");
      return `{${head}${entries.length > 3 ? ", …" : ""}}`;
    }
    default:
      return String(value);
  }
}
function shortPreview(value) {
  const t = valueType(value);
  if (t === "string") {
    const s = value;
    return JSON.stringify(s.length > 18 ? `${s.slice(0, 18)}…` : s);
  }
  if (t === "array") return `Array(${value.length})`;
  if (t === "object") return "{…}";
  if (t === "function") return "ƒ";
  return previewValue(value);
}
function editSeed(value) {
  if (typeof value === "string") return value;
  if (value === void 0) return "undefined";
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}
function parseLeafEdit(draft, original) {
  if (typeof original === "string") {
    const trimmed = draft.trim();
    if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return draft;
      }
    }
    if (trimmed === "null") return null;
    return draft;
  }
  return parseEditedValue(draft);
}
function setAtPath(root, segments, next) {
  if (segments.length === 0) return next;
  const [head, ...rest] = segments;
  if (Array.isArray(root)) {
    const copy = root.slice();
    copy[Number(head)] = setAtPath(copy[Number(head)], rest, next);
    return copy;
  }
  const base2 = root !== null && typeof root === "object" ? root : {};
  return { ...base2, [head]: setAtPath(base2[head], rest, next) };
}
function withoutKey(container, key2) {
  if (Array.isArray(container)) return container.filter((_, i) => String(i) !== key2);
  if (container !== null && typeof container === "object") {
    const copy = { ...container };
    delete copy[key2];
    return copy;
  }
  return container;
}
function getAtPath(root, path) {
  if (path === "") return root;
  let current = root;
  for (const segment of path.split(".")) {
    if (current === null || current === void 0) return void 0;
    if (current instanceof Map) current = current.get(segment);
    else current = current[segment];
  }
  return current;
}
function parentPath(path) {
  const dot = path.lastIndexOf(".");
  return dot < 0 ? { parent: "", key: path } : { parent: path.slice(0, dot), key: path.slice(dot + 1) };
}
const INDENT = 14;
function leafSpan(value, type, open) {
  if (open && (type === "object" || type === "array")) {
    return h("span", { class: `v t-${type}` }, type === "array" ? `Array(${value.length})` : `{${entriesOf(value).length}}`);
  }
  return h("span", { class: `v t-${type}`, title: type === "string" ? value : void 0 }, previewValue(value));
}
function typeHint(draft, original) {
  const parsed2 = parseLeafEdit(draft, original);
  const t = valueType(parsed2);
  return t === "array" ? `array(${parsed2.length})` : t;
}
function valueTree(options) {
  const rows = flattenValue(options.value, {
    expanded: options.expanded,
    filter: options.filter,
    pageSize: options.pageSize,
    pages: options.pages,
    editable: options.onEdit ? options.editable : void 0
  });
  const canEdit = (path, depth) => options.onEdit !== void 0 && (options.editable?.(path, depth) ?? true);
  const commitLeaf = (row2, draft) => {
    options.setEditing(null);
    const next = parseLeafEdit(draft, row2.value);
    if (Object.is(next, row2.value)) return;
    options.onEdit?.(row2.path, next);
  };
  const deleteRow = (row2) => {
    const { parent, key: key2 } = parentPath(row2.path);
    if (parent === "") return;
    const container = getAtPath(options.value, parent);
    options.onEdit?.(parent, withoutKey(container, key2));
  };
  const renderRow = (row2) => {
    const indent = 6 + row2.depth * INDENT;
    if (row2.special === "more") {
      return h(
        "div",
        { class: "row", style: { paddingLeft: `${indent + 16}px` } },
        h("button", {
          type: "button",
          class: "link",
          "data-dt": "value-more",
          onClick: () => options.onMore?.(row2.container ?? "")
        }, `Show ${Math.min(row2.hidden ?? 0, options.pageSize ?? 200)} more… (${row2.hidden} hidden)`)
      );
    }
    if (row2.special === "add") {
      const editingKey = options.editing?.scope === options.scope && options.editing.path === row2.path && options.editing.mode === "key";
      const container = row2.container ?? "";
      if (editingKey) {
        return h(
          "div",
          { class: "row", style: { paddingLeft: `${indent + 16}px` } },
          h("input", {
            class: "v-edit",
            "data-dt": "value-add-key",
            placeholder: "new key — Enter to add",
            value: options.editing.draft,
            ref: autofocus(),
            onInput: (event) => {
              options.editing.draft = event.target.value;
            },
            onKeyDown: (event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                const name = options.editing.draft.trim();
                options.setEditing(null);
                if (!name) return;
                const target = getAtPath(options.value, container);
                options.onEdit?.(container, { ...target, [name]: null });
                options.expanded.add(container);
              } else if (event.key === "Escape") {
                event.preventDefault();
                options.setEditing(null);
              }
            },
            onBlur: () => options.setEditing(null)
          })
        );
      }
      return h(
        "div",
        { class: "row is-dim", style: { paddingLeft: `${indent + 16}px` } },
        h("button", {
          type: "button",
          class: "link",
          "data-dt": "value-add",
          onClick: () => {
            const target = getAtPath(options.value, container);
            if (Array.isArray(target)) {
              options.onEdit?.(container, [...target, null]);
            } else {
              options.setEditing({ scope: options.scope, path: row2.path, draft: "", mode: "key" });
            }
          }
        }, icon("plus", { size: 11 }), row2.containerType === "array" ? " Add item" : " Add key")
      );
    }
    const editing = options.editing?.scope === options.scope && options.editing.path === row2.path && options.editing.mode === "leaf";
    const editableHere = canEdit(row2.path, row2.depth);
    const leafEditable = editableHere && !row2.expandable && row2.type !== "function" && row2.type !== "object" && row2.type !== "array";
    const selected = options.selected === row2.path;
    let valueNode;
    if (editing) {
      const draft = options.editing.draft;
      valueNode = [
        h("input", {
          class: "v-edit",
          "data-dt": "value-edit",
          "aria-label": `Edit ${row2.path}`,
          value: draft,
          spellcheck: "false",
          ref: autofocus({ select: true }),
          onInput: (event) => {
            options.editing.draft = event.target.value;
            const hint = event.target.nextElementSibling;
            if (hint) hint.textContent = `→ ${typeHint(options.editing.draft, row2.value)}`;
          },
          onKeyDown: (event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitLeaf(row2, options.editing.draft);
            } else if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              options.setEditing(null);
            }
          },
          onBlur: (event) => {
            const input = event.target;
            if (options.editing?.path === row2.path && input.isConnected) commitLeaf(row2, input.value);
          }
        }),
        h("span", { class: "v-tag" }, `→ ${typeHint(draft, row2.value)}`)
      ];
    } else {
      const span = leafSpan(row2.value, row2.type, row2.open);
      valueNode = leafEditable ? h("span", {
        class: `v t-${row2.type} is-editable`,
        "data-dt": "value-leaf",
        title: "Click to edit · Enter commits · Esc cancels",
        onClick: (event) => {
          event.stopPropagation();
          options.setEditing({ scope: options.scope, path: row2.path, draft: editSeed(row2.value), mode: "leaf" });
        }
      }, span.children) : span;
    }
    const actions = [];
    if (!editing) {
      if (options.onCopy) {
        actions.push(h("button", {
          type: "button",
          class: "ibtn is-sm",
          "aria-label": `Copy ${row2.path}`,
          "data-tip": "Copy value",
          onClick: (event) => {
            event.stopPropagation();
            let text2;
            try {
              text2 = typeof row2.value === "string" ? row2.value : JSON.stringify(row2.value, null, 2) ?? String(row2.value);
            } catch {
              text2 = previewValue(row2.value);
            }
            options.onCopy(text2, row2.path);
          }
        }, icon("copy", { size: 12 })));
      }
      if (editableHere && options.editJson && (row2.type === "object" || row2.type === "array")) {
        actions.push(h("button", {
          type: "button",
          class: "ibtn is-sm",
          "aria-label": `Edit ${row2.path} as JSON`,
          "data-tip": "Edit as JSON",
          "data-dt": "value-edit-json",
          onClick: (event) => {
            event.stopPropagation();
            options.editJson(row2.path, row2.value);
          }
        }, icon("brackets", { size: 12 })));
      }
      if (editableHere && row2.depth > 0) {
        actions.push(h("button", {
          type: "button",
          class: "ibtn is-sm is-danger",
          "aria-label": `Delete ${row2.path}`,
          "data-tip": row2.isIndex ? "Remove item" : "Delete key",
          "data-dt": "value-delete",
          onClick: (event) => {
            event.stopPropagation();
            deleteRow(row2);
          }
        }, icon("trash", { size: 12 })));
      }
    }
    return h(
      "div",
      {
        class: ["row", selected ? "is-selected" : "", options.rowClass?.(row2) ?? ""],
        role: "treeitem",
        "aria-level": row2.depth + 1,
        "aria-expanded": row2.expandable ? row2.open : void 0,
        "aria-selected": selected,
        "data-path": row2.path,
        style: { paddingLeft: `${indent}px` },
        onClick: () => {
          options.onSelect?.(row2.path);
          if (row2.expandable && !options.onSelect) options.onToggle(row2.path);
        },
        onDblClick: () => {
          if (row2.expandable) options.onToggle(row2.path);
        }
      },
      h("button", {
        type: "button",
        class: ["twist", row2.expandable ? "" : "is-leaf", row2.open ? "is-open" : ""],
        tabindex: -1,
        "aria-hidden": "true",
        onClick: (event) => {
          event.stopPropagation();
          if (row2.expandable) options.onToggle(row2.path);
        }
      }, icon("chevronRight", { size: 11 })),
      h("span", { class: ["vk", row2.isIndex ? "is-index" : ""] }, row2.key),
      h("span", { class: "vsep" }, ":"),
      valueNode,
      h("span", { class: "grow" }),
      options.decorate?.(row2) ?? null,
      actions.length > 0 ? h("span", { class: "v-actions" }, ...actions) : null
    );
  };
  const onKeyDown = (event) => {
    if (!options.onSelect || rows.length === 0) return;
    if (options.editing) return;
    const index = rows.findIndex((row2) => row2.path === options.selected);
    const current = index >= 0 ? rows[index] : null;
    const go = (i) => {
      const next = rows[Math.max(0, Math.min(rows.length - 1, i))];
      if (next && !next.special) options.onSelect(next.path);
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        go(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        go(index < 0 ? rows.length - 1 : index - 1);
        break;
      case "ArrowRight":
        if (current?.expandable && !current.open) {
          event.preventDefault();
          options.onToggle(current.path);
        } else if (current?.open) {
          event.preventDefault();
          go(index + 1);
        }
        break;
      case "ArrowLeft":
        if (current?.open) {
          event.preventDefault();
          options.onToggle(current.path);
        } else if (current && current.depth > 0) {
          event.preventDefault();
          const { parent } = parentPath(current.path);
          options.onSelect(parent);
        }
        break;
      case "Enter":
        if (current && !current.expandable && canEdit(current.path, current.depth) && current.type !== "function") {
          event.preventDefault();
          options.setEditing({ scope: options.scope, path: current.path, draft: editSeed(current.value), mode: "leaf" });
        }
        break;
      case "Home":
        event.preventDefault();
        go(0);
        break;
      case "End":
        event.preventDefault();
        go(rows.length - 1);
        break;
    }
  };
  if (options.inline) {
    return h(
      "div",
      { class: "vtree is-inline", role: "tree", "data-dt": options.testid, tabindex: options.onSelect ? 0 : void 0, onKeyDown },
      rows.length === 0 ? options.empty ?? h("div", { class: "hint pad-sm" }, "Empty.") : rows.map((row2) => h("div", { key: row2.path, class: "vrow", style: { height: `${options.rowHeight}px` } }, renderRow(row2)))
    );
  }
  const selectedIndex = options.selected ? rows.findIndex((row2) => row2.path === options.selected) : -1;
  return virtualList({
    items: rows,
    rowHeight: options.rowHeight,
    rowKey: (row2) => row2.path,
    renderRow: (row2) => renderRow(row2),
    version: [options.version, options.editing?.path, options.editing?.mode, options.selected],
    scrollTo: selectedIndex >= 0 ? selectedIndex : null,
    role: "tree",
    testid: options.testid,
    className: "vtree",
    onKeyDown,
    focusable: true,
    empty: options.empty ?? h("div", { class: "hint pad-sm" }, "Empty.")
  });
}
function noApp(ctx, what, icon2 = "box") {
  if (ctx.imported) {
    return emptyState({
      icon: "file",
      title: `${what} needs a live app`,
      body: "You are viewing an imported session. Recorded history — the timeline, commits, requests, logs, and state — is available; live inspection is not.",
      actions: [button({ label: "Open the Timeline", icon: "timeline", onClick: () => ctx.selectTab("timeline") })]
    });
  }
  return emptyState({
    icon: icon2,
    title: "No Aktion app on this page yet",
    body: [
      "Mount an ",
      h("code", {}, "<aktion-app>"),
      " and it appears here automatically. Apps that mounted before the panel opened are discovered on open; later ones register on their next render."
    ]
  });
}
function unsupported(what) {
  return note("info", [`This runtime does not expose ${what}. `, "Upgrade ", h("code", {}, "aktion-runtime"), " to get it — the panel feature-detects every capability, so nothing else breaks."]);
}
function paneSize(ctx, id, fallback) {
  return ctx.ui.sizes[id] ?? fallback;
}
function setPaneSize(ctx, id, size) {
  ctx.ui.sizes[id] = Math.round(size);
  ctx.persist();
  ctx.refresh();
}
function openAtom(ctx, path) {
  const root = path.split(".")[0] ?? path;
  ctx.ui.stateFilter = root;
  ctx.ui.stateSelected = root;
  ctx.ui.stateView = "tree";
  ctx.selectTab("state");
}
function openSource(ctx, line) {
  ctx.ui.sourceFocusLine = line ?? null;
  ctx.ui.sourceDraft = null;
  ctx.selectTab("source");
}
function atomChip(ctx, path, tone = "purple") {
  return chip(`$${path}`, tone, { mono: true, tip: `Open $${path} in State`, onClick: () => openAtom(ctx, path) });
}
function requestTone(request) {
  if (request.phase === "pending") return "grey";
  if (request.phase === "blocked") return "purple";
  if (request.phase === "error") return "red";
  if (request.phase === "mock") return "purple";
  const status = request.status ?? 0;
  if (status >= 500) return "red";
  if (status >= 400) return "amber";
  if (status >= 300) return "blue";
  return "green";
}
function requestStatusLabel(request) {
  if (request.phase === "pending") return "…";
  if (request.phase === "blocked") return "blocked";
  if (request.phase === "error") return "failed";
  return String(request.status ?? (request.phase === "mock" ? 200 : "—"));
}
function isProblem(request) {
  return request.phase === "error" || request.phase === "blocked" || (request.status ?? 0) >= 400;
}
function percentile(values2, p) {
  if (values2.length === 0) return 0;
  const sorted = [...values2].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p / 100 * sorted.length) - 1));
  return sorted[rank];
}
const viewCss = (
  /* css */
  `
.detail-row { display: grid; grid-template-columns: 120px 1fr; gap: 10px; padding: 4px 0; font-size: var(--dt-fs-sm); align-items: baseline; }
.detail-k { color: var(--dt-text-3); white-space: nowrap; }
.detail-v { color: var(--dt-text); min-width: 0; overflow-wrap: anywhere; }
.pane-head { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 6px 12px; border-bottom: 1px solid var(--dt-border); flex: none; }
.pane-title { font-weight: 650; font-size: var(--dt-fs-md); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pane-body { flex: 1 1 auto; min-height: 0; overflow: auto; }
.pane-body.is-pad { padding: 12px; }
.stack { display: flex; flex-direction: column; gap: 12px; }
.chips { display: flex; flex-wrap: wrap; gap: 5px; }
.split-note { padding: 10px 12px; }
`
);
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function sameValue(a, b) {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
function diffSnapshots(from, to) {
  const changes = [];
  const walk = (path, before, after, depth) => {
    if (changes.length > 400) return;
    if (isPlainObject(before) && isPlainObject(after) && depth < 6) {
      const keys2 = /* @__PURE__ */ new Set([...Object.keys(before), ...Object.keys(after)]);
      for (const key2 of keys2) {
        const nextPath = path === "" ? key2 : `${path}.${key2}`;
        const b = before[key2];
        const a = after[key2];
        if (!(key2 in before)) changes.push({ kind: "added", path: nextPath, before: "", after: previewOf(a) });
        else if (!(key2 in after)) changes.push({ kind: "removed", path: nextPath, before: previewOf(b), after: "" });
        else walk(nextPath, b, a, depth + 1);
      }
      return;
    }
    if (!sameValue(before, after)) changes.push({ kind: "changed", path: path || "(root)", before: previewOf(before), after: previewOf(after) });
  };
  walk("", from.snapshot, to.snapshot, 0);
  return changes;
}
const livePreview = /* @__PURE__ */ new WeakMap();
function travelTo(ctx, commitId, preview) {
  const { ui, model, app } = ctx;
  const entry = commitId === null ? null : model.history.find((h2) => h2.commitId === commitId) ?? null;
  if (commitId !== null && !entry) return;
  const saved = livePreview.get(model);
  if (commitId === null) {
    ui.timeTravel = null;
    if (saved && can(app, "hydrateState")) {
      model.suspendHistory = true;
      app.hydrateState(saved);
      queueMicrotask(() => {
        model.suspendHistory = false;
      });
    }
    livePreview.delete(model);
    model.suspendHistory = false;
    ctx.refresh();
    return;
  }
  ui.timeTravel = commitId;
  if (preview && can(app, "hydrateState") && entry) {
    if (!saved) livePreview.set(model, structuredCloneSafe(model.state));
    model.suspendHistory = true;
    app.hydrateState(entry.snapshot);
  }
  ctx.refresh();
}
function structuredCloneSafe(value) {
  try {
    return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}
function timeTravelBar(ctx) {
  const { ui, model } = ctx;
  const history = model.history;
  if (history.length < 2) return null;
  const index = ui.timeTravel === null ? history.length - 1 : Math.max(0, history.findIndex((h2) => h2.commitId === ui.timeTravel));
  const entry = history[index];
  const previewing = livePreview.has(model);
  const step = (delta) => {
    const next = Math.max(0, Math.min(history.length - 1, index + delta));
    travelTo(ctx, next === history.length - 1 && !previewing ? null : history[next].commitId, previewing);
  };
  return h(
    "div",
    { class: ["st-travel", ui.timeTravel !== null ? "is-travelling" : ""], "data-dt": "time-travel" },
    iconButton({ icon: "stepBack", label: "Previous commit", size: "sm", disabled: index === 0, onClick: () => step(-1) }),
    h(
      "div",
      { class: "st-ticks" },
      h("input", {
        type: "range",
        min: 0,
        max: history.length - 1,
        step: 1,
        value: index,
        "aria-label": "Time travel",
        class: "st-range",
        onInput: (event) => {
          const next = Number(event.target.value);
          travelTo(ctx, next === history.length - 1 && !previewing ? null : history[next].commitId, previewing);
        }
      }),
      h("div", { class: "st-tickmarks", "aria-hidden": "true" }, ...history.map((h2, i) => h("span", {
        key: h2.commitId ?? i,
        class: ["st-tick", i === index ? "is-on" : "", h2.changedPaths.length === 0 ? "is-forced" : ""],
        style: { left: `${history.length === 1 ? 0 : i / (history.length - 1) * 100}%` }
      })))
    ),
    iconButton({ icon: "stepForward", label: "Next commit", size: "sm", disabled: index === history.length - 1, onClick: () => step(1) }),
    h(
      "span",
      { class: "st-travel-label" },
      h("b", {}, `#${entry.commitId ?? "?"}`),
      entry.changedPaths.length > 0 ? ` ${entry.changedPaths.slice(0, 3).map((p) => `$${p}`).join(", ")}${entry.changedPaths.length > 3 ? "…" : ""}` : " forced",
      h("span", { class: "t3" }, ` · ${index + 1}/${history.length}`)
    ),
    spacer(),
    filterChip({ label: "Preview in app", on: previewing, tip: "Hydrate the running app to each snapshot as you scrub — true time travel", testid: "travel-preview", onToggle: () => {
      if (previewing) travelTo(ctx, null, false);
      else travelTo(ctx, entry.commitId, true);
    } }),
    button({ label: "Live", size: "sm", active: ui.timeTravel === null, icon: "live", onClick: () => travelTo(ctx, null, false), testid: "travel-live" })
  );
}
function isResourceShape(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value;
  return "state" in record && "loading" in record && "data" in record && typeof record.state === "string";
}
function atomMeta(ctx) {
  const { app } = ctx;
  if (!can(app, "getStateMeta")) return /* @__PURE__ */ new Map();
  return ctx.cache("stateMeta", () => new Map(app.getStateMeta().map((meta) => [meta.name, meta])));
}
function graphOf(ctx) {
  const { app } = ctx;
  if (!can(app, "getReactivityGraph")) return null;
  return ctx.cache("reactivity", () => app.getReactivityGraph());
}
function treeView(ctx) {
  const { ui, model, app } = ctx;
  const meta = atomMeta(ctx);
  const travelling = ui.timeTravel !== null;
  const entry = travelling ? model.history.find((h2) => h2.commitId === ui.timeTravel) : void 0;
  const source = entry ? entry.snapshot : model.state;
  const names = Object.keys(source).filter((name) => ui.stateShowReserved || !(meta.get(name)?.reserved ?? name === "route"));
  const maxChanges = Math.max(1, ...[...model.changeCounts.values()]);
  if (ui.stateSort === "activity") names.sort((a, b) => (model.changeCounts.get(b) ?? 0) - (model.changeCounts.get(a) ?? 0) || a.localeCompare(b));
  else names.sort((a, b) => a.localeCompare(b));
  const root = {};
  for (const name of names) root[name] = source[name];
  const now = ctx.now();
  const decorate = (row2) => {
    if (row2.depth !== 0) return null;
    const m = meta.get(row2.key);
    const count = model.changeCounts.get(row2.key) ?? 0;
    const resource = isResourceShape(row2.value);
    return h(
      "span",
      { class: "st-deco" },
      resource ? chip("query", "cyan", { tip: "A $query / Http resource — open it in Data to refetch or simulate states", onClick: () => {
        ui.dataPane = "queries";
        ctx.selectTab("data");
      } }) : null,
      m?.computed && !resource ? chip("derived", "blue", { tip: "Recomputed from its dependencies — an edit lasts until they change" }) : null,
      m?.reserved ? chip("runtime", "grey") : null,
      m?.module ? chip(m.module.split("/").pop() ?? m.module, "grey", { tip: `Declared in ${m.module}` }) : null,
      count > 0 ? h("span", { class: "st-heat", "data-tip": `${count} change${count === 1 ? "" : "s"}` }, h("span", { style: { width: `${Math.max(8, count / maxChanges * 100)}%` } })) : null,
      h("span", { class: "st-count" }, count > 0 ? String(count) : ""),
      h("button", {
        type: "button",
        class: ["ibtn is-sm st-break", ui.breakOnChange.has(row2.key) ? "is-on" : ""],
        "aria-label": ui.breakOnChange.has(row2.key) ? `Stop breaking on $${row2.key}` : `Break into the debugger when $${row2.key} changes`,
        "data-tip": ui.breakOnChange.has(row2.key) ? "Breakpoint set — click to clear" : "Break on change",
        onClick: (event) => {
          event.stopPropagation();
          if (ui.breakOnChange.has(row2.key)) ui.breakOnChange.delete(row2.key);
          else ui.breakOnChange.add(row2.key);
          ctx.toast(ui.breakOnChange.has(row2.key) ? `Will pause in the debugger when $${row2.key} changes (browser DevTools must be open)` : `No longer breaking on $${row2.key}`);
          ctx.refresh();
        }
      }, icon("record", { size: 9 }))
    );
  };
  const rowClass = (row2) => {
    if (row2.depth !== 0 || travelling) return "";
    const at = model.changed.get(row2.key);
    if (at === void 0 || now - at > 1100) return "";
    return `flash-${(model.changeCounts.get(row2.key) ?? 0) % 2}`;
  };
  const tree = valueTree({
    scope: "state",
    value: root,
    expanded: ui.stateExpanded,
    onToggle: (path) => {
      if (ui.stateExpanded.has(path)) ui.stateExpanded.delete(path);
      else ui.stateExpanded.add(path);
      ctx.refresh();
    },
    rowHeight: ctx.rowHeight,
    filter: ui.stateFilter,
    editable: (path) => !travelling && !(meta.get(rootOf(path))?.reserved ?? false),
    editing: ui.edit,
    setEditing: (edit) => {
      ui.edit = edit;
      ctx.refresh();
    },
    onEdit: (path, value) => {
      if (!app) return;
      app.setState(path, value);
      ctx.toast(`$${path} = ${previewOf(value)}`, "good");
    },
    editJson: (path, value) => ctx.editJson({
      title: `Edit $${path}`,
      value,
      hint: "The whole value is replaced through the reactive pipeline, exactly like an event handler writing it.",
      onSave: (next) => {
        app?.setState(path, next);
        ctx.toast(`$${path} replaced`, "good");
      }
    }),
    onCopy: (text2, what) => ctx.copy(text2, `$${what}`),
    selected: ui.stateSelected,
    onSelect: (path) => {
      ui.stateSelected = path;
      ctx.refresh();
    },
    decorate,
    rowClass,
    pages: ui.statePages,
    onMore: (container) => {
      ui.statePages.set(container, (ui.statePages.get(container) ?? 1) + 1);
      ctx.refresh();
    },
    testid: "state-tree",
    version: [model.revs.state, ui.timeTravel, ui.stateSort, ui.stateShowReserved, ui.breakOnChange.size, now > model.lastTime + 1100 ? 0 : Math.floor(now / 200)],
    empty: emptyState({
      icon: "state",
      title: ui.stateFilter ? "No atom matches the filter" : "This program declares no reactive state",
      body: ui.stateFilter ? "Filters match keys and leaf values." : ["Declare one with ", h("code", {}, "$count = 0"), "."]
    })
  });
  const selected = ui.stateSelected ? rootOf(ui.stateSelected) : null;
  const side = selected && selected in source && ctx.width() >= 760 ? atomDetail(ctx, selected, source[selected]) : null;
  return h(
    "div",
    { class: "st-main" },
    travelling && entry ? note("accent", [
      h("b", {}, `Viewing commit #${entry.commitId}`),
      ` — ${fmtAgo(entry.time, ctx.now())}. `,
      livePreview.has(model) ? "The app is showing this snapshot." : "Rows are read-only while scrubbing."
    ], {
      icon: "history",
      actions: h(
        "span",
        { class: "row-flex" },
        can(app, "hydrateState") && !livePreview.has(model) ? button({ label: "Restore into app", size: "sm", icon: "undo", testid: "travel-restore", onClick: () => {
          app.hydrateState(entry.snapshot);
          ui.timeTravel = null;
          ctx.toast("Snapshot restored into the live store", "good");
          ctx.refresh();
        } }) : null,
        button({ label: "Back to live", size: "sm", onClick: () => travelTo(ctx, null, false) })
      )
    }) : null,
    side ? split({ size: paneSize(ctx, "state.tree", Math.round(ctx.width() * 0.58)), min: 260, onResize: (s) => setPaneSize(ctx, "state.tree", s), first: tree, second: side }) : tree
  );
}
function atomDetail(ctx, name, value) {
  const { model, app, ui } = ctx;
  const meta = atomMeta(ctx).get(name);
  const log = model.atomLog.get(name) ?? [];
  const graph = graphOf(ctx);
  const readers = graph ? [
    ...graph.components.filter((c) => c.deps.some((d) => rootOf(d) === name)).map((c) => ({ kind: "component", key: c.instanceKey, label: c.name })),
    ...graph.effects.filter((e) => e.deps.some((d) => rootOf(d) === name)).map((e) => ({ kind: "effect", key: e.effectKey, label: e.label })),
    ...graph.atoms.filter((a) => a.computed && a.deps.some((d) => rootOf(d) === name)).map((a) => ({ kind: "derived", key: a.name, label: `$${a.name}` }))
  ] : [];
  const byComponent = /* @__PURE__ */ new Map();
  for (const reader of readers.filter((r) => r.kind === "component")) {
    const entry = byComponent.get(reader.label) ?? { label: reader.label, keys: [] };
    entry.keys.push(reader.key);
    byComponent.set(reader.label, entry);
  }
  return h(
    "div",
    { class: "st-side", "data-dt": "atom-detail" },
    h(
      "div",
      { class: "pane-head" },
      h("span", { class: "pane-title mono tone-purple" }, `$${name}`),
      meta?.computed ? chip("derived", "blue") : null,
      spacer(),
      can(app, "resetState") && !meta?.reserved ? iconButton({ icon: "undo", label: `Reset $${name} to its declared value`, onClick: () => {
        app.resetState([name]);
        ctx.toast(`$${name} reset`);
      } }) : null,
      iconButton({ icon: "close", label: "Close", onClick: () => {
        ui.stateSelected = null;
        ctx.refresh();
      } })
    ),
    h(
      "div",
      { class: "pane-body is-pad stack" },
      h(
        "div",
        { class: "st-facts" },
        h("div", {}, h("span", { class: "t3" }, "Type"), h("b", {}, Array.isArray(value) ? `array(${value.length})` : value === null ? "null" : typeof value)),
        h("div", {}, h("span", { class: "t3" }, "Changes"), h("b", {}, fmtCount(model.changeCounts.get(name) ?? 0))),
        h("div", {}, h("span", { class: "t3" }, "Last change"), h("b", {}, model.changed.has(name) ? fmtAgo(model.changed.get(name), ctx.now()) : "—")),
        meta?.source ? h("div", {}, h("span", { class: "t3" }, "Declared"), h("button", { type: "button", class: "link mono", onClick: () => {
          ui.sourceFocusLine = meta.source.line;
          ctx.selectTab("source");
        } }, `L${meta.source.line}`)) : null
      ),
      graph ? h(
        "div",
        {},
        h("div", { class: "it-sub" }, `Read by (${readers.length})`),
        readers.length === 0 ? h("div", { class: "hint" }, "Nothing on screen reads this atom right now.") : h(
          "div",
          { class: "chips" },
          ...[...byComponent.values()].map((c) => chip(`${c.label}${c.keys.length > 1 ? ` ×${c.keys.length}` : ""}`, "accent", { icon: "puzzle", onClick: () => ctx.selectInstance(c.keys[0]) })),
          ...readers.filter((r) => r.kind === "effect").map((r) => chip(r.label, "green", { icon: "effects", onClick: () => {
            ui.selectedEffect = r.key;
            ctx.selectTab("effects");
          } })),
          ...readers.filter((r) => r.kind === "derived").map((r) => chip(r.label, "blue", { mono: true, onClick: () => {
            ui.stateSelected = r.key;
            ctx.refresh();
          } }))
        )
      ) : null,
      h(
        "div",
        {},
        h("div", { class: "it-sub row-flex" }, `Recent changes (${log.length})`, spacer(), log.length > 0 ? button({ label: "Full log", size: "sm", variant: "ghost", onClick: () => {
          ui.stateView = "log";
          ctx.refresh();
        } }) : null),
        log.length === 0 ? h("div", { class: "hint" }, "Unchanged since the panel opened.") : h("div", { class: "st-log" }, ...log.slice(-8).reverse().map((change, i) => h(
          "div",
          { key: `${change.time}:${i}`, class: "st-log-row" },
          h("span", { class: "st-log-time" }, fmtAgo(change.time, ctx.now())),
          h("span", { class: "v t-string st-before", title: change.before }, change.before),
          icon("arrowRight", { size: 11 }),
          h("span", { class: "v st-after", title: change.after }, change.after)
        )))
      )
    )
  );
}
function diffView$1(ctx) {
  const { ui, model, app } = ctx;
  const history = model.history;
  if (history.length < 2) {
    return emptyState({ icon: "diff", title: "Not enough snapshots to compare", body: "Snapshots are recorded per commit (Settings → State snapshots). Interact with the app to create some." });
  }
  const ids = history.map((h2) => h2.commitId ?? -1);
  const toId = ui.diffTo !== null && ids.includes(ui.diffTo) ? ui.diffTo : ids[ids.length - 1];
  const fromId = ui.diffFrom !== null && ids.includes(ui.diffFrom) ? ui.diffFrom : ids[Math.max(0, ids.indexOf(toId) - 1)];
  const from = history.find((h2) => h2.commitId === fromId);
  const to = history.find((h2) => h2.commitId === toId);
  const changes = ctx.memo("st:diff", [from, to], () => diffSnapshots(from, to));
  const options = history.map((h2) => ({ value: String(h2.commitId), label: `#${h2.commitId} · ${fmtAgo(h2.time, ctx.now())}${h2.changedPaths.length ? ` · ${h2.changedPaths.slice(0, 2).join(", ")}` : ""}` }));
  const counts = { added: 0, removed: 0, changed: 0 };
  for (const change of changes) counts[change.kind] += 1;
  return h(
    "div",
    { class: "st-diff", "data-dt": "state-diff" },
    h(
      "div",
      { class: "st-diff-bar" },
      h("span", { class: "t3" }, "From"),
      select({ value: String(fromId), options, label: "From snapshot", onChange: (v) => {
        ui.diffFrom = Number(v);
        ctx.refresh();
      } }),
      icon("arrowRight", { size: 13 }),
      h("span", { class: "t3" }, "to"),
      select({ value: String(toId), options, label: "To snapshot", onChange: (v) => {
        ui.diffTo = Number(v);
        ctx.refresh();
      } }),
      button({ label: "Latest vs previous", size: "sm", variant: "ghost", onClick: () => {
        ui.diffFrom = null;
        ui.diffTo = null;
        ctx.refresh();
      } }),
      spacer(),
      chip(`${counts.changed} changed`, "amber"),
      chip(`${counts.added} added`, "green"),
      chip(`${counts.removed} removed`, "red"),
      button({ label: "Copy", size: "sm", icon: "copy", onClick: () => ctx.copy(changes.map((c) => `${c.kind === "added" ? "+" : c.kind === "removed" ? "-" : "~"} ${c.path}: ${c.before} -> ${c.after}`).join("\n"), "the diff") }),
      can(app, "hydrateState") ? button({ label: "Restore “from”", size: "sm", icon: "undo", onClick: () => {
        app.hydrateState(from.snapshot);
        ctx.toast(`Restored commit #${from.commitId}`, "good");
      } }) : null
    ),
    changes.length === 0 ? note("good", "These two snapshots are identical.") : h("div", { class: "st-changes" }, ...changes.map((change, i) => h(
      "div",
      { key: `${change.path}${i}`, class: ["st-change", `is-${change.kind}`] },
      h("span", { class: "st-change-mark" }, change.kind === "added" ? "+" : change.kind === "removed" ? "−" : "~"),
      h("span", { class: "st-change-path mono" }, change.path),
      change.kind !== "added" ? h("span", { class: "v st-before", title: change.before }, change.before) : null,
      change.kind === "changed" ? icon("arrowRight", { size: 11 }) : null,
      change.kind !== "removed" ? h("span", { class: "v st-after", title: change.after }, change.after) : null
    ))),
    bookmarksPanel(ctx)
  );
}
function bookmarksPanel(ctx) {
  const { ui, app, model } = ctx;
  const label = app?.label ?? "imported";
  if (ui.bookmarks.length === 0) ui.bookmarks = loadAppData(label, "bookmarks", []);
  return h(
    "div",
    { class: "st-bookmarks" },
    h(
      "div",
      { class: "it-sub row-flex" },
      `Saved snapshots (${ui.bookmarks.length})`,
      spacer(),
      button({ label: "Save current", size: "sm", icon: "bookmark", testid: "bookmark-save", onClick: () => {
        const name = `Snapshot ${ui.bookmarks.length + 1}`;
        ui.bookmarks = [...ui.bookmarks, { id: `bm-${Date.now()}`, name, at: Date.now(), state: structuredCloneSafe(model.state) }];
        saveAppData(label, "bookmarks", ui.bookmarks);
        ctx.toast(`${name} saved — it survives reloads`, "good");
        ctx.refresh();
      } })
    ),
    ui.bookmarks.length === 0 ? h("div", { class: "hint" }, "Save a state to come back to it later — perfect for reproducing a bug in exactly the state it needs.") : h("div", { class: "st-bm-list" }, ...ui.bookmarks.map((bookmark) => h(
      "div",
      { key: bookmark.id, class: "st-bm" },
      icon("bookmark", { size: 13 }),
      h("span", { class: "grow ellipsis" }, bookmark.name, h("span", { class: "t3" }, ` · ${new Date(bookmark.at).toLocaleString()} · ${Object.keys(bookmark.state).length} atoms`)),
      can(app, "hydrateState") ? button({ label: "Restore", size: "sm", onClick: () => {
        app.hydrateState(bookmark.state);
        ctx.toast(`${bookmark.name} restored`, "good");
      } }) : null,
      iconButton({ icon: "download", label: "Download", size: "sm", onClick: () => downloadText(`${bookmark.name.replace(/\W+/g, "-")}.json`, JSON.stringify(bookmark.state, null, 2)) }),
      iconButton({ icon: "trash", label: "Delete", size: "sm", danger: true, onClick: () => {
        ui.bookmarks = ui.bookmarks.filter((b) => b.id !== bookmark.id);
        saveAppData(label, "bookmarks", ui.bookmarks);
        ctx.refresh();
      } })
    )))
  );
}
function logView(ctx) {
  const { ui, model } = ctx;
  const atoms = [...model.atomLog.entries()].sort((a, b) => (b[1][b[1].length - 1]?.time ?? 0) - (a[1][a[1].length - 1]?.time ?? 0));
  if (atoms.length === 0) return emptyState({ icon: "history", title: "No changes recorded yet", body: "Every write to an atom lands here with its before and after value." });
  const selected = ui.stateSelected && model.atomLog.has(rootOf(ui.stateSelected)) ? rootOf(ui.stateSelected) : atoms[0][0];
  const log = model.atomLog.get(selected) ?? [];
  return split({
    size: paneSize(ctx, "state.log", 220),
    min: 160,
    onResize: (s) => setPaneSize(ctx, "state.log", s),
    first: h("div", { class: "pane-body st-log-atoms" }, ...atoms.map(([name, changes]) => h("button", {
      key: name,
      type: "button",
      class: ["row", name === selected ? "is-selected" : ""],
      onClick: () => {
        ui.stateSelected = name;
        ctx.refresh();
      }
    }, h("span", { class: "vk" }, `$${name}`), spacer(), h("span", { class: "badge" }, String(changes.length))))),
    second: h(
      "div",
      { class: "pane-body is-pad", "data-dt": "state-log" },
      h("div", { class: "it-sub" }, `$${selected} — ${log.length} change${log.length === 1 ? "" : "s"}, newest first`),
      h("div", { class: "st-log is-full" }, ...[...log].reverse().map((change, i) => h(
        "div",
        { key: `${change.time}:${i}`, class: "st-log-row" },
        h("span", { class: "st-log-time" }, fmtAgo(change.time, ctx.now())),
        h("span", { class: "chips" }, ...change.paths.slice(0, 3).map((p) => chip(p, "grey", { mono: true }))),
        h("span", { class: "v st-before", title: change.before }, change.before),
        icon("arrowRight", { size: 11 }),
        h("span", { class: "v st-after", title: change.after }, change.after)
      )))
    )
  });
}
function effectLabel(effect) {
  const every = /every\((\d+)\)/.exec(effect.triggers ?? "");
  if (every) {
    const ms = Number(every[1]);
    return `every ${ms >= 1e3 && ms % 1e3 === 0 ? `${ms / 1e3}s` : `${ms}ms`}`;
  }
  if (effect.deps.length > 0) return `on ${effect.deps.slice(0, 2).map((d) => `$${d}`).join(", ")}${effect.deps.length > 2 ? "…" : ""}`;
  if (/mount/.test(effect.triggers ?? "")) return "on mount";
  return effect.label;
}
function graphView(ctx) {
  const graph = graphOf(ctx);
  if (!graph) return h("div", { class: "dt-pad" }, unsupported("its reactivity graph"));
  const { ui } = ctx;
  const nodes = [];
  const edges = [];
  const atoms = graph.atoms.filter((a) => ui.stateShowReserved || !a.reserved);
  const atomNames = new Set(atoms.map((a) => a.name));
  for (const atom of atoms) nodes.push({ id: `a:${atom.name}`, label: `$${atom.name}`, column: atom.computed ? 1 : 0, kind: atom.computed ? "derived" : "atom", target: atom.name });
  for (const atom of atoms) {
    if (!atom.computed) continue;
    for (const dep of new Set(atom.deps.map(rootOf))) if (atomNames.has(dep) && dep !== atom.name) edges.push([`a:${dep}`, `a:${atom.name}`]);
  }
  const components = /* @__PURE__ */ new Map();
  for (const component of graph.components) {
    const entry = components.get(component.name) ?? { keys: [], deps: /* @__PURE__ */ new Set() };
    entry.keys.push(component.instanceKey);
    for (const dep of component.deps) entry.deps.add(rootOf(dep));
    components.set(component.name, entry);
  }
  for (const [name, entry] of components) {
    nodes.push({ id: `c:${name}`, label: name, column: 2, kind: "component", count: entry.keys.length, target: entry.keys[0] });
    for (const dep of entry.deps) if (atomNames.has(dep)) edges.push([`a:${dep}`, `c:${name}`]);
  }
  for (const effect of graph.effects) {
    nodes.push({ id: `e:${effect.effectKey}`, label: effectLabel(effect), column: 3, kind: "effect", target: effect.effectKey });
    for (const dep of new Set(effect.deps.map(rootOf))) if (atomNames.has(dep)) edges.push([`a:${dep}`, `e:${effect.effectKey}`]);
  }
  if (nodes.length === 0) return emptyState({ icon: "graph", title: "Nothing reactive yet", body: "Atoms, derived atoms, components, and effects appear here once the program renders." });
  const columns = [0, 1, 2, 3].map((c) => nodes.filter((n) => n.column === c));
  const used = columns.map((c, i) => c.length > 0 ? i : -1).filter((i) => i >= 0);
  const width = Math.max(560, ctx.width() - 24);
  const colWidth = width / used.length;
  const ROW2 = 34;
  const nodeWidth = Math.min(200, colWidth - 40);
  const position = /* @__PURE__ */ new Map();
  used.forEach((col, i) => {
    columns[col].forEach((node, row2) => position.set(node.id, { x: i * colWidth + 12, y: 38 + row2 * ROW2 }));
  });
  const height = 38 + Math.max(...used.map((c) => columns[c].length)) * ROW2 + 12;
  const hovered = ui.graphHover;
  const connected = /* @__PURE__ */ new Set();
  if (hovered) {
    connected.add(hovered);
    const forward = (id, guard = 0) => {
      for (const [a, b] of edges) if (a === id && !connected.has(b) && guard < 50) {
        connected.add(b);
        forward(b, guard + 1);
      }
    };
    const backward = (id, guard = 0) => {
      for (const [a, b] of edges) if (b === id && !connected.has(a) && guard < 50) {
        connected.add(a);
        backward(a, guard + 1);
      }
    };
    forward(hovered);
    backward(hovered);
  }
  const headings = ["Atoms", "Derived", "Components", "Effects"];
  const setHover = (id) => {
    ui.graphHover = id;
    ctx.refresh();
  };
  return h(
    "div",
    { class: "dt-scroll" },
    h(
      "div",
      { class: "rg", style: { width: `${width}px`, height: `${height}px` }, "data-dt": "reactivity-graph" },
      ...used.map((col, i) => h("div", { key: `h${col}`, class: "rg-heading", style: { left: `${i * colWidth + 12}px` } }, headings[col], h("span", { class: "t4" }, ` ${columns[col].length}`))),
      h(
        "svg",
        { class: "rg-edges", width, height, viewBox: `0 0 ${width} ${height}` },
        ...edges.map(([a, b], i) => {
          const p1 = position.get(a);
          const p2 = position.get(b);
          if (!p1 || !p2) return null;
          const x1 = p1.x + nodeWidth;
          const y1 = p1.y + 13;
          const x2 = p2.x;
          const y2 = p2.y + 13;
          const mid = (x1 + x2) / 2;
          const lit = hovered !== null && connected.has(a) && connected.has(b);
          return h("path", {
            key: `${a}>${b}:${i}`,
            d: `M${x1} ${y1} C${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`,
            class: ["rg-edge", lit ? "is-lit" : "", hovered !== null && !lit ? "is-dim" : ""]
          });
        })
      ),
      ...nodes.map((node) => {
        const p = position.get(node.id);
        const dim = hovered !== null && !connected.has(node.id);
        return h(
          "button",
          {
            key: node.id,
            type: "button",
            class: ["rg-node", `is-${node.kind}`, dim ? "is-dim" : "", hovered === node.id ? "is-hover" : ""],
            style: { left: `${p.x}px`, top: `${p.y}px`, width: `${nodeWidth}px` },
            onMouseEnter: () => setHover(node.id),
            onMouseLeave: () => setHover(null),
            onClick: () => {
              if (node.kind === "atom" || node.kind === "derived") {
                ui.stateSelected = node.target;
                ui.stateView = "tree";
                ctx.refresh();
              } else if (node.kind === "component") ctx.selectInstance(node.target);
              else {
                ui.selectedEffect = node.target;
                ctx.selectTab("effects");
              }
            },
            "data-tip": node.kind === "component" ? `${node.count} instance${node.count === 1 ? "" : "s"} — click to inspect` : void 0
          },
          icon(node.kind === "component" ? "puzzle" : node.kind === "effect" ? "effects" : node.kind === "derived" ? "refresh" : "state", { size: 12 }),
          h("span", { class: "ellipsis" }, node.label),
          node.count && node.count > 1 ? h("span", { class: "badge" }, `×${node.count}`) : null
        );
      })
    )
  );
}
function importDialog(ctx) {
  const { app } = ctx;
  if (!can(app, "hydrateState")) return;
  let draft = JSON.stringify(ctx.model.state, null, 2);
  let error = null;
  const parse = () => {
    try {
      const value = JSON.parse(draft);
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        error = "Must be a JSON object of atom names.";
        return null;
      }
      error = null;
      return value;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      return null;
    }
  };
  ctx.openDialog({
    title: "Import state",
    icon: "upload",
    width: 640,
    body: () => h(
      "div",
      { class: "stack" },
      h("div", { class: "hint" }, "Paste an exported state (or edit this one). It is hydrated the way SSR restores state: every atom is replaced and the app re-renders."),
      textarea({ value: draft, rows: 14, mono: true, invalid: error !== null, label: "State JSON", testid: "state-import", onInput: (v) => {
        draft = v;
        const had = error;
        parse();
        if (had === null !== (error === null)) ctx.refresh();
      } }),
      error ? note("error", error) : null
    ),
    actions: () => [
      button({ label: "Cancel", onClick: () => ctx.closeDialog() }),
      button({ label: "Hydrate app", variant: "primary", icon: "upload", disabled: error !== null, onClick: () => {
        const value = parse();
        if (!value) {
          ctx.refresh();
          return;
        }
        app.hydrateState(value);
        ctx.closeDialog();
        ctx.toast("State imported", "good");
      } })
    ]
  });
}
function render$f(ctx) {
  const { app, ui, model } = ctx;
  if (!app && !ctx.imported) return noApp(ctx, "State", "state");
  const reservedCount = [...atomMeta(ctx).values()].filter((m) => m.reserved).length;
  const view = ui.stateView;
  let body;
  switch (view) {
    case "diff":
      body = diffView$1(ctx);
      break;
    case "log":
      body = logView(ctx);
      break;
    case "graph":
      body = graphView(ctx);
      break;
    default:
      body = treeView(ctx);
  }
  return h(
    "div",
    { class: "st", "data-dt": "state" },
    viewbar(
      segmented([
        { value: "tree", label: "Tree", icon: "tree" },
        { value: "diff", label: "Diff", icon: "diff", count: model.history.length > 1 ? model.history.length : null },
        { value: "log", label: "Changes", icon: "history", count: model.totals.stateFlushes || null },
        { value: "graph", label: "Graph", icon: "graph" }
      ], view, (value) => {
        ui.stateView = value;
        ctx.refresh();
      }, { label: "State view" }),
      view === "tree" ? searchField({ value: ui.stateFilter, placeholder: "Filter atoms and values…", onInput: (v) => {
        ui.stateFilter = v;
        ctx.refresh();
      }, testid: "state-filter" }) : null,
      spacer(),
      view === "tree" || view === "graph" ? filterChip({ label: "Activity", on: ui.stateSort === "activity", tip: "Sort by how often each atom changes", onToggle: () => {
        ui.stateSort = ui.stateSort === "activity" ? "name" : "activity";
        ctx.refresh();
      } }) : null,
      reservedCount > 0 ? filterChip({ label: "Runtime", count: reservedCount, on: ui.stateShowReserved, tip: "Show runtime-owned atoms (route, stores, forms)", onToggle: () => {
        ui.stateShowReserved = !ui.stateShowReserved;
        ctx.refresh();
      } }) : null,
      vsep(),
      iconButton({ icon: "copy", label: "Copy state as JSON", onClick: () => ctx.copy(JSON.stringify(model.state, null, 2), "the state") }),
      iconButton({ icon: "download", label: "Export state", onClick: () => downloadText("aktion-state.json", JSON.stringify(model.state, null, 2)) }),
      can(app, "hydrateState") ? iconButton({ icon: "upload", label: "Import state", onClick: () => importDialog(ctx), testid: "state-import-open" }) : null,
      can(app, "resetState") ? iconButton({ icon: "undo", label: "Reset every atom to its declared value", danger: true, onClick: () => {
        const snapshot = structuredCloneSafe(model.state);
        app.resetState();
        ctx.toast("State reset to declared defaults", "warn", { action: can(app, "hydrateState") ? { label: "Undo", run: () => app.hydrateState(snapshot) } : void 0 });
      } }) : null
    ),
    view === "tree" ? timeTravelBar(ctx) : null,
    body
  );
}
const stateView = {
  id: "state",
  label: "State",
  icon: "state",
  group: "inspect",
  hint: "Reactive state, time travel, diffs, the reactivity graph",
  keywords: "atoms reactive edit time travel snapshot diff history graph dependencies",
  badge: (ctx) => ctx.ui.timeTravel !== null ? { value: "⏱", tone: "accent" } : null,
  render: render$f,
  commands: (ctx) => [
    { id: "live", label: "Return to live state", icon: "live", run: () => travelTo(ctx, null, false) },
    { id: "graph", label: "Show the reactivity graph", icon: "graph", run: () => {
      ctx.ui.stateView = "graph";
      ctx.selectTab("state");
    } },
    { id: "diff", label: "Diff state snapshots", icon: "diff", run: () => {
      ctx.ui.stateView = "diff";
      ctx.selectTab("state");
    } },
    ...can(ctx.app, "resetState") ? [{ id: "reset", label: "Reset all state to declared defaults", icon: "undo", run: () => {
      ctx.app?.resetState?.();
      ctx.toast("State reset");
    } }] : []
  ],
  css: (
    /* css */
    `
.st { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.st-main { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.st-main > .note { margin: 8px 10px 0; }
.st-travel { flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--dt-border); background: var(--dt-bg-elev); }
.st-travel.is-travelling { background: linear-gradient(90deg, var(--dt-accent-soft), transparent 60%), var(--dt-bg-elev); }
.st-ticks { position: relative; flex: 1 1 auto; min-width: 120px; height: 22px; display: flex; align-items: center; }
.st-range { width: 100%; margin: 0; accent-color: var(--dt-accent); position: relative; z-index: 1; background: transparent; }
.st-tickmarks { position: absolute; left: 8px; right: 8px; top: 50%; height: 0; pointer-events: none; }
.st-tick { position: absolute; top: 5px; width: 2px; height: 5px; margin-left: -1px; border-radius: 1px; background: var(--dt-text-4); }
.st-tick.is-forced { background: var(--dt-amber); }
.st-tick.is-on { background: var(--dt-accent); height: 7px; }
.st-travel-label { font-size: var(--dt-fs-sm); color: var(--dt-text-2); white-space: nowrap; font-family: var(--dt-mono); }
.st-deco { display: inline-flex; align-items: center; gap: 6px; margin-left: 8px; }
.st-heat { width: 42px; height: 4px; border-radius: 2px; background: var(--dt-bg-active); overflow: hidden; display: inline-block; }
.st-heat > span { display: block; height: 100%; background: linear-gradient(90deg, var(--dt-purple), var(--dt-pink)); border-radius: 2px; }
.st-count { min-width: 18px; text-align: right; font-size: var(--dt-fs-xs); color: var(--dt-text-3); font-variant-numeric: tabular-nums; }
.st-break { color: var(--dt-text-4); opacity: 0; transition: opacity var(--dt-fast); }
.row:hover .st-break, .row.is-selected .st-break, .st-break:focus-visible { opacity: 1; }
.st-break.is-on { color: var(--dt-red); background: var(--dt-red-soft); opacity: 1; }
.st-side { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; border-left: 0; }
.st-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 8px; }
.st-facts > div { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: var(--dt-r); background: var(--dt-bg-elev); border: 1px solid var(--dt-border); font-size: var(--dt-fs-sm); }
.st-log { display: flex; flex-direction: column; gap: 2px; }
.st-log-row { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 4px 8px; border-radius: 6px; font-size: var(--dt-fs-sm); }
.st-log-row:nth-child(odd) { background: var(--dt-bg-elev); }
.st-log-row .ic { color: var(--dt-text-4); flex: none; }
.st-log-time { flex: none; width: 64px; color: var(--dt-text-3); font-size: var(--dt-fs-xs); font-variant-numeric: tabular-nums; }
.st-before { color: var(--dt-red); text-decoration: line-through; text-decoration-color: rgba(255, 107, 118, 0.4); max-width: 40%; }
.st-after { color: var(--dt-green); max-width: 45%; }
.st-log-atoms { padding: 4px 0; }
.st-log-atoms .row { width: calc(100% - 8px); border: 0; background: none; text-align: left; }
.st-diff { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; }
.st-diff-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.st-changes { display: flex; flex-direction: column; border: 1px solid var(--dt-border); border-radius: var(--dt-r); overflow: hidden; }
.st-change { display: flex; align-items: center; gap: 10px; padding: 5px 10px; border-bottom: 1px solid var(--dt-border); min-width: 0; font-size: var(--dt-fs-sm); }
.st-change:last-child { border-bottom: 0; }
.st-change .ic { color: var(--dt-text-4); flex: none; }
.st-change-mark { width: 14px; text-align: center; font-weight: 800; font-family: var(--dt-mono); flex: none; }
.st-change.is-added { background: var(--dt-green-soft); }
.st-change.is-added .st-change-mark { color: var(--dt-green); }
.st-change.is-removed { background: var(--dt-red-soft); }
.st-change.is-removed .st-change-mark { color: var(--dt-red); }
.st-change.is-changed .st-change-mark { color: var(--dt-amber); }
.st-change-path { color: var(--dt-syn-prop); flex: none; max-width: 30%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.st-bookmarks { margin-top: 6px; }
.st-bm-list { display: flex; flex-direction: column; gap: 6px; }
.st-bm { display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: var(--dt-r); background: var(--dt-bg-elev); border: 1px solid var(--dt-border); color: var(--dt-text-2); }
.rg { position: relative; margin: 12px; }
.rg-heading { position: absolute; top: 4px; font-size: var(--dt-fs-xs); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dt-text-3); }
.rg-edges { position: absolute; inset: 0; overflow: visible; pointer-events: none; }
.rg-edge { fill: none; stroke: var(--dt-border-strong); stroke-width: 1.4; transition: stroke var(--dt-fast), opacity var(--dt-fast); }
.rg-edge.is-lit { stroke: var(--dt-accent); stroke-width: 2; }
.rg-edge.is-dim { opacity: 0.25; }
.rg-node {
  position: absolute; height: 26px; display: flex; align-items: center; gap: 6px; padding: 0 9px;
  border-radius: 8px; border: 1px solid var(--dt-border-strong); background: var(--dt-bg-elev); color: var(--dt-text);
  font-size: var(--dt-fs-sm); font-weight: 550; text-align: left;
  transition: opacity var(--dt-fast), border-color var(--dt-fast), transform var(--dt-fast);
}
.rg-node .ic { flex: none; }
.rg-node.is-atom .ic { color: var(--dt-purple); }
.rg-node.is-atom { font-family: var(--dt-mono); font-size: var(--dt-fs-mono); }
.rg-node.is-derived .ic { color: var(--dt-blue); }
.rg-node.is-derived { font-family: var(--dt-mono); font-size: var(--dt-fs-mono); }
.rg-node.is-component .ic { color: var(--dt-accent-text); }
.rg-node.is-effect .ic { color: var(--dt-green); }
.rg-node:hover, .rg-node.is-hover { border-color: var(--dt-accent); transform: translateX(2px); }
.rg-node.is-dim { opacity: 0.32; }
.rg-node .badge { margin-left: auto; }
`
  )
};
const KEYWORDS = /* @__PURE__ */ new Set([
  "function",
  "import",
  "export",
  "from",
  "as",
  "if",
  "else",
  "switch",
  "case",
  "break",
  "continue",
  "for",
  "while",
  "do",
  "of",
  "in",
  "let",
  "var",
  "const",
  "await",
  "async",
  "return",
  "default",
  "try",
  "catch",
  "finally",
  "throw",
  "new",
  "typeof",
  "instanceof",
  "delete",
  "void",
  "match",
  "this"
]);
const LITERALS = /* @__PURE__ */ new Set(["true", "false", "null", "undefined", "NaN", "Infinity"]);
const OPERATORS = ["===", "!==", "**=", "...", "=>", "==", "!=", "<=", ">=", "&&", "||", "??", "?.", "++", "--", "+=", "-=", "*=", "/=", "%=", "**", "+", "-", "*", "/", "%", "=", "<", ">", "!", "?", "&", "|", "^", "~", ":"];
const PUNCT = /* @__PURE__ */ new Set(["(", ")", "[", "]", "{", "}", ",", ";", "."]);
const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[\w]/;
function highlightLines(source) {
  const lines2 = [[]];
  const push = (t, v) => {
    if (v === "") return;
    const parts = v.split("\n");
    for (let i2 = 0; i2 < parts.length; i2 += 1) {
      if (i2 > 0) lines2.push([]);
      const part = parts[i2];
      if (part === "") continue;
      const line = lines2[lines2.length - 1];
      const last = line[line.length - 1];
      if (last && last.t === t) last.v += part;
      else line.push({ t, v: part });
    }
  };
  const stack = [{ mode: "code", depth: 0 }];
  let lastSignificant = "";
  let i = 0;
  const n = source.length;
  const peekNonSpace = (from) => {
    let j = from;
    while (j < n && (source[j] === " " || source[j] === "	")) j += 1;
    return source[j] ?? "";
  };
  while (i < n) {
    const frame = stack[stack.length - 1];
    const c = source[i];
    if (frame.mode === "tpl") {
      let j = i;
      let buf = "";
      while (j < n) {
        const ch = source[j];
        if (ch === "\\" && j + 1 < n) {
          buf += ch + source[j + 1];
          j += 2;
          continue;
        }
        if (ch === "`") break;
        if (ch === "$" && source[j + 1] === "{") break;
        buf += ch;
        j += 1;
      }
      push("tpl", buf);
      i = j;
      if (i >= n) break;
      if (source[i] === "`") {
        push("tpl", "`");
        stack.pop();
        i += 1;
        lastSignificant = "`";
      } else {
        push("punc", "${");
        stack.push({ mode: "code", depth: 0 });
        i += 2;
        lastSignificant = "{";
      }
      continue;
    }
    if (c === " " || c === "	" || c === "\n" || c === "\r") {
      let j = i;
      while (j < n && (source[j] === " " || source[j] === "	" || source[j] === "\n" || source[j] === "\r")) j += 1;
      push("", source.slice(i, j));
      i = j;
      continue;
    }
    if (c === "/" && source[i + 1] === "/") {
      let j = source.indexOf("\n", i);
      if (j < 0) j = n;
      push("com", source.slice(i, j));
      i = j;
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      let j = source.indexOf("*/", i + 2);
      j = j < 0 ? n : j + 2;
      push("com", source.slice(i, j));
      i = j;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && source[j] !== c && source[j] !== "\n") {
        if (source[j] === "\\") j += 1;
        j += 1;
      }
      if (source[j] === c) j += 1;
      push("str", source.slice(i, j));
      i = j;
      lastSignificant = "str";
      continue;
    }
    if (c === "`") {
      push("tpl", "`");
      stack.push({ mode: "tpl", depth: 0 });
      i += 1;
      continue;
    }
    if (/[0-9]/.test(c) || c === "." && /[0-9]/.test(source[i + 1] ?? "")) {
      const match = /^(0[xX][0-9a-fA-F_]+|0[bB][01_]+|(\d[\d_]*)?\.?\d[\d_]*([eE][+-]?\d+)?n?)/.exec(source.slice(i, i + 40));
      const text2 = match?.[0] || c;
      push("num", text2);
      i += text2.length;
      lastSignificant = "num";
      continue;
    }
    if (c === "$" || IDENT_START.test(c)) {
      let j = i + 1;
      while (j < n && IDENT_PART.test(source[j])) j += 1;
      const word = source.slice(i, j);
      const next = peekNonSpace(j);
      let t = "";
      if (word.startsWith("$")) t = next === "(" ? "fn" : "state";
      else if (KEYWORDS.has(word)) t = "kw";
      else if (LITERALS.has(word)) t = "bool";
      else if (next === ":" && (lastSignificant === "{" || lastSignificant === ",")) t = "prop";
      else if (/^[A-Z]/.test(word)) t = "comp";
      else if (next === "(") t = "fn";
      else if (lastSignificant === ".") t = "prop";
      push(t, word);
      i = j;
      lastSignificant = word;
      continue;
    }
    if (c === "{") {
      frame.depth += 1;
      push("punc", c);
      i += 1;
      lastSignificant = "{";
      continue;
    }
    if (c === "}") {
      if (frame.depth === 0 && stack.length > 1) {
        push("punc", "}");
        stack.pop();
        i += 1;
        lastSignificant = "}";
        continue;
      }
      frame.depth = Math.max(0, frame.depth - 1);
      push("punc", c);
      i += 1;
      lastSignificant = "}";
      continue;
    }
    if (PUNCT.has(c) && !(c === "." && source.startsWith("...", i))) {
      push("punc", c);
      i += 1;
      lastSignificant = c;
      continue;
    }
    const op = OPERATORS.find((candidate) => source.startsWith(candidate, i));
    if (op) {
      push("op", op);
      i += op.length;
      lastSignificant = op === ":" ? ":" : op;
      continue;
    }
    push("", c);
    i += 1;
  }
  const expected = source.split("\n").length;
  while (lines2.length < expected) lines2.push([]);
  return lines2;
}
function matchRanges(text2, needle) {
  const out = [];
  if (!needle) return out;
  const hay = text2.toLowerCase();
  const q = needle.toLowerCase();
  let from = 0;
  while (from <= hay.length) {
    const found = hay.indexOf(q, from);
    if (found < 0) break;
    out.push([found, found + q.length]);
    from = found + Math.max(1, q.length);
  }
  return out;
}
function renderTokens(tokens2, search = "") {
  const plain = tokens2.map((tok) => tok.v).join("");
  const ranges = matchRanges(plain, search.trim());
  if (ranges.length === 0) {
    return tokens2.map((tok) => tok.t ? h("span", { class: `tok-${tok.t}` }, tok.v) : tok.v);
  }
  const out = [];
  let offset = 0;
  let r = 0;
  for (const tok of tokens2) {
    let start2 = 0;
    while (start2 < tok.v.length) {
      const abs = offset + start2;
      while (r < ranges.length && ranges[r][1] <= abs) r += 1;
      const range = ranges[r];
      let end = tok.v.length;
      let inMatch = false;
      if (range) {
        if (abs >= range[0]) {
          inMatch = true;
          end = Math.min(end, range[1] - offset);
        } else {
          end = Math.min(end, range[0] - offset);
        }
      }
      const text2 = tok.v.slice(start2, end);
      const node = tok.t ? h("span", { class: `tok-${tok.t}` }, text2) : text2;
      out.push(inMatch ? h("mark", {}, node) : node);
      start2 = end;
    }
    offset += tok.v.length;
  }
  return out;
}
const LINE_HEIGHT = 19;
function codeLine(options, index) {
  const lineNo = (options.firstLine ?? 1) + index;
  const tokens2 = options.lines[index] ?? [];
  const marker = options.markers?.get(lineNo);
  const search = options.search ?? "";
  const hit = search.trim() !== "" && tokens2.map((t) => t.v).join("").toLowerCase().includes(search.trim().toLowerCase());
  return h(
    "div",
    {
      class: [
        "code-line",
        options.focusLine === lineNo ? "is-focus" : "",
        hit ? "is-hit" : "",
        marker ? marker.severity === "error" ? "is-error" : "is-warn" : ""
      ],
      "data-line": lineNo,
      onClick: options.onLineClick ? () => options.onLineClick(lineNo) : void 0
    },
    h(
      "span",
      { class: "code-gutter", "data-tip": marker?.message },
      marker ? h("span", { class: `mark t-${marker.severity}` }) : null,
      String(lineNo)
    ),
    h(
      "span",
      { class: "code-text" },
      ...renderTokens(tokens2, search),
      tokens2.length === 0 ? " " : null,
      marker && options.lens !== false ? h("span", { class: `code-diag t-${marker.severity}` }, marker.message) : null
    )
  );
}
function codeView(options) {
  if (options.inline) {
    return h("div", { class: "code", "data-dt": options.testid }, ...options.lines.map((_, index) => codeLine(options, index)));
  }
  const indices = options.lines.map((_, i) => i);
  const focusIndex = options.focusLine ? options.focusLine - (options.firstLine ?? 1) : null;
  let cols = 0;
  for (const line of options.lines) {
    let width = 0;
    for (const tok of line) width += tok.v.length + (tok.v.split("	").length - 1);
    if (width > cols) cols = width;
  }
  return h("div", { class: "code-scroll", style: { "--code-cols": String(cols) } }, virtualList({
    items: indices,
    rowHeight: options.rowHeight ?? LINE_HEIGHT,
    renderRow: (index) => codeLine(options, index),
    rowKey: (index) => index,
    className: "code",
    testid: options.testid,
    version: [options.lines, options.markers, options.focusLine, options.search, options.version],
    scrollTo: focusIndex,
    overscan: 12,
    role: "list",
    ariaLabel: "Program source"
  }));
}
const HIGHLIGHT_LIMIT = 2e5;
class CodeEditor extends Widget {
  constructor() {
    super(...arguments);
    __publicField(this, "textarea");
    __publicField(this, "layer");
    __publicField(this, "gutter");
    __publicField(this, "painted", "");
    __publicField(this, "framePending", false);
  }
  mount() {
    const root = document.createElement("div");
    root.className = "editor";
    if (this.props.testid) root.setAttribute("data-dt", this.props.testid);
    this.gutter = document.createElement("div");
    this.gutter.className = "editor-gutter";
    this.gutter.setAttribute("aria-hidden", "true");
    this.layer = document.createElement("pre");
    this.layer.className = "editor-layer code";
    this.layer.setAttribute("aria-hidden", "true");
    this.textarea = document.createElement("textarea");
    this.textarea.className = "editor-input";
    this.textarea.spellcheck = false;
    this.textarea.setAttribute("autocapitalize", "off");
    this.textarea.setAttribute("autocomplete", "off");
    this.textarea.setAttribute("aria-label", this.props.label ?? "Program source");
    this.textarea.setAttribute("data-dt", "editor-input");
    this.textarea.value = this.props.value;
    this.textarea.addEventListener("input", () => {
      this.props.onChange(this.textarea.value);
      this.schedulePaint();
    });
    this.textarea.addEventListener("scroll", () => this.syncScroll());
    this.textarea.addEventListener("keydown", (event) => this.onKeyDown(event));
    root.append(this.gutter, this.layer, this.textarea);
    this.paint();
    return root;
  }
  update(previous) {
    if (this.props.value !== previous.value && this.props.value !== this.textarea.value) {
      this.textarea.value = this.props.value;
      this.paint();
    } else if (this.props.markers !== previous.markers) {
      this.paint(true);
    }
  }
  unmount() {
    unmountAll(this.layer);
    unmountAll(this.gutter);
  }
  focus() {
    this.textarea.focus();
  }
  schedulePaint() {
    if (this.framePending) return;
    this.framePending = true;
    const run = () => {
      this.framePending = false;
      this.paint();
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
    else setTimeout(run, 16);
  }
  paint(force = false) {
    const text2 = this.textarea.value;
    if (!force && text2 === this.painted) return;
    this.painted = text2;
    const lines2 = text2.length > HIGHLIGHT_LIMIT ? text2.split("\n").map((v) => [{ t: "", v }]) : highlightLines(text2);
    const markers = this.props.markers;
    render$g(this.layer, lines2.map((tokens2, i) => {
      const marker = markers?.get(i + 1);
      return h(
        "div",
        { class: ["editor-line", marker ? marker.severity === "error" ? "is-error" : "is-warn" : ""] },
        ...renderTokens(tokens2),
        "​"
      );
    }));
    render$g(this.gutter, lines2.map((_, i) => {
      const marker = markers?.get(i + 1);
      return h(
        "div",
        { class: "editor-num", "data-tip": marker?.message },
        marker ? h("span", { class: `mark t-${marker.severity}` }) : null,
        String(i + 1)
      );
    }));
    this.syncScroll();
  }
  syncScroll() {
    this.layer.scrollTop = this.textarea.scrollTop;
    this.layer.scrollLeft = this.textarea.scrollLeft;
    this.gutter.scrollTop = this.textarea.scrollTop;
  }
  onKeyDown(event) {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && (event.key === "Enter" || event.key.toLowerCase() === "s")) {
      event.preventDefault();
      this.props.onSubmit?.(this.textarea.value);
      return;
    }
    if (event.key === "Escape") {
      if (this.props.onCancel) {
        event.preventDefault();
        event.stopPropagation();
        this.props.onCancel();
      }
      return;
    }
    const ta = this.textarea;
    if (event.key === "Tab") {
      event.preventDefault();
      const { selectionStart: start2, selectionEnd: end, value } = ta;
      if (event.shiftKey) {
        const lineStart = value.lastIndexOf("\n", start2 - 1) + 1;
        if (value.startsWith("  ", lineStart)) {
          ta.setRangeText("", lineStart, lineStart + 2, "end");
          ta.setSelectionRange(Math.max(lineStart, start2 - 2), Math.max(lineStart, end - 2));
        }
      } else {
        ta.setRangeText("  ", start2, end, "end");
      }
      this.props.onChange(ta.value);
      this.schedulePaint();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && !mod) {
      const { selectionStart: start2, value } = ta;
      const lineStart = value.lastIndexOf("\n", start2 - 1) + 1;
      const indent = /^[ \t]*/.exec(value.slice(lineStart, start2))?.[0] ?? "";
      const before = value.slice(lineStart, start2).trimEnd();
      const extra = /[[({]$/.test(before) ? "  " : "";
      event.preventDefault();
      ta.setRangeText(`
${indent}${extra}`, start2, ta.selectionEnd, "end");
      this.props.onChange(ta.value);
      this.schedulePaint();
    }
  }
}
function codeEditor(props) {
  return h(CodeEditor, props);
}
function visibleNodes(ctx, nodes) {
  const filter = ctx.ui.inspectFilter.trim().toLowerCase();
  if (filter) {
    return nodes.filter((node) => node.name.toLowerCase().includes(filter) || node.instanceKey.toLowerCase().includes(filter) || (node.explicitKey ?? "").toLowerCase().includes(filter)).map((node) => ({ ...node, depth: 0, parentKey: null }));
  }
  if (ctx.ui.inspectShowLibrary) return [...nodes];
  const kept = /* @__PURE__ */ new Set();
  for (const node of nodes) if (node.kind === "user") kept.add(node.instanceKey);
  const byKey = new Map(nodes.map((node) => [node.instanceKey, node]));
  const out = [];
  const depthOf = /* @__PURE__ */ new Map();
  for (const node of nodes) {
    if (node.kind !== "user") continue;
    let parent = node.parentKey;
    let guard = 0;
    while (parent !== null && !kept.has(parent) && guard++ < 200) parent = byKey.get(parent)?.parentKey ?? null;
    const depth = parent === null ? 0 : (depthOf.get(parent) ?? 0) + 1;
    depthOf.set(node.instanceKey, depth);
    out.push({ ...node, parentKey: parent, depth });
  }
  return out;
}
function treeRows(ctx, nodes) {
  const parents = /* @__PURE__ */ new Set();
  for (const node of nodes) if (node.parentKey) parents.add(node.parentKey);
  const rows = [];
  const hidden = /* @__PURE__ */ new Set();
  const filtering = ctx.ui.inspectFilter.trim() !== "";
  for (const node of nodes) {
    if (node.parentKey && (hidden.has(node.parentKey) || ctx.ui.inspectCollapsed.has(node.parentKey))) {
      hidden.add(node.instanceKey);
      continue;
    }
    const hasChildren = !filtering && parents.has(node.instanceKey);
    rows.push({ node, hasChildren, collapsed: hasChildren && ctx.ui.inspectCollapsed.has(node.instanceKey) });
  }
  return rows;
}
function heatClass(count) {
  if (count >= 20) return "heat-3";
  if (count >= 8) return "heat-2";
  if (count >= 3) return "heat-1";
  return "";
}
function renderTree(ctx, tree) {
  const { ui, model } = ctx;
  const nodes = visibleNodes(ctx, tree);
  const rows = treeRows(ctx, nodes);
  const selectedIndex = rows.findIndex((row2) => row2.node.instanceKey === ui.selectedInstance);
  const last = model.commits[model.commits.length - 1];
  const recent = last && ctx.now() - last.startTime < 1400 ? new Set(last.components.filter((c) => c.phase !== "memo").map((c) => c.instanceKey)) : /* @__PURE__ */ new Set();
  const select2 = (row2) => {
    if (!row2) return;
    ctx.selectInstance(row2.node.instanceKey, { reveal: false });
  };
  const toggle = (key2) => {
    if (ui.inspectCollapsed.has(key2)) ui.inspectCollapsed.delete(key2);
    else ui.inspectCollapsed.add(key2);
    ctx.refresh();
  };
  let revealIndex = null;
  if (ui.inspectReveal) {
    const index = rows.findIndex((row2) => row2.node.instanceKey === ui.inspectReveal);
    if (index >= 0) revealIndex = index;
    ui.inspectReveal = null;
  }
  const matchCount = ui.inspectFilter.trim() ? nodes.length : null;
  return h(
    "div",
    { class: "it-tree" },
    viewbar(
      button({ icon: "pick", label: ctx.overlay.isPicking ? "Picking…" : "Pick", active: ctx.overlay.isPicking, onClick: () => ctx.togglePicker(), kbd: "⇧ ⌥ C", tip: "Click an element on the page", testid: "inspect-pick" }),
      searchField({
        value: ui.inspectFilter,
        placeholder: "Find component…",
        meta: matchCount !== null ? `${matchCount}` : void 0,
        testid: "inspect-filter",
        onInput: (value) => {
          ui.inspectFilter = value;
          ctx.refresh();
        },
        onKeyDown: (event) => {
          if (event.key === "Enter" && nodes[0]) {
            event.preventDefault();
            ctx.selectInstance(nodes[0].instanceKey, { reveal: false });
          }
        }
      }),
      spacer(),
      filterChip({ label: "Library", on: ui.inspectShowLibrary, onToggle: () => {
        ui.inspectShowLibrary = !ui.inspectShowLibrary;
        ctx.refresh();
      }, tip: "Show built-in library components (Button, Card, …)", testid: "inspect-library" }),
      iconButton({ icon: "minimize", label: "Collapse all", size: "sm", onClick: () => {
        for (const node of tree) if (node.parentKey) ui.inspectCollapsed.add(node.parentKey);
        ctx.refresh();
      } }),
      iconButton({ icon: "maximize", label: "Expand all", size: "sm", onClick: () => {
        ui.inspectCollapsed.clear();
        ctx.refresh();
      } })
    ),
    virtualList({
      items: rows,
      rowHeight: ctx.rowHeight,
      rowKey: (row2) => row2.node.instanceKey,
      version: [ui.selectedInstance, ui.inspectCollapsed.size, last?.commitId, recent.size, ui.inspectShowLibrary],
      scrollTo: revealIndex ?? (selectedIndex >= 0 ? selectedIndex : null),
      role: "tree",
      ariaLabel: "Component tree",
      testid: "inspect-tree",
      empty: emptyState({
        icon: "inspect",
        title: ui.inspectFilter ? "No component matches" : "No component instances yet",
        body: ui.inspectFilter ? "Try another name, or clear the filter." : ui.inspectShowLibrary ? "Interact with the app, or force a render from the command palette." : "The program declares no function components — turn on Library to see built-ins."
      }),
      onKeyDown: (event) => {
        const row2 = rows[selectedIndex];
        switch (event.key) {
          case "ArrowDown":
            event.preventDefault();
            select2(rows[Math.min(rows.length - 1, selectedIndex + 1)]);
            break;
          case "ArrowUp":
            event.preventDefault();
            select2(rows[Math.max(0, selectedIndex < 0 ? rows.length - 1 : selectedIndex - 1)]);
            break;
          case "ArrowRight":
            if (row2?.hasChildren && row2.collapsed) {
              event.preventDefault();
              toggle(row2.node.instanceKey);
            } else if (row2?.hasChildren) {
              event.preventDefault();
              select2(rows[selectedIndex + 1]);
            }
            break;
          case "ArrowLeft":
            if (row2?.hasChildren && !row2.collapsed) {
              event.preventDefault();
              toggle(row2.node.instanceKey);
            } else if (row2?.node.parentKey) {
              event.preventDefault();
              select2(rows.find((r) => r.node.instanceKey === row2.node.parentKey));
            }
            break;
          case "Home":
            event.preventDefault();
            select2(rows[0]);
            break;
          case "End":
            event.preventDefault();
            select2(rows[rows.length - 1]);
            break;
        }
      },
      renderRow: (row2) => {
        const { node } = row2;
        const count = model.renderCounts.get(node.instanceKey) ?? 0;
        const selected = node.instanceKey === ui.selectedInstance;
        const flashing = recent.has(node.instanceKey);
        return h(
          "div",
          {
            class: ["row", "it-row", selected ? "is-selected" : "", node.mounted === false ? "is-dim" : "", flashing ? `flash-${count % 2}` : ""],
            role: "treeitem",
            "aria-level": node.depth + 1,
            "aria-selected": selected,
            "aria-expanded": row2.hasChildren ? !row2.collapsed : void 0,
            "data-key": node.instanceKey,
            "data-dt": "tree-row",
            style: { paddingLeft: `${6 + node.depth * 14}px` },
            onClick: () => ctx.selectInstance(node.instanceKey, { reveal: false }),
            onMouseEnter: () => ctx.highlightInstance(node.instanceKey),
            onMouseLeave: () => ctx.highlightInstance(null)
          },
          h("button", {
            type: "button",
            tabindex: -1,
            "aria-hidden": "true",
            class: ["twist", row2.hasChildren ? "" : "is-leaf", row2.hasChildren && !row2.collapsed ? "is-open" : ""],
            onClick: (event) => {
              event.stopPropagation();
              toggle(node.instanceKey);
            }
          }, icon("chevronRight", { size: 11 })),
          node.kind === "user" ? h("span", { class: "it-glyph" }, icon("puzzle", { size: 12 })) : null,
          h("span", { class: ["it-name", node.kind === "user" ? "is-user" : ""] }, node.name),
          node.explicitKey ? h("span", { class: "it-key" }, `key=${node.explicitKey.length > 14 ? `${node.explicitKey.slice(0, 13)}…` : node.explicitKey}`) : null,
          node.mounted === false ? h("span", { class: "it-flag", "data-tip": "No DOM node carries this instance's tag" }, "no dom") : null,
          h(
            "span",
            { class: "meta" },
            count > 0 ? h("span", { class: ["it-count", heatClass(count)], "data-tip": `Rendered ${count}× this session` }, `×${count}`) : null,
            h("span", { class: "it-time" }, node.phase === "memo" ? "memo" : node.selfTime > 0 ? fmtMs(node.selfTime) : "")
          )
        );
      }
    })
  );
}
function valueOf$1(value) {
  if (value.json === void 0) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(value.json) };
  } catch {
    return { ok: false };
  }
}
function propsPane(ctx, detail) {
  const { app, ui } = ctx;
  const canOverride = can(app, "setPropOverride");
  const rows = detail.props.map((prop) => {
    const parsed2 = valueOf$1(prop.value);
    const scope = `prop:${detail.instanceKey}:${prop.name}`;
    const editable = parsed2.ok && (canOverride || prop.stateRef !== void 0);
    const tags = h(
      "span",
      { class: "it-prop-tags" },
      prop.stateRef ? chip(`$${prop.stateRef}`, "purple", { mono: true, tip: "Two-way bound: editing writes the atom", onClick: () => {
        ui.stateFilter = prop.stateRef.split(".")[0] ?? "";
        ctx.selectTab("state");
      } }) : null,
      prop.overridden ? chip("override", "amber", { tip: "The UI is showing a DevTools value, not the program's" }) : null,
      prop.overridden && can(app, "clearPropOverride") ? iconButton({ icon: "undo", label: `Restore ${prop.name}`, size: "sm", onClick: () => {
        app.clearPropOverride(detail.instanceKey, prop.name);
        ctx.toast(`${prop.name} restored`);
        ctx.refresh();
      } }) : null
    );
    const body = parsed2.ok ? valueTree({
      scope,
      value: { [prop.name]: parsed2.value },
      expanded: ui.propsExpanded,
      onToggle: (path) => {
        if (ui.propsExpanded.has(path)) ui.propsExpanded.delete(path);
        else ui.propsExpanded.add(path);
        ctx.refresh();
      },
      rowHeight: ctx.rowHeight,
      inline: true,
      editable: () => editable,
      editing: ui.edit,
      setEditing: (edit) => {
        ui.edit = edit;
        ctx.refresh();
      },
      editJson: (_path, value) => ctx.editJson({
        title: `Override ${detail.name}.${prop.name}`,
        value,
        onSave: (next) => write([], next)
      }),
      onCopy: (text2, what) => ctx.copy(text2, what),
      onEdit: (path, next) => write(path.split(".").slice(1), next),
      decorate: (row2) => row2.depth === 0 ? tags : null,
      testid: "prop-tree"
    }) : h(
      "div",
      { class: "row it-opaque" },
      h("span", { class: "vk" }, prop.name),
      h("span", { class: "vsep" }, ":"),
      h("span", { class: `v t-${prop.value.type}`, title: "Functions, resources and DOM nodes cannot be edited" }, prop.value.preview),
      h("span", { class: "grow" }),
      tags
    );
    function write(rest, next) {
      if (!parsed2.ok) return;
      if (prop.stateRef) {
        const path = [prop.stateRef, ...rest].join(".");
        app.setState(path, next);
        ctx.toast(`$${path} updated`, "good");
      } else if (can(app, "setPropOverride")) {
        const full = rest.length === 0 ? next : setAtPath(parsed2.value, rest, next);
        app.setPropOverride(detail.instanceKey, prop.name, full);
        ctx.toast(`${detail.name}.${prop.name} overridden`, "good", {
          action: can(app, "clearPropOverride") ? { label: "Undo", run: () => {
            app.clearPropOverride(detail.instanceKey, prop.name);
            ctx.refresh();
          } } : void 0
        });
      }
      ctx.refresh();
    }
    return h("div", { key: prop.name, class: "it-prop" }, body);
  });
  const draft = ui.overrideDraft;
  const adder = canOverride ? h(
    "div",
    { class: "it-add" },
    icon("plus", { size: 12 }),
    field({ value: draft.name, placeholder: "prop", width: "120px", mono: true, onInput: (v) => {
      draft.name = v;
    }, label: "Prop name" }),
    field({ value: draft.value, placeholder: '"danger", 12, true, { "gap": 8 }', mono: true, onInput: (v) => {
      draft.value = v;
    }, label: "Value", onCommit: () => apply() }),
    button({ label: "Override", size: "sm", onClick: () => apply(), testid: "override-apply" })
  ) : null;
  function apply() {
    const name = draft.name.trim();
    if (!name || !can(app, "setPropOverride")) return;
    app.setPropOverride(detail.instanceKey, name, parseEditedValue(draft.value));
    ctx.toast(`${detail.name}.${name} overridden`, "good");
    ui.overrideDraft = { name: "", value: "" };
    ctx.refresh();
  }
  return h(
    "div",
    { class: "stack" },
    detail.props.length === 0 ? h("div", { class: "hint" }, "This instance received no arguments.") : h("div", { class: "it-props" }, ...rows),
    adder,
    h("div", { class: "hint" }, canOverride ? ["A ", h("code", {}, "$"), "-bound prop writes its atom. Any other prop takes an override that lasts until you restore it."] : "This runtime does not support prop overrides.")
  );
}
function statePane(ctx, detail) {
  const { app, ui } = ctx;
  const hooks = detail.hooks.map((hook) => {
    const parsed2 = valueOf$1(hook.value);
    const canWrite = hook.editable && can(app, "setInstanceHook") && parsed2.ok;
    return h(
      "div",
      { key: `h${hook.slot}`, class: "it-prop" },
      parsed2.ok ? valueTree({
        scope: `hook:${detail.instanceKey}:${hook.slot}`,
        value: { [`[${hook.slot}]`]: parsed2.value },
        expanded: ui.propsExpanded,
        onToggle: (path) => {
          if (ui.propsExpanded.has(path)) ui.propsExpanded.delete(path);
          else ui.propsExpanded.add(path);
          ctx.refresh();
        },
        rowHeight: ctx.rowHeight,
        inline: true,
        editable: () => canWrite,
        editing: ui.edit,
        setEditing: (edit) => {
          ui.edit = edit;
          ctx.refresh();
        },
        onCopy: (text2, what) => ctx.copy(text2, what),
        onEdit: (path, next) => {
          const rest = path.split(".").slice(1);
          const full = rest.length === 0 ? next : setAtPath(parsed2.value, rest, next);
          const ok = can(app, "setInstanceHook") && app.setInstanceHook(detail.instanceKey, hook.slot, full);
          ctx.toast(ok ? `Slot ${hook.slot} updated` : `Slot ${hook.slot} is read-only`, ok ? "good" : "warn");
          ctx.refresh();
        },
        decorate: (row2) => row2.depth === 0 ? chip(hook.kind, hook.kind === "state" ? "green" : hook.kind === "memo" ? "blue" : "grey", { tip: hook.kind === "memo" ? "Recomputed from its deps — edit what it reads instead" : void 0 }) : null
      }) : h("div", { class: "row" }, h("span", { class: "vk is-index" }, `[${hook.slot}]`), h("span", { class: "vsep" }, ":"), h("span", { class: `v t-${hook.value.type}` }, hook.value.preview), spacer(), chip(hook.kind))
    );
  });
  const uiState = detail.uiState.map((slot) => {
    const parsed2 = valueOf$1(slot.value);
    const canWrite = slot.editable && can(app, "setInstanceUiState") && parsed2.ok;
    return h(
      "div",
      { key: `u${slot.key}`, class: "it-prop" },
      parsed2.ok ? valueTree({
        scope: `ui:${detail.instanceKey}:${slot.key}`,
        value: { [slot.key]: parsed2.value },
        expanded: ui.propsExpanded,
        onToggle: (path) => {
          if (ui.propsExpanded.has(path)) ui.propsExpanded.delete(path);
          else ui.propsExpanded.add(path);
          ctx.refresh();
        },
        rowHeight: ctx.rowHeight,
        inline: true,
        editable: () => canWrite,
        editing: ui.edit,
        setEditing: (edit) => {
          ui.edit = edit;
          ctx.refresh();
        },
        onEdit: (path, next) => {
          const rest = path.split(".").slice(1);
          const full = rest.length === 0 ? next : setAtPath(parsed2.value, rest, next);
          const ok = can(app, "setInstanceUiState") && app.setInstanceUiState(detail.instanceKey, slot.key, full);
          ctx.toast(ok ? `${slot.key} updated` : `${slot.key} no longer exists`, ok ? "good" : "warn");
          ctx.refresh();
        }
      }) : h("div", { class: "row" }, h("span", { class: "vk" }, slot.key), h("span", { class: "vsep" }, ":"), h("span", { class: `v t-${slot.value.type}` }, slot.value.preview))
    );
  });
  return h(
    "div",
    { class: "stack" },
    h(
      "div",
      {},
      h("div", { class: "it-sub" }, "Hooks", h("span", { class: "t3" }, " — $state / $memo / $ref cells, by call order")),
      hooks.length > 0 ? h("div", { class: "it-props" }, ...hooks) : h("div", { class: "hint" }, "No per-instance hooks.")
    ),
    detail.uiState.length > 0 ? h(
      "div",
      {},
      h("div", { class: "it-sub" }, "Component UI state", h("span", { class: "t3" }, " — a Tabs' active pane, a Popover's open flag, a DataGrid's sort")),
      h("div", { class: "it-props" }, ...uiState)
    ) : null,
    h(
      "div",
      {},
      h("div", { class: "it-sub" }, "Reads", h("span", { class: "t3" }, " — reactive paths this body read last render (its memo dependencies)")),
      detail.deps.length > 0 ? h("div", { class: "chips" }, ...detail.deps.map((dep) => atomChip(ctx, dep))) : h("div", { class: "hint" }, detail.kind === "user" ? "This body read no reactive state." : "Library components are tracked through the user component that renders them.")
    )
  );
}
function effectsPane(ctx, detail) {
  const { app, model } = ctx;
  if (detail.effects.length === 0) return h("div", { class: "hint" }, "No effects are mounted under this instance.");
  const mounted = can(app, "getEffects") ? ctx.cache("effects", () => app.getEffects()) : [];
  const aggregates = new Map(effectAggregates(model.effects).map((agg) => [agg.effectKey, agg]));
  return h("div", { class: "it-effects" }, ...detail.effects.map((key2) => {
    const info = mounted.find((effect) => effect.effectKey === key2);
    const agg = aggregates.get(key2);
    return h(
      "div",
      { key: key2, class: "card is-pad it-effect" },
      h(
        "div",
        { class: "row-flex" },
        icon("effects", { size: 14 }),
        h("button", { type: "button", class: "link", onClick: () => {
          ctx.ui.selectedEffect = key2;
          ctx.ui.effectView = "mounted";
          ctx.selectTab("effects");
        } }, info?.label ?? key2.split("::").pop() ?? key2),
        spacer(),
        agg ? chip(`${agg.runs} run${agg.runs === 1 ? "" : "s"}`, "blue") : null,
        agg && agg.errors > 0 ? chip(`${agg.errors} error${agg.errors === 1 ? "" : "s"}`, "red") : null,
        can(app, "runEffect") ? button({ label: "Run now", size: "sm", icon: "play", onClick: () => {
          const ok = app.runEffect(key2);
          ctx.toast(ok ? "Effect ran" : "Effect is no longer mounted", ok ? "good" : "warn");
        } }) : null
      ),
      info ? h(
        "div",
        { class: "it-effect-meta" },
        h("span", { class: "mono t2" }, info.triggers),
        info.stateDeps.length > 0 ? h("div", { class: "chips" }, ...info.stateDeps.map((dep) => atomChip(ctx, dep, "green"))) : null,
        info.intervals.length > 0 ? chip(`every ${info.intervals.join(", ")}ms`, "cyan") : null
      ) : null
    );
  }));
}
function boxModel(box) {
  const side = (n) => n === 0 ? "–" : String(Math.round(n * 100) / 100);
  const layer = (name, s, inner) => h(
    "div",
    { class: `bm bm-${name}` },
    h("span", { class: "bm-label" }, name),
    h("span", { class: "bm-top" }, side(s.top)),
    h("span", { class: "bm-left" }, side(s.left)),
    inner,
    h("span", { class: "bm-right" }, side(s.right)),
    h("span", { class: "bm-bottom" }, side(s.bottom))
  );
  return h(
    "div",
    { class: "bm-wrap", "data-dt": "box-model" },
    layer(
      "margin",
      box.margin,
      layer(
        "border",
        box.border,
        layer(
          "padding",
          box.padding,
          h("div", { class: "bm-content" }, `${Math.round(box.content.width * 100) / 100} × ${Math.round(box.content.height * 100) / 100}`)
        )
      )
    )
  );
}
function domPane(ctx, element, detail) {
  if (!element) return note("info", "No DOM node carries this instance's tag — it renders a fragment (Show, Async, Lazy…), or DOM tagging is off in Settings.");
  const box = measureBox(element);
  const attrs = [...element.attributes].filter((attr) => !attr.name.startsWith("data-aktion"));
  return h(
    "div",
    { class: "stack" },
    h(
      "div",
      { class: "row-flex wrap" },
      h("code", { class: "it-el" }, describeElement(element)),
      spacer(),
      button({ label: "Copy selector", size: "sm", icon: "copy", onClick: () => ctx.copy(cssPath(element), "the selector") }),
      button({ label: "Copy HTML", size: "sm", icon: "code", onClick: () => ctx.copy(element.outerHTML, "the HTML") }),
      button({ label: "Log", size: "sm", icon: "console", tip: "Log the element to the browser console as $aktion", onClick: () => {
        globalThis.$aktion = element;
        console.log("[aktion-devtools] selected element ($aktion):", element);
        ctx.toast("Logged to the browser console as $aktion", "good");
      } })
    ),
    box ? boxModel(box) : h("div", { class: "hint" }, "This element has no layout to measure."),
    h(
      "div",
      {},
      h("div", { class: "it-sub" }, `Attributes (${attrs.length})`),
      attrs.length === 0 ? h("div", { class: "hint" }, "No attributes.") : h("div", { class: "it-attrs" }, ...attrs.map((attr) => h("div", { key: attr.name, class: "it-attr" }, h("span", { class: "it-attr-k" }, attr.name), h("span", { class: "it-attr-v" }, attr.value || '""'))))
    ),
    detail?.html ? h(
      "div",
      {},
      h("div", { class: "it-sub" }, "Rendered markup", detail.domNodes ? h("span", { class: "t3" }, ` — ${detail.domNodes} nodes`) : null),
      h("pre", { class: "pre is-wrap it-html" }, detail.html)
    ) : null
  );
}
function stylesPane(ctx, element) {
  if (!element) return h("div", { class: "hint" }, "Select an element with a DOM node to read its computed styles.");
  const ui = ctx.ui;
  const filter = ui.computedFilter.trim().toLowerCase();
  const groups = COMPUTED_GROUPS.map((group) => ({
    title: group.title,
    rows: computedGroup(element, group.props).filter(([prop, value]) => !filter || prop.includes(filter) || value.toLowerCase().includes(filter))
  })).filter((group) => group.rows.length > 0);
  const vars = cssVariables(element).filter(([name, value]) => !filter || name.includes(filter) || value.toLowerCase().includes(filter)).slice(0, 120);
  const isColor = (value) => /^(#|rgb|hsl|color\(|oklch|lab\()/i.test(value);
  return h(
    "div",
    { class: "stack" },
    searchField({ value: ui.computedFilter, placeholder: "Filter properties…", onInput: (v) => {
      ui.computedFilter = v;
      ctx.refresh();
    }, width: "100%" }),
    ...groups.map((group) => h(
      "div",
      { key: group.title },
      h("div", { class: "it-sub" }, group.title),
      h("div", { class: "it-css" }, ...group.rows.map(([prop, value]) => h(
        "div",
        { key: prop, class: "it-css-row" },
        h("span", { class: "it-css-k" }, prop),
        isColor(value) ? h("span", { class: "swatch-sq", style: { background: value } }) : null,
        h("span", { class: "it-css-v" }, value)
      )))
    )),
    groups.length === 0 ? h("div", { class: "hint" }, "No computed properties match.") : null,
    h(
      "div",
      {},
      h("div", { class: "it-sub row-flex" }, `Theme variables in effect (${vars.length})`, spacer(), button({ label: "Edit tokens", size: "sm", variant: "ghost", icon: "theme", onClick: () => ctx.selectTab("theme") })),
      vars.length === 0 ? h("div", { class: "hint" }, "No --rui-* variables reach this element.") : h("div", { class: "it-css" }, ...vars.map(([name, value]) => h(
        "div",
        { key: name, class: "it-css-row" },
        h("span", { class: "it-css-k tone-purple" }, name),
        isColor(value) ? h("span", { class: "swatch-sq", style: { background: value } }) : null,
        h("span", { class: "it-css-v" }, value)
      )))
    )
  );
}
function a11yPane(ctx, element) {
  if (!element) return h("div", { class: "hint" }, "Select an element with a DOM node.");
  const summary = a11ySummary(element);
  const root = element.parentElement ?? element;
  const findings = ctx.memo(`it:a11y:${ctx.ui.selectedInstance}`, [ctx.model.revs.commit, element], () => auditAccessibility(root, { limit: 600 }).findings.filter((f) => f.element === element || element.contains(f.element)));
  const order = ctx.memo("it:taborder", [ctx.model.revs.commit], () => {
    const r = element.getRootNode();
    return tabOrder(r.firstElementChild ?? null);
  });
  const position = order.indexOf(element);
  return h(
    "div",
    { class: "stack" },
    h(
      "div",
      { class: "it-announce", "data-dt": "announce" },
      h("div", { class: "it-announce-label" }, icon("a11y", { size: 13 }), "A screen reader announces"),
      h("div", { class: "it-announce-text" }, announce(element))
    ),
    kv([
      ...summary.map(([k, v]) => [k, h("code", {}, v)]),
      ["tab order", position >= 0 ? `stop ${position + 1} of ${order.length}` : "not in the tab order"]
    ]),
    h(
      "div",
      {},
      h(
        "div",
        { class: "it-sub row-flex" },
        `Findings in this subtree (${findings.length})`,
        spacer(),
        button({ label: "Audit the whole app", size: "sm", variant: "ghost", icon: "a11y", onClick: () => {
          ctx.ui.a11yRequested = true;
          ctx.selectTab("a11y");
        } })
      ),
      findings.length === 0 ? note("good", "No accessibility problems found here.") : h("div", { class: "stack" }, ...findings.slice(0, 12).map((finding, i) => h(
        "div",
        {
          key: `${finding.rule}${i}`,
          class: ["it-finding", `t-${finding.impact}`],
          onMouseEnter: () => ctx.highlightElement(finding.element),
          onMouseLeave: () => ctx.highlightElement(null)
        },
        h("div", { class: "row-flex" }, chip(finding.impact, finding.impact === "critical" || finding.impact === "serious" ? "red" : finding.impact === "moderate" ? "amber" : "grey"), h("b", {}, finding.rule), finding.wcag ? h("span", { class: "t3" }, `WCAG ${finding.wcag.join(", ")}`) : null),
        h("div", {}, finding.message),
        h("div", { class: "t3" }, finding.help)
      )))
    )
  );
}
function sourcePane(ctx, detail) {
  const line = detail.source?.line;
  if (!line || !ctx.app) return h("div", { class: "hint" }, "This instance carries no source position (it may come from a compiled program).");
  const program = ctx.app.getProgram();
  const lines2 = ctx.memo("it:lines", [program], () => highlightLines(program));
  const from = Math.max(1, line - 6);
  const to = Math.min(lines2.length, line + 8);
  return h(
    "div",
    { class: "stack" },
    h(
      "div",
      { class: "row-flex" },
      h("span", { class: "t2" }, `Line ${line}, column ${detail.source?.column ?? 0}`),
      spacer(),
      button({ label: "Open in Source", size: "sm", icon: "source", onClick: () => openSource(ctx, line) })
    ),
    h("div", { class: "it-code" }, codeView({ lines: lines2.slice(from - 1, to), firstLine: from, focusLine: line, inline: true, onLineClick: (n) => openSource(ctx, n) }))
  );
}
function renderDetail(ctx, tree) {
  const { app, ui, model } = ctx;
  const key2 = ui.selectedInstance;
  if (!key2 && !ui.selectedElement) {
    return emptyState({
      icon: "cursor",
      title: "Select a component",
      body: "Choose one in the tree, or pick any element on the page to jump to the component that rendered it.",
      actions: [
        button({ label: "Pick an element", icon: "pick", variant: "primary", onClick: () => ctx.togglePicker() }),
        tree[0] ? button({ label: `Select ${tree[0].name}`, onClick: () => ctx.selectInstance(tree[0].instanceKey, { reveal: false }) }) : null
      ]
    });
  }
  if (!key2 && ui.selectedElement) {
    const element2 = ui.selectedElement;
    const pane2 = ui.inspectPane === "styles" || ui.inspectPane === "a11y" ? ui.inspectPane : "dom";
    return h(
      "div",
      { class: "it-detail" },
      h(
        "div",
        { class: "pane-head" },
        h("span", { class: "pane-title" }, describeElement(element2)),
        chip("no component", "amber"),
        spacer(),
        button({ label: "Clear", size: "sm", variant: "ghost", onClick: () => {
          ui.selectedElement = null;
          ctx.overlay.clear();
          ctx.refresh();
        } })
      ),
      tabs([{ value: "dom", label: "DOM" }, { value: "styles", label: "Styles" }, { value: "a11y", label: "Accessibility" }], pane2, (value) => {
        ui.inspectPane = value;
        ctx.refresh();
      }),
      h(
        "div",
        { class: "pane-body is-pad" },
        note("plain", "This element was not rendered by a tracked component (host page markup, or an unmanaged widget)."),
        pane2 === "dom" ? domPane(ctx, element2, null) : pane2 === "styles" ? stylesPane(ctx, element2) : a11yPane(ctx, element2)
      )
    );
  }
  const detail = can(app, "getInstance") ? ctx.cache(`instance:${key2}`, () => app.getInstance(key2)) : null;
  if (!detail) {
    return emptyState({
      icon: "inspect",
      title: "That instance is gone",
      body: "It unmounted, or the program was re-planned.",
      actions: [button({ label: "Clear selection", onClick: () => {
        ui.selectedInstance = null;
        ctx.overlay.clear();
        ctx.refresh();
      } })]
    });
  }
  const element = can(app, "nodeForInstance") ? app.nodeForInstance(key2) : null;
  const renders = model.renderCounts.get(key2) ?? 0;
  let memoCount = 0;
  let slowest = 0;
  for (const commit of model.commits) {
    for (const record of commit.components) {
      if (record.instanceKey !== key2) continue;
      if (record.phase === "memo") memoCount += 1;
      else if (record.selfTime > slowest) slowest = record.selfTime;
    }
  }
  const node = tree.find((n) => n.instanceKey === key2);
  const hooksCount = detail.hooks.length + detail.uiState.length;
  const pane = ui.inspectPane;
  const crumbs = h(
    "nav",
    { class: "it-crumbs", "aria-label": "Ancestors" },
    ...detail.ancestors.slice(-6).map((ancestor) => [
      h("button", {
        type: "button",
        class: "it-crumb",
        onClick: () => ctx.selectInstance(ancestor, { reveal: false }),
        onMouseEnter: () => ctx.highlightInstance(ancestor),
        onMouseLeave: () => ctx.highlightInstance(null)
      }, componentNameFromKey(ancestor)),
      icon("chevronRight", { size: 10 })
    ]),
    h("span", { class: "it-crumb is-current" }, detail.name)
  );
  let body;
  switch (pane) {
    case "hooks":
      body = statePane(ctx, detail);
      break;
    case "effects":
      body = effectsPane(ctx, detail);
      break;
    case "dom":
      body = domPane(ctx, element, detail);
      break;
    case "styles":
      body = stylesPane(ctx, element);
      break;
    case "a11y":
      body = a11yPane(ctx, element);
      break;
    case "source":
      body = sourcePane(ctx, detail);
      break;
    default:
      body = propsPane(ctx, detail);
  }
  return h(
    "div",
    { class: "it-detail", "data-dt": "inspect-detail" },
    h(
      "div",
      { class: "it-head" },
      detail.ancestors.length > 0 ? crumbs : null,
      h(
        "div",
        { class: "it-title" },
        h("h2", {}, detail.name),
        chip(detail.kind, detail.kind === "user" ? "accent" : "grey"),
        detail.explicitKey ? chip(`key=${detail.explicitKey}`, "grey", { mono: true }) : null,
        detail.source ? h("button", { type: "button", class: "link mono", onClick: () => openSource(ctx, detail.source.line), "data-tip": "Open in Source" }, `L${detail.source.line}:${detail.source.column}`) : null,
        !detail.mounted ? chip("not in DOM", "amber") : null,
        spacer(),
        element ? iconButton({ icon: "target", label: "Scroll into view", onClick: () => {
          element.scrollIntoView({ behavior: "smooth", block: "center" });
          ctx.highlightInstance(key2, true);
        } }) : null,
        can(app, "remountInstance") ? iconButton({ icon: "refresh", label: "Remount (reset its state)", onClick: () => {
          app.remountInstance(key2);
          ctx.toast(`Remounted ${detail.name}`, "good");
        } }) : null,
        iconButton({ icon: "copy", label: "Copy the instance key", onClick: () => ctx.copy(key2, "the instance key") }),
        iconButton({ icon: "more", label: "More actions", onClick: (event) => ctx.openMenu(event, [
          { label: "Copy props as JSON", icon: "brackets", run: () => ctx.copy(JSON.stringify(Object.fromEntries(detail.props.map((p) => [p.name, p.value.json ? JSON.parse(p.value.json) : p.value.preview])), null, 2), "the props") },
          ...element ? [{ label: "Copy CSS selector", icon: "hash", run: () => ctx.copy(cssPath(element), "the selector") }] : [],
          ...element ? [{ label: "Store element as $aktion", icon: "console", run: () => {
            globalThis.$aktion = element;
            ctx.toast("Available in the browser console as $aktion", "good");
          } }] : [],
          { label: "Force a full re-render", icon: "refresh", run: () => app?.forceRender() },
          ...can(app, "listPropOverrides") && app.listPropOverrides().length > 0 && can(app, "clearPropOverride") ? [{ kind: "separator", label: "" }, { label: "Clear every prop override", icon: "undo", danger: true, run: () => {
            for (const entry of app.listPropOverrides()) app.clearPropOverride(entry.instanceKey, entry.prop);
            ctx.toast("Overrides cleared");
          } }] : []
        ]) })
      ),
      statGrid(
        stat({ label: "Renders", value: String(renders), tone: renders >= 20 ? "amber" : void 0 }),
        stat({ label: "Memo hits", value: String(memoCount) }),
        stat({ label: "Last", value: node && node.selfTime > 0 ? fmtMs(node.selfTime) : "—" }),
        stat({ label: "Slowest", value: slowest > 0 ? fmtMs(slowest) : "—", tone: slowest >= 16 ? "red" : slowest >= 8 ? "amber" : void 0 }),
        stat({ label: "DOM nodes", value: detail.domNodes !== void 0 ? String(detail.domNodes) : "—" })
      )
    ),
    tabs([
      { value: "props", label: "Props", count: detail.props.length },
      { value: "hooks", label: "State", count: hooksCount },
      { value: "effects", label: "Effects", count: detail.effects.length },
      { value: "dom", label: "DOM" },
      { value: "styles", label: "Styles" },
      { value: "a11y", label: "Accessibility" },
      { value: "source", label: "Source" }
    ], pane, (value) => {
      ui.inspectPane = value;
      ctx.refresh();
    }, { label: "Instance detail" }),
    h("div", { class: "pane-body is-pad", key: `${key2}:${pane}` }, body)
  );
}
function render$e(ctx) {
  const { app } = ctx;
  if (!app) return noApp(ctx, "The Inspector", "inspect");
  if (!can(app, "getComponentTree")) return h("div", { class: "dt-pad" }, unsupported("a component tree"));
  const tree = ctx.cache("tree", () => app.getComponentTree());
  const overrides = can(app, "listPropOverrides") ? app.listPropOverrides() : [];
  const wide = ctx.width() >= 720;
  return h(
    "div",
    { class: "it", "data-dt": "inspect" },
    overrides.length > 0 ? h(
      "div",
      { class: "it-banner" },
      icon("warning", { size: 14 }),
      h("span", { class: "grow" }, `${overrides.length} prop override${overrides.length === 1 ? "" : "s"} active — the UI is showing DevTools values, not the program's.`),
      can(app, "clearPropOverride") ? button({ label: "Clear all", size: "sm", onClick: () => {
        for (const entry of overrides) app.clearPropOverride(entry.instanceKey, entry.prop);
        ctx.toast("Overrides cleared");
        ctx.refresh();
      } }) : null
    ) : null,
    split({
      direction: wide ? "row" : "col",
      size: paneSize(ctx, wide ? "inspect.tree" : "inspect.tree.col", wide ? 340 : 240),
      min: wide ? 220 : 120,
      onResize: (size) => setPaneSize(ctx, wide ? "inspect.tree" : "inspect.tree.col", size),
      first: renderTree(ctx, tree),
      second: renderDetail(ctx, tree),
      label: "Resize the component tree"
    })
  );
}
const inspectView = {
  id: "inspect",
  label: "Inspector",
  icon: "inspect",
  group: "inspect",
  hint: "Component tree, live props and state, DOM, styles",
  keywords: "components tree element picker props hooks dom styles box model accessibility",
  badge: (ctx) => {
    const n = can(ctx.app, "listPropOverrides") ? ctx.app.listPropOverrides().length : 0;
    return n > 0 ? { value: n, tone: "amber" } : null;
  },
  render: render$e,
  commands: (ctx) => [
    { id: "library", label: ctx.ui.inspectShowLibrary ? "Hide library components" : "Show library components", icon: "layers", run: () => {
      ctx.ui.inspectShowLibrary = !ctx.ui.inspectShowLibrary;
      ctx.selectTab("inspect");
    } },
    { id: "collapse", label: "Collapse the component tree", icon: "minimize", run: () => {
      ctx.ui.inspectCollapsed.clear();
      ctx.selectTab("inspect");
    } }
  ],
  css: (
    /* css */
    `
.it { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.it-banner { flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--dt-amber-soft); color: var(--dt-amber); font-size: var(--dt-fs-sm); font-weight: 550; border-bottom: 1px solid var(--dt-border); }
.it-tree { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.it-row .it-glyph { color: var(--dt-accent-text); opacity: 0.85; display: inline-flex; }
.it-name { color: var(--dt-text-2); overflow: hidden; text-overflow: ellipsis; }
.it-name.is-user { color: var(--dt-text); font-weight: 650; }
.row.is-selected .it-name { color: var(--dt-text); }
.it-key { font-family: var(--dt-mono); font-size: 10px; color: var(--dt-syn-str); background: var(--dt-bg-active); padding: 0 5px; border-radius: 4px; flex: none; }
.it-flag { font-size: 9.5px; color: var(--dt-amber); font-weight: 650; flex: none; }
.it-count { font-size: 9.5px; font-weight: 700; padding: 0 5px; border-radius: 6px; background: var(--dt-bg-active); color: var(--dt-text-3); }
.it-count.heat-1 { background: var(--dt-green-soft); color: var(--dt-green); }
.it-count.heat-2 { background: var(--dt-amber-soft); color: var(--dt-amber); }
.it-count.heat-3 { background: var(--dt-red-soft); color: var(--dt-red); }
.it-time { min-width: 44px; text-align: right; }
.it-detail { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.it-head { flex: none; padding: 10px 12px 10px; display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid var(--dt-border); }
.it-head .grid-stats { grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); }
.it-head .stat { padding: 7px 9px; }
.it-head .stat-value { font-size: 14px; }
.it-crumbs { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; color: var(--dt-text-4); }
.it-crumb { border: 0; background: none; padding: 1px 5px; border-radius: 4px; color: var(--dt-text-3); font-size: var(--dt-fs-sm); }
button.it-crumb:hover { background: var(--dt-bg-hover); color: var(--dt-text); }
.it-crumb.is-current { color: var(--dt-text); font-weight: 600; }
.it-title { display: flex; align-items: center; gap: 8px; min-width: 0; }
.it-title h2 { margin: 0; font-size: 16px; font-weight: 700; letter-spacing: -0.015em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.it-props { display: flex; flex-direction: column; border: 1px solid var(--dt-border); border-radius: var(--dt-r); background: var(--dt-bg-sunken); padding: 3px 0; }
.it-prop .row { margin: 0 3px; }
.it-prop-tags { display: inline-flex; align-items: center; gap: 4px; margin-left: 6px; }
.it-opaque { margin: 0 3px; }
.it-add { display: flex; align-items: center; gap: 6px; color: var(--dt-text-3); }
.it-add .input:nth-child(3) { flex: 1; }
.it-sub { font-size: var(--dt-fs-xs); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dt-text-3); margin: 2px 0 6px; }
.it-sub .t3 { text-transform: none; letter-spacing: 0; font-weight: 450; }
.it-effects { display: flex; flex-direction: column; gap: 8px; }
.it-effect-meta { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.it-el { font-family: var(--dt-mono); font-size: var(--dt-fs-mono); color: var(--dt-syn-comp); }
.it-attrs, .it-css { display: flex; flex-direction: column; border: 1px solid var(--dt-border); border-radius: var(--dt-r); overflow: hidden; }
.it-attr, .it-css-row { display: flex; gap: 10px; align-items: center; padding: 4px 10px; font-family: var(--dt-mono); font-size: var(--dt-fs-mono); border-bottom: 1px solid var(--dt-border); min-width: 0; }
.it-attr:last-child, .it-css-row:last-child { border-bottom: 0; }
.it-attr-k, .it-css-k { color: var(--dt-syn-prop); flex: none; min-width: 120px; }
.it-attr-v, .it-css-v { color: var(--dt-text); overflow-wrap: anywhere; min-width: 0; }
.it-html { max-height: 220px; }
.it-code { border: 1px solid var(--dt-border); border-radius: var(--dt-r); overflow: hidden; }
.it-announce { padding: 12px; border-radius: var(--dt-r); background: linear-gradient(135deg, var(--dt-accent-soft), transparent 70%), var(--dt-bg-elev); border: 1px solid var(--dt-border-strong); }
.it-announce-label { display: flex; align-items: center; gap: 6px; font-size: var(--dt-fs-xs); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dt-accent-text); margin-bottom: 4px; }
.it-announce-text { font-size: var(--dt-fs-md); font-weight: 550; }
.it-finding { padding: 9px 11px; border-radius: var(--dt-r); background: var(--dt-bg-elev); border: 1px solid var(--dt-border); display: flex; flex-direction: column; gap: 4px; font-size: var(--dt-fs-sm); }
.it-finding.t-critical, .it-finding.t-serious { border-left: 3px solid var(--dt-red); }
.it-finding.t-moderate { border-left: 3px solid var(--dt-amber); }
.bm-wrap { display: flex; justify-content: center; padding: 6px 0; font-family: var(--dt-mono); font-size: 10px; }
.bm { position: relative; padding: 18px 26px; border: 1px dashed rgba(127, 127, 127, 0.45); border-radius: 4px; text-align: center; }
.bm-margin { background: rgba(255, 155, 90, 0.14); }
.bm-border { background: rgba(255, 206, 102, 0.2); border-style: solid; border-color: rgba(255, 206, 102, 0.55); }
.bm-padding { background: rgba(92, 206, 148, 0.16); }
.bm-content { padding: 8px 16px; background: rgba(98, 160, 255, 0.22); border: 1px solid rgba(98, 160, 255, 0.5); border-radius: 3px; color: var(--dt-text); font-weight: 600; white-space: nowrap; }
.bm-label { position: absolute; left: 6px; top: 3px; color: var(--dt-text-3); font-family: var(--dt-font); font-size: 9.5px; }
.bm-top { position: absolute; top: 3px; left: 50%; transform: translateX(-50%); }
.bm-bottom { position: absolute; bottom: 3px; left: 50%; transform: translateX(-50%); }
.bm-left { position: absolute; left: 7px; top: 50%; transform: translateY(-50%); }
.bm-right { position: absolute; right: 7px; top: 50%; transform: translateY(-50%); }
.bm-top, .bm-bottom, .bm-left, .bm-right { color: var(--dt-text-2); }
.bm-margin > .bm-label { left: 6px; }
`
  )
};
const tokens = (
  /* css */
  `
:host {
  all: initial;
  display: block;
  position: fixed;
  z-index: 2147483000;
  /* style only: layout containment would make the host the containing block
     for the fixed-position layer, pinning menus, dialogs and the launcher to
     the panel's box instead of the viewport. */
  contain: style;
  color-scheme: dark;

  --dt-font: -apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif;
  --dt-mono: ui-monospace, "SF Mono", SFMono-Regular, "JetBrains Mono", "Cascadia Code", Menlo, Consolas, "Liberation Mono", monospace;
  --dt-fs: 12px;
  --dt-fs-sm: 11px;
  --dt-fs-xs: 10px;
  --dt-fs-md: 13px;
  --dt-fs-lg: 15px;
  --dt-fs-mono: 11.5px;
  --dt-row: 26px;
  --dt-control: 26px;
  --dt-gap: 8px;

  --dt-r-xs: 4px;
  --dt-r-sm: 6px;
  --dt-r: 8px;
  --dt-r-lg: 11px;
  --dt-r-xl: 14px;

  --dt-bg: #0c0e14;
  --dt-bg-elev: #12151d;
  --dt-bg-elev-2: #1a1e29;
  --dt-bg-sunken: #08090e;
  --dt-bg-hover: rgba(255, 255, 255, 0.045);
  --dt-bg-active: rgba(255, 255, 255, 0.085);
  --dt-bg-selected: rgba(139, 123, 255, 0.15);
  --dt-bg-selected-strong: rgba(139, 123, 255, 0.26);
  --dt-border: rgba(255, 255, 255, 0.065);
  --dt-border-strong: rgba(255, 255, 255, 0.115);
  --dt-border-focus: rgba(139, 123, 255, 0.75);

  --dt-text: #e8eaf0;
  --dt-text-2: #a7aec0;
  --dt-text-3: #7d869a;
  --dt-text-4: #525a6c;

  --dt-accent: #8b7bff;
  --dt-accent-2: #38bdf8;
  --dt-accent-text: #b6adff;
  --dt-accent-soft: rgba(139, 123, 255, 0.14);
  --dt-accent-grad: linear-gradient(135deg, #6366f1 0%, #8b7bff 50%, #38bdf8 100%);
  --dt-on-accent: #ffffff;

  --dt-green: #3ddc97;
  --dt-green-soft: rgba(61, 220, 151, 0.13);
  --dt-amber: #f7b955;
  --dt-amber-soft: rgba(247, 185, 85, 0.14);
  --dt-red: #ff6b76;
  --dt-red-soft: rgba(255, 107, 118, 0.14);
  --dt-blue: #62a8ff;
  --dt-blue-soft: rgba(98, 168, 255, 0.14);
  --dt-cyan: #3fd3ea;
  --dt-cyan-soft: rgba(63, 211, 234, 0.13);
  --dt-purple: #bb8fff;
  --dt-purple-soft: rgba(187, 143, 255, 0.14);
  --dt-pink: #ff79c9;
  --dt-pink-soft: rgba(255, 121, 201, 0.13);
  --dt-orange: #ff9458;
  --dt-orange-soft: rgba(255, 148, 88, 0.14);
  --dt-teal: #2ed3b7;
  --dt-teal-soft: rgba(46, 211, 183, 0.13);
  --dt-grey: #8a93a7;
  --dt-grey-soft: rgba(138, 147, 167, 0.14);

  /* one colour per event kind, used identically by every view */
  --dt-k-commit: var(--dt-accent);
  --dt-k-state: var(--dt-purple);
  --dt-k-effect: var(--dt-green);
  --dt-k-network: var(--dt-cyan);
  --dt-k-route: var(--dt-pink);
  --dt-k-emit: var(--dt-amber);
  --dt-k-log: var(--dt-grey);
  --dt-k-error: var(--dt-red);
  --dt-k-interaction: var(--dt-blue);
  --dt-k-longtask: var(--dt-orange);

  --dt-syn-kw: #c792ea;
  --dt-syn-str: #b5e089;
  --dt-syn-num: #f9a66c;
  --dt-syn-state: #82b1ff;
  --dt-syn-comp: #ffd479;
  --dt-syn-fn: #7fd8ff;
  --dt-syn-com: #5f6a83;
  --dt-syn-punc: #8c95aa;
  --dt-syn-op: #89ddff;
  --dt-syn-prop: #e3b3ff;
  --dt-syn-bool: #ff9cac;

  --dt-shadow-lg: 0 32px 80px -16px rgba(0, 0, 0, 0.65), 0 12px 32px -10px rgba(0, 0, 0, 0.45);
  --dt-shadow-md: 0 16px 40px -12px rgba(0, 0, 0, 0.6), 0 4px 12px -4px rgba(0, 0, 0, 0.35);
  --dt-shadow-sm: 0 2px 6px rgba(0, 0, 0, 0.35);
  --dt-inset-hi: inset 0 1px 0 rgba(255, 255, 255, 0.045);

  --dt-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --dt-fast: 110ms;
  --dt-med: 180ms;
}

:host([data-theme="light"]) {
  color-scheme: light;
  --dt-bg: #ffffff;
  --dt-bg-elev: #f7f8fb;
  --dt-bg-elev-2: #eef0f5;
  --dt-bg-sunken: #f2f4f8;
  --dt-bg-hover: rgba(15, 23, 42, 0.045);
  --dt-bg-active: rgba(15, 23, 42, 0.085);
  --dt-bg-selected: rgba(101, 82, 255, 0.11);
  --dt-bg-selected-strong: rgba(101, 82, 255, 0.2);
  --dt-border: rgba(15, 23, 42, 0.08);
  --dt-border-strong: rgba(15, 23, 42, 0.14);
  --dt-border-focus: rgba(101, 82, 255, 0.7);
  --dt-text: #101522;
  --dt-text-2: #475165;
  --dt-text-3: #677084;
  --dt-text-4: #a3aabb;
  --dt-accent: #6552ff;
  --dt-accent-2: #0ea5e9;
  --dt-accent-text: #5341f0;
  --dt-accent-soft: rgba(101, 82, 255, 0.1);
  --dt-green: #0c9467;
  --dt-green-soft: rgba(12, 148, 103, 0.1);
  --dt-amber: #a8660b;
  --dt-amber-soft: rgba(217, 139, 22, 0.13);
  --dt-red: #dc3545;
  --dt-red-soft: rgba(220, 53, 69, 0.1);
  --dt-blue: #2563eb;
  --dt-blue-soft: rgba(37, 99, 235, 0.1);
  --dt-cyan: #0b8ba3;
  --dt-cyan-soft: rgba(11, 139, 163, 0.1);
  --dt-purple: #7c4ddb;
  --dt-purple-soft: rgba(124, 77, 219, 0.1);
  --dt-pink: #c02d86;
  --dt-pink-soft: rgba(192, 45, 134, 0.1);
  --dt-orange: #c2500a;
  --dt-orange-soft: rgba(194, 80, 10, 0.1);
  --dt-teal: #0f8a78;
  --dt-teal-soft: rgba(15, 138, 120, 0.1);
  --dt-grey: #667085;
  --dt-grey-soft: rgba(102, 112, 133, 0.12);
  --dt-syn-kw: #8a3ad6;
  --dt-syn-str: #2f7d1a;
  --dt-syn-num: #b45309;
  --dt-syn-state: #1d5fd8;
  --dt-syn-comp: #9a5b00;
  --dt-syn-fn: #0b7285;
  --dt-syn-com: #8a94a6;
  --dt-syn-punc: #5b667a;
  --dt-syn-op: #0b7ea0;
  --dt-syn-prop: #9b3fb8;
  --dt-syn-bool: #c0264e;
  --dt-shadow-lg: 0 28px 70px -16px rgba(15, 23, 42, 0.28), 0 10px 26px -10px rgba(15, 23, 42, 0.16);
  --dt-shadow-md: 0 14px 36px -12px rgba(15, 23, 42, 0.26), 0 4px 10px -4px rgba(15, 23, 42, 0.1);
  --dt-shadow-sm: 0 1px 4px rgba(15, 23, 42, 0.12);
  --dt-inset-hi: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

:host([data-density="compact"]) {
  --dt-fs: 11.5px;
  --dt-fs-sm: 10.5px;
  --dt-fs-mono: 11px;
  --dt-row: 22px;
  --dt-control: 24px;
  --dt-gap: 6px;
}

:host([data-motion="reduced"]) *,
:host([data-motion="reduced"]) *::before,
:host([data-motion="reduced"]) *::after {
  animation-duration: 1ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 1ms !important;
}
@media (prefers-reduced-motion: reduce) {
  :host(:not([data-motion="full"])) *,
  :host(:not([data-motion="full"])) *::before,
  :host(:not([data-motion="full"])) *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
}
`
);
const base = (
  /* css */
  `
*, *::before, *::after { box-sizing: border-box; }
[hidden] { display: none !important; }
button, input, select, textarea { font: inherit; color: inherit; letter-spacing: inherit; }
button { cursor: pointer; }
button:disabled { cursor: default; }
svg.ic { flex: none; display: block; }
::selection { background: rgba(139, 123, 255, 0.35); }
:host([data-theme="light"]) ::selection { background: rgba(101, 82, 255, 0.22); }

* { scrollbar-width: thin; scrollbar-color: rgba(127, 134, 154, 0.35) transparent; }
::-webkit-scrollbar { width: 10px; height: 10px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb {
  background: rgba(127, 134, 154, 0.28);
  border-radius: 10px;
  border: 3px solid transparent;
  background-clip: content-box;
}
::-webkit-scrollbar-thumb:hover { background-color: rgba(127, 134, 154, 0.5); }
::-webkit-scrollbar-corner { background: transparent; }

.mono { font-family: var(--dt-mono); font-size: var(--dt-fs-mono); }
.num { font-variant-numeric: tabular-nums; }
.t2 { color: var(--dt-text-2); }
.t3 { color: var(--dt-text-3); }
.t4 { color: var(--dt-text-4); }
.grow { flex: 1 1 auto; min-width: 0; }
.nowrap { white-space: nowrap; }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.row-flex { display: flex; align-items: center; gap: var(--dt-gap); min-width: 0; }
.col-flex { display: flex; flex-direction: column; gap: var(--dt-gap); min-width: 0; }
.wrap { flex-wrap: wrap; }
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
}
.tone-green { color: var(--dt-green); }
.tone-amber { color: var(--dt-amber); }
.tone-red { color: var(--dt-red); }
.tone-blue { color: var(--dt-blue); }
.tone-cyan { color: var(--dt-cyan); }
.tone-purple { color: var(--dt-purple); }
.tone-pink { color: var(--dt-pink); }
.tone-orange { color: var(--dt-orange); }
.tone-accent { color: var(--dt-accent-text); }
.tone-grey { color: var(--dt-text-3); }
kbd, .kbd {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 17px; height: 17px; padding: 0 4px;
  border-radius: 4px; border: 1px solid var(--dt-border-strong);
  border-bottom-width: 2px;
  background: var(--dt-bg-elev-2); color: var(--dt-text-2);
  font: 600 10px/1 var(--dt-font);
}
.dt-widget-error {
  padding: 12px; margin: 8px; border-radius: var(--dt-r);
  background: var(--dt-red-soft); color: var(--dt-red); font-size: var(--dt-fs-sm);
}
@keyframes dt-flash-0 { from { background-color: var(--dt-bg-selected-strong); } to { background-color: transparent; } }
@keyframes dt-flash-1 { from { background-color: var(--dt-bg-selected-strong); } to { background-color: transparent; } }
.flash-0 { animation: dt-flash-0 1100ms var(--dt-ease); }
.flash-1 { animation: dt-flash-1 1100ms var(--dt-ease); }
@keyframes dt-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@keyframes dt-spin { to { transform: rotate(360deg); } }
@keyframes dt-in { from { opacity: 0; transform: translateY(4px) scale(0.985); } to { opacity: 1; transform: none; } }
@keyframes dt-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes dt-shimmer { from { background-position: -200px 0; } to { background-position: 200px 0; } }
`
);
const shell = (
  /* css */
  `
.dt {
  position: relative;
  display: flex; flex-direction: column;
  width: 100%; height: 100%;
  background: var(--dt-bg);
  color: var(--dt-text);
  font: 400 var(--dt-fs)/1.45 var(--dt-font);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  overflow: hidden;
  border: 1px solid var(--dt-border-strong);
  box-shadow: var(--dt-shadow-lg);
}
:host([data-dock="float"]) .dt { border-radius: var(--dt-r-xl); animation: dt-in var(--dt-med) var(--dt-ease); }
:host([data-dock="float"]) .dt::before {
  content: ""; position: absolute; inset: 0 0 auto 0; height: 1px; z-index: 3; pointer-events: none;
  background: linear-gradient(90deg, transparent, rgba(139, 123, 255, 0.55) 30%, rgba(56, 189, 248, 0.45) 70%, transparent);
}
:host([data-dock="right"]) .dt { border-width: 0 0 0 1px; }
:host([data-dock="left"]) .dt { border-width: 0 1px 0 0; }
:host([data-dock="bottom"]) .dt { border-width: 1px 0 0 0; }
:host([data-minimized]) .dt { display: none; }

/* ---- titlebar ---- */
.dt-titlebar {
  flex: none;
  display: flex; align-items: center; gap: 6px;
  height: 40px; padding: 0 6px 0 10px;
  border-bottom: 1px solid var(--dt-border);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.022), transparent 80%), var(--dt-bg);
  user-select: none;
}
:host([data-theme="light"]) .dt-titlebar { background: linear-gradient(180deg, #fbfbfd, #ffffff); }
:host([data-dock="float"]) .dt-titlebar { cursor: grab; }
:host([data-dock="float"]) .dt-titlebar.is-dragging { cursor: grabbing; }
.dt-brand { display: flex; align-items: center; gap: 7px; padding-right: 4px; white-space: nowrap; }
.dt-brand-name { font-weight: 650; font-size: var(--dt-fs-md); letter-spacing: -0.01em; }
.dt-brand-name span { font-weight: 450; color: var(--dt-text-2); }
.dt-sep-v { width: 1px; height: 18px; background: var(--dt-border-strong); margin: 0 4px; flex: none; }
.dt-crumb { display: flex; align-items: center; gap: 6px; min-width: 64px; flex: 0 1 auto; overflow: hidden; color: var(--dt-text-2); font-weight: 550; }
.dt-crumb .ic { color: var(--dt-text-3); }
.dt-crumb-title { color: var(--dt-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.dt-crumb > .ic { flex: none; }
.dt-crumb-hint { color: var(--dt-text-3); font-weight: 400; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.dt-appswitch {
  display: inline-flex; align-items: center; gap: 7px;
  height: 26px; max-width: 220px; padding: 0 8px 0 9px;
  border-radius: 7px; border: 1px solid var(--dt-border-strong);
  background: var(--dt-bg-elev); color: var(--dt-text);
  font-weight: 550; font-size: var(--dt-fs-sm);
  transition: border-color var(--dt-fast), background var(--dt-fast);
}
.dt-appswitch:hover { background: var(--dt-bg-elev-2); }
.dt-appswitch .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dt-appswitch .ic { color: var(--dt-text-3); }

.dt-status-dot {
  width: 7px; height: 7px; border-radius: 50%; flex: none;
  background: var(--dt-green); box-shadow: 0 0 0 3px var(--dt-green-soft);
}
.dt-status-dot.t-amber { background: var(--dt-amber); box-shadow: 0 0 0 3px var(--dt-amber-soft); }
.dt-status-dot.t-red { background: var(--dt-red); box-shadow: 0 0 0 3px var(--dt-red-soft); }
.dt-status-dot.t-grey { background: var(--dt-text-4); box-shadow: none; }
.dt-status-dot.is-live { animation: dt-pulse 1.8s ease-in-out infinite; }

.dt-rec {
  display: inline-flex; align-items: center; gap: 6px;
  height: 26px; padding: 0 9px; border-radius: 7px;
  border: 1px solid var(--dt-border-strong); background: var(--dt-bg-elev);
  font-weight: 550; font-size: var(--dt-fs-sm); color: var(--dt-text-2);
}
.dt-rec .rec-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dt-red); box-shadow: 0 0 0 3px var(--dt-red-soft); animation: dt-pulse 1.6s ease-in-out infinite; }
.dt-rec.is-paused .rec-dot { background: var(--dt-text-4); box-shadow: none; animation: none; border-radius: 2px; }
.dt-rec:hover { color: var(--dt-text); background: var(--dt-bg-elev-2); }

.dt-cmdk {
  display: inline-flex; align-items: center; gap: 8px;
  /* Shrinks before the section title does, and never wraps its hint. */
  flex: 0 1 240px; height: 26px; padding: 0 6px 0 8px; min-width: 120px;
  border-radius: 7px; border: 1px solid var(--dt-border-strong);
  background: var(--dt-bg-sunken); color: var(--dt-text-3);
  font-size: var(--dt-fs-sm); white-space: nowrap;
}
.dt-cmdk:hover { color: var(--dt-text-2); border-color: var(--dt-border-focus); }
.dt-cmdk .grow { text-align: left; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.dt-cmdk > .row-flex, .dt-cmdk > svg { flex: none; }

/* ---- body ---- */
.dt-main { flex: 1 1 auto; display: flex; min-height: 0; }
.dt-rail {
  flex: none; width: 46px;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 6px 0;
  border-right: 1px solid var(--dt-border);
  overflow-y: auto; overflow-x: hidden; scrollbar-width: none;
  container-type: size;
  /* Scroll shadows: the covers scroll WITH the content (local), the shadows
     stay put (scroll), so a shadow shows only at an edge with more to see. */
  background:
    linear-gradient(var(--dt-bg) 40%, transparent) center top / 100% 22px no-repeat local,
    linear-gradient(transparent, var(--dt-bg) 60%) center bottom / 100% 22px no-repeat local,
    radial-gradient(farthest-side at 50% 0, rgba(0, 0, 0, 0.28), transparent) center top / 100% 9px no-repeat scroll,
    radial-gradient(farthest-side at 50% 100%, rgba(0, 0, 0, 0.28), transparent) center bottom / 100% 9px no-repeat scroll,
    var(--dt-bg);
}
/* Short panels get a tighter rail before anything has to scroll. */
@container (max-height: 700px) {
  .dt-rail-item { height: 30px; }
  .dt-rail-sep { margin: 3px 0; }
}
.dt-rail::-webkit-scrollbar { display: none; }
.dt-rail.is-wide { width: 176px; align-items: stretch; padding: 6px 6px; }
.dt-rail-sep { width: 20px; height: 1px; background: var(--dt-border-strong); margin: 5px 0; flex: none; }
.dt-rail.is-wide .dt-rail-sep { width: auto; margin: 6px 6px; }
.dt-rail-label { display: none; }
.dt-rail.is-wide .dt-rail-label { display: block; padding: 8px 8px 4px; font-size: var(--dt-fs-xs); font-weight: 650; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dt-text-4); }
.dt-rail-item {
  position: relative; flex: none;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  width: 34px; height: 34px; border-radius: 9px;
  border: 0; background: transparent; color: var(--dt-text-3);
  transition: background var(--dt-fast), color var(--dt-fast);
}
.dt-rail.is-wide .dt-rail-item { width: auto; height: 30px; justify-content: flex-start; padding: 0 9px; }
.dt-rail-item:hover { background: var(--dt-bg-hover); color: var(--dt-text); }
.dt-rail-item:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--dt-border-focus); }
.dt-rail-item.is-active { background: var(--dt-bg-selected); color: var(--dt-accent-text); }
.dt-rail-item.is-active::before {
  content: ""; position: absolute; left: -6px; top: 8px; bottom: 8px; width: 3px; border-radius: 0 3px 3px 0;
  background: var(--dt-accent-grad);
}
.dt-rail.is-wide .dt-rail-item.is-active::before { left: -6px; }
.dt-rail-item .name { display: none; font-weight: 550; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dt-rail.is-wide .dt-rail-item .name { display: block; flex: 1; text-align: left; }
.dt-rail-badge {
  position: absolute; top: 2px; right: 1px;
  min-width: 15px; height: 15px; padding: 0 4px; border-radius: 8px;
  font: 700 9px/15px var(--dt-font); text-align: center;
  background: var(--dt-bg-active); color: var(--dt-text-2);
  box-shadow: 0 0 0 2px var(--dt-bg);
  font-variant-numeric: tabular-nums;
}
.dt-rail.is-wide .dt-rail-badge { position: static; box-shadow: none; }
.dt-rail-badge.t-red { background: var(--dt-red); color: #fff; }
.dt-rail-badge.t-amber { background: var(--dt-amber); color: #1a1205; }
.dt-rail-badge.t-accent { background: var(--dt-accent); color: #fff; }
.dt-rail-dot { position: absolute; top: 6px; right: 6px; width: 6px; height: 6px; border-radius: 50%; background: var(--dt-red); box-shadow: 0 0 0 2px var(--dt-bg); }
.dt-rail-spacer { flex: 1 0 8px; }

.dt-content { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; position: relative; background: var(--dt-bg); }
.dt-view { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; animation: dt-fade var(--dt-med) var(--dt-ease); }
.dt-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; }
.dt-pad { padding: 12px; }

/* ---- status bar ---- */
.dt-statusbar {
  flex: none;
  display: flex; align-items: center; gap: 14px;
  height: 25px; padding: 0 10px;
  border-top: 1px solid var(--dt-border);
  background: var(--dt-bg);
  color: var(--dt-text-3);
  font-size: var(--dt-fs-xs); font-weight: 500;
  white-space: nowrap; overflow: hidden;
}
.dt-sb-item { display: inline-flex; align-items: center; gap: 5px; border: 0; background: none; padding: 0; color: inherit; font: inherit; height: 100%; }
button.dt-sb-item:hover { color: var(--dt-text); }
.dt-sb-item .ic { opacity: 0.85; }
.dt-sb-item b { color: var(--dt-text-2); font-weight: 600; font-variant-numeric: tabular-nums; }
.dt-sb-item.t-red, .dt-sb-item.t-red b { color: var(--dt-red); }
.dt-sb-item.t-amber, .dt-sb-item.t-amber b { color: var(--dt-amber); }
.dt-sb-item.t-green b { color: var(--dt-green); }

/* ---- resizing + docking ---- */
.dt-edge { position: absolute; z-index: 5; }
.dt-edge.n { top: -3px; left: 8px; right: 8px; height: 7px; cursor: ns-resize; }
.dt-edge.s { bottom: -3px; left: 8px; right: 8px; height: 7px; cursor: ns-resize; }
.dt-edge.e { right: -3px; top: 8px; bottom: 8px; width: 7px; cursor: ew-resize; }
.dt-edge.w { left: -3px; top: 8px; bottom: 8px; width: 7px; cursor: ew-resize; }
.dt-edge.ne { top: -3px; right: -3px; width: 12px; height: 12px; cursor: nesw-resize; }
.dt-edge.nw { top: -3px; left: -3px; width: 12px; height: 12px; cursor: nwse-resize; }
.dt-edge.se { bottom: -3px; right: -3px; width: 12px; height: 12px; cursor: nwse-resize; }
.dt-edge.sw { bottom: -3px; left: -3px; width: 12px; height: 12px; cursor: nesw-resize; }
.dt-edge:hover::after, .dt-edge.is-active::after {
  content: ""; position: absolute; inset: 2px; border-radius: 3px; background: var(--dt-accent); opacity: 0.55;
}
.dt-edge.ne:hover::after, .dt-edge.nw:hover::after, .dt-edge.se:hover::after, .dt-edge.sw:hover::after { display: none; }

.dt-snap {
  position: fixed; z-index: 2147482999; pointer-events: none;
  border-radius: 12px; border: 2px solid rgba(139, 123, 255, 0.85);
  background: rgba(139, 123, 255, 0.12);
  box-shadow: 0 0 0 9999px rgba(8, 9, 14, 0.18);
  transition: all var(--dt-med) var(--dt-ease);
}

/* ---- launcher ---- */
.dt-launcher {
  position: fixed; z-index: 2147483000;
  display: inline-flex; align-items: center; gap: 8px;
  height: 38px; padding: 0 14px 0 10px; border-radius: 19px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(14, 16, 24, 0.82);
  -webkit-backdrop-filter: blur(14px) saturate(1.5);
  backdrop-filter: blur(14px) saturate(1.5);
  color: #e8eaf0;
  box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.08);
  font: 600 12px/1 var(--dt-font);
  cursor: pointer; user-select: none;
  transition: transform var(--dt-med) var(--dt-ease), box-shadow var(--dt-med) var(--dt-ease), background var(--dt-fast);
  animation: dt-in var(--dt-med) var(--dt-ease);
}
.dt-launcher:hover { transform: translateY(-1px); background: rgba(20, 22, 32, 0.92); box-shadow: 0 16px 40px -10px rgba(0, 0, 0, 0.55), 0 0 0 4px rgba(139, 123, 255, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.08); }
.dt-launcher:focus-visible { outline: none; box-shadow: 0 0 0 3px rgba(139, 123, 255, 0.7); }
.dt-launcher.is-dragging { cursor: grabbing; transform: scale(1.03); }
.dt-launcher .count { display: inline-flex; align-items: center; gap: 4px; font-variant-numeric: tabular-nums; }
.dt-launcher .count.t-red { color: #ff8f98; }
.dt-launcher .count.t-amber { color: #ffd08a; }
.dt-launcher .hint { color: rgba(232, 234, 240, 0.5); font-weight: 500; }
`
);
const controls = (
  /* css */
  `
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: var(--dt-control); padding: 0 10px;
  border-radius: var(--dt-r-sm);
  border: 1px solid var(--dt-border-strong);
  background: var(--dt-bg-elev);
  color: var(--dt-text);
  font-weight: 550; font-size: var(--dt-fs-sm);
  white-space: nowrap;
  box-shadow: var(--dt-inset-hi);
  transition: background var(--dt-fast), border-color var(--dt-fast), color var(--dt-fast), box-shadow var(--dt-fast), transform var(--dt-fast);
}
.btn:hover:not(:disabled) { background: var(--dt-bg-elev-2); border-color: var(--dt-border-strong); }
.btn:active:not(:disabled) { transform: translateY(0.5px); }
.btn:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--dt-border-focus); }
.btn:disabled { opacity: 0.45; }
.btn .ic { color: var(--dt-text-2); }
.btn.is-primary {
  background: linear-gradient(180deg, #9384ff, #7663ff); border-color: rgba(255, 255, 255, 0.14); color: #fff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 6px 16px -6px rgba(118, 99, 255, 0.7);
}
.btn.is-primary .ic { color: #fff; }
.btn.is-primary:hover:not(:disabled) { background: linear-gradient(180deg, #9d90ff, #7f6dff); }
:host([data-theme="light"]) .btn.is-primary { background: linear-gradient(180deg, #7565ff, #5c48f5); }
.btn.is-ghost { background: transparent; border-color: transparent; box-shadow: none; color: var(--dt-text-2); }
.btn.is-ghost:hover:not(:disabled) { background: var(--dt-bg-hover); color: var(--dt-text); }
.btn.is-danger { color: var(--dt-red); }
.btn.is-danger .ic { color: var(--dt-red); }
.btn.is-danger:hover:not(:disabled) { background: var(--dt-red-soft); border-color: transparent; }
.btn.is-success { color: var(--dt-green); }
.btn.is-on { background: var(--dt-accent-soft); border-color: rgba(139, 123, 255, 0.45); color: var(--dt-accent-text); }
.btn.is-on .ic { color: var(--dt-accent-text); }
.btn.is-sm { height: 22px; padding: 0 8px; font-size: var(--dt-fs-xs); border-radius: 5px; gap: 5px; }
.btn.is-lg { height: 32px; padding: 0 14px; font-size: var(--dt-fs); border-radius: var(--dt-r); }
.btn .kbd { margin-left: 2px; }

.ibtn {
  position: relative;
  display: inline-flex; align-items: center; justify-content: center; flex: none;
  width: var(--dt-control); height: var(--dt-control);
  border-radius: var(--dt-r-sm); border: 1px solid transparent;
  background: transparent; color: var(--dt-text-3);
  transition: background var(--dt-fast), color var(--dt-fast);
}
.ibtn:hover:not(:disabled) { background: var(--dt-bg-hover); color: var(--dt-text); }
.ibtn:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--dt-border-focus); }
.ibtn:disabled { opacity: 0.4; }
.ibtn.is-on { color: var(--dt-accent-text); background: var(--dt-accent-soft); }
.ibtn.is-danger:hover { color: var(--dt-red); background: var(--dt-red-soft); }
.ibtn.is-sm { width: 20px; height: 20px; border-radius: 5px; }
.ibtn.is-lg { width: 30px; height: 30px; }
.ibtn .dot { position: absolute; top: 3px; right: 3px; width: 6px; height: 6px; border-radius: 50%; background: var(--dt-red); }

.seg {
  display: inline-flex; align-items: center; gap: 2px; flex: none;
  padding: 2px; border-radius: 8px;
  background: var(--dt-bg-sunken); border: 1px solid var(--dt-border);
}
.seg button {
  display: inline-flex; align-items: center; gap: 6px;
  height: calc(var(--dt-control) - 4px); padding: 0 10px;
  border: 0; border-radius: 6px; background: transparent;
  color: var(--dt-text-3); font-weight: 550; font-size: var(--dt-fs-sm);
  white-space: nowrap;
  transition: background var(--dt-fast), color var(--dt-fast), box-shadow var(--dt-fast);
}
.seg button:hover { color: var(--dt-text); }
.seg button:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--dt-border-focus); }
.seg button.is-on { background: var(--dt-bg-elev-2); color: var(--dt-text); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3), 0 0 0 1px var(--dt-border-strong); }
:host([data-theme="light"]) .seg button.is-on { background: #fff; box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12), 0 0 0 1px var(--dt-border-strong); }
.seg .seg-count { font-size: var(--dt-fs-xs); color: var(--dt-text-3); font-variant-numeric: tabular-nums; }
.seg button.is-on .seg-count { color: var(--dt-accent-text); }

.tabs { display: flex; align-items: stretch; gap: 2px; border-bottom: 1px solid var(--dt-border); padding: 0 8px; flex: none; overflow-x: auto; scrollbar-width: none; }
.tabs::-webkit-scrollbar { display: none; }
.tabs button {
  position: relative; flex: none;
  display: inline-flex; align-items: center; gap: 6px;
  height: 34px; padding: 0 10px; border: 0; background: none;
  color: var(--dt-text-3); font-weight: 550; font-size: var(--dt-fs-sm); white-space: nowrap;
}
.tabs button:hover { color: var(--dt-text); }
.tabs button:focus-visible { outline: none; box-shadow: inset 0 0 0 2px var(--dt-border-focus); border-radius: 6px; }
.tabs button.is-on { color: var(--dt-text); }
.tabs button.is-on::after {
  content: ""; position: absolute; left: 8px; right: 8px; bottom: -1px; height: 2px; border-radius: 2px;
  background: var(--dt-accent-grad);
}
.tabs .tab-count { font-size: var(--dt-fs-xs); color: var(--dt-text-3); padding: 0 5px; border-radius: 8px; background: var(--dt-bg-active); font-variant-numeric: tabular-nums; }
.tabs .tab-count.t-red { background: var(--dt-red-soft); color: var(--dt-red); }
.tabs .tab-count.t-amber { background: var(--dt-amber-soft); color: var(--dt-amber); }

.input, .select, .textarea {
  height: var(--dt-control); padding: 0 8px;
  border-radius: var(--dt-r-sm); border: 1px solid var(--dt-border-strong);
  background: var(--dt-bg-sunken); color: var(--dt-text);
  font-size: var(--dt-fs-sm);
  transition: border-color var(--dt-fast), box-shadow var(--dt-fast);
  min-width: 0;
}
.input::placeholder, .textarea::placeholder { color: var(--dt-text-4); }
.input:focus, .select:focus, .textarea:focus { outline: none; border-color: var(--dt-border-focus); box-shadow: 0 0 0 3px var(--dt-accent-soft); }
.input.is-mono, .textarea.is-mono { font-family: var(--dt-mono); font-size: var(--dt-fs-mono); }
.input.is-invalid { border-color: var(--dt-red); box-shadow: 0 0 0 3px var(--dt-red-soft); }
.textarea { height: auto; padding: 7px 8px; line-height: 1.5; resize: vertical; }
.select { padding-right: 24px; appearance: none; -webkit-appearance: none; cursor: pointer;
  background-image: linear-gradient(45deg, transparent 50%, var(--dt-text-3) 50%), linear-gradient(135deg, var(--dt-text-3) 50%, transparent 50%);
  background-position: calc(100% - 13px) 50%, calc(100% - 9px) 50%;
  background-size: 4px 4px, 4px 4px; background-repeat: no-repeat; }

.search { position: relative; display: flex; align-items: center; min-width: 120px; flex: 0 1 240px; }
.search .ic { position: absolute; left: 8px; color: var(--dt-text-3); pointer-events: none; }
.search .input { width: 100%; padding-left: 27px; padding-right: 26px; }
.search .search-meta { position: absolute; right: 26px; font-size: var(--dt-fs-xs); color: var(--dt-text-3); pointer-events: none; font-variant-numeric: tabular-nums; }
.search .search-clear { position: absolute; right: 3px; }

.switch { display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; }
.switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.switch .track {
  position: relative; flex: none; width: 28px; height: 16px; border-radius: 8px;
  background: var(--dt-bg-active); border: 1px solid var(--dt-border-strong);
  transition: background var(--dt-fast), border-color var(--dt-fast);
}
.switch .track::after {
  content: ""; position: absolute; top: 1px; left: 1px; width: 12px; height: 12px; border-radius: 50%;
  background: var(--dt-text-2); box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  transition: transform var(--dt-med) var(--dt-ease), background var(--dt-fast);
}
.switch input:checked + .track { background: var(--dt-accent); border-color: transparent; }
.switch input:checked + .track::after { transform: translateX(12px); background: #fff; }
.switch input:focus-visible + .track { box-shadow: 0 0 0 2px var(--dt-border-focus); }
.switch .switch-label { font-weight: 500; }

.check { display: inline-flex; align-items: center; gap: 7px; cursor: pointer; user-select: none; }
.check input { accent-color: var(--dt-accent); width: 13px; height: 13px; margin: 0; }

.chip {
  display: inline-flex; align-items: center; gap: 4px; flex: none;
  height: 18px; padding: 0 6px; border-radius: 5px;
  font: 600 10px/1 var(--dt-font); letter-spacing: 0.01em;
  background: var(--dt-grey-soft); color: var(--dt-text-2);
  white-space: nowrap; max-width: 100%;
}
.chip.is-mono { font-family: var(--dt-mono); font-weight: 500; font-size: 10.5px; }
.chip .ic { width: 11px; height: 11px; }
.chip.t-green { background: var(--dt-green-soft); color: var(--dt-green); }
.chip.t-amber { background: var(--dt-amber-soft); color: var(--dt-amber); }
.chip.t-red { background: var(--dt-red-soft); color: var(--dt-red); }
.chip.t-blue { background: var(--dt-blue-soft); color: var(--dt-blue); }
.chip.t-cyan { background: var(--dt-cyan-soft); color: var(--dt-cyan); }
.chip.t-purple { background: var(--dt-purple-soft); color: var(--dt-purple); }
.chip.t-pink { background: var(--dt-pink-soft); color: var(--dt-pink); }
.chip.t-orange { background: var(--dt-orange-soft); color: var(--dt-orange); }
.chip.t-teal { background: var(--dt-teal-soft); color: var(--dt-teal); }
.chip.t-accent { background: var(--dt-accent-soft); color: var(--dt-accent-text); }
.chip.is-outline { background: transparent; box-shadow: inset 0 0 0 1px var(--dt-border-strong); color: var(--dt-text-2); }
button.chip { border: 0; cursor: pointer; }
button.chip:hover { filter: brightness(1.15); }

.fchip {
  display: inline-flex; align-items: center; gap: 5px; flex: none;
  height: 22px; padding: 0 8px; border-radius: 11px;
  border: 1px solid var(--dt-border-strong); background: transparent;
  color: var(--dt-text-3); font-weight: 550; font-size: var(--dt-fs-xs);
  transition: all var(--dt-fast);
}
.fchip:hover { color: var(--dt-text); border-color: var(--dt-text-4); }
.fchip.is-on { color: var(--dt-text); background: var(--dt-bg-active); border-color: transparent; }
.fchip .swatch { width: 7px; height: 7px; border-radius: 2px; }
.fchip .fcount { color: var(--dt-text-3); font-variant-numeric: tabular-nums; }
.fchip:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--dt-border-focus); }

.badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 16px; height: 16px; padding: 0 5px; border-radius: 8px;
  font: 700 9.5px/1 var(--dt-font); font-variant-numeric: tabular-nums;
  background: var(--dt-bg-active); color: var(--dt-text-2);
}
.badge.t-red { background: var(--dt-red); color: #fff; }
.badge.t-amber { background: var(--dt-amber); color: #1b1305; }
.badge.t-accent { background: var(--dt-accent); color: #fff; }
.badge.t-green { background: var(--dt-green-soft); color: var(--dt-green); }

.swatch-sq { width: 12px; height: 12px; border-radius: 3px; flex: none; box-shadow: inset 0 0 0 1px rgba(127, 127, 127, 0.35); }
.spinner { width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--dt-border-strong); border-top-color: var(--dt-accent); animation: dt-spin 0.8s linear infinite; flex: none; }
`
);
const layout = (
  /* css */
  `
.viewbar {
  flex: none;
  display: flex; align-items: center; gap: 6px; row-gap: 6px;
  flex-wrap: wrap;
  min-height: 40px; padding: 6px 10px;
  border-bottom: 1px solid var(--dt-border);
}
/* Wrap rather than clip: a narrow docked panel keeps every control reachable. */
.viewbar > * { flex-shrink: 0; }
.viewbar > .search, .viewbar > .input { flex-shrink: 1; min-width: 120px; }
.viewbar.is-sub { min-height: 34px; padding: 4px 10px; background: var(--dt-bg-elev); }
.viewbar .vb-title { font-weight: 650; font-size: var(--dt-fs-md); white-space: nowrap; }
.vb-sep { width: 1px; align-self: stretch; margin: 4px 2px; background: var(--dt-border-strong); flex: none; }

.split { flex: 1 1 auto; min-height: 0; min-width: 0; display: flex; position: relative; }
.split.is-col { flex-direction: column; }
.split > .pane { min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; position: relative; }
.split > .pane.is-first { flex: none; }
.split > .pane.is-second { flex: 1 1 auto; }
.gutter { flex: none; position: relative; z-index: 2; background: var(--dt-border); }
.split:not(.is-col) > .gutter { width: 1px; cursor: col-resize; }
.split.is-col > .gutter { height: 1px; cursor: row-resize; }
.gutter::after { content: ""; position: absolute; inset: -4px; }
.split:not(.is-col) > .gutter::after { inset: 0 -4px; }
.split.is-col > .gutter::after { inset: -4px 0; }
.gutter:hover, .gutter.is-active { background: var(--dt-accent); }

.card {
  background: var(--dt-bg-elev);
  border: 1px solid var(--dt-border);
  border-radius: var(--dt-r-lg);
  box-shadow: var(--dt-inset-hi);
  min-width: 0;
}
.card.is-pad { padding: 12px; }
.card-head { display: flex; align-items: center; gap: 8px; min-height: 38px; padding: 8px 12px; border-bottom: 1px solid var(--dt-border); }
.card-head.is-bare { border-bottom: 0; padding-bottom: 0; }
.card-title { font-weight: 650; font-size: var(--dt-fs); display: flex; align-items: center; gap: 7px; white-space: nowrap; }
.card-title .ic { color: var(--dt-text-3); }
.card-sub { color: var(--dt-text-3); font-size: var(--dt-fs-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-body { padding: 12px; min-width: 0; }
.card-body.is-flush { padding: 0; }

.section { padding: 12px 12px 4px; }
.section + .section { border-top: 1px solid var(--dt-border); }
.section-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; min-height: 22px; }
.section-title { font-size: var(--dt-fs-xs); font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--dt-text-3); white-space: nowrap; display: flex; align-items: center; gap: 6px; }

.grid-cards { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
.grid-stats { display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); }

.stat {
  position: relative; overflow: hidden;
  display: flex; flex-direction: column; gap: 3px;
  padding: 10px 11px 9px; border-radius: var(--dt-r);
  background: var(--dt-bg-elev); border: 1px solid var(--dt-border);
  box-shadow: var(--dt-inset-hi);
  min-width: 0; text-align: left; color: inherit;
}
button.stat { cursor: pointer; transition: border-color var(--dt-fast), background var(--dt-fast); }
button.stat:hover { border-color: var(--dt-border-strong); background: var(--dt-bg-elev-2); }
.stat-label { font-size: var(--dt-fs-xs); font-weight: 650; letter-spacing: 0.05em; text-transform: uppercase; color: var(--dt-text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 5px; }
.stat-value { font-size: 18px; font-weight: 650; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; white-space: nowrap; line-height: 1.2; }
.stat-value small { font-size: 11px; font-weight: 550; color: var(--dt-text-3); margin-left: 2px; letter-spacing: 0; }
.stat-foot { font-size: var(--dt-fs-xs); color: var(--dt-text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stat-main { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; min-width: 0; }
.stat .spark { flex: none; opacity: 0.9; line-height: 0; margin-bottom: 3px; }
.stat.t-green .stat-value { color: var(--dt-green); }
.stat.t-amber .stat-value { color: var(--dt-amber); }
.stat.t-red .stat-value { color: var(--dt-red); }
.stat.t-accent .stat-value { color: var(--dt-accent-text); }

.empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;
  gap: 8px; padding: 36px 20px; color: var(--dt-text-3); flex: 1 1 auto; min-height: 160px;
}
.empty-art {
  width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center;
  background: var(--dt-bg-elev); border: 1px solid var(--dt-border-strong); color: var(--dt-text-3);
  box-shadow: var(--dt-inset-hi), 0 8px 24px -12px rgba(0, 0, 0, 0.5); margin-bottom: 4px;
}
.empty-title { color: var(--dt-text); font-weight: 650; font-size: var(--dt-fs-md); }
.empty-body { max-width: 380px; line-height: 1.55; }
.empty-actions { display: flex; gap: 8px; margin-top: 6px; flex-wrap: wrap; justify-content: center; }

.kv { display: grid; grid-template-columns: minmax(90px, max-content) 1fr; gap: 5px 14px; font-size: var(--dt-fs-sm); align-items: baseline; }
.kv > dt { color: var(--dt-text-3); white-space: nowrap; margin: 0; }
.kv > dd { margin: 0; min-width: 0; overflow-wrap: anywhere; color: var(--dt-text); }

.note {
  display: flex; gap: 9px; align-items: flex-start;
  padding: 9px 11px; border-radius: var(--dt-r);
  background: var(--dt-bg-elev); border: 1px solid var(--dt-border);
  color: var(--dt-text-2); font-size: var(--dt-fs-sm); line-height: 1.5;
}
.note .ic { margin-top: 1px; color: var(--dt-text-3); }
.note.t-info { background: var(--dt-blue-soft); border-color: transparent; }
.note.t-info .ic { color: var(--dt-blue); }
.note.t-warn { background: var(--dt-amber-soft); border-color: transparent; }
.note.t-warn .ic { color: var(--dt-amber); }
.note.t-error { background: var(--dt-red-soft); border-color: transparent; }
.note.t-error .ic { color: var(--dt-red); }
.note.t-good { background: var(--dt-green-soft); border-color: transparent; }
.note.t-good .ic { color: var(--dt-green); }
.note.t-accent { background: var(--dt-accent-soft); border-color: transparent; }
.note.t-accent .ic { color: var(--dt-accent-text); }
.note b { color: var(--dt-text); font-weight: 650; }

.meter { position: relative; height: 6px; border-radius: 3px; background: var(--dt-bg-active); overflow: hidden; flex: 1 1 auto; min-width: 30px; }
.meter > span { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; background: var(--dt-accent-grad); transition: width var(--dt-med) var(--dt-ease); }
.meter.t-green > span { background: var(--dt-green); }
.meter.t-amber > span { background: var(--dt-amber); }
.meter.t-red > span { background: var(--dt-red); }
.meter.t-cyan > span { background: var(--dt-cyan); }

.barlist { display: flex; flex-direction: column; gap: 6px; }
.barlist-row { display: grid; grid-template-columns: minmax(80px, 38%) 1fr 64px; align-items: center; gap: 10px; font-size: var(--dt-fs-sm); padding: 2px 4px; border-radius: 5px; border: 0; background: none; color: inherit; text-align: left; }
button.barlist-row:hover { background: var(--dt-bg-hover); }
.barlist-row .lbl { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.barlist-row .val { text-align: right; color: var(--dt-text-3); font-variant-numeric: tabular-nums; }

.pad-sm { padding: 8px; }
.gap-lg { gap: 14px; }
.mt { margin-top: 10px; }
.hint { color: var(--dt-text-3); font-size: var(--dt-fs-sm); line-height: 1.5; }
.hint code, .note code, .empty-body code { font-family: var(--dt-mono); font-size: 0.95em; padding: 1px 4px; border-radius: 4px; background: var(--dt-bg-active); color: var(--dt-text); }
.link { color: var(--dt-accent-text); background: none; border: 0; padding: 0; font: inherit; cursor: pointer; text-decoration: none; }
.link:hover { text-decoration: underline; }
`
);
const lists = (
  /* css */
  `
.vlist { position: relative; flex: 1 1 auto; min-height: 0; overflow: auto; outline: none; overscroll-behavior: contain; }
.vlist:focus-visible { box-shadow: inset 0 0 0 1px var(--dt-border-focus); }
.vlist-sizer { position: relative; width: 100%; }
.vlist-window { position: absolute; left: 0; right: 0; top: 0; will-change: transform; }

.row {
  display: flex; align-items: center; gap: 6px;
  height: var(--dt-row); padding: 0 10px 0 8px; margin: 0 4px;
  border-radius: 6px; color: var(--dt-text-2);
  white-space: nowrap; cursor: default; user-select: none;
  position: relative;
}
.row:hover { background: var(--dt-bg-hover); }
.row.is-selected { background: var(--dt-bg-selected); color: var(--dt-text); }
.vlist:focus .row.is-selected { background: var(--dt-bg-selected-strong); }
.row.is-dim { opacity: 0.55; }
.row .twist {
  flex: none; width: 16px; height: 16px; display: grid; place-items: center;
  color: var(--dt-text-4); border: 0; background: none; padding: 0; border-radius: 4px;
  transition: transform var(--dt-fast) var(--dt-ease), color var(--dt-fast);
}
.row .twist:hover { color: var(--dt-text); background: var(--dt-bg-active); }
.row .twist.is-open { transform: rotate(90deg); }
.row .twist.is-leaf { visibility: hidden; }
.row .guide { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--dt-border); }
.row .meta { margin-left: auto; display: flex; align-items: center; gap: 8px; color: var(--dt-text-3); font-size: var(--dt-fs-xs); font-variant-numeric: tabular-nums; flex: none; }

.table { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; min-width: 0; }
.thead {
  flex: none; display: flex; align-items: center;
  height: 28px; padding: 0 4px 0 12px; gap: 0;
  border-bottom: 1px solid var(--dt-border);
  background: var(--dt-bg-elev);
  color: var(--dt-text-3); font-size: var(--dt-fs-xs); font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase;
  user-select: none;
}
.th { display: flex; align-items: center; gap: 4px; padding: 0 8px 0 0; white-space: nowrap; overflow: hidden; border: 0; background: none; color: inherit; font: inherit; letter-spacing: inherit; text-transform: inherit; height: 100%; }
button.th:hover { color: var(--dt-text); }
.th.is-num, .td.is-num { justify-content: flex-end; text-align: right; }
.th .ic { width: 10px; height: 10px; }
.trow {
  display: flex; align-items: center;
  height: var(--dt-row); padding: 0 4px 0 12px;
  border-bottom: 1px solid transparent;
  color: var(--dt-text-2); cursor: default; user-select: none;
}
.trow:nth-child(even) { background: rgba(127, 127, 127, 0.028); }
.trow:hover { background: var(--dt-bg-hover); }
.trow.is-selected { background: var(--dt-bg-selected); color: var(--dt-text); }
.vlist:focus .trow.is-selected { background: var(--dt-bg-selected-strong); }
.trow.is-error { color: var(--dt-red); }
.trow.is-warn { color: var(--dt-amber); }
.td { display: flex; align-items: center; gap: 6px; padding: 0 8px 0 0; white-space: nowrap; overflow: hidden; min-width: 0; }
.td > .ellipsis { flex: 1 1 auto; }
`
);
const values = (
  /* css */
  `
.v { font-family: var(--dt-mono); font-size: var(--dt-fs-mono); white-space: pre; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.v.t-string { color: var(--dt-syn-str); }
.v.t-number, .v.t-bigint { color: var(--dt-syn-num); }
.v.t-boolean { color: var(--dt-syn-bool); }
.v.t-null, .v.t-undefined { color: var(--dt-text-3); font-style: italic; }
.v.t-function { color: var(--dt-syn-fn); font-style: italic; }
.v.t-object, .v.t-array, .v.t-map, .v.t-set { color: var(--dt-text-2); }
.v.t-date, .v.t-regexp { color: var(--dt-syn-kw); }
.v.t-error { color: var(--dt-red); }
.v.t-node { color: var(--dt-syn-comp); }
.v.t-store, .v.t-resource, .v.t-socket { color: var(--dt-syn-state); }
.vk { font-family: var(--dt-mono); font-size: var(--dt-fs-mono); color: var(--dt-syn-prop); white-space: nowrap; flex: none; }
.vk.is-index { color: var(--dt-text-3); }
.vsep { color: var(--dt-text-4); font-family: var(--dt-mono); flex: none; }
.v.is-editable { cursor: text; border-radius: 4px; padding: 0 3px; margin: 0 -3px; }
.v.is-editable:hover { background: var(--dt-bg-active); box-shadow: inset 0 0 0 1px var(--dt-border-strong); }
.v-edit {
  height: 20px; flex: 1 1 auto; min-width: 60px; padding: 0 5px;
  border-radius: 4px; border: 1px solid var(--dt-border-focus);
  background: var(--dt-bg-sunken); color: var(--dt-text);
  font-family: var(--dt-mono); font-size: var(--dt-fs-mono);
  box-shadow: 0 0 0 3px var(--dt-accent-soft);
}
.v-edit:focus { outline: none; }
.v-edit.is-invalid { border-color: var(--dt-red); box-shadow: 0 0 0 3px var(--dt-red-soft); }
.v-tag { font-size: 9.5px; font-weight: 650; padding: 1px 5px; border-radius: 4px; background: var(--dt-bg-active); color: var(--dt-text-3); flex: none; letter-spacing: 0.02em; }
.v-tag.t-accent { background: var(--dt-accent-soft); color: var(--dt-accent-text); }
.v-tag.t-amber { background: var(--dt-amber-soft); color: var(--dt-amber); }
.v-tag.t-purple { background: var(--dt-purple-soft); color: var(--dt-purple); }
.v-tag.t-cyan { background: var(--dt-cyan-soft); color: var(--dt-cyan); }
.v-tag.t-green { background: var(--dt-green-soft); color: var(--dt-green); }
.v-tag.t-red { background: var(--dt-red-soft); color: var(--dt-red); }
.v-actions { display: none; align-items: center; gap: 2px; margin-left: 4px; }
.row:hover .v-actions, .row.is-selected .v-actions { display: inline-flex; }

.code {
  font-family: var(--dt-mono); font-size: var(--dt-fs-mono); line-height: 19px;
  background: var(--dt-bg-sunken); color: var(--dt-text);
  tab-size: 2; -moz-tab-size: 2;
}
.code-line { display: flex; height: 19px; white-space: pre; }
.code-line:hover { background: rgba(127, 127, 127, 0.05); }
.code-line.is-focus { background: var(--dt-accent-soft); }
.code-line.is-hit { background: rgba(247, 185, 85, 0.08); }
.code-line.is-error { background: var(--dt-red-soft); }
.code-line.is-warn { background: var(--dt-amber-soft); }
.code-gutter {
  flex: none; width: 48px; padding-right: 12px; text-align: right;
  color: var(--dt-text-4); user-select: none; position: sticky; left: 0; z-index: 1;
  background: var(--dt-bg-sunken); font-variant-numeric: tabular-nums;
}
.code-line.is-focus .code-gutter { background: color-mix(in srgb, var(--dt-accent) 14%, var(--dt-bg-sunken)); }
.code-line.is-error .code-gutter { background: color-mix(in srgb, var(--dt-red) 14%, var(--dt-bg-sunken)); }
.code-line.is-warn .code-gutter { background: color-mix(in srgb, var(--dt-amber) 14%, var(--dt-bg-sunken)); }
/* Long lines scroll horizontally: the window is as wide as the longest line
   (measured in ch by the code view) instead of pinned to the viewport. */
.code-scroll { flex: 1 1 auto; min-height: 0; min-width: 0; display: flex; flex-direction: column; }
.code-scroll > .vlist > .vlist-sizer > .vlist-window { right: auto; min-width: 100%; width: calc(var(--code-cols, 0) * 1ch + 120px); }
.code-line.is-focus .code-gutter { color: var(--dt-accent-text); }
.code-gutter .mark { position: absolute; left: 6px; top: 6px; width: 7px; height: 7px; border-radius: 50%; }
.code-gutter .mark.t-error { background: var(--dt-red); }
.code-gutter .mark.t-warn { background: var(--dt-amber); }
.code-text { flex: 1 1 auto; padding-right: 16px; min-width: 0; }
.code-text mark { background: rgba(247, 185, 85, 0.35); color: inherit; border-radius: 2px; }
.code-diag { margin-left: 18px; font-family: var(--dt-font); font-size: var(--dt-fs-xs); padding: 0 6px; border-radius: 4px; }
.code-diag.t-error { color: var(--dt-red); background: var(--dt-red-soft); }
.code-diag.t-warn { color: var(--dt-amber); background: var(--dt-amber-soft); }
.tok-kw { color: var(--dt-syn-kw); }
.tok-str { color: var(--dt-syn-str); }
.tok-num { color: var(--dt-syn-num); }
.tok-state { color: var(--dt-syn-state); }
.tok-comp { color: var(--dt-syn-comp); }
.tok-fn { color: var(--dt-syn-fn); }
.tok-com { color: var(--dt-syn-com); font-style: italic; }
.tok-punc { color: var(--dt-syn-punc); }
.tok-op { color: var(--dt-syn-op); }
.tok-prop { color: var(--dt-syn-prop); }
.tok-bool { color: var(--dt-syn-bool); }
.tok-tpl { color: var(--dt-syn-str); }
.pre {
  margin: 0; padding: 10px 12px; overflow: auto;
  font-family: var(--dt-mono); font-size: var(--dt-fs-mono); line-height: 1.55;
  white-space: pre; color: var(--dt-text);
  background: var(--dt-bg-sunken); border-radius: var(--dt-r); border: 1px solid var(--dt-border);
  tab-size: 2;
}
.pre.is-wrap { white-space: pre-wrap; overflow-wrap: anywhere; }
`
);
const layers = (
  /* css */
  `
.dt-layer {
  position: fixed; inset: 0; pointer-events: none; z-index: 2147483001;
  /* The layer is a sibling of the frame, so it does not inherit the frame's
     type — without this the palette, menus and dialogs fall back to the
     browser's default serif. */
  color: var(--dt-text);
  font: 400 var(--dt-fs)/1.45 var(--dt-font);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
.dt-layer > * { pointer-events: auto; }

.tooltip {
  position: fixed; z-index: 10; pointer-events: none;
  max-width: 320px; padding: 6px 9px; border-radius: 7px;
  background: #1c2030; color: #eef0f6; border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: var(--dt-shadow-md);
  font: 500 11px/1.45 var(--dt-font);
  animation: dt-in 120ms var(--dt-ease);
}
:host([data-theme="light"]) .tooltip { background: #1f2433; }
.tooltip .kbd { background: rgba(255, 255, 255, 0.1); border-color: rgba(255, 255, 255, 0.18); color: #dfe3ee; margin-left: 6px; }
.tooltip .tip-sub { display: block; color: #a4abbd; font-weight: 400; margin-top: 2px; }

.menu {
  position: fixed; z-index: 20; min-width: 180px; max-width: 320px; max-height: 70vh; overflow-y: auto;
  padding: 5px; border-radius: 10px;
  background: var(--dt-bg-elev); border: 1px solid var(--dt-border-strong);
  box-shadow: var(--dt-shadow-md);
  animation: dt-in 130ms var(--dt-ease);
}
.menu-item {
  display: flex; align-items: center; gap: 9px; width: 100%;
  height: 28px; padding: 0 9px; border-radius: 6px; border: 0; background: none;
  color: var(--dt-text); font-size: var(--dt-fs-sm); text-align: left; white-space: nowrap;
}
.menu-item .ic { color: var(--dt-text-3); }
.menu-item:hover, .menu-item.is-active, .menu-item:focus-visible { background: var(--dt-bg-selected); outline: none; }
.menu-item.is-danger { color: var(--dt-red); }
.menu-item.is-danger .ic { color: var(--dt-red); }
.menu-item .menu-kbd { margin-left: auto; color: var(--dt-text-3); font-size: var(--dt-fs-xs); }
.menu-item.is-checked::after { content: ""; margin-left: auto; width: 6px; height: 6px; border-radius: 50%; background: var(--dt-accent); }
.menu-item:disabled { opacity: 0.45; }
.menu-sep { height: 1px; margin: 4px 2px; background: var(--dt-border); }
.menu-label { padding: 6px 9px 3px; font-size: var(--dt-fs-xs); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dt-text-4); }

.scrim {
  position: fixed; inset: 0; z-index: 30;
  background: rgba(6, 7, 12, 0.46);
  -webkit-backdrop-filter: blur(2px); backdrop-filter: blur(2px);
  animation: dt-fade 140ms var(--dt-ease);
  display: flex; align-items: flex-start; justify-content: center;
}
:host([data-theme="light"]) .scrim { background: rgba(15, 23, 42, 0.18); }
.palette {
  margin-top: min(12vh, 90px); width: min(600px, calc(100vw - 32px));
  display: flex; flex-direction: column; max-height: min(520px, 76vh);
  border-radius: 14px; overflow: hidden;
  background: var(--dt-bg-elev); border: 1px solid var(--dt-border-strong);
  box-shadow: 0 40px 100px -20px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(139, 123, 255, 0.1);
  animation: dt-in 160ms var(--dt-ease);
}
.palette-input { display: flex; align-items: center; gap: 10px; height: 50px; padding: 0 14px; border-bottom: 1px solid var(--dt-border); }
.palette-input .ic { color: var(--dt-accent-text); }
.palette-input input { flex: 1; height: 100%; border: 0; background: none; outline: none; font-size: 14px; color: var(--dt-text); }
.palette-input input::placeholder { color: var(--dt-text-4); }
.palette-list { display: flex; flex-direction: column; overflow: hidden; padding: 6px; flex: 1 1 auto; min-height: 0; }
.palette-group { padding: 8px 10px 4px; font-size: var(--dt-fs-xs); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dt-text-4); }
.palette-item {
  display: flex; align-items: center; gap: 10px; width: 100%;
  height: 34px; padding: 0 10px; border-radius: 8px; border: 0; background: none;
  color: var(--dt-text); text-align: left; font-size: var(--dt-fs);
}
.palette-item .pi-icon { width: 24px; height: 24px; border-radius: 6px; display: grid; place-items: center; background: var(--dt-bg-active); color: var(--dt-text-2); flex: none; }
.palette-item .pi-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.palette-item .pi-label mark { background: none; color: var(--dt-accent-text); font-weight: 700; }
.palette-item .pi-group { color: var(--dt-text-3); font-size: var(--dt-fs-sm); white-space: nowrap; }
.palette-item .pi-hint { color: var(--dt-text-3); font-size: var(--dt-fs-xs); }
.palette-item.is-active { background: var(--dt-bg-selected); }
.palette-item.is-active .pi-icon { background: var(--dt-accent); color: #fff; }
.palette-foot { display: flex; align-items: center; gap: 14px; height: 34px; padding: 0 14px; border-top: 1px solid var(--dt-border); color: var(--dt-text-3); font-size: var(--dt-fs-xs); background: var(--dt-bg); }
.palette-foot span { display: inline-flex; align-items: center; gap: 5px; }
.palette-empty { padding: 28px; text-align: center; color: var(--dt-text-3); }

.dialog {
  margin-top: min(10vh, 80px); width: min(560px, calc(100vw - 32px)); max-height: 80vh;
  display: flex; flex-direction: column; overflow: hidden;
  border-radius: 14px; background: var(--dt-bg-elev); border: 1px solid var(--dt-border-strong);
  box-shadow: 0 40px 100px -20px rgba(0, 0, 0, 0.7);
  animation: dt-in 160ms var(--dt-ease);
}
.dialog-head { display: flex; align-items: center; gap: 10px; padding: 14px 16px 10px; }
.dialog-title { font-size: var(--dt-fs-lg); font-weight: 650; }
.dialog-body { padding: 4px 16px 16px; overflow-y: auto; }
.dialog-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--dt-border); background: var(--dt-bg); }
.shortcut-grid { display: grid; grid-template-columns: 1fr auto; gap: 7px 18px; align-items: center; font-size: var(--dt-fs-sm); }
.shortcut-grid .keys { display: inline-flex; gap: 3px; justify-content: flex-end; }
.shortcut-group { grid-column: 1 / -1; margin-top: 8px; font-size: var(--dt-fs-xs); font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--dt-text-4); }

.toasts { position: absolute; right: 12px; bottom: 36px; z-index: 40; display: flex; flex-direction: column; gap: 8px; align-items: flex-end; pointer-events: none; }
.toast {
  pointer-events: auto;
  display: flex; align-items: center; gap: 9px; max-width: 380px;
  padding: 9px 10px 9px 12px; border-radius: 10px;
  background: var(--dt-bg-elev-2); border: 1px solid var(--dt-border-strong); color: var(--dt-text);
  box-shadow: var(--dt-shadow-md); font-size: var(--dt-fs-sm); font-weight: 500;
  animation: dt-in 180ms var(--dt-ease);
}
.toast .ic { color: var(--dt-accent-text); }
.toast.t-good .ic { color: var(--dt-green); }
.toast.t-bad .ic { color: var(--dt-red); }
.toast.t-warn .ic { color: var(--dt-amber); }
.toast .toast-action { margin-left: 6px; }
`
);
const widgets = (
  /* css */
  `
.vrow { overflow: hidden; }
.vlist-empty:empty { display: none; }
.vtree { padding: 4px 0; }
.vtree.is-inline { padding: 2px 0; outline: none; }
.vtree .row { gap: 5px; }
mark.hl { background: rgba(247, 185, 85, 0.3); color: inherit; border-radius: 2px; padding: 0 1px; }

.cv { position: relative; width: 100%; outline: none; user-select: none; touch-action: none; }
.cv:focus-visible { box-shadow: inset 0 0 0 1px var(--dt-border-focus); border-radius: 6px; }
.cv-canvas { position: absolute; inset: 0; display: block; }
.cv-tip {
  position: absolute; left: 0; top: 0; z-index: 3; pointer-events: none;
  max-width: 340px; padding: 7px 10px; border-radius: 8px;
  background: #1c2030; color: #eef0f6; border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: var(--dt-shadow-md);
  font: 500 11px/1.5 var(--dt-font); white-space: nowrap;
}
.cv-tip > div { overflow: hidden; text-overflow: ellipsis; }

.editor {
  position: relative; flex: 1 1 auto; min-height: 220px; overflow: hidden;
  background: var(--dt-bg-sunken); border-top: 1px solid var(--dt-border);
  --ed-pad: 10px; --ed-gutter: 52px;
}
.editor-gutter {
  position: absolute; left: 0; top: 0; bottom: 0; width: var(--ed-gutter);
  padding: var(--ed-pad) 12px var(--ed-pad) 0; overflow: hidden;
  font-family: var(--dt-mono); font-size: var(--dt-fs-mono); line-height: 19px;
  color: var(--dt-text-4); text-align: right; user-select: none;
  border-right: 1px solid var(--dt-border);
}
.editor-num { position: relative; height: 19px; font-variant-numeric: tabular-nums; }
.editor-num .mark { position: absolute; left: 6px; top: 6px; width: 7px; height: 7px; border-radius: 50%; }
.editor-num .mark.t-error { background: var(--dt-red); }
.editor-num .mark.t-warn { background: var(--dt-amber); }
.editor-layer, .editor-input {
  position: absolute; top: 0; bottom: 0; left: var(--ed-gutter); right: 0; margin: 0;
  padding: var(--ed-pad) 16px var(--ed-pad) 12px;
  font-family: var(--dt-mono); font-size: var(--dt-fs-mono); line-height: 19px;
  white-space: pre; tab-size: 2; -moz-tab-size: 2; letter-spacing: 0;
  overflow: auto; border: 0; background: transparent;
}
.editor-layer { pointer-events: none; color: var(--dt-text); overflow: hidden; }
.editor-line { height: 19px; }
.editor-line.is-error { background: var(--dt-red-soft); }
.editor-line.is-warn { background: var(--dt-amber-soft); }
.editor-input { color: transparent; caret-color: var(--dt-text); resize: none; outline: none; z-index: 1; }
.editor-input::selection { background: rgba(139, 123, 255, 0.32); color: transparent; }

.score-ring { position: relative; display: inline-grid; place-items: center; flex: none; }
.score-ring svg { position: absolute; inset: 0; }
.score-num { position: relative; font-size: 17px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
`
);
const sharedStyles = [tokens, base, shell, controls, layout, lists, values, widgets, layers].join("\n");
const SHOW_DELAY = 480;
const WARM_WINDOW = 400;
class TooltipController {
  constructor(root, layer) {
    __publicField(this, "el");
    __publicField(this, "target", null);
    __publicField(this, "timer", null);
    __publicField(this, "lastHidden", 0);
    __publicField(this, "visible", false);
    __publicField(this, "onOver", (event) => {
      const target = event.target?.closest?.("[data-tip]") ?? null;
      if (target === this.target) return;
      this.schedule(target);
    });
    __publicField(this, "onFocus", (event) => {
      const target = event.target?.closest?.("[data-tip]") ?? null;
      if (target && target.matches?.(":focus-visible")) this.schedule(target, 0);
    });
    __publicField(this, "onOut", (event) => {
      const related = event.relatedTarget;
      if (this.target && related && this.target.contains(related)) return;
      this.schedule(null);
    });
    __publicField(this, "hideNow", () => {
      this.schedule(null);
    });
    this.root = root;
    this.el = document.createElement("div");
    this.el.className = "tooltip";
    this.el.setAttribute("role", "tooltip");
    this.el.hidden = true;
    layer.appendChild(this.el);
    root.addEventListener("pointerover", this.onOver, true);
    root.addEventListener("pointerout", this.onOut, true);
    root.addEventListener("pointerdown", this.hideNow, true);
    root.addEventListener("keydown", this.hideNow, true);
    root.addEventListener("focusin", this.onFocus, true);
    root.addEventListener("focusout", this.onOut, true);
    root.addEventListener("scroll", this.hideNow, true);
  }
  destroy() {
    this.root.removeEventListener("pointerover", this.onOver, true);
    this.root.removeEventListener("pointerout", this.onOut, true);
    this.root.removeEventListener("pointerdown", this.hideNow, true);
    this.root.removeEventListener("keydown", this.hideNow, true);
    this.root.removeEventListener("focusin", this.onFocus, true);
    this.root.removeEventListener("focusout", this.onOut, true);
    this.root.removeEventListener("scroll", this.hideNow, true);
    if (this.timer) clearTimeout(this.timer);
    this.el.remove();
  }
  schedule(target, delay) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.target = target;
    if (!target) {
      if (this.visible) this.lastHidden = Date.now();
      this.visible = false;
      this.el.hidden = true;
      return;
    }
    const warm = Date.now() - this.lastHidden < WARM_WINDOW || this.visible;
    const wait = delay ?? (warm ? 0 : SHOW_DELAY);
    this.timer = setTimeout(() => this.show(target), wait);
  }
  show(target) {
    if (!target.isConnected || target !== this.target) return;
    const text2 = target.getAttribute("data-tip");
    if (!text2) return;
    const kbdHint = target.getAttribute("data-kbd");
    this.el.replaceChildren(document.createTextNode(text2));
    if (kbdHint) {
      for (const key2 of kbdHint.split(/\s+/).filter(Boolean)) {
        const k = document.createElement("span");
        k.className = "kbd";
        k.textContent = key2;
        this.el.appendChild(k);
      }
    }
    this.el.hidden = false;
    this.visible = true;
    const rect = target.getBoundingClientRect();
    const tip2 = this.el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = rect.bottom + 6;
    if (top + tip2.height > vh - 4) top = rect.top - tip2.height - 6;
    let left = rect.left + rect.width / 2 - tip2.width / 2;
    left = Math.max(6, Math.min(vw - tip2.width - 6, left));
    this.el.style.top = `${Math.max(4, top)}px`;
    this.el.style.left = `${left}px`;
  }
}
function trackPointer(start2, handlers) {
  const threshold = handlers.threshold ?? 3;
  let moved = false;
  const x0 = start2.clientX;
  const y0 = start2.clientY;
  const doc = document.documentElement;
  const previousSelect = doc.style.userSelect;
  const move = (event) => {
    const dx = event.clientX - x0;
    const dy = event.clientY - y0;
    if (!moved && Math.abs(dx) < threshold && Math.abs(dy) < threshold) return;
    if (!moved) {
      moved = true;
      doc.style.userSelect = "none";
    }
    handlers.move(dx, dy, event);
  };
  const up = (event) => {
    window.removeEventListener("pointermove", move, true);
    window.removeEventListener("pointerup", up, true);
    window.removeEventListener("pointercancel", up, true);
    doc.style.userSelect = previousSelect;
    handlers.end?.(event.clientX - x0, event.clientY - y0, event, moved);
  };
  window.addEventListener("pointermove", move, true);
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", up, true);
}
class PagePush {
  constructor() {
    __publicField(this, "side", null);
    __publicField(this, "saved", null);
  }
  apply(side, size) {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    const property = side === "right" ? "padding-right" : side === "left" ? "padding-left" : side === "bottom" ? "padding-bottom" : null;
    if (side !== this.side) this.release();
    if (!property || size <= 0) return;
    if (!this.saved) {
      this.saved = { property, value: html.style.getPropertyValue(property), priority: html.style.getPropertyPriority(property) };
    }
    this.side = side;
    const base2 = Number.parseFloat(this.saved.value) || 0;
    html.style.setProperty(property, `${Math.round(base2 + size)}px`, "important");
    html.setAttribute("data-aktion-devtools-docked", side ?? "");
  }
  release() {
    if (typeof document === "undefined" || !this.saved) {
      this.side = null;
      return;
    }
    const html = document.documentElement;
    if (this.saved.value) html.style.setProperty(this.saved.property, this.saved.value, this.saved.priority);
    else html.style.removeProperty(this.saved.property);
    html.removeAttribute("data-aktion-devtools-docked");
    this.saved = null;
    this.side = null;
  }
}
const THROTTLE_RULES = {
  none: [],
  fast3g: [{ id: "__throttle", label: "Fast 3G", pattern: "", enabled: true, action: "delay", delayMs: 560 }],
  slow3g: [{ id: "__throttle", label: "Slow 3G", pattern: "", enabled: true, action: "delay", delayMs: 2e3 }],
  offline: [{ id: "__throttle", label: "Offline", pattern: "", enabled: true, action: "offline", message: "Failed to fetch (DevTools: offline)" }],
  flaky: [{ id: "__throttle", label: "Flaky network", pattern: "", enabled: true, action: "fail", probability: 0.3, delayMs: 250, message: "Network error (DevTools: flaky network, 30% of requests fail)" }]
};
const VISION_MATRICES = {
  protanopia: "0.152 1.053 -0.205 0 0  0.115 0.786 0.099 0 0  -0.004 -0.048 1.052 0 0  0 0 0 1 0",
  deuteranopia: "0.367 0.861 -0.228 0 0  0.280 0.673 0.047 0 0  -0.012 0.043 0.969 0 0  0 0 0 1 0",
  tritanopia: "1.256 -0.077 -0.179 0 0  -0.078 0.931 0.148 0 0  0.005 0.691 0.304 0 0  0 0 0 1 0",
  achromatopsia: "0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0"
};
const FILTER_HOST_ID = "aktion-devtools-vision-filters";
function ensureVisionFilters() {
  if (typeof document === "undefined" || document.getElementById(FILTER_HOST_ID)) return;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("id", FILTER_HOST_ID);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", "0");
  svg.setAttribute("height", "0");
  svg.style.position = "absolute";
  svg.style.width = "0";
  svg.style.height = "0";
  svg.style.overflow = "hidden";
  const defs = document.createElementNS(ns, "defs");
  for (const [name, values2] of Object.entries(VISION_MATRICES)) {
    const filter = document.createElementNS(ns, "filter");
    filter.setAttribute("id", `aktion-dt-vision-${name}`);
    filter.setAttribute("color-interpolation-filters", "linearRGB");
    const matrix = document.createElementNS(ns, "feColorMatrix");
    matrix.setAttribute("type", "matrix");
    matrix.setAttribute("values", values2);
    filter.appendChild(matrix);
    defs.appendChild(filter);
  }
  svg.appendChild(defs);
  document.body.appendChild(svg);
}
function visionFilter(mode) {
  if (mode === "none") return "";
  if (mode === "blur") return "blur(2.4px)";
  if (mode === "low-contrast") return "contrast(0.45) brightness(1.15)";
  ensureVisionFilters();
  return `url(#aktion-dt-vision-${mode})`;
}
const IMPACT_TONE$1 = { critical: "red", serious: "red", moderate: "amber", minor: "blue" };
function visibleFindings(findings, ui) {
  return findings.filter((f) => ui.a11yImpacts.has(f.impact) && (ui.a11yCategory === "all" || f.category === ui.a11yCategory));
}
function applySideEffects(raw, ctx) {
  const state = raw;
  const { ui, overlay, app, model } = ctx;
  const root = renderRootElement(app);
  const visible = !ui.minimized;
  const run = ui.a11yRun;
  const markersOn = visible && ui.a11yShowOnPage && run !== null;
  const markersSig = markersOn ? `${run.at}|${[...ui.a11yImpacts].sort().join(",")}|${ui.a11yCategory}` : "";
  if (markersSig !== state.markersSig) {
    state.markersSig = markersSig;
    if (!markersOn) overlay.setMarkers([]);
    else {
      const findings = visibleFindings(run.findings, ui).slice(0, 150);
      overlay.setMarkers(findings.map((finding, i) => ({ element: finding.element, label: String(i + 1), tone: IMPACT_TONE$1[finding.impact] ?? "grey" })));
    }
  }
  const tabSig = visible && ui.a11yTabOrder && root ? `on|${model.revs.commit}` : "";
  if (tabSig !== state.tabSig) {
    state.tabSig = tabSig;
    overlay.setTabOrder(tabSig ? tabOrder(root) : null);
  }
  const landmarkSig = visible && ui.a11yLandmarks && root ? `on|${model.revs.commit}` : "";
  if (landmarkSig !== state.landmarkSig) {
    state.landmarkSig = landmarkSig;
    overlay.setLandmarks(landmarkSig ? landmarks(root).map((l) => ({ element: l.element, label: l.label })) : null);
  }
  const badgeSig = visible && ui.showTestIds && root ? `on|${model.revs.commit}` : "";
  if (badgeSig !== state.badgeSig) {
    state.badgeSig = badgeSig;
    if (!badgeSig || !root) overlay.setBadges(null);
    else {
      const items = [];
      try {
        for (const element2 of root.querySelectorAll("[data-testid], [data-test-id]")) {
          items.push({ element: element2, text: element2.getAttribute("data-testid") ?? element2.getAttribute("data-test-id") ?? "" });
          if (items.length >= 300) break;
        }
      } catch {
      }
      overlay.setBadges(items);
    }
  }
  const element = app?.element ?? null;
  if (state.saved && state.saved.element !== element) restoreElement(state);
  const visionSig = element ? `${app.id}|${ui.a11yVision}` : "";
  if (visionSig !== state.visionSig) {
    state.visionSig = visionSig;
    if (element) {
      state.saved ?? (state.saved = { element });
      if (state.saved.filter === void 0) state.saved.filter = element.style.filter;
      const filter = visionFilter(ui.a11yVision);
      element.style.filter = filter ? [state.saved.filter, filter].filter(Boolean).join(" ") : state.saved.filter ?? "";
    }
  }
  const dirSig = element ? `${app.id}|${ui.emulateDir}` : "";
  if (dirSig !== state.dirSig) {
    state.dirSig = dirSig;
    if (element) {
      state.saved ?? (state.saved = { element });
      if (state.saved.dir === void 0) state.saved.dir = element.getAttribute("dir");
      if (ui.emulateDir === "auto") {
        if (state.saved.dir === null) element.removeAttribute("dir");
        else element.setAttribute("dir", state.saved.dir ?? "");
      } else {
        element.setAttribute("dir", ui.emulateDir);
      }
    }
  }
  const scaleSig = app && can(app, "getTheme") && can(app, "setThemeTokens") ? `${app.id}|${ui.emulateTextScale}` : "";
  if (scaleSig !== state.scaleSig) {
    state.scaleSig = scaleSig;
    applyTextScale(state, app, ui.emulateTextScale);
  }
}
function applyTextScale(state, app, scale) {
  const previous = state.scale;
  if (previous && (previous.app !== app || scale === 1)) {
    try {
      previous.app.clearThemeTokens?.();
      if (Object.keys(previous.userOverrides).length > 0) previous.app.setThemeTokens?.(previous.userOverrides);
    } catch {
    }
    state.scale = null;
  }
  if (!app || scale === 1 || !can(app, "getTheme") || !can(app, "setThemeTokens")) return;
  let base2 = state.scale?.base;
  let userOverrides = state.scale?.userOverrides;
  if (!base2 || !userOverrides) {
    const theme = app.getTheme();
    base2 = {};
    userOverrides = {};
    for (const [key2, value] of Object.entries(theme.tokens)) {
      if (/^fontSize/i.test(key2) && /^[\d.]+px$/.test(value.trim())) base2[key2] = value.trim();
      if (theme.devtoolsOverrides.includes(key2)) userOverrides[key2] = value;
    }
  }
  const scaled = {};
  for (const [key2, value] of Object.entries(base2)) scaled[key2] = `${Math.round(Number.parseFloat(value) * scale * 10) / 10}px`;
  if (Object.keys(scaled).length > 0) app.setThemeTokens(scaled);
  state.scale = { app, base: base2, userOverrides };
}
function restoreElement(state) {
  const saved = state.saved;
  if (!saved) return;
  if (saved.filter !== void 0) saved.element.style.filter = saved.filter;
  if (saved.dir !== void 0) {
    if (saved.dir === null) saved.element.removeAttribute("dir");
    else saved.element.setAttribute("dir", saved.dir);
  }
  state.saved = void 0;
  state.visionSig = void 0;
  state.dirSig = void 0;
}
function releaseSideEffects(raw, _app) {
  const state = raw;
  restoreElement(state);
  if (state.scale) applyTextScale(state, null, 1);
  state.markersSig = state.tabSig = state.landmarkSig = state.badgeSig = state.scaleSig = void 0;
}
const TONE_ICON$1 = { bad: "error", warn: "warning", info: "info", good: "checkCircle" };
function issueRow(ctx, issue) {
  return h(
    "button",
    {
      key: issue.id,
      type: "button",
      class: ["ov-issue", `t-${issue.tone}`],
      "data-dt": "overview-issue",
      onClick: () => {
        if (issue.commitId !== void 0) {
          ctx.ui.selectedCommitId = issue.commitId;
          ctx.ui.profilerView = "flame";
        }
        if (issue.tab === "console" && issue.tone === "bad") ctx.ui.logLevels = /* @__PURE__ */ new Set(["error"]);
        if (issue.tab) ctx.selectTab(issue.tab);
      }
    },
    h("span", { class: "ov-issue-ic" }, icon(TONE_ICON$1[issue.tone], { size: 15 })),
    h(
      "span",
      { class: "ov-issue-text" },
      h("span", { class: "ov-issue-title" }, issue.title),
      h("span", { class: "ov-issue-detail" }, issue.detail),
      issue.fix ? h("span", { class: "ov-issue-fix" }, issue.fix) : null
    ),
    issue.tab ? h("span", { class: "ov-issue-go" }, "Open", icon("arrowRight", { size: 12 })) : null
  );
}
function tip(n, title, body, action, glyph, combo) {
  return h(
    "button",
    { type: "button", class: "ov-tip", onClick: action },
    h("span", { class: "ov-tip-ic" }, icon(glyph, { size: 18 })),
    h(
      "span",
      { class: "ov-tip-text" },
      h("span", { class: "ov-tip-title" }, h("span", { class: "ov-tip-n" }, String(n)), title),
      h("span", { class: "ov-tip-body" }, body),
      combo ? h("span", { class: "ov-tip-keys" }, keys(combo)) : null
    )
  );
}
function render$d(ctx) {
  const { app, model, ui, vitals } = ctx;
  if (!app && !ctx.imported) {
    return h(
      "div",
      { class: "dt-scroll" },
      h(
        "div",
        { class: "ov-welcome" },
        h("div", { class: "ov-welcome-mark" }, logoMark(44)),
        h("h2", {}, "Aktion DevTools"),
        h("p", {}, "Inspect components, edit state live, profile renders, trace network, audit accessibility and security, and record tests — for every ", h("code", {}, "<aktion-app>"), " on the page."),
        noApp(ctx, "Overview")
      )
    );
  }
  const diagnostics = can(app, "getDiagnostics") ? ctx.cache("diagnostics", () => app.getDiagnostics()) : [];
  const issues = ctx.memo("ov:issues", [model.rev, diagnostics.length], () => healthIssues(model, diagnostics));
  const stats = can(app, "getStats") ? ctx.cache("stats", () => app.getStats()) : null;
  const route = can(app, "getRoute") ? ctx.cache("route", () => app.getRoute()) : null;
  const theme = can(app, "getTheme") ? ctx.cache("theme", () => app.getTheme()) : null;
  const overrides = can(app, "listPropOverrides") ? app.listPropOverrides() : [];
  const commits = model.commits;
  const durations = commits.map((c) => c.duration);
  const recent = durations.slice(-40);
  const nonInitial = commits.filter((c) => !c.initial);
  const avg = nonInitial.length > 0 ? nonInitial.reduce((sum, c) => sum + c.duration, 0) / nonInitial.length : commits[0]?.duration ?? 0;
  const p95 = percentile(nonInitial.map((c) => c.duration), 95);
  let memo = 0;
  let rendered = 0;
  for (const commit of commits) {
    memo += commit.memoized;
    rendered += commit.rendered;
  }
  const memoShare = rendered + memo > 0 ? memo / (rendered + memo) : 0;
  const net = networkStats(model.network);
  const rateNow = commitRate(model);
  const bad = issues.filter((i) => i.tone === "bad").length;
  const warn = issues.filter((i) => i.tone === "warn").length;
  const statusTone = bad > 0 ? "red" : warn > 0 ? "amber" : "green";
  const statusText = bad > 0 ? `${bad} problem${bad === 1 ? "" : "s"}` : warn > 0 ? `${warn} warning${warn === 1 ? "" : "s"}` : "Healthy";
  const inpRating = rate("inp", vitals.inp?.value);
  const label = app?.label ?? "Imported session";
  const hero = h(
    "section",
    { class: "ov-hero", "data-dt": "overview-hero" },
    h(
      "div",
      { class: "ov-hero-main" },
      h(
        "div",
        { class: "ov-hero-title" },
        h("span", { class: ["ov-pulse", `t-${statusTone}`] }),
        h("h2", {}, label),
        chip(statusText, statusTone === "green" ? "green" : statusTone === "amber" ? "amber" : "red")
      ),
      h(
        "div",
        { class: "ov-hero-meta" },
        h("span", {}, icon("box", { size: 12 }), `Aktion ${ctx.hook.libraryVersion}`),
        h("span", {}, icon("link", { size: 12 }), `protocol ${ctx.hook.protocolVersion}`),
        route ? h("span", {}, icon("routes", { size: 12 }), h("code", {}, route.path), route.pattern && route.pattern !== route.path ? h("span", { class: "t4" }, ` · ${route.pattern}`) : null) : null,
        theme ? h("span", {}, icon("theme", { size: 12 }), theme.name) : null,
        overrides.length > 0 ? chip(`${overrides.length} prop override${overrides.length === 1 ? "" : "s"}`, "amber", { onClick: () => ctx.selectTab("inspect") }) : null,
        theme && theme.devtoolsOverrides.length > 0 ? chip(`${theme.devtoolsOverrides.length} token override${theme.devtoolsOverrides.length === 1 ? "" : "s"}`, "amber", { onClick: () => ctx.selectTab("theme") }) : null
      )
    ),
    h(
      "div",
      { class: "ov-hero-actions" },
      button({ label: "Pick element", icon: "pick", onClick: () => ctx.togglePicker(), kbd: "⇧ ⌥ C", tip: "Click anything on the page to inspect its component" }),
      button({ label: ui.highlightUpdates ? "Stop highlighting" : "Highlight renders", icon: "scan", active: ui.highlightUpdates, testid: "ov-scan", onClick: () => {
        ui.highlightUpdates = !ui.highlightUpdates;
        if (!ui.highlightUpdates) ctx.overlay.clearUpdateFlashes();
        ctx.persist();
        ctx.refresh();
      }, tip: "Outline components on the page as they re-render" }),
      button({ label: "Run audits", icon: "security", onClick: () => {
        ui.a11yRequested = true;
        ui.securityRequested = true;
        ctx.selectTab("a11y");
      }, tip: "Accessibility + security audits" }),
      button({ label: "Record a test", icon: "record", onClick: () => {
        ui.testPane = "record";
        ctx.selectTab("test");
      } })
    )
  );
  const tips = ui.tipsDismissed ? null : card({
    title: "Get started",
    icon: "sparkles",
    testid: "overview-tips",
    actions: [button({ label: "Dismiss", variant: "ghost", size: "sm", onClick: () => {
      ui.tipsDismissed = true;
      ctx.persist();
      ctx.refresh();
    } })],
    body: h(
      "div",
      { class: "ov-tips" },
      tip(1, "Pick an element", "Click anything in the app to jump to the component that rendered it — then edit its props.", () => ctx.togglePicker(), "pick", "⇧ ⌥ C"),
      tip(2, "Watch it re-render", "Outlines every component as it repaints, with render counts. The fastest way to find wasted work.", () => {
        ui.highlightUpdates = true;
        ctx.persist();
        ctx.refresh();
      }, "scan"),
      tip(3, "Change state live", "Every $atom is editable. Time-travel back through commits and diff any two.", () => ctx.selectTab("state"), "state"),
      tip(4, "Everything, one keystroke away", "The command palette finds sections, actions, components, atoms, and routes.", () => ctx.openPalette(), "command", "⌘ K")
    )
  });
  const perf = statGrid(
    stat({ label: "Commits", value: fmtCount(model.totals.commits), foot: rateNow > 0 ? `${rateNow.toFixed(1)}/s now` : "since open", icon: "zap", onClick: () => ctx.selectTab("profiler"), spark: recent.length > 1 ? microBars(recent, { width: 56, height: 18, highlight: (v) => v > 16 ? "var(--dt-red)" : null }) : null, testid: "ov-commits" }),
    stat({ label: "Avg commit", value: fmtMs(avg), foot: `p95 ${fmtMs(p95)}`, tone: avg >= 16 ? "red" : avg >= 8 ? "amber" : void 0, icon: "gauge", onClick: () => ctx.selectTab("profiler") }),
    stat({ label: "Memoised", value: fmtPct(memoShare), foot: `${fmtCount(memo)} skipped renders`, tone: rendered + memo > 0 && memoShare < 0.2 && commits.length > 3 ? "amber" : void 0, icon: "layers", onClick: () => {
      ui.profilerView = "why";
      ctx.selectTab("profiler");
    } }),
    stat({ label: "Frame rate", value: vitals.fps === null ? "—" : String(vitals.fps), unit: vitals.fps === null ? void 0 : "fps", tone: vitals.fps === null ? void 0 : vitals.fps >= 55 ? "green" : vitals.fps >= 30 ? "amber" : "red", spark: vitals.fpsSamples.length > 1 ? sparkline(vitals.fpsSamples.slice(-40).map(([, v]) => v), { width: 56, height: 18, color: "var(--dt-green)", max: 60 }) : null, icon: "activity", onClick: () => {
      ui.profilerView = "vitals";
      ctx.selectTab("profiler");
    } }),
    stat({ label: "INP", value: vitals.inp ? fmtMs(vitals.inp.value) : "—", foot: vitals.inp ? inpRating.replace("-", " ") : "interact to measure", tone: inpRating === "good" ? "green" : inpRating === "poor" ? "red" : inpRating === "needs-improvement" ? "amber" : void 0, icon: "cursor", onClick: () => {
      ui.profilerView = "vitals";
      ctx.selectTab("profiler");
    } }),
    stat({ label: "Requests", value: fmtCount(model.totals.network), foot: net.failed > 0 ? `${net.failed} failed` : net.pending > 0 ? `${net.pending} pending` : `avg ${fmtMs(net.avgDuration)}`, tone: net.failed > 0 ? "red" : void 0, icon: "network", onClick: () => ctx.selectTab("network") })
  );
  const shape = stats ? statGrid(
    stat({ label: "Instances", value: fmtCount(stats.instances), icon: "inspect", onClick: () => ctx.selectTab("inspect") }),
    stat({ label: "DOM nodes", value: fmtCount(stats.domNodes), foot: `${fmtCount(stats.elements)} elements`, tone: stats.domNodes > 5e3 ? "amber" : void 0, icon: "tree" }),
    stat({ label: "Atoms", value: fmtCount(stats.atoms), icon: "state", onClick: () => ctx.selectTab("state") }),
    stat({ label: "Effects", value: fmtCount(stats.effects), icon: "effects", onClick: () => ctx.selectTab("effects") }),
    stat({ label: "Queries", value: fmtCount(stats.queries), foot: `${stats.stores} stores`, icon: "data", onClick: () => ctx.selectTab("data") }),
    stat({ label: "Program", value: fmtBytes(stats.programBytes), foot: stats.heapBytes ? `heap ${fmtBytes(stats.heapBytes)}` : void 0, icon: "source", onClick: () => ctx.selectTab("source") })
  ) : null;
  const hot = ctx.memo("ov:hot", [model.revs.commit], () => hotAtoms(commits, 6));
  const maxHot = hot[0]?.[1] ?? 1;
  const watches = ui.watches.length > 0 && can(app, "evaluateExpression") ? card({
    title: "Watching",
    icon: "eye",
    actions: [button({ label: "Manage", size: "sm", variant: "ghost", onClick: () => ctx.selectTab("console") })],
    body: h("div", { class: "ov-watches" }, ...ui.watches.map((expr) => {
      const result = app.evaluateExpression(expr);
      return h(
        "div",
        { key: expr, class: "ov-watch" },
        h("code", { class: "ov-watch-expr" }, expr),
        h("span", { class: ["v", result.ok ? `t-${result.value?.type ?? "undefined"}` : "t-error", "ellipsis"] }, result.ok ? result.value?.preview ?? "undefined" : result.error ?? "failed")
      );
    }))
  }) : null;
  return h(
    "div",
    { class: "dt-scroll", "data-dt": "overview" },
    h(
      "div",
      { class: "ov" },
      hero,
      tips,
      h(
        "div",
        { class: "ov-grid" },
        h(
          "div",
          { class: "ov-col" },
          card({
            title: "Health",
            icon: "checkCircle",
            testid: "overview-health",
            sub: issues.length === 0 ? "No errors, failed requests, or warnings" : void 0,
            flush: true,
            body: issues.length === 0 ? h("div", { class: "ov-healthy" }, icon("checkCircle", { size: 18 }), "Everything looks healthy in this session.") : h("div", { class: "ov-issues" }, ...issues.map((issue) => issueRow(ctx, issue)))
          }),
          card({ title: "Performance", icon: "gauge", body: perf }),
          shape ? card({ title: "App shape", icon: "box", body: shape }) : null
        ),
        h(
          "div",
          { class: "ov-col" },
          card({
            title: "Render activity",
            icon: "activity",
            sub: commits.length > 0 ? `last ${Math.min(commits.length, 80)} commits` : void 0,
            actions: [button({ label: "Profile", size: "sm", variant: "ghost", icon: "arrowRight", onClick: () => ctx.selectTab("profiler") })],
            body: commits.length === 0 ? h("div", { class: "hint" }, "Interact with the app — every commit shows up here.") : h(
              "div",
              { class: "ov-activity" },
              microBars(durations.slice(-80), { width: 360, height: 64, highlight: (v) => v > 16 ? "var(--dt-red)" : v > 8 ? "var(--dt-amber)" : null }),
              h(
                "div",
                { class: "ov-activity-legend" },
                h("span", {}, h("i", { style: { background: "var(--dt-accent)" } }), "within budget"),
                h("span", {}, h("i", { style: { background: "var(--dt-amber)" } }), "> 8ms"),
                h("span", {}, h("i", { style: { background: "var(--dt-red)" } }), "> 16ms (dropped frame)")
              )
            )
          }),
          card({
            title: "What drives re-renders",
            icon: "state",
            body: hot.length === 0 ? h("div", { class: "hint" }, "No state-driven commits yet. Change something in the app.") : h("div", { class: "barlist" }, ...hot.map(([path, count]) => h(
              "button",
              {
                key: path,
                type: "button",
                class: "barlist-row",
                onClick: () => openAtom(ctx, path),
                "data-tip": `Open $${path} in State`
              },
              h("span", { class: "lbl mono tone-purple" }, `$${path}`),
              h("span", { class: "meter" }, h("span", { style: { width: `${Math.max(4, count / maxHot * 100)}%` } })),
              h("span", { class: "val" }, `${count} commit${count === 1 ? "" : "s"}`)
            )))
          }),
          watches
        )
      )
    )
  );
}
const overviewView = {
  id: "overview",
  label: "Overview",
  icon: "overview",
  group: "home",
  hint: "Health, cost, and shape of the app",
  keywords: "home summary health dashboard start",
  badge: (ctx) => {
    const errors = ctx.model.errors.length;
    return errors > 0 ? { value: errors, tone: "red" } : null;
  },
  render: render$d,
  commands: (ctx) => [
    { id: "tips", label: "Show the getting-started tips", icon: "sparkles", run: () => {
      ctx.ui.tipsDismissed = false;
      ctx.persist();
      ctx.selectTab("overview");
    } }
  ],
  css: (
    /* css */
    `
.ov { padding: 14px; display: flex; flex-direction: column; gap: 12px; max-width: 1400px; }
.ov-hero {
  position: relative; overflow: hidden;
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
  padding: 16px 16px 16px 18px; border-radius: var(--dt-r-lg);
  border: 1px solid var(--dt-border-strong);
  background:
    radial-gradient(120% 140% at 0% 0%, rgba(99, 102, 241, 0.22), transparent 55%),
    radial-gradient(90% 120% at 100% 0%, rgba(56, 189, 248, 0.14), transparent 60%),
    var(--dt-bg-elev);
  box-shadow: var(--dt-inset-hi);
}
:host([data-theme="light"]) .ov-hero {
  background: radial-gradient(120% 140% at 0% 0%, rgba(99, 102, 241, 0.12), transparent 55%), radial-gradient(90% 120% at 100% 0%, rgba(56, 189, 248, 0.1), transparent 60%), var(--dt-bg-elev);
}
.ov-hero-main { flex: 1 1 320px; min-width: 0; display: flex; flex-direction: column; gap: 8px; }
.ov-hero-title { display: flex; align-items: center; gap: 10px; min-width: 0; }
.ov-hero-title h2 { margin: 0; font-size: 18px; font-weight: 700; letter-spacing: -0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ov-pulse { width: 10px; height: 10px; border-radius: 50%; flex: none; background: var(--dt-green); box-shadow: 0 0 0 4px var(--dt-green-soft); animation: dt-pulse 2s ease-in-out infinite; }
.ov-pulse.t-amber { background: var(--dt-amber); box-shadow: 0 0 0 4px var(--dt-amber-soft); }
.ov-pulse.t-red { background: var(--dt-red); box-shadow: 0 0 0 4px var(--dt-red-soft); }
.ov-hero-meta { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; color: var(--dt-text-3); font-size: var(--dt-fs-sm); }
.ov-hero-meta > span { display: inline-flex; align-items: center; gap: 5px; }
.ov-hero-meta code { font-family: var(--dt-mono); color: var(--dt-text-2); }
.ov-hero-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.ov-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 12px; align-items: start; }
.ov-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.ov-issues { display: flex; flex-direction: column; }
.ov-issue {
  display: flex; align-items: flex-start; gap: 10px; width: 100%; text-align: left;
  padding: 10px 12px; border: 0; border-bottom: 1px solid var(--dt-border); background: none; color: inherit;
}
.ov-issue:last-child { border-bottom: 0; }
.ov-issue:hover { background: var(--dt-bg-hover); }
.ov-issue-ic { flex: none; margin-top: 1px; }
.ov-issue.t-bad .ov-issue-ic { color: var(--dt-red); }
.ov-issue.t-warn .ov-issue-ic { color: var(--dt-amber); }
.ov-issue.t-info .ov-issue-ic { color: var(--dt-blue); }
.ov-issue.t-good .ov-issue-ic { color: var(--dt-green); }
.ov-issue-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.ov-issue-title { font-weight: 650; color: var(--dt-text); }
.ov-issue-detail { color: var(--dt-text-2); font-size: var(--dt-fs-sm); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.ov-issue-fix { color: var(--dt-text-3); font-size: var(--dt-fs-sm); }
.ov-issue-go { flex: none; display: inline-flex; align-items: center; gap: 4px; color: var(--dt-accent-text); font-size: var(--dt-fs-sm); font-weight: 600; opacity: 0; transition: opacity var(--dt-fast); }
.ov-issue:hover .ov-issue-go, .ov-issue:focus-visible .ov-issue-go { opacity: 1; }
.ov-healthy { display: flex; align-items: center; gap: 10px; padding: 14px 12px; color: var(--dt-green); font-weight: 600; }
.ov-tips { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 8px; }
.ov-tip-keys { margin-top: 4px; display: flex; }
.ov-tip {
  display: flex; align-items: flex-start; gap: 10px; text-align: left; padding: 11px 12px; border-radius: var(--dt-r);
  border: 1px solid var(--dt-border); background: var(--dt-bg); color: inherit;
  transition: border-color var(--dt-fast), transform var(--dt-fast), background var(--dt-fast);
}
.ov-tip:hover { border-color: rgba(139, 123, 255, 0.5); background: var(--dt-bg-elev-2); transform: translateY(-1px); }
.ov-tip-ic { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; flex: none; background: var(--dt-accent-soft); color: var(--dt-accent-text); }
.ov-tip-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.ov-tip-title { font-weight: 650; display: flex; align-items: center; gap: 6px; }
.ov-tip-n { font-size: 10px; font-weight: 800; width: 16px; height: 16px; border-radius: 50%; display: inline-grid; place-items: center; background: var(--dt-bg-active); color: var(--dt-text-2); }
.ov-tip-body { color: var(--dt-text-3); font-size: var(--dt-fs-sm); line-height: 1.45; }
.ov-activity { display: flex; flex-direction: column; gap: 8px; }
.ov-activity svg { width: 100%; height: 64px; }
.ov-activity-legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: var(--dt-fs-xs); color: var(--dt-text-3); }
.ov-activity-legend span { display: inline-flex; align-items: center; gap: 5px; }
.ov-activity-legend i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
.ov-watches { display: flex; flex-direction: column; gap: 6px; }
.ov-watch { display: flex; align-items: center; gap: 10px; min-width: 0; }
.ov-watch-expr { font-family: var(--dt-mono); font-size: var(--dt-fs-mono); color: var(--dt-syn-state); flex: none; max-width: 45%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov-welcome { max-width: 560px; margin: 36px auto; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.ov-welcome h2 { margin: 6px 0 0; font-size: 22px; letter-spacing: -0.02em; }
.ov-welcome p { margin: 0; color: var(--dt-text-2); line-height: 1.6; }
.ov-welcome-mark { width: 72px; height: 72px; border-radius: 20px; display: grid; place-items: center; background: var(--dt-bg-elev); border: 1px solid var(--dt-border-strong); box-shadow: 0 16px 40px -16px rgba(99, 102, 241, 0.6); }
`
  )
};
function queryTone(q) {
  if (q.loading) return "blue";
  if (q.state === "error") return "red";
  if (q.state === "stale" || q.state === "idle") return "grey";
  return "green";
}
function queryUrl(key2) {
  const withoutMethod = key2.replace(/^[A-Z]+\s+/, "");
  return withoutMethod.split(/\s/)[0] ?? withoutMethod;
}
function pathPattern(url) {
  try {
    const parsed2 = new URL(url, typeof location !== "undefined" ? location.href : "http://localhost/");
    return parsed2.pathname;
  } catch {
    return url.split("?")[0] ?? url;
  }
}
const SIM_LABEL = "devtools:simulate";
function simulate(ctx, q, mode) {
  const { ui, app } = ctx;
  const pattern = pathPattern(queryUrl(q.key));
  ui.rules = ui.rules.filter((rule) => !(rule.label === SIM_LABEL && rule.pattern === pattern));
  if (mode === "loading") ui.rules = [newRule({ label: SIM_LABEL, pattern, action: "delay", delayMs: 6e5 }), ...ui.rules];
  if (mode === "error") ui.rules = [newRule({ label: SIM_LABEL, pattern, action: "mock", status: 500, body: JSON.stringify({ error: "Simulated failure (DevTools)" }) }), ...ui.rules];
  ctx.pushRules();
  if (can(app, "refetchQuery")) app.refetchQuery(q.key);
  ctx.toast(mode === "restore" ? "Simulation removed — refetching for real" : mode === "loading" ? "Simulating a request that never finishes" : "Simulating a 500 from the server", mode === "restore" ? "good" : "warn", {
    action: mode === "restore" ? void 0 : { label: "Restore", run: () => simulate(ctx, q, "restore") }
  });
  ctx.refresh();
}
function isSimulated(ctx, q) {
  const pattern = pathPattern(queryUrl(q.key));
  return ctx.ui.rules.some((rule) => rule.label === SIM_LABEL && rule.pattern === pattern && rule.enabled);
}
function valueOf(value) {
  if (value.json === void 0) return value.preview;
  try {
    return JSON.parse(value.json);
  } catch {
    return value.preview;
  }
}
function queriesPane$1(ctx) {
  const { app, ui } = ctx;
  if (!can(app, "getQueries")) return h("div", { class: "dt-pad" }, unsupported("its query cache"));
  const queries = ctx.cache("queries", () => app.getQueries());
  const selected = queries.find((q) => q.key === ui.selectedQuery) ?? null;
  const now = Date.now();
  const columns = [
    { key: "state", label: "", width: 28, render: (q) => q.loading ? spinner() : h("span", { class: `dt-dot t-${queryTone(q)}` }) },
    { key: "key", label: "Query", flex: 3, sort: (q) => q.key, render: (q) => h("span", { class: "row-flex" }, h("span", { class: "ellipsis mono" }, truncateMiddle(q.key, 80)), isSimulated(ctx, q) ? chip("simulated", "amber") : null) },
    { key: "status", label: "Status", width: 70, render: (q) => q.status ? chip(String(q.status), q.status >= 400 ? "red" : "blue") : h("span", { class: "t4" }, "—") },
    { key: "updated", label: "Updated", width: 90, align: "right", sort: (q) => q.lastUpdated ?? 0, render: (q) => h("span", { class: "t3 num" }, q.lastUpdated ? fmtAgo(q.lastUpdated, now) : "never") }
  ];
  const table = dataTable({
    columns,
    rows: queries,
    rowKey: (q) => q.key,
    rowHeight: ctx.rowHeight,
    selected: ui.selectedQuery,
    onSelect: (q) => {
      ui.selectedQuery = q.key;
      ctx.refresh();
    },
    version: Math.floor(now / 1e3),
    testid: "queries-table",
    ariaLabel: "Cached queries",
    empty: emptyState({ icon: "data", title: "No cached queries", body: ["A ", h("code", {}, "$query({ url })"), " or ", h("code", {}, "Http({…})"), " resource appears here as soon as the program creates one."] })
  });
  const detail = selected ? h(
    "div",
    { class: "dv-detail", "data-dt": "query-detail" },
    h(
      "div",
      { class: "pane-head" },
      h("span", { class: `dt-dot t-${queryTone(selected)}` }),
      h("span", { class: "pane-title mono", title: selected.key }, truncateMiddle(selected.key, 56)),
      spacer(),
      iconButton({ icon: "close", label: "Close", size: "sm", onClick: () => {
        ui.selectedQuery = null;
        ctx.refresh();
      } })
    ),
    h(
      "div",
      { class: "dv-actions" },
      can(app, "refetchQuery") ? button({ label: "Refetch", size: "sm", icon: "refresh", variant: "primary", onClick: () => {
        app.refetchQuery(selected.key);
        ctx.toast("Refetching…");
      } }) : null,
      can(app, "invalidateQueries") ? button({ label: "Invalidate", size: "sm", icon: "undo", onClick: () => {
        app.invalidateQueries(selected.key);
        ctx.toast("Invalidated");
      } }) : null,
      selected.loading && can(app, "cancelQuery") ? button({ label: "Cancel", size: "sm", icon: "stop", onClick: () => {
        app.cancelQuery(selected.key);
        ctx.toast("Cancelled");
      } }) : null,
      h("span", { class: "vb-sep" }),
      can(app, "setNetworkRules") ? button({ label: "Simulate loading", size: "sm", icon: "clock", testid: "sim-loading", onClick: () => simulate(ctx, selected, "loading") }) : null,
      can(app, "setNetworkRules") ? button({ label: "Simulate error", size: "sm", icon: "error", testid: "sim-error", onClick: () => simulate(ctx, selected, "error") }) : null,
      isSimulated(ctx, selected) ? button({ label: "Restore", size: "sm", icon: "check", variant: "success", onClick: () => simulate(ctx, selected, "restore") }) : null
    ),
    h(
      "div",
      { class: "pane-body is-pad stack" },
      statGrid(
        stat({ label: "State", value: selected.loading ? "loading" : selected.state, tone: selected.state === "error" ? "red" : selected.loading ? "accent" : void 0 }),
        stat({ label: "Status", value: selected.status ? String(selected.status) : "—" }),
        stat({ label: "Updated", value: selected.lastUpdated ? fmtAgo(selected.lastUpdated, now) : "never" }),
        selected.infinite ? stat({ label: "Pages", value: String(selected.page ?? 1), foot: selected.hasMore ? "more available" : "all loaded" }) : null
      ),
      selected.error ? h(
        "div",
        {},
        h("div", { class: "it-sub" }, "Error"),
        selected.error.json !== void 0 && typeof valueOf(selected.error) === "object" && valueOf(selected.error) !== null ? h("div", { class: "dv-error" }, valueTree({
          scope: `query-error:${selected.key}`,
          value: valueOf(selected.error),
          expanded: ui.dataExpanded,
          rowHeight: ctx.rowHeight,
          inline: true,
          onToggle: (p) => {
            if (ui.dataExpanded.has(p)) ui.dataExpanded.delete(p);
            else ui.dataExpanded.add(p);
            ctx.refresh();
          },
          editing: null,
          setEditing: () => void 0,
          onCopy: (t, w) => ctx.copy(t, w)
        })) : note("error", selected.error.preview)
      ) : null,
      h(
        "div",
        {},
        h("div", { class: "it-sub row-flex" }, "Data", spacer(), iconButton({ icon: "copy", label: "Copy the data", size: "sm", onClick: () => ctx.copy(selected.data.json ?? selected.data.preview, "the data") })),
        valueTree({
          scope: `query:${selected.key}`,
          value: valueOf(selected.data),
          expanded: ui.dataExpanded,
          rowHeight: ctx.rowHeight,
          inline: true,
          onToggle: (p) => {
            if (ui.dataExpanded.has(p)) ui.dataExpanded.delete(p);
            else ui.dataExpanded.add(p);
            ctx.refresh();
          },
          editing: null,
          setEditing: () => void 0,
          onCopy: (t, w) => ctx.copy(t, w),
          testid: "query-data"
        })
      )
    )
  ) : null;
  return h(
    "div",
    { class: "dv-pane" },
    h(
      "div",
      { class: "dv-bar" },
      field({ value: ui.invalidateDraft, placeholder: "Invalidate every query whose key contains…", mono: true, label: "Invalidate by pattern", onInput: (v) => {
        ui.invalidateDraft = v;
      }, onCommit: (v) => {
        if (v.trim() && can(app, "invalidateQueries")) {
          app.invalidateQueries(v.trim());
          ctx.toast(`Invalidated queries matching “${v.trim()}”`);
        }
      } }),
      button({ label: "Invalidate", size: "sm", disabled: !can(app, "invalidateQueries"), onClick: () => {
        const v = ui.invalidateDraft.trim();
        if (v && can(app, "invalidateQueries")) {
          app.invalidateQueries(v);
          ctx.toast(`Invalidated queries matching “${v}”`);
        }
      } })
    ),
    selected ? ctx.width() >= 760 ? split({ size: paneSize(ctx, "data.queries", Math.round(ctx.width() * 0.5)), min: 280, onResize: (s) => setPaneSize(ctx, "data.queries", s), first: table, second: detail }) : split({ direction: "col", size: 180, min: 100, onResize: () => void 0, first: table, second: detail }) : table
  );
}
function formSummary(value) {
  if (!value || typeof value !== "object") return null;
  const v = value;
  if (!v.values || typeof v.values !== "object") return null;
  const fields = Object.keys(v.values);
  return h(
    "div",
    {},
    h(
      "div",
      { class: "it-sub row-flex" },
      `Form fields (${fields.length})`,
      spacer(),
      v.valid !== void 0 ? chip(v.valid ? "valid" : "invalid", v.valid ? "green" : "red") : null,
      v.dirty ? chip("dirty", "amber") : null,
      v.submitting ? chip("submitting", "blue") : null
    ),
    h("div", { class: "it-attrs" }, ...fields.map((name) => {
      const error = v.errors?.[name];
      const touched = v.touched?.[name];
      return h(
        "div",
        { key: name, class: "it-attr" },
        h("span", { class: "it-attr-k" }, name),
        h(
          "span",
          { class: "it-attr-v row-flex" },
          h("span", { class: "v t-string ellipsis" }, JSON.stringify(v.values[name]) ?? "undefined"),
          touched ? chip("touched", "grey") : null,
          error ? chip(String(error), "red") : null
        )
      );
    }))
  );
}
function storesPane(ctx) {
  const { app, ui } = ctx;
  if (!can(app, "getStores")) return h("div", { class: "dt-pad" }, unsupported("its stores"));
  const stores = ctx.cache("stores", () => app.getStores());
  const selected = stores.find((s) => s.atom === ui.selectedStore) ?? null;
  const columns = [
    { key: "flavour", label: "Kind", width: 70, render: (s) => chip(s.flavour, s.flavour === "form" ? "purple" : "blue") },
    { key: "atom", label: "Handle", flex: 2, render: (s) => h("span", { class: "mono ellipsis" }, s.atom) },
    { key: "methods", label: "Methods", width: 80, align: "right", render: (s) => h("span", { class: "num t3" }, String(s.methods.length)) },
    { key: "line", label: "Line", width: 60, align: "right", render: (s) => h("span", { class: "num t3" }, s.source ? `L${s.source.line}` : "") }
  ];
  const table = dataTable({
    columns,
    rows: stores,
    rowKey: (s) => s.atom,
    rowHeight: ctx.rowHeight,
    selected: ui.selectedStore,
    onSelect: (s) => {
      ui.selectedStore = s.atom;
      ctx.refresh();
    },
    testid: "stores-table",
    ariaLabel: "Stores and forms",
    empty: emptyState({ icon: "data", title: "No stores or forms", body: [h("code", {}, "$store({…})"), " and ", h("code", {}, "$form({…})"), " handles show up here."] })
  });
  const value = selected ? valueOf(selected.value) : null;
  const detail = selected ? h(
    "div",
    { class: "dv-detail", "data-dt": "store-detail" },
    h(
      "div",
      { class: "pane-head" },
      chip(selected.flavour, selected.flavour === "form" ? "purple" : "blue"),
      h("span", { class: "pane-title mono" }, selected.atom),
      spacer(),
      iconButton({ icon: "close", label: "Close", size: "sm", onClick: () => {
        ui.selectedStore = null;
        ctx.refresh();
      } })
    ),
    h(
      "div",
      { class: "pane-body is-pad stack" },
      selected.methods.length > 0 ? h(
        "div",
        {},
        h("div", { class: "it-sub" }, "Methods — click to call (arguments as JSON)"),
        h("div", { class: "dv-methods" }, ...selected.methods.map((method) => {
          const argsKey = `${selected.atom}.${method}`;
          const draft = ui.storeArgs;
          return h(
            "div",
            { key: method, class: "dv-method" },
            h("code", { class: "tone-cyan" }, `${method}(`),
            field({ value: draft[argsKey] ?? "", placeholder: "args…", mono: true, width: "150px", label: `Arguments for ${method}`, onInput: (v) => {
              draft[argsKey] = v;
            } }),
            h("code", { class: "tone-cyan" }, ")"),
            button({ label: "Call", size: "sm", disabled: !can(app, "callStoreMethod"), onClick: () => {
              const raw = (draft[argsKey] ?? "").trim();
              let args = [];
              if (raw) {
                const parsed2 = parseEditedValue(raw.startsWith("[") ? raw : `[${raw}]`);
                args = Array.isArray(parsed2) ? parsed2 : [parsed2];
              }
              const result = app.callStoreMethod(selected.atom, method, args);
              ctx.toast(result.ok ? `${method}() → ${result.value?.preview ?? "undefined"}` : `${method}() failed: ${result.error}`, result.ok ? "good" : "bad");
            } })
          );
        }))
      ) : null,
      formSummary(value),
      h(
        "div",
        {},
        h("div", { class: "it-sub" }, "State"),
        valueTree({
          scope: `store:${selected.atom}`,
          value,
          expanded: ui.dataExpanded,
          rowHeight: ctx.rowHeight,
          inline: true,
          onToggle: (p) => {
            if (ui.dataExpanded.has(p)) ui.dataExpanded.delete(p);
            else ui.dataExpanded.add(p);
            ctx.refresh();
          },
          editable: () => true,
          editing: ui.edit,
          setEditing: (edit) => {
            ui.edit = edit;
            ctx.refresh();
          },
          onEdit: (path, next) => {
            app.setState(`${selected.atom}.${path}`, next);
            ctx.toast(`${selected.atom}.${path} updated`, "good");
          },
          onCopy: (t, w) => ctx.copy(t, w)
        })
      )
    )
  ) : null;
  return selected ? ctx.width() >= 760 ? split({ size: paneSize(ctx, "data.stores", Math.round(ctx.width() * 0.42)), min: 240, onResize: (s) => setPaneSize(ctx, "data.stores", s), first: table, second: detail }) : split({ direction: "col", size: 160, min: 100, onResize: () => void 0, first: table, second: detail }) : table;
}
function writeStorage(kind, key2, value) {
  try {
    if (kind === "cookies") {
      document.cookie = value === null ? `${encodeURIComponent(key2)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/` : `${encodeURIComponent(key2)}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
      return true;
    }
    const area = kind === "local" ? localStorage : sessionStorage;
    if (value === null) area.removeItem(key2);
    else area.setItem(key2, value);
    return true;
  } catch {
    return false;
  }
}
function storagePane$1(ctx) {
  const { ui } = ctx;
  const all = readPageStorage();
  const entries = ui.storageKind === "local" ? all.local : ui.storageKind === "session" ? all.session : all.cookies;
  const rows = entries.map(([key2, value]) => {
    const verdict = classifySecret(key2, value);
    return { key: key2, value, kind: verdict.kind, label: verdict.label };
  });
  const selected = rows.find((r) => r.key === ui.storageSelected) ?? null;
  const bytes = rows.reduce((sum, r) => sum + r.key.length + r.value.length, 0);
  const columns = [
    { key: "key", label: "Key", flex: 1.2, sort: (r) => r.key, render: (r) => h("span", { class: "row-flex" }, h("span", { class: "mono ellipsis" }, r.key), r.kind !== "none" ? chip(r.label ?? "secret", "amber", { icon: "key", tip: "Looks like a credential — readable by any script on this origin" }) : null) },
    { key: "value", label: "Value", flex: 2.4, render: (r) => h("span", { class: "mono ellipsis t2" }, r.value) },
    { key: "size", label: "Size", width: 70, align: "right", sort: (r) => r.value.length, render: (r) => h("span", { class: "num t3" }, fmtBytes(r.key.length + r.value.length)) }
  ];
  const table = dataTable({
    columns,
    rows,
    rowKey: (r) => r.key,
    rowHeight: ctx.rowHeight,
    selected: ui.storageSelected,
    onSelect: (r) => {
      ui.storageSelected = r.key;
      ctx.refresh();
    },
    testid: "storage-table",
    ariaLabel: "Storage entries",
    empty: emptyState({ icon: "data", title: `Nothing in ${ui.storageKind === "cookies" ? "cookies" : `${ui.storageKind}Storage`}` })
  });
  let editor = null;
  if (selected) {
    let parsed2;
    let isJson = false;
    try {
      parsed2 = JSON.parse(selected.value);
      isJson = typeof parsed2 === "object" && parsed2 !== null;
    } catch {
      isJson = false;
    }
    const verdict = classifySecret(selected.key, selected.value);
    const draft = ui.storageEdit?.key === selected.key ? ui.storageEdit.value : selected.value;
    const save = () => {
      const value = ui.storageEdit?.key === selected.key ? ui.storageEdit.value : selected.value;
      const ok = writeStorage(ui.storageKind, selected.key, value);
      ui.storageEdit = null;
      ctx.toast(ok ? `${selected.key} saved` : `Could not write ${selected.key}`, ok ? "good" : "bad", ok ? { action: { label: "Undo", run: () => {
        writeStorage(ui.storageKind, selected.key, selected.value);
        ctx.refresh();
      } } } : void 0);
      ctx.refresh();
    };
    editor = h(
      "div",
      { class: "dv-detail", "data-dt": "storage-detail" },
      h(
        "div",
        { class: "pane-head" },
        h("span", { class: "pane-title mono" }, selected.key),
        spacer(),
        iconButton({ icon: "copy", label: "Copy value", size: "sm", onClick: () => ctx.copy(selected.value, "the value") }),
        iconButton({ icon: "trash", label: "Delete", size: "sm", danger: true, onClick: () => {
          writeStorage(ui.storageKind, selected.key, null);
          ui.storageSelected = null;
          ctx.toast(`Removed ${selected.key}`, "good", { action: { label: "Undo", run: () => {
            writeStorage(ui.storageKind, selected.key, selected.value);
            ctx.refresh();
          } } });
          ctx.refresh();
        } }),
        iconButton({ icon: "close", label: "Close", size: "sm", onClick: () => {
          ui.storageSelected = null;
          ctx.refresh();
        } })
      ),
      h(
        "div",
        { class: "pane-body is-pad stack" },
        verdict.jwt ? h(
          "div",
          {},
          h("div", { class: "it-sub" }, "Decoded JWT (not verified)"),
          kv([
            ["algorithm", verdict.jwt.alg ?? "?"],
            ["subject", verdict.jwt.sub ?? "—"],
            ["issuer", verdict.jwt.iss ?? "—"],
            ["expires", verdict.jwt.exp ? h("span", { class: verdict.jwt.expired ? "tone-red" : "" }, `${new Date(verdict.jwt.exp * 1e3).toISOString()}${verdict.jwt.expired ? " (expired)" : ""}`) : "never"]
          ])
        ) : null,
        verdict.kind !== "none" ? note("warn", "Any script on this origin — including injected ones — can read this. Session credentials belong in HttpOnly cookies.") : null,
        isJson ? valueTree({
          scope: `storage:${selected.key}`,
          value: parsed2,
          expanded: ui.dataExpanded,
          rowHeight: ctx.rowHeight,
          inline: true,
          onToggle: (p) => {
            if (ui.dataExpanded.has(p)) ui.dataExpanded.delete(p);
            else ui.dataExpanded.add(p);
            ctx.refresh();
          },
          editable: () => true,
          editing: ui.edit,
          setEditing: (edit) => {
            ui.edit = edit;
            ctx.refresh();
          },
          onEdit: (path, next) => {
            const segments = path.split(".");
            const root = structuredClone(parsed2);
            let cursor = root;
            for (const segment of segments.slice(0, -1)) cursor = cursor[segment];
            cursor[segments[segments.length - 1]] = next;
            writeStorage(ui.storageKind, selected.key, JSON.stringify(root));
            ctx.toast(`${selected.key} updated — the app sees it on its next read`, "good");
            ctx.refresh();
          },
          editJson: (_p, v) => ctx.editJson({ title: `Edit ${selected.key}`, value: v, onSave: (next) => {
            writeStorage(ui.storageKind, selected.key, JSON.stringify(next));
            ctx.refresh();
          } }),
          onCopy: (t, w) => ctx.copy(t, w)
        }) : textarea({
          value: draft,
          rows: 6,
          mono: true,
          label: "Value",
          testid: "storage-value",
          // Re-render so Save enables as soon as there is a change; the
          // textarea is controlled by the draft, so its text survives.
          onInput: (value) => {
            ui.storageEdit = { key: selected.key, value };
            ctx.refresh();
          },
          onKeyDown: (event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              save();
            }
          }
        }),
        !isJson ? h(
          "div",
          { class: "row-flex" },
          button({ label: "Save", size: "sm", variant: "primary", icon: "save", disabled: draft === selected.value, onClick: save }),
          draft !== selected.value ? button({ label: "Revert", size: "sm", variant: "ghost", onClick: () => {
            ui.storageEdit = null;
            ctx.refresh();
          } }) : null,
          h("span", { class: "hint" }, "⌘/Ctrl + Enter saves.")
        ) : null
      )
    );
  }
  return h(
    "div",
    { class: "dv-pane" },
    h(
      "div",
      { class: "dv-bar" },
      segmented([
        { value: "local", label: "localStorage", count: all.local.length || null },
        { value: "session", label: "sessionStorage", count: all.session.length || null },
        { value: "cookies", label: "Cookies", count: all.cookies.length || null }
      ], ui.storageKind, (v) => {
        ui.storageKind = v;
        ui.storageSelected = null;
        ctx.refresh();
      }, { label: "Storage area" }),
      h("span", { class: "t3", style: { fontSize: "var(--dt-fs-sm)" } }, `${rows.length} keys · ${fmtBytes(bytes)}`),
      spacer(),
      field({ value: ui.storageDraft.key, placeholder: "key", width: "120px", mono: true, label: "New key", onInput: (v) => {
        ui.storageDraft.key = v;
      } }),
      field({ value: ui.storageDraft.value, placeholder: "value (text or JSON)", width: "180px", mono: true, label: "New value", onInput: (v) => {
        ui.storageDraft.value = v;
      }, onCommit: () => add() }),
      button({ label: "Add", size: "sm", icon: "plus", onClick: () => add() }),
      rows.length > 0 ? iconButton({ icon: "trash", label: "Clear this area", danger: true, onClick: () => {
        const backup = entries.map(([k, v]) => [k, v]);
        for (const [key2] of entries) writeStorage(ui.storageKind, key2, null);
        ctx.toast(`Cleared ${backup.length} keys`, "warn", { action: { label: "Undo", run: () => {
          for (const [k, v] of backup) writeStorage(ui.storageKind, k, v);
          ctx.refresh();
        } } });
        ctx.refresh();
      } }) : null
    ),
    ui.storageKind === "cookies" ? note("plain", "Only cookies visible to JavaScript are listed — HttpOnly cookies (the secure kind) never appear here.", { icon: "cookie" }) : null,
    selected ? ctx.width() >= 760 ? split({ size: paneSize(ctx, "data.storage", Math.round(ctx.width() * 0.5)), min: 260, onResize: (s) => setPaneSize(ctx, "data.storage", s), first: table, second: editor }) : split({ direction: "col", size: 180, min: 100, onResize: () => void 0, first: table, second: editor }) : table
  );
  function add() {
    const key2 = ui.storageDraft.key.trim();
    if (!key2) return;
    const ok = writeStorage(ui.storageKind, key2, ui.storageDraft.value);
    ctx.toast(ok ? `${key2} written` : `Could not write ${key2}`, ok ? "good" : "bad");
    ui.storageDraft = { key: "", value: "" };
    ui.storageSelected = key2;
    ctx.refresh();
  }
}
function render$c(ctx) {
  const { app, ui } = ctx;
  if (!app && ui.dataPane !== "storage") return noApp(ctx, "The Data view", "data");
  const queries = can(app, "getQueries") ? ctx.cache("queries", () => app.getQueries()) : [];
  const stores = can(app, "getStores") ? ctx.cache("stores", () => app.getStores()) : [];
  let body;
  switch (ui.dataPane) {
    case "stores":
      body = storesPane(ctx);
      break;
    case "storage":
      body = storagePane$1(ctx);
      break;
    default:
      body = queriesPane$1(ctx);
  }
  return h(
    "div",
    { class: "dv", "data-dt": "data" },
    viewbar(
      segmented([
        { value: "queries", label: "Queries", icon: "network", count: queries.length || null },
        { value: "stores", label: "Stores & forms", icon: "box", count: stores.length || null },
        { value: "storage", label: "Storage", icon: "data" }
      ], ui.dataPane, (value) => {
        ui.dataPane = value;
        ctx.refresh();
      }, { label: "Data source" }),
      spacer(),
      queries.some((q) => q.loading) ? h("span", { class: "row-flex t3" }, spinner(), `${queries.filter((q) => q.loading).length} loading`) : null,
      vsep(),
      ui.dataPane === "queries" && can(app, "invalidateQueries") ? button({ label: "Refetch all", size: "sm", icon: "refresh", onClick: () => {
        for (const q of queries) app.refetchQuery?.(q.key);
        ctx.toast(`Refetching ${queries.length} queries`);
      } }) : null
    ),
    body
  );
}
const dataView = {
  id: "data",
  label: "Data",
  icon: "data",
  group: "inspect",
  hint: "Queries, stores, forms, and browser storage",
  keywords: "queries cache stores forms localstorage sessionstorage cookies refetch invalidate simulate loading error",
  badge: (ctx) => {
    const app = ctx.app;
    if (!can(app, "getQueries")) return null;
    const failing = ctx.memo("data.badge", [app.id, ctx.model.revs.network, ctx.model.revs.state], () => app.getQueries().filter((q) => q.state === "error").length);
    return failing > 0 ? { value: failing, tone: "red" } : null;
  },
  render: render$c,
  css: (
    /* css */
    `
.dv { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.dv-pane { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.dv-pane > .note { margin: 8px 10px 0; }
.dv-bar { flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--dt-border); flex-wrap: wrap; }
.dv-bar > .input:first-child { flex: 1 1 260px; }
.dv-detail { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.dv-actions { flex: none; display: flex; align-items: center; gap: 6px; padding: 8px 12px; flex-wrap: wrap; border-bottom: 1px solid var(--dt-border); }
.dv-methods { display: flex; flex-direction: column; gap: 6px; }
.dv-error { border: 1px solid color-mix(in srgb, var(--dt-red) 35%, transparent); background: var(--dt-red-soft); border-radius: var(--dt-r-md); padding: 4px 0; }
.dv-method { display: flex; align-items: center; gap: 4px; }
.dt-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; background: var(--dt-text-4); }
.dt-dot.t-green { background: var(--dt-green); box-shadow: 0 0 0 3px var(--dt-green-soft); }
.dt-dot.t-blue { background: var(--dt-blue); box-shadow: 0 0 0 3px var(--dt-blue-soft); }
.dt-dot.t-red { background: var(--dt-red); box-shadow: 0 0 0 3px var(--dt-red-soft); }
`
  )
};
function normalisePath(raw) {
  if (!raw) return "/";
  let value = String(raw);
  if (value.startsWith("#")) value = value.slice(1);
  const queryAt = value.indexOf("?");
  if (queryAt >= 0) value = value.slice(0, queryAt);
  value = value.replace(/\/{2,}/g, "/");
  if (!value || value === "/") return "/";
  if (!value.startsWith("/")) value = "/" + value;
  if (value.length > 1 && value.endsWith("/")) value = value.slice(0, -1);
  return value;
}
function matchRoute(pattern, path) {
  if (!pattern) return { matched: false, params: {} };
  if (pattern === "*") return { matched: true, params: {}, wildcard: true };
  const normPattern = normalisePath(pattern);
  const normPath = normalisePath(path);
  const patternSegments = normPattern === "/" ? [] : normPattern.slice(1).split("/");
  const pathSegments = normPath === "/" ? [] : normPath.slice(1).split("/");
  const params = {};
  let wildcard = false;
  for (let i = 0; i < patternSegments.length; i += 1) {
    const patternSegment = patternSegments[i];
    if (patternSegment === "*") {
      wildcard = true;
      const rest = pathSegments.slice(i).join("/");
      params._ = rest;
      return { matched: true, params, wildcard };
    }
    const pathSegment = pathSegments[i];
    if (pathSegment === void 0) return { matched: false, params: {} };
    if (patternSegment.startsWith(":")) {
      const name = patternSegment.slice(1);
      if (!name) return { matched: false, params: {} };
      params[name] = decodeURIComponent(pathSegment);
      continue;
    }
    if (patternSegment !== pathSegment) return { matched: false, params: {} };
  }
  if (!wildcard && pathSegments.length > patternSegments.length) {
    return { matched: false, params: {} };
  }
  return wildcard ? { matched: true, params, wildcard: true } : { matched: true, params };
}
function patternParams(pattern) {
  if (pattern === "*") return [{ name: "_", wildcard: true }];
  return pattern.split("/").flatMap((segment) => {
    if (segment.startsWith(":") && segment.length > 1) return [{ name: segment.slice(1), wildcard: false }];
    if (segment === "*") return [{ name: "_", wildcard: true }];
    return [];
  });
}
function buildPath(pattern, values2) {
  if (pattern === "*") return values2._ ? `/${values2._.replace(/^\/+/, "")}` : "/";
  const out = [];
  for (const segment of pattern.split("/")) {
    if (segment.startsWith(":") && segment.length > 1) {
      const value = values2[segment.slice(1)]?.trim();
      if (!value) return null;
      out.push(encodeURIComponent(value));
    } else if (segment === "*") {
      const rest = values2._?.trim().replace(/^\/+/, "") ?? "";
      if (rest) out.push(rest);
    } else {
      out.push(segment);
    }
  }
  const path = out.join("/");
  return path.startsWith("/") ? path || "/" : `/${path}`;
}
function firstMatch(declared, path) {
  for (const pattern of declared) {
    const result = matchRoute(pattern, path);
    if (result.matched) return { pattern, params: { ...result.params } };
  }
  return null;
}
function routeCoverage(declared, history, current) {
  const counts = /* @__PURE__ */ new Map();
  for (const event of history) {
    const pattern = event.pattern ?? firstMatch(declared, event.to)?.pattern ?? null;
    if (pattern) counts.set(pattern, (counts.get(pattern) ?? 0) + 1);
  }
  if (current?.pattern && !counts.has(current.pattern)) counts.set(current.pattern, 1);
  return { visited: new Set(counts.keys()), counts };
}
const journeys = /* @__PURE__ */ new Map();
function stopJourney(appId) {
  const journey = journeys.get(appId);
  if (journey) clearTimeout(journey.timer);
  journeys.delete(appId);
}
function replayJourney(ctx, paths) {
  const app = ctx.app;
  if (!app || !can(app, "navigate") || paths.length === 0) return;
  stopJourney(app.id);
  const step = (index) => {
    if (index >= paths.length) {
      journeys.delete(app.id);
      ctx.toast(`Replayed ${plural(paths.length, "navigation")}`, "good");
      ctx.refresh();
      return;
    }
    app.navigate(paths[index]);
    journeys.set(app.id, { timer: setTimeout(() => step(index + 1), 700), index, total: paths.length });
    ctx.refresh();
  };
  step(0);
}
function render$b(ctx) {
  const { app, model, ui } = ctx;
  if (!app) return noApp(ctx, "The Routes view", "routes");
  if (!can(app, "getRoute")) return h("div", { class: "dt-pad" }, unsupported("its router"));
  const route = app.getRoute();
  const canNavigate = can(app, "navigate");
  const history = model.routes;
  const { visited, counts } = routeCoverage(route.declared, history, route);
  const journey = journeys.get(app.id) ?? null;
  const navigate = (path) => {
    if (!can(app, "navigate")) return;
    app.navigate(path);
    ctx.toast(`Navigated to ${path}`);
    ctx.refresh();
  };
  const goDraft = () => {
    const path = ui.routeDraft.trim();
    if (!path) return;
    navigate(path.startsWith("/") ? path : `/${path}`);
  };
  const draftMatch = ui.routeDraft.trim() ? firstMatch(route.declared, ui.routeDraft.trim()) : null;
  const bar = viewbar(
    h(
      "span",
      { class: "rt-nav" },
      h("span", { class: "rt-nav-prefix mono" }, route.mode === "hash" ? "#" : route.basePath ?? ""),
      field({
        value: ui.routeDraft,
        placeholder: "/orders/42 — type a path, Enter to navigate",
        mono: true,
        label: "Path to navigate to",
        testid: "route-input",
        onInput: (value) => {
          ui.routeDraft = value;
          ctx.refresh();
        },
        onCommit: () => goDraft()
      })
    ),
    button({ label: "Go", size: "sm", variant: "primary", icon: "arrowRight", disabled: !canNavigate || !ui.routeDraft.trim(), onClick: goDraft, tip: "Navigate through the app's router — its guard still applies" }),
    ui.routeDraft.trim() ? draftMatch ? chip(["matches ", h("code", {}, draftMatch.pattern)], "green", { testid: "route-draft-match" }) : chip(route.declared.length > 0 ? "no arm matches" : "no routes declared", "amber", { testid: "route-draft-match" }) : null,
    spacer(),
    history.length >= 2 && canNavigate ? journey ? button({ label: `Stop replay (${journey.index + 1}/${journey.total})`, size: "sm", icon: "stop", onClick: () => {
      stopJourney(app.id);
      ctx.refresh();
    } }) : button({ label: "Replay journey", size: "sm", icon: "play", tip: "Walk the recorded navigations again, 0.7s apart", onClick: () => replayJourney(ctx, history.slice(-30).map((e) => e.to)) }) : null,
    vsep(),
    chip(route.mode, "blue", { tip: route.mode === "hash" ? "Hash routing — works on any static host" : "History routing — needs a server fallback to index.html" }),
    route.guarded ? chip("guarded", "amber", { icon: "lock", tip: "The program installed a navigation guard, so a navigation can be redirected or refused" }) : null
  );
  const params = Object.entries(route.params);
  const current = card({
    title: "Current route",
    icon: "routes",
    testid: "route-current",
    actions: [iconButton({ icon: "copy", label: "Copy the URL", size: "sm", onClick: () => ctx.copy(typeof location !== "undefined" ? location.href : route.path, "the URL") })],
    body: h(
      "div",
      { class: "stack" },
      h("div", { class: "rt-path mono", "data-dt": "route-path" }, route.path),
      kv([
        ["Matched arm", route.pattern ? h("code", {}, route.pattern) : chip("no match", "amber")],
        ["Params", params.length > 0 ? h("span", { class: "chips" }, ...params.map(([key2, value]) => chip([h("span", { class: "t3" }, `${key2} `), value], "grey", { mono: true }))) : h("span", { class: "t3" }, "none")],
        route.basePath ? ["Base path", h("code", {}, route.basePath)] : null,
        ["Navigations", String(model.totals.routes)]
      ])
    )
  });
  const coverage = route.declared.length > 0 ? visited.size / route.declared.length : 0;
  const declared = card({
    title: "Declared routes",
    icon: "list",
    testid: "route-declared",
    sub: route.declared.length > 0 ? `${visited.size} of ${route.declared.length} visited this session` : void 0,
    flush: true,
    body: route.declared.length === 0 ? h("div", { class: "dt-pad" }, emptyState({ icon: "routes", title: "No routes declared", body: ["A single-page program declares none. Add a ", h("code", {}, "$router({ … })"), " with arms and they appear here, each navigable before you have linked to it."] })) : h(
      "div",
      {},
      h("div", { class: "rt-cov" }, meter(coverage, coverage === 1 ? "green" : coverage >= 0.5 ? "cyan" : "amber"), h("span", { class: "t3 num" }, `${Math.round(coverage * 100)}% route coverage`)),
      h("div", { class: "rt-list" }, ...route.declared.map((pattern) => {
        const paramDefs = patternParams(pattern);
        const values2 = ui.routeParams[pattern] ?? {};
        const target = buildPath(pattern, values2);
        const active = pattern === route.pattern;
        const visits = counts.get(pattern) ?? 0;
        return h(
          "div",
          { key: pattern, class: ["rt-row", active ? "is-active" : "", visits === 0 ? "is-unvisited" : ""], "data-dt": "route-row" },
          h("span", { class: ["rt-dot", active ? "is-active" : visits > 0 ? "is-visited" : ""], "aria-hidden": "true" }),
          h("code", { class: "rt-pattern" }, pattern),
          ...paramDefs.map((param) => field({
            value: values2[param.name] ?? "",
            placeholder: param.wildcard ? "rest/of/path" : param.name,
            mono: true,
            width: param.wildcard ? "130px" : "90px",
            label: `${pattern} — ${param.wildcard ? "wildcard" : `:${param.name}`}`,
            onInput: (value) => {
              ui.routeParams = { ...ui.routeParams, [pattern]: { ...values2, [param.name]: value } };
              ctx.refresh();
            },
            onCommit: () => {
              const path = buildPath(pattern, ui.routeParams[pattern] ?? {});
              if (path) navigate(path);
            }
          })),
          spacer(),
          active ? chip("active", "green") : visits > 0 ? h("span", { class: "t3 num", "data-tip": "Times matched this session" }, `×${visits}`) : h("span", { class: "t4" }, "not visited"),
          button({ label: "Go", size: "sm", variant: active ? "ghost" : "default", disabled: !canNavigate || target === null, tip: target ? `Navigate to ${target}` : "Fill in the parameters first", onClick: () => {
            if (target) navigate(target);
          } })
        );
      }))
    )
  });
  const unmatched = history.filter((event) => event.pattern == null && !firstMatch(route.declared, event.to));
  const insights = [];
  if (unmatched.length > 0) {
    const sample = [...new Set(unmatched.slice(-3).map((e) => e.to))].join(", ");
    insights.push(note("warn", [`${plural(unmatched.length, "navigation")} matched no route arm (${sample}). Without a `, h("code", {}, "default:"), " arm the router renders nothing for those paths."], { testid: "route-unmatched" }));
  }
  if (route.declared.length > 0 && visited.size < route.declared.length && history.length > 0) {
    const missing = route.declared.filter((p) => !visited.has(p));
    insights.push(note("plain", [`Not visited yet: `, ...missing.slice(0, 6).flatMap((p, i) => [i > 0 ? ", " : "", h("code", {}, p)]), missing.length > 6 ? ` and ${missing.length - 6} more` : "", ". QA tip: every declared route should be exercised at least once."], { icon: "target" }));
  }
  const rows = [...history].reverse();
  const now = ctx.now();
  const columns = [
    { key: "time", label: "When", width: 80, render: (row2) => h("span", { class: "t3 num" }, fmtAgo(row2.time, now)) },
    { key: "from", label: "From", flex: 1, render: (row2) => h("code", { class: "ellipsis t2" }, row2.from || "—") },
    { key: "to", label: "To", flex: 1.2, render: (row2) => h("code", { class: "ellipsis" }, row2.to) },
    { key: "pattern", label: "Matched", flex: 1, render: (row2) => row2.pattern ? h("code", { class: "ellipsis tone-cyan" }, row2.pattern) : chip("no match", "amber") },
    { key: "params", label: "Params", flex: 1.2, render: (row2) => {
      const entries = Object.entries(row2.params ?? {});
      return entries.length > 0 ? h("span", { class: "chips is-nowrap" }, ...entries.map(([key2, value]) => chip(`${key2}=${value}`, "grey", { mono: true }))) : h("span", { class: "t4" }, "—");
    } },
    { key: "source", label: "Via", width: 100, render: (row2) => chip(row2.source ?? "?", row2.source === "programmatic" ? "purple" : "blue") }
  ];
  const historyCard = card({
    title: "Navigation history",
    icon: "history",
    testid: "route-history",
    flush: true,
    sub: history.length > 0 ? `${history.length} recorded · double-click to revisit` : void 0,
    body: rows.length === 0 ? h("div", { class: "rt-history-empty t3" }, icon("history", { size: 14 }), "No navigations yet — click a link in the app, or use Go above.") : h(
      "div",
      { class: "rt-history", style: { height: `${Math.min(10, Math.max(3, rows.length)) * ctx.rowHeight + 30}px` } },
      dataTable({
        columns,
        rows,
        rowKey: (row2) => `${row2.time}:${row2.to}`,
        rowHeight: ctx.rowHeight,
        onActivate: (row2) => navigate(row2.to),
        ariaLabel: "Navigation history",
        testid: "route-history-table",
        empty: emptyState({ icon: "history", title: "No navigations yet", body: "Click a link in the app, or use Go above." })
      })
    )
  });
  return h(
    "div",
    { class: "rt", "data-dt": "routes" },
    bar,
    h(
      "div",
      { class: "dt-scroll" },
      h(
        "div",
        { class: "rt-page" },
        insights.length > 0 ? h("div", { class: "stack" }, ...insights) : null,
        h("div", { class: "rt-grid" }, current, declared),
        historyCard
      )
    )
  );
}
const routesView = {
  id: "routes",
  label: "Routes",
  icon: "routes",
  group: "inspect",
  hint: "Current route, declared arms, match tester, coverage, and history",
  keywords: "router navigate path params pattern history hash guard coverage journey",
  // Only a problem earns a badge: navigations that matched no arm.
  badge: (ctx) => {
    const unmatched = ctx.memo("routes.badge", [ctx.app?.id, ctx.model.revs.route], () => {
      const declared = can(ctx.app, "getRoute") ? ctx.app.getRoute().declared : [];
      return ctx.model.routes.filter((event) => event.pattern == null && !firstMatch(declared, event.to)).length;
    });
    return unmatched > 0 ? { value: unmatched, tone: "amber" } : null;
  },
  render: render$b,
  commands: (ctx) => {
    if (!can(ctx.app, "getRoute")) return [];
    const app = ctx.app;
    return app.getRoute().declared.filter((pattern) => patternParams(pattern).length === 0).map((pattern) => ({
      id: `route:${pattern}`,
      label: `Navigate to ${pattern}`,
      icon: "routes",
      keywords: "route go",
      run: () => {
        app.navigate?.(pattern);
        ctx.toast(`Navigated to ${pattern}`);
      }
    }));
  },
  css: (
    /* css */
    `
.rt { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.rt-nav { display: flex; align-items: center; flex: 1 1 320px; min-width: 200px; max-width: 520px; }
.rt-nav > .input { flex: 1 1 auto; border-top-left-radius: 0; border-bottom-left-radius: 0; }
.rt-nav-prefix { height: 26px; display: inline-flex; align-items: center; padding: 0 7px; border: 1px solid var(--dt-border-strong); border-right: 0; border-radius: var(--dt-r-sm) 0 0 var(--dt-r-sm); background: var(--dt-bg-2); color: var(--dt-text-3); font-size: var(--dt-fs-sm); }
.rt-nav-prefix:empty { display: none; }
.rt-nav-prefix:empty + .input { border-radius: var(--dt-r-sm); }
.rt-page { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.rt-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; align-items: start; }
.rt-path { font-size: 20px; font-weight: 650; letter-spacing: -0.01em; color: var(--dt-text); overflow-wrap: anywhere; }
.rt-cov { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-bottom: 1px solid var(--dt-border); font-size: var(--dt-fs-sm); }
.rt-cov .meter { flex: 1 1 auto; }
.rt-list { display: flex; flex-direction: column; }
.rt-row { display: flex; align-items: center; gap: 8px; min-height: 38px; padding: 5px 12px; border-bottom: 1px solid var(--dt-border); }
.rt-row:last-child { border-bottom: 0; }
.rt-row.is-active { background: var(--dt-accent-soft); }
.rt-row.is-unvisited .rt-pattern { color: var(--dt-text-2); }
.rt-pattern { font-size: var(--dt-fs-md); white-space: nowrap; }
.rt-dot { width: 7px; height: 7px; border-radius: 50%; border: 1.5px solid var(--dt-text-4); flex: none; }
.rt-dot.is-visited { background: var(--dt-cyan); border-color: var(--dt-cyan); }
.rt-dot.is-active { background: var(--dt-green); border-color: var(--dt-green); box-shadow: 0 0 0 3px var(--dt-green-soft); }
.rt-history { display: flex; flex-direction: column; min-height: 96px; }
.rt-history-empty { display: flex; align-items: center; gap: 8px; padding: 14px 12px; font-size: var(--dt-fs-sm); }
.chips.is-nowrap { flex-wrap: nowrap; overflow: hidden; }
`
  )
};
const raf = typeof requestAnimationFrame === "function" ? (fn) => {
  requestAnimationFrame(() => fn());
} : (fn) => {
  setTimeout(fn, 16);
};
class CanvasWidget extends Widget {
  constructor() {
    super(...arguments);
    __publicField(this, "canvas");
    __publicField(this, "g", null);
    __publicField(this, "width", 0);
    __publicField(this, "height", 0);
    __publicField(this, "dpr", 1);
    __publicField(this, "tip");
    __publicField(this, "framePending", false);
    __publicField(this, "resizeObserver", null);
    __publicField(this, "colorCache", /* @__PURE__ */ new Map());
    __publicField(this, "colorEpoch", "");
  }
  mount() {
    const root = document.createElement("div");
    root.className = "cv";
    root.style.height = `${this.props.height}px`;
    root.setAttribute("role", "img");
    root.setAttribute("aria-label", this.props.ariaLabel);
    if (this.props.testid) root.setAttribute("data-dt", this.props.testid);
    this.canvas = document.createElement("canvas");
    this.canvas.className = "cv-canvas";
    this.tip = document.createElement("div");
    this.tip.className = "cv-tip";
    this.tip.hidden = true;
    root.append(this.canvas, this.tip);
    this.el = root;
    try {
      this.g = this.canvas.getContext("2d");
    } catch {
      this.g = null;
    }
    root.addEventListener("pointermove", (e) => this.handlePointer("move", e));
    root.addEventListener("pointerdown", (e) => this.handlePointer("down", e));
    root.addEventListener("pointerup", (e) => this.handlePointer("up", e));
    root.addEventListener("pointerleave", () => {
      this.hideTip();
      this.onLeave();
    });
    root.addEventListener("dblclick", (e) => this.handlePointer("dbl", e));
    root.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    root.addEventListener("keydown", (e) => this.onKey(e));
    if (typeof ResizeObserver === "function") {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(root);
    }
    this.resize();
    return root;
  }
  update(previous) {
    if (this.props.height !== previous.height) {
      this.el.style.height = `${this.props.height}px`;
      this.resize();
      return;
    }
    if (this.props.ariaLabel !== previous.ariaLabel) this.el.setAttribute("aria-label", this.props.ariaLabel);
    this.changed(previous);
    this.redraw();
  }
  unmount() {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }
  /** Props changed; recompute derived layout before the redraw. */
  changed(_previous) {
  }
  onPointer(_kind, _x, _y, _event) {
  }
  onWheel(_event) {
  }
  onKey(_event) {
  }
  onLeave() {
  }
  /** Coalesce redraws into the next frame. */
  redraw() {
    if (this.framePending) return;
    this.framePending = true;
    raf(() => {
      this.framePending = false;
      this.paint();
    });
  }
  resize() {
    const el = this.el;
    const rect = el.getBoundingClientRect();
    this.width = Math.max(0, Math.floor(rect.width));
    this.height = this.props.height;
    this.dpr = Math.max(1, Math.min(3, typeof window !== "undefined" && window.devicePixelRatio || 1));
    this.canvas.width = Math.max(1, Math.floor(this.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(this.height * this.dpr));
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.paint();
  }
  paint() {
    const g = this.g;
    if (!g || this.width === 0) return;
    const host = this.el.getRootNode().host;
    const epoch = host?.getAttribute("data-theme") ?? "";
    if (epoch !== this.colorEpoch) {
      this.colorEpoch = epoch;
      this.colorCache.clear();
    }
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.clearRect(0, 0, this.width, this.height);
    try {
      this.draw(g);
    } catch (err) {
      console.error("[aktion-devtools] chart draw failed", err);
    }
  }
  /** A theme token's value (`--dt-accent`), cached per theme. */
  color(token, fallback = "#888") {
    const cached = this.colorCache.get(token);
    if (cached) return cached;
    let value = "";
    try {
      value = getComputedStyle(this.el).getPropertyValue(token).trim();
    } catch {
      value = "";
    }
    const resolved = value || fallback;
    this.colorCache.set(token, resolved);
    return resolved;
  }
  font(size = 11, weight = 500, mono = false) {
    return `${weight} ${size}px ${mono ? 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' : '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif'}`;
  }
  showTip(x, y, lines2) {
    const tip2 = this.tip;
    tip2.replaceChildren();
    for (const line of lines2) {
      const row2 = document.createElement("div");
      if (typeof line === "string") row2.textContent = line;
      else {
        row2.textContent = line.text;
        if (line.tone) row2.style.color = line.tone;
        if (line.bold) row2.style.fontWeight = "650";
      }
      tip2.appendChild(row2);
    }
    tip2.hidden = false;
    const tw = tip2.offsetWidth || 220;
    const th = tip2.offsetHeight || 60;
    const left = x + 14 + tw > this.width ? Math.max(4, x - tw - 10) : x + 14;
    const top = Math.max(4, Math.min(y + 12, this.height - th - 4));
    tip2.style.transform = `translate(${left}px, ${top}px)`;
  }
  hideTip() {
    if (this.tip) this.tip.hidden = true;
  }
  handlePointer(kind, event) {
    const rect = this.el.getBoundingClientRect();
    this.onPointer(kind, event.clientX - rect.left, event.clientY - rect.top, event);
  }
}
function roundRect(g, x, y, w, h2, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h2 / 2));
  g.beginPath();
  g.moveTo(x + radius, y);
  g.lineTo(x + w - radius, y);
  g.quadraticCurveTo(x + w, y, x + w, y + radius);
  g.lineTo(x + w, y + h2 - radius);
  g.quadraticCurveTo(x + w, y + h2, x + w - radius, y + h2);
  g.lineTo(x + radius, y + h2);
  g.quadraticCurveTo(x, y + h2, x, y + h2 - radius);
  g.lineTo(x, y + radius);
  g.quadraticCurveTo(x, y, x + radius, y);
  g.closePath();
}
function fitText(g, text2, maxWidth) {
  if (maxWidth <= 8) return "";
  if (g.measureText(text2).width <= maxWidth) return text2;
  let lo = 0;
  let hi = text2.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (g.measureText(`${text2.slice(0, mid)}…`).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo <= 0 ? "" : `${text2.slice(0, lo)}…`;
}
function heat(t, light = false) {
  const clamped = Math.max(0, Math.min(1, t));
  const stops = light ? [[20, 160, 140], [202, 160, 20], [230, 110, 30], [214, 50, 60]] : [[48, 196, 170], [235, 200, 70], [255, 146, 72], [255, 96, 110]];
  const scaled = clamped * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = stops[i];
  const b = stops[i + 1];
  const mix2 = (k) => Math.round(a[k] + (b[k] - a[k]) * f);
  return `rgb(${mix2(0)}, ${mix2(1)}, ${mix2(2)})`;
}
const isLight = (el) => el.getRootNode().host?.getAttribute("data-theme") === "light";
class CommitChart extends CanvasWidget {
  constructor() {
    super(...arguments);
    __publicField(this, "hover", -1);
    /** Bars hidden off the right edge (scrolled back in time). */
    __publicField(this, "offset", 0);
  }
  mount() {
    const el = super.mount();
    el.tabIndex = 0;
    return el;
  }
  geometry() {
    const n = this.props.commits.length;
    const gap = n > 120 ? 1 : 2;
    const barW = Math.max(3, Math.min(16, (this.width - 8) / Math.max(1, n) - gap));
    const visible = Math.max(1, Math.floor((this.width - 8) / (barW + gap)));
    const maxOffset = Math.max(0, n - visible);
    this.offset = Math.max(0, Math.min(this.offset, maxOffset));
    const first = Math.max(0, n - visible - this.offset);
    return { barW, gap, visible, first };
  }
  changed(previous) {
    if (this.props.commits.length > previous.commits.length && this.offset > 0) {
      this.offset += this.props.commits.length - previous.commits.length;
    }
  }
  draw(g) {
    const { commits, selected } = this.props;
    const budget = this.props.budget ?? 16;
    const top = 6;
    const bottom = this.height - 4;
    const usable = bottom - top;
    const { barW, gap, visible, first } = this.geometry();
    const shown = commits.slice(first, first + visible);
    let max = budget * 1.25;
    for (const c of shown) if (c.duration > max) max = c.duration;
    const y = (ms) => bottom - Math.max(2, ms / max * usable);
    const by = bottom - budget / max * usable;
    g.save();
    g.setLineDash([3, 3]);
    g.strokeStyle = this.color("--dt-red");
    g.globalAlpha = 0.45;
    g.beginPath();
    g.moveTo(0, Math.round(by) + 0.5);
    g.lineTo(this.width, Math.round(by) + 0.5);
    g.stroke();
    g.restore();
    g.font = this.font(9, 600);
    g.fillStyle = this.color("--dt-red");
    g.globalAlpha = 0.75;
    g.fillText(`${budget}ms`, 4, Math.max(9, by - 3));
    g.globalAlpha = 1;
    const colors = {
      initial: this.color("--dt-teal"),
      full: this.color("--dt-amber"),
      incremental: this.color("--dt-accent"),
      over: this.color("--dt-red")
    };
    shown.forEach((commit, i) => {
      const x = 4 + i * (barW + gap);
      const yy = y(commit.duration);
      const isSel = commit.id === selected;
      const isHover = first + i === this.hover;
      g.globalAlpha = selected === null || isSel || isHover ? 1 : 0.62;
      g.fillStyle = commit.duration > budget ? colors.over : colors[commit.kind];
      roundRect(g, x, yy, barW, bottom - yy, Math.min(2, barW / 2));
      g.fill();
      if (isSel) {
        g.globalAlpha = 1;
        g.strokeStyle = this.color("--dt-text");
        g.lineWidth = 1.5;
        roundRect(g, x - 1, yy - 1, barW + 2, bottom - yy + 2, 2);
        g.stroke();
      }
    });
    g.globalAlpha = 1;
    if (this.offset > 0) {
      g.fillStyle = this.color("--dt-text-3");
      g.font = this.font(9, 600);
      g.fillText(`← ${this.offset} newer`, this.width - 70, 12);
    }
  }
  indexAt(x) {
    const { barW, gap, visible, first } = this.geometry();
    const i = Math.floor((x - 4) / (barW + gap));
    if (i < 0 || i >= visible) return -1;
    const index = first + i;
    return index < this.props.commits.length ? index : -1;
  }
  onPointer(kind, x, y) {
    const index = this.indexAt(x);
    if (kind === "move") {
      if (index !== this.hover) {
        this.hover = index;
        this.redraw();
      }
      const c = index >= 0 ? this.props.commits[index] : void 0;
      if (!c) {
        this.hideTip();
        return;
      }
      this.showTip(x, y, [
        { text: `Commit #${c.id} · ${fmtMs(c.duration)}`, bold: true },
        `${c.kind === "initial" ? "Initial mount" : c.kind === "full" ? "Full render" : "Incremental"} · ${c.rendered} rendered · ${c.memoized} memoised`,
        { text: c.trigger, tone: this.color("--dt-text-3") }
      ]);
    } else if (kind === "down" && index >= 0) {
      this.props.onSelect(this.props.commits[index].id);
    }
  }
  onLeave() {
    this.hover = -1;
    this.redraw();
  }
  onWheel(event) {
    const n = this.props.commits.length;
    if (n === 0) return;
    const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (delta === 0) return;
    event.preventDefault();
    this.offset = Math.max(0, this.offset + (delta > 0 ? -3 : 3));
    this.redraw();
  }
  onKey(event) {
    const { commits, selected } = this.props;
    if (commits.length === 0) return;
    const index = selected === null ? commits.length - 1 : commits.findIndex((c) => c.id === selected);
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const next = Math.max(0, Math.min(commits.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1)));
      this.props.onSelect(commits[next].id);
    } else if (event.key === "End") {
      event.preventDefault();
      this.offset = 0;
      this.props.onSelect(commits[commits.length - 1].id);
    }
  }
}
function commitChart(props) {
  return h(CommitChart, props);
}
const ROW = 20;
class FlameChart extends CanvasWidget {
  constructor() {
    super(...arguments);
    __publicField(this, "v0", 0);
    __publicField(this, "v1", 1);
    __publicField(this, "hoverKey", null);
    __publicField(this, "drag", null);
  }
  mount() {
    this.v1 = this.props.total || 1;
    const el = super.mount();
    el.tabIndex = 0;
    return el;
  }
  changed(previous) {
    if (this.props.version !== previous.version) {
      this.v0 = 0;
      this.v1 = this.props.total || 1;
    }
  }
  resetZoom() {
    this.v0 = 0;
    this.v1 = this.props.total || 1;
    this.redraw();
  }
  x(t) {
    return (t - this.v0) / Math.max(1e-9, this.v1 - this.v0) * this.width;
  }
  draw(g) {
    const { nodes, maxSelf, selected } = this.props;
    const light = isLight(this.el);
    const memoFill = this.color("--dt-bg-active");
    const memoLine = this.color("--dt-border-strong");
    const text2 = light ? "#0b0f19" : "#0c0e14";
    const textMuted = this.color("--dt-text-3");
    g.font = this.font(10.5, 600);
    g.textBaseline = "middle";
    for (const node of nodes) {
      const x0 = this.x(node.start);
      const x1 = this.x(node.start + node.total);
      if (x1 < 0 || x0 > this.width) continue;
      const w = Math.max(1, x1 - x0 - 1);
      const y = 4 + node.depth * ROW;
      const isSel = node.key === selected;
      const isHover = node.key === this.hoverKey;
      if (node.phase === "memo") {
        g.fillStyle = memoFill;
        roundRect(g, x0, y, w, ROW - 2, 3);
        g.fill();
        g.strokeStyle = memoLine;
        g.lineWidth = 1;
        g.stroke();
      } else {
        g.fillStyle = heat(maxSelf > 0 ? node.self / maxSelf : 0, light);
        g.globalAlpha = isHover || isSel ? 1 : 0.9;
        roundRect(g, x0, y, w, ROW - 2, 3);
        g.fill();
        g.globalAlpha = 1;
      }
      if (isSel || isHover) {
        g.strokeStyle = isSel ? this.color("--dt-text") : this.color("--dt-text-2");
        g.lineWidth = isSel ? 2 : 1;
        roundRect(g, x0 + 0.5, y + 0.5, w - 1, ROW - 3, 3);
        g.stroke();
      }
      if (w > 26) {
        const label = node.phase === "memo" ? `${node.name} (memo)` : `${node.name} ${fmtMs(node.self)}`;
        g.fillStyle = node.phase === "memo" ? textMuted : text2;
        g.fillText(fitText(g, label, w - 10), x0 + 5, y + (ROW - 2) / 2 + 0.5);
      }
    }
    if (nodes.length === 0) {
      g.fillStyle = textMuted;
      g.font = this.font(11, 500);
      g.fillText("No component spans in this commit.", 8, 16);
    }
  }
  nodeAt(x, y) {
    const depth = Math.floor((y - 4) / ROW);
    const t = this.v0 + x / Math.max(1, this.width) * (this.v1 - this.v0);
    for (const node of this.props.nodes) {
      if (node.depth !== depth) continue;
      if (t >= node.start && t <= node.start + node.total) return node;
    }
    return null;
  }
  onPointer(kind, x, y, event) {
    if (kind === "down") {
      this.drag = { x, v0: this.v0, v1: this.v1, moved: false };
      try {
        this.el.setPointerCapture(event.pointerId);
      } catch {
      }
      return;
    }
    if (kind === "move" && this.drag) {
      const dx = x - this.drag.x;
      if (Math.abs(dx) > 3) this.drag.moved = true;
      if (this.drag.moved) {
        const span = this.drag.v1 - this.drag.v0;
        const dt = dx / Math.max(1, this.width) * span;
        const total = this.props.total || 1;
        let v0 = this.drag.v0 - dt;
        v0 = Math.max(0, Math.min(total - span, v0));
        this.v0 = v0;
        this.v1 = v0 + span;
        this.hideTip();
        this.redraw();
        return;
      }
    }
    if (kind === "up") {
      const wasDrag = this.drag?.moved;
      this.drag = null;
      if (!wasDrag) this.props.onSelect(this.nodeAt(x, y)?.key ?? null);
      return;
    }
    if (kind === "dbl") {
      const node2 = this.nodeAt(x, y);
      if (node2 && node2.total > 0) {
        const pad = node2.total * 0.04;
        this.v0 = Math.max(0, node2.start - pad);
        this.v1 = Math.min(this.props.total || 1, node2.start + node2.total + pad);
      } else {
        this.resetZoom();
      }
      this.redraw();
      return;
    }
    const node = this.nodeAt(x, y);
    const key2 = node?.key ?? null;
    if (key2 !== this.hoverKey) {
      this.hoverKey = key2;
      this.props.onHover?.(key2);
      this.redraw();
    }
    if (!node) {
      this.hideTip();
      return;
    }
    this.showTip(x, y, [
      { text: node.name, bold: true },
      node.phase === "memo" ? "Skipped — memoised this commit" : `self ${fmtMs(node.self)} · total ${fmtMs(node.total)}${node.phase === "mount" ? " · mounted" : ""}`,
      { text: node.reason, tone: this.color("--dt-text-3") },
      ...node.deps && node.deps.length > 0 ? [{ text: `reads ${node.deps.slice(0, 6).map((d) => `$${d}`).join(", ")}${node.deps.length > 6 ? "…" : ""}`, tone: this.color("--dt-syn-state") }] : []
    ]);
  }
  onLeave() {
    if (this.hoverKey !== null) {
      this.hoverKey = null;
      this.props.onHover?.(null);
      this.redraw();
    }
  }
  onWheel(event) {
    const total = this.props.total || 1;
    event.preventDefault();
    const rect = this.el.getBoundingClientRect();
    const px2 = (event.clientX - rect.left) / Math.max(1, this.width);
    const span = this.v1 - this.v0;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey) {
      const dt = (event.shiftKey ? event.deltaY : event.deltaX) / Math.max(1, this.width) * span;
      const v0 = Math.max(0, Math.min(total - span, this.v0 + dt));
      this.v0 = v0;
      this.v1 = v0 + span;
    } else {
      const factor = Math.exp(event.deltaY * 22e-4);
      const nextSpan = Math.max(total / 2e3, Math.min(total, span * factor));
      const anchor = this.v0 + px2 * span;
      let v0 = anchor - px2 * nextSpan;
      v0 = Math.max(0, Math.min(total - nextSpan, v0));
      this.v0 = v0;
      this.v1 = v0 + nextSpan;
    }
    this.hideTip();
    this.redraw();
  }
  onKey(event) {
    if (event.key === "Escape" || event.key === "0") {
      this.resetZoom();
    }
  }
}
function flameChart(props) {
  return h(FlameChart, props);
}
const GUTTER = 92;
const AXIS = 22;
const LANE = 12;
const TRACK_PAD = 6;
class TimelineChart extends CanvasWidget {
  constructor() {
    super(...arguments);
    __publicField(this, "boxes", []);
    __publicField(this, "laneOf", /* @__PURE__ */ new Map());
    __publicField(this, "hoverId", null);
    __publicField(this, "drag", null);
    __publicField(this, "liveView", null);
  }
  mount() {
    this.layout();
    const el = super.mount();
    el.tabIndex = 0;
    return el;
  }
  changed(previous) {
    if (this.props.items !== previous.items || this.props.tracks !== previous.tracks) this.layout();
  }
  /** Assign lanes per track and compute the vertical layout. */
  layout() {
    this.laneOf.clear();
    const byTrack = /* @__PURE__ */ new Map();
    for (const item of this.props.items) {
      const bucket = byTrack.get(item.track);
      if (bucket) bucket.push(item);
      else byTrack.set(item.track, [item]);
    }
    let top = AXIS;
    this.boxes = [];
    for (const track of this.props.tracks) {
      const items = byTrack.get(track.id) ?? [];
      const span = Math.max(1, (this.props.end - this.props.start) / 400);
      const { lanes, count } = packLanes(items.map((it) => ({ start: it.start, end: Math.max(it.end ?? it.start, it.start) + span })), 4);
      items.forEach((item, i) => this.laneOf.set(item.id, lanes[i]));
      const height = TRACK_PAD * 2 + count * LANE;
      this.boxes.push({ track, top, height, lanes: count });
      top += height;
    }
  }
  /** The height this chart wants for its tracks (the view sizes the widget with it). */
  static heightFor(tracks, laneCounts = tracks) {
    return AXIS + tracks * TRACK_PAD * 2 + laneCounts * LANE + 2;
  }
  window() {
    if (this.props.view) return this.props.view;
    const span = this.props.window ?? 1e4;
    const end = Math.max(this.props.end, this.props.start + 1);
    const start2 = Math.max(this.props.start, end - span);
    this.liveView = { start: start2, end: Math.max(end, start2 + 1) };
    return this.liveView;
  }
  xOf(t, view) {
    return GUTTER + (t - view.start) / Math.max(1e-9, view.end - view.start) * (this.width - GUTTER - 6);
  }
  tOf(x, view) {
    return view.start + (x - GUTTER) / Math.max(1, this.width - GUTTER - 6) * (view.end - view.start);
  }
  draw(g) {
    const view = this.window();
    const span = view.end - view.start;
    const text2 = this.color("--dt-text-2");
    const text3 = this.color("--dt-text-3");
    const border = this.color("--dt-border");
    const bgElev = this.color("--dt-bg-elev");
    g.textBaseline = "middle";
    this.boxes.forEach((box, i) => {
      if (i % 2 === 1) {
        g.fillStyle = bgElev;
        g.fillRect(0, box.top, this.width, box.height);
      }
      g.fillStyle = this.color(box.track.color);
      roundRect(g, 10, box.top + box.height / 2 - 4, 8, 8, 2);
      g.fill();
      g.fillStyle = text2;
      g.font = this.font(10.5, 600);
      g.fillText(fitText(g, box.track.label, GUTTER - 30), 24, box.top + box.height / 2);
      g.strokeStyle = border;
      g.beginPath();
      g.moveTo(0, box.top + box.height + 0.5);
      g.lineTo(this.width, box.top + box.height + 0.5);
      g.stroke();
    });
    g.strokeStyle = border;
    g.beginPath();
    g.moveTo(GUTTER + 0.5, 0);
    g.lineTo(GUTTER + 0.5, this.height);
    g.stroke();
    const ticks = niceTicks(view.start - this.props.start, view.end - this.props.start, Math.max(3, Math.floor((this.width - GUTTER) / 90)));
    g.font = this.font(9.5, 500);
    for (const offset of ticks) {
      const x = this.xOf(this.props.start + offset, view);
      if (x < GUTTER || x > this.width) continue;
      g.strokeStyle = border;
      g.beginPath();
      g.moveTo(Math.round(x) + 0.5, AXIS - 4);
      g.lineTo(Math.round(x) + 0.5, this.height);
      g.stroke();
      g.fillStyle = text3;
      g.fillText(tickLabel(offset, span), x + 3, AXIS / 2);
    }
    const brush = this.props.brush;
    if (brush) {
      const bx0 = Math.max(GUTTER, this.xOf(brush.start, view));
      const bx1 = Math.min(this.width, this.xOf(brush.end, view));
      if (bx1 > bx0) {
        g.fillStyle = this.color("--dt-accent-soft");
        g.fillRect(bx0, AXIS - 4, bx1 - bx0, this.height - AXIS + 4);
        g.strokeStyle = this.color("--dt-accent");
        g.lineWidth = 1;
        g.strokeRect(bx0 + 0.5, AXIS - 3.5, bx1 - bx0 - 1, this.height - AXIS + 3);
      }
    }
    const boxOf = new Map(this.boxes.map((box) => [box.track.id, box]));
    g.save();
    g.beginPath();
    g.rect(GUTTER + 1, AXIS - 4, this.width - GUTTER - 1, this.height - AXIS + 4);
    g.clip();
    for (const item of this.props.items) {
      const box = boxOf.get(item.track);
      if (!box) continue;
      const end = item.end ?? item.start;
      if (end < view.start || item.start > view.end) continue;
      const lane = this.laneOf.get(item.id) ?? 0;
      const y = box.top + TRACK_PAD + lane * LANE;
      const x0 = this.xOf(item.start, view);
      const x1 = this.xOf(end, view);
      const isSel = item.id === this.props.selected;
      const isHover = item.id === this.hoverId;
      g.fillStyle = this.color(item.color);
      g.globalAlpha = isSel || isHover ? 1 : item.alert ? 0.95 : 0.78;
      if (item.end !== void 0 && x1 - x0 >= 2) {
        roundRect(g, x0, y + 1, Math.max(2, x1 - x0), LANE - 3, 2.5);
        g.fill();
      } else {
        const cx = x0;
        const cy = y + (LANE - 1) / 2;
        const r = item.alert ? 4.2 : 3.4;
        g.beginPath();
        g.moveTo(cx, cy - r);
        g.lineTo(cx + r, cy);
        g.lineTo(cx, cy + r);
        g.lineTo(cx - r, cy);
        g.closePath();
        g.fill();
      }
      if (isSel) {
        g.globalAlpha = 1;
        g.strokeStyle = this.color("--dt-text");
        g.lineWidth = 1.5;
        g.strokeRect(Math.round(x0) - 1.5, y - 0.5, Math.max(4, x1 - x0) + 3, LANE);
      }
    }
    g.globalAlpha = 1;
    const fps = this.props.fps;
    const first = this.boxes[0];
    if (fps && fps.length > 1 && first) {
      g.strokeStyle = this.color("--dt-green");
      g.globalAlpha = 0.8;
      g.lineWidth = 1.25;
      g.beginPath();
      let started = false;
      for (const [t, value] of fps) {
        if (t < view.start - 1e3 || t > view.end + 1e3) continue;
        const x = this.xOf(t, view);
        const y = first.top + first.height - 2 - Math.min(1, value / 60) * (first.height - 4);
        if (!started) {
          g.moveTo(x, y);
          started = true;
        } else g.lineTo(x, y);
      }
      g.stroke();
      g.globalAlpha = 1;
    }
    g.restore();
    if (!this.props.view) {
      const x = this.xOf(this.props.end, view);
      g.strokeStyle = this.color("--dt-accent");
      g.globalAlpha = 0.7;
      g.beginPath();
      g.moveTo(Math.round(x) - 0.5, AXIS - 4);
      g.lineTo(Math.round(x) - 0.5, this.height);
      g.stroke();
      g.globalAlpha = 1;
    }
  }
  itemAt(x, y) {
    if (x < GUTTER) return null;
    const view = this.window();
    const box = this.boxes.find((b) => y >= b.top && y < b.top + b.height);
    if (!box) return null;
    const lane = Math.floor((y - box.top - TRACK_PAD) / LANE);
    const tolerance = (view.end - view.start) / Math.max(1, this.width - GUTTER) * 5;
    let best = null;
    let bestDist = Infinity;
    for (const item of this.props.items) {
      if (item.track !== box.track.id) continue;
      if ((this.laneOf.get(item.id) ?? 0) !== lane) continue;
      const t = this.tOf(x, view);
      const end = item.end ?? item.start;
      const dist = t < item.start ? item.start - t : t > end ? t - end : 0;
      if (dist <= tolerance && dist < bestDist) {
        best = item;
        bestDist = dist;
      }
    }
    return best;
  }
  onPointer(kind, x, y, event) {
    const view = this.window();
    if (kind === "down") {
      if (x < GUTTER) return;
      this.drag = { mode: event.shiftKey ? "brush" : "pan", x, t: this.tOf(x, view), view: { ...view }, moved: false };
      try {
        this.el.setPointerCapture(event.pointerId);
      } catch {
      }
      return;
    }
    if (kind === "move" && this.drag) {
      if (Math.abs(x - this.drag.x) > 3) this.drag.moved = true;
      if (this.drag.moved) {
        this.hideTip();
        if (this.drag.mode === "pan") {
          const span = this.drag.view.end - this.drag.view.start;
          const dt = (x - this.drag.x) / Math.max(1, this.width - GUTTER) * span;
          const start2 = this.drag.view.start - dt;
          this.props.onView({ start: start2, end: start2 + span });
        } else {
          const t = this.tOf(x, this.drag.view);
          this.props.onBrush({ start: Math.min(t, this.drag.t), end: Math.max(t, this.drag.t) });
        }
        return;
      }
    }
    if (kind === "up") {
      const drag = this.drag;
      this.drag = null;
      if (drag && !drag.moved) {
        const item2 = this.itemAt(x, y);
        this.props.onSelect(item2?.id ?? null);
      }
      return;
    }
    if (kind === "dbl") {
      this.props.onView(null);
      this.props.onBrush(null);
      return;
    }
    const item = this.itemAt(x, y);
    const id = item?.id ?? null;
    if (id !== this.hoverId) {
      this.hoverId = id;
      this.redraw();
    }
    if (!item) {
      this.hideTip();
      return;
    }
    const offset = item.start - this.props.start;
    this.showTip(x, y, [
      { text: item.label, bold: true },
      ...item.detail ? [item.detail] : [],
      { text: `+${fmtMs(offset)}${item.end !== void 0 ? ` · ${fmtMs(item.end - item.start)}` : ""}`, tone: this.color("--dt-text-3") }
    ]);
  }
  onWheel(event) {
    event.preventDefault();
    const view = this.window();
    const rect = this.el.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const span = view.end - view.start;
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY) || event.shiftKey) {
      const dt = (event.shiftKey ? event.deltaY : event.deltaX) / Math.max(1, this.width - GUTTER) * span;
      this.props.onView({ start: view.start + dt, end: view.end + dt });
      return;
    }
    const factor = Math.exp(event.deltaY * 2e-3);
    const nextSpan = Math.max(2, Math.min((this.props.end - this.props.start) * 1.5 + 1e3, span * factor));
    const anchor = this.tOf(Math.max(GUTTER, x), view);
    const px2 = (anchor - view.start) / Math.max(1e-9, span);
    const start2 = anchor - px2 * nextSpan;
    this.props.onView({ start: start2, end: start2 + nextSpan });
  }
  onKey(event) {
    if (event.key === "Escape") {
      this.props.onBrush(null);
      this.props.onView(null);
    }
  }
}
function timelineChart(props) {
  return h(TimelineChart, props);
}
function timelineHeight(tracks, items, start2, end) {
  const span = Math.max(1, (end - start2) / 400);
  let height = AXIS;
  for (const track of tracks) {
    const own = items.filter((item) => item.track === track.id);
    const { count } = packLanes(own.map((it) => ({ start: it.start, end: Math.max(it.end ?? it.start, it.start) + span })), 4);
    height += TRACK_PAD * 2 + count * LANE;
  }
  return height + 2;
}
const KINDS = [
  { kind: "interaction", label: "Interactions", color: "--dt-k-interaction", tone: "blue" },
  { kind: "commit", label: "Commits", color: "--dt-k-commit", tone: "accent" },
  { kind: "state", label: "State", color: "--dt-k-state", tone: "purple" },
  { kind: "effect", label: "Effects", color: "--dt-k-effect", tone: "green" },
  { kind: "network", label: "Network", color: "--dt-k-network", tone: "cyan" },
  { kind: "route", label: "Routes", color: "--dt-k-route", tone: "pink" },
  { kind: "emit", label: "Events", color: "--dt-k-emit", tone: "amber" },
  { kind: "log", label: "Logs", color: "--dt-k-log", tone: "grey" },
  { kind: "error", label: "Errors", color: "--dt-k-error", tone: "red" },
  { kind: "longtask", label: "Long tasks", color: "--dt-k-longtask", tone: "orange" }
];
function effectEventLabel(event) {
  const deps = [...(event.triggers ?? "").matchAll(/\$([A-Za-z_][\w.]*)/g)].map((match) => match[1]);
  const purpose = effectLabel({ label: event.label, triggers: event.triggers, deps });
  const line = /L(\d+)/.exec(event.label)?.[1];
  return purpose === event.label || !line ? purpose : `${purpose} · L${line}`;
}
function toMonotonic(time, epochOffset) {
  return time > 1e11 ? time - epochOffset : time;
}
function timelineEntries(ctx) {
  const { model, vitals } = ctx;
  const out = [];
  const now = ctx.now();
  for (const c of model.commits) {
    out.push({
      id: `commit:${c.commitId}`,
      kind: "commit",
      start: c.startTime,
      end: c.startTime + Math.max(0.01, c.duration),
      label: `Commit #${c.commitId}`,
      detail: `${fmtMs(c.duration)} · ${c.initial ? "initial mount" : c.changedPaths.length > 0 ? c.changedPaths.map((p) => `$${p}`).join(", ") : "forced"} · ${c.rendered} rendered`,
      color: c.duration > 16 ? "--dt-red" : "--dt-k-commit",
      tone: "accent",
      alert: c.duration > 16,
      open: { tab: "profiler", label: "Open in Performance", apply: (x) => {
        x.ui.selectedCommitId = c.commitId;
        x.ui.profilerView = "flame";
      } },
      raw: { ...c, components: `${c.components.length} records`, snapshot: c.snapshot ? "(snapshot)" : void 0 }
    });
  }
  for (const [atom, changes] of model.atomLog) {
    changes.forEach((change, i) => out.push({
      id: `state:${atom}:${change.time}:${i}`,
      kind: "state",
      start: change.time,
      label: `$${atom}`,
      detail: `${change.before} → ${change.after}`,
      color: "--dt-k-state",
      tone: "purple",
      open: { tab: "state", label: "Open in State", apply: (x) => {
        x.ui.stateSelected = atom;
        x.ui.stateView = "tree";
        x.ui.stateFilter = "";
      } },
      raw: change
    }));
  }
  model.effects.forEach((e, i) => out.push({
    id: `effect:${e.effectKey}:${e.time}:${i}`,
    kind: "effect",
    start: e.phase === "run" && e.duration ? e.time - e.duration : e.time,
    end: e.phase === "run" && e.duration ? e.time : void 0,
    label: effectEventLabel(e),
    detail: `${e.phase} · ${e.reason}${e.duration !== void 0 ? ` · ${fmtMs(e.duration)}` : ""}${e.error ? ` · ${e.error}` : ""}`,
    color: e.phase === "error" ? "--dt-red" : "--dt-k-effect",
    tone: e.phase === "error" ? "red" : "green",
    alert: e.phase === "error",
    open: { tab: "effects", label: "Open in Effects", apply: (x) => {
      x.ui.selectedEffect = e.effectKey;
    } },
    raw: e
  }));
  for (const r of model.network) {
    const failed = r.phase === "error" || r.phase === "blocked" || (r.status ?? 0) >= 400;
    out.push({
      id: `network:${r.requestId}`,
      kind: "network",
      start: r.startTime,
      end: r.endTime ?? Math.max(r.startTime + 1, now),
      label: `${r.method} ${urlTail(r.url)}`,
      detail: `${r.phase === "pending" ? "pending" : r.status ?? r.phase}${r.duration !== void 0 ? ` · ${fmtMs(r.duration)}` : ""}${r.rule ? ` · rule: ${r.rule}` : ""}`,
      color: failed ? "--dt-red" : r.phase === "mock" ? "--dt-purple" : "--dt-k-network",
      tone: failed ? "red" : "cyan",
      alert: failed,
      open: { tab: "network", label: "Open in Network", apply: (x) => {
        x.ui.selectedRequest = r.requestId;
      } },
      raw: r
    });
  }
  model.routes.forEach((r, i) => out.push({
    id: `route:${r.time}:${i}`,
    kind: "route",
    start: r.time,
    label: `→ ${r.to}`,
    detail: `${r.pattern ? `matched ${r.pattern}` : "no route matched"}${r.source ? ` · ${r.source}` : ""}`,
    color: r.pattern ? "--dt-k-route" : "--dt-amber",
    tone: "pink",
    alert: !r.pattern,
    open: { tab: "routes", label: "Open in Routes", apply: () => void 0 },
    raw: r
  }));
  model.emits.forEach((e, i) => out.push({
    id: `emit:${e.time}:${i}`,
    kind: "emit",
    start: e.time,
    label: `emit("${e.name}")`,
    detail: e.detail.preview,
    color: "--dt-k-emit",
    tone: "amber",
    raw: e
  }));
  model.logs.forEach((log, i) => out.push({
    id: `log:${log.time}:${i}`,
    kind: "log",
    start: toMonotonic(log.time, ctx.epochOffset),
    label: log.level,
    detail: log.count > 1 ? `${log.text} (×${log.count})` : log.text,
    color: log.level === "error" ? "--dt-red" : log.level === "warn" ? "--dt-amber" : "--dt-k-log",
    tone: log.level === "error" ? "red" : log.level === "warn" ? "amber" : "grey",
    alert: log.level === "error",
    open: { tab: "console", label: "Open in Console", apply: () => void 0 },
    raw: log
  }));
  model.errors.forEach((e, i) => out.push({
    id: `error:${e.time}:${i}`,
    kind: "error",
    start: e.time,
    label: `${e.phase} error`,
    detail: `${e.subject ? `${e.subject}: ` : ""}${e.message}`,
    color: "--dt-k-error",
    tone: "red",
    alert: true,
    open: { tab: "console", label: "Open in Console", apply: (x) => {
      x.ui.logLevels = /* @__PURE__ */ new Set(["error"]);
    } },
    raw: e
  }));
  vitals.interactions.forEach((i) => out.push({
    id: `interaction:${i.id}`,
    kind: "interaction",
    start: i.start,
    end: i.start + i.duration,
    label: i.type,
    detail: `${i.target || "?"} · ${fmtMs(i.duration)} (input ${fmtMs(i.inputDelay)} · processing ${fmtMs(i.processing)} · paint ${fmtMs(i.presentation)})`,
    color: i.duration > 200 ? "--dt-red" : "--dt-k-interaction",
    tone: "blue",
    alert: i.duration > 200,
    open: { tab: "profiler", label: "Open in Vitals", apply: (x) => {
      x.ui.profilerView = "vitals";
    } },
    raw: i
  }));
  vitals.longTasks.forEach((t, i) => out.push({
    id: `longtask:${t.start}:${i}`,
    kind: "longtask",
    start: t.start,
    end: t.start + t.duration,
    label: "Long task",
    detail: `${fmtMs(t.duration)}${t.scripts?.[0] ? ` · ${t.scripts[0].source}` : ""}`,
    color: "--dt-k-longtask",
    tone: "orange",
    alert: t.duration > 200,
    raw: t
  }));
  return out.sort((a, b) => a.start - b.start);
}
function render$a(ctx) {
  const { ui, model } = ctx;
  const all = ctx.memo("tl:entries", [model.rev, ctx.vitals.interactions.length, ctx.vitals.longTasks.length, Math.floor(ctx.now() / 1e3)], () => timelineEntries(ctx));
  const counts = /* @__PURE__ */ new Map();
  for (const entry of all) counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
  const enabled = all.filter((entry) => ui.timelineKinds.has(entry.kind));
  const needle = ui.timelineFilter.trim().toLowerCase();
  const brush = ui.timelineBrush;
  const listed = enabled.filter((entry) => {
    if (needle && !`${entry.label} ${entry.detail}`.toLowerCase().includes(needle)) return false;
    if (brush && ((entry.end ?? entry.start) < brush.start || entry.start > brush.end)) return false;
    return true;
  });
  const start2 = model.firstTime ?? (all[0]?.start ?? ctx.now());
  const end = Math.max(ctx.now(), start2 + 1e3);
  const tracks = KINDS.filter((k) => ui.timelineKinds.has(k.kind) && (counts.get(k.kind) ?? 0) > 0).map((k) => ({ id: k.kind, label: k.label, color: k.color }));
  const items = enabled.map((entry) => ({ id: entry.id, track: entry.kind, start: entry.start, end: entry.end, color: entry.color, label: entry.label, detail: entry.detail, alert: entry.alert }));
  const height = Math.min(360, timelineHeight(tracks, items, start2, end));
  const selected = all.find((entry) => entry.id === ui.timelineSelected) ?? null;
  const bar = viewbar(
    ...KINDS.map((k) => filterChip({
      label: k.label,
      on: ui.timelineKinds.has(k.kind),
      count: counts.get(k.kind) ?? 0,
      swatch: `var(${k.color})`,
      testid: `tl-kind-${k.kind}`,
      onToggle: () => {
        if (ui.timelineKinds.has(k.kind)) ui.timelineKinds.delete(k.kind);
        else ui.timelineKinds.add(k.kind);
        ctx.refresh();
      }
    })),
    spacer(),
    searchField({ value: ui.timelineFilter, placeholder: "Filter events…", onInput: (v) => {
      ui.timelineFilter = v;
      ctx.refresh();
    }, width: "180px" }),
    vsep(),
    button({ label: ui.timelineView ? "Follow live" : "Live", size: "sm", icon: "live", active: ui.timelineView === null, tip: "Keep the newest events in view", onClick: () => {
      ui.timelineView = null;
      ctx.refresh();
    } }),
    iconButton({ icon: "download", label: "Export the session", onClick: () => {
      downloadText("aktion-session.json", exportSessionJson(ctx, { steps: ctx.recordedSteps() }));
      ctx.toast("Session exported", "good");
    } })
  );
  if (all.length === 0) {
    return h("div", { class: "tl", "data-dt": "timeline" }, bar, emptyState({ icon: "timeline", title: "Nothing captured yet", body: "Interact with the app — every commit, request, effect, and navigation lands on this axis." }));
  }
  const columns = [
    { key: "time", label: "Time", width: 78, align: "right", render: (e) => h("span", { class: "num t3" }, `+${fmtMs(e.start - start2)}`) },
    { key: "kind", label: "Kind", width: 96, render: (e) => chip(KINDS.find((k) => k.kind === e.kind)?.label ?? e.kind, e.tone) },
    { key: "label", label: "Event", flex: 1.4, render: (e) => h("span", { class: ["ellipsis", e.alert ? "tone-red" : ""] }, e.label) },
    { key: "detail", label: "Detail", flex: 2.6, render: (e) => h("span", { class: "ellipsis t2" }, e.detail) },
    { key: "dur", label: "Duration", width: 76, align: "right", render: (e) => h("span", { class: "num t3" }, e.end !== void 0 ? fmtMs(e.end - e.start) : "") }
  ];
  const list = dataTable({
    columns,
    rows: listed,
    rowKey: (e) => e.id,
    rowHeight: ctx.rowHeight,
    selected: ui.timelineSelected,
    onSelect: (e) => {
      ui.timelineSelected = e.id;
      ctx.refresh();
    },
    onActivate: (e) => openEntry(ctx, e),
    stickToBottom: !brush && !needle,
    testid: "timeline-list",
    ariaLabel: "Events",
    empty: emptyState({ icon: "filter", title: brush ? "Nothing in the selected range" : "No events match", body: brush ? "Double-click the chart to clear the selection." : void 0 })
  });
  const detail = selected ? h(
    "div",
    { class: "tl-detail", "data-dt": "timeline-detail" },
    h(
      "div",
      { class: "pane-head" },
      chip(KINDS.find((k) => k.kind === selected.kind)?.label ?? selected.kind, selected.tone),
      h("span", { class: "pane-title" }, selected.label),
      spacer(),
      selected.open ? button({ label: selected.open.label, size: "sm", icon: "arrowRight", onClick: () => openEntry(ctx, selected) }) : null,
      iconButton({ icon: "close", label: "Close", size: "sm", onClick: () => {
        ui.timelineSelected = null;
        ctx.refresh();
      } })
    ),
    h(
      "div",
      { class: "pane-body is-pad stack" },
      h("div", { class: "hint" }, `+${fmtMs(selected.start - start2)}${selected.end !== void 0 ? ` · ${fmtMs(selected.end - selected.start)}` : ""}`),
      h("div", { class: "t2", style: { fontSize: "var(--dt-fs-sm)" } }, selected.detail),
      valueTree({
        scope: "timeline",
        value: selected.raw,
        expanded: ui.networkExpanded,
        rowHeight: ctx.rowHeight,
        inline: true,
        onToggle: (p) => {
          if (ui.networkExpanded.has(p)) ui.networkExpanded.delete(p);
          else ui.networkExpanded.add(p);
          ctx.refresh();
        },
        editing: null,
        setEditing: () => void 0,
        onCopy: (t, w) => ctx.copy(t, w)
      })
    )
  ) : null;
  return h(
    "div",
    { class: "tl", "data-dt": "timeline" },
    bar,
    h(
      "div",
      { class: "tl-chart" },
      timelineChart({
        tracks,
        items,
        start: start2,
        end,
        view: ui.timelineView,
        onView: (view) => {
          ui.timelineView = view;
          ctx.refresh();
        },
        selected: ui.timelineSelected,
        onSelect: (id) => {
          ui.timelineSelected = id;
          ctx.refresh();
        },
        brush,
        onBrush: (range) => {
          ui.timelineBrush = range;
          ctx.refresh();
        },
        window: 15e3,
        fps: ui.timelineKinds.has("interaction") ? ctx.vitals.fpsSamples : void 0,
        height,
        ariaLabel: `Timeline of ${enabled.length} events across ${tracks.length} tracks`,
        testid: "timeline-chart"
      }),
      h(
        "div",
        { class: "tl-hint" },
        brush ? [chip(`${fmtMs(brush.end - brush.start)} selected`, "accent"), button({ label: "Clear selection", size: "sm", variant: "ghost", onClick: () => {
          ui.timelineBrush = null;
          ctx.refresh();
        } })] : h("span", { class: "t4" }, "Wheel to zoom · drag to pan · Shift+drag to select a range · double-click to reset"),
        spacer(),
        h("span", { class: "t3" }, `${listed.length} of ${all.length} events`)
      )
    ),
    detail && ctx.width() >= 820 ? split({ size: paneSize(ctx, "timeline.list", Math.round(ctx.width() * 0.62)), min: 320, onResize: (s) => setPaneSize(ctx, "timeline.list", s), first: list, second: detail }) : h("div", { class: "tl-body" }, list, detail)
  );
}
function openEntry(ctx, entry) {
  if (!entry.open) return;
  entry.open.apply(ctx);
  ctx.selectTab(entry.open.tab);
}
const timelineView = {
  id: "timeline",
  label: "Timeline",
  icon: "timeline",
  group: "activity",
  hint: "Every event on one zoomable time axis",
  keywords: "events stream history trace correlate interactions commits requests",
  render: render$a,
  commands: (ctx) => [
    { id: "live", label: "Follow the live timeline", icon: "live", run: () => {
      ctx.ui.timelineView = null;
      ctx.ui.timelineBrush = null;
      ctx.selectTab("timeline");
    } },
    { id: "errors", label: "Show only errors on the timeline", icon: "error", run: () => {
      ctx.ui.timelineKinds = /* @__PURE__ */ new Set(["error", "log"]);
      ctx.selectTab("timeline");
    } }
  ],
  css: (
    /* css */
    `
.tl { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.tl-chart { flex: none; padding: 8px 10px 4px; border-bottom: 1px solid var(--dt-border); display: flex; flex-direction: column; gap: 4px; }
.tl-hint { display: flex; align-items: center; gap: 8px; min-height: 22px; font-size: var(--dt-fs-xs); }
.tl-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.tl-body > .table { flex: 1 1 auto; }
.tl-body > .tl-detail { flex: none; max-height: 45%; border-top: 1px solid var(--dt-border); }
.tl-detail { display: flex; flex-direction: column; min-height: 0; }
`
  )
};
function matchesStatus(request, filter) {
  switch (filter) {
    case "ok":
      return request.phase === "success" && (request.status ?? 0) < 300;
    case "redirect":
      return (request.status ?? 0) >= 300 && (request.status ?? 0) < 400;
    case "client":
      return (request.status ?? 0) >= 400 && (request.status ?? 0) < 500;
    case "server":
      return (request.status ?? 0) >= 500;
    case "failed":
      return request.phase === "error" || request.phase === "blocked";
    case "mocked":
      return request.phase === "mock" || request.rule !== void 0;
    case "pending":
      return request.phase === "pending";
    default:
      return true;
  }
}
function pathOf(url) {
  try {
    const parsed2 = new URL(url, typeof location !== "undefined" ? location.href : "http://localhost/");
    const sameOrigin = typeof location !== "undefined" && parsed2.origin === location.origin;
    return { path: `${parsed2.pathname}${parsed2.search}`, host: sameOrigin ? "" : parsed2.host };
  } catch {
    return { path: url, host: "" };
  }
}
function parseBody(text2) {
  if (!text2) return { json: false };
  const trimmed = text2.trim();
  if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return { json: false };
  try {
    return { json: true, value: JSON.parse(trimmed) };
  } catch {
    return { json: false };
  }
}
function addRule(ctx, seed) {
  const rule = newRule(seed);
  ctx.ui.rules = [...ctx.ui.rules, rule];
  ctx.ui.showRules = true;
  ctx.pushRules();
  ctx.refresh();
  return rule;
}
function updateRule(ctx, id, patch2) {
  ctx.ui.rules = ctx.ui.rules.map((rule) => rule.id === id ? { ...rule, ...patch2 } : rule);
  ctx.pushRules();
  ctx.refresh();
}
function mockRequest(ctx, request) {
  const { path } = pathOf(request.url);
  const rule = addRule(ctx, {
    label: `mock ${path}`,
    pattern: path,
    method: request.method,
    action: "mock",
    status: request.status && request.status < 600 ? request.status : 200,
    body: request.responseBody ?? ""
  });
  const parsed2 = parseBody(request.responseBody);
  if (parsed2.json) {
    ctx.editJson({
      title: `Mock response for ${request.method} ${path}`,
      value: parsed2.value,
      hint: "The next matching request returns this instead of hitting the network. Refetch (or trigger the request again) to see it.",
      onSave: (value) => {
        updateRule(ctx, rule.id, { body: JSON.stringify(value) });
        ctx.toast("Mock updated", "good");
      }
    });
  } else {
    ctx.toast("Mock rule added — edit it under Rules", "good");
  }
}
const METHODS = ["", "GET", "POST", "PUT", "PATCH", "DELETE"];
function rulesPanel(ctx) {
  const { ui, model, app } = ctx;
  if (!can(app, "setNetworkRules")) return h("div", { class: "dt-pad" }, unsupported("DevTools request rules"));
  const rows = ui.rules.map((rule, index) => {
    const matches = model.network.filter((r) => findMatchingRule([{ ...rule, enabled: true, probability: void 0 }], r.method, r.url) !== null).length;
    const tone = rule.action === "mock" ? "purple" : rule.action === "delay" ? "blue" : "red";
    return h(
      "div",
      { key: rule.id, class: ["nw-rule", rule.enabled ? "" : "is-off"], "data-dt": "rule" },
      toggleSwitch({ checked: rule.enabled, onChange: (on) => updateRule(ctx, rule.id, { enabled: on }) }),
      select({
        value: rule.action,
        label: "Action",
        width: "96px",
        options: [{ value: "mock", label: "Mock" }, { value: "delay", label: "Delay" }, { value: "fail", label: "Fail" }, { value: "offline", label: "Offline" }],
        onChange: (value) => updateRule(ctx, rule.id, { action: value })
      }),
      select({
        value: rule.method ?? "",
        label: "Method",
        width: "82px",
        options: METHODS.map((m) => ({ value: m, label: m || "ANY" })),
        onChange: (value) => updateRule(ctx, rule.id, { method: value || void 0 })
      }),
      field({ value: rule.pattern, placeholder: "URL contains… (glob with *; empty = every request)", mono: true, label: "URL pattern", commitOnBlur: true, onCommit: (value) => updateRule(ctx, rule.id, { pattern: value.trim() }) }),
      rule.action === "mock" ? field({ value: String(rule.status ?? 200), type: "number", width: "70px", label: "Status", commitOnBlur: true, onCommit: (value) => updateRule(ctx, rule.id, { status: Number(value) || 200 }) }) : null,
      rule.action === "mock" ? button({ label: "Body", size: "sm", icon: "brackets", tip: "Edit the mocked response body", onClick: () => {
        const parsed2 = parseBody(rule.body);
        ctx.editJson({ title: `Mocked body — ${rule.pattern || "every request"}`, value: parsed2.json ? parsed2.value : rule.body ?? "", onSave: (value) => updateRule(ctx, rule.id, { body: typeof value === "string" ? value : JSON.stringify(value) }) });
      } }) : null,
      rule.action !== "offline" ? field({ value: String(rule.delayMs ?? 0), type: "number", width: "76px", label: "Delay ms", commitOnBlur: true, onCommit: (value) => updateRule(ctx, rule.id, { delayMs: Math.max(0, Number(value) || 0) }) }) : null,
      rule.action === "fail" || rule.action === "offline" ? select({
        value: String(rule.probability ?? 1),
        label: "How often",
        width: "92px",
        options: [{ value: "1", label: "Always" }, { value: "0.5", label: "50%" }, { value: "0.3", label: "30%" }, { value: "0.1", label: "10%" }],
        onChange: (value) => updateRule(ctx, rule.id, { probability: Number(value) >= 1 ? void 0 : Number(value) })
      }) : null,
      chip(`${matches} match${matches === 1 ? "" : "es"}`, matches > 0 ? tone : "grey", { tip: "Recorded requests this rule matches" }),
      iconButton({ icon: "chevronUp", label: "Move up", size: "sm", disabled: index === 0, onClick: () => {
        const list = [...ui.rules];
        [list[index - 1], list[index]] = [list[index], list[index - 1]];
        ui.rules = list;
        ctx.pushRules();
        ctx.refresh();
      } }),
      iconButton({ icon: "trash", label: "Delete rule", size: "sm", danger: true, onClick: () => {
        ui.rules = ui.rules.filter((r) => r.id !== rule.id);
        ctx.pushRules();
        ctx.refresh();
      } })
    );
  });
  return h(
    "div",
    { class: "nw-rules", "data-dt": "rules" },
    h(
      "div",
      { class: "nw-rules-head" },
      h("span", { class: "section-title" }, icon("filter", { size: 12 }), `Request rules (${ui.rules.filter((r) => r.enabled).length} on)`),
      h("span", { class: "t3", style: { fontSize: "var(--dt-fs-sm)" } }, "Evaluated in order; the first enabled match wins. Throttling applies after your rules."),
      spacer(),
      button({ label: "Mock", size: "sm", icon: "plus", onClick: () => addRule(ctx, { action: "mock", label: "mock" }) }),
      button({ label: "Delay", size: "sm", icon: "plus", onClick: () => addRule(ctx, { action: "delay", delayMs: 1500, label: "delay" }) }),
      button({ label: "Fail", size: "sm", icon: "plus", onClick: () => addRule(ctx, { action: "fail", label: "fail", message: "Request failed (DevTools rule)" }) }),
      ui.rules.length > 0 ? button({ label: "Remove all", size: "sm", variant: "danger", onClick: () => {
        ui.rules = [];
        ctx.pushRules();
        ctx.toast("Rules cleared");
        ctx.refresh();
      } }) : null
    ),
    rows.length === 0 ? h("div", { class: "hint", style: { padding: "0 12px 10px" } }, "No rules yet. Select a request and choose “Mock this response”, or add one above.") : h("div", { class: "nw-rule-list" }, ...rows)
  );
}
function detailPane$1(ctx, request) {
  const { ui, app } = ctx;
  const { path, host } = pathOf(request.url);
  const body = parseBody(request.responseBody);
  const payload = parseBody(request.requestBody);
  const pane = ui.networkPane;
  const kvTable = (record) => {
    const entries = Object.entries(record ?? {}).sort((a, b) => a[0].localeCompare(b[0]));
    return entries.length === 0 ? h("div", { class: "hint" }, "None recorded.") : h("div", { class: "it-attrs" }, ...entries.map(([k, v]) => h("div", { key: k, class: "it-attr" }, h("span", { class: "it-attr-k" }, k), h("span", { class: "it-attr-v" }, v))));
  };
  let content;
  switch (pane) {
    case "headers":
      content = h(
        "div",
        { class: "stack" },
        h("div", {}, h("div", { class: "it-sub" }, "General"), h(
          "div",
          { class: "it-attrs" },
          ...[["URL", request.url], ["Method", request.method], ["Status", String(request.status ?? request.phase)], ["Rule", request.rule ?? "—"]].map(([k, v]) => h("div", { key: k, class: "it-attr" }, h("span", { class: "it-attr-k" }, k), h("span", { class: "it-attr-v" }, v)))
        )),
        h("div", {}, h("div", { class: "it-sub" }, "Request headers"), kvTable(request.requestHeaders)),
        h("div", {}, h("div", { class: "it-sub" }, "Response headers"), kvTable(request.responseHeaders))
      );
      break;
    case "payload":
      content = !request.requestBody ? h("div", { class: "hint" }, "No request body (GET/HEAD, or an empty payload).") : payload.json ? valueTree({ scope: `nw-req:${request.requestId}`, value: payload.value, expanded: ui.networkExpanded, rowHeight: ctx.rowHeight, inline: true, onToggle: (p) => {
        if (ui.networkExpanded.has(p)) ui.networkExpanded.delete(p);
        else ui.networkExpanded.add(p);
        ctx.refresh();
      }, editing: null, setEditing: () => void 0, onCopy: (t, w) => ctx.copy(t, w) }) : h("pre", { class: "pre is-wrap" }, request.requestBody);
      break;
    case "timing": {
      const total = request.duration ?? Math.max(0, ctx.now() - request.startTime);
      const injected = request.injectedDelay ?? 0;
      content = h(
        "div",
        { class: "stack" },
        h(
          "div",
          { class: "nw-timing" },
          injected > 0 ? h("span", { class: "nw-timing-delay", style: { flex: `${injected} 1 0` }, "data-tip": `DevTools delay ${fmtMs(injected)}` }, "delay") : null,
          h("span", { class: "nw-timing-wait", style: { flex: `${Math.max(1e-3, total - injected)} 1 0` } }, request.phase === "pending" ? "waiting…" : "request")
        ),
        h(
          "div",
          { class: "it-attrs" },
          ...[
            ["Started", `+${fmtMs(request.startTime - (ctx.model.firstTime ?? request.startTime))} (session clock)`],
            ["Duration", fmtMs(request.duration)],
            ["Injected delay", injected ? fmtMs(injected) : "—"],
            ["Size", fmtBytes(request.responseSize)],
            ["Outcome", request.phase === "mock" ? "mocked by a DevTools rule" : request.phase]
          ].map(([k, v]) => h("div", { key: k, class: "it-attr" }, h("span", { class: "it-attr-k" }, k), h("span", { class: "it-attr-v" }, v)))
        )
      );
      break;
    }
    default:
      content = request.phase === "pending" ? h("div", { class: "hint row-flex" }, h("span", { class: "spinner" }), "Still in flight…") : !request.responseBody ? h("div", { class: "hint" }, request.error ? "No response — the request failed." : "Empty response body.") : body.json && ui.networkResponseView === "tree" ? valueTree({ scope: `nw-res:${request.requestId}`, value: body.value, expanded: ui.networkExpanded, rowHeight: ctx.rowHeight, inline: true, onToggle: (p) => {
        if (ui.networkExpanded.has(p)) ui.networkExpanded.delete(p);
        else ui.networkExpanded.add(p);
        ctx.refresh();
      }, editing: null, setEditing: () => void 0, onCopy: (t, w) => ctx.copy(t, w), testid: "response-tree" }) : h("pre", { class: "pre is-wrap nw-raw" }, request.responseBody);
  }
  const queryKey = can(app, "getQueries") ? app.getQueries().find((q) => q.key.includes(path.split("?")[0] ?? path))?.key : void 0;
  return h(
    "div",
    { class: "nw-detail", "data-dt": "request-detail" },
    h(
      "div",
      { class: "pane-head nw-detail-head" },
      chip(requestStatusLabel(request), requestTone(request)),
      h("span", { class: "nw-method" }, request.method),
      h("span", { class: "pane-title mono", title: request.url }, truncateMiddle(path, 64)),
      host ? h("span", { class: "t3" }, host) : null,
      spacer(),
      iconButton({ icon: "close", label: "Close", size: "sm", onClick: () => {
        ui.selectedRequest = null;
        ctx.refresh();
      } })
    ),
    request.error ? note("error", request.error) : null,
    h(
      "div",
      { class: "nw-actions" },
      button({ label: "Mock this response", size: "sm", icon: "wand", variant: "primary", testid: "mock-this", onClick: () => mockRequest(ctx, request) }),
      button({ label: "Fail it", size: "sm", icon: "offline", onClick: () => {
        addRule(ctx, { pattern: path, method: request.method, action: "fail", label: `fail ${path}`, message: "Request failed (DevTools rule)" });
        ctx.toast("Matching requests will now fail", "warn");
      } }),
      queryKey && can(app, "refetchQuery") ? button({ label: "Refetch", size: "sm", icon: "refresh", onClick: () => {
        app.refetchQuery(queryKey);
        ctx.toast("Refetching…");
      } }) : null,
      spacer(),
      button({ label: "cURL", size: "sm", icon: "copy", tip: "Copy as cURL", onClick: () => ctx.copy(toCurl(request), "as cURL") }),
      button({ label: "fetch", size: "sm", icon: "copy", tip: "Copy as fetch()", onClick: () => ctx.copy(toFetch(request), "as fetch()") }),
      iconButton({ icon: "link", label: "Copy URL", size: "sm", onClick: () => ctx.copy(request.url, "the URL") })
    ),
    tabs([
      { value: "response", label: "Response" },
      { value: "payload", label: "Payload" },
      { value: "headers", label: "Headers", count: Object.keys(request.requestHeaders ?? {}).length + Object.keys(request.responseHeaders ?? {}).length || null },
      { value: "timing", label: "Timing" }
    ], pane, (value) => {
      ui.networkPane = value;
      ctx.refresh();
    }, {
      trailing: pane === "response" && body.json ? segmented([{ value: "tree", label: "Tree" }, { value: "raw", label: "Raw" }], ui.networkResponseView, (v) => {
        ui.networkResponseView = v;
        ctx.refresh();
      }) : void 0
    }),
    h("div", { class: "pane-body is-pad" }, content)
  );
}
function render$9(ctx) {
  const { ui, model, app } = ctx;
  const needle = ui.networkFilter.trim().toLowerCase();
  const all = model.network;
  const rows = all.filter((r) => (!ui.networkOnlyProblems || isProblem(r)) && matchesStatus(r, ui.networkStatus) && (!needle || `${r.method} ${r.url}`.toLowerCase().includes(needle)));
  const stats = networkStats(all);
  const t0 = rows.length > 0 ? Math.min(...rows.map((r) => r.startTime)) : 0;
  const t1 = rows.length > 0 ? Math.max(...rows.map((r) => r.endTime ?? ctx.now())) : 1;
  const span = Math.max(1, t1 - t0);
  const throttleActive = ui.throttle !== "none";
  const columns = [
    { key: "status", label: "Status", width: 72, sort: (r) => r.status ?? (r.phase === "pending" ? -1 : 999), render: (r) => chip(requestStatusLabel(r), requestTone(r)) },
    { key: "method", label: "Method", width: 64, sort: (r) => r.method, render: (r) => h("span", { class: "nw-method" }, r.method) },
    { key: "name", label: "Name", flex: 2.2, sort: (r) => r.url, render: (r) => {
      const { path, host } = pathOf(r.url);
      return h("span", { class: "nw-name" }, h("span", { class: "ellipsis mono" }, path), host ? h("span", { class: "t4 nw-host" }, host) : null, r.rule ? chip(r.phase === "mock" ? "mock" : "rule", "purple", { tip: `Rule: ${r.rule}` }) : null);
    } },
    { key: "size", label: "Size", width: 70, align: "right", sort: (r) => r.responseSize ?? 0, render: (r) => h("span", { class: "num t3" }, r.responseSize ? fmtBytes(r.responseSize) : "—") },
    { key: "time", label: "Time", width: 70, align: "right", sort: (r) => r.duration ?? Infinity, render: (r) => h("span", { class: ["num", (r.duration ?? 0) > 1e3 ? "tone-amber" : "t2"] }, r.phase === "pending" ? h("span", { class: "spinner" }) : fmtMs(r.duration)) },
    { key: "waterfall", label: "Waterfall", flex: 1.6, render: (r) => {
      const start2 = (r.startTime - t0) / span * 100;
      const width = Math.max(0.6, ((r.endTime ?? ctx.now()) - r.startTime) / span * 100);
      return h("span", { class: "nw-wf" }, h("span", { class: ["nw-wf-bar", `t-${requestTone(r)}`, r.phase === "pending" ? "is-pending" : ""], style: { left: `${Math.min(99, start2)}%`, width: `${Math.min(100 - start2, width)}%` } }));
    } }
  ];
  const selected = rows.find((r) => r.requestId === ui.selectedRequest) ?? all.find((r) => r.requestId === ui.selectedRequest) ?? null;
  const table = dataTable({
    columns,
    rows,
    rowKey: (r) => r.requestId,
    rowHeight: ctx.rowHeight,
    sort: ui.networkSort,
    onSort: (sort) => {
      ui.networkSort = sort;
      ctx.refresh();
    },
    selected: ui.selectedRequest,
    onSelect: (r) => {
      ui.selectedRequest = r.requestId;
      ctx.refresh();
    },
    rowClass: (r) => isProblem(r) ? "is-error" : "",
    stickToBottom: ui.networkSort === null,
    version: Math.floor(ctx.now() / 250),
    testid: "network-table",
    ariaLabel: "Requests",
    empty: all.length === 0 ? emptyState({
      icon: "network",
      title: "No requests yet",
      body: ["Every ", h("code", {}, "$query"), ", ", h("code", {}, "$mutation"), ", and ", h("code", {}, "Http({…})"), " request the program makes while DevTools is open is recorded here. Requests from before it opened were not captured — the runtime records nothing until a panel is listening."],
      actions: can(ctx.app, "getQueries") && can(ctx.app, "refetchQuery") && ctx.app.getQueries().length > 0 ? [button({ label: "Refetch cached queries", icon: "refresh", testid: "network-refetch", onClick: () => {
        const app2 = ctx.app;
        const queries = app2.getQueries();
        for (const query of queries) app2.refetchQuery(query.key);
        ctx.toast(`Refetching ${queries.length} ${queries.length === 1 ? "query" : "queries"}`);
      } })] : void 0
    }) : emptyState({ icon: "filter", title: "No requests match the filters" })
  });
  return h(
    "div",
    { class: "nw", "data-dt": "network" },
    viewbar(
      searchField({ value: ui.networkFilter, placeholder: "Filter by URL or method…", onInput: (v) => {
        ui.networkFilter = v;
        ctx.refresh();
      }, testid: "network-filter" }),
      segmented([
        { value: "all", label: "All", count: all.length || null },
        { value: "failed", label: "Failed", count: all.filter((r) => r.phase === "error" || r.phase === "blocked").length || null },
        { value: "client", label: "4xx" },
        { value: "server", label: "5xx" },
        { value: "mocked", label: "Mocked", count: stats.mocked || null }
      ], ui.networkStatus, (v) => {
        ui.networkStatus = v;
        ctx.refresh();
      }, { label: "Status filter" }),
      spacer(),
      can(app, "setNetworkRules") ? select({
        value: ui.throttle,
        label: "Throttling",
        testid: "throttle",
        options: [
          { value: "none", label: "No throttling" },
          { value: "fast3g", label: "Fast 3G (+560ms)" },
          { value: "slow3g", label: "Slow 3G (+2s)" },
          { value: "flaky", label: "Flaky (30% fail)" },
          { value: "offline", label: "Offline" }
        ],
        onChange: (value) => {
          ui.throttle = value;
          ctx.pushRules();
          ctx.toast(value === "none" ? "Throttling off" : `Throttling: ${value}`, value === "none" ? "info" : "warn");
          ctx.refresh();
        }
      }) : null,
      button({ label: `Rules${ui.rules.length ? ` (${ui.rules.filter((r) => r.enabled).length})` : ""}`, size: "sm", icon: "filter", active: ui.showRules, testid: "rules-toggle", onClick: () => {
        ui.showRules = !ui.showRules;
        ctx.refresh();
      } }),
      vsep(),
      iconButton({ icon: "download", label: "Export HAR", onClick: () => {
        downloadText("aktion-network.har", toHar(all, { epochOffset: ctx.epochOffset, version: ctx.hook.libraryVersion }), "application/json");
        ctx.toast("HAR exported", "good");
      } }),
      iconButton({ icon: "trash", label: "Clear requests", onClick: () => {
        model.network.length = 0;
        model.revs.network += 1;
        model.rev += 1;
        ui.selectedRequest = null;
        ctx.refresh();
      } })
    ),
    !ctx.hook.options.captureNetwork ? note("warn", "Network capture is off — turn it back on in Settings → Instrumentation.") : null,
    throttleActive ? h("div", { class: "nw-banner" }, icon("gauge", { size: 13 }), `Throttling is on (${ui.throttle}). Every request is affected until you turn it off.`, spacer(), button({ label: "Turn off", size: "sm", onClick: () => {
      ui.throttle = "none";
      ctx.pushRules();
      ctx.refresh();
    } })) : null,
    ui.showRules ? rulesPanel(ctx) : null,
    h(
      "div",
      { class: "nw-summary" },
      h("span", {}, h("b", {}, String(stats.total)), " requests"),
      stats.pending > 0 ? h("span", { class: "tone-blue" }, h("b", {}, String(stats.pending)), " pending") : null,
      stats.failed > 0 ? h("span", { class: "tone-red" }, h("b", {}, String(stats.failed)), " failed") : null,
      h("span", {}, h("b", {}, fmtBytes(stats.bytes)), " transferred"),
      stats.total > 0 ? h("span", {}, "avg ", h("b", {}, fmtMs(stats.avgDuration))) : null,
      stats.slowest ? h("button", { type: "button", class: "link", onClick: () => {
        ui.selectedRequest = stats.slowest.requestId;
        ctx.refresh();
      } }, `slowest ${fmtMs(stats.slowest.duration)}`) : null
    ),
    selected && ctx.width() >= 820 ? split({ size: paneSize(ctx, "network.table", Math.round(ctx.width() * 0.56)), min: 320, onResize: (s) => setPaneSize(ctx, "network.table", s), first: table, second: detailPane$1(ctx, selected) }) : selected ? split({ direction: "col", size: paneSize(ctx, "network.table.col", 220), min: 120, onResize: (s) => setPaneSize(ctx, "network.table.col", s), first: table, second: detailPane$1(ctx, selected) }) : table
  );
}
const networkView = {
  id: "network",
  label: "Network",
  icon: "network",
  group: "activity",
  hint: "Requests, responses, mocking, throttling",
  keywords: "http requests fetch query mutation mock offline delay rules har curl throttle flaky",
  badge: (ctx) => {
    const failed = ctx.model.network.filter(isProblem).length;
    if (failed > 0) return { value: failed, tone: "red" };
    return ctx.ui.throttle !== "none" ? { value: "!", tone: "amber" } : null;
  },
  render: render$9,
  commands: (ctx) => [
    { id: "offline", label: ctx.ui.throttle === "offline" ? "Go back online" : "Simulate offline", icon: "offline", run: () => {
      ctx.ui.throttle = ctx.ui.throttle === "offline" ? "none" : "offline";
      ctx.pushRules();
      ctx.toast(ctx.ui.throttle === "offline" ? "Offline — every request fails" : "Back online");
    } },
    { id: "slow3g", label: "Throttle to Slow 3G", icon: "gauge", run: () => {
      ctx.ui.throttle = "slow3g";
      ctx.pushRules();
      ctx.toast("Slow 3G");
    } },
    { id: "flaky", label: "Make the network flaky (30% fail)", icon: "dice", run: () => {
      ctx.ui.throttle = "flaky";
      ctx.pushRules();
      ctx.toast("Flaky network on");
    } },
    { id: "har", label: "Export network as HAR", icon: "download", run: () => downloadText("aktion-network.har", toHar(ctx.model.network, { epochOffset: ctx.epochOffset }), "application/json") }
  ],
  css: (
    /* css */
    `
.nw { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.nw > .note { margin: 8px 10px 0; }
.nw-banner { flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: var(--dt-amber-soft); color: var(--dt-amber); font-size: var(--dt-fs-sm); font-weight: 550; }
.nw-summary { flex: none; display: flex; align-items: center; gap: 14px; padding: 5px 12px; font-size: var(--dt-fs-sm); color: var(--dt-text-3); border-bottom: 1px solid var(--dt-border); }
.nw-summary b { color: var(--dt-text); font-variant-numeric: tabular-nums; }
.nw-method { font-family: var(--dt-mono); font-size: var(--dt-fs-mono); font-weight: 650; color: var(--dt-text-2); }
.nw-name { display: flex; align-items: center; gap: 6px; min-width: 0; width: 100%; }
.nw-host { flex: none; font-size: var(--dt-fs-xs); }
.nw-wf { position: relative; display: block; width: 100%; height: 8px; border-radius: 4px; background: rgba(127, 127, 127, 0.08); }
.nw-wf-bar { position: absolute; top: 0; bottom: 0; border-radius: 4px; background: var(--dt-cyan); min-width: 3px; }
.nw-wf-bar.t-red { background: var(--dt-red); }
.nw-wf-bar.t-amber { background: var(--dt-amber); }
.nw-wf-bar.t-purple { background: var(--dt-purple); }
.nw-wf-bar.t-blue { background: var(--dt-blue); }
.nw-wf-bar.t-grey { background: var(--dt-text-4); }
.nw-wf-bar.is-pending { background: repeating-linear-gradient(90deg, var(--dt-blue) 0 6px, transparent 6px 10px); }
.nw-detail { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.nw-detail > .note { margin: 8px 12px 0; }
.nw-actions { flex: none; display: flex; align-items: center; gap: 6px; padding: 8px 12px; flex-wrap: wrap; }
.nw-raw { max-height: none; }
.nw-timing { display: flex; gap: 2px; height: 22px; border-radius: 6px; overflow: hidden; font-size: var(--dt-fs-xs); font-weight: 650; }
.nw-timing > span { display: flex; align-items: center; justify-content: center; color: #fff; min-width: 40px; }
.nw-timing-delay { background: var(--dt-amber); color: #1b1305 !important; }
.nw-timing-wait { background: var(--dt-cyan); }
.nw-rules { flex: none; border-bottom: 1px solid var(--dt-border); background: var(--dt-bg-elev); max-height: 46%; overflow: auto; }
.nw-rules-head { display: flex; align-items: center; gap: 8px; padding: 8px 12px; flex-wrap: wrap; }
.nw-rule-list { display: flex; flex-direction: column; gap: 6px; padding: 0 12px 10px; }
.nw-rule { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: var(--dt-r); background: var(--dt-bg); border: 1px solid var(--dt-border); }
.nw-rule > .input:not([type="number"]) { flex: 1 1 200px; }
.nw-rule.is-off { opacity: 0.55; }
`
  )
};
const LEVEL_ICON = { error: "error", warn: "warning", info: "info", debug: "bug", log: "dot", input: "chevronRight" };
function lines(ctx) {
  const { model, ui } = ctx;
  const out = [];
  model.logs.forEach((log, i) => out.push({
    id: `l${i}:${log.time}`,
    kind: "log",
    level: log.level,
    time: log.time,
    text: log.text,
    origin: log.origin,
    count: log.count,
    stack: log.stack,
    args: log.args
  }));
  model.errors.forEach((error, i) => out.push({
    id: `e${i}:${error.time}`,
    kind: "error",
    level: "error",
    time: error.time + ctx.epochOffset,
    text: `${error.phase} error${error.subject ? ` in ${error.subject}` : ""}: ${error.message}`,
    origin: "runtime",
    count: 1,
    stack: error.stack
  }));
  ui.repl.forEach((entry, i) => {
    out.push({ id: `r${i}:in`, kind: "input", level: "input", time: entry.time, text: entry.input, origin: "repl", count: 1 });
    out.push({ id: `r${i}:out`, kind: "result", level: entry.ok ? "log" : "error", time: entry.time + 1e-3, text: entry.output, origin: "repl", count: 1, value: entry.value, hasValue: entry.hasValue });
  });
  return out.sort((a, b) => a.time - b.time);
}
function evaluate(ctx, source) {
  const { app, ui } = ctx;
  if (!can(app, "evaluateExpression")) return;
  const text2 = source.trim();
  if (!text2) return;
  const result = app.evaluateExpression(text2);
  let value;
  let hasValue = false;
  if (result.ok && result.text !== void 0) {
    try {
      value = JSON.parse(result.text);
      hasValue = typeof value === "object" && value !== null;
    } catch {
      hasValue = false;
    }
  }
  ui.repl = [...ui.repl.slice(-80), {
    input: text2,
    ok: result.ok,
    output: result.ok ? result.value?.preview ?? "undefined" : result.error ?? "evaluation failed",
    value,
    hasValue,
    time: Date.now()
  }];
  ui.replHistory = [...ui.replHistory.filter((h2) => h2 !== text2), text2].slice(-60);
  ui.replCursor = -1;
  ui.replDraft = "";
  ui.consoleSelected = null;
  ctx.refresh();
}
function completions(ctx, draft) {
  const match = /(\$[A-Za-z_][\w.]*|\$)$/.exec(draft);
  if (!match) return [];
  const token = match[1];
  const atoms = Object.keys(ctx.model.state).map((name) => `$${name}`);
  const namespaces = ["$util.", "$router.", "$theme", "$toast."];
  return [...atoms, ...namespaces].filter((candidate) => candidate.startsWith(token) && candidate !== token).slice(0, 8);
}
function render$8(ctx) {
  const { app, ui, model } = ctx;
  if (!app && !ctx.imported && model.logs.length === 0) return noApp(ctx, "The Console", "console");
  const all = ctx.memo("con:lines", [model.revs.log, model.revs.error, ui.repl.length], () => lines(ctx));
  const counts = { error: 0, warn: 0, info: 0, log: 0, debug: 0 };
  for (const line of all) if ((line.kind === "log" || line.kind === "error") && line.level !== "input") counts[line.level] += line.count;
  const needle = ui.logFilter.trim().toLowerCase();
  const visible = all.filter((line) => {
    if (line.kind === "input" || line.kind === "result") return !needle || line.text.toLowerCase().includes(needle);
    if (!ui.logLevels.has(line.level)) return false;
    if (ui.logOrigin !== "all" && line.origin !== ui.logOrigin) return false;
    return !needle || line.text.toLowerCase().includes(needle);
  });
  const selected = visible.find((line) => line.id === ui.consoleSelected) ?? null;
  const toggleLevel = (level) => {
    if (ui.logLevels.has(level)) ui.logLevels.delete(level);
    else ui.logLevels.add(level);
    ctx.refresh();
  };
  const onlyLevel = (level) => {
    ui.logLevels = /* @__PURE__ */ new Set([level]);
    ctx.refresh();
  };
  const list = virtualList({
    items: visible,
    rowHeight: ctx.rowHeight,
    rowKey: (line) => line.id,
    stickToBottom: true,
    version: [ui.consoleSelected, model.rev, ui.repl.length],
    testid: "console-list",
    role: "log",
    ariaLabel: "Console output",
    empty: emptyState({
      icon: "console",
      title: all.length === 0 ? ui.captureConsole ? "Nothing logged yet" : "Console capture is off" : "Nothing matches the filters",
      body: all.length === 0 ? ["Program ", h("code", {}, "console.log(…)"), " output, every ", h("code", {}, "[aktion]"), " runtime diagnostic, and uncaught errors land here. Try an expression below."] : void 0
    }),
    renderRow: (line) => h(
      "div",
      {
        class: ["con-row", `lv-${line.level}`, line.kind === "input" ? "is-input" : "", line.kind === "result" ? "is-result" : "", selected?.id === line.id ? "is-selected" : ""],
        "data-dt": "console-row",
        onClick: () => {
          ui.consoleSelected = selected?.id === line.id ? null : line.id;
          ctx.refresh();
        }
      },
      h("span", { class: "con-ic" }, icon(line.kind === "result" ? line.level === "error" ? "error" : "chevronLeft" : LEVEL_ICON[line.level] ?? "dot", { size: 12 })),
      h("span", { class: "con-time" }, fmtClock(line.time)),
      line.origin === "runtime" ? chip("runtime", "purple") : null,
      h("span", { class: ["con-text", line.kind === "input" || line.kind === "result" ? "mono" : ""] }, line.text.split("\n")[0]),
      line.count > 1 ? h("span", { class: "badge" }, `×${line.count}`) : null,
      line.stack || line.text.includes("\n") || line.hasValue ? h("span", { class: "con-more" }, icon("chevronRight", { size: 11 })) : null
    )
  });
  const detail = selected ? h(
    "div",
    { class: "con-detail", "data-dt": "console-detail" },
    h(
      "div",
      { class: "pane-head" },
      h("span", { class: ["con-ic", `lv-${selected.level}`] }, icon(LEVEL_ICON[selected.level] ?? "dot", { size: 13 })),
      h("span", { class: "pane-title" }, selected.kind === "result" ? "Result" : selected.kind === "input" ? "Expression" : selected.level),
      h("span", { class: "t3" }, fmtClock(selected.time)),
      spacer(),
      iconButton({ icon: "copy", label: "Copy", size: "sm", onClick: () => ctx.copy(selected.stack ? `${selected.text}
${selected.stack}` : selected.text, "the message") }),
      iconButton({ icon: "close", label: "Close", size: "sm", onClick: () => {
        ui.consoleSelected = null;
        ctx.refresh();
      } })
    ),
    h(
      "div",
      { class: "pane-body is-pad stack" },
      selected.hasValue ? valueTree({ scope: `repl:${selected.id}`, value: selected.value, expanded: ui.replExpanded, rowHeight: ctx.rowHeight, inline: true, onToggle: (p) => {
        if (ui.replExpanded.has(p)) ui.replExpanded.delete(p);
        else ui.replExpanded.add(p);
        ctx.refresh();
      }, editing: null, setEditing: () => void 0, onCopy: (t, w) => ctx.copy(t, w) }) : h("pre", { class: "pre is-wrap" }, selected.text),
      selected.args && selected.args.length > 1 ? h("div", {}, h("div", { class: "it-sub" }, `Arguments (${selected.args.length})`), h("div", { class: "it-attrs" }, ...selected.args.map((arg, i) => h("div", { key: i, class: "it-attr" }, h("span", { class: "it-attr-k" }, String(i)), h("span", { class: "it-attr-v" }, arg))))) : null,
      selected.stack ? h("div", {}, h("div", { class: "it-sub" }, "Stack"), h("pre", { class: "pre con-stack" }, selected.stack)) : null
    )
  ) : null;
  const suggestions = completions(ctx, ui.replDraft);
  const canEval = can(app, "evaluateExpression");
  const repl = h(
    "div",
    { class: "con-repl" },
    suggestions.length > 0 ? h("div", { class: "con-suggest", role: "listbox" }, ...suggestions.map((s) => h("button", {
      key: s,
      type: "button",
      class: "con-suggest-item",
      role: "option",
      onClick: () => {
        ui.replDraft = ui.replDraft.replace(/(\$[A-Za-z_][\w.]*|\$)$/, s);
        ctx.refresh();
      }
    }, s))) : null,
    h("span", { class: "con-prompt" }, icon("chevronRight", { size: 14 })),
    h("input", {
      class: "con-input",
      "data-dt": "repl",
      value: ui.replDraft,
      placeholder: canEval ? "$count + 1   ·   $user.name   ·   $count = 5   ·   $todos.filter(t => !t.done).length" : "This runtime cannot evaluate expressions",
      disabled: !canEval || void 0,
      spellcheck: "false",
      autocomplete: "off",
      "aria-label": "Evaluate an Aktion expression",
      ref: ui.tab === "console" ? autofocus() : void 0,
      onInput: (event) => {
        ui.replDraft = event.target.value;
        if (/\$[\w.]*$/.test(ui.replDraft)) ctx.refresh();
      },
      onKeyDown: (event) => {
        const input = event.target;
        if (event.key === "Enter") {
          event.preventDefault();
          evaluate(ctx, input.value);
        } else if (event.key === "Tab" && suggestions.length > 0) {
          event.preventDefault();
          ui.replDraft = input.value.replace(/(\$[A-Za-z_][\w.]*|\$)$/, suggestions[0]);
          ctx.refresh();
        } else if (event.key === "ArrowUp" && ui.replHistory.length > 0) {
          event.preventDefault();
          ui.replCursor = ui.replCursor < 0 ? ui.replHistory.length - 1 : Math.max(0, ui.replCursor - 1);
          ui.replDraft = ui.replHistory[ui.replCursor] ?? "";
          ctx.refresh();
        } else if (event.key === "ArrowDown" && ui.replCursor >= 0) {
          event.preventDefault();
          ui.replCursor = ui.replCursor + 1 >= ui.replHistory.length ? -1 : ui.replCursor + 1;
          ui.replDraft = ui.replCursor < 0 ? "" : ui.replHistory[ui.replCursor] ?? "";
          ctx.refresh();
        } else if (event.key === "l" && event.ctrlKey) {
          event.preventDefault();
          ui.repl = [];
          ctx.refresh();
        }
      }
    }),
    button({ label: "Run", size: "sm", variant: "primary", disabled: !canEval, onClick: () => evaluate(ctx, ui.replDraft), kbd: "↵" }),
    iconButton({ icon: "eye", label: "Watch this expression", size: "sm", disabled: !ui.replDraft.trim(), onClick: () => {
      const expr = ui.replDraft.trim();
      if (!expr || ui.watches.includes(expr)) return;
      ui.watches = [...ui.watches, expr].slice(-20);
      ctx.persist();
      ctx.toast(`Watching ${expr}`, "good");
    } })
  );
  const watches = ui.watches.length > 0 && canEval ? h(
    "div",
    { class: "con-watches", "data-dt": "watches" },
    h("span", { class: "section-title" }, icon("eye", { size: 12 }), "Watch"),
    ...ui.watches.map((expr) => {
      const result = app.evaluateExpression(expr);
      return h(
        "span",
        { key: expr, class: ["con-watch", result.ok ? "" : "is-error"] },
        h("code", {}, expr),
        h("span", { class: "t4" }, "="),
        h("span", { class: ["v", result.ok ? `t-${result.value?.type ?? "undefined"}` : "t-error"] }, result.ok ? result.value?.preview ?? "undefined" : result.error ?? "failed"),
        h("button", { type: "button", class: "ibtn is-sm", "aria-label": `Stop watching ${expr}`, onClick: () => {
          ui.watches = ui.watches.filter((w) => w !== expr);
          ctx.persist();
          ctx.refresh();
        } }, icon("close", { size: 10 }))
      );
    })
  ) : null;
  return h(
    "div",
    { class: "con", "data-dt": "console" },
    viewbar(
      filterChip({ label: "Errors", on: ui.logLevels.has("error"), count: counts.error, swatch: "var(--dt-red)", onToggle: () => toggleLevel("error"), tip: "Double-click to show only errors", testid: "lvl-error" }),
      filterChip({ label: "Warnings", on: ui.logLevels.has("warn"), count: counts.warn, swatch: "var(--dt-amber)", onToggle: () => toggleLevel("warn"), testid: "lvl-warn" }),
      filterChip({ label: "Info", on: ui.logLevels.has("info"), count: counts.info, swatch: "var(--dt-blue)", onToggle: () => toggleLevel("info") }),
      filterChip({ label: "Log", on: ui.logLevels.has("log"), count: counts.log, swatch: "var(--dt-grey)", onToggle: () => toggleLevel("log") }),
      filterChip({ label: "Debug", on: ui.logLevels.has("debug"), count: counts.debug, swatch: "var(--dt-purple)", onToggle: () => toggleLevel("debug") }),
      ui.logLevels.size < 5 ? button({ label: "All levels", size: "sm", variant: "ghost", onClick: () => {
        ui.logLevels = /* @__PURE__ */ new Set(["log", "info", "warn", "error", "debug"]);
        ctx.refresh();
      } }) : null,
      counts.error > 0 && ui.logLevels.size !== 1 ? button({ label: "Only errors", size: "sm", variant: "ghost", onClick: () => onlyLevel("error") }) : null,
      spacer(),
      segmented([{ value: "all", label: "All" }, { value: "program", label: "App" }, { value: "runtime", label: "Runtime" }], ui.logOrigin, (v) => {
        ui.logOrigin = v;
        ctx.refresh();
      }, { label: "Origin" }),
      searchField({ value: ui.logFilter, placeholder: "Filter output…", onInput: (v) => {
        ui.logFilter = v;
        ctx.refresh();
      }, width: "170px", testid: "console-filter" }),
      vsep(),
      toggleSwitch({ checked: ui.captureConsole, label: "Capture", onChange: (on) => {
        ui.captureConsole = on;
        ctx.persist();
        ctx.toast(on ? "Capturing console output" : "Console capture off");
        ctx.refresh();
      } }),
      iconButton({ icon: "download", label: "Export as text", onClick: () => downloadText("aktion-console.txt", all.map((l) => `${new Date(l.time).toISOString()} [${l.level}] (${l.origin}) ${l.text}${l.count > 1 ? ` (×${l.count})` : ""}${l.stack ? `
${l.stack}` : ""}`).join("\n"), "text/plain") }),
      iconButton({ icon: "trash", label: "Clear the console", onClick: () => {
        model.logs.length = 0;
        model.errors.length = 0;
        model.revs.log += 1;
        model.revs.error += 1;
        model.rev += 1;
        ui.repl = [];
        ui.consoleSelected = null;
        ctx.refresh();
      } })
    ),
    watches,
    h(
      "div",
      { class: "con-body" },
      detail && ctx.width() >= 860 ? split({ size: paneSize(ctx, "console.list", Math.round(ctx.width() * 0.6)), min: 320, onResize: (s) => setPaneSize(ctx, "console.list", s), first: list, second: detail }) : detail ? split({ direction: "col", size: paneSize(ctx, "console.list.col", Math.round(ctx.height() * 0.35)), min: 100, onResize: (s) => setPaneSize(ctx, "console.list.col", s), first: list, second: detail }) : list
    ),
    repl
  );
}
const consoleView = {
  id: "console",
  label: "Console",
  icon: "console",
  group: "activity",
  hint: "Logs, runtime diagnostics, errors, and a live REPL",
  keywords: "logs warnings errors repl evaluate expression watch console",
  badge: (ctx) => {
    let errors = ctx.model.errors.length;
    for (const log of ctx.model.logs) if (log.level === "error") errors += log.count;
    return errors > 0 ? { value: errors, tone: "red" } : null;
  },
  render: render$8,
  commands: (ctx) => [
    { id: "errors", label: "Show only errors", icon: "error", run: () => {
      ctx.ui.logLevels = /* @__PURE__ */ new Set(["error"]);
      ctx.selectTab("console");
    } },
    { id: "clear", label: "Clear the console", icon: "trash", run: () => {
      ctx.model.logs.length = 0;
      ctx.model.errors.length = 0;
      ctx.model.revs.log += 1;
      ctx.ui.repl = [];
      ctx.refresh();
    } }
  ],
  css: (
    /* css */
    `
.con { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.con-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.con-row { display: flex; align-items: center; gap: 8px; height: 100%; padding: 0 12px; border-bottom: 1px solid var(--dt-border); color: var(--dt-text); font-size: var(--dt-fs-sm); cursor: default; min-width: 0; }
.con-row:hover { background: var(--dt-bg-hover); }
.con-row.is-selected { background: var(--dt-bg-selected); }
.con-row.lv-error { background: var(--dt-red-soft); color: var(--dt-red); }
.con-row.lv-warn { background: var(--dt-amber-soft); color: var(--dt-amber); }
.con-row.lv-debug { color: var(--dt-text-3); }
.con-row.is-input { color: var(--dt-syn-state); background: transparent; }
.con-row.is-result { color: var(--dt-text-2); background: transparent; }
.con-row.is-result.lv-error { color: var(--dt-red); }
.con-ic { flex: none; display: inline-flex; width: 14px; justify-content: center; }
.con-row.lv-info .con-ic { color: var(--dt-blue); }
.con-row.lv-log .con-ic { color: var(--dt-text-4); }
.con-time { flex: none; font-family: var(--dt-mono); font-size: 10.5px; color: var(--dt-text-4); font-variant-numeric: tabular-nums; }
.con-row.lv-error .con-time, .con-row.lv-warn .con-time { color: inherit; opacity: 0.7; }
.con-text { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.con-more { color: var(--dt-text-4); flex: none; }
.con-detail { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.con-stack { font-size: 10.5px; max-height: 260px; }
.con-repl { position: relative; flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-top: 1px solid var(--dt-border); background: var(--dt-bg-elev); }
.con-prompt { color: var(--dt-accent-text); display: inline-flex; }
.con-input { flex: 1; min-width: 0; height: 28px; border: 0; background: transparent; outline: none; color: var(--dt-text); font-family: var(--dt-mono); font-size: var(--dt-fs-mono); }
.con-input::placeholder { color: var(--dt-text-4); }
.con-suggest { position: absolute; left: 34px; bottom: 100%; margin-bottom: 4px; min-width: 200px; padding: 4px; border-radius: 8px; background: var(--dt-bg-elev-2); border: 1px solid var(--dt-border-strong); box-shadow: var(--dt-shadow-md); display: flex; flex-direction: column; z-index: 5; }
.con-suggest-item { text-align: left; padding: 4px 8px; border-radius: 5px; border: 0; background: none; font-family: var(--dt-mono); font-size: var(--dt-fs-mono); color: var(--dt-syn-state); }
.con-suggest-item:first-child, .con-suggest-item:hover { background: var(--dt-bg-selected); }
.con-watches { flex: none; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 6px 12px; border-bottom: 1px solid var(--dt-border); background: var(--dt-bg-elev); }
.con-watch { display: inline-flex; align-items: center; gap: 6px; padding: 2px 4px 2px 8px; border-radius: 6px; background: var(--dt-bg); border: 1px solid var(--dt-border); max-width: 360px; min-width: 0; }
.con-watch code { font-family: var(--dt-mono); font-size: var(--dt-fs-mono); color: var(--dt-syn-state); white-space: nowrap; }
.con-watch.is-error { border-color: var(--dt-red); }
`
  )
};
const PHASE_TONE = { mount: "green", run: "blue", cleanup: "purple", unmount: "grey", error: "red" };
const PHASES = ["mount", "run", "cleanup", "unmount", "error"];
function rowsOf(ctx) {
  const { app, model } = ctx;
  const mounted = can(app, "getEffects") ? ctx.cache("effects", () => app.getEffects()) : [];
  const aggregates = new Map(effectAggregates(model.effects).map((agg) => [agg.effectKey, agg]));
  const keys2 = /* @__PURE__ */ new Set([...mounted.map((e) => e.effectKey), ...aggregates.keys()]);
  return [...keys2].map((key2) => {
    const info = mounted.find((e) => e.effectKey === key2) ?? null;
    const agg = aggregates.get(key2) ?? null;
    const label = info ? effectLabel({ label: info.label, triggers: info.triggers, deps: info.stateDeps }) : agg?.label ?? key2;
    return { key: key2, info, agg, label };
  });
}
function insightsFor(row2) {
  const out = [];
  const agg = row2.agg;
  if (!agg) return out;
  if (agg.errors > 0) out.push({ tone: "bad", text: `Threw ${agg.errors}× — anything after the throw never runs.` });
  if (agg.runs >= 20 && (row2.info?.intervals.length ?? 0) === 0) out.push({ tone: "warn", text: `Ran ${agg.runs}× on ${agg.triggers} — a hot trigger. Narrow the dependency list, or add debounce(300).` });
  if (agg.runs >= 1 && agg.total / agg.runs >= 6) out.push({ tone: "warn", text: `Averages ${fmtMs(agg.total / agg.runs)} per run — heavy synchronous work in an effect body delays the next paint.` });
  if (agg.mounts >= 4) out.push({ tone: "warn", text: `Mounted ${agg.mounts}× — its owning component is remounting (a changing key:, or a conditional branch flipping).` });
  return out;
}
function detailPane(ctx, row2) {
  const { app, model, ui } = ctx;
  const events = model.effects.filter((e) => e.effectKey === row2.key).slice(-40).reverse();
  const insights = insightsFor(row2);
  const agg = row2.agg;
  return h(
    "div",
    { class: "fx-detail", "data-dt": "effect-detail" },
    h(
      "div",
      { class: "pane-head" },
      icon("effects", { size: 15 }),
      h("span", { class: "pane-title" }, row2.label),
      row2.info?.source ? h("button", { type: "button", class: "link mono", onClick: () => {
        ui.sourceFocusLine = row2.info.source.line;
        ctx.selectTab("source");
      } }, `L${row2.info.source.line}`) : null,
      spacer(),
      row2.info && can(app, "runEffect") ? button({ label: "Run now", size: "sm", icon: "play", variant: "primary", onClick: () => {
        const ok = app.runEffect(row2.key);
        ctx.toast(ok ? `Ran ${row2.label}` : "No longer mounted", ok ? "good" : "warn");
      } }) : null,
      iconButton({ icon: "close", label: "Close", size: "sm", onClick: () => {
        ui.selectedEffect = null;
        ctx.refresh();
      } })
    ),
    h(
      "div",
      { class: "pane-body is-pad stack" },
      statGrid(
        stat({ label: "Runs", value: String(agg?.runs ?? 0) }),
        stat({ label: "Avg", value: agg && agg.runs ? fmtMs(agg.total / agg.runs) : "—", tone: agg && agg.runs && agg.total / agg.runs >= 6 ? "amber" : void 0 }),
        stat({ label: "Slowest", value: agg ? fmtMs(agg.max) : "—" }),
        stat({ label: "Errors", value: String(agg?.errors ?? 0), tone: agg && agg.errors > 0 ? "red" : void 0 }),
        stat({ label: "Mounts", value: String(agg?.mounts ?? 0) })
      ),
      ...insights.map((insight) => note(insight.tone === "bad" ? "error" : "warn", insight.text)),
      row2.info ? h(
        "div",
        { class: "stack" },
        h("div", {}, h("div", { class: "it-sub" }, "Triggers"), h("code", { class: "fx-code" }, row2.info.triggers)),
        row2.info.stateDeps.length > 0 ? h("div", {}, h("div", { class: "it-sub" }, "Subscribes to"), h("div", { class: "chips" }, ...row2.info.stateDeps.map((dep) => atomChip(ctx, dep, "green")))) : null,
        row2.info.intervals.length > 0 ? h("div", {}, h("div", { class: "it-sub" }, "Timers"), h("div", { class: "chips" }, ...row2.info.intervals.map((ms) => chip(`every ${ms}ms`, "cyan")))) : null,
        row2.info.instanceKey ? h("div", {}, h("div", { class: "it-sub" }, "Owner"), button({ label: row2.info.instanceKey.split("#").pop()?.split("@")[0] ?? row2.info.instanceKey, size: "sm", icon: "puzzle", onClick: () => ctx.selectInstance(row2.info.instanceKey) })) : h("div", { class: "hint" }, "Top-level effect (not owned by a component)."),
        h("div", { class: "hint" }, `${row2.info.cleanups} cleanup handler${row2.info.cleanups === 1 ? "" : "s"} registered.`)
      ) : note("plain", "This effect is no longer mounted; its history is shown below."),
      h(
        "div",
        {},
        h("div", { class: "it-sub" }, `Recent lifecycle (${events.length})`),
        events.length === 0 ? h("div", { class: "hint" }, "No events recorded.") : h("div", { class: "fx-events" }, ...events.map((event, i) => h(
          "div",
          { key: `${event.time}:${i}`, class: "fx-event" },
          chip(event.phase, PHASE_TONE[event.phase]),
          h("span", { class: "t2 ellipsis grow" }, event.reason),
          event.duration !== void 0 ? h("span", { class: "num t3" }, fmtMs(event.duration)) : null,
          event.error ? h("span", { class: "tone-red ellipsis" }, event.error) : null
        )))
      )
    )
  );
}
function render$7(ctx) {
  const { app, ui, model } = ctx;
  if (!app && !ctx.imported) return noApp(ctx, "Effects", "effects");
  if (app && !can(app, "getEffects") && model.effects.length === 0) return h("div", { class: "dt-pad" }, unsupported("its mounted effects"));
  const view = ui.effectView;
  const needle = ui.effectFilter.trim().toLowerCase();
  const rows = rowsOf(ctx).filter((row2) => !needle || `${row2.label} ${row2.key} ${row2.info?.triggers ?? ""}`.toLowerCase().includes(needle));
  const selected = rows.find((row2) => row2.key === ui.selectedEffect) ?? null;
  const events = model.effects.filter((e) => ui.phaseFilter.has(e.phase) && (!needle || `${e.label} ${e.reason}`.toLowerCase().includes(needle)));
  const bar = viewbar(
    segmented([
      { value: "mounted", label: "Mounted", icon: "effects", count: rows.filter((r) => r.info).length || null },
      { value: "timeline", label: "Timeline", icon: "timeline" },
      { value: "log", label: "Log", icon: "list", count: model.effects.length || null }
    ], view, (value) => {
      ui.effectView = value;
      ctx.refresh();
    }, { label: "Effects view" }),
    searchField({ value: ui.effectFilter, placeholder: "Filter effects…", onInput: (v) => {
      ui.effectFilter = v;
      ctx.refresh();
    } }),
    spacer(),
    ...view !== "mounted" ? PHASES.map((phase) => filterChip({
      label: phase,
      on: ui.phaseFilter.has(phase),
      count: model.effects.filter((e) => e.phase === phase).length,
      onToggle: () => {
        if (ui.phaseFilter.has(phase)) ui.phaseFilter.delete(phase);
        else ui.phaseFilter.add(phase);
        ctx.refresh();
      }
    })) : [],
    vsep(),
    iconButton({ icon: "trash", label: "Clear the effect log", onClick: () => {
      model.effects.length = 0;
      model.revs.effect += 1;
      model.rev += 1;
      ctx.refresh();
    } })
  );
  let body;
  if (view === "timeline") {
    const top = rows.filter((r) => r.agg).sort((a, b) => b.agg.runs + b.agg.mounts - (a.agg.runs + a.agg.mounts)).slice(0, 24);
    const tracks = top.map((row2) => ({ id: row2.key, label: row2.label, color: "--dt-k-effect" }));
    const trackIds = new Set(tracks.map((t) => t.id));
    const items = events.filter((e) => trackIds.has(e.effectKey)).map((e, i) => ({
      id: `${e.effectKey}:${e.time}:${i}`,
      track: e.effectKey,
      start: e.phase === "run" && e.duration ? e.time - e.duration : e.time,
      end: e.phase === "run" && e.duration ? e.time : void 0,
      color: e.phase === "error" ? "--dt-red" : e.phase === "run" ? "--dt-k-effect" : e.phase === "cleanup" ? "--dt-purple" : "--dt-text-4",
      label: `${e.label} · ${e.phase}`,
      detail: e.reason,
      alert: e.phase === "error"
    }));
    const start2 = model.firstTime ?? ctx.now();
    const end = Math.max(ctx.now(), start2 + 1e3);
    body = tracks.length === 0 ? emptyState({ icon: "effects", title: "No effect activity yet" }) : h("div", { class: "dt-scroll dt-pad" }, timelineChart({
      tracks,
      items,
      start: start2,
      end,
      view: ui.timelineView,
      onView: (v) => {
        ui.timelineView = v;
        ctx.refresh();
      },
      selected: null,
      onSelect: (id) => {
        if (id) {
          ui.selectedEffect = id.split(":")[0] ?? null;
          ui.effectView = "mounted";
          ctx.refresh();
        }
      },
      brush: null,
      onBrush: () => void 0,
      window: 2e4,
      height: timelineHeight(tracks, items, start2, end),
      ariaLabel: `Effect lifecycle for ${tracks.length} effects`,
      testid: "effects-timeline"
    }));
  } else if (view === "log") {
    const columns = [
      { key: "time", label: "Time", width: 80, align: "right", render: (e) => h("span", { class: "num t3" }, `+${fmtMs(e.time - (model.firstTime ?? e.time))}`) },
      { key: "phase", label: "Phase", width: 84, render: (e) => chip(e.phase, PHASE_TONE[e.phase]) },
      { key: "label", label: "Effect", flex: 1.4, render: (e) => h("span", { class: "ellipsis" }, e.label) },
      { key: "reason", label: "Why", flex: 2, render: (e) => h("span", { class: ["ellipsis", e.phase === "error" ? "tone-red" : "t2"] }, e.error ?? e.reason) },
      { key: "dur", label: "Time", width: 70, align: "right", render: (e) => h("span", { class: "num t3" }, e.duration !== void 0 ? fmtMs(e.duration) : "") }
    ];
    body = dataTable({
      columns,
      rows: events,
      rowKey: (e) => `${e.effectKey}:${e.time}:${e.phase}`,
      rowHeight: ctx.rowHeight,
      stickToBottom: true,
      onSelect: (e) => {
        ui.selectedEffect = e.effectKey;
        ui.effectView = "mounted";
        ctx.refresh();
      },
      rowClass: (e) => e.phase === "error" ? "is-error" : "",
      testid: "effects-log",
      ariaLabel: "Effect lifecycle log",
      empty: emptyState({ icon: "effects", title: "No events match the filters" })
    });
  } else {
    const columns = [
      { key: "label", label: "Effect", flex: 1.6, sort: (r) => r.label, render: (r) => h("span", { class: "row-flex" }, icon("effects", { size: 12, className: r.info ? "tone-green" : "t4" }), h("span", { class: "ellipsis" }, r.label), !r.info ? chip("unmounted", "grey") : null) },
      { key: "owner", label: "Owner", width: 120, render: (r) => r.info?.instanceKey ? h("span", { class: "ellipsis t2" }, r.info.instanceKey.split("#").pop()?.split("@")[0] ?? "") : h("span", { class: "t4" }, "top level") },
      { key: "triggers", label: "Triggers", flex: 1.2, render: (r) => h("code", { class: "ellipsis fx-code" }, r.info?.triggers ?? r.agg?.triggers ?? "") },
      { key: "runs", label: "Runs", width: 60, align: "right", sort: (r) => r.agg?.runs ?? 0, render: (r) => h("span", { class: "num" }, String(r.agg?.runs ?? 0)) },
      { key: "avg", label: "Avg", width: 66, align: "right", sort: (r) => r.agg && r.agg.runs ? r.agg.total / r.agg.runs : 0, render: (r) => h("span", { class: "num t2" }, r.agg && r.agg.runs ? fmtMs(r.agg.total / r.agg.runs) : "—") },
      { key: "errors", label: "Errors", width: 60, align: "right", sort: (r) => r.agg?.errors ?? 0, render: (r) => r.agg && r.agg.errors > 0 ? chip(String(r.agg.errors), "red") : h("span", { class: "t4" }, "0") }
    ];
    const table = dataTable({
      columns,
      rows,
      rowKey: (r) => r.key,
      rowHeight: ctx.rowHeight,
      selected: ui.selectedEffect,
      onSelect: (r) => {
        ui.selectedEffect = r.key;
        ctx.refresh();
      },
      onActivate: (r) => {
        if (r.info && can(app, "runEffect")) app.runEffect(r.key);
      },
      rowClass: (r) => r.agg && r.agg.errors > 0 ? "is-error" : "",
      testid: "effects-table",
      ariaLabel: "Mounted effects",
      empty: emptyState({ icon: "effects", title: "No effects are mounted", body: ["Declare one with ", h("code", {}, "$effect(() => { … }, [$dep])"), "."] })
    });
    body = selected ? ctx.width() >= 780 ? split({ size: paneSize(ctx, "effects.table", Math.round(ctx.width() * 0.55)), min: 300, onResize: (s) => setPaneSize(ctx, "effects.table", s), first: table, second: detailPane(ctx, selected) }) : split({ direction: "col", size: paneSize(ctx, "effects.table.col", 200), min: 110, onResize: (s) => setPaneSize(ctx, "effects.table.col", s), first: table, second: detailPane(ctx, selected) }) : table;
  }
  return h("div", { class: "fx", "data-dt": "effects" }, bar, body);
}
const effectsView = {
  id: "effects",
  label: "Effects",
  icon: "effects",
  group: "activity",
  hint: "Mounted effects, triggers, and lifecycle",
  keywords: "side effects timeline triggers intervals cleanup mounted run",
  badge: (ctx) => {
    const errors = ctx.model.effects.filter((e) => e.phase === "error").length;
    return errors > 0 ? { value: errors, tone: "red" } : null;
  },
  render: render$7,
  css: (
    /* css */
    `
.fx { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.fx-detail { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.fx-code { font-family: var(--dt-mono); font-size: var(--dt-fs-mono); color: var(--dt-syn-state); }
.fx-events { display: flex; flex-direction: column; gap: 3px; }
.fx-event { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border-radius: 6px; background: var(--dt-bg-elev); font-size: var(--dt-fs-sm); min-width: 0; }
`
  )
};
function selectedCommit(ctx) {
  const commits = ctx.model.commits;
  if (commits.length === 0) return null;
  return commits.find((c) => c.commitId === ctx.ui.selectedCommitId) ?? commits[commits.length - 1];
}
function commitKind(commit) {
  return commit.initial ? "initial" : commit.fullRender ? "full" : "incremental";
}
function trigger(commit) {
  if (commit.initial) return "initial mount";
  if (commit.changedPaths.length > 0) return commit.changedPaths.map((p) => `$${p}`).join(", ");
  return "forced (an async result, effect, timer, or custom event)";
}
function flameView(ctx, commit) {
  const { ui, model } = ctx;
  const previous = ctx.memo(`pf:prev:${commit.commitId}`, [commit.commitId], () => {
    const map = /* @__PURE__ */ new Map();
    for (const c of model.commits) {
      if (c.commitId >= commit.commitId) break;
      for (const record of c.components) if (record.phase !== "memo") map.set(record.instanceKey, record.selfTime);
    }
    return map;
  });
  const layout2 = ctx.memo(`pf:flame:${commit.commitId}`, [commit], () => layoutFlame(commit, previous));
  const height = Math.max(120, (layout2.maxDepth + 1) * 20 + 10);
  const selected = layout2.nodes.find((n) => n.key === ui.flameSelected) ?? null;
  const chart = h(
    "div",
    { class: "pf-flame" },
    h(
      "div",
      { class: "pf-flame-bar" },
      h("span", { class: "t3" }, `${layout2.nodes.length} spans · ${fmtMs(layout2.total)} measured`),
      spacer(),
      h(
        "span",
        { class: "pf-legend" },
        h("i", { style: { background: "linear-gradient(90deg, rgb(48,196,170), rgb(235,200,70), rgb(255,96,110))" } }),
        "self time",
        h("i", { class: "is-memo" }),
        "memoised (skipped)"
      ),
      h("span", { class: "t4" }, "wheel zooms · drag pans · double-click a span to focus")
    ),
    h(
      "div",
      { class: "pf-flame-scroll" },
      flameChart({
        nodes: layout2.nodes,
        total: layout2.total,
        maxSelf: layout2.maxSelf,
        selected: ui.flameSelected,
        version: commit.commitId,
        height,
        ariaLabel: `Flame chart of commit ${commit.commitId}: ${layout2.nodes.length} component spans`,
        testid: "flame-chart",
        onSelect: (key2) => {
          ui.flameSelected = key2;
          ctx.refresh();
        },
        onHover: (key2) => ctx.highlightInstance(key2)
      })
    )
  );
  const detail = selected ? spanDetail(ctx, commit, selected) : h(
    "div",
    { class: "pf-side-empty" },
    icon("flame", { size: 20 }),
    h("div", {}, "Click a span to see why it rendered and what it cost.")
  );
  if (ctx.width() < 760) return h("div", { class: "pf-col" }, chart, selected ? spanDetail(ctx, commit, selected) : null);
  return split({
    size: paneSize(ctx, "perf.flame", Math.round(ctx.width() * 0.66)),
    min: 320,
    onResize: (s) => setPaneSize(ctx, "perf.flame", s),
    first: chart,
    second: detail
  });
}
function spanDetail(ctx, commit, node) {
  const record = commit.components.find((c) => c.instanceKey === node.key);
  return h(
    "div",
    { class: "pf-side", "data-dt": "span-detail" },
    h(
      "div",
      { class: "pane-head" },
      h("span", { class: "pane-title" }, node.name),
      chip(node.kind, node.kind === "user" ? "accent" : "grey"),
      chip(node.phase, node.phase === "memo" ? "grey" : node.phase === "mount" ? "green" : "blue"),
      spacer(),
      button({ label: "Inspect", size: "sm", icon: "inspect", onClick: () => ctx.selectInstance(node.key) })
    ),
    h(
      "div",
      { class: "pane-body is-pad stack" },
      statGrid(
        stat({ label: "Self", value: node.phase === "memo" ? "—" : fmtMs(node.self), tone: node.self >= 8 ? "amber" : void 0 }),
        stat({ label: "Total", value: fmtMs(node.total), foot: node.estimated ? "estimated (skipped)" : void 0 }),
        stat({ label: "Depth", value: String(node.depth) })
      ),
      h(
        "div",
        {},
        h("div", { class: "it-sub" }, "Why it rendered"),
        h("div", { class: "pf-reason" }, icon(node.phase === "memo" ? "layers" : "info", { size: 14 }), h("span", {}, reasonText(node.reason, commit)))
      ),
      node.deps && node.deps.length > 0 ? h(
        "div",
        {},
        h("div", { class: "it-sub" }, "Reads"),
        h("div", { class: "chips" }, ...node.deps.map((dep) => atomChip(ctx, dep, commit.changedPaths.some((p) => p === dep || dep.startsWith(`${p}.`) || p.startsWith(`${dep}.`)) ? "amber" : "purple")))
      ) : null,
      record?.props && record.props.length > 0 ? h(
        "div",
        {},
        h("div", { class: "it-sub" }, `Props this commit (${record.props.length})`),
        h("div", { class: "it-attrs" }, ...record.props.slice(0, 20).map((prop) => h(
          "div",
          { key: prop.name, class: "it-attr" },
          h("span", { class: "it-attr-k" }, prop.name),
          h("span", { class: `v t-${prop.value.type}` }, prop.value.preview)
        )))
      ) : null
    )
  );
}
function reasonText(reason, commit) {
  switch (reason) {
    case "initial mount":
      return "First render of this instance.";
    case "no memo (full render)":
      return "It had no memoised value yet, so it rendered.";
    case "positional args changed":
      return "Its positional arguments changed since the last render.";
    case "named args changed":
      return "Its named arguments (props object) changed — a new object, array, or lambda counts as a change.";
    case "state dependency changed":
      return `A $state path it reads changed (${commit.changedPaths.map((p) => `$${p}`).join(", ") || "tracked"}).`;
    case "full render":
      return "Nothing it depends on changed: the whole commit was forced (an async resolution, effect, timer, or custom event), which bypasses memoisation. This render did no useful work.";
    case "memoized (args + deps unchanged)":
      return "Skipped: arguments and dependencies were unchanged, so the cached output was reused.";
    default:
      return reason;
  }
}
function rankedView(ctx, commit) {
  const rows = commit.components.filter((c) => c.phase !== "memo").sort((a, b) => b.selfTime - a.selfTime);
  const max = rows[0]?.selfTime ?? 1;
  const columns = [
    { key: "name", label: "Component", flex: 2, render: (r) => h("span", { class: "row-flex" }, r.kind === "user" ? icon("puzzle", { size: 12, className: "tone-accent" }) : null, h("span", { class: r.kind === "user" ? "it-name is-user" : "it-name" }, r.name)) },
    { key: "self", label: "Self", width: 180, render: (r) => h("span", { class: "row-flex", style: { width: "100%" } }, meter(r.selfTime / Math.max(1e-6, max), r.selfTime >= 8 ? "red" : r.selfTime >= 3 ? "amber" : void 0), h("span", { class: "num", style: { minWidth: "56px", textAlign: "right" } }, fmtMs(r.selfTime))) },
    { key: "reason", label: "Why", flex: 2, render: (r) => h("span", { class: ["ellipsis", r.reason === "full render" ? "tone-purple" : "t3"] }, r.reason) }
  ];
  return dataTable({
    columns,
    rows,
    rowKey: (r) => r.instanceKey,
    rowHeight: ctx.rowHeight,
    selected: ctx.ui.flameSelected,
    onSelect: (r) => {
      ctx.ui.flameSelected = r.instanceKey;
      ctx.highlightInstance(r.instanceKey, true);
      ctx.refresh();
    },
    onActivate: (r) => ctx.selectInstance(r.instanceKey),
    onHover: (r) => ctx.highlightInstance(r?.instanceKey ?? null),
    empty: emptyState({ icon: "layers", title: "Nothing rendered in this commit", body: "Every instance was memoised." }),
    testid: "ranked-table",
    ariaLabel: "Components ranked by self time"
  });
}
function componentsView(ctx) {
  const { model, ui } = ctx;
  const rows = ctx.memo("pf:aggs", [model.revs.commit], () => componentAggregates(model.commits));
  const maxTotal = Math.max(1e-6, ...rows.map((r) => r.total));
  const columns = [
    { key: "name", label: "Component", flex: 2, sort: (r) => r.name, render: (r) => h("span", { class: r.kind === "user" ? "it-name is-user" : "it-name" }, r.name) },
    { key: "kind", label: "Type", width: 70, sort: (r) => r.kind, render: (r) => chip(r.kind, r.kind === "user" ? "accent" : "grey") },
    { key: "instances", label: "Inst", width: 56, align: "right", sort: (r) => r.instances, render: (r) => h("span", { class: "num" }, String(r.instances)) },
    { key: "renders", label: "Renders", width: 70, align: "right", sort: (r) => r.renders, render: (r) => h("span", { class: "num" }, String(r.renders)) },
    { key: "memo", label: "Memo", width: 64, align: "right", sort: (r) => r.renders + r.memo > 0 ? r.memo / (r.renders + r.memo) : 0, render: (r) => h("span", { class: "num t3" }, fmtPct(r.renders + r.memo > 0 ? r.memo / (r.renders + r.memo) : 0)) },
    { key: "total", label: "Total", width: 150, align: "right", sort: (r) => r.total, render: (r) => h("span", { class: "row-flex", style: { width: "100%" } }, meter(r.total / maxTotal), h("span", { class: "num", style: { minWidth: "52px", textAlign: "right" } }, fmtMs(r.total))) },
    { key: "avg", label: "Avg", width: 64, align: "right", sort: (r) => r.renders ? r.total / r.renders : 0, render: (r) => h("span", { class: ["num", r.renders && r.total / r.renders >= 8 ? "tone-amber" : ""] }, r.renders ? fmtMs(r.total / r.renders) : "—") },
    { key: "max", label: "Max", width: 64, align: "right", sort: (r) => r.max, render: (r) => h("span", { class: ["num", r.max >= 16 ? "tone-red" : ""] }, fmtMs(r.max)) }
  ];
  return dataTable({
    columns,
    rows,
    rowKey: (r) => r.name,
    rowHeight: ctx.rowHeight,
    sort: ui.componentSort,
    onSort: (sort) => {
      ui.componentSort = sort;
      ctx.refresh();
    },
    testid: "components-table",
    ariaLabel: "Components across all retained commits",
    empty: emptyState({ icon: "layers", title: "No component renders captured" })
  });
}
function whyView(ctx, commit) {
  const groups = /* @__PURE__ */ new Map();
  for (const record of commit.components) {
    const list = groups.get(record.reason) ?? [];
    list.push(record);
    groups.set(record.reason, list);
  }
  const order = ["state dependency changed", "named args changed", "positional args changed", "full render", "no memo (full render)", "initial mount", "memoized (args + deps unchanged)"];
  const sorted = [...groups.entries()].sort((a, b) => order.indexOf(a[0]) + 100 * Number(order.indexOf(a[0]) < 0) - (order.indexOf(b[0]) + 100 * Number(order.indexOf(b[0]) < 0)));
  const wasted = groups.get("full render")?.length ?? 0;
  const rendered = commit.components.filter((c) => c.phase !== "memo").length;
  return h(
    "div",
    { class: "dt-scroll", "data-dt": "why-render" },
    h(
      "div",
      { class: "dt-pad stack" },
      card({
        title: `Commit #${commit.commitId}`,
        icon: "zap",
        sub: `${fmtMs(commit.duration)} · ${rendered} rendered · ${commit.memoized} skipped`,
        body: h(
          "div",
          { class: "stack" },
          h(
            "div",
            { class: "row-flex wrap" },
            h("span", { class: "t3" }, "Triggered by"),
            commit.changedPaths.length > 0 ? commit.changedPaths.map((p) => atomChip(ctx, p, "amber")) : chip(commit.initial ? "initial mount" : "forced render", commit.initial ? "green" : "purple")
          ),
          commit.fullRender && !commit.initial ? note("warn", ["This was a ", h("b", {}, "full render"), ": memoisation was bypassed because the change came from outside the tracked state (an async resolution, an effect body, a timer, or a custom event). ", wasted > 0 ? `${wasted} of ${rendered} renders changed nothing.` : ""]) : wasted === 0 ? note("good", "Every render in this commit had a reason: a changed argument or a changed dependency.") : null
        )
      }),
      ...sorted.map(([reason, records]) => card({
        title: reasonTitle(reason),
        icon: reason.startsWith("memo") ? "layers" : reason === "full render" ? "warning" : reason.includes("state") ? "state" : reason.includes("args") ? "arrowRight" : "plus",
        sub: `${records.length} instance${records.length === 1 ? "" : "s"}`,
        body: h("div", { class: "chips" }, ...records.slice(0, 80).map((record) => chip(record.name, record.kind === "user" ? reason === "full render" ? "purple" : "accent" : "grey", {
          onClick: () => ctx.selectInstance(record.instanceKey),
          tip: record.deps && record.deps.length > 0 ? `reads ${record.deps.map((d) => `$${d}`).join(", ")}` : void 0
        })), records.length > 80 ? chip(`+${records.length - 80} more`) : null)
      }))
    )
  );
}
function reasonTitle(reason) {
  switch (reason) {
    case "state dependency changed":
      return "A state dependency changed";
    case "named args changed":
      return "Props changed";
    case "positional args changed":
      return "Arguments changed";
    case "full render":
      return "Rendered for nothing (forced commit)";
    case "no memo (full render)":
      return "No memoised value yet";
    case "initial mount":
      return "Mounted";
    case "memoized (args + deps unchanged)":
      return "Skipped (memoised)";
    default:
      return reason;
  }
}
const TONE_ICON = { bad: "error", warn: "warning", info: "info", good: "checkCircle" };
function insightsView(ctx) {
  const insights = ctx.memo("pf:insights", [ctx.model.rev, ctx.vitals.interactions.length, ctx.vitals.longTasks.length], () => performanceInsights(ctx.model, ctx.vitals));
  return h(
    "div",
    { class: "dt-scroll", "data-dt": "insights" },
    h("div", { class: "dt-pad stack" }, ...insights.map((insight) => h(
      "div",
      { key: insight.id, class: ["pf-insight", `t-${insight.tone}`] },
      h("span", { class: "pf-insight-ic" }, icon(TONE_ICON[insight.tone], { size: 16 })),
      h(
        "div",
        { class: "grow" },
        h("div", { class: "pf-insight-title" }, insight.title),
        h("div", { class: "pf-insight-detail" }, insight.detail),
        insight.fix ? h("div", { class: "pf-insight-fix" }, icon("wand", { size: 12 }), insight.fix) : null
      ),
      insight.component ? button({ label: "Show", size: "sm", variant: "ghost", onClick: () => {
        ctx.ui.profilerView = "components";
        ctx.refresh();
      } }) : null
    )))
  );
}
function vitalCard(label, metric2, value, format, sub) {
  const rating = rate(metric2, value);
  const [good, poor] = THRESHOLDS[metric2];
  const max = poor * 1.5;
  const pos = value === null ? 0 : Math.min(1, value / max);
  return h(
    "div",
    { class: ["pf-vital", `r-${rating}`], "data-dt": `vital-${metric2}` },
    h("div", { class: "pf-vital-label" }, label, h("span", { class: "pf-vital-rating" }, rating === "unknown" ? "no data" : rating.replace("-", " "))),
    h("div", { class: "pf-vital-value" }, value === null ? "—" : format(value)),
    h(
      "div",
      { class: "pf-vital-scale" },
      h("span", { class: "g", style: { width: `${good / max * 100}%` } }),
      h("span", { class: "n", style: { width: `${(poor - good) / max * 100}%` } }),
      h("span", { class: "p" }),
      value !== null ? h("i", { style: { left: `${pos * 100}%` } }) : null
    ),
    sub ? h("div", { class: "pf-vital-sub" }, sub) : null
  );
}
function vitalsView(ctx) {
  const v = ctx.vitals;
  const inp = v.inp;
  const interactions = [...v.interactions].sort((a, b) => b.start - a.start).slice(0, 40);
  const phases = (i) => {
    const total = Math.max(1, i.inputDelay + i.processing + i.presentation);
    return h(
      "span",
      { class: "pf-phases", "data-tip": `input delay ${fmtMs(i.inputDelay)} · processing ${fmtMs(i.processing)} · presentation ${fmtMs(i.presentation)}` },
      h("span", { class: "ph-input", style: { width: `${i.inputDelay / total * 100}%` } }),
      h("span", { class: "ph-proc", style: { width: `${i.processing / total * 100}%` } }),
      h("span", { class: "ph-pres", style: { width: `${i.presentation / total * 100}%` } })
    );
  };
  const commitsDuring = (i) => ctx.model.commits.filter((c) => c.startTime >= i.start - 2 && c.startTime <= i.start + i.duration).length;
  return h(
    "div",
    { class: "dt-scroll", "data-dt": "vitals" },
    h(
      "div",
      { class: "dt-pad stack" },
      h(
        "div",
        { class: "pf-vitals" },
        vitalCard("Interaction to Next Paint", "inp", inp?.value ?? null, (x) => fmtMs(x), inp ? `${inp.interaction.type} on ${inp.interaction.target || "an element"}` : v.supported.eventTiming ? "Click, tap, or type in the app to measure." : "Not supported in this browser."),
        vitalCard("Largest Contentful Paint", "lcp", v.lcp?.value ?? null, (x) => fmtMs(x), v.lcp ? v.lcp.element || "an element" : v.supported.lcp ? "Measured from page load." : "Not supported in this browser."),
        vitalCard("Cumulative Layout Shift", "cls", v.supported.cls ? v.cls.value : null, (x) => x.toFixed(3), v.supported.cls ? `${v.cls.shifts.length} shift${v.cls.shifts.length === 1 ? "" : "s"}` : "Not supported in this browser."),
        vitalCard("First Contentful Paint", "fcp", v.fcp, (x) => fmtMs(x)),
        vitalCard("Time to First Byte", "ttfb", v.ttfb, (x) => fmtMs(x))
      ),
      h(
        "div",
        { class: "grid-cards" },
        card({
          title: "Frame rate",
          icon: "activity",
          sub: v.fps !== null ? `${v.fps} fps now · ${v.droppedFrames} long frames` : "sampling…",
          body: v.fpsSamples.length > 1 ? sparkline(v.fpsSamples.map(([, f]) => f), { width: 320, height: 56, color: "var(--dt-green)", max: 120 }) : h("div", { class: "hint" }, "Collecting samples…")
        }),
        card({
          title: "JS heap",
          icon: "cpu",
          sub: v.heap ? `${fmtBytes(v.heap.used)} of ${fmtBytes(v.heap.limit)}` : "Chromium only",
          body: v.heapSamples.length > 1 ? sparkline(v.heapSamples.map(([, b]) => b), { width: 320, height: 56, color: "var(--dt-cyan)" }) : h("div", { class: "hint" }, v.supported.memory ? "Collecting samples…" : "This browser does not expose memory usage.")
        })
      ),
      card({
        title: "Interactions",
        icon: "cursor",
        flush: true,
        sub: `${v.interactions.length} measured · phases: input delay, processing, presentation`,
        body: interactions.length === 0 ? h("div", { class: "pad-sm hint" }, "No interactions measured yet — use the app.") : h("div", { class: "pf-interactions" }, ...interactions.map((i) => h(
          "div",
          { key: i.id, class: ["pf-int", i.duration > 200 ? "is-slow" : ""] },
          h("span", { class: "pf-int-type" }, i.type),
          h("span", { class: "pf-int-target mono ellipsis" }, i.target || "—"),
          phases(i),
          h("span", { class: ["num pf-int-dur", i.duration > 500 ? "tone-red" : i.duration > 200 ? "tone-amber" : ""] }, fmtMs(i.duration)),
          h("span", { class: "t3 pf-int-commits", "data-tip": "Commits that started during this interaction" }, `${commitsDuring(i)} commit${commitsDuring(i) === 1 ? "" : "s"}`)
        )))
      }),
      card({
        title: "Long tasks",
        icon: "clock",
        flush: true,
        sub: v.supported.loaf ? "long animation frames, with script attribution" : v.supported.longTasks ? "tasks over 50ms" : "not supported in this browser",
        body: v.longTasks.length === 0 ? h("div", { class: "pad-sm hint" }, "No long tasks — the main thread stayed responsive.") : h("div", { class: "pf-interactions" }, ...[...v.longTasks].reverse().slice(0, 30).map((t, i) => h(
          "div",
          { key: `${t.start}:${i}`, class: "pf-int" },
          h("span", { class: "pf-int-type" }, `+${fmtMs(t.start)}`),
          h("span", { class: "pf-int-target mono ellipsis" }, t.scripts && t.scripts.length > 0 ? t.scripts.map((s) => `${s.source} (${Math.round(s.duration)}ms)`).join(" · ") : "unattributed"),
          h("span", { class: ["num pf-int-dur", t.duration > 200 ? "tone-red" : "tone-amber"] }, fmtMs(t.duration))
        )))
      })
    )
  );
}
function render$6(ctx) {
  const { model, ui } = ctx;
  const commits = model.commits;
  const view = ui.profilerView;
  const bar = viewbar(
    segmented([
      { value: "flame", label: "Flame", icon: "flame" },
      { value: "ranked", label: "Ranked", icon: "list" },
      { value: "components", label: "Components", icon: "layers" },
      { value: "why", label: "Why", icon: "info" },
      { value: "insights", label: "Insights", icon: "sparkles" },
      { value: "vitals", label: "Vitals", icon: "gauge" }
    ], view, (value) => {
      ui.profilerView = value;
      ctx.refresh();
    }, { label: "Performance view" }),
    spacer(),
    filterChip({ label: "Highlight renders", on: ui.highlightUpdates, tip: "Outline components on the page as they re-render, with counts", testid: "perf-scan", onToggle: () => {
      ui.highlightUpdates = !ui.highlightUpdates;
      if (!ui.highlightUpdates) ctx.overlay.clearUpdateFlashes();
      ctx.persist();
      ctx.refresh();
    } }),
    filterChip({ label: "Browser marks", on: ui.perfMarks, tip: "Mirror commits into performance.measure for Chrome's Performance panel", onToggle: () => {
      ui.perfMarks = !ui.perfMarks;
      ctx.refresh();
    } }),
    vsep(),
    button({ label: "Clear", size: "sm", variant: "ghost", icon: "trash", onClick: () => {
      model.commits.length = 0;
      model.history.length = 0;
      model.renderCounts.clear();
      model.rev += 1;
      model.revs.commit += 1;
      ui.selectedCommitId = null;
      ui.flameSelected = null;
      ctx.refresh();
    } })
  );
  if (view === "vitals") return h("div", { class: "pf", "data-dt": "profiler" }, bar, vitalsView(ctx));
  if (view === "insights") return h("div", { class: "pf", "data-dt": "profiler" }, bar, insightsView(ctx));
  if (commits.length === 0) {
    return h("div", { class: "pf", "data-dt": "profiler" }, bar, emptyState({ icon: "flame", title: "No commits recorded yet", body: "Interact with the app — every render is captured while the panel is open." }));
  }
  const commit = selectedCommit(ctx);
  const bars = ctx.memo("pf:bars", [model.revs.commit], () => commits.map((c) => ({
    id: c.commitId,
    duration: c.duration,
    kind: commitKind(c),
    rendered: c.rendered,
    memoized: c.memoized,
    trigger: trigger(c)
  })));
  const nonInitial = commits.filter((c) => !c.initial);
  const avg = nonInitial.length ? nonInitial.reduce((sum, c) => sum + c.duration, 0) / nonInitial.length : 0;
  const slowest = commits.reduce((a, b) => b.duration > a.duration ? b : a);
  const header2 = h(
    "div",
    { class: "pf-head" },
    h(
      "div",
      { class: "pf-chart" },
      commitChart({
        commits: bars,
        selected: commit.commitId,
        height: 64,
        ariaLabel: `${commits.length} commits; selected #${commit.commitId}, ${fmtMs(commit.duration)}. Use the arrow keys to move.`,
        testid: "commit-chart",
        onSelect: (id) => {
          ui.selectedCommitId = id;
          ui.flameSelected = null;
          ctx.refresh();
        }
      })
    ),
    h(
      "div",
      { class: "pf-summary" },
      h("span", { class: "pf-commit-id" }, `#${commit.commitId}`),
      h("b", {}, fmtMs(commit.duration)),
      commit.morphTime ? h("span", { class: "t3" }, `render ${fmtMs(Math.max(0, commit.duration - commit.morphTime))} · DOM ${fmtMs(commit.morphTime)}`) : null,
      h("span", { class: "t3" }, `${commit.rendered} rendered · ${commit.memoized} skipped`),
      chip(commitKind(commit) === "full" ? "full render" : commitKind(commit), commitKind(commit) === "full" ? "amber" : commitKind(commit) === "initial" ? "teal" : "accent"),
      h("span", { class: "pf-trigger ellipsis" }, trigger(commit)),
      spacer(),
      h("span", { class: "t3" }, `avg ${fmtMs(avg)} · slowest `),
      h("button", { type: "button", class: "link", onClick: () => {
        ui.selectedCommitId = slowest.commitId;
        ctx.refresh();
      } }, `#${slowest.commitId} ${fmtMs(slowest.duration)}`)
    )
  );
  let body;
  switch (view) {
    case "ranked":
      body = rankedView(ctx, commit);
      break;
    case "components":
      body = componentsView(ctx);
      break;
    case "why":
      body = whyView(ctx, commit);
      break;
    default:
      body = flameView(ctx, commit);
  }
  return h("div", { class: "pf", "data-dt": "profiler" }, bar, header2, body);
}
const profilerView = {
  id: "profiler",
  label: "Performance",
  icon: "profiler",
  group: "perf",
  hint: "Flame charts, re-renders, insights, Core Web Vitals",
  keywords: "profiler flame chart commits renders memo slow why did this render inp lcp cls fps long tasks vitals",
  badge: (ctx) => {
    const slow = ctx.model.commits.filter((c) => !c.initial && c.duration > 16).length;
    return slow > 0 ? { value: slow, tone: "amber" } : null;
  },
  render: render$6,
  commands: (ctx) => [
    { id: "vitals", label: "Show Core Web Vitals", icon: "gauge", run: () => {
      ctx.ui.profilerView = "vitals";
      ctx.selectTab("profiler");
    } },
    { id: "why", label: "Why did this render?", icon: "info", run: () => {
      ctx.ui.profilerView = "why";
      ctx.selectTab("profiler");
    } },
    { id: "slowest", label: "Jump to the slowest commit", icon: "flame", run: () => {
      const commits = ctx.model.commits;
      if (commits.length === 0) return;
      ctx.ui.selectedCommitId = commits.reduce((a, b) => b.duration > a.duration ? b : a).commitId;
      ctx.ui.profilerView = "flame";
      ctx.selectTab("profiler");
    } }
  ],
  css: (
    /* css */
    `
.pf { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.pf-head { flex: none; border-bottom: 1px solid var(--dt-border); }
.pf-chart { padding: 8px 10px 2px; }
.pf-summary { display: flex; align-items: center; gap: 4px 10px; flex-wrap: wrap; padding: 4px 12px 8px; font-size: var(--dt-fs-sm); min-width: 0; white-space: nowrap; }
.pf-summary > .pf-trigger { flex: 0 1 auto; min-width: 60px; max-width: 40%; }
.pf-commit-id { font-family: var(--dt-mono); color: var(--dt-accent-text); font-weight: 700; }
.pf-trigger { color: var(--dt-syn-state); font-family: var(--dt-mono); font-size: var(--dt-fs-mono); min-width: 40px; }
.pf-flame { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.pf-flame-bar { flex: none; display: flex; align-items: center; gap: 12px; padding: 6px 12px; font-size: var(--dt-fs-xs); }
.pf-legend { display: inline-flex; align-items: center; gap: 6px; color: var(--dt-text-3); }
.pf-legend i { width: 18px; height: 8px; border-radius: 2px; display: inline-block; }
.pf-legend i.is-memo { width: 10px; background: var(--dt-bg-active); box-shadow: inset 0 0 0 1px var(--dt-border-strong); margin-left: 6px; }
.pf-flame-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 0 8px 8px; }
.pf-col { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: auto; }
.pf-side { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.pf-side-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: var(--dt-text-3); padding: 20px; text-align: center; }
.pf-reason { display: flex; gap: 8px; align-items: flex-start; padding: 9px 11px; border-radius: var(--dt-r); background: var(--dt-bg-elev); border: 1px solid var(--dt-border); font-size: var(--dt-fs-sm); line-height: 1.5; }
.pf-reason .ic { margin-top: 2px; color: var(--dt-accent-text); flex: none; }
.pf-insight { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; border-radius: var(--dt-r-lg); background: var(--dt-bg-elev); border: 1px solid var(--dt-border); }
.pf-insight.t-bad { border-left: 3px solid var(--dt-red); }
.pf-insight.t-warn { border-left: 3px solid var(--dt-amber); }
.pf-insight.t-info { border-left: 3px solid var(--dt-blue); }
.pf-insight.t-good { border-left: 3px solid var(--dt-green); }
.pf-insight-ic { margin-top: 1px; flex: none; }
.pf-insight.t-bad .pf-insight-ic { color: var(--dt-red); }
.pf-insight.t-warn .pf-insight-ic { color: var(--dt-amber); }
.pf-insight.t-info .pf-insight-ic { color: var(--dt-blue); }
.pf-insight.t-good .pf-insight-ic { color: var(--dt-green); }
.pf-insight-title { font-weight: 650; }
.pf-insight-detail { color: var(--dt-text-2); font-size: var(--dt-fs-sm); margin-top: 3px; line-height: 1.5; }
.pf-insight-fix { display: flex; gap: 6px; align-items: flex-start; color: var(--dt-text-3); font-size: var(--dt-fs-sm); margin-top: 6px; }
.pf-insight-fix .ic { margin-top: 2px; color: var(--dt-accent-text); flex: none; }
.pf-vitals { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
.pf-vital { padding: 12px; border-radius: var(--dt-r-lg); background: var(--dt-bg-elev); border: 1px solid var(--dt-border); display: flex; flex-direction: column; gap: 6px; }
.pf-vital-label { display: flex; justify-content: space-between; gap: 6px; font-size: var(--dt-fs-xs); font-weight: 650; color: var(--dt-text-3); text-transform: uppercase; letter-spacing: 0.04em; }
.pf-vital-rating { text-transform: none; letter-spacing: 0; font-weight: 700; }
.pf-vital.r-good .pf-vital-rating, .pf-vital.r-good .pf-vital-value { color: var(--dt-green); }
.pf-vital.r-needs-improvement .pf-vital-rating, .pf-vital.r-needs-improvement .pf-vital-value { color: var(--dt-amber); }
.pf-vital.r-poor .pf-vital-rating, .pf-vital.r-poor .pf-vital-value { color: var(--dt-red); }
.pf-vital-value { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
.pf-vital-scale { position: relative; display: flex; height: 5px; border-radius: 3px; overflow: visible; }
.pf-vital-scale > span { height: 100%; }
.pf-vital-scale .g { background: var(--dt-green); border-radius: 3px 0 0 3px; opacity: 0.75; }
.pf-vital-scale .n { background: var(--dt-amber); opacity: 0.75; }
.pf-vital-scale .p { flex: 1; background: var(--dt-red); border-radius: 0 3px 3px 0; opacity: 0.75; }
.pf-vital-scale i { position: absolute; top: -4px; width: 3px; height: 13px; margin-left: -1.5px; border-radius: 2px; background: var(--dt-text); box-shadow: 0 0 0 2px var(--dt-bg-elev); }
.pf-vital-sub { font-size: var(--dt-fs-xs); color: var(--dt-text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pf-interactions { display: flex; flex-direction: column; }
.pf-int { display: grid; grid-template-columns: 90px minmax(80px, 1fr) minmax(120px, 2fr) 64px 70px; align-items: center; gap: 10px; padding: 6px 12px; border-bottom: 1px solid var(--dt-border); font-size: var(--dt-fs-sm); }
.pf-int:last-child { border-bottom: 0; }
.pf-int.is-slow { background: var(--dt-amber-soft); }
.pf-int-type { font-weight: 600; }
.pf-int-dur { text-align: right; font-weight: 650; }
.pf-phases { display: flex; height: 8px; border-radius: 4px; overflow: hidden; background: var(--dt-bg-active); }
.pf-phases span { height: 100%; }
.ph-input { background: var(--dt-amber); }
.ph-proc { background: var(--dt-accent); }
.ph-pres { background: var(--dt-cyan); }
`
  )
};
const WCAG = {
  "1.1.1": { name: "Non-text Content", level: "A", slug: "non-text-content" },
  "1.2.2": { name: "Captions (Prerecorded)", level: "A", slug: "captions-prerecorded" },
  "1.3.1": { name: "Info and Relationships", level: "A", slug: "info-and-relationships" },
  "1.3.5": { name: "Identify Input Purpose", level: "AA", slug: "identify-input-purpose" },
  "1.4.3": { name: "Contrast (Minimum)", level: "AA", slug: "contrast-minimum" },
  "1.4.11": { name: "Non-text Contrast", level: "AA", slug: "non-text-contrast" },
  "2.1.1": { name: "Keyboard", level: "A", slug: "keyboard" },
  "2.4.3": { name: "Focus Order", level: "A", slug: "focus-order" },
  "2.4.4": { name: "Link Purpose (In Context)", level: "A", slug: "link-purpose-in-context" },
  "2.4.6": { name: "Headings and Labels", level: "AA", slug: "headings-and-labels" },
  "2.5.8": { name: "Target Size (Minimum)", level: "AA", slug: "target-size-minimum" },
  "3.3.2": { name: "Labels or Instructions", level: "A", slug: "labels-or-instructions" },
  "4.1.2": { name: "Name, Role, Value", level: "A", slug: "name-role-value" }
};
function wcagUrl(criterion) {
  const entry = WCAG[criterion];
  return entry ? `https://www.w3.org/WAI/WCAG22/Understanding/${entry.slug}.html` : null;
}
const IMPACTS = ["critical", "serious", "moderate", "minor"];
const IMPACT_TONE = { critical: "red", serious: "orange", moderate: "amber", minor: "blue" };
const CATEGORY_LABEL = {
  names: "Names",
  structure: "Structure",
  aria: "ARIA",
  keyboard: "Keyboard",
  contrast: "Contrast",
  forms: "Forms",
  media: "Media"
};
function toHex(color) {
  const part = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${part(color.r)}${part(color.g)}${part(color.b)}`;
}
function mix(a, b, t) {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}
function suggestForeground(fg, bg, target) {
  if (contrastRatio(fg, bg) >= target) return { hex: toHex(fg), ratio: contrastRatio(fg, bg) };
  let best = null;
  for (const toward of [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }]) {
    for (let step = 1; step <= 100; step += 1) {
      const t = step / 100;
      const candidate = mix(fg, toward, t);
      const rounded = { r: Math.round(candidate.r), g: Math.round(candidate.g), b: Math.round(candidate.b) };
      const ratio = contrastRatio(rounded, bg);
      if (ratio >= target) {
        if (!best || t < best.t) best = { hex: toHex(rounded), ratio, t };
        break;
      }
    }
  }
  return best ? { hex: best.hex, ratio: best.ratio } : null;
}
function elementColors(element) {
  if (typeof getComputedStyle !== "function") return null;
  try {
    const bg = effectiveBackground(element) ?? { r: 255, g: 255, b: 255 };
    const parsed2 = parseColor(getComputedStyle(element).color);
    if (!parsed2) return null;
    const fg = parsed2.a >= 1 ? parsed2 : mix(bg, parsed2, parsed2.a);
    return { fg: { r: Math.round(fg.r), g: Math.round(fg.g), b: Math.round(fg.b) }, bg };
  } catch {
    return null;
  }
}
function isLarge(element) {
  try {
    const style = getComputedStyle(element);
    const size = Number.parseFloat(style.fontSize);
    const weight = Number.parseInt(style.fontWeight, 10);
    return size >= 24 || size >= 18.66 && weight >= 700;
  } catch {
    return false;
  }
}
function runAudit(ctx, options = {}) {
  const root = renderRootElement(ctx.app);
  if (!root) return;
  const started = performance.now();
  const result = auditAccessibility(root);
  const score = a11yScore(result.findings);
  const { ui } = ctx;
  ui.a11yPrevScore = ui.a11yRun ? ui.a11yRun.score : null;
  ui.a11yRun = { ...result, at: Date.now(), score };
  if (ui.a11ySelected !== null && ui.a11ySelected >= result.findings.length) ui.a11ySelected = null;
  if (!options.quiet) {
    const ms = Math.round(performance.now() - started);
    ctx.toast(
      result.findings.length === 0 ? `No issues across ${result.examined} elements (${ms}ms)` : `${plural(result.findings.length, "issue")} across ${result.examined} elements — score ${score}`,
      result.findings.length === 0 ? "good" : score >= 90 ? "info" : "warn"
    );
  }
}
function reportMarkdown$1(ctx, findings) {
  const run = ctx.ui.a11yRun;
  const lines2 = [
    `# Accessibility report — ${ctx.app?.label ?? "app"}`,
    "",
    `Score **${run.score}/100** · ${findings.length} issues · ${run.examined} elements · ${new Date(run.at).toISOString()}`,
    ""
  ];
  const byRule = /* @__PURE__ */ new Map();
  for (const finding of findings) byRule.set(finding.rule, [...byRule.get(finding.rule) ?? [], finding]);
  for (const [rule, items] of byRule) {
    const info = RULE_INFO[rule];
    lines2.push(`## ${info?.title ?? rule} (\`${rule}\`) — ${items[0].impact}, ×${items.length}`);
    if (items[0].wcag?.length) lines2.push(`WCAG ${items[0].wcag.map((c) => `${c} ${WCAG[c]?.name ?? ""}`.trim()).join(", ")}`);
    lines2.push("", `**Fix:** ${items[0].help}`, "");
    for (const item of items.slice(0, 20)) lines2.push(`- ${item.message}${item.detail ? ` (${item.detail})` : ""} — \`${cssPath(item.element)}\``);
    if (items.length > 20) lines2.push(`- …and ${items.length - 20} more`);
    lines2.push("");
  }
  return lines2.join("\n");
}
function reportJson$1(ctx, findings) {
  const run = ctx.ui.a11yRun;
  return JSON.stringify({
    app: ctx.app?.label,
    at: new Date(run.at).toISOString(),
    score: run.score,
    examined: run.examined,
    truncated: run.truncated,
    findings: findings.map((f) => ({ rule: f.rule, impact: f.impact, category: f.category, wcag: f.wcag, message: f.message, help: f.help, detail: f.detail, selector: cssPath(f.element), element: describeElement(f.element) }))
  }, null, 2);
}
function issueRows(ui, numbered, allFindings) {
  const query = ui.a11yFilter.trim().toLowerCase();
  const groups = /* @__PURE__ */ new Map();
  numbered.forEach((finding, i) => {
    if (query && !`${finding.rule} ${finding.message} ${finding.detail ?? ""} ${RULE_INFO[finding.rule]?.title ?? ""}`.toLowerCase().includes(query)) return;
    const list = groups.get(finding.rule) ?? [];
    list.push({ finding, number: i + 1 });
    groups.set(finding.rule, list);
  });
  const rows = [];
  for (const [rule, items] of groups) {
    const first = items[0].finding;
    rows.push({ kind: "group", rule, impact: first.impact, count: items.length, wcag: first.wcag ?? [] });
    if (ui.a11yCollapsed.has(rule)) continue;
    for (const item of items) rows.push({ kind: "finding", finding: item.finding, index: allFindings.indexOf(item.finding), number: item.number });
  }
  return rows;
}
function selectFinding(ctx, finding, index) {
  ctx.ui.a11ySelected = index;
  ctx.highlightElement(finding.element, { component: RULE_INFO[finding.rule]?.title ?? finding.rule, kind: finding.impact }, true);
  try {
    finding.element.scrollIntoView({ block: "center", behavior: "smooth" });
  } catch {
  }
  ctx.refresh();
}
function findingDetail$1(ctx, finding, number) {
  const { app } = ctx;
  const info = RULE_INFO[finding.rule];
  const owner = can(app, "instanceForNode") ? app.instanceForNode(finding.element) : null;
  const connected = finding.element.isConnected;
  let contrast2 = null;
  if (finding.rule === "color-contrast" || finding.rule === "non-text-contrast") {
    const colors = elementColors(finding.element);
    if (colors) {
      const large = isLarge(finding.element);
      const target = finding.rule === "non-text-contrast" ? 3 : large ? 3 : 4.5;
      const ratio = contrastRatio(colors.fg, colors.bg);
      const suggestion = suggestForeground(colors.fg, colors.bg, target + 0.05);
      contrast2 = h(
        "div",
        { class: "ax-contrast", "data-dt": "contrast-fix" },
        h("div", { class: "ax-sample", style: { color: toHex(colors.fg), background: toHex(colors.bg) } }, "Aa", h("small", {}, `${ratio.toFixed(2)}:1`)),
        suggestion ? h("div", { class: "ax-sample", style: { color: suggestion.hex, background: toHex(colors.bg) } }, "Aa", h("small", {}, `${suggestion.ratio.toFixed(2)}:1`)) : null,
        h(
          "div",
          { class: "ax-contrast-text" },
          h("div", {}, `Needs ${target}:1${finding.rule === "color-contrast" ? large ? " (large text)" : " (normal text)" : " (UI component)"} — has ${ratio.toFixed(2)}:1.`),
          suggestion ? h(
            "div",
            { class: "row-flex" },
            "Try ",
            h("code", {}, suggestion.hex),
            ` on ${toHex(colors.bg)}`,
            iconButton({ icon: "copy", size: "sm", label: "Copy the suggested colour", onClick: () => ctx.copy(suggestion.hex, "the colour") }),
            button({ label: "Check", size: "sm", variant: "ghost", onClick: () => {
              ctx.ui.contrastFg = toHex(colors.fg);
              ctx.ui.contrastBg = toHex(colors.bg);
              ctx.ui.a11yPane = "vision";
              ctx.refresh();
            } })
          ) : null
        )
      );
    }
  }
  return h(
    "div",
    { class: "ax-detail", "data-dt": "a11y-detail" },
    h(
      "div",
      { class: "pane-head" },
      number !== null ? h("span", { class: ["ax-num", `t-${IMPACT_TONE[finding.impact]}`] }, String(number)) : null,
      h("span", { class: "pane-title" }, info?.title ?? finding.rule),
      spacer(),
      iconButton({ icon: "close", label: "Close", size: "sm", onClick: () => {
        ctx.ui.a11ySelected = null;
        ctx.highlightElement(null, void 0, true);
        ctx.refresh();
      } })
    ),
    h(
      "div",
      { class: "pane-body is-pad stack" },
      h(
        "div",
        { class: "chips" },
        chip(finding.impact, IMPACT_TONE[finding.impact]),
        chip(finding.rule, "grey", { mono: true }),
        finding.category ? chip(CATEGORY_LABEL[finding.category], "grey", { outline: true }) : null,
        finding.detail ? chip(finding.detail, "amber", { mono: true }) : null,
        !connected ? chip("element removed", "grey", { tip: "The DOM changed since the audit ran — re-run it" }) : null
      ),
      h("div", { class: "ax-message" }, ...richText(finding.message)),
      note("accent", [h("strong", {}, "How to fix. "), ...richText(finding.help)], { icon: "wand" }),
      contrast2,
      finding.wcag && finding.wcag.length > 0 ? h(
        "div",
        {},
        h("div", { class: "it-sub" }, "WCAG 2.2"),
        h("div", { class: "ax-wcag" }, ...finding.wcag.map((criterion) => {
          const entry = WCAG[criterion];
          const url = wcagUrl(criterion);
          return h(
            url ? "a" : "span",
            { key: criterion, class: "ax-sc", href: url ?? void 0, target: url ? "_blank" : void 0, rel: url ? "noopener noreferrer" : void 0 },
            h("span", { class: "ax-sc-id" }, criterion),
            h("span", { class: "ax-sc-name" }, entry?.name ?? "Success criterion"),
            entry ? h("span", { class: "ax-sc-level" }, entry.level) : null,
            url ? icon("external", { size: 11 }) : null
          );
        }))
      ) : null,
      h(
        "div",
        {},
        h("div", { class: "it-sub" }, "Element"),
        h("code", { class: "ax-el" }, describeElement(finding.element)),
        h("div", { class: "ax-announce", "data-tip": "What a screen reader says when this element gets focus" }, icon("a11y", { size: 13 }), h("span", {}, announce(finding.element))),
        h(
          "div",
          { class: "row-flex ax-el-actions" },
          button({ label: "Show", size: "sm", icon: "target", disabled: !connected, onClick: () => selectFinding(ctx, finding, ctx.ui.a11ySelected ?? 0) }),
          owner ? button({ label: "Inspect component", size: "sm", icon: "inspect", onClick: () => ctx.selectInstance(owner, { reveal: true }) }) : null,
          button({ label: "Copy selector", size: "sm", variant: "ghost", icon: "copy", onClick: () => ctx.copy(cssPath(finding.element), "the selector") })
        )
      )
    )
  );
}
function issuesPane(ctx) {
  const { ui } = ctx;
  const run = ui.a11yRun;
  if (!run) {
    return h("div", { class: "dt-scroll" }, emptyState({
      icon: "a11y",
      title: "Audit this app for accessibility",
      body: "Checks names, labels, contrast, ARIA, keyboard reachability, target size, structure and media against WCAG 2.2 — the failures generated UIs actually ship. Findings are numbered on the page too.",
      actions: [button({ label: "Run audit", variant: "primary", icon: "play", testid: "a11y-run", onClick: () => runAudit(ctx) })]
    }));
  }
  const numbered = visibleFindings(run.findings, ui);
  const rows = issueRows(ui, numbered, run.findings);
  const selected = ui.a11ySelected !== null ? run.findings[ui.a11ySelected] ?? null : null;
  const selectedNumber = selected ? numbered.indexOf(selected) + 1 || null : null;
  const counts = Object.fromEntries(IMPACTS.map((impact) => [impact, run.findings.filter((f) => f.impact === impact).length]));
  const categories = Object.keys(CATEGORY_LABEL);
  const catCounts = new Map(categories.map((c) => [c, run.findings.filter((f) => f.category === c && ui.a11yImpacts.has(f.impact)).length]));
  const trend = ui.a11yPrevScore !== null && ui.a11yPrevScore !== run.score ? run.score - ui.a11yPrevScore : 0;
  const rowHeight = ctx.rowHeight + 6;
  const summary = h(
    "div",
    { class: "ax-summary", "data-dt": "a11y-summary" },
    scoreRing(run.score, { size: 58, label: "Accessibility score" }),
    h(
      "div",
      { class: "ax-summary-text" },
      h(
        "div",
        { class: "ax-summary-title" },
        run.findings.length === 0 ? "No issues found" : `${plural(run.findings.length, "issue")} · ${plural(new Set(run.findings.map((f) => f.rule)).size, "rule")}`,
        trend !== 0 ? h("span", { class: ["ax-trend", trend > 0 ? "is-up" : "is-down"] }, `${trend > 0 ? "▲" : "▼"} ${Math.abs(trend)}`) : null
      ),
      h("div", { class: "t3" }, `${run.examined} elements · ${fmtAgo(run.at, Date.now())}${run.truncated ? " · capped at 4000 elements" : ""}`)
    ),
    h("div", { class: "ax-impacts" }, ...IMPACTS.map((impact) => filterChip({
      label: impact,
      count: counts[impact],
      on: ui.a11yImpacts.has(impact),
      swatch: `var(--dt-${IMPACT_TONE[impact]})`,
      testid: `a11y-impact-${impact}`,
      onToggle: () => {
        if (ui.a11yImpacts.has(impact)) ui.a11yImpacts.delete(impact);
        else ui.a11yImpacts.add(impact);
        ctx.refresh();
      }
    })))
  );
  const filters = h(
    "div",
    { class: "ax-filters" },
    h(
      "div",
      { class: "ax-cats", role: "group", "aria-label": "Category" },
      filterChip({ label: "All", on: ui.a11yCategory === "all", onToggle: () => {
        ui.a11yCategory = "all";
        ctx.refresh();
      } }),
      ...categories.filter((c) => (catCounts.get(c) ?? 0) > 0).map((c) => filterChip({
        label: CATEGORY_LABEL[c],
        count: catCounts.get(c),
        on: ui.a11yCategory === c,
        onToggle: () => {
          ui.a11yCategory = ui.a11yCategory === c ? "all" : c;
          ctx.refresh();
        }
      }))
    ),
    spacer(),
    searchField({ value: ui.a11yFilter, placeholder: "Filter issues…", width: "180px", onInput: (v) => {
      ui.a11yFilter = v;
      ctx.refresh();
    } })
  );
  const list = run.findings.length === 0 ? h("div", { class: "dt-scroll" }, emptyState({ icon: "checkCircle", title: "Nothing to fix", body: "Automated checks catch roughly a third of real-world barriers. Walk the page with the keyboard (Structure → Keyboard) and try a vision simulation next." })) : virtualList({
    items: rows,
    rowHeight,
    rowKey: (row2) => row2.kind === "group" ? `g:${row2.rule}` : `f:${row2.index}`,
    version: [ui.a11ySelected, ui.a11yCollapsed.size, run.at, ui.a11yFilter, ui.a11yCategory, [...ui.a11yImpacts].join()],
    role: "list",
    ariaLabel: "Accessibility issues",
    testid: "a11y-issues",
    empty: emptyState({ icon: "filter", title: "No issue matches the filters" }),
    onKeyDown: (event) => {
      const findingsOnly = rows.filter((r) => r.kind === "finding");
      const at = findingsOnly.findIndex((r) => r.index === ui.a11ySelected);
      if (event.key === "ArrowDown" || event.key === "j") {
        event.preventDefault();
        const next = findingsOnly[Math.min(findingsOnly.length - 1, at + 1)];
        if (next) selectFinding(ctx, next.finding, next.index);
      }
      if (event.key === "ArrowUp" || event.key === "k") {
        event.preventDefault();
        const prev = findingsOnly[Math.max(0, at - 1)];
        if (prev) selectFinding(ctx, prev.finding, prev.index);
      }
    },
    renderRow: (row2) => {
      if (row2.kind === "group") {
        const collapsed = ui.a11yCollapsed.has(row2.rule);
        return h(
          "div",
          {
            class: "row ax-group",
            role: "button",
            "aria-expanded": !collapsed,
            "data-dt": "a11y-group",
            onClick: () => {
              if (collapsed) ui.a11yCollapsed.delete(row2.rule);
              else ui.a11yCollapsed.add(row2.rule);
              ctx.refresh();
            }
          },
          h("span", { class: ["twist", collapsed ? "" : "is-open"], "aria-hidden": "true" }, icon("chevronRight", { size: 11 })),
          h("span", { class: `ax-dot t-${IMPACT_TONE[row2.impact]}` }),
          h("span", { class: "ax-group-title" }, RULE_INFO[row2.rule]?.title ?? row2.rule),
          h("span", { class: "ax-group-rule mono" }, row2.rule),
          spacer(),
          ...row2.wcag.slice(0, 2).map((c) => h("span", { class: "ax-wcag-mini", "data-tip": WCAG[c] ? `WCAG ${c} ${WCAG[c].name} (${WCAG[c].level})` : `WCAG ${c}` }, c)),
          h("span", { class: "ax-count num" }, String(row2.count))
        );
      }
      const selectedRow = row2.index === ui.a11ySelected;
      return h(
        "div",
        {
          class: ["row", "ax-item", selectedRow ? "is-selected" : ""],
          role: "listitem",
          "data-dt": "a11y-finding",
          onClick: () => selectFinding(ctx, row2.finding, row2.index),
          onMouseEnter: () => ctx.highlightElement(row2.finding.element, { component: `#${row2.number}`, kind: row2.finding.rule }),
          onMouseLeave: () => ctx.highlightElement(null)
        },
        h("span", { class: ["ax-num", `t-${IMPACT_TONE[row2.finding.impact]}`] }, String(row2.number)),
        h("span", { class: "ellipsis grow" }, row2.finding.message),
        row2.finding.detail ? h("span", { class: "ax-detail-chip mono" }, row2.finding.detail) : null
      );
    }
  });
  const left = h("div", { class: "ax-left" }, summary, run.findings.length > 0 ? filters : null, list);
  if (!selected) return left;
  const detail = findingDetail$1(ctx, selected, selectedNumber);
  return ctx.width() >= 780 ? split({ size: paneSize(ctx, "a11y.issues", Math.round(ctx.width() * 0.52)), min: 320, onResize: (s) => setPaneSize(ctx, "a11y.issues", s), first: left, second: detail }) : split({ direction: "col", size: Math.round(ctx.height() * 0.45), min: 160, onResize: () => void 0, first: left, second: detail });
}
const LANDMARK = /* @__PURE__ */ new Set(["banner", "navigation", "main", "complementary", "contentinfo", "region", "search", "form"]);
const INTERACTIVE = /* @__PURE__ */ new Set(["button", "link", "textbox", "searchbox", "checkbox", "radio", "switch", "combobox", "listbox", "option", "slider", "spinbutton", "tab", "menuitem", "menuitemcheckbox", "menuitemradio", "treeitem"]);
function roleTone(role) {
  if (LANDMARK.has(role)) return "is-landmark";
  if (INTERACTIVE.has(role)) return "is-interactive";
  if (role === "heading") return "is-heading";
  if (role === "text" || role === "generic") return "is-text";
  return "";
}
function flattenAx(nodes, collapsed, filter) {
  const rows = [];
  const q = filter.trim().toLowerCase();
  const visit = (node, path, depth) => {
    const children = node.children.filter((child) => !(child.role === "text" && child.name === node.name && node.children.length === 1));
    const hasChildren = children.length > 0;
    const isCollapsed = !q && hasChildren && collapsed.has(path);
    if (!q || `${node.role} ${node.name}`.toLowerCase().includes(q)) rows.push({ node, path, depth: q ? 0 : depth, hasChildren: !q && hasChildren, collapsed: isCollapsed });
    if (isCollapsed) return;
    children.forEach((child, i) => visit(child, `${path}/${i}`, depth + 1));
  };
  nodes.forEach((node, i) => visit(node, String(i), 0));
  return rows;
}
function treePane(ctx) {
  const { app, ui, model } = ctx;
  const root = renderRootElement(app);
  const tree = ctx.memo("a11y.tree", [app?.id, model.revs.commit, root], () => accessibilityTree(root));
  const rows = flattenAx(tree, ui.a11yTreeCollapsed, ui.a11yTreeFilter);
  const selected = rows.find((r) => r.path === ui.a11yTreeSelected) ?? null;
  const selectedIndex = selected ? rows.indexOf(selected) : -1;
  const select2 = (row2) => {
    if (!row2) return;
    ui.a11yTreeSelected = row2.path;
    ctx.highlightElement(row2.node.element, { component: row2.node.role, kind: row2.node.name || void 0 }, true);
    ctx.refresh();
  };
  const toggle = (row2) => {
    if (ui.a11yTreeCollapsed.has(row2.path)) ui.a11yTreeCollapsed.delete(row2.path);
    else ui.a11yTreeCollapsed.add(row2.path);
    ctx.refresh();
  };
  const list = h(
    "div",
    { class: "ax-left" },
    h(
      "div",
      { class: "ax-filters" },
      searchField({ value: ui.a11yTreeFilter, placeholder: "Find role or name…", onInput: (v) => {
        ui.a11yTreeFilter = v;
        ctx.refresh();
      } }),
      spacer(),
      h("span", { class: "t3 num", style: { fontSize: "var(--dt-fs-sm)" } }, `${rows.length} nodes`),
      iconButton({ icon: "minimize", label: "Collapse all", size: "sm", onClick: () => {
        const all = flattenAx(tree, /* @__PURE__ */ new Set(), "");
        for (const r of all) if (r.hasChildren && r.depth > 0) ui.a11yTreeCollapsed.add(r.path);
        ctx.refresh();
      } }),
      iconButton({ icon: "maximize", label: "Expand all", size: "sm", onClick: () => {
        ui.a11yTreeCollapsed.clear();
        ctx.refresh();
      } })
    ),
    virtualList({
      items: rows,
      rowHeight: ctx.rowHeight,
      rowKey: (row2) => row2.path,
      version: [ui.a11yTreeSelected, ui.a11yTreeCollapsed.size, model.revs.commit, ui.a11yTreeFilter],
      scrollTo: selectedIndex >= 0 ? selectedIndex : null,
      role: "tree",
      ariaLabel: "Accessibility tree",
      testid: "a11y-tree",
      empty: emptyState({ icon: "tree", title: root ? "Nothing exposed to assistive tech" : "The app has not rendered yet" }),
      onKeyDown: (event) => {
        const row2 = rows[selectedIndex];
        switch (event.key) {
          case "ArrowDown":
            event.preventDefault();
            select2(rows[Math.min(rows.length - 1, selectedIndex + 1)]);
            break;
          case "ArrowUp":
            event.preventDefault();
            select2(rows[Math.max(0, selectedIndex - 1)]);
            break;
          case "ArrowRight":
            if (row2?.hasChildren && row2.collapsed) {
              event.preventDefault();
              toggle(row2);
            }
            break;
          case "ArrowLeft":
            if (row2?.hasChildren && !row2.collapsed) {
              event.preventDefault();
              toggle(row2);
            }
            break;
        }
      },
      renderRow: (row2) => h(
        "div",
        {
          class: ["row", "ax-node", row2.path === ui.a11yTreeSelected ? "is-selected" : ""],
          role: "treeitem",
          "aria-level": row2.depth + 1,
          "aria-expanded": row2.hasChildren ? !row2.collapsed : void 0,
          "data-dt": "ax-node",
          style: { paddingLeft: `${6 + row2.depth * 14}px` },
          onClick: () => select2(row2),
          onMouseEnter: () => ctx.highlightElement(row2.node.element, { component: row2.node.role }),
          onMouseLeave: () => ctx.highlightElement(null)
        },
        h("button", { type: "button", tabindex: -1, "aria-hidden": "true", class: ["twist", row2.hasChildren ? "" : "is-leaf", row2.hasChildren && !row2.collapsed ? "is-open" : ""], onClick: (event) => {
          event.stopPropagation();
          toggle(row2);
        } }, icon("chevronRight", { size: 11 })),
        h("span", { class: ["ax-role", roleTone(row2.node.role)] }, row2.node.role),
        row2.node.name ? h("span", { class: "ax-name ellipsis" }, row2.node.role === "text" ? row2.node.name : `“${row2.node.name}”`) : INTERACTIVE.has(row2.node.role) ? h("span", { class: "ax-unnamed" }, "no name") : null,
        row2.node.states.length > 0 ? h("span", { class: "ax-states" }, row2.node.states.slice(0, 3).join(" · ")) : null,
        row2.node.focusable ? h("span", { class: "ax-focusable", "data-tip": "In the tab order" }, icon("keyboard", { size: 11 })) : null
      )
    })
  );
  if (!selected) return list;
  const node = selected.node;
  const findings = ui.a11yRun?.findings.filter((f) => f.element === node.element) ?? [];
  const owner = can(app, "instanceForNode") ? app.instanceForNode(node.element) : null;
  const detail = h(
    "div",
    { class: "ax-detail", "data-dt": "ax-node-detail" },
    h(
      "div",
      { class: "pane-head" },
      h("span", { class: ["ax-role", roleTone(node.role)] }, node.role),
      h("span", { class: "pane-title" }, node.name || "(no name)"),
      spacer(),
      iconButton({ icon: "close", label: "Close", size: "sm", onClick: () => {
        ui.a11yTreeSelected = null;
        ctx.highlightElement(null, void 0, true);
        ctx.refresh();
      } })
    ),
    h(
      "div",
      { class: "pane-body is-pad stack" },
      h("div", { class: "ax-announce is-big" }, icon("a11y", { size: 14 }), h("span", {}, announce(node.element))),
      kv([
        ["Role", h("code", {}, node.role)],
        ["Name", node.name ? node.name : h("span", { class: "tone-red" }, INTERACTIVE.has(node.role) ? "missing — this control is announced without a name" : "none")],
        ["States", node.states.length > 0 ? h("span", { class: "chips" }, ...node.states.map((s) => chip(s, "grey"))) : "none"],
        ["Keyboard", node.focusable ? "in the tab order" : "not focusable"],
        ["Element", h("code", {}, describeElement(node.element))]
      ]),
      findings.length > 0 ? h(
        "div",
        {},
        h("div", { class: "it-sub" }, `Audit issues on this element (${findings.length})`),
        ...findings.map((f) => note(f.impact === "minor" ? "info" : "warn", [h("strong", {}, `${RULE_INFO[f.rule]?.title ?? f.rule}. `), f.message]))
      ) : null,
      h(
        "div",
        { class: "row-flex" },
        owner ? button({ label: "Inspect component", size: "sm", icon: "inspect", onClick: () => ctx.selectInstance(owner, { reveal: true }) }) : null,
        button({ label: "Copy selector", size: "sm", variant: "ghost", icon: "copy", onClick: () => ctx.copy(cssPath(node.element), "the selector") })
      )
    )
  );
  return ctx.width() >= 780 ? split({ size: paneSize(ctx, "a11y.tree", Math.round(ctx.width() * 0.55)), min: 300, onResize: (s) => setPaneSize(ctx, "a11y.tree", s), first: list, second: detail }) : split({ direction: "col", size: Math.round(ctx.height() * 0.5), min: 160, onResize: () => void 0, first: list, second: detail });
}
function walkTo(ctx, order, index) {
  const element = order[index];
  if (!element) return;
  ctx.ui.a11yWalk = index;
  try {
    element.focus({ preventScroll: false });
  } catch {
  }
  ctx.highlightElement(element, { component: `Tab stop ${index + 1}`, kind: announce(element) }, true);
  ctx.refresh();
}
function structurePane(ctx) {
  const { app, ui, model } = ctx;
  const root = renderRootElement(app);
  const marks = ctx.memo("a11y.landmarks", [app?.id, model.revs.commit, root], () => landmarks(root));
  const headings = ctx.memo("a11y.headings", [app?.id, model.revs.commit, root], () => headingOutline(root));
  const order = ctx.memo("a11y.tabs", [app?.id, model.revs.commit, root], () => tabOrder(root));
  const hover = (element, label) => ctx.highlightElement(element, label ? { component: label } : void 0);
  const landmarkNotes = [];
  const roleCount = (role) => marks.filter((m) => m.role === role).length;
  if (roleCount("main") === 0) landmarkNotes.push(note("warn", ["No ", h("code", {}, "main"), " landmark — screen-reader users cannot jump straight to the content. Wrap it in ", h("code", {}, "<main>"), "."]));
  if (roleCount("main") > 1) landmarkNotes.push(note("warn", "More than one main landmark."));
  if (roleCount("navigation") > 1 && marks.filter((m) => m.role === "navigation" && m.label === "navigation").length > 0) landmarkNotes.push(note("info", "Several navigation landmarks without labels — give each an aria-label so they can be told apart."));
  const headingNotes = [];
  if (headings.length > 0 && !headings.some((hd) => hd.level === 1)) headingNotes.push(note("info", "No level-1 heading. The page's main heading should be an h1."));
  if (headings.some((hd) => hd.skipped)) headingNotes.push(note("warn", "The outline skips levels (marked below). Screen-reader users navigate by heading level, so a hole reads like missing content."));
  const walkIndex = ui.a11yWalk >= 0 && ui.a11yWalk < order.length ? ui.a11yWalk : -1;
  return h(
    "div",
    { class: "dt-scroll" },
    h(
      "div",
      { class: "ax-structure" },
      card({
        title: "Keyboard",
        icon: "keyboard",
        testid: "a11y-keyboard",
        sub: plural(order.length, "tab stop"),
        actions: [toggleSwitch({ checked: ui.a11yTabOrder, label: "Show path on page", testid: "a11y-taborder-toggle", onChange: (v) => {
          ui.a11yTabOrder = v;
          ctx.refresh();
        } })],
        flush: true,
        body: h(
          "div",
          {},
          h(
            "div",
            { class: "ax-walk" },
            button({ label: "Previous", size: "sm", icon: "chevronLeft", disabled: order.length === 0 || walkIndex <= 0, onClick: () => walkTo(ctx, order, walkIndex - 1) }),
            button({ label: walkIndex < 0 ? "Start focus walk" : "Next", size: "sm", variant: "primary", icon: walkIndex < 0 ? "play" : "chevronRight", testid: "a11y-walk-next", disabled: order.length === 0 || walkIndex >= order.length - 1, onClick: () => walkTo(ctx, order, walkIndex + 1) }),
            h("span", { class: "ax-walk-status" }, walkIndex >= 0 ? [h("strong", {}, `${walkIndex + 1}/${order.length}`), " ", announce(order[walkIndex])] : "Moves real focus through the app, announcing each stop the way a screen reader would."),
            walkIndex >= 0 ? iconButton({ icon: "close", label: "End walk", size: "sm", onClick: () => {
              ui.a11yWalk = -1;
              ctx.highlightElement(null, void 0, true);
              ctx.refresh();
            } }) : null
          ),
          order.length === 0 ? h("div", { class: "dt-pad t3" }, "Nothing in the app can take keyboard focus.") : h("ol", { class: "ax-stops" }, ...order.slice(0, 120).map((element, i) => h(
            "li",
            {
              key: i,
              class: ["ax-stop", i === walkIndex ? "is-on" : ""],
              onMouseEnter: () => hover(element, `Tab stop ${i + 1}`),
              onMouseLeave: () => hover(null),
              onClick: () => walkTo(ctx, order, i)
            },
            h("span", { class: "ax-stop-n num" }, String(i + 1)),
            h("span", { class: "ellipsis" }, announce(element)),
            Number(element.getAttribute("tabindex") ?? "0") > 0 ? chip(`tabindex=${element.getAttribute("tabindex")}`, "amber", { tip: "Positive tabindex reorders focus — avoid it" }) : null
          )))
        )
      }),
      card({
        title: "Landmarks",
        icon: "landmark",
        testid: "a11y-landmarks",
        sub: plural(marks.length, "landmark"),
        actions: [toggleSwitch({ checked: ui.a11yLandmarks, label: "Outline on page", onChange: (v) => {
          ui.a11yLandmarks = v;
          ctx.refresh();
        } })],
        body: h(
          "div",
          { class: "stack" },
          ...landmarkNotes,
          marks.length === 0 ? h("div", { class: "t3" }, "No landmarks.") : h("div", { class: "ax-marks" }, ...marks.map((mark, i) => h("div", {
            key: i,
            class: "ax-mark",
            onMouseEnter: () => hover(mark.element, mark.label),
            onMouseLeave: () => hover(null),
            onClick: () => ctx.highlightElement(mark.element, { component: mark.label }, true)
          }, h("span", { class: "ax-role is-landmark" }, mark.role), h("span", { class: "ellipsis" }, mark.label === mark.role ? h("span", { class: "t4" }, "unlabelled") : mark.label.slice(mark.role.length + 1)))))
        )
      }),
      card({
        title: "Heading outline",
        icon: "heading",
        testid: "a11y-headings",
        sub: plural(headings.length, "heading"),
        body: h(
          "div",
          { class: "stack" },
          ...headingNotes,
          headings.length === 0 ? h("div", { class: "t3" }, "No headings. Long pages without them are hard to skim with a screen reader.") : h("div", { class: "ax-outline" }, ...headings.map((heading, i) => h(
            "div",
            {
              key: i,
              class: ["ax-heading", heading.skipped ? "is-skipped" : "", !heading.text ? "is-empty" : ""],
              style: { paddingLeft: `${(heading.level - 1) * 16 + 4}px` },
              onMouseEnter: () => hover(heading.element, `h${heading.level}`),
              onMouseLeave: () => hover(null),
              onClick: () => ctx.highlightElement(heading.element, { component: `h${heading.level}` }, true)
            },
            h("span", { class: "ax-hlevel" }, `H${heading.level}`),
            h("span", { class: "ellipsis" }, heading.text || "(empty heading)"),
            heading.skipped ? chip("skipped a level", "red") : null
          )))
        )
      })
    )
  );
}
const VISION = [
  { value: "none", label: "Normal vision", detail: "No simulation" },
  { value: "deuteranopia", label: "Deuteranopia", detail: "No green cones · ~1 in 16 men have some green weakness" },
  { value: "protanopia", label: "Protanopia", detail: "No red cones · reds look dark" },
  { value: "tritanopia", label: "Tritanopia", detail: "No blue cones · rare" },
  { value: "achromatopsia", label: "Achromatopsia", detail: "No colour at all · meaning must not rely on hue" },
  { value: "blur", label: "Blurred vision", detail: "Uncorrected eyesight, cataracts, a phone at arm's length" },
  { value: "low-contrast", label: "Low contrast", detail: "Glare, ageing eyes, a dim screen outdoors" }
];
function contrastChecker(ctx) {
  const { ui } = ctx;
  const fg = parseColor(ui.contrastFg);
  const bg = parseColor(ui.contrastBg);
  const ratio = fg && bg ? contrastRatio(fg, bg) : null;
  const pass = (target) => ratio === null ? chip("—", "grey") : ratio >= target ? chip("pass", "green", { icon: "check" }) : chip("fail", "red", { icon: "close" });
  const suggestion = fg && bg && ratio !== null && ratio < 4.5 ? suggestForeground(fg, bg, 4.55) : null;
  const colorInput = (value, label, onChange) => h(
    "span",
    { class: "ax-color" },
    h("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(value) ? value : "#000000", "aria-label": `${label} colour picker`, onInput: (e) => onChange(e.target.value) }),
    field({ value, mono: true, width: "96px", label, onInput: onChange })
  );
  const selectedElement = ui.a11ySelected !== null ? ui.a11yRun?.findings[ui.a11ySelected]?.element ?? null : null;
  return card({
    title: "Contrast checker",
    icon: "contrast",
    testid: "a11y-contrast",
    actions: selectedElement ? [button({ label: "From selected issue", size: "sm", variant: "ghost", onClick: () => {
      const c = elementColors(selectedElement);
      if (c) {
        ui.contrastFg = toHex(c.fg);
        ui.contrastBg = toHex(c.bg);
        ctx.refresh();
      }
    } })] : [],
    body: h(
      "div",
      { class: "ax-checker" },
      h(
        "div",
        { class: "ax-checker-inputs" },
        h("label", { class: "ax-field" }, h("span", { class: "t3" }, "Text"), colorInput(ui.contrastFg, "Text colour", (v) => {
          ui.contrastFg = v;
          ctx.refresh();
        })),
        iconButton({ icon: "refresh", label: "Swap", size: "sm", onClick: () => {
          const t = ui.contrastFg;
          ui.contrastFg = ui.contrastBg;
          ui.contrastBg = t;
          ctx.refresh();
        } }),
        h("label", { class: "ax-field" }, h("span", { class: "t3" }, "Background"), colorInput(ui.contrastBg, "Background colour", (v) => {
          ui.contrastBg = v;
          ctx.refresh();
        }))
      ),
      h(
        "div",
        { class: "ax-checker-preview", style: { color: fg ? ui.contrastFg : void 0, background: bg ? ui.contrastBg : void 0 } },
        h("div", { class: "ax-big" }, "Large text 24px"),
        h("div", {}, "Body text at 14px should stay readable for everyone.")
      ),
      h("div", { class: "ax-ratio num", "data-dt": "contrast-ratio" }, ratio === null ? "—" : `${ratio.toFixed(2)}:1`),
      h(
        "div",
        { class: "ax-grades" },
        h("span", {}, "AA normal ", h("small", { class: "t3" }, "4.5"), pass(4.5)),
        h("span", {}, "AA large ", h("small", { class: "t3" }, "3"), pass(3)),
        h("span", {}, "AAA normal ", h("small", { class: "t3" }, "7"), pass(7)),
        h("span", {}, "AAA large ", h("small", { class: "t3" }, "4.5"), pass(4.5)),
        h("span", {}, "UI parts ", h("small", { class: "t3" }, "3"), pass(3))
      ),
      suggestion ? note("accent", [
        "Closest passing text colour: ",
        h("code", {}, suggestion.hex),
        ` (${suggestion.ratio.toFixed(2)}:1). `,
        button({ label: "Use it", size: "sm", variant: "ghost", onClick: () => {
          ui.contrastFg = suggestion.hex;
          ctx.refresh();
        } })
      ], { icon: "wand" }) : null
    )
  });
}
function visionPane(ctx) {
  const { ui, app } = ctx;
  const canScale = can(app, "getTheme") && can(app, "setThemeTokens");
  return h(
    "div",
    { class: "dt-scroll" },
    h(
      "div",
      { class: "ax-structure" },
      card({
        title: "Vision simulation",
        icon: "vision",
        testid: "a11y-vision",
        sub: "Applied to the app only — the panel stays true-colour",
        body: h("div", { class: "ax-visions" }, ...VISION.map((mode) => h("button", {
          key: mode.value,
          type: "button",
          class: ["ax-vision", ui.a11yVision === mode.value ? "is-on" : ""],
          "aria-pressed": ui.a11yVision === mode.value,
          "data-dt": `vision-${mode.value}`,
          onClick: () => {
            ui.a11yVision = mode.value;
            ctx.refresh();
          }
        }, h("span", { class: ["ax-vision-swatch", `is-${mode.value}`], "aria-hidden": "true" }), h("span", { class: "ax-vision-label" }, mode.label), h("span", { class: "ax-vision-detail" }, mode.detail))))
      }),
      card({
        title: "Text size",
        icon: "type",
        testid: "a11y-textscale",
        sub: "WCAG 1.4.4 — text must work at 200%",
        body: h(
          "div",
          { class: "stack" },
          segmented([
            { value: "1", label: "100%" },
            { value: "1.25", label: "125%" },
            { value: "1.5", label: "150%" },
            { value: "2", label: "200%" }
          ], String(ui.emulateTextScale), (value) => {
            ui.emulateTextScale = Number(value);
            ctx.refresh();
          }, { label: "Text scale" }),
          canScale ? h("div", { class: "t3" }, "Scales the theme's font-size tokens, so the app reflows the way it would for a user with larger default text. Look for clipped labels and overlapping controls.") : note("info", "This runtime does not expose its theme tokens, so text scaling is unavailable.")
        )
      }),
      contrastChecker(ctx)
    )
  );
}
function render$5(ctx) {
  const { app, ui } = ctx;
  if (!app) return noApp(ctx, "Accessibility", "a11y");
  if (ui.a11yRequested) {
    ui.a11yRequested = false;
    runAudit(ctx, { quiet: ui.a11yAuto && ui.a11yRun !== null });
  }
  const run = ui.a11yRun;
  const numbered = run ? visibleFindings(run.findings, ui) : [];
  let body;
  switch (ui.a11yPane) {
    case "tree":
      body = treePane(ctx);
      break;
    case "structure":
      body = structurePane(ctx);
      break;
    case "vision":
      body = visionPane(ctx);
      break;
    default:
      body = issuesPane(ctx);
  }
  const simulating = ui.a11yVision !== "none" || ui.emulateTextScale !== 1;
  return h(
    "div",
    { class: "ax", "data-dt": "a11y" },
    viewbar(
      segmented([
        { value: "issues", label: "Issues", icon: "warning", count: run ? run.findings.length : null },
        { value: "tree", label: "A11y tree", icon: "tree" },
        { value: "structure", label: "Structure", icon: "landmark" },
        { value: "vision", label: "Vision", icon: "vision", count: simulating ? "on" : null }
      ], ui.a11yPane, (value) => {
        if (ui.a11yWalk >= 0 && value !== "structure") {
          ui.a11yWalk = -1;
          ctx.highlightElement(null, void 0, true);
        }
        ui.a11yPane = value;
        ctx.refresh();
      }, { label: "Accessibility view", testid: "a11y-panes" }),
      spacer(),
      simulating ? chip("simulation on", "purple", { icon: "vision", onClick: () => {
        ui.a11yVision = "none";
        ui.emulateTextScale = 1;
        ctx.refresh();
      }, tip: "Click to turn every simulation off" }) : null,
      run ? toggleSwitch({ checked: ui.a11yShowOnPage, label: "Markers", testid: "a11y-markers", onChange: (v) => {
        ui.a11yShowOnPage = v;
        ctx.refresh();
      } }) : null,
      run ? toggleSwitch({ checked: ui.a11yAuto, label: "Auto", testid: "a11y-auto", onChange: (v) => {
        ui.a11yAuto = v;
        ctx.refresh();
      } }) : null,
      vsep(),
      button({ label: run ? "Re-run" : "Run audit", size: "sm", variant: run ? "default" : "primary", icon: run ? "refresh" : "play", testid: "a11y-rerun", onClick: () => runAudit(ctx) }),
      run ? iconButton({ icon: "download", label: "Export report", size: "sm", onClick: (event) => ctx.openMenu(event, [
        { label: "Copy as Markdown", icon: "copy", run: () => ctx.copy(reportMarkdown$1(ctx, numbered), "the report") },
        { label: "Download JSON", icon: "download", run: () => downloadText(`a11y-${app.label.replace(/[^\w.-]+/g, "_")}.json`, reportJson$1(ctx, numbered)) },
        { label: "Download Markdown", icon: "file", run: () => downloadText(`a11y-${app.label.replace(/[^\w.-]+/g, "_")}.md`, reportMarkdown$1(ctx, numbered), "text/markdown") }
      ]) }) : null
    ),
    body
  );
}
const a11yView = {
  id: "a11y",
  label: "Accessibility",
  icon: "a11y",
  group: "quality",
  hint: "WCAG 2.2 audit, accessibility tree, keyboard walk, vision simulation",
  keywords: "accessibility a11y wcag aria contrast screen reader tab order landmarks headings color blind vision audit",
  badge: (ctx) => {
    const run = ctx.ui.a11yRun;
    if (!run) return null;
    const severe = run.findings.filter((f) => f.impact === "critical" || f.impact === "serious").length;
    return severe > 0 ? { value: severe, tone: "red" } : run.findings.length > 0 ? { value: run.findings.length, tone: "amber" } : null;
  },
  render: render$5,
  commands: (ctx) => [
    { id: "a11y:run", label: "Run accessibility audit", icon: "a11y", keywords: "wcag audit", run: () => {
      ctx.ui.a11yRequested = true;
      ctx.ui.a11yPane = "issues";
      ctx.selectTab("a11y");
    } },
    { id: "a11y:taborder", label: `${ctx.ui.a11yTabOrder ? "Hide" : "Show"} keyboard tab order on the page`, icon: "tabOrder", run: () => {
      ctx.ui.a11yTabOrder = !ctx.ui.a11yTabOrder;
      ctx.refresh();
    } },
    { id: "a11y:landmarks", label: `${ctx.ui.a11yLandmarks ? "Hide" : "Show"} landmarks on the page`, icon: "landmark", run: () => {
      ctx.ui.a11yLandmarks = !ctx.ui.a11yLandmarks;
      ctx.refresh();
    } },
    ...VISION.filter((m) => m.value !== "none").map((mode) => ({
      id: `a11y:vision:${mode.value}`,
      label: `Simulate ${mode.label.toLowerCase()}`,
      icon: "vision",
      keywords: "color blind vision",
      run: () => {
        ctx.ui.a11yVision = mode.value;
        ctx.refresh();
      }
    })),
    { id: "a11y:vision:none", label: "Stop vision simulation", icon: "eye", run: () => {
      ctx.ui.a11yVision = "none";
      ctx.ui.emulateTextScale = 1;
      ctx.refresh();
    } }
  ],
  css: (
    /* css */
    `
.ax { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.ax-left { flex: 1 1 auto; min-height: 0; min-width: 0; display: flex; flex-direction: column; }
.ax-detail { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.ax-summary { flex: none; display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-bottom: 1px solid var(--dt-border); flex-wrap: wrap; }
.ax-summary-text { display: flex; flex-direction: column; gap: 3px; min-width: 150px; }
.ax-summary-title { font-size: 15px; font-weight: 650; display: flex; align-items: center; gap: 8px; }
.ax-summary-text .t3 { font-size: var(--dt-fs-sm); }
.ax-trend { font-size: var(--dt-fs-xs); font-weight: 700; padding: 1px 6px; border-radius: 99px; }
.ax-trend.is-up { color: var(--dt-green); background: var(--dt-green-soft); }
.ax-trend.is-down { color: var(--dt-red); background: var(--dt-red-soft); }
.ax-impacts { display: flex; gap: 6px; flex-wrap: wrap; margin-left: auto; }
.ax-filters { flex: none; display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-bottom: 1px solid var(--dt-border); flex-wrap: wrap; }
.ax-cats { display: flex; gap: 5px; flex-wrap: wrap; }
.ax-group { gap: 8px; font-weight: 600; background: var(--dt-bg-1); cursor: pointer; border-bottom: 1px solid var(--dt-border); }
.ax-group:hover { background: var(--dt-bg-hover); }
.ax-group-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ax-group-rule { color: var(--dt-text-3); font-weight: 400; font-size: var(--dt-fs-xs); white-space: nowrap; }
.ax-wcag-mini { font: 600 10px/1 var(--dt-mono); color: var(--dt-text-3); border: 1px solid var(--dt-border-strong); border-radius: 4px; padding: 2px 4px; }
.ax-count { min-width: 22px; text-align: center; font-size: var(--dt-fs-xs); font-weight: 700; color: var(--dt-text-2); background: var(--dt-bg-active); border-radius: 99px; padding: 2px 6px; }
.ax-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--dt-text-4); }
.ax-dot.t-red { background: var(--dt-red); } .ax-dot.t-orange { background: var(--dt-orange); } .ax-dot.t-amber { background: var(--dt-amber); } .ax-dot.t-blue { background: var(--dt-blue); }
.ax-item { gap: 8px; padding-left: 30px; cursor: pointer; }
.ax-num { flex: none; min-width: 20px; height: 18px; padding: 0 5px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; font: 700 10px/1 var(--dt-sans); color: #fff; background: var(--dt-text-4); font-variant-numeric: tabular-nums; }
.ax-num.t-red { background: var(--dt-red); } .ax-num.t-orange { background: var(--dt-orange); } .ax-num.t-amber { background: var(--dt-amber); color: #1a1300; } .ax-num.t-blue { background: var(--dt-blue); }
.ax-detail-chip { font-size: var(--dt-fs-xs); color: var(--dt-amber); flex: none; }
.ax-message { font-size: var(--dt-fs-md); line-height: 1.5; color: var(--dt-text); }
.ax-wcag { display: flex; flex-direction: column; gap: 4px; }
.ax-sc { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid var(--dt-border); border-radius: var(--dt-r-sm); color: var(--dt-text); text-decoration: none; font-size: var(--dt-fs-sm); }
a.ax-sc:hover { border-color: var(--dt-accent); background: var(--dt-accent-soft); }
.ax-sc-id { font: 600 var(--dt-fs-xs) var(--dt-mono); color: var(--dt-accent-text); }
.ax-sc-name { flex: 1 1 auto; }
.ax-sc-level { font-size: 10px; font-weight: 700; color: var(--dt-text-3); border: 1px solid var(--dt-border-strong); border-radius: 4px; padding: 1px 4px; }
.ax-el { display: block; padding: 7px 9px; border-radius: var(--dt-r-sm); background: var(--dt-bg-2); font-size: var(--dt-fs-sm); overflow-wrap: anywhere; }
.ax-announce { display: flex; align-items: flex-start; gap: 7px; margin-top: 8px; padding: 7px 9px; border-radius: var(--dt-r-sm); border: 1px dashed var(--dt-border-strong); color: var(--dt-text-2); font-size: var(--dt-fs-sm); font-style: italic; }
.ax-announce > svg { margin-top: 2px; flex: none; color: var(--dt-accent); }
.ax-announce.is-big { font-size: var(--dt-fs-md); margin-top: 0; }
.ax-el-actions { margin-top: 8px; flex-wrap: wrap; }
.ax-contrast { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.ax-sample { width: 64px; height: 52px; border-radius: var(--dt-r-md); border: 1px solid var(--dt-border-strong); display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 20px; font-weight: 650; line-height: 1.1; }
.ax-sample small { font-size: 10px; font-weight: 600; opacity: 0.9; }
.ax-contrast-text { display: flex; flex-direction: column; gap: 4px; font-size: var(--dt-fs-sm); min-width: 180px; flex: 1 1 auto; }
.ax-node { gap: 6px; }
.ax-role { font: 600 var(--dt-fs-xs) var(--dt-mono); color: var(--dt-text-2); white-space: nowrap; }
.ax-role.is-landmark { color: var(--dt-purple); }
.ax-role.is-interactive { color: var(--dt-cyan); }
.ax-role.is-heading { color: var(--dt-amber); }
.ax-role.is-text { color: var(--dt-text-4); font-weight: 400; }
.ax-name { color: var(--dt-text); }
.ax-unnamed { color: var(--dt-red); font-size: var(--dt-fs-xs); font-style: italic; }
.ax-states { color: var(--dt-text-3); font-size: var(--dt-fs-xs); white-space: nowrap; }
.ax-focusable { color: var(--dt-text-3); display: inline-flex; margin-left: auto; }
.ax-structure { padding: 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(330px, 1fr)); gap: 12px; align-items: start; }
.ax-walk { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--dt-border); flex-wrap: wrap; }
.ax-walk-status { flex: 1 1 200px; font-size: var(--dt-fs-sm); color: var(--dt-text-2); min-width: 0; }
.ax-stops { list-style: none; margin: 0; padding: 4px 0; max-height: 320px; overflow: auto; }
.ax-stop { display: flex; align-items: center; gap: 8px; padding: 4px 12px; font-size: var(--dt-fs-sm); cursor: pointer; }
.ax-stop:hover { background: var(--dt-bg-hover); }
.ax-stop.is-on { background: var(--dt-accent-soft); }
.ax-stop-n { min-width: 22px; height: 18px; border-radius: 9px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; background: var(--dt-accent); color: #fff; flex: none; }
.ax-marks, .ax-outline { display: flex; flex-direction: column; }
.ax-mark, .ax-heading { display: flex; align-items: center; gap: 8px; padding: 5px 4px; font-size: var(--dt-fs-sm); border-radius: var(--dt-r-sm); cursor: pointer; min-width: 0; }
.ax-mark:hover, .ax-heading:hover { background: var(--dt-bg-hover); }
.ax-hlevel { font: 700 10px/1 var(--dt-mono); color: var(--dt-amber); border: 1px solid currentColor; border-radius: 4px; padding: 2px 4px; flex: none; }
.ax-heading.is-skipped .ax-hlevel, .ax-heading.is-empty .ax-hlevel { color: var(--dt-red); }
.ax-heading.is-empty > .ellipsis { color: var(--dt-red); font-style: italic; }
.ax-visions { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.ax-vision { all: unset; box-sizing: border-box; cursor: pointer; display: grid; grid-template-columns: 26px 1fr; grid-template-rows: auto auto; column-gap: 8px; row-gap: 2px; padding: 8px; border-radius: var(--dt-r-md); border: 1px solid var(--dt-border); background: var(--dt-bg-1); }
.ax-vision:hover { border-color: var(--dt-border-strong); background: var(--dt-bg-hover); }
.ax-vision:focus-visible { outline: 2px solid var(--dt-accent); outline-offset: 1px; }
.ax-vision.is-on { border-color: var(--dt-accent); background: var(--dt-accent-soft); }
.ax-vision-swatch { grid-row: 1 / 3; width: 26px; height: 26px; border-radius: 50%; background: conic-gradient(#ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ef4444); }
.ax-vision-swatch.is-deuteranopia { background: conic-gradient(#a39b5b, #c9b35a, #b5aa62, #5c78c2, #7a7ab6, #a39b5b); }
.ax-vision-swatch.is-protanopia { background: conic-gradient(#8a8151, #c4b456, #cab86a, #4f73c4, #6b76b5, #8a8151); }
.ax-vision-swatch.is-tritanopia { background: conic-gradient(#e0464b, #f28d9a, #56c3c7, #46a0b0, #c27a86, #e0464b); }
.ax-vision-swatch.is-achromatopsia { background: conic-gradient(#555, #aaa, #888, #666, #777, #555); }
.ax-vision-swatch.is-blur { filter: blur(2px); }
.ax-vision-swatch.is-low-contrast { filter: contrast(0.45) brightness(1.15); }
.ax-vision-label { font-weight: 600; font-size: var(--dt-fs-sm); color: var(--dt-text); }
.ax-vision-detail { font-size: var(--dt-fs-xs); color: var(--dt-text-3); line-height: 1.35; }
.ax-checker { display: flex; flex-direction: column; gap: 12px; }
.ax-checker-inputs { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }
.ax-field { display: flex; flex-direction: column; gap: 4px; font-size: var(--dt-fs-xs); }
.ax-color { display: inline-flex; align-items: center; gap: 6px; }
.ax-color input[type="color"] { width: 28px; height: 26px; padding: 0; border: 1px solid var(--dt-border-strong); border-radius: var(--dt-r-sm); background: none; cursor: pointer; }
.ax-checker-preview { padding: 12px 14px; border-radius: var(--dt-r-md); border: 1px solid var(--dt-border-strong); display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
.ax-big { font-size: 24px; font-weight: 650; line-height: 1.15; }
.ax-ratio { font-size: 28px; font-weight: 750; letter-spacing: -0.02em; }
.ax-grades { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px; font-size: var(--dt-fs-sm); }
.ax-grades > span { display: flex; align-items: center; gap: 6px; }
.ax-grades > span > .chip { margin-left: auto; }
`
  )
};
const SEVERITIES = ["high", "medium", "low", "info"];
const SEVERITY_TONE = { high: "red", medium: "orange", low: "amber", info: "blue" };
const CATEGORY = {
  program: { label: "Program", icon: "code", blurb: "What the trusted program text can reach" },
  dom: { label: "Rendered output", icon: "layers", blurb: "Whether the sanitiser guarantees hold in the live DOM" },
  transport: { label: "Transport", icon: "network", blurb: "What actually went over the wire" },
  storage: { label: "Storage", icon: "data", blurb: "Credentials readable by any script on this origin" },
  headers: { label: "Headers", icon: "server", blurb: "The page's response headers" },
  csp: { label: "CSP", icon: "lock", blurb: "Content-Security-Policy violations" }
};
function cspMeta() {
  try {
    return document.querySelector('meta[http-equiv="Content-Security-Policy" i]')?.getAttribute("content") ?? null;
  } catch {
    return null;
  }
}
function runScan(ctx, options = {}) {
  const { app, ui, model } = ctx;
  const profile = can(app, "getSecurityProfile") ? safeProfile(() => app.getSecurityProfile()) : null;
  const report2 = scanSecurity({
    root: renderRootElement(app),
    requests: model.network,
    profile,
    location: typeof location !== "undefined" ? { href: location.href, protocol: location.protocol, hostname: location.hostname, origin: location.origin } : null,
    storage: readPageStorage(),
    headers: ui.securityHeaders,
    cspMeta: cspMeta(),
    violations: ctx.cspViolations
  });
  ui.securityRun = report2;
  if (ui.securitySelected && !report2.findings.some((f) => f.id === ui.securitySelected)) ui.securitySelected = null;
  if (!options.quiet) {
    ctx.toast(
      report2.counts.high > 0 ? `${plural(report2.counts.high, "high-severity finding")} — score ${report2.score}` : `Scan complete — score ${report2.score}, ${plural(report2.findings.length, "finding")}`,
      report2.counts.high > 0 ? "bad" : report2.counts.medium > 0 ? "warn" : "good"
    );
  }
  return report2;
}
function safeProfile(read) {
  try {
    return read();
  } catch {
    return null;
  }
}
async function fetchPageHeaders() {
  const response = await fetch(location.href, { method: "HEAD", cache: "no-store", credentials: "same-origin", redirect: "follow" });
  const headers = {};
  response.headers.forEach((value, key2) => {
    headers[key2.toLowerCase()] = value;
  });
  return headers;
}
function checkHeaders(ctx) {
  const { ui } = ctx;
  if (typeof fetch !== "function" || typeof location === "undefined" || !/^https?:$/.test(location.protocol)) {
    ui.securityHeadersState = "error";
    ui.securityHeadersError = "Headers can only be read from a page served over http(s).";
    ctx.refresh();
    return;
  }
  ui.securityHeadersState = "loading";
  ui.securityHeadersError = null;
  ctx.refresh();
  fetchPageHeaders().then((headers) => {
    ui.securityHeaders = headers;
    ui.securityHeadersState = "idle";
    runScan(ctx, { quiet: true });
    ctx.toast(`Read ${Object.keys(headers).length} response headers`, "good");
    ctx.refresh();
  }, (error) => {
    ui.securityHeadersState = "error";
    ui.securityHeadersError = error instanceof Error ? error.message : String(error);
    ctx.refresh();
  });
}
function reportMarkdown(ctx, report2) {
  const lines2 = [
    `# Security report — ${ctx.app?.label ?? "app"}`,
    "",
    `Score **${report2.score}/100** · ${report2.counts.high} high · ${report2.counts.medium} medium · ${report2.counts.low} low · ${report2.counts.info} info`,
    `Page ${report2.pageOrigin || "(unknown)"} · ${report2.secureContext ? "secure context" : "NOT a secure context"} · policy \`${report2.profile?.policy ?? "?"}\` · ${new Date(report2.at).toISOString()}`,
    ""
  ];
  for (const category of Object.keys(CATEGORY)) {
    const items = report2.findings.filter((f) => f.category === category);
    if (items.length === 0) continue;
    lines2.push(`## ${CATEGORY[category].label}`, "");
    for (const finding of items) {
      lines2.push(`### [${finding.severity}] ${finding.title}`, "", finding.detail, "", `**Fix:** ${finding.fix}`);
      if (finding.evidence) lines2.push("", `Evidence: \`${finding.evidence}\``);
      if (finding.line) lines2.push(`Line ${finding.line}`);
      lines2.push("");
    }
  }
  return lines2.join("\n");
}
function reportJson(ctx, report2) {
  return JSON.stringify({
    app: ctx.app?.label,
    at: new Date(report2.at).toISOString(),
    score: report2.score,
    counts: report2.counts,
    pageOrigin: report2.pageOrigin,
    secureContext: report2.secureContext,
    policy: report2.profile?.policy,
    findings: report2.findings.map((f) => ({ ...f, element: f.element ? cssPath(f.element) : void 0 })),
    origins: report2.origins,
    storage: report2.storage,
    headers: report2.headers
  }, null, 2);
}
function findingDetail(ctx, finding) {
  const { app, ui } = ctx;
  const owner = finding.element && can(app, "instanceForNode") ? app.instanceForNode(finding.element) : null;
  return h(
    "div",
    { class: "sc-detail", "data-dt": "security-detail" },
    h(
      "div",
      { class: "pane-head" },
      h("span", { class: `sc-dot t-${SEVERITY_TONE[finding.severity]}` }),
      h("span", { class: "pane-title" }, ...richText(finding.title)),
      spacer(),
      iconButton({ icon: "close", label: "Close", size: "sm", onClick: () => {
        ui.securitySelected = null;
        ctx.highlightElement(null, void 0, true);
        ctx.refresh();
      } })
    ),
    h(
      "div",
      { class: "pane-body is-pad stack" },
      h(
        "div",
        { class: "chips" },
        chip(finding.severity, SEVERITY_TONE[finding.severity]),
        chip(CATEGORY[finding.category].label, "grey", { icon: CATEGORY[finding.category].icon }),
        chip(finding.rule, "grey", { mono: true, outline: true })
      ),
      h("div", { class: "sc-text" }, ...richText(finding.detail)),
      note("accent", [h("strong", {}, "Fix. "), ...richText(finding.fix)], { icon: "wand" }),
      finding.evidence ? h("div", {}, h("div", { class: "it-sub row-flex" }, "Evidence", spacer(), iconButton({ icon: "copy", size: "sm", label: "Copy evidence", onClick: () => ctx.copy(finding.evidence, "the evidence") })), h("code", { class: "sc-evidence" }, finding.evidence)) : null,
      h(
        "div",
        { class: "row-flex sc-actions" },
        finding.line ? button({ label: `Open line ${finding.line}`, size: "sm", icon: "code", onClick: () => openSource(ctx, finding.line) }) : null,
        finding.element ? button({ label: "Show element", size: "sm", icon: "target", onClick: () => {
          ctx.highlightElement(finding.element, { component: finding.rule }, true);
          try {
            finding.element.scrollIntoView({ block: "center", behavior: "smooth" });
          } catch {
          }
        } }) : null,
        owner ? button({ label: "Inspect component", size: "sm", icon: "inspect", onClick: () => ctx.selectInstance(owner, { reveal: true }) }) : null,
        finding.requestId ? button({ label: "Open request", size: "sm", icon: "network", onClick: () => {
          ui.selectedRequest = finding.requestId;
          ctx.selectTab("network");
        } }) : null,
        finding.storageKey ? button({ label: "Open in Data", size: "sm", icon: "data", onClick: () => {
          ui.dataPane = "storage";
          ui.storageSelected = finding.storageKey;
          ctx.selectTab("data");
        } }) : null
      )
    )
  );
}
function visibleSecurity(report2, ui) {
  return report2.findings.filter((f) => ui.securitySeverities.has(f.severity) && (ui.securityCategory === "all" || f.category === ui.securityCategory));
}
function findingsPane(ctx, report2) {
  const { ui } = ctx;
  const findings = visibleSecurity(report2, ui);
  const selected = report2.findings.find((f) => f.id === ui.securitySelected) ?? null;
  const categories = Object.keys(CATEGORY).filter((c) => report2.findings.some((f) => f.category === c));
  const summary = h(
    "div",
    { class: "sc-summary", "data-dt": "security-summary" },
    scoreRing(report2.score, { size: 58, label: "Security score" }),
    h(
      "div",
      { class: "sc-summary-text" },
      h("div", { class: "sc-summary-title" }, report2.findings.length === 0 ? "No findings" : plural(report2.findings.length, "finding")),
      h(
        "div",
        { class: "t3" },
        report2.secureContext ? h("span", { class: "tone-green sc-ctx" }, icon("lock", { size: 11 }), "secure context") : h("span", { class: "tone-red sc-ctx" }, icon("unlock", { size: 11 }), "not a secure context"),
        ` · policy “${report2.profile?.policy ?? "unknown"}” · ${report2.examined} elements · ${fmtAgo(report2.at, Date.now())}`
      )
    ),
    h("div", { class: "sc-sevs" }, ...SEVERITIES.map((severity) => filterChip({
      label: severity,
      count: report2.counts[severity],
      on: ui.securitySeverities.has(severity),
      swatch: `var(--dt-${SEVERITY_TONE[severity]})`,
      testid: `security-sev-${severity}`,
      onToggle: () => {
        if (ui.securitySeverities.has(severity)) ui.securitySeverities.delete(severity);
        else ui.securitySeverities.add(severity);
        ctx.refresh();
      }
    })))
  );
  const filters = categories.length > 1 ? h(
    "div",
    { class: "sc-filters" },
    filterChip({ label: "All", on: ui.securityCategory === "all", onToggle: () => {
      ui.securityCategory = "all";
      ctx.refresh();
    } }),
    ...categories.map((c) => filterChip({ label: CATEGORY[c].label, count: report2.findings.filter((f) => f.category === c).length, on: ui.securityCategory === c, onToggle: () => {
      ui.securityCategory = ui.securityCategory === c ? "all" : c;
      ctx.refresh();
    } }))
  ) : null;
  const grouped = [];
  for (const category of Object.keys(CATEGORY)) {
    const items = findings.filter((f) => f.category === category);
    if (items.length === 0) continue;
    grouped.push(h(
      "div",
      { key: category, class: "sc-group" },
      h("div", { class: "sc-group-head" }, icon(CATEGORY[category].icon, { size: 13 }), h("span", {}, CATEGORY[category].label), h("span", { class: "t3" }, CATEGORY[category].blurb), spacer(), h("span", { class: "sc-count num" }, String(items.length))),
      ...items.map((finding) => h(
        "button",
        {
          key: finding.id,
          type: "button",
          class: ["sc-item", finding.id === ui.securitySelected ? "is-selected" : ""],
          "data-dt": "security-finding",
          onClick: () => {
            ui.securitySelected = finding.id;
            if (finding.element) ctx.highlightElement(finding.element, { component: finding.rule }, true);
            ctx.refresh();
          },
          onMouseEnter: finding.element ? () => ctx.highlightElement(finding.element, { component: finding.rule }) : void 0,
          onMouseLeave: finding.element ? () => ctx.highlightElement(null) : void 0
        },
        h("span", { class: `sc-dot t-${SEVERITY_TONE[finding.severity]}` }),
        h("span", { class: "sc-item-title ellipsis" }, ...richText(finding.title)),
        finding.evidence ? h("span", { class: "sc-item-ev mono ellipsis" }, finding.evidence) : null,
        finding.line ? h("span", { class: "sc-line mono" }, `L${finding.line}`) : null
      ))
    ));
  }
  const list = h(
    "div",
    { class: "sc-left" },
    summary,
    filters,
    h("div", { class: "dt-scroll" }, report2.findings.length === 0 ? emptyState({ icon: "checkCircle", title: "Nothing flagged", body: "No risky program constructs, sanitiser escapes, transport problems, or exposed tokens were found. Check the response headers too — they are only read on request." }) : grouped.length === 0 ? emptyState({ icon: "filter", title: "No finding matches the filters" }) : h("div", { class: "sc-groups" }, ...grouped))
  );
  if (!selected) return list;
  const detail = findingDetail(ctx, selected);
  return ctx.width() >= 780 ? split({ size: paneSize(ctx, "security.findings", Math.round(ctx.width() * 0.52)), min: 320, onResize: (s) => setPaneSize(ctx, "security.findings", s), first: list, second: detail }) : split({ direction: "col", size: Math.round(ctx.height() * 0.45), min: 160, onResize: () => void 0, first: list, second: detail });
}
function lineChip(ctx, line) {
  return h("button", { type: "button", class: "sc-line is-link mono", "data-tip": "Open in Source", onClick: () => openSource(ctx, line) }, `L${line}`);
}
function programPane(ctx, report2) {
  const profile = report2.profile;
  if (!profile) return h("div", { class: "dt-pad" }, note("info", "This runtime does not expose a static security profile of the program. Upgrade aktion-runtime to see what the program text can reach."));
  const policyTone = profile.policy === "all" ? "amber" : "green";
  const riskTone = { high: "red", medium: "orange", low: "grey" };
  const list = (items, render2, empty) => items.length === 0 ? h("div", { class: "t3 sc-empty" }, empty) : h("div", { class: "sc-rows" }, ...items.map((item, i) => h("div", { key: i, class: "sc-row" }, render2(item))));
  return h(
    "div",
    { class: "dt-scroll" },
    h(
      "div",
      { class: "sc-grid" },
      card({
        title: "Global access policy",
        icon: "lock",
        testid: "security-policy",
        body: h(
          "div",
          { class: "stack" },
          h("div", { class: "row-flex" }, chip(profile.policy, policyTone, { mono: true }), h("span", { class: "t2" }, profile.policy === "all" ? "Program text can reach every host global." : profile.policy === "safe" ? "Only the safe allow-list of globals resolves." : "A custom allow-list is in force.")),
          profile.policyNames && profile.policyNames.length > 0 ? h("div", { class: "chips" }, ...profile.policyNames.slice(0, 40).map((name) => chip(name, "grey", { mono: true }))) : null,
          profile.policy === "all" ? note("plain", ["Right for program text you wrote. For LLM-generated, user-editable, or database-loaded text call ", h("code", {}, 'setGlobalAccessPolicy("safe")'), " before mounting."]) : null
        )
      }),
      card({
        title: "Host globals",
        icon: "globe",
        sub: plural(profile.hostGlobals.length, "name"),
        body: list(profile.hostGlobals, (g) => [chip(g.risk, riskTone[g.risk] ?? "grey"), h("code", { class: "grow" }, g.name), h("span", { class: "t3 num" }, `×${g.count}`), lineChip(ctx, g.line)], "The program names no host globals.")
      }),
      card({
        title: "Dynamic code",
        icon: "zap",
        sub: profile.dynamicCode.length > 0 ? h("span", { class: "tone-red" }, plural(profile.dynamicCode.length, "site")) : "none",
        body: list(profile.dynamicCode, (d) => [chip("high", "red"), h("code", { class: "grow" }, d.what), lineChip(ctx, d.line)], "No eval, Function, or string timers.")
      }),
      card({
        title: "Escape hatches",
        icon: "puzzle",
        sub: plural(profile.escapeHatches.length, "use"),
        body: list(profile.escapeHatches, (e) => [h("code", { class: "grow" }, `${e.component}(…)`), e.dynamic ? chip("dynamic", "amber") : chip("static", "grey"), lineChip(ctx, e.line)], "No HTMLTag, Styles, Svg, or Markdown.")
      }),
      card({
        title: "Endpoints",
        icon: "server",
        sub: plural(profile.endpoints.length, "call site"),
        body: list(profile.endpoints, (e) => [chip(e.method ?? e.via, "blue", { mono: true }), h("code", { class: "grow ellipsis", title: e.url }, e.url), e.dynamic ? chip("computed", "amber") : null, lineChip(ctx, e.line)], "No network calls in the program text.")
      }),
      card({
        title: "Leaves the app",
        icon: "external",
        sub: `${profile.openUrls.length} windows · ${profile.emits.length} events`,
        body: h(
          "div",
          { class: "stack" },
          list(profile.openUrls, (o) => [h("code", { class: "grow" }, o.via), o.target ? h("code", { class: "t3 ellipsis" }, o.target) : null, o.dynamic ? chip("computed URL", "amber") : null, lineChip(ctx, o.line)], "Opens no windows."),
          list(profile.emits, (e) => [chip("emit", "purple"), h("code", { class: "grow" }, e.name), lineChip(ctx, e.line)], "Emits no events to the host.")
        )
      }),
      card({
        title: "Storage access",
        icon: "data",
        sub: plural(profile.storage.length, "operation"),
        body: list(profile.storage, (s) => [chip(s.op, "grey", { mono: true }), h("code", { class: "grow" }, s.key), lineChip(ctx, s.line)], "The program touches no browser storage.")
      })
    )
  );
}
function networkPane(ctx, report2) {
  const columns = [
    { key: "origin", label: "Origin", flex: 3, render: (o) => h("span", { class: "row-flex" }, icon(o.secure ? "lock" : "unlock", { size: 12, className: o.secure ? "tone-green" : "tone-red" }), h("span", { class: "mono ellipsis" }, o.origin)) },
    { key: "party", label: "Party", width: 100, render: (o) => chip(o.firstParty ? "first-party" : "third-party", o.firstParty ? "grey" : "purple") },
    { key: "creds", label: "Credentials", width: 100, render: (o) => o.credentials ? chip("sent", o.firstParty ? "grey" : "amber", { tip: "Requests carried cookies or an Authorization header" }) : h("span", { class: "t4" }, "—") },
    { key: "requests", label: "Requests", width: 80, align: "right", sort: (o) => o.requests, render: (o) => h("span", { class: "num" }, String(o.requests)) },
    { key: "failed", label: "Failed", width: 70, align: "right", render: (o) => h("span", { class: ["num", o.failed > 0 ? "tone-red" : "t4"] }, String(o.failed)) }
  ];
  const violations = ctx.cspViolations;
  return h(
    "div",
    { class: "dt-scroll" },
    h(
      "div",
      { class: "sc-page" },
      card({
        title: "Origins contacted",
        icon: "globe",
        flush: true,
        sub: `${report2.origins.length} origins · ${report2.origins.filter((o) => !o.firstParty).length} third-party`,
        body: h(
          "div",
          { style: { height: `${Math.min(10, Math.max(2, report2.origins.length)) * ctx.rowHeight + 32}px`, display: "flex", flexDirection: "column" } },
          dataTable({ columns, rows: report2.origins, rowKey: (o) => o.origin, rowHeight: ctx.rowHeight, ariaLabel: "Origins", testid: "security-origins", empty: emptyState({ icon: "network", title: "No requests yet" }) })
        )
      }),
      card({
        title: "CSP violations",
        icon: "lock",
        testid: "security-csp",
        sub: violations.length > 0 ? h("span", { class: "tone-red" }, plural(violations.length, "report")) : "none while the panel was open",
        body: violations.length === 0 ? h("div", { class: "t3" }, "The browser reports blocked resources as they happen (securitypolicyviolation). Nothing has been blocked so far.") : h("div", { class: "sc-rows" }, ...[...violations].reverse().slice(0, 100).map((v, i) => h(
          "div",
          { key: i, class: "sc-row" },
          chip(v.disposition === "report" ? "report-only" : "blocked", v.disposition === "report" ? "amber" : "red"),
          h("code", {}, v.directive),
          h("span", { class: "mono ellipsis grow", title: v.blocked }, v.blocked || "(inline)"),
          v.source ? h("span", { class: "t3 mono ellipsis" }, v.source) : null
        )))
      })
    )
  );
}
function storagePane(ctx, report2) {
  const { ui } = ctx;
  const risky = report2.storage.filter((s) => s.kind !== "none");
  const columns = [
    { key: "area", label: "Area", width: 90, render: (s) => chip(s.area === "local" ? "local" : s.area === "session" ? "session" : "cookie", "grey") },
    { key: "key", label: "Key", flex: 2, render: (s) => h("span", { class: "mono ellipsis" }, s.key) },
    { key: "kind", label: "Looks like", width: 120, render: (s) => s.kind === "none" ? h("span", { class: "t4" }, "—") : chip(s.kind, s.kind === "private-key" || s.kind === "api-key" ? "red" : "amber", { icon: "key" }) },
    { key: "jwt", label: "Token", flex: 2, render: (s) => s.jwt ? h("span", { class: "row-flex" }, chip(s.jwt.alg ?? "?", s.jwt.alg === "none" ? "red" : "grey", { mono: true }), s.jwt.exp ? h("span", { class: s.jwt.expired ? "tone-red" : "t3" }, s.jwt.expired ? "expired" : `expires ${new Date(s.jwt.exp * 1e3).toLocaleString()}`) : h("span", { class: "tone-amber" }, "never expires"), s.jwt.sub ? h("span", { class: "t3 ellipsis" }, `sub ${s.jwt.sub}`) : null) : h("span", { class: "t4" }, "—") },
    { key: "size", label: "Size", width: 70, align: "right", render: (s) => h("span", { class: "num t3" }, fmtBytes(s.size)) }
  ];
  return h(
    "div",
    { class: "sc-left" },
    risky.length > 0 ? h("div", { class: "sc-callout" }, note("warn", [`${plural(risky.length, "credential")} in script-readable storage. Any XSS — or any third-party script — can read ${risky.length === 1 ? "it" : "them"}. Session tokens belong in `, h("code", {}, "HttpOnly; Secure; SameSite"), " cookies set by the server."])) : h("div", { class: "sc-callout" }, note("good", "No credentials in localStorage, sessionStorage, or script-visible cookies.")),
    dataTable({
      columns,
      rows: report2.storage,
      rowKey: (s) => `${s.area}:${s.key}`,
      rowHeight: ctx.rowHeight,
      ariaLabel: "Storage entries",
      testid: "security-storage",
      onActivate: (s) => {
        ui.dataPane = "storage";
        ui.storageKind = s.area === "cookie" ? "cookies" : s.area;
        ui.storageSelected = s.key;
        ctx.selectTab("data");
      },
      empty: emptyState({ icon: "data", title: "Storage is empty" })
    })
  );
}
function headersPane(ctx, report2) {
  const { ui } = ctx;
  const loading = ui.securityHeadersState === "loading";
  const intro = h(
    "div",
    { class: "sc-callout row-flex" },
    button({ label: report2.headers ? "Re-check headers" : "Check response headers", variant: report2.headers ? "default" : "primary", size: "sm", icon: loading ? void 0 : "server", disabled: loading, testid: "security-headers-check", onClick: () => checkHeaders(ctx) }),
    loading ? spinner() : null,
    h("span", { class: "t3", style: { fontSize: "var(--dt-fs-sm)" } }, "Sends one same-origin HEAD request for this page. Nothing is sent anywhere else.")
  );
  if (ui.securityHeadersState === "error") {
    return h("div", { class: "dt-scroll" }, intro, h("div", { class: "sc-page" }, note("error", ["Could not read headers: ", ui.securityHeadersError ?? "unknown error"])));
  }
  if (!report2.headers) {
    return h("div", { class: "dt-scroll" }, intro, h("div", { class: "sc-page" }, emptyState({ icon: "server", title: "Headers not checked yet", body: "CSP, HSTS, X-Content-Type-Options, framing protection, Referrer-Policy, Permissions-Policy and COOP are graded against what an Aktion app actually needs." })));
  }
  const tone = { good: "green", warn: "amber", missing: "red", info: "blue" };
  return h(
    "div",
    { class: "dt-scroll" },
    intro,
    h(
      "div",
      { class: "sc-page" },
      h("div", { class: "sc-headers" }, ...report2.headers.map((check) => h(
        "div",
        { key: check.header, class: ["sc-header", `is-${check.status}`], "data-dt": "security-header" },
        h("div", { class: "sc-header-top" }, chip(check.status, tone[check.status] ?? "grey"), h("code", { class: "sc-header-name" }, check.header)),
        check.value ? h("code", { class: "sc-header-value" }, check.value) : h("span", { class: "t4" }, "not set"),
        h("div", { class: "sc-header-note" }, check.note)
      )))
    )
  );
}
function render$4(ctx) {
  const { app, ui } = ctx;
  if (!app) return noApp(ctx, "Security", "security");
  if (ui.securityRequested || !ui.securityRun) {
    ui.securityRequested = false;
    runScan(ctx, { quiet: true });
  }
  const report2 = ui.securityRun;
  let body;
  switch (ui.securityPane) {
    case "program":
      body = programPane(ctx, report2);
      break;
    case "network":
      body = networkPane(ctx, report2);
      break;
    case "storage":
      body = storagePane(ctx, report2);
      break;
    case "headers":
      body = headersPane(ctx, report2);
      break;
    default:
      body = findingsPane(ctx, report2);
  }
  const risky = report2.storage.filter((s) => s.kind !== "none").length;
  return h(
    "div",
    { class: "sc", "data-dt": "security" },
    viewbar(
      segmented([
        { value: "findings", label: "Findings", icon: "warning", count: report2.findings.length || null },
        { value: "program", label: "Program", icon: "code" },
        { value: "network", label: "Origins", icon: "globe", count: report2.origins.length || null },
        { value: "storage", label: "Storage", icon: "key", count: risky || null },
        { value: "headers", label: "Headers", icon: "server", count: report2.headers ? report2.headers.filter((c) => c.status === "missing" || c.status === "warn").length || null : null }
      ], ui.securityPane, (value) => {
        ui.securityPane = value;
        ctx.refresh();
      }, { label: "Security view", testid: "security-panes" }),
      spacer(),
      button({ label: "Re-scan", size: "sm", icon: "refresh", testid: "security-rescan", tip: `Last scan ${fmtAgo(report2.at, Date.now())}`, onClick: () => {
        runScan(ctx);
        ctx.refresh();
      } }),
      iconButton({ icon: "download", label: "Export report", size: "sm", onClick: (event) => ctx.openMenu(event, [
        { label: "Copy as Markdown", icon: "copy", run: () => ctx.copy(reportMarkdown(ctx, report2), "the report") },
        { label: "Download JSON", icon: "download", run: () => downloadText(`security-${app.label.replace(/[^\w.-]+/g, "_")}.json`, reportJson(ctx, report2)) },
        { label: "Download Markdown", icon: "file", run: () => downloadText(`security-${app.label.replace(/[^\w.-]+/g, "_")}.md`, reportMarkdown(ctx, report2), "text/markdown") }
      ]) })
    ),
    body
  );
}
const securityView = {
  id: "security",
  label: "Security",
  icon: "security",
  group: "quality",
  hint: "Program reach, sanitiser escapes, transport, storage, headers, CSP",
  keywords: "security xss csp headers hsts jwt token secrets mixed content origins third-party policy eval sandbox",
  badge: (ctx) => {
    const high = ctx.ui.securityRun?.counts.high ?? 0;
    return high > 0 ? { value: high, tone: "red" } : null;
  },
  render: render$4,
  commands: (ctx) => [
    { id: "security:scan", label: "Run security scan", icon: "security", keywords: "audit xss", run: () => {
      ctx.ui.securityRequested = true;
      ctx.ui.securityPane = "findings";
      ctx.selectTab("security");
    } },
    { id: "security:headers", label: "Check response headers (CSP, HSTS…)", icon: "server", run: () => {
      ctx.ui.securityPane = "headers";
      ctx.selectTab("security");
      checkHeaders(ctx);
    } }
  ],
  css: (
    /* css */
    `
.sc { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.sc-left { flex: 1 1 auto; min-height: 0; min-width: 0; display: flex; flex-direction: column; }
.sc-detail { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.sc-summary { flex: none; display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-bottom: 1px solid var(--dt-border); flex-wrap: wrap; }
.sc-summary-text { display: flex; flex-direction: column; gap: 3px; min-width: 160px; }
.sc-summary-title { font-size: 15px; font-weight: 650; }
.sc-summary-text .t3 { font-size: var(--dt-fs-sm); display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.sc-sevs { display: flex; gap: 6px; flex-wrap: wrap; margin-left: auto; }
.sc-ctx { display: inline-flex; align-items: center; gap: 4px; }
.sc-filters { flex: none; display: flex; gap: 5px; padding: 6px 12px; border-bottom: 1px solid var(--dt-border); flex-wrap: wrap; }
.sc-groups { display: flex; flex-direction: column; padding: 6px 0 12px; }
.sc-group + .sc-group { margin-top: 6px; }
.sc-group-head { display: flex; align-items: center; gap: 7px; padding: 8px 14px 4px; font-size: var(--dt-fs-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--dt-text-2); }
.sc-group-head .t3 { text-transform: none; letter-spacing: 0; font-weight: 400; }
.sc-count { font-size: var(--dt-fs-xs); background: var(--dt-bg-active); border-radius: 99px; padding: 1px 7px; color: var(--dt-text-2); }
.sc-item { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 9px; width: 100%; min-height: 32px; padding: 5px 14px; cursor: pointer; font-size: var(--dt-fs-sm); }
.sc-item:hover { background: var(--dt-bg-hover); }
.sc-item:focus-visible { outline: 2px solid var(--dt-accent); outline-offset: -2px; }
.sc-item.is-selected { background: var(--dt-accent-soft); }
.sc-item-title { flex: 1 1 auto; color: var(--dt-text); }
.sc-item-ev { flex: 0 1 38%; color: var(--dt-text-3); font-size: var(--dt-fs-xs); text-align: right; }
.sc-line { font-size: var(--dt-fs-xs); color: var(--dt-text-3); border: 1px solid var(--dt-border); border-radius: 4px; padding: 1px 5px; flex: none; background: none; }
.sc-line.is-link { cursor: pointer; font-family: var(--dt-mono); }
.sc-line.is-link:hover { color: var(--dt-accent-text); border-color: var(--dt-accent); }
.sc-dot { width: 9px; height: 9px; border-radius: 3px; flex: none; background: var(--dt-text-4); }
.sc-dot.t-red { background: var(--dt-red); box-shadow: 0 0 0 3px var(--dt-red-soft); }
.sc-dot.t-orange { background: var(--dt-orange); }
.sc-dot.t-amber { background: var(--dt-amber); }
.sc-dot.t-blue { background: var(--dt-blue); }
.sc-text { font-size: var(--dt-fs-md); line-height: 1.55; }
.sc-evidence { display: block; padding: 7px 9px; border-radius: var(--dt-r-sm); background: var(--dt-bg-2); font-size: var(--dt-fs-sm); overflow-wrap: anywhere; white-space: pre-wrap; }
.sc-actions { flex-wrap: wrap; }
.sc-grid { padding: 12px; display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; align-items: start; }
.sc-page { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.sc-rows { display: flex; flex-direction: column; }
.sc-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--dt-border); font-size: var(--dt-fs-sm); min-width: 0; }
.sc-row:last-child { border-bottom: 0; }
.sc-empty { font-size: var(--dt-fs-sm); }
.sc-callout { flex: none; padding: 10px 12px; border-bottom: 1px solid var(--dt-border); gap: 10px; }
.sc-headers { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 10px; }
.sc-header { display: flex; flex-direction: column; gap: 6px; padding: 10px 12px; border-radius: var(--dt-r-md); border: 1px solid var(--dt-border); background: var(--dt-bg-1); border-left-width: 3px; }
.sc-header.is-good { border-left-color: var(--dt-green); }
.sc-header.is-warn { border-left-color: var(--dt-amber); }
.sc-header.is-missing { border-left-color: var(--dt-red); }
.sc-header.is-info { border-left-color: var(--dt-blue); }
.sc-header-top { display: flex; align-items: center; gap: 8px; }
.sc-header-name { font-weight: 650; }
.sc-header-value { font-size: var(--dt-fs-xs); color: var(--dt-text-2); overflow-wrap: anywhere; max-height: 5.5em; overflow: auto; }
.sc-header-note { font-size: var(--dt-fs-sm); color: var(--dt-text-2); line-height: 1.45; }
`
  )
};
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
const key = (line, column) => `${line}:${column}`;
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
    const lines2 = {};
    const uncoveredLines = [];
    let coveredLines = 0;
    for (const [line, hits] of lineEntries) {
      lines2[line] = hits;
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
    const armCovered = branches.reduce((n, b) => n + b.arms.filter((h2) => h2 > 0).length, 0);
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
      lines: lines2,
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
function formatSummary(input = report()) {
  const rows = input.files.map((file) => ({
    name: file.path.split("/").slice(-2).join("/"),
    lines: `${file.summary.lines.pct.toFixed(2)}% (${file.summary.lines.covered}/${file.summary.lines.total})`,
    functions: `${file.summary.functions.pct.toFixed(2)}%`,
    branches: `${file.summary.branches.pct.toFixed(2)}%`,
    uncovered: file.uncoveredLines.slice(0, 12).join(",") + (file.uncoveredLines.length > 12 ? ",…" : "")
  }));
  const width = Math.max(4, ...rows.map((r) => r.name.length));
  const header2 = `${"file".padEnd(width)}  lines                 funcs    branch   uncovered lines`;
  const body = rows.map(
    (r) => `${r.name.padEnd(width)}  ${r.lines.padEnd(20)}  ${r.functions.padEnd(7)}  ${r.branches.padEnd(7)}  ${r.uncovered}`
  );
  const s = input.summary;
  const footer = `ALL: lines ${s.lines.pct.toFixed(2)}% (${s.lines.covered}/${s.lines.total}) · functions ${s.functions.pct.toFixed(2)}% (${s.functions.covered}/${s.functions.total}) · branches ${s.branches.pct.toFixed(2)}% (${s.branches.covered}/${s.branches.total})`;
  return [header2, ...body, "", footer].join("\n");
}
function queryRoot(ctx) {
  return can(ctx.app, "getRenderRoot") ? ctx.app.getRenderRoot() : null;
}
function stepText(step) {
  const label = step.label;
  const verbs = step.type === "assert" ? ["expect ", "assert "] : step.type === "key" ? ["press "] : [`${step.type} `];
  for (const verb of verbs) if (label.toLowerCase().startsWith(verb)) return label.slice(verb.length);
  return label;
}
function stepTone(step) {
  switch (step.type) {
    case "navigate":
      return "purple";
    case "assert":
      return "green";
    case "type":
    case "select":
      return "cyan";
    case "key":
      return "grey";
    default:
      return "blue";
  }
}
function changedAtoms(ctx, steps) {
  const { app, model } = ctx;
  if (!app || steps.length === 0) return [];
  const since = steps[0].time - ctx.epochOffset;
  const reserved = new Set(can(app, "getStateMeta") ? app.getStateMeta().filter((m) => m.reserved || m.computed).map((m) => m.name) : []);
  const state = app.getState();
  const out = [];
  for (const [root, changes] of model.atomLog) {
    if (reserved.has(root) || root.startsWith("__") || root === "route") continue;
    if (!changes.some((c) => c.time >= since)) continue;
    const value = state[root];
    try {
      if (JSON.stringify(value).length > 4e3) continue;
    } catch {
      continue;
    }
    out.push({ name: root, value });
    if (out.length >= 12) break;
  }
  return out;
}
function testSource(ctx, steps) {
  const { app, ui } = ctx;
  const title = `${app?.label ?? "app"}: recorded flow`;
  if (ui.testFormat === "playwright") {
    const mode = can(app, "getRoute") ? app.getRoute().mode : void 0;
    return generatePlaywrightTest(steps, { title, routerMode: mode });
  }
  return generateTest(steps, {
    title,
    program: app?.getProgram(),
    assertions: ui.testIncludeState ? changedAtoms(ctx, steps) : []
  });
}
let replayToken = 0;
async function replayAll(ctx) {
  const { ui, app } = ctx;
  const steps = ctx.recordedSteps();
  if (!app || steps.length === 0) return;
  const token = replayToken += 1;
  ui.replayResults = steps.map(() => null);
  for (let index = 0; index < steps.length; index += 1) {
    if (token !== replayToken) return;
    ui.replaying = index;
    ctx.refresh();
    await new Promise((resolve) => setTimeout(resolve, index === 0 ? 60 : 380));
    if (token !== replayToken) return;
    let result;
    try {
      result = await replayStep(
        steps[index],
        queryRoot(ctx),
        can(app, "navigate") ? (path) => app.navigate(path) : void 0,
        can(app, "getRoute") ? () => app.getRoute().path : void 0
      );
    } catch (error) {
      result = { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
    ui.replayResults[index] = { ok: result.ok, message: result.message };
    if (result.element) ctx.highlightElement(result.element, { component: `Step ${index + 1}`, kind: steps[index].type }, true);
    if (!result.ok) {
      ui.replaying = null;
      ctx.toast(`Replay failed at step ${index + 1}: ${result.message}`, "bad");
      ctx.refresh();
      return;
    }
  }
  ui.replaying = null;
  ctx.toast(`Replayed ${plural(steps.length, "step")} — all passed`, "good");
  ctx.refresh();
}
function stopReplay(ctx) {
  replayToken += 1;
  ctx.ui.replaying = null;
  ctx.refresh();
}
function pickAssertion(ctx, assertion) {
  const root = queryRoot(ctx);
  ctx.overlay.startPicking({
    onPick: (element) => {
      const step = ctx.recorder.addAssertion(element, assertion, root);
      ctx.toast(`Added: ${step.label}`, "good");
      ctx.refresh();
    },
    onCancel: () => ctx.refresh(),
    labelFor: (element) => ({ component: `assert ${assertion}`, kind: describeElement(element) })
  });
  ctx.refresh();
}
function recordPane(ctx) {
  const { app, ui, recorder } = ctx;
  const steps = ctx.recordedSteps();
  const root = can(app, "getRenderRoot") ? app.getRenderRoot() : null;
  const recording = recorder.isRecording;
  const replaying = ui.replaying !== null;
  const source = steps.length > 0 ? ctx.memo("test.source", [steps.length, steps[steps.length - 1]?.time, ui.testFormat, ui.testIncludeState, ctx.model.revs.state], () => testSource(ctx, steps)) : "";
  ui.generatedTest = source || null;
  const fileName = ui.testFormat === "playwright" ? "recorded.spec.ts" : "recorded.test.ts";
  const bar = h(
    "div",
    { class: "ts-bar" },
    recording ? button({ label: "Stop", icon: "stop", variant: "danger", size: "sm", testid: "rec-stop", onClick: () => {
      recorder.stop();
      ctx.toast(`Recorded ${plural(recorder.list().length, "step")}`);
      ctx.refresh();
    } }) : button({ label: steps.length > 0 ? "Resume recording" : "Record", icon: "record", variant: "primary", size: "sm", testid: "rec-start", disabled: !root, onClick: () => {
      const started = recorder.start(renderRootElement(app), () => ctx.refresh());
      ctx.toast(started ? "Recording — use the app; clicks, typing and navigation become steps" : "Could not attach to the app", started ? "info" : "bad");
      ctx.refresh();
    } }),
    button({ label: "Assert", icon: "assert", size: "sm", testid: "rec-assert", disabled: !root, tip: "Point at an element to assert on it", onClick: (event) => ctx.openMenu(event, [
      { kind: "label", label: "Assert that an element…" },
      { label: "is visible", icon: "eye", run: () => pickAssertion(ctx, "visible") },
      { label: "has its current text", icon: "type", run: () => pickAssertion(ctx, "text") },
      { label: "holds its current value", icon: "edit", run: () => pickAssertion(ctx, "value") },
      { label: "is checked / unchecked", icon: "check", run: () => pickAssertion(ctx, "checked") }
    ]) }),
    replaying ? button({ label: "Stop replay", icon: "stop", size: "sm", onClick: () => stopReplay(ctx) }) : button({ label: "Replay", icon: "replay", size: "sm", testid: "rec-replay", disabled: steps.length === 0 || recording, tip: "Run the steps against the live app, one by one", onClick: () => void replayAll(ctx) }),
    steps.length > 0 ? iconButton({ icon: "trash", label: "Clear steps", size: "sm", danger: true, onClick: () => {
      const backup = [...steps];
      recorder.clear();
      ui.replayResults = [];
      ctx.toast("Steps cleared", "info", { action: { label: "Undo", run: () => {
        recorder.load(backup);
        ctx.refresh();
      } } });
      ctx.refresh();
    } }) : null,
    recording ? h("span", { class: "ts-rec" }, h("span", { class: "ts-rec-dot" }), "REC") : null,
    spacer(),
    h("span", { class: "t3 num", style: { fontSize: "var(--dt-fs-sm)" } }, plural(steps.length, "step"))
  );
  const list = steps.length === 0 ? emptyState({
    icon: "record",
    title: "Record a flow, get a test",
    body: "Press Record and use the app. Clicks, typing, selects, checkboxes, keys and navigation become steps with the most robust query available (test id → role + name → label → text). Add assertions by pointing at the page, then replay or export.",
    actions: [button({ label: "Record", icon: "record", variant: "primary", disabled: !root, onClick: () => {
      recorder.start(renderRootElement(app), () => ctx.refresh());
      ctx.refresh();
    } })]
  }) : h("ol", { class: "ts-steps", "data-dt": "rec-steps" }, ...steps.map((step, index) => {
    const result = ui.replayResults[index] ?? null;
    const active = ui.replaying === index;
    return h(
      "li",
      { key: `${index}:${step.time}`, class: ["ts-step", active ? "is-active" : "", result ? result.ok ? "is-ok" : "is-fail" : ""], "data-dt": "rec-step" },
      h("span", { class: "ts-step-n num" }, active ? spinner() : result ? icon(result.ok ? "check" : "close", { size: 12 }) : String(index + 1)),
      chip(step.type === "assert" ? `assert ${step.assertion ?? "visible"}` : step.type, stepTone(step)),
      h("span", { class: "ts-step-label ellipsis", title: step.label }, stepText(step)),
      step.query?.kind === "css" ? chip("brittle", "amber", { tip: "No test id, role, label or text — this step uses a CSS path. Add a data-testid for a stable test." }) : null,
      result && !result.ok ? h("span", { class: "ts-step-err ellipsis", title: result.message }, result.message) : null,
      h(
        "span",
        { class: "ts-step-actions" },
        iconButton({ icon: "chevronUp", label: "Move up", size: "sm", disabled: index === 0, onClick: () => {
          recorder.move(index, index - 1);
          ctx.refresh();
        } }),
        iconButton({ icon: "chevronDown", label: "Move down", size: "sm", disabled: index === steps.length - 1, onClick: () => {
          recorder.move(index, index + 1);
          ctx.refresh();
        } }),
        iconButton({ icon: "close", label: "Remove step", size: "sm", onClick: () => {
          recorder.remove(index);
          ui.replayResults = [];
          ctx.refresh();
        } })
      )
    );
  }));
  const code = steps.length === 0 ? null : h(
    "div",
    { class: "ts-code" },
    h(
      "div",
      { class: "pane-head" },
      segmented([{ value: "aktion", label: "Aktion test" }, { value: "playwright", label: "Playwright" }], ui.testFormat, (value) => {
        ui.testFormat = value;
        ctx.persist();
        ctx.refresh();
      }, { label: "Test format", testid: "test-format" }),
      ui.testFormat === "aktion" ? toggleSwitch({ checked: ui.testIncludeState, label: "Assert changed state", onChange: (v) => {
        ui.testIncludeState = v;
        ctx.refresh();
      } }) : null,
      spacer(),
      iconButton({ icon: "copy", label: "Copy the test", size: "sm", testid: "test-copy", onClick: () => ctx.copy(source, "the test") }),
      iconButton({ icon: "download", label: `Download ${fileName}`, size: "sm", onClick: () => downloadText(fileName, source, "text/typescript") })
    ),
    h("div", { class: "ts-code-body" }, codeView({ lines: highlightLines(source), testid: "test-code", version: source }))
  );
  const left = h("div", { class: "ts-left" }, bar, h("div", { class: "dt-scroll" }, list));
  if (!code) return left;
  return ctx.width() >= 820 ? split({ size: paneSize(ctx, "test.record", Math.round(ctx.width() * 0.45)), min: 300, onResize: (s) => setPaneSize(ctx, "test.record", s), first: left, second: code }) : split({ direction: "col", size: Math.round(ctx.height() * 0.45), min: 150, onResize: () => void 0, first: left, second: code });
}
function ensureScenarios(ctx) {
  const { app, ui } = ctx;
  if (!app || ui.scenariosFor === app.label) return;
  ui.scenariosFor = app.label;
  ui.scenarios = loadAppData(app.label, "scenarios", []);
}
function saveScenarios(ctx) {
  if (ctx.app) saveAppData(ctx.app.label, "scenarios", ctx.ui.scenarios);
}
function captureScenario(ctx, name) {
  const { app, ui } = ctx;
  if (!app) return null;
  const skip = new Set(can(app, "getStateMeta") ? app.getStateMeta().filter((m) => m.reserved || m.computed).map((m) => m.name) : []);
  const state = {};
  for (const [key2, value] of Object.entries(app.getState())) {
    if (skip.has(key2) || key2.startsWith("__") || key2 === "route") continue;
    try {
      state[key2] = JSON.parse(JSON.stringify(value));
    } catch {
    }
  }
  return {
    id: `sc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || `Scenario ${ui.scenarios.length + 1}`,
    createdAt: Date.now(),
    state,
    rules: ui.rules.filter((r) => !r.id.startsWith("__")).map((r) => ({ ...r })),
    route: can(app, "getRoute") ? app.getRoute().path : void 0
  };
}
function applyScenario(ctx, scenario) {
  const { app, ui } = ctx;
  if (!app) return;
  if (scenario.route && can(app, "navigate")) app.navigate(scenario.route);
  if (scenario.state && can(app, "hydrateState")) app.hydrateState(scenario.state);
  if (scenario.rules) {
    ui.rules = scenario.rules.map((rule) => ({ ...rule }));
    ctx.pushRules();
  }
  ctx.toast(`Scenario “${scenario.name}” applied`, "good");
  ctx.refresh();
}
function importScenarios(ctx) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;
    void file.text().then((text2) => {
      try {
        const parsed2 = JSON.parse(text2);
        const list = Array.isArray(parsed2) ? parsed2 : parsed2.scenarios;
        if (!Array.isArray(list)) throw new Error("expected an array of scenarios");
        const valid = list.filter((s) => s && typeof s === "object" && typeof s.name === "string");
        ctx.ui.scenarios = [...ctx.ui.scenarios, ...valid.map((s) => ({ ...s, id: s.id ?? `sc-${Math.random().toString(36).slice(2, 8)}`, createdAt: s.createdAt ?? Date.now() }))];
        saveScenarios(ctx);
        ctx.toast(`Imported ${plural(valid.length, "scenario")}`, "good");
      } catch (error) {
        ctx.toast(`Import failed: ${error instanceof Error ? error.message : String(error)}`, "bad");
      }
      ctx.refresh();
    });
  });
  input.click();
}
function scenariosPane(ctx) {
  const { app, ui } = ctx;
  ensureScenarios(ctx);
  const save = () => {
    const scenario = captureScenario(ctx, ui.scenarioDraft);
    if (!scenario) return;
    ui.scenarios = [scenario, ...ui.scenarios];
    ui.scenarioDraft = "";
    saveScenarios(ctx);
    ctx.toast(`Saved “${scenario.name}”`, "good");
    ctx.refresh();
  };
  return h(
    "div",
    { class: "dt-scroll" },
    h(
      "div",
      { class: "ts-page" },
      card({
        title: "Save the current setup",
        icon: "scenario",
        sub: "State, network rules and route — one click to get back here",
        body: h(
          "div",
          { class: "row-flex ts-save" },
          field({ value: ui.scenarioDraft, placeholder: "e.g. Empty cart, API down, Admin on /settings", label: "Scenario name", testid: "scenario-name", onInput: (v) => {
            ui.scenarioDraft = v;
          }, onCommit: save }),
          button({ label: "Save scenario", icon: "save", variant: "primary", size: "sm", testid: "scenario-save", disabled: !app, onClick: save })
        )
      }),
      ui.scenarios.length === 0 ? emptyState({ icon: "scenario", title: "No scenarios yet", body: "Get the app into an interesting state — seeded data, a failing endpoint mocked in Network, a deep route — and save it. Scenarios persist per app in this browser and export as JSON for teammates." }) : h("div", { class: "ts-scenarios", "data-dt": "scenarios" }, ...ui.scenarios.map((scenario) => {
        const atoms = Object.keys(scenario.state ?? {}).length;
        const rules = scenario.rules?.length ?? 0;
        return h(
          "div",
          { key: scenario.id, class: "ts-scenario", "data-dt": "scenario" },
          h(
            "div",
            { class: "ts-scenario-main" },
            h("div", { class: "ts-scenario-name" }, scenario.name),
            h(
              "div",
              { class: "chips" },
              scenario.route ? chip(scenario.route, "purple", { mono: true, icon: "routes" }) : null,
              chip(plural(atoms, "atom"), "grey"),
              rules > 0 ? chip(plural(rules, "network rule"), "amber", { icon: "network" }) : null,
              h("span", { class: "t4", style: { fontSize: "var(--dt-fs-xs)" } }, fmtAgo(scenario.createdAt, Date.now()))
            )
          ),
          button({ label: "Apply", icon: "play", size: "sm", variant: "primary", testid: "scenario-apply", disabled: !app, onClick: () => applyScenario(ctx, scenario) }),
          iconButton({ icon: "more", label: "More", size: "sm", onClick: (event) => ctx.openMenu(event, [
            { label: "Update with current setup", icon: "refresh", run: () => {
              const next = captureScenario(ctx, scenario.name);
              if (next) {
                ui.scenarios = ui.scenarios.map((s) => s.id === scenario.id ? { ...next, id: scenario.id } : s);
                saveScenarios(ctx);
                ctx.toast("Scenario updated", "good");
                ctx.refresh();
              }
            } },
            { label: "Copy as JSON", icon: "copy", run: () => ctx.copy(JSON.stringify(scenario, null, 2), "the scenario") },
            { kind: "separator", label: "" },
            { label: "Delete", icon: "trash", danger: true, run: () => {
              ui.scenarios = ui.scenarios.filter((s) => s.id !== scenario.id);
              saveScenarios(ctx);
              ctx.toast(`Deleted “${scenario.name}”`, "info", { action: { label: "Undo", run: () => {
                ui.scenarios = [scenario, ...ui.scenarios];
                saveScenarios(ctx);
                ctx.refresh();
              } } });
              ctx.refresh();
            } }
          ]) })
        );
      })),
      h(
        "div",
        { class: "row-flex" },
        spacer(),
        button({ label: "Import…", icon: "upload", size: "sm", variant: "ghost", onClick: () => importScenarios(ctx) }),
        ui.scenarios.length > 0 ? button({ label: "Export all", icon: "download", size: "sm", variant: "ghost", onClick: () => downloadText(`scenarios-${(app?.label ?? "app").replace(/[^\w.-]+/g, "_")}.json`, JSON.stringify({ format: "aktion-devtools-scenarios", version: 1, scenarios: ui.scenarios }, null, 2)) }) : null
      )
    )
  );
}
function coverageMeter(label, metric2) {
  const tone = metric2.pct >= 80 ? "green" : metric2.pct >= 50 ? "amber" : "red";
  return stat({
    label,
    value: `${Math.round(metric2.pct)}%`,
    tone,
    foot: h("span", { class: "ts-cov-foot" }, meter(metric2.pct / 100, tone === "green" ? "green" : tone === "amber" ? "amber" : "red"), `${metric2.covered}/${metric2.total}`)
  });
}
function coveragePane(ctx) {
  const { app } = ctx;
  const enabled = isEnabled();
  let report$1 = null;
  try {
    report$1 = report();
  } catch {
    report$1 = null;
  }
  const controls2 = h(
    "div",
    { class: "ts-bar" },
    enabled ? button({ label: "Stop", icon: "stop", size: "sm", variant: "danger", onClick: () => {
      stop();
      ctx.toast("Coverage stopped");
      ctx.refresh();
    } }) : button({ label: "Start coverage", icon: "play", size: "sm", variant: "primary", testid: "coverage-start", onClick: () => {
      start();
      if (can(app, "reload")) app.reload();
      ctx.toast("Coverage on — the program was re-planned so its whole shape is measured", "good");
      ctx.refresh();
    } }),
    button({ label: "Reset", icon: "undo", size: "sm", onClick: () => {
      reset();
      ctx.toast("Coverage reset");
      ctx.refresh();
    } }),
    enabled ? h("span", { class: "ts-rec is-green" }, h("span", { class: "ts-rec-dot" }), "measuring") : chip("off", "grey"),
    spacer(),
    report$1 && report$1.files.length > 0 ? iconButton({ icon: "copy", label: "Copy summary", size: "sm", onClick: () => ctx.copy(formatSummary(report$1), "the summary") }) : null,
    report$1 && report$1.files.length > 0 ? button({ label: "LCOV", icon: "download", size: "sm", variant: "ghost", tip: "Download an lcov.info for your coverage tooling", onClick: () => downloadText("aktion.lcov", toLcov(report$1), "text/plain") }) : null
  );
  if (!report$1 || report$1.files.length === 0) {
    return h("div", { class: "ts-left" }, controls2, h("div", { class: "dt-scroll" }, emptyState({
      icon: "target",
      title: enabled ? "Nothing measured yet" : "Measure which parts of the program run",
      body: enabled ? "Use the app — every line, function and branch the interpreter executes is counted." : ".aktion files compile to one JSON.parse of their AST, so V8 coverage sees a single executed line no matter how much DSL ran. This measures the program itself: lines, functions, and every branch arm."
    })));
  }
  const files = report$1.files;
  const gaps = files.flatMap((file) => file.uncoveredLines.slice(0, 60).map((line) => ({ path: file.path, line })));
  const neverRun = files.flatMap((file) => file.functions.filter((f) => f.hits === 0).map((f) => ({ ...f, path: file.path })));
  const halfBranches = files.flatMap((file) => file.branches.filter((b) => b.arms.some((a) => a === 0) && b.arms.some((a) => a > 0)).map((b) => ({ ...b, path: file.path })));
  const columns = [
    { key: "path", label: "File", flex: 2, render: (f) => h("span", { class: "mono ellipsis", title: f.path }, truncateMiddle(f.path, 48)) },
    { key: "lines", label: "Lines", width: 110, align: "right", sort: (f) => f.summary.lines.pct, render: (f) => pctCell(f.summary.lines) },
    { key: "functions", label: "Functions", width: 110, align: "right", sort: (f) => f.summary.functions.pct, render: (f) => pctCell(f.summary.functions) },
    { key: "branches", label: "Branches", width: 110, align: "right", sort: (f) => f.summary.branches.pct, render: (f) => pctCell(f.summary.branches) }
  ];
  return h(
    "div",
    { class: "ts-left" },
    controls2,
    h(
      "div",
      { class: "dt-scroll" },
      h(
        "div",
        { class: "ts-page" },
        statGrid(
          coverageMeter("Lines", report$1.summary.lines),
          coverageMeter("Functions", report$1.summary.functions),
          coverageMeter("Branches", report$1.summary.branches),
          stat({ label: "Files", value: String(files.length) })
        ),
        card({
          title: "Files",
          icon: "file",
          flush: true,
          body: h(
            "div",
            { style: { height: `${Math.min(8, files.length) * ctx.rowHeight + 32}px`, display: "flex", flexDirection: "column" } },
            dataTable({ columns, rows: files, rowKey: (f) => f.path, rowHeight: ctx.rowHeight, ariaLabel: "Coverage by file" })
          )
        }),
        neverRun.length > 0 ? card({
          title: "Functions never called",
          icon: "zap",
          sub: plural(neverRun.length, "function"),
          body: h("div", { class: "chips" }, ...neverRun.slice(0, 40).map((f) => chip(`${f.name} · L${f.line}`, "amber", { mono: true, onClick: () => openSource(ctx, f.line), tip: "Open in Source" })))
        }) : null,
        halfBranches.length > 0 ? card({
          title: "Branches with an untaken arm",
          icon: "split",
          sub: plural(halfBranches.length, "branch"),
          body: h("div", { class: "chips" }, ...halfBranches.slice(0, 40).map((b) => chip(`${b.kind} · L${b.line} · ${b.arms.map((a) => a > 0 ? "✓" : "✗").join("")}`, "amber", { mono: true, onClick: () => openSource(ctx, b.line), tip: "Arms taken ✓ / never taken ✗ — open in Source" })))
        }) : null,
        gaps.length > 0 ? card({
          title: "Lines never executed",
          icon: "code",
          sub: plural(gaps.length, "line"),
          body: h("div", { class: "chips" }, ...gaps.slice(0, 80).map((g) => chip(`L${g.line}`, "grey", { mono: true, onClick: () => openSource(ctx, g.line), tip: `${g.path} — open in Source` })))
        }) : null
      )
    )
  );
}
function pctCell(metric2) {
  const tone = metric2.pct >= 80 ? "tone-green" : metric2.pct >= 50 ? "tone-amber" : "tone-red";
  return h("span", { class: "num" }, h("span", { class: tone }, `${Math.round(metric2.pct)}%`), h("span", { class: "t4" }, ` ${metric2.covered}/${metric2.total}`));
}
const PROBE_KINDS = [
  { value: "role", label: "Role", placeholder: "button" },
  { value: "label", label: "Label", placeholder: "Email" },
  { value: "text", label: "Text", placeholder: "Save" },
  { value: "testid", label: "Test id", placeholder: "submit-order" },
  { value: "css", label: "CSS", placeholder: ".rui-card > button" }
];
function probeQuery(ui) {
  const value = ui.queryProbe.trim();
  if (!value) return null;
  return { kind: ui.queryProbeKind, value, name: ui.queryProbeKind === "role" && ui.queryProbeName.trim() ? ui.queryProbeName.trim() : void 0 };
}
function queriesPane(ctx) {
  const { app, ui } = ctx;
  const root = queryRoot(ctx);
  const query = probeQuery(ui);
  const matches = query ? resolveQuery(root, query) : [];
  const kind = PROBE_KINDS.find((k) => k.value === ui.queryProbeKind) ?? PROBE_KINDS[0];
  const suggest = () => {
    ctx.overlay.startPicking({
      onPick: (element) => {
        const best = chooseQuery(element, root);
        ui.queryProbeKind = best.kind === "placeholder" ? "label" : best.kind;
        ui.queryProbe = best.value;
        ui.queryProbeName = best.name ?? "";
        if (best.kind === "placeholder") {
          ui.queryProbeKind = "css";
          ui.queryProbe = `[placeholder="${best.value}"]`;
        }
        ctx.toast(`Suggested: ${queryLabel(best)}`, "good");
        ctx.refresh();
      },
      onCancel: () => ctx.refresh(),
      labelFor: (element) => ({ component: queryLabel(chooseQuery(element, root)), kind: "best query" })
    });
  };
  const verdict = !query ? null : matches.length === 0 ? note("warn", ["Nothing matches. ", h("code", {}, "getBy*"), " throws here and ", h("code", {}, "queryBy*"), " returns null."], { testid: "query-verdict" }) : matches.length > 1 ? note("warn", [`${matches.length} elements match — `, h("code", {}, "getBy*"), " throws on multiple matches. Narrow it (role + name) or use ", h("code", {}, "getAllBy*"), "."], { testid: "query-verdict" }) : note("good", "Exactly one match — safe to use in a test.", { testid: "query-verdict" });
  return h(
    "div",
    { class: "ts-left" },
    h(
      "div",
      { class: "ts-bar is-wrap" },
      segmented(PROBE_KINDS.map((k) => ({ value: k.value, label: k.label })), ui.queryProbeKind, (value) => {
        ui.queryProbeKind = value;
        ctx.refresh();
      }, { label: "Query type", testid: "query-kind" }),
      field({ value: ui.queryProbe, placeholder: kind.placeholder, mono: true, width: "180px", label: "Query", testid: "query-input", onInput: (v) => {
        ui.queryProbe = v;
        ctx.refresh();
      } }),
      ui.queryProbeKind === "role" ? field({ value: ui.queryProbeName, placeholder: "accessible name (optional)", width: "190px", label: "Accessible name", onInput: (v) => {
        ui.queryProbeName = v;
        ctx.refresh();
      } }) : null,
      button({ label: "Pick to suggest", icon: "pick", size: "sm", disabled: !root, tip: "Point at an element — get the most robust query for it", onClick: suggest }),
      spacer(),
      query ? h("span", { class: "t3 num" }, plural(matches.length, "match", "matches")) : null
    ),
    h(
      "div",
      { class: "dt-scroll" },
      h(
        "div",
        { class: "ts-page" },
        !root ? unsupported("its render root") : null,
        !query ? emptyState({ icon: "search", title: "Find elements the way a test does", body: "Role queries match implicit roles (a <button> is a button) and exact accessible names — the same rules Testing Library and Playwright use, so what you find here is what your test will find." }) : null,
        verdict,
        query ? h(
          "div",
          { class: "ts-code-snippets" },
          h("div", { class: "ts-snippet" }, h("span", { class: "t3" }, "Aktion test"), h("code", {}, queryExpression(query)), iconButton({ icon: "copy", size: "sm", label: "Copy", onClick: () => ctx.copy(queryExpression(query), "the query") })),
          h("div", { class: "ts-snippet" }, h("span", { class: "t3" }, "Playwright"), h("code", {}, playwrightLocator(query)), iconButton({ icon: "copy", size: "sm", label: "Copy", onClick: () => ctx.copy(playwrightLocator(query), "the locator") }))
        ) : null,
        matches.length > 0 ? h("div", { class: "ts-matches", "data-dt": "query-matches" }, ...matches.slice(0, 50).map((element, i) => h(
          "div",
          {
            key: i,
            class: "ts-match",
            onMouseEnter: () => ctx.highlightElement(element, { component: `match ${i + 1}` }),
            onMouseLeave: () => ctx.highlightElement(null),
            onClick: () => {
              ctx.highlightElement(element, { component: `match ${i + 1}` }, true);
              const key2 = can(app, "instanceForNode") ? app.instanceForNode(element) : null;
              if (key2) ctx.selectInstance(key2, { reveal: true });
            }
          },
          h("span", { class: "ts-match-n num" }, String(i + 1)),
          h("code", { class: "tone-cyan" }, element.tagName.toLowerCase()),
          (() => {
            const role = element.getAttribute("role") ?? implicitRole(element);
            return role === element.tagName.toLowerCase() ? null : chip(role ?? "no role", role ? "grey" : "amber");
          })(),
          h("span", { class: "ellipsis" }, accessibleName(element) || h("span", { class: "t4" }, "(no accessible name)"))
        ))) : null
      )
    )
  );
}
const DESTRUCTIVE = /delete|remove|trash|discard|archive|clear|reset|sign\s*out|log\s*out|logout|revoke|destroy|drop|erase|purge|unsubscribe|cancel (account|subscription)/i;
const TARGETS = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="switch"], [role="checkbox"], input[type="checkbox"], input[type="radio"], summary, select';
const TEXT_FIELDS = 'input:not([type]), input[type="text"], input[type="search"], input[type="email"], input[type="number"], input[type="url"], input[type="tel"], input[type="password"], textarea';
const FUZZ_STRINGS = [
  "",
  " ",
  "0",
  "-1",
  "1e309",
  "NaN",
  "null",
  "undefined",
  "3.14159",
  "999999999999999999999",
  "'",
  '"',
  "\\",
  "${1+1}",
  "{{7*7}}",
  "<b>bold</b>",
  "<img src=x onerror=alert(1)>",
  '"><svg onload=alert(1)>',
  "javascript:alert(1)",
  "Robert'); DROP TABLE users;--",
  "😀👍🏽🇩🇪",
  "مرحبا بالعالم",
  "Ｆｕｌｌｗｉｄｔｈ",
  "​‍",
  "a".repeat(500),
  "   padded   ",
  "line one\nline two",
  "user@example.com",
  "https://example.com/?a=1&b=2"
];
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 1831565813 >>> 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function setFieldValue(element, value) {
  const proto = Object.getPrototypeOf(element);
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
  element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
  element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
}
function guardPage(onBlocked) {
  const win = window;
  const saved = { open: win.open, alert: win.alert, confirm: win.confirm, prompt: win.prompt };
  const onClick = (event) => {
    if (event.defaultPrevented) return;
    const anchor = event.composedPath().find((n) => n instanceof HTMLAnchorElement);
    if (!anchor) return;
    const href = anchor.getAttribute("href") ?? "";
    if (href.startsWith("#") && anchor.target !== "_blank") return;
    event.preventDefault();
    onBlocked(`link → ${href}`);
  };
  const onSubmit = (event) => {
    if (event.defaultPrevented) return;
    event.preventDefault();
    onBlocked("unhandled form submit");
  };
  window.addEventListener("click", onClick);
  window.addEventListener("submit", onSubmit);
  win.open = (url) => {
    onBlocked(`window.open(${String(url ?? "")})`);
    return null;
  };
  win.alert = () => {
    onBlocked("alert()");
  };
  win.confirm = () => {
    onBlocked("confirm() → declined");
    return false;
  };
  win.prompt = () => {
    onBlocked("prompt() → cancelled");
    return null;
  };
  return () => {
    window.removeEventListener("click", onClick);
    window.removeEventListener("submit", onSubmit);
    win.open = saved.open;
    win.alert = saved.alert;
    win.confirm = saved.confirm;
    win.prompt = saved.prompt;
  };
}
let chaosToken = 0;
async function runChaos(ctx, seedInput) {
  const { ui, model } = ctx;
  const root = queryRoot(ctx);
  if (!root || ui.fuzzRunning) return;
  const token = chaosToken += 1;
  const seed = seedInput ?? Math.random() * 2 ** 31 >>> 0;
  const rand = seededRandom(seed);
  ui.fuzzRunning = true;
  ui.chaosSeed = String(seed);
  ctx.refresh();
  const startErrors = model.errors.length;
  const startLogs = model.logs.filter((e) => e.level === "error").length;
  const beforeCounts = new Map(model.changeCounts);
  const blocked = [];
  const restore = guardPage((what) => {
    if (blocked.length < 50) blocked.push(what);
  });
  const trail = [];
  const steps = [];
  const started = performance.now();
  let performed = 0;
  try {
    for (let i = 0; i < ui.chaosClicks; i += 1) {
      if (token !== chaosToken) break;
      let candidates = [];
      let fields = [];
      try {
        candidates = [...root.querySelectorAll(TARGETS)].filter((el) => !el.disabled && !DESTRUCTIVE.test(accessibleName(el)) && el.isConnected);
        if (ui.chaosTyping) fields = [...root.querySelectorAll(TEXT_FIELDS)].filter((el) => !el.disabled && !el.readOnly);
      } catch {
        break;
      }
      const typing = fields.length > 0 && rand() < 0.3;
      if (!typing && candidates.length === 0) break;
      try {
        if (typing) {
          const target = fields[Math.floor(rand() * fields.length)];
          const value = FUZZ_STRINGS[Math.floor(rand() * FUZZ_STRINGS.length)];
          const query = chooseQuery(target, root);
          target.focus();
          setFieldValue(target, value);
          trail.push(`type ${JSON.stringify(value.length > 30 ? `${value.slice(0, 27)}…` : value)} into ${queryLabel(query)}`);
          steps.push({ type: "type", query, value, time: Date.now(), label: `type ${JSON.stringify(value.slice(0, 40))} into ${queryLabel(query)}` });
        } else {
          const target = candidates[Math.floor(rand() * candidates.length)];
          const query = chooseQuery(target, root);
          if (target instanceof HTMLSelectElement) {
            const options = [...target.options].filter((o) => !o.disabled);
            const option = options[Math.floor(rand() * options.length)];
            if (option) {
              target.value = option.value;
              target.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
              target.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
              trail.push(`select ${JSON.stringify(option.value)} in ${queryLabel(query)}`);
              steps.push({ type: "select", query, value: option.value, time: Date.now(), label: `select ${JSON.stringify(option.value)} in ${queryLabel(query)}` });
            }
          } else {
            target.click();
            trail.push(`click ${queryLabel(query)}`);
            steps.push({ type: "click", query, time: Date.now(), label: `click ${queryLabel(query)}` });
          }
        }
        performed += 1;
      } catch {
      }
      if (i % 5 === 4) ctx.refresh();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    restore();
  }
  const errors = [
    ...model.errors.slice(startErrors).map((e) => `${e.phase}: ${e.message}`),
    ...model.logs.filter((e) => e.level === "error").slice(startLogs).map((e) => e.text)
  ];
  let injected = false;
  try {
    injected = root.querySelector("[onerror], [onload], script, svg[onload]") !== null;
  } catch {
    injected = false;
  }
  if (injected) errors.push("security: a fuzz payload was rendered as live markup (an element with an inline handler or a <script> appeared) — check the Security view");
  const atoms = [...model.changeCounts.entries()].filter(([name, count]) => (beforeCounts.get(name) ?? 0) !== count).map(([name]) => name);
  ui.fuzzRun = { clicks: performed, errors: [...new Set(errors)], atoms, durationMs: performance.now() - started, at: Date.now(), trail, steps, seed, blocked };
  ui.fuzzRunning = false;
  ctx.toast(errors.length === 0 ? `${performed} actions, no errors` : `${plural(new Set(errors).size, "problem")} found in ${performed} actions`, errors.length === 0 ? "good" : "bad");
  ctx.refresh();
}
function chaosPane(ctx) {
  const { ui, recorder } = ctx;
  const root = queryRoot(ctx);
  const run = ui.fuzzRun;
  const blocked = run?.blocked ?? [];
  const controls2 = h(
    "div",
    { class: "ts-bar is-wrap" },
    ui.fuzzRunning ? button({ label: "Stop", icon: "stop", size: "sm", variant: "danger", onClick: () => {
      chaosToken += 1;
      ui.fuzzRunning = false;
      ctx.refresh();
    } }) : button({ label: "Unleash chaos", icon: "dice", size: "sm", variant: "primary", testid: "chaos-run", disabled: !root, onClick: () => void runChaos(ctx) }),
    select({
      value: String(ui.chaosClicks),
      label: "Actions per run",
      width: "110px",
      options: [{ value: "50", label: "50 actions" }, { value: "100", label: "100 actions" }, { value: "250", label: "250 actions" }, { value: "500", label: "500 actions" }],
      onChange: (v) => {
        ui.chaosClicks = Number(v);
        ctx.refresh();
      }
    }),
    toggleSwitch({ checked: ui.chaosTyping, label: "Fuzz text inputs", onChange: (v) => {
      ui.chaosTyping = v;
      ctx.refresh();
    } }),
    ui.fuzzRunning ? h("span", { class: "row-flex t3" }, spinner(), `running · seed ${ui.chaosSeed}`) : null,
    spacer(),
    h("span", { class: "t3", style: { fontSize: "var(--dt-fs-sm)" } }, "Destructive controls (delete, clear, sign out…) are skipped; links, popups and dialogs are blocked.")
  );
  if (!run) {
    return h("div", { class: "ts-left" }, controls2, h("div", { class: "dt-scroll" }, emptyState({
      icon: "dice",
      title: "Monkey-test the UI",
      body: "Random clicks, selects and edge-case text (empty, 500 chars, emoji, RTL, markup, injection strings) with a render between each action. Every runtime and console error is reported, and every run is seeded — re-run it, or open it as a recording to replay and export as a test. Controls named like delete, remove, trash or sign out are never clicked."
    })));
  }
  return h(
    "div",
    { class: "ts-left" },
    controls2,
    h(
      "div",
      { class: "dt-scroll" },
      h(
        "div",
        { class: "ts-page" },
        statGrid(
          stat({ label: "Actions", value: fmtCount(run.clicks) }),
          stat({ label: "Problems", value: String(run.errors.length), tone: run.errors.length > 0 ? "red" : "green" }),
          stat({ label: "Duration", value: fmtMs(run.durationMs) }),
          stat({ label: "Atoms touched", value: String(run.atoms.length) }),
          stat({ label: "Seed", value: h("span", { class: "mono" }, String(run.seed ?? "—")), tip: "Re-running with the same seed repeats the same sequence" })
        ),
        h(
          "div",
          { class: "row-flex" },
          run.seed !== void 0 ? button({ label: "Re-run this seed", icon: "replay", size: "sm", disabled: ui.fuzzRunning, onClick: () => void runChaos(ctx, run.seed) }) : null,
          run.steps && run.steps.length > 0 ? button({ label: "Open as recording", icon: "record", size: "sm", tip: "Load these actions into the recorder to replay, trim and export as a test", onClick: () => {
            recorder.load(run.steps);
            ui.replayResults = [];
            ui.testPane = "record";
            ctx.toast(`Loaded ${plural(run.steps.length, "step")} into the recorder`, "good");
            ctx.refresh();
          } }) : null,
          spacer()
        ),
        run.errors.length > 0 ? card({ title: "Problems", icon: "error", testid: "chaos-errors", body: h("div", { class: "stack" }, ...run.errors.slice(0, 30).map((error) => note("error", h("span", { class: "mono" }, error)))) }) : note("good", "No runtime or console errors surfaced during the run."),
        blocked.length > 0 ? card({ title: "Blocked side effects", icon: "lock", sub: "Neutralised so the run stays on the page", body: h("div", { class: "chips" }, ...[...new Set(blocked)].slice(0, 30).map((b) => chip(b, "grey", { mono: true }))) }) : null,
        card({
          title: "Trail",
          icon: "list",
          sub: `last ${Math.min(run.trail.length, 200)} actions`,
          flush: true,
          body: h("ol", { class: "ts-trail" }, ...run.trail.slice(-200).map((entry, i) => h("li", { key: i }, entry)))
        })
      )
    )
  );
}
function emulatePane(ctx) {
  const { app, ui } = ctx;
  const theme = can(app, "getTheme") ? app.getTheme() : null;
  const option = (title, iconName, description, control) => h(
    "div",
    { class: "ts-emu" },
    h("div", { class: "ts-emu-icon" }, icon(iconName, { size: 16 })),
    h("div", { class: "ts-emu-text" }, h("div", { class: "ts-emu-title" }, title), h("div", { class: "ts-emu-desc" }, description)),
    h("div", { class: "ts-emu-control" }, control)
  );
  return h(
    "div",
    { class: "dt-scroll" },
    h(
      "div",
      { class: "ts-page is-narrow" },
      option(
        "Network",
        "network",
        "Throttle or break every request the app makes. Mocks you set in Network still win.",
        segmented([
          { value: "none", label: "Online" },
          { value: "fast3g", label: "Fast 3G" },
          { value: "slow3g", label: "Slow 3G" },
          { value: "flaky", label: "Flaky" },
          { value: "offline", label: "Offline" }
        ], ui.throttle, (value) => {
          ui.throttle = value;
          ctx.pushRules();
          ctx.toast(value === "none" ? "Network back to normal" : `Network: ${value}`, value === "none" ? "good" : "warn");
          ctx.refresh();
        }, { label: "Network condition", testid: "emulate-network" })
      ),
      option(
        "Layout direction",
        "split",
        "Right-to-left exposes hard-coded left/right margins and icons that should mirror.",
        segmented([{ value: "auto", label: "Auto" }, { value: "ltr", label: "LTR" }, { value: "rtl", label: "RTL" }], ui.emulateDir, (value) => {
          ui.emulateDir = value;
          ctx.refresh();
        }, { label: "Direction", testid: "emulate-dir" })
      ),
      option(
        "Text size",
        "type",
        "Scales the theme's font-size tokens. Check that nothing clips at 200%.",
        segmented([{ value: "1", label: "100%" }, { value: "1.25", label: "125%" }, { value: "1.5", label: "150%" }, { value: "2", label: "200%" }], String(ui.emulateTextScale), (value) => {
          ui.emulateTextScale = Number(value);
          ctx.refresh();
        }, { label: "Text scale" })
      ),
      theme && theme.available.length > 0 && can(app, "setThemeName") ? option(
        "Theme",
        "theme",
        `Currently “${theme.name}”. Switch to check both palettes hold up.`,
        select({ value: theme.available.includes(theme.name) ? theme.name : theme.available[0], label: "Theme", options: theme.available.map((name) => ({ value: name, label: name })), onChange: (name) => {
          app.setThemeName(name);
          ctx.toast(`Theme: ${name}`);
          ctx.refresh();
        } })
      ) : null,
      option(
        "Test ids",
        "tag",
        "Badge every element that carries data-testid, so you can see what tests can hold on to.",
        toggleSwitch({ checked: ui.showTestIds, testid: "emulate-testids", onChange: (v) => {
          ui.showTestIds = v;
          ctx.refresh();
        } })
      ),
      option(
        "Vision",
        "vision",
        "Colour-blindness and low-vision simulations live in Accessibility → Vision.",
        button({ label: "Open", size: "sm", variant: "ghost", icon: "arrowRight", onClick: () => {
          ui.a11yPane = "vision";
          ctx.selectTab("a11y");
        } })
      )
    )
  );
}
function render$3(ctx) {
  const { app, ui } = ctx;
  if (!app) return noApp(ctx, "Testing", "test");
  const steps = ctx.recordedSteps().length;
  let body;
  switch (ui.testPane) {
    case "scenarios":
      body = scenariosPane(ctx);
      break;
    case "coverage":
      body = coveragePane(ctx);
      break;
    case "queries":
      body = queriesPane(ctx);
      break;
    case "chaos":
      body = chaosPane(ctx);
      break;
    case "emulate":
      body = emulatePane(ctx);
      break;
    default:
      body = recordPane(ctx);
  }
  ensureScenarios(ctx);
  const emulating = ui.throttle !== "none" || ui.emulateDir !== "auto" || ui.emulateTextScale !== 1 || ui.showTestIds;
  return h(
    "div",
    { class: "ts", "data-dt": "testing" },
    viewbar(
      segmented([
        { value: "record", label: "Record", icon: "record", count: steps || null },
        { value: "scenarios", label: "Scenarios", icon: "scenario", count: ui.scenarios.length || null },
        { value: "coverage", label: "Coverage", icon: "target", count: isEnabled() ? "on" : null },
        { value: "queries", label: "Queries", icon: "search" },
        { value: "chaos", label: "Chaos", icon: "dice", count: ui.fuzzRun && ui.fuzzRun.errors.length > 0 ? ui.fuzzRun.errors.length : null },
        { value: "emulate", label: "Emulate", icon: "wand", count: emulating ? "on" : null }
      ], ui.testPane, (value) => {
        ui.testPane = value;
        ctx.refresh();
      }, { label: "Testing tool", testid: "test-panes" }),
      spacer(),
      ctx.recorder.isRecording ? h("span", { class: "ts-rec" }, h("span", { class: "ts-rec-dot" }), "Recording") : null,
      ui.throttle !== "none" ? chip(ui.throttle, "amber", { icon: "network", tip: "Network emulation is on — click to go back online", onClick: () => {
        ui.throttle = "none";
        ctx.pushRules();
        ctx.refresh();
      } }) : null
    ),
    body
  );
}
const testingView = {
  id: "test",
  label: "Testing",
  icon: "test",
  group: "quality",
  hint: "Record & replay tests, scenarios, coverage, queries, chaos, emulation",
  keywords: "test record replay playwright vitest assertions scenario coverage lcov query getByRole chaos fuzz monkey throttle offline rtl",
  badge: (ctx) => {
    if (ctx.recorder.isRecording) return { value: "REC", tone: "red" };
    const errors = ctx.ui.fuzzRun?.errors.length ?? 0;
    return errors > 0 ? { value: errors, tone: "red" } : null;
  },
  render: render$3,
  commands: (ctx) => {
    ensureScenarios(ctx);
    return [
      { id: "test:record", label: ctx.recorder.isRecording ? "Stop recording" : "Start recording a test", icon: "record", keywords: "record test", run: () => {
        if (ctx.recorder.isRecording) {
          ctx.recorder.stop();
          ctx.refresh();
          return;
        }
        ctx.recorder.start(renderRootElement(ctx.app), () => ctx.refresh());
        ctx.ui.testPane = "record";
        ctx.selectTab("test");
      } },
      { id: "test:chaos", label: "Run a chaos (monkey) test", icon: "dice", run: () => {
        ctx.ui.testPane = "chaos";
        ctx.selectTab("test");
        void runChaos(ctx);
      } },
      { id: "test:offline", label: ctx.ui.throttle === "offline" ? "Go back online" : "Emulate offline", icon: "offline", run: () => {
        ctx.ui.throttle = ctx.ui.throttle === "offline" ? "none" : "offline";
        ctx.pushRules();
        ctx.refresh();
      } },
      { id: "test:slow3g", label: "Emulate slow 3G", icon: "network", run: () => {
        ctx.ui.throttle = "slow3g";
        ctx.pushRules();
        ctx.refresh();
      } },
      { id: "test:rtl", label: ctx.ui.emulateDir === "rtl" ? "Back to left-to-right" : "Emulate right-to-left", icon: "split", run: () => {
        ctx.ui.emulateDir = ctx.ui.emulateDir === "rtl" ? "auto" : "rtl";
        ctx.refresh();
      } },
      { id: "test:testids", label: `${ctx.ui.showTestIds ? "Hide" : "Show"} test ids on the page`, icon: "tag", run: () => {
        ctx.ui.showTestIds = !ctx.ui.showTestIds;
        ctx.refresh();
      } },
      ...ctx.ui.scenarios.slice(0, 20).map((scenario) => ({ id: `scenario:${scenario.id}`, label: `Apply scenario: ${scenario.name}`, icon: "scenario", run: () => applyScenario(ctx, scenario) }))
    ];
  },
  css: (
    /* css */
    `
.ts { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.ts-left { flex: 1 1 auto; min-height: 0; min-width: 0; display: flex; flex-direction: column; }
.ts-bar { flex: none; display: flex; align-items: center; gap: 8px; padding: 7px 12px; border-bottom: 1px solid var(--dt-border); min-height: 42px; }
.ts-bar.is-wrap { flex-wrap: wrap; }
.ts-rec { display: inline-flex; align-items: center; gap: 6px; font-size: var(--dt-fs-xs); font-weight: 700; letter-spacing: 0.06em; color: var(--dt-red); text-transform: uppercase; }
.ts-rec.is-green { color: var(--dt-green); }
.ts-rec-dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 25%, transparent); animation: dt-pulse 1.3s ease-in-out infinite; }
@keyframes dt-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.ts-steps { list-style: none; margin: 0; padding: 6px 0; counter-reset: step; }
.ts-step { display: flex; align-items: center; gap: 8px; padding: 5px 12px; min-height: 34px; font-size: var(--dt-fs-sm); border-left: 2px solid transparent; }
.ts-step:hover { background: var(--dt-bg-hover); }
.ts-step.is-active { background: var(--dt-accent-soft); border-left-color: var(--dt-accent); }
.ts-step.is-ok .ts-step-n { background: var(--dt-green); color: #fff; }
.ts-step.is-fail { background: var(--dt-red-soft); border-left-color: var(--dt-red); }
.ts-step.is-fail .ts-step-n { background: var(--dt-red); color: #fff; }
.ts-step-n { flex: none; width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; background: var(--dt-bg-active); color: var(--dt-text-2); }
.ts-step-n .spinner { width: 12px; height: 12px; }
.ts-step-label { flex: 1 1 auto; min-width: 0; color: var(--dt-text); }
.ts-step-err { flex: 0 1 40%; color: var(--dt-red); font-size: var(--dt-fs-xs); }
.ts-step-actions { display: inline-flex; gap: 2px; opacity: 0; transition: opacity 120ms; }
.ts-step:hover .ts-step-actions, .ts-step:focus-within .ts-step-actions { opacity: 1; }
.ts-code { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.ts-code-body { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; background: var(--dt-bg-0); }
.ts-page { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.ts-page.is-narrow { max-width: 860px; }
.ts-save > .input { flex: 1 1 auto; }
.ts-scenarios { display: flex; flex-direction: column; gap: 8px; }
.ts-scenario { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: var(--dt-r-md); border: 1px solid var(--dt-border); background: var(--dt-bg-1); }
.ts-scenario:hover { border-color: var(--dt-border-strong); }
.ts-scenario-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.ts-scenario-name { font-weight: 650; font-size: var(--dt-fs-md); }
.ts-cov-foot { display: flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }
.ts-cov-foot .meter { width: 64px; }
.ts-code-snippets { display: flex; flex-direction: column; gap: 6px; }
.ts-snippet { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border-radius: var(--dt-r-sm); background: var(--dt-bg-2); font-size: var(--dt-fs-sm); }
.ts-snippet > .t3 { width: 84px; flex: none; font-size: var(--dt-fs-xs); }
.ts-snippet > code { flex: 1 1 auto; overflow-wrap: anywhere; }
.ts-matches { display: flex; flex-direction: column; border: 1px solid var(--dt-border); border-radius: var(--dt-r-md); overflow: hidden; }
.ts-match { display: flex; align-items: center; gap: 8px; padding: 6px 10px; font-size: var(--dt-fs-sm); cursor: pointer; border-bottom: 1px solid var(--dt-border); }
.ts-match:last-child { border-bottom: 0; }
.ts-match:hover { background: var(--dt-bg-hover); }
.ts-match-n { width: 20px; color: var(--dt-text-3); font-size: var(--dt-fs-xs); }
.ts-trail { margin: 0; padding: 8px 12px 8px 40px; max-height: 280px; overflow: auto; font: var(--dt-fs-xs)/1.7 var(--dt-mono); color: var(--dt-text-2); }
.ts-emu { display: grid; grid-template-columns: 34px 1fr auto; gap: 12px; align-items: center; padding: 12px 14px; border-radius: var(--dt-r-md); border: 1px solid var(--dt-border); background: var(--dt-bg-1); }
.ts-emu-icon { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: var(--dt-accent-soft); color: var(--dt-accent-text); }
.ts-emu-title { font-weight: 650; font-size: var(--dt-fs-md); }
.ts-emu-desc { font-size: var(--dt-fs-sm); color: var(--dt-text-3); margin-top: 2px; }
@media (max-width: 640px) { .ts-emu { grid-template-columns: 34px 1fr; } .ts-emu-control { grid-column: 1 / -1; } }
`
  )
};
function lineDiff(before, after, cap2 = 1600) {
  const a = before.split("\n");
  const b = after.split("\n");
  let start2 = 0;
  while (start2 < a.length && start2 < b.length && a[start2] === b[start2]) start2 += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start2 && endB > start2 && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  const out = [];
  for (let i = 0; i < start2; i += 1) out.push({ kind: "same", text: a[i], oldLine: i + 1, newLine: i + 1 });
  const midA = a.slice(start2, endA);
  const midB = b.slice(start2, endB);
  if (midA.length * midB.length > cap2 * cap2) {
    midA.forEach((text2, i) => out.push({ kind: "del", text: text2, oldLine: start2 + i + 1 }));
    midB.forEach((text2, i) => out.push({ kind: "add", text: text2, newLine: start2 + i + 1 }));
  } else {
    const n = midA.length;
    const m = midB.length;
    const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
    for (let i2 = n - 1; i2 >= 0; i2 -= 1) {
      for (let j2 = m - 1; j2 >= 0; j2 -= 1) {
        table[i2][j2] = midA[i2] === midB[j2] ? table[i2 + 1][j2 + 1] + 1 : Math.max(table[i2 + 1][j2], table[i2][j2 + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && midA[i] === midB[j]) {
        out.push({ kind: "same", text: midA[i], oldLine: start2 + i + 1, newLine: start2 + j + 1 });
        i += 1;
        j += 1;
      } else if (j < m && (i >= n || table[i][j + 1] >= table[i + 1][j])) {
        out.push({ kind: "add", text: midB[j], newLine: start2 + j + 1 });
        j += 1;
      } else {
        out.push({ kind: "del", text: midA[i], oldLine: start2 + i + 1 });
        i += 1;
      }
    }
  }
  for (let k = 0; k < a.length - endA; k += 1) out.push({ kind: "same", text: a[endA + k], oldLine: endA + k + 1, newLine: endB + k + 1 });
  return out;
}
function diffStats(diff) {
  let added = 0;
  let removed = 0;
  for (const line of diff) {
    if (line.kind === "add") added += 1;
    else if (line.kind === "del") removed += 1;
  }
  return { added, removed };
}
function foldDiff(diff, context = 3) {
  const keep = new Array(diff.length).fill(false);
  diff.forEach((line, i) => {
    if (line.kind === "same") return;
    for (let k = Math.max(0, i - context); k <= Math.min(diff.length - 1, i + context); k += 1) keep[k] = true;
  });
  const out = [];
  let folded = 0;
  diff.forEach((line, i) => {
    if (keep[i]) {
      if (folded > 0) {
        out.push({ kind: "fold", count: folded });
        folded = 0;
      }
      out.push(line);
    } else {
      folded += 1;
    }
  });
  if (folded > 0) out.push({ kind: "fold", count: folded });
  return out;
}
function hash(text2) {
  let value = 0;
  for (let i = 0; i < text2.length; i += 1) value = value * 31 + text2.charCodeAt(i) | 0;
  return value;
}
function analyse(ctx, text2, live) {
  const { app } = ctx;
  if (!can(app, "analyzeProgram")) return null;
  return ctx.memo(`source.analysis:${live ? "live" : "draft"}`, [app.id, live ? app.getProgram() : text2.length, hash(text2)], () => {
    try {
      return app.analyzeProgram(live ? void 0 : text2);
    } catch {
      return null;
    }
  });
}
function markersFor(diagnostics) {
  const markers = /* @__PURE__ */ new Map();
  for (const d of diagnostics) {
    if (d.line <= 0) continue;
    const existing = markers.get(d.line);
    if (existing && existing.severity === "error") continue;
    markers.set(d.line, { severity: d.severity === "error" ? "error" : "warn", message: d.message });
  }
  return markers;
}
let draftTimer = null;
function applyDraft(ctx, text2) {
  const { app, ui } = ctx;
  if (!can(app, "setProgram")) return;
  const analysis = can(app, "analyzeProgram") ? app.analyzeProgram(text2) : null;
  const previous = app.getProgram();
  try {
    app.setProgram(text2);
  } catch (error) {
    ctx.toast(`Could not apply: ${error instanceof Error ? error.message : String(error)}`, "bad");
    return;
  }
  ui.sourceDraft = null;
  const errors = analysis?.diagnostics.filter((d) => d.severity === "error").length ?? 0;
  ctx.toast(errors > 0 ? `Applied with ${plural(errors, "error")} — the app renders what it could plan` : "Applied — state was preserved across the swap", errors > 0 ? "warn" : "good", {
    action: { label: "Undo", run: () => {
      app.setProgram(previous);
      ctx.refresh();
    } }
  });
  ctx.refresh();
}
const OUTLINE_TONE = { component: "purple", effect: "blue", action: "green", hook: "amber", state: "cyan", binding: "grey", import: "grey" };
function focus(ctx, line) {
  ctx.ui.sourceFocusLine = line;
  ctx.refresh();
}
function outlinePane(ctx, entries) {
  const q = ctx.ui.sourceFilter.trim().toLowerCase();
  const shown = q ? entries.filter((e) => e.name.toLowerCase().includes(q) || e.kind.includes(q)) : entries;
  if (entries.length === 0) return h("div", { class: "sr-empty t3" }, "Nothing declared at the top level.");
  const groups = /* @__PURE__ */ new Map();
  for (const entry of shown) groups.set(entry.kind, [...groups.get(entry.kind) ?? [], entry]);
  const order = ["component", "state", "action", "effect", "hook", "binding", "import"];
  const kinds = [...groups.keys()].sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
  return h("div", { class: "sr-outline", "data-dt": "source-outline" }, ...kinds.map((kind) => h(
    "div",
    { key: kind, class: "sr-group" },
    h("div", { class: "sr-group-head" }, chip(kind, OUTLINE_TONE[kind] ?? "grey"), h("span", { class: "t3 num" }, String(groups.get(kind).length))),
    ...groups.get(kind).map((entry) => h("button", {
      key: `${entry.name}:${entry.line}`,
      type: "button",
      class: ["sr-item", ctx.ui.sourceFocusLine === entry.line ? "is-on" : ""],
      onClick: () => focus(ctx, entry.line)
    }, entry.kind === "effect" && entry.name.startsWith("__") ? h("span", { class: "mono ellipsis t3" }, "$effect(…)") : h("span", { class: "mono ellipsis" }, entry.kind === "state" ? `$${entry.name}` : entry.name), entry.exported ? chip("export", "green") : null, spacer(), h("span", { class: "t4 num" }, `L${entry.line}`)))
  )));
}
function problemsPane(ctx, diagnostics) {
  if (diagnostics.length === 0) return h("div", { class: "sr-empty" }, note("good", "No parse, schema, or budget problems."));
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  return h(
    "div",
    { class: "sr-problems", "data-dt": "source-problems" },
    ...diagnostics.slice(0, 200).map((d, i) => h(
      "button",
      {
        key: i,
        type: "button",
        class: ["sr-problem", d.severity === "error" ? "is-error" : "is-warn"],
        onClick: () => focus(ctx, d.line > 0 ? d.line : null)
      },
      icon(d.severity === "error" ? "error" : "warning", { size: 13 }),
      h("span", { class: "sr-problem-text" }, h("span", {}, d.message), h("span", { class: "sr-problem-meta" }, chip(d.kind, d.kind === "schema" ? "purple" : "grey"), d.line > 0 ? `line ${d.line}${d.column > 0 ? `:${d.column}` : ""}` : "no location"))
    )),
    errors > 0 ? h("div", { class: "sr-empty t3" }, "A program with errors still renders what it could plan — fix the first error; the rest are often consequences of it.") : null
  );
}
function historyPane(ctx) {
  const { app, model, ui } = ctx;
  const versions = [...model.programHistory].reverse();
  if (versions.length === 0) return h("div", { class: "sr-empty t3" }, "Versions are recorded as the program commits.");
  const current = app?.getProgram() ?? "";
  return h("div", { class: "sr-history", "data-dt": "source-history" }, ...versions.map((version, i) => {
    const index = model.programHistory.length - 1 - i;
    const isCurrent = version.text === current;
    const stats = isCurrent ? null : ctx.memo(`source.diffstat:${index}`, [version.text.length, current.length, hash(version.text), hash(current)], () => diffStats(lineDiff(version.text, current)));
    return h(
      "div",
      { key: `${version.at}:${index}`, class: ["sr-version", ui.sourceDiff === index ? "is-on" : ""] },
      h(
        "div",
        { class: "sr-version-top" },
        h("span", { class: "sr-version-time" }, new Date(version.at).toLocaleTimeString()),
        isCurrent ? chip("running", "green") : null,
        spacer(),
        h("span", { class: "t4", style: { fontSize: "var(--dt-fs-xs)" } }, fmtAgo(version.at, Date.now()))
      ),
      h(
        "div",
        { class: "sr-version-meta t3" },
        `${version.lines} lines · ${fmtBytes(version.text.length)}`,
        stats ? h("span", { class: "sr-diffstat", "data-tip": "What the running program changed since this version" }, h("span", { class: "tone-green" }, `+${stats.added}`), " ", h("span", { class: "tone-red" }, `−${stats.removed}`)) : null
      ),
      isCurrent ? null : h(
        "div",
        { class: "row-flex sr-version-actions" },
        button({ label: ui.sourceDiff === index ? "Hide diff" : "Diff", size: "sm", variant: "ghost", icon: "diff", onClick: () => {
          ui.sourceDiff = ui.sourceDiff === index ? null : index;
          ctx.refresh();
        } }),
        button({ label: "Edit from here", size: "sm", variant: "ghost", icon: "edit", onClick: () => {
          ui.sourceDraft = version.text;
          ui.sourceDiff = null;
          ctx.toast("Loaded into the editor — apply to mount it");
          ctx.refresh();
        } }),
        can(app, "setProgram") ? button({ label: "Revert", size: "sm", icon: "undo", onClick: () => {
          app.setProgram(version.text);
          ui.sourceDraft = null;
          ui.sourceDiff = null;
          ctx.toast("Reverted to the earlier version", "good");
          ctx.refresh();
        } }) : null
      )
    );
  }));
}
function diffView(ctx, before, after, title, actions = []) {
  const diff = ctx.memo("source.diff", [hash(before), hash(after), before.length, after.length], () => lineDiff(before, after));
  const folded = foldDiff(diff);
  const stats = diffStats(diff);
  const tokenCache = /* @__PURE__ */ new Map();
  const tokens2 = (text2) => {
    let cached = tokenCache.get(text2);
    if (!cached) {
      cached = highlightLines(text2)[0] ?? [];
      tokenCache.set(text2, cached);
    }
    return cached;
  };
  return h(
    "div",
    { class: "sr-diff", "data-dt": "source-diff" },
    h(
      "div",
      { class: "pane-head" },
      icon("diff", { size: 14 }),
      h("span", { class: "pane-title" }, title),
      h("span", { class: "tone-green num" }, `+${stats.added}`),
      h("span", { class: "tone-red num" }, `−${stats.removed}`),
      spacer(),
      ...actions
    ),
    stats.added + stats.removed === 0 ? h("div", { class: "dt-pad" }, emptyState({ icon: "check", title: "No differences" })) : virtualList({
      items: folded,
      rowHeight: 19,
      rowKey: (_row, i) => i,
      className: "code",
      version: [hash(before), hash(after)],
      ariaLabel: "Diff",
      renderRow: (row2) => row2.kind === "fold" ? h("div", { class: "sr-fold" }, `⋯ ${plural(row2.count, "unchanged line")}`) : h(
        "div",
        { class: ["code-line", "sr-dl", `is-${row2.kind}`] },
        h("span", { class: "sr-dl-no" }, row2.oldLine ? String(row2.oldLine) : ""),
        h("span", { class: "sr-dl-no" }, row2.newLine ? String(row2.newLine) : ""),
        h("span", { class: "sr-dl-sign" }, row2.kind === "add" ? "+" : row2.kind === "del" ? "−" : " "),
        h("span", { class: "code-text" }, ...renderTokens(tokens2(row2.text)), row2.text === "" ? " " : null)
      )
    })
  );
}
function render$2(ctx) {
  const { app, model, ui } = ctx;
  if (!app) return noApp(ctx, "The Source view", "source");
  const sources = ctx.cache("source.sources", () => can(app, "getSources") ? app.getSources() : [{ path: "<inline>", text: app.getProgram() }]);
  const index = Math.min(ui.sourceIndex, Math.max(0, sources.length - 1));
  const active = sources[index] ?? { path: "<inline>", text: "" };
  const editing = ui.sourceDraft !== null;
  const text2 = editing ? ui.sourceDraft : active.text;
  const liveDiagnostics = ctx.cache("source.diagnostics", () => can(app, "getDiagnostics") ? app.getDiagnostics() : []);
  const analysis = analyse(ctx, text2, !editing && index === 0);
  const diagnostics = editing ? analysis?.diagnostics ?? [] : liveDiagnostics;
  const markers = ctx.memo("source.markers", [diagnostics], () => markersFor(diagnostics));
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.length - errors;
  const lines2 = ctx.memo("source.lines", [hash(text2), text2.length], () => highlightLines(text2));
  const query = ui.sourceFilter.trim().toLowerCase();
  const hits = ctx.memo("source.hits", [hash(text2), query], () => query ? text2.split("\n").map((line, i) => line.toLowerCase().includes(query) ? i + 1 : 0).filter(Boolean) : []);
  const hitIndex = ui.sourceFocusLine !== null ? hits.indexOf(ui.sourceFocusLine) : -1;
  const jump = (delta) => {
    if (hits.length === 0) return;
    const next = hitIndex < 0 ? delta > 0 ? hits.find((l) => l > (ui.sourceFocusLine ?? 0)) ?? hits[0] : hits[hits.length - 1] : hits[(hitIndex + delta + hits.length) % hits.length];
    focus(ctx, next);
  };
  const canEdit = can(app, "setProgram") && index === 0;
  const sidebarMode = ui.sourceSidebar ?? (diagnostics.length > 0 ? "problems" : "outline");
  const bar = viewbar(
    sources.length > 1 ? segmented(sources.map((s, i) => ({ value: String(i), label: s.path.split("/").pop() ?? s.path, tip: s.path })), String(index), (v) => {
      ui.sourceIndex = Number(v);
      ui.sourceDraft = null;
      ctx.refresh();
    }, { label: "Module" }) : h("span", { class: "sr-file mono" }, icon("file", { size: 13 }), active.path === "<inline>" ? "program.aktion" : active.path),
    searchField({
      value: ui.sourceFilter,
      placeholder: "Find in source…",
      width: "200px",
      testid: "source-search",
      meta: query ? `${hitIndex >= 0 ? hitIndex + 1 : 0}/${hits.length}` : void 0,
      onInput: (v) => {
        ui.sourceFilter = v;
        const first = v.trim() ? text2.split("\n").findIndex((l) => l.toLowerCase().includes(v.trim().toLowerCase())) : -1;
        ui.sourceFocusLine = first >= 0 ? first + 1 : ui.sourceFocusLine;
        ctx.refresh();
      },
      onKeyDown: (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          jump(event.shiftKey ? -1 : 1);
        }
      }
    }),
    query ? iconButton({ icon: "chevronUp", label: "Previous match", size: "sm", disabled: hits.length === 0, onClick: () => jump(-1) }) : null,
    query ? iconButton({ icon: "chevronDown", label: "Next match", size: "sm", disabled: hits.length === 0, onClick: () => jump(1) }) : null,
    spacer(),
    h(
      "span",
      { class: "sr-status" },
      errors > 0 ? chip(plural(errors, "error"), "red", { icon: "error", onClick: () => {
        ui.sourceSidebar = "problems";
        ui.sourceOutline = true;
        ctx.refresh();
      } }) : null,
      warnings > 0 ? chip(plural(warnings, "warning"), "amber", { icon: "warning" }) : null,
      errors === 0 && warnings === 0 && (analysis || !editing) ? chip(editing ? "valid" : "no problems", "green", { icon: "check" }) : null
    ),
    vsep(),
    editing ? [
      button({ label: "Discard", size: "sm", variant: "ghost", testid: "source-discard", onClick: () => {
        ui.sourceDraft = null;
        ctx.refresh();
      } }),
      button({ label: errors > 0 ? "Apply anyway" : "Apply", size: "sm", variant: errors > 0 ? "danger" : "primary", icon: "play", kbd: "⌘ S", testid: "source-apply", disabled: !can(app, "setProgram"), onClick: () => applyDraft(ctx, ui.sourceDraft ?? text2) })
    ] : [
      canEdit ? button({ label: "Edit", size: "sm", icon: "edit", testid: "source-edit", onClick: () => {
        ui.sourceDraft = active.text;
        ui.sourceDiff = null;
        ctx.refresh();
      } }) : null,
      iconButton({ icon: "copy", label: "Copy source", size: "sm", onClick: () => ctx.copy(text2, "the source") }),
      iconButton({ icon: "download", label: "Download", size: "sm", onClick: () => downloadText(active.path === "<inline>" ? "app.aktion" : active.path.split("/").pop() ?? "app.aktion", text2, "text/plain") }),
      can(app, "reload") ? iconButton({ icon: "refresh", label: "Reload (re-plan and re-render)", size: "sm", onClick: () => {
        app.reload();
        ctx.toast("Program re-planned");
      } }) : null
    ],
    iconButton({ icon: "panel", label: ui.sourceOutline ? "Hide sidebar" : "Show sidebar", size: "sm", active: ui.sourceOutline, onClick: () => {
      ui.sourceOutline = !ui.sourceOutline;
      ctx.refresh();
    } })
  );
  let main;
  const diffIndex = ui.sourceDiff;
  if (!editing && diffIndex !== null && model.programHistory[diffIndex]) {
    const version = model.programHistory[diffIndex];
    main = diffView(ctx, version.text, active.text, ["Changes since ", new Date(version.at).toLocaleTimeString()], [
      iconButton({ icon: "close", label: "Close diff", size: "sm", onClick: () => {
        ui.sourceDiff = null;
        ctx.refresh();
      } })
    ]);
  } else if (editing) {
    const changed = ui.sourceDraft !== active.text;
    const showDiff = ui.sourceShowDraftDiff;
    main = h(
      "div",
      { class: "sr-edit" },
      h(
        "div",
        { class: "sr-edit-bar" },
        h("span", { class: "sr-edit-dot" }),
        "Editing",
        h("span", { class: "t3" }, changed ? "— unsaved changes" : "— no changes yet"),
        spacer(),
        changed ? button({ label: showDiff ? "Back to editor" : "Review changes", size: "sm", variant: "ghost", icon: "diff", onClick: () => {
          ui.sourceShowDraftDiff = !showDiff;
          ctx.refresh();
        } }) : null,
        h("span", { class: "t4", style: { fontSize: "var(--dt-fs-xs)" } }, "⌘/Ctrl+S apply · Esc discard")
      ),
      showDiff && changed ? diffView(ctx, active.text, ui.sourceDraft, "Draft vs running program") : codeEditor({
        key: `editor:${index}`,
        value: ui.sourceDraft,
        markers,
        testid: "source-editor",
        label: "Program source (editing)",
        onChange: (next) => {
          ui.sourceDraft = next;
          if (draftTimer) clearTimeout(draftTimer);
          draftTimer = setTimeout(() => {
            draftTimer = null;
            ctx.refresh();
          }, 260);
        },
        onSubmit: (next) => applyDraft(ctx, next),
        onCancel: () => {
          ui.sourceDraft = null;
          ctx.refresh();
        }
      })
    );
  } else if (!text2) {
    main = h("div", { class: "dt-pad" }, emptyState({ icon: "source", title: index > 0 ? "Module text unavailable" : "No program text", body: index > 0 ? "A linked program is planned from a pre-parsed AST, so only the entry module's source travels with it to the browser." : void 0 }));
  } else {
    main = h("div", { class: "sr-code" }, codeView({
      lines: lines2,
      markers,
      focusLine: ui.sourceFocusLine,
      search: ui.sourceFilter,
      lens: true,
      testid: "source-code",
      version: [hash(text2), markers.size],
      onLineClick: (line) => {
        ui.sourceFocusLine = line;
        ctx.refresh();
      }
    }));
  }
  if (!ui.sourceOutline) return h("div", { class: "sr", "data-dt": "source" }, bar, main);
  const width = ctx.width();
  const sideWidth = width >= 520 ? Math.min(paneSize(ctx, "source.side", width >= 900 ? 260 : 200), Math.round(width * 0.45)) : width;
  const compactTabs = sideWidth < 260;
  const sidebar = h(
    "div",
    { class: "sr-side" },
    h(
      "div",
      { class: "sr-side-head" },
      segmented([
        { value: "outline", label: compactTabs ? icon("list", { size: 13 }) : "Outline", tip: "Outline", count: analysis?.outline.length || null },
        { value: "problems", label: compactTabs ? icon("warning", { size: 13 }) : "Problems", tip: "Problems", count: diagnostics.length || null },
        { value: "history", label: compactTabs ? icon("history", { size: 13 }) : "History", tip: "History", count: model.programHistory.length > 1 ? model.programHistory.length : null }
      ], sidebarMode, (v) => {
        ui.sourceSidebar = v;
        ctx.refresh();
      }, { label: "Sidebar", testid: "source-sidebar" })
    ),
    h(
      "div",
      { class: "sr-side-body" },
      sidebarMode === "problems" ? problemsPane(ctx, diagnostics) : sidebarMode === "history" ? historyPane(ctx) : outlinePane(ctx, analysis?.outline ?? [])
    )
  );
  return h(
    "div",
    { class: "sr", "data-dt": "source" },
    bar,
    width >= 520 ? split({ size: sideWidth, min: 160, max: 480, onResize: (s) => setPaneSize(ctx, "source.side", s), first: sidebar, second: main }) : split({ direction: "col", size: 170, min: 90, onResize: () => void 0, first: sidebar, second: main })
  );
}
const sourceView = {
  id: "source",
  label: "Source",
  icon: "source",
  group: "app",
  hint: "Program text, diagnostics, outline, history, live editing",
  keywords: "source code program aktion edit hot reload diagnostics outline history diff revert",
  badge: (ctx) => {
    if (!can(ctx.app, "getDiagnostics")) return null;
    const count = ctx.app.getDiagnostics().filter((d) => d.severity === "error").length;
    return count > 0 ? { value: count, tone: "red" } : null;
  },
  render: render$2,
  commands: (ctx) => {
    const app = ctx.app;
    if (!app) return [];
    const out = [
      { id: "source:edit", label: "Edit the program", icon: "edit", run: () => {
        ctx.ui.sourceDraft = app.getProgram();
        ctx.selectTab("source");
      } }
    ];
    if (can(app, "reload")) out.push({ id: "source:reload", label: "Reload the program (re-plan)", icon: "refresh", run: () => {
      app.reload();
      ctx.toast("Program re-planned");
    } });
    if (can(app, "analyzeProgram")) {
      const outline = ctx.cache("source.palette-outline", () => app.analyzeProgram().outline);
      for (const entry of outline.slice(0, 200)) {
        out.push({ id: `source:goto:${entry.kind}:${entry.name}:${entry.line}`, label: entry.kind === "effect" && entry.name.startsWith("__") ? `Go to the $effect on line ${entry.line}` : `Go to ${entry.kind} ${entry.kind === "state" ? "$" : ""}${entry.name}`, icon: "code", run: () => {
          ctx.ui.sourceFocusLine = entry.line;
          ctx.ui.sourceDraft = null;
          ctx.selectTab("source");
        } });
      }
    }
    return out;
  },
  css: (
    /* css */
    `
.sr { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.sr-file { display: inline-flex; align-items: center; gap: 6px; font-size: var(--dt-fs-sm); color: var(--dt-text-2); }
.sr-status { display: inline-flex; gap: 5px; }
.sr-code, .sr-edit, .sr-diff { flex: 1 1 auto; min-height: 0; min-width: 0; display: flex; flex-direction: column; background: var(--dt-bg-0); }
.sr-edit-bar { flex: none; display: flex; align-items: center; gap: 8px; padding: 5px 12px; font-size: var(--dt-fs-sm); font-weight: 600; border-bottom: 1px solid var(--dt-border); background: var(--dt-amber-soft); }
.sr-edit-bar .t3 { font-weight: 400; }
.sr-edit-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dt-amber); }
.sr-side { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; background: var(--dt-bg-1); }
.sr-side-head { flex: none; padding: 7px 8px; border-bottom: 1px solid var(--dt-border); }
.sr-side-head .seg { width: 100%; }
.sr-side-head .seg > button { flex: 1 1 0; justify-content: center; }
.sr-side-body { flex: 1 1 auto; min-height: 0; overflow: auto; }
.sr-empty { padding: 12px; font-size: var(--dt-fs-sm); }
.sr-outline { padding: 4px 0 10px; }
.sr-group-head { display: flex; align-items: center; gap: 6px; padding: 8px 10px 3px; }
.sr-item { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 6px; width: 100%; padding: 3px 10px 3px 18px; font-size: var(--dt-fs-sm); cursor: pointer; }
.sr-item:hover { background: var(--dt-bg-hover); }
.sr-item.is-on { background: var(--dt-accent-soft); }
.sr-item:focus-visible { outline: 2px solid var(--dt-accent); outline-offset: -2px; }
.sr-problems { display: flex; flex-direction: column; }
.sr-problem { all: unset; box-sizing: border-box; display: flex; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--dt-border); cursor: pointer; font-size: var(--dt-fs-sm); line-height: 1.45; }
.sr-problem:hover { background: var(--dt-bg-hover); }
.sr-problem > svg { flex: none; margin-top: 2px; }
.sr-problem.is-error > svg { color: var(--dt-red); }
.sr-problem.is-warn > svg { color: var(--dt-amber); }
.sr-problem-text { display: flex; flex-direction: column; gap: 4px; min-width: 0; overflow-wrap: anywhere; }
.sr-problem-meta { display: flex; align-items: center; gap: 6px; color: var(--dt-text-3); font-size: var(--dt-fs-xs); }
.sr-history { display: flex; flex-direction: column; }
.sr-version { padding: 9px 10px; border-bottom: 1px solid var(--dt-border); display: flex; flex-direction: column; gap: 4px; }
.sr-version.is-on { background: var(--dt-accent-soft); }
.sr-version-top { display: flex; align-items: center; gap: 6px; }
.sr-version-time { font-weight: 600; font-size: var(--dt-fs-sm); font-variant-numeric: tabular-nums; }
.sr-version-meta { font-size: var(--dt-fs-xs); display: flex; gap: 8px; }
.sr-diffstat { font-family: var(--dt-mono); }
.sr-version-actions { flex-wrap: wrap; gap: 2px; margin-left: -6px; }
.sr-dl { display: grid; grid-template-columns: 38px 38px 16px 1fr; }
.sr-dl-no { color: var(--dt-text-4); text-align: right; padding-right: 6px; font-size: 11px; user-select: none; }
.sr-dl-sign { color: var(--dt-text-3); user-select: none; }
.sr-dl.is-add { background: color-mix(in srgb, var(--dt-green) 14%, transparent); }
.sr-dl.is-add .sr-dl-sign { color: var(--dt-green); }
.sr-dl.is-del { background: color-mix(in srgb, var(--dt-red) 14%, transparent); }
.sr-dl.is-del .sr-dl-sign { color: var(--dt-red); }
.sr-fold { height: 19px; display: flex; align-items: center; padding-left: 92px; color: var(--dt-text-3); font-size: var(--dt-fs-xs); background: var(--dt-bg-1); }
`
  )
};
const GROUPS = [
  { title: "Surfaces", icon: "layers", match: (t) => /^color(Bg|Surface|Border|Overlay|Backdrop)/.test(t) },
  { title: "Text", icon: "type", match: (t) => /^colorText/.test(t) || /^colorLink/.test(t) },
  { title: "Brand", icon: "sparkles", match: (t) => /^color(Primary|Accent|Focus|Secondary)/.test(t) },
  { title: "Status", icon: "checkCircle", match: (t) => /^color(Success|Warning|Danger|Error|Info)/.test(t) },
  { title: "Other colours", icon: "droplet", match: (t) => /^color/.test(t) },
  { title: "Typography", icon: "type", match: (t) => /^(font|line|letter|text)/i.test(t) },
  { title: "Spacing & shape", icon: "ruler", match: (t) => /^(space|spacing|radius|border|size|gap)/i.test(t) },
  { title: "Elevation & motion", icon: "grid", match: (t) => /^(shadow|elevation|motion|duration|ease|transition|z)/i.test(t) }
];
const CONTRAST_PAIRS = [
  { label: "Body text", fg: "colorText", bg: "colorBg", min: 4.5 },
  { label: "Muted text", fg: "colorTextMuted", bg: "colorBg", min: 4.5 },
  { label: "Text on surface", fg: "colorText", bg: "colorSurface", min: 4.5 },
  { label: "Muted on surface", fg: "colorTextMuted", bg: "colorSurface", min: 4.5 },
  { label: "Primary button", fg: "colorPrimaryText", bg: "colorPrimary", min: 4.5 },
  { label: "Accent fill", fg: "colorAccentText", bg: "colorAccent", min: 4.5 },
  { label: "Link", fg: "colorLink", bg: "colorBg", min: 4.5 },
  { label: "Success text", fg: "colorSuccessText", bg: "colorBg", min: 4.5 },
  { label: "Warning text", fg: "colorWarningText", bg: "colorBg", min: 4.5 },
  { label: "Danger text", fg: "colorDangerText", bg: "colorBg", min: 4.5 },
  { label: "Info text", fg: "colorInfoText", bg: "colorBg", min: 4.5 },
  { label: "Danger button", fg: "colorOnDanger", bg: "colorDanger", min: 4.5 },
  { label: "Control border", fg: "colorBorderControl", bg: "colorBg", min: 3 },
  { label: "Focus ring", fg: "colorFocusRing", bg: "colorBg", min: 3 }
];
function isColorValue(value) {
  return /^(#[0-9a-f]{3,8}$|rgba?\(|hsla?\(|color\(|oklch\(|oklab\()/i.test(value.trim());
}
function cssVarName(token) {
  return `--rui-${token.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`;
}
function hexOf(value) {
  const parsed2 = parseColor(value);
  return parsed2 ? toHex(parsed2) : null;
}
function themeBlock(theme, onlyEdited) {
  const keys2 = onlyEdited && theme.devtoolsOverrides.length > 0 ? theme.devtoolsOverrides : Object.keys(theme.tokens).sort();
  const lines2 = keys2.flatMap((key2) => theme.tokens[key2] === void 0 ? [] : [`  ${key2}: ${JSON.stringify(theme.tokens[key2])},`]);
  return `$theme({
${lines2.join("\n")}
})`;
}
function nudgeValue(value, delta) {
  const match = /^(-?\d*\.?\d+)([a-z%]*)$/i.exec(value.trim());
  if (!match) return null;
  const number = Number(match[1]);
  const unit = match[2] ?? "";
  const step = unit === "" || unit === "rem" || unit === "em" ? delta / 10 : delta;
  const next = Math.round((number + step) * 1e3) / 1e3;
  return `${next}${unit}`;
}
function setToken(ctx, app, theme, token, value, options = {}) {
  if (!can(app, "setThemeTokens")) return;
  const previous = theme.tokens[token];
  app.setThemeTokens({ [token]: value });
  if (!options.quiet) {
    ctx.toast(`${token} = ${value}`, "info", previous !== void 0 ? { action: { label: "Undo", run: () => {
      app.setThemeTokens({ [token]: previous });
      ctx.refresh();
    } } } : void 0);
  }
  ctx.refresh();
}
function resetToken(ctx, app, theme, token) {
  if (!can(app, "clearThemeTokens")) return;
  const others = {};
  for (const key2 of theme.devtoolsOverrides) if (key2 !== token && theme.tokens[key2] !== void 0) others[key2] = theme.tokens[key2];
  app.clearThemeTokens();
  if (Object.keys(others).length > 0) app.setThemeTokens?.(others);
  ctx.toast(`${token} restored`);
  ctx.refresh();
}
let pickerFrame = 0;
let pickerQueued = null;
function queuePicker(app, token, value) {
  pickerQueued = { app, token, value };
  if (pickerFrame) return;
  const flush = () => {
    pickerFrame = 0;
    const next = pickerQueued;
    pickerQueued = null;
    if (next) next.app.setThemeTokens?.({ [next.token]: next.value });
  };
  pickerFrame = typeof requestAnimationFrame === "function" ? requestAnimationFrame(flush) : setTimeout(flush, 16);
}
function tokenRow(ctx, app, theme, token, value) {
  const edited = theme.devtoolsOverrides.includes(token);
  const fromScript = theme.scriptOverrides.includes(token);
  const color = isColorValue(value);
  const hex = color ? hexOf(value) : null;
  const canEdit = can(app, "setThemeTokens");
  return h(
    "div",
    { key: token, class: ["tm-token", edited ? "is-edited" : ""], "data-dt": "theme-token", "data-token": token },
    color ? h(
      "label",
      { class: "tm-swatch", style: { background: value }, "data-tip": canEdit ? "Pick a colour" : value },
      canEdit ? h("input", {
        type: "color",
        value: hex ?? "#000000",
        "aria-label": `Colour for ${token}`,
        onInput: (event) => queuePicker(app, token, event.target.value),
        onChange: (event) => setToken(ctx, app, theme, token, event.target.value, { quiet: true })
      }) : null
    ) : h("span", { class: "tm-swatch is-text", "aria-hidden": "true" }, previewGlyph(token, value)),
    h(
      "div",
      { class: "tm-token-main" },
      h(
        "div",
        { class: "tm-token-name" },
        h("span", { class: "mono ellipsis", "data-tip": cssVarName(token) }, token),
        edited ? chip("edited", "amber") : null,
        fromScript ? chip("$theme", "purple", { tip: "Set by the program's $theme({...}) block — it is re-applied on every render and wins over an edit here" }) : null
      ),
      h("input", {
        class: ["input", "is-mono", "tm-value"],
        value,
        "aria-label": `${token} value`,
        spellcheck: "false",
        disabled: !canEdit || void 0,
        onKeyDown: (event) => {
          const input = event.target;
          if (event.key === "Enter") {
            event.preventDefault();
            if (input.value.trim() && input.value !== value) setToken(ctx, app, theme, token, input.value.trim());
          } else if (event.key === "Escape") {
            input.value = value;
            input.blur();
          } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            const next = nudgeValue(input.value, (event.key === "ArrowUp" ? 1 : -1) * (event.shiftKey ? 10 : 1));
            if (next !== null) {
              event.preventDefault();
              input.value = next;
              setToken(ctx, app, theme, token, next, { quiet: true });
            }
          }
        },
        onBlur: (event) => {
          const input = event.target;
          if (input.value.trim() && input.value !== value) setToken(ctx, app, theme, token, input.value.trim());
        }
      })
    ),
    h(
      "span",
      { class: "tm-token-actions" },
      iconButton({ icon: "copy", label: `Copy var(${cssVarName(token)})`, size: "sm", onClick: () => ctx.copy(`var(${cssVarName(token)})`, "the CSS variable") }),
      edited && can(app, "clearThemeTokens") ? iconButton({ icon: "undo", label: `Restore ${token}`, size: "sm", onClick: () => resetToken(ctx, app, theme, token) }) : null
    )
  );
}
function previewGlyph(token, value) {
  if (/^radius/i.test(token)) return h("span", { class: "tm-glyph-radius", style: { borderRadius: value } });
  if (/^shadow|elevation/i.test(token)) return h("span", { class: "tm-glyph-shadow", style: { boxShadow: value } });
  if (/^font(Size)?/i.test(token) && /px|rem|em/.test(value)) return h("span", { class: "tm-glyph-font", style: { fontSize: value.length < 10 ? value : void 0 } }, "Aa");
  if (/^fontFamily|^font$/i.test(token)) return h("span", { class: "tm-glyph-font", style: { fontFamily: value } }, "Aa");
  if (/^(space|spacing|gap|size)/i.test(token)) return h("span", { class: "tm-glyph-space", style: { width: `min(${value}, 22px)` } });
  return icon("hash", { size: 12 });
}
function contrastCard(ctx, app, theme) {
  const rows = [];
  let failing = 0;
  for (const pair of CONTRAST_PAIRS) {
    const fgValue = theme.tokens[pair.fg];
    const bgValue = theme.tokens[pair.bg];
    const fg = fgValue ? parseColor(fgValue) : null;
    const bg = bgValue ? parseColor(bgValue) : null;
    if (!fg || !bg || fg.a === 0 || bg.a === 0) continue;
    const ratio = contrastRatio(fg, bg);
    const pass = ratio >= pair.min;
    if (!pass) failing += 1;
    const fix = !pass ? suggestForeground(fg, bg, pair.min + 0.05) : null;
    rows.push(h(
      "div",
      { key: pair.label, class: ["tm-pair", pass ? "" : "is-fail"], "data-dt": "theme-pair" },
      h("span", { class: "tm-pair-sample", style: { background: bgValue, color: fgValue } }, "Aa"),
      h("span", { class: "tm-pair-text" }, h("span", { class: "tm-pair-label" }, pair.label), h("code", { class: "t3" }, `${pair.fg} on ${pair.bg}`)),
      spacer(),
      chip(`${ratio.toFixed(2)}:1`, pass ? "green" : "red", { tip: `Needs ${pair.min}:1 (WCAG ${pair.min === 3 ? "1.4.11" : "1.4.3"})`, mono: true }),
      fix && can(app, "setThemeTokens") ? button({ label: `Use ${fix.hex}`, size: "sm", variant: "ghost", icon: "wand", tip: `Closest passing colour for ${pair.fg} (${fix.ratio.toFixed(2)}:1)`, onClick: () => setToken(ctx, app, theme, pair.fg, fix.hex) }) : null
    ));
  }
  return card({
    title: "Contrast",
    icon: "contrast",
    testid: "theme-contrast",
    sub: rows.length === 0 ? "no measurable pairs" : failing > 0 ? h("span", { class: "tone-red" }, `${failing} of ${rows.length} pairs fail`) : `all ${rows.length} pairs pass`,
    body: rows.length === 0 ? h("div", { class: "t3" }, "This theme's colours could not be measured.") : h("div", { class: "tm-pairs" }, ...rows)
  });
}
function paletteStrip(theme) {
  const picks = ["colorBg", "colorSurface", "colorBorder", "colorText", "colorTextMuted", "colorPrimary", "colorAccent", "colorSuccess", "colorWarning", "colorDanger", "colorInfo"].filter((t) => theme.tokens[t] && isColorValue(theme.tokens[t]));
  if (picks.length === 0) return null;
  return h("div", { class: "tm-strip", "aria-label": "Palette preview" }, ...picks.map((t) => h("span", { key: t, class: "tm-strip-swatch", style: { background: theme.tokens[t] }, "data-tip": `${t}: ${theme.tokens[t]}` })));
}
function render$1(ctx) {
  const { app, ui } = ctx;
  if (!app) return noApp(ctx, "The Theme view", "theme");
  if (!can(app, "getTheme")) return h("div", { class: "dt-pad" }, unsupported("its theme tokens"));
  const theme = app.getTheme();
  const q = ui.themeFilter.trim().toLowerCase();
  const editedOnly = ui.themeEditedOnly;
  const entries = Object.entries(theme.tokens).filter(([token, value]) => (!q || token.toLowerCase().includes(q) || value.toLowerCase().includes(q)) && (!editedOnly || theme.devtoolsOverrides.includes(token))).sort((a, b) => a[0].localeCompare(b[0]));
  const placed = /* @__PURE__ */ new Set();
  const groups = [];
  for (const group of GROUPS) {
    const rows = entries.filter(([token]) => !placed.has(token) && group.match(token));
    for (const [token] of rows) placed.add(token);
    if (rows.length === 0) continue;
    groups.push(card({ title: group.title, icon: group.icon, sub: plural(rows.length, "token"), flush: true, body: h("div", { class: "tm-tokens" }, ...rows.map(([token, value]) => tokenRow(ctx, app, theme, token, value))) }));
  }
  const rest = entries.filter(([token]) => !placed.has(token));
  if (rest.length > 0) groups.push(card({ title: "Other", icon: "grid", sub: plural(rest.length, "token"), flush: true, body: h("div", { class: "tm-tokens" }, ...rest.map(([token, value]) => tokenRow(ctx, app, theme, token, value))) }));
  const switcher = theme.available.length > 0 && can(app, "setThemeName") ? theme.available.length <= 5 ? segmented(theme.available.map((name) => ({ value: name, label: name })), theme.available.includes(theme.name) ? theme.name : "", (name) => {
    app.setThemeName(name);
    ctx.toast(`Theme: ${name}`);
    ctx.refresh();
  }, { label: "Theme", testid: "theme-switch" }) : select({ value: theme.available.includes(theme.name) ? theme.name : theme.available[0], label: "Theme", options: theme.available.map((name) => ({ value: name, label: name })), onChange: (name) => {
    app.setThemeName(name);
    ctx.toast(`Theme: ${name}`);
    ctx.refresh();
  } }) : chip(theme.name, "grey");
  return h(
    "div",
    { class: "tm", "data-dt": "theme" },
    viewbar(
      switcher,
      searchField({ value: ui.themeFilter, placeholder: "Filter tokens or values…", width: "200px", testid: "theme-filter", meta: q ? String(entries.length) : void 0, onInput: (v) => {
        ui.themeFilter = v;
        ctx.refresh();
      } }),
      filterChip({ label: "Edited", on: editedOnly, count: theme.devtoolsOverrides.length, onToggle: () => {
        ui.themeEditedOnly = !ui.themeEditedOnly;
        ctx.refresh();
      }, tip: "Show only tokens you changed" }),
      spacer(),
      button({ label: "Copy $theme", size: "sm", icon: "copy", testid: "theme-copy", tip: theme.devtoolsOverrides.length > 0 ? "The block reproducing your edits" : "Every resolved token as a $theme block", onClick: () => ctx.copy(themeBlock(theme, true), "the $theme block") }),
      iconButton({ icon: "more", label: "More", size: "sm", onClick: (event) => ctx.openMenu(event, [
        { label: "Copy every token as $theme", icon: "copy", run: () => ctx.copy(themeBlock(theme, false), "the $theme block") },
        { label: "Copy tokens as JSON", icon: "brackets", run: () => ctx.copy(JSON.stringify(theme.tokens, null, 2), "the tokens") },
        { label: "Copy as CSS variables", icon: "code", run: () => ctx.copy(`:host {
${Object.entries(theme.tokens).map(([k, v]) => `  ${cssVarName(k)}: ${v};`).join("\n")}
}`, "the CSS") }
      ]) }),
      theme.devtoolsOverrides.length > 0 && can(app, "clearThemeTokens") ? [vsep(), button({ label: `Reset ${theme.devtoolsOverrides.length}`, size: "sm", variant: "danger", icon: "undo", testid: "theme-reset", onClick: () => {
        const backup = {};
        for (const key2 of theme.devtoolsOverrides) if (theme.tokens[key2] !== void 0) backup[key2] = theme.tokens[key2];
        app.clearThemeTokens();
        ctx.toast("Token edits cleared", "info", { action: { label: "Undo", run: () => {
          app.setThemeTokens?.(backup);
          ctx.refresh();
        } } });
        ctx.refresh();
      } })] : null
    ),
    h(
      "div",
      { class: "dt-scroll" },
      h(
        "div",
        { class: "tm-page" },
        h(
          "div",
          { class: "tm-hero" },
          h(
            "div",
            { class: "tm-hero-text" },
            h("div", { class: "tm-hero-title" }, h("span", { class: "tm-hero-name" }, theme.name), h("span", { class: "t3" }, ` · ${plural(Object.keys(theme.tokens).length, "token")}`)),
            h("div", { class: "t3" }, theme.devtoolsOverrides.length > 0 ? `${plural(theme.devtoolsOverrides.length, "edit")} applied live` : "Click a swatch or edit a value — every component restyles instantly. ↑/↓ nudges numbers (⇧ ×10)."),
            theme.scriptOverrides.length > 0 ? h("div", { class: "t3" }, icon("info", { size: 11 }), ` The program's $theme block sets ${plural(theme.scriptOverrides.length, "token")}; those win over edits here.`) : null
          ),
          paletteStrip(theme)
        ),
        contrastCard(ctx, app, theme),
        groups.length > 0 ? h("div", { class: "tm-groups" }, ...groups) : emptyState({ icon: "filter", title: editedOnly ? "No edited tokens" : "No token matches" }),
        theme.devtoolsOverrides.length > 0 ? note("accent", ["Happy with it? ", h("strong", {}, "Copy $theme"), " and paste the block into the program to make the edits permanent."], { icon: "sparkles" }) : null
      )
    )
  );
}
const themeView = {
  id: "theme",
  label: "Theme",
  icon: "theme",
  group: "app",
  hint: "Live design-token editor, theme switcher, contrast checks",
  keywords: "theme tokens colors palette dark light design css variables contrast",
  badge: (ctx) => {
    const app = ctx.app;
    if (!can(app, "getTheme")) return null;
    const count = ctx.memo("theme.badge", [app.id, ctx.model.revs.commit], () => app.getTheme().devtoolsOverrides.length);
    return count > 0 ? { value: count, tone: "amber" } : null;
  },
  render: render$1,
  commands: (ctx) => {
    const app = ctx.app;
    if (!can(app, "getTheme") || !can(app, "setThemeName")) return [];
    return app.getTheme().available.map((name) => ({ id: `theme:${name}`, label: `Switch app theme to ${name}`, icon: "theme", keywords: "theme dark light", run: () => {
      app.setThemeName(name);
      ctx.refresh();
    } }));
  },
  css: (
    /* css */
    `
.tm { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.tm-page { padding: 12px; display: flex; flex-direction: column; gap: 12px; }
.tm-hero { display: flex; align-items: center; gap: 16px; padding: 14px 16px; border-radius: var(--dt-r-lg); border: 1px solid var(--dt-border); background: linear-gradient(135deg, var(--dt-accent-soft), transparent 70%), var(--dt-bg-1); flex-wrap: wrap; }
.tm-hero-text { flex: 1 1 260px; display: flex; flex-direction: column; gap: 4px; font-size: var(--dt-fs-sm); }
.tm-hero-title { font-size: 17px; font-weight: 700; }
.tm-hero-name { text-transform: capitalize; }
.tm-strip { display: flex; border-radius: 10px; overflow: hidden; border: 1px solid var(--dt-border-strong); box-shadow: var(--dt-shadow-sm); }
.tm-strip-swatch { width: 26px; height: 40px; }
.tm-groups { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 12px; align-items: start; }
.tm-tokens { display: flex; flex-direction: column; }
.tm-token { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-bottom: 1px solid var(--dt-border); }
.tm-token:last-child { border-bottom: 0; }
.tm-token.is-edited { background: color-mix(in srgb, var(--dt-amber) 8%, transparent); }
.tm-swatch { position: relative; flex: none; width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--dt-border-strong); box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08); cursor: pointer; overflow: hidden; background-clip: padding-box; }
.tm-swatch input[type="color"] { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; border: 0; padding: 0; }
.tm-swatch:focus-within { outline: 2px solid var(--dt-accent); outline-offset: 2px; }
.tm-swatch.is-text { display: flex; align-items: center; justify-content: center; cursor: default; background: var(--dt-bg-2); color: var(--dt-text-3); }
.tm-glyph-radius { width: 16px; height: 16px; border: 2px solid var(--dt-accent); border-right-color: transparent; border-bottom-color: transparent; }
.tm-glyph-shadow { width: 16px; height: 16px; border-radius: 4px; background: var(--dt-bg-0); }
.tm-glyph-font { font-weight: 650; color: var(--dt-text); line-height: 1; max-height: 26px; overflow: hidden; }
.tm-glyph-space { height: 6px; min-width: 2px; background: var(--dt-accent); border-radius: 3px; }
.tm-token-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
.tm-token-name { display: flex; align-items: center; gap: 6px; font-size: var(--dt-fs-sm); min-width: 0; }
.tm-value { width: 100%; height: 24px; font-size: var(--dt-fs-xs); }
.tm-token-actions { display: inline-flex; gap: 2px; opacity: 0; transition: opacity 120ms; }
.tm-token:hover .tm-token-actions, .tm-token:focus-within .tm-token-actions { opacity: 1; }
.tm-pairs { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 6px 14px; }
.tm-pair { display: flex; align-items: center; gap: 10px; padding: 5px 0; min-width: 0; }
.tm-pair-sample { width: 36px; height: 28px; border-radius: 7px; display: flex; align-items: center; justify-content: center; font-weight: 700; border: 1px solid var(--dt-border-strong); flex: none; }
.tm-pair-text { display: flex; flex-direction: column; min-width: 0; }
.tm-pair-label { font-size: var(--dt-fs-sm); font-weight: 600; }
.tm-pair-text code { font-size: 10.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tm-pair.is-fail .tm-pair-label { color: var(--dt-red); }
`
  )
};
const DEVTOOLS_UI_VERSION = "3.0";
function row(title, description, control, iconName) {
  return h(
    "div",
    { class: "se-row" },
    iconName ? h("span", { class: "se-row-icon" }, icon(iconName, { size: 15 })) : h("span", { class: "se-row-icon is-empty" }),
    h("div", { class: "se-row-text" }, h("div", { class: "se-row-title" }, title), description ? h("div", { class: "se-row-desc" }, description) : null),
    h("div", { class: "se-row-control" }, control)
  );
}
const INSTRUMENTATION = [
  { key: "captureProps", title: "Capture props", description: "Per-instance props and arguments in every commit — the Inspector's Props pane and the profiler's “why did this render”.", icon: "brackets", rerender: true },
  { key: "tagDom", title: "Tag DOM nodes", description: "Stamps data-aktion-instance on rendered elements so the picker and highlights can map DOM ↔ component.", icon: "tag", rerender: true },
  { key: "captureSnapshots", title: "State snapshots", description: "A $state snapshot with every commit — powers time travel and state diffs.", icon: "history" },
  { key: "captureNetwork", title: "Network events", description: "Requests from the HTTP layer, plus mock, delay and failure rules.", icon: "network" },
  { key: "measureDom", title: "Count DOM nodes", description: "Walks the tree after each commit to report DOM size. Cheap, but a full walk.", icon: "layers" }
];
function render(ctx) {
  const { ui, hook, app } = ctx;
  const setUi = (key2, value) => {
    ui[key2] = value;
    ctx.persist();
    ctx.refresh();
  };
  const options = hook.options;
  const docks = [
    { value: "float", label: "Float", icon: "dockFloat" },
    { value: "right", label: "Right", icon: "dockRight" },
    { value: "bottom", label: "Bottom", icon: "dockBottom" },
    { value: "left", label: "Left", icon: "dockLeft" }
  ];
  return h(
    "div",
    { class: "dt-scroll", "data-dt": "settings" },
    h(
      "div",
      { class: "se-page" },
      h(
        "div",
        { class: "se-hero" },
        logoMark(40),
        h(
          "div",
          { class: "se-hero-text" },
          h("div", { class: "se-hero-title" }, "Aktion DevTools"),
          h("div", { class: "t3" }, `Panel ${DEVTOOLS_UI_VERSION} · protocol ${hook.protocolVersion} · runtime ${hook.libraryVersion}`)
        ),
        h(
          "div",
          { class: "se-hero-actions" },
          button({ label: "Shortcuts", icon: "keyboard", size: "sm", onClick: () => ctx.panel.showShortcuts() }),
          button({ label: "Command palette", icon: "command", size: "sm", kbd: "⌘ K", onClick: () => ctx.openPalette() })
        )
      ),
      card({
        title: "Appearance",
        icon: "sun",
        testid: "settings-appearance",
        flush: true,
        body: h(
          "div",
          { class: "se-rows" },
          row(
            "Theme",
            "Follows your system unless you pick one.",
            segmented([{ value: "system", label: "System", icon: "contrast" }, { value: "dark", label: "Dark", icon: "moon" }, { value: "light", label: "Light", icon: "sun" }], ui.theme, (v) => setUi("theme", v), { label: "Panel theme", testid: "settings-theme" }),
            "contrast"
          ),
          row(
            "Density",
            "Compact rows fit more on screen.",
            segmented([{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }], ui.compact ? "compact" : "comfortable", (v) => setUi("compact", v === "compact"), { label: "Density", testid: "settings-density" }),
            "list"
          ),
          row(
            "Motion",
            "Animations respect prefers-reduced-motion by default.",
            segmented([{ value: "system", label: "System" }, { value: "reduced", label: "Reduced" }, { value: "full", label: "Full" }], ui.motion, (v) => setUi("motion", v), { label: "Motion" }),
            "sparkles"
          ),
          row(
            "Position",
            "Dock to an edge, or float and drag it anywhere (drag to an edge to snap).",
            segmented(docks.map((d) => ({ value: d.value, label: d.label, icon: d.icon })), ui.dock, (v) => ctx.panel.setDock(v), { label: "Dock position", testid: "settings-dock" }),
            "panel"
          ),
          row(
            "Push the page aside when docked",
            "Keeps the app fully visible next to the panel instead of underneath it.",
            toggleSwitch({ checked: ui.pushPage, onChange: (v) => setUi("pushPage", v) }),
            "split"
          ),
          row(
            "Sidebar labels",
            "Show section names next to the icons.",
            toggleSwitch({ checked: ui.railWide, onChange: (v) => setUi("railWide", v) }),
            "panel"
          ),
          row(
            "Launcher button",
            ["The floating button shown while the panel is minimised — ", h("code", {}, "Shift+Alt+D"), " reopens DevTools either way."],
            toggleSwitch({ checked: ui.showLauncher, onChange: (v) => setUi("showLauncher", v) }),
            "dot"
          )
        )
      }),
      card({
        title: "Behaviour",
        icon: "zap",
        testid: "settings-behaviour",
        flush: true,
        body: h(
          "div",
          { class: "se-rows" },
          row(
            "Capture console",
            "Mirror console.* calls into the Console view (the original calls still run).",
            toggleSwitch({ checked: ui.captureConsole, testid: "settings-console", onChange: (v) => setUi("captureConsole", v) }),
            "console"
          ),
          row(
            "Highlight re-renders",
            "Outline every component as it renders, with a running count — wasted renders glow amber.",
            toggleSwitch({ checked: ui.highlightUpdates, testid: "settings-highlight", onChange: (v) => ctx.panel.setHighlightUpdates(v) }),
            "scan"
          ),
          row(
            "Flash the app on commit",
            "A brief outline on the app element after every commit.",
            toggleSwitch({ checked: ui.flashOnCommit, onChange: (v) => setUi("flashOnCommit", v) }),
            "zap"
          ),
          row(
            "User Timing marks",
            ["Emit ", h("code", {}, "performance.measure"), " entries per commit, so renders line up in the browser's Performance panel."],
            toggleSwitch({ checked: ui.perfMarks, onChange: (v) => setUi("perfMarks", v) }),
            "gauge"
          ),
          row(
            "Re-run accessibility audit after commits",
            "Keeps the Accessibility view current while you work (debounced).",
            toggleSwitch({ checked: ui.a11yAuto, onChange: (v) => setUi("a11yAuto", v) }),
            "a11y"
          )
        )
      }),
      card({
        title: "Runtime instrumentation",
        icon: "cpu",
        testid: "settings-instrumentation",
        flush: true,
        sub: "What the runtime records while DevTools is open. Closing the panel stops all of it.",
        body: h("div", { class: "se-rows" }, ...INSTRUMENTATION.map((entry) => row(
          entry.title,
          entry.description,
          toggleSwitch({ checked: options[entry.key], testid: `settings-${entry.key}`, onChange: (v) => {
            hook.setOptions({ [entry.key]: v });
            if (entry.rerender) app?.forceRender();
            ctx.toast(`${entry.title} ${v ? "on" : "off"}`);
            ctx.refresh();
          } }),
          entry.icon
        )))
      }),
      card({
        title: "Session data",
        icon: "data",
        testid: "settings-data",
        flush: true,
        body: h(
          "div",
          { class: "se-rows" },
          row(
            "Export the session",
            "Commits, state history, requests, logs, errors and recorded steps as one JSON file — attach it to a bug; anyone can open it in DevTools.",
            button({ label: "Export", icon: "download", size: "sm", onClick: () => ctx.panel.exportSession() }),
            "download"
          ),
          row(
            "Open a session file",
            "Inspect an exported session offline: timeline, commits, requests, logs and state.",
            button({ label: "Import…", icon: "upload", size: "sm", onClick: () => ctx.panel.importSession() }),
            "upload"
          ),
          row(
            "Copy a bug report",
            "Markdown with the environment, recent errors, failing requests, vitals and reproduction steps.",
            button({ label: "Copy", icon: "bug", size: "sm", onClick: () => ctx.panel.copyBugReport() }),
            "bug"
          ),
          row(
            "Clear captured data",
            `${fmtCount(ctx.model.commits.length)} commits, ${fmtCount(ctx.model.network.length)} requests and ${fmtCount(ctx.model.logs.length)} log lines in memory.`,
            button({ label: "Clear", icon: "trash", size: "sm", variant: "danger", onClick: () => ctx.panel.clearSession() }),
            "trash"
          ),
          row(
            "Reset preferences",
            "Theme, density, position, sizes and toggles back to their defaults.",
            button({ label: "Reset", icon: "undo", size: "sm", onClick: () => ctx.panel.resetPreferences() }),
            "undo"
          )
        )
      }),
      card({
        title: "Keyboard shortcuts",
        icon: "keyboard",
        testid: "settings-shortcuts",
        body: h("div", { class: "se-shortcuts" }, ...SHORTCUT_GROUPS.map((group) => h(
          "div",
          { key: group.title, class: "se-sc-group" },
          h("div", { class: "se-sc-title" }, group.title),
          ...group.items.map(([combo, what]) => h("div", { key: combo, class: "se-sc-row" }, h("span", { class: "se-sc-what" }, what), keys(combo)))
        )))
      }),
      card({
        title: "About",
        icon: "info",
        testid: "settings-about",
        body: h(
          "div",
          { class: "se-about" },
          h(
            "dl",
            { class: "kv" },
            h("dt", {}, "Panel"),
            h("dd", {}, DEVTOOLS_UI_VERSION),
            h("dt", {}, "Protocol"),
            h("dd", {}, String(hook.protocolVersion)),
            h("dt", {}, "Runtime"),
            h("dd", {}, hook.libraryVersion),
            h("dt", {}, "Apps on page"),
            h("dd", {}, String(hook.apps.size)),
            h("dt", {}, "Event buffer"),
            h("dd", {}, `${fmtCount(hook.buffer.length)} / ${fmtCount(hook.bufferLimit)}`),
            h("dt", {}, "Secure context"),
            h("dd", {}, typeof isSecureContext !== "undefined" && isSecureContext ? chip("yes", "green") : chip("no", "amber"))
          ),
          note("plain", ["DevTools costs nothing until opened: the runtime checks ", h("code", {}, "hook.active"), " and keeps its profiler dormant. Nothing leaves this page — no telemetry, no network calls of its own (the Security view's header check is one same-origin HEAD request, on request)."], { icon: "lock" })
        )
      })
    )
  );
}
const settingsView = {
  id: "settings",
  label: "Settings",
  icon: "settings",
  group: "system",
  hint: "Appearance, behaviour, instrumentation, data, shortcuts, about",
  keywords: "settings preferences options theme dark light density dock instrumentation export import reset about version shortcuts",
  render,
  css: (
    /* css */
    `
.se-page { padding: 14px; display: flex; flex-direction: column; gap: 12px; max-width: 900px; }
.se-hero { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: var(--dt-r-lg); border: 1px solid var(--dt-border); background: radial-gradient(120% 140% at 0% 0%, var(--dt-accent-soft), transparent 60%), var(--dt-bg-1); flex-wrap: wrap; }
.se-hero-text { flex: 1 1 200px; display: flex; flex-direction: column; gap: 3px; }
.se-hero-title { font-size: 17px; font-weight: 750; letter-spacing: -0.01em; }
.se-hero-text .t3 { font-size: var(--dt-fs-sm); font-variant-numeric: tabular-nums; }
.se-hero-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.se-rows { display: flex; flex-direction: column; }
.se-row { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 11px 14px; border-bottom: 1px solid var(--dt-border); }
.se-row:last-child { border-bottom: 0; }
.se-row-icon { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: var(--dt-text-2); background: var(--dt-bg-2); }
.se-row-icon.is-empty { background: none; }
.se-row-title { font-weight: 600; font-size: var(--dt-fs-md); }
.se-row-desc { font-size: var(--dt-fs-sm); color: var(--dt-text-3); margin-top: 2px; line-height: 1.45; }
.se-row-control { display: flex; justify-content: flex-end; }
@container (max-width: 560px) { .se-row { grid-template-columns: 28px minmax(0, 1fr); } .se-row-control { grid-column: 2; justify-content: flex-start; } }
.se-shortcuts { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px 20px; }
.se-sc-title { font-size: var(--dt-fs-xs); font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--dt-text-3); margin-bottom: 6px; }
.se-sc-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 4px 0; font-size: var(--dt-fs-sm); }
.se-sc-what { color: var(--dt-text-2); }
.se-about { display: flex; flex-direction: column; gap: 12px; }
`
  )
};
const VIEWS = [
  // The shared view stylesheet rides on the first entry: the shell appends
  // every view's `css` once, in order.
  { ...overviewView, css: `${viewCss}
${overviewView.css}` },
  inspectView,
  stateView,
  dataView,
  routesView,
  timelineView,
  networkView,
  consoleView,
  effectsView,
  profilerView,
  a11yView,
  securityView,
  testingView,
  sourceView,
  themeView,
  settingsView
];
function isTypingTarget(target) {
  let node = target instanceof Element ? target : null;
  const seen = /* @__PURE__ */ new Set();
  while (node && !seen.has(node)) {
    seen.add(node);
    const tag = node.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (node.isContentEditable) return true;
    node = node.shadowRoot?.activeElement ?? null;
  }
  return false;
}
const GROUP_LABELS = {
  home: "",
  inspect: "Inspect",
  activity: "Activity",
  perf: "Performance",
  quality: "Quality",
  app: "App",
  system: ""
};
const DOCK_ORDER = ["float", "right", "bottom", "left"];
const MIN_W = 380;
const MIN_H = 280;
const SNAP_ZONE = 28;
const TOAST_MS = 2800;
class AktionDevtoolsElement extends HTMLElement {
  constructor() {
    super();
    __publicField(this, "hook", null);
    __publicField(this, "unsubEvents", null);
    __publicField(this, "unsubApps", null);
    __publicField(this, "models", /* @__PURE__ */ new Map());
    __publicField(this, "imported", /* @__PURE__ */ new Map());
    __publicField(this, "selectedAppId", null);
    __publicField(this, "ui", defaultUiState());
    __publicField(this, "overlay", new InspectOverlay());
    __publicField(this, "recorder", new InteractionRecorder());
    __publicField(this, "consoleCapture", new ConsoleCapture());
    __publicField(this, "vitals", new VitalsMonitor());
    __publicField(this, "pagePush", new PagePush());
    __publicField(this, "tooltips", null);
    __publicField(this, "root");
    __publicField(this, "frameHost");
    __publicField(this, "layerHost");
    __publicField(this, "snapEl", null);
    __publicField(this, "renderScheduled", false);
    __publicField(this, "renderTimer", null);
    __publicField(this, "renderTimes", []);
    __publicField(this, "passCache", /* @__PURE__ */ new Map());
    __publicField(this, "memoCache", /* @__PURE__ */ new Map());
    __publicField(this, "geometry");
    __publicField(this, "dockSizes");
    __publicField(this, "launcherPos");
    __publicField(this, "restoreGeometry", null);
    __publicField(this, "droppedWhilePaused", 0);
    __publicField(this, "cspViolations", []);
    __publicField(this, "recentCommands", []);
    __publicField(this, "toastSeq", 0);
    __publicField(this, "toastTimers", /* @__PURE__ */ new Map());
    __publicField(this, "windowKeyHandler", null);
    __publicField(this, "cspHandler", null);
    __publicField(this, "schemeQuery", null);
    __publicField(this, "schemeHandler", null);
    __publicField(this, "resizeHandler", null);
    __publicField(this, "outsidePointer", null);
    __publicField(this, "layersTimer", null);
    __publicField(this, "a11yTimer", null);
    __publicField(this, "suppressLauncherClick", false);
    /** `performance.now()` → epoch offset, for converting model times to clock times. */
    __publicField(this, "epochOffset", Date.now() - (typeof performance !== "undefined" ? performance.now() : 0));
    __publicField(this, "effectState", {});
    const persisted = loadPersisted();
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const width = clamp(persisted.width ?? Math.round(vw * 0.62), MIN_W, Math.max(MIN_W, vw - 24));
    const height = clamp(persisted.height ?? Math.round(vh * 0.72), MIN_H, Math.max(MIN_H, vh - 24));
    this.geometry = {
      width,
      height,
      left: clamp(persisted.left ?? vw - width - 20, 0, Math.max(0, vw - 80)),
      top: clamp(persisted.top ?? vh - height - 20, 0, Math.max(0, vh - 60))
    };
    this.dockSizes = {
      right: persisted.dockSize?.right ?? Math.round(clamp(vw * 0.42, 420, 760)),
      left: persisted.dockSize?.left ?? Math.round(clamp(vw * 0.42, 420, 760)),
      bottom: persisted.dockSize?.bottom ?? Math.round(clamp(vh * 0.42, 280, 560))
    };
    this.launcherPos = persisted.launcher ?? { right: 18, bottom: 18 };
    const ui = this.ui;
    if (persisted.tab && VIEWS.some((view) => view.id === persisted.tab)) ui.tab = persisted.tab;
    if (persisted.dock) ui.dock = persisted.dock;
    if (persisted.theme) ui.theme = persisted.theme;
    else if (persisted.light !== void 0) ui.theme = persisted.light ? "light" : "dark";
    if (persisted.compact !== void 0) ui.compact = persisted.compact;
    if (persisted.motion) ui.motion = persisted.motion;
    if (persisted.captureConsole !== void 0) ui.captureConsole = persisted.captureConsole;
    if (persisted.tipsDismissed !== void 0) ui.tipsDismissed = persisted.tipsDismissed;
    if (Array.isArray(persisted.watches)) ui.watches = persisted.watches.slice(0, 20);
    if (persisted.railWide !== void 0) ui.railWide = persisted.railWide;
    if (persisted.showLauncher !== void 0) ui.showLauncher = persisted.showLauncher;
    if (persisted.pushPage !== void 0) ui.pushPage = persisted.pushPage;
    if (persisted.sizes) ui.sizes = { ...persisted.sizes };
    if (persisted.testFormat) ui.testFormat = persisted.testFormat;
    if (persisted.highlightUpdates !== void 0) ui.highlightUpdates = persisted.highlightUpdates;
    if (persisted.minimized) ui.minimized = true;
    ui.collapsed = ui.minimized;
    this.overlay.setBounds(() => {
      const area = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
      if (this.ui.minimized || this.hidden || this.ui.dock === "float") return area;
      const rect = this.getBoundingClientRect();
      if (this.ui.dock === "right") area.right = Math.max(120, rect.left);
      else if (this.ui.dock === "left") area.left = Math.min(window.innerWidth - 120, rect.right);
      else if (this.ui.dock === "bottom") area.bottom = Math.max(80, rect.top);
      return area;
    });
  }
  /* ---------------------------------------------------------------------- */
  /*  Lifecycle                                                              */
  /* ---------------------------------------------------------------------- */
  connectedCallback() {
    if (!this.root) this.buildSkeleton();
    this.hook = installDevtoolsHook();
    for (const app of this.hook.apps.values()) this.adopt(app);
    if (!this.selectedAppId && this.hook.apps.size > 0) this.selectedAppId = [...this.hook.apps.keys()][0];
    for (const event of this.hook.buffer) ingest(this.ensureModel(event.appId), event, true);
    this.unsubEvents = this.hook.subscribe((event) => this.onEvent(event));
    this.unsubApps = this.hook.subscribeApps((action, app) => this.onApp(action, app));
    this.discoverApps();
    this.syncConsoleCapture();
    this.vitals.start(() => this.onVitals());
    this.vitals.setFrameSampling(!this.ui.minimized);
    this.bindWindow();
    if (this.selectedAppId) this.recordProgramVersion(this.selectedAppId);
    this.scheduleRender();
  }
  disconnectedCallback() {
    this.unsubEvents?.();
    this.unsubApps?.();
    this.unsubEvents = null;
    this.unsubApps = null;
    this.consoleCapture.stop();
    this.recorder.stop();
    this.vitals.stop();
    this.overlay.destroy();
    this.pagePush.release();
    releaseSideEffects(this.effectState, this.currentApp());
    this.tooltips?.destroy();
    this.tooltips = null;
    this.unbindWindow();
    for (const timer of this.toastTimers.values()) clearTimeout(timer);
    this.toastTimers.clear();
    if (this.renderTimer) clearTimeout(this.renderTimer);
    if (this.layersTimer) clearTimeout(this.layersTimer);
    if (this.a11yTimer) clearTimeout(this.a11yTimer);
    this.persist();
  }
  /* ---- public controller surface ---- */
  /** Show the panel (restoring it from the launcher). */
  open() {
    this.hidden = false;
    this.setMinimized(false);
  }
  /** Collapse to the launcher (or hide entirely when the launcher is off). */
  close() {
    this.overlay.stopPicking();
    this.overlay.clear();
    this.setMinimized(true);
  }
  toggle() {
    if (this.ui.minimized || this.hidden) this.open();
    else this.close();
  }
  selectApp(id) {
    if (id === this.selectedAppId) return;
    this.selectedAppId = id;
    this.ui.selectedCommitId = null;
    this.ui.selectedInstance = null;
    this.ui.selectedElement = null;
    this.ui.selectedRequest = null;
    this.ui.timeTravel = null;
    this.ui.flameSelected = null;
    this.memoCache.clear();
    this.overlay.clear();
    const app = this.currentApp();
    if (app && can(app, "getNetworkRules")) {
      try {
        this.ui.rules = app.getNetworkRules();
      } catch {
      }
    }
    this.scheduleRender();
  }
  selectTab(tab) {
    if (!VIEWS.some((view) => view.id === tab)) return;
    this.ui.tab = tab;
    this.ui.menu = null;
    this.persist();
    this.scheduleRender();
  }
  /** Change the dock position. */
  setDock(dock) {
    this.ui.dock = dock;
    this.restoreGeometry = null;
    this.persist();
    this.scheduleRender();
  }
  /** The derived model for an app (or the selected one). */
  getModel(appId) {
    const id = appId ?? this.selectedAppId;
    if (!id) return null;
    return this.imported.get(id)?.model ?? this.models.get(id) ?? null;
  }
  /** The panel's view state (tests and embedders). */
  getUiState() {
    return this.ui;
  }
  /** Render synchronously now — for tests and embedders that must observe the result immediately. */
  flush() {
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    this.renderScheduled = false;
    this.renderNow();
  }
  /** Load an exported session file into the panel for offline inspection. */
  importSession(text2, fileName) {
    const session = importSessionJson(text2, fileName);
    const id = `import-${this.imported.size + 1}`;
    this.imported.set(id, session);
    if (session.steps.length > 0) this.recorder.load(session.steps);
    this.selectApp(id);
    this.toast(`Imported ${session.label}`, "good");
    return id;
  }
  /* ---------------------------------------------------------------------- */
  /*  Ingestion                                                              */
  /* ---------------------------------------------------------------------- */
  ensureModel(appId) {
    let model = this.models.get(appId);
    if (!model) {
      model = emptyModel();
      this.models.set(appId, model);
    }
    return model;
  }
  adopt(app) {
    const model = this.ensureModel(app.id);
    try {
      model.state = app.getState();
    } catch {
    }
    if (app.id === this.selectedAppId || !this.selectedAppId) {
      if (can(app, "getNetworkRules")) {
        try {
          this.ui.rules = app.getNetworkRules();
        } catch {
        }
      }
    }
  }
  /** Ask every `<aktion-app>` on the page to register (late attach). */
  discoverApps() {
    if (typeof document === "undefined") return;
    document.querySelectorAll("aktion-app").forEach((el) => {
      try {
        el.connectDevtools?.();
      } catch {
      }
    });
  }
  onApp(action, app) {
    if (action === "register") {
      this.adopt(app);
      if (!this.selectedAppId) this.selectedAppId = app.id;
    } else if (this.selectedAppId === app.id) {
      const next = [...this.hook?.apps.keys() ?? []].find((id) => id !== app.id) ?? null;
      this.selectedAppId = next;
    }
    this.scheduleRender();
  }
  onEvent(event) {
    if (this.ui.paused) {
      this.droppedWhilePaused += 1;
      if (this.droppedWhilePaused % 25 === 1) this.scheduleRender();
      return;
    }
    const model = this.ensureModel(event.appId);
    ingest(model, event, false);
    const mine = event.appId === this.selectedAppId;
    if (mine && event.kind === "commit") this.afterCommit(event, model);
    if (mine && event.kind === "state") this.checkBreakOnChange(event);
    if (mine && event.kind === "route" && this.recorder.isRecording) {
      this.recorder.addStep({ type: "navigate", value: event.to, label: `navigate to ${event.to}` });
    }
    this.scheduleRender();
  }
  afterCommit(commit, model) {
    if (this.ui.flashOnCommit) this.flashApp();
    if (this.ui.highlightUpdates && !this.ui.minimized) this.scanCommit(commit, model);
    if (this.ui.perfMarks) this.markCommit(commit);
    if (this.selectedAppId) this.recordProgramVersion(this.selectedAppId);
    if (this.layersTimer) clearTimeout(this.layersTimer);
    this.layersTimer = setTimeout(() => {
      this.layersTimer = null;
      this.overlay.refreshLayers();
    }, 120);
    if (this.ui.a11yAuto && this.ui.a11yRun) {
      if (this.a11yTimer) clearTimeout(this.a11yTimer);
      this.a11yTimer = setTimeout(() => {
        this.a11yTimer = null;
        this.ui.a11yRequested = true;
        this.scheduleRender();
      }, 700);
    }
  }
  /**
   * Render scan: outline what actually re-rendered, with a running count, and
   * mark the renders a forced full render caused although nothing the
   * component reads changed — the "unnecessary render" React Scan made famous.
   */
  scanCommit(commit, model) {
    const app = this.currentApp();
    if (!can(app, "nodeForInstance")) return;
    const entries = [];
    for (const record of commit.components) {
      if (record.phase === "memo") continue;
      if (entries.length >= 200) break;
      const node = app.nodeForInstance(record.instanceKey);
      if (!node) continue;
      entries.push({
        element: node,
        name: record.name,
        count: model.renderCounts.get(record.instanceKey) ?? 1,
        wasted: record.reason === "full render"
      });
    }
    this.overlay.scanRender(entries);
  }
  markCommit(commit) {
    if (typeof performance === "undefined" || typeof performance.measure !== "function") return;
    try {
      const label = commit.initial ? "aktion: initial mount" : `aktion: commit #${commit.commitId}${commit.changedPaths.length ? ` (${commit.changedPaths.join(", ")})` : ""}`;
      performance.measure(label, { start: commit.startTime, duration: commit.duration });
    } catch {
    }
  }
  /**
   * Break into the debugger when a watched atom changes. The panel cannot pause
   * the runtime, but a `debugger` statement here stops the world inside the
   * state flush, one frame below the write, with the stack that caused it.
   */
  checkBreakOnChange(event) {
    if (this.ui.breakOnChange.size === 0) return;
    const hit = event.changedPaths.find((path) => this.ui.breakOnChange.has(path) || this.ui.breakOnChange.has(rootOf(path)));
    if (!hit) return;
    const value = event.snapshot[rootOf(hit)];
    console.warn(`[aktion-devtools] break on change: $${hit} =`, value);
    debugger;
  }
  /** Remember each distinct program version, so an edit that breaks the app can be undone. */
  recordProgramVersion(appId) {
    const app = this.hook?.apps.get(appId);
    if (!app) return;
    let text2;
    try {
      text2 = app.getProgram();
    } catch {
      return;
    }
    if (text2 === "") return;
    const model = this.ensureModel(appId);
    const last = model.programHistory[model.programHistory.length - 1];
    if (last?.text === text2) return;
    model.programHistory.push({ text: text2, at: Date.now(), lines: text2.split("\n").length });
    if (model.programHistory.length > 30) model.programHistory.shift();
  }
  syncConsoleCapture() {
    if (this.ui.captureConsole && !this.consoleCapture.active) {
      this.consoleCapture.start((entry) => {
        const id = this.selectedAppId;
        if (!id || this.imported.has(id)) return;
        ingestLog(this.ensureModel(id), { ...entry, text: entry.args.join(" "), count: 1 });
        this.scheduleRender();
      });
    } else if (!this.ui.captureConsole && this.consoleCapture.active) {
      this.consoleCapture.stop();
    }
  }
  onVitals() {
    if (!this.ui.minimized) this.scheduleRender();
  }
  /* ---------------------------------------------------------------------- */
  /*  Rendering                                                              */
  /* ---------------------------------------------------------------------- */
  /**
   * Coalesce renders. The first render after a quiet period happens on the next
   * microtask (so a test that flushes microtasks sees it, and a click feels
   * instant); a burst — an effect ticking at 60Hz, a stream of log lines — is
   * throttled to about 20 renders a second so the panel never becomes the
   * bottleneck it is there to find.
   */
  scheduleRender() {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    while (this.renderTimes.length > 0 && now - this.renderTimes[0] > 500) this.renderTimes.shift();
    if (this.renderTimes.length >= 12) {
      this.renderTimer = setTimeout(() => {
        this.renderTimer = null;
        this.renderNow();
      }, 50);
    } else {
      queueMicrotask(() => this.renderNow());
    }
  }
  renderNow() {
    this.renderScheduled = false;
    if (!this.root || !this.isConnected) return;
    this.renderTimes.push(typeof performance !== "undefined" ? performance.now() : Date.now());
    this.syncConsoleCapture();
    this.passCache = /* @__PURE__ */ new Map();
    if (!this.ui.paused) this.droppedWhilePaused = 0;
    this.applyHost();
    const ctx = this.context();
    try {
      render$g(this.frameHost, this.ui.minimized || this.hidden ? null : this.renderFrame(ctx));
    } catch (err) {
      console.error("[aktion-devtools] render failed", err);
      this.renderFallback(err);
    }
    try {
      render$g(this.layerHost, this.renderLayer(ctx));
    } catch (err) {
      console.error("[aktion-devtools] overlay render failed", err);
    }
    try {
      applySideEffects(this.effectState, ctx);
    } catch (err) {
      console.error("[aktion-devtools] side effects failed", err);
    }
    this.applyPagePush();
  }
  renderFallback(err) {
    try {
      render$g(this.frameHost, h(
        "div",
        { class: "dt" },
        this.renderTitlebar(this.context()),
        h(
          "div",
          { class: "empty" },
          h("div", { class: "empty-art" }, icon("bug", { size: 22 })),
          h("div", { class: "empty-title" }, "This view hit an error while rendering."),
          h("div", { class: "empty-body mono" }, String(err instanceof Error ? err.message : err)),
          h(
            "div",
            { class: "empty-actions" },
            h("button", { class: "btn", type: "button", onClick: () => this.selectTab("overview") }, "Back to Overview")
          )
        )
      ));
    } catch {
    }
  }
  buildSkeleton() {
    this.root = this.attachShadow({ mode: "open" });
    const css = [sharedStyles, ...VIEWS.map((view) => view.css ?? "")].join("\n");
    let adopted = false;
    try {
      if (typeof CSSStyleSheet === "function" && "replaceSync" in CSSStyleSheet.prototype) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(css);
        this.root.adoptedStyleSheets = [sheet];
        adopted = true;
      }
    } catch {
      adopted = false;
    }
    if (!adopted) {
      const style = document.createElement("style");
      style.textContent = css;
      this.root.appendChild(style);
    }
    this.frameHost = document.createElement("div");
    this.frameHost.className = "dt-frame-host";
    this.frameHost.style.cssText = "width:100%;height:100%;pointer-events:auto";
    this.layerHost = document.createElement("div");
    this.layerHost.className = "dt-layer";
    this.root.append(this.frameHost, this.layerHost);
    this.tooltips = new TooltipController(this.root, this.layerHost);
    this.root.addEventListener("keydown", (event) => this.onRootKeyDown(event));
    this.applyHost();
  }
  /** Reflect dock, theme, density, and geometry onto the host element. */
  applyHost() {
    const ui = this.ui;
    const theme = ui.theme === "system" ? typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark" : ui.theme;
    ui.light = theme === "light";
    ui.collapsed = ui.minimized;
    this.setAttr("data-theme", theme);
    this.setAttr("data-dock", ui.dock);
    this.setAttr("data-density", ui.compact ? "compact" : "comfortable");
    this.setAttr("data-motion", ui.motion === "system" ? null : ui.motion);
    this.setAttr("data-minimized", ui.minimized || this.hidden ? "" : null);
    const style = this.style;
    style.pointerEvents = "none";
    if (ui.minimized || this.hidden) {
      style.width = "0px";
      style.height = "0px";
      return;
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (ui.dock === "float") {
      const g = this.geometry;
      g.width = clamp(g.width, MIN_W, Math.max(MIN_W, vw - 8));
      g.height = clamp(g.height, MIN_H, Math.max(MIN_H, vh - 8));
      g.left = clamp(g.left, -g.width + 120, vw - 120);
      g.top = clamp(g.top, 0, vh - 40);
      Object.assign(style, { left: `${g.left}px`, top: `${g.top}px`, right: "", bottom: "", width: `${g.width}px`, height: `${g.height}px` });
    } else if (ui.dock === "bottom") {
      const size = clamp(this.dockSizes.bottom, MIN_H - 40, Math.max(MIN_H, vh - 80));
      Object.assign(style, { left: "0px", right: "0px", bottom: "0px", top: "", width: "", height: `${size}px` });
    } else {
      const size = clamp(this.dockSizes[ui.dock], MIN_W - 40, Math.max(MIN_W, vw - 120));
      Object.assign(style, ui.dock === "right" ? { right: "0px", top: "0px", bottom: "0px", left: "", width: `${size}px`, height: "" } : { left: "0px", top: "0px", bottom: "0px", right: "", width: `${size}px`, height: "" });
    }
  }
  setAttr(name, value) {
    if (value === null) {
      if (this.hasAttribute(name)) this.removeAttribute(name);
    } else if (this.getAttribute(name) !== value) {
      this.setAttribute(name, value);
    }
  }
  applyPagePush() {
    const ui = this.ui;
    if (ui.dock === "float" || !ui.pushPage || ui.minimized || this.hidden) {
      this.pagePush.release();
      return;
    }
    this.pagePush.apply(ui.dock, ui.dock === "bottom" ? this.dockSizes.bottom : this.dockSizes[ui.dock]);
  }
  /* ---- the frame ---- */
  currentApp() {
    if (!this.selectedAppId || !this.hook || this.imported.has(this.selectedAppId)) return null;
    return this.hook.apps.get(this.selectedAppId) ?? null;
  }
  currentView() {
    return VIEWS.find((view) => view.id === this.ui.tab) ?? VIEWS[0];
  }
  renderFrame(ctx) {
    const view = this.currentView();
    let body;
    try {
      body = view.render(ctx);
    } catch (err) {
      console.error(`[aktion-devtools] the ${view.label} view failed`, err);
      const message = err instanceof Error ? err.message : String(err);
      body = h(
        "div",
        { class: "empty", "data-dt": "view-error" },
        h("div", { class: "empty-art" }, icon("bug", { size: 22 })),
        h("div", { class: "empty-title" }, `The ${view.label} view hit an error while rendering.`),
        h("div", { class: "empty-body mono" }, message),
        h(
          "div",
          { class: "empty-actions" },
          view.id !== "overview" ? h("button", { class: "btn", type: "button", onClick: () => this.selectTab("overview") }, "Back to Overview") : null,
          h("button", { class: "btn is-ghost", type: "button", onClick: () => {
            void copyText(err instanceof Error && err.stack ? err.stack : message).then((ok) => this.toast(ok ? "Copied the error" : "Copy failed", ok ? "good" : "bad"));
          } }, "Copy error")
        )
      );
    }
    const part = (name, draw, fallback) => {
      try {
        return draw();
      } catch (err) {
        console.error(`[aktion-devtools] the ${name} failed to render`, err);
        return fallback();
      }
    };
    return h(
      "div",
      { class: "dt", role: "region", "aria-label": "Aktion DevTools", "data-dt": "panel" },
      part("title bar", () => this.renderTitlebar(ctx), () => h("header", { class: "dt-titlebar" }, logoMark(18), h("span", { class: "grow" }))),
      h(
        "div",
        { class: "dt-main" },
        part("sidebar", () => this.renderRail(ctx), () => h("nav", { class: "dt-rail", "aria-label": "Sections" })),
        h(
          "main",
          { class: "dt-content", "aria-label": view.label },
          h("div", { class: "dt-view", key: view.id, "data-view": view.id }, body),
          part("notifications", () => this.renderToasts(), () => h("div", { class: "toasts" }))
        )
      ),
      part("status bar", () => this.renderStatusBar(ctx), () => h("footer", { class: "dt-statusbar", "data-dt": "statusbar" })),
      ...this.renderEdges()
    );
  }
  renderTitlebar(ctx) {
    const view = this.currentView();
    const app = ctx.app;
    const importedSession = this.selectedAppId ? this.imported.get(this.selectedAppId) : void 0;
    const label = importedSession?.label ?? app?.label ?? "No app";
    const health = this.health(ctx);
    const picking = this.overlay.isPicking;
    return h(
      "header",
      {
        class: "dt-titlebar",
        "data-dt": "titlebar",
        onPointerDown: (event) => this.beginMove(event),
        onDblClick: (event) => {
          if (event.target.closest("button, input, select")) return;
          this.toggleMaximize();
        }
      },
      h("div", { class: "dt-brand" }, logoMark(18), ctx.width() > 640 ? h("span", { class: "dt-brand-name" }, "Aktion ", h("span", {}, "DevTools")) : null),
      h("span", { class: "dt-sep-v", "aria-hidden": "true" }),
      h(
        "button",
        {
          type: "button",
          class: "dt-appswitch",
          "data-dt": "app-switch",
          "data-tip": "Inspected app — click to switch",
          "aria-haspopup": "menu",
          onClick: (event) => this.openAppMenu(event)
        },
        h("span", { class: ["dt-status-dot", `t-${health.tone}`, app ? "is-live" : ""] }),
        h("span", { class: "label" }, label),
        icon("chevronDown", { size: 12 })
      ),
      h(
        "div",
        { class: "dt-crumb" },
        icon(view.icon, { size: 14 }),
        h("span", { class: "dt-crumb-title" }, view.label),
        ctx.width() > 1e3 ? h("span", { class: "dt-crumb-hint" }, `· ${view.hint}`) : null
      ),
      h("span", { class: "grow" }),
      h("button", {
        type: "button",
        class: ["ibtn", picking ? "is-on" : ""],
        "aria-label": picking ? "Cancel element picker" : "Pick an element on the page",
        "data-tip": picking ? "Cancel picker" : "Pick an element",
        "data-kbd": "⇧ ⌥ C",
        "data-dt": "pick",
        "aria-pressed": picking,
        onClick: () => this.togglePicker()
      }, icon("pick", { size: 16 })),
      h(
        "button",
        {
          type: "button",
          class: ["dt-rec", this.ui.paused ? "is-paused" : ""],
          "data-dt": "record",
          "data-tip": this.ui.paused ? `Paused${this.droppedWhilePaused ? ` — ${this.droppedWhilePaused} events ignored` : ""}. Click to resume.` : "Recording runtime events — click to pause",
          "aria-pressed": !this.ui.paused,
          onClick: () => this.togglePause()
        },
        h("span", { class: "rec-dot" }),
        this.ui.paused ? this.droppedWhilePaused ? `Paused · ${this.droppedWhilePaused}` : "Paused" : "Live"
      ),
      ctx.width() > 720 ? h("button", {
        type: "button",
        class: "dt-cmdk",
        "data-dt": "open-palette",
        "aria-label": "Open the command palette",
        onClick: () => this.openPalette()
      }, icon("search", { size: 13 }), h("span", { class: "grow" }, "Search or run a command…"), keys("⌘ K")) : h("button", { type: "button", class: "ibtn", "aria-label": "Command palette", "data-tip": "Command palette", "data-kbd": "⌘ K", onClick: () => this.openPalette() }, icon("command", { size: 15 })),
      h("span", { class: "dt-sep-v", "aria-hidden": "true" }),
      h("button", {
        type: "button",
        class: "ibtn",
        "aria-label": "Panel theme",
        "data-tip": `Theme: ${this.ui.theme}`,
        "data-dt": "theme-toggle",
        onClick: () => {
          const next = this.ui.theme === "dark" ? "light" : this.ui.theme === "light" ? "system" : "dark";
          this.ui.theme = next;
          this.persist();
          this.toast(`Panel theme: ${next}`);
          this.scheduleRender();
        }
      }, icon(this.ui.light ? "sun" : "moon", { size: 15 })),
      h("button", {
        type: "button",
        class: "ibtn",
        "aria-label": "Dock position",
        "data-tip": `Dock: ${this.ui.dock}`,
        "data-dt": "dock-menu",
        "aria-haspopup": "menu",
        onClick: (event) => this.openDockMenu(event)
      }, icon(this.ui.dock === "float" ? "dockFloat" : this.ui.dock === "right" ? "dockRight" : this.ui.dock === "left" ? "dockLeft" : "dockBottom", { size: 15 })),
      h("button", {
        type: "button",
        class: "ibtn",
        "aria-label": "Minimise to the launcher",
        "data-tip": "Minimise",
        "data-kbd": "⇧ ⌥ D",
        "data-dt": "minimize",
        onClick: () => this.close()
      }, icon("minus", { size: 15 }))
    );
  }
  renderRail(ctx) {
    const items = [];
    let group = "";
    const main = VIEWS.filter((view) => view.group !== "system");
    main.forEach((view, index) => {
      if (view.group !== group) {
        if (group !== "") items.push(h("div", { key: `sep-${view.group}`, class: "dt-rail-sep", role: "separator" }));
        group = view.group;
        const label = GROUP_LABELS[view.group];
        if (label && this.ui.railWide) items.push(h("div", { key: `lbl-${view.group}`, class: "dt-rail-label" }, label));
      }
      items.push(this.railItem(ctx, view, index < 9 ? `⌥ ${index + 1}` : void 0));
    });
    items.push(h("div", { key: "spacer", class: "dt-rail-spacer" }));
    for (const view of VIEWS.filter((v) => v.group === "system")) items.push(this.railItem(ctx, view));
    items.push(h("button", {
      key: "rail-toggle",
      type: "button",
      class: "dt-rail-item",
      "aria-label": this.ui.railWide ? "Collapse the sidebar" : "Expand the sidebar",
      "data-tip": this.ui.railWide ? "Collapse sidebar" : "Show labels",
      onClick: () => {
        this.ui.railWide = !this.ui.railWide;
        this.persist();
        this.scheduleRender();
      }
    }, icon(this.ui.railWide ? "chevronLeft" : "chevronRight", { size: 15 }), h("span", { class: "name" }, "Collapse")));
    return h("nav", { class: ["dt-rail", this.ui.railWide ? "is-wide" : ""], "aria-label": "Sections", role: "tablist", "aria-orientation": "vertical" }, ...items);
  }
  railItem(ctx, view, shortcut) {
    let badge = null;
    try {
      badge = view.badge?.(ctx) ?? null;
    } catch {
      badge = null;
    }
    const active = this.ui.tab === view.id;
    return h(
      "button",
      {
        key: view.id,
        type: "button",
        role: "tab",
        class: ["dt-rail-item", active ? "is-active" : ""],
        "aria-selected": active,
        "aria-label": `${view.label}${badge ? ` (${badge.value})` : ""}`,
        "data-tip": this.ui.railWide ? void 0 : `${view.label} — ${view.hint}`,
        "data-kbd": this.ui.railWide ? void 0 : shortcut,
        "data-tab": view.id,
        "data-dt": `rail-${view.id}`,
        onClick: () => this.selectTab(view.id)
      },
      icon(view.icon, { size: 17 }),
      h("span", { class: "name" }, view.label),
      badge && badge.value !== 0 && badge.value !== "" ? h("span", { class: ["dt-rail-badge", badge.tone && badge.tone !== "grey" ? `t-${badge.tone}` : ""] }, typeof badge.value === "number" && badge.value > 99 ? "99+" : String(badge.value)) : null
    );
  }
  /** Overall health for the status dot and launcher: errors → red, warnings → amber. */
  health(ctx) {
    const model = ctx.model;
    if (!ctx.app && !this.imported.has(this.selectedAppId ?? "")) return { tone: "grey", errors: 0, warnings: 0 };
    return ctx.cache("health", () => {
      let errors = model.errors.length;
      let warnings = 0;
      for (const log of model.logs) {
        if (log.level === "error") errors += log.count;
        else if (log.level === "warn") warnings += log.count;
      }
      let failed = 0;
      for (const request of model.network) {
        if (request.phase === "error" || request.phase === "blocked" || (request.status ?? 0) >= 500) failed += 1;
      }
      const diagnostics = can(ctx.app, "getDiagnostics") ? ctx.app.getDiagnostics().filter((d) => d.severity === "error").length : 0;
      errors += diagnostics;
      const tone = errors + failed > 0 ? "red" : warnings > 0 ? "amber" : "green";
      return { tone, errors: errors + failed, warnings };
    });
  }
  renderStatusBar(ctx) {
    const model = ctx.model;
    const vitals = ctx.vitals;
    const health = this.health(ctx);
    const last = model.commits[model.commits.length - 1];
    const pending = ctx.cache("pending", () => model.network.filter((r) => r.phase === "pending").length);
    const fps = vitals.fps;
    const fpsTone = fps === null ? "" : fps >= 55 ? "t-green" : fps >= 30 ? "t-amber" : "t-red";
    const inp = vitals.inp;
    const inpRating = rate("inp", inp?.value);
    const panelWidth = ctx.width() + (this.ui.railWide ? 176 : 46);
    const roomy = panelWidth >= 680;
    const item = (content, options = {}) => h(options.onClick ? "button" : "span", {
      type: options.onClick ? "button" : void 0,
      class: ["dt-sb-item", options.tone ?? ""],
      "data-tip": options.tip,
      "data-dt": options.testid,
      onClick: options.onClick
    }, ...content);
    return h(
      "footer",
      { class: "dt-statusbar", "data-dt": "statusbar", role: "status", "aria-live": "off" },
      item([icon("zap", { size: 11 }), h("b", {}, String(model.totals.commits)), h("span", {}, "commits"), last ? [h("span", { class: "t4" }, "·"), h("b", {}, fmtMs(last.duration))] : null], {
        tip: "Commits this session · last commit duration",
        onClick: () => this.selectTab("profiler"),
        testid: "sb-commits"
      }),
      fps !== null ? item([icon("activity", { size: 11 }), h("b", {}, String(fps)), h("span", {}, "fps")], { tip: `Frame rate (${vitals.droppedFrames} long frames)`, tone: fpsTone, onClick: () => {
        this.ui.profilerView = "vitals";
        this.selectTab("profiler");
      } }) : null,
      inp ? item([h("span", {}, "INP"), h("b", {}, fmtMs(inp.value))], { tip: `Interaction to Next Paint — ${inpRating.replace("-", " ")}`, tone: inpRating === "good" ? "t-green" : inpRating === "poor" ? "t-red" : "t-amber", onClick: () => {
        this.ui.profilerView = "vitals";
        this.selectTab("profiler");
      } }) : null,
      item([icon("network", { size: 11 }), h("b", {}, String(model.totals.network)), pending > 0 ? [h("span", { class: "t4" }, "·"), h("b", {}, String(pending)), h("span", {}, "pending")] : h("span", {}, "requests")], {
        tip: "HTTP requests this session",
        onClick: () => this.selectTab("network")
      }),
      vitals.heap && panelWidth >= 560 ? item([icon("cpu", { size: 11 }), h("b", {}, fmtBytes(vitals.heap.used))], { tip: "JS heap in use (whole page)" }) : null,
      h("span", { class: "grow" }),
      health.errors > 0 ? item([icon("error", { size: 11 }), h("b", {}, String(health.errors))], { tip: "Errors — open the Console", tone: "t-red", onClick: () => {
        this.ui.logLevels = /* @__PURE__ */ new Set(["error"]);
        this.selectTab("console");
      }, testid: "sb-errors" }) : null,
      health.warnings > 0 ? item([icon("warning", { size: 11 }), h("b", {}, String(health.warnings))], { tip: "Warnings — open the Console", tone: "t-amber", onClick: () => {
        this.ui.logLevels = /* @__PURE__ */ new Set(["warn"]);
        this.selectTab("console");
      } }) : null,
      this.recorder.isRecording ? item([h("span", { class: "rec-dot", style: { width: "7px", height: "7px", borderRadius: "50%", background: "var(--dt-red)" } }), h("span", {}, "Recording test")], { tone: "t-red", onClick: () => {
        this.ui.testPane = "record";
        this.selectTab("test");
      } }) : null,
      roomy || health.errors === 0 && health.warnings === 0 && !this.recorder.isRecording ? item(roomy ? [h("span", {}, `Aktion ${ctx.hook.libraryVersion}`), h("span", { class: "t4" }, "·"), h("span", {}, `protocol ${ctx.hook.protocolVersion}`)] : [h("span", {}, `v${ctx.hook.libraryVersion}`)], { tip: `Aktion ${ctx.hook.libraryVersion} · DevTools protocol ${ctx.hook.protocolVersion}` }) : null
    );
  }
  renderEdges() {
    const dock = this.ui.dock;
    const edges = dock === "float" ? ["n", "s", "e", "w", "ne", "nw", "se", "sw"] : dock === "right" ? ["w"] : dock === "left" ? ["e"] : ["n"];
    return edges.map((edge) => h("div", {
      key: `edge-${edge}`,
      class: ["dt-edge", edge],
      "aria-hidden": "true",
      onPointerDown: (event) => this.beginResize(event, edge)
    }));
  }
  renderToasts() {
    return h(
      "div",
      { class: "toasts", role: "status", "aria-live": "polite", "data-dt": "toasts" },
      ...this.ui.toasts.map((toast) => h(
        "div",
        { key: toast.id, class: ["toast", `t-${toast.tone}`] },
        icon(toast.tone === "good" ? "checkCircle" : toast.tone === "bad" ? "error" : toast.tone === "warn" ? "warning" : "info", { size: 14 }),
        h("span", { class: "grow" }, toast.message),
        toast.action ? h("button", { type: "button", class: "btn is-sm toast-action", onClick: () => {
          toast.action.run();
          this.dismissToast(toast.id);
        } }, toast.action.label) : null,
        h("button", { type: "button", class: "ibtn is-sm", "aria-label": "Dismiss", onClick: () => this.dismissToast(toast.id) }, icon("close", { size: 11 }))
      ))
    );
  }
  /* ---- floating layer: launcher, palette, menus, dialogs ---- */
  renderLayer(ctx) {
    const out = [];
    if ((this.ui.minimized || this.hidden) && this.ui.showLauncher) out.push(this.renderLauncher(ctx));
    if (this.ui.paletteOpen && !this.ui.minimized) {
      out.push(h("div", { key: "palette" }, paletteView({
        query: this.ui.paletteQuery,
        index: this.ui.paletteIndex,
        commands: this.paletteCommands(ctx),
        onQuery: (query) => {
          this.ui.paletteQuery = query;
          this.ui.paletteIndex = 0;
          this.scheduleRender();
        },
        onIndex: (index) => {
          this.ui.paletteIndex = index;
          this.scheduleRender();
        },
        onRun: (command) => this.runCommand(command),
        onClose: () => this.closePalette()
      })));
    }
    if (this.ui.shortcutsOpen && !this.ui.minimized) out.push(this.renderShortcuts());
    if (this.ui.dialog && !this.ui.minimized) out.push(this.renderDialog(this.ui.dialog));
    if (this.ui.menu) out.push(this.renderMenu());
    return out;
  }
  renderLauncher(ctx) {
    const health = this.health(ctx);
    return h(
      "button",
      {
        key: "launcher",
        type: "button",
        class: "dt-launcher",
        "data-dt": "launcher",
        "aria-label": "Open Aktion DevTools",
        "data-tip": "Open DevTools",
        "data-kbd": "⇧ ⌥ D",
        style: { right: `${this.launcherPos.right}px`, bottom: `${this.launcherPos.bottom}px` },
        onPointerDown: (event) => this.beginLauncherDrag(event),
        // `click`, not only pointer tracking: keyboard activation and screen
        // readers dispatch a click, never a pointer sequence.
        onClick: () => {
          if (this.suppressLauncherClick) {
            this.suppressLauncherClick = false;
            return;
          }
          this.open();
        },
        onContextMenu: (event) => {
          event.preventDefault();
          this.openMenu(event, [
            { label: "Open DevTools", icon: "panel", run: () => this.open() },
            { label: "Pick an element", icon: "pick", kbd: "⇧⌥C", run: () => {
              this.open();
              this.togglePicker();
            } },
            { kind: "separator", label: "" },
            { label: "Hide the launcher", icon: "eyeOff", run: () => {
              this.ui.showLauncher = false;
              this.persist();
              this.toast("Launcher hidden — Shift+Alt+D reopens DevTools");
            } }
          ]);
        }
      },
      logoMark(20),
      h("span", {}, "DevTools"),
      health.errors > 0 ? h("span", { class: "count t-red" }, icon("error", { size: 12 }), String(health.errors)) : null,
      health.errors === 0 && health.warnings > 0 ? h("span", { class: "count t-amber" }, icon("warning", { size: 12 }), String(health.warnings)) : null,
      this.recorder.isRecording ? h("span", { class: "count t-red" }, icon("record", { size: 10 }), "REC") : null
    );
  }
  renderShortcuts() {
    return h(
      "div",
      {
        key: "shortcuts",
        class: "scrim",
        "data-dt": "shortcuts",
        onPointerDown: (event) => {
          if (event.target === event.currentTarget) {
            this.ui.shortcutsOpen = false;
            this.scheduleRender();
          }
        }
      },
      h(
        "div",
        { class: "dialog", role: "dialog", "aria-modal": "true", "aria-label": "Keyboard shortcuts", style: { width: "min(640px, calc(100vw - 32px))" } },
        h(
          "div",
          { class: "dialog-head" },
          icon("keyboard", { size: 18 }),
          h("div", { class: "dialog-title" }, "Keyboard shortcuts"),
          h("span", { class: "grow" }),
          h("button", { type: "button", class: "ibtn", "aria-label": "Close", ref: autofocus(), onClick: () => {
            this.ui.shortcutsOpen = false;
            this.scheduleRender();
          } }, icon("close", { size: 15 }))
        ),
        h(
          "div",
          { class: "dialog-body" },
          h(
            "div",
            { class: "shortcut-grid" },
            ...SHORTCUT_GROUPS.flatMap((group) => [
              h("div", { class: "shortcut-group" }, group.title),
              ...group.items.flatMap(([combo, what]) => [
                h("span", {}, what),
                h("span", { class: "keys" }, ...combo.split(/\s{2,}/).map((part, i) => [i > 0 ? h("span", { class: "t3" }, " or ") : null, keys(part)]))
              ])
            ])
          )
        )
      )
    );
  }
  renderDialog(dialog) {
    const close = () => this.closeDialog();
    return h(
      "div",
      {
        key: "dialog",
        class: "scrim",
        "data-dt": "dialog",
        onPointerDown: (event) => {
          if (event.target === event.currentTarget) close();
        },
        onKeyDown: (event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            close();
          }
        }
      },
      h(
        "div",
        { class: "dialog", role: "dialog", "aria-modal": "true", "aria-label": dialog.title, style: dialog.width ? { width: `min(${dialog.width}px, calc(100vw - 32px))` } : void 0 },
        h(
          "div",
          { class: "dialog-head" },
          dialog.icon ? icon(dialog.icon, { size: 18 }) : null,
          h("div", { class: "dialog-title" }, dialog.title),
          h("span", { class: "grow" }),
          h("button", { type: "button", class: "ibtn", "aria-label": "Close", onClick: close }, icon("close", { size: 15 }))
        ),
        h("div", { class: "dialog-body" }, dialog.body()),
        dialog.actions ? h("div", { class: "dialog-foot" }, ...dialog.actions()) : null
      )
    );
  }
  renderMenu() {
    const menu = this.ui.menu;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const estimatedHeight = menu.items.length * 29 + 12;
    const left = Math.max(6, Math.min(menu.x, vw - 236));
    const top = menu.y + estimatedHeight > vh - 6 ? Math.max(6, vh - estimatedHeight - 6) : menu.y;
    const actionable = menu.items.filter((item) => (item.kind ?? "item") === "item" && !item.disabled);
    return h(
      "div",
      {
        key: "menu",
        class: "menu",
        role: "menu",
        "data-dt": "menu",
        style: { left: `${left}px`, top: `${top}px` },
        onKeyDown: (event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const delta = event.key === "ArrowDown" ? 1 : -1;
            menu.index = (menu.index + delta + actionable.length) % Math.max(1, actionable.length);
            this.scheduleRender();
          } else if (event.key === "Enter") {
            event.preventDefault();
            const item = actionable[menu.index];
            if (item) {
              this.closeMenu();
              item.run?.();
            }
          } else if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            this.closeMenu();
          }
        }
      },
      ...menu.items.map((item, i) => {
        if (item.kind === "separator") return h("div", { key: `sep${i}`, class: "menu-sep", role: "separator" });
        if (item.kind === "label") return h("div", { key: `lbl${i}`, class: "menu-label" }, item.label);
        const index = actionable.indexOf(item);
        return h(
          "button",
          {
            key: `item${i}`,
            type: "button",
            role: item.checked !== void 0 ? "menuitemradio" : "menuitem",
            "aria-checked": item.checked,
            class: ["menu-item", item.danger ? "is-danger" : "", index === menu.index ? "is-active" : "", item.checked ? "is-checked" : ""],
            disabled: item.disabled || void 0,
            ref: index === 0 ? autofocus() : void 0,
            onMouseEnter: () => {
              if (menu.index !== index) {
                menu.index = index;
                this.scheduleRender();
              }
            },
            onClick: () => {
              this.closeMenu();
              item.run?.();
            }
          },
          item.icon ? icon(item.icon, { size: 14 }) : h("span", { style: { width: "14px" } }),
          h("span", { class: "grow" }, item.label),
          item.kbd ? h("span", { class: "menu-kbd" }, item.kbd) : null
        );
      })
    );
  }
  /* ---------------------------------------------------------------------- */
  /*  Context                                                                */
  /* ---------------------------------------------------------------------- */
  context() {
    const app = this.currentApp();
    const model = this.getModel() ?? emptyModel();
    const hook = this.hook ?? installDevtoolsHook();
    const self = this;
    return {
      app,
      model,
      hook,
      ui: this.ui,
      overlay: this.overlay,
      recorder: this.recorder,
      vitals: this.vitals.snapshot(),
      cspViolations: this.cspViolations,
      epochOffset: this.epochOffset,
      imported: this.selectedAppId !== null && this.imported.has(this.selectedAppId),
      rowHeight: this.ui.compact ? 22 : 26,
      cache: (key2, compute) => {
        if (this.passCache.has(key2)) return this.passCache.get(key2);
        const value = compute();
        this.passCache.set(key2, value);
        return value;
      },
      memo: (key2, deps, compute) => {
        const entry = this.memoCache.get(key2);
        if (entry && entry.deps.length === deps.length && entry.deps.every((dep, i) => Object.is(dep, deps[i]))) return entry.value;
        const value = compute();
        this.memoCache.set(key2, { deps: [...deps], value });
        return value;
      },
      width: () => {
        const rect = this.getBoundingClientRect();
        return rect.width > 0 ? rect.width - (this.ui.railWide ? 176 : 46) : this.ui.dock === "float" ? this.geometry.width : 900;
      },
      height: () => {
        const rect = this.getBoundingClientRect();
        return rect.height > 0 ? rect.height : this.geometry.height;
      },
      now: () => typeof performance !== "undefined" ? performance.now() : Date.now(),
      refresh: () => this.scheduleRender(),
      selectTab: (tab) => this.selectTab(tab),
      selectInstance: (instanceKey, options) => {
        this.ui.selectedInstance = instanceKey;
        this.ui.selectedElement = null;
        if (instanceKey) {
          this.highlightInstance(instanceKey, true);
          if (options?.reveal !== false) this.revealInInspect(instanceKey);
        }
        this.scheduleRender();
      },
      toast: (message, tone = "info", options) => this.toast(message, tone, options),
      highlightInstance: (instanceKey, pin) => this.highlightInstance(instanceKey, pin ?? false),
      highlightElement: (element, label, pin) => {
        if (!element) {
          if (pin) this.overlay.unpin();
          this.overlay.hideHover();
        } else {
          this.overlay.highlight(element, label ?? {}, pin ?? false);
        }
      },
      togglePicker: () => this.togglePicker(),
      openPalette: (query) => this.openPalette(query),
      openMenu: (at, items) => this.openMenu(at, items),
      openDialog: (dialog) => {
        this.ui.dialog = dialog;
        this.scheduleRender();
      },
      closeDialog: () => this.closeDialog(),
      editJson: (options) => this.editJson(options),
      copy: (text2, what) => {
        void copyText(text2).then((ok) => self.toast(ok ? `Copied${what ? ` ${what}` : ""}` : "Copy failed — the page blocked clipboard access", ok ? "good" : "bad"));
      },
      persist: () => this.persist(),
      recordedSteps: () => this.recorder.list(),
      pushRules: () => this.pushRules(),
      panel: {
        setDock: (dock) => this.setDock(dock),
        setHighlightUpdates: (on) => this.setHighlightUpdates(on),
        clearSession: () => this.clearSession(),
        exportSession: () => this.exportSession(),
        importSession: () => this.promptImport(),
        copyBugReport: () => this.copyBugReport(),
        showShortcuts: () => {
          this.ui.shortcutsOpen = true;
          this.scheduleRender();
        },
        resetPreferences: () => this.resetPreferences()
      }
    };
  }
  /** Forget stored preferences; keep what the session is looking at. */
  resetPreferences() {
    try {
      globalThis.localStorage?.removeItem("aktion-devtools-ui");
    } catch {
    }
    const fresh = defaultUiState();
    const ui = this.ui;
    for (const key2 of ["theme", "compact", "motion", "railWide", "showLauncher", "pushPage", "captureConsole", "highlightUpdates", "perfMarks", "flashOnCommit", "tipsDismissed", "testFormat", "sizes"]) {
      ui[key2] = fresh[key2];
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    this.dockSizes.right = Math.round(clamp(vw * 0.42, 420, 760));
    this.dockSizes.left = Math.round(clamp(vw * 0.42, 420, 760));
    this.dockSizes.bottom = Math.round(clamp(vh * 0.42, 280, 560));
    this.setDock(fresh.dock);
    this.persist();
    this.toast("Preferences reset to defaults", "good");
    this.scheduleRender();
  }
  /** Push user rules + the throttling preset to the app. */
  pushRules() {
    const app = this.currentApp();
    if (!can(app, "setNetworkRules")) return;
    const throttle = THROTTLE_RULES[this.ui.throttle] ?? [];
    const rules = [...this.ui.rules, ...throttle];
    app.setNetworkRules(rules);
  }
  highlightInstance(instanceKey, pin) {
    if (!instanceKey) {
      this.overlay.hideHover();
      return;
    }
    const app = this.currentApp();
    const node = can(app, "nodeForInstance") ? app.nodeForInstance(instanceKey) : null;
    if (!node) {
      this.overlay.hideHover();
      return;
    }
    this.overlay.highlight(node, { component: componentNameFromKey(instanceKey) }, pin);
  }
  /**
   * Open the Inspector on an instance and make sure its row is visible — it may
   * be inside a collapsed branch, excluded by the filter, or a library component
   * while the Library toggle is off. Clear all three and say which were cleared.
   */
  revealInInspect(instanceKey) {
    this.ui.tab = "inspect";
    for (const ancestor of ancestorKeyCandidates(instanceKey)) this.ui.inspectCollapsed.delete(ancestor);
    const cleared = [];
    const name = componentNameFromKey(instanceKey);
    const filter = this.ui.inspectFilter.trim().toLowerCase();
    if (filter !== "" && !name.toLowerCase().includes(filter)) {
      this.ui.inspectFilter = "";
      cleared.push("filter");
    }
    if (!this.ui.inspectShowLibrary && instanceKey.lastIndexOf("#") > 0) {
      this.ui.inspectShowLibrary = true;
      cleared.push("library filter");
    }
    if (cleared.length > 0) this.toast(`Cleared the ${cleared.join(" and ")} to show ${name}`);
    this.ui.inspectReveal = instanceKey;
  }
  /* ---------------------------------------------------------------------- */
  /*  Commands, palette, menus, dialogs, toasts                              */
  /* ---------------------------------------------------------------------- */
  toast(message, tone = "info", options = {}) {
    const id = this.toastSeq += 1;
    const entry = { id, message, tone, action: options.action, at: Date.now() };
    this.ui.toasts = [...this.ui.toasts.slice(-2), entry];
    this.ui.toast = { message, tone, at: entry.at };
    const timer = setTimeout(() => this.dismissToast(id), options.duration ?? (tone === "bad" ? TOAST_MS * 1.6 : options.action ? TOAST_MS * 2 : TOAST_MS));
    this.toastTimers.set(id, timer);
    this.scheduleRender();
  }
  dismissToast(id) {
    const timer = this.toastTimers.get(id);
    if (timer) clearTimeout(timer);
    this.toastTimers.delete(id);
    this.ui.toasts = this.ui.toasts.filter((toast) => toast.id !== id);
    if (this.ui.toasts.length === 0) this.ui.toast = null;
    this.scheduleRender();
  }
  openPalette(query = "") {
    this.ui.paletteOpen = true;
    this.ui.shortcutsOpen = false;
    this.ui.menu = null;
    this.ui.paletteQuery = query;
    this.ui.paletteIndex = 0;
    if (this.ui.minimized) this.setMinimized(false);
    this.scheduleRender();
  }
  closePalette() {
    this.ui.paletteOpen = false;
    this.ui.paletteQuery = "";
    this.ui.paletteIndex = 0;
    this.scheduleRender();
  }
  runCommand(command) {
    this.closePalette();
    const recent = this.recentCommands.indexOf(command.id);
    if (recent >= 0) this.recentCommands.splice(recent, 1);
    this.recentCommands.unshift(command.id);
    this.recentCommands.length = Math.min(this.recentCommands.length, 6);
    try {
      command.run();
    } catch (err) {
      this.toast(`Command failed: ${err instanceof Error ? err.message : String(err)}`, "bad");
    }
    this.scheduleRender();
  }
  /** Every command the palette offers right now. */
  paletteCommands(ctx) {
    const commands = [];
    const ui = this.ui;
    VIEWS.forEach((view, index) => {
      commands.push({
        id: `go:${view.id}`,
        group: "Go to",
        label: view.label,
        keywords: `${view.hint} ${view.keywords}`,
        icon: view.icon,
        hint: index < 9 ? `⌥${index + 1}` : void 0,
        run: () => this.selectTab(view.id)
      });
    });
    for (const view of VIEWS) {
      let contributed = [];
      try {
        contributed = view.commands?.(ctx) ?? [];
      } catch {
        contributed = [];
      }
      for (const command of contributed) {
        commands.push({ ...command, id: `${view.id}:${command.id}`, group: view.label, icon: command.icon ?? view.icon });
      }
    }
    const panel = (id, label, run, options = {}) => {
      commands.push({ id: `panel:${id}`, group: "Panel", label, run, keywords: options.keywords, icon: options.icon ?? "panel", hint: options.hint });
    };
    commands.push({ id: "panel:pick", group: "Inspector", label: this.overlay.isPicking ? "Cancel element picker" : "Pick an element on the page", keywords: "select click crosshair find component inspect", icon: "pick", hint: "⇧⌥C", run: () => this.togglePicker() });
    commands.push({ id: "panel:scan", group: "Performance", label: ui.highlightUpdates ? "Stop highlighting re-renders" : "Highlight re-renders on the page", keywords: "render scan flash outline updates paint why slow", icon: "scan", run: () => this.setHighlightUpdates(!ui.highlightUpdates) });
    panel("pause", ui.paused ? "Resume recording events" : "Pause recording events", () => this.togglePause(), { keywords: "freeze stop capture live", icon: ui.paused ? "play" : "pause" });
    panel("clear", "Clear captured data", () => this.clearSession(), { keywords: "reset empty commits events logs session", icon: "trash" });
    panel("export", "Export the session (JSON)", () => this.exportSession(), { keywords: "download save share bug report attach", icon: "download" });
    panel("import", "Import a session file…", () => this.promptImport(), { keywords: "load open offline replay qa", icon: "upload" });
    panel("bug", "Copy a bug report (Markdown)", () => this.copyBugReport(), { keywords: "ticket jira issue qa reproduce", icon: "bug" });
    for (const dock of DOCK_ORDER) panel(`dock-${dock}`, `Dock ${dock === "float" ? "as a floating window" : `to the ${dock}`}`, () => this.setDock(dock), { keywords: "layout position move", icon: dock === "float" ? "dockFloat" : dock === "right" ? "dockRight" : dock === "left" ? "dockLeft" : "dockBottom" });
    panel("theme-dark", "Use the dark panel theme", () => {
      ui.theme = "dark";
      this.persist();
      this.scheduleRender();
    }, { keywords: "appearance colour", icon: "moon" });
    panel("theme-light", "Use the light panel theme", () => {
      ui.theme = "light";
      this.persist();
      this.scheduleRender();
    }, { keywords: "appearance colour", icon: "sun" });
    panel("theme-system", "Follow the system theme", () => {
      ui.theme = "system";
      this.persist();
      this.scheduleRender();
    }, { keywords: "appearance auto", icon: "contrast" });
    panel("density", ui.compact ? "Use comfortable rows" : "Use compact rows", () => {
      ui.compact = !ui.compact;
      this.persist();
      this.scheduleRender();
    }, { keywords: "density small rows spacing", icon: "list" });
    panel("rail", ui.railWide ? "Collapse the sidebar" : "Show sidebar labels", () => {
      ui.railWide = !ui.railWide;
      this.persist();
      this.scheduleRender();
    }, { keywords: "navigation labels", icon: "panel" });
    panel("shortcuts", "Show keyboard shortcuts", () => {
      ui.shortcutsOpen = true;
      this.scheduleRender();
    }, { keywords: "keys help bindings", icon: "keyboard", hint: "?" });
    panel("minimize", "Minimise to the launcher", () => this.close(), { keywords: "hide close collapse", icon: "minus", hint: "⇧⌥D" });
    const app = ctx.app;
    if (app) {
      commands.push({ id: "app:force", group: "App", label: "Force a full re-render", keywords: "repaint refresh redraw", icon: "refresh", run: () => {
        app.forceRender();
        this.toast("Full re-render requested");
      } });
      if (can(app, "reload")) commands.push({ id: "app:reload", group: "App", label: "Re-plan the program", keywords: "reload hot restart", icon: "replay", run: () => {
        app.reload();
        this.toast("Program re-planned");
      } });
      if (can(app, "getComponentTree")) {
        const tree = ctx.cache("tree", () => app.getComponentTree());
        const seen = /* @__PURE__ */ new Set();
        for (const node of tree) {
          if (node.kind !== "user" && seen.size > 150) continue;
          if (seen.has(node.name) && node.kind === "library") continue;
          seen.add(node.name);
          commands.push({
            id: `component:${node.instanceKey}`,
            group: "Components",
            label: `Inspect ${node.name}`,
            keywords: `${node.kind} component ${node.explicitKey ?? ""}`,
            icon: node.kind === "user" ? "puzzle" : "box",
            run: () => ctx.selectInstance(node.instanceKey)
          });
          if (commands.length > 700) break;
        }
      }
      for (const name of Object.keys(ctx.model.state).slice(0, 200)) {
        commands.push({ id: `atom:${name}`, group: "State", label: `$${name}`, keywords: "atom state value edit", icon: "state", run: () => {
          ui.stateFilter = name;
          ui.stateSelected = name;
          this.selectTab("state");
        } });
      }
      if (can(app, "getRoute") && can(app, "navigate")) {
        try {
          for (const pattern of app.getRoute().declared) {
            if (pattern.includes(":") || pattern.includes("*")) continue;
            commands.push({ id: `route:${pattern}`, group: "Routes", label: `Navigate to ${pattern}`, keywords: "route go path", icon: "routes", run: () => {
              app.navigate(pattern);
              this.toast(`Navigated to ${pattern}`);
            } });
          }
        } catch {
        }
      }
    }
    if (ui.paletteQuery.trim() === "" && this.recentCommands.length > 0) {
      const byId = new Map(commands.map((command) => [command.id, command]));
      const recent = this.recentCommands.map((id) => byId.get(id)).filter((c) => c !== void 0).map((c) => ({ ...c, id: `recent:${c.id}`, group: "Recent" }));
      return [...recent, ...commands];
    }
    return commands;
  }
  openMenu(at, items) {
    let x = 0;
    let y = 0;
    if (at instanceof Element) {
      const rect = at.getBoundingClientRect();
      x = rect.left;
      y = rect.bottom + 4;
    } else if ("currentTarget" in at && at.currentTarget instanceof Element && at.type !== "contextmenu") {
      const rect = at.currentTarget.getBoundingClientRect();
      x = rect.left;
      y = rect.bottom + 4;
    } else {
      x = at.x ?? at.clientX;
      y = at.y ?? at.clientY;
      if (at instanceof MouseEvent) {
        x = at.clientX;
        y = at.clientY;
      }
    }
    this.ui.menu = { x, y, items, index: 0 };
    this.scheduleRender();
  }
  closeMenu() {
    if (!this.ui.menu) return;
    this.ui.menu = null;
    this.scheduleRender();
  }
  closeDialog() {
    const dialog = this.ui.dialog;
    this.ui.dialog = null;
    dialog?.onClose?.();
    this.scheduleRender();
  }
  editJson(options) {
    let text2;
    try {
      text2 = JSON.stringify(options.value, null, 2) ?? "null";
    } catch {
      text2 = String(options.value);
    }
    const draft = { text: text2, error: null };
    const validate = () => {
      try {
        const parsed2 = JSON.parse(draft.text);
        draft.error = null;
        return parsed2;
      } catch (err) {
        draft.error = err instanceof Error ? err.message : String(err);
        return void 0;
      }
    };
    const save = () => {
      const parsed2 = validate();
      if (draft.error) {
        this.toast(`Not valid JSON: ${draft.error}`, "bad");
        this.scheduleRender();
        return;
      }
      options.onSave(parsed2);
      this.closeDialog();
    };
    this.ui.dialog = {
      title: options.title,
      icon: "brackets",
      width: 640,
      body: () => h(
        "div",
        { class: "col-flex" },
        options.hint ? h("div", { class: "hint" }, options.hint) : null,
        textarea({
          value: draft.text,
          rows: 16,
          mono: true,
          invalid: draft.error !== null,
          testid: "json-editor",
          label: "JSON",
          onInput: (value) => {
            draft.text = value;
            const before = draft.error;
            validate();
            if (before === null !== (draft.error === null)) this.scheduleRender();
          },
          onKeyDown: (event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              save();
            }
          }
        }),
        draft.error ? h("div", { class: "note t-error" }, icon("error", { size: 14 }), h("span", {}, draft.error)) : h("div", { class: "hint" }, "Valid JSON. ⌘/Ctrl + Enter saves.")
      ),
      actions: () => [
        h("button", { type: "button", class: "btn", onClick: () => this.closeDialog() }, "Cancel"),
        h("button", { type: "button", class: "btn is-primary", "data-dt": "json-save", disabled: draft.error !== null || void 0, onClick: save }, "Save")
      ]
    };
    this.scheduleRender();
  }
  openAppMenu(event) {
    const apps = this.hook ? [...this.hook.apps.values()] : [];
    const items = [{ kind: "label", label: "Apps on this page" }];
    if (apps.length === 0) items.push({ label: "No <aktion-app> found", disabled: true });
    for (const app of apps) {
      items.push({
        label: app.label,
        icon: "box",
        checked: app.id === this.selectedAppId,
        run: () => {
          this.selectApp(app.id);
          this.flashApp();
        }
      });
    }
    if (this.imported.size > 0) {
      items.push({ kind: "separator", label: "" }, { kind: "label", label: "Imported sessions" });
      for (const [id, session] of this.imported) items.push({ label: session.label, icon: "file", checked: id === this.selectedAppId, run: () => this.selectApp(id) });
    }
    items.push({ kind: "separator", label: "" }, { label: "Import a session file…", icon: "upload", run: () => this.promptImport() });
    this.openMenu(event, items);
  }
  openDockMenu(event) {
    const ui = this.ui;
    this.openMenu(event, [
      { kind: "label", label: "Dock" },
      ...DOCK_ORDER.map((dock) => ({
        label: dock === "float" ? "Floating window" : `Dock ${dock}`,
        icon: dock === "float" ? "dockFloat" : dock === "right" ? "dockRight" : dock === "left" ? "dockLeft" : "dockBottom",
        checked: ui.dock === dock,
        run: () => this.setDock(dock)
      })),
      { kind: "separator", label: "" },
      { label: ui.pushPage ? "Overlay the page when docked" : "Shrink the page when docked", icon: "split", run: () => {
        ui.pushPage = !ui.pushPage;
        this.persist();
        this.scheduleRender();
      } },
      { label: ui.showLauncher ? "Hide the launcher when minimised" : "Show the launcher when minimised", icon: "eyeOff", run: () => {
        ui.showLauncher = !ui.showLauncher;
        this.persist();
        this.scheduleRender();
      } }
    ]);
  }
  /* ---------------------------------------------------------------------- */
  /*  Actions                                                                */
  /* ---------------------------------------------------------------------- */
  setMinimized(minimized) {
    this.ui.minimized = minimized;
    this.ui.collapsed = minimized;
    this.ui.menu = null;
    if (minimized) {
      this.ui.paletteOpen = false;
      this.overlay.clearUpdateFlashes();
    }
    this.vitals.setFrameSampling(!minimized);
    this.persist();
    this.scheduleRender();
  }
  togglePause() {
    this.ui.paused = !this.ui.paused;
    this.toast(this.ui.paused ? "Paused — runtime events are ignored until you resume" : "Recording runtime events", this.ui.paused ? "warn" : "good");
    this.scheduleRender();
  }
  setHighlightUpdates(on) {
    this.ui.highlightUpdates = on;
    if (!on) this.overlay.clearUpdateFlashes();
    this.persist();
    this.toast(on ? "Highlighting re-renders — interact with the app" : "Render highlighting off");
    this.scheduleRender();
  }
  clearSession() {
    const model = this.getModel();
    if (model) clearModel(model);
    this.hook?.clearBuffer();
    this.ui.selectedCommitId = null;
    this.ui.selectedRequest = null;
    this.ui.timeTravel = null;
    this.ui.timelineSelected = null;
    this.ui.timelineBrush = null;
    this.ui.timelineView = null;
    this.memoCache.clear();
    this.toast("Session data cleared");
    this.scheduleRender();
  }
  exportSession() {
    const ctx = this.context();
    downloadText(`aktion-session-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`, exportSessionJson(ctx, { steps: this.recorder.list() }));
    this.toast("Session exported", "good");
  }
  copyBugReport() {
    const ctx = this.context();
    const vitals = ctx.vitals;
    const lines2 = [];
    if (vitals.inp) lines2.push(`INP ${Math.round(vitals.inp.value)}ms (${vitals.inp.interaction.type} on ${vitals.inp.interaction.target || "?"})`);
    if (vitals.lcp) lines2.push(`LCP ${Math.round(vitals.lcp.value)}ms`);
    lines2.push(`CLS ${vitals.cls.value.toFixed(3)}`);
    const slowest = [...ctx.model.commits].sort((a, b) => b.duration - a.duration)[0];
    if (slowest) lines2.push(`Slowest commit #${slowest.commitId}: ${slowest.duration.toFixed(1)}ms`);
    ctx.copy(bugReportMarkdown(ctx, { steps: this.recorder.list(), vitals: lines2 }), "the bug report");
  }
  promptImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      void file.text().then((text2) => {
        try {
          this.importSession(text2, file.name);
          this.open();
        } catch (err) {
          this.toast(`Could not import: ${err instanceof Error ? err.message : String(err)}`, "bad");
        }
      });
    });
    input.click();
  }
  togglePicker() {
    if (this.overlay.isPicking) {
      this.overlay.stopPicking();
      this.scheduleRender();
      return;
    }
    const app = this.currentApp();
    if (this.ui.minimized) this.setMinimized(false);
    this.ui.tab = "inspect";
    this.overlay.startPicking({
      labelFor: (element) => {
        const key2 = can(app, "instanceForNode") ? app.instanceForNode(element) : null;
        return key2 ? { component: componentNameFromKey(key2) } : {};
      },
      onPick: (element) => {
        this.ui.selectedElement = element;
        const key2 = can(app, "instanceForNode") ? app.instanceForNode(element) : null;
        this.ui.selectedInstance = key2;
        if (key2) {
          this.revealInInspect(key2);
          this.highlightInstance(key2, true);
        } else {
          this.overlay.highlight(element, {}, true);
        }
        this.ui.inspectPane = key2 ? "props" : "dom";
        this.scheduleRender();
      },
      onCancel: () => this.scheduleRender()
    });
    this.scheduleRender();
  }
  flashApp() {
    const element = this.currentApp()?.element;
    if (!element) return;
    const previous = element.style.outline;
    const previousOffset = element.style.outlineOffset;
    element.style.outline = "2px solid rgba(139, 123, 255, 0.9)";
    element.style.outlineOffset = "2px";
    setTimeout(() => {
      element.style.outline = previous;
      element.style.outlineOffset = previousOffset;
    }, 260);
  }
  /* ---------------------------------------------------------------------- */
  /*  Keyboard                                                               */
  /* ---------------------------------------------------------------------- */
  bindWindow() {
    if (typeof window === "undefined") return;
    this.windowKeyHandler = (event) => {
      if (event.altKey && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
        if (this.ui.minimized || this.hidden || event.composedPath().includes(this)) return;
        if (isTypingTarget(event.composedPath()[0] ?? event.target)) return;
        if (this.handleViewShortcut(event)) event.preventDefault();
        return;
      }
      if (!(event.shiftKey && event.altKey) || event.ctrlKey || event.metaKey) return;
      if (event.code === "KeyD") {
        event.preventDefault();
        this.toggle();
      } else if (event.code === "KeyC") {
        event.preventDefault();
        this.togglePicker();
      } else if (event.code === "KeyK") {
        event.preventDefault();
        this.openPalette();
      }
    };
    window.addEventListener("keydown", this.windowKeyHandler, true);
    this.cspHandler = (event) => {
      const e = event;
      this.cspViolations.push({
        time: performance.now(),
        directive: e.effectiveDirective || e.violatedDirective || "",
        blocked: e.blockedURI || "",
        source: e.sourceFile ? `${e.sourceFile}:${e.lineNumber}` : "",
        disposition: e.disposition || "enforce",
        sample: e.sample || void 0
      });
      if (this.cspViolations.length > 100) this.cspViolations.shift();
      if (this.ui.tab === "security") this.scheduleRender();
    };
    document.addEventListener("securitypolicyviolation", this.cspHandler);
    if (typeof matchMedia === "function") {
      this.schemeQuery = matchMedia("(prefers-color-scheme: light)");
      this.schemeHandler = () => {
        if (this.ui.theme === "system") this.scheduleRender();
      };
      this.schemeQuery.addEventListener?.("change", this.schemeHandler);
    }
    this.resizeHandler = () => this.scheduleRender();
    window.addEventListener("resize", this.resizeHandler);
    this.outsidePointer = (event) => {
      if (!this.ui.menu) return;
      const path = event.composedPath();
      if (path.some((node) => node instanceof Element && node.classList?.contains("menu"))) return;
      this.closeMenu();
    };
    window.addEventListener("pointerdown", this.outsidePointer, true);
  }
  unbindWindow() {
    if (typeof window === "undefined") return;
    if (this.windowKeyHandler) window.removeEventListener("keydown", this.windowKeyHandler, true);
    if (this.cspHandler) document.removeEventListener("securitypolicyviolation", this.cspHandler);
    if (this.schemeQuery && this.schemeHandler) this.schemeQuery.removeEventListener?.("change", this.schemeHandler);
    if (this.resizeHandler) window.removeEventListener("resize", this.resizeHandler);
    if (this.outsidePointer) window.removeEventListener("pointerdown", this.outsidePointer, true);
    this.windowKeyHandler = null;
    this.cspHandler = null;
    this.schemeHandler = null;
    this.resizeHandler = null;
    this.outsidePointer = null;
  }
  onRootKeyDown(event) {
    const target = event.composedPath()[0] ?? event.target;
    const typing = isTypingTarget(target);
    const mod = event.metaKey || event.ctrlKey;
    if (mod && !event.shiftKey && !event.altKey && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (this.ui.paletteOpen) this.closePalette();
      else this.openPalette();
      return;
    }
    if (event.key === "Escape") {
      if (this.ui.menu) {
        event.preventDefault();
        this.closeMenu();
        return;
      }
      if (this.ui.dialog) {
        event.preventDefault();
        this.closeDialog();
        return;
      }
      if (this.ui.paletteOpen) {
        event.preventDefault();
        this.closePalette();
        return;
      }
      if (this.ui.shortcutsOpen) {
        event.preventDefault();
        this.ui.shortcutsOpen = false;
        this.scheduleRender();
        return;
      }
      if (this.overlay.isPicking) {
        event.preventDefault();
        this.overlay.stopPicking();
        this.scheduleRender();
        return;
      }
      if (this.ui.edit) {
        event.preventDefault();
        this.ui.edit = null;
        this.scheduleRender();
      }
      return;
    }
    if (typing) return;
    if (event.key === "?" && !mod) {
      event.preventDefault();
      this.ui.shortcutsOpen = !this.ui.shortcutsOpen;
      this.scheduleRender();
      return;
    }
    if (event.key === "/" && !mod) {
      const search = this.frameHost.querySelector(".dt-view [data-search]");
      if (search) {
        event.preventDefault();
        search.focus();
        search.select();
      }
      return;
    }
    if (event.altKey && !mod && this.handleViewShortcut(event)) event.preventDefault();
  }
  /** Alt+1…9 → the nth section; Alt+[ / Alt+] → previous / next. True when handled. */
  handleViewShortcut(event) {
    const main = VIEWS.filter((view) => view.group !== "system");
    const digit = /^Digit([1-9])$/.exec(event.code) ?? (/^[1-9]$/.test(event.key) ? [event.key, event.key] : null);
    if (digit) {
      const view = main[Number(digit[1]) - 1];
      if (!view) return false;
      this.selectTab(view.id);
      return true;
    }
    const bracket = event.code === "BracketLeft" || event.key === "[" ? -1 : event.code === "BracketRight" || event.key === "]" ? 1 : 0;
    if (bracket === 0) return false;
    const index = VIEWS.findIndex((view) => view.id === this.ui.tab);
    const next = VIEWS[(index + (bracket === 1 ? 1 : VIEWS.length - 1)) % VIEWS.length];
    this.selectTab(next.id);
    return true;
  }
  /* ---------------------------------------------------------------------- */
  /*  Moving, docking, resizing                                              */
  /* ---------------------------------------------------------------------- */
  beginMove(event) {
    if (event.button !== 0) return;
    if (event.target.closest("button, input, select, a, [role='menu']")) return;
    const start2 = { ...this.geometry };
    const titlebar = event.currentTarget;
    let floating = this.ui.dock === "float";
    let torn = false;
    let snap = null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    trackPointer(event, {
      threshold: 4,
      move: (dx, dy, e) => {
        titlebar.classList.add("is-dragging");
        if (!floating) {
          const away = this.ui.dock === "right" ? -dx : this.ui.dock === "left" ? dx : -dy;
          if (away < 36) return;
          floating = true;
          torn = true;
          const width = clamp(Math.round(vw * 0.55), MIN_W, 900);
          const height = clamp(Math.round(vh * 0.62), MIN_H, 720);
          this.geometry = { width, height, left: e.clientX - width / 2, top: Math.max(0, e.clientY - 18) };
          this.ui.dock = "float";
          this.renderNow();
          return;
        }
        if (torn) {
          this.geometry.left = e.clientX - this.geometry.width / 2;
          this.geometry.top = Math.max(0, e.clientY - 18);
        } else {
          this.geometry.left = start2.left + dx;
          this.geometry.top = Math.max(0, start2.top + dy);
        }
        this.style.left = `${this.geometry.left}px`;
        this.style.top = `${this.geometry.top}px`;
        snap = e.clientX <= SNAP_ZONE ? "left" : e.clientX >= vw - SNAP_ZONE ? "right" : e.clientY >= vh - SNAP_ZONE ? "bottom" : null;
        this.showSnap(snap);
      },
      end: (_dx, _dy, _e, moved) => {
        titlebar.classList.remove("is-dragging");
        this.showSnap(null);
        if (!moved) return;
        if (snap) {
          this.setDock(snap);
          this.toast(`Docked ${snap} — drag the title bar away from the edge to float it again`);
        } else {
          this.persist();
          this.scheduleRender();
        }
      }
    });
  }
  showSnap(side) {
    if (!side || side === "float") {
      this.snapEl?.remove();
      this.snapEl = null;
      return;
    }
    if (!this.snapEl) {
      this.snapEl = document.createElement("div");
      this.snapEl.className = "dt-snap";
      this.layerHost.appendChild(this.snapEl);
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const size = side === "bottom" ? this.dockSizes.bottom : this.dockSizes[side];
    const rect = side === "right" ? { left: vw - size, top: 0, width: size, height: vh } : side === "left" ? { left: 0, top: 0, width: size, height: vh } : { left: 0, top: vh - size, width: vw, height: size };
    Object.assign(this.snapEl.style, { left: `${rect.left + 6}px`, top: `${rect.top + 6}px`, width: `${rect.width - 12}px`, height: `${rect.height - 12}px` });
  }
  beginResize(event, edge) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const g0 = { ...this.geometry };
    const dock = this.ui.dock;
    const size0 = dock === "bottom" ? this.dockSizes.bottom : dock === "float" ? 0 : this.dockSizes[dock];
    const handle = event.currentTarget;
    handle.classList.add("is-active");
    trackPointer(event, {
      threshold: 1,
      move: (dx, dy) => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (dock === "float") {
          const g = { ...g0 };
          if (edge.includes("e")) g.width = clamp(g0.width + dx, MIN_W, vw);
          if (edge.includes("s")) g.height = clamp(g0.height + dy, MIN_H, vh);
          if (edge.includes("w")) {
            g.width = clamp(g0.width - dx, MIN_W, vw);
            g.left = g0.left + (g0.width - g.width);
          }
          if (edge.includes("n")) {
            g.height = clamp(g0.height - dy, MIN_H, vh);
            g.top = Math.max(0, g0.top + (g0.height - g.height));
          }
          this.geometry = g;
          Object.assign(this.style, { left: `${g.left}px`, top: `${g.top}px`, width: `${g.width}px`, height: `${g.height}px` });
        } else if (dock === "bottom") {
          this.dockSizes.bottom = clamp(size0 - dy, MIN_H - 40, vh - 60);
          this.style.height = `${this.dockSizes.bottom}px`;
          this.applyPagePush();
        } else {
          const size = clamp(dock === "right" ? size0 - dx : size0 + dx, MIN_W - 40, vw - 100);
          this.dockSizes[dock] = size;
          this.style.width = `${size}px`;
          this.applyPagePush();
        }
      },
      end: () => {
        handle.classList.remove("is-active");
        this.persist();
        this.scheduleRender();
      }
    });
  }
  toggleMaximize() {
    if (this.ui.dock !== "float") return;
    if (this.restoreGeometry) {
      this.geometry = this.restoreGeometry;
      this.restoreGeometry = null;
    } else {
      this.restoreGeometry = { ...this.geometry };
      this.geometry = { left: 12, top: 12, width: window.innerWidth - 24, height: window.innerHeight - 24 };
    }
    this.persist();
    this.scheduleRender();
  }
  beginLauncherDrag(event) {
    if (event.button !== 0) return;
    const start2 = { ...this.launcherPos };
    const el = event.currentTarget;
    trackPointer(event, {
      threshold: 4,
      move: (dx, dy) => {
        el.classList.add("is-dragging");
        this.launcherPos = {
          right: clamp(start2.right - dx, 4, window.innerWidth - 120),
          bottom: clamp(start2.bottom - dy, 4, window.innerHeight - 44)
        };
        el.style.right = `${this.launcherPos.right}px`;
        el.style.bottom = `${this.launcherPos.bottom}px`;
      },
      end: (_dx, _dy, _e, moved) => {
        el.classList.remove("is-dragging");
        if (moved) {
          this.persist();
          this.suppressLauncherClick = true;
          setTimeout(() => {
            this.suppressLauncherClick = false;
          }, 0);
        } else {
          this.open();
        }
      }
    });
  }
  /* ---------------------------------------------------------------------- */
  persist() {
    const ui = this.ui;
    const payload = {
      tab: ui.tab,
      dock: ui.dock,
      theme: ui.theme,
      light: ui.light,
      compact: ui.compact,
      motion: ui.motion,
      captureConsole: ui.captureConsole,
      width: this.geometry.width,
      height: this.geometry.height,
      left: this.geometry.left,
      top: this.geometry.top,
      dockSize: { ...this.dockSizes },
      launcher: this.launcherPos,
      tipsDismissed: ui.tipsDismissed,
      watches: ui.watches,
      railWide: ui.railWide,
      showLauncher: ui.showLauncher,
      pushPage: ui.pushPage,
      minimized: ui.minimized,
      sizes: ui.sizes,
      testFormat: ui.testFormat,
      highlightUpdates: ui.highlightUpdates
    };
    savePersisted(payload);
  }
  /** @internal — lets the Security view read the live CSP violation log. */
  get cspLog() {
    return this.cspViolations;
  }
  /** @internal — whether an event target belongs to the panel (for the recorder). */
  static isChrome(element) {
    return isPanelChrome(element);
  }
  /** @internal */
  get renderRoot() {
    return renderRootElement(this.currentApp());
  }
}
__publicField(AktionDevtoolsElement, "tagName", "aktion-devtools");
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function defineDevtoolsElement() {
  if (typeof customElements === "undefined") return;
  if (!customElements.get(AktionDevtoolsElement.tagName)) {
    customElements.define(AktionDevtoolsElement.tagName, AktionDevtoolsElement);
  }
}
function mountDevtools(options = {}) {
  const hook = installDevtoolsHook();
  defineDevtoolsElement();
  const element = document.createElement(AktionDevtoolsElement.tagName);
  const ui = element.getUiState();
  if (options.dock) ui.dock = options.dock;
  if (options.theme) ui.theme = options.theme;
  if (options.launcher !== void 0) ui.showLauncher = options.launcher;
  if (options.open !== void 0) ui.minimized = !options.open;
  if (options.tab) ui.tab = options.tab;
  (options.container ?? document.body).appendChild(element);
  if (options.appId) element.selectApp(options.appId);
  return {
    element,
    hook,
    open: () => element.open(),
    close: () => element.close(),
    toggle: () => element.toggle(),
    selectApp: (id) => element.selectApp(id),
    selectTab: (tab) => element.selectTab(tab),
    dock: (position) => element.setDock(position),
    importSession: (json, fileName) => element.importSession(json, fileName),
    flush: () => element.flush(),
    destroy: () => element.remove()
  };
}
function isDevtoolsInstalled() {
  return getDevtoolsHook() !== void 0;
}
defineDevtoolsElement();
export {
  AktionDevtoolsElement,
  CAPS,
  COMPUTED_GROUPS,
  ConsoleCapture,
  DEVTOOLS_PROTOCOL_VERSION,
  DEVTOOLS_UI_VERSION,
  HOOK_KEY,
  InspectOverlay,
  InteractionRecorder,
  RULE_INFO,
  SESSION_FORMAT,
  SHORTCUTS,
  SHORTCUT_GROUPS,
  THRESHOLDS as VITAL_THRESHOLDS,
  VitalsMonitor,
  a11yScore,
  a11ySummary,
  accessibilityTree,
  accessibleName,
  ancestorsOf,
  announce,
  auditAccessibility,
  bugReportMarkdown,
  buildInstanceTree,
  buildTimeline,
  checkHeaders$1 as checkHeaders,
  checkUrlSecrets,
  chooseQuery,
  classifySecret,
  clearModel,
  commitRate,
  componentAggregates,
  componentNameFromKey,
  computeCls,
  computeInp,
  computedGroup,
  contrastRatio,
  cssPath,
  cssVariables,
  decodeJwt,
  deepElementFromPoint,
  defineDevtoolsElement,
  descendantsOf,
  describeElement,
  devtoolsOption,
  diffSnapshots,
  effectAggregates,
  effectiveBackground,
  emptyModel,
  emptyVitals,
  exportSessionJson,
  findMatchingRule,
  fuzzyPositions,
  fuzzyScore,
  generatePlaywrightTest,
  generateSnapshotTest,
  generateTest,
  getDevtoolsHook,
  groupFindings,
  headingOutline,
  healthIssues,
  hotAtoms,
  implicitRole,
  importSessionJson,
  inclusiveTimes,
  ingest,
  ingestLog,
  installDevtoolsHook,
  instanceAggregates,
  isDevtoolsActive,
  isDevtoolsInstalled,
  isLocalHost,
  isPanelChrome,
  isVisible,
  landmarks,
  layoutFlame,
  measureBox,
  mountDevtools,
  networkStats,
  newRule,
  niceTicks,
  packLanes,
  parentKeyOf,
  parseColor,
  parseEditedValue,
  performanceInsights,
  playwrightLocator,
  previewOf,
  queryExpression,
  queryLabel,
  rankCommands,
  rate as rateVital,
  readPageStorage,
  relativeLuminance,
  replayStep,
  resolveQuery,
  ruleMatches,
  scanSecurity,
  shellQuote,
  shortInstanceLabel,
  tabOrder,
  toCurl,
  toDevtoolsValue,
  toFetch,
  toHar,
  toJsonText,
  valueKind,
  verdictFor,
  visibleNodes
};
//# sourceMappingURL=devtools.js.map
