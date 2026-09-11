import type { CompileResult } from "./compiler";
import { POET_ROSTER } from "./roster";
import { publicAssetUrl } from "../assets/cdn";
import {
  computeDisplayAuthors,
  randomPickId,
  titlesMatch,
  type CatalogPack,
  type CatalogWork,
} from "./catalogShared";

export type { CatalogPack, CatalogWork } from "./catalogShared";
export {
  normalizeWorkTitle,
  randomPickId,
  resolveSelectedDlcId,
  titlesMatch,
} from "./catalogShared";

export type PoetShelf = {
  poetId: string;
  poet: string;
  poetPortraitUrl: string;
  works: CompileResult[];
};

export type CatalogPoet = {
  poetId: string;
  poet: string;
  poetPortraitUrl: string;
  available: boolean;
  works: CatalogWork[];
};

export function groupCatalogByPoet(catalog: CompileResult[]): PoetShelf[] {
  const shelves = new Map<string, PoetShelf>();
  for (const work of catalog) {
    const existing = shelves.get(work.poetId);
    if (existing) {
      existing.works.push(work);
      continue;
    }
    const rosterPoet = POET_ROSTER.find((p) => p.poetId === work.poetId);
    shelves.set(work.poetId, {
      poetId: work.poetId,
      poet: work.poet,
      poetPortraitUrl: publicAssetUrl(rosterPoet?.poetPortraitUrl ?? `/poets/${work.poetId}.webp`),
      works: [work],
    });
  }
  return [...shelves.values()];
}

function matchDlc(pool: CompileResult[], title: string) {
  const index = pool.findIndex(
    (item) => titlesMatch(item.workTitle, title) || titlesMatch(item.title, title),
  );
  if (index < 0) {
    return undefined;
  }
  return pool.splice(index, 1)[0];
}

function compileResultToPack(item: CompileResult): CatalogPack {
  return {
    id: item.id,
    version: item.version,
    title: item.title,
    author: item.author,
    displayAuthor: item.author,
    summary: item.summary,
  };
}

export function buildCatalogPoets(catalog: CompileResult[]): CatalogPoet[] {
  const remaining = [...catalog];
  const poets = POET_ROSTER.map((poet) => {
    const pool = remaining.filter((item) => item.poetId === poet.poetId || item.poet === poet.poet);
    for (const item of pool) {
      const index = remaining.indexOf(item);
      if (index >= 0) {
        remaining.splice(index, 1);
      }
    }
    const works: CatalogWork[] = poet.works.map((work) => {
      const matched: CompileResult[] = [];
      const rest: CompileResult[] = [];
      for (const item of pool) {
        if (titlesMatch(item.workTitle, work.title) || titlesMatch(item.title, work.title)) {
          matched.push(item);
        } else {
          rest.push(item);
        }
      }
      // 把 pool 替换为 rest（原地修改，供后续循环使用）
      pool.length = 0;
      pool.push(...rest);
      const packsWithAuthor = computeDisplayAuthors(matched.map(compileResultToPack));
      return {
        title: work.title,
        available: matched.length > 0,
        dlcs: packsWithAuthor,
        primaryDlcId: randomPickId(packsWithAuthor),
      };
    });
    // 该诗人下未匹配 roster 的额外作品
    for (let i = pool.length - 1; i >= 0; i--) {
      const extra = pool[i];
      const packsWithAuthor = computeDisplayAuthors([compileResultToPack(extra)]);
      works.push({
        title: extra.workTitle,
        available: true,
        dlcs: packsWithAuthor,
        primaryDlcId: randomPickId(packsWithAuthor),
      });
      pool.splice(i, 1);
    }
    return {
      poetId: poet.poetId,
      poet: poet.poet,
      poetPortraitUrl: publicAssetUrl(poet.poetPortraitUrl),
      available: works.some((item) => item.available),
      works,
    };
  });

  const extras = groupCatalogByPoet(remaining).map((shelf) => {
    // 将 shelf.works 按 workTitle 聚合
    const workMap = new Map<string, CompileResult[]>();
    for (const w of shelf.works) {
      const key = w.workTitle;
      const list = workMap.get(key) ?? [];
      list.push(w);
      workMap.set(key, list);
    }
    const works: CatalogWork[] = [...workMap.entries()].map(([title, items]) => {
      const packsWithAuthor = computeDisplayAuthors(items.map(compileResultToPack));
      return {
        title,
        available: true,
        dlcs: packsWithAuthor,
        primaryDlcId: randomPickId(packsWithAuthor),
      };
    });
    return {
      poetId: shelf.poetId,
      poet: shelf.poet,
      poetPortraitUrl: shelf.poetPortraitUrl,
      available: true,
      works,
    };
  });

  return [...poets, ...extras];
}

export function findPoetShelf(catalog: CompileResult[], poetId: string): PoetShelf | undefined {
  return groupCatalogByPoet(catalog).find((shelf) => shelf.poetId === poetId);
}

export function findCatalogPoet(catalog: CompileResult[], poetId: string): CatalogPoet | undefined {
  return buildCatalogPoets(catalog).find((poet) => poet.poetId === poetId);
}
