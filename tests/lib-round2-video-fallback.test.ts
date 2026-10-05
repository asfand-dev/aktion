/**
 * VideoPlayer appended its "could not be loaded" fallback to the live frame
 * only, so the next commit — any re-render, a caption change — removed it and
 * left a black frame again.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, type Screen } from "../src/testing/index.js";

afterEach(() => cleanup());

async function mount(source: string): Promise<Screen> {
  const screen = render(source);
  await screen.flush();
  return screen;
}

const fallback = (screen: Screen): Element | null => screen.shadowRoot.querySelector(".rui-video-player-empty");

describe("VideoPlayer keeps its load-failure fallback across re-renders", () => {
  it("after every `sources` entry failed", async () => {
    const screen = await mount(`$cap = "One"
$app(VideoPlayer({ sources: [{ src: "/a.mp4", type: "video/mp4" }, { src: "/b.webm", type: "video/webm" }], caption: $cap }))`);
    const sources = [...screen.shadowRoot.querySelectorAll("video source")];
    sources.at(-1)!.dispatchEvent(new Event("error"));
    await screen.flush();
    expect(fallback(screen)?.textContent).toContain("could not be loaded");
    screen.state.set("cap", "Two");
    await screen.flush();
    expect(screen.shadowRoot.querySelector(".rui-video-player-caption")?.textContent).toBe("Two");
    expect(fallback(screen)?.textContent).toContain("could not be loaded");
  });

  it("after a failing `src`, with the author's own fallback text", async () => {
    const screen = await mount(`$cap = "One"
$app(VideoPlayer({ src: "/a.mp4", fallback: "Video unavailable", caption: $cap, controls: false }))`);
    screen.shadowRoot.querySelector("video")!.dispatchEvent(new Event("error"));
    await screen.flush();
    screen.state.set("cap", "Two");
    await screen.flush();
    expect(fallback(screen)?.textContent).toContain("Video unavailable");
    expect(screen.shadowRoot.querySelectorAll(".rui-video-player-empty")).toHaveLength(1);
  });

  it("but gives a new source its own attempt", async () => {
    const screen = await mount(`$src = "/a.mp4"
$app(VideoPlayer({ src: $src }))`);
    screen.shadowRoot.querySelector("video")!.dispatchEvent(new Event("error"));
    await screen.flush();
    expect(fallback(screen)).not.toBeNull();
    screen.state.set("src", "/b.mp4");
    await screen.flush();
    expect(fallback(screen)).toBeNull();
  });
});
