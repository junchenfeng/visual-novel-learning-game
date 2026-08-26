const CHAPTER_NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];

export function chapterLabel(chapter: number): string {
  return `第${CHAPTER_NUMERALS[chapter - 1] ?? chapter}章`;
}
