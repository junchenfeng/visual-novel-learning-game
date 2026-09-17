/**
 * 线上课包 hailao-v2（苏轼《水调歌头》，作者 海棠海棠）的 BGM 配置。
 *
 * 为什么单独一个文件：这个包只进主站，不进扣子仓库（coze.config.json 里
 * `dlc/sushi/shuidiao-getou/hailao-v2/` 与 `generated/` 都在 exclude）。所以本文件
 * 也列在 exclude 里——**别把这条断言挪回 tests/dlc-schema.test.ts**，那个文件是共享的，
 * 扣子仓库没有这个包，会当场把它的自检跑红。
 *
 * 这里钉住的是**本包的内容决定**，不是引擎能力：引擎两个区间都能配、也都能留空，
 * `story` 与 `poem` 各自可选、还可以是两首不同的曲子——那部分由共享的
 * tests/music.test.ts 守着（两个区间分开配 / 只配 poem / 都不配，三种都断言过）。
 * 本包按 2026-09-17 拍板**只给读词页配乐：剧情 / 开场 / 填词彩蛋有意静音**。
 * resolveMusicZone 把这三者都归到 story 区间，所以 manifest 里不写 `music.story`
 * 就是静音——看着像漏配，其实是要的效果。想改成全程有乐，改 manifest 时把这个
 * 断言一并改掉；别的课包不受影响，想配两段随时配。
 *
 * 顺带记住排查路径：2026-09-17 线上「BGM 没声音」查下来不是 CDN 的问题（音频在
 * CDN 上 200 / audio/mp4，页面拿到的已是 CDN 绝对地址），而是这条 story 区间没配；
 * 后来又发现 Howler 的 Web Audio 路径会被 CDN 的 CORS 拦下，才把 BGM 切到 html5 模式
 * （见 src/audio/useHowler.ts 与 docs/deploy-ecs.md）。
 */
import { parseDlcDirectory } from "../src/dlc/parser";

describe("线上课包 hailao-v2 的 BGM", () => {
  it("只配读词区间，剧情 / 开场 / 填词彩蛋有意静音", () => {
    const dlc = parseDlcDirectory("dlc/sushi/shuidiao-getou/hailao-v2");

    // parseDlcDirectory 会顺带校验音频文件真的在包里，漏放文件同样会在这里报错。
    expect(dlc.manifest.assets?.music).toEqual({
      poem: "assets/backgrounds/bgm-poem.m4a",
    });
  });
});
