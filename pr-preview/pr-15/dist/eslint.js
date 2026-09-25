const IDENTIFIER_START = /[$A-Z_a-z]/u;
const IDENTIFIER_CHAR = /[\w$]/u;
const WHITESPACE_CHAR = /\s/u;
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
    while (index < source.length) {
      const char = source[index];
      if (stopAtBrace && char === "}" && braceDepth === 0) {
        return index + 1;
      }
      if (char === "{" || char === "}") {
        braceDepth += char === "{" ? 1 : -1;
        index += 1;
        continue;
      }
      const skippedStringLike = trySkipStringLike(index);
      if (skippedStringLike !== void 0) {
        index = skippedStringLike;
        continue;
      }
      const skippedComment = trySkipComment(index);
      if (skippedComment !== void 0) {
        index = skippedComment;
        continue;
      }
      if (char === "e" && isExportKeywordAt(index)) {
        const insertionOffset = classifyExportTail(source, index + 6);
        if (insertionOffset !== void 0) {
          insertions.push({ originalOffset: insertionOffset });
        }
        index += 6;
        continue;
      }
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
  // GENUINE GRAMMAR INCOMPATIBILITY: `parseObjectProps` in
  // `src/parser/parser.ts` accepts a `key: value` entry or a bare
  // property-value shorthand (`{ foo }` for `{ foo: foo }`) but has no
  // production at all for ES6 METHOD shorthand (`{ onClick() { … } }`) — the
  // token immediately after an object key is either `:` or a `,`/`}` that
  // closes the property-value-shorthand case; anything else (e.g. a `(`
  // opening a method's parameter list) is a parse error. `object-shorthand`'s
  // autofix rewrites `onClick: () => { … }` handlers into `onClick() { … }`,
  // which is valid JS/TS but an Aktion parse error.
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
  // grammar cannot.
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
const aktionEslintPlugin = {
  meta: {
    name: "aktion-runtime",
    version: "0.1.0"
  },
  processors: {
    aktion: aktionProcessor
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
aktionEslintPlugin.configs = {
  recommended: recommendedConfig
};
export {
  aktionProcessor,
  aktionRecommendedRules,
  applyInsertions,
  computeLineStarts,
  aktionEslintPlugin as default,
  findBareExportInsertions,
  lineColumnToOffset,
  offsetToLineColumn,
  rangeOverlapsInsertion,
  toOriginalOffset
};
//# sourceMappingURL=eslint.js.map
