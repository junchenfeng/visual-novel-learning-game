import { parseDlcDirectory } from "../src/dlc/parser";
import { isChoiceQuestion } from "../src/dlc/quizHelpers";
import {
  DlcValidationError,
  easterEggSchema,
  exploreNodeSchema,
  manifestSchema,
} from "../src/dlc/schema";
import { validateStoryGraph } from "../src/dlc/graphValidator";
import type { StoryNode } from "../src/dlc/schema";

function node(partial: StoryNode): StoryNode {
  return partial;
}

describe("DLC schema and story graph", () => {
  it("compiles the built-in 水调歌头 pack", () => {
    const dlc = parseDlcDirectory("dlc/sushi/shuidiao-getou/hailao-shuidiao");
    expect(dlc.manifest.id).toBe("hailao-shuidiao");
    expect(dlc.quiz.questions).toHaveLength(3);
    expect(dlc.quiz.questions.every(isChoiceQuestion)).toBe(true);
    const [background, word, theme] = dlc.quiz.questions.filter(isChoiceQuestion);
    expect(background).toMatchObject({ id: "q_separate", feedbackSpeaker: "teacher" });
    expect(background?.hint).toBeUndefined();
    expect(word).toMatchObject({ id: "q_chanjuan", feedbackSpeaker: "classmate" });
    expect(word?.hint).toBeUndefined();
    expect(theme).toMatchObject({
      id: "q_theme",
      feedbackSpeaker: "teacher",
      hint: { isCorrect: false },
    });
    expect(dlc.quiz.gradingPrompt.length).toBeGreaterThan(8);
    expect(dlc.quiz.summaryPrompt.length).toBeGreaterThan(8);
    expect(Object.values(dlc.story.nodes).some((item) => item.type === "gameOver")).toBe(true);
    expect(Object.keys(dlc.story.nodes).length).toBeGreaterThan(8);
    expect(dlc.poem.lines.length).toBeGreaterThan(4);
    expect(dlc.story.chapters).toHaveLength(3);
    expect(dlc.story.chapters.every((chapter) => chapter.backgroundUrl)).toBe(true);
    expect(
      Object.values(dlc.story.nodes)
        .filter((item) => item.type === "narration" || item.type === "fact")
        .every((item) => !("speaker" in item) && !("portrait" in item)),
    ).toBe(true);
    expect(
      dlc.manifest.characters.find((character) => character.id === "suzhe")
        ?.portraitUrl,
    ).toBeUndefined();
  });

  it("treats easterEgg as optional and only accepts registered kinds", () => {
    const dlc = parseDlcDirectory("dlc/sushi/shuidiao-getou/hailao-shuidiao");
    expect(dlc.manifest.easterEgg).toBeUndefined();
    expect(easterEggSchema.safeParse({ kind: "placeholder" }).success).toBe(true);
    expect(easterEggSchema.safeParse({ kind: "fill-in" }).success).toBe(true);
    expect(easterEggSchema.safeParse({ kind: "not-a-game" }).success).toBe(false);
  });

  it("accepts phased music config { story?, poem? } and legacy single path", () => {
    const base = {
      schemaVersion: 1,
      id: "demo",
      version: "1.0.0",
      title: "示例",
      author: "作者",
      poet: "诗人",
      poetId: "demo",
      workTitle: "示例作品",
      summary: "简介",
      startStoryNodeId: "start",
      classroom: { teacher: "t", classmate: "c", student: "s" },
      files: { story: "story.yaml", poem: "poem.yaml", quiz: "quiz.yaml" },
      characters: [{ id: "t", name: "老师" }],
    };
    const pair = { ...base, assets: { music: { story: "a.mp3", poem: "b.mp3" } } };
    const single = { ...base, assets: { music: "bgm.mp3" } };
    const onlyPoem = { ...base, assets: { music: { poem: "b.mp3" } } };
    expect(manifestSchema.safeParse(pair).success).toBe(true);
    expect(manifestSchema.safeParse(single).success).toBe(true);
    expect(manifestSchema.safeParse(onlyPoem).success).toBe(true);
  });

  it("accepts explore objects with mixed valid flags", () => {
    const parsed = exploreNodeSchema.safeParse({
      id: "look",
      type: "explore",
      chapter: 1,
      chapterTitle: "测",
      text: "找找看",
      nextNodeId: "next",
      objects: [
        { id: "moon", name: "月", memory: "圆", valid: true },
        { id: "wine", name: "酒", memory: "醉", valid: false },
        { id: "letter", name: "信", memory: "家书", valid: true },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.objects.filter((item) => item.valid).map((item) => item.id)).toEqual([
        "moon",
        "letter",
      ]);
    }
  });

  it("rejects explore nodes that have no valid clues", () => {
    const result = exploreNodeSchema.safeParse({
      id: "look",
      type: "explore",
      chapter: 1,
      chapterTitle: "测",
      text: "找找看",
      nextNodeId: "next",
      objects: [{ id: "decoy", name: "假", memory: "不是", valid: false }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a choice that does not converge", () => {
    const nodes: StoryNode[] = [
      node({
        id: "start",
        type: "choice",
        chapter: 1,
        chapterTitle: "测",
        text: "选",
        convergesTo: "join",
        choices: [
          { id: "a", label: "A", nextNodeId: "join" },
          { id: "b", label: "B", nextNodeId: "dead" },
        ],
      }),
      node({
        id: "join",
        type: "narration",
        chapter: 1,
        chapterTitle: "测",
        text: "汇合",
      }),
      node({
        id: "dead",
        type: "narration",
        chapter: 1,
        chapterTitle: "测",
        text: "走丢了",
      }),
    ];
    const result = validateStoryGraph("start", nodes);
    expect(result.ok).toBe(false);
    expect(result.errors.some((item) => item.includes("无法汇流"))).toBe(true);
  });

  it("allows a choice branch to end in gameOver", () => {
    const nodes: StoryNode[] = [
      node({
        id: "start",
        type: "choice",
        chapter: 1,
        chapterTitle: "测",
        text: "选",
        convergesTo: "join",
        choices: [
          { id: "a", label: "A", nextNodeId: "join" },
          { id: "b", label: "B", nextNodeId: "over" },
        ],
      }),
      node({
        id: "join",
        type: "narration",
        chapter: 1,
        chapterTitle: "测",
        text: "汇合",
      }),
      node({
        id: "over",
        type: "gameOver",
        chapter: 1,
        chapterTitle: "测",
        text: "此路不通",
      }),
    ];
    expect(validateStoryGraph("start", nodes).ok).toBe(true);
  });

  it("rejects explore as the start node", () => {
    const result = validateStoryGraph("look", [
      node({
        id: "look",
        type: "explore",
        chapter: 1,
        chapterTitle: "测",
        text: "找找看",
        nextNodeId: "end",
        objects: [{ id: "moon", name: "月", memory: "圆", valid: true }],
      }),
      node({
        id: "end",
        type: "narration",
        chapter: 1,
        chapterTitle: "测",
        text: "结束",
      }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors.some((item) => item.includes("起始节点不能是 explore"))).toBe(true);
  });

  it("allows narration to enter a true ending", () => {
    const result = validateStoryGraph("start", [
      node({
        id: "start",
        type: "narration",
        chapter: 1,
        chapterTitle: "测",
        text: "旁白",
        nextNodeId: "end",
      }),
      node({
        id: "end",
        type: "gameOver",
        chapter: 1,
        chapterTitle: "测",
        text: "终章",
        endingId: "ending_home",
      }),
    ]);
    expect(result.ok).toBe(true);
  });

  it("rejects a diverging choice that never reaches a true ending", () => {
    const result = validateStoryGraph("start", [
      node({
        id: "start",
        type: "choice",
        chapter: 1,
        chapterTitle: "测",
        text: "选",
        choices: [
          { id: "a", label: "A", nextNodeId: "dead" },
          { id: "b", label: "B", nextNodeId: "also_dead" },
        ],
      }),
      node({
        id: "dead",
        type: "narration",
        chapter: 1,
        chapterTitle: "测",
        text: "走丢了",
      }),
      node({
        id: "also_dead",
        type: "narration",
        chapter: 1,
        chapterTitle: "测",
        text: "也走丢了",
      }),
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors.some((item) => item.includes("无法到达任何结局节点"))).toBe(true);
  });

  it("rejects narration that jumps to gameOver", () => {
    const nodes: StoryNode[] = [
      node({
        id: "start",
        type: "narration",
        chapter: 1,
        chapterTitle: "测",
        text: "旁白",
        nextNodeId: "over",
      }),
      node({
        id: "over",
        type: "gameOver",
        chapter: 1,
        chapterTitle: "测",
        text: "此路不通",
      }),
    ];
    const result = validateStoryGraph("start", nodes);
    expect(result.ok).toBe(false);
    expect(result.errors.some((item) => item.includes("只能由选项进入"))).toBe(true);
  });

  it("treats fact nodes as linear pages that cannot jump to gameOver", () => {
    const ok = validateStoryGraph("start", [
      node({
        id: "start",
        type: "fact",
        chapter: 1,
        chapterTitle: "测",
        heading: "变法",
        text: "史实说明",
        nextNodeId: "end",
      }),
      node({
        id: "end",
        type: "narration",
        chapter: 1,
        chapterTitle: "测",
        text: "结束",
      }),
    ]);
    expect(ok.ok).toBe(true);

    const bad = validateStoryGraph("start", [
      node({
        id: "start",
        type: "fact",
        chapter: 1,
        chapterTitle: "测",
        text: "史实说明",
        nextNodeId: "over",
      }),
      node({
        id: "over",
        type: "gameOver",
        chapter: 1,
        chapterTitle: "测",
        text: "此路不通",
      }),
    ]);
    expect(bad.ok).toBe(false);
    expect(bad.errors.some((item) => item.includes("只能由选项进入"))).toBe(true);
  });

  it("rejects unsafe resource paths", () => {
    expect(() =>
      parseDlcDirectory("tests/fixtures/missing-dlc"),
    ).toThrow();
  });
});

describe("compiler errors", () => {
  it("surfaces DlcValidationError name", () => {
    const error = new DlcValidationError(["bad"]);
    expect(error.name).toBe("DlcValidationError");
    expect(error.message).toContain("bad");
  });
});
