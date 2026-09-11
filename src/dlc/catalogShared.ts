export type CatalogPack = {
  id: string;
  version: string;
  title: string;
  author: string;
  displayAuthor: string;
  summary: string;
};

export type CatalogWork = {
  title: string;
  available: boolean;
  dlcs: CatalogPack[];
  primaryDlcId?: string;
};

export function normalizeWorkTitle(value: string) {
  return value.replace(/[・·．.、（）()\s]/g, "");
}

export function titlesMatch(left: string, right: string) {
  const a = normalizeWorkTitle(left);
  const b = normalizeWorkTitle(right);
  return a === b || a.includes(b) || b.includes(a);
}

export function computeDisplayAuthors(packs: CatalogPack[]): CatalogPack[] {
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
    const suffix = index === 1 ? "" : `.${String.fromCharCode(96 + index - 1)}`;
    return { ...pack, displayAuthor: `${pack.author}${suffix}` };
  });
}

export function randomPickId(packs: CatalogPack[]): string | undefined {
  if (packs.length === 0) return undefined;
  const index = Math.floor(Math.random() * packs.length);
  return packs[index]?.id;
}

export function resolveSelectedDlcId(
  work: Pick<CatalogWork, "dlcs" | "primaryDlcId">,
  savedId?: string,
): string | undefined {
  if (savedId && work.dlcs.some((pack) => pack.id === savedId)) {
    return savedId;
  }
  if (work.primaryDlcId && work.dlcs.some((pack) => pack.id === work.primaryDlcId)) {
    return work.primaryDlcId;
  }
  return randomPickId(work.dlcs);
}
