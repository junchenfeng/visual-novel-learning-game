import type { CompileResult } from "./compiler";
import { POET_ROSTER } from "./roster";

export type CatalogPack = {
  id: string;
  version: string;
  title: string;
  author: string;
  displayAuthor: string;
  summary: string;
};

export type PoetShelf = {
  poetId: string;
  poet: string;
  poetPortraitUrl: string;
  works: CompileResult[];
};

export type CatalogWork = {
  title: string;
  available: boolean;
  dlcs: CatalogPack[];
  primaryDlcId?: string;
};

export type CatalogPoet = {
  poetId: string;
  poet: string;
  poetPortraitUrl: string;
  available: boolean;
  works: CatalogWork[];
};

export function normalizeWorkTitle(value: string) {
  return value.replace(/[・·．.、（）()\s]/g, "");
}

export function titlesMatch(left: string, right: string) {
  const a = normalizeWorkTitle(left);
  const b = normalizeWorkTitle(right);
  return a === b || a.includes(b) || b.includes(a);
}

function computeDisplayAuthors(packs: CatalogPack[]): CatalogPack[] {
  const authorCounts = new Map<string, number>();
  const sorted = [...packs].sort((a, b) => a.id.localeCompare(b.id));
  for (const pack of sorted) {
    authorCounts.set(pack.author, (authorCounts.get(pack.author) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return sorted.map((pack) => {
    const count = authorCounts.get(pack.author) ?? 1;
    if (count <= 1) {
      return { ...pack, displayAuthor: pack.author };
    }
    const index = (seen.get(pack.author) ?? 0) + 1;
    seen.set(pack.author, index);
    // 第一个不加后缀，第二个起 .a .b .c ...
    const suffix = index === 1 ? "" : `.${String.fromCharCode(96 + index - 1)}`;
    return { ...pack, displayAuthor: `${pack.author}${suffix}` };
  });
}

function randomPickId(packs: CatalogPack[]): string | undefined {
  if (packs.length === 0) return undefined;
  const index = Math.floor(Math.random() * packs.length);
  return packs[index]?.id;
}

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
      poetPortraitUrl: rosterPoet?.poetPortraitUrl ?? `/poets/${work.poetId}.webp`,
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
      poetPortraitUrl: poet.poetPortraitUrl,
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
