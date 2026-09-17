import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
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
