import type { UploadedDlcSource } from "../src/dlc/uploadedContent";

const fakeSource: UploadedDlcSource = {
  listPacks: async () => [],
  loadCompiled: async () => null,
};

/** jest.resetModules() 拿到的是一份全新的模块实例，复现生产构建分 chunk 的情形。 */
async function loadUploadedContent() {
  jest.resetModules();
  return import("../src/dlc/uploadedContent");
}

describe("uploaded DLC source port", () => {
  afterEach(async () => {
    const port = await loadUploadedContent();
    port.setUploadedDlcSource(null);
  });

  it("注入跨模块实例可见（Turbopack 按入口分 chunk 后仍然生效）", async () => {
    const writer = await loadUploadedContent();
    writer.setUploadedDlcSource(fakeSource);

    const reader = await loadUploadedContent();

    expect(reader.getUploadedDlcSource()).toBe(fakeSource);
  });

  it("未注入时是 null，站点视为没有上传层", async () => {
    const port = await loadUploadedContent();

    expect(port.getUploadedDlcSource()).toBeNull();
  });

  it("注入的课包会进入线上目录", async () => {
    const port = await loadUploadedContent();
    port.setUploadedDlcSource({
      listPacks: async () => [
        {
          userId: "hh_1",
          dlcId: "demo-zaofa-baidi",
          poetId: "libai",
          poet: "李白",
          workTitle: "早发白帝城",
          title: "早发白帝城",
          author: "测试老师",
          version: "1.0.0",
          summary: "测试课包",
          uploadedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      loadCompiled: async () => null,
    });

    const { loadCompiledCatalog } = await import("../src/dlc/loadCompiled");
    const catalog = await loadCompiledCatalog();

    expect(catalog.map((item) => item.id)).toContain("demo-zaofa-baidi");
  });
});
