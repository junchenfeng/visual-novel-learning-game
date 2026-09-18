/**
 * 「版本与内容都没变就跳过审核」的护栏。
 *
 * 这条能力的价值全在两个判据同时成立：只比版本，学员改了内容忘升版本会被**静默跳过**
 * （他以为更新生效了，线上还是旧的）；只比指纹，光改版本号会白跑一轮 Codex 评审。
 * 所以下面既测纯函数四态，也测「指纹对什么敏感、对什么不敏感」——指纹取错的时点或范围，
 * 都会让 skip 退化成每次全量审核，或更糟：把不同的两份内容判成同一份。
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { fingerprintPackDir } from "../src/dlc/packFingerprint";
import { parseDlcDirectory } from "../src/dlc/parser";
import { SEED_ROSTER } from "../src/dlc/roster";
import { loadUploadIndex } from "../src/dlc/uploadIndex";
import { extractZipBuffer, resolveUploadTarget } from "../src/dlc/uploadPack";
import { disposeMachineReview, machineReviewZip } from "../src/ingest/machineReview";
import { reviewAndIngestDlc, shouldSkipReview } from "../src/ingest/reviewIngest";
import { groupKeysByDelimiter, uploadsIndexKey, type PoemStore } from "../src/server/poemStore";

const ROOT = path.join(__dirname, "..");
/** 仓库自带的真课包：结构完整、能被 parse，拿它当夹具比手搓最小包更抗 schema 变更。 */
const REPO_PACK = path.join(ROOT, "dlc", "sushi", "shuidiao-getou", "hailao-shuidiao");
const USER = "hh_1578";

function listFiles(root: string, prefix = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      out.push(...listFiles(path.join(root, entry.name), rel));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out.sort();
}

/** 打包一个目录；date / reverse 用来制造「同一份内容、不同 zip 字节」。 */
async function zipDir(
  dir: string,
  options: { date?: Date; reverse?: boolean } = {},
): Promise<Buffer> {
  const zip = new JSZip();
  const files = listFiles(dir);
  if (options.reverse) {
    files.reverse();
  }
  for (const rel of files) {
    zip.file(rel, readFileSync(path.join(dir, rel)), { date: options.date });
  }
  return Buffer.from(await zip.generateAsync({ type: "nodebuffer" }));
}

async function unpack(buffer: Buffer): Promise<string> {
  const dest = mkdtempSync(path.join(tmpdir(), "poem-skip-"));
  await extractZipBuffer(buffer, dest);
  return dest;
}

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

describe("fingerprintPackDir：对什么敏感、对什么不敏感", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("同一份内容 → 同一指纹，跟 zip 的时间戳与打包顺序无关", async () => {
    // 直接读仓库里的目录（= 审核侧的样子）
    const expected = fingerprintPackDir(REPO_PACK);
    expect(expected).toMatch(/^[0-9a-f]{64}$/);

    const older = await zipDir(REPO_PACK, { date: new Date("2020-01-01T00:00:00Z"), reverse: true });
    const newer = await zipDir(REPO_PACK, { date: new Date("2026-09-18T00:00:00Z") });
    // 先确认这两个 zip 的字节确实不同，否则这条用例证明不了「不能用 zip 字节当指纹」
    expect(older.equals(newer)).toBe(false);

    const a = await unpack(older);
    const b = await unpack(newer);
    dirs.push(a, b);
    expect(fingerprintPackDir(a)).toBe(expected);
    expect(fingerprintPackDir(b)).toBe(expected);
  });

  it("内容改了、文件增删都会改指纹（改了内容忘升版本能被发现）", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "poem-fp-"));
    dirs.push(dir);
    cpSync(REPO_PACK, dir, { recursive: true });
    const before = fingerprintPackDir(dir);

    const story = path.join(dir, "content", "story.yaml");
    const original = readFileSync(story, "utf8");
    writeFileSync(story, `${original}\n# 学生又改了一句台词\n`, "utf8");
    expect(fingerprintPackDir(dir)).not.toBe(before);

    writeFileSync(story, original, "utf8");
    expect(fingerprintPackDir(dir)).toBe(before);

    writeFileSync(path.join(dir, "content", "extra.yaml"), "note: 新增文件\n", "utf8");
    expect(fingerprintPackDir(dir)).not.toBe(before);

    unlinkSync(path.join(dir, "content", "extra.yaml"));
    expect(fingerprintPackDir(dir)).toBe(before);
  });

  it("忽略 __MACOSX 与 .DS_Store（macOS 打包噪音不该让指纹漂移）", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "poem-fp-noise-"));
    dirs.push(dir);
    cpSync(REPO_PACK, dir, { recursive: true });
    const before = fingerprintPackDir(dir);

    mkdirSync(path.join(dir, "__MACOSX"), { recursive: true });
    writeFileSync(path.join(dir, "__MACOSX", "._manifest.yaml"), "junk", "utf8");
    writeFileSync(path.join(dir, ".DS_Store"), "junk", "utf8");
    expect(fingerprintPackDir(dir)).toBe(before);
  });

  it("外层包裹文件夹名不参与计算（findPackRoot 已归一化到包根）", async () => {
    const zip = new JSZip();
    for (const rel of listFiles(REPO_PACK)) {
      zip.file(`我的课包/${rel}`, readFileSync(path.join(REPO_PACK, rel)));
    }
    const dir = await unpack(Buffer.from(await zip.generateAsync({ type: "nodebuffer" })));
    dirs.push(dir);
    // 包根是解压目录下的「我的课包」，指纹应与仓库里那份一致
    expect(fingerprintPackDir(path.join(dir, "我的课包"))).toBe(fingerprintPackDir(REPO_PACK));
  });
});

