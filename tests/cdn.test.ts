import { getCdnBaseUrl, publicAssetUrl } from "../src/assets/cdn";

describe("publicAssetUrl", () => {
  const previous = process.env.CDN_BASE_URL;

  afterEach(() => {
    if (previous === undefined) {
      delete process.env.CDN_BASE_URL;
    } else {
      process.env.CDN_BASE_URL = previous;
    }
  });

  it("keeps local paths when CDN is unset", () => {
    delete process.env.CDN_BASE_URL;
    delete process.env.NEXT_PUBLIC_CDN_BASE_URL;
    expect(getCdnBaseUrl()).toBe("");
    expect(publicAssetUrl("/portraits/teacher-cutout.png")).toBe("/portraits/teacher-cutout.png");
  });

  it("rewrites png/jpg to webp keys on the CDN prefix", () => {
    process.env.CDN_BASE_URL = "https://cdn.aibeaver.cn/";
    expect(publicAssetUrl("/portraits/teacher-cutout.png")).toBe(
      "https://cdn.aibeaver.cn/poem-rpg/static/portraits/teacher-cutout.webp",
    );
    expect(publicAssetUrl("/dlc/demo/assets/chapter04-fields.jpg")).toBe(
      "https://cdn.aibeaver.cn/poem-rpg/static/dlc/demo/assets/chapter04-fields.webp",
    );
    expect(publicAssetUrl("/xuanzhi-bg.webp")).toBe(
      "https://cdn.aibeaver.cn/poem-rpg/static/xuanzhi-bg.webp",
    );
  });
});
