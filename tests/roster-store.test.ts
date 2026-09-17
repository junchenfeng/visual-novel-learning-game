import sharp from "sharp";
import { groupKeysByDelimiter, type PoemStore } from "../src/server/poemStore";
import { SEED_ROSTER } from "../src/dlc/roster";
import { preparePoetPortrait } from "../src/roster/portrait";
import { loadRoster, upsertPoet, upsertWork } from "../src/roster/store";

function memoryStore(): PoemStore {
  const files = new Map<string, Buffer>();
  return {
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

async function squarePng(size: number): Promise<Buffer> {
  return sharp({
    create: { width: size, height: size, channels: 3, background: "#334455" },
  })
    .png()
    .toBuffer();
}

describe("poet portrait size", () => {
  it("rejects a small or non-square image", async () => {
    const small = await squarePng(64);
    const smallCheck = await preparePoetPortrait(small);
    expect(smallCheck.ok).toBe(false);
    if (!smallCheck.ok) {
      expect(smallCheck.issues.join("\n")).toMatch(/512/);
    }
    const rect = await sharp({
      create: { width: 800, height: 600, channels: 3, background: "#112233" },
    })
      .png()
      .toBuffer();
    const rectCheck = await preparePoetPortrait(rect);
    expect(rectCheck.ok).toBe(false);
    if (!rectCheck.ok) {
      expect(rectCheck.issues.join("\n")).toMatch(/正方形/);
    }
  });

  it("accepts a 512px square portrait", async () => {
    const check = await preparePoetPortrait(await squarePng(512));
    expect(check.ok).toBe(true);
  });
});

describe("roster store", () => {
  it("seeds the built-in poets then adds a work and a poet", async () => {
    const store = memoryStore();
    const seeded = await loadRoster(store);
    expect(seeded.map((item) => item.poetId)).toEqual(SEED_ROSTER.map((item) => item.poetId));

    const withWork = await upsertWork("sushi", "定风波", store);
    expect("issues" in withWork).toBe(false);
    if (!("issues" in withWork)) {
      expect(withWork.works.some((work) => work.title === "定风波")).toBe(true);
    }

    const created = await upsertPoet({
      poetId: "taoyuanming",
      poet: "陶渊明",
      portrait: await squarePng(512),
      store,
    });
    expect("issues" in created).toBe(false);
    const again = await loadRoster(store);
    expect(again.some((item) => item.poetId === "taoyuanming" && item.poet === "陶渊明")).toBe(true);
  });

  it("refuses to add a work for a missing poet", async () => {
    const store = memoryStore();
    const result = await upsertWork("nobody", "短歌行", store);
    expect("issues" in result).toBe(true);
    if ("issues" in result) {
      expect(result.issues.join("\n")).toMatch(/upsert_poet/);
    }
  });
});
