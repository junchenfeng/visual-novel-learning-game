import type { PoemGloss } from "../dlc/schema";

export function glossAnnotation(gloss: PoemGloss) {
  return gloss.pinyin ? `${gloss.pinyin} ${gloss.meaning}` : gloss.meaning;
}