describe("shouldSkipReview：四态", () => {
  const existing = { version: "1.0.0", contentSha256: "a".repeat(64) };

  it("版本与指纹都相同 → 跳过", () => {
    expect(shouldSkipReview({ version: "1.0.0", contentSha256: "a".repeat(64), existing })).toBe(true);
  });

  it("版本号两端空格不算变化", () => {
    expect(shouldSkipReview({ version: " 1.0.0 ", contentSha256: "a".repeat(64), existing })).toBe(true);
  });

  it("升了版本 → 不跳过（走完整审核）", () => {
    expect(shouldSkipReview({ version: "1.0.1", contentSha256: "a".repeat(64), existing })).toBe(false);
  });

  it("版本没变但内容变了（忘升版本）→ 不跳过，必须重新审核", () => {
    expect(shouldSkipReview({ version: "1.0.0", contentSha256: "b".repeat(64), existing })).toBe(false);
  });

  it("老索引条目没有指纹 → 不跳过（加这个能力不改既有条目行为）", () => {
    expect(
      shouldSkipReview({ version: "1.0.0", contentSha256: "a".repeat(64), existing: { version: "1.0.0" } }),
    ).toBe(false);
  });

  it("本次没有指纹或没有版本（解析失败、空指纹）→ 不跳过", () => {
    expect(shouldSkipReview({ version: "1.0.0", existing })).toBe(false);
    expect(shouldSkipReview({ contentSha256: "a".repeat(64), existing })).toBe(false);
    expect(shouldSkipReview({ version: "1.0.0", contentSha256: "   ", existing })).toBe(false);
  });
});

