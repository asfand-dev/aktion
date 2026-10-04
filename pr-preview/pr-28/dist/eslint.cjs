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
  // TypeScript preset below enforces the `properties` form instead.
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
  "unicorn/switch-case-braces": "off"
};
const aktionTypeScriptRules = {
  // RECONFIGURED, not off: method shorthand (`{ onClick() { … } }`) parses to
  // the same handler since the parser widening, but the guide keeps handlers in
  // property form; `properties` enforces only `{ title }` for `{ title: title }`,
  // which the JS-semantics layer keeps working after renaming locals (W1).
  "object-shorthand": ["error", "properties"],
  // GENUINE GRAMMAR INCOMPATIBILITY, reconfigured rather than off: a braced
  // case body parses as an object literal (no `BlockStatement` production, see
  // above), so unicorn's default `always` corrupts every switch it fixes, while
  // `avoid` only ever REMOVES braces. It does not report braces around a body
  // that declares something (`case 1: { const y = x … }`), which still fails
  // to parse.
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
      description: "Require the props of an Aktion library component call to be an object literal written at the call site, without spreads (needs type information)",
      recommended: true
    },
    messages: {
      propsNotLiteral: 'Aktion only reads props from an object literal written at the call site — inline it: Button("Go", { …opts }) is not supported either (spreads are dropped), so list the props.',
      propsSpread: "Spreads inside component props are ignored by Aktion — list the props explicitly (`{ variant: extra.variant, … }`)."
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
        for (const [index, argument] of node.arguments.entries()) {
          if (argument.type === "SpreadElement") return;
          if (parameterAt(signature, index)?.getName() !== PROPS_PARAMETER) continue;
          const bag = withoutTypeOnlyWrappers(argument);
          if (bag.type !== "ObjectExpression") {
            context.report({ node: argument, messageId: "propsNotLiteral" });
            continue;
          }
          for (const property of bag.properties) {
            if (property.type === "SpreadElement") {
              context.report({ node: property, messageId: "propsSpread" });
            }
          }
        }
      }
    };
  }
};
const COMPONENT_NAME = /^[A-Z]/;
const PROPS_PARAMETER = "props";
const DSL_MODULE = "aktion-runtime/dsl";
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
function parameterAt(signature, index) {
  const parameters = signature.getParameters();
  const restIndex = parameters.length - 1;
  const last = parameters[restIndex];
  if (last !== void 0 && index >= restIndex && isRestParameter(last)) return last;
  return parameters[index];
}
function isRestParameter(parameter) {
  const declaration = parameter.valueDeclaration;
  return declaration?.dotDotDotToken !== void 0;
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
const aktionEslintPlugin = {
  meta: {
    name: "aktion-runtime",
    version: "0.1.0"
  },
  processors: {
    aktion: aktionProcessor
  },
  rules: {
    "props-literal": aktionPropsLiteralRule
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
      "aktion/props-literal": "error"
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
