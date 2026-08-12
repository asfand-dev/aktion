# Publishing the Aktion agent skill

How `skills/aktion/` reaches users, what the packaging guarantees, and the steps
to release a new version.

The skill is distributed three ways from one source tree. Nothing is duplicated
per channel — the same `SKILL.md` loads in all three.

| Channel | Users get | Install |
| --- | --- | --- |
| **Claude Code plugin** (primary) | `/aktion`, the reference tree, and the schema validator | `claude plugin marketplace add asfand-dev/aktion` |
| **claude.ai / Desktop skill** | `/aktion` and the reference tree; no validator (no local Node) | upload a zip of `skills/aktion` |
| **npm** | the same files under `node_modules/aktion-runtime/skills/` | `npm i aktion-runtime` |

---

## How the plugin is put together

This repository *is* the plugin. `.claude-plugin/marketplace.json` lists one
entry whose `source` is `"./"`, so the marketplace root and the plugin root are
the same directory, and Claude Code discovers the skill by scanning
`<root>/skills/`.

```
.claude-plugin/
  marketplace.json     the catalog — what `/plugin marketplace add` reads
  plugin.json          the plugin's own identity and metadata
skills/aktion/
  SKILL.md             entry point; frontmatter `name` sets the command
  references/          progressive-disclosure reference tree
  scripts/validate.mjs the validator the skill runs on its own output
tools/                 the underlying validator CLIs
vendor/language.js     committed language bundle (see below)
```

Four things about this layout are load-bearing, and each of them fails silently
when broken. All four are asserted by `tests/skill-artifacts.test.ts`.

### 1. The frontmatter `name` must equal the directory name

For a **plugin** skill, frontmatter `name` replaces the last segment of the
command and the plugin prefix stays. `skills/aktion/SKILL.md` with
`name: aktion-apps` publishes as `/aktion:aktion-apps` — and `/aktion`, the
command every document tells people to type, simply does not exist. Nothing
warns about this: not the build, not `claude plugin validate`, not the loader.
The skill loads fine and the documented entry point is missing.

With `name: aktion` the command is `/aktion:aktion`, and the bare `/aktion` also
works unless another installed command already claims that name.

### 2. Frontmatter stays inside the Agent Skills spec

Claude Code accepts about twenty frontmatter fields. claude.ai uploads and the
Skills API accept **six** — `name`, `description`, `license`, `compatibility`,
`metadata`, `allowed-tools` — and reject anything else with a hard error rather
than ignoring it:

```
Unexpected key(s) in SKILL.md frontmatter: argument-hint.
Allowed properties are: allowed-tools, compatibility, description, license, metadata, name
```

So adding a convenience field like `argument-hint` costs the skill a whole
distribution channel in exchange for an autocomplete hint. `build:skill` refuses
to build if a non-spec key appears.

### 3. `$ARGUMENTS` has to be in the body

If a skill is invoked with arguments and the body contains no `$ARGUMENTS`
placeholder, Claude Code appends `ARGUMENTS: <your input>` to the end of the
content. The request survives, but it lands at the bottom of a long reference
document that never says what to do with it — so the agent reads the reference
and explains Aktion instead of building the thing that was asked for.

`SKILL.md` puts `$ARGUMENTS` under a `## Your task` heading near the top,
followed by the deliverable contract.

### 4. The validator must work from an installed copy

`dist/` is gitignored, so a plugin install or a fresh clone gets only what git
tracks. Pointing the skill at `dist/language.js` means the validate step exits
with code 2 for every installed user — and an agent reads "could not validate"
as "nothing to fix", which ships an unverified program. That is the exact
failure this skill exists to prevent.

`npm run build:skill` therefore commits `vendor/language.js` (~1.6 MB).
`tools/language-bundle.mjs` prefers `dist/` and falls back to `vendor/`, so a
checkout always validates against the library it just built while an installed
copy still validates at all.

Exit codes carry meaning and `SKILL.md` tells the agent so: `0` clean, `1`
errors found, `2` could not run.

---

## Release checklist

