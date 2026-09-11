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

  it("does not load hailao-shuidiao even if compiled json exists", async () => {
    await expect(loadCompiledDlc("hailao-shuidiao")).resolves.toBeNull();
  });
});
