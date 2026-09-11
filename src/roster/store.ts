import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { STATIC_OSS_PREFIX } from "../assets/cdn";
import { titlesMatch } from "../dlc/catalogShared";
import { poetPortrait, SEED_ROSTER, type RosterPoet, type RosterWork } from "../dlc/roster";
import { getPoemStore, rosterKey, type PoemStore } from "../server/poemStore";
import { parsePoetId, portraitHint, preparePoetPortrait } from "./portrait";

function cloneRoster(poets: RosterPoet[]): RosterPoet[] {
  return poets.map((poet) => ({
    ...poet,
    works: poet.works.map((work) => ({ ...work })),
  }));
}

function asRoster(value: unknown): RosterPoet[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const poets: RosterPoet[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return null;
    }
    const record = item as Record<string, unknown>;
    const poetId = String(record.poetId ?? "").trim();
    const poet = String(record.poet ?? "").trim();
    if (!poetId || !poet) {
      return null;
    }
    const works = Array.isArray(record.works)
      ? record.works
          .map((work) => {
            if (!work || typeof work !== "object" || Array.isArray(work)) {
              return null;
            }
            const title = String((work as Record<string, unknown>).title ?? "").trim();
            return title ? ({ title } satisfies RosterWork) : null;
          })
          .filter((work): work is RosterWork => Boolean(work))
      : [];
    poets.push({
      poetId,
      poet,
      poetPortraitUrl: String(record.poetPortraitUrl ?? "").trim() || poetPortrait(poetId),
      works,
    });
  }
  return poets;
}

export async function loadRoster(store: PoemStore = getPoemStore()): Promise<RosterPoet[]> {
  const existing = asRoster(await store.readJson(rosterKey()));
  if (existing) {
    return existing;
  }
  const seeded = cloneRoster(SEED_ROSTER);
  await store.writeJson(rosterKey(), seeded);
  return seeded;
}

export async function saveRoster(poets: RosterPoet[], store: PoemStore = getPoemStore()): Promise<void> {
  await store.writeJson(rosterKey(), poets);
}

export async function upsertWork(
  poetId: string,
  workTitle: string,
  store: PoemStore = getPoemStore(),
): Promise<RosterPoet | { issues: string[] }> {
  const title = workTitle.trim();
  if (!title) {
    return { issues: ["篇目标题不能为空"] };
  }
  const roster = await loadRoster(store);
  const poet = roster.find((item) => item.poetId === poetId);
  if (!poet) {
    return { issues: [`诗人不在名册中：${poetId}。请先 upsert_poet 并上传正方形头像（${portraitHint()}）`] };
  }
  if (!poet.works.some((work) => titlesMatch(work.title, title))) {
    poet.works.push({ title });
    await saveRoster(roster, store);
  }
  return poet;
}

export async function upsertPoet(options: {
  poetId: string;
  poet: string;
  portrait: Buffer;
  portraitMime?: string;
  store?: PoemStore;
}): Promise<{ poet: RosterPoet } | { issues: string[] }> {
  const store = options.store ?? getPoemStore();
  const poetId = parsePoetId(options.poetId);
  const poetName = options.poet.trim();
  const issues: string[] = [];
  if (!poetId) {
    issues.push("诗人 id 不合法。poetId 只能用字母、数字、下划线和短横线，例如 sushi");
  }
  if (!poetName) {
    issues.push("诗人中文名不能为空");
  }
  const portrait = await preparePoetPortrait(options.portrait, options.portraitMime);
  if (!portrait.ok) {
    issues.push(...portrait.issues);
  }
  if (issues.length > 0 || !poetId || !portrait.ok) {
    return { issues };
  }

  await store.putObject(`${STATIC_OSS_PREFIX}/poets/${poetId}.webp`, portrait.webp, {
    mime: "image/webp",
    cacheControl: "public, max-age=31536000, immutable",
  });
  if (!process.env.JEST_WORKER_ID) {
    const localDir = path.join(process.cwd(), "public", "poets");
    mkdirSync(localDir, { recursive: true });
    writeFileSync(path.join(localDir, `${poetId}.webp`), portrait.webp);
  }

  const roster = await loadRoster(store);
  const existing = roster.find((item) => item.poetId === poetId);
  const next: RosterPoet = existing
    ? { ...existing, poet: poetName, poetPortraitUrl: poetPortrait(poetId) }
    : { poetId, poet: poetName, poetPortraitUrl: poetPortrait(poetId), works: [] };
  const saved = existing
    ? roster.map((item) => (item.poetId === poetId ? next : item))
    : [...roster, next];
  await saveRoster(saved, store);
  return { poet: next };
}
