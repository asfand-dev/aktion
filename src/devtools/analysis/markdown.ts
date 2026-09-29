/**
 * Aktion DevTools — Markdown for bug reports and exported audits.
 *
 * Report text is built from values the app produced — URLs, log lines, CSS
 * selectors, state — and none of it may change the report's structure. Rather
 * than escaping characters one by one (easy to get wrong: a pipe escaped with a
 * backslash is undone by a backslash already in the value), app text goes into
 * code spans and fenced blocks whose delimiter is longer than any run of
 * backticks inside it, which CommonMark renders as literal text.
 */

function longestBacktickRun(text: string): number {
  let longest = 0;
  for (const run of text.match(/`+/g) ?? []) longest = Math.max(longest, run.length);
  return longest;
}

/** One line of text: control characters (newlines included) become single spaces. */
export function singleLine(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001f\u007f]+/g, " ");
}

/** An inline code span that nothing in `text` can close early. */
export function inlineCode(text: string): string {
  const body = singleLine(text);
  if (body === "") return "` `";
  const fence = "`".repeat(longestBacktickRun(body) + 1);
  // CommonMark strips one space from each side of a span that starts and ends
  // with one, and a span cannot start or end with a backtick next to its fence:
  // padding with a space covers both.
  const pad = body.startsWith("`") || body.endsWith("`") || (body.startsWith(" ") && body.endsWith(" ") && body.trim() !== "") ? " " : "";
  return `${fence}${pad}${body}${pad}${fence}`;
}

/** A fenced code block that no line of `lines` can close early. */
export function codeBlock(lines: ReadonlyArray<string>, info = ""): string[] {
  const body = lines.flatMap((line) => line.split(/\r\n|\r|\n/));
  const fence = "`".repeat(Math.max(3, longestBacktickRun(body.join("\n")) + 1));
  return [`${fence}${info}`, ...body, fence];
}
