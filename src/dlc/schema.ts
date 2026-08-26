import { z } from "zod";

export const SCHEMA_VERSION = 1;

export const idSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_-]*$/i, "id 只能包含字母、数字、下划线和短横线");

export const relativePathSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.includes("..") &&
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.includes("\0"),
    "资源路径必须是相对路径，且不能包含 ..",
  );

export const characterSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  portrait: relativePathSchema.optional(),
});

// 编译后的角色。剧情角色可只出现在章节分镜中，不必另配贴纸立绘。
export const compiledCharacterSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  portraitUrl: z.string().min(1).optional(),
});

export const manifestSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: idSchema,
  version: z.string().min(1),
  title: z.string().min(1),
  author: z.string().min(1),
  poet: z.string().min(1),
  poetId: idSchema,
  workTitle: z.string().min(1),
  summary: z.string().min(1),
  startStoryNodeId: idSchema,
  classroom: z.object({
    teacher: idSchema,
    classmate: idSchema,
    student: idSchema,
  }),
  files: z.object({
    story: relativePathSchema,
    poem: relativePathSchema,
    quiz: relativePathSchema,
  }),
  characters: z.array(characterSchema).min(1),
  assets: z
    .object({
      music: relativePathSchema.optional(),
    })
    .optional(),
});

export const storyChoiceOptionSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
  nextNodeId: idSchema,
  feedback: z.string().optional(),
});

export const storyChapterSchema = z.object({
  chapter: z.number().int().positive(),
  background: relativePathSchema.optional(),
});

export const compiledStoryChapterSchema = z.object({
  chapter: z.number().int().positive(),
  backgroundUrl: z.string().min(1).optional(),
});

export const narrationNodeSchema = z.object({
  id: idSchema,
  type: z.literal("narration"),
  chapter: z.number().int().positive(),
  chapterTitle: z.string().min(1),
  text: z.string().min(1),
  nextNodeId: idSchema.optional(),
});

export const choiceNodeSchema = z.object({
  id: idSchema,
  type: z.literal("choice"),
  chapter: z.number().int().positive(),
  chapterTitle: z.string().min(1),
  text: z.string().min(1),
  speaker: z.string().optional(),
  portrait: idSchema.optional(),
  convergesTo: idSchema,
  choices: z.array(storyChoiceOptionSchema).min(2),
});

export const gameOverNodeSchema = z.object({
  id: idSchema,
  type: z.literal("gameOver"),
  chapter: z.number().int().positive(),
  chapterTitle: z.string().min(1),
  text: z.string().min(1),
  speaker: z.string().optional(),
  portrait: idSchema.optional(),
});

export const factNodeSchema = z.object({
  id: idSchema,
  type: z.literal("fact"),
  chapter: z.number().int().positive(),
  chapterTitle: z.string().min(1),
  text: z.string().min(1),
  heading: z.string().min(1).optional(),
  nextNodeId: idSchema.optional(),
});

export const storyNodeSchema = z.discriminatedUnion("type", [
  narrationNodeSchema,
  choiceNodeSchema,
  gameOverNodeSchema,
  factNodeSchema,
]);

export const storySchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  chapters: z.array(storyChapterSchema).default([]),
  nodes: z.array(storyNodeSchema).min(1),
});

export const poemGlossSchema = z.object({
  word: z.string().min(1),
  pinyin: z.string().optional(),
  meaning: z.string().min(1),
});

export const poemLineSchema = z.object({
  id: idSchema,
  original: z.string().min(1),
  translation: z.string().min(1),
  note: z.string().optional(),
  glosses: z.array(poemGlossSchema).default([]),
  audio: relativePathSchema.optional(),
});

export const poemSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  title: z.string().min(1),
  lines: z.array(poemLineSchema).min(1),
});

export const quizOptionSchema = z.object({
  id: idSchema,
  label: z.string().min(1),
});

export const openQuestionSchema = z.object({
  id: idSchema,
  type: z.literal("open"),
  prompt: z.string().min(1),
  classmateAnswer: z.string().min(1),
  classmateIsCorrect: z.boolean(),
  referenceAnswer: z.string().min(1),
  misconceptions: z.array(z.string()).default([]),
  scoringPoints: z.array(z.string()).min(1),
  contextRefs: z.array(z.string()).optional(),
});

export const choiceQuestionSchema = z
  .object({
    id: idSchema,
    type: z.literal("choice"),
    prompt: z.string().min(1),
    options: z.array(quizOptionSchema).min(2),
    correctOptionId: idSchema,
    classmateOptionId: idSchema,
    explanation: z.string().min(1),
    contextRefs: z.array(z.string()).optional(),
  })
  .superRefine((question, ctx) => {
    const optionIds = new Set(question.options.map((item) => item.id));
    if (optionIds.size !== question.options.length) {
      ctx.addIssue({
        code: "custom",
        message: "选择题选项 id 不能重复",
        path: ["options"],
      });
    }
    if (!optionIds.has(question.correctOptionId)) {
      ctx.addIssue({
        code: "custom",
        message: "correctOptionId 必须是某个选项 id",
        path: ["correctOptionId"],
      });
    }
    if (!optionIds.has(question.classmateOptionId)) {
      ctx.addIssue({
        code: "custom",
        message: "classmateOptionId 必须是某个选项 id",
        path: ["classmateOptionId"],
      });
    }
  });

export const quizQuestionSchema = z.discriminatedUnion("type", [
  openQuestionSchema,
  choiceQuestionSchema,
]);

export const quizSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  gradingPrompt: z.string().min(1),
  summaryPrompt: z.string().min(1),
  questions: z.array(quizQuestionSchema).min(1),
});

export const compiledDlcSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  publicBasePath: z.string().min(1),
  manifest: manifestSchema.extend({
    characters: z.array(compiledCharacterSchema),
  }),
  story: z.object({
    startNodeId: idSchema,
    chapters: z.array(compiledStoryChapterSchema),
    nodes: z.record(idSchema, storyNodeSchema),
  }),
  poem: poemSchema,
  quiz: quizSchema,
});

export type Manifest = z.infer<typeof manifestSchema>;
export type StoryNode = z.infer<typeof storyNodeSchema>;
export type NarrationNode = z.infer<typeof narrationNodeSchema>;
export type ChoiceNode = z.infer<typeof choiceNodeSchema>;
export type GameOverNode = z.infer<typeof gameOverNodeSchema>;
export type FactNode = z.infer<typeof factNodeSchema>;
export type Poem = z.infer<typeof poemSchema>;
export type PoemGloss = z.infer<typeof poemGlossSchema>;
export type Quiz = z.infer<typeof quizSchema>;
export type QuizQuestion = z.infer<typeof quizQuestionSchema>;
export type OpenQuestion = z.infer<typeof openQuestionSchema>;
export type ChoiceQuestion = z.infer<typeof choiceQuestionSchema>;
export type CompiledDlc = z.infer<typeof compiledDlcSchema>;

export class DlcValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join("\n"));
    this.name = "DlcValidationError";
  }
}