describe("skip 依据：从机器评审到最终判决", () => {
  const manifest = parseDlcDirectory(REPO_PACK).manifest;
  const form = { userId: USER, poetId: manifest.poetId, workTitle: manifest.workTitle };
  const targetId = resolveUploadTarget({ userId: USER, shortId: manifest.id }).targetId;
  const dirs: string[] = [];

  afterAll(() => {
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function seedIndex(contentSha256?: string) {
    const dir = mkdtempSync(path.join(tmpdir(), "poem-skip-idx-"));
    dirs.push(dir);
    const store = memoryStore();
    const entry: Record<string, unknown> = {
      userId: USER,
      dlcId: targetId,
      poetId: manifest.poetId,
      poet: manifest.poet,
      workTitle: manifest.workTitle,
      title: manifest.title,
      author: manifest.author,
      version: manifest.version,
      summary: manifest.summary,
      uploadedAt: "2026-09-17T00:00:00.000Z",
    };
    if (contentSha256) {
      entry.contentSha256 = contentSha256;
    }
    store.files.set(uploadsIndexKey(), Buffer.from(JSON.stringify([entry]), "utf8"));
    return store;
  }

  it("同槽位有条目时返回既有条目与本次指纹，串起来判定为 skip", async () => {
    const store = seedIndex(fingerprintPackDir(REPO_PACK));
    const review = await machineReviewZip({
      form,
      zipBuffer: await zipDir(REPO_PACK),
      roster: SEED_ROSTER,
      store,
    });
    try {
      expect(review.manifest?.version).toBe(manifest.version);
      expect(review.contentSha256).toBe(fingerprintPackDir(REPO_PACK));
      expect(review.existing?.dlcId).toBe(targetId);
      expect(
        review.existing &&
          shouldSkipReview({
            version: review.manifest?.version,
            contentSha256: review.contentSha256,
            existing: review.existing,
          }),
      ).toBe(true);
    } finally {
      disposeMachineReview(review);
    }
  });

  it("没上架过（无既有条目）→ 不跳过，照常走审核", async () => {
    const review = await machineReviewZip({
      form,
      zipBuffer: await zipDir(REPO_PACK),
      roster: SEED_ROSTER,
      store: memoryStore(),
    });
    try {
      expect(review.existing).toBeUndefined();
      expect(review.contentSha256).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      disposeMachineReview(review);
    }
  });

  it("线上是旧版本 → 不跳过", async () => {
    const store = seedIndex(fingerprintPackDir(REPO_PACK));
    const review = await machineReviewZip({
      form,
      zipBuffer: await zipDir(REPO_PACK),
      roster: SEED_ROSTER,
      store,
    });
    try {
      const downgraded = { ...review.existing!, version: "0.1.0" };
      expect(
        shouldSkipReview({
          version: review.manifest?.version,
          contentSha256: review.contentSha256,
          existing: downgraded,
        }),
      ).toBe(false);
    } finally {
      disposeMachineReview(review);
    }
  });

  it("版本与指纹都一致 → 直接 skip：评审器一次都不跑、索引不被改写", async () => {
    const store = seedIndex(fingerprintPackDir(REPO_PACK));
    let reviewerCalls = 0;
    const result = await reviewAndIngestDlc({
      form,
      zipBuffer: await zipDir(REPO_PACK),
      roster: SEED_ROSTER,
      store,
      specReviewer: async () => {
        reviewerCalls += 1;
        return [];
      },
    });

    expect(result.verdict).toBe("skip");
    expect(result.issues).toEqual([]);
    expect(result.reason).toMatch(/未变化|保持原样/);
    expect(result.playUrl?.endsWith(`/play/${targetId}`)).toBe(true);
    // 短路必须在 Codex 之前：跑评审就谈不上「秒回」，也白烧一次 LLM
    expect(reviewerCalls).toBe(0);
    // 不重写索引 → 已上架时间不因重复提交而抖动
    const index = await loadUploadIndex(store);
    expect(index).toHaveLength(1);
    expect(index[0]?.uploadedAt).toBe("2026-09-17T00:00:00.000Z");
    expect(index[0]?.contentSha256).toBe(fingerprintPackDir(REPO_PACK));
  });

  it("版本一致但内容变了 → 不 skip，照常进评审（忘升版本不会漏更新）", async () => {
    const store = seedIndex("f".repeat(64));
    let reviewerCalls = 0;
    const result = await reviewAndIngestDlc({
      form,
      zipBuffer: await zipDir(REPO_PACK),
      roster: SEED_ROSTER,
      store,
      // 评审故意报 blocking：走到评审就算这条用例成功，同时把流程挡在 upsertWork/发布之前，
      // 免得单测真的往 store 里写一份课包。
      specReviewer: async () => {
        reviewerCalls += 1;
        return [
          {
            severity: "blocking",
            source: "spec",
            rule: "测试拦截",
            message: "评审被调用即证明没有走 skip 短路",
          },
        ];
      },
    });

    expect(result.verdict).toBe("reject");
    expect(reviewerCalls).toBe(1);
  });

  it("夹具自检：仓库课包能被 parse 且文件齐全", () => {
    expect(existsSync(path.join(REPO_PACK, "manifest.yaml"))).toBe(true);
    expect(manifest.poetId).toBe("sushi");
  });
});
