import { ingestPreviewIndexKey, type PoemStore } from "../src/server/poemStore";
import {
  mergePreviewRows,
  nicknameForUserId,
  previewPlayDlcId,
  previewSlotKey,
  type PreviewEntry,
} from "../src/ingest/preview";
import { loadPreviewIndex, upsertPreviewEntry } from "../src/ingest/previewIndex";
import { ingestDlcTool } from "../src/mcp/tools";

function memoryStore(): PoemStore & { files: Map<string, Buffer> } {
  const files = new Map<string, Buffer>();
  return {
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
  };
}

describe("ingest preview board", () => {
  it("looks up L2 nicknames from hh ids and bare student numbers", () => {
    expect(nicknameForUserId("hh_1578")).toBe("小马");
    expect(nicknameForUserId("11016863")).toBe("李晓满");
    expect(nicknameForUserId("xiaoli")).toBe("");
  });

  it("merges published packs with later ingest statuses and hides failed play urls", () => {
    const pack = {
      userId: "hh_1578",
      dlcId: "sushi-shuidiao-hh_1578",
      poetId: "sushi",
      poet: "苏轼",
      workTitle: "水调歌头",
      title: "水调歌头",
      author: "苏轼",
      version: "1.0.0",
      summary: "",
      uploadedAt: "2026-09-12T00:00:00.000Z",
    };
    const rejected: PreviewEntry = {
      slotKey: previewSlotKey("hh_1578", "sushi", "水调歌头"),
      userId: "hh_1578",
      nickname: "小马",
      poetId: "sushi",
      poet: "苏轼",
      workTitle: "水调歌头",
      dlcId: "",
      status: "rejected",
      updatedAt: "2026-09-13T01:00:00.000Z",
    };
    const rows = mergePreviewRows([rejected], [pack]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("rejected");
    expect(previewPlayDlcId(rows[0]!)).toBe("");
  });

  it("updates one slot from reviewing to rejected", async () => {
    const store = memoryStore();
    const now = new Date("2026-09-13T01:02:03.000Z");
    await upsertPreviewEntry(
      {
        userId: "hh_1578",
        poetId: "sushi",
        workTitle: "水调歌头",
        nickname: "小马",
        poet: "苏轼",
        status: "reviewing",
        now,
      },
      store,
    );
    const afterReject = await upsertPreviewEntry(
      {
        userId: "hh_1578",
        poetId: "sushi",
        workTitle: "水调歌头",
        status: "rejected",
        dlcId: "should-clear",
        now: new Date("2026-09-13T01:03:03.000Z"),
      },
      store,
    );
    const index = await loadPreviewIndex(store);
    expect(index).toHaveLength(1);
    expect(afterReject.status).toBe("rejected");
    expect(afterReject.nickname).toBe("小马");
    expect(afterReject.dlcId).toBe("");
    expect(index[0]?.updatedAt).toBe("2026-09-13T01:03:03.000Z");
  });

  it("creates a reviewing row as soon as ingest_dlc is called, then marks reject without a play id", async () => {
    const inner = memoryStore();
    const statuses: string[] = [];
    const store: PoemStore = {
      getObject: inner.getObject.bind(inner),
      putObject: inner.putObject.bind(inner),
      readJson: inner.readJson.bind(inner),
      async writeJson(key, value) {
        if (key === ingestPreviewIndexKey() && Array.isArray(value)) {
          const status = (value[0] as { status?: string } | undefined)?.status;
          if (status) {
            statuses.push(status);
          }
        }
        return inner.writeJson(key, value);
      },
    };
    const now = new Date("2026-09-13T02:00:00.000Z");
    const result = await ingestDlcTool(
      { userId: "hh_1578", poetId: "sushi", workTitle: "水调歌头" },
      { store, now },
    );
    expect(result.verdict).toBe("reject");
    expect(result.playUrl).toBeUndefined();
    expect(statuses).toEqual(["reviewing", "rejected"]);
    const index = await loadPreviewIndex(store);
    expect(index).toHaveLength(1);
    expect(index[0]).toMatchObject({
      userId: "hh_1578",
      nickname: "小马",
      poetId: "sushi",
      workTitle: "水调歌头",
      status: "rejected",
      dlcId: "",
    });
    expect(previewPlayDlcId(index[0]!)).toBe("");
  });

  it("does not create a preview row when userId is not an L2 student", async () => {
    const store = memoryStore();
    await ingestDlcTool(
      { userId: "xiaoli", poetId: "sushi", workTitle: "水调歌头", zipBase64: Buffer.from("nope").toString("base64") },
      { store, now: new Date("2026-09-13T02:00:00.000Z") },
    );
    expect(await loadPreviewIndex(store)).toEqual([]);
  });
});
