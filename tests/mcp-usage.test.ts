import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { groupKeysByDelimiter, uploadsIndexKey, type PoemStore } from "../src/server/poemStore";
import { INGEST_USER_ID_HINT } from "../src/ingest/l2Students";
import {
  downloadUsageFilesTool,
  listMyDlcTool,
  MCP_TRANSPORT_ENV,
  usageManifestTool,
} from "../src/mcp/usageTools";
import { buildUsageManifest, clearUsageManifestCache } from "../src/usage/collect";
import { eventsLocalPath, playerSessionsPrefix, playerSlug, sessionLocalPath } from "../src/usage/paths";

const STUDENT_A = "hh_1578"; // 小马
const STUDENT_B = "hh_11016863"; // 李晓满
const DLC_A = "sushi-shuidiao-hh_1578";
const DLC_B = "sushi-shuidiao-hh_11016863";

type MemoryStore = PoemStore & { files: Map<string, Buffer> };

function memoryStore(seed: Record<string, unknown> = {}): MemoryStore {
  const files = new Map<string, Buffer>();
  const store: MemoryStore = {
    files,
    async getObject(key) {
      return files.get(key) ?? null;
    },
    async putObject(key, body) {
      files.set(key, body);
    },
    async readJson(key) {
      const body = files.get(key);
      if (!body) {
        return null;
      }
      return JSON.parse(body.toString("utf8"));
    },
    async writeJson(key, value) {
      files.set(key, Buffer.from(`${JSON.stringify(value)}\n`, "utf8"));
    },
    async listObjects(prefix, options) {
      const keys = [...files.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, body]) => ({ key, size: body.byteLength }));
      return groupKeysByDelimiter(prefix, keys, options?.delimiter);
    },
  };
  for (const [key, value] of Object.entries(seed)) {
    files.set(key, Buffer.from(`${JSON.stringify(value)}\n`, "utf8"));
  }
  return store;
}

function uploadsIndex() {
  const pack = (userId: string, dlcId: string, uploadedAt: string) => ({
    userId,
    dlcId,
    poetId: "sushi",
    poet: "苏轼",
    workTitle: "水调歌头",
    title: "水调歌头",
    author: "苏轼",
    version: "1.0.0",
    summary: "",
    uploadedAt,
  });
  return [pack(STUDENT_A, DLC_A, "2026-09-12T00:00:00.000Z"), pack(STUDENT_B, DLC_B, "2026-09-11T00:00:00.000Z")];
}

function session(dlcId: string, sessionId: string, id: string) {
  return {
    schemaVersion: 1,
    kind: "recorded",
    id,
    sessionId,
    dlcId,
    dlcVersion: "1.0.0",
    recordedAt: "2026-09-13T01:00:00.000Z",
    story: { path: [], choices: [], gameOvers: [] },
    quiz: { questions: [] },
    events: [],
  };
}

function event(dlcId: string, sessionId: string) {
  return {
    schemaVersion: 1,
    eventId: `e-${dlcId}-${sessionId}`,
    sessionId,
    dlcId,
    dlcVersion: "1.0.0",
    timestamp: "2026-09-13T01:00:00.000Z",
    type: "session.started",
    payload: {},
  };
}

function seededStore(): MemoryStore {
  return memoryStore({
    [uploadsIndexKey()]: uploadsIndex(),
    // 小马玩过 A（本人）与 B（别人）两个课包
    [`${playerSessionsPrefix("小马")}s-20260913-aaaaaaaa.json`]: session(
      DLC_A,
      "sess-a",
      "s-20260913-aaaaaaaa",
    ),
    "poem-rpg/小马/events.json": {
      schemaVersion: 1,
      events: [event(DLC_A, "sess-a"), event(DLC_B, "sess-b-other")],
    },
    // 阿豆只玩过 B
    [`${playerSessionsPrefix("阿豆")}s-20260913-bbbbbbbb.json`]: session(
      DLC_B,
      "sess-b",
      "s-20260913-bbbbbbbb",
    ),
    "poem-rpg/阿豆/events.json": { schemaVersion: 1, events: [event(DLC_B, "sess-b")] },
  });
}

function student() {
  return {
    raw: "hh_1578",
    canonical: STUDENT_A,
    studentId: "1578",
    nickname: "小马",
    classId: "l2-ck-lxh-fri-eve",
  };
}

