"use strict";
Object.defineProperties(exports, { __esModule: { value: true }, [Symbol.toStringTag]: { value: "Module" } });
const IDENTIFIER_START = /[$A-Z_a-z]/u;
const IDENTIFIER_CHAR = /[\w$]/u;
const WHITESPACE_CHAR = /\s/u;
const DIGIT_CHAR = /\d/u;
const HEX_DIGIT_CHAR = /[\da-f]/iu;
const RESERVED_KEYWORD_WORDS = /* @__PURE__ */ new Set([
  "function",
  "import",
  "export",
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
  "void"
]);
function skipRadixNumberLiteral(source, index) {
  let cursor = index + 2;
  while (cursor < source.length) {
    const next = source[cursor] ?? "";
    if (HEX_DIGIT_CHAR.test(next)) {
      cursor += 1;
      continue;
    }
    if (next === "_" && HEX_DIGIT_CHAR.test(source[cursor + 1] ?? "")) {
      cursor += 1;
      continue;
    }
    break;
  }
  return cursor;
}
function tryConsumeExponentMarker(source, index) {
  const next = source[index] ?? "";
  if (next !== "e" && next !== "E") {
    return void 0;
  }
  const afterE = source[index + 1] ?? "";
  const afterSign = afterE === "+" || afterE === "-" ? source[index + 2] ?? "" : afterE;
  if (!DIGIT_CHAR.test(afterSign)) {
    return void 0;
  }
  let cursor = index + 1;
  if (source[cursor] === "+" || source[cursor] === "-") {
    cursor += 1;
  }
  return cursor;
}
function skipDecimalNumberLiteral(source, index) {
  let cursor = index;
  let sawDot = false;
  let sawExponent = false;
  while (cursor < source.length) {
    const next = source[cursor] ?? "";
    if (DIGIT_CHAR.test(next)) {
      cursor += 1;
      continue;
    }
    if (next === "_" && DIGIT_CHAR.test(source[cursor + 1] ?? "")) {
      cursor += 1;
      continue;
    }
    if (next === "." && !sawDot && !sawExponent && DIGIT_CHAR.test(source[cursor + 1] ?? "")) {
      sawDot = true;
      cursor += 1;
      continue;
    }
    const afterExponent = sawExponent ? void 0 : tryConsumeExponentMarker(source, cursor);
    if (afterExponent !== void 0) {
      sawExponent = true;
      cursor = afterExponent;
      continue;
    }
    break;
  }
  return cursor;
}
function skipNumberLiteral(source, index) {
  const radixMark = source[index + 1];
  if (source[index] === "0" && ["x", "X", "b", "B", "o", "O"].includes(radixMark ?? "")) {
    return skipRadixNumberLiteral(source, index);
  }
  return skipDecimalNumberLiteral(source, index);
}
function trySkipRegexLiteral(source, index) {
  let cursor = index + 1;
  let inClass = false;
  while (cursor < source.length) {
    const char = source[cursor];
    if (char === "\n") {
      return void 0;
    }
    if (char === "\\") {
      cursor += 1;
      const escaped = source[cursor];
      if (escaped !== void 0 && escaped !== "\n") {
        cursor += 1;
      }
      continue;
    }
    if (char === "[") {
      inClass = true;
      cursor += 1;
      continue;
    }
    if (char === "]") {
      inClass = false;
      cursor += 1;
      continue;
    }
    if (char === "/" && !inClass) {
      cursor += 1;
      while (cursor < source.length && /[a-z]/iu.test(source[cursor] ?? "")) {
        cursor += 1;
      }
      return cursor;
    }
    cursor += 1;
  }
  return void 0;
}
function tryHandleBracketOrBrace(char, braceDepth) {
  if (char === "{" || char === "}") {
    return { braceDepth: braceDepth + (char === "{" ? 1 : -1), regexAllowed: char === "{" };
  }
  if (char === "(" || char === "[") {
    return { braceDepth, regexAllowed: true };
  }
  if (char === ")" || char === "]") {
    return { braceDepth, regexAllowed: false };
  }
  return void 0;
}
function handleSlash(source, index, regexAllowed) {
  const skippedRegex = regexAllowed ? trySkipRegexLiteral(source, index) : void 0;
  if (skippedRegex !== void 0) {
    return { index: skippedRegex, regexAllowed: false };
  }
  return { index: index + 1, regexAllowed: true };
}
function readIdentifierWord(source, index) {
  let end = index;
  while (end < source.length && IDENTIFIER_CHAR.test(source[end] ?? "")) {
    end += 1;
  }
  return { word: source.slice(index, end), end };
}
function skipWhitespace(source, index) {
  let cursor = index;
  while (cursor < source.length && WHITESPACE_CHAR.test(source[cursor] ?? "")) {
    cursor += 1;
  }
  return cursor;
}
function classifyExportTail(source, afterExportKeyword) {
  const afterLeadingWhitespace = skipWhitespace(source, afterExportKeyword);
  const nextChar = source[afterLeadingWhitespace];
  if (nextChar === void 0 || !IDENTIFIER_START.test(nextChar)) {
    return void 0;
  }
  const { end: afterWord } = readIdentifierWord(source, afterLeadingWhitespace);
  const afterWordWhitespace = skipWhitespace(source, afterWord);
  if (source[afterWordWhitespace] !== "=") {
    return void 0;
  }
  const afterEquals = source[afterWordWhitespace + 1];
  if (afterEquals === "=" || afterEquals === ">") {
    return void 0;
  }
  return afterLeadingWhitespace;
}
function findBareExportInsertions(source) {
  const insertions = [];
  const skipQuoted = (start, quote) => {
    let index = start + 1;
    while (index < source.length && source[index] !== quote) {
      index += source[index] === "\\" ? 2 : 1;
    }
    return index + 1;
  };
  const trySkipStringLike = (index) => {
    const char = source[index];
    if (char === '"' || char === "'") {
      return skipQuoted(index, char);
    }
    if (char === "`") {
      return scanTemplate(index + 1);
    }
    return void 0;
  };
  const trySkipComment = (index) => {
    if (source[index] !== "/") {
      return void 0;
    }
    if (source[index + 1] === "/") {
      let cursor = index;
      while (cursor < source.length && source[cursor] !== "\n") {
        cursor += 1;
      }
      return cursor;
    }
    if (source[index + 1] === "*") {
      const closeIndex = source.indexOf("*/", index + 2);
      return closeIndex === -1 ? source.length : closeIndex + 2;
    }
    return void 0;
  };
  const isExportKeywordAt = (index) => {
    if (source.slice(index, index + 6) !== "export") {
      return false;
    }
    const precedingChar = index === 0 ? void 0 : source[index - 1];
    if (precedingChar !== void 0 && IDENTIFIER_CHAR.test(precedingChar)) {
      return false;
    }
    const followingChar = source[index + 6];
    return followingChar === void 0 || !IDENTIFIER_CHAR.test(followingChar);
  };
  const scanCode = (start, stopAtBrace) => {
    let index = start;
    let braceDepth = 0;
    let regexAllowed = true;
    while (index < source.length) {
      const char = source[index];
      if (stopAtBrace && char === "}" && braceDepth === 0) {
        return index + 1;
      }
      const bracketOutcome = tryHandleBracketOrBrace(char ?? "", braceDepth);
      if (bracketOutcome !== void 0) {
        braceDepth = bracketOutcome.braceDepth;
        regexAllowed = bracketOutcome.regexAllowed;
        index += 1;
        continue;
      }
      const skippedStringLike = trySkipStringLike(index);
      if (skippedStringLike !== void 0) {
        index = skippedStringLike;
        regexAllowed = false;
        continue;
      }
      const skippedComment = trySkipComment(index);
      if (skippedComment !== void 0) {
        index = skippedComment;
        continue;
      }
      if (char === "/") {
        const slashOutcome = handleSlash(source, index, regexAllowed);
        index = slashOutcome.index;
        regexAllowed = slashOutcome.regexAllowed;
        continue;
      }
      if (char === "\n") {
        regexAllowed = true;
        index += 1;
        continue;
      }
      if (WHITESPACE_CHAR.test(char ?? "")) {
        index += 1;
        continue;
      }
      if (DIGIT_CHAR.test(char ?? "")) {
        index = skipNumberLiteral(source, index);
        regexAllowed = false;
        continue;
      }
      if (char === "e" && isExportKeywordAt(index)) {
        const insertionOffset = classifyExportTail(source, index + 6);
        if (insertionOffset !== void 0) {
          insertions.push({ originalOffset: insertionOffset });
        }
        index += 6;
        regexAllowed = true;
        continue;
      }
      if (IDENTIFIER_START.test(char ?? "")) {
        const { word, end } = readIdentifierWord(source, index);
        index = end;
        regexAllowed = RESERVED_KEYWORD_WORDS.has(word);
        continue;
      }
      regexAllowed = true;
      index += 1;
    }
    return index;
  };
  const scanTemplate = (start) => {
    let index = start;
    while (index < source.length) {
      const char = source[index];
      if (char === "\\") {
        index += 2;
        continue;
      }
      if (char === "`") {
        return index + 1;
      }
      if (char === "$" && source[index + 1] === "{") {
        index = scanCode(index + 2, true);
        continue;
      }
      index += 1;
    }
    return index;
  };
  scanCode(0, false);
  return insertions;
}
function applyInsertions(source, insertions, insertedText) {
  let result = "";
  let cursor = 0;
  for (const insertion of insertions) {
    result += source.slice(cursor, insertion.originalOffset) + insertedText;
    cursor = insertion.originalOffset;
  }
  result += source.slice(cursor);
  return result;
}
function toOriginalOffset(insertions, transformedOffset) {
  let cumulativeInserted = 0;
  for (const insertion of insertions) {
    const transformedInsertionStart = insertion.originalOffset + cumulativeInserted;
    if (transformedOffset < transformedInsertionStart) {
      break;
    }
    const transformedInsertionEnd = transformedInsertionStart + insertion.insertedLength;
    if (transformedOffset < transformedInsertionEnd) {
      return insertion.originalOffset;
    }
    cumulativeInserted += insertion.insertedLength;
  }
  return transformedOffset - cumulativeInserted;
}
function rangeOverlapsInsertion(insertions, transformedStart, transformedEnd) {
  let cumulativeInserted = 0;
  for (const insertion of insertions) {
    const transformedInsertionStart = insertion.originalOffset + cumulativeInserted;
    const transformedInsertionEnd = transformedInsertionStart + insertion.insertedLength;
    if (transformedStart < transformedInsertionEnd && transformedEnd > transformedInsertionStart) {
      return true;
    }
    cumulativeInserted += insertion.insertedLength;
  }
  return false;
}
function computeLineStarts(text) {
  const lineStarts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n") {
      lineStarts.push(index + 1);
    }
  }
  return lineStarts;
}
function lineColumnToOffset(lineStarts, line, column) {
  const lineStart = lineStarts[line - 1] ?? 0;
  return lineStart + (column - 1);
}
function offsetToLineColumn(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if ((lineStarts[mid] ?? 0) <= offset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  const line = low + 1;
  const column = offset - (lineStarts[low] ?? 0) + 1;
  return { line, column };
}
const INSERTED_TEXT = "const ";
const fileStates = /* @__PURE__ */ new Map();
function remapPosition(state, line, column) {
  const transformedOffset = lineColumnToOffset(state.transformedLineStarts, line, column);
  const originalOffset = toOriginalOffset(state.insertions, transformedOffset);
  return offsetToLineColumn(state.originalLineStarts, originalOffset);
}
function remapMessage(state, message) {
  const { fix, ...rest } = message;
  const start = remapPosition(state, message.line, message.column);
  const remapped = {
    ...rest,
    line: start.line,
    column: start.column
  };
  if (message.endLine !== void 0 && message.endColumn !== void 0) {
    const end = remapPosition(state, message.endLine, message.endColumn);
    remapped.endLine = end.line;
    remapped.endColumn = end.column;
  }
  if (fix) {
    const [fixStart, fixEnd] = fix.range;
    if (!rangeOverlapsInsertion(state.insertions, fixStart, fixEnd)) {
      remapped.fix = {
        range: [
          toOriginalOffset(state.insertions, fixStart),
          toOriginalOffset(state.insertions, fixEnd)
        ],
        text: fix.text
      };
    }
  }
  return remapped;
}
const aktionProcessor = {
  meta: {
    name: "aktion-runtime/eslint",
    version: "0.1.0"
  },
  supportsAutofix: true,
  preprocess(text, filename) {
    const insertions = findBareExportInsertions(text).map(({ originalOffset }) => ({
      originalOffset,
      insertedLength: INSERTED_TEXT.length
    }));
    const transformedText = applyInsertions(text, insertions, INSERTED_TEXT);
    fileStates.set(filename, {
      insertions,
      originalLineStarts: computeLineStarts(text),
      transformedLineStarts: computeLineStarts(transformedText)
    });
    return [{ text: transformedText, filename: "eslint-aktion.ts" }];
  },
  postprocess(messagesPerBlock, filename) {
    const state = fileStates.get(filename);
    fileStates.delete(filename);
    const messages = messagesPerBlock.flat();
    if (!state) {
      return messages;
    }
    return messages.map((message) => remapMessage(state, message));
  }
};
const aktionRecommendedRules = {
  // FORMERLY A GRAMMAR INCOMPATIBILITY, KEPT OFF: `object-shorthand`'s autofix
  // rewrites a `key: function (…) { … }` handler into method shorthand
  // (`{ onClick() { … } }`). That used to be a parse error; since the parser
  // widening (2026-10-02) it parses to the same `Lambda` handler
  // (`tests/eslint-corpus-sweep.test.ts` pins the round trip). The override is
  // kept so existing `.aktion` corpora are not restyled by an upgrade; the
  // TypeScript preset below switches the rule on in `properties` mode instead,
  // which reports only `{ title: title }` — never a handler, in either form.
  "object-shorthand": "off",
  // GENUINE GRAMMAR INCOMPATIBILITY: `parseExportStatement` in
  // `src/parser/parser.ts` throws an explicit parse error on `export { … }`
  // ("`export { … }` lists are not supported yet") — there is no production
  // for a re-export list at all. `unicorn/prefer-export-from`'s autofix
  // CREATES exactly that construct from a plain same-file `import` plus
  // `export`.
  "unicorn/prefer-export-from": "off",
  // GENUINE GRAMMAR INCOMPATIBILITY: this repo's tokenizer/parser has no
  // tagged-template-literal production — a program is built from plain
  // string, template-literal, and identifier tokens, never a JS tagged-
  // template call form. `unicorn/prefer-string-raw`'s autofix rewrites a
  // backslash-bearing string literal into a tagged template
  // (`` String.raw`…` ``), which a real JS/TS parser accepts but this
  // grammar rejects with a "Tagged template literals are not supported"
  // parse error.
  "unicorn/prefer-string-raw": "off",
  // DSL-IDIOM FALSE POSITIVE: Aktion's component-instantiation idiom
  // (`Container(...)`, `Text(...)`, `Row(...)`, any entry in
  // `src/library`'s component catalogue) is a capitalized function call to a
  // JS/TS linter, but it is the DSL's NORMAL syntax for building the
  // component tree — there is no other way to write it. `new-cap` reads
  // every one of these as a constructor-vs-plain-call mistake.
  "new-cap": "off",
  // DSL-IDIOM FALSE POSITIVE, same root cause as `new-cap` above: the
  // component tree IS deeply nested calls (`Column([Row([Button(...), ...])])`
  // and deeper) — that is the normal SHAPE of an Aktion UI declaration, not a
  // cyclomatic-complexity problem `unicorn/max-nested-calls` is designed to
  // catch.
  "unicorn/max-nested-calls": "off",
  // DSL-IDIOM FALSE POSITIVE: `route` (no `$` prefix) is a screen-scope
  // global the RUNTIME injects directly into evaluation scope — see
  // `src/runtime/evaluator.ts`'s `ctx.trackedState.add("route")` — the same
  // class of binding as `$router`, just without the sigil, documented as
  // `route.path` / `route.params` / `route.query` / `route.navigate(...)`
  // (`docs/routing.html`). It is never declared via `let`/`const`/`import`
  // in any Aktion source, which is exactly what makes typescript-eslint call
  // it "undeclared" the moment it's accessed through an optional chain
  // (`route.params?.id`) — the rule has no way to know the runtime injects
  // it.
  "unicorn/no-optional-chaining-on-undeclared-variable": "off",
  // DSL-IDIOM FALSE POSITIVE: registering a reactive primitive
  // (`$effect(() => {...}, [...])`, `$store(...)`, `pages = $router({...})`)
  // via a bare call at MODULE TOP LEVEL is how this DSL wires up its
  // reactive/effect system — there is no other call site for it. Real-corpus
  // precedent: dozens of `docs/demos/**/*.aktion` files register a top-level
  // `$effect(...)` this same way (see `tests/eslint-corpus-sweep.test.ts`
  // for the measured count).
  "unicorn/no-top-level-side-effects": "off",
  // GENUINE GRAMMAR INCOMPATIBILITY, found by this package's own corpus
  // sweep (not carried over from the downstream pilot this rule set
  // originated from — see the module doc comment above): `parseStatementImpl`
  // in `src/parser/parser.ts` has no `BlockStatement` production at all — a
  // leading `{` in statement position falls through to
  // `parseExpressionStatement` → `parseExpression`, which parses it as an
  // OBJECT LITERAL, the grammar's only interpretation of a bare `{`.
  // `unicorn/switch-case-braces`'s autofix wraps a `case N: return X` body in
  // `case N: { return X }` — valid, unambiguous JS/TS (lexical block
  // scoping), but this grammar reads the injected `{` as the start of an
  // object literal expression and `return` inside it as a malformed object
  // key, producing a cascade of parse errors. Confirmed real-world trigger:
  // `docs/demos/blocks/signup-wizard.aktion` and
  // `docs/demos/blocks/profile-header.aktion`, the only two files in this
  // corpus with a `case N: return …` shaped switch statement.
  "unicorn/switch-case-braces": "off",
  // GENUINE GRAMMAR INCOMPATIBILITY, same root cause as
  // `unicorn/switch-case-braces` above: `unicorn/prefer-switch`'s autofix
  // turns an `if (x === "a") … else if (x === "b") … else if …` chain of three
  // or more branches into a `switch`, and keeps every block consequent
  // braced, so a branch that declares something becomes
  // `case "ok": { const label = …; return … }` — measured: `parse()` rejects
  // the output with `Expected Punctuation ":" but got Identifier "label"`.
  "unicorn/prefer-switch": "off",
  // DSL-IDIOM FALSE POSITIVE: an action that writes a module-level atom
  // (`export $draft = ""` … `export function addTodo() { $draft = "" }`) is how
  // Aktion state changes — assigning a `$` atom is what re-renders, and an
  // action or event handler is where that assignment happens.
  // `unicorn/no-top-level-assignment-in-function` reports every such write
  // (measured: 18 times across `create-aktion/template/todos-app` and
  // `chatbot`'s `store.aktion`).
  "unicorn/no-top-level-assignment-in-function": "off"
};
const aktionTypeScriptRules = {
  // SWITCHED ON, a style choice rather than a guard: `properties` mode reports
  // (and fixes) only `{ title: title }` → `{ title }`, which the JS-semantics
  // layer keeps working after renaming locals (W1). It checks no handler —
  // neither method shorthand (`{ onClick() { … } }`, which parses to the same
  // handler since the parser widening) nor `onClick: function () { … }`
  // (measured).
  "object-shorthand": ["error", "properties"],
  // GENUINE GRAMMAR INCOMPATIBILITY, reconfigured rather than off: a braced
  // case body parses as an object literal (no `BlockStatement` production, see
  // above), so unicorn's default `always` corrupts every switch it fixes, while
  // `avoid` only ever REMOVES braces. It does not report braces around a body
  // that declares something (`case 1: { const y = x … }`), which still fails
  // to parse — so `unicorn/prefer-switch`, whose fix writes such bodies, is
  // off below.
  "unicorn/switch-case-braces": ["error", "avoid"],
  // GENUINE GRAMMAR INCOMPATIBILITY: the fix creates an `export { … } from …`
  // list, which `parseExportStatement` rejects (see above).
  "unicorn/prefer-export-from": "off",
  // GENUINE GRAMMAR INCOMPATIBILITY: the fix creates a tagged template
  // (`` String.raw`…` ``), which the parser rejects (see above).
  "unicorn/prefer-string-raw": "off",
  // SEMANTIC DIVERGENCE: the fix turns `const count = cart.count` into
  // `const { count } = cart`, and destructuring a `$store`/`$form` handle reads
  // nothing (measured: `null`) where the member access reads the field.
  "prefer-destructuring": "off",
  // DSL-IDIOM FALSE POSITIVE: the premise (build the Set once, look up many
  // times) does not hold — a module-level binding re-seeds from its
  // initialiser on every render (`resetMutableBindings`), so the Set is rebuilt
  // as often as the array it replaces.
  "unicorn/prefer-set-has": "off",
  // SEMANTIC DIVERGENCE: the fix hoists a nested block's statements to the
  // function body, and a `$x = …` at the top level of a component body
  // declares per-instance state initialised ONCE (`evaluateUserComponent`),
  // where the same statement inside a block assigns on every render.
  "unicorn/prefer-early-return": "off",
  // SEMANTIC DIVERGENCE: the fix swaps `window` for `globalThis`; both resolve
  // through the host-global passthrough, but an explicit access policy
  // (`setGlobalAccessPolicy(["window", …])`) admits only the names it lists,
  // so the rewrite can turn a permitted read into a blocked one.
  "unicorn/prefer-global-this": "off",
  // CROSS-MODULE RENAME: exported names are only reported, but the fix renames
  // an exported component's PARAMETERS (measured: `export function Row(btn)`
  // → `Row(button)`), and parameter names are a component's named-argument
  // API — a caller's `Row({ btn: x })` binds by parameter name
  // (`invokeComponentDecl`).
  "unicorn/name-replacements": "off",
  // GENUINE GRAMMAR INCOMPATIBILITY: the fix prefixes the whole name, so
  // `let $open = false` becomes `let is$open = false` (measured), which the
  // lexer reads as `is` followed by the atom `$open` — a parse error.
  "unicorn/consistent-boolean-name": "off",
  // DSL-IDIOM FALSE POSITIVE: components are PascalCase calls without `new`
  // (`Button(…)`, see above).
  "new-cap": "off",
  // DSL-IDIOM FALSE POSITIVE: a component tree is nested calls by
  // construction (see above).
  "unicorn/max-nested-calls": "off",
  // DSL-IDIOM FALSE POSITIVE: `$app(…)` and `$effect(…)` are bare top-level
  // calls by design (see above).
  "unicorn/no-top-level-side-effects": "off",
  // GENUINE GRAMMAR INCOMPATIBILITY: the fix turns an if/else-if chain into a
  // `switch` whose braced case bodies parse as object literals; `avoid` above
  // does not remove the braces around a body that declares something (see
  // `aktionRecommendedRules`; measured on `.aktion.js`).
  "unicorn/prefer-switch": "off",
  // DSL-IDIOM FALSE POSITIVE: an exported action writing the module's own
  // atom is how state changes — and, an import being a read-only binding in
  // TypeScript (TS2632), the only way another module can change it (see
  // `aktionRecommendedRules`).
  "unicorn/no-top-level-assignment-in-function": "off",
  // DSL-IDIOM FALSE POSITIVE: exported state is `export let $count = 0`, a
  // `let` that importing modules write to.
  "import-x/no-mutable-exports": "off",
  // DSL-IDIOM FALSE POSITIVE: `$` state is declared with `let` and is often
  // written only through a two-way binding (`Input("Name", { value: $name })`)
  // or by an importing module — writes ESLint cannot see.
  "prefer-const": "off"
};
const components = [
  {
    name: "Accordion",
    slots: [
      "items",
      "showArrow",
      "type",
      "onChange"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange"
    }
  },
  {
    name: "AccordionItem",
    slots: [
      "title",
      "children",
      "open",
      "subtitle",
      "showArrow",
      "variant",
      "disabled",
      "onToggle"
    ],
    positional: 0,
    aliases: {
      child: "children",
      summary: "subtitle",
      tone: "variant",
      onOpenChange: "onToggle",
      ontoggle: "onToggle"
    }
  },
  {
    name: "ActionLink",
    slots: [
      "label",
      "onClick",
      "disabled",
      "icon",
      "iconPosition",
      "ariaLabel",
      "tone"
    ],
    positional: 0,
    aliases: {
      action: "onClick",
      onclick: "onClick",
      variant: "tone"
    }
  },
  {
    name: "ActionStripe",
    slots: [
      "label",
      "description",
      "icon",
      "value",
      "href",
      "disabled",
      "onClick",
      "trailing",
      "target"
    ],
    positional: 0,
    aliases: {
      subtitle: "description",
      meta: "description",
      action: "onClick",
      onclick: "onClick"
    }
  },
  {
    name: "ActivityLog",
    slots: [
      "items",
      "variant",
      "emptyLabel",
      "onItemClick",
      "loading",
      "loaderLabel"
    ],
    positional: 0,
    aliases: {
      tone: "variant"
    }
  },
  {
    name: "AppShell",
    slots: [
      "sidebar",
      "content",
      "topbar",
      "collapsible",
      "sidebarOpen",
      "onSidebarOpenChange"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "AspectRatio",
    slots: [
      "ratio",
      "children"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "Async",
    slots: [
      "resource",
      "loading",
      "error",
      "empty",
      "data",
      "retry"
    ],
    positional: 0,
    aliases: {
      onRetry: "retry"
    }
  },
  {
    name: "AudioPlayer",
    slots: [
      "src",
      "sources",
      "title",
      "artist",
      "controls",
      "autoplay",
      "loop",
      "icon",
      "muted",
      "onEnded"
    ],
    positional: 0,
    aliases: {
      onended: "onEnded"
    }
  },
  {
    name: "AuthorByline",
    slots: [
      "name",
      "avatar",
      "role",
      "date",
      "href",
      "readingTime"
    ],
    positional: 0,
    aliases: {
      src: "avatar"
    }
  },
  {
    name: "Avatar",
    slots: [
      "name",
      "src",
      "size",
      "status",
      "fallback"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "AvatarGroup",
    slots: [
      "items",
      "max",
      "size",
      "total",
      "fallback"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "BackToTop",
    slots: [
      "label",
      "showAfter",
      "position"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Backdrop",
    slots: [
      "grid",
      "blobs",
      "particles",
      "type",
      "particleColors",
      "speed",
      "linkDistance",
      "particleSize",
      "fixed"
    ],
    positional: 0,
    aliases: {
      particleType: "type",
      colors: "particleColors"
    }
  },
  {
    name: "Badge",
    slots: [
      "label",
      "tone",
      "icon",
      "size"
    ],
    positional: 0,
    aliases: {
      variant: "tone"
    }
  },
  {
    name: "BadgeList",
    slots: [
      "labels",
      "tone",
      "size",
      "tones",
      "icons",
      "max"
    ],
    positional: 0,
    aliases: {
      variant: "tone",
      variants: "tones"
    }
  },
  {
    name: "Banner",
    slots: [
      "title",
      "message",
      "action",
      "icon",
      "tone",
      "dismissible",
      "onDismiss",
      "href",
      "onClick"
    ],
    positional: 0,
    aliases: {
      description: "message",
      variant: "tone",
      closable: "dismissible",
      onClose: "onDismiss",
      onclick: "onClick"
    }
  },
  {
    name: "BarChart",
    slots: [
      "labels",
      "series",
      "title",
      "stacked",
      "horizontal",
      "xAxisLabel",
      "yAxisLabel",
      "showLegend",
      "height",
      "loading",
      "emptyText",
      "onBarClick",
      "ariaLabel",
      "decorative"
    ],
    positional: 0,
    aliases: {
      alt: "ariaLabel"
    }
  },
  {
    name: "Bento",
    slots: [
      "items",
      "columns",
      "gap",
      "rowHeight",
      "dense"
    ],
    positional: 0,
    aliases: {
      children: "items",
      cells: "items"
    }
  },
  {
    name: "BentoCell",
    slots: [
      "child",
      "span",
      "rowSpan"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "BottomSheet",
    slots: [
      "children",
      "open",
      "title",
      "onClose",
      "label",
      "height",
      "showClose",
      "footer"
    ],
    positional: 0,
    aliases: {
      child: "children",
      content: "children",
      onclose: "onClose"
    }
  },
  {
    name: "Box",
    slots: [
      "children",
      "padding",
      "margin",
      "border",
      "background",
      "maxWidth",
      "radius"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "Brand",
    slots: [
      "name",
      "logoSrc",
      "version",
      "href"
    ],
    positional: 0,
    aliases: {
      label: "name",
      logo: "logoSrc"
    }
  },
  {
    name: "Breadcrumb",
    slots: [
      "items",
      "separator",
      "maxItems",
      "onItemClick",
      "homeIcon",
      "autoLink"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "BreadcrumbItem",
    slots: [
      "label",
      "href",
      "icon",
      "to",
      "onClick"
    ],
    positional: 0,
    aliases: {
      onclick: "onClick"
    }
  },
  {
    name: "BrowserFrame",
    slots: [
      "child",
      "url",
      "height",
      "clip"
    ],
    positional: 0,
    aliases: {
      children: "child",
      content: "child"
    }
  },
  {
    name: "Button",
    slots: [
      "label",
      "onClick",
      "variant",
      "type",
      "size",
      "icon",
      "iconPosition",
      "iconOnly",
      "loading",
      "fullWidth",
      "disabled",
      "href"
    ],
    positional: 0,
    aliases: {
      action: "onClick",
      onclick: "onClick",
      tone: "variant"
    }
  },
  {
    name: "ButtonGroup",
    slots: [
      "items",
      "size",
      "fullWidth",
      "ariaLabel",
      "ariaLabelledBy"
    ],
    positional: 0,
    aliases: {
      full: "fullWidth",
      label: "ariaLabel"
    }
  },
  {
    name: "Buttons",
    slots: [
      "items",
      "direction"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Calendar",
    slots: [
      "month",
      "year",
      "selected",
      "onSelect",
      "events",
      "firstDay",
      "navigable",
      "onNavigate",
      "minDate",
      "maxDate",
      "disabledDates",
      "onEventClick",
      "locale",
      "weekdayLabels",
      "monthLabels"
    ],
    positional: 0,
    aliases: {
      blackoutDates: "disabledDates"
    }
  },
  {
    name: "CalendarView",
    slots: [
      "value",
      "month",
      "events",
      "view",
      "firstDay",
      "onSelect",
      "onMonthChange",
      "onEventClick",
      "maxEventsPerDay",
      "min",
      "max",
      "disabledDates",
      "hideNav"
    ],
    positional: 0,
    aliases: {
      onNavigate: "onMonthChange"
    }
  },
  {
    name: "Callout",
    slots: [
      "tone",
      "title",
      "description",
      "icon",
      "compact",
      "actions",
      "hideIcon",
      "live",
      "dismissible",
      "onDismiss"
    ],
    positional: 1,
    aliases: {
      variant: "tone",
      text: "description",
      footer: "actions",
      noIcon: "hideIcon",
      closable: "dismissible",
      onClose: "onDismiss"
    }
  },
  {
    name: "Card",
    slots: [
      "children",
      "variant",
      "padding",
      "onClick",
      "href"
    ],
    positional: 0,
    aliases: {
      child: "children",
      tone: "variant",
      onclick: "onClick"
    }
  },
  {
    name: "CardFooter",
    slots: [
      "children",
      "justify"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "CardHeader",
    slots: [
      "title",
      "subtitle",
      "eyebrow",
      "actions",
      "level"
    ],
    positional: 0,
    aliases: {
      preheadline: "eyebrow",
      kicker: "eyebrow"
    }
  },
  {
    name: "CardSection",
    slots: [
      "children",
      "tone",
      "align"
    ],
    positional: 0,
    aliases: {
      child: "children",
      variant: "tone",
      status: "tone"
    }
  },
  {
    name: "Carousel",
    slots: [
      "items",
      "activeIndex",
      "ratio",
      "showDots",
      "showArrows",
      "onChange",
      "autoplay",
      "interval",
      "label",
      "empty",
      "emptyText"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange"
    }
  },
  {
    name: "Cart",
    slots: [
      "items",
      "onQty",
      "onRemove",
      "currency",
      "footer",
      "disabled",
      "loading",
      "error"
    ],
    positional: 0,
    aliases: {
      busy: "disabled"
    }
  },
  {
    name: "Center",
    slots: [
      "children",
      "axis",
      "minHeight",
      "gap",
      "padding",
      "inline"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "ChatBubble",
    slots: [
      "author",
      "body",
      "time",
      "avatarSrc",
      "from",
      "status",
      "content",
      "onRetry"
    ],
    positional: 0,
    aliases: {
      text: "body",
      message: "body",
      src: "avatarSrc",
      role: "from",
      children: "content"
    }
  },
  {
    name: "CheckBoxGroup",
    slots: [
      "name",
      "items",
      "value",
      "onChange",
      "label",
      "hint",
      "error",
      "required",
      "disabled",
      "labelHidden",
      "warning",
      "description",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "CheckBoxItem",
    slots: [
      "label",
      "name",
      "description",
      "defaultChecked",
      "disabled",
      "value"
    ],
    positional: 0,
    aliases: {
      checked: "defaultChecked"
    }
  },
  {
    name: "Checkbox",
    slots: [
      "id",
      "label",
      "value",
      "onChange",
      "disabled",
      "description",
      "required",
      "error",
      "hint",
      "indeterminate",
      "labelHidden",
      "warning",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      checked: "value",
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "CodeBlock",
    slots: [
      "language",
      "codeString",
      "showLineNumbers",
      "highlightLines",
      "highlight",
      "copy",
      "header",
      "width",
      "height",
      "filename",
      "wrap"
    ],
    positional: 1,
    aliases: {
      code: "codeString",
      title: "filename"
    }
  },
  {
    name: "CodeEditor",
    slots: [
      "id",
      "value",
      "language",
      "placeholder",
      "minHeight",
      "tabSize",
      "showGutter",
      "readonly",
      "onChange",
      "maxHeight",
      "filename",
      "copyable",
      "onSave",
      "name",
      "disabled",
      "label",
      "hint",
      "error",
      "required",
      "warning",
      "description",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      helperText: "hint",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "CodeWindow",
    slots: [
      "code",
      "file",
      "language",
      "status",
      "preview",
      "copy",
      "height",
      "maxHeight",
      "showLineNumbers",
      "highlightLines"
    ],
    positional: 0,
    aliases: {
      codeString: "code"
    }
  },
  {
    name: "Col",
    slots: [
      "header",
      "values",
      "format",
      "align",
      "sortable",
      "filterable",
      "render",
      "onClick",
      "currency",
      "width",
      "wrap",
      "headerTooltip",
      "locale",
      "initiallyHidden",
      "pinned",
      "resizable",
      "minWidth",
      "maxWidth",
      "headerHidden"
    ],
    positional: 0,
    aliases: {
      cell: "render",
      onclick: "onClick",
      cellClick: "onClick",
      hint: "headerTooltip",
      colHidden: "initiallyHidden"
    }
  },
  {
    name: "ColorPicker",
    slots: [
      "id",
      "value",
      "label",
      "swatches",
      "disabled",
      "onChange",
      "format",
      "allowAlpha",
      "showInput",
      "showSwatches",
      "name",
      "hint",
      "error",
      "required",
      "warning",
      "description",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      helperText: "hint",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "Column",
    slots: [
      "children",
      "gap",
      "align",
      "justify",
      "wrap",
      "reverse",
      "padding",
      "inline",
      "alignContent"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "Combobox",
    slots: [
      "id",
      "items",
      "value",
      "placeholder",
      "emptyLabel",
      "disabled",
      "open",
      "onOpenChange",
      "onChange",
      "label",
      "hint",
      "error",
      "required",
      "loading",
      "onSearch",
      "clearable",
      "onBlur",
      "onFocus",
      "creatable",
      "labelHidden",
      "warning",
      "description",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      onopenchange: "onOpenChange",
      onchange: "onChange",
      onblur: "onBlur",
      onfocus: "onFocus",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "CommandPalette",
    slots: [
      "items",
      "open",
      "placeholder",
      "shortcut",
      "onSelect",
      "onClose",
      "loading",
      "emptyLabel",
      "label",
      "maxResults"
    ],
    positional: 0,
    aliases: {
      onOpenChange: "onClose"
    }
  },
  {
    name: "Comment",
    slots: [
      "author",
      "body",
      "time",
      "avatarSrc",
      "actions"
    ],
    positional: 0,
    aliases: {
      text: "body",
      message: "body",
      src: "avatarSrc"
    }
  },
  {
    name: "ComparisonTable",
    slots: [
      "columns",
      "rows",
      "highlightColumn",
      "featureLabel",
      "caption",
      "stickyFirstColumn",
      "ariaLabel"
    ],
    positional: 0,
    aliases: {
      arialabel: "ariaLabel"
    }
  },
  {
    name: "Confetti",
    slots: [
      "fire",
      "count",
      "colors",
      "duration",
      "onDone"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "ConfirmDialog",
    slots: [
      "title",
      "open",
      "message",
      "confirmLabel",
      "cancelLabel",
      "tone",
      "onConfirm",
      "onCancel",
      "loading",
      "confirmDisabled",
      "icon",
      "confirmFirst"
    ],
    positional: 0,
    aliases: {
      body: "message",
      variant: "tone"
    }
  },
  {
    name: "Container",
    slots: [
      "children",
      "size",
      "maxWidth",
      "padding"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "ContextMenu",
    slots: [
      "target",
      "items",
      "label",
      "trigger",
      "disabled",
      "placement",
      "offset",
      "open",
      "onOpenChange"
    ],
    positional: 0,
    aliases: {
      side: "placement"
    }
  },
  {
    name: "CopyButton",
    slots: [
      "text",
      "label",
      "copiedLabel",
      "iconOnly"
    ],
    positional: 0,
    aliases: {
      value: "text",
      variant: "iconOnly"
    }
  },
  {
    name: "CountUp",
    slots: [
      "value",
      "suffix",
      "prefix",
      "duration",
      "decimals"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "CountdownTimer",
    slots: [
      "to",
      "endLabel",
      "onEnd",
      "units",
      "showDays"
    ],
    positional: 0,
    aliases: {
      target: "to",
      date: "to",
      onFinish: "onEnd",
      onComplete: "onEnd"
    }
  },
  {
    name: "Css",
    slots: [
      "child",
      "style",
      "class"
    ],
    positional: 0,
    aliases: {
      children: "child",
      className: "class",
      classes: "class"
    }
  },
  {
    name: "DataGrid",
    slots: [
      "columns",
      "rowIds",
      "caption",
      "sort",
      "selectedIds",
      "selectable",
      "page",
      "perPage",
      "emptyLabel",
      "onRowClick",
      "toolbar",
      "density",
      "striped",
      "stickyHeader",
      "stickyFirstColumn",
      "exportable",
      "exportFilename",
      "loading",
      "error",
      "loadingLabel",
      "maxHeight",
      "allowOverflow",
      "onSort",
      "onSelectionChange",
      "perPageOptions",
      "onPerPageChange",
      "persistKey",
      "resizable",
      "columnMenu",
      "globalSearch",
      "onGlobalSearch",
      "wrapCells",
      "rowNumbers",
      "highlightOnHover",
      "scrollArrows",
      "columnMenuOpen",
      "onColumnMenuOpenChange",
      "columnMenuButton",
      "columnMenuAnchor",
      "columnMenuTitle",
      "columnMenuDescription",
      "columnMenuResetLabel",
      "ariaLabel"
    ],
    positional: 0,
    aliases: {
      rowAction: "onRowClick",
      oncolumnmenuopenchange: "onColumnMenuOpenChange",
      arialabel: "ariaLabel"
    }
  },
  {
    name: "DatePicker",
    slots: [
      "id",
      "value",
      "label",
      "min",
      "max",
      "placeholder",
      "disabled",
      "onChange",
      "hint",
      "error",
      "required",
      "onBlur",
      "onFocus",
      "locale",
      "warning",
      "description",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      onblur: "onBlur",
      onfocus: "onFocus",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "DateRangePicker",
    slots: [
      "id",
      "from",
      "to",
      "label",
      "min",
      "max",
      "disabled",
      "onChange",
      "hint",
      "error",
      "required",
      "onBlur",
      "onFocus",
      "locale",
      "warning",
      "description",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      onblur: "onBlur",
      onfocus: "onFocus",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "DateTimePicker",
    slots: [
      "id",
      "value",
      "min",
      "max",
      "step",
      "onChange",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus"
    }
  },
  {
    name: "DescriptionItem",
    slots: [
      "label",
      "value",
      "icon"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "DescriptionList",
    slots: [
      "items",
      "columns"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "DiffViewer",
    slots: [
      "left",
      "right",
      "mode",
      "leftTitle",
      "rightTitle",
      "lineNumbers",
      "contextLines",
      "maxHeight"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Display",
    slots: [
      "content",
      "size",
      "align",
      "balance",
      "weight"
    ],
    positional: 0,
    aliases: {
      children: "content",
      title: "content"
    }
  },
  {
    name: "Draggable",
    slots: [
      "child",
      "data",
      "type",
      "disabled",
      "ariaLabel",
      "onDragStart",
      "onDragEnd"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "Drawer",
    slots: [
      "title",
      "open",
      "children",
      "side",
      "footer",
      "onClose",
      "width",
      "closeOnBackdrop"
    ],
    positional: 0,
    aliases: {
      child: "children",
      onclose: "onClose",
      size: "width"
    }
  },
  {
    name: "DrawingCanvas",
    slots: [
      "width",
      "height",
      "color",
      "lineWidth",
      "background",
      "clearable",
      "value",
      "onChange",
      "onEnd",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden",
      "ariaLabel"
    ],
    positional: 0,
    aliases: {
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus",
      arialabel: "ariaLabel"
    }
  },
  {
    name: "DropZone",
    slots: [
      "child",
      "onDrop",
      "label",
      "accept",
      "disabled",
      "ariaLabel"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "DropdownMenu",
    slots: [
      "trigger",
      "items",
      "side",
      "align",
      "label",
      "open",
      "onOpenChange",
      "disabled"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "EmptyState",
    slots: [
      "title",
      "description",
      "icon",
      "illustration",
      "action",
      "actions"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "ErrorBoundary",
    slots: [
      "fallback",
      "onError",
      "showDetails",
      "onRetry",
      "children"
    ],
    positional: 4,
    aliases: {
      child: "children"
    }
  },
  {
    name: "ErrorState",
    slots: [
      "title",
      "description",
      "actions",
      "icon"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Eyebrow",
    slots: [
      "text"
    ],
    positional: 0,
    aliases: {
      label: "text",
      children: "text"
    }
  },
  {
    name: "FeatureGrid",
    slots: [
      "items",
      "columns"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "FeatureItem",
    slots: [
      "title",
      "description",
      "icon",
      "tone",
      "href",
      "onClick"
    ],
    positional: 0,
    aliases: {
      variant: "tone",
      action: "onClick",
      onclick: "onClick"
    }
  },
  {
    name: "FieldRepeater",
    slots: [
      "items",
      "fields",
      "onAdd",
      "onRemove",
      "addLabel",
      "onChange",
      "removeLabel",
      "min",
      "max"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "FieldSet",
    slots: [
      "legend",
      "children",
      "helper",
      "disabled",
      "error",
      "required"
    ],
    positional: 0,
    aliases: {
      title: "legend",
      label: "legend",
      child: "children",
      fields: "children",
      hint: "helper",
      description: "helper"
    }
  },
  {
    name: "FileUpload",
    slots: [
      "id",
      "label",
      "hint",
      "accept",
      "multiple",
      "onSelect",
      "icon",
      "disabled",
      "maxSize",
      "error",
      "progress",
      "onRemove"
    ],
    positional: 0,
    aliases: {
      action: "onSelect",
      onChange: "onSelect"
    }
  },
  {
    name: "FilterChips",
    slots: [
      "chips",
      "onRemove",
      "onClear",
      "clearLabel",
      "max",
      "disabled"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "FilterPill",
    slots: [
      "label",
      "active",
      "count",
      "icon",
      "disabled",
      "onToggle"
    ],
    positional: 0,
    aliases: {
      selected: "active",
      pressed: "active",
      onClick: "onToggle",
      action: "onToggle"
    }
  },
  {
    name: "FlipList",
    slots: [
      "children",
      "duration",
      "horizontal"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "FloatingActionButton",
    slots: [
      "icon",
      "label",
      "onClick",
      "position",
      "extended",
      "disabled"
    ],
    positional: 0,
    aliases: {
      action: "onClick",
      onclick: "onClick"
    }
  },
  {
    name: "FocusTrap",
    slots: [
      "child",
      "active",
      "restoreFocus",
      "onEscape",
      "autoFocus"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "FollowUpBlock",
    slots: [
      "items",
      "title",
      "onSelect",
      "disabled",
      "layout"
    ],
    positional: 0,
    aliases: {
      columns: "layout"
    }
  },
  {
    name: "FollowUpItem",
    slots: [
      "label",
      "message"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Footer",
    slots: [
      "brand",
      "tagline",
      "columns",
      "legal",
      "social"
    ],
    positional: 0,
    aliases: {
      copyright: "legal"
    }
  },
  {
    name: "FooterColumn",
    slots: [
      "title",
      "links"
    ],
    positional: 0,
    aliases: {
      children: "links",
      items: "links"
    }
  },
  {
    name: "Form",
    slots: [
      "id",
      "buttons",
      "fields",
      "onSubmit",
      "error",
      "loading"
    ],
    positional: 0,
    aliases: {
      onsubmit: "onSubmit",
      submitting: "loading"
    }
  },
  {
    name: "FormControl",
    slots: [
      "label",
      "field",
      "hint",
      "error",
      "required",
      "for",
      "warning",
      "description",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      control: "field",
      htmlFor: "for",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "FormSection",
    slots: [
      "label",
      "children",
      "helper",
      "level"
    ],
    positional: 0,
    aliases: {
      title: "label",
      child: "children",
      fields: "children",
      description: "helper"
    }
  },
  {
    name: "Fragment",
    slots: [
      "children"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "Gallery",
    slots: [
      "items",
      "columns",
      "ratio",
      "onSelect",
      "fit",
      "label",
      "empty",
      "emptyText"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Gantt",
    slots: [
      "tasks",
      "startDate",
      "endDate",
      "axis",
      "ticks",
      "today",
      "onTaskClick"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Gauge",
    slots: [
      "value",
      "min",
      "max",
      "label",
      "tone",
      "size",
      "caption",
      "unit",
      "format",
      "thresholds",
      "showRange",
      "ariaLabel",
      "decorative"
    ],
    positional: 0,
    aliases: {
      variant: "tone",
      suffix: "unit",
      alt: "ariaLabel"
    }
  },
  {
    name: "GradientText",
    slots: [
      "text",
      "gradient"
    ],
    positional: 0,
    aliases: {
      children: "text",
      label: "text"
    }
  },
  {
    name: "Grid",
    slots: [
      "children",
      "columns",
      "gap",
      "rowGap",
      "columnGap",
      "minChildWidth",
      "alignItems",
      "justifyItems",
      "dense"
    ],
    positional: 0,
    aliases: {
      child: "children",
      minItemWidth: "minChildWidth"
    }
  },
  {
    name: "GridItem",
    slots: [
      "child",
      "span",
      "offset",
      "spanAt",
      "rowSpan"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "HTMLTag",
    slots: [
      "tag",
      "attributes",
      "children"
    ],
    positional: 0,
    aliases: {
      attrs: "attributes",
      props: "attributes",
      child: "children"
    }
  },
  {
    name: "Heading",
    slots: [
      "content",
      "level",
      "size",
      "align"
    ],
    positional: 0,
    aliases: {
      children: "content",
      title: "content"
    }
  },
  {
    name: "Heatmap",
    slots: [
      "xLabels",
      "yLabels",
      "values",
      "title",
      "tone",
      "showValues",
      "min",
      "max",
      "valueFormat",
      "emptyText",
      "onCellClick",
      "ariaLabel",
      "decorative"
    ],
    positional: 0,
    aliases: {
      variant: "tone",
      alt: "ariaLabel"
    }
  },
  {
    name: "Hero",
    slots: [
      "title",
      "subtitle",
      "primary",
      "secondary",
      "eyebrow",
      "highlights",
      "imageSrc",
      "caption",
      "height",
      "actions",
      "layout",
      "tone",
      "overlay",
      "align"
    ],
    positional: 0,
    aliases: {
      variant: "tone"
    }
  },
  {
    name: "Histogram",
    slots: [
      "values",
      "binCount",
      "bins",
      "title",
      "tone",
      "xLabel",
      "yLabel",
      "height",
      "emptyText",
      "loading",
      "onBinClick",
      "ariaLabel",
      "decorative"
    ],
    positional: 0,
    aliases: {
      variant: "tone",
      alt: "ariaLabel"
    }
  },
  {
    name: "HoverCard",
    slots: [
      "trigger",
      "content",
      "side",
      "open",
      "align",
      "width",
      "openDelay",
      "closeDelay",
      "label",
      "onOpenChange"
    ],
    positional: 0,
    aliases: {
      children: "content",
      placement: "side",
      ariaLabel: "label"
    }
  },
  {
    name: "Icon",
    slots: [
      "name",
      "variant",
      "size",
      "color",
      "label",
      "title"
    ],
    positional: 0,
    aliases: {
      tone: "variant",
      ariaLabel: "label",
      alt: "label"
    }
  },
  {
    name: "IconButton",
    slots: [
      "icon",
      "label",
      "onClick",
      "variant",
      "size",
      "disabled",
      "active",
      "loading",
      "type",
      "href"
    ],
    positional: 0,
    aliases: {
      action: "onClick",
      onclick: "onClick",
      tone: "variant",
      pressed: "active",
      selected: "active"
    }
  },
  {
    name: "Image",
    slots: [
      "src",
      "alt",
      "caption",
      "ratio",
      "fit",
      "fallback",
      "placeholder",
      "loading",
      "sizes",
      "srcset",
      "onClick"
    ],
    positional: 0,
    aliases: {
      srcSet: "srcset",
      onclick: "onClick",
      action: "onClick"
    }
  },
  {
    name: "InboxPanel",
    slots: [
      "items",
      "emptyLabel",
      "onMarkAllRead",
      "loading",
      "loadingLabel",
      "markAllLabel",
      "unreadLabel",
      "earlierLabel"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "InfiniteList",
    slots: [
      "items",
      "onLoadMore",
      "loading",
      "hasMore",
      "loaderLabel",
      "error",
      "onRetry",
      "emptyLabel",
      "rootMargin",
      "threshold",
      "retryLabel"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "InlineEdit",
    slots: [
      "value",
      "label",
      "onSave",
      "placeholder",
      "type",
      "onCancel",
      "disabled",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden"
    ],
    positional: 0,
    aliases: {
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus"
    }
  },
  {
    name: "Input",
    slots: [
      "id",
      "placeholder",
      "type",
      "validations",
      "value",
      "onChange",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden",
      "readOnly",
      "autocomplete",
      "maxLength"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus",
      readonly: "readOnly",
      autoComplete: "autocomplete",
      maxlength: "maxLength"
    }
  },
  {
    name: "InputGroup",
    slots: [
      "field",
      "icon",
      "leading",
      "action",
      "suffix",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden"
    ],
    positional: 0,
    aliases: {
      prefix: "leading",
      trailing: "action",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus"
    }
  },
  {
    name: "JsonTree",
    slots: [
      "data",
      "expanded",
      "expandedDepth",
      "maxHeight"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "KanbanBoard",
    slots: [
      "columns",
      "onCardMove",
      "draggable"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "KanbanCard",
    slots: [
      "title",
      "description",
      "tags",
      "assignee",
      "tone",
      "icon",
      "onClick"
    ],
    positional: 0,
    aliases: {
      variant: "tone",
      action: "onClick",
      onclick: "onClick"
    }
  },
  {
    name: "KanbanColumn",
    slots: [
      "title",
      "items",
      "tone",
      "actions",
      "limit"
    ],
    positional: 0,
    aliases: {
      cards: "items",
      variant: "tone"
    }
  },
  {
    name: "Kbd",
    slots: [
      "keys",
      "size"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "KbdShortcut",
    slots: [
      "keys",
      "size",
      "separator"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Lazy",
    slots: [
      "loader",
      "fallback",
      "children",
      "error",
      "onError",
      "retry"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "Lightbox",
    slots: [
      "items",
      "open",
      "index",
      "onClose",
      "showThumbnail"
    ],
    positional: 0,
    aliases: {
      onclose: "onClose"
    }
  },
  {
    name: "LineChart",
    slots: [
      "labels",
      "series",
      "data",
      "title",
      "filled",
      "stacked",
      "yMin",
      "yMax",
      "xAxisLabel",
      "yAxisLabel",
      "showLegend",
      "height",
      "loading",
      "emptyText",
      "onPointClick",
      "ariaLabel",
      "decorative"
    ],
    positional: 0,
    aliases: {
      alt: "ariaLabel"
    }
  },
  {
    name: "Link",
    slots: [
      "label",
      "to",
      "href",
      "external",
      "variant",
      "disabled",
      "onClick",
      "download"
    ],
    positional: 0,
    aliases: {
      child: "label",
      children: "label",
      tone: "variant",
      onclick: "onClick"
    }
  },
  {
    name: "List",
    slots: [
      "items",
      "ordered",
      "emptyLabel",
      "divided",
      "gap"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "ListBlock",
    slots: [
      "items",
      "ordered",
      "marker",
      "start"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "ListItem",
    slots: [
      "title",
      "description",
      "icon",
      "onClick",
      "href",
      "trailing",
      "active",
      "tone"
    ],
    positional: 0,
    aliases: {
      meta: "description",
      onclick: "onClick",
      action: "onClick",
      actions: "trailing",
      accessory: "trailing",
      selected: "active",
      variant: "tone"
    }
  },
  {
    name: "LiveCursor",
    slots: [
      "x",
      "y",
      "label",
      "color",
      "space",
      "smooth",
      "typing"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "LiveRegion",
    slots: [
      "text",
      "politeness",
      "visible"
    ],
    positional: 0,
    aliases: {
      children: "text"
    }
  },
  {
    name: "LoadingDots",
    slots: [
      "label",
      "size",
      "tone"
    ],
    positional: 0,
    aliases: {
      variant: "tone"
    }
  },
  {
    name: "LoadingState",
    slots: [
      "title",
      "description",
      "actions",
      "icon"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "LogoChip",
    slots: [
      "label",
      "icon",
      "imageSrc",
      "href"
    ],
    positional: 0,
    aliases: {
      logo: "imageSrc",
      image: "imageSrc",
      src: "imageSrc"
    }
  },
  {
    name: "LogoCloud",
    slots: [
      "items",
      "label"
    ],
    positional: 0,
    aliases: {
      children: "items",
      chips: "items"
    }
  },
  {
    name: "Lottie",
    slots: [
      "src",
      "data",
      "loop",
      "autoplay",
      "speed",
      "width",
      "height",
      "poster",
      "fallback",
      "label",
      "playing",
      "onComplete",
      "onError"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Map",
    slots: [
      "lat",
      "lng",
      "zoom",
      "markers",
      "height",
      "caption",
      "title"
    ],
    positional: 0,
    aliases: {
      locations: "markers"
    }
  },
  {
    name: "Markdown",
    slots: [
      "content",
      "linkTarget"
    ],
    positional: 0,
    aliases: {
      target: "linkTarget"
    }
  },
  {
    name: "MaskedInput",
    slots: [
      "id",
      "mask",
      "value",
      "placeholder",
      "unmasked",
      "inputMode",
      "onChange",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden"
    ],
    positional: 0,
    aliases: {
      rawValue: "unmasked",
      inputmode: "inputMode",
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus"
    }
  },
  {
    name: "MasonryGrid",
    slots: [
      "items",
      "columns",
      "gap"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "MediaCard",
    slots: [
      "title",
      "imageSrc",
      "description",
      "tags",
      "meta",
      "actions",
      "badge",
      "orientation",
      "ratio",
      "href",
      "onClick"
    ],
    positional: 0,
    aliases: {
      src: "imageSrc",
      image: "imageSrc",
      action: "onClick",
      onclick: "onClick"
    }
  },
  {
    name: "MentionInput",
    slots: [
      "id",
      "people",
      "value",
      "placeholder",
      "rows",
      "maxSuggestions",
      "mentionFormat",
      "loading",
      "onSearch",
      "onChange",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus"
    }
  },
  {
    name: "MenuItem",
    slots: [
      "label",
      "onClick",
      "icon",
      "shortcut",
      "variant",
      "disabled",
      "checked",
      "role",
      "keepOpen"
    ],
    positional: 0,
    aliases: {
      action: "onClick",
      onclick: "onClick",
      tone: "variant"
    }
  },
  {
    name: "MenuLabel",
    slots: [
      "label"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "MenuSeparator",
    slots: [],
    positional: -1,
    aliases: {}
  },
  {
    name: "Metric",
    slots: [
      "value",
      "label",
      "gradient",
      "countUp",
      "duration",
      "trend"
    ],
    positional: 0,
    aliases: {
      delta: "trend",
      change: "trend"
    }
  },
  {
    name: "MetricStrip",
    slots: [
      "items",
      "columns"
    ],
    positional: 0,
    aliases: {
      children: "items",
      metrics: "items"
    }
  },
  {
    name: "Modal",
    slots: [
      "title",
      "open",
      "children",
      "size",
      "footer",
      "closable",
      "closeOnBackdrop",
      "onClose",
      "onRequestClose",
      "lazy"
    ],
    positional: 0,
    aliases: {
      child: "children",
      onclose: "onClose"
    }
  },
  {
    name: "Mount",
    slots: [
      "setup",
      "update",
      "cleanup",
      "props",
      "tag",
      "deps",
      "onError"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "MultiSelect",
    slots: [
      "id",
      "items",
      "value",
      "placeholder",
      "emptyLabel",
      "max",
      "disabled",
      "open",
      "onOpenChange",
      "onChange",
      "label",
      "hint",
      "error",
      "required",
      "min",
      "onSearch",
      "loading",
      "creatable",
      "labelHidden",
      "warning",
      "description",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      onopenchange: "onOpenChange",
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "MultiStepForm",
    slots: [
      "steps",
      "current",
      "onSubmit",
      "prevLabel",
      "nextLabel",
      "submitLabel",
      "stepsLayout",
      "nextDisabled",
      "submitting",
      "onStepChange",
      "onStepClick",
      "clickableSteps",
      "showProgress",
      "hideFooter",
      "emptyText"
    ],
    positional: 0,
    aliases: {
      layout: "stepsLayout",
      stepsDirection: "stepsLayout"
    }
  },
  {
    name: "NavBar",
    slots: [
      "brand",
      "links",
      "actions",
      "sticky",
      "blur"
    ],
    positional: 0,
    aliases: {
      items: "links"
    }
  },
  {
    name: "NavLink",
    slots: [
      "label",
      "to",
      "variant",
      "exact",
      "icon",
      "prefetch",
      "disabled"
    ],
    positional: 0,
    aliases: {
      tone: "variant"
    }
  },
  {
    name: "Navbar",
    slots: [
      "brand",
      "items",
      "actions",
      "sticky",
      "variant",
      "collapsible"
    ],
    positional: 0,
    aliases: {
      links: "items",
      tone: "variant"
    }
  },
  {
    name: "NavbarItem",
    slots: [
      "label",
      "to",
      "href",
      "icon",
      "active",
      "onClick",
      "external",
      "disabled"
    ],
    positional: 0,
    aliases: {
      action: "onClick",
      onclick: "onClick"
    }
  },
  {
    name: "Notification",
    slots: [
      "title",
      "message",
      "time",
      "icon",
      "avatarSrc",
      "tone",
      "unread",
      "actions",
      "author",
      "onClick",
      "dismissible",
      "onDismiss"
    ],
    positional: 0,
    aliases: {
      description: "message",
      src: "avatarSrc",
      variant: "tone",
      actor: "author",
      action: "onClick",
      onclick: "onClick",
      closable: "dismissible",
      onClose: "onDismiss"
    }
  },
  {
    name: "NotificationBell",
    slots: [
      "count",
      "items",
      "onOpen",
      "onItemClick",
      "onMarkAllRead",
      "align",
      "loading",
      "emptyLabel",
      "label",
      "markAllLabel",
      "maxCount"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "NumberInput",
    slots: [
      "id",
      "value",
      "min",
      "max",
      "step",
      "placeholder",
      "onChange",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden",
      "prefix",
      "suffix",
      "precision",
      "readOnly",
      "onLimit"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus",
      readonly: "readOnly"
    }
  },
  {
    name: "OnClick",
    slots: [
      "child",
      "onClick",
      "disabled",
      "stopPropagation",
      "role",
      "keyboard"
    ],
    positional: 0,
    aliases: {
      children: "child",
      action: "onClick",
      onclick: "onClick"
    }
  },
  {
    name: "OnFocus",
    slots: [
      "child",
      "onFocus",
      "onBlur"
    ],
    positional: 0,
    aliases: {
      children: "child",
      onfocus: "onFocus",
      onblur: "onBlur"
    }
  },
  {
    name: "OnGesture",
    slots: [
      "child",
      "swipe",
      "longPress",
      "doubleTap",
      "pan",
      "onPanEnd",
      "threshold",
      "disabled",
      "ariaLabel"
    ],
    positional: 0,
    aliases: {
      children: "child",
      onSwipe: "swipe",
      onLongPress: "longPress",
      onDoubleTap: "doubleTap",
      onPan: "pan",
      panEnd: "onPanEnd",
      onRelease: "onPanEnd"
    }
  },
  {
    name: "OnIntersect",
    slots: [
      "child",
      "onEnter",
      "onLeave",
      "onChange",
      "threshold",
      "rootMargin",
      "root",
      "once",
      "disabled"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "OnKeyboard",
    slots: [
      "child",
      "onKeyDown",
      "onKeyUp",
      "onKeyPress",
      "focusable",
      "global"
    ],
    positional: 0,
    aliases: {
      children: "child",
      onkeydown: "onKeyDown",
      onkeyup: "onKeyUp",
      onkeypress: "onKeyPress"
    }
  },
  {
    name: "OnMount",
    slots: [
      "child",
      "onMount",
      "onUnmount",
      "deps"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "OnMouse",
    slots: [
      "child",
      "enter",
      "leave",
      "hover",
      "move",
      "down",
      "up",
      "click",
      "doubleClick",
      "contextMenu",
      "scroll",
      "wheel",
      "pointerDown",
      "pointerMove",
      "pointerUp",
      "drag",
      "drop",
      "dragStart",
      "dragEnd",
      "dragEnter",
      "dragLeave",
      "dragOver",
      "draggable",
      "passiveScroll"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "OnboardingChecklist",
    slots: [
      "items",
      "title",
      "subtitle",
      "onDismiss",
      "onComplete"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "OrderSummary",
    slots: [
      "items",
      "subtotal",
      "shipping",
      "tax",
      "total",
      "currency",
      "discount",
      "locale",
      "loading",
      "note",
      "empty"
    ],
    positional: 0,
    aliases: {
      lines: "items"
    }
  },
  {
    name: "Overlay",
    slots: [
      "base",
      "items"
    ],
    positional: 0,
    aliases: {
      overlays: "items"
    }
  },
  {
    name: "OverlayItem",
    slots: [
      "child",
      "anchor",
      "offset"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "PageHeader",
    slots: [
      "title",
      "subtitle",
      "breadcrumbs",
      "actions",
      "status",
      "onCrumbClick"
    ],
    positional: 0,
    aliases: {
      badge: "status"
    }
  },
  {
    name: "Pagination",
    slots: [
      "page",
      "totalPages",
      "siblings",
      "total",
      "perPage",
      "perPageOptions",
      "compact",
      "onChange",
      "disabled",
      "onPerPageChange"
    ],
    positional: 0,
    aliases: {
      pages: "totalPages",
      onPageChange: "onChange"
    }
  },
  {
    name: "Parallax",
    slots: [
      "child",
      "speed",
      "maxOffset"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "PasswordInput",
    slots: [
      "id",
      "value",
      "placeholder",
      "strengthMeter",
      "autocomplete",
      "onChange",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden"
    ],
    positional: 0,
    aliases: {
      showStrength: "strengthMeter",
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus"
    }
  },
  {
    name: "PersonChip",
    slots: [
      "name",
      "role",
      "avatarSrc",
      "size",
      "status",
      "onClick"
    ],
    positional: 0,
    aliases: {
      src: "avatarSrc",
      action: "onClick",
      onclick: "onClick"
    }
  },
  {
    name: "PieChart",
    slots: [
      "labels",
      "values",
      "title",
      "showValues",
      "valueFormat",
      "donut",
      "innerRadius",
      "size",
      "showLegend",
      "legendPosition",
      "loading",
      "emptyText",
      "onSliceClick",
      "ariaLabel",
      "decorative"
    ],
    positional: 0,
    aliases: {
      alt: "ariaLabel"
    }
  },
  {
    name: "Pill",
    slots: [
      "label",
      "tone",
      "icon"
    ],
    positional: 0,
    aliases: {
      variant: "tone",
      status: "tone"
    }
  },
  {
    name: "PinInput",
    slots: [
      "id",
      "length",
      "value",
      "type",
      "mask",
      "autoFocus",
      "onChange",
      "onComplete",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden"
    ],
    positional: 0,
    aliases: {
      autofocus: "autoFocus",
      onchange: "onChange",
      oncomplete: "onComplete",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus"
    }
  },
  {
    name: "Popover",
    slots: [
      "trigger",
      "content",
      "title",
      "side",
      "align",
      "width",
      "open",
      "onOpenChange",
      "showClose",
      "disabled"
    ],
    positional: 0,
    aliases: {
      children: "content",
      placement: "side"
    }
  },
  {
    name: "Portal",
    slots: [
      "target",
      "children"
    ],
    positional: 1,
    aliases: {
      child: "children"
    }
  },
  {
    name: "PresenceAvatars",
    slots: [
      "people",
      "max",
      "size",
      "onClick"
    ],
    positional: 0,
    aliases: {
      users: "people",
      children: "people",
      onPersonClick: "onClick",
      onclick: "onClick"
    }
  },
  {
    name: "PriceTag",
    slots: [
      "price",
      "compareAt",
      "currency",
      "size",
      "currencyPosition",
      "period"
    ],
    positional: 0,
    aliases: {
      was: "compareAt",
      original: "compareAt",
      suffix: "period",
      per: "period"
    }
  },
  {
    name: "PricingCard",
    slots: [
      "plan",
      "price",
      "period",
      "description",
      "features",
      "action",
      "badge",
      "featured",
      "ribbon"
    ],
    positional: 0,
    aliases: {
      cta: "action",
      highlighted: "featured",
      badgeLabel: "ribbon"
    }
  },
  {
    name: "PricingTable",
    slots: [
      "tiers",
      "columns"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "ProductCard",
    slots: [
      "title",
      "image",
      "price",
      "compareAt",
      "currency",
      "rating",
      "badge",
      "action",
      "onAdd",
      "href",
      "onClick",
      "reviewCount",
      "soldOut"
    ],
    positional: 0,
    aliases: {
      src: "image",
      onSelect: "onClick",
      onclick: "onClick",
      reviews: "reviewCount",
      disabled: "soldOut"
    }
  },
  {
    name: "ProfileCard",
    slots: [
      "name",
      "role",
      "avatarSrc",
      "bio",
      "tags",
      "actions"
    ],
    positional: 0,
    aliases: {
      src: "avatarSrc"
    }
  },
  {
    name: "Progress",
    slots: [
      "value",
      "max",
      "label",
      "tone",
      "indeterminate",
      "showValue",
      "segments",
      "buffered"
    ],
    positional: 0,
    aliases: {
      variant: "tone"
    }
  },
  {
    name: "ProgressRing",
    slots: [
      "value",
      "max",
      "label",
      "caption",
      "tone",
      "size",
      "indeterminate",
      "icon"
    ],
    positional: 0,
    aliases: {
      description: "caption",
      variant: "tone"
    }
  },
  {
    name: "Prose",
    slots: [
      "children",
      "size"
    ],
    positional: 0,
    aliases: {
      child: "children",
      content: "children"
    }
  },
  {
    name: "QRCode",
    slots: [
      "data",
      "size",
      "ecc",
      "color",
      "background",
      "margin",
      "label"
    ],
    positional: 0,
    aliases: {
      value: "data",
      text: "data",
      alt: "label"
    }
  },
  {
    name: "QuantityStepper",
    slots: [
      "value",
      "min",
      "max",
      "step",
      "onChange",
      "disabled",
      "label",
      "size"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      ariaLabel: "label"
    }
  },
  {
    name: "QueryBuilder",
    slots: [
      "fields",
      "value",
      "onChange",
      "operators",
      "disabled",
      "maxRules"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Quote",
    slots: [
      "text",
      "cite",
      "tone"
    ],
    positional: 0,
    aliases: {
      attribution: "cite",
      author: "cite",
      variant: "tone"
    }
  },
  {
    name: "RadarChart",
    slots: [
      "axes",
      "series",
      "max",
      "title",
      "size",
      "showDots",
      "showValues",
      "emptyText",
      "ariaLabel",
      "decorative"
    ],
    positional: 0,
    aliases: {
      alt: "ariaLabel"
    }
  },
  {
    name: "Radio",
    slots: [
      "id",
      "items",
      "value",
      "onChange",
      "label",
      "hint",
      "error",
      "required",
      "disabled",
      "direction",
      "labelHidden",
      "slots",
      "warning",
      "description",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "Rating",
    slots: [
      "value",
      "max",
      "label",
      "count",
      "size",
      "interactive",
      "readonly",
      "halfStep",
      "icon",
      "onChange",
      "allowClear",
      "tone"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      variant: "tone",
      color: "tone"
    }
  },
  {
    name: "ReactionPicker",
    slots: [
      "reactions",
      "onReact",
      "disabled"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "ReadingProgress",
    slots: [
      "gradient",
      "height",
      "target",
      "color"
    ],
    positional: 0,
    aliases: {
      scrollContainer: "target"
    }
  },
  {
    name: "Redirect",
    slots: [
      "path",
      "replace"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "RelativeTime",
    slots: [
      "value"
    ],
    positional: 0,
    aliases: {
      date: "value",
      time: "value"
    }
  },
  {
    name: "RequirementList",
    slots: [
      "items",
      "title",
      "pending",
      "announce",
      "announceText",
      "metLabel",
      "unmetLabel"
    ],
    positional: 0,
    aliases: {
      rules: "items",
      requirements: "items"
    }
  },
  {
    name: "ResizablePanels",
    slots: [
      "primary",
      "secondary",
      "initialPrimaryWidth",
      "minPrimaryWidth",
      "minSecondaryWidth",
      "onResize"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Reveal",
    slots: [
      "child",
      "animation",
      "delay",
      "duration",
      "threshold",
      "once"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "RichTextEditor",
    slots: [
      "id",
      "value",
      "placeholder",
      "minHeight",
      "disabled",
      "onChange",
      "tools",
      "maxHeight",
      "readonly",
      "name",
      "label",
      "hint",
      "error",
      "required",
      "warning",
      "description",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      helperText: "hint",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "RouteView",
    slots: [
      "children",
      "routeKey",
      "animation",
      "duration",
      "scrollToTop",
      "announce"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "Row",
    slots: [
      "children",
      "gap",
      "align",
      "justify",
      "grow",
      "wrap",
      "reverse",
      "padding",
      "inline",
      "alignContent"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "ScatterChart",
    slots: [
      "series",
      "xLabel",
      "yLabel",
      "title",
      "pointSize",
      "pointOpacity",
      "xMin",
      "xMax",
      "yMin",
      "yMax",
      "height",
      "showLegend",
      "emptyText",
      "onPointClick",
      "ariaLabel",
      "decorative"
    ],
    positional: 0,
    aliases: {
      alt: "ariaLabel"
    }
  },
  {
    name: "ScrollArea",
    slots: [
      "children",
      "maxHeight",
      "direction",
      "height",
      "stickToBottom"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "ScrollSpy",
    slots: [
      "sections",
      "title",
      "offset",
      "top",
      "onChange"
    ],
    positional: 0,
    aliases: {
      items: "sections",
      onchange: "onChange"
    }
  },
  {
    name: "SearchBar",
    slots: [
      "id",
      "placeholder",
      "value",
      "shortcut",
      "onSubmit",
      "submitLabel",
      "onChange",
      "clearable",
      "onClear",
      "disabled",
      "loading",
      "ariaLabel"
    ],
    positional: 0,
    aliases: {
      action: "onSubmit",
      onClick: "onSubmit",
      onchange: "onChange"
    }
  },
  {
    name: "Section",
    slots: [
      "children",
      "background",
      "width",
      "padding",
      "align",
      "eyebrow",
      "title",
      "subtitle",
      "id",
      "actions"
    ],
    positional: 0,
    aliases: {
      child: "children",
      bg: "background",
      description: "subtitle"
    }
  },
  {
    name: "SectionBlock",
    slots: [
      "title",
      "children",
      "description",
      "actions",
      "level",
      "icon"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "SectionHeader",
    slots: [
      "title",
      "subtitle",
      "eyebrow",
      "status",
      "actions"
    ],
    positional: 0,
    aliases: {
      description: "subtitle",
      badge: "status"
    }
  },
  {
    name: "SegmentedControl",
    slots: [
      "options",
      "value",
      "onChange",
      "disabled",
      "size",
      "label"
    ],
    positional: 0,
    aliases: {
      items: "options",
      onchange: "onChange",
      ariaLabel: "label"
    }
  },
  {
    name: "Select",
    slots: [
      "id",
      "items",
      "label",
      "placeholder",
      "value",
      "searchable",
      "onChange",
      "hint",
      "error",
      "required",
      "disabled",
      "onBlur",
      "onFocus",
      "loading",
      "onSearch",
      "labelHidden",
      "emptyLabel",
      "warning",
      "description",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      onblur: "onBlur",
      onfocus: "onFocus",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "SelectItem",
    slots: [
      "value",
      "label",
      "disabled",
      "group"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Separator",
    slots: [
      "orientation",
      "label",
      "decorative"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Series",
    slots: [
      "name",
      "values",
      "color",
      "points"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "ShareButtons",
    slots: [
      "url",
      "title",
      "networks",
      "showLabels"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Sheet",
    slots: [
      "children",
      "open",
      "side",
      "title",
      "onClose",
      "label",
      "width",
      "footer",
      "dismissible"
    ],
    positional: 0,
    aliases: {
      child: "children",
      content: "children",
      onclose: "onClose"
    }
  },
  {
    name: "Show",
    slots: [
      "when",
      "children",
      "fallback"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "Sidebar",
    slots: [
      "items",
      "brand",
      "tagline",
      "footer",
      "collapsed",
      "fullHeight",
      "label"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "SidebarItem",
    slots: [
      "label",
      "icon",
      "active",
      "badge",
      "to",
      "onClick",
      "href",
      "disabled"
    ],
    positional: 0,
    aliases: {
      action: "onClick",
      onclick: "onClick"
    }
  },
  {
    name: "SidebarSection",
    slots: [
      "label",
      "items"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "SignaturePad",
    slots: [
      "width",
      "height",
      "color",
      "lineWidth",
      "background",
      "clearable",
      "value",
      "onChange",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden",
      "ariaLabel"
    ],
    positional: 0,
    aliases: {
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus",
      arialabel: "ariaLabel"
    }
  },
  {
    name: "Skeleton",
    slots: [
      "variant",
      "lines",
      "height",
      "shape",
      "width",
      "label",
      "live"
    ],
    positional: 0,
    aliases: {
      tone: "variant",
      count: "lines",
      columns: "lines"
    }
  },
  {
    name: "SkipLink",
    slots: [
      "to",
      "label"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Slider",
    slots: [
      "id",
      "min",
      "max",
      "step",
      "value",
      "label",
      "showValue",
      "disabled",
      "onChange",
      "suffix",
      "format",
      "hint",
      "error",
      "marks",
      "warning",
      "description",
      "optional",
      "invalid",
      "describedBy"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy"
    }
  },
  {
    name: "Sortable",
    slots: [
      "items",
      "onReorder",
      "handle",
      "horizontal",
      "disabled",
      "ariaLabel"
    ],
    positional: 0,
    aliases: {
      children: "items"
    }
  },
  {
    name: "Spacer",
    slots: [
      "size",
      "flex"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Sparkline",
    slots: [
      "values",
      "tone",
      "width",
      "height",
      "min",
      "max",
      "label"
    ],
    positional: 0,
    aliases: {
      variant: "tone",
      ariaLabel: "label"
    }
  },
  {
    name: "SpeedDial",
    slots: [
      "actions",
      "icon",
      "open",
      "onOpenChange",
      "position",
      "label"
    ],
    positional: 0,
    aliases: {
      items: "actions"
    }
  },
  {
    name: "Spinner",
    slots: [
      "size",
      "label",
      "tone"
    ],
    positional: 0,
    aliases: {
      variant: "tone"
    }
  },
  {
    name: "Split",
    slots: [
      "left",
      "right",
      "ratio",
      "gap",
      "divider",
      "sticky",
      "stickyOffset",
      "stackAt",
      "reverseOnStack",
      "align"
    ],
    positional: 0,
    aliases: {
      primary: "left",
      secondary: "right"
    }
  },
  {
    name: "SplitView",
    slots: [
      "primary",
      "detail",
      "primaryWidth",
      "showDetail"
    ],
    positional: 0,
    aliases: {
      secondary: "detail",
      splitAt: "primaryWidth"
    }
  },
  {
    name: "Spotlight",
    slots: [
      "title",
      "open",
      "description",
      "actions",
      "onClose",
      "target"
    ],
    positional: 0,
    aliases: {
      action: "actions",
      onclose: "onClose"
    }
  },
  {
    name: "Stack",
    slots: [
      "children",
      "direction",
      "gap",
      "align",
      "justify",
      "alignContent",
      "wrap",
      "reverse",
      "uniform",
      "inline",
      "padding"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "StackItem",
    slots: [
      "child",
      "grow",
      "shrink",
      "basis",
      "alignSelf",
      "order",
      "minWidth",
      "maxWidth"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "StatCard",
    slots: [
      "label",
      "value",
      "trend",
      "delta",
      "icon",
      "spark",
      "tone",
      "hint",
      "onClick"
    ],
    positional: 0,
    aliases: {
      variant: "tone",
      description: "hint",
      onclick: "onClick",
      action: "onClick"
    }
  },
  {
    name: "Stats",
    slots: [
      "items",
      "layout",
      "columns",
      "align"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "StatusDot",
    slots: [
      "label",
      "tone",
      "pulse"
    ],
    positional: 0,
    aliases: {
      variant: "tone"
    }
  },
  {
    name: "Steps",
    slots: [
      "items",
      "orientation"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Sticky",
    slots: [
      "children",
      "side",
      "offset",
      "zIndex"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "Styles",
    slots: [
      "css",
      "scope",
      "tokens"
    ],
    positional: 0,
    aliases: {
      content: "css",
      rules: "css"
    }
  },
  {
    name: "SuccessState",
    slots: [
      "title",
      "description",
      "actions",
      "icon"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Svg",
    slots: [
      "content",
      "viewBox",
      "width",
      "height",
      "fill",
      "stroke",
      "strokeWidth",
      "preserveAspectRatio",
      "label"
    ],
    positional: 0,
    aliases: {
      paths: "content",
      markup: "content",
      "stroke-width": "strokeWidth"
    }
  },
  {
    name: "Swatch",
    slots: [
      "name",
      "background",
      "foreground",
      "colors",
      "onClick",
      "selected"
    ],
    positional: 0,
    aliases: {
      onSelect: "onClick",
      onclick: "onClick",
      active: "selected"
    }
  },
  {
    name: "Switch",
    slots: [
      "id",
      "label",
      "value",
      "description",
      "disabled",
      "onChange",
      "labelHidden"
    ],
    positional: 0,
    aliases: {
      checked: "value",
      onchange: "onChange"
    }
  },
  {
    name: "TabBar",
    slots: [
      "items",
      "active",
      "onChange",
      "pinned"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "TabItem",
    slots: [
      "value",
      "label",
      "children",
      "badge",
      "icon",
      "disabled"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "Table",
    slots: [
      "columns",
      "caption",
      "density",
      "striped",
      "sticky",
      "emptyLabel",
      "loading",
      "loadingRows",
      "maxHeight",
      "onRowClick",
      "allowOverflow",
      "ariaLabel",
      "locale"
    ],
    positional: 0,
    aliases: {
      title: "caption",
      rowAction: "onRowClick",
      overflow: "allowOverflow"
    }
  },
  {
    name: "TableOfContents",
    slots: [
      "items",
      "title",
      "activeHref",
      "onSelect"
    ],
    positional: 0,
    aliases: {
      children: "items",
      active: "activeHref",
      onChange: "onSelect"
    }
  },
  {
    name: "Tabs",
    slots: [
      "items",
      "defaultValue",
      "orientation",
      "onChange",
      "value",
      "fitted"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange"
    }
  },
  {
    name: "TagInput",
    slots: [
      "id",
      "value",
      "placeholder",
      "max",
      "suggestions",
      "onChange",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus"
    }
  },
  {
    name: "Terminal",
    slots: [
      "lines",
      "file",
      "prompt",
      "height",
      "maxHeight"
    ],
    positional: 0,
    aliases: {
      children: "lines",
      content: "lines"
    }
  },
  {
    name: "Testimonial",
    slots: [
      "quote",
      "author",
      "role",
      "avatarSrc",
      "rating"
    ],
    positional: 0,
    aliases: {
      name: "author",
      src: "avatarSrc"
    }
  },
  {
    name: "Text",
    slots: [
      "value",
      "variant",
      "tone",
      "align",
      "style",
      "as",
      "truncate",
      "lines"
    ],
    positional: 0,
    aliases: {
      tag: "as",
      clamp: "lines"
    }
  },
  {
    name: "TextArea",
    slots: [
      "id",
      "placeholder",
      "rows",
      "value",
      "onChange",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden",
      "maxLength",
      "readOnly",
      "autoResize"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus",
      maxlength: "maxLength",
      readonly: "readOnly"
    }
  },
  {
    name: "TextContent",
    slots: [
      "value",
      "variant",
      "tone",
      "align",
      "style",
      "as",
      "truncate",
      "lines"
    ],
    positional: 0,
    aliases: {
      tag: "as",
      clamp: "lines"
    }
  },
  {
    name: "ThemeToggle",
    slots: [
      "light",
      "dark"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "Tile",
    slots: [
      "label",
      "icon",
      "value",
      "description",
      "tone",
      "onClick",
      "href",
      "selected",
      "iconPosition"
    ],
    positional: 0,
    aliases: {
      variant: "tone",
      action: "onClick",
      onclick: "onClick",
      active: "selected"
    }
  },
  {
    name: "TimePicker",
    slots: [
      "id",
      "value",
      "min",
      "max",
      "step",
      "onChange",
      "disabled",
      "label",
      "hint",
      "error",
      "warning",
      "description",
      "required",
      "optional",
      "invalid",
      "describedBy",
      "onBlur",
      "onFocus",
      "name",
      "labelHidden"
    ],
    positional: 0,
    aliases: {
      onchange: "onChange",
      ariaInvalid: "invalid",
      ariaDescribedBy: "describedBy",
      onblur: "onBlur",
      onfocus: "onFocus"
    }
  },
  {
    name: "Timeline",
    slots: [
      "items"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "TimelineItem",
    slots: [
      "title",
      "time",
      "description",
      "icon",
      "tone",
      "content",
      "href",
      "onClick"
    ],
    positional: 0,
    aliases: {
      variant: "tone",
      action: "onClick",
      onclick: "onClick"
    }
  },
  {
    name: "Toast",
    slots: [
      "title",
      "message",
      "tone",
      "icon",
      "duration",
      "action",
      "onClose",
      "position",
      "pauseOnHover"
    ],
    positional: 0,
    aliases: {
      description: "message",
      variant: "tone"
    }
  },
  {
    name: "Toasts",
    slots: [
      "children",
      "position",
      "max"
    ],
    positional: 0,
    aliases: {
      child: "children",
      limit: "max"
    }
  },
  {
    name: "ToggleGroup",
    slots: [
      "id",
      "items",
      "value",
      "variant",
      "size",
      "onChange",
      "multiple",
      "type",
      "disabled",
      "label"
    ],
    positional: 0,
    aliases: {
      tone: "variant",
      onchange: "onChange",
      ariaLabel: "label"
    }
  },
  {
    name: "Toolbar",
    slots: [
      "left",
      "right",
      "center",
      "searchable",
      "searchPlaceholder",
      "searchValue",
      "onSearch",
      "searchId"
    ],
    positional: 0,
    aliases: {
      onSearchChange: "onSearch",
      onChange: "onSearch"
    }
  },
  {
    name: "Tooltip",
    slots: [
      "label",
      "trigger",
      "side",
      "delay",
      "open",
      "align",
      "onOpenChange"
    ],
    positional: 0,
    aliases: {
      children: "trigger",
      placement: "side",
      delayDuration: "delay",
      enterDelay: "delay"
    }
  },
  {
    name: "TopBar",
    slots: [
      "title",
      "subtitle",
      "left",
      "center",
      "right",
      "sticky"
    ],
    positional: 0,
    aliases: {
      badges: "left",
      search: "center",
      actions: "right"
    }
  },
  {
    name: "Tour",
    slots: [
      "steps",
      "current",
      "open",
      "onOpenChange",
      "onComplete",
      "onSkip",
      "skipLabel",
      "backLabel",
      "nextLabel",
      "finishLabel"
    ],
    positional: 0,
    aliases: {
      onopenchange: "onOpenChange"
    }
  },
  {
    name: "Transition",
    slots: [
      "child",
      "show",
      "preset",
      "duration",
      "onExited"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "Tree",
    slots: [
      "items",
      "selectedId",
      "onSelect",
      "expandedIds",
      "ariaLabel",
      "emptyLabel",
      "checkable",
      "checkedIds",
      "onCheck"
    ],
    positional: 0,
    aliases: {
      selected: "selectedId",
      value: "selectedId",
      checkedKeys: "checkedIds"
    }
  },
  {
    name: "TreeNode",
    slots: [
      "label",
      "children",
      "icon",
      "expanded",
      "active",
      "badge",
      "onClick",
      "href",
      "disabled",
      "onToggle",
      "nodeId",
      "hasChildren"
    ],
    positional: 0,
    aliases: {
      child: "children",
      selected: "active",
      action: "onClick",
      onclick: "onClick",
      value: "nodeId",
      lazy: "hasChildren"
    }
  },
  {
    name: "Truncate",
    slots: [
      "text",
      "maxLines",
      "expandLabel",
      "collapseLabel",
      "expanded",
      "onToggle",
      "child"
    ],
    positional: 0,
    aliases: {
      children: "child"
    }
  },
  {
    name: "TypingIndicator",
    slots: [
      "name"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "ValidationSummary",
    slots: [
      "errors",
      "title",
      "tone",
      "count",
      "onErrorClick"
    ],
    positional: 0,
    aliases: {
      variant: "tone"
    }
  },
  {
    name: "VariantSelector",
    slots: [
      "options",
      "value",
      "kind",
      "label",
      "onChange",
      "disabled",
      "multiple",
      "size"
    ],
    positional: 0,
    aliases: {
      items: "options",
      onchange: "onChange"
    }
  },
  {
    name: "VideoPlayer",
    slots: [
      "src",
      "sources",
      "poster",
      "caption",
      "controls",
      "autoplay",
      "loop",
      "muted",
      "ratio",
      "tracks",
      "onEnded",
      "fallback",
      "onError"
    ],
    positional: 0,
    aliases: {
      onended: "onEnded",
      onerror: "onError"
    }
  },
  {
    name: "VirtualGrid",
    slots: [
      "items",
      "columns",
      "itemHeight",
      "gap",
      "height",
      "minItemWidth",
      "onItemClick",
      "empty",
      "loading"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "VirtualList",
    slots: [
      "items",
      "itemHeight",
      "renderItem",
      "height",
      "onItemClick",
      "empty",
      "loading"
    ],
    positional: 0,
    aliases: {}
  },
  {
    name: "VisuallyHidden",
    slots: [
      "children"
    ],
    positional: 0,
    aliases: {
      child: "children"
    }
  },
  {
    name: "WebComponent",
    slots: [
      "tag",
      "attributes",
      "properties",
      "on",
      "children"
    ],
    positional: 0,
    aliases: {
      attrs: "attributes",
      props: "properties",
      events: "on",
      child: "children"
    }
  }
];
const hooks = [
  "id",
  "memo",
  "reducer",
  "ref",
  "state"
];
const factories = [
  "form",
  "http",
  "mutation",
  "query",
  "script",
  "socket",
  "sse",
  "store"
];
const namespaces = [
  "console",
  "dom",
  "i18n",
  "storage",
  "toast",
  "util"
];
const builtins = [
  "app",
  "effect",
  "emit",
  "head",
  "optimistic",
  "router",
  "theme"
];
const injected = [
  "aktion",
  "children",
  "cleanup",
  "clearInterval",
  "clearTimeout",
  "outlet",
  "params",
  "route",
  "setInterval",
  "setTimeout",
  "slots",
  "theme"
];
const hostGlobals = [
  "atob",
  "btoa",
  "console",
  "structuredClone"
];
const manifest = {
  components,
  hooks,
  factories,
  namespaces,
  builtins,
  injected,
  hostGlobals
};
const WRITABLE = /* @__PURE__ */ new Set(["aktion", "theme"]);
function buildGlobals() {
  const names = /* @__PURE__ */ new Set();
  for (const component of manifest.components) names.add(component.name);
  for (const name of [...manifest.hooks, ...manifest.factories, ...manifest.namespaces, ...manifest.builtins]) names.add(`$${name}`);
  for (const name of manifest.injected) names.add(name);
  for (const name of manifest.hostGlobals) names.add(name);
  const out = {};
  for (const name of [...names].sort()) out[name] = WRITABLE.has(name) ? "writable" : "readonly";
  return out;
}
const aktionGlobals = Object.freeze(buildGlobals());
const aktionPropsLiteralRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Require the props of an Aktion library component call to be an object literal written at the call site, without spreads, and flag an object literal Aktion reads as props where TypeScript matched a positional parameter (needs type information)",
      recommended: true
    },
    messages: {
      propsNotLiteral: 'Aktion only reads props from an object literal written at the call site — inline it: Button("Go", { …opts }) is not supported either (spreads are dropped), so list the props.',
      propsSpread: "Spreads inside component props are ignored by Aktion — list the props explicitly (`{ variant: extra.variant, … }`).",
      objectReadAsProps: "Aktion reads this object as the component's named props, not as its `{{parameter}}` argument, because `{{key}}` is a prop name: {{effect}}. Pass {{subject}} by name instead (`{{named}}`)."
    },
    schema: []
  },
  create(context) {
    const { sourceCode } = context;
    const services = sourceCode.parserServices;
    const program = services?.program;
    const nodeMap = services?.esTreeNodeToTSNodeMap;
    if (!program || !nodeMap) return {};
    const checker = program.getTypeChecker();
    return {
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== "Identifier" || !COMPONENT_NAME.test(callee.name)) return;
        if (isDeclaredInModuleGraph(sourceCode, callee)) return;
        const tsCall = nodeMap.get(node);
        if (!tsCall) return;
        const signature = checker.getResolvedSignature(tsCall);
        if (!signature) return;
        const spreadAt = node.arguments.findIndex((argument) => argument.type === "SpreadElement");
        const checked = spreadAt < 0 ? node.arguments : node.arguments.slice(0, spreadAt);
        const tsArguments = checked.map((argument) => nodeMap.get(argument));
        if (tsArguments.some((argument) => argument === void 0)) return;
        const call = {
          checker,
          tsCall,
          arguments: checked,
          tsArguments,
          complete: spreadAt < 0
        };
        const clean = resolvedCleanly(call, signature);
        for (const [index, argument] of checked.entries()) {
          const bag = withoutTypeOnlyWrappers(argument);
          const isBag = clean ? parameterAt(signature, index)?.getName() === PROPS_PARAMETER : bagByCandidates(call, index, bag);
          if (!isBag) continue;
          if (bag.type !== "ObjectExpression") {
            if (isAnyTyped(call, index)) continue;
            context.report({ node: argument, messageId: "propsNotLiteral" });
            continue;
          }
          for (const property of bag.properties) {
            if (property.type === "SpreadElement") {
              context.report({ node: property, messageId: "propsSpread" });
            }
          }
        }
        if (clean) checkPositionalObject(context, call, signature);
      }
    };
  }
};
const COMPONENT_NAME = /^[A-Z]/;
const PROPS_PARAMETER = "props";
const DSL_MODULE = "aktion-runtime/dsl";
const ANY_TYPE_FLAG = 1;
const TYPE_ONLY_WRAPPERS = /* @__PURE__ */ new Set([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "TSTypeAssertion"
]);
function withoutTypeOnlyWrappers(node) {
  let current = node;
  while (TYPE_ONLY_WRAPPERS.has(current.type)) {
    current = current.expression;
  }
  return current;
}
function resolvedCleanly(call, signature) {
  const { checker } = call;
  const declaration = signature.getDeclaration();
  if (!declaration) return false;
  if (!signature.getParameters().every((parameter) => parameter.valueDeclaration?.parent === declaration)) {
    return false;
  }
  if (typeof checker.isTypeAssignableTo !== "function") return true;
  return call.tsArguments.every((argument, index) => {
    const parameter = parameterAt(signature, index);
    return parameter !== void 0 && checker.isTypeAssignableTo(checker.getTypeAtLocation(argument), slotType(call, parameter));
  });
}
function isAnyTyped(call, index) {
  return (call.checker.getTypeAtLocation(call.tsArguments[index]).flags & ANY_TYPE_FLAG) !== 0;
}
function bagByCandidates(call, index, bag) {
  const { checker } = call;
  if (!call.complete || typeof checker.isTypeAssignableTo !== "function") return false;
  const slots = calleeSignatures(call).filter((signature) => acceptsArgumentCount(signature, call.arguments.length)).map((signature) => parameterAt(signature, index)).filter((parameter) => parameter !== void 0);
  if (!slots.some((parameter) => parameter.getName() === PROPS_PARAMETER)) return false;
  const type = checker.getTypeAtLocation(call.tsArguments[index]);
  const positional = slots.filter((parameter) => parameter.getName() !== PROPS_PARAMETER);
  if (positional.some((parameter) => checker.isTypeAssignableTo(type, slotType(call, parameter)))) return false;
  return bag.type === "ObjectExpression" || looksLikeProps(call, type);
}
function looksLikeProps(call, type) {
  const { checker } = call;
  const objectType = typeof checker.getNonPrimitiveType === "function" ? checker.getNonPrimitiveType() : void 0;
  if (!objectType || typeof checker.isArrayLikeType !== "function") return false;
  const nonNullable = checker.getNonNullableType(type);
  const members = nonNullable.isUnion() ? nonNullable.types : [nonNullable];
  const names = bagPropertyNames(call);
  return members.every(
    (member) => member.getCallSignatures().length === 0 && !checker.isArrayLikeType(member) && checker.isTypeAssignableTo(member, objectType)
  ) && members.some((member) => member.getProperties().some((property) => names.has(property.getName())));
}
function checkPositionalObject(context, call, signature) {
  if (!call.complete || call.arguments.length === 0) return;
  let index = -1;
  for (let i = call.arguments.length - 1; i >= 0; i -= 1) {
    if (withoutTypeOnlyWrappers(call.arguments[i]).type === "ObjectExpression") {
      index = i;
      break;
    }
  }
  if (index < 0) return;
  const parameter = parameterAt(signature, index);
  if (!parameter || parameter.getName() === PROPS_PARAMETER) return;
  const literal = withoutTypeOnlyWrappers(call.arguments[index]);
  const names = bagPropertyNames(call);
  const keys = literal.properties.flatMap((property) => property.type === "Property" ? [propertyKey(property)] : []);
  const known = keys.find((key) => key !== null && names.has(key));
  if (known === void 0 || known === null) return;
  const dropped = keys.filter((key) => key === null || !names.has(key)).map((key) => key === null ? "[…]" : key);
  if (call.arguments.length === 1 && !electsLoneObject(call, parameter, keys, dropped.length > 0)) return;
  const effects = [];
  if (dropped.length > 0) {
    const list = dropped.map((key) => `\`${key}\``).join(", ");
    effects.push(dropped.length === 1 ? `${list} is not a prop and is dropped` : `${list} are not props and are dropped`);
  }
  if (index < call.arguments.length - 1) {
    effects.push(`the argument after it lands in \`${parameter.getName()}\` instead`);
  }
  if (effects.length === 0) effects.push(`nothing reaches \`${parameter.getName()}\``);
  const following = call.arguments.length - 1 - index;
  const subject = following === 0 ? "it" : `it, and the argument${following === 1 ? "" : "s"} after it,`;
  const entries = /* @__PURE__ */ new Set([`${parameter.getName()}: { … }`]);
  for (let i = index + 1; i < call.arguments.length; i += 1) {
    const name = parameterAt(signature, i)?.getName();
    entries.add(name !== void 0 && name !== PROPS_PARAMETER && names.has(name) ? `${name}: …` : "…");
  }
  context.report({
    node: call.arguments[index],
    messageId: "objectReadAsProps",
    data: {
      parameter: parameter.getName(),
      key: known,
      effect: effects.join(", and "),
      subject,
      named: `{ ${[...entries].join(", ")} }`
    }
  });
}
function electsLoneObject(call, parameter, keys, dropsKeys) {
  const signatures = calleeSignatures(call);
  if (!signatures.some((signature) => signature.getParameters()[0]?.getName() === PROPS_PARAMETER)) return false;
  if (!dropsKeys && keys.includes(parameter.getName())) return false;
  const slots = Math.max(
    0,
    ...signatures.map((signature) => signature.getParameters().filter((p) => p.getName() !== PROPS_PARAMETER).length)
  );
  return slots > 1 || !dropsKeys;
}
function propertyKey(property) {
  if (property.computed) return null;
  if (property.key.type === "Identifier") return property.key.name;
  if (property.key.type === "Literal") return String(property.key.value);
  return null;
}
function calleeSignatures(call) {
  call.signatures ??= call.checker.getTypeAtLocation(call.tsCall.expression).getCallSignatures();
  return call.signatures;
}
function bagPropertyNames(call) {
  if (call.bagNames) return call.bagNames;
  const names = /* @__PURE__ */ new Set();
  for (const signature of calleeSignatures(call)) {
    for (const parameter of signature.getParameters()) {
      if (parameter.getName() !== PROPS_PARAMETER) continue;
      const type = call.checker.getNonNullableType(slotType(call, parameter));
      for (const property of call.checker.getPropertiesOfType(type)) names.add(property.getName());
    }
  }
  call.bagNames = names;
  return names;
}
function slotType(call, parameter) {
  const { checker } = call;
  const type = typeof checker.getTypeOfSymbol === "function" ? checker.getTypeOfSymbol(parameter) : checker.getTypeOfSymbolAtLocation(parameter, call.tsCall);
  return isRestParameter(parameter) ? type.getNumberIndexType() ?? type : type;
}
function acceptsArgumentCount(signature, count) {
  const parameters = signature.getParameters();
  const rest = parameters.length > 0 && isRestParameter(parameters[parameters.length - 1]);
  let required = 0;
  for (const [index, parameter] of parameters.entries()) {
    if (!isOptionalParameter(parameter)) required = index + 1;
  }
  return count >= required && (rest || count <= parameters.length);
}
function parameterAt(signature, index) {
  const parameters = signature.getParameters();
  const restIndex = parameters.length - 1;
  const last = parameters[restIndex];
  if (last !== void 0 && index >= restIndex && isRestParameter(last)) return last;
  return parameters[index];
}
function parameterDeclaration(parameter) {
  return parameter.valueDeclaration;
}
function isRestParameter(parameter) {
  return parameterDeclaration(parameter)?.dotDotDotToken !== void 0;
}
function isOptionalParameter(parameter) {
  const declaration = parameterDeclaration(parameter);
  return declaration?.dotDotDotToken !== void 0 || declaration?.questionToken !== void 0 || declaration?.initializer !== void 0;
}
function isDeclaredInModuleGraph(sourceCode, callee) {
  for (let scope = sourceCode.getScope(callee); scope; scope = scope.upper) {
    const variable = scope.set.get(callee.name);
    if (variable) return variable.defs.some((definition) => !isDslImport(definition));
  }
  return false;
}
function isDslImport(definition) {
  if (definition.type !== "ImportBinding") return false;
  const parent = definition.parent;
  return parent?.source?.value === DSL_MODULE;
}
const aktionRouterLiteralRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Require the route table of `$router(…)`, and the `routes` of each layout arm, to be an object literal written at the call site, without spreads or computed paths",
      recommended: true
    },
    messages: {
      tableNotLiteral: '`$router` reads its route table by syntax — pass an object literal written here and list every arm (`$router({ "/": Home(), default: NotFound() })`); anything else renders nothing.',
      armSpread: "Aktion reads route tables by syntax and skips spread entries, so these arms never match — list each arm explicitly.",
      armComputed: 'Aktion reads each route path by syntax and ignores a computed one, so this arm never matches — write the path as a string key (`"/users/:id": …`).',
      routesNotLiteral: "A layout arm's `routes` is read by syntax — write the child routes as an object literal here; anything else leaves `outlet` empty."
    },
    schema: []
  },
  create(context) {
    const { sourceCode } = context;
    const checkTable = (table) => {
      for (const entry of table.properties) {
        if (entry.type === "SpreadElement") {
          context.report({ node: entry, messageId: "armSpread" });
          continue;
        }
        if (entry.computed) {
          context.report({ node: entry.key, messageId: "armComputed" });
          continue;
        }
        const arm = withoutTypeOnlyWrappers(entry.value);
        if (arm.type === "ObjectExpression") checkArm(arm);
      }
    };
    const checkArm = (arm) => {
      let isLayout = false;
      let routes = null;
      for (const entry of arm.properties) {
        if (entry.type === "SpreadElement") {
          context.report({ node: entry, messageId: "armSpread" });
          continue;
        }
        const key = staticKey(entry);
        if (key === "layout") isLayout = true;
        else if (key === "routes") routes = entry.value;
      }
      if (!isLayout || routes === null) return;
      const child = withoutTypeOnlyWrappers(routes);
      if (child.type === "ObjectExpression") checkTable(child);
      else context.report({ node: routes, messageId: "routesNotLiteral" });
    };
    return {
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== "Identifier" || callee.name !== ROUTER) return;
        if (isDeclaredInModuleGraph(sourceCode, callee)) return;
        const first = node.arguments[0];
        if (!first) {
          context.report({ node, messageId: "tableNotLiteral" });
          return;
        }
        const table = withoutTypeOnlyWrappers(first);
        if (table.type === "ObjectExpression") checkTable(table);
        else context.report({ node: first, messageId: "tableNotLiteral" });
      }
    };
  }
};
const ROUTER = "$router";
function staticKey(property) {
  if (property.computed) return null;
  if (property.key.type === "Identifier") return property.key.name;
  if (property.key.type === "Literal") return String(property.key.value);
  return null;
}
const aktionEslintPlugin = {
  meta: {
    name: "aktion-runtime",
    version: "0.1.0"
  },
  processors: {
    aktion: aktionProcessor
  },
  rules: {
    "props-literal": aktionPropsLiteralRule,
    "router-literal": aktionRouterLiteralRule
  },
  globals: aktionGlobals
};
const recommendedConfig = [
  {
    name: "aktion/recommended/plugin",
    plugins: {
      aktion: aktionEslintPlugin
    }
  },
  {
    name: "aktion/recommended/processor",
    files: ["**/*.aktion"],
    processor: "aktion/aktion"
  },
  {
    name: "aktion/recommended/rules",
    files: ["**/*.aktion/*.ts"],
    languageOptions: {
      globals: { ...aktionGlobals }
    },
    rules: {
      ...aktionRecommendedRules
    }
  }
];
const aktionTypeScriptConfig = [
  {
    name: "aktion/typescript/plugin",
    plugins: {
      aktion: aktionEslintPlugin
    }
  },
  {
    name: "aktion/typescript/rules",
    files: ["**/*.aktion.ts", "**/*.aktion.js"],
    rules: {
      ...aktionTypeScriptRules,
      "aktion/props-literal": "error",
      "aktion/router-literal": "error"
    }
  }
];
aktionEslintPlugin.configs = {
  recommended: recommendedConfig,
  typescript: aktionTypeScriptConfig
};
exports.aktionGlobals = aktionGlobals;
exports.aktionProcessor = aktionProcessor;
exports.aktionPropsLiteralRule = aktionPropsLiteralRule;
exports.aktionRecommendedRules = aktionRecommendedRules;
exports.aktionRouterLiteralRule = aktionRouterLiteralRule;
exports.aktionTypeScriptConfig = aktionTypeScriptConfig;
exports.aktionTypeScriptRules = aktionTypeScriptRules;
exports.applyInsertions = applyInsertions;
exports.computeLineStarts = computeLineStarts;
exports.default = aktionEslintPlugin;
exports.findBareExportInsertions = findBareExportInsertions;
exports.lineColumnToOffset = lineColumnToOffset;
exports.offsetToLineColumn = offsetToLineColumn;
exports.rangeOverlapsInsertion = rangeOverlapsInsertion;
exports.toOriginalOffset = toOriginalOffset;
//# sourceMappingURL=eslint.cjs.map
