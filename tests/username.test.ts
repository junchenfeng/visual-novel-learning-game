import { normalizeUsername } from "../src/auth/username";
import { resolveSelectedDlcId, type CatalogWork } from "../src/dlc/catalog";
import { emptyPrefs } from "../src/server/poemStore";

describe("username isolation", () => {
  it("accepts chinese and ascii names", () => {
    expect(normalizeUsername("小狸")).toBe("小狸");
    expect(normalizeUsername("hailao_01")).toBe("hailao_01");
  });

  it("rejects empty, short, path-like, or overlong names", () => {
    expect(normalizeUsername("")).toBeNull();
    expect(normalizeUsername("一")).toBeNull();
    expect(normalizeUsername("../admin")).toBeNull();
    expect(normalizeUsername("a/b")).toBeNull();
    expect(normalizeUsername("x".repeat(33))).toBeNull();
  });
});

describe("selected dlc prefs", () => {
  const work: CatalogWork = {
    title: "水调歌头",
    available: true,
    dlcs: [
      {
        id: "hailao-shuidiao",
        version: "1",
        title: "水调歌头",
        author: "海狸老师",
        displayAuthor: "海狸老师",
        summary: "a",
      },
      {
        id: "sushi-shuidiao-hailao-v2",
        version: "2",
        title: "水调歌头",
        author: "海棠海棠",
        displayAuthor: "海棠海棠",
        summary: "b",
      },
    ],
    primaryDlcId: "sushi-shuidiao-hailao-v2",
  };

  it("keeps a saved pack if it still exists", () => {
    expect(resolveSelectedDlcId(work, "hailao-shuidiao")).toBe("hailao-shuidiao");
  });

  it("falls back to primary when saved pack is gone", () => {
    expect(resolveSelectedDlcId(work, "missing")).toBe("sushi-shuidiao-hailao-v2");
  });

  it("starts with empty prefs", () => {
    expect(emptyPrefs()).toEqual({ selectedDlcByWork: {} });
  });
});
