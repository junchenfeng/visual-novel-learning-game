import type { CompiledDlc } from "./schema";

/** 分阶段 BGM 的已解析 URL。未配置的阶段为 undefined（不播放）。 */
export type MusicUrls = {
  story?: string;
  poem?: string;
};

/** 当前所处的 BGM 播放区间。 */
export type MusicZone = "story" | "poem" | "none";

/**
 * 解析分阶段 BGM 的实际 URL。
 * - 未配置任何音频 → 两个阶段都不播放（返回 {}）；
 * - 旧版单字符串写法 → 小说与读词共用同一首；
 * - 对象写法 → 按 story / poem 分别解析，缺省的阶段为 undefined。
 *
 * 路径两种形态都认：
 * - 站点绝对路径 / 完整 URL（读取时已被 loadCompiled 改写成 OSS/CDN 地址）→ 原样返回；
 * - 包内相对路径（旧编译产物、单元测试）→ 拼 publicBasePath。
 * 不这么分，改写过的地址会被再拼一次前缀。
 */
export function resolveMusicUrls(dlc: CompiledDlc): MusicUrls {
  const music = dlc.manifest.assets?.music;
  if (!music) {
    return {};
  }
  const pathOf = (p?: string) => {
    if (!p) {
      return undefined;
    }
    if (p.startsWith("/") || /^[a-z][a-z0-9+.-]*:\/\//i.test(p)) {
      return p;
    }
    return `${dlc.publicBasePath}/${p}`;
  };
  if (typeof music === "string") {
    const url = pathOf(music);
    return { story: url, poem: url };
  }
  return { story: pathOf(music.story), poem: pathOf(music.poem) };
}

/**
 * 依据当前顶层 phase（及过渡中的 pendingPhase）判断 BGM 播放区间。
 * - intro / story / easterEgg → story（前面的小说）；
 * - poem → poem（后面的读词）；
 * - pageTransition 依 pendingPhase 承接上一区间；其余（课堂、总评等）不播放。
 */
export function resolveMusicZone(phase: string, pendingPhase?: string | null): MusicZone {
  if (phase === "intro" || phase === "story" || phase === "easterEgg") {
    return "story";
  }
  if (phase === "poem") {
    return "poem";
  }
  if (phase === "pageTransition") {
    if (pendingPhase === "poem") {
      return "poem";
    }
    if (pendingPhase === "story" || pendingPhase === "easterEgg") {
      return "story";
    }
    return "none";
  }
  return "none";
}