import { collapseSameAuthorVersion } from "../src/dlc/catalogShared";

describe("collapseSameAuthorVersion", () => {
  it("keeps one pack when author and version match on the same work", () => {
    const collapsed = collapseSameAuthorVersion([
      {
        id: "sushi-shuidiao-hailao-v2",
        author: "海棠海棠",
        version: "2.3.0",
        poetId: "sushi",
        workTitle: "水调歌头",
      },
      {
        id: "sushi-shuidiao-11016863",
        author: "海棠海棠",
        version: "2.3.0",
        poetId: "sushi",
        workTitle: "水调歌头·明月几时有",
      },
    ]);
    expect(collapsed).toEqual([
      {
        id: "sushi-shuidiao-11016863",
        author: "海棠海棠",
        version: "2.3.0",
        poetId: "sushi",
        workTitle: "水调歌头·明月几时有",
      },
    ]);
  });

  it("keeps two packs when the same author ships different versions", () => {
    const collapsed = collapseSameAuthorVersion([
      {
        id: "pack-v1",
        author: "海狸老师",
        version: "1.0.1",
        poetId: "sushi",
        workTitle: "水调歌头",
      },
      {
        id: "pack-v2",
        author: "海狸老师",
        version: "2.3.0",
        poetId: "sushi",
        workTitle: "水调歌头",
      },
    ]);
    expect(collapsed.map((item) => item.id)).toEqual(["pack-v1", "pack-v2"]);
  });
});
