/**
 * 线上课包 hailao-v2（苏轼《水调歌头》，作者 海棠海棠）的 BGM 配置。
 *
 * 为什么单独一个文件：这个包只进主站，不进扣子仓库（coze.config.json 里
 * `dlc/sushi/shuidiao-getou/hailao-v2/` 与 `generated/` 都在 exclude）。所以本文件
 * 也列在 exclude 里——**别把这条断言挪回 tests/dlc-schema.test.ts**，那个文件是共享的，
 * 扣子仓库没有这个包，会当场把它的自检跑红。
 *
 * 背景（2026-09-17 线上「BGM 没声音」）：
 * - 不是 CDN 的问题：音频在 CDN 上 200 / audio/mp4，页面拿到的也已是 CDN 绝对地址。
 * - 真因是 manifest 只配了 music.poem，而 resolveMusicZone 把
 *   intro / story / easterEgg 全归到 story 区间 → 开场、剧情、填词彩蛋全程静音。
 * 漏配这种错 schema 检不出来（是可选项），只有内容断言能挡。
 */
import { parseDlcDirectory } from "../src/dlc/parser";

describe("线上课包 hailao-v2 的 BGM", () => {
  it("剧情与读词两个区间都配了音频（parseDlcDirectory 顺带校验文件真的在包里）", () => {
    const dlc = parseDlcDirectory("dlc/sushi/shuidiao-getou/hailao-v2");

    expect(dlc.manifest.assets?.music).toEqual({
      story: "assets/backgrounds/bgm-poem.m4a",
      poem: "assets/backgrounds/bgm-poem.m4a",
    });
  });
});
