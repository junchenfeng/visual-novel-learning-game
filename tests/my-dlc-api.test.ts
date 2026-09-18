/**
 * `GET /api/my-dlc` —— 提交课包前的「对账」接口。
 *
 * 它存在的意义是让 agent 知道「我已经上架了哪些包、什么版本」，从而少传几个大 base64。
 * 权威判定仍在服务端（reviewIngest 的 skip），这里只保证读出来的是对得上的事实：
 * 只给本人的包、带 version / uploadedAt / playUrl。
 *
 * 路由本身不直接起 HTTP：本仓库的 jest 是 node 环境、没有路由级基建（见 tests/ 里没有
 * 任何 app/api 的 import），所以走两层——底层用内存 store 测 list 逻辑，
 * 路由文件按 tests/game-frame-contract.test.ts 的做法做文本契约，专抓「路由被漏改/漏接线」。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { INGEST_USER_ID_HINT } from "../src/ingest/l2Students";
import { listMyDlcTool } from "../src/mcp/usageTools";
import { groupKeysByDelimiter, uploadsIndexKey, type PoemStore } from "../src/server/poemStore";

const ROOT = path.join(__dirname, "..");
const STUDENT_A = "hh_1578"; // 小马
const STUDENT_B = "hh_11016863"; // 李晓满

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
      return body ? JSON.parse(body.toString("utf8")) : null;
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

function pack(userId: string, dlcId: string, version: string, uploadedAt: string) {
  return {
    userId,
    dlcId,
    poetId: "sushi",
    poet: "苏轼",
    workTitle: "水调歌头",
    title: "水调歌头",
    author: "苏轼",
    version,
    summary: "",
    uploadedAt,
    contentSha256: "a".repeat(64),
  };
}

function seededStore(): MemoryStore {
  return memoryStore({
    [uploadsIndexKey()]: [
      pack(STUDENT_A, "sushi-shuidiao-hh_1578", "1.2.0", "2026-09-12T00:00:00.000Z"),
      pack(STUDENT_B, "sushi-shuidiao-hh_11016863", "2.0.0", "2026-09-11T00:00:00.000Z"),
    ],
  });
}

describe("GET /api/my-dlc 的对账数据", () => {
  it("只列本人的包，且带 version / uploadedAt / playUrl（agent 靠它判断要不要再传）", async () => {
    const result = (await listMyDlcTool(
      { userId: "hh1578", origin: "https://poem.aibeaver.cn/" },
      { store: seededStore() },
    )) as unknown as {
      userId: string;
      dlcs: Array<{ dlcId: string; version: string; uploadedAt: string; playUrl: string }>;
    };

    expect(result.userId).toBe(STUDENT_A);
    expect(result.dlcs.map((item) => item.dlcId)).toEqual(["sushi-shuidiao-hh_1578"]);
    expect(result.dlcs[0]).toMatchObject({
      version: "1.2.0",
      uploadedAt: "2026-09-12T00:00:00.000Z",
      playUrl: "https://poem.aibeaver.cn/play/sushi-shuidiao-hh_1578",
    });
  });

  it("userId 不对时给出「咨询老师」的提示，不返回任何课包", async () => {
    const result = await listMyDlcTool({ userId: "xiaoli" }, { store: seededStore() });
    expect(JSON.stringify(result)).toContain(INGEST_USER_ID_HINT);
  });
});

describe("路由接线契约", () => {
  const source = readFileSync(path.join(ROOT, "app", "api", "my-dlc", "route.ts"), "utf8");

  it("导出 GET，读 userId 查询参数，并用请求 origin 拼 playUrl", () => {
    expect(source).toMatch(/export async function GET\(request: NextRequest\)/);
    expect(source).toMatch(/searchParams\.get\("userId"\)/);
    expect(source).toMatch(/requestOrigin\(request\.headers\)/);
    expect(source).toMatch(/listMyDlcTool\(/);
  });

  it("userId 被拒时按 400 + INGEST_USER_ID_HINT 返回，其余错误也不吞", () => {
    expect(source).toMatch(/isIngestUserIdReject\(result\)/);
    expect(source).toMatch(/INGEST_USER_ID_HINT/);
    expect(source).toMatch(/status: 400/);
    expect(source).toMatch(/error\?: string/);
  });
});
