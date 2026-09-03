var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key2, value) => key2 in obj ? __defProp(obj, key2, { enumerable: true, configurable: true, writable: true, value }) : obj[key2] = value;
var __publicField = (obj, key2, value) => __defNormalProp(obj, typeof key2 !== "symbol" ? key2 + "" : key2, value);
const HOOK_KEY = "__AKTION_DEVTOOLS_HOOK__";
const DEVTOOLS_PROTOCOL_VERSION = 2;
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
function installDevtoolsHook(libraryVersion = "0.6.x") {
  const existing = getDevtoolsHook();
  if (existing) {
    existing.libraryVersion = libraryVersion;
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
    libraryVersion,
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
        const head = arr.slice(0, 3).map((v) => shortPreview(v)).join(", ");
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
        const keys = safeKeys(value);
        if (keys.length === 0) return "{}";
        const head = keys.slice(0, 4).join(", ");
        return truncate(`{ ${head}${keys.length > 4 ? ", …" : ""} }`);
      }
    }
  } catch {
    return "<unreadable>";
  }
}
function shortPreview(value) {
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
        const keys = safeKeys(obj);
        for (const key2 of keys.slice(0, BREADTH_LIMIT)) {
          let entry;
          try {
            entry = obj[key2];
          } catch {
            entry = "[getter threw]";
          }
          out[key2] = toPlain(entry, depth + 1, seen);
        }
        if (keys.length > BREADTH_LIMIT) out["…"] = `${keys.length - BREADTH_LIMIT} more`;
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
function findMatchingRule(rules, method, url) {
  for (const rule of rules) {
    if (ruleMatches(rule, method, url)) return rule;
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
function parentKeyOf(key2, keys) {
  for (let i = key2.length - 1; i > 0; i -= 1) {
    if (!SEGMENT_STARTS.has(key2[i])) continue;
    const candidate = key2.slice(0, i);
    if (candidate !== key2 && keys.has(candidate)) return candidate;
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
function ancestorsOf(key2, keys) {
  const out = [];
  let current = parentKeyOf(key2, keys);
  let guard = 0;
  while (current !== null && guard++ < 200) {
    out.push(current);
    current = parentKeyOf(current, keys);
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
  const keys = new Set(byKey.keys());
  const depthCache = /* @__PURE__ */ new Map();
  const depthOf = (key2) => {
    const cached = depthCache.get(key2);
    if (cached !== void 0) return cached;
    const parent = parentKeyOf(key2, keys);
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
      parentKey: parentKeyOf(key2, keys),
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
  history: 60
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
  if (event.snapshot) {
    model.history.push({
      commitId: event.commitId,
      time: event.startTime,
      changedPaths: event.changedPaths,
      snapshot: event.snapshot
    });
    cap(model.history, CAPS.history);
  }
}
function ingestState(model, event, fromBuffer) {
  model.state = event.snapshot;
  model.totals.stateFlushes += 1;
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
  model.firstTime = null;
  model.lastTime = 0;
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
  return [...aggs.values()].map(({ keys, ...agg }) => ({ ...agg, instances: keys.size }));
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
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 2147482000;
  contain: layout style;
}
.layer { position: fixed; pointer-events: none; box-sizing: border-box; }
.margin { background: rgba(246, 178, 107, 0.30); }
.border { background: rgba(255, 229, 153, 0.38); }
.padding { background: rgba(147, 196, 125, 0.36); }
.content { background: rgba(111, 168, 220, 0.42); }
.outline {
  outline: 1px solid rgba(124, 156, 255, 0.95);
  outline-offset: -1px;
}
.tip {
  position: fixed;
  pointer-events: none;
  max-width: 340px;
  padding: 4px 7px;
  border-radius: 5px;
  background: #16181d;
  color: #e6e8ec;
  border: 1px solid #3a3f4b;
  box-shadow: 0 6px 18px rgba(0,0,0,0.45);
  font: 500 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tip .name { color: #7c9cff; font-weight: 700; }
.tip .dim { color: #9aa0ab; }
.tip .badge {
  display: inline-block;
  margin-left: 6px;
  padding: 0 4px;
  border-radius: 3px;
  background: rgba(192,140,240,0.18);
  color: #c08cf0;
}
.crosshair {
  position: fixed;
  inset: 0;
  cursor: crosshair;
  pointer-events: auto;
  background: transparent;
}
.hint {
  position: fixed;
  left: 50%;
  top: 12px;
  transform: translateX(-50%);
  padding: 5px 10px;
  border-radius: 999px;
  background: #7c9cff;
  color: #10121a;
  font: 700 11px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  box-shadow: 0 8px 20px rgba(0,0,0,0.4);
  pointer-events: none;
}
/* "Highlight updates": one cheap outline per re-rendered element, per commit. */
.update-flash {
  position: fixed;
  pointer-events: none;
  border: 1px solid rgba(90, 209, 155, 0.9);
  border-radius: 2px;
  box-shadow: 0 0 0 1px rgba(90, 209, 155, 0.25) inset;
  animation: dt-update-fade 320ms ease-out forwards;
}
@keyframes dt-update-fade {
  from { opacity: 1; }
  to { opacity: 0; }
}
`;
const CHROME_TAGS = /* @__PURE__ */ new Set([OVERLAY_TAG, "aktion-devtools"]);
function isPanelChrome(element) {
  let current = element;
  let guard = 0;
  while (current && guard++ < 60) {
    if (current instanceof Element && CHROME_TAGS.has(current.tagName.toLowerCase())) return true;
    const parent = current.parentNode;
    current = parent ?? current.host ?? null;
  }
  return false;
}
class InspectOverlay {
  constructor() {
    __publicField(this, "host", null);
    __publicField(this, "root", null);
    __publicField(this, "layers", /* @__PURE__ */ new Map());
    __publicField(this, "tip", null);
    __publicField(this, "crosshair", null);
    __publicField(this, "hint", null);
    /** Element currently drawn, so scroll / resize can re-measure it. */
    __publicField(this, "tracked", null);
    __publicField(this, "trackedLabel", {});
    /**
     * The SELECTED element, kept separately from the hovered one.
     *
     * A single "tracked + pinned" pair looks equivalent and is not: hovering a
     * second row would overwrite the pin, and leaving the hover would then keep
     * the hovered element highlighted instead of returning to the selection.
     */
    __publicField(this, "pinnedElement", null);
    __publicField(this, "pinnedLabel", {});
    __publicField(this, "reflowBound", null);
    /** Transient "this re-rendered" outlines — see {@link flashUpdated}. */
    __publicField(this, "updateFlashes", []);
    __publicField(this, "updateFlashTimer", null);
    /* ---- picking ---- */
    __publicField(this, "picking", false);
    __publicField(this, "onPick", null);
    __publicField(this, "onHover", null);
    __publicField(this, "onCancel", null);
    __publicField(this, "moveHandler", null);
    __publicField(this, "clickHandler", null);
    __publicField(this, "keyHandler", null);
  }
  /** True while the element picker is armed. */
  get isPicking() {
    return this.picking;
  }
  ensureHost() {
    if (this.root) return this.root;
    if (typeof document === "undefined" || typeof document.createElement !== "function") return null;
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
   * highlight survives `hideHover()` and follows the element through scrolling,
   * which is what makes "select it in the tree, then scroll to it" work.
   */
  highlight(element, label = {}, pin = false) {
    if (pin) {
      this.pinnedElement = element && element.isConnected ? element : null;
      this.pinnedLabel = label;
    }
    if (!element || !element.isConnected) {
      if (this.pinnedElement) this.drawTarget(this.pinnedElement, this.pinnedLabel);
      else this.clear();
      return;
    }
    if (!this.ensureHost()) return;
    this.drawTarget(element, label);
  }
  /** Remove a transient hover highlight, restoring the selection if there is one. */
  hideHover() {
    if (this.pinnedElement?.isConnected) {
      this.drawTarget(this.pinnedElement, this.pinnedLabel);
      return;
    }
    this.clear();
  }
  /**
   * Briefly outline every element that just re-rendered ("highlight updates").
   *
   * Drawn as its own cheap layer rather than through the box-model highlight:
   * this fires on every commit, so it has to cost one absolutely-positioned div
   * per element and nothing else. Overlapping flashes replace each other, which
   * is what makes a repeated re-render read as a pulse.
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
  /** Remove any update flashes without touching the highlight. */
  clearUpdateFlashes() {
    if (this.updateFlashTimer !== null) clearTimeout(this.updateFlashTimer);
    this.updateFlashTimer = null;
    for (const box of this.updateFlashes) box.remove();
    this.updateFlashes = [];
  }
  /** Remove every highlight and stop tracking. */
  clear() {
    this.tracked = null;
    this.pinnedElement = null;
    this.pinnedLabel = {};
    for (const layer of this.layers.values()) layer.style.display = "none";
    if (this.tip) this.tip.style.display = "none";
    this.unbindReflow();
  }
  /** Drop the selection, so the next `hideHover()` clears the highlight. */
  unpin() {
    this.pinnedElement = null;
    this.pinnedLabel = {};
  }
  drawTarget(element, label) {
    if (!this.ensureHost()) return;
    this.tracked = element;
    this.trackedLabel = label;
    this.draw();
    this.bindReflow();
  }
  draw() {
    const element = this.tracked;
    if (!element) return;
    const box = measureBox(element);
    if (!box) return;
    const { rect, margin, border, padding } = box;
    const place = (name2, top, left, width, height) => {
      const layer = this.layers.get(name2);
      if (!layer) return;
      if (width <= 0 || height <= 0) {
        layer.style.display = "none";
        return;
      }
      layer.style.display = "block";
      layer.style.top = `${top}px`;
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
    const tip = this.tip;
    if (!tip) return;
    tip.replaceChildren();
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = this.trackedLabel.component ?? describeElement(element);
    tip.appendChild(name);
    const dim = document.createElement("span");
    dim.className = "dim";
    dim.textContent = `  ${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    tip.appendChild(dim);
    if (this.trackedLabel.component) {
      const el = document.createElement("span");
      el.className = "dim";
      el.textContent = `  ${describeElement(element)}`;
      tip.appendChild(el);
    }
    if (this.trackedLabel.kind) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = this.trackedLabel.kind;
      tip.appendChild(badge);
    }
    tip.style.display = "block";
    const tipHeight = 22;
    const above = rect.top - margin.top - tipHeight - 4;
    tip.style.top = `${above > 4 ? above : rect.top + rect.height + margin.bottom + 4}px`;
    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1280;
    tip.style.left = `${Math.max(4, Math.min(viewportWidth - 200, rect.left - margin.left))}px`;
  }
  bindReflow() {
    if (this.reflowBound || typeof window === "undefined") return;
    const handler = () => {
      if (!this.tracked) return;
      if (!this.tracked.isConnected) {
        this.clear();
        return;
      }
      this.draw();
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
  /* ---- picker ---- */
  /**
   * Arm the element picker. Hovering highlights, clicking selects, Escape
   * cancels.
   *
   * A full-viewport crosshair layer takes the pointer events so the app under
   * it never sees the picking click — you can safely pick a "Delete" button.
   */
  startPicking(handlers) {
    const root = this.ensureHost();
    if (!root || this.picking) return;
    this.picking = true;
    this.onPick = handlers.onPick;
    this.onHover = handlers.onHover ?? null;
    this.onCancel = handlers.onCancel ?? null;
    const crosshair = document.createElement("div");
    crosshair.className = "crosshair";
    root.appendChild(crosshair);
    this.crosshair = crosshair;
    const hint = document.createElement("div");
    hint.className = "hint";
    hint.textContent = "Click an element to inspect it · Esc to cancel";
    root.appendChild(hint);
    this.hint = hint;
    this.moveHandler = (event) => {
      const element = this.pickTarget(event);
      if (!element) {
        this.hideHover();
        return;
      }
      this.highlight(element, {}, false);
      this.onHover?.(element);
    };
    this.clickHandler = (event) => {
      event.preventDefault();
      event.stopPropagation();
      const element = this.pickTarget(event);
      if (!element) return;
      const pick = this.onPick;
      this.stopPicking();
      pick?.(element);
    };
    this.keyHandler = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const cancel = this.onCancel;
      this.stopPicking();
      cancel?.();
    };
    crosshair.addEventListener("mousemove", this.moveHandler);
    crosshair.addEventListener("click", this.clickHandler);
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", this.keyHandler, true);
    }
  }
  /** Disarm the picker, leaving any pinned highlight in place. */
  stopPicking() {
    if (!this.picking) return;
    this.picking = false;
    if (this.crosshair) {
      if (this.moveHandler) this.crosshair.removeEventListener("mousemove", this.moveHandler);
      if (this.clickHandler) this.crosshair.removeEventListener("click", this.clickHandler);
      this.crosshair.remove();
      this.crosshair = null;
    }
    this.hint?.remove();
    this.hint = null;
    if (this.keyHandler && typeof window !== "undefined") {
      window.removeEventListener("keydown", this.keyHandler, true);
    }
    this.moveHandler = null;
    this.clickHandler = null;
    this.keyHandler = null;
    this.onPick = null;
    this.onHover = null;
    this.onCancel = null;
    this.hideHover();
  }
  /**
   * Element under a picking event. The crosshair layer is on top, so we hide it
   * for the duration of the hit test rather than reading `event.target` (which
   * would always be the crosshair itself).
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
    this.host?.remove();
    this.host = null;
    this.root = null;
    this.layers.clear();
    this.tip = null;
  }
}
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
      const parsed = parseColor(style.backgroundColor || "transparent");
      if (parsed && parsed.a > 0) {
        stack.push(parsed);
        if (parsed.a >= 1) break;
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
  findings.sort((a, b) => IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact]);
  return { findings, examined: elements.length, truncated: all.length > elements.length };
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
        message: `${describe(element)} has no accessible name.`,
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
          message: `${describe(element)} is labelled only by its placeholder ("${placeholder}").`,
          help: "A placeholder disappears on focus and is not a label. Add `label:` to the field.",
          element
        });
      } else {
        ctx.push({
          rule: "form-field-label",
          impact: "critical",
          message: `${describe(element)} has no label.`,
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
          message: `Heading level jumps from h${previous} to h${level} ("${text(heading)}").`,
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
          message: `${describe(element)} has ${attr}="${value}" but ${missing.join(", ")} does not exist.`,
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
        message: `${describe(element)} has an unrecognised role "${unknown.join(" ")}".`,
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
        message: `${describe(element)} has tabindex="${raw}".`,
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
        message: `${describe(element)} is aria-hidden but contains ${reachable.length} focusable element(s).`,
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
        message: `${describe(element)} contains another interactive element (${describe(nested[0])}).`,
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
        message: `${describe(element)} is ${Math.round(rect.width)}×${Math.round(rect.height)}px.`,
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
        message: `"${text(element)}" has a contrast of ${ratio.toFixed(2)}:1 (needs ${required}:1).`,
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
        message: `Link "${text(element)}" has no destination (href="${href}").`,
        help: "A link with no destination is a button. Use Button(...) with `onClick`, or give the link a real `href`.",
        element
      });
    }
  }
];
function hasOwnText(element) {
  for (const node of element.childNodes) {
    if (node.nodeType === 3 && (node.textContent ?? "").trim() !== "") return true;
  }
  return false;
}
function describe(element) {
  const tag = element.tagName.toLowerCase();
  const role = element.getAttribute("role");
  const label = text(element);
  const bits = [`<${tag}${role ? ` role="${role}"` : ""}>`];
  if (label) bits.push(`"${label}"`);
  return bits.join(" ");
}
function text(element) {
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
    if (last && last.type === "navigate" && step.type === "navigate" && last.value === step.value) return;
    this.steps.push({ ...step, time: Date.now() });
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
  const lines = [];
  if (options.vitestImports !== false) {
    lines.push(`import { afterEach, expect, it } from "vitest";`);
  }
  lines.push(`import { render, cleanup } from ${str(pkg)};`);
  lines.push("");
  if (options.vitestImports !== false) {
    lines.push("afterEach(cleanup);");
    lines.push("");
  }
  lines.push(`const program = \`${escapeTemplate(options.program ?? '$app(Text("replace me"))')}\`;`);
  lines.push("");
  lines.push(`it(${str(title)}, async () => {`);
  lines.push("  const screen = render(program);");
  lines.push("  await screen.flush();");
  let usesCss = false;
  for (const step of steps) {
    if (step.query?.kind === "css") usesCss = true;
    lines.push(`  ${stepCode(step)}`);
  }
  if (options.assertions && options.assertions.length > 0) {
    lines.push("");
    for (const assertion of options.assertions) {
      lines.push(`  expect(screen.state.get(${str(assertion.name)})).toEqual(${literal(assertion.value)});`);
    }
  }
  lines.push("});");
  if (usesCss) {
    lines.push("");
    lines.push("// NOTE: one or more steps fell back to a CSS selector because the element");
    lines.push("// had no test id, role, label, or text to match on. Those steps will break");
    lines.push("// when the markup around them changes — add `testId:` or a label instead.");
  }
  return lines.join("\n");
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
const LEVELS$1 = ["log", "info", "warn", "error", "debug"];
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
function patch() {
  const tap = sharedTap();
  if (tap.originals.size > 0) return;
  const target = globalThis;
  const native = target.console;
  if (!native) return;
  for (const level of LEVELS$1) {
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
    patch();
  }
  /** Stop capturing. The console is restored once no panel is listening. */
  stop() {
    const tap = sharedTap();
    if (this.sink) tap.sinks.delete(this.sink);
    this.sink = null;
    if (tap.sinks.size === 0) unpatch();
  }
}
function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key2, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key2 === "class") node.className = String(value);
    else if (key2 === "style") node.setAttribute("style", String(value));
    else if (key2 === "html") node.innerHTML = String(value);
    else if (key2.startsWith("on") && typeof value === "function") {
      node.addEventListener(key2.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key2, "");
    else node.setAttribute(key2, String(value));
  }
  append(node, children);
  return node;
}
function append(parent, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) {
      append(parent, child);
      continue;
    }
    parent.appendChild(
      typeof child === "string" || typeof child === "number" ? document.createTextNode(String(child)) : child
    );
  }
}
function fmtMs(n) {
  if (n === void 0 || !isFinite(n)) return "—";
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)} s`;
  if (n >= 100) return `${n.toFixed(0)} ms`;
  if (n >= 10) return `${n.toFixed(1)} ms`;
  return `${n.toFixed(2)} ms`;
}
function fmtRel(ms) {
  if (!isFinite(ms)) return "—";
  if (ms >= 6e4) return `${Math.floor(ms / 6e4)}m ${Math.round(ms % 6e4 / 1e3)}s`;
  if (ms >= 1e4) return `${(ms / 1e3).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}
function fmtClock(epochMs) {
  const d = new Date(epochMs);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
function fmtCount(n) {
  if (!isFinite(n)) return "—";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}
function fmtBytes(n) {
  if (n === void 0 || !isFinite(n)) return "—";
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}
function fmtPct(num, den) {
  if (den <= 0) return "—";
  return `${Math.round(num / den * 100)}%`;
}
function truncateMiddle(text2, limit = 60) {
  if (text2.length <= limit) return text2;
  const head = Math.ceil((limit - 1) / 2);
  const tail = Math.floor((limit - 1) / 2);
  return `${text2.slice(0, head)}…${text2.slice(text2.length - tail)}`;
}
function urlPath(url) {
  try {
    const parsed = new URL(url, "http://localhost");
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return url;
  }
}
function urlHost(url) {
  try {
    const parsed = new URL(url);
    return parsed.host;
  } catch {
    return "";
  }
}
function section(title, body, options = {}) {
  const head = title !== null || options.actions ? h(
    "div",
    { class: "sec-head" },
    title !== null ? h("p", { class: "section-title" }, title) : null,
    h("span", { class: "grow" }),
    ...options.actions ?? []
  ) : null;
  return h(
    "div",
    { class: `section ${options.flush ? "is-flush" : ""}`, id: options.id },
    head,
    ...Array.isArray(body) ? body : [body]
  );
}
function toolbar(...children) {
  return h("div", { class: "toolbar" }, ...children);
}
function spacer() {
  return h("span", { class: "grow" });
}
function chip(label, tone = "grey", title) {
  return h("span", { class: `chip ${tone}`, title }, label);
}
function button(label, onClick, options = {}) {
  const el = h(
    "button",
    {
      class: `icon-btn ${options.active ? "is-on" : ""} ${options.tone ? `t-${options.tone}` : ""}`,
      title: options.title,
      onclick: onClick
    },
    label
  );
  if (options.disabled) el.disabled = true;
  return el;
}
function toggle(label, on, onToggle, title) {
  return h("button", { class: `filter-chip ${on ? "is-on" : ""}`, title, onclick: onToggle }, label);
}
function chipGroup(values, active, onPick) {
  return h(
    "div",
    { class: "filters" },
    ...values.map(
      (entry) => toggle(entry.label, entry.value === active, () => onPick(entry.value), entry.title)
    )
  );
}
function searchInput(value, onInput, placeholder = "Filter…", options = {}) {
  return h("input", {
    class: "search",
    placeholder,
    value,
    // A stable focus key survives a re-render even when the surrounding tree
    // changes shape — see `FOCUS_KEY_ATTR`.
    [FOCUS_KEY_ATTR]: options.focusKey ?? `search:${placeholder}`,
    oninput: (e) => onInput(e.target.value)
  });
}
const FOCUS_KEY_ATTR = "data-dt-focus";
const SCROLL_KEY_ATTR = "data-dt-scroll";
function textField(options) {
  const input = h("input", {
    class: options.className ?? "search",
    placeholder: options.placeholder,
    title: options.title,
    value: options.value ?? "",
    spellcheck: "false",
    style: options.width ? `max-width:${options.width}` : void 0,
    [FOCUS_KEY_ATTR]: options.focusKey
  });
  const initial = options.value ?? "";
  if (options.onInput) {
    input.addEventListener("input", () => options.onInput(input.value));
  }
  const commit = () => {
    if (options.onCommit && input.value !== initial) options.onCommit(input.value);
  };
  input.addEventListener("change", commit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      options.onEnter?.(input.value);
    } else if (event.key === "Escape") {
      input.value = initial;
      input.blur();
    }
  });
  return input;
}
function muted(...children) {
  return h("span", { class: "muted" }, ...children);
}
function faint(...children) {
  return h("span", { class: "faint" }, ...children);
}
function code(text2, title) {
  return h("code", { class: "mono", title }, text2);
}
function emptyState(title, hint, action) {
  return h(
    "div",
    { class: "empty" },
    h("p", {}, title),
    hint ? h("p", { class: "faint" }, hint) : null,
    null
  );
}
function stat(label, value, options = {}) {
  return h(
    "div",
    {
      class: `stat ${options.onClick ? "is-link" : ""}`,
      title: options.title,
      onclick: options.onClick
    },
    h("span", { class: `stat-val ${options.tone ? `t-${options.tone}` : ""}` }, value),
    h("span", { class: "stat-label" }, label)
  );
}
function statGrid(...stats) {
  return h("div", { class: "stat-grid" }, ...stats);
}
function barRow(label, fraction, note, options = {}) {
  const pct = Math.max(2, Math.min(100, Math.round(fraction * 100)));
  return h(
    "div",
    { class: `bar-row ${options.onClick ? "is-link" : ""}`, title: options.title, onclick: options.onClick },
    h("span", { class: "bar-row-label" }, label),
    h(
      "span",
      { class: "bar-row-track" },
      h("span", { class: `bar-row-fill ${options.tone ? `t-${options.tone}` : ""}`, style: `width:${pct}%` })
    ),
    h("span", { class: "bar-row-num" }, note)
  );
}
function insight(tone, icon, body) {
  return h(
    "div",
    { class: `insight t-${tone}` },
    h("span", { class: "insight-ic" }, icon),
    h("span", {}, body)
  );
}
function insightList(items) {
  return h("div", { class: "insights" }, ...items.map((i) => insight(i.tone, i.icon, i.text)));
}
function table(columns, rows, options = {}) {
  const sorted = [...rows];
  const active = options.sort ? columns.find((c) => c.key === options.sort.key) : void 0;
  if (active?.sort) {
    const dir = options.sort.dir;
    sorted.sort((a, b) => {
      const va = active.sort(a);
      const vb = active.sort(b);
      if (typeof va === "string" || typeof vb === "string") {
        return dir * String(va).localeCompare(String(vb));
      }
      return dir * (va < vb ? -1 : va > vb ? 1 : 0);
    });
  }
  if (sorted.length === 0) {
    return h("div", { class: "faint pad-sm" }, options.empty ?? "Nothing to show.");
  }
  const arrow = (key2) => {
    if (!options.sort || options.sort.key !== key2) return "";
    return options.sort.dir === 1 ? " ▲" : " ▼";
  };
  return h(
    "table",
    { class: "dt-table" },
    h("thead", {}, h("tr", {}, ...columns.map((col) => h(
      "th",
      {
        class: col.sort && options.onSort ? "sortable" : "",
        style: col.numeric ? "text-align:right" : "",
        title: col.title,
        onclick: col.sort && options.onSort ? () => options.onSort(col.key) : void 0
      },
      `${col.label}${arrow(col.key)}`
    )))),
    h("tbody", {}, ...sorted.map((row) => h(
      "tr",
      {
        class: options.rowClass?.(row) ?? "",
        onclick: options.onRowClick ? () => options.onRowClick(row) : void 0
      },
      ...columns.map((col) => h("td", { class: col.numeric ? "num" : "" }, col.render(row)))
    )))
  );
}
function nextSort(current, key2, defaultDir = -1) {
  if (current.key === key2) return { key: key2, dir: current.dir === 1 ? -1 : 1 };
  return { key: key2, dir: defaultDir };
}
function valueSpan(value, options = {}) {
  return h("span", { class: `v t-${value.type}`, title: options.title ?? value.json ?? value.preview }, value.preview);
}
function editableValue(value, onCommit, options = {}) {
  const span = valueSpan(value, {
    title: options.title ?? (options.disabled ? "read-only" : "Click to edit · Enter commits · Esc cancels")
  });
  if (options.disabled) {
    span.classList.add("is-readonly");
    return span;
  }
  span.classList.add("is-editable");
  span.addEventListener("click", (event) => {
    event.stopPropagation();
    const initial = value.type === "string" ? safeParse(value.json) ?? value.preview : value.json ?? value.preview;
    const input = h("input", {
      class: "edit-input",
      value: String(initial ?? ""),
      // Keyed so a re-render mid-edit (an event arrives while you are typing)
      // re-focuses the same field instead of dropping you out of the editor.
      [FOCUS_KEY_ATTR]: options.focusKey ? `edit:${options.focusKey}` : void 0
    });
    let settled = false;
    const settle = (apply) => {
      if (settled) return;
      settled = true;
      if (apply) onCommit(parseEditedValue(input.value));
      else options.onCancel?.();
      if (!apply && input.isConnected) input.replaceWith(span);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        settle(true);
      } else if (e.key === "Escape") {
        e.preventDefault();
        settle(false);
      }
    });
    input.addEventListener("blur", () => {
      if (input.isConnected) settle(true);
    });
    span.replaceWith(input);
    input.focus();
    input.select();
  });
  return span;
}
function safeParse(json) {
  if (json === void 0) return void 0;
  try {
    return JSON.parse(json);
  } catch {
    return void 0;
  }
}
function jsonTree(value, options) {
  const container = h("div", { class: "tree" });
  const prefix = options.path ?? "";
  const entries = childEntries(value);
  const filter = (options.filter ?? "").trim().toLowerCase();
  let shown = 0;
  for (const [key2, child] of entries) {
    if (filter && !key2.toLowerCase().includes(filter)) continue;
    shown += 1;
    appendJsonRows(container, prefix ? `${prefix}.${key2}` : key2, key2, child, 0, options);
  }
  if (shown === 0) {
    container.appendChild(h("div", { class: "empty" }, filter ? "Nothing matches the filter." : "Empty."));
  }
  return container;
}
function appendJsonRows(container, path, key2, value, depth, options) {
  const type = jsonType(value);
  const children = childEntries(value);
  const expandable = children.length > 0 && depth < (options.maxDepth ?? 12);
  const open = options.expanded.has(path);
  const readOnly = options.readOnly?.(path, depth) ?? false;
  const twist = h(
    "span",
    {
      class: `twist ${expandable ? "" : "is-leaf"}`,
      onclick: expandable ? (event) => {
        event.stopPropagation();
        if (options.expanded.has(path)) options.expanded.delete(path);
        else options.expanded.add(path);
        options.onToggle();
      } : void 0
    },
    expandable ? open ? "▾" : "▸" : "•"
  );
  const described = {
    type,
    preview: jsonPreview(value),
    json: type === "object" || type === "array" || type === "function" ? void 0 : JSON.stringify(value)
  };
  const editable = !readOnly && !expandable && type !== "function" && options.onEdit !== void 0;
  const valueNode = editable ? editableValue(described, (next) => options.onEdit(path, next)) : valueSpan(described);
  container.appendChild(h(
    "div",
    {
      class: `row ${options.highlight?.has(path) ? "is-changed" : ""}`,
      style: `padding-left:${8 + depth * 14}px`
    },
    twist,
    h("span", { class: "k" }, key2),
    h("span", { class: "sep" }, ": "),
    valueNode,
    readOnly ? h("span", { class: "tag" }, "read-only") : null,
    h("span", { class: "grow" }),
    options.decorate?.(path, depth) ?? null
  ));
  if (expandable && open) {
    for (const [childKey, childValue] of children) {
      appendJsonRows(container, `${path}.${childKey}`, childKey, childValue, depth + 1, options);
    }
  }
}
function jsonType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
function childEntries(value) {
  if (Array.isArray(value)) return value.map((item, i) => [String(i), item]);
  if (value && typeof value === "object") {
    try {
      return Object.entries(value);
    } catch {
      return [];
    }
  }
  return [];
}
function jsonPreview(value) {
  switch (jsonType(value)) {
    case "string": {
      const text2 = value;
      return JSON.stringify(text2.length > 80 ? `${text2.slice(0, 80)}…` : text2);
    }
    case "number":
    case "boolean":
      return String(value);
    case "null":
      return "null";
    case "undefined":
      return "undefined";
    case "function":
      return "ƒ ()";
    case "array":
      return `Array(${value.length})`;
    case "object": {
      const keys = Object.keys(value);
      if (keys.length === 0) return "{}";
      return `{ ${keys.slice(0, 3).join(", ")}${keys.length > 3 ? `, …${keys.length - 3}` : ""} }`;
    }
    default:
      return String(value);
  }
}
function codeBlock(text2, options = {}) {
  const lines = text2.split("\n");
  const cap2 = options.maxLines ?? 4e3;
  const shown = lines.slice(0, cap2);
  const offset = (options.firstLine ?? 1) - 1;
  const needle = (options.highlight ?? "").toLowerCase();
  const wrap = h("div", {
    class: "code-block",
    ...options.scrollKey ? { [SCROLL_KEY_ATTR]: options.scrollKey } : {}
  });
  shown.forEach((line, index) => {
    const relative = index + 1;
    const marker = options.markers?.get(relative);
    const row = h(
      "div",
      {
        class: [
          "code-line",
          marker ? `has-marker t-${marker.tone}` : "",
          options.focusLine === relative ? "is-focus" : "",
          needle !== "" && line.toLowerCase().includes(needle) ? "is-hit" : ""
        ].filter(Boolean).join(" "),
        onclick: options.onLineClick ? () => options.onLineClick(relative) : void 0
      },
      options.lineNumbers === false ? null : h("span", { class: "code-gutter", title: marker?.title }, String(relative + offset)),
      renderCodeText(line, needle)
    );
    wrap.appendChild(row);
  });
  if (lines.length > cap2) {
    wrap.appendChild(h(
      "div",
      { class: "code-line" },
      h("span", { class: "code-gutter" }, "…"),
      h("span", { class: "code-text faint" }, `${lines.length - cap2} more lines not shown`)
    ));
  }
  return wrap;
}
function renderCodeText(line, needle) {
  const span = h("span", { class: "code-text" });
  if (needle === "" || !line.toLowerCase().includes(needle)) {
    span.appendChild(document.createTextNode(line === "" ? " " : line));
    return span;
  }
  const lower = line.toLowerCase();
  let cursor = 0;
  while (cursor < line.length) {
    const found = lower.indexOf(needle, cursor);
    if (found < 0) {
      span.appendChild(document.createTextNode(line.slice(cursor)));
      break;
    }
    if (found > cursor) span.appendChild(document.createTextNode(line.slice(cursor, found)));
    span.appendChild(h("mark", {}, line.slice(found, found + needle.length)));
    cursor = found + needle.length;
  }
  return span;
}
function copyText(text2) {
  const clipboard = navigator.clipboard;
  if (clipboard?.writeText) {
    void clipboard.writeText(text2).catch(() => legacyCopy(text2));
    return;
  }
  legacyCopy(text2);
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
    document.execCommand("copy");
    area.remove();
  } catch {
  }
}
function copyButton(getText, label = "Copy", onDone) {
  return button(label, () => {
    copyText(getText());
  }, { title: "Copy to clipboard" });
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
function waterfallBar(startFraction, widthFraction, tone, title) {
  const left = Math.max(0, Math.min(99, startFraction * 100));
  const width = Math.max(1, Math.min(100 - left, widthFraction * 100));
  return h(
    "span",
    { class: "wf-track", title },
    h("span", { class: `wf-bar t-${tone}`, style: `left:${left}%;width:${width}%` })
  );
}
function defList(rows) {
  return h("div", { class: "deflist" }, ...rows.flatMap(([label, value]) => [
    h("div", { class: "dt" }, label),
    h("div", { class: "dd" }, value)
  ]));
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
function rankCommands(commands, query) {
  const trimmed = query.trim();
  if (trimmed === "") return [...commands];
  const needle = trimmed.toLowerCase();
  const scored = [];
  for (const command of commands) {
    const haystack = `${command.group} · ${command.label} ${command.keywords ?? ""}`;
    const base = fuzzyScore(trimmed, haystack);
    if (base === null) continue;
    const label = command.label.toLowerCase();
    let score = base;
    if (label === needle) score -= 100;
    else if (label.startsWith(needle)) score -= 20;
    if (command.group === "Go to") score -= 3;
    scored.push({ command, score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.map((entry) => entry.command);
}
const TAB_COMMANDS = [
  { id: "overview", label: "Overview", keywords: "health summary home start" },
  { id: "inspect", label: "Inspect", keywords: "component tree element picker props hooks dom styles box model" },
  { id: "state", label: "State", keywords: "atoms reactive edit time travel snapshot diff watch" },
  { id: "profiler", label: "Profiler", keywords: "commits renders flamegraph memo performance slow" },
  { id: "effects", label: "Effects", keywords: "side effects timeline triggers intervals cleanup mounted" },
  { id: "network", label: "Network", keywords: "http requests fetch query mutation mock offline delay rules" },
  { id: "console", label: "Console", keywords: "logs warnings errors repl evaluate expression watch" },
  { id: "routes", label: "Routes", keywords: "router navigation path params patterns" },
  { id: "data", label: "Data", keywords: "queries cache stores forms localstorage session cookies" },
  { id: "theme", label: "Theme", keywords: "tokens colours colors contrast design dark light" },
  { id: "source", label: "Source", keywords: "program code diagnostics outline edit reload history" },
  { id: "test", label: "Test", keywords: "record test accessibility a11y coverage queries chaos fuzz" },
  { id: "timeline", label: "Timeline", keywords: "events ordered stream export session" },
  { id: "settings", label: "Settings", keywords: "instrumentation dock theme density shortcuts about" }
];
function buildPalette(ctx, actions) {
  const commands = [];
  const { app, ui } = ctx;
  for (const tab of TAB_COMMANDS) {
    commands.push({
      id: `tab:${tab.id}`,
      group: "Go to",
      label: tab.label,
      keywords: tab.keywords,
      run: () => ctx.selectTab(tab.id)
    });
  }
  commands.push(
    {
      id: "pick",
      group: "Inspect",
      label: ctx.overlay.isPicking ? "Cancel element picker" : "Pick element on the page",
      keywords: "select click crosshair find component",
      hint: "Ctrl+Shift+P",
      run: () => actions.togglePicker()
    },
    {
      id: "highlight",
      group: "Inspect",
      label: `${ui.highlightUpdates ? "Stop" : "Start"} highlighting re-renders`,
      keywords: "flash outline updates paint which components render",
      run: () => {
        ui.highlightUpdates = !ui.highlightUpdates;
        ctx.toast(ui.highlightUpdates ? "Highlighting re-renders" : "Highlighting off");
        ctx.refresh();
      }
    },
    {
      id: "force-render",
      group: "App",
      label: "Force a full re-render",
      keywords: "repaint refresh redraw",
      run: () => {
        app?.forceRender();
        ctx.toast("Full re-render requested");
      }
    }
  );
  if (typeof app?.reload === "function") {
    commands.push({
      id: "reload",
      group: "App",
      label: "Re-plan the program",
      keywords: "reload hot restart",
      run: () => {
        app.reload();
        ctx.toast("Program re-planned");
        ctx.refresh();
      }
    });
  }
  if (typeof app?.resetState === "function") {
    commands.push({
      id: "reset-state",
      group: "State",
      label: "Reset all state to declared defaults",
      keywords: "clear wipe initial",
      run: () => {
        app.resetState();
        ctx.toast("State reset");
        ctx.refresh();
      }
    });
  }
  if (ui.timeTravel !== null) {
    commands.push({
      id: "live",
      group: "State",
      label: "Return to live state",
      keywords: "time travel stop scrub",
      run: () => {
        ui.timeTravel = null;
        ctx.selectTab("state");
      }
    });
  }
  if (typeof app?.listPropOverrides === "function" && app.listPropOverrides().length > 0) {
    commands.push({
      id: "clear-overrides",
      group: "Inspect",
      label: `Clear ${app.listPropOverrides().length} prop override(s)`,
      keywords: "revert restore props",
      run: () => actions.clearOverrides()
    });
  }
  if (typeof app?.clearThemeTokens === "function") {
    commands.push({
      id: "clear-theme",
      group: "Theme",
      label: "Reset theme token overrides",
      keywords: "colours colors revert",
      run: () => {
        app.clearThemeTokens();
        ctx.toast("Theme overrides cleared");
        ctx.refresh();
      }
    });
  }
  commands.push(
    {
      id: "audit",
      group: "Test",
      label: "Run the accessibility audit",
      keywords: "a11y contrast labels roles",
      run: () => actions.runAudit()
    },
    {
      id: "record",
      group: "Test",
      label: ctx.recorder.isRecording ? "Stop recording interactions" : "Record interactions as a test",
      keywords: "capture generate vitest steps",
      run: () => actions.toggleRecording()
    },
    {
      id: "export",
      group: "Session",
      label: "Export the session as JSON",
      keywords: "download bug report share",
      run: () => actions.exportSession()
    },
    {
      id: "clear-session",
      group: "Session",
      label: "Clear captured data",
      keywords: "reset empty commits events logs",
      run: () => actions.clearSession()
    },
    {
      id: "pause",
      group: "Session",
      label: ui.paused ? "Resume recording events" : "Pause recording events",
      keywords: "freeze stop capture",
      run: () => {
        ui.paused = !ui.paused;
        ctx.toast(ui.paused ? "Paused" : "Recording");
        ctx.refresh();
      }
    },
    {
      id: "dock",
      group: "Panel",
      label: "Cycle dock position",
      keywords: "float right bottom left move layout",
      run: () => actions.cycleDock()
    },
    {
      id: "theme-toggle",
      group: "Panel",
      label: `Switch to the ${ui.light ? "dark" : "light"} panel theme`,
      keywords: "appearance contrast",
      run: () => {
        ui.light = !ui.light;
        ctx.refresh();
      }
    },
    {
      id: "compact",
      group: "Panel",
      label: ui.compact ? "Use comfortable row height" : "Use compact row height",
      keywords: "density small rows",
      run: () => {
        ui.compact = !ui.compact;
        ctx.refresh();
      }
    },
    {
      id: "shortcuts",
      group: "Help",
      label: "Show keyboard shortcuts",
      keywords: "keys help bindings",
      hint: "?",
      run: () => actions.showShortcuts()
    }
  );
  return commands;
}
class PaletteController {
  constructor(handlers) {
    __publicField(this, "input");
    __publicField(this, "list");
    __publicField(this, "footCount");
    __publicField(this, "root");
    /** Results of the latest update, so Enter always runs what is on screen. */
    __publicField(this, "results", []);
    __publicField(this, "selected", 0);
    this.handlers = handlers;
    this.input = h("input", {
      class: "pal-input",
      placeholder: "Type a command… (tabs, actions, settings)",
      spellcheck: "false"
    });
    this.list = h("div", { class: "pal-list" });
    this.footCount = h("span", {});
    this.input.addEventListener("input", () => this.handlers.onQuery(this.input.value));
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.handlers.onMove(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        this.handlers.onMove(-1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        const command = this.results[this.selected];
        if (command) this.handlers.onRun(command);
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.handlers.onClose();
      }
    });
    this.root = h(
      "div",
      { class: "pal-scrim", onclick: () => this.handlers.onClose() },
      h(
        "div",
        { class: "pal-box", onclick: (event) => event.stopPropagation() },
        this.input,
        this.list,
        h(
          "div",
          { class: "pal-foot" },
          h("span", {}, "↑↓ to move · Enter to run · Esc to close"),
          this.footCount
        )
      )
    );
  }
  /** Mount into `host` (idempotent) and refresh the list. Returns the count. */
  update(host, state) {
    if (this.root.parentElement !== host) host.replaceChildren(this.root);
    if (this.input.value !== state.query) this.input.value = state.query;
    this.results = rankCommands(state.commands, state.query).slice(0, 40);
    this.selected = Math.max(0, Math.min(state.selected, this.results.length - 1));
    this.list.replaceChildren();
    if (this.results.length === 0) {
      this.list.appendChild(h("div", { class: "pal-empty" }, `No command matches “${state.query}”.`));
    }
    this.results.forEach((command, index) => {
      this.list.appendChild(h(
        "button",
        {
          class: `pal-row ${index === this.selected ? "is-active" : ""}`,
          onmouseenter: () => this.handlers.onMove(index - this.selected),
          onclick: () => this.handlers.onRun(command)
        },
        h("span", { class: "pal-group" }, command.group),
        h("span", { class: "pal-label" }, command.label),
        command.hint ? h("span", { class: "pal-hint" }, command.hint) : null
      ));
    });
    this.footCount.textContent = `${this.results.length} command${this.results.length === 1 ? "" : "s"}`;
    return this.results.length;
  }
  /**
   * Focus the input. The palette is the one place where taking focus is
   * unambiguously what the user asked for.
   */
  focus() {
    this.input.focus();
    try {
      this.input.setSelectionRange(this.input.value.length, this.input.value.length);
    } catch {
    }
    this.list.querySelector(".pal-row.is-active")?.scrollIntoView({ block: "nearest" });
  }
  /** Reset the query so the next open starts clean. */
  reset() {
    this.input.value = "";
    this.results = [];
    this.selected = 0;
  }
}
const SHORTCUTS = [
  ["Ctrl / ⌘ K", "Open the command palette — from anywhere on the page"],
  ["Ctrl+Shift+P", "Toggle the element picker — from anywhere on the page"],
  ["Alt+1 … Alt+9", "Jump to a tab by position — from anywhere on the page"],
  ["Alt+[  /  Alt+]", "Previous / next tab — from anywhere on the page"],
  ["?", "Show this list (panel focused)"],
  ["Ctrl / ⌘ F  or  /", "Focus the current tab's filter (panel focused)"],
  ["Esc", "Cancel the picker, close the palette, or cancel an edit"],
  ["Enter", "Commit an inline edit · run a REPL expression"],
  ["↑ / ↓", "Walk REPL history · move in the palette"]
];
function exportSessionJson(ctx) {
  const { model } = ctx;
  const payload = {
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    protocolVersion: ctx.hook.protocolVersion,
    libraryVersion: ctx.hook.libraryVersion,
    app: ctx.app ? { id: ctx.app.id, label: ctx.app.label } : null,
    program: safeProgram(ctx),
    diagnostics: typeof ctx.app?.getDiagnostics === "function" ? ctx.app.getDiagnostics() : [],
    stats: typeof ctx.app?.getStats === "function" ? ctx.app.getStats() : null,
    route: typeof ctx.app?.getRoute === "function" ? ctx.app.getRoute() : null,
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
    // The program history is the one thing that cannot be reconstructed from the
    // events, and it is exactly what a "it broke after my edit" report needs.
    programVersions: model.programHistory.map((version) => ({
      at: new Date(version.at).toISOString(),
      lines: version.lines,
      text: version.text
    }))
  };
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return JSON.stringify({ ...payload, state: "<unserialisable>" }, null, 2);
  }
}
function safeProgram(ctx) {
  try {
    return ctx.app?.getProgram() ?? null;
  } catch {
    return null;
  }
}
function defaultUiState() {
  return {
    tab: "overview",
    paused: false,
    dock: "float",
    light: false,
    compact: false,
    collapsed: false,
    toast: null,
    paletteOpen: false,
    paletteQuery: "",
    paletteIndex: 0,
    shortcutsOpen: false,
    tipsDismissed: false,
    highlightUpdates: false,
    perfMarks: false,
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
    inspectFilter: "",
    inspectCollapsed: /* @__PURE__ */ new Set(),
    selectedInstance: null,
    selectedElement: null,
    inspectPane: "props",
    inspectShowLibrary: true,
    inspectReveal: null,
    propsExpanded: /* @__PURE__ */ new Set(),
    computedFilter: "",
    selectedCommitId: null,
    flashOnCommit: false,
    rankedSort: { key: "total", dir: -1 },
    profilerView: "commit",
    phaseFilter: /* @__PURE__ */ new Set(["mount", "run", "cleanup", "unmount", "error"]),
    effectView: "timeline",
    selectedEffect: null,
    networkFilter: "",
    networkOnlyProblems: false,
    selectedRequest: null,
    networkPane: "response",
    showRules: false,
    rules: [],
    logFilter: "",
    logLevels: /* @__PURE__ */ new Set(["log", "info", "warn", "error", "debug"]),
    captureConsole: true,
    repl: [],
    replDraft: "",
    replHistory: [],
    replCursor: -1,
    watches: [],
    routeDraft: "",
    dataPane: "queries",
    storageKind: "local",
    dataExpanded: /* @__PURE__ */ new Set(),
    themeFilter: "",
    sourceIndex: 0,
    sourceFocusLine: null,
    sourceDraft: null,
    sourceOutline: true,
    sourceFilter: "",
    sourceHistoryOpen: false,
    testPane: "record",
    a11yRun: null,
    a11yRequested: false,
    a11ySelected: null,
    queryProbe: "",
    queryProbeKind: "role",
    fuzzRun: null,
    fuzzRunning: false,
    generatedTest: null,
    timelineKinds: /* @__PURE__ */ new Set(["commit", "effect", "network", "route", "emit", "error"])
  };
}
const STORAGE_KEY = "aktion-devtools-ui";
function loadPersisted() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
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
const FLASH_MS = 1100;
const stateTab = {
  id: "state",
  label: "State",
  icon: "◆",
  hint: "Live reactive state, editable, with change counts, time travel, and a diff",
  badge: (ctx) => {
    const count = Object.keys(ctx.model.state).length;
    return count > 0 ? count : null;
  },
  render: (ctx) => render$d(ctx)
};
function render$d(ctx) {
  const { app, model, ui } = ctx;
  if (!app) return [emptyState("No app selected.")];
  const meta = ctx.cache("stateMeta", () => can(app, "getStateMeta") ? app.getStateMeta() : []);
  const metaByName = new Map(meta.map((entry2) => [entry2.name, entry2]));
  const views = [
    { value: "tree", label: "Tree", title: "The live store, editable" },
    { value: "diff", label: "Diff", title: "Compare two recorded snapshots" }
  ];
  const bar = toolbar(
    chipGroup(views, ui.stateView, (value) => {
      ui.stateView = value;
      ctx.refresh();
    }),
    ui.stateView === "tree" ? searchInput(ui.stateFilter, (value) => {
      ui.stateFilter = value;
      ctx.refresh();
    }, "Filter atoms…", { focusKey: "state-filter" }) : null,
    spacer(),
    ui.stateView === "tree" ? renderTreeActions(ctx, meta) : null
  );
  if (ui.stateView === "diff") {
    return [bar, ...renderDiffView(ctx)];
  }
  const travelling = ui.timeTravel !== null && model.history[ui.timeTravel] !== void 0;
  const entry = travelling ? model.history[ui.timeTravel] : null;
  const snapshot = entry ? entry.snapshot : model.state;
  const out = [bar, renderSummary$2(ctx, meta)];
  if (model.history.length > 1) out.push(renderTimeTravel(ctx));
  if (ui.importDraft !== null) out.push(renderImport(ctx));
  if (travelling && entry) {
    out.push(section(null, h(
      "div",
      { class: "banner t-purple" },
      h(
        "span",
        {},
        `Viewing commit #${entry.commitId ?? "?"} — ${fmtRel(model.lastTime - entry.time)} ago. Rows are read-only while scrubbing.`
      ),
      spacer(),
      can(app, "hydrateState") ? button("Restore this snapshot", () => {
        app.hydrateState(entry.snapshot);
        ui.timeTravel = null;
        ctx.toast("Snapshot restored into the live store");
        ctx.refresh();
      }, { tone: "purple" }) : null,
      button("Back to live", () => {
        ui.timeTravel = null;
        ctx.refresh();
      })
    ), { flush: true }));
  }
  const now = typeof performance !== "undefined" ? performance.now() : Date.now();
  const maxChanges = Math.max(1, ...model.changeCounts.values());
  const names = Object.keys(snapshot).filter((name) => ui.stateShowReserved || !(metaByName.get(name)?.reserved ?? false)).sort((a, b) => {
    if (ui.stateSort === "activity") {
      const diff = (model.changeCounts.get(b) ?? 0) - (model.changeCounts.get(a) ?? 0);
      if (diff !== 0) return diff;
    }
    return a.localeCompare(b);
  });
  const ordered = {};
  for (const name of names) ordered[name] = snapshot[name];
  const changedRoots = /* @__PURE__ */ new Set();
  for (const [root, at] of model.changed) {
    if (now - at < FLASH_MS) changedRoots.add(root);
  }
  const tree = jsonTree(ordered, {
    expanded: ui.stateExpanded,
    filter: ui.stateFilter,
    onToggle: () => ctx.refresh(),
    onEdit: travelling ? void 0 : (path, value) => {
      app.setState(path, value);
      ctx.toast(`$${path} = ${previewOf(value)}`);
      ctx.refresh();
    },
    readOnly: (path) => {
      if (travelling) return true;
      const info = metaByName.get(rootOf(path));
      return info?.reserved ?? false;
    },
    highlight: changedRoots,
    decorate: (path, depth) => depth === 0 ? renderAtomTail(ctx, path, metaByName.get(path), maxChanges) : null
  });
  out.push(section(null, h("div", { class: "tree-wrap", [SCROLL_KEY_ATTR]: "state-tree" }, tree), { flush: true }));
  if (names.length === 0) {
    out.push(section(null, faint(
      ui.stateShowReserved ? "This program declares no reactive state." : "No author-declared atoms. Turn on “Runtime” above to see the atoms the runtime owns (route, store and form backing atoms)."
    ), { flush: true }));
  }
  const lastFlush = model.commits[model.commits.length - 1];
  if (lastFlush && lastFlush.changedPaths.length > 0) {
    out.push(section("Last commit changed", h(
      "div",
      { class: "chip-row" },
      ...lastFlush.changedPaths.map((path) => h("button", {
        class: "chip blue is-link",
        title: `Filter to $${rootOf(path)}`,
        onclick: () => {
          ui.stateFilter = rootOf(path);
          ctx.refresh();
        }
      }, path))
    )));
  }
  return out;
}
function renderTreeActions(ctx, meta) {
  const { app, model, ui } = ctx;
  const reservedCount = meta.filter((entry) => entry.reserved).length;
  return h(
    "div",
    { class: "chip-row", style: "margin:0" },
    toggle("Activity", ui.stateSort === "activity", () => {
      ui.stateSort = ui.stateSort === "activity" ? "name" : "activity";
      ctx.refresh();
    }, "Sort by how often each atom changes"),
    reservedCount > 0 ? toggle(`Runtime (${reservedCount})`, ui.stateShowReserved, () => {
      ui.stateShowReserved = !ui.stateShowReserved;
      ctx.refresh();
    }, "Show runtime-owned atoms: route, Store / $form backing atoms") : null,
    button("Expand", () => {
      for (const [name, value] of Object.entries(model.state)) {
        if (value && typeof value === "object") ui.stateExpanded.add(name);
      }
      ctx.refresh();
    }, { title: "Expand every object atom" }),
    ui.stateExpanded.size > 0 ? button("Collapse", () => {
      ui.stateExpanded.clear();
      ctx.refresh();
    }, { title: "Collapse everything" }) : null,
    copyButton(() => safeJson(model.state), "Copy"),
    button("Export", () => downloadText("aktion-state.json", safeJson(model.state)), {
      title: "Download this snapshot as JSON"
    }),
    can(app, "hydrateState") ? button("Import", () => {
      ui.importDraft = safeJson(model.state);
      ctx.refresh();
    }, { title: "Paste a snapshot to restore" }) : null,
    can(app, "resetState") ? button("Reset", () => {
      app.resetState();
      ctx.toast("State reset to declared defaults");
      ctx.refresh();
    }, { title: "Reset every atom to its declared initial value", tone: "warn" }) : null
  );
}
function renderSummary$2(ctx, meta) {
  const { model, ui } = ctx;
  const derived = meta.filter((entry) => entry.computed).length;
  const modules = new Set(meta.map((entry) => entry.module).filter(Boolean)).size;
  const busiest = [...model.changeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const totalChanges = [...model.changeCounts.values()].reduce((a, b) => a + b, 0);
  return section(null, statGrid(
    stat("atoms", String(Object.keys(model.state).length)),
    stat("changes", fmtCount(totalChanges), {
      title: "Individual atom changes observed this session"
    }),
    stat("flushes", fmtCount(model.totals.stateFlushes), {
      title: "Reactive flushes — one per batch of writes, however many atoms it touched"
    }),
    derived > 0 ? stat("derived", String(derived), { title: "Atoms with a `$x = expr` initialiser — re-derived, so an edit is temporary" }) : null,
    modules > 0 ? stat("modules", String(modules), { title: "Modules contributing atoms" }) : null,
    busiest ? stat("busiest", `$${busiest[0]}`, {
      title: `${busiest[1]} changes — click to filter`,
      onClick: () => {
        ui.stateFilter = busiest[0];
        ctx.refresh();
      }
    }) : null,
    stat("snapshots", String(model.history.length), {
      title: "Commits retained for time travel and diffing",
      onClick: model.history.length > 1 ? () => {
        ui.stateView = "diff";
        ctx.refresh();
      } : void 0
    }),
    ui.breakOnChange.size > 0 ? stat("breakpoints", String(ui.breakOnChange.size), { tone: "bad", title: [...ui.breakOnChange].join(", ") }) : null
  ), { flush: true });
}
function renderAtomTail(ctx, name, info, maxChanges) {
  const { model, ui } = ctx;
  const count = model.changeCounts.get(name) ?? 0;
  const armed = ui.breakOnChange.has(name);
  return h(
    "span",
    { class: "row-tail" },
    info?.computed ? chip("derived", "blue", "Recomputed from its initialiser — a manual edit lasts until the next flush") : null,
    info?.module ? chip(shortModule(info.module), "grey", `Declared in ${info.module}`) : null,
    info?.authored && info.authored !== name ? code(`$${info.authored}`, "The name the author wrote") : null,
    count > 0 ? h(
      "span",
      { class: "heat", title: `${count} change${count === 1 ? "" : "s"} this session` },
      h(
        "span",
        { class: "heat-bar" },
        h("span", { class: "heat-fill", style: `width:${Math.max(8, Math.round(count / maxChanges * 100))}%` })
      ),
      h("span", { class: "heat-num" }, fmtCount(count))
    ) : null,
    h("button", {
      class: `brk ${armed ? "is-on" : ""}`,
      title: armed ? `Stop breaking on changes to $${name}` : `Break into the debugger when $${name} changes (needs the browser's DevTools open)`,
      onclick: (event) => {
        event.stopPropagation();
        if (armed) ui.breakOnChange.delete(name);
        else ui.breakOnChange.add(name);
        ctx.toast(armed ? `No longer breaking on $${name}` : `Will break when $${name} changes`);
        ctx.refresh();
      }
    }, armed ? "●" : "○")
  );
}
function renderTimeTravel(ctx) {
  const { model, ui } = ctx;
  const last = model.history.length - 1;
  const index = ui.timeTravel ?? last;
  const entry = model.history[index];
  const slider = h("input", {
    class: "slider",
    type: "range",
    min: "0",
    max: String(last),
    value: String(index),
    [FOCUS_KEY_ATTR]: "travel",
    oninput: (event) => {
      const next = Number(event.target.value);
      ui.timeTravel = next >= last ? null : next;
      ctx.refresh();
    }
  });
  return section("Time travel", [
    h(
      "div",
      { class: "travel-row" },
      button("◀", () => {
        ui.timeTravel = Math.max(0, index - 1);
        ctx.refresh();
      }, { title: "Previous snapshot" }),
      slider,
      button("▶", () => {
        const next = Math.min(last, index + 1);
        ui.timeTravel = next >= last ? null : next;
        ctx.refresh();
      }, { title: "Next snapshot" }),
      button("Live", () => {
        ui.timeTravel = null;
        ctx.refresh();
      }, { active: ui.timeTravel === null, title: "Follow the live store" }),
      button("Diff", () => {
        ui.stateView = "diff";
        ui.diffFrom = index;
        ui.diffTo = last;
        ctx.refresh();
      }, { title: "Compare this snapshot with the latest" })
    ),
    entry ? faint(
      `commit #${entry.commitId ?? "?"} · ${entry.changedPaths.length > 0 ? entry.changedPaths.join(", ") : "no state change"} · ${index + 1} of ${last + 1}`
    ) : null
  ]);
}
function renderDiffView(ctx) {
  const { model, ui } = ctx;
  const history = model.history;
  if (history.length < 2) {
    return [emptyState(
      "Not enough snapshots to compare yet.",
      "A snapshot is captured on every commit — interact with the app a couple of times."
    )];
  }
  const last = history.length - 1;
  const from = clamp(ui.diffFrom ?? Math.max(0, last - 1), 0, last);
  const to = clamp(ui.diffTo ?? last, 0, last);
  const picker = (label, value, onPick) => {
    const select = h("select", {
      class: "app-select",
      title: label,
      onchange: (event) => onPick(Number(event.target.value))
    });
    history.forEach((entry, index) => {
      const option = h(
        "option",
        { value: String(index) },
        `#${entry.commitId ?? index} · ${fmtRel(model.lastTime - entry.time)} ago`
      );
      if (index === value) option.selected = true;
      select.appendChild(option);
    });
    return h("span", { class: "chip-row", style: "margin:0" }, muted(label), select);
  };
  const changes = diffSnapshots(history[from], history[to]);
  const rows = changes.map((change) => h(
    "div",
    { class: `diff-row is-${change.kind}` },
    h("span", { class: "diff-mark" }, change.kind === "added" ? "+" : change.kind === "removed" ? "−" : "~"),
    h("span", { class: "diff-path", title: change.path }, change.path),
    change.kind !== "added" ? h("span", { class: "diff-old" }, change.before) : null,
    change.kind === "changed" ? h("span", { class: "diff-arrow" }, "→") : null,
    change.kind !== "removed" ? h("span", { class: "diff-new" }, change.after) : null
  ));
  return [
    section(null, [
      h(
        "div",
        { class: "detail-head" },
        picker("from", from, (next) => {
          ui.diffFrom = next;
          ctx.refresh();
        }),
        picker("to", to, (next) => {
          ui.diffTo = next;
          ctx.refresh();
        }),
        spacer(),
        button("Latest ↔ previous", () => {
          ui.diffFrom = Math.max(0, last - 1);
          ui.diffTo = last;
          ctx.refresh();
        }, { title: "Compare the two most recent snapshots" })
      ),
      statGrid(
        stat("changed", String(changes.filter((c) => c.kind === "changed").length)),
        stat("added", String(changes.filter((c) => c.kind === "added").length)),
        stat("removed", String(changes.filter((c) => c.kind === "removed").length)),
        stat("apart", fmtRel(Math.abs(history[to].time - history[from].time)))
      )
    ], { flush: true }),
    section(`Changes (${changes.length})`, changes.length === 0 ? h("div", { class: "diff-empty" }, "These two snapshots are identical.") : h("div", { [SCROLL_KEY_ATTR]: "diff-list" }, ...rows)),
    section(null, [
      h(
        "div",
        { class: "detail-head" },
        spacer(),
        copyButton(() => changes.map((c) => `${c.kind === "added" ? "+" : c.kind === "removed" ? "-" : "~"} ${c.path}: ${c.before} -> ${c.after}`).join("\n"), "Copy diff"),
        can(ctx.app, "hydrateState") ? button("Restore “from”", () => {
          ctx.app.hydrateState(history[from].snapshot);
          ctx.toast("Restored the earlier snapshot");
          ctx.refresh();
        }, { tone: "purple", title: "Hydrate the earlier of the two snapshots" }) : null
      ),
      faint("Paths are compared leaf by leaf, so an object that gained one field reports that field rather than the whole object.")
    ], { flush: true })
  ];
}
function diffSnapshots(from, to) {
  const changes = [];
  const walk = (path, before, after, depth) => {
    if (changes.length > 400) return;
    const bothObjects = isPlainObject(before) && isPlainObject(after);
    if (bothObjects && depth < 6) {
      const keys = /* @__PURE__ */ new Set([...Object.keys(before), ...Object.keys(after)]);
      for (const key2 of keys) {
        const nextPath = path === "" ? key2 : `${path}.${key2}`;
        const b = before[key2];
        const a = after[key2];
        if (!(key2 in before)) changes.push({ kind: "added", path: nextPath, before: "", after: previewOf(a) });
        else if (!(key2 in after)) changes.push({ kind: "removed", path: nextPath, before: previewOf(b), after: "" });
        else walk(nextPath, b, a, depth + 1);
      }
      return;
    }
    if (!sameValue(before, after)) {
      changes.push({ kind: "changed", path: path || "(root)", before: previewOf(before), after: previewOf(after) });
    }
  };
  walk("", from.snapshot, to.snapshot, 0);
  return changes;
}
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
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
function renderImport(ctx) {
  const { app, ui } = ctx;
  const area = h("textarea", {
    class: "source-editor",
    style: "min-height:120px",
    spellcheck: "false",
    [FOCUS_KEY_ATTR]: "state-import"
  });
  area.value = ui.importDraft ?? "";
  const status = h("span", {});
  const check = () => {
    try {
      const parsed = JSON.parse(area.value);
      if (!isPlainObject(parsed)) return { ok: false, message: "must be a JSON object of atom names" };
      const keys = Object.keys(parsed);
      return { ok: true, message: `${keys.length} atom${keys.length === 1 ? "" : "s"}`, value: parsed };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "invalid JSON" };
    }
  };
  const showStatus = () => {
    const result = check();
    status.replaceChildren(chip(result.message, result.ok ? "green" : "red"));
  };
  area.addEventListener("input", () => {
    ui.importDraft = area.value;
    showStatus();
  });
  showStatus();
  return section("Import a snapshot", [
    area,
    h(
      "div",
      { class: "detail-head" },
      status,
      faint("Hydrated the way SSR restores state, so the values survive the next replan."),
      spacer(),
      button("Cancel", () => {
        ui.importDraft = null;
        ctx.refresh();
      }),
      button("Restore", () => {
        const result = check();
        if (!result.ok || !result.value || !can(app, "hydrateState")) {
          ctx.toast(result.message, "bad");
          return;
        }
        app.hydrateState(result.value);
        ui.importDraft = null;
        ctx.toast("Snapshot restored");
        ctx.refresh();
      }, { tone: "good" })
    )
  ]);
}
function shortModule(path) {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}
function safeJson(snapshot) {
  try {
    return JSON.stringify(snapshot, null, 2);
  } catch {
    return "/* this snapshot holds a value that cannot be serialised */";
  }
}
const SPLIT_MIN_WIDTH = 700;
const inspectTab = {
  id: "inspect",
  label: "Inspect",
  icon: "◎",
  hint: "Component tree, live props / state editing, and DOM inspection",
  badge: (ctx) => {
    const overrides = can(ctx.app, "listPropOverrides") ? ctx.app.listPropOverrides().length : 0;
    return overrides > 0 ? overrides : null;
  },
  render: (ctx) => render$c(ctx)
};
function render$c(ctx) {
  const { app, ui } = ctx;
  if (!can(app, "getComponentTree")) {
    return [emptyState(
      "This app does not expose a component tree.",
      "The inspector needs a runtime built with DevTools protocol 2 or newer."
    )];
  }
  const nodes = ctx.cache("tree", () => app.getComponentTree());
  const aggregates = ctx.cache("instanceAggregates", () => instanceAggregates(ctx.model.commits));
  const overrides = can(app, "listPropOverrides") ? app.listPropOverrides() : [];
  const visible = visibleNodes(ctx, nodes);
  const bar = toolbar(
    button(
      ctx.overlay.isPicking ? "◎ Picking… (Esc)" : "◎ Pick",
      () => ctx.togglePicker(),
      {
        title: "Select an element on the page to inspect it — Ctrl+Shift+P, Esc to cancel",
        active: ctx.overlay.isPicking
      }
    ),
    searchInput(ui.inspectFilter, (value) => {
      ui.inspectFilter = value;
      ctx.refresh();
    }, "Filter components…", { focusKey: "inspect-filter" }),
    toggle("Library", ui.inspectShowLibrary, () => {
      ui.inspectShowLibrary = !ui.inspectShowLibrary;
      ctx.refresh();
    }, "Show built-in library components as well as your own"),
    toggle("Highlight", ui.highlightUpdates, () => {
      ui.highlightUpdates = !ui.highlightUpdates;
      if (!ui.highlightUpdates) ctx.overlay.clearUpdateFlashes();
      ctx.toast(ui.highlightUpdates ? "Outlining components as they re-render" : "Highlighting off");
      ctx.refresh();
    }, "Outline components on the page as they re-render"),
    spacer(),
    muted(`${visible.length}${visible.length === nodes.length ? "" : ` / ${nodes.length}`} instance${nodes.length === 1 ? "" : "s"}`),
    button("⊟", () => {
      for (const node of nodes) {
        if (nodes.some((other) => other.parentKey === node.instanceKey)) ui.inspectCollapsed.add(node.instanceKey);
      }
      ctx.refresh();
    }, { title: "Collapse every subtree" }),
    button("⊞", () => {
      ui.inspectCollapsed.clear();
      ctx.refresh();
    }, { title: "Expand every subtree" })
  );
  const out = [bar];
  if (overrides.length > 0) {
    out.push(section(null, h(
      "div",
      { class: "banner t-amber" },
      h("span", {}, `${overrides.length} prop override${overrides.length === 1 ? "" : "s"} active — the UI is showing DevTools values, not the program's.`),
      spacer(),
      button("Clear all", () => {
        if (!can(app, "clearPropOverride")) return;
        for (const entry of overrides) app.clearPropOverride(entry.instanceKey, entry.prop);
        ctx.toast("Overrides cleared");
        ctx.refresh();
      }, { tone: "amber" })
    ), { flush: true }));
  }
  const tree = renderTree(ctx, visible, aggregates);
  const detail = renderDetailPane(ctx, nodes, aggregates);
  if (ctx.width() >= SPLIT_MIN_WIDTH) {
    out.push(h(
      "div",
      { class: "split" },
      h("div", { class: "split-left", [SCROLL_KEY_ATTR]: "inspect-tree" }, tree),
      h("div", { class: "split-right", [SCROLL_KEY_ATTR]: "inspect-detail" }, ...detail)
    ));
  } else {
    out.push(h("div", { class: "tree-wrap", [SCROLL_KEY_ATTR]: "inspect-tree" }, tree));
    out.push(...detail);
  }
  return out;
}
function visibleNodes(ctx, nodes) {
  const { ui } = ctx;
  const filter = ui.inspectFilter.trim().toLowerCase();
  if (filter !== "") {
    return nodes.filter((node) => node.name.toLowerCase().includes(filter) || node.instanceKey.toLowerCase().includes(filter)).map((node) => ({ ...node, depth: 0, parentKey: null }));
  }
  if (ui.inspectShowLibrary) return [...nodes];
  const byKey = new Map(nodes.map((node) => [node.instanceKey, node]));
  const keep = (node) => node.kind === "user";
  const nearestKeptAncestor = (node) => {
    let current = node.parentKey ? byKey.get(node.parentKey) ?? null : null;
    let guard = 0;
    while (current && guard++ < 200) {
      if (keep(current)) return current;
      current = current.parentKey ? byKey.get(current.parentKey) ?? null : null;
    }
    return null;
  };
  const depths = /* @__PURE__ */ new Map();
  const out = [];
  for (const node of nodes) {
    if (!keep(node)) continue;
    const parent = nearestKeptAncestor(node);
    const depth = parent ? (depths.get(parent.instanceKey) ?? 0) + 1 : 0;
    depths.set(node.instanceKey, depth);
    out.push({ ...node, depth, parentKey: parent?.instanceKey ?? null });
  }
  return out;
}
function renderTree(ctx, visible, aggregates) {
  const { ui } = ctx;
  const wrap = h("div", { class: "tree comp-tree", tabindex: "0" });
  const hasChildren = new Set(visible.map((node) => node.parentKey).filter((key2) => key2 !== null));
  const hidden = /* @__PURE__ */ new Set();
  const byParent = /* @__PURE__ */ new Map();
  for (const node of visible) {
    if (node.parentKey === null) continue;
    const bucket = byParent.get(node.parentKey);
    if (bucket) bucket.push(node);
    else byParent.set(node.parentKey, [node]);
  }
  const hideSubtree = (key2) => {
    for (const child of byParent.get(key2) ?? []) {
      if (hidden.has(child.instanceKey)) continue;
      hidden.add(child.instanceKey);
      hideSubtree(child.instanceKey);
    }
  };
  for (const node of visible) {
    if (ui.inspectCollapsed.has(node.instanceKey)) hideSubtree(node.instanceKey);
  }
  const rows = visible.filter((node) => !hidden.has(node.instanceKey));
  wrap.addEventListener("keydown", (event) => {
    const index = rows.findIndex((node) => node.instanceKey === ui.selectedInstance);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = rows[Math.max(0, Math.min(rows.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))];
      if (next) selectRow(ctx, next.instanceKey);
    } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      const node = rows[index];
      if (!node) return;
      event.preventDefault();
      if (event.key === "ArrowRight") ui.inspectCollapsed.delete(node.instanceKey);
      else ui.inspectCollapsed.add(node.instanceKey);
      ctx.refresh();
    }
  });
  let revealRow = null;
  for (const node of rows) {
    const agg = aggregates.get(node.instanceKey);
    const collapsed = ui.inspectCollapsed.has(node.instanceKey);
    const expandable = hasChildren.has(node.instanceKey);
    const selected = ui.selectedInstance === node.instanceKey;
    const row = h(
      "div",
      {
        class: `row ct-row ${selected ? "is-selected" : ""} ${node.mounted === false ? "is-unmounted" : ""}`,
        style: `padding-left:${6 + node.depth * 13}px`,
        title: node.instanceKey,
        onclick: () => selectRow(ctx, node.instanceKey),
        onmouseenter: () => ctx.highlightInstance(node.instanceKey, false),
        onmouseleave: () => ctx.overlay.hideHover()
      },
      h("span", {
        class: `twist ${expandable ? "" : "is-leaf"}`,
        onclick: expandable ? (event) => {
          event.stopPropagation();
          if (collapsed) ui.inspectCollapsed.delete(node.instanceKey);
          else ui.inspectCollapsed.add(node.instanceKey);
          ctx.refresh();
        } : void 0
      }, expandable ? collapsed ? "▸" : "▾" : "·"),
      h("span", { class: `ct-name ${node.kind === "user" ? "is-user" : ""}` }, node.name),
      node.explicitKey ? h("span", { class: "ct-key" }, `key=${truncateMiddle(node.explicitKey, 16)}`) : null,
      node.phase === "memo" ? chip("memo", "grey", "Skipped by memoization in the last commit") : null,
      node.mounted === false ? chip("no dom", "amber", "Renders a fragment with no host element, so there is nothing to highlight") : null,
      h("span", { class: "grow" }),
      node.propCount ? h("span", { class: "ct-meta", title: `${node.propCount} props` }, `${node.propCount}p`) : null,
      agg && agg.renders > 0 ? h("span", { class: "ct-meta", title: `${agg.renders} render(s), ${agg.memo} memoized` }, `×${agg.renders}`) : null,
      h("span", { class: "ct-time" }, node.selfTime > 0 ? fmtMs(node.selfTime) : "—")
    );
    if (ui.inspectReveal === node.instanceKey) revealRow = row;
    wrap.appendChild(row);
  }
  if (revealRow) {
    const target = revealRow;
    ui.inspectReveal = null;
    queueMicrotask(() => {
      if (target.isConnected) target.scrollIntoView({ block: "nearest" });
    });
  } else if (ui.inspectReveal !== null && rows.length > 0) {
    ui.inspectReveal = null;
  }
  if (rows.length === 0) {
    wrap.appendChild(h(
      "div",
      { class: "empty" },
      h("p", {}, ui.inspectFilter ? "No component matches the filter." : "No component instances yet."),
      ui.inspectFilter ? h("p", { class: "faint" }, "Clear the filter, or search by instance key.") : !ui.inspectShowLibrary ? h("p", { class: "faint" }, "This program declares no `function` components — turn on “Library” to see the built-ins it uses.") : h("p", { class: "faint" }, "Interact with the app, or press Force render on the Overview tab.")
    ));
  }
  return wrap;
}
function selectRow(ctx, instanceKey) {
  ctx.ui.selectedInstance = instanceKey;
  ctx.ui.selectedElement = null;
  ctx.highlightInstance(instanceKey, true);
  ctx.refresh();
}
function renderDetailPane(ctx, nodes, aggregates) {
  const { app, ui } = ctx;
  if (ui.selectedInstance) {
    const detail = can(app, "getInstance") ? app.getInstance(ui.selectedInstance) : null;
    if (detail) return renderDetail$1(ctx, detail, nodes, aggregates);
    return [section("Selection", [
      faint("That instance is no longer in the tree — it unmounted, or the program was replanned."),
      h("div", { class: "detail-head" }, button("Clear selection", () => {
        ui.selectedInstance = null;
        ctx.overlay.clear();
        ctx.refresh();
      }))
    ])];
  }
  if (ui.selectedElement) return renderElementOnly(ctx, ui.selectedElement);
  return [section(null, [
    faint("Select a component on the left, or use ◎ Pick to click one on the page."),
    h(
      "div",
      { class: "detail-head" },
      button("◎ Pick an element", () => ctx.togglePicker(), { tone: "good" }),
      nodes.length > 0 ? button(`Select ${nodes[0].name}`, () => selectRow(ctx, nodes[0].instanceKey), { title: "Select the root component" }) : null
    )
  ], { flush: true })];
}
function renderDetail$1(ctx, detail, nodes, aggregates) {
  const { app, ui } = ctx;
  const agg = aggregates.get(detail.instanceKey);
  const element = can(app, "nodeForInstance") ? app.nodeForInstance(detail.instanceKey) : null;
  const crumbs = h("div", { class: "crumbs" });
  for (const ancestor of detail.ancestors) {
    crumbs.appendChild(h("button", {
      class: "crumb",
      title: ancestor,
      onclick: () => selectRow(ctx, ancestor),
      onmouseenter: () => ctx.highlightInstance(ancestor, false),
      onmouseleave: () => ctx.overlay.hideHover()
    }, shortInstanceLabel(ancestor).replace(/[@=].*$/, "")));
    crumbs.appendChild(h("span", { class: "crumb-sep" }, "›"));
  }
  crumbs.appendChild(h("span", { class: "crumb is-current" }, detail.name));
  const header = section(null, [
    crumbs,
    h(
      "div",
      { class: "detail-head" },
      h("span", { class: "detail-title" }, detail.name),
      chip(detail.kind, detail.kind === "user" ? "purple" : "grey"),
      detail.source ? code(`L${detail.source.line}:${detail.source.column}`) : null,
      spacer(),
      element ? button("Scroll to", () => {
        element.scrollIntoView({ block: "center", behavior: "smooth" });
        ctx.highlightInstance(detail.instanceKey, true);
      }, { title: "Scroll the element into view and highlight it" }) : null,
      can(app, "remountInstance") ? button("Remount", () => {
        app.remountInstance(detail.instanceKey);
        ctx.toast(`Remounted ${detail.name}`);
        ctx.refresh();
      }, { title: "Drop this instance's memo, hooks, and UI state so it mounts fresh" }) : null,
      copyButton(() => detail.instanceKey, "Copy key")
    ),
    statGrid(
      stat("renders", String(agg?.renders ?? 0), { title: "Times this instance's body actually ran" }),
      stat("memoized", String(agg?.memo ?? 0), { title: "Times it was skipped because nothing it reads changed" }),
      stat("self time", fmtMs(agg?.total), { title: "Total body time across those renders" }),
      stat("slowest", fmtMs(agg?.max)),
      stat("dom nodes", detail.domNodes !== void 0 ? String(detail.domNodes) : "—"),
      stat("effects", String(detail.effects.length))
    )
  ], { flush: true });
  const paneCounts = {
    props: detail.props.length,
    hooks: detail.hooks.length + detail.uiState.length
  };
  const panes = [
    { value: "props", label: `Props${paneCounts.props ? ` ${paneCounts.props}` : ""}`, title: "Arguments this instance received" },
    { value: "hooks", label: `State${paneCounts.hooks ? ` ${paneCounts.hooks}` : ""}`, title: "Per-instance $state / $memo cells and library UI state" },
    { value: "dom", label: "DOM", title: "Box model, attributes, and markup" },
    { value: "styles", label: "Styles", title: "Computed styles and theme variables in effect" },
    { value: "a11y", label: "A11y", title: "Role, accessible name, and ARIA wiring" },
    { value: "source", label: "Source", title: "Where this instance is written in the program" }
  ];
  const tabs = section(null, chipGroup(panes, ui.inspectPane, (value) => {
    ui.inspectPane = value;
    ctx.refresh();
  }), { flush: true });
  const body = [];
  switch (ui.inspectPane) {
    case "props":
      body.push(...renderProps(ctx, detail));
      break;
    case "hooks":
      body.push(...renderComponentState(ctx, detail));
      break;
    case "dom":
      body.push(...renderDom(ctx, detail, element));
      break;
    case "styles":
      body.push(...renderStyles(ctx, element));
      break;
    case "a11y":
      body.push(...renderA11y$1(ctx, element));
      break;
    case "source":
      body.push(...renderSource(ctx, detail));
      break;
  }
  const deps = detail.deps.length > 0 ? section("Reads", [
    h("div", { class: "chip-row" }, ...detail.deps.map((dep) => h("button", {
      class: "chip blue is-link",
      title: `Show $${dep} in the State tab`,
      onclick: () => {
        ui.stateFilter = dep.split(".")[0] ?? dep;
        ctx.selectTab("state");
      }
    }, `$${dep}`))),
    faint("These are the reactive paths this body read last render — its memo dependencies. A change to any of them re-renders it.")
  ]) : null;
  const kids = nodes.filter((node) => node.parentKey === detail.instanceKey);
  const children = kids.length > 0 ? section(`Children (${kids.length})`, h("div", { class: "chip-row" }, ...kids.slice(0, 24).map((kid) => h("button", {
    class: "chip grey is-link",
    onclick: () => selectRow(ctx, kid.instanceKey),
    onmouseenter: () => ctx.highlightInstance(kid.instanceKey, false),
    onmouseleave: () => ctx.overlay.hideHover()
  }, kid.name)))) : null;
  return [header, tabs, ...body, deps, children].filter((node) => node != null);
}
function renderProps(ctx, detail) {
  const { app } = ctx;
  const editable = can(app, "setPropOverride");
  if (detail.props.length === 0 && (detail.overrides?.length ?? 0) === 0) {
    return [section("Props", [
      faint("This instance received no arguments."),
      editable ? renderAddOverride(ctx, detail) : null
    ].filter((node) => node != null))];
  }
  return [
    section("Props", [
      h("div", { class: "prop-list" }, ...detail.props.map((prop) => renderPropRow(ctx, detail, prop, editable))),
      editable ? renderAddOverride(ctx, detail) : null,
      editable ? faint("A $-bound prop writes the atom. Any other prop takes a DevTools override that lasts until you clear it.") : faint("This runtime does not support prop overrides.")
    ].filter((node) => node != null))
  ];
}
function renderPropRow(ctx, detail, prop, editable) {
  const { app } = ctx;
  const readOnly = prop.value.json === void 0;
  const commit = (next) => {
    if (prop.stateRef && app) {
      app.setState(prop.stateRef, next);
      ctx.toast(`$${prop.stateRef} updated`);
    } else if (can(app, "setPropOverride")) {
      app.setPropOverride(detail.instanceKey, prop.name, next);
      ctx.toast(`${detail.name}.${prop.name} overridden`);
    }
    ctx.refresh();
  };
  return h(
    "div",
    { class: `prop-row ${prop.overridden ? "is-overridden" : ""}` },
    h("span", { class: "prop-name" }, prop.name),
    prop.stateRef ? chip(`$${prop.stateRef}`, "blue", "Two-way bound: editing this writes the atom") : null,
    prop.overridden ? chip("override", "amber", "Value forced by DevTools") : null,
    h("span", { class: "grow" }),
    readOnly || !editable ? valueSpan(prop.value, {
      title: readOnly ? "This value cannot be edited — it is a function, a live resource, or a DOM node" : void 0
    }) : editableValue(prop.value, commit, { focusKey: `${detail.instanceKey}:${prop.name}` }),
    prop.value.json !== void 0 ? copyButton(() => prop.value.json ?? "", "⧉") : null,
    prop.overridden && can(app, "clearPropOverride") ? button("↺", () => {
      app.clearPropOverride(detail.instanceKey, prop.name);
      ctx.toast(`${prop.name} restored`);
      ctx.refresh();
    }, { title: "Restore the program's value" }) : null
  );
}
function renderAddOverride(ctx, detail) {
  let name = "";
  let value = "";
  const apply = () => {
    const prop = name.trim();
    if (prop === "" || !can(ctx.app, "setPropOverride")) return;
    ctx.app.setPropOverride(detail.instanceKey, prop, parseEditedValue(value));
    ctx.toast(`${detail.name}.${prop} overridden`);
    ctx.refresh();
  };
  return h(
    "div",
    { class: "prop-row is-add" },
    h("span", { class: "prop-name faint" }, "＋"),
    textField({
      focusKey: `${detail.instanceKey}:new-prop-name`,
      placeholder: "prop name",
      width: "120px",
      onInput: (next) => {
        name = next;
      }
    }),
    textField({
      focusKey: `${detail.instanceKey}:new-prop-value`,
      placeholder: 'value — "danger", 12, true, { "gap": 8 }',
      onInput: (next) => {
        value = next;
      },
      onEnter: apply
    }),
    button("Override", apply, { title: "Force this prop on the selected instance" })
  );
}
function renderComponentState(ctx, detail) {
  const { app } = ctx;
  const out = [];
  if (detail.hooks.length > 0) {
    out.push(section("Hooks — $state / $memo cells", [
      h("div", { class: "prop-list" }, ...detail.hooks.map((hook) => h(
        "div",
        { class: "prop-row" },
        h("span", { class: "prop-name mono", title: "Hooks are matched by call order, so the slot index is the address" }, `[${hook.slot}]`),
        chip(hook.kind, hook.kind === "state" ? "green" : "grey"),
        h("span", { class: "grow" }),
        hook.editable && can(app, "setInstanceHook") ? editableValue(hook.value, (next) => {
          const ok = app.setInstanceHook(detail.instanceKey, hook.slot, next);
          ctx.toast(ok ? `slot ${hook.slot} updated` : `slot ${hook.slot} is read-only`, ok ? "good" : "warn");
          ctx.refresh();
        }, { focusKey: `${detail.instanceKey}:hook:${hook.slot}` }) : valueSpan(hook.value, {
          title: hook.kind === "memo" ? "A $memo is recomputed from its deps — edit what it reads instead" : "read-only"
        })
      ))),
      faint("These are this instance's own cells. Two instances of the same component hold different ones.")
    ]));
  }
  if (detail.uiState.length > 0) {
    out.push(section("Component UI state", [
      h("div", { class: "prop-list" }, ...detail.uiState.map((slot) => h(
        "div",
        { class: "prop-row" },
        h("span", { class: "prop-name mono" }, slot.key),
        h("span", { class: "grow" }),
        slot.editable && can(app, "setInstanceUiState") ? editableValue(slot.value, (next) => {
          const ok = app.setInstanceUiState(detail.instanceKey, slot.key, next);
          ctx.toast(ok ? `${slot.key} updated` : `${slot.key} no longer exists`, ok ? "good" : "warn");
          ctx.refresh();
        }, { focusKey: `${detail.instanceKey}:ui:${slot.key}` }) : valueSpan(slot.value)
      ))),
      faint("The slots a library component keeps for itself — a Tabs' active pane, a Popover's open flag, a DataGrid's sort. They never appear in $state.")
    ]));
  }
  if (detail.effects.length > 0) {
    out.push(section(
      `Effects owned by this instance (${detail.effects.length})`,
      h("div", { class: "chip-row" }, ...detail.effects.map((key2) => h("button", {
        class: "chip purple is-link",
        title: "Open in the Effects tab",
        onclick: () => {
          ctx.ui.selectedEffect = key2;
          ctx.selectTab("effects");
        }
      }, key2.slice(key2.lastIndexOf("::") + 2))))
    ));
  }
  if (out.length === 0) {
    out.push(section("State", faint(
      "This instance holds no per-instance state. A library component only allocates a slot when it needs one, and a user component only when it calls $state / $memo."
    )));
  }
  return out;
}
function renderDom(ctx, detail, element) {
  if (!element) {
    return [section("DOM", faint(
      "No DOM node carries this instance's tag. Either it renders a fragment (Show / Async / Lazy with no host), or DOM tagging is off in Settings."
    ))];
  }
  return [
    section("Element", [
      h(
        "div",
        { class: "detail-head" },
        code(describeElement(element)),
        spacer(),
        copyButton(() => cssPath(element, null), "Copy selector"),
        copyButton(() => element.outerHTML, "Copy HTML"),
        button("Log", () => {
          console.log("[aktion-devtools] selected element", element);
          ctx.toast("Logged to the page console");
        }, { title: "console.log the live element so you can poke at it" })
      ),
      boxModelDiagram(element)
    ]),
    section("Attributes", attributeTable(element)),
    section("Markup", h("pre", { class: "code-pre" }, detail.html ?? element.outerHTML))
  ];
}
function boxModelDiagram(element) {
  const box = measureBox(element);
  if (!box) return faint("This element has no layout to measure.");
  const side = (value) => value === 0 ? "-" : String(Math.round(value * 100) / 100);
  const ring = (name, sides2, inner) => h(
    "div",
    { class: `bm bm-${name}` },
    h("span", { class: "bm-label" }, name),
    h("span", { class: "bm-t" }, side(sides2.top)),
    h("span", { class: "bm-r" }, side(sides2.right)),
    h("span", { class: "bm-b" }, side(sides2.bottom)),
    h("span", { class: "bm-l" }, side(sides2.left)),
    inner
  );
  const content = h(
    "div",
    { class: "bm bm-content" },
    `${Math.round(box.content.width)} × ${Math.round(box.content.height)}`
  );
  return h(
    "div",
    { class: "bm-wrap" },
    ring("margin", box.margin, ring("border", box.border, ring("padding", box.padding, content)))
  );
}
function attributeTable(element) {
  const attrs = [...element.attributes].filter((attr) => attr.name !== "data-aktion-instance" && attr.name !== "data-aktion-owner").map((attr) => ({ name: attr.name, value: attr.value }));
  if (attrs.length === 0) return faint("No attributes.");
  return table(
    [
      { key: "name", label: "Attribute", render: (row) => code(row.name) },
      { key: "value", label: "Value", render: (row) => h("span", { class: "mono wrap" }, row.value === "" ? " " : row.value) }
    ],
    attrs
  );
}
function renderStyles(ctx, element) {
  if (!element) return [section("Styles", faint("Select an element with a DOM node to read its computed styles."))];
  const filter = ctx.ui.computedFilter.trim().toLowerCase();
  const out = [
    section(null, toolbar(
      searchInput(ctx.ui.computedFilter, (value) => {
        ctx.ui.computedFilter = value;
        ctx.refresh();
      }, "Filter properties…", { focusKey: "computed-filter" })
    ), { flush: true })
  ];
  for (const group of COMPUTED_GROUPS) {
    const rows = computedGroup(element, group.props).filter(([prop, value]) => filter === "" || prop.includes(filter) || value.toLowerCase().includes(filter));
    if (rows.length === 0) continue;
    out.push(section(group.title, defList(rows.map(([prop, value]) => [prop, h("span", { class: "mono" }, value)]))));
  }
  const vars = cssVariables(element).filter(([name, value]) => filter === "" || name.includes(filter) || value.toLowerCase().includes(filter));
  if (vars.length > 0) {
    out.push(section(`Theme variables in effect (${vars.length})`, [
      defList(vars.slice(0, 80).map(([name, value]) => [
        name,
        h(
          "span",
          { class: "mono" },
          isColor$1(value) ? h("span", { class: "swatch", style: `background:${value}` }) : null,
          value
        )
      ])),
      h(
        "div",
        { class: "detail-head" },
        faint("These are the resolved --rui-* custom properties."),
        spacer(),
        button("Edit tokens", () => ctx.selectTab("theme"), { title: "Open the Theme tab" })
      )
    ]));
  }
  if (out.length === 1) out.push(section(null, faint("No computed properties match the filter."), { flush: true }));
  return out;
}
function isColor$1(value) {
  return /^(#|rgb|hsl|color\()/i.test(value.trim());
}
function renderA11y$1(ctx, element) {
  if (!element) return [section("Accessibility", faint("Select an element with a DOM node."))];
  const summary = a11ySummary(element);
  const audit = auditAccessibility(element.parentElement ?? element, { limit: 500 });
  const own = audit.findings.filter((f) => f.element === element || element.contains(f.element));
  return [
    section("Accessibility properties", summary.length > 0 ? defList(summary.map(([key2, value]) => [key2, h("span", { class: "mono" }, value)])) : faint("No ARIA attributes, role, or accessible name.")),
    section(`Findings in this subtree (${own.length})`, [
      own.length === 0 ? h("div", { class: "insight t-good" }, h("span", { class: "insight-ic" }, "✓"), h("span", {}, "No accessibility problems found here.")) : h("div", {}, ...own.slice(0, 12).map((finding) => h(
        "div",
        { class: `insight t-${finding.impact === "critical" || finding.impact === "serious" ? "bad" : "warn"}` },
        h("span", { class: "insight-ic" }, finding.impact === "critical" ? "✖" : "▲"),
        h(
          "span",
          {},
          h("b", {}, `${finding.rule}: `),
          finding.message,
          " ",
          faint(finding.help)
        ),
        spacer(),
        button("Show", () => ctx.overlay.highlight(finding.element, {}, true), { title: "Highlight the element" })
      ))),
      h(
        "div",
        { class: "detail-head" },
        spacer(),
        button("Audit the whole app", () => {
          ctx.ui.testPane = "a11y";
          ctx.ui.a11yRequested = true;
          ctx.selectTab("test");
        }, { title: "Run the full audit in the Test tab" })
      )
    ])
  ];
}
function renderSource(ctx, detail) {
  const { app } = ctx;
  if (!detail.source || !app) {
    return [section("Source", faint("This instance carries no source position (it may come from a compiled program)."))];
  }
  const program = app.getProgram();
  const lines = program.split("\n");
  const line = detail.source.line;
  const from = Math.max(0, line - 6);
  const to = Math.min(lines.length, line + 5);
  const excerpt = h("div", { class: "code-block" });
  for (let i = from; i < to; i += 1) {
    excerpt.appendChild(h(
      "div",
      { class: `code-line ${i + 1 === line ? "is-focus" : ""}` },
      h("span", { class: "code-gutter" }, String(i + 1)),
      h("span", { class: "code-text" }, lines[i] ?? "")
    ));
  }
  return [
    section(`Source — line ${line}, column ${detail.source.column}`, [
      excerpt,
      h(
        "div",
        { class: "detail-head" },
        spacer(),
        button("Open in Source tab", () => {
          ctx.ui.sourceFocusLine = line;
          ctx.selectTab("source");
        }, { title: "Jump to this line in the full program" })
      )
    ])
  ];
}
function renderElementOnly(ctx, element) {
  return [
    section(null, [
      h(
        "div",
        { class: "detail-head" },
        h("span", { class: "detail-title" }, describeElement(element)),
        chip("no component", "amber", "This node was not produced by an Aktion component"),
        spacer(),
        button("Clear", () => {
          ctx.ui.selectedElement = null;
          ctx.overlay.clear();
          ctx.refresh();
        }, { title: "Clear the selection" })
      ),
      faint("This element is not tagged with a component instance — it may be a text host, a preserved widget's internals, or part of the host page.")
    ], { flush: true }),
    section("Element", boxModelDiagram(element)),
    section("Attributes", attributeTable(element)),
    ...renderStyles(ctx, element)
  ];
}
const devtoolsExtraStyles = `
/* ---- Shared layout ---- */
.sec-head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
.sec-head .section-title { margin: 0; }
.section.is-flush { padding: 0; }
.section.is-flush .sec-head { padding: 8px 10px 0; }
.grow { flex: 1 1 auto; min-width: 0; }
.pad-sm { padding: 8px 10px; }
.wrap { white-space: pre-wrap; word-break: break-word; }
.mono { font-family: var(--dt-mono); }
code.mono { background: var(--dt-bg-inset); padding: 0 3px; border-radius: 3px; }
.chip-row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-top: 4px; }
.chip.is-link, .inline-link { cursor: pointer; appearance: none; border: none; }
.chip.is-link:hover { filter: brightness(1.25); }
.inline-link {
  background: none;
  color: var(--dt-accent);
  font: inherit;
  padding: 0;
  text-decoration: underline;
  cursor: pointer;
}
.banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 11px;
  border-top: 1px solid var(--dt-border);
  border-bottom: 1px solid var(--dt-border);
  background: var(--dt-bg-inset);
}
.banner.t-amber { border-left: 3px solid var(--dt-amber); }
.banner.t-red { border-left: 3px solid var(--dt-red); color: var(--dt-red); }
.banner.t-purple { border-left: 3px solid var(--dt-purple); }
.legend { display: flex; gap: 10px; padding: 4px 10px 8px; font-size: 10px; color: var(--dt-text-faint); }
.legend .sw { display: inline-block; width: 8px; height: 8px; margin-right: 4px; border-radius: 2px; background: var(--dt-blue); }
.legend .sw.is-initial { background: var(--dt-green); }
.legend .sw.is-full { background: var(--dt-amber); }
.swatch {
  display: inline-block;
  width: 11px;
  height: 11px;
  margin-right: 5px;
  border-radius: 3px;
  border: 1px solid var(--dt-border-strong);
  vertical-align: -1px;
}
.slider { flex: 1; accent-color: var(--dt-accent); }
.travel-row { display: flex; align-items: center; gap: 8px; }
.row-tail { display: inline-flex; align-items: center; gap: 4px; }

/* ---- Definition lists (detail panes) ---- */
.deflist {
  display: grid;
  grid-template-columns: minmax(90px, 34%) 1fr;
  gap: 2px 10px;
  font-size: 11px;
}
.deflist .dt { color: var(--dt-text-faint); font-family: var(--dt-mono); }
.deflist .dd { color: var(--dt-text); overflow-wrap: anywhere; }

/* ---- Disclosure ---- */
.disc { border-bottom: 1px solid var(--dt-border); }
.disc-head { display: flex; align-items: center; gap: 6px; padding: 5px 10px; cursor: pointer; font-size: 11px; }
.disc-head:hover { background: rgba(255,255,255,0.03); }
.disc-label { font-family: var(--dt-mono); }
.disc-body { padding: 0 10px 8px 24px; }

/* ---- Tables ---- */
.dt-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--dt-bg-raised);
  white-space: nowrap;
}
.dt-table tbody tr.is-selected { background: var(--dt-accent-soft); }
.dt-table td { vertical-align: top; }

/* ---- Component tree (Inspect) ---- */
.comp-tree { max-height: 320px; overflow: auto; }
.ct-row { cursor: pointer; gap: 5px; min-height: var(--dt-row); }
.ct-row.is-selected { background: var(--dt-accent-soft); }
.ct-row.is-unmounted { opacity: 0.55; }
.ct-name { font-family: var(--dt-mono); color: var(--dt-text-dim); }
.ct-name.is-user { color: var(--dt-purple); font-weight: 600; }
.ct-key { font-size: 9.5px; color: var(--dt-text-faint); font-family: var(--dt-mono); }
.ct-meta { font-size: 9.5px; color: var(--dt-text-faint); font-variant-numeric: tabular-nums; }
.ct-time {
  flex: 0 0 52px;
  text-align: right;
  font-family: var(--dt-mono);
  font-size: 10px;
  color: var(--dt-text-faint);
}

/* ---- Detail header + breadcrumbs ---- */
.crumbs { display: flex; align-items: center; gap: 3px; flex-wrap: wrap; margin-bottom: 6px; }
.crumb {
  appearance: none;
  background: none;
  border: none;
  color: var(--dt-text-faint);
  font: 500 10.5px var(--dt-mono);
  cursor: pointer;
  padding: 0;
}
.crumb:hover { color: var(--dt-accent); }
.crumb.is-current { color: var(--dt-text); font-weight: 700; cursor: default; }
.crumb-sep { color: var(--dt-text-faint); font-size: 10px; }
.detail-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 6px 0; }
.detail-title { font-weight: 700; font-size: 12.5px; }

/* ---- Prop / slot rows ---- */
.prop-list { display: flex; flex-direction: column; }
.prop-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  font-size: 11px;
  min-height: var(--dt-row);
}
.prop-row.is-overridden { background: rgba(240,179,94,0.08); }
.prop-row.is-add { gap: 5px; padding-top: 6px; }
.prop-name { font-family: var(--dt-mono); color: var(--dt-purple); flex: 0 0 auto; }
.v.is-editable { cursor: text; border-bottom: 1px dashed var(--dt-border-strong); }
.v.is-editable:hover { border-bottom-color: var(--dt-accent); }
.v.is-readonly { opacity: 0.75; }

/* ---- Box model ---- */
.bm-wrap { padding: 6px 0; font-size: 9.5px; font-family: var(--dt-mono); }
.bm {
  position: relative;
  padding: 15px;
  text-align: center;
  border: 1px dashed var(--dt-border-strong);
  border-radius: 3px;
}
.bm-label {
  position: absolute;
  top: 1px;
  left: 4px;
  font-size: 8.5px;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--dt-text-faint);
}
.bm-t { position: absolute; top: 1px; left: 50%; transform: translateX(-50%); }
.bm-b { position: absolute; bottom: 1px; left: 50%; transform: translateX(-50%); }
.bm-l { position: absolute; left: 3px; top: 50%; transform: translateY(-50%); }
.bm-r { position: absolute; right: 3px; top: 50%; transform: translateY(-50%); }
.bm-margin { background: rgba(246,178,107,0.16); }
.bm-border { background: rgba(255,229,153,0.16); }
.bm-padding { background: rgba(147,196,125,0.16); }
.bm-content {
  background: rgba(111,168,220,0.22);
  padding: 10px 6px;
  color: var(--dt-text);
  border: 1px solid var(--dt-border);
  border-radius: 3px;
}

/* ---- Code ---- */
.code-block {
  font-family: var(--dt-mono);
  font-size: 10.5px;
  line-height: 1.5;
  max-height: 340px;
  overflow: auto;
  background: var(--dt-bg-inset);
  border: 1px solid var(--dt-border);
  border-radius: 6px;
}
.code-line { display: flex; gap: 8px; padding: 0 4px; white-space: pre; }
.code-line:hover { background: rgba(255,255,255,0.04); }
.code-line.is-focus { background: var(--dt-accent-soft); }
.code-line.has-marker.t-bad { background: rgba(248,113,113,0.12); }
.code-line.has-marker.t-warn { background: rgba(240,179,94,0.12); }
.code-gutter {
  flex: 0 0 34px;
  text-align: right;
  color: var(--dt-text-faint);
  user-select: none;
  border-right: 1px solid var(--dt-border);
  padding-right: 5px;
}
.code-line.has-marker .code-gutter { color: var(--dt-red); font-weight: 700; }
.code-text { flex: 1; color: var(--dt-text); }
.code-pre {
  margin: 0;
  padding: 7px 9px;
  font-family: var(--dt-mono);
  font-size: 10.5px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow: auto;
  background: var(--dt-bg-inset);
  border: 1px solid var(--dt-border);
  border-radius: 6px;
  color: var(--dt-text);
}
.source-editor {
  width: 100%;
  min-height: 260px;
  resize: vertical;
  font-family: var(--dt-mono);
  font-size: 10.5px;
  line-height: 1.5;
  padding: 8px;
  background: var(--dt-bg-inset);
  color: var(--dt-text);
  border: 1px solid var(--dt-border-strong);
  border-radius: 6px;
  tab-size: 2;
}
.source-editor:focus { outline: none; border-color: var(--dt-accent); }

/* ---- Outline ---- */
.outline { display: flex; flex-direction: column; max-height: 200px; overflow: auto; }
.outline-row {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  color: var(--dt-text);
  font: 500 11px var(--dt-sans);
  padding: 2px;
  cursor: pointer;
  text-align: left;
}
.outline-row:hover { background: rgba(255,255,255,0.04); }

/* ---- Network ---- */
.wf-track {
  position: relative;
  display: block;
  height: 8px;
  min-width: 60px;
  background: var(--dt-bg-inset);
  border-radius: 4px;
  overflow: hidden;
}
.wf-bar { position: absolute; top: 0; height: 100%; border-radius: 4px; background: var(--dt-blue); }
.wf-bar.t-red { background: var(--dt-red); }
.wf-bar.t-purple { background: var(--dt-purple); }
.wf-bar.t-cyan { background: var(--dt-cyan); }
.rule-list { display: flex; flex-direction: column; gap: 6px; margin: 6px 0; }
.rule {
  border: 1px solid var(--dt-border);
  border-radius: 7px;
  background: var(--dt-bg-inset);
  padding: 6px;
}
.rule.is-off { opacity: 0.55; }
.rule-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.rule-body { display: flex; align-items: flex-start; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.rule-body-input {
  flex: 1 1 260px;
  min-height: 54px;
  resize: vertical;
  font-family: var(--dt-mono);
  font-size: 10.5px;
  padding: 5px 6px;
  background: var(--dt-bg);
  color: var(--dt-text);
  border: 1px solid var(--dt-border);
  border-radius: 5px;
}
.rule-body-input:focus { outline: none; border-color: var(--dt-accent); }

/* ---- Console ---- */
.log-list { display: flex; flex-direction: column; }
.console-row {
  display: flex;
  align-items: baseline;
  gap: 7px;
  padding: 2px 10px;
  font-size: 11px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  flex-wrap: wrap;
}
.console-row:hover { background: rgba(255,255,255,0.03); }
.console-row.t-error { background: rgba(248,113,113,0.08); }
.console-row.t-warn { background: rgba(240,179,94,0.07); }
.console-row .t { flex: 0 0 74px; font-family: var(--dt-mono); font-size: 9.5px; color: var(--dt-text-faint); }
.console-row .ph { flex: 0 0 52px; }
.console-text { flex: 1; font-family: var(--dt-mono); white-space: pre-wrap; word-break: break-word; }
.console-count {
  flex: 0 0 auto;
  font-size: 9.5px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--dt-bg-inset);
  border: 1px solid var(--dt-border);
  color: var(--dt-text-faint);
}
.console-stack { flex: 0 0 100%; font-size: 10px; color: var(--dt-text-faint); }
.console-stack pre { margin: 3px 0 0; white-space: pre-wrap; font-family: var(--dt-mono); }

/* ---- REPL ---- */
.repl-log { display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px; max-height: 200px; overflow: auto; }
.repl-entry { border-left: 2px solid var(--dt-border); padding-left: 6px; }
.repl-in, .repl-out { display: flex; gap: 6px; font-size: 11px; align-items: baseline; }
.repl-out pre {
  margin: 0;
  font-family: var(--dt-mono);
  font-size: 10.5px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--dt-green);
}
.repl-out.is-error pre { color: var(--dt-red); }
.repl-caret { color: var(--dt-text-faint); font-family: var(--dt-mono); }
.repl-row { display: flex; align-items: center; gap: 6px; }
.repl-input {
  flex: 1;
  background: var(--dt-bg-inset);
  border: 1px solid var(--dt-border);
  border-radius: 6px;
  color: var(--dt-text);
  font-family: var(--dt-mono);
  font-size: 11px;
  padding: 4px 7px;
}
.repl-input:focus { outline: none; border-color: var(--dt-accent); }

/* ---- Routes ---- */
.route-list { display: flex; flex-direction: column; }
.route-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  font-size: 11px;
}
.route-row.is-active { background: rgba(90,209,155,0.09); }

/* ---- Data ---- */
.data-row { border-bottom: 1px solid var(--dt-border); }
.data-head { display: flex; align-items: center; gap: 6px; padding: 4px 10px; font-size: 11px; }
.data-head:hover { background: rgba(255,255,255,0.03); }
.data-body { padding: 0 10px 8px 24px; display: flex; flex-direction: column; gap: 6px; }

/* ---- Theme tokens ---- */
.token-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 6px; }
.token-row {
  border: 1px solid var(--dt-border);
  border-radius: 7px;
  background: var(--dt-bg-inset);
  padding: 5px 7px;
}
.token-row.is-overridden { border-color: var(--dt-amber); }
.token-head { display: flex; align-items: center; gap: 5px; margin-bottom: 4px; }
.token-name { font-family: var(--dt-mono); font-size: 10.5px; color: var(--dt-text); }
.token-body { display: flex; align-items: center; gap: 5px; }
.token-input {
  flex: 1;
  min-width: 0;
  background: var(--dt-bg);
  border: 1px solid var(--dt-border);
  border-radius: 5px;
  color: var(--dt-text);
  font-family: var(--dt-mono);
  font-size: 10.5px;
  padding: 2px 5px;
}
.token-input:focus { outline: none; border-color: var(--dt-accent); }
.token-picker {
  width: 22px;
  height: 20px;
  padding: 0;
  border: 1px solid var(--dt-border);
  border-radius: 4px;
  background: none;
  cursor: pointer;
}
.contrast-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; font-size: 11px; }
.contrast-sample {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid var(--dt-border-strong);
  font-weight: 700;
  font-size: 11px;
}
.contrast-label { flex: 0 0 110px; }

/* ---- Test tab ---- */
.step-list { display: flex; flex-direction: column; }
.step-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  font-size: 11px;
}
.step-index {
  flex: 0 0 18px;
  text-align: right;
  color: var(--dt-text-faint);
  font-family: var(--dt-mono);
  font-size: 10px;
}
.step-label { font-family: var(--dt-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.step-query { display: inline-flex; align-items: center; gap: 4px; font-size: 10px; }
.match-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 3px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  font-size: 11px;
  cursor: pointer;
}
.match-row:hover { background: rgba(255,255,255,0.04); }
.match-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---- Timeline list ---- */
.tlist { display: flex; flex-direction: column; }
.tlist-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 2px 10px;
  font-size: 11px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  border-left: 2px solid transparent;
}
.tlist-row.is-link { cursor: pointer; }
.tlist-row:hover { background: rgba(255,255,255,0.035); }
.tlist-row.t-red { border-left-color: var(--dt-red); }
.tlist-row.t-amber { border-left-color: var(--dt-amber); }
.tlist-row.t-green { border-left-color: var(--dt-green); }
.tlist-row.t-blue { border-left-color: var(--dt-blue); }
.tlist-row.t-purple { border-left-color: var(--dt-purple); }
.tlist-row.t-cyan { border-left-color: var(--dt-cyan); }
.tlist-row.t-grey { border-left-color: var(--dt-grey); }
.tlist-time {
  flex: 0 0 60px;
  text-align: right;
  font-family: var(--dt-mono);
  font-size: 9.5px;
  color: var(--dt-text-faint);
}
.tlist-kind { flex: 0 0 68px; }
.tlist-label { flex: 0 0 32%; font-family: var(--dt-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tlist-detail { flex: 1; color: var(--dt-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tlist-dur { font-family: var(--dt-mono); font-size: 10px; color: var(--dt-text-faint); }
.tlist-gap { font-family: var(--dt-mono); font-size: 9.5px; color: var(--dt-amber); }

/* ---- Settings ---- */
.switch-list { display: flex; flex-direction: column; gap: 6px; }
.switch-row { display: flex; align-items: flex-start; gap: 8px; }
.switch-hint { flex: 1; font-size: 10.5px; color: var(--dt-text-faint); line-height: 1.45; }

/* ---- Overview quick links ---- */
.quick-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px; }
.quick {
  appearance: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  padding: 7px 9px;
  border: 1px solid var(--dt-border);
  border-radius: 7px;
  background: var(--dt-bg-inset);
  cursor: pointer;
  font-family: var(--dt-sans);
}
.quick:hover { border-color: var(--dt-accent); }
.quick-title { font-size: 11.5px; font-weight: 700; color: var(--dt-text); }
.quick-hint { font-size: 10px; color: var(--dt-text-faint); line-height: 1.4; }

/* ---- Insight interactions ---- */
.insight.is-link { cursor: pointer; }
.insight.is-link:hover { border-color: var(--dt-accent); }
.insight.is-selected { border-color: var(--dt-accent); background: var(--dt-accent-soft); }
.insight.t-good { border-color: rgba(90,209,155,0.35); }

/* ---- Effect timeline lanes ---- */
.tl-row { cursor: pointer; }
.tl-row.is-selected { background: var(--dt-accent-soft); }
.tl-dot.amber { background: var(--dt-amber); }
.tl-dot.cyan { background: var(--dt-cyan); }

/* ---- Flamegraph reason column ---- */
.flame-reason {
  flex: 0 0 28%;
  font-size: 9.5px;
  color: var(--dt-text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- Button tones ---- */
.icon-btn.t-good { color: var(--dt-green); border-color: rgba(90,209,155,0.4); }
.icon-btn.t-warn { color: var(--dt-amber); border-color: rgba(240,179,94,0.4); }
.icon-btn.t-amber { color: var(--dt-amber); border-color: rgba(240,179,94,0.4); }
.icon-btn.t-purple { color: var(--dt-purple); border-color: rgba(192,140,240,0.4); }
.icon-btn.t-bad { color: var(--dt-red); border-color: rgba(248,113,113,0.4); }
.icon-btn:disabled { opacity: 0.45; cursor: not-allowed; }

/* ---- Bar rows ---- */
.bar-row.is-link { cursor: pointer; }
.bar-row.is-link:hover .bar-row-label { color: var(--dt-accent); }
.bar-row-fill.t-bad { background: var(--dt-red); }
.bar-row-fill.t-warn { background: var(--dt-amber); }
`;
const devtoolsPaletteStyles = `
/* ---- Command palette + shortcut sheet ---- */
.pal-host { position: absolute; inset: 0; z-index: 5; }
.pal-host[hidden] { display: none; }
.pal-scrim {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 48px;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(1px);
}
.pal-box {
  width: min(460px, 92%);
  max-height: 70%;
  display: flex;
  flex-direction: column;
  background: var(--dt-bg-raised);
  border: 1px solid var(--dt-border-strong);
  border-radius: 10px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55);
  overflow: hidden;
}
.pal-box.is-help { padding: 12px 14px; gap: 8px; }
.pal-title { font-weight: 700; font-size: 12.5px; }
.pal-input {
  border: none;
  border-bottom: 1px solid var(--dt-border);
  background: var(--dt-bg-inset);
  color: var(--dt-text);
  font: 500 13px var(--dt-sans);
  padding: 9px 11px;
}
.pal-input:focus { outline: none; border-bottom-color: var(--dt-accent); }
.pal-list { overflow: auto; padding: 4px; }
.pal-row {
  appearance: none;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  border-radius: 6px;
  color: var(--dt-text);
  font: 500 11.5px var(--dt-sans);
  padding: 5px 8px;
  cursor: pointer;
}
.pal-row.is-active { background: var(--dt-accent-soft); }
.pal-group {
  flex: 0 0 auto;
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: .05em;
  color: var(--dt-text-faint);
  min-width: 54px;
}
.pal-label { flex: 1; }
.pal-hint { font-family: var(--dt-mono); font-size: 10px; color: var(--dt-text-faint); }
.pal-empty { padding: 12px; font-size: 11px; color: var(--dt-text-faint); }
.pal-foot {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 10px;
  border-top: 1px solid var(--dt-border);
  font-size: 10px;
  color: var(--dt-text-faint);
}

/* ---- First-run tips ---- */
.tips {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 10px;
  border: 1px solid var(--dt-accent);
  border-radius: 8px;
  background: var(--dt-accent-soft);
}
.tips-head { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 11.5px; }
.tips-list { display: flex; flex-direction: column; gap: 4px; }
.tip-row {
  appearance: none;
  display: flex;
  align-items: baseline;
  gap: 7px;
  background: none;
  border: none;
  text-align: left;
  color: var(--dt-text);
  font: 500 11px var(--dt-sans);
  padding: 2px 0;
  cursor: pointer;
}
.tip-row:hover .tip-action { color: var(--dt-accent); text-decoration: underline; }
.tip-num {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--dt-bg-inset);
  border: 1px solid var(--dt-border-strong);
  font-size: 9px;
  font-weight: 700;
}
.tip-action { font-weight: 700; }
.tip-why { color: var(--dt-text-dim); }

/* ---- Inspect split layout (wide panel) ---- */
.split { display: grid; grid-template-columns: minmax(220px, 40%) minmax(0, 1fr); min-height: 0; }
.split > .split-left { border-right: 1px solid var(--dt-border); min-width: 0; overflow: auto; max-height: 520px; }
.split > .split-right { min-width: 0; overflow: auto; max-height: 520px; }
.split .comp-tree { max-height: none; }

/* ---- Watch expressions ---- */
.watch-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 2px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  font-size: 11px;
}
.watch-expr { flex: 0 0 40%; font-family: var(--dt-mono); color: var(--dt-purple); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.watch-val { flex: 1; font-family: var(--dt-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.watch-val.is-error { color: var(--dt-red); }

/* ---- State diff ---- */
.diff-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 2px 0;
  font-size: 11px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.diff-mark { flex: 0 0 14px; text-align: center; font-family: var(--dt-mono); font-weight: 700; }
.diff-row.is-added .diff-mark { color: var(--dt-green); }
.diff-row.is-removed .diff-mark { color: var(--dt-red); }
.diff-row.is-changed .diff-mark { color: var(--dt-amber); }
.diff-path { flex: 0 0 34%; font-family: var(--dt-mono); color: var(--dt-text); overflow: hidden; text-overflow: ellipsis; }
.diff-old { color: var(--dt-red); font-family: var(--dt-mono); text-decoration: line-through; opacity: .8; }
.diff-arrow { color: var(--dt-text-faint); }
.diff-new { color: var(--dt-green); font-family: var(--dt-mono); }
.diff-empty { padding: 8px 0; color: var(--dt-text-faint); font-size: 11px; }

/* ---- Break-on-change marker ---- */
.brk {
  appearance: none;
  border: none;
  background: none;
  cursor: pointer;
  font-size: 10px;
  color: var(--dt-text-faint);
  padding: 0 2px;
}
.brk.is-on { color: var(--dt-red); }
.brk:hover { color: var(--dt-red); }

/* ---- Program history ---- */
.ver-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  font-size: 11px;
}
.ver-when { flex: 0 0 96px; font-family: var(--dt-mono); font-size: 10px; color: var(--dt-text-faint); }
.ver-meta { flex: 1; color: var(--dt-text-dim); }

/* ---- Keyboard hint chips in a toolbar ---- */
kbd {
  font-family: var(--dt-mono);
  font-size: 9.5px;
  padding: 1px 4px;
  border: 1px solid var(--dt-border-strong);
  border-bottom-width: 2px;
  border-radius: 4px;
  background: var(--dt-bg-inset);
  color: var(--dt-text-dim);
}
`;
const devtoolsScrollStyles = `
/* A keyed scroll region: bounded height so the surrounding page keeps its
   shape, and a preserved offset across re-renders (see SCROLL_KEY_ATTR). */
.tree-wrap { max-height: 340px; overflow: auto; }
:host(.dock-bottom) .tree-wrap { max-height: 240px; }
[data-dt-scroll] { scrollbar-width: thin; }
[data-dt-scroll]::-webkit-scrollbar { width: 9px; height: 9px; }
[data-dt-scroll]::-webkit-scrollbar-thumb {
  background: var(--dt-border-strong);
  border-radius: 6px;
  border: 2px solid var(--dt-bg);
}
`;
const devtoolsCodeStyles = `
.code-line.is-hit { background: rgba(240, 179, 94, 0.10); }
.code-text mark {
  background: var(--dt-amber);
  color: #10121a;
  border-radius: 2px;
  padding: 0 1px;
}
`;
const devtoolsListStyles = `
.list-wrap { max-height: 300px; overflow: auto; }
:host(.dock-bottom) .list-wrap { max-height: 200px; }
.log-list, .tlist { max-height: 420px; overflow: auto; }
:host(.dock-bottom) .log-list, :host(.dock-bottom) .tlist { max-height: 240px; }
`;
const baseStyles = `
:host {
  --dt-bg: #16181d;
  --dt-bg-raised: #1d2026;
  --dt-bg-inset: #101216;
  --dt-border: #2b2f38;
  --dt-border-strong: #3a3f4b;
  --dt-text: #e6e8ec;
  --dt-text-dim: #9aa0ab;
  --dt-text-faint: #6b7280;
  --dt-accent: #7c9cff;
  --dt-accent-soft: #2a3357;
  --dt-green: #5ad19b;
  --dt-blue: #6aa6ff;
  --dt-amber: #f0b35e;
  --dt-grey: #5b626f;
  --dt-red: #f87171;
  --dt-purple: #c08cf0;
  --dt-cyan: #5fd0d8;
  --dt-row: 22px;
  --dt-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --dt-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  all: initial;
  position: fixed;
  z-index: 2147483000;
  font-family: var(--dt-sans);
  color: var(--dt-text);
  contain: layout style;
}
:host([hidden]) { display: none; }

/* ---- Light chrome, for a light host page ---- */
:host(.is-light) {
  --dt-bg: #ffffff;
  --dt-bg-raised: #f4f5f7;
  --dt-bg-inset: #fafbfc;
  --dt-border: #e2e5ea;
  --dt-border-strong: #cbd0d8;
  --dt-text: #1c2029;
  --dt-text-dim: #57606f;
  --dt-text-faint: #8c95a4;
  --dt-accent: #3b62d9;
  --dt-accent-soft: #dfe6ff;
  --dt-green: #17864f;
  --dt-blue: #2563c9;
  --dt-amber: #9a6100;
  --dt-grey: #8c95a4;
  --dt-red: #c62d2d;
  --dt-purple: #7c3fbf;
  --dt-cyan: #0f7c86;
}

/* ---- Compact density, for a narrow dock ---- */
:host(.is-compact) { --dt-row: 18px; }
:host(.is-compact) .section { padding: 6px 8px; }
:host(.is-compact) .row, :host(.is-compact) .log-row { padding-top: 0; padding-bottom: 0; }

/*
 * Docking. A docked panel spans a full edge of the viewport, so it needs the
 * host itself to stretch — the panel's own width/height (used while floating)
 * is cleared by the shell. Radius and shadow are dropped on the docked edges so
 * the panel reads as part of the window rather than a card sitting on it.
 */
:host(.dock-right), :host(.dock-left) { top: 0; bottom: 0; width: min(560px, 60vw); }
:host(.dock-right) { right: 0; }
:host(.dock-left) { left: 0; }
:host(.dock-bottom) { left: 0; right: 0; bottom: 0; height: min(460px, 60vh); }
:host(.dock-right) .panel, :host(.dock-left) .panel, :host(.dock-bottom) .panel {
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  border-radius: 0;
  box-shadow: none;
}
:host(.dock-right) .panel { border-right: none; }
:host(.dock-left) .panel { border-left: none; }
:host(.dock-bottom) .panel { border-bottom: none; }
:host(.dock-right) .resize, :host(.dock-left) .resize, :host(.dock-bottom) .resize { display: none; }
:host(.dock-right) .header, :host(.dock-left) .header, :host(.dock-bottom) .header { cursor: default; }

*, *::before, *::after { box-sizing: border-box; }

.panel {
  display: flex;
  flex-direction: column;
  width: 480px;
  height: 560px;
  max-width: 96vw;
  max-height: 92vh;
  background: var(--dt-bg);
  border: 1px solid var(--dt-border-strong);
  border-radius: 12px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  font-size: 12px;
  line-height: 1.45;
}
.panel.is-collapsed { height: auto !important; }
.panel.is-collapsed .panel-body,
.panel.is-collapsed .tabs { display: none; }

/* ---- Header ---- */
.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--dt-bg-raised);
  border-bottom: 1px solid var(--dt-border);
  cursor: grab;
  user-select: none;
}
.header.is-dragging { cursor: grabbing; }
.brand {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.2px;
  white-space: nowrap;
}
.brand .bolt { color: var(--dt-accent); font-size: 13px; }
.brand .ver { color: var(--dt-text-faint); font-weight: 500; font-size: 10px; }
.header .spacer { flex: 1; }

.app-select {
  appearance: none;
  background: var(--dt-bg-inset);
  color: var(--dt-text);
  border: 1px solid var(--dt-border);
  border-radius: 6px;
  padding: 3px 22px 3px 8px;
  font-size: 11px;
  font-family: var(--dt-sans);
  max-width: 150px;
  cursor: pointer;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'><path d='M2 3.5 5 6.5 8 3.5' stroke='%239aa0ab' fill='none' stroke-width='1.4'/></svg>");
  background-repeat: no-repeat;
  background-position: right 6px center;
}
.app-select:focus { outline: none; border-color: var(--dt-accent); }

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 24px;
  min-width: 24px;
  padding: 0 6px;
  background: var(--dt-bg-inset);
  color: var(--dt-text-dim);
  border: 1px solid var(--dt-border);
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  font-family: var(--dt-sans);
}
.icon-btn:hover { color: var(--dt-text); border-color: var(--dt-border-strong); }
.icon-btn.is-on { color: var(--dt-text); border-color: var(--dt-accent); }
.rec-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--dt-red);
}
.rec-dot.is-paused { background: var(--dt-text-faint); }

/* ---- Tabs ---- */
/*
 * The tab strip scrolls horizontally rather than wrapping: fourteen tabs on a
 * 400px-wide panel would otherwise take three rows of vertical space away from
 * the thing you are actually looking at.
 */
.tabs {
  display: flex;
  gap: 1px;
  padding: 5px 6px 0;
  background: var(--dt-bg-raised);
  border-bottom: 1px solid var(--dt-border);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
  flex: 0 0 auto;
}
.tabs::-webkit-scrollbar { height: 4px; }
.tabs::-webkit-scrollbar-thumb { background: var(--dt-border-strong); border-radius: 4px; }
.tab {
  appearance: none;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--dt-text-dim);
  padding: 5px 9px 7px;
  font-size: 11.5px;
  font-family: var(--dt-sans);
  cursor: pointer;
  border-radius: 6px 6px 0 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  flex: 0 0 auto;
}
.tab:hover { color: var(--dt-text); background: rgba(255,255,255,0.05); }
.tab.is-active { color: var(--dt-text); border-bottom-color: var(--dt-accent); font-weight: 600; }
.tab-icon { font-size: 11px; opacity: 0.85; }
.tab.is-active .tab-icon { opacity: 1; color: var(--dt-accent); }
.tab .count {
  font-size: 9.5px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--dt-bg-inset);
  border: 1px solid var(--dt-border);
  color: var(--dt-text-faint);
  font-variant-numeric: tabular-nums;
}
.tab.is-active .count { color: var(--dt-text); border-color: var(--dt-border-strong); }

/* ---- Toast (transient confirmation in the header) ---- */
.toast {
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 600;
  background: var(--dt-accent-soft);
  color: var(--dt-text);
  border: 1px solid var(--dt-border-strong);
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.toast[hidden] { display: none; }
.toast.t-good { border-color: var(--dt-green); color: var(--dt-green); background: rgba(90,209,155,0.12); }
.toast.t-bad { border-color: var(--dt-red); color: var(--dt-red); background: rgba(248,113,113,0.12); }
.toast.t-warn { border-color: var(--dt-amber); color: var(--dt-amber); background: rgba(240,179,94,0.12); }

/* ---- Body ---- */
.panel-body {
  flex: 1;
  overflow: auto;
  background: var(--dt-bg);
}
.panel-body::-webkit-scrollbar { width: 10px; height: 10px; }
.panel-body::-webkit-scrollbar-thumb { background: var(--dt-border-strong); border-radius: 6px; border: 2px solid var(--dt-bg); }

.toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  background: var(--dt-bg);
  border-bottom: 1px solid var(--dt-border);
}
.toolbar .grow { flex: 1; }
.search {
  flex: 1;
  background: var(--dt-bg-inset);
  border: 1px solid var(--dt-border);
  border-radius: 6px;
  padding: 4px 8px;
  color: var(--dt-text);
  font-size: 11px;
  font-family: var(--dt-mono);
}
.search:focus { outline: none; border-color: var(--dt-accent); }
.muted { color: var(--dt-text-dim); font-size: 11px; }
.faint { color: var(--dt-text-faint); }
.empty {
  padding: 28px 16px;
  text-align: center;
  color: var(--dt-text-faint);
  font-size: 12px;
}
.empty code { color: var(--dt-text-dim); font-family: var(--dt-mono); }

/* ---- State inspector tree ---- */
.tree { padding: 4px 0; }
.row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  padding: 2px 10px 2px 0;
  font-family: var(--dt-mono);
  font-size: 11.5px;
  white-space: nowrap;
}
.row:hover { background: rgba(255,255,255,0.035); }
.row .twist {
  width: 14px;
  flex: 0 0 14px;
  color: var(--dt-text-faint);
  cursor: pointer;
  text-align: center;
  user-select: none;
}
.row .twist.is-leaf { visibility: hidden; }
.row .k { color: var(--dt-purple); }
.row .sep { color: var(--dt-text-faint); }
.row .v { color: var(--dt-text); cursor: text; }
.row .v.t-string { color: var(--dt-green); }
.row .v.t-number { color: var(--dt-amber); }
.row .v.t-boolean { color: var(--dt-blue); }
.row .v.t-null, .row .v.t-undefined { color: var(--dt-text-faint); font-style: italic; }
.row .v.t-object, .row .v.t-array, .row .v.t-function { color: var(--dt-text-dim); }
.row .tag {
  margin-left: 6px;
  font-size: 9px;
  font-family: var(--dt-sans);
  color: var(--dt-text-faint);
  border: 1px solid var(--dt-border);
  border-radius: 4px;
  padding: 0 4px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}
.row.is-changed { background: var(--dt-accent-soft); animation: dt-flash 1.1s ease-out; }
@keyframes dt-flash {
  0% { background: rgba(124,156,255,0.55); }
  100% { background: transparent; }
}
.edit-input {
  background: var(--dt-bg-inset);
  border: 1px solid var(--dt-accent);
  border-radius: 4px;
  color: var(--dt-text);
  font-family: var(--dt-mono);
  font-size: 11.5px;
  padding: 0 4px;
  min-width: 80px;
}
.edit-input:focus { outline: none; }

/* ---- Profiler ---- */
.commit-strip {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 64px;
  padding: 8px 10px;
  background: var(--dt-bg-inset);
  border-bottom: 1px solid var(--dt-border);
  overflow-x: auto;
}
.commit-bar {
  flex: 0 0 9px;
  min-height: 3px;
  background: var(--dt-blue);
  border-radius: 2px 2px 0 0;
  cursor: pointer;
  opacity: 0.65;
  transition: opacity 0.1s;
}
.commit-bar:hover { opacity: 1; }
.commit-bar.is-full { background: var(--dt-amber); }
.commit-bar.is-initial { background: var(--dt-green); }
.commit-bar.is-selected { opacity: 1; outline: 1.5px solid var(--dt-text); outline-offset: 1px; }

.section { padding: 10px; border-bottom: 1px solid var(--dt-border); }
.section-title {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  color: var(--dt-text-faint);
  margin: 0 0 7px;
  font-weight: 700;
}
.kv { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-bottom: 6px; }
.kv span { font-size: 11px; color: var(--dt-text-dim); }
.kv b { color: var(--dt-text); font-weight: 600; }
.kv .mono { font-family: var(--dt-mono); }
.chip {
  display: inline-block;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  font-family: var(--dt-mono);
}
.chip.green { background: rgba(90,209,155,0.16); color: var(--dt-green); }
.chip.blue { background: rgba(106,166,255,0.16); color: var(--dt-blue); }
.chip.amber { background: rgba(240,179,94,0.16); color: var(--dt-amber); }
.chip.grey { background: rgba(91,98,111,0.22); color: var(--dt-text-dim); }
.chip.red { background: rgba(248,113,113,0.16); color: var(--dt-red); }
.chip.purple { background: rgba(192,140,240,0.16); color: var(--dt-purple); }

/* flamegraph rows */
.flame-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 1px 0;
  font-size: 11px;
}
.flame-bar-wrap { flex: 1; min-width: 0; }
.flame-bar {
  height: 16px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  padding: 0 6px;
  color: #0c0e12;
  font-family: var(--dt-mono);
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  min-width: 2px;
}
.flame-bar.p-mount { background: var(--dt-green); }
.flame-bar.p-update { background: var(--dt-blue); }
.flame-bar.p-memo { background: var(--dt-grey); color: var(--dt-text-dim); opacity: 0.8; }
.flame-time { flex: 0 0 56px; text-align: right; font-family: var(--dt-mono); color: var(--dt-text-dim); font-size: 10px; }
.flame-reason { font-size: 10px; color: var(--dt-text-faint); }

/* tables */
table.dt-table { width: 100%; border-collapse: collapse; font-size: 11px; }
table.dt-table th {
  text-align: left;
  color: var(--dt-text-faint);
  font-weight: 600;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 4px 6px;
  border-bottom: 1px solid var(--dt-border);
  position: sticky;
  top: 0;
  background: var(--dt-bg);
}
table.dt-table td {
  padding: 3px 6px;
  border-bottom: 1px solid rgba(43,47,56,0.5);
  font-variant-numeric: tabular-nums;
}
table.dt-table td.name { font-family: var(--dt-mono); color: var(--dt-text); }
table.dt-table td.num { text-align: right; font-family: var(--dt-mono); color: var(--dt-text-dim); }
table.dt-table tr:hover td { background: rgba(255,255,255,0.03); }
.bar-cell { position: relative; }
.bar-cell .barfill {
  position: absolute;
  left: 0; top: 2px; bottom: 2px;
  background: rgba(124,156,255,0.22);
  border-radius: 3px;
  z-index: 0;
}
.bar-cell span { position: relative; z-index: 1; }

/* ---- Effect timeline ---- */
.lane {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-bottom: 1px solid rgba(43,47,56,0.5);
}
.lane .lane-name { font-family: var(--dt-mono); color: var(--dt-text); font-size: 11px; flex: 0 0 auto; }
.lane .lane-trig { font-family: var(--dt-mono); color: var(--dt-text-faint); font-size: 10px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lane .lane-stat { color: var(--dt-text-dim); font-size: 10px; font-variant-numeric: tabular-nums; }

.log-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 10px;
  font-size: 11px;
  border-bottom: 1px solid rgba(43,47,56,0.35);
}
.log-row:hover { background: rgba(255,255,255,0.03); }
.log-row .t { flex: 0 0 62px; text-align: right; font-family: var(--dt-mono); color: var(--dt-text-faint); font-size: 10px; }
.log-row .ph { flex: 0 0 64px; }
.log-row .lbl { font-family: var(--dt-mono); color: var(--dt-text-dim); }
.log-row .rsn { flex: 1; font-family: var(--dt-mono); color: var(--dt-text-faint); font-size: 10px; text-align: right; }

.filters { display: flex; gap: 4px; flex-wrap: wrap; }
.filter-chip {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--dt-border);
  background: var(--dt-bg-inset);
  color: var(--dt-text-faint);
  cursor: pointer;
  font-family: var(--dt-sans);
}
.filter-chip.is-on { color: var(--dt-text); border-color: var(--dt-border-strong); background: var(--dt-bg-raised); }

/* ---- Stat grid (perf / effect summaries) ---- */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(78px, 1fr));
  gap: 6px;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 6px 8px;
  background: var(--dt-bg-inset);
  border: 1px solid var(--dt-border);
  border-radius: 7px;
}
.stat.is-link { cursor: pointer; }
.stat.is-link:hover { border-color: var(--dt-accent); }
.stat-val {
  font-family: var(--dt-mono);
  font-size: 14px;
  font-weight: 700;
  color: var(--dt-text);
  font-variant-numeric: tabular-nums;
}
.stat-val.t-warn { color: var(--dt-amber); }
.stat-val.t-good { color: var(--dt-green); }
.stat-val.t-bad { color: var(--dt-red); }
.stat-label {
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--dt-text-faint);
}

/* ---- Horizontal bar rows (hot atoms) ---- */
.bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
  font-size: 11px;
}
.bar-row-label {
  flex: 0 0 34%;
  font-family: var(--dt-mono);
  color: var(--dt-purple);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bar-row-track {
  flex: 1;
  height: 10px;
  background: var(--dt-bg-inset);
  border-radius: 3px;
  overflow: hidden;
}
.bar-row-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--dt-accent-soft), var(--dt-accent));
  border-radius: 3px;
}
.bar-row-num {
  flex: 0 0 auto;
  font-family: var(--dt-mono);
  color: var(--dt-text-dim);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

/* ---- Insights ---- */
.insights { display: flex; flex-direction: column; gap: 5px; }
.insight {
  display: flex;
  gap: 7px;
  align-items: flex-start;
  font-size: 11px;
  line-height: 1.4;
  padding: 6px 8px;
  border-radius: 7px;
  border: 1px solid var(--dt-border);
  background: var(--dt-bg-inset);
  color: var(--dt-text-dim);
}
.insight-ic { flex: 0 0 auto; font-weight: 700; }
.insight.t-warn { border-color: rgba(240,179,94,0.4); }
.insight.t-warn .insight-ic { color: var(--dt-amber); }
.insight.t-bad { border-color: rgba(248,113,113,0.4); }
.insight.t-bad .insight-ic { color: var(--dt-red); }
.insight.t-good .insight-ic { color: var(--dt-green); }

/* ---- Reactivity heat badge (state tree) ---- */
.row .grow { flex: 1; min-width: 8px; }
.heat { display: inline-flex; align-items: center; gap: 5px; flex: 0 0 auto; }
.heat-bar {
  width: 40px;
  height: 5px;
  border-radius: 3px;
  background: var(--dt-bg-inset);
  overflow: hidden;
}
.heat-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--dt-blue), var(--dt-amber));
}
.heat-num {
  font-family: var(--dt-mono);
  font-size: 9.5px;
  color: var(--dt-text-faint);
  min-width: 18px;
  text-align: right;
}

/* ---- Sortable table headers ---- */
table.dt-table th.sortable { cursor: pointer; user-select: none; white-space: nowrap; }
table.dt-table th.sortable:hover { color: var(--dt-text-dim); }

/* ---- Effect visual timeline ---- */
.tl-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px 4px;
}
.tl-axis {
  position: relative;
  flex: 0 0 120px;
  font-family: var(--dt-mono);
  font-size: 9px;
  color: var(--dt-text-faint);
}
.tl-axis-end { float: right; }
.tl-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 10px;
  border-bottom: 1px solid rgba(43,47,56,0.4);
}
.tl-name {
  flex: 0 0 38%;
  font-family: var(--dt-mono);
  font-size: 10.5px;
  color: var(--dt-text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tl-track {
  position: relative;
  flex: 1;
  height: 16px;
  background: var(--dt-bg-inset);
  border-radius: 4px;
}
.tl-dot {
  position: absolute;
  top: 50%;
  width: 8px;
  height: 8px;
  margin-top: -4px;
  margin-left: -4px;
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--dt-bg-inset);
}
.tl-dot.green { background: var(--dt-green); }
.tl-dot.blue { background: var(--dt-blue); }
.tl-dot.purple { background: var(--dt-purple); }
.tl-dot.grey { background: var(--dt-grey); }
.tl-dot.red { background: var(--dt-red); }

/* ---- Resize grip ---- */
.resize {
  position: absolute;
  width: 16px;
  height: 16px;
  right: 0;
  bottom: 0;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 50%, var(--dt-border-strong) 50%, var(--dt-border-strong) 60%, transparent 60%, transparent 72%, var(--dt-border-strong) 72%, var(--dt-border-strong) 82%, transparent 82%);
  border-bottom-right-radius: 12px;
}
`;
const devtoolsStyles = baseStyles + devtoolsExtraStyles + devtoolsPaletteStyles + devtoolsScrollStyles + devtoolsCodeStyles + devtoolsListStyles;
const overviewTab = {
  id: "overview",
  label: "Overview",
  icon: "⚡",
  hint: "Health, cost, and shape of the inspected app",
  render: (ctx) => render$b(ctx)
};
function render$b(ctx) {
  const { app, model } = ctx;
  if (!app) {
    return [h(
      "div",
      { class: "empty" },
      h("p", {}, "No Aktion app detected on this page."),
      h("p", { class: "faint" }, "Mount an ", code("<aktion-app>"), " and it will appear here."),
      h("p", { class: "faint" }, "Already mounted? The panel asks every app on the page to attach when it opens; if this app was created later, it registers itself on its next render.")
    )];
  }
  const stats = can(app, "getStats") ? app.getStats() : null;
  const diagnostics = can(app, "getDiagnostics") ? app.getDiagnostics() : [];
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  const net = networkStats(model.network);
  const lastCommit = model.commits[model.commits.length - 1];
  const totalRender = model.commits.reduce((sum, commit) => sum + commit.duration, 0);
  const rendered = model.commits.reduce((sum, commit) => sum + commit.rendered, 0);
  const memoized = model.commits.reduce((sum, commit) => sum + commit.memoized, 0);
  const logErrors = model.logs.filter((entry) => entry.level === "error").length;
  const warnings = model.logs.filter((entry) => entry.level === "warn").length;
  const bar = toolbar(
    muted(app.label),
    chip(`protocol v${ctx.hook.protocolVersion}`, "grey"),
    spacer(),
    button("⌘K Commands", () => ctx.openPalette(), {
      title: "Every action in the panel, searchable (Ctrl/⌘ K)"
    }),
    can(app, "reload") ? button("Reload program", () => {
      app.reload();
      ctx.toast("Program re-planned");
      ctx.refresh();
    }, { title: "Re-plan and re-render from the current source" }) : null,
    button("Force render", () => {
      app.forceRender();
      ctx.toast("Full re-render requested");
      ctx.refresh();
    }, { title: "Re-render the whole tree, bypassing memoization" })
  );
  const out = [bar];
  if (!ctx.ui.tipsDismissed) out.push(renderTips(ctx));
  const problems = [];
  if (errors.length > 0) {
    problems.push({
      tone: "bad",
      icon: "✖",
      text: h(
        "span",
        {},
        `${errors.length} program error${errors.length === 1 ? "" : "s"}: `,
        code(truncateMiddle(errors[0].message, 90)),
        " ",
        linkTo(ctx, "source", "open Source")
      )
    });
  }
  if (model.errors.length > 0) {
    problems.push({
      tone: "bad",
      icon: "✖",
      text: h(
        "span",
        {},
        `${model.errors.length} runtime error${model.errors.length === 1 ? "" : "s"} during this session. `,
        linkTo(ctx, "console", "open Console")
      )
    });
  }
  if (logErrors > 0) {
    problems.push({
      tone: "bad",
      icon: "▤",
      text: h("span", {}, `${logErrors} console error${logErrors === 1 ? "" : "s"}. `, linkTo(ctx, "console", "open Console"))
    });
  }
  if (net.failed > 0) {
    problems.push({
      tone: "bad",
      icon: "⇅",
      text: h("span", {}, `${net.failed} request${net.failed === 1 ? "" : "s"} failed. `, linkTo(ctx, "network", "open Network"))
    });
  }
  if (warnings > 0) {
    problems.push({
      tone: "warn",
      icon: "▲",
      text: h("span", {}, `${warnings} runtime warning${warnings === 1 ? "" : "s"} — these are usually the direct explanation of a reactivity bug. `, linkTo(ctx, "console", "open Console"))
    });
  }
  const rate = commitRate(ctx);
  if (rate > 30) {
    problems.push({
      tone: "bad",
      icon: "⚠",
      text: h("span", {}, `Commits are arriving at ${rate.toFixed(0)}/s — something is writing state in a loop. `, linkTo(ctx, "profiler", "open Profiler"))
    });
  }
  if (problems.length === 0) {
    problems.push({ tone: "good", icon: "✓", text: h("span", {}, "No errors, failed requests, or runtime warnings in this session.") });
  }
  out.push(section("Health", insightList(problems)));
  out.push(section("Session", statGrid(
    stat("commits", fmtCount(model.totals.commits), {
      title: "Render commits observed",
      onClick: () => ctx.selectTab("profiler")
    }),
    stat("render time", fmtMs(totalRender), { onClick: () => ctx.selectTab("profiler") }),
    stat("last commit", fmtMs(lastCommit?.duration), {
      tone: (lastCommit?.duration ?? 0) >= 16 ? "warn" : void 0,
      onClick: () => ctx.selectTab("profiler")
    }),
    stat("memoized", fmtPct(memoized, rendered + memoized), {
      tone: rendered + memoized > 0 && memoized / (rendered + memoized) < 0.2 ? "warn" : "good",
      onClick: () => ctx.selectTab("profiler")
    }),
    stat("effects", fmtCount(model.totals.effects), { onClick: () => ctx.selectTab("effects") }),
    stat("requests", fmtCount(model.totals.network), { onClick: () => ctx.selectTab("network") }),
    stat("navigations", fmtCount(model.totals.routes), { onClick: () => ctx.selectTab("routes") }),
    stat("state flushes", fmtCount(model.totals.stateFlushes), { onClick: () => ctx.selectTab("state") })
  )));
  if (stats) {
    out.push(section("App", statGrid(
      stat("instances", fmtCount(stats.instances), {
        title: "Live component instances",
        onClick: () => ctx.selectTab("inspect")
      }),
      stat("dom nodes", fmtCount(stats.domNodes), {
        title: `${fmtCount(stats.elements)} elements`,
        tone: stats.domNodes > 5e3 ? "warn" : void 0
      }),
      stat("atoms", fmtCount(stats.atoms), { onClick: () => ctx.selectTab("state") }),
      stat("effects", fmtCount(stats.effects), { onClick: () => ctx.selectTab("effects") }),
      stat("queries", fmtCount(stats.queries), { onClick: () => ctx.selectTab("data") }),
      stat("stores", fmtCount(stats.stores), { onClick: () => ctx.selectTab("data") }),
      stat("program", fmtBytes(stats.programBytes), { onClick: () => ctx.selectTab("source") }),
      stats.heapBytes !== void 0 ? stat("js heap", fmtBytes(stats.heapBytes), { title: "performance.memory.usedJSHeapSize" }) : null
    )));
  }
  const route = can(app, "getRoute") ? app.getRoute() : null;
  const theme = can(app, "getTheme") ? app.getTheme() : null;
  if (route || theme) {
    out.push(section("Context", h(
      "div",
      { class: "kv" },
      route ? h("span", {}, "route ", h("b", { class: "mono" }, route.path)) : null,
      route?.pattern ? h("span", {}, "pattern ", h("b", { class: "mono" }, route.pattern)) : null,
      route ? h("span", {}, "mode ", h("b", {}, route.mode)) : null,
      theme ? h("span", {}, "theme ", h("b", {}, theme.name)) : null,
      theme && theme.devtoolsOverrides.length > 0 ? chip(`${theme.devtoolsOverrides.length} token override${theme.devtoolsOverrides.length === 1 ? "" : "s"}`, "amber") : null,
      can(app, "listPropOverrides") && app.listPropOverrides().length > 0 ? chip(`${app.listPropOverrides().length} prop override(s)`, "amber") : null
    )));
  }
  if (ctx.ui.watches.length > 0) {
    out.push(section("Watching", [
      h("div", {}, ...ctx.ui.watches.map((expr) => {
        const result = can(app, "evaluateExpression") ? app.evaluateExpression(expr) : null;
        const text2 = result === null ? "no evaluator" : result.ok ? result.value?.preview ?? "undefined" : result.error ?? "failed";
        return h(
          "div",
          { class: "watch-row" },
          h("span", { class: "watch-expr", title: expr }, expr),
          h("span", { class: `watch-val ${result?.ok === false ? "is-error" : ""}` }, text2)
        );
      })),
      h(
        "div",
        { class: "detail-head" },
        spacer(),
        button("Manage watches", () => ctx.selectTab("console"), { title: "Add or remove watches in the Console tab" })
      )
    ]));
  }
  if (model.longTasks.length > 0) {
    const worst = model.longTasks.reduce((max, task) => Math.max(max, task.duration), 0);
    const total = model.longTasks.reduce((sum, task) => sum + task.duration, 0);
    out.push(section("Main-thread blocking", [
      statGrid(
        stat("long tasks", fmtCount(model.longTasks.length), { tone: "warn" }),
        stat("worst", fmtMs(worst), { tone: worst > 200 ? "bad" : "warn" }),
        stat("total blocked", fmtMs(total))
      ),
      faint("A long task is >50ms of uninterrupted main-thread work. Compare it with the commit durations in the Profiler: if the commits are short and the tasks are long, the jank is not coming from your program.")
    ]));
  }
  const hot = hotAtoms(model.commits, 5);
  if (hot.length > 0) {
    const max = Math.max(...hot.map(([, count]) => count));
    out.push(section("What drives re-renders", h("div", {}, ...hot.map(([path, count]) => barRow(code(path), count / max, `${fmtCount(count)} commit${count === 1 ? "" : "s"}`, {
      onClick: () => {
        ctx.ui.stateFilter = path.split(".")[0] ?? path;
        ctx.selectTab("state");
      }
    })))));
  }
  out.push(section("Where to look", h(
    "div",
    { class: "quick-grid" },
    quickLink(ctx, "inspect", "◎ Inspect", "Pick an element, edit its props and state"),
    quickLink(ctx, "state", "◆ State", "Read and write reactive state, travel back in time"),
    quickLink(ctx, "profiler", "▲ Profiler", "Find what re-renders and why"),
    quickLink(ctx, "network", "⇅ Network", "Requests, and rules to mock or delay them"),
    quickLink(ctx, "console", "▤ Console", "Runtime diagnostics and an expression REPL"),
    quickLink(ctx, "test", "✓ Test", "Record a test, audit a11y, measure coverage")
  )));
  if (!ctx.hook.options.captureProps || !ctx.hook.options.tagDom) {
    out.push(section(null, faint(
      "Some instrumentation is off, so the inspector will show less than it can. Settings has the switches."
    ), { flush: true }));
  }
  return out;
}
function renderTips(ctx) {
  const tips = [
    {
      action: "Pick an element",
      why: "click anything on the page to find the component that rendered it, then edit its props",
      run: () => ctx.togglePicker()
    },
    {
      action: "Watch it re-render",
      why: "outlines every component as it repaints — the fastest way to see work you did not expect",
      run: () => {
        ctx.ui.highlightUpdates = true;
        ctx.toast("Outlining components as they re-render");
        ctx.refresh();
      }
    },
    {
      action: "Open the command palette",
      why: "every action in the panel, searchable — Ctrl/⌘ K from anywhere",
      run: () => ctx.openPalette()
    }
  ];
  return section(null, h(
    "div",
    { class: "tips" },
    h(
      "div",
      { class: "tips-head" },
      h("span", {}, "New here? Try these three."),
      spacer(),
      button("Dismiss", () => {
        ctx.ui.tipsDismissed = true;
        ctx.persist();
        ctx.refresh();
      }, { title: "Hide these tips for good" })
    ),
    h("div", { class: "tips-list" }, ...tips.map((tip, index) => h(
      "button",
      { class: "tip-row", onclick: tip.run },
      h("span", { class: "tip-num" }, String(index + 1)),
      h(
        "span",
        {},
        h("span", { class: "tip-action" }, tip.action),
        h("span", { class: "tip-why" }, ` — ${tip.why}`)
      )
    ))),
    faint("Press ? at any time for the keyboard shortcuts.")
  ), { flush: true });
}
function commitRate(ctx) {
  const window2 = ctx.model.commits.slice(-20);
  if (window2.length < 5) return 0;
  const span = (window2[window2.length - 1].startTime - window2[0].startTime) / 1e3;
  return span > 0 ? window2.length / span : 0;
}
function linkTo(ctx, tab, label) {
  return h("button", { class: "inline-link", onclick: () => ctx.selectTab(tab) }, label);
}
function quickLink(ctx, tab, title, hint) {
  return h(
    "button",
    { class: "quick", onclick: () => ctx.selectTab(tab) },
    h("span", { class: "quick-title" }, title),
    h("span", { class: "quick-hint" }, hint)
  );
}
const profilerTab = {
  id: "profiler",
  label: "Profiler",
  icon: "▲",
  hint: "Per-commit render timings, flamegraph, and memoization analysis",
  badge: (ctx) => ctx.model.commits.length > 0 ? ctx.model.commits.length : null,
  render: (ctx) => render$a(ctx)
};
function render$a(ctx) {
  const { model, ui } = ctx;
  const commits = model.commits;
  const bar = toolbar(
    chipGroup(
      [
        { value: "commit", label: "Commit", title: "Commit strip and flamegraph" },
        { value: "ranked", label: "Ranked", title: "Components by total self time" },
        { value: "insights", label: "Insights", title: "Detected render hot-spots" }
      ],
      ui.profilerView,
      (value) => {
        ui.profilerView = value;
        ctx.refresh();
      }
    ),
    spacer(),
    toggle("Highlight", ui.highlightUpdates, () => {
      ui.highlightUpdates = !ui.highlightUpdates;
      if (!ui.highlightUpdates) ctx.overlay.clearUpdateFlashes();
      ctx.toast(ui.highlightUpdates ? "Outlining components as they re-render" : "Highlighting off");
      ctx.refresh();
    }, "Outline each component on the page as it re-renders — the fastest way to see unnecessary work"),
    toggle("Flash", ui.flashOnCommit, () => {
      ui.flashOnCommit = !ui.flashOnCommit;
      ctx.refresh();
    }, "Outline the whole app element on every commit"),
    button("Clear", () => {
      model.commits.length = 0;
      ui.selectedCommitId = null;
      ctx.refresh();
    }, { title: "Drop recorded commits" })
  );
  if (commits.length === 0) {
    return [bar, emptyState(
      "No commits recorded yet.",
      "Interact with the app — every render is captured while the panel is open."
    )];
  }
  const out = [bar, renderSummary$1(ctx)];
  if (ui.profilerView === "commit") {
    out.push(renderStrip(ctx));
    const selected = commits.find((c) => c.commitId === ui.selectedCommitId) ?? commits[commits.length - 1];
    out.push(renderCommitDetail(ctx, selected));
  } else if (ui.profilerView === "ranked") {
    out.push(renderRanked(ctx));
    out.push(renderHotAtoms(ctx));
  } else {
    out.push(renderInsights$1(ctx));
    out.push(renderHotAtoms(ctx));
  }
  return out;
}
function renderSummary$1(ctx) {
  const { model, ui } = ctx;
  const commits = model.commits;
  let total = 0, morph = 0, rendered = 0, memoized = 0, full = 0;
  let slowest = null;
  for (const commit of commits) {
    total += commit.duration;
    morph += commit.morphTime ?? 0;
    rendered += commit.rendered;
    memoized += commit.memoized;
    if (commit.fullRender) full += 1;
    if (!slowest || commit.duration > slowest.duration) slowest = commit;
  }
  const first = commits[0];
  const last = commits[commits.length - 1];
  const span = first && last ? last.startTime - first.startTime : 0;
  const rate = span > 0 ? commits.length / (span / 1e3) : 0;
  const memoShare = rendered + memoized > 0 ? memoized / (rendered + memoized) : 0;
  const domNodes = last?.domNodes;
  return section("Performance summary", statGrid(
    stat("commits", fmtCount(model.totals.commits)),
    stat("total render", fmtMs(total)),
    stat("avg / commit", fmtMs(commits.length > 0 ? total / commits.length : 0), {
      tone: total / Math.max(1, commits.length) >= 8 ? "warn" : void 0
    }),
    slowest ? stat("slowest", fmtMs(slowest.duration), {
      tone: slowest.duration >= 16 ? "warn" : void 0,
      title: `Commit #${slowest.commitId} — click to inspect`,
      onClick: () => {
        ui.selectedCommitId = slowest.commitId;
        ui.profilerView = "commit";
        ctx.refresh();
      }
    }) : null,
    morph > 0 ? stat("dom diff", fmtMs(morph), {
      title: "Time in the reconciler. A large share here means the tree is big, not that the program is slow.",
      tone: total > 0 && morph / total > 0.5 ? "warn" : void 0
    }) : null,
    stat("memoized", fmtPct(memoized, rendered + memoized), {
      tone: rendered + memoized > 0 && memoShare < 0.2 ? "warn" : "good",
      title: `${fmtCount(memoized)} skipped of ${fmtCount(rendered + memoized)} component evaluations`
    }),
    stat("full renders", fmtCount(full), {
      tone: full > Math.max(1, commits.length * 0.5) ? "warn" : void 0,
      title: "Commits that bypassed memoization and re-evaluated the whole tree"
    }),
    rate > 0 ? stat("commit rate", `${rate.toFixed(1)}/s`, { tone: rate >= 30 ? "warn" : void 0 }) : null,
    domNodes !== void 0 ? stat("dom nodes", fmtCount(domNodes)) : null
  ));
}
function renderStrip(ctx) {
  const { model, ui } = ctx;
  const max = Math.max(...model.commits.map((c) => c.duration), 1e-3);
  const strip = h("div", { class: "commit-strip" });
  for (const commit of model.commits) {
    const height = Math.max(3, Math.round(commit.duration / max * 52));
    strip.appendChild(h("div", {
      class: [
        "commit-bar",
        commit.initial ? "is-initial" : commit.fullRender ? "is-full" : "",
        commit.commitId === ui.selectedCommitId ? "is-selected" : ""
      ].filter(Boolean).join(" "),
      style: `height:${height}px`,
      title: `#${commit.commitId} · ${fmtMs(commit.duration)} · ${commit.rendered} rendered / ${commit.memoized} memoized`,
      onclick: () => {
        ui.selectedCommitId = commit.commitId;
        ctx.refresh();
      }
    }));
  }
  return section(null, [
    strip,
    h(
      "div",
      { class: "legend" },
      h("span", {}, h("i", { class: "sw is-initial" }), "initial"),
      h("span", {}, h("i", { class: "sw is-full" }), "full render"),
      h("span", {}, h("i", { class: "sw" }), "incremental")
    )
  ], { flush: true });
}
function renderCommitDetail(ctx, commit) {
  const trigger = commit.initial ? "initial mount" : commit.changedPaths.length > 0 ? commit.changedPaths.join(", ") : "forced (async / effect / timer)";
  const flame = h("div", {});
  if (commit.components.length === 0) {
    flame.appendChild(faint("No component instances in this commit (primitive root)."));
  } else {
    const maxSelf = Math.max(...commit.components.map((c) => c.selfTime), 1e-3);
    const minDepth = Math.min(...commit.components.map((c) => c.depth));
    for (const record of commit.components) {
      flame.appendChild(renderFlameRow(ctx, record, maxSelf, minDepth));
    }
  }
  return section(`Commit #${commit.commitId}`, [
    h(
      "div",
      { class: "kv" },
      h("span", {}, "duration ", h("b", { class: "mono" }, fmtMs(commit.duration))),
      commit.morphTime !== void 0 ? h("span", {}, "dom diff ", h("b", { class: "mono" }, fmtMs(commit.morphTime))) : null,
      h("span", {}, "rendered ", h("b", {}, String(commit.rendered))),
      h("span", {}, "memoized ", h("b", {}, String(commit.memoized))),
      commit.domNodes !== void 0 ? h("span", {}, "dom nodes ", h("b", {}, fmtCount(commit.domNodes))) : null,
      commit.fullRender ? chip("full render", "amber") : chip("incremental", "blue")
    ),
    h("div", { class: "kv" }, h("span", {}, "trigger ", h("b", { class: "mono" }, trigger))),
    flame
  ], {
    actions: [
      copyButton(() => JSON.stringify(commit, null, 2), "Copy JSON")
    ]
  });
}
function renderFlameRow(ctx, record, maxSelf, minDepth) {
  const indent = (record.depth - minDepth) * 12;
  const width = record.phase === "memo" ? 22 : Math.max(6, Math.round(record.selfTime / maxSelf * 100));
  const deps = record.deps && record.deps.length > 0 ? `
deps: ${record.deps.join(", ")}` : "";
  return h(
    "div",
    { class: "flame-row", style: `padding-left:${indent}px` },
    h(
      "div",
      { class: "flame-bar-wrap" },
      h("div", {
        class: `flame-bar p-${record.phase}`,
        style: `width:${width}%`,
        title: `${record.name} — ${record.phase} — ${fmtMs(record.selfTime)}
${record.reason}${deps}
Click to inspect this instance`,
        onclick: () => ctx.selectInstance(record.instanceKey),
        onmouseenter: () => ctx.highlightInstance(record.instanceKey, false),
        onmouseleave: () => ctx.overlay.hideHover()
      }, `${record.kind === "user" ? "" : "▪ "}${record.name}`)
    ),
    h("span", { class: "flame-reason" }, record.reason),
    h("span", { class: "flame-time" }, record.phase === "memo" ? "memo" : fmtMs(record.selfTime))
  );
}
function renderRanked(ctx) {
  const { model, ui } = ctx;
  const rows = ctx.cache("componentAggregates", () => componentAggregates(model.commits));
  const maxTotal = Math.max(...rows.map((r) => r.total), 1e-3);
  return section("Components — ranked by self time", table(
    [
      { key: "name", label: "Component", sort: (r) => r.name, render: (r) => h("span", { class: "name" }, r.name) },
      { key: "kind", label: "Type", sort: (r) => r.kind, render: (r) => chip(r.kind, r.kind === "user" ? "purple" : "grey") },
      { key: "instances", label: "Inst", numeric: true, sort: (r) => r.instances, render: (r) => String(r.instances) },
      { key: "renders", label: "Renders", numeric: true, sort: (r) => r.renders, render: (r) => fmtCount(r.renders) },
      {
        key: "memo",
        label: "Memo",
        numeric: true,
        sort: (r) => r.memo,
        title: "Renders skipped by per-instance memoization",
        render: (r) => h(
          "span",
          {},
          fmtCount(r.memo),
          r.renders + r.memo > 0 ? faint(` ${fmtPct(r.memo, r.renders + r.memo)}`) : null
        )
      },
      {
        key: "total",
        label: "Total",
        numeric: true,
        sort: (r) => r.total,
        render: (r) => h(
          "span",
          { class: "bar-cell" },
          h("span", { class: "barfill", style: `width:${Math.round(r.total / maxTotal * 100)}%` }),
          h("span", {}, fmtMs(r.total))
        )
      },
      { key: "avg", label: "Avg", numeric: true, sort: (r) => r.renders ? r.total / r.renders : 0, render: (r) => r.renders ? fmtMs(r.total / r.renders) : "—" },
      { key: "max", label: "Max", numeric: true, sort: (r) => r.max, render: (r) => r.renders ? fmtMs(r.max) : "—" }
    ],
    rows,
    {
      sort: ui.rankedSort,
      onSort: (key2) => {
        ui.rankedSort = nextSort(ui.rankedSort, key2, key2 === "name" || key2 === "kind" ? 1 : -1);
        ctx.refresh();
      },
      empty: "No component renders captured."
    }
  ));
}
function renderHotAtoms(ctx) {
  const rows = hotAtoms(ctx.model.commits, 8);
  const max = Math.max(1, ...rows.map(([, n]) => n));
  return section("Reactivity — state paths that triggered commits", rows.length > 0 ? h("div", {}, ...rows.map(([path, count]) => barRow(code(path), count / max, `${fmtCount(count)} commit${count === 1 ? "" : "s"}`, {
    title: `Filter the State tab to $${path}`,
    onClick: () => {
      ctx.ui.stateFilter = path.split(".")[0] ?? path;
      ctx.selectTab("state");
    }
  }))) : faint("No state-driven commits yet (forced / initial only)."));
}
function renderInsights$1(ctx) {
  const { model } = ctx;
  const aggs = ctx.cache("componentAggregates", () => componentAggregates(model.commits));
  const items = [];
  const commitCount = model.commits.length;
  for (const agg of aggs) {
    if (agg.renders === 0) continue;
    const avg = agg.total / agg.renders;
    if (avg >= 8) {
      items.push({
        tone: "warn",
        icon: "▲",
        text: `${agg.name} averages ${fmtMs(avg)} per render across ${agg.instances} instance(s) — move the expensive work into a $memo, or split the component so less of it re-runs.`
      });
    }
    if (agg.kind === "user" && agg.renders >= 12 && agg.memo === 0 && commitCount >= 4) {
      items.push({
        tone: "warn",
        icon: "↻",
        text: `${agg.name} re-rendered ${fmtCount(agg.renders)}× and was never memoized — it reads a $state path that changes on every commit. Check what it reads in the Inspect tab.`
      });
    }
  }
  const forced = model.commits.filter((c) => c.fullRender && !c.initial).length;
  if (forced >= 3) {
    items.push({
      tone: "warn",
      icon: "⛶",
      text: `${fmtCount(forced)} commits bypassed memoization entirely. A forced render comes from an explicit notify — an async resolution, a timer, or an effect — so every component re-ran regardless of its deps.`
    });
  }
  const morphHeavy = model.commits.filter((c) => (c.morphTime ?? 0) > c.duration * 0.6).length;
  if (morphHeavy >= 5) {
    items.push({
      tone: "warn",
      icon: "⇄",
      text: `${fmtCount(morphHeavy)} commits spent most of their time in the DOM reconciler, not in your program. That is a tree-size problem — paginate, virtualise, or render fewer nodes.`
    });
  }
  const rateWindow = model.commits.slice(-20);
  if (rateWindow.length >= 20) {
    const span = (rateWindow[rateWindow.length - 1].startTime - rateWindow[0].startTime) / 1e3;
    if (span > 0 && rateWindow.length / span > 30) {
      items.push({
        tone: "bad",
        icon: "⚠",
        text: `Commits are arriving at ${(rateWindow.length / span).toFixed(0)}/s. Something is writing state in a loop — check the Effects tab for a hot trigger and the State tab's activity sort.`
      });
    }
  }
  if (items.length === 0) {
    items.push({
      tone: "good",
      icon: "✓",
      text: commitCount > 0 ? "No render hot-spots detected. Component bodies are cheap and memoization is doing its job." : "Nothing captured yet."
    });
  }
  return section("Insights", insightList(items.slice(0, 8)));
}
const PHASES = ["mount", "run", "cleanup", "unmount", "error"];
const PHASE_TONE = {
  mount: "green",
  run: "blue",
  cleanup: "purple",
  unmount: "grey",
  error: "red"
};
const effectsTab = {
  id: "effects",
  label: "Effects",
  icon: "↻",
  hint: "Effect lifecycle timeline, trigger attribution, and run-on-demand",
  badge: (ctx) => {
    const errors = ctx.model.effects.filter((e) => e.phase === "error").length;
    if (errors > 0) return errors;
    return ctx.model.effects.length > 0 ? ctx.model.effects.length : null;
  },
  render: (ctx) => render$9(ctx)
};
function render$9(ctx) {
  const { model, ui } = ctx;
  const bar = toolbar(
    chipGroup(
      [
        { value: "timeline", label: "Timeline", title: "One lane per effect on a shared time axis" },
        { value: "log", label: "Log", title: "Chronological event log" },
        { value: "mounted", label: "Mounted", title: "Every live effect and what it subscribes to" }
      ],
      ui.effectView,
      (value) => {
        ui.effectView = value;
        ctx.refresh();
      }
    ),
    spacer(),
    ui.effectView !== "mounted" ? h("div", { class: "filters" }, ...PHASES.map((phase) => toggle(phase, ui.phaseFilter.has(phase), () => {
      if (ui.phaseFilter.has(phase)) ui.phaseFilter.delete(phase);
      else ui.phaseFilter.add(phase);
      ctx.refresh();
    }))) : null,
    button("Clear", () => {
      model.effects.length = 0;
      ctx.refresh();
    }, { title: "Drop recorded effect events" })
  );
  if (ui.effectView === "mounted") {
    return [bar, renderSummary(ctx), renderMounted(ctx)];
  }
  if (model.effects.length === 0) {
    return [bar, emptyState(
      "No effects observed yet.",
      "Effects appear as they mount, run, and clean up. If you expected one and see nothing, check the Mounted view — a dependency list that never matches produces no events at all."
    )];
  }
  const insights = renderInsights(ctx);
  const out = [bar, renderSummary(ctx)];
  if (insights) out.push(insights);
  out.push(ui.effectView === "timeline" ? renderTimeline(ctx) : renderLog(ctx));
  if (ui.selectedEffect) {
    const detail = renderSelected(ctx, ui.selectedEffect);
    if (detail) out.push(detail);
  }
  return out;
}
function renderSummary(ctx) {
  const { model } = ctx;
  const keys = /* @__PURE__ */ new Set();
  let runs = 0, total = 0, cleanups = 0, errors = 0, max = 0;
  for (const event of model.effects) {
    keys.add(event.effectKey);
    if (event.phase === "run") {
      runs += 1;
      total += event.duration ?? 0;
      if ((event.duration ?? 0) > max) max = event.duration ?? 0;
    } else if (event.phase === "cleanup") cleanups += 1;
    else if (event.phase === "error") errors += 1;
  }
  const mounted = can(ctx.app, "getEffects") ? ctx.app.getEffects().length : keys.size;
  return section("Effect summary", statGrid(
    stat("mounted", fmtCount(mounted)),
    stat("seen", fmtCount(keys.size), { title: "Distinct effects observed in the retained window" }),
    stat("runs", fmtCount(runs)),
    stat("total run", fmtMs(total)),
    stat("avg run", fmtMs(runs > 0 ? total / runs : 0), { tone: runs > 0 && total / runs >= 6 ? "warn" : void 0 }),
    stat("slowest", fmtMs(max)),
    stat("cleanups", fmtCount(cleanups)),
    stat("errors", fmtCount(errors), { tone: errors > 0 ? "bad" : "good" })
  ));
}
function renderInsights(ctx) {
  const aggs = effectAggregates(ctx.model.effects);
  const items = [];
  for (const agg of aggs) {
    if (agg.errors > 0) {
      items.push({ tone: "bad", icon: "✖", text: `${agg.label} threw ${fmtCount(agg.errors)}× — the body is failing, so anything after the throw never runs.` });
    }
    if (agg.runs >= 20) {
      items.push({ tone: "warn", icon: "↻", text: `${agg.label} ran ${fmtCount(agg.runs)}× (${agg.triggers}) — a hot trigger. If that is not intentional, narrow the dependency list or add debounce(N).` });
    } else if (agg.runs >= 1 && agg.total / agg.runs >= 6) {
      items.push({ tone: "warn", icon: "▲", text: `${agg.label} averages ${fmtMs(agg.total / agg.runs)} per run — heavy synchronous work in an effect body blocks the next paint.` });
    }
    if (agg.mounts >= 4) {
      items.push({ tone: "warn", icon: "⇅", text: `${agg.label} mounted ${fmtCount(agg.mounts)}× — its owning component is remounting (a changing key:, or a conditional branch flipping), which tears down and re-wires the effect each time.` });
    }
  }
  if (items.length === 0) return null;
  return section("Insights", h("div", { class: "insights" }, ...items.slice(0, 6).map((item) => h(
    "div",
    { class: `insight t-${item.tone}` },
    h("span", { class: "insight-ic" }, item.icon),
    h("span", {}, item.text)
  ))));
}
function renderTimeline(ctx) {
  const { model, ui } = ctx;
  const base = model.firstTime ?? 0;
  const last = model.effects.reduce((max, e) => Math.max(max, e.time), base);
  const span = Math.max(1, last - base);
  const order = [];
  const lanes = /* @__PURE__ */ new Map();
  for (const event of model.effects) {
    let lane = lanes.get(event.effectKey);
    if (!lane) {
      lane = { label: event.label, instance: event.instanceKey != null, events: [] };
      lanes.set(event.effectKey, lane);
      order.push(event.effectKey);
    }
    lane.events.push(event);
  }
  const wrap = h("div", {});
  wrap.appendChild(h(
    "div",
    { class: "tl-head" },
    h("span", { class: "section-title", style: "margin:0" }, `Timeline · ${fmtRel(span)} span`),
    h("span", { class: "tl-axis" }, "0", h("span", { class: "tl-axis-end" }, fmtRel(span)))
  ));
  for (const key2 of order) {
    const lane = lanes.get(key2);
    const track = h("div", { class: "tl-track" });
    for (const event of lane.events) {
      if (!ui.phaseFilter.has(event.phase)) continue;
      const left = (event.time - base) / span * 100;
      track.appendChild(h("span", {
        class: `tl-dot ${PHASE_TONE[event.phase] ?? "grey"}`,
        style: `left:${Math.min(99, Math.max(0, left))}%`,
        title: `${event.phase} · ${event.reason}${event.duration != null ? ` · ${fmtMs(event.duration)}` : ""} · ${fmtRel(event.time - base)}`
      }));
    }
    wrap.appendChild(h(
      "div",
      {
        class: `tl-row ${ui.selectedEffect === key2 ? "is-selected" : ""}`,
        onclick: () => {
          ui.selectedEffect = ui.selectedEffect === key2 ? null : key2;
          ctx.refresh();
        }
      },
      h(
        "span",
        { class: "tl-name", title: key2 },
        lane.label,
        lane.instance ? chip("inst", "purple") : null
      ),
      track
    ));
  }
  return section(null, wrap, { flush: true });
}
function renderLog(ctx) {
  const { model, ui } = ctx;
  const base = model.firstTime ?? 0;
  const rows = model.effects.filter((e) => ui.phaseFilter.has(e.phase)).slice(-250).reverse();
  const wrap = h("div", {});
  if (rows.length === 0) {
    wrap.appendChild(faint("No events match the active filters."));
  }
  for (const event of rows) {
    wrap.appendChild(h(
      "div",
      {
        class: "log-row",
        onclick: () => {
          ui.selectedEffect = event.effectKey;
          ctx.refresh();
        }
      },
      h("span", { class: "t" }, fmtRel(event.time - base)),
      h("span", { class: "ph" }, chip(event.phase, PHASE_TONE[event.phase] ?? "grey")),
      h("span", { class: "lbl" }, event.label),
      h(
        "span",
        { class: "rsn" },
        event.reason,
        event.phase === "run" && event.duration != null ? ` · ${fmtMs(event.duration)}` : "",
        event.phase === "cleanup" && event.cleanups != null ? ` · ${event.cleanups}×` : "",
        event.error ? ` · ${event.error}` : ""
      )
    ));
  }
  return section("Log", wrap, { flush: true });
}
function renderMounted(ctx) {
  const { app, model } = ctx;
  if (!can(app, "getEffects")) {
    return section("Mounted effects", faint("This runtime does not expose its mounted effects."));
  }
  const effects = app.getEffects();
  const aggs = new Map(effectAggregates(model.effects).map((agg) => [agg.effectKey, agg]));
  return section(`Mounted effects (${effects.length})`, table(
    [
      {
        key: "label",
        label: "Effect",
        sort: (row) => row.label,
        render: (row) => h(
          "span",
          {},
          h("span", { class: "mono" }, row.label),
          row.instanceKey ? h("button", {
            class: "chip purple is-link",
            title: `Inspect ${row.instanceKey}`,
            onclick: () => ctx.selectInstance(row.instanceKey)
          }, "instance") : null
        )
      },
      { key: "triggers", label: "Triggers", render: (row) => code(row.triggers) },
      {
        key: "deps",
        label: "Subscribes to",
        render: (row) => row.stateDeps.length > 0 ? h("span", { class: "chip-row" }, ...row.stateDeps.map((dep) => h("button", {
          class: "chip blue is-link",
          onclick: () => {
            ctx.ui.stateFilter = dep.split(".")[0] ?? dep;
            ctx.selectTab("state");
          }
        }, `$${dep}`))) : faint("—")
      },
      {
        key: "intervals",
        label: "Timers",
        render: (row) => row.intervals.length > 0 ? code(row.intervals.map((ms) => `${ms}ms`).join(", ")) : faint("—")
      },
      { key: "cleanups", label: "Cleanups", numeric: true, sort: (row) => row.cleanups, render: (row) => String(row.cleanups) },
      {
        key: "runs",
        label: "Runs",
        numeric: true,
        sort: (row) => aggs.get(row.effectKey)?.runs ?? 0,
        render: (row) => {
          const agg = aggs.get(row.effectKey);
          return agg ? h("span", {}, fmtCount(agg.runs), agg.errors > 0 ? chip(`${agg.errors} err`, "red") : null) : faint("0");
        }
      },
      {
        key: "run",
        label: "",
        render: (row) => can(app, "runEffect") ? button("Run now", () => {
          const ok = app.runEffect(row.effectKey);
          ctx.toast(ok ? `Ran ${row.label}` : `${row.label} is no longer mounted`, ok ? "good" : "warn");
          ctx.refresh();
        }, { title: "Fire this effect's body now (prior cleanups run first)" }) : null
      }
    ],
    effects,
    { empty: "No effects are mounted." }
  ));
}
function renderSelected(ctx, effectKey) {
  const { model } = ctx;
  const events = model.effects.filter((e) => e.effectKey === effectKey);
  if (events.length === 0) return null;
  const agg = effectAggregates(events)[0];
  const base = model.firstTime ?? 0;
  const first = events[0];
  return section(`Effect — ${first.label}`, [
    h(
      "div",
      { class: "kv" },
      h("span", {}, "triggers ", h("b", { class: "mono" }, first.triggers)),
      h("span", {}, "runs ", h("b", {}, String(agg?.runs ?? 0))),
      h("span", {}, "total ", h("b", { class: "mono" }, fmtMs(agg?.total ?? 0))),
      agg && agg.errors > 0 ? chip(`${agg.errors} errors`, "red") : null,
      first.instanceKey ? h("span", {}, "owner ", h("b", { class: "mono" }, first.instanceKey)) : null
    ),
    h("div", {}, ...events.slice(-40).reverse().map((event) => h(
      "div",
      { class: "log-row" },
      h("span", { class: "t" }, fmtRel(event.time - base)),
      h("span", { class: "ph" }, chip(event.phase, PHASE_TONE[event.phase] ?? "grey")),
      h(
        "span",
        { class: "rsn" },
        event.reason,
        event.duration != null ? ` · ${fmtMs(event.duration)}` : "",
        event.error ? ` · ${event.error}` : ""
      )
    )))
  ], {
    actions: [
      first.instanceKey ? button("Inspect owner", () => ctx.selectInstance(first.instanceKey), { title: "Select the component that owns this effect" }) : null,
      button("Close", () => {
        ctx.ui.selectedEffect = null;
        ctx.refresh();
      })
    ].filter((n) => n != null)
  });
}
const networkTab = {
  id: "network",
  label: "Network",
  icon: "⇅",
  hint: "HTTP requests, response bodies, and request mocking / latency injection",
  badge: (ctx) => {
    const stats = networkStats(ctx.model.network);
    if (stats.failed > 0) return stats.failed;
    return stats.total > 0 ? stats.total : null;
  },
  render: (ctx) => render$8(ctx)
};
function render$8(ctx) {
  const { model, ui } = ctx;
  const stats = networkStats(model.network);
  const activeRules = ui.rules.filter((rule) => rule.enabled).length;
  const bar = toolbar(
    searchInput(ui.networkFilter, (value) => {
      ui.networkFilter = value;
      ctx.refresh();
    }, "Filter by URL or method…", { focusKey: "network-filter" }),
    toggle("Problems", ui.networkOnlyProblems, () => {
      ui.networkOnlyProblems = !ui.networkOnlyProblems;
      ctx.refresh();
    }, "Only failures, blocks, and 4xx/5xx responses"),
    spacer(),
    toggle(
      activeRules > 0 ? `Rules (${activeRules})` : "Rules",
      ui.showRules,
      () => {
        ui.showRules = !ui.showRules;
        ctx.refresh();
      },
      "Delay, mock, or fail matching requests"
    ),
    button("Clear", () => {
      model.network.length = 0;
      ui.selectedRequest = null;
      ctx.refresh();
    }, { title: "Drop recorded requests" })
  );
  const out = [bar];
  if (!ctx.hook.options.captureNetwork) {
    out.push(section(null, h(
      "div",
      { class: "banner t-amber" },
      h("span", {}, "Network capture is off — turn it back on in Settings.")
    ), { flush: true }));
  }
  if (ui.showRules) out.push(renderRules(ctx));
  if (model.network.length === 0) {
    out.push(emptyState(
      "No requests captured yet.",
      "Every $query, $mutation, and Http({...}) call the program makes is recorded here."
    ));
    return out;
  }
  out.push(section("Summary", statGrid(
    stat("requests", fmtCount(model.totals.network)),
    stat("pending", fmtCount(stats.pending), { tone: stats.pending > 0 ? "warn" : void 0 }),
    stat("failed", fmtCount(stats.failed), { tone: stats.failed > 0 ? "bad" : "good" }),
    stats.mocked > 0 ? stat("mocked", fmtCount(stats.mocked), { tone: "warn" }) : null,
    stat("avg", fmtMs(stats.avgDuration)),
    stats.slowest ? stat("slowest", fmtMs(stats.slowest.duration), {
      title: `${stats.slowest.method} ${stats.slowest.url}`,
      onClick: () => {
        ui.selectedRequest = stats.slowest.requestId;
        ctx.refresh();
      }
    }) : null,
    stat("transferred", fmtBytes(stats.bytes))
  )));
  out.push(renderList(ctx));
  const selected = model.network.find((r) => r.requestId === ui.selectedRequest);
  if (selected) out.push(...renderDetail(ctx, selected));
  const endpoints = endpointBreakdown(model.network);
  if (endpoints.length > 1) {
    const max = Math.max(...endpoints.map((e) => e.total));
    out.push(section("Slowest endpoints", h("div", {}, ...endpoints.slice(0, 8).map((entry) => barRow(
      code(`${entry.method} ${truncateMiddle(entry.path, 44)}`),
      entry.total / max,
      `${fmtCount(entry.count)}× · ${fmtMs(entry.total / entry.count)} avg`,
      { tone: entry.failures > 0 ? "bad" : void 0, title: entry.failures > 0 ? `${entry.failures} failed` : void 0 }
    )))));
  }
  return out;
}
function renderList(ctx) {
  const { model, ui } = ctx;
  const filter = ui.networkFilter.trim().toLowerCase();
  const rows = model.network.filter((request) => {
    if (filter !== "" && !`${request.method} ${request.url}`.toLowerCase().includes(filter)) return false;
    if (ui.networkOnlyProblems) {
      const failed = request.phase === "error" || request.phase === "blocked" || (request.status ?? 0) >= 400;
      if (!failed) return false;
    }
    return true;
  });
  const first = rows.reduce((min, r) => Math.min(min, r.startTime), Number.MAX_SAFE_INTEGER);
  const last = rows.reduce((max, r) => Math.max(max, r.endTime ?? r.startTime), 0);
  const span = Math.max(1, last - first);
  return section(null, h("div", { class: "list-wrap", [SCROLL_KEY_ATTR]: "network-list" }, table(
    [
      {
        key: "status",
        label: "Status",
        render: (row) => statusChip(row),
        sort: (row) => row.status ?? (row.phase === "pending" ? 0 : 999)
      },
      { key: "method", label: "Method", sort: (row) => row.method, render: (row) => code(row.method) },
      {
        key: "url",
        label: "Path",
        sort: (row) => row.url,
        render: (row) => h(
          "span",
          { title: row.url },
          truncateMiddle(urlPath(row.url), 46),
          urlHost(row.url) ? faint(` ${urlHost(row.url)}`) : null,
          row.rule ? chip(row.rule, "purple", "Matched a DevTools rule") : null
        )
      },
      {
        key: "size",
        label: "Size",
        numeric: true,
        sort: (row) => row.responseSize ?? 0,
        render: (row) => fmtBytes(row.responseSize)
      },
      {
        key: "time",
        label: "Time",
        numeric: true,
        sort: (row) => row.duration ?? 0,
        render: (row) => h(
          "span",
          {},
          row.duration !== void 0 ? fmtMs(row.duration) : faint("…"),
          row.injectedDelay ? faint(` +${row.injectedDelay}ms`) : null
        )
      },
      {
        key: "waterfall",
        label: "Waterfall",
        render: (row) => waterfallBar(
          (row.startTime - first) / span,
          Math.max(0.01, (row.duration ?? 0) / span),
          row.phase === "error" || row.phase === "blocked" ? "red" : row.phase === "mock" ? "purple" : "cyan",
          `${fmtMs(row.duration)} starting at +${Math.round(row.startTime - first)}ms`
        )
      }
    ],
    rows,
    {
      rowClass: (row) => row.requestId === ui.selectedRequest ? "is-selected" : "",
      onRowClick: (row) => {
        ui.selectedRequest = row.requestId === ui.selectedRequest ? null : row.requestId;
        ctx.refresh();
      },
      empty: filter === "" ? "No requests match the current filters." : `Nothing matches "${filter}".`
    }
  )), { flush: true });
}
function statusChip(request) {
  if (request.phase === "pending") return chip("pending", "grey");
  if (request.phase === "blocked") return chip("blocked", "purple", "Blocked by a DevTools rule");
  if (request.phase === "error") return chip("failed", "red", request.error);
  const status = request.status ?? 0;
  const tone = status >= 500 ? "red" : status >= 400 ? "amber" : status >= 300 ? "blue" : "green";
  return chip(String(status || "?"), request.phase === "mock" ? "purple" : tone, request.phase === "mock" ? "Mocked by a DevTools rule" : void 0);
}
function renderDetail(ctx, request) {
  const { ui } = ctx;
  const panes = [
    { value: "response", label: "Response", title: "Response body" },
    { value: "request", label: "Request", title: "Request body" },
    { value: "headers", label: "Headers", title: "Request and response headers" },
    { value: "timing", label: "Timing", title: "When it ran and what it cost" }
  ];
  const head = section(null, [
    h(
      "div",
      { class: "detail-head" },
      statusChip(request),
      code(request.method),
      h("span", { class: "mono wrap", title: request.url }, truncateMiddle(request.url, 80)),
      spacer(),
      copyButton(() => request.url, "Copy URL"),
      copyButton(() => asCurl(request), "Copy as curl"),
      can(ctx.app, "setNetworkRules") ? button("Mock this", () => {
        const rule = newRule({
          pattern: urlPath(request.url),
          method: request.method,
          action: "mock",
          status: request.status ?? 200,
          body: request.responseBody ?? "",
          label: `mock ${urlPath(request.url)}`
        });
        ui.rules = [...ui.rules, rule];
        ui.showRules = true;
        pushRules(ctx);
        ctx.toast("Rule added — edit the body below");
        ctx.refresh();
      }, { title: "Create a rule that replays this response for matching requests" }) : null
    ),
    request.error ? h("div", { class: "banner t-red" }, request.error) : null
  ], { flush: true });
  const tabs = section(null, chipGroup(panes, ui.networkPane, (value) => {
    ui.networkPane = value;
    ctx.refresh();
  }), { flush: true });
  let body;
  switch (ui.networkPane) {
    case "response":
      body = request.responseBody ? h("pre", { class: "code-pre" }, request.responseBody) : faint(request.phase === "pending" ? "Still in flight." : "Empty response body.");
      break;
    case "request":
      body = request.requestBody ? h("pre", { class: "code-pre" }, request.requestBody) : faint("No request body (GET / HEAD, or an empty payload).");
      break;
    case "headers":
      body = h(
        "div",
        {},
        section("Request headers", headerList(request.requestHeaders)),
        section("Response headers", headerList(request.responseHeaders))
      );
      break;
    case "timing":
      body = defList([
        ["started", `+${Math.round(request.startTime)}ms (page clock)`],
        ["duration", fmtMs(request.duration)],
        ["injected delay", request.injectedDelay ? `${request.injectedDelay}ms (DevTools rule)` : "none"],
        ["status", request.status !== void 0 ? String(request.status) : request.phase],
        ["size", fmtBytes(request.responseSize)],
        ["rule", request.rule ?? "none"]
      ]);
      break;
  }
  return [head, tabs, section(null, body, { flush: true })];
}
function headerList(headers) {
  const entries = Object.entries(headers ?? {});
  if (entries.length === 0) return faint("None recorded.");
  return defList(entries.sort((a, b) => a[0].localeCompare(b[0])).map(([key2, value]) => [
    key2,
    h("span", { class: "mono wrap" }, value)
  ]));
}
function asCurl(request) {
  const parts = [`curl -X ${request.method} ${JSON.stringify(request.url)}`];
  for (const [key2, value] of Object.entries(request.requestHeaders ?? {})) {
    parts.push(`  -H ${JSON.stringify(`${key2}: ${value}`)}`);
  }
  if (request.requestBody) parts.push(`  --data ${JSON.stringify(request.requestBody)}`);
  return parts.join(" \\\n");
}
function renderRules(ctx) {
  const { app, ui } = ctx;
  if (!can(app, "setNetworkRules")) {
    return section("Request rules", faint("This runtime does not support DevTools request rules."));
  }
  const rows = ui.rules.map((rule) => renderRule(ctx, rule));
  return section("Request rules", [
    faint("Rules are evaluated in order; the first enabled match wins. A pattern is a URL substring, or a glob with * wildcards. An empty pattern matches everything."),
    h("div", { class: "rule-list" }, ...rows),
    h(
      "div",
      { class: "detail-head" },
      button("＋ Delay", () => addRule(ctx, "delay"), { title: "Add latency to matching requests" }),
      button("＋ Mock", () => addRule(ctx, "mock"), { title: "Answer matching requests with a canned response" }),
      button("＋ Fail", () => addRule(ctx, "fail"), { title: "Fail matching requests" }),
      button("＋ Offline", () => addRule(ctx, "offline"), { title: "Blackhole every request" }),
      spacer(),
      ui.rules.length > 0 ? button("Remove all", () => {
        ui.rules = [];
        pushRules(ctx);
        ctx.toast("Rules cleared");
        ctx.refresh();
      }, { tone: "warn" }) : null
    )
  ]);
}
function addRule(ctx, action) {
  const seed = action === "offline" ? { action, pattern: "*", label: "offline", message: "Failed to fetch (DevTools offline mode)" } : action === "delay" ? { action, delayMs: 1e3 } : { action };
  ctx.ui.rules = [...ctx.ui.rules, newRule(seed)];
  pushRules(ctx);
  ctx.refresh();
}
function renderRule(ctx, rule) {
  const { ui } = ctx;
  const update = (patch2) => {
    ui.rules = ui.rules.map((entry) => entry.id === rule.id ? { ...entry, ...patch2 } : entry);
    pushRules(ctx);
    ctx.refresh();
  };
  const field = (name, placeholder, value, onCommit, width = "150px") => textField({
    focusKey: `rule:${rule.id}:${name}`,
    placeholder,
    value,
    width,
    onCommit
  });
  const matches = ctx.model.network.filter((request) => findMatchingRule([rule], request.method, request.url) !== null).length;
  return h(
    "div",
    { class: `rule ${rule.enabled ? "" : "is-off"}` },
    h(
      "div",
      { class: "rule-head" },
      toggle(rule.enabled ? "on" : "off", rule.enabled, () => update({ enabled: !rule.enabled })),
      chip(rule.action, rule.action === "mock" ? "purple" : rule.action === "delay" ? "blue" : "red"),
      field("pattern", "URL pattern (empty = all)", rule.pattern, (value) => update({ pattern: value }), "220px"),
      field("method", "method", rule.method ?? "", (value) => update({ method: value.trim() === "" ? void 0 : value.trim().toUpperCase() }), "80px"),
      spacer(),
      muted(`${matches} match${matches === 1 ? "" : "es"}`),
      button("✕", () => {
        ui.rules = ui.rules.filter((entry) => entry.id !== rule.id);
        pushRules(ctx);
        ctx.refresh();
      }, { title: "Remove this rule" })
    ),
    h(
      "div",
      { class: "rule-body" },
      rule.action !== "offline" ? field("delay", "delay ms", String(rule.delayMs ?? 0), (value) => update({ delayMs: Number(value) || 0 }), "90px") : null,
      rule.action === "mock" ? field("status", "status", String(rule.status ?? 200), (value) => update({ status: Number(value) || 200 }), "80px") : null,
      rule.action === "mock" ? (() => {
        const area = h("textarea", {
          class: "rule-body-input",
          placeholder: '{"items": []}  — JSON, or plain text'
        });
        area.value = rule.body ?? "";
        area.addEventListener("change", () => update({ body: area.value }));
        return area;
      })() : null,
      rule.action === "fail" || rule.action === "offline" ? field("message", "error message", rule.message ?? "", (value) => update({ message: value }), "260px") : null
    )
  );
}
function pushRules(ctx) {
  if (!can(ctx.app, "setNetworkRules")) return;
  ctx.app.setNetworkRules(ctx.ui.rules);
}
function endpointBreakdown(requests) {
  const map = /* @__PURE__ */ new Map();
  for (const request of requests) {
    const path = urlPath(request.url);
    const key2 = `${request.method} ${path}`;
    let entry = map.get(key2);
    if (!entry) {
      entry = { method: request.method, path, count: 0, total: 0, failures: 0 };
      map.set(key2, entry);
    }
    entry.count += 1;
    entry.total += request.duration ?? 0;
    if (request.phase === "error" || request.phase === "blocked" || (request.status ?? 0) >= 400) entry.failures += 1;
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}
const LEVELS = ["log", "info", "warn", "error", "debug"];
const LEVEL_TONE = {
  log: "grey",
  info: "blue",
  warn: "amber",
  error: "red",
  debug: "purple"
};
const consoleTab = {
  id: "console",
  label: "Console",
  icon: "▤",
  hint: "Program + runtime console output, errors, and a live expression REPL",
  badge: (ctx) => {
    const problems = ctx.model.logs.filter((l) => l.level === "error").length + ctx.model.errors.length;
    return problems > 0 ? problems : null;
  },
  render: (ctx) => render$7(ctx)
};
function render$7(ctx) {
  const { model, ui } = ctx;
  const bar = toolbar(
    searchInput(ui.logFilter, (value) => {
      ui.logFilter = value;
      ctx.refresh();
    }, "Filter output…", { focusKey: "console-filter" }),
    h("div", { class: "filters" }, ...LEVELS.map((level) => {
      const count = model.logs.filter((entry) => entry.level === level).length;
      return toggle(
        count > 0 ? `${level} ${count}` : level,
        ui.logLevels.has(level),
        () => {
          if (ui.logLevels.has(level)) ui.logLevels.delete(level);
          else ui.logLevels.add(level);
          ctx.refresh();
        }
      );
    })),
    spacer(),
    toggle("Capture", ui.captureConsole, () => {
      ui.captureConsole = !ui.captureConsole;
      ctx.toast(ui.captureConsole ? "Console capture on" : "Console capture off");
      ctx.refresh();
    }, "Mirror the page console into this panel"),
    button("Export", () => downloadText("aktion-console.txt", exportLogs(ctx), "text/plain"), {
      title: "Download the captured output"
    }),
    button("Clear", () => {
      model.logs.length = 0;
      model.errors.length = 0;
      ctx.refresh();
    })
  );
  const out = [bar];
  if (model.errors.length > 0) out.push(renderRuntimeErrors(ctx));
  out.push(renderWatches(ctx));
  out.push(renderRepl(ctx));
  out.push(renderLogs(ctx));
  return out;
}
function renderLogs(ctx) {
  const { model, ui } = ctx;
  const filter = ui.logFilter.trim().toLowerCase();
  const rows = model.logs.filter((entry) => {
    if (!ui.logLevels.has(entry.level)) return false;
    if (filter !== "" && !entry.text.toLowerCase().includes(filter)) return false;
    return true;
  });
  if (rows.length === 0) {
    return section("Output", faint(
      model.logs.length === 0 ? ui.captureConsole ? "Nothing logged yet. `console.log(...)` from the program appears here, along with every [aktion] diagnostic the runtime emits." : "Console capture is off." : "Nothing matches the active filters."
    ));
  }
  const list = h("div", { class: "log-list" });
  for (const entry of rows.slice(-300).reverse()) {
    list.appendChild(renderLogRow(entry));
  }
  return section(`Output (${fmtCount(model.totals.logs)})`, list, { flush: true });
}
function renderLogRow(entry) {
  return h(
    "div",
    { class: `console-row t-${entry.level}` },
    h("span", { class: "t" }, fmtClock(entry.time)),
    h("span", { class: "ph" }, chip(entry.level, LEVEL_TONE[entry.level] ?? "grey")),
    entry.origin === "runtime" ? chip("runtime", "purple", "Emitted by the Aktion runtime, not your program") : null,
    h("span", { class: "console-text" }, entry.text),
    entry.count > 1 ? h("span", { class: "console-count", title: `${entry.count} identical lines collapsed` }, `×${entry.count}`) : null,
    entry.stack ? h("details", { class: "console-stack" }, h("summary", {}, "stack"), h("pre", {}, entry.stack)) : null
  );
}
function renderRuntimeErrors(ctx) {
  const { model } = ctx;
  return section(`Runtime errors (${model.errors.length})`, h("div", {}, ...model.errors.slice(-12).reverse().map((error) => h(
    "div",
    { class: "insight t-bad" },
    h("span", { class: "insight-ic" }, "✖"),
    h(
      "span",
      {},
      chip(error.phase, "red"),
      " ",
      error.subject ? code(error.subject) : null,
      " ",
      error.message
    )
  ))));
}
function renderRepl(ctx) {
  const { app, ui } = ctx;
  if (!can(app, "evaluateExpression")) {
    return section("Expression REPL", faint("This runtime does not support expression evaluation."));
  }
  const input = h("input", {
    class: "repl-input",
    placeholder: "$count + 1 · $user.name · Util.range(0, 3) · $count = 5",
    value: ui.replDraft,
    spellcheck: "false",
    // A stable key, so running an expression (which grows the history ABOVE the
    // input and changes the tree shape) keeps the caret in the input.
    [FOCUS_KEY_ATTR]: "repl"
  });
  const run = () => {
    const source = input.value.trim();
    if (source === "") return;
    const result = app.evaluateExpression(source);
    ui.repl = [
      ...ui.repl.slice(-40),
      {
        input: source,
        ok: result.ok,
        output: result.ok ? result.text ?? result.value?.preview ?? "undefined" : result.error ?? "evaluation failed",
        time: Date.now()
      }
    ];
    ui.replHistory = [...ui.replHistory.filter((entry) => entry !== source), source].slice(-50);
    ui.replCursor = -1;
    ui.replDraft = "";
    ctx.refresh();
  };
  input.addEventListener("input", () => {
    ui.replDraft = input.value;
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      run();
      return;
    }
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      if (ui.replHistory.length === 0) return;
      event.preventDefault();
      const last = ui.replHistory.length - 1;
      const current = ui.replCursor === -1 ? ui.replHistory.length : ui.replCursor;
      const next = event.key === "ArrowUp" ? Math.max(0, current - 1) : Math.min(ui.replHistory.length, current + 1);
      ui.replCursor = next > last ? -1 : next;
      input.value = ui.replCursor === -1 ? "" : ui.replHistory[ui.replCursor] ?? "";
      ui.replDraft = input.value;
    }
  });
  const history = h("div", { class: "repl-log", [SCROLL_KEY_ATTR]: "repl-log" });
  for (const entry of ui.repl.slice(-12)) {
    history.appendChild(h(
      "div",
      { class: "repl-entry" },
      h(
        "div",
        { class: "repl-in" },
        h("span", { class: "repl-caret" }, "›"),
        code(entry.input),
        spacer(),
        // Re-running is the most common next action after reading a result.
        button("↻", () => {
          ui.replDraft = entry.input;
          const result = app.evaluateExpression(entry.input);
          ui.repl = [...ui.repl.slice(-40), {
            input: entry.input,
            ok: result.ok,
            output: result.ok ? result.text ?? result.value?.preview ?? "undefined" : result.error ?? "evaluation failed",
            time: Date.now()
          }];
          ctx.refresh();
        }, { title: "Run this expression again" }),
        button("👁", () => {
          if (!ui.watches.includes(entry.input)) ui.watches = [...ui.watches, entry.input].slice(-20);
          ctx.persist();
          ctx.toast(`Watching ${entry.input}`);
          ctx.refresh();
        }, { title: "Watch this expression — it is re-evaluated on every render" })
      ),
      h(
        "div",
        { class: `repl-out ${entry.ok ? "" : "is-error"}` },
        h("span", { class: "repl-caret" }, entry.ok ? "‹" : "✖"),
        h("pre", {}, entry.output)
      )
    ));
  }
  return section("Expression REPL", [
    ui.repl.length > 0 ? history : null,
    h(
      "div",
      { class: "repl-row" },
      h("span", { class: "repl-caret" }, "›"),
      input,
      button("Run", run, { title: "Evaluate against the live program scope (Enter)" }),
      ui.repl.length > 0 ? button("Clear", () => {
        ui.repl = [];
        ctx.refresh();
      }) : null
    ),
    faint("Aktion expressions, not JavaScript — the same scope the program sees. `$atom = value` writes through the reactive pipeline. ↑ / ↓ walk history.")
  ]);
}
function renderWatches(ctx) {
  const { app, ui } = ctx;
  const add = textField({
    focusKey: "watch-add",
    placeholder: "Watch an expression — $todos.length, $user.role …",
    onEnter: (value) => {
      const expr = value.trim();
      if (expr === "") return;
      if (!ui.watches.includes(expr)) ui.watches = [...ui.watches, expr].slice(-20);
      ctx.persist();
      ctx.refresh();
    }
  });
  const rows = ui.watches.map((expr) => {
    const result = can(app, "evaluateExpression") ? app.evaluateExpression(expr) : null;
    const text2 = result === null ? "no evaluator" : result.ok ? result.value?.preview ?? "undefined" : result.error ?? "failed";
    return h(
      "div",
      { class: "watch-row" },
      h("span", { class: "watch-expr", title: expr }, expr),
      h("span", { class: `watch-val ${result?.ok === false ? "is-error" : ""}`, title: result?.text ?? text2 }, text2),
      button("✕", () => {
        ui.watches = ui.watches.filter((entry) => entry !== expr);
        ctx.persist();
        ctx.refresh();
      }, { title: "Stop watching" })
    );
  });
  return section(`Watch (${ui.watches.length})`, [
    h("div", { class: "detail-head" }, add),
    ui.watches.length > 0 ? h("div", {}, ...rows) : faint("Pin an expression here and it is re-evaluated on every render — the value updates as you use the app. Watches survive a page reload.")
  ]);
}
function exportLogs(ctx) {
  const lines = ctx.model.logs.map((entry) => `${new Date(entry.time).toISOString()} [${entry.level}] ${entry.origin === "runtime" ? "(runtime) " : ""}${entry.text}${entry.count > 1 ? ` (×${entry.count})` : ""}`);
  for (const error of ctx.model.errors) {
    lines.push(`${(/* @__PURE__ */ new Date()).toISOString()} [error] (${error.phase}) ${error.subject ?? ""} ${error.message}`);
  }
  return lines.join("\n");
}
const routesTab = {
  id: "routes",
  label: "Routes",
  icon: "⌗",
  hint: "Current route, declared patterns, params, and navigation history",
  badge: (ctx) => ctx.model.routes.length > 0 ? ctx.model.routes.length : null,
  render: (ctx) => render$6(ctx)
};
function render$6(ctx) {
  const { app, model, ui } = ctx;
  if (!can(app, "getRoute")) {
    return [emptyState("This app does not expose its router.")];
  }
  const route = app.getRoute();
  const canNavigate = can(app, "navigate");
  const go = () => {
    const path = ui.routeDraft.trim();
    if (path === "" || !can(app, "navigate")) return;
    app.navigate(path);
    ui.routeDraft = "";
    ctx.toast(`Navigated to ${path}`);
    ctx.refresh();
  };
  const input = textField({
    focusKey: "route-navigate",
    value: ui.routeDraft,
    placeholder: "/orders/42",
    width: "220px",
    title: "Type a path and press Enter",
    onInput: (value) => {
      ui.routeDraft = value;
    },
    onEnter: go
  });
  const bar = toolbar(
    muted("Navigate"),
    input,
    button("Go", go, { title: "Navigate the app's router (its guard still applies)", disabled: !canNavigate }),
    spacer(),
    chip(route.mode, "blue", "URL strategy"),
    route.guarded ? chip("guarded", "amber", "The program installed a navigation guard, so a navigation can be redirected or refused") : null
  );
  const current = section("Current route", [
    statGrid(
      stat("path", route.path),
      stat("pattern", route.pattern ?? "—", { title: "The declared arm that matched" }),
      stat("params", String(Object.keys(route.params).length)),
      stat("navigations", String(model.totals.routes))
    ),
    Object.keys(route.params).length > 0 ? defList(Object.entries(route.params).map(([key2, value]) => [key2, code(value)])) : faint("This route takes no parameters."),
    route.basePath ? faint(`Served under base path ${route.basePath}`) : null
  ]);
  const declared = section(`Declared routes (${route.declared.length})`, route.declared.length > 0 ? h("div", { class: "route-list" }, ...route.declared.map((pattern) => {
    const isActive = pattern === route.pattern;
    const concrete = !pattern.includes(":") && !pattern.includes("*");
    return h(
      "div",
      { class: `route-row ${isActive ? "is-active" : ""}` },
      h("span", { class: "mono" }, pattern),
      pattern.includes(":") ? chip("params", "grey", "This pattern takes parameters — fill them in above") : null,
      isActive ? chip("active", "green") : null,
      spacer(),
      canNavigate && concrete ? button("Go", () => {
        app.navigate(pattern);
        ctx.toast(`Navigated to ${pattern}`);
        ctx.refresh();
      }) : null
    );
  })) : faint("No $router({...}) arms found. A single-page program declares no routes."));
  const history = section(`Navigation history (${model.routes.length})`, model.routes.length > 0 ? table(
    [
      {
        key: "time",
        label: "When",
        // Route timestamps come from the monotonic clock, so they can only be
        // reported RELATIVE to the newest event. Mixing them with
        // `Date.now()` produced a wall-clock time that was simply wrong.
        render: (row) => faint(`${fmtRel(Math.max(0, model.lastTime - row.time))} ago`)
      },
      { key: "from", label: "From", render: (row) => code(row.from || "—") },
      { key: "to", label: "To", render: (row) => code(row.to) },
      { key: "pattern", label: "Matched", render: (row) => row.pattern ? code(row.pattern) : chip("no match", "amber") },
      {
        key: "params",
        label: "Params",
        render: (row) => {
          const entries = Object.entries(row.params ?? {});
          return entries.length > 0 ? h("span", { class: "chip-row" }, ...entries.map(([key2, value]) => chip(`${key2}=${value}`, "grey"))) : faint("—");
        }
      },
      { key: "source", label: "Source", render: (row) => chip(row.source ?? "?", "blue") }
    ],
    [...model.routes].reverse()
  ) : faint("No navigations recorded yet."));
  const unmatched = model.routes.filter((entry) => entry.pattern == null);
  const insight2 = unmatched.length > 0 ? section("Insights", h(
    "div",
    { class: "insight t-warn" },
    h("span", { class: "insight-ic" }, "▲"),
    h("span", {}, `${unmatched.length} navigation${unmatched.length === 1 ? "" : "s"} matched no route arm (${unmatched.slice(-3).map((e) => e.to).join(", ")}). Without a \`default:\` arm the router renders nothing at all for those paths.`)
  )) : null;
  return [bar, current, declared, insight2, history].filter((node) => node != null);
}
const dataTab = {
  id: "data",
  label: "Data",
  icon: "⛁",
  hint: "Cached queries, global stores and forms, and browser storage",
  badge: (ctx) => {
    if (!can(ctx.app, "getQueries")) return null;
    const loading = ctx.app.getQueries().filter((query) => query.loading).length;
    return loading > 0 ? loading : null;
  },
  render: (ctx) => render$5(ctx)
};
function render$5(ctx) {
  const { ui } = ctx;
  const bar = toolbar(
    chipGroup(
      [
        { value: "queries", label: "Queries", title: "$query / Http({...}) resource cache" },
        { value: "stores", label: "Stores & forms", title: "Store({...}) and $form({...}) handles" },
        { value: "storage", label: "Storage", title: "localStorage, sessionStorage, and cookies" }
      ],
      ui.dataPane,
      (value) => {
        ui.dataPane = value;
        ctx.refresh();
      }
    ),
    spacer()
  );
  switch (ui.dataPane) {
    case "queries":
      return [bar, ...renderQueries$1(ctx)];
    case "stores":
      return [bar, ...renderStores(ctx)];
    case "storage":
      return [bar, ...renderStorage(ctx)];
  }
}
function renderQueries$1(ctx) {
  const { app } = ctx;
  if (!can(app, "getQueries")) {
    return [emptyState("This runtime does not expose its query cache.")];
  }
  const queries = app.getQueries();
  if (queries.length === 0) {
    return [emptyState(
      "No cached queries.",
      "A $query({...}) or Http({...}) resource appears here as soon as the program creates one."
    )];
  }
  const loading = queries.filter((query) => query.loading).length;
  const failed = queries.filter((query) => query.error !== void 0).length;
  const stale = queries.filter((query) => query.state === "stale").length;
  let invalidatePattern = "";
  const invalidate = () => {
    const pattern = invalidatePattern.trim();
    if (pattern === "" || !can(app, "invalidateQueries")) return;
    app.invalidateQueries(pattern);
    ctx.toast(`Invalidated queries matching "${pattern}"`);
    ctx.refresh();
  };
  const invalidateInput = textField({
    focusKey: "invalidate",
    placeholder: "/api/todos",
    width: "200px",
    onInput: (value) => {
      invalidatePattern = value;
    },
    onEnter: invalidate
  });
  const rows = queries.map((query) => renderQueryRow(ctx, query));
  return [
    section("Summary", statGrid(
      stat("cached", String(queries.length)),
      stat("loading", String(loading), { tone: loading > 0 ? "warn" : void 0 }),
      stat("failed", String(failed), { tone: failed > 0 ? "bad" : "good" }),
      stale > 0 ? stat("stale", String(stale)) : null
    )),
    section("Invalidate by key", h(
      "div",
      { class: "detail-head" },
      invalidateInput,
      button("Invalidate", invalidate, {
        title: "Refetch every cached query whose key contains this substring"
      }),
      spacer(),
      faint("Matching is substring-based, so /api/posts refreshes every page and filtered variant.")
    )),
    section(`Resources (${queries.length})`, h("div", { class: "prop-list" }, ...rows), { flush: true })
  ];
}
function renderQueryRow(ctx, query) {
  const { app, ui } = ctx;
  const expanded = ui.dataExpanded.has(query.key);
  const tone = query.error !== void 0 ? "red" : query.loading ? "amber" : query.state === "stale" ? "grey" : "green";
  return h(
    "div",
    { class: "data-row" },
    h(
      "div",
      { class: "data-head" },
      h("span", {
        class: "twist",
        onclick: () => {
          if (expanded) ui.dataExpanded.delete(query.key);
          else ui.dataExpanded.add(query.key);
          ctx.refresh();
        }
      }, expanded ? "▾" : "▸"),
      chip(query.state, tone),
      h("span", { class: "mono", title: query.key }, truncateMiddle(query.key, 52)),
      query.status !== void 0 ? chip(String(query.status), query.status >= 400 ? "red" : "blue") : null,
      query.infinite ? chip(`page ${query.page ?? 0}${query.hasMore ? "+" : ""}`, "purple") : null,
      spacer(),
      query.lastUpdated ? faint(new Date(query.lastUpdated).toLocaleTimeString()) : null,
      can(app, "refetchQuery") ? button("Refetch", () => {
        app.refetchQuery(query.key);
        ctx.toast("Refetching…");
        ctx.refresh();
      }, { title: "Re-run this request now" }) : null,
      query.loading && can(app, "cancelQuery") ? button("Cancel", () => {
        app.cancelQuery(query.key);
        ctx.toast("Cancelled");
        ctx.refresh();
      }, { tone: "warn" }) : null,
      // The two experiments you want on a cached query are "what if it were slow"
      // and "what if it failed". Both live in the Network tab's rules, so offer
      // them from here rather than making you copy the URL across.
      can(app, "setNetworkRules") ? button("Mock", () => seedRule(ctx, query, "mock"), {
        title: "Answer this request with a canned response (opens the Network tab)"
      }) : null,
      can(app, "setNetworkRules") ? button("Slow", () => seedRule(ctx, query, "delay"), {
        title: "Add 2s of latency to this request, to see your own loading state"
      }) : null,
      can(app, "setNetworkRules") ? button("Fail", () => seedRule(ctx, query, "fail"), {
        title: "Make this request fail, to exercise the error path"
      }) : null
    ),
    expanded ? h(
      "div",
      { class: "data-body" },
      query.error !== void 0 ? h("div", { class: "banner t-red" }, query.error.preview) : null,
      h(
        "div",
        { class: "detail-head" },
        muted("data"),
        spacer(),
        query.data.json !== void 0 ? copyButton(() => query.data.json, "Copy") : null
      ),
      query.data.json !== void 0 ? h("pre", { class: "code-pre" }, query.data.json) : valueSpan(query.data)
    ) : null
  );
}
function seedRule(ctx, query, action) {
  if (!can(ctx.app, "setNetworkRules")) return;
  const url = query.key.replace(/^[A-Z]+\s+/, "").split(/\s+/)[0] ?? query.key;
  const pattern = urlPath(url) || url;
  const rule = newRule(
    action === "mock" ? {
      action,
      pattern,
      status: query.status ?? 200,
      // Seed the mock with the response the app already has: editing a real
      // payload is far easier than writing one from nothing.
      body: query.data.json ?? "",
      label: `mock ${pattern}`
    } : action === "delay" ? { action, pattern, delayMs: 2e3, label: `slow ${pattern}` } : { action, pattern, message: "Request failed (DevTools rule)", label: `fail ${pattern}` }
  );
  ctx.ui.rules = [...ctx.ui.rules, rule];
  ctx.app.setNetworkRules(ctx.ui.rules);
  ctx.ui.showRules = true;
  ctx.toast(`Rule added for ${pattern} — refetch to see it`);
  ctx.selectTab("network");
}
function renderStores(ctx) {
  const { app, ui } = ctx;
  if (!can(app, "getStores")) {
    return [emptyState("This runtime does not expose its stores.")];
  }
  const stores = app.getStores();
  if (stores.length === 0) {
    return [emptyState(
      "No stores or forms.",
      "A Store({...}) or $form({...}) handle appears here as soon as the program creates one."
    )];
  }
  return [
    section("Summary", statGrid(
      stat("stores", String(stores.filter((store2) => store2.flavour === "store").length)),
      stat("forms", String(stores.filter((store2) => store2.flavour === "form").length))
    )),
    ...stores.map((store2) => renderStore(ctx, store2, ui.dataExpanded.has(store2.atom)))
  ];
}
function renderStore(ctx, store2, expanded) {
  const { app, ui } = ctx;
  return section(null, [
    h(
      "div",
      { class: "data-head" },
      h("span", {
        class: "twist",
        onclick: () => {
          if (expanded) ui.dataExpanded.delete(store2.atom);
          else ui.dataExpanded.add(store2.atom);
          ctx.refresh();
        }
      }, expanded ? "▾" : "▸"),
      chip(store2.flavour, store2.flavour === "form" ? "purple" : "blue"),
      code(store2.atom),
      store2.source ? faint(`L${store2.source.line}:${store2.source.column}`) : null,
      spacer(),
      muted(`${store2.methods.length} method${store2.methods.length === 1 ? "" : "s"}`)
    ),
    expanded ? h(
      "div",
      { class: "data-body" },
      store2.value.json !== void 0 ? h("pre", { class: "code-pre" }, store2.value.json) : valueSpan(store2.value),
      store2.methods.length > 0 ? h("div", { class: "chip-row" }, ...store2.methods.map((method) => can(app, "callStoreMethod") ? h("button", {
        class: "chip green is-link",
        title: `Call ${method}() with no arguments`,
        onclick: () => {
          const result = app.callStoreMethod(store2.atom, method);
          ctx.toast(result.ok ? `${method}() → ${result.value?.preview ?? "ok"}` : result.error ?? "failed", result.ok ? "good" : "bad");
          ctx.refresh();
        }
      }, `${method}()`) : chip(`${method}()`, "grey"))) : null,
      faint("Calling a method here runs the author's function with the handle injected, exactly as the program would.")
    ) : null
  ], { flush: true });
}
function renderStorage(ctx) {
  const { ui } = ctx;
  const kinds = [
    { value: "local", label: "localStorage", title: "Persists across sessions" },
    { value: "session", label: "sessionStorage", title: "Cleared when the tab closes" },
    { value: "cookies", label: "cookies", title: "Sent with every request to the origin" }
  ];
  const entries = readStorage(ui.storageKind);
  const bytes = entries.reduce((sum, entry) => sum + entry.key.length + entry.value.length, 0);
  const bar = toolbar(
    chipGroup(kinds, ui.storageKind, (value) => {
      ui.storageKind = value;
      ctx.refresh();
    }),
    spacer(),
    muted(`${entries.length} key${entries.length === 1 ? "" : "s"} · ${fmtBytes(bytes)}`)
  );
  const label = ui.storageKind === "cookies" ? "cookies" : `${ui.storageKind}Storage`;
  const adder = renderStorageAdder(ctx);
  if (entries.length === 0) {
    return [
      bar,
      emptyState(
        `Nothing in ${label}.`,
        "Anything the program writes through the `storage` namespace shows up here — and you can add a key yourself to test how the app reads it."
      ),
      adder
    ];
  }
  return [
    bar,
    section(null, table(
      [
        { key: "key", label: "Key", sort: (row) => row.key, render: (row) => code(row.key) },
        {
          key: "value",
          label: "Value",
          // Editable in place: the common use is not reading a stored value but
          // changing it to see how the app behaves on the next read.
          render: (row) => editableValue(
            { type: "string", preview: truncateMiddle(row.value, 80), json: JSON.stringify(row.value) },
            (next) => {
              const written = writeStorage(ui.storageKind, row.key, typeof next === "string" ? next : JSON.stringify(next));
              ctx.toast(written ? `${row.key} updated` : `could not write ${row.key}`, written ? "good" : "bad");
              ctx.refresh();
            },
            { focusKey: `storage:${ui.storageKind}:${row.key}`, title: row.value }
          )
        },
        { key: "size", label: "Size", numeric: true, sort: (row) => row.value.length, render: (row) => fmtBytes(row.value.length) },
        {
          key: "actions",
          label: "",
          render: (row) => h(
            "span",
            { class: "chip-row" },
            copyButton(() => row.value, "Copy"),
            button("✕", () => {
              removeStorage(ui.storageKind, row.key);
              ctx.toast(`Removed ${row.key}`);
              ctx.refresh();
            }, { title: "Remove this key" })
          )
        }
      ],
      entries
    ), { flush: true }),
    adder,
    section(null, faint(
      "Aktion's `storage` namespace round-trips non-string values through JSON, so a value that looks like JSON here is what the program reads back as an object. Nothing in the app re-reads storage on its own — force a render after an edit."
    ), { flush: true })
  ];
}
function renderStorageAdder(ctx) {
  const { ui } = ctx;
  let key2 = "";
  let value = "";
  const write = () => {
    const name = key2.trim();
    if (name === "") return;
    const ok = writeStorage(ui.storageKind, name, value);
    ctx.toast(ok ? `${name} written` : `could not write ${name}`, ok ? "good" : "bad");
    ctx.refresh();
  };
  return section(null, h(
    "div",
    { class: "detail-head" },
    muted("Add a key"),
    textField({
      focusKey: `storage-new-key:${ui.storageKind}`,
      placeholder: "key",
      width: "150px",
      onInput: (next) => {
        key2 = next;
      }
    }),
    textField({
      focusKey: `storage-new-value:${ui.storageKind}`,
      placeholder: 'value — plain text, or JSON like {"seen":true}',
      onInput: (next) => {
        value = next;
      },
      onEnter: write
    }),
    button("Write", write, { title: "Set this key in the selected store" })
  ), { flush: true });
}
function readStorage(kind) {
  try {
    if (kind === "cookies") {
      const raw = typeof document !== "undefined" ? document.cookie : "";
      if (!raw) return [];
      return raw.split(";").map((pair) => {
        const index = pair.indexOf("=");
        const key2 = (index < 0 ? pair : pair.slice(0, index)).trim();
        const value = index < 0 ? "" : decodeURIComponent(pair.slice(index + 1).trim());
        return { key: key2, value };
      }).filter((entry) => entry.key !== "");
    }
    const store2 = kind === "local" ? globalThis.localStorage : globalThis.sessionStorage;
    if (!store2) return [];
    const out = [];
    for (let i = 0; i < store2.length; i += 1) {
      const key2 = store2.key(i);
      if (key2 === null) continue;
      out.push({ key: key2, value: store2.getItem(key2) ?? "" });
    }
    return out.sort((a, b) => a.key.localeCompare(b.key));
  } catch {
    return [];
  }
}
function writeStorage(kind, key2, value) {
  try {
    if (kind === "cookies") {
      document.cookie = `${encodeURIComponent(key2)}=${encodeURIComponent(value)}; path=/`;
      return true;
    }
    const store2 = kind === "local" ? globalThis.localStorage : globalThis.sessionStorage;
    if (!store2) return false;
    store2.setItem(key2, value);
    return true;
  } catch {
    return false;
  }
}
function removeStorage(kind, key2) {
  try {
    if (kind === "cookies") {
      document.cookie = `${encodeURIComponent(key2)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      return;
    }
    const store2 = kind === "local" ? globalThis.localStorage : globalThis.sessionStorage;
    store2?.removeItem(key2);
  } catch {
  }
}
const GROUPS = [
  { title: "Surfaces", match: (t) => /^color(Bg|Surface|Border)/.test(t) },
  { title: "Text", match: (t) => /^colorText/.test(t) || t === "colorLink" || t === "colorLinkHover" },
  { title: "Brand", match: (t) => /^color(Primary|Accent|FocusRing)/.test(t) },
  { title: "Status", match: (t) => /^color(Success|Warning|Danger|Info)/.test(t) },
  { title: "Typography", match: (t) => /^(font|line|letter|text)/i.test(t) },
  { title: "Spacing & shape", match: (t) => /^(space|spacing|radius|border(Width|Radius))/i.test(t) },
  { title: "Elevation & motion", match: (t) => /^(shadow|elevation|motion|duration|ease|z)/i.test(t) }
];
const themeTab = {
  id: "theme",
  label: "Theme",
  icon: "◐",
  hint: "Live design-token editor, theme switcher, and contrast checks",
  badge: (ctx) => {
    if (!can(ctx.app, "getTheme")) return null;
    const count = ctx.app.getTheme().devtoolsOverrides.length;
    return count > 0 ? count : null;
  },
  render: (ctx) => render$4(ctx)
};
function render$4(ctx) {
  const { app, ui } = ctx;
  if (!can(app, "getTheme")) {
    return [emptyState("This app does not expose its theme.")];
  }
  const theme = app.getTheme();
  const tokens = Object.entries(theme.tokens).sort((a, b) => a[0].localeCompare(b[0]));
  const filter = ui.themeFilter.trim().toLowerCase();
  const bar = toolbar(
    searchInput(ui.themeFilter, (value) => {
      ui.themeFilter = value;
      ctx.refresh();
    }, "Filter tokens…"),
    spacer(),
    muted(`${tokens.length} tokens`),
    copyButton(() => asThemeBlock(theme), "Copy as $theme"),
    copyButton(() => JSON.stringify(theme.tokens, null, 2), "Copy JSON"),
    theme.devtoolsOverrides.length > 0 && can(app, "clearThemeTokens") ? button(`Reset (${theme.devtoolsOverrides.length})`, () => {
      app.clearThemeTokens();
      ctx.toast("Token overrides cleared");
      ctx.refresh();
    }, { tone: "warn", title: "Drop every DevTools token override" }) : null
  );
  const out = [bar, renderSwitcher(ctx, theme), renderContrast(theme)];
  const shown = /* @__PURE__ */ new Set();
  for (const group of GROUPS) {
    const rows = tokens.filter(([token]) => group.match(token) && (filter === "" || token.toLowerCase().includes(filter)));
    for (const [token] of rows) shown.add(token);
    if (rows.length === 0) continue;
    out.push(section(group.title, h(
      "div",
      { class: "token-grid" },
      ...rows.map(([token, value]) => renderToken(ctx, theme, token, value))
    )));
  }
  const rest = tokens.filter(([token]) => !shown.has(token) && (filter === "" || token.toLowerCase().includes(filter)));
  if (rest.length > 0) {
    out.push(section("Other", h(
      "div",
      { class: "token-grid" },
      ...rest.map(([token, value]) => renderToken(ctx, theme, token, value))
    )));
  }
  if (out.length === 3) out.push(section(null, faint("No tokens match the filter."), { flush: true }));
  return out;
}
function renderSwitcher(ctx, theme) {
  const { app } = ctx;
  return section(null, [
    statGrid(
      stat("theme", theme.name),
      stat("overrides", String(theme.devtoolsOverrides.length), {
        title: theme.devtoolsOverrides.join(", "),
        tone: theme.devtoolsOverrides.length > 0 ? "warn" : void 0
      }),
      stat("in-script", String(theme.scriptOverrides.length), {
        title: theme.scriptOverrides.length > 0 ? `The program's $theme({...}) block sets: ${theme.scriptOverrides.join(", ")}` : "The program declares no $theme({...}) block"
      })
    ),
    h("div", { class: "chip-row" }, ...theme.available.map((name) => can(app, "setThemeName") ? h("button", {
      class: `chip ${name === theme.name ? "green" : "grey"} is-link`,
      title: `Switch to the ${name} theme`,
      onclick: () => {
        app.setThemeName(name);
        ctx.toast(`Theme: ${name}`);
        ctx.refresh();
      }
    }, name) : chip(name, name === theme.name ? "green" : "grey"))),
    theme.scriptOverrides.length > 0 ? faint("The program's own $theme({...}) block is re-applied on every render, so it wins over an edit here for the tokens it sets.") : null
  ], { flush: true });
}
function renderToken(ctx, theme, token, value) {
  const { app } = ctx;
  const overridden = theme.devtoolsOverrides.includes(token);
  const fromScript = theme.scriptOverrides.includes(token);
  const colour = isColor(value);
  const input = textField({
    focusKey: `token:${token}`,
    className: "token-input",
    value,
    onCommit: (next) => {
      if (!can(app, "setThemeTokens")) return;
      app.setThemeTokens({ [token]: next });
      ctx.toast(`${token} = ${next}`);
      ctx.refresh();
    }
  });
  const picker = colour && can(app, "setThemeTokens") ? (() => {
    const el = h("input", {
      class: "token-picker",
      type: "color",
      value: toHex(value) ?? "#000000",
      title: `Pick a colour for ${token}`
    });
    let queued = false;
    el.addEventListener("input", () => {
      input.value = el.value;
      if (queued) return;
      queued = true;
      const flush = () => {
        queued = false;
        app.setThemeTokens({ [token]: el.value });
      };
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(flush);
      else setTimeout(flush, 16);
    });
    el.addEventListener("change", () => {
      app.setThemeTokens({ [token]: el.value });
      ctx.refresh();
    });
    return el;
  })() : null;
  return h(
    "div",
    { class: `token-row ${overridden ? "is-overridden" : ""}` },
    h(
      "div",
      { class: "token-head" },
      colour ? h("span", { class: "swatch", style: `background:${value}` }) : null,
      h("span", { class: "token-name", title: `--rui-${kebab(token)}` }, token),
      overridden ? chip("edited", "amber") : null,
      fromScript ? chip("$theme", "purple", "Set by the program's $theme({...}) block") : null
    ),
    h("div", { class: "token-body" }, picker, input)
  );
}
function renderContrast(theme) {
  const pairs = [
    ["Body text", "colorText", "colorBg", 4.5],
    ["Muted text", "colorTextMuted", "colorBg", 4.5],
    ["Text on surface", "colorText", "colorSurface", 4.5],
    ["Primary button", "colorPrimaryText", "colorPrimary", 4.5],
    ["Accent fill", "colorAccentText", "colorAccent", 4.5],
    ["Link", "colorLink", "colorBg", 4.5],
    ["Control border", "colorBorderControl", "colorBg", 3]
  ];
  const rows = [];
  for (const [label, fgToken, bgToken, required] of pairs) {
    const fg = parseColor(theme.tokens[fgToken] ?? "");
    const bg = parseColor(theme.tokens[bgToken] ?? "");
    if (!fg || !bg || fg.a === 0 || bg.a === 0) continue;
    const ratio = contrastRatio(fg, bg);
    const pass = ratio >= required;
    rows.push(h(
      "div",
      { class: "contrast-row" },
      h("span", {
        class: "contrast-sample",
        style: `background:${theme.tokens[bgToken]};color:${theme.tokens[fgToken]}`
      }, "Aa"),
      h("span", { class: "contrast-label" }, label),
      code(`${fgToken} / ${bgToken}`),
      spacer(),
      chip(`${ratio.toFixed(2)}:1`, pass ? "green" : "red", `needs ${required}:1`)
    ));
  }
  if (rows.length === 0) {
    return section("Contrast", faint("No colour pairs could be measured for this theme."));
  }
  return section("Contrast", [
    h("div", {}, ...rows),
    faint("WCAG 1.4.3 asks for 4.5:1 on body text and 3:1 on large text and control boundaries.")
  ]);
}
function isColor(value) {
  return /^(#|rgb|hsl|color\()/i.test(value.trim());
}
function kebab(token) {
  return token.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}
function toHex(value) {
  const parsed = parseColor(value);
  if (!parsed) return null;
  const hex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${hex(parsed.r)}${hex(parsed.g)}${hex(parsed.b)}`;
}
function asThemeBlock(theme) {
  const keys = theme.devtoolsOverrides.length > 0 ? theme.devtoolsOverrides : Object.keys(theme.tokens);
  const lines = keys.map((key2) => {
    const value = theme.tokens[key2];
    return value === void 0 ? null : `  ${key2}: ${JSON.stringify(value)},`;
  }).filter((line) => line !== null);
  return `$theme({
${lines.join("\n")}
})`;
}
const WINDOW_LINES = 600;
const sourceTab = {
  id: "source",
  label: "Source",
  icon: "≣",
  hint: "The running program, diagnostics on their lines, an outline, history, and hot reload",
  badge: (ctx) => {
    if (!can(ctx.app, "getDiagnostics")) return null;
    const count = ctx.app.getDiagnostics().filter((entry) => entry.severity === "error").length;
    return count > 0 ? count : null;
  },
  render: (ctx) => render$3(ctx)
};
function render$3(ctx) {
  const { app, model, ui } = ctx;
  if (!app) return [emptyState("No app selected.")];
  const sources = ctx.cache("sources", () => can(app, "getSources") ? app.getSources() : [{ path: "<inline>", text: app.getProgram() }]);
  const index = Math.min(ui.sourceIndex, Math.max(0, sources.length - 1));
  const active = sources[index] ?? { path: "<inline>", text: "" };
  const live = ui.sourceDraft === null;
  const text2 = live ? active.text : ui.sourceDraft;
  const diagnostics = ctx.cache("diagnostics", () => can(app, "getDiagnostics") ? app.getDiagnostics() : []);
  const analysis = analyse(ctx, text2, live);
  const bar = toolbar(
    sources.length > 1 ? h("div", { class: "filters" }, ...sources.map((source, i) => h("button", {
      class: `filter-chip ${i === index ? "is-on" : ""}`,
      title: source.path,
      onclick: () => {
        ui.sourceIndex = i;
        ui.sourceDraft = null;
        ctx.refresh();
      }
    }, shortPath(source.path)))) : muted(active.path),
    searchInput(ui.sourceFilter, (value) => {
      ui.sourceFilter = value;
      ctx.refresh();
    }, "Find in source…", { focusKey: "source-filter" }),
    spacer(),
    toggle("Outline", ui.sourceOutline, () => {
      ui.sourceOutline = !ui.sourceOutline;
      ctx.refresh();
    }, "Show the program's declarations"),
    model.programHistory.length > 1 ? toggle(`History (${model.programHistory.length})`, ui.sourceHistoryOpen, () => {
      ui.sourceHistoryOpen = !ui.sourceHistoryOpen;
      ctx.refresh();
    }, "Earlier versions of this program, with one-click revert") : null,
    copyButton(() => text2, "Copy"),
    button("Download", () => downloadText("app.aktion", text2, "text/plain"), { title: "Save this source" }),
    can(app, "reload") ? button("Reload", () => {
      app.reload();
      ctx.toast("Program re-planned");
      ctx.refresh();
    }, { title: "Re-plan and re-render from the current source" }) : null
  );
  const out = [bar];
  out.push(section(null, statGrid(
    stat("lines", String(text2.split("\n").length)),
    stat("size", fmtBytes(text2.length)),
    stat("errors", String(diagnostics.filter((entry) => entry.severity === "error").length), {
      tone: diagnostics.some((entry) => entry.severity === "error") ? "bad" : "good"
    }),
    stat("warnings", String(diagnostics.filter((entry) => entry.severity === "warning").length), {
      tone: diagnostics.some((entry) => entry.severity === "warning") ? "warn" : void 0
    }),
    analysis ? stat("declares", String(analysis.outline.length), { title: "Top-level declarations" }) : null
  ), { flush: true }));
  if (ui.sourceHistoryOpen) out.push(renderHistory(ctx));
  if (diagnostics.length > 0) out.push(renderDiagnostics(ctx, diagnostics));
  if (ui.sourceOutline) out.push(renderOutline(ctx, analysis?.outline ?? []));
  out.push(renderEditor(ctx, text2, live, diagnostics, index === 0, analysis));
  if (index > 0 && active.text === "") {
    out.push(section(null, faint(
      "This module's text is not available in the browser: a linked program is planned from a pre-parsed AST, so only the entry module's source travels with it."
    ), { flush: true }));
  }
  return out;
}
function analyse(ctx, text2, live) {
  const { app } = ctx;
  if (!can(app, "analyzeProgram")) return null;
  return ctx.cache(`analysis:${live ? "live" : `draft:${text2.length}:${hash(text2)}`}`, () => app.analyzeProgram(live ? void 0 : text2));
}
function hash(text2) {
  let value = 0;
  for (let i = 0; i < text2.length; i += 1) {
    value = value * 31 + text2.charCodeAt(i) | 0;
  }
  return value;
}
function renderDiagnostics(ctx, diagnostics) {
  const errors = diagnostics.filter((entry) => entry.severity === "error");
  return section(`Diagnostics (${diagnostics.length})`, [
    h("div", { [SCROLL_KEY_ATTR]: "diagnostics" }, ...diagnostics.slice(0, 40).map((diagnostic) => h(
      "div",
      {
        class: `insight t-${diagnostic.severity === "error" ? "bad" : "warn"} is-link`,
        title: diagnostic.line > 0 ? `Jump to line ${diagnostic.line}` : void 0,
        onclick: () => {
          ctx.ui.sourceFocusLine = diagnostic.line > 0 ? diagnostic.line : null;
          ctx.refresh();
        }
      },
      h("span", { class: "insight-ic" }, diagnostic.severity === "error" ? "✖" : "▲"),
      h(
        "span",
        {},
        chip(diagnostic.kind, diagnostic.kind === "schema" ? "purple" : "grey"),
        diagnostic.line > 0 ? code(`L${diagnostic.line}`) : null,
        " ",
        diagnostic.message
      )
    ))),
    errors.length > 0 ? faint("A program with errors still renders whatever it could plan — that is why the app is partly there. Fix the first error; the rest are often consequences of it.") : null
  ].filter((node) => node != null));
}
function renderOutline(ctx, entries) {
  const filter = ctx.ui.sourceFilter.trim().toLowerCase();
  const shown = filter === "" ? entries : entries.filter((entry) => entry.name.toLowerCase().includes(filter) || entry.kind.includes(filter));
  if (entries.length === 0) {
    return section("Outline", faint("Nothing declared at the top level."));
  }
  const tone = {
    component: "purple",
    effect: "blue",
    action: "green",
    hook: "amber",
    state: "grey",
    binding: "grey",
    import: "grey"
  };
  return section(
    `Outline (${shown.length}${shown.length === entries.length ? "" : ` / ${entries.length}`})`,
    shown.length === 0 ? faint(`Nothing in the outline matches “${ctx.ui.sourceFilter}”.`) : h(
      "div",
      { class: "outline", [SCROLL_KEY_ATTR]: "outline" },
      ...shown.map((entry) => h(
        "button",
        {
          class: "outline-row",
          title: `Line ${entry.line}`,
          onclick: () => {
            ctx.ui.sourceFocusLine = entry.line;
            ctx.refresh();
          }
        },
        chip(entry.kind, tone[entry.kind] ?? "grey"),
        h("span", { class: "mono" }, entry.kind === "state" ? `$${entry.name}` : entry.name),
        entry.exported ? chip("export", "green") : null,
        spacer(),
        faint(`L${entry.line}`)
      ))
    )
  );
}
function renderHistory(ctx) {
  const { app, model, ui } = ctx;
  const versions = [...model.programHistory].reverse();
  return section(`Program history (${versions.length})`, [
    h("div", { [SCROLL_KEY_ATTR]: "prog-history" }, ...versions.map((version, index) => h(
      "div",
      { class: "ver-row" },
      h("span", { class: "ver-when" }, new Date(version.at).toLocaleTimeString()),
      index === 0 ? chip("current", "green") : null,
      h("span", { class: "ver-meta" }, `${version.lines} lines · ${fmtBytes(version.text.length)}`),
      spacer(),
      button("View", () => {
        ui.sourceDraft = version.text;
        ui.sourceHistoryOpen = false;
        ctx.toast("Loaded into the editor — Apply to mount it");
        ctx.refresh();
      }, { title: "Load this version into the editor without mounting it" }),
      index === 0 || !can(app, "setProgram") ? null : button("Revert", () => revert(ctx, version), { tone: "warn", title: "Mount this version now" })
    ))),
    faint("Versions are recorded as the program commits, so an edit that broke the app is one click from being undone.")
  ]);
}
function revert(ctx, version) {
  if (!can(ctx.app, "setProgram")) return;
  ctx.app.setProgram(version.text);
  ctx.ui.sourceDraft = null;
  ctx.ui.sourceHistoryOpen = false;
  ctx.toast("Reverted to the earlier version");
  ctx.refresh();
}
function renderEditor(ctx, text2, live, diagnostics, editable, analysis) {
  const { app, ui } = ctx;
  const markers = /* @__PURE__ */ new Map();
  for (const diagnostic of diagnostics) {
    if (diagnostic.line <= 0) continue;
    const existing = markers.get(diagnostic.line);
    if (existing && existing.tone === "bad") continue;
    markers.set(diagnostic.line, {
      tone: diagnostic.severity === "error" ? "bad" : "warn",
      title: diagnostic.message
    });
  }
  if (live) {
    const lines = text2.split("\n");
    const filter = ui.sourceFilter.trim().toLowerCase();
    const hits = filter === "" ? [] : lines.map((line, i) => line.toLowerCase().includes(filter) ? i + 1 : 0).filter(Boolean);
    const focus = ui.sourceFocusLine ?? hits[0] ?? null;
    const { from, to } = windowFor(lines.length, focus);
    const view = codeBlock(lines.slice(from, to).join("\n"), {
      lineNumbers: true,
      markers: shiftMarkers(markers, from),
      focusLine: focus !== null ? focus - from : null,
      firstLine: from + 1,
      highlight: filter,
      onLineClick: (line) => {
        ui.sourceFocusLine = line + from;
        ctx.refresh();
      }
    });
    if (focus !== null) {
      queueMicrotask(() => {
        view.querySelector(".code-line.is-focus")?.scrollIntoView({ block: "center" });
      });
    }
    return section("Program", [
      hits.length > 0 ? h(
        "div",
        { class: "detail-head" },
        muted(`${hits.length} line${hits.length === 1 ? "" : "s"} match “${ui.sourceFilter}”`),
        h("div", { class: "chip-row", style: "margin:0" }, ...hits.slice(0, 12).map((line) => h("button", {
          class: `chip ${focus === line ? "blue" : "grey"} is-link`,
          onclick: () => {
            ui.sourceFocusLine = line;
            ctx.refresh();
          }
        }, `L${line}`)))
      ) : null,
      to - from < lines.length ? h(
        "div",
        { class: "detail-head" },
        faint(`Showing lines ${from + 1}–${to} of ${lines.length}.`),
        spacer(),
        from > 0 ? button("▲ Earlier", () => {
          ui.sourceFocusLine = Math.max(1, from - Math.floor(WINDOW_LINES / 2));
          ctx.refresh();
        }) : null,
        to < lines.length ? button("▼ Later", () => {
          ui.sourceFocusLine = Math.min(lines.length, to + Math.floor(WINDOW_LINES / 2));
          ctx.refresh();
        }) : null
      ) : null,
      view
    ].filter((node) => node != null), {
      actions: [
        editable && can(app, "setProgram") ? button("Edit", () => {
          ui.sourceDraft = text2;
          ctx.refresh();
        }, { title: "Edit and re-mount this program" }) : null
      ].filter((node) => node != null)
    });
  }
  const area = h("textarea", {
    class: "source-editor",
    spellcheck: "false",
    "data-dt-focus": "source-editor"
  });
  area.value = text2;
  const status = h("span", {});
  const errorBanner = h("div", { class: "banner t-red", style: "display:none" });
  const showVerdict = (verdict) => {
    const errors = verdict?.diagnostics.filter((diagnostic) => diagnostic.severity === "error") ?? [];
    status.replaceChildren(
      verdict === null ? chip("unchecked", "grey") : errors.length > 0 ? chip(`${errors.length} error${errors.length === 1 ? "" : "s"}`, "red") : chip("valid", "green")
    );
    if (errors.length > 0) {
      errorBanner.style.display = "";
      errorBanner.textContent = errors.slice(0, 3).map((diagnostic) => `L${diagnostic.line}: ${diagnostic.message}`).join(" · ");
    } else {
      errorBanner.style.display = "none";
      errorBanner.textContent = "";
    }
  };
  showVerdict(analysis);
  area.addEventListener("input", () => {
    ui.sourceDraft = area.value;
    showVerdict(can(app, "analyzeProgram") ? app.analyzeProgram(area.value) : null);
  });
  area.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      apply();
    }
  });
  const apply = () => {
    if (!can(app, "setProgram")) return;
    app.setProgram(ui.sourceDraft ?? text2);
    ui.sourceDraft = null;
    ctx.toast("Program re-mounted");
    ctx.refresh();
  };
  return section("Program (editing)", [
    area,
    errorBanner,
    h(
      "div",
      { class: "detail-head" },
      status,
      faint("State is preserved across the diff, exactly as for a streamed update. Ctrl+Enter applies."),
      spacer(),
      button("Cancel", () => {
        ui.sourceDraft = null;
        ctx.refresh();
      }),
      button("Apply", apply, { tone: "good", title: "Mount this program (Ctrl+Enter)" })
    )
  ]);
}
function windowFor(total, focus) {
  if (total <= WINDOW_LINES) return { from: 0, to: total };
  const centre = focus ?? 1;
  const from = Math.max(0, Math.min(total - WINDOW_LINES, centre - Math.floor(WINDOW_LINES / 2)));
  return { from, to: Math.min(total, from + WINDOW_LINES) };
}
function shiftMarkers(markers, from) {
  if (from === 0) return markers;
  const out = /* @__PURE__ */ new Map();
  for (const [line, marker] of markers) out.set(line - from, marker);
  return out;
}
function shortPath(path) {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(-2).join("/") || path;
}
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
  const header = `${"file".padEnd(width)}  lines                 funcs    branch   uncovered lines`;
  const body = rows.map(
    (r) => `${r.name.padEnd(width)}  ${r.lines.padEnd(20)}  ${r.functions.padEnd(7)}  ${r.branches.padEnd(7)}  ${r.uncovered}`
  );
  const s = input.summary;
  const footer = `ALL: lines ${s.lines.pct.toFixed(2)}% (${s.lines.covered}/${s.lines.total}) · functions ${s.functions.pct.toFixed(2)}% (${s.functions.covered}/${s.functions.total}) · branches ${s.branches.pct.toFixed(2)}% (${s.branches.covered}/${s.branches.total})`;
  return [header, ...body, "", footer].join("\n");
}
const testTab = {
  id: "test",
  label: "Test",
  icon: "✓",
  hint: "Record interactions as tests, audit accessibility, measure DSL coverage, fuzz the UI",
  badge: (ctx) => {
    const steps = ctx.recordedSteps().length;
    if (steps > 0) return steps;
    const findings = ctx.ui.a11yRun?.findings.length ?? 0;
    return findings > 0 ? findings : null;
  },
  render: (ctx) => render$2(ctx)
};
function render$2(ctx) {
  const { ui } = ctx;
  const bar = toolbar(
    chipGroup(
      [
        { value: "record", label: "Record", title: "Record interactions and generate a test" },
        { value: "a11y", label: "A11y", title: "Audit the rendered tree for accessibility problems" },
        { value: "coverage", label: "Coverage", title: "DSL coverage for the running program" },
        { value: "queries", label: "Queries", title: "Try Testing Library queries against the live app" },
        { value: "chaos", label: "Chaos", title: "Click random controls and report what breaks" }
      ],
      ui.testPane,
      (value) => {
        ui.testPane = value;
        ctx.refresh();
      }
    ),
    spacer()
  );
  switch (ui.testPane) {
    case "record":
      return [bar, ...renderRecorder(ctx)];
    case "a11y":
      return [bar, ...renderA11y(ctx)];
    case "coverage":
      return [bar, ...renderCoverage(ctx)];
    case "queries":
      return [bar, ...renderQueries(ctx)];
    case "chaos":
      return [bar, ...renderChaos(ctx)];
  }
}
function renderRecorder(ctx) {
  const { app, recorder, ui } = ctx;
  const steps = recorder.list();
  const root = renderRootElement(app);
  const controls = section(null, h(
    "div",
    { class: "detail-head" },
    recorder.isRecording ? button("■ Stop", () => {
      recorder.stop();
      ctx.toast(`Recorded ${recorder.list().length} step(s)`);
      ctx.refresh();
    }, { tone: "warn", title: "Stop capturing" }) : button("● Record", () => {
      const started = recorder.start(root, () => ctx.refresh());
      ctx.toast(started ? "Recording — interact with the app" : "Could not attach to the app", started ? "good" : "bad");
      ctx.refresh();
    }, { tone: "good", title: "Capture clicks, typing, and navigation", disabled: root === null }),
    steps.length > 0 ? button("Clear", () => {
      recorder.clear();
      ui.generatedTest = null;
      ctx.refresh();
    }) : null,
    spacer(),
    recorder.isRecording ? chip("recording", "red") : null,
    muted(`${steps.length} step${steps.length === 1 ? "" : "s"}`)
  ), { flush: true });
  const list = steps.length > 0 ? section("Steps", h("div", { class: "step-list" }, ...steps.map((step, index) => h(
    "div",
    { class: "step-row" },
    h("span", { class: "step-index" }, String(index + 1)),
    chip(step.type, step.type === "navigate" ? "purple" : "blue"),
    h("span", { class: "step-label" }, step.label),
    spacer(),
    step.query ? h(
      "span",
      { class: "step-query", title: `Query strategy: ${step.query.kind}` },
      step.query.kind === "css" ? chip("brittle", "amber", "No test id, role, label, or text to match on") : chip(step.query.kind, "grey"),
      faint(queryLabel(step.query))
    ) : null,
    button("✕", () => {
      recorder.remove(index);
      ctx.refresh();
    }, { title: "Drop this step" })
  )))) : section(null, faint(
    "Press Record, then use the app. Clicks, typing, selects, Enter/Escape, and navigations are captured; typing is coalesced into one step per field."
  ), { flush: true });
  const generated = ui.generatedTest ? section("Generated test", [
    h("pre", { class: "code-pre" }, ui.generatedTest),
    h(
      "div",
      { class: "detail-head" },
      spacer(),
      copyButton(() => ui.generatedTest ?? "", "Copy"),
      button("Download", () => downloadText("recorded.test.ts", ui.generatedTest ?? "", "text/plain")),
      button("Close", () => {
        ui.generatedTest = null;
        ctx.refresh();
      })
    )
  ]) : null;
  const actions = section(null, h(
    "div",
    { class: "detail-head" },
    button("Generate test", () => {
      if (!app) return;
      ui.generatedTest = generateTest(steps, {
        program: app.getProgram(),
        title: "reproduces the recorded interaction",
        assertions: assertableState(ctx)
      });
      ctx.refresh();
    }, { title: "Emit a runnable test for the recorded steps", disabled: steps.length === 0 }),
    button("Snapshot test", () => {
      if (!app) return;
      ui.generatedTest = generateSnapshotTest(app.getProgram(), ctx.model.state, {
        title: "renders the recorded snapshot"
      });
      ctx.refresh();
    }, { title: "Emit a test asserting the current state and rendered HTML" }),
    spacer(),
    faint("Queries follow Testing Library priority: test id, role + name, label, placeholder, text.")
  ), { flush: true });
  return [controls, list, actions, generated].filter((node) => node != null);
}
function assertableState(ctx) {
  const changed = [...ctx.model.changeCounts.keys()].filter((name) => name !== "route");
  return changed.slice(0, 6).map((name) => ({ name, value: ctx.model.state[name] })).filter((entry) => entry.value !== void 0 && typeof entry.value !== "function");
}
function renderA11y(ctx) {
  const { app, ui } = ctx;
  const root = renderRootElement(app);
  const runAudit = () => {
    if (!root) return;
    const result = auditAccessibility(root);
    ui.a11yRun = { ...result, at: Date.now() };
    ui.a11ySelected = null;
    ctx.toast(`${result.findings.length} finding(s) across ${result.examined} elements`);
    ctx.refresh();
  };
  if (ui.a11yRequested) {
    ui.a11yRequested = false;
    if (root) {
      const result = auditAccessibility(root);
      ui.a11yRun = { ...result, at: Date.now() };
      ui.a11ySelected = null;
    }
  }
  const controls = section(null, h(
    "div",
    { class: "detail-head" },
    button("Run audit", runAudit, { tone: "good", disabled: root === null }),
    ui.a11yRun ? button("Clear", () => {
      ui.a11yRun = null;
      ctx.refresh();
    }) : null,
    spacer(),
    ui.a11yRun ? muted(`${ui.a11yRun.examined} elements examined`) : null
  ), { flush: true });
  if (!ui.a11yRun) {
    return [controls, section(null, faint(
      "Audits the rendered tree for the failures a generated UI actually produces: icon buttons with no name, fields labelled only by a placeholder, heading ladders with holes, text below the contrast minimum, focusable content inside aria-hidden."
    ), { flush: true })];
  }
  const { findings, truncated } = ui.a11yRun;
  const groups = groupFindings(findings);
  const critical = findings.filter((f) => f.impact === "critical").length;
  const serious = findings.filter((f) => f.impact === "serious").length;
  const summary = section("Summary", [
    statGrid(
      stat("findings", String(findings.length), { tone: findings.length === 0 ? "good" : void 0 }),
      stat("critical", String(critical), { tone: critical > 0 ? "bad" : "good" }),
      stat("serious", String(serious), { tone: serious > 0 ? "bad" : void 0 }),
      stat("rules hit", String(groups.length))
    ),
    truncated ? faint("The tree was larger than the audit cap, so only the first 4000 elements were examined.") : null
  ]);
  if (findings.length === 0) {
    return [controls, summary, section(null, h(
      "div",
      { class: "insight t-good" },
      h("span", { class: "insight-ic" }, "✓"),
      h("span", {}, "No accessibility problems found in the rendered tree.")
    ), { flush: true })];
  }
  const byRule = section("By rule", table(
    [
      { key: "rule", label: "Rule", sort: (row) => row.rule, render: (row) => code(row.rule) },
      {
        key: "impact",
        label: "Impact",
        sort: (row) => row.impact,
        render: (row) => chip(row.impact, row.impact === "critical" || row.impact === "serious" ? "red" : row.impact === "moderate" ? "amber" : "grey")
      },
      { key: "count", label: "Count", numeric: true, sort: (row) => row.count, render: (row) => String(row.count) },
      { key: "help", label: "Fix", render: (row) => faint(row.first.help) }
    ],
    groups
  ));
  const list = section(`Findings (${findings.length})`, h("div", {}, ...findings.slice(0, 60).map((finding, index) => renderFinding(ctx, finding, index))));
  const exportButton = section(null, h(
    "div",
    { class: "detail-head" },
    spacer(),
    copyButton(() => exportFindings(findings), "Copy report"),
    button("Download", () => downloadText("aktion-a11y.txt", exportFindings(findings), "text/plain"))
  ), { flush: true });
  return [controls, summary, byRule, list, exportButton];
}
function renderFinding(ctx, finding, index) {
  const selected = ctx.ui.a11ySelected === index;
  const tone = finding.impact === "critical" || finding.impact === "serious" ? "bad" : "warn";
  return h(
    "div",
    {
      class: `insight t-${tone} is-link ${selected ? "is-selected" : ""}`,
      onmouseenter: () => ctx.overlay.highlight(finding.element, {}, false),
      onmouseleave: () => ctx.overlay.hideHover(),
      onclick: () => {
        ctx.ui.a11ySelected = selected ? null : index;
        ctx.overlay.highlight(finding.element, {}, true);
        finding.element.scrollIntoView({ block: "center", behavior: "smooth" });
        if (can(ctx.app, "instanceForNode")) {
          const key2 = ctx.app.instanceForNode(finding.element);
          if (key2) ctx.selectInstance(key2);
        }
        ctx.refresh();
      }
    },
    h("span", { class: "insight-ic" }, finding.impact === "critical" ? "✖" : "▲"),
    h(
      "span",
      {},
      chip(finding.rule, "grey"),
      finding.detail ? chip(finding.detail, "amber") : null,
      " ",
      finding.message,
      " ",
      faint(finding.help)
    )
  );
}
function exportFindings(findings) {
  return findings.map((finding) => `[${finding.impact}] ${finding.rule}: ${finding.message}
  fix: ${finding.help}`).join("\n\n");
}
function renderCoverage(ctx) {
  const { app } = ctx;
  const enabled = isEnabled();
  const controls = section(null, h(
    "div",
    { class: "detail-head" },
    enabled ? button("■ Stop", () => {
      stop();
      ctx.toast("Coverage stopped");
      ctx.refresh();
    }, { tone: "warn" }) : button("● Start", () => {
      start();
      if (can(app, "reload")) app.reload();
      ctx.toast("Coverage started — program re-planned so its shape is registered");
      ctx.refresh();
    }, { tone: "good" }),
    button("Reset", () => {
      reset();
      ctx.toast("Coverage reset");
      ctx.refresh();
    }),
    spacer(),
    enabled ? chip("recording", "green") : chip("off", "grey")
  ), { flush: true });
  let report$1 = null;
  try {
    report$1 = report();
  } catch {
    report$1 = null;
  }
  if (!report$1 || report$1.files.length === 0) {
    return [controls, section(null, faint(
      enabled ? "Nothing measured yet. Interact with the app — every line, function, and branch the interpreter executes is recorded." : "Coverage is off. Start it to measure which lines, functions, and branches of the program actually run."
    ), { flush: true })];
  }
  const total = report$1.summary;
  const summary = section("Summary", statGrid(
    stat("lines", fmtPct(total.lines.covered, total.lines.total), {
      tone: total.lines.pct >= 80 ? "good" : total.lines.pct >= 50 ? void 0 : "warn",
      title: `${total.lines.covered} of ${total.lines.total}`
    }),
    stat("functions", fmtPct(total.functions.covered, total.functions.total), {
      title: `${total.functions.covered} of ${total.functions.total}`
    }),
    stat("branches", fmtPct(total.branches.covered, total.branches.total), {
      title: `${total.branches.covered} of ${total.branches.total}`
    }),
    stat("files", String(report$1.files.length))
  ));
  const files = section("Files", table(
    [
      { key: "path", label: "File", sort: (row) => row.path, render: (row) => code(truncateMiddle(row.path, 40)) },
      { key: "lines", label: "Lines", numeric: true, sort: (row) => row.summary.lines.pct, render: (row) => coverageCell(row.summary.lines) },
      { key: "functions", label: "Functions", numeric: true, sort: (row) => row.summary.functions.pct, render: (row) => coverageCell(row.summary.functions) },
      { key: "branches", label: "Branches", numeric: true, sort: (row) => row.summary.branches.pct, render: (row) => coverageCell(row.summary.branches) }
    ],
    report$1.files
  ));
  const uncovered = report$1.files.flatMap((file) => file.uncoveredLines.slice(0, 12).map((line) => ({ path: file.path, line })));
  const gaps = uncovered.length > 0 ? section("Never executed", h("div", { class: "chip-row" }, ...uncovered.slice(0, 40).map((entry) => h("button", {
    class: "chip amber is-link",
    title: `${entry.path} line ${entry.line}`,
    onclick: () => {
      ctx.ui.sourceFocusLine = entry.line;
      ctx.selectTab("source");
    }
  }, `L${entry.line}`)))) : null;
  const exportRow = section(null, h(
    "div",
    { class: "detail-head" },
    spacer(),
    copyButton(() => formatSummary(report$1), "Copy summary"),
    button("Download LCOV", () => downloadText("aktion.lcov", toLcov(report$1), "text/plain"))
  ), { flush: true });
  return [controls, summary, files, gaps, exportRow].filter((node) => node != null);
}
function coverageCell(metric2) {
  const tone = metric2.pct >= 80 ? "green" : metric2.pct >= 50 ? "amber" : "red";
  return h(
    "span",
    {},
    chip(`${Math.round(metric2.pct)}%`, tone),
    faint(` ${metric2.covered}/${metric2.total}`)
  );
}
function renderQueries(ctx) {
  const { app, ui } = ctx;
  const root = renderRootElement(app);
  const kinds = [
    { value: "role", label: "byRole", title: "Match by ARIA role (including implicit roles)" },
    { value: "text", label: "byText", title: "Match by visible text" },
    { value: "label", label: "byLabel", title: "Match a form control by its label" },
    { value: "testid", label: "byTestId", title: "Match data-testid" },
    { value: "css", label: "css", title: "Raw CSS selector" }
  ];
  const bar = toolbar(
    chipGroup(kinds, ui.queryProbeKind, (value) => {
      ui.queryProbeKind = value;
      ctx.refresh();
    }),
    searchInput(
      ui.queryProbe,
      (value) => {
        ui.queryProbe = value;
        ctx.refresh();
      },
      ui.queryProbeKind === "role" ? "button" : ui.queryProbeKind === "css" ? ".rui-card > button" : "Save",
      { focusKey: "query-probe" }
    )
  );
  if (!root) return [bar, faint("No render root to query.")];
  const matches = ui.queryProbe.trim() === "" ? [] : runProbe(root, ui.queryProbeKind, ui.queryProbe.trim());
  const results = ui.queryProbe.trim() === "" ? section(null, faint("Type a query to see what it matches. Hover a result to highlight it in the page."), { flush: true }) : section(`Matches (${matches.length})`, [
    matches.length === 0 ? h(
      "div",
      { class: "insight t-warn" },
      h("span", { class: "insight-ic" }, "▲"),
      h("span", {}, "Nothing matched. In a test, getBy* throws here and queryBy* returns null.")
    ) : matches.length > 1 ? h(
      "div",
      { class: "insight t-warn" },
      h("span", { class: "insight-ic" }, "▲"),
      h("span", {}, `${matches.length} elements match. getBy* throws on multiple matches — use getAllBy*, or narrow with { name: … }.`)
    ) : h(
      "div",
      { class: "insight t-good" },
      h("span", { class: "insight-ic" }, "✓"),
      h("span", {}, "Exactly one match — this query is safe in a test.")
    ),
    h("div", {}, ...matches.slice(0, 30).map((element) => h(
      "div",
      {
        class: "match-row",
        onmouseenter: () => ctx.overlay.highlight(element, {}, false),
        onmouseleave: () => ctx.overlay.hideHover(),
        onclick: () => {
          ctx.overlay.highlight(element, {}, true);
          if (can(app, "instanceForNode")) {
            const key2 = app.instanceForNode(element);
            if (key2) ctx.selectInstance(key2);
          }
        }
      },
      code(element.tagName.toLowerCase()),
      chip(element.getAttribute("role") ?? implicitRole(element) ?? "—", "grey"),
      h("span", { class: "match-name" }, accessibleName(element) || faint("(no accessible name)"))
    ))),
    h(
      "div",
      { class: "detail-head" },
      spacer(),
      copyButton(() => queryCode(ui.queryProbeKind, ui.queryProbe.trim(), matches.length), "Copy query")
    )
  ]);
  return [bar, results];
}
function runProbe(root, kind, value) {
  const all = [...root.querySelectorAll("*")];
  const needle = value.toLowerCase();
  switch (kind) {
    case "role":
      return all.filter((element) => {
        const role = element.getAttribute("role") ?? implicitRole(element);
        return role !== null && role.toLowerCase() === needle;
      });
    case "text":
      return all.filter((element) => {
        const own = [...element.childNodes].filter((node) => node.nodeType === 3).map((node) => node.textContent ?? "").join(" ").replace(/\s+/g, " ").trim().toLowerCase();
        return own !== "" && own.includes(needle);
      });
    case "label":
      return all.filter((element) => {
        if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) return false;
        return accessibleName(element).toLowerCase().includes(needle);
      });
    case "testid":
      return all.filter((element) => (element.getAttribute("data-testid") ?? "").toLowerCase() === needle);
    case "css":
      try {
        return [...root.querySelectorAll(value)];
      } catch {
        return [];
      }
    default:
      return [];
  }
}
function queryCode(kind, value, matches) {
  const all = matches > 1 ? "All" : "";
  switch (kind) {
    case "role":
      return `screen.get${all}ByRole(${JSON.stringify(value)})`;
    case "text":
      return `screen.get${all}ByText(${JSON.stringify(value)})`;
    case "label":
      return `screen.get${all}ByLabelText(${JSON.stringify(value)})`;
    case "testid":
      return `screen.get${all}ByTestId(${JSON.stringify(value)})`;
    default:
      return `screen.container.shadowRoot!.querySelector(${JSON.stringify(value)})`;
  }
}
const DESTRUCTIVE = /delete|remove|clear|reset|sign\s*out|log\s*out|revoke|cancel account/i;
function renderChaos(ctx) {
  const { app, ui } = ctx;
  const root = renderRootElement(app);
  const run = async (clicks) => {
    if (!root) return;
    ui.fuzzRunning = true;
    ctx.refresh();
    const startErrors = ctx.model.errors.length;
    const startLogErrors = ctx.model.logs.filter((entry) => entry.level === "error").length;
    const started = performance.now();
    let performed = 0;
    for (let i = 0; i < clicks; i += 1) {
      const targets = [...root.querySelectorAll(
        'button, a[href], [role="button"], [role="tab"], [role="menuitem"], input[type="checkbox"], input[type="radio"], summary'
      )].filter((element) => {
        if (element.disabled) return false;
        const label = accessibleName(element);
        return !DESTRUCTIVE.test(label);
      });
      if (targets.length === 0) break;
      const target = targets[Math.floor(Math.random() * targets.length)];
      try {
        target.click();
        performed += 1;
      } catch {
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const newErrors = [
      ...ctx.model.errors.slice(startErrors).map((error) => `${error.phase}: ${error.message}`),
      ...ctx.model.logs.filter((entry) => entry.level === "error").slice(startLogErrors).map((entry) => entry.text)
    ];
    ui.fuzzRun = {
      clicks: performed,
      errors: [...new Set(newErrors)],
      atoms: [...ctx.model.changeCounts.keys()],
      durationMs: performance.now() - started,
      at: Date.now()
    };
    ui.fuzzRunning = false;
    ctx.toast(newErrors.length === 0 ? `${performed} clicks, no errors` : `${newErrors.length} error(s) found`, newErrors.length === 0 ? "good" : "bad");
    ctx.refresh();
  };
  const controls = section(null, h(
    "div",
    { class: "detail-head" },
    button("Run 50", () => void run(50), { disabled: root === null || ui.fuzzRunning }),
    button("Run 200", () => void run(200), { disabled: root === null || ui.fuzzRunning }),
    ui.fuzzRunning ? chip("running", "amber") : null,
    spacer(),
    faint("Controls whose name reads destructive (delete, clear, sign out) are skipped.")
  ), { flush: true });
  if (!ui.fuzzRun) {
    return [controls, section(null, faint(
      "Clicks random controls with a render between each, then reports every runtime error and console error that appeared. Time-travel back from the State tab if a run leaves the app somewhere odd."
    ), { flush: true })];
  }
  const run1 = ui.fuzzRun;
  return [
    controls,
    section("Result", statGrid(
      stat("clicks", fmtCount(run1.clicks)),
      stat("errors", String(run1.errors.length), { tone: run1.errors.length > 0 ? "bad" : "good" }),
      stat("duration", fmtMs(run1.durationMs)),
      stat("atoms touched", String(run1.atoms.length))
    )),
    run1.errors.length > 0 ? section("Errors", h("div", {}, ...run1.errors.slice(0, 20).map((error) => h(
      "div",
      { class: "insight t-bad" },
      h("span", { class: "insight-ic" }, "✖"),
      h("span", {}, error)
    )))) : section(null, h(
      "div",
      { class: "insight t-good" },
      h("span", { class: "insight-ic" }, "✓"),
      h("span", {}, "No errors during the run.")
    ), { flush: true })
  ];
}
const KINDS = [
  { id: "commit", label: "commits", title: "Render commits" },
  { id: "effect", label: "effects", title: "Effect lifecycle events" },
  { id: "network", label: "network", title: "HTTP requests" },
  { id: "route", label: "routes", title: "Navigations" },
  { id: "emit", label: "emits", title: "Custom events the program dispatched" },
  { id: "log", label: "logs", title: "Console output" },
  { id: "error", label: "errors", title: "Runtime errors" }
];
const timelineTab = {
  id: "timeline",
  label: "Timeline",
  icon: "≡",
  hint: "Every commit, effect, request, navigation, and error in one ordered stream",
  render: (ctx) => render$1(ctx)
};
function render$1(ctx) {
  const { model, ui } = ctx;
  const bar = toolbar(
    h("div", { class: "filters" }, ...KINDS.map((kind) => toggle(kind.label, ui.timelineKinds.has(kind.id), () => {
      if (ui.timelineKinds.has(kind.id)) ui.timelineKinds.delete(kind.id);
      else ui.timelineKinds.add(kind.id);
      ctx.refresh();
    }, kind.title))),
    spacer(),
    button("Export session", () => downloadText("aktion-session.json", exportSessionJson(ctx)), {
      title: "Download every captured event as JSON"
    })
  );
  const entries = buildTimeline(model, ui.timelineKinds);
  if (entries.length === 0) {
    return [bar, emptyState(
      "Nothing captured yet.",
      "Interact with the app — every commit, effect, request, and navigation lands here."
    )];
  }
  const base = model.firstTime ?? 0;
  const span = Math.max(1, model.lastTime - base);
  const summary = section(null, statGrid(
    stat("events", fmtCount(entries.length)),
    stat("span", fmtRel(span)),
    stat("commits", fmtCount(model.totals.commits)),
    stat("requests", fmtCount(model.totals.network)),
    stat("errors", fmtCount(model.totals.errors), { tone: model.totals.errors > 0 ? "bad" : "good" })
  ), { flush: true });
  const rows = h("div", { class: "tlist" });
  let previous = null;
  for (const entry of entries.slice(-400).reverse()) {
    rows.appendChild(renderRow(ctx, entry, base, previous));
    previous = entry.time;
  }
  return [bar, summary, section(null, rows, { flush: true })];
}
function renderRow(ctx, entry, base, next) {
  const gap = next !== null ? next - entry.time : 0;
  return h(
    "div",
    {
      class: `tlist-row t-${entry.tone} ${entry.ref ? "is-link" : ""}`,
      onclick: entry.ref ? () => jump(ctx, entry) : void 0
    },
    h("span", { class: "tlist-time" }, fmtRel(entry.time - base)),
    h("span", { class: "tlist-kind" }, chip(entry.kind, entry.tone)),
    h("span", { class: "tlist-label" }, entry.label),
    h("span", { class: "tlist-detail" }, entry.detail),
    entry.duration !== void 0 ? h("span", { class: "tlist-dur" }, fmtMs(entry.duration)) : null,
    gap > 50 ? h("span", { class: "tlist-gap", title: "Idle gap before the next event" }, `+${fmtRel(gap)}`) : null
  );
}
function jump(ctx, entry) {
  switch (entry.kind) {
    case "commit":
      ctx.ui.selectedCommitId = Number(entry.ref);
      ctx.ui.profilerView = "commit";
      ctx.selectTab("profiler");
      break;
    case "effect":
      ctx.ui.selectedEffect = entry.ref ?? null;
      ctx.selectTab("effects");
      break;
    case "network":
      ctx.ui.selectedRequest = entry.ref ?? null;
      ctx.selectTab("network");
      break;
    case "route":
      ctx.selectTab("routes");
      break;
    case "error":
    case "log":
      ctx.selectTab("console");
      break;
  }
}
const SWITCHES = [
  {
    key: "captureProps",
    label: "Capture props",
    hint: "Record each component instance's arguments in every commit. Required by the Inspect tab's Props pane; the most expensive switch on a large tree."
  },
  {
    key: "tagDom",
    label: "Tag DOM",
    hint: "Stamp data-aktion-instance on rendered elements. Required by the element picker and by highlighting."
  },
  {
    key: "captureSnapshots",
    label: "State snapshots",
    hint: "Attach a $state snapshot to every commit. Required by time travel; clones the store once per commit."
  },
  {
    key: "captureNetwork",
    label: "Network",
    hint: "Emit request events and honour request rules. Turning this off also disables mocking."
  },
  {
    key: "measureDom",
    label: "Measure DOM",
    hint: "Count DOM nodes after each commit. Cheap, but it walks the whole tree."
  }
];
const DOCKS = [
  { value: "float", label: "Float" },
  { value: "right", label: "Right" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" }
];
const settingsTab = {
  id: "settings",
  label: "Settings",
  icon: "⚙",
  hint: "Instrumentation switches, panel layout, and keyboard shortcuts",
  render: (ctx) => render(ctx)
};
function render(ctx) {
  const { hook, model, ui } = ctx;
  const bar = toolbar(
    muted(`Aktion DevTools · protocol v${hook.protocolVersion} · runtime ${hook.libraryVersion}`),
    spacer(),
    chip(`${hook.apps.size} app${hook.apps.size === 1 ? "" : "s"}`, "grey")
  );
  const instrumentation = section("Instrumentation", [
    h("div", { class: "switch-list" }, ...SWITCHES.map((entry) => h(
      "div",
      { class: "switch-row" },
      toggle(entry.label, hook.options[entry.key], () => {
        hook.setOptions({ [entry.key]: !hook.options[entry.key] });
        ctx.app?.forceRender();
        ctx.toast(`${entry.label} ${hook.options[entry.key] ? "on" : "off"}`);
        ctx.refresh();
      }),
      h("span", { class: "switch-hint" }, entry.hint)
    ))),
    faint("These gate work inside the runtime, not inside the panel — switching one off makes the app faster, not just the panel.")
  ]);
  const visual = section("While you work", [
    h(
      "div",
      { class: "switch-list" },
      h(
        "div",
        { class: "switch-row" },
        toggle("Highlight re-renders", ui.highlightUpdates, () => {
          ui.highlightUpdates = !ui.highlightUpdates;
          if (!ui.highlightUpdates) ctx.overlay.clearUpdateFlashes();
          ctx.refresh();
        }),
        h(
          "span",
          { class: "switch-hint" },
          "Outline every component on the page as it re-renders. The quickest way to see work you did not expect — type one character and watch how much of the screen lights up."
        )
      ),
      h(
        "div",
        { class: "switch-row" },
        toggle("Flash on commit", ui.flashOnCommit, () => {
          ui.flashOnCommit = !ui.flashOnCommit;
          ctx.refresh();
        }),
        h("span", { class: "switch-hint" }, "Outline the whole app element on every commit — useful with several apps on one page.")
      ),
      h(
        "div",
        { class: "switch-row" },
        toggle("Browser performance marks", ui.perfMarks, () => {
          ui.perfMarks = !ui.perfMarks;
          ctx.toast(ui.perfMarks ? "Commits will appear in the browser's performance timeline" : "Performance marks off");
          ctx.refresh();
        }),
        h(
          "span",
          { class: "switch-hint" },
          "Mirror each commit into `performance.measure`, so Aktion commits show up in the browser's own timeline next to layout, paint, and long tasks."
        )
      ),
      h(
        "div",
        { class: "switch-row" },
        toggle("Capture console", ui.captureConsole, () => {
          ui.captureConsole = !ui.captureConsole;
          ctx.persist();
          ctx.refresh();
        }),
        h("span", { class: "switch-hint" }, "Mirror the page console into the Console tab, including the runtime's own [aktion] diagnostics.")
      )
    )
  ]);
  const layout = section("Panel", [
    h(
      "div",
      { class: "switch-row" },
      h("div", { class: "filters" }, ...DOCKS.map((dock) => toggle(dock.label, ui.dock === dock.value, () => {
        ui.dock = dock.value;
        ctx.persist();
        ctx.refresh();
      }))),
      h("span", { class: "switch-hint" }, "Float freely, or dock to an edge.")
    ),
    h(
      "div",
      { class: "switch-row" },
      toggle("Light theme", ui.light, () => {
        ui.light = !ui.light;
        ctx.persist();
        ctx.refresh();
      }),
      h("span", { class: "switch-hint" }, "For a light host page.")
    ),
    h(
      "div",
      { class: "switch-row" },
      toggle("Compact rows", ui.compact, () => {
        ui.compact = !ui.compact;
        ctx.persist();
        ctx.refresh();
      }),
      h("span", { class: "switch-hint" }, "Denser lists, for a small dock.")
    ),
    h(
      "div",
      { class: "switch-row" },
      button("Show keyboard shortcuts", () => {
        ui.shortcutsOpen = true;
        ctx.refresh();
      }, { title: "Also available with ?" }),
      h("span", { class: "switch-hint" }, "Ctrl/⌘ K opens the command palette from anywhere — every action in the panel, searchable.")
    ),
    !ui.tipsDismissed ? null : h(
      "div",
      { class: "switch-row" },
      button("Show the getting-started tips again", () => {
        ui.tipsDismissed = false;
        ctx.selectTab("overview");
      }),
      h("span", { class: "switch-hint" }, "The three-step introduction on the Overview tab.")
    )
  ].filter((node) => node != null));
  const retention = section("Session", [
    statGrid(
      stat("commits", fmtCount(model.commits.length), { title: `${fmtCount(model.totals.commits)} seen` }),
      stat("effects", fmtCount(model.effects.length)),
      stat("requests", fmtCount(model.network.length)),
      stat("logs", fmtCount(model.logs.length)),
      stat("snapshots", fmtCount(model.history.length)),
      stat("buffer", fmtCount(hook.buffer.length), { title: `Backfill buffer, capped at ${hook.bufferLimit}` })
    ),
    h(
      "div",
      { class: "detail-head" },
      button("Clear captured data", () => {
        clearModel(model);
        hook.clearBuffer();
        ui.selectedCommitId = null;
        ui.selectedRequest = null;
        ui.timeTravel = null;
        ctx.toast("Session data cleared");
        ctx.refresh();
      }, { tone: "warn" }),
      spacer(),
      faint("Lists are rings: old entries are dropped so a long session cannot grow without bound.")
    )
  ]);
  const shortcuts = section("Keyboard", defList([
    ["Esc", "Cancel the element picker"],
    ["Enter", "Commit an inline edit · run a REPL expression"],
    ["↑ / ↓", "Walk REPL history"],
    ["Click a header", "Sort a table"],
    ["Drag the header", "Move a floating panel"],
    ["Drag the corner", "Resize the panel"]
  ]));
  const about = section("About", [
    faint("An in-page debugger for any <aktion-app> on the page. It talks to the runtime only through the global hook, so the same protocol could drive a browser-extension panel."),
    defList([
      ["hook", code("__AKTION_DEVTOOLS_HOOK__")],
      ["protocol", `v${hook.protocolVersion}`],
      ["runtime", hook.libraryVersion],
      ["apps", [...hook.apps.values()].map((app) => app.label).join(", ") || "none"]
    ]),
    faint("Instrumentation stays dormant until a frontend subscribes: closing this panel returns the app to its uninstrumented speed.")
  ]);
  return [bar, visual, instrumentation, layout, retention, shortcuts, about];
}
const DEVTOOLS_UI_VERSION = "0.6";
const TABS = [
  overviewTab,
  inspectTab,
  stateTab,
  profilerTab,
  effectsTab,
  networkTab,
  consoleTab,
  routesTab,
  dataTab,
  themeTab,
  sourceTab,
  testTab,
  timelineTab,
  settingsTab
];
function isEditable(target) {
  const seen = /* @__PURE__ */ new Set();
  let node = target instanceof Element ? target : null;
  while (node && !seen.has(node)) {
    seen.add(node);
    const tag = node.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (node.isContentEditable) return true;
    node = node.shadowRoot?.activeElement ?? null;
  }
  return false;
}
const TOAST_MS = 2600;
function cssAttrValue(value) {
  return value.replace(/(["\\])/g, "\\$1");
}
class AktionDevtoolsElement extends HTMLElement {
  constructor() {
    super();
    __publicField(this, "hook", null);
    __publicField(this, "unsubEvents", null);
    __publicField(this, "unsubApps", null);
    __publicField(this, "models", /* @__PURE__ */ new Map());
    __publicField(this, "selectedAppId", null);
    __publicField(this, "ui", defaultUiState());
    __publicField(this, "overlay", new InspectOverlay());
    __publicField(this, "recorder", new InteractionRecorder());
    __publicField(this, "consoleCapture", new ConsoleCapture());
    __publicField(this, "renderScheduled", false);
    __publicField(this, "flashTimer", null);
    __publicField(this, "toastTimer", null);
    /** Memo for one render pass — see the comment in `render()`. */
    __publicField(this, "renderCache", /* @__PURE__ */ new Map());
    /** Events ignored since the user paused — surfaced on the Rec button. */
    __publicField(this, "droppedWhilePaused", 0);
    __publicField(this, "recordLabel", null);
    __publicField(this, "windowKeyHandler", null);
    __publicField(this, "longTaskObserver", null);
    /** Floating-mode geometry, persisted so the panel reopens where you left it. */
    __publicField(this, "geometry");
    // skeleton refs
    __publicField(this, "root");
    __publicField(this, "panelEl");
    __publicField(this, "headerEl");
    __publicField(this, "controlsEl");
    __publicField(this, "tabsEl");
    __publicField(this, "bodyEl");
    __publicField(this, "toastEl");
    __publicField(this, "paletteEl");
    /** The palette controller, created once so its input survives re-renders. */
    __publicField(this, "palette", new PaletteController({
      onQuery: (value) => {
        this.ui.paletteQuery = value;
        this.ui.paletteIndex = 0;
        this.scheduleRender();
      },
      onMove: (delta) => {
        this.ui.paletteIndex = Math.max(0, this.ui.paletteIndex + delta);
        this.scheduleRender();
      },
      onRun: (command) => {
        this.closePalette();
        command.run();
        this.scheduleRender();
      },
      onClose: () => {
        this.closePalette();
        this.scheduleRender();
      }
    }));
    const persisted = loadPersisted();
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const width = persisted.width ?? Math.min(760, Math.max(420, Math.round(vw * 0.55)));
    const height = persisted.height ?? Math.min(680, Math.max(360, Math.round(vh * 0.8)));
    this.geometry = {
      width,
      height,
      left: persisted.left ?? Math.max(8, vw - width - 16),
      top: persisted.top ?? Math.max(8, vh - height - 16)
    };
    if (persisted.tab && TABS.some((tab) => tab.id === persisted.tab)) this.ui.tab = persisted.tab;
    if (persisted.dock) this.ui.dock = persisted.dock;
    if (persisted.light !== void 0) this.ui.light = persisted.light;
    if (persisted.compact !== void 0) this.ui.compact = persisted.compact;
    if (persisted.captureConsole !== void 0) this.ui.captureConsole = persisted.captureConsole;
    if (persisted.tipsDismissed !== void 0) this.ui.tipsDismissed = persisted.tipsDismissed;
    if (Array.isArray(persisted.watches)) this.ui.watches = persisted.watches.slice(0, 20);
  }
  connectedCallback() {
    if (!this.root) this.buildSkeleton();
    this.hook = installDevtoolsHook(DEVTOOLS_UI_VERSION);
    for (const app of this.hook.apps.values()) this.adopt(app);
    if (!this.selectedAppId && this.hook.apps.size > 0) {
      this.selectedAppId = [...this.hook.apps.keys()][0];
    }
    for (const event of this.hook.buffer) this.ingestEvent(event, true);
    this.unsubEvents = this.hook.subscribe((event) => this.onEvent(event));
    this.unsubApps = this.hook.subscribeApps((action, app) => this.onApp(action, app));
    this.discoverApps();
    this.syncConsoleCapture();
    this.observeLongTasks();
    this.applyDock();
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
    this.overlay.destroy();
    if (this.flashTimer) clearTimeout(this.flashTimer);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    if (this.windowKeyHandler && typeof window !== "undefined") {
      window.removeEventListener("keydown", this.windowKeyHandler, true);
    }
    this.windowKeyHandler = null;
    this.longTaskObserver?.disconnect();
    this.longTaskObserver = null;
    this.persist();
  }
  /* ---- public controller surface ---- */
  open() {
    this.hidden = false;
    this.scheduleRender();
  }
  close() {
    this.hidden = true;
    this.overlay.clear();
    this.overlay.stopPicking();
  }
  toggle() {
    if (this.hidden) this.open();
    else this.close();
  }
  selectApp(id) {
    this.selectedAppId = id;
    this.ui.selectedCommitId = null;
    this.ui.selectedInstance = null;
    this.ui.selectedRequest = null;
    this.ui.timeTravel = null;
    this.scheduleRender();
  }
  /** Switch tabs programmatically (used by the controller and by tab links). */
  selectTab(tab) {
    this.ui.tab = tab;
    this.persist();
    this.scheduleRender();
  }
  /** Test/inspection hook: the derived model for an app (or the selected one). */
  getModel(appId) {
    const id = appId ?? this.selectedAppId;
    return id ? this.models.get(id) ?? null : null;
  }
  /** Test/inspection hook: the panel's current view state. */
  getUiState() {
    return this.ui;
  }
  /* ---- event ingestion ---- */
  ensureModel(appId) {
    let model = this.models.get(appId);
    if (!model) {
      model = emptyModel();
      this.models.set(appId, model);
    }
    return model;
  }
  /** Adopt an app: ensure a model and seed its current state snapshot. */
  adopt(app) {
    const model = this.ensureModel(app.id);
    try {
      model.state = app.getState();
    } catch {
    }
    if (typeof app.getNetworkRules === "function") {
      try {
        this.ui.rules = app.getNetworkRules();
      } catch {
      }
    }
    return model;
  }
  /** Ask every `<aktion-app>` on the page to register with the hook. */
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
      this.updateRecordLabel();
      return;
    }
    this.ingestEvent(event, false);
    const mine = event.appId === this.selectedAppId;
    if (event.kind === "commit" && mine) {
      if (this.ui.flashOnCommit) this.flashApp(event.appId);
      if (this.ui.highlightUpdates) this.highlightRenderedComponents(event);
      if (this.ui.perfMarks) this.markCommitForBrowserProfiler(event);
      this.recordProgramVersion(event.appId);
    }
    if (event.kind === "state" && mine) this.checkBreakOnChange(event);
    if (event.kind === "route" && this.recorder.isRecording && mine) {
      this.recorder.addStep({ type: "navigate", value: event.to, label: `navigate to ${event.to}` });
    }
    this.scheduleRender();
  }
  /**
   * Outline every component that actually rendered in this commit.
   *
   * The most direct answer to "why did that feel slow?" is seeing the whole
   * screen flash when you typed one character. Memoized instances are skipped —
   * outlining them would report the opposite of the truth.
   */
  highlightRenderedComponents(commit) {
    const app = this.currentApp();
    if (typeof app?.nodeForInstance !== "function") return;
    const keys = commit.components.filter((record) => record.phase !== "memo").map((record) => record.instanceKey);
    const nodes = [];
    for (const key2 of keys.slice(0, 60)) {
      const node = app.nodeForInstance(key2);
      if (node) nodes.push(node);
    }
    this.overlay.flashUpdated(nodes);
  }
  /**
   * Mirror a commit into `performance.measure` so it appears in the browser's
   * own performance timeline next to layout, paint, and long tasks.
   *
   * The panel's profiler can tell you a commit took 12ms; only the browser's
   * timeline can tell you what happened around it.
   */
  markCommitForBrowserProfiler(commit) {
    if (typeof performance === "undefined" || typeof performance.measure !== "function") return;
    try {
      const label = commit.initial ? "aktion: initial mount" : `aktion: commit #${commit.commitId}${commit.changedPaths.length ? ` (${commit.changedPaths.join(", ")})` : ""}`;
      performance.measure(label, { start: commit.startTime, duration: commit.duration });
    } catch {
    }
  }
  /**
   * Break into the debugger when a watched atom changes.
   *
   * The panel cannot pause the runtime, but the browser can: a `debugger`
   * statement executed here stops the world inside the state flush, one frame
   * below the write, with the stack that caused it. That is the one thing a
   * state inspector cannot otherwise give you.
   */
  checkBreakOnChange(event) {
    if (this.ui.breakOnChange.size === 0) return;
    const hit = event.changedPaths.find((path) => this.ui.breakOnChange.has(path) || this.ui.breakOnChange.has(rootOf(path)));
    if (!hit) return;
    const value = event.snapshot[rootOf(hit)];
    console.warn(`[aktion-devtools] break on change: $${hit} =`, value);
    debugger;
  }
  /**
   * Keep a short history of program versions.
   *
   * A hot-swapped program that fails to parse leaves you with a blank app and no
   * way back — the Source tab can only re-plan what is already broken. Recording
   * each distinct version as it commits makes "undo that edit" possible.
   */
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
    if (model.programHistory.length > 20) model.programHistory.shift();
  }
  ingestEvent(event, fromBuffer) {
    ingest(this.ensureModel(event.appId), event, fromBuffer);
  }
  /** Route a captured console line into the selected app's model. */
  syncConsoleCapture() {
    if (this.ui.captureConsole && !this.consoleCapture.active) {
      this.consoleCapture.start((entry) => {
        const id = this.selectedAppId;
        if (!id) return;
        ingestLog(this.ensureModel(id), { ...entry, text: entry.args.join(" "), count: 1 });
        this.scheduleRender();
      });
    } else if (!this.ui.captureConsole && this.consoleCapture.active) {
      this.consoleCapture.stop();
    }
  }
  /* ---- render scheduling ---- */
  scheduleRender() {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    const run = () => {
      this.renderScheduled = false;
      try {
        this.render();
      } catch (err) {
        console.error("[aktion-devtools] render failed", err);
        this.bodyEl?.replaceChildren(h(
          "div",
          { class: "empty" },
          h("p", {}, "The panel hit an error while rendering this tab."),
          h("p", { class: "faint" }, String(err))
        ));
      }
    };
    queueMicrotask(run);
  }
  currentApp() {
    if (!this.selectedAppId || !this.hook) return null;
    return this.hook.apps.get(this.selectedAppId) ?? null;
  }
  render() {
    if (this.hidden || !this.root) return;
    this.syncConsoleCapture();
    this.renderCache = /* @__PURE__ */ new Map();
    if (!this.ui.paused) this.droppedWhilePaused = 0;
    this.applyChrome();
    this.renderControls();
    this.renderTabs();
    const focus = this.captureFocus();
    const scroll = this.captureScroll();
    this.renderBody();
    this.restoreScroll(scroll);
    this.restoreFocus(focus);
    this.renderToast();
    this.renderPalette();
  }
  /* ---- focus + scroll preservation ---- */
  /**
   * Remember where the caret is before a re-render.
   *
   * The panel re-renders on every runtime event, so a field the user is typing
   * in is rebuilt several times a second. Restoring by POSITION is not enough:
   * running a REPL expression grows the history above the input, so the input is
   * no longer the same child index and focus is lost on exactly the keystroke
   * that mattered. Fields therefore declare a stable key (see `FOCUS_KEY_ATTR`)
   * and the shell restores by key, falling back to the position for anything
   * that has not declared one.
   */
  captureFocus() {
    let active = null;
    try {
      active = this.root.activeElement;
    } catch {
      return null;
    }
    if (!(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) return null;
    if (!this.bodyEl.contains(active)) return null;
    const path = [];
    let node = active;
    while (node && node !== this.bodyEl) {
      const parent = node.parentElement;
      if (!parent) break;
      path.unshift([...parent.children].indexOf(node));
      node = parent;
    }
    let start2 = null;
    let end = null;
    try {
      start2 = active.selectionStart;
      end = active.selectionEnd;
    } catch {
    }
    return {
      key: active.getAttribute(FOCUS_KEY_ATTR),
      path,
      start: start2,
      end,
      className: active.className,
      value: active.value
    };
  }
  restoreFocus(focus) {
    if (!focus) return;
    const target = this.findFocusTarget(focus);
    if (!target) return;
    target.focus();
    if (focus.start !== null && focus.end !== null && target.value === focus.value) {
      try {
        target.setSelectionRange(focus.start, focus.end);
      } catch {
      }
    }
  }
  findFocusTarget(focus) {
    if (focus.key) {
      const byKey = this.bodyEl.querySelector(`[${FOCUS_KEY_ATTR}="${cssAttrValue(focus.key)}"]`);
      if (byKey instanceof HTMLInputElement || byKey instanceof HTMLTextAreaElement) return byKey;
      return null;
    }
    let node = this.bodyEl;
    for (const index of focus.path) {
      node = node?.children[index] ?? null;
      if (!node) return null;
    }
    if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) return null;
    return node.className === focus.className ? node : null;
  }
  /**
   * Scroll offsets of every keyed scroll container, so a scrolled component
   * tree does not jump to the top each time an event arrives.
   */
  captureScroll() {
    const out = /* @__PURE__ */ new Map();
    out.set("__body", this.bodyEl.scrollTop);
    for (const el of this.bodyEl.querySelectorAll(`[${SCROLL_KEY_ATTR}]`)) {
      const key2 = el.getAttribute(SCROLL_KEY_ATTR);
      if (key2) out.set(key2, el.scrollTop);
    }
    return out;
  }
  restoreScroll(offsets) {
    const body = offsets.get("__body");
    if (body !== void 0) this.bodyEl.scrollTop = body;
    for (const el of this.bodyEl.querySelectorAll(`[${SCROLL_KEY_ATTR}]`)) {
      const key2 = el.getAttribute(SCROLL_KEY_ATTR);
      const value = key2 ? offsets.get(key2) : void 0;
      if (value !== void 0) el.scrollTop = value;
    }
  }
  /* ---- chrome ---- */
  buildSkeleton() {
    this.root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = devtoolsStyles;
    this.controlsEl = h("div", { class: "controls" });
    this.toastEl = h("div", { class: "toast", hidden: true });
    this.headerEl = h(
      "div",
      { class: "header" },
      h(
        "div",
        { class: "brand" },
        h("span", { class: "bolt" }, "⚡"),
        h("span", {}, "Aktion DevTools"),
        h("span", { class: "ver" }, `v${DEVTOOLS_UI_VERSION}`)
      ),
      this.toastEl,
      spacer(),
      this.controlsEl
    );
    this.makeDraggable(this.headerEl);
    this.tabsEl = h("div", { class: "tabs" });
    this.bodyEl = h("div", { class: "panel-body" });
    const grip = h("div", { class: "resize", title: "Drag to resize" });
    this.makeResizable(grip);
    this.paletteEl = h("div", { class: "pal-host", hidden: true });
    this.panelEl = h("div", { class: "panel" }, this.headerEl, this.tabsEl, this.bodyEl, grip);
    this.root.append(style, this.panelEl, this.paletteEl);
    this.bindKeyboard();
    this.applyChrome();
  }
  /** Reflect dock mode, theme, and density onto the host + panel. */
  applyChrome() {
    this.classList.toggle("is-light", this.ui.light);
    this.classList.toggle("is-compact", this.ui.compact);
    this.panelEl.classList.toggle("is-collapsed", this.ui.collapsed);
    this.applyDock();
  }
  applyDock() {
    const dock = this.ui.dock;
    for (const mode of ["float", "right", "bottom", "left"]) {
      this.classList.toggle(`dock-${mode}`, dock === mode);
    }
    if (dock === "float") {
      this.style.left = `${this.geometry.left}px`;
      this.style.top = `${this.geometry.top}px`;
      this.style.right = "";
      this.style.bottom = "";
      this.panelEl.style.width = `${this.geometry.width}px`;
      this.panelEl.style.height = `${this.geometry.height}px`;
      return;
    }
    this.style.left = "";
    this.style.top = "";
    this.style.right = "";
    this.style.bottom = "";
    this.panelEl.style.width = "";
    this.panelEl.style.height = "";
  }
  /** Rec / Paused, with a count of what pausing has cost you. */
  recordText() {
    if (!this.ui.paused) return "Rec";
    return this.droppedWhilePaused > 0 ? `Paused · ${this.droppedWhilePaused}` : "Paused";
  }
  recordTitle() {
    if (!this.ui.paused) return "Recording — click to pause";
    return this.droppedWhilePaused > 0 ? `Paused — ${this.droppedWhilePaused} event${this.droppedWhilePaused === 1 ? "" : "s"} ignored since you paused. Click to resume (they are not recovered).` : "Paused — click to resume recording";
  }
  /** Update the button text without a render — see `droppedWhilePaused`. */
  updateRecordLabel() {
    if (!this.recordLabel) return;
    this.recordLabel.textContent = this.recordText();
    const button2 = this.recordLabel.parentElement;
    if (button2) button2.title = this.recordTitle();
  }
  /**
   * Open Inspect on an instance and make sure the row is actually visible.
   *
   * A jump from another tab can land on a row hidden three different ways —
   * inside a collapsed branch, excluded by the tree filter, or a library
   * component while the Library toggle is off. Silently showing the detail of
   * a row you cannot see is the worst of the three outcomes, so clear all of
   * them and say which ones were cleared.
   */
  revealInInspect(instanceKey) {
    this.ui.tab = "inspect";
    for (const ancestor of ancestorKeyCandidates(instanceKey)) {
      this.ui.inspectCollapsed.delete(ancestor);
    }
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
    if (cleared.length > 0) this.toastMessage(`Cleared the ${cleared.join(" and ")} to show ${name}`);
    this.ui.inspectReveal = instanceKey;
  }
  /** Show a transient message. Shared by the tabs (via `ctx.toast`) and the shell. */
  toastMessage(message, tone = "info") {
    this.ui.toast = { message, tone, at: Date.now() };
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.ui.toast = null;
      this.scheduleRender();
    }, TOAST_MS);
    this.renderToast();
  }
  renderControls() {
    const apps = this.hook ? [...this.hook.apps.values()] : [];
    const select = h("select", {
      class: "app-select",
      title: "Inspected app",
      onchange: (event) => this.selectApp(event.target.value)
    });
    if (apps.length === 0) {
      select.appendChild(h("option", {}, "no app detected"));
      select.disabled = true;
    } else {
      for (const app of apps) {
        const option = h("option", { value: app.id }, app.label);
        if (app.id === this.selectedAppId) option.selected = true;
        select.appendChild(option);
      }
    }
    this.recordLabel = h("span", { class: "rec-label" }, this.recordText());
    const record = h("button", {
      class: `icon-btn ${this.ui.paused ? "" : "is-on"}`,
      title: this.recordTitle(),
      onclick: () => {
        this.ui.paused = !this.ui.paused;
        this.scheduleRender();
      }
    }, h("span", { class: `rec-dot ${this.ui.paused ? "is-paused" : ""}` }), this.recordLabel);
    const dockButton = h("button", {
      class: "icon-btn",
      title: `Dock: ${this.ui.dock} — click to cycle`,
      onclick: () => {
        const order = ["float", "right", "bottom", "left"];
        const next = order[(order.indexOf(this.ui.dock) + 1) % order.length];
        this.ui.dock = next;
        this.persist();
        this.scheduleRender();
      }
    }, dockGlyph(this.ui.dock));
    const collapse = h("button", {
      class: "icon-btn",
      title: this.ui.collapsed ? "Expand" : "Collapse",
      onclick: () => {
        this.ui.collapsed = !this.ui.collapsed;
        this.scheduleRender();
      }
    }, this.ui.collapsed ? "▢" : "—");
    const close = h("button", { class: "icon-btn", title: "Close", onclick: () => this.close() }, "✕");
    this.controlsEl.replaceChildren(select, record, dockButton, collapse, close);
  }
  renderTabs() {
    const ctx = this.context();
    this.tabsEl.replaceChildren(...TABS.map((tab) => {
      let badge = null;
      try {
        badge = tab.badge?.(ctx) ?? null;
      } catch {
        badge = null;
      }
      return h(
        "button",
        {
          class: `tab ${this.ui.tab === tab.id ? "is-active" : ""}`,
          title: `${tab.label} — ${tab.hint}`,
          "data-tab": tab.id,
          onclick: () => this.selectTab(tab.id)
        },
        h("span", { class: "tab-icon" }, tab.icon),
        h("span", { class: "tab-label" }, tab.label),
        badge !== null ? h("span", { class: "count" }, badge > 999 ? "999+" : String(badge)) : null
      );
    }));
    const active = this.tabsEl.querySelector(".tab.is-active");
    if (active) {
      const stripBox = this.tabsEl.getBoundingClientRect();
      const tabBox = active.getBoundingClientRect();
      if (tabBox.left < stripBox.left || tabBox.right > stripBox.right) {
        active.scrollIntoView({ block: "nearest", inline: "center" });
      }
    }
  }
  /* ---- command palette + shortcuts ---- */
  /** Panel-level operations the palette can trigger. */
  paletteActions() {
    const ctx = this.context();
    return {
      togglePicker: () => this.togglePicker(),
      clearOverrides: () => {
        const app = this.currentApp();
        if (typeof app?.listPropOverrides !== "function" || typeof app.clearPropOverride !== "function") return;
        for (const entry of app.listPropOverrides()) app.clearPropOverride(entry.instanceKey, entry.prop);
        ctx.toast("Prop overrides cleared");
        this.scheduleRender();
      },
      runAudit: () => {
        this.ui.tab = "test";
        this.ui.testPane = "a11y";
        this.ui.a11yRequested = true;
        this.scheduleRender();
      },
      toggleRecording: () => {
        this.ui.tab = "test";
        this.ui.testPane = "record";
        if (this.recorder.isRecording) {
          this.recorder.stop();
          ctx.toast(`Recorded ${this.recorder.list().length} step(s)`);
        } else {
          const root = renderRootElement(this.currentApp());
          const started = this.recorder.start(root, () => this.scheduleRender());
          ctx.toast(started ? "Recording — interact with the app" : "Could not attach to the app", started ? "good" : "bad");
        }
        this.scheduleRender();
      },
      exportSession: () => {
        downloadText("aktion-session.json", exportSessionJson(this.context()));
        ctx.toast("Session exported");
      },
      clearSession: () => {
        const model = this.getModel();
        if (model) clearModel(model);
        this.hook?.clearBuffer();
        this.ui.selectedCommitId = null;
        this.ui.selectedRequest = null;
        this.ui.timeTravel = null;
        ctx.toast("Session data cleared");
        this.scheduleRender();
      },
      cycleDock: () => this.cycleDock(),
      showShortcuts: () => {
        this.ui.shortcutsOpen = true;
        this.scheduleRender();
      }
    };
  }
  /** Render (or tear down) the palette / shortcut overlay. */
  renderPalette() {
    if (this.ui.shortcutsOpen) {
      this.paletteEl.hidden = false;
      this.paletteEl.replaceChildren(h(
        "div",
        { class: "pal-scrim", onclick: () => {
          this.ui.shortcutsOpen = false;
          this.scheduleRender();
        } },
        h(
          "div",
          { class: "pal-box is-help", onclick: (event) => event.stopPropagation() },
          h("div", { class: "pal-title" }, "Keyboard shortcuts"),
          h("div", { class: "deflist" }, ...SHORTCUTS.flatMap(([keys, what]) => [
            h("div", { class: "dt" }, keys),
            h("div", { class: "dd" }, what)
          ])),
          h("div", { class: "pal-foot" }, h("span", {}, "Esc to close"))
        )
      ));
      return;
    }
    if (!this.ui.paletteOpen) {
      if (!this.paletteEl.hidden) {
        this.paletteEl.hidden = true;
        this.paletteEl.replaceChildren();
      }
      return;
    }
    this.paletteEl.hidden = false;
    const ctx = this.context();
    const count = this.palette.update(this.paletteEl, {
      query: this.ui.paletteQuery,
      selected: this.ui.paletteIndex,
      commands: buildPalette(ctx, this.paletteActions())
    });
    if (this.ui.paletteIndex >= count) this.ui.paletteIndex = Math.max(0, count - 1);
  }
  openPalette() {
    this.ui.paletteOpen = true;
    this.ui.shortcutsOpen = false;
    this.ui.paletteQuery = "";
    this.ui.paletteIndex = 0;
    this.palette.reset();
    this.scheduleRender();
    queueMicrotask(() => {
      if (this.ui.paletteOpen) this.palette.focus();
    });
  }
  closePalette() {
    this.ui.paletteOpen = false;
    this.ui.paletteQuery = "";
    this.ui.paletteIndex = 0;
    this.palette.reset();
  }
  cycleDock() {
    const order = ["float", "right", "bottom", "left"];
    this.ui.dock = order[(order.indexOf(this.ui.dock) + 1) % order.length];
    this.persist();
    this.scheduleRender();
  }
  /** Arm / disarm the element picker from anywhere (palette, shortcut, button). */
  togglePicker() {
    if (this.overlay.isPicking) {
      this.overlay.stopPicking();
      this.scheduleRender();
      return;
    }
    const app = this.currentApp();
    this.ui.tab = "inspect";
    this.overlay.startPicking({
      onPick: (element) => {
        this.ui.selectedElement = element;
        const key2 = typeof app?.instanceForNode === "function" ? app.instanceForNode(element) : null;
        this.ui.selectedInstance = key2;
        if (key2) this.highlightInstance(key2, true);
        else this.overlay.highlight(element, {}, true);
        this.ui.inspectPane = key2 ? "props" : "dom";
        this.scheduleRender();
      },
      onCancel: () => this.scheduleRender()
    });
    this.scheduleRender();
  }
  /**
   * Panel-wide keyboard handling.
   *
   * Bound on the panel's own root, not the window: a debugger that swallows the
   * page's keystrokes is worse than one with no shortcuts. The two exceptions
   * are the palette and the picker toggle, which are bound on the window because
   * you reach for them while your hands are in the app.
   */
  bindKeyboard() {
    this.root.addEventListener("keydown", (event) => this.onKeyDown(event));
    if (typeof window === "undefined") return;
    this.windowKeyHandler = (event) => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (this.hidden) this.open();
        this.openPalette();
      } else if (mod && event.shiftKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        if (this.hidden) this.open();
        this.togglePicker();
      } else if (event.altKey && !this.hidden && !isEditable(event.target)) {
        this.tabShortcut(event);
      }
    };
    window.addEventListener("keydown", this.windowKeyHandler, true);
  }
  /** Alt+1..9 selects a tab; Alt+[ / Alt+] cycle. Returns true if handled. */
  tabShortcut(event) {
    if (event.key >= "1" && event.key <= "9") {
      const tab = TABS[Number(event.key) - 1];
      if (!tab) return false;
      event.preventDefault();
      this.selectTab(tab.id);
      return true;
    }
    if (event.key === "[" || event.key === "]") {
      event.preventDefault();
      const index = TABS.findIndex((tab) => tab.id === this.ui.tab);
      const next = TABS[(index + (event.key === "]" ? 1 : TABS.length - 1)) % TABS.length];
      this.selectTab(next.id);
      return true;
    }
    return false;
  }
  onKeyDown(event) {
    const target = event.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
    if (event.key === "Escape") {
      if (this.ui.paletteOpen || this.ui.shortcutsOpen) {
        event.preventDefault();
        this.closePalette();
        this.ui.shortcutsOpen = false;
        this.scheduleRender();
      }
      return;
    }
    if (event.key === "?" && !typing) {
      event.preventDefault();
      this.ui.shortcutsOpen = !this.ui.shortcutsOpen;
      this.scheduleRender();
      return;
    }
    if (event.key === "/" && !typing || (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      const search = this.bodyEl.querySelector("input.search");
      if (search) {
        event.preventDefault();
        search.focus();
        search.select();
      }
      return;
    }
    if (event.altKey && !typing) this.tabShortcut(event);
  }
  /**
   * Watch for long tasks while the panel is open.
   *
   * A commit that measures 4ms in the profiler but janks the page is usually a
   * long task the runtime did not cause (an image decode, a third-party script)
   * — and being able to say so is the difference between fixing the right thing
   * and rewriting a component that was never the problem.
   */
  observeLongTasks() {
    if (typeof PerformanceObserver !== "function" || this.longTaskObserver) return;
    try {
      const observer = new PerformanceObserver((list) => {
        const model = this.getModel();
        if (!model) return;
        for (const entry of list.getEntries()) {
          model.longTasks.push({ start: entry.startTime, duration: entry.duration });
        }
        if (model.longTasks.length > 100) model.longTasks.splice(0, model.longTasks.length - 100);
        this.scheduleRender();
      });
      observer.observe({ entryTypes: ["longtask"] });
      this.longTaskObserver = observer;
    } catch {
    }
  }
  renderBody() {
    const ctx = this.context();
    const definition = TABS.find((tab) => tab.id === this.ui.tab) ?? TABS[0];
    this.bodyEl.replaceChildren(...definition.render(ctx));
  }
  renderToast() {
    const toast = this.ui.toast;
    if (!toast) {
      this.toastEl.hidden = true;
      this.toastEl.replaceChildren();
      return;
    }
    this.toastEl.hidden = false;
    this.toastEl.className = `toast t-${toast.tone}`;
    this.toastEl.textContent = toast.message;
  }
  /* ---- tab context ---- */
  context() {
    const app = this.currentApp();
    const model = this.getModel() ?? emptyModel();
    const hook = this.hook ?? installDevtoolsHook(DEVTOOLS_UI_VERSION);
    return {
      app,
      model,
      hook,
      ui: this.ui,
      overlay: this.overlay,
      recorder: this.recorder,
      cache: (key2, compute) => {
        if (this.renderCache.has(key2)) return this.renderCache.get(key2);
        const value = compute();
        this.renderCache.set(key2, value);
        return value;
      },
      width: () => this.panelEl?.getBoundingClientRect().width ?? this.geometry.width,
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
      toast: (message, tone = "info") => this.toastMessage(message, tone),
      highlightInstance: (instanceKey, pin) => this.highlightInstance(instanceKey, pin ?? false),
      togglePicker: () => this.togglePicker(),
      openPalette: () => this.openPalette(),
      persist: () => this.persist(),
      recordedSteps: () => this.recorder.list()
    };
  }
  /** Highlight the DOM node an instance rendered, labelled with its name. */
  highlightInstance(instanceKey, pin) {
    if (!instanceKey) {
      this.overlay.hideHover();
      return;
    }
    const app = this.currentApp();
    const node = typeof app?.nodeForInstance === "function" ? app.nodeForInstance(instanceKey) : null;
    if (!node) {
      this.overlay.hideHover();
      return;
    }
    this.overlay.highlight(node, { component: componentNameFromKey(instanceKey) }, pin);
  }
  /* ---- highlight + drag/resize ---- */
  flashApp(appId) {
    const app = this.hook?.apps.get(appId);
    if (!app) return;
    const element = app.element;
    const previous = element.style.outline;
    element.style.outline = "2px solid rgba(124,156,255,0.9)";
    element.style.outlineOffset = "1px";
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => {
      element.style.outline = previous;
      element.style.outlineOffset = "";
    }, 140);
  }
  makeDraggable(handle) {
    let startX = 0, startY = 0, originLeft = 0, originTop = 0, dragging = false;
    const onMove = (event) => {
      if (!dragging) return;
      this.geometry.left = Math.max(0, originLeft + (event.clientX - startX));
      this.geometry.top = Math.max(0, originTop + (event.clientY - startY));
      this.style.left = `${this.geometry.left}px`;
      this.style.top = `${this.geometry.top}px`;
    };
    const onUp = () => {
      dragging = false;
      handle.classList.remove("is-dragging");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      this.persist();
    };
    handle.addEventListener("mousedown", (event) => {
      if (this.ui.dock !== "float") return;
      if (event.target.closest("button, select, input")) return;
      dragging = true;
      handle.classList.add("is-dragging");
      startX = event.clientX;
      startY = event.clientY;
      const rect = this.getBoundingClientRect();
      originLeft = rect.left;
      originTop = rect.top;
      event.preventDefault();
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  }
  makeResizable(grip) {
    let startX = 0, startY = 0, startW = 0, startH = 0, resizing = false;
    const onMove = (event) => {
      if (!resizing) return;
      this.geometry.width = Math.max(360, startW + (event.clientX - startX));
      this.geometry.height = Math.max(260, startH + (event.clientY - startY));
      this.panelEl.style.width = `${this.geometry.width}px`;
      this.panelEl.style.height = `${this.geometry.height}px`;
    };
    const onUp = () => {
      resizing = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      this.persist();
    };
    grip.addEventListener("mousedown", (event) => {
      if (this.ui.dock !== "float") return;
      resizing = true;
      startX = event.clientX;
      startY = event.clientY;
      const rect = this.panelEl.getBoundingClientRect();
      startW = rect.width;
      startH = rect.height;
      event.preventDefault();
      event.stopPropagation();
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  }
  persist() {
    const payload = {
      tab: this.ui.tab,
      dock: this.ui.dock,
      light: this.ui.light,
      compact: this.ui.compact,
      captureConsole: this.ui.captureConsole,
      width: this.geometry.width,
      height: this.geometry.height,
      left: this.geometry.left,
      top: this.geometry.top,
      tipsDismissed: this.ui.tipsDismissed,
      watches: this.ui.watches
    };
    savePersisted(payload);
  }
}
__publicField(AktionDevtoolsElement, "tagName", "aktion-devtools");
function dockGlyph(dock) {
  switch (dock) {
    case "right":
      return "▐";
    case "left":
      return "▌";
    case "bottom":
      return "▄";
    default:
      return "❐";
  }
}
function defineDevtoolsElement() {
  if (typeof customElements === "undefined") return;
  if (!customElements.get(AktionDevtoolsElement.tagName)) {
    customElements.define(AktionDevtoolsElement.tagName, AktionDevtoolsElement);
  }
}
function mountDevtools(options = {}) {
  const hook = installDevtoolsHook(DEVTOOLS_UI_VERSION);
  defineDevtoolsElement();
  const element = document.createElement(AktionDevtoolsElement.tagName);
  (options.container ?? document.body).appendChild(element);
  if (options.appId) element.selectApp(options.appId);
  if (options.tab) element.selectTab(options.tab);
  if (options.dock) {
    element.getUiState().dock = options.dock;
    element.selectTab(element.getUiState().tab);
  }
  if (options.open === false) element.close();
  return {
    element,
    hook,
    open: () => element.open(),
    close: () => element.close(),
    toggle: () => element.toggle(),
    selectApp: (id) => element.selectApp(id),
    selectTab: (tab) => element.selectTab(tab),
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
  HOOK_KEY,
  InspectOverlay,
  InteractionRecorder,
  PaletteController,
  SHORTCUTS,
  a11ySummary,
  accessibleName,
  ancestorsOf,
  auditAccessibility,
  buildInstanceTree,
  buildPalette,
  buildTimeline,
  chooseQuery,
  clearModel,
  componentAggregates,
  componentNameFromKey,
  computedGroup,
  contrastRatio,
  cssPath,
  cssVariables,
  deepElementFromPoint,
  defineDevtoolsElement,
  descendantsOf,
  describeElement,
  devtoolsOption,
  diffSnapshots,
  effectAggregates,
  effectiveBackground,
  emptyModel,
  exportSessionJson,
  findMatchingRule,
  fuzzyScore,
  generateSnapshotTest,
  generateTest,
  getDevtoolsHook,
  groupFindings,
  hotAtoms,
  implicitRole,
  ingest,
  ingestLog,
  installDevtoolsHook,
  instanceAggregates,
  isDevtoolsActive,
  isDevtoolsInstalled,
  measureBox,
  mountDevtools,
  networkStats,
  newRule,
  parentKeyOf,
  parseColor,
  parseEditedValue,
  previewOf,
  queryExpression,
  queryLabel,
  rankCommands,
  relativeLuminance,
  ruleMatches,
  shortInstanceLabel,
  toDevtoolsValue,
  toJsonText,
  valueKind,
  verdictFor,
  visibleNodes
};
//# sourceMappingURL=devtools.js.map
