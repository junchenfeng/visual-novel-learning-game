import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { dlcAssetBasePath, packRevision, staticDlcAssetKey } from "../src/assets/cdn";
import { pruneStaleRevisions, STALE_REVISION_GRACE_MS } from "../src/dlc/publishUpload";
import type { CompiledDlc, Manifest } from "../src/dlc/schema";
import {
  convertPackRastersToWebp,
  extractZipBuffer,
  findPackRoot,
  resolveSafeZipTarget,
  resolveUploadTarget,
  retargetCompiledDlc,
  uploadedDlcId,
  validateUploadManifest,
} from "../src/dlc/uploadPack";
import { groupKeysByDelimiter, type PoemStore } from "../src/server/poemStore";

function baseManifest(overrides: Partial<Manifest> = {}): Manifest {
  return {
    schemaVersion: 1,
    id: "student-shuidiao",
    version: "1.0.0",
    title: "水调歌头",
    author: "学生甲",
    poet: "苏轼",
    poetId: "sushi",
    workTitle: "水调歌头・明月几时有",
    summary: "课堂作业",
    startStoryNodeId: "start",
    classroom: { teacher: "teacher", classmate: "classmate", student: "student" },
    files: { story: "content/story.yaml", poem: "content/poem.yaml", quiz: "content/quiz.yaml" },
    characters: [{ id: "sushi", name: "苏轼" }],
    ...overrides,
  } as Manifest;
}

describe("upload zip unpack", () => {
  it("rejects zip-slip paths", () => {
    const dest = mkdtempSync(path.join(tmpdir(), "zip-slip-"));
    expect(() => resolveSafeZipTarget(dest, "../secret.txt")).toThrow(/不安全路径/);
    expect(() => resolveSafeZipTarget(dest, "foo/../../outside.txt")).toThrow(/不安全路径/);
    rmSync(dest, { recursive: true, force: true });
  });

  it("finds manifest under a single top-level folder", async () => {
    const zip = new JSZip();
    zip.file("pack/manifest.yaml", "id: demo\n");
    const dest = mkdtempSync(path.join(tmpdir(), "zip-root-"));
    await extractZipBuffer(Buffer.from(await zip.generateAsync({ type: "nodebuffer" })), dest);
    expect(findPackRoot(dest)).toBe(path.join(dest, "pack"));
    rmSync(dest, { recursive: true, force: true });
  });
});

