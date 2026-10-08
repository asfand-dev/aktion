import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildSquashMessage, checkSquashMessage, extractOverride, findOffendingLines, formatFailure } from "./check-squash-message.mjs";

const script = fileURLToPath(new URL("./check-squash-message.mjs", import.meta.url));

/** Lines the parser rejects: the shape of aktion commit 755f2ce and of the lines that made release-please drop squash commit bc98061 (#30). */
const BAD_LINES = [
  "`(` or `[`. Parsing is unchanged.",
  '`HTMLTag("div", { class: "hero", "data-id": 1 }, [Text("x")])` was told to',
  "InputGroup(MultiSelect(…), { disabled: true }) gave the MultiSelect's",
  '`$router({ [path]: Page() })` — and `["/"]`, and the same inside a layout',
  "word(unclosed",
  "*(no space after the star",
];

/** Lines that read like the bad ones but parse: a leading space, "*", "-", a bare "(", a closed scope, a space before the "(". */
const GOOD_LINES = [
  " `(` or `[`. Parsing is unchanged.",
  "* `HTMLTag(\"div\", [Text(\"x\")])` was told to",
  "- `HTMLTag(\"div\", [Text(\"x\")])` was told to",
  "(`f` then `(1)` is `f(1)`), while Aktion",
  "(a bare paren line",
  "word (unclosed",
  "word(closed) and then prose",
  "Plain prose with `calls(x)` inside.",
];

const commit = (message, parents = 1) => ({ sha: "0123456789abcdef", message, parents });
const squashWith = (line) =>
  buildSquashMessage({
    title: "feat(x): the title",
    number: 7,
    commits: [commit("feat(x): first\n\nfine body"), commit(`feat(x): second\n\nintro\n${line}\noutro`)],
  });

test("good lines parse in a multi-commit squash message", () => {
  for (const line of GOOD_LINES) {
    const result = checkSquashMessage({ message: squashWith(line) });
    assert.equal(result.ok, true, `expected ${JSON.stringify(line)} to pass`);
  }
});

test("bad lines fail and are named with their line number", () => {
  for (const line of BAD_LINES) {
    const message = squashWith(line);
    const result = checkSquashMessage({ message });
    assert.equal(result.ok, false, `expected ${JSON.stringify(line)} to fail`);
    assert.equal(result.source, "squash");
    assert.equal(result.parsed, 0);
    const expectedLine = message.split("\n").indexOf(line) + 1;
    assert.deepEqual(result.offending, [{ line: expectedLine, text: line }]);
  }
});

test("a bad line right after a blank line fails too", () => {
  const result = checkSquashMessage({ message: `feat(x): t (#1)\n\n* feat(x): a\n\nintro\n\n${BAD_LINES[0]}\n` });
  assert.equal(result.ok, false);
  assert.equal(result.offending[0].text, BAD_LINES[0]);
});

test("a bad title and a bad body line are both reported", () => {
  const result = checkSquashMessage({ message: `feat(scope: broken (#3)\n\nintro\n${BAD_LINES[0]}` });
  assert.equal(result.ok, false);
  assert.deepEqual(result.offending.map((hit) => hit.line), [1, 4]);
});

test("a squash message that is only partly dropped fails", () => {
  const message = `feat(x): fine (#1)\n\nfix(y): second entry\nintro\n${BAD_LINES[0]}`;
  const result = checkSquashMessage({ message });
  assert.equal(result.parsed, 1);
  assert.equal(result.ok, false);
  assert.equal(result.offending[0].text, BAD_LINES[0]);
});

test("a title the parser cannot read fails on line 1", () => {
  for (const title of ["Update stuff", "feat(scope: broken"]) {
    const result = checkSquashMessage({ message: `${title} (#3)` });
    assert.equal(result.ok, false, title);
    assert.deepEqual(result.offending, [{ line: 1, text: `${title} (#3)` }]);
  }
});

test("a single-commit squash keeps the commit subject and body without a bullet", () => {
  const message = buildSquashMessage({ title: "ignored: PR title", number: 9, commits: [commit("fix(a): subject\n\nbody line\n")] });
  assert.equal(message, "fix(a): subject (#9)\n\nbody line");
});

test("a single-commit squash without a body is only the title line", () => {
  assert.equal(buildSquashMessage({ title: "x", number: 9, commits: [commit("fix(a): subject")] }), "fix(a): subject (#9)");
});

test("several commits become bullets under the PR title, merge commits are left out", () => {
  const message = buildSquashMessage({
    title: "feat(x): the title",
    number: 12,
    commits: [commit("feat(x): one\n\nbody one"), commit("Merge branch 'main' into topic", 2), commit("fix(x): two")],
  });
  assert.equal(message, "feat(x): the title (#12)\n\n* feat(x): one\n\nbody one\n\n* fix(x): two");
});

