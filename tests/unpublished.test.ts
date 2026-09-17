import { excludeUnpublished, isUnpublishedDlc } from "../src/dlc/unpublished";
import { loadCompiledDlc } from "../src/dlc/loadCompiled";

describe("unpublished DLC", () => {
  it("hides hailao-shuidiao from catalogs and play", () => {
    expect(isUnpublishedDlc("hailao-shuidiao")).toBe(true);
    expect(isUnpublishedDlc("sushi-shuidiao-hailao-v2")).toBe(false);
    expect(excludeUnpublished([{ id: "hailao-shuidiao" }, { id: "sushi-shuidiao-hailao-v2" }])).toEqual([
      { id: "sushi-shuidiao-hailao-v2" },
    ]);
  });

  it("hides 海狸老师 的上传副本，让该篇目只留海棠海棠 v2.x", () => {
    // 上传包 id = 短 id + 上传者，与仓库包不同名，所以要单独列。
    expect(isUnpublishedDlc("hailao-shuidiao-hh_3408594")).toBe(true);
    expect(
      excludeUnpublished([{ id: "hailao-shuidiao-hh_3408594" }, { id: "sushi-shuidiao-hailao-v2" }]),
    ).toEqual([{ id: "sushi-shuidiao-hailao-v2" }]);
  });

  it("does not load hailao-shuidiao even if compiled json exists", async () => {
    await expect(loadCompiledDlc("hailao-shuidiao")).resolves.toBeNull();
  });
});