describe("upload manifest checks", () => {
  const form = { userId: "xiaoli", poetId: "sushi", workTitle: "水调歌头・明月几时有" };

  it("rejects poet/work mismatch and another owner's composed id", () => {
    expect(
      validateUploadManifest({
        form,
        manifest: baseManifest({ poetId: "libai" }),
        reservedGitIds: new Set(),
      }),
    ).toEqual(expect.arrayContaining([expect.stringMatching(/poetId/)]));

    expect(
      validateUploadManifest({
        form,
        manifest: baseManifest({ workTitle: "望岳" }),
        reservedGitIds: new Set(),
      }),
    ).toEqual(expect.arrayContaining([expect.stringMatching(/workTitle/)]));

    expect(
      validateUploadManifest({
        form,
        manifest: baseManifest(),
        reservedGitIds: new Set(),
        existing: {
          userId: "other",
          dlcId: "student-shuidiao-xiaoli",
          poetId: "sushi",
          poet: "苏轼",
          workTitle: "水调歌头",
          title: "水调歌头",
          author: "别人",
          version: "1",
          summary: "x",
          uploadedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).toEqual(expect.arrayContaining([expect.stringMatching(/已由 other 上传/)]));
  });

  it("allows copying a teaching short-id because the published id includes userId", () => {
    expect(
      validateUploadManifest({
        form,
        manifest: baseManifest({ id: "hailao-shuidiao" }),
        reservedGitIds: new Set(["hailao-shuidiao"]),
      }),
    ).toEqual([]);
  });

  it("allows the same user id to overwrite their pack", () => {
    expect(
      validateUploadManifest({
        form,
        manifest: baseManifest(),
        reservedGitIds: new Set(["hailao-shuidiao"]),
        existing: {
          userId: "xiaoli",
          dlcId: "student-shuidiao-xiaoli",
          poetId: "sushi",
          poet: "苏轼",
          workTitle: "水调歌头",
          title: "水调歌头",
          author: "学生甲",
          version: "1",
          summary: "x",
          uploadedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    ).toEqual([]);
  });
});

describe("pack raster conversion", () => {
  it("converts png assets to webp and rewrites yaml refs", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "pack-webp-"));
    mkdirSync(path.join(root, "assets"), { recursive: true });
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#334455" },
    })
      .png()
      .toBuffer();
    writeFileSync(path.join(root, "assets", "bg.png"), png);
    writeFileSync(path.join(root, "content-story.yaml"), "background: assets/bg.png\n");
    const replacements = await convertPackRastersToWebp(root);
    expect(replacements.get("assets/bg.png")).toBe("assets/bg.webp");
    expect(readFileSync(path.join(root, "content-story.yaml"), "utf8")).toContain("assets/bg.webp");
    rmSync(root, { recursive: true, force: true });
  });
});

describe("upload id is short-id plus user-id", () => {
  it("gives two students different published ids for the same teaching short-id", () => {
    expect(uploadedDlcId("hailao-shuidiao", "hh_11016863")).toBe("hailao-shuidiao-hh_11016863");
    expect(resolveUploadTarget({ userId: "hh_11016863", shortId: "hailao-shuidiao" })).toEqual({
      targetId: "hailao-shuidiao-hh_11016863",
    });
    expect(resolveUploadTarget({ userId: "hh_1578", shortId: "hailao-shuidiao" })).toEqual({
      targetId: "hailao-shuidiao-hh_1578",
    });
  });

  it("does not double-append when the short-id already includes the user id", () => {
    expect(uploadedDlcId("hailao-shuidiao-hh_11016863", "hh_11016863")).toBe("hailao-shuidiao-hh_11016863");
  });

  it("does not remap onto the official git pack", () => {
    expect(resolveUploadTarget({ userId: "hh_11016863", shortId: "sushi-shuidiao-hailao-v2" })).toEqual({
      targetId: "sushi-shuidiao-hailao-v2-hh_11016863",
    });
  });

  it("rewrites compiled asset urls onto the target id", () => {
    const compiled = {
      publicBasePath: "/dlc/old-id",
      manifest: {
        id: "old-id",
        characters: [
          { id: "sushi", name: "苏轼", portraitUrl: "/dlc/old-id/assets/p.webp" },
          { id: "teacher", name: "老师", portraitUrl: "/portraits/teacher-cutout.webp" },
        ],
      },
      story: {
        chapters: [{ chapter: 1, backgroundUrl: "/dlc/old-id/assets/bg.webp" }],
      },
    } as CompiledDlc;
    const retargeted = retargetCompiledDlc(compiled, "git-id");
    expect(retargeted.manifest.id).toBe("git-id");
    expect(retargeted.publicBasePath).toBe("/dlc/git-id");
    expect(retargeted.manifest.characters[0]?.portraitUrl).toBe("/dlc/git-id/assets/p.webp");
    expect(retargeted.manifest.characters[1]?.portraitUrl).toBe("/portraits/teacher-cutout.webp");
    expect(retargeted.story.chapters[0]?.backgroundUrl).toBe("/dlc/git-id/assets/bg.webp");
  });
});

function fixtureCompiled(): CompiledDlc {
  return {
    publicBasePath: "/dlc/old-id",
    manifest: {
      id: "old-id",
      characters: [
        { id: "sushi", name: "苏轼", portraitUrl: "/dlc/old-id/assets/p.webp" },
        { id: "teacher", name: "老师", portraitUrl: "/portraits/teacher-cutout.webp" },
      ],
    },
    story: { chapters: [{ chapter: 1, backgroundUrl: "/dlc/old-id/assets/bg.webp" }] },
  } as CompiledDlc;
}

/**
 * 资源版本段：治的是「CDN 与浏览器按完整 URL + immutable 缓存一年，同名文件覆盖后
 * 学员看到传了新版本但图没变」。所以下面钉死两件事：版本段由**内容指纹**决定
 * （不是 manifest.version——「改了内容忘升版本」正是这个坑最常见的触发方式），
 * 以及站点路径 / OSS key / 本地 public 目录三处必须同一个口径。
 */
describe("asset revision segment", () => {
  it("derives the revision from the content fingerprint, not from the version", () => {
    const sha = "F9774F4280F8C5AEEF47B7DDE1478AD51677DDF9A8B55AE07463ECD93D2C0B23";
    expect(packRevision(sha)).toBe("r-f9774f42");
    expect(packRevision(sha.toLowerCase())).toBe(packRevision(sha));
    // 指纹缺失或不合规时退回无版本段的老路径：老编译产物、老测试照常工作
    expect(packRevision(undefined)).toBe("");
    expect(packRevision("abc")).toBe("");
    expect(packRevision("zzzzzzzz")).toBe("");
  });

  it("keeps the site path and the OSS key on one shared rule", () => {
    expect(dlcAssetBasePath("demo")).toBe("/dlc/demo");
    expect(dlcAssetBasePath("demo", "r-f9774f42")).toBe("/dlc/demo/r-f9774f42");
    expect(dlcAssetBasePath("demo", "r-zz")).toBe("/dlc/demo");
    expect(staticDlcAssetKey("demo", "assets/bg.webp", "r-f9774f42")).toBe(
      "poem-rpg/static/dlc/demo/r-f9774f42/assets/bg.webp",
    );
    expect(staticDlcAssetKey("demo", "/assets/bg.webp")).toBe("poem-rpg/static/dlc/demo/assets/bg.webp");
  });

  it("injects the revision into compiled urls, including the already-suffixed id", () => {
    const compiled = fixtureCompiled();
    const retargeted = retargetCompiledDlc(compiled, "old-id-hh_1578", "r-f9774f42");
    expect(retargeted.publicBasePath).toBe("/dlc/old-id-hh_1578/r-f9774f42");
    expect(retargeted.manifest.characters[0]?.portraitUrl).toBe(
      "/dlc/old-id-hh_1578/r-f9774f42/assets/p.webp",
    );
    expect(retargeted.manifest.characters[1]?.portraitUrl).toBe("/portraits/teacher-cutout.webp");
    expect(retargeted.story.chapters[0]?.backgroundUrl).toBe(
      "/dlc/old-id-hh_1578/r-f9774f42/assets/bg.webp",
    );

    // manifest.id 本来就以「-自己 userId」结尾时 uploadedDlcId 会原样返回，过去会被
    // early return 跳过版本段注入，这类包就永远吃旧缓存。
    const selfSuffixed = retargetCompiledDlc(
      {
        ...compiled,
        publicBasePath: "/dlc/pack-hh_1578",
        manifest: {
          ...compiled.manifest,
          id: "pack-hh_1578",
          characters: [
            { id: "sushi", name: "苏轼", portraitUrl: "/dlc/pack-hh_1578/assets/p.webp" },
            { id: "teacher", name: "老师", portraitUrl: "/portraits/teacher-cutout.webp" },
          ],
        },
      },
      "pack-hh_1578",
      "r-f9774f42",
    );
    expect(selfSuffixed.publicBasePath).toBe("/dlc/pack-hh_1578/r-f9774f42");
    expect(selfSuffixed.manifest.characters[0]?.portraitUrl).toBe(
      "/dlc/pack-hh_1578/r-f9774f42/assets/p.webp",
    );

    // 没有版本段（老路径、仓库课包）时行为完全不变
    expect(retargetCompiledDlc(compiled, "old-id")).toBe(compiled);
  });
});

type FixtureObject = { body: string; updatedAt: string };

function fixtureStore(seed: Record<string, FixtureObject> = {}) {
  const objects = new Map<string, FixtureObject>(Object.entries(seed));
  const store: PoemStore & { objects: Map<string, FixtureObject> } = {
    objects,
    async getObject(key) {
      const item = objects.get(key);
      return item ? Buffer.from(item.body, "utf8") : null;
    },
    async putObject(key, body) {
      objects.set(key, { body: body.toString("utf8"), updatedAt: new Date().toISOString() });
    },
    async deleteObject(key) {
      objects.delete(key);
    },
    async readJson() {
      return null;
    },
    async writeJson() {
      /* 本组用例只关心对象层，不关心 JSON 索引 */
    },
    async listObjects(prefix, options) {
      const keys = [...objects.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, item]) => ({ key, size: item.body.length, updatedAt: item.updatedAt }));
      return groupKeysByDelimiter(prefix, keys, options?.delimiter);
    },
  };
  return store;
}