test("a merge commit that is the only commit leaves just the title", () => {
  assert.equal(buildSquashMessage({ title: "chore: t", number: 2, commits: [commit("Merge branch 'main'", 2)] }), "chore: t (#2)");
});

test("extractOverride matches release-please: text between the markers, trimmed", () => {
  assert.equal(extractOverride("intro\nBEGIN_COMMIT_OVERRIDE\nfeat: a\n\nfix: b\nEND_COMMIT_OVERRIDE\ntail"), "feat: a\n\nfix: b");
  assert.equal(extractOverride("BEGIN_COMMIT_OVERRIDE\nfeat: open ended"), "feat: open ended");
  assert.equal(extractOverride("BEGIN_COMMIT_OVERRIDE\nEND_COMMIT_OVERRIDE"), "");
  assert.equal(extractOverride("no markers"), "");
  assert.equal(extractOverride(null), "");
});

test("a valid override block rescues a message with a bad line", () => {
  const message = squashWith(BAD_LINES[0]);
  assert.equal(checkSquashMessage({ message }).ok, false);
  const result = checkSquashMessage({ message, prBody: "Body\n\nBEGIN_COMMIT_OVERRIDE\nfeat(x): the real entry\nEND_COMMIT_OVERRIDE\n" });
  assert.equal(result.ok, true);
  assert.equal(result.source, "override");
  assert.equal(result.parsed, 1);
});

test("an override block is itself validated, with line numbers relative to the block", () => {
  const body = `BEGIN_COMMIT_OVERRIDE\nfeat(x): entry\n\nintro\n${BAD_LINES[1]}\nEND_COMMIT_OVERRIDE`;
  const result = checkSquashMessage({ message: "feat(x): fine (#1)", prBody: body });
  assert.equal(result.ok, false);
  assert.equal(result.source, "override");
  assert.deepEqual(result.offending, [{ line: 4, text: BAD_LINES[1] }]);
});

test("an empty override block is ignored, as release-please ignores it", () => {
  const result = checkSquashMessage({ message: squashWith(BAD_LINES[0]), prBody: "BEGIN_COMMIT_OVERRIDE\n\nEND_COMMIT_OVERRIDE" });
  assert.equal(result.ok, false);
  assert.equal(result.source, "squash");
});

test("findOffendingLines falls back to the reported position when no line probes bad", () => {
  const hits = findOffendingLines("feat: a\n\nfine line\nsecond line", ["unexpected token '(' at 3:2, valid tokens [)]"]);
  assert.deepEqual(hits, [{ line: 3, text: "fine line" }]);
});

test("the failure report names the line, the commit, and all three ways out", () => {
  const commits = [commit("feat(x): first"), { sha: "755f2ce00000", message: `feat(tooling): second\n\n${BAD_LINES[0]}`, parents: 1 }];
  const message = buildSquashMessage({ title: "feat(tooling): the title", number: 35, commits });
  const report = formatFailure(checkSquashMessage({ message }), { commits });
  assert.match(report, /would DROP this PR/);
  assert.match(report, /line 7: `\(` or `\[`\. Parsing is unchanged\./);
  assert.match(report, /commit 755f2ce "feat\(tooling\): second"/);
  assert.match(report, /Parser error: unexpected token/);
  assert.match(report, /1\. Reword the line/);
  assert.match(report, /2\. Add an override block[\s\S]*BEGIN_COMMIT_OVERRIDE[\s\S]*END_COMMIT_OVERRIDE/);
  assert.match(report, /3\. Squash the branch/);
});

test("the command line exits 1 on a bad message, 0 on a good one and 2 when it cannot run", () => {
  const dir = mkdtempSync(join(tmpdir(), "squash-"));
  const bad = join(dir, "bad.txt");
  const good = join(dir, "good.txt");
  const body = join(dir, "body.md");
  writeFileSync(bad, squashWith(BAD_LINES[1]));
  writeFileSync(good, squashWith(GOOD_LINES[0]));
  writeFileSync(body, "BEGIN_COMMIT_OVERRIDE\nfeat(x): ok\nEND_COMMIT_OVERRIDE\n");
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: { PATH: process.env.PATH } });

  const failed = run("--message-file", bad);
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /Ways out/);
  assert.match(failed.stdout, /^::error title=/m);
  assert.equal(run("--message-file", good).status, 0);
  assert.equal(run("--message-file", bad, "--body-file", body).status, 0);
  assert.equal(run().status, 2);
});
