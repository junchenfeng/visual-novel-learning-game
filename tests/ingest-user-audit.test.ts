import { groupKeysByDelimiter, type PoemStore } from "../src/server/poemStore";
import { compactAuditTimestamp, writeIngestAudit } from "../src/ingest/audit";
import { runWithIngestUser } from "../src/ingest/gate";
import { INGEST_USER_ID_HINT, L2_ENROLLED_STUDENTS } from "../src/ingest/l2Students";
import { parseIngestUserId } from "../src/ingest/userId";
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
    async listObjects(prefix, options) {
      const keys = [...files.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, body]) => ({ key, size: body.byteLength }));
      return groupKeysByDelimiter(prefix, keys, options?.delimiter);
    },
  };
}

describe("L2 ingest user id", () => {
  it("accepts hh and hh_ prefixes and canonicalizes to hh_<id>", () => {
    const a = parseIngestUserId("hh11016863");
    const b = parseIngestUserId("hh_11016863");
    const c = parseIngestUserId("HH_11016863");
    expect(a?.canonical).toBe("hh_11016863");
    expect(b?.canonical).toBe("hh_11016863");
    expect(c?.canonical).toBe("hh_11016863");
    expect(a?.nickname).toBe("李晓满");
    expect(a?.classId).toBe("l2-fjc-byy-sat-aft");
  });

  it("rejects bare student ids, unknown ids, and non-hh usernames", () => {
    expect(parseIngestUserId("11016863")).toBeNull();
    expect(parseIngestUserId("hh_99999999")).toBeNull();
    expect(parseIngestUserId("xiaoli")).toBeNull();
    expect(parseIngestUserId("hh_abc")).toBeNull();
  });

  it("has unique hardcoded student ids", () => {
    const ids = L2_ENROLLED_STUDENTS.map((item) => item.studentId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(66);
  });
});

describe("ingest audit", () => {
  it("writes query, response, zip, and transcript under user-id_timestamp", async () => {
    const store = memoryStore();
    const now = new Date("2026-09-11T10:26:48.123Z");
    const user = parseIngestUserId("hh11016863");
    expect(user).not.toBeNull();
    const zip = Buffer.from("PK\u0003\u0004-fake-zip");
    const auditId = await writeIngestAudit({
      tool: "ingest_dlc",
      rawUserId: "hh11016863",
      user,
      query: { poetId: "sushi", zipBytes: zip.byteLength, zipSha256: "abc" },
      response: { verdict: "reject", issues: [] },
      transcript: { model: "deepseek-flash", prompt: "审核", lastMessage: "ok" },
      zipBuffer: zip,
      store,
      now,
    });
    expect(auditId).toBe(`hh_11016863_${compactAuditTimestamp(now.toISOString())}`);
    const prefix = `poem-rpg/ingest-audit/${auditId}`;
    const query = await store.readJson<{ query: { poetId: string; zipBase64?: string } }>(`${prefix}/query.json`);
    expect(query?.query.poetId).toBe("sushi");
    expect(query?.query.zipBase64).toBeUndefined();
    expect(store.files.has(`${prefix}/pack.zip`)).toBe(true);
    expect(store.files.has(`${prefix}/transcript.json`)).toBe(true);
  });

  it("stores failed auth under invalid_ prefix and tells the caller to ask the teacher", async () => {
    const store = memoryStore();
    const now = new Date("2026-09-11T10:26:48.123Z");
    const result = await ingestDlcTool(
      { userId: "xiaoli", poetId: "sushi", workTitle: "水调歌头", zipBase64: Buffer.from("nope").toString("base64") },
      { store, now },
    );
    expect(result.verdict).toBe("reject");
    expect(JSON.stringify(result)).toContain(INGEST_USER_ID_HINT);
    expect(result.auditId).toBe(`invalid_xiaoli_${compactAuditTimestamp(now.toISOString())}`);
    expect(store.files.has(`poem-rpg/ingest-audit/${result.auditId}/query.json`)).toBe(true);
    expect(store.files.has(`poem-rpg/ingest-audit/${result.auditId}/pack.zip`)).toBe(true);
  });

  it("keeps one tool call as one audit folder", async () => {
    const store = memoryStore();
    const now = new Date("2026-09-11T10:26:48.123Z");
    const result = await runWithIngestUser({
      tool: "list_roster",
      rawUserId: "hh_1578",
      query: { userId: "hh_1578" },
      store,
      now,
      run: async (user) => ({ poets: [], nickname: user.nickname }),
    });
    expect(result).toMatchObject({
      poets: [],
      nickname: "小马",
      auditId: `hh_1578_${compactAuditTimestamp(now.toISOString())}`,
    });
    const record = await store.readJson<{ tool: string; user: { canonical: string } }>(
      `poem-rpg/ingest-audit/hh_1578_${compactAuditTimestamp(now.toISOString())}/record.json`,
    );
    expect(record?.tool).toBe("list_roster");
    expect(record?.user.canonical).toBe("hh_1578");
  });
});
