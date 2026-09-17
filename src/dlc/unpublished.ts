/**
 * 仓库里仍保留、测试仍可 parse，但不出现在线上目录 / play 的包。
 *
 * - `hailao-shuidiao`：课堂课包，不进公网目录（扣子版靠 perHost 策略自己上架）。
 * - `hailao-shuidiao-hh_3408594`：上面那个课包的学员上传副本（海狸老师 v1.1.0），
 *   与仓库包 `sushi-shuidiao-hailao-v2` 同属苏轼《水调歌头》。2026-09-17 定为
 *   线上该篇目只保留海棠海棠的 v2.x，故一并隐藏。OSS 上的原始数据没有删，
 *   想恢复只需把 id 从本名单里去掉。
 *
 * 注意：本名单同时用于 uploadPack 的「上架 id 冲突」校验，所以被列进来的 id
 * 也不能再通过管理台重新上传（对这个篇目而言是想要的效果）。
 */
export const UNPUBLISHED_DLC_IDS = new Set(["hailao-shuidiao", "hailao-shuidiao-hh_3408594"]);

export function isUnpublishedDlc(id: string): boolean {
  return UNPUBLISHED_DLC_IDS.has(id);
}

export function excludeUnpublished<T extends { id: string }>(items: T[]): T[] {
  return items.filter((item) => !isUnpublishedDlc(item.id));
}
