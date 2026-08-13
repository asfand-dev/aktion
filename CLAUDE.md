# CLAUDE.md

Project-level instructions for AI agents (Claude Code, etc.) working on this
repository.

---

## Changelog Maintenance

Every notable code change **must** include an update to `CHANGELOG.md`.

### When to add an entry

- New component, prop, builtin, theme, or user-facing feature
- Bug fix that affects user behaviour
- Breaking change (renamed API, removed feature, changed default)
- Security fix
- Significant documentation addition or rewrite
- Version bump or release
- User-visible dependency upgrade

### When to skip

- Internal refactors with no user-visible effect
- Test-only additions
- Lockfile-only updates
- CI or build configuration changes

### How to write an entry

1. Open `CHANGELOG.md` and find today's date heading (`## YYYY-MM-DD`). If
   it does not exist, create one at the top of the file, below the
   introductory paragraph.
2. Under the date heading, add or reuse a short section title
   (`### Descriptive Title`) that summarises the theme of the changes.
3. Add bullet points describing what was added, changed, or fixed.
4. Write in **plain English** for the open-source community. Describe what
   changed and why it matters, not which files were touched.
5. Keep each bullet to one or two sentences.
6. Prefix breaking changes with **Breaking:**.

### Example

```markdown
## 2026-08-13

### Improved Form Validation

- Added real-time validation to the `EmailInput` component — errors now
  appear as the user types instead of only on submit.
- **Breaking:** Renamed the `onValidate` prop to `onCheck` across all form
  components for consistency.
- Fixed date pickers showing the wrong month when the locale is set to
  `ja-JP`.
```

---

## Other Guidelines

- Follow the existing code style and project conventions.
- Run `npm test` (or `npx vitest run`) before finishing to verify nothing
  is broken.
- Check `runtime-llm-todo.txt` in the project root before wrapping up — it
  may contain follow-up tasks related to your current work.
- See `.cursor/rules/` for additional project-specific rules on keeping the
  editor tooling, agent skill, and README in sync.
