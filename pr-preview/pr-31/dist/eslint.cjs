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
  }
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