describe("DLC 使用数据导出", () => {
  beforeEach(() => {
    clearUsageManifestCache();
  });

  afterEach(() => {
    delete process.env[MCP_TRANSPORT_ENV];
  });

  it("rejects a non-L2 userId and only writes an audit record", async () => {
    const store = seededStore();
    const before = new Set(store.files.keys());
    const result = await listMyDlcTool({ userId: "xiaoli" }, { store });
    expect(JSON.stringify(result)).toContain(INGEST_USER_ID_HINT);

    const added = [...store.files.keys()].filter((key) => !before.has(key));
    expect(added.length).toBeGreaterThan(0);
    expect(added.every((key) => key.startsWith("poem-rpg/ingest-audit/invalid_xiaoli_"))).toBe(true);
  });

  it("lists only the caller's published DLCs with a play url", async () => {
    const store = seededStore();
    const result = (await listMyDlcTool(
      { userId: "hh1578", origin: "https://poem.aibeaver.cn/" },
      { store },
    )) as unknown as { dlcs: Array<{ dlcId: string; playUrl: string }> };
    expect(result.dlcs.map((item) => item.dlcId)).toEqual([DLC_A]);
    expect(result.dlcs[0]?.playUrl).toBe(`https://poem.aibeaver.cn/play/${DLC_A}`);
  });

  it("exports only data owned by the caller's DLCs", async () => {
    const store = seededStore();
    const manifest = await buildUsageManifest(student(), { store, cacheTtlMs: 0 });
    expect(manifest.dlcIds).toEqual([DLC_A]);

    const paths = manifest.files.map((file) => file.path).sort();
    expect(paths).toEqual(
      [eventsLocalPath(DLC_A, "小马"), sessionLocalPath(DLC_A, "小马", "s-20260913-aaaaaaaa")].sort(),
    );
    expect(paths.some((item) => item.includes(DLC_B))).toBe(false);

    const sessionFile = manifest.files.find((file) => file.kind === "session");
    expect(sessionFile).toMatchObject({ dlcId: DLC_A, player: "小马", kind: "session" });
    expect(sessionFile?.source).toBe(`${playerSessionsPrefix("小马")}s-20260913-aaaaaaaa.json`);
    expect(sessionFile?.sha256).toHaveLength(64);
  });

  it("filters a player's events log row by row and never leaks other DLCs", async () => {
    const store = seededStore();
    const result = (await downloadUsageFilesTool(
      { userId: "hh_1578", paths: [eventsLocalPath(DLC_A, "小马")], cacheTtlMs: 0 },
      { store },
    )) as unknown as { files: Array<{ contentBase64: string; sha256: string }> };
    expect(result.files).toHaveLength(1);

    const log = JSON.parse(Buffer.from(result.files[0]!.contentBase64, "base64").toString("utf8")) as {
      events: Array<{ dlcId: string; sessionId: string }>;
    };
    expect(log.events).toHaveLength(1);
    expect(log.events[0]).toMatchObject({ dlcId: DLC_A, sessionId: "sess-a" });

    // 清单里的 sha256 与真实下载内容一致，增量比对才成立
    const manifest = await buildUsageManifest(student(), { store, cacheTtlMs: 0 });
    const entry = manifest.files.find((file) => file.path === eventsLocalPath(DLC_A, "小马"));
    expect(entry?.sha256).toBe(result.files[0]!.sha256);
  });

  it("rejects paths that are not in the caller's manifest", async () => {
    const store = seededStore();
    const foreign = sessionLocalPath(DLC_B, "阿豆", "s-20260913-bbbbbbbb");
    const result = (await downloadUsageFilesTool(
      { userId: "hh_1578", paths: [foreign], cacheTtlMs: 0 },
      { store },
    )) as unknown as { error?: string; invalidPaths?: string[] };
    expect(result.error).toBeTruthy();
    expect(result.invalidPaths).toEqual([foreign]);
  });

  it("keeps paths and hashes stable across calls so the client can diff", async () => {
    const store = seededStore();
    const first = await buildUsageManifest(student(), { store, cacheTtlMs: 0 });
    const second = await buildUsageManifest(student(), { store, cacheTtlMs: 0 });
    expect(second.files.map((file) => file.path)).toEqual(first.files.map((file) => file.path));
    expect(second.files.map((file) => file.sha256)).toEqual(first.files.map((file) => file.sha256));
    expect(playerSlug("小马")).toBe(playerSlug("小马 "));
  });

  it("writes files under targetDir when the transport is stdio", async () => {
    const store = seededStore();
    const dir = mkdtempSync(path.join(tmpdir(), "poem-usage-"));
    process.env[MCP_TRANSPORT_ENV] = "stdio";
    try {
      const manifest = (await usageManifestTool(
        { userId: "hh_1578", cacheTtlMs: 0 },
        { store },
      )) as unknown as { targetDir: string; files: Array<{ path: string }> };
      expect(manifest.targetDir).toBe("assets/user_data");

      const result = (await downloadUsageFilesTool(
        {
          userId: "hh_1578",
          paths: [manifest.files[0]!.path],
          targetDir: dir,
          cacheTtlMs: 0,
        },
        { store },
      )) as unknown as { transport: string; files: Array<{ path: string }> };
      expect(result.transport).toBe("stdio");
      const written = path.join(dir, result.files[0]!.path);
      expect(readFileSync(written).byteLength).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
