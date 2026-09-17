import type { CompiledDlc, Manifest } from "../src/dlc/schema";
import { resolveMusicUrls, resolveMusicZone } from "../src/dlc/music";

type MusicAsset = Manifest["assets"];

function dlcWithMusic(music: MusicAsset): CompiledDlc {
  return {
    schemaVersion: 1,
    publicBasePath: "/dlc/demo",
    manifest: {
      schemaVersion: 1,
      id: "demo",
      version: "1.0.0",
      ...(music ? { assets: music } : {}),
    },
  } as unknown as CompiledDlc;
}

describe("resolveMusicUrls", () => {
  it("no music is configured → both phases silent", () => {
    const urls = resolveMusicUrls(dlcWithMusic(undefined));
    expect(urls.story).toBeUndefined();
    expect(urls.poem).toBeUndefined();
  });

  it("legacy single-path string → shared by story and poem", () => {
    const urls = resolveMusicUrls(dlcWithMusic({ music: "assets/bgm.mp3" }));
    expect(urls.story).toBe("/dlc/demo/assets/bgm.mp3");
    expect(urls.poem).toBe("/dlc/demo/assets/bgm.mp3");
  });

  it("object with both phases → separate urls", () => {
    const urls = resolveMusicUrls(
      dlcWithMusic({
        music: { story: "assets/bgm-story.mp3", poem: "assets/bgm-poem.mp3" },
      }),
    );
    expect(urls.story).toBe("/dlc/demo/assets/bgm-story.mp3");
    expect(urls.poem).toBe("/dlc/demo/assets/bgm-poem.mp3");
  });

  it("object with only poem → story is silent", () => {
    const urls = resolveMusicUrls(dlcWithMusic({ music: { poem: "assets/bgm-poem.mp3" } }));
    expect(urls.story).toBeUndefined();
    expect(urls.poem).toBe("/dlc/demo/assets/bgm-poem.mp3");
  });

  it("already-rewritten absolute paths are used as-is", () => {
    // loadCompiled 会把 music 改写成站点绝对路径或 OSS/CDN 地址，
    // 这两种形态都不能再被拼一次 publicBasePath。
    const sitePath = resolveMusicUrls(dlcWithMusic({ music: "/dlc/demo/assets/bgm-poem.m4a" }));
    expect(sitePath.poem).toBe("/dlc/demo/assets/bgm-poem.m4a");

    const cdnUrl = "https://cdn.aibeaver.cn/poem-rpg/static/dlc/demo/assets/bgm-poem.m4a";
    const rewritten = resolveMusicUrls(dlcWithMusic({ music: { poem: cdnUrl } }));
    expect(rewritten.poem).toBe(cdnUrl);
    expect(rewritten.story).toBeUndefined();
  });
});

describe("resolveMusicZone", () => {
  it("story / intro / easterEgg map to story zone", () => {
    expect(resolveMusicZone("story")).toBe("story");
    expect(resolveMusicZone("intro")).toBe("story");
    expect(resolveMusicZone("easterEgg")).toBe("story");
  });

  it("poem maps to poem zone", () => {
    expect(resolveMusicZone("poem")).toBe("poem");
  });

  it("pageTransition follows the pending phase", () => {
    expect(resolveMusicZone("pageTransition", "poem")).toBe("poem");
    expect(resolveMusicZone("pageTransition", "story")).toBe("story");
    expect(resolveMusicZone("pageTransition", "easterEgg")).toBe("story");
    expect(resolveMusicZone("pageTransition", "lessonTransition")).toBe("none");
    expect(resolveMusicZone("pageTransition", null)).toBe("none");
  });

  it("quiz / summary / outro have no bgm", () => {
    expect(resolveMusicZone("quiz")).toBe("none");
    expect(resolveMusicZone("summary")).toBe("none");
    expect(resolveMusicZone("outro")).toBe("none");
    expect(resolveMusicZone("unknown")).toBe("none");
  });
});