describe("stale revision pruning", () => {
  const base = "poem-rpg/static/dlc/daya";
  const now = new Date("2026-09-23T04:00:00.000Z");
  const staleAt = new Date(now.getTime() - STALE_REVISION_GRACE_MS).toISOString();

  it("deletes superseded revisions, keeps the current one", async () => {
    const store = fixtureStore({
      [`${base}/r-11111111/assets/a.webp`]: { body: "old", updatedAt: staleAt },
      [`${base}/r-22222222/assets/a.webp`]: { body: "new", updatedAt: now.toISOString() },
      [`${base}/assets/legacy.webp`]: { body: "legacy", updatedAt: staleAt },
    });
    const removed = await pruneStaleRevisions({
      store,
      dlcId: "daya",
      keepPrefix: `${base}/r-22222222/`,
      now,
    });
    expect(removed.sort()).toEqual([`${base}/assets/`, `${base}/r-11111111/`]);
    expect([...store.objects.keys()]).toEqual([`${base}/r-22222222/assets/a.webp`]);
  });

  it("keeps the previous revision while a session may still be reading it", async () => {
    const store = fixtureStore({
      [`${base}/r-11111111/assets/a.webp`]: {
        body: "prev",
        updatedAt: new Date(now.getTime() - 60_000).toISOString(),
      },
      [`${base}/r-22222222/assets/a.webp`]: { body: "new", updatedAt: now.toISOString() },
    });
    const removed = await pruneStaleRevisions({
      store,
      dlcId: "daya",
      keepPrefix: `${base}/r-22222222/`,
      now,
    });
    expect(removed).toEqual([]);
    expect(store.objects.size).toBe(2);
  });

  it("never touches another pack and never guesses without a timestamp", async () => {
    const other = "poem-rpg/static/dlc/other-pack/r-33333333/assets/a.webp";
    const store = fixtureStore({
      [`${base}/r-11111111/assets/a.webp`]: { body: "old", updatedAt: "" },
      [other]: { body: "x", updatedAt: staleAt },
    });
    const removed = await pruneStaleRevisions({
      store,
      dlcId: "daya",
      keepPrefix: `${base}/r-22222222/`,
      now,
    });
    expect(removed).toEqual([]);
    expect(store.objects.has(other)).toBe(true);
    expect(store.objects.has(`${base}/r-11111111/assets/a.webp`)).toBe(true);
  });
});
