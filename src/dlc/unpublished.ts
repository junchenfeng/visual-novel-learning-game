/** 仓库里仍保留、测试仍可 parse，但不出现在线上目录 / play 的包。 */
export const UNPUBLISHED_DLC_IDS = new Set(["hailao-shuidiao"]);

export function isUnpublishedDlc(id: string): boolean {
  return UNPUBLISHED_DLC_IDS.has(id);
}

export function excludeUnpublished<T extends { id: string }>(items: T[]): T[] {
  return items.filter((item) => !isUnpublishedDlc(item.id));
}