1. **Build.** `npm run build` regenerates the reference tree, refreshes
   `vendor/language.js`, syncs both manifests' `version` from `package.json`,
   and validates every ` ```aktion ` example in the skill against the live
   library. It fails rather than shipping a stale or wrong skill.
2. **Test.** `npm test` — `tests/skill-artifacts.test.ts` re-checks the same
   contract plus the four packaging invariants above.
3. **Validate the plugin.** The community review pipeline runs exactly this, so
   run it first:

   ```bash
   claude plugin validate . --strict
   ```

   Expect `✔ Validation passed`. `--strict` turns warnings into errors, which
   catches a misspelled manifest field before submission. One warning is
   expected and harmless if your editor validates against schemastore rather
   than Claude Code: `displayName` is a documented Claude Code field (v2.1.143+)
   that the published JSON schema has not caught up with yet.
4. **Smoke-test the real thing.** Manifest validity does not prove the command
   exists — that is the bug this packaging was written to fix, so check it by
   hand:

   ```bash
   claude --plugin-dir .
   ```

   Then type `/aktion a settings page with profile, notifications, and billing
   sections` and confirm it writes a `.aktion` file, runs the validator, and
   reports clean.
5. **Commit `vendor/language.js`** along with the generated references. Both are
   build output that must be in git for installs to work.
6. **Tag and push.** Users on the marketplace pick up the new `version` field on
   their next `/plugin update`.

Because `version` is set explicitly in `plugin.json`, users receive an update
**only** when that field changes. It is synced from `package.json` by
`build:skill` precisely so it cannot be forgotten — a stale version is invisible,
and leaves everyone on an old skill while `/plugin update` reports "already at
the latest version".

---

## Submitting to the Claude community marketplace

Anthropic runs two public marketplaces:

- **`claude-plugins-official`** — curated by Anthropic, no application process.
  Inclusion is at their discretion; the submission form below does not feed it.
- **`claude-community`** — where third-party submissions land after automated
  validation and safety screening. This is the one to submit to.

Steps:

1. Push the repository to GitHub, public, with `.claude-plugin/marketplace.json`
   at the root. Already true for `asfand-dev/aktion`.
2. Run `claude plugin validate . --strict` and get a clean pass. The review
   pipeline runs the same check.
3. Submit through one of the in-app forms:
   - **Console** (individual authors): <https://platform.claude.com/plugins/submit>
   - **claude.ai** (requires a Team or Enterprise org with directory management
     access): <https://claude.ai/admin-settings/directory/submissions/plugins/new>
4. On approval the plugin is pinned to a commit SHA in the
   [`anthropics/claude-plugins-community`](https://github.com/anthropics/claude-plugins-community)
   catalog, and CI bumps that pin as you push. The public catalog syncs nightly,
   so there is a lag between approval and installability. Check by searching for
   `aktion` in
   [the catalog](https://github.com/anthropics/claude-plugins-community/blob/main/.claude-plugin/marketplace.json).

Once listed, users install with:

```bash
/plugin marketplace add anthropics/claude-plugins-community
/plugin install aktion@claude-community
```

Until then — and afterwards, for anyone who prefers it — the self-hosted
marketplace in this repository works with no review or waiting:

```bash
claude plugin marketplace add asfand-dev/aktion
claude plugin install aktion@aktion-tools
```

---

## Publishing the claude.ai skill

claude.ai takes a zip of the skill directory:

```bash
cd skills && zip -r aktion-skill.zip aktion
```

Add it from the skills settings on claude.ai, or **Customize** in the Claude
Desktop sidebar. Upload fails outright on a non-spec frontmatter key, which is
why `build:skill` gates on that.

The reference tree travels with the upload, so the skill teaches the full
component catalogue there. Two things do not carry over, and `SKILL.md` handles
both explicitly:

- **No validator.** There is no local Node runtime, so programs written on
  claude.ai are unchecked and the skill is required to say so rather than imply
  a check happened. Point users who want the validation gate at the Claude Code
  plugin.
- **No preview.** Artifact sandboxes block requests to external hosts, so the
  `<script src="…/aktion.js">` embed never loads and an `<aktion-app>` artifact
  renders blank; the runtime is ~2 MB, so inlining it is impractical. The skill
  routes users to the
  [playground](https://asfand-dev.github.io/aktion/playground.html) instead.

  This second one caused a real failure before it was addressed:
  `/aktion create a todo app` on claude.ai returned a **vanilla-JavaScript** HTML
  artifact. The request had not said "Aktion", the skill had not said the output
  language was non-negotiable, and "deliver something runnable" resolved in an
  artifact-first environment to "write an HTML page" — which then could not load
  the runtime, so the model rewrote the app in plain JS to make the preview work.
  Every step was locally reasonable. Hence `## Before anything else` at the top
  of `SKILL.md`, and the two tests that keep it there.
