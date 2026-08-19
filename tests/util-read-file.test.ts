/**
 * `$util.readFile` — reading a file the user picked with `FileUpload`.
 *
 * The contract under test is narrower than "it reads a file", and each half is
 * load-bearing at a call site:
 *
 *  1. **It takes the PICK, not just a file.** `FileUpload`'s `onSelect` is
 *     invoked with the whole selection — a `FileList` in the browser, a plain
 *     array after a remove — so `$util.readFile(files)` is the common call and
 *     `$util.readFile(files[0])` the rarer one. Both resolve.
 *  2. **It never rejects.** Every failure resolves `""`, because `await` in
 *     Aktion does not suspend: an author writes `.then(...)`, and a rejection
 *     would surface as an unhandled promise rather than at the call site.
 *
 * The blob-like duck typing is also asserted directly. `instanceof Blob` would be
 * wrong — a `File` from another realm (an `<iframe>`'s picker, a test double)
 * has a different constructor and the same interface — so the tests below feed
 * it plain objects carrying only `text()` / `arrayBuffer()`.
 */

import { describe, expect, it } from "vitest";
import { Util } from "../src/runtime/util.js";

/** A `File` as the browser hands it over, minus the realm-specific identity. */
const filePick = (text: string, type = "text/plain"): unknown[] => [
  {
    name: "id_ed25519.pub",
    type,
    size: text.length,
    text: () => Promise.resolve(text),
    arrayBuffer: () => Promise.resolve(new TextEncoder().encode(text).buffer),
  },
];

/** The array-LIKE `FileList` the DOM actually produces: `length` + index access. */
const fileList = (text: string): unknown => {
  const entry = filePick(text)[0];
  return { 0: entry, length: 1 };
};

const SSH_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKxK operator@example.com";

describe("$util.readFile — the pick", () => {
  it("reads the first file out of an array pick", async () => {
    await expect(Util.readFile(filePick(SSH_KEY))).resolves.toBe(SSH_KEY);
  });

  it("reads the first file out of a FileList", async () => {
    await expect(Util.readFile(fileList(SSH_KEY))).resolves.toBe(SSH_KEY);
  });

  it("reads a single file passed on its own", async () => {
    await expect(Util.readFile(filePick(SSH_KEY)[0])).resolves.toBe(SSH_KEY);
  });

  it("skips non-file entries rather than reading position 0 blindly", async () => {
    // A remove handler builds the remaining array by filtering, and a caller may
    // hand over a sparse or padded list. Position is not identity.
    await expect(Util.readFile([null, undefined, filePick(SSH_KEY)[0]])).resolves.toBe(SSH_KEY);
  });
});

describe("$util.readFile — representations", () => {
  it("decodes UTF-8 text by default", async () => {
    await expect(Util.readFile(filePick("Grüße 🌍"))).resolves.toBe("Grüße 🌍");
  });

  it("falls back to arrayBuffer + TextDecoder when the host has no Blob.text()", async () => {
    const noText = {
      type: "text/plain",
      size: SSH_KEY.length,
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode(SSH_KEY).buffer),
    };
    await expect(Util.readFile(noText)).resolves.toBe(SSH_KEY);
  });

  it("builds a data URI carrying the file's own MIME type", async () => {
    const url = await Util.readFile(filePick("hi", "text/plain"), { as: "dataUrl" });
    expect(url).toBe(`data:text/plain;base64,${btoa("hi")}`);
  });

  it("returns the base64 payload alone, without the data: prefix", async () => {
    await expect(Util.readFile(filePick("hi"), { as: "base64" })).resolves.toBe(btoa("hi"));
  });

  it("names an untyped blob application/octet-stream rather than emitting `data:;base64,`", async () => {
    const untyped = {
      size: 2,
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode("hi").buffer),
    };
    await expect(Util.readFile(untyped, { as: "dataUrl" }))
      .resolves.toBe(`data:application/octet-stream;base64,${btoa("hi")}`);
  });

  it("encodes a file larger than one btoa chunk", async () => {
    // `String.fromCharCode(...bytes)` on a large file spreads a million
    // arguments onto the stack and throws RangeError, so the encoder chunks.
    // 8192 is the chunk size; this crosses it three times over.
    const big = "k".repeat(25_000);
    const payload = await Util.readFile(filePick(big), { as: "base64" });
    expect(payload).toBe(btoa(big));
  });

  it("treats an unknown `as` value as text rather than failing", async () => {
    await expect(Util.readFile(filePick(SSH_KEY), { as: "yaml" })).resolves.toBe(SSH_KEY);
  });
});

describe("$util.readFile — maxSize", () => {
  it("resolves empty for a file over the limit, without reading it", async () => {
    let read = false;
    const oversized = {
      size: 4096,
      type: "text/plain",
      text: () => { read = true; return Promise.resolve(SSH_KEY); },
    };
    await expect(Util.readFile(oversized, { maxSize: 1024 })).resolves.toBe("");
    expect(read).toBe(false);
  });

  it("admits a file exactly at the limit", async () => {
    const exact = { size: 4, type: "text/plain", text: () => Promise.resolve("abcd") };
    await expect(Util.readFile(exact, { maxSize: 4 })).resolves.toBe("abcd");
  });

  it("ignores a zero or absent limit", async () => {
    await expect(Util.readFile(filePick(SSH_KEY), { maxSize: 0 })).resolves.toBe(SSH_KEY);
    await expect(Util.readFile(filePick(SSH_KEY), {})).resolves.toBe(SSH_KEY);
  });
});

describe("$util.readFile — never rejects", () => {
  it("resolves empty when nothing was picked", async () => {
    await expect(Util.readFile(null)).resolves.toBe("");
    await expect(Util.readFile(undefined)).resolves.toBe("");
    await expect(Util.readFile([])).resolves.toBe("");
    await expect(Util.readFile({ length: 0 })).resolves.toBe("");
  });

  it("resolves empty when the value is not blob-like at all", async () => {
    await expect(Util.readFile("ssh-rsa AAAA")).resolves.toBe("");
    await expect(Util.readFile(42)).resolves.toBe("");
    await expect(Util.readFile({ name: "key.pub" })).resolves.toBe("");
  });

  it("resolves empty when the read itself fails", async () => {
    const unreadable = {
      size: 10,
      type: "text/plain",
      text: () => Promise.reject(new Error("NotReadableError")),
      arrayBuffer: () => Promise.reject(new Error("NotReadableError")),
    };
    await expect(Util.readFile(unreadable)).resolves.toBe("");
    await expect(Util.readFile(unreadable, { as: "dataUrl" })).resolves.toBe("");
  });

  it("resolves empty for a dataUrl of a blob that cannot produce bytes", async () => {
    // `text()` only — legitimate for a host that predates `arrayBuffer()`, and
    // there is no way to base64 a string whose encoding is unknown.
    const textOnly = { size: 2, type: "text/plain", text: () => Promise.resolve("hi") };
    await expect(Util.readFile(textOnly, { as: "base64" })).resolves.toBe("");
  });
});
