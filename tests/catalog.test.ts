import { buildCatalogPoets, groupCatalogByPoet } from "../src/dlc/catalog";
import { parseDlcDirectory } from "../src/dlc/parser";
import { chapterLabel } from "../src/ui/chapterLabel";

describe("catalog grouping", () => {
  it("groups works by poetId and uses poet portraits from roster", () => {
    const shelves = groupCatalogByPoet([
      {
        id: "a",
        version: "1",
        title: "水调歌头",
        author: "海狸老师",
        poet: "苏轼",
        poetId: "sushi",
        workTitle: "水调歌头·明月几时有",
        summary: "x",
      },
    ]);
    expect(shelves).toHaveLength(1);
    expect(shelves[0]?.poetId).toBe("sushi");
    expect(shelves[0]?.poetPortraitUrl).toBe("/poets/sushi.webp");
    expect(shelves[0]?.works[0]?.title).toBe("水调歌头");
  });
});

describe("chapter labels", () => {
  it("uses Chinese chapter names", () => {
    expect(chapterLabel(1)).toBe("第一章");
    expect(chapterLabel(3)).toBe("第三章");
  });
});

describe("classroom roles", () => {
  it("loads teacher classmate and student from the demo pack", () => {
    const dlc = parseDlcDirectory("dlc/sushi/shuidiao-getou/hailao-shuidiao");
    expect(dlc.manifest.poetId).toBe("sushi");
    expect(dlc.manifest.author).toBe("海狸老师");
    expect(dlc.manifest.classroom.teacher).toBe("teacher");
  });
});

describe("curriculum roster", () => {
  it("highlights compiled DLC works and greys the rest", () => {
    const poets = buildCatalogPoets([
      {
        id: "hailao-shuidiao",
        version: "1",
        title: "水调歌头",
        author: "海狸老师",
        poet: "苏轼",
        poetId: "sushi",
        workTitle: "水调歌头·明月几时有",
        summary: "x",
      },
    ]);
    expect(poets.map((item) => item.poet)).toEqual(["李白", "杜甫", "杜牧", "苏轼", "李商隐", "王昌龄"]);
    const sushi = poets.find((item) => item.poetId === "sushi");
    const libai = poets.find((item) => item.poetId === "libai");
    expect(sushi?.available).toBe(true);
    expect(libai?.available).toBe(false);
    expect(sushi?.poetPortraitUrl).toBe("/poets/sushi.webp");
    expect(libai?.poetPortraitUrl).toBe("/poets/libai.webp");
    const work = sushi?.works.find((item) => item.title.includes("水调歌头"));
    expect(work?.available).toBe(true);
    expect(work?.dlcs).toHaveLength(1);
    expect(work?.dlcs[0]?.author).toBe("海狸老师");
    expect(work?.dlcs[0]?.displayAuthor).toBe("海狸老师");
    expect(work?.primaryDlcId).toBeDefined();
    expect(sushi?.works.find((item) => item.title.includes("密州出猎"))?.available).toBe(false);
    expect(libai?.works).toHaveLength(5);
  });

  it("supports multiple DLC packs for the same work with duplicate author suffixes", () => {
    const poets = buildCatalogPoets([
      {
        id: "pack-a",
        version: "1",
        title: "水调歌头",
        author: "海狸老师",
        poet: "苏轼",
        poetId: "sushi",
        workTitle: "水调歌头·明月几时有",
        summary: "a",
      },
      {
        id: "pack-b",
        version: "1",
        title: "水调歌头",
        author: "海狸老师",
        poet: "苏轼",
        poetId: "sushi",
        workTitle: "水调歌头·明月几时有",
        summary: "b",
      },
      {
        id: "pack-c",
        version: "1",
        title: "水调歌头",
        author: "小明",
        poet: "苏轼",
        poetId: "sushi",
        workTitle: "水调歌头·明月几时有",
        summary: "c",
      },
    ]);
    const sushi = poets.find((item) => item.poetId === "sushi");
    const work = sushi?.works.find((item) => item.title.includes("水调歌头"));
    expect(work?.available).toBe(true);
    expect(work?.dlcs).toHaveLength(3);
    // pack-a 和 pack-b 都是海狸老师，第二个显示为 "海狸老师.a"
    const hailaoPacks = work?.dlcs.filter((p) => p.author === "海狸老师") ?? [];
    expect(hailaoPacks).toHaveLength(2);
    expect(hailaoPacks.some((p) => p.displayAuthor === "海狸老师")).toBe(true);
    expect(hailaoPacks.some((p) => p.displayAuthor === "海狸老师.a")).toBe(true);
    // 小明只有一个，不加后缀
    const xiaomingPacks = work?.dlcs.filter((p) => p.author === "小明") ?? [];
    expect(xiaomingPacks).toHaveLength(1);
    expect(xiaomingPacks[0]?.displayAuthor).toBe("小明");
    // primaryDlcId 存在且属于 dlcs 中
    expect(work?.primaryDlcId).toBeDefined();
    expect(work?.dlcs.some((p) => p.id === work?.primaryDlcId)).toBe(true);
  });
});
