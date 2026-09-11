import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { hasBlocking } from "../src/ingest/issues";
import { ingestCodexWorkspace, writeCodexWorkspace } from "../src/ingest/codexReview";
import { disposeMachineReview, machineReviewZip } from "../src/ingest/machineReview";
import { reviewAndIngestDlc } from "../src/ingest/reviewIngest";
import { SEED_ROSTER } from "../src/dlc/roster";

describe("machine review", () => {
  it("rejects an empty zip with structured issues", async () => {
    const zip = new JSZip();
    const buffer = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    const review = await machineReviewZip({
      form: { userId: "xiaoli", poetId: "sushi", workTitle: "水调歌头" },
      zipBuffer: buffer,
      roster: SEED_ROSTER,
    });
    expect(hasBlocking(review.issues)).toBe(true);
    expect(review.issues.some((issue) => issue.source === "machine")).toBe(true);
    disposeMachineReview(review);
  });

  it("asks for upsert_poet when the poet is missing", async () => {
    const zip = new JSZip();
    zip.file("manifest.yaml", "schemaVersion: 1\nid: demo\n");
    const buffer = Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
    const review = await machineReviewZip({
      form: { userId: "xiaoli", poetId: "taoyuanming", workTitle: "归园田居" },
      zipBuffer: buffer,
      roster: SEED_ROSTER,
    });
    expect(review.issues.map((issue) => issue.message).join("\n")).toMatch(/诗人|manifest|schema|校验|字段/);
    disposeMachineReview(review);
  });
});

describe("codex workspace", () => {
  it("copies dlc-spec into SPEC.md", () => {
    const workspace = mkdtempSync(path.join(tmpdir(), "codex-ws-"));
    writeCodexWorkspace({ workspace, machineIssues: [] });
    expect(readFileSync(path.join(workspace, "SPEC.md"), "utf8")).toMatch(/DLC 数据结构/);
    expect(readFileSync(path.join(workspace, "TASK.md"), "utf8")).toMatch(/review.json/);
    rmSync(workspace, { recursive: true, force: true });
  });

  it("keeps the job directory inside the unpack folder", () => {
    const unpack = mkdtempSync(path.join(tmpdir(), "poem-dlc-ingest-"));
    expect(ingestCodexWorkspace(unpack)).toBe(path.join(unpack, "codex-job"));
    expect(path.resolve(ingestCodexWorkspace(unpack))).not.toBe(path.resolve(path.join(tmpdir(), "codex-job")));
    rmSync(unpack, { recursive: true, force: true });
  });

  it("copies pack files without nesting the job directory", () => {
    const unpack = mkdtempSync(path.join(tmpdir(), "poem-dlc-ingest-"));
    writeFileSync(path.join(unpack, "manifest.yaml"), "id: demo\n");
    const workspace = ingestCodexWorkspace(unpack);
    mkdirSync(workspace, { recursive: true });
    writeCodexWorkspace({ workspace, packRoot: unpack, machineIssues: [] });
    expect(readFileSync(path.join(workspace, "pack", "manifest.yaml"), "utf8")).toMatch(/demo/);
    expect(existsSync(path.join(workspace, "pack", "codex-job"))).toBe(false);
    rmSync(unpack, { recursive: true, force: true });
  });
});

describe("review and ingest", () => {
  it("does not publish when the zip cannot pass machine checks", async () => {
    const zip = new JSZip();
    const result = await reviewAndIngestDlc({
      form: { userId: "xiaoli", poetId: "sushi", workTitle: "水调歌头" },
      zipBuffer: Buffer.from(await zip.generateAsync({ type: "nodebuffer" })),
      specReviewer: async () => [],
    });
    expect(result.verdict).toBe("reject");
    expect(result.playUrl).toBeUndefined();
    expect(hasBlocking(result.issues)).toBe(true);
  });
});
