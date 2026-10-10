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

  /**
   * 播放侧的资源地址改写：上传包的资源路径里带一个内容版本段
   * （`/dlc/<dlcId>/r-<内容指纹>`，见 src/assets/cdn.ts 的 packRevision），
   * 三类地址都必须从这个基点长出来。少一层就是线上 404——BGM 曾经自己拼
   * `/dlc/<dlcId>`，正是被这条断言揪出来的。
   */
  it("上传包的背景 / 立绘 / BGM 都改写到带版本段的 CDN 地址", async () => {
    const previousCdn = process.env.CDN_BASE_URL;
    process.env.CDN_BASE_URL = "https://cdn.test";
    try {
      const port = await loadUploadedContent();
      port.setUploadedDlcSource({
        listPacks: async () => [],
        loadCompiled: async () => uploadedCompiledFixture,
      });

      const { loadCompiledDlc } = await import("../src/dlc/loadCompiled");
      const dlc = await loadCompiledDlc("demo-zaofa-baidi");
      const base = "https://cdn.test/poem-rpg/static/dlc/demo-zaofa-baidi/r-85348ecf";

      expect(dlc?.publicBasePath).toBe(base);
      expect(dlc?.story.chapters[0]?.backgroundUrl).toBe(`${base}/assets/backgrounds/chapter-1.webp`);
      expect(dlc?.manifest.characters[0]?.portraitUrl).toBe(`${base}/assets/portraits/libai.webp`);
      expect(dlc?.manifest.assets?.music).toEqual({ poem: `${base}/assets/backgrounds/bgm-poem.m4a` });
      // 内建公共角色不挂在包路径下，不该被改写
      expect(dlc?.manifest.characters[1]?.portraitUrl).toBe(
        "https://cdn.test/poem-rpg/static/portraits/teacher-cutout.webp",
      );
    } finally {
      if (previousCdn === undefined) {
        delete process.env.CDN_BASE_URL;
      } else {
        process.env.CDN_BASE_URL = previousCdn;
      }
    }
  });
});

/** 一份真正能过 compiledDlcSchema 的最小编译产物（版本段已写进 publicBasePath）。 */
const uploadedCompiledFixture = {
  schemaVersion: 1,
  publicBasePath: "/dlc/demo-zaofa-baidi/r-85348ecf",
  manifest: {
    schemaVersion: 1,
    id: "demo-zaofa-baidi",
    version: "1.0.0",
    title: "早发白帝城",
    author: "测试老师",
    poet: "李白",
    poetId: "libai",
    workTitle: "早发白帝城",
    summary: "测试课包",
    startStoryNodeId: "start",
    classroom: { teacher: "teacher", classmate: "classmate", student: "student" },
    files: { story: "content/story.yaml", poem: "content/poem.yaml", quiz: "content/quiz.yaml" },
    characters: [
      {
        id: "libai",
        name: "李白",
        portraitUrl: "/dlc/demo-zaofa-baidi/r-85348ecf/assets/portraits/libai.webp",
      },
      { id: "teacher", name: "老师", portraitUrl: "/portraits/teacher-cutout.webp" },
    ],
    assets: { music: { poem: "assets/backgrounds/bgm-poem.m4a" } },
    endings: [],
  },
  story: {
    startNodeId: "start",
    chapters: [
      {
        chapter: 1,
        backgroundUrl: "/dlc/demo-zaofa-baidi/r-85348ecf/assets/backgrounds/chapter-1.webp",
      },
    ],
    nodes: {},
  },
  poem: {
    schemaVersion: 1,
    title: "早发白帝城",
    lines: [
      { id: "line1", original: "朝辞白帝彩云间", translation: "清晨告别白云间的白帝城", glosses: [] },
    ],
  },
  quiz: {
    schemaVersion: 1,
    gradingPrompt: "按要点打分",
    summaryPrompt: "总结本课",
    questions: [
      {
        id: "q1",
        type: "choice",
        prompt: "「千里江陵一日还」表达了什么心情？",
        options: [
          { id: "a", label: "轻快", feedback: "对，是获释后的轻快" },
          { id: "b", label: "悲苦", feedback: "再看一遍行程的节奏" },
        ],
        correctOptionId: "a",
        feedbackSpeaker: "teacher",
      },
    ],
  },
};
