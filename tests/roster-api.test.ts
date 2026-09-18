/**
 * `GET|POST /api/roster` —— 同源 HTTP 的名册通道（补齐 MCP 的 `list_roster` / `upsert_poet`）。
 *
 * 这条通道的意义是让整条链纯 HTTP 走通：查名册 → 建诗人+头像 → 提交课包 → 拿回数据。
 * 没有它，新诗人只能在配好 MCP 的客户端里建，HTTP 提交会被拒成「诗人不在名册中」。
 *
 * 路由不直接起 HTTP（本仓库 jest 是 node 环境、无路由基建），所以分两层：
 * 工具层用内存 store 测真实写入，路由按 tests/game-frame-contract.test.ts 的做法做文本契约。
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { STATIC_OSS_PREFIX } from "../src/assets/cdn";
import { INGEST_USER_ID_HINT } from "../src/ingest/l2Students";
import { listRosterTool, upsertPoetTool } from "../src/mcp/tools";
import { loadRoster } from "../src/roster/store";
import { loadGalleryConfig } from "../src/server/galleryConfig";
import { getPoemStore, groupKeysByDelimiter, type PoemStore } from "../src/server/poemStore";

const ROOT = path.join(__dirname, "..");
const USER = "hh_1578";

type MemoryStore = PoemStore & { files: Map<string, Buffer> };

function memoryStore(): MemoryStore {
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
}

async function png(width: number, height: number, color = "#334455"): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: color } })
    .png()
    .toBuffer();
}

describe("upsertPoetTool：HTTP 用二进制头像也能建诗人", () => {
  it("给出正方形头像 → 诗人进名册，头像落成 webp", async () => {
    const store = memoryStore();
    const result = (await upsertPoetTool(
      {
        userId: USER,
        poetId: "dufu",
        poet: "杜甫",
        portraitBuffer: await png(512, 512),
        portraitMime: "image/png",
      },
      { store },
    )) as unknown as { poet?: { poetId: string; poet: string }; issues?: string[] };

    expect(result.issues).toBeUndefined();
    expect(result.poet).toMatchObject({ poetId: "dufu", poet: "杜甫" });

    const roster = await loadRoster(store);
    expect(roster.some((poet) => poet.poetId === "dufu")).toBe(true);
    // 头像写进静态资源前缀（线上走 CDN）
    expect([...store.files.keys()].some((key) => key === `${STATIC_OSS_PREFIX}/poets/dufu.webp`)).toBe(true);
  });

  it("非正方形 / 太小 / 没给头像 → 返回 issues（HTTP 侧映射成 400）", async () => {
    const store = memoryStore();
    const notSquare = (await upsertPoetTool(
      {
        userId: USER,
        poetId: "dufu",
        poet: "杜甫",
        portraitBuffer: await png(512, 256),
        portraitMime: "image/png",
      },
      { store },
    )) as unknown as { issues?: string[] };
    expect(notSquare.issues?.join(" ")).toMatch(/正方形/);

    const tooSmall = (await upsertPoetTool(
      {
        userId: USER,
        poetId: "dufu",
        poet: "杜甫",
        portraitBuffer: await png(128, 128),
        portraitMime: "image/png",
      },
      { store },
    )) as unknown as { issues?: string[] };
    expect(tooSmall.issues?.join(" ")).toMatch(/512/);

    const missing = (await upsertPoetTool(
      { userId: USER, poetId: "dufu", poet: "杜甫" },
      { store },
    )) as unknown as { issues?: string[] };
    expect(missing.issues?.join(" ")).toMatch(/头像/);
  });

  it("同一位诗人再传一次是更新，不会重复入册", async () => {
    const store = memoryStore();
    const portrait = await png(512, 512);
    await upsertPoetTool(
      { userId: USER, poetId: "dufu", poet: "杜甫", portraitBuffer: portrait, portraitMime: "image/png" },
      { store },
    );
    await upsertPoetTool(
      { userId: USER, poetId: "dufu", poet: "杜甫（少陵野老）", portraitBuffer: portrait, portraitMime: "image/png" },
      { store },
    );
    const roster = await loadRoster(store);
    const dufu = roster.filter((poet) => poet.poetId === "dufu");
    expect(dufu).toHaveLength(1);
    expect(dufu[0]?.poet).toBe("杜甫（少陵野老）");
  });
});

describe("listRosterTool：HTTP 侧的对账入口", () => {
  it("返回诗人与篇目，并带上头像要求提示", async () => {
    const result = (await listRosterTool({ userId: USER }, { store: memoryStore() })) as unknown as {
      poets: Array<{ poetId: string; poet: string; works: string[] }>;
      portraitHint: string;
    };
    expect(result.poets.some((poet) => poet.poetId === "sushi")).toBe(true);
    expect(result.poets.find((poet) => poet.poetId === "sushi")?.works.length).toBeGreaterThan(0);
    expect(result.portraitHint).toMatch(/正方形/);
  });

  it("userId 不对 → 给出「咨询老师」，不返回名册", async () => {
    const result = await listRosterTool({ userId: "xiaoli" }, { store: memoryStore() });
    expect(JSON.stringify(result)).toContain(INGEST_USER_ID_HINT);
  });
});

describe("测试环境护栏", () => {
  it("测试进程拿不到 gallery 配置，进程级 store 只能是本地实现", () => {
    // 2026-09-18：本机 ../ai-gallery/config.json 真实存在，漏传 store 的代码直接写坏了线上
    // 诗人头像与名册。setup-env.ts 把 AI_GALLERY_CONFIG 指向不存在的路径，galleryConfig 对
    // 显式值「存在才用」，于是这里必然拿不到 OSS 配置。
    expect(loadGalleryConfig()).toBeNull();
    expect(getPoemStore().constructor.name).toBe("LocalPoemStore");
  });
});

describe("路由接线契约", () => {
  const source = readFileSync(path.join(ROOT, "app", "api", "roster", "route.ts"), "utf8");

  it("同时导出 GET 与 POST，分别接 list_roster 与 upsert_poet", () => {
    expect(source).toMatch(/export async function GET\(request: NextRequest\)/);
    expect(source).toMatch(/export async function POST\(request: NextRequest\)/);
    expect(source).toMatch(/listRosterTool\(/);
    expect(source).toMatch(/upsertPoetTool\(/);
  });

  it("multipart 字段名与 JSON 形状都对，且先挡超大头像", () => {
    expect(source).toMatch(/form\.get\("userId"\)/);
    expect(source).toMatch(/form\.get\("poetId"\)/);
    expect(source).toMatch(/form\.get\("poet"\)/);
    expect(source).toMatch(/form\.get\("portrait"\)/);
    expect(source).toMatch(/body\.portraitBase64/);
    expect(source).toMatch(/PORTRAIT_MAX_BYTES/);
  });

  it("userId 被拒按 400 + INGEST_USER_ID_HINT，issues 也映射成 400", () => {
    expect(source).toMatch(/isIngestUserIdReject\(result\)/);
    expect(source).toMatch(/INGEST_USER_ID_HINT/);
    expect(source).toMatch(/status: 400/);
    expect(source).toMatch(/issues/);
  });
});
