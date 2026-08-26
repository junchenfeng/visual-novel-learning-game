import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { validateStoryGraph } from "./graphValidator";
import {
  DlcValidationError,
  compiledDlcSchema,
  manifestSchema,
  poemSchema,
  quizSchema,
  relativePathSchema,
  storySchema,
  type CompiledDlc,
  type Manifest,
} from "./schema";

// 内建公共角色（无需 DLC 自带资源即可使用）
const BUILTIN_PORTRAITS: Record<string, string> = {
  teacher: "/portraits/teacher-cutout.png",
  classmate: "/portraits/classmate-cutout.png",
  student: "/portraits/student.webp",
};

function assertSafePath(value: string, label: string) {
  const result = relativePathSchema.safeParse(value);
  if (!result.success) {
    throw new DlcValidationError([`${label} 路径不安全：${value}`]);
  }
}

function loadYamlFile(filePath: string): unknown {
  const raw = readFileSync(filePath, "utf8");
  return parseYaml(raw);
}

function formatZodError(
  prefix: string,
  error: { issues: Array<{ path: PropertyKey[]; message: string }> },
) {
  return error.issues.map(
    (issue) => `${prefix}: ${issue.path.map(String).join(".") || "(root)"} ${issue.message}`,
  );
}

export function parseManifest(data: unknown): Manifest {
  const parsed = manifestSchema.safeParse(data);
  if (!parsed.success) {
    throw new DlcValidationError(formatZodError("manifest", parsed.error));
  }
  return parsed.data;
}

export function parseDlcDirectory(rootDir: string): CompiledDlc {
  const manifestPath = path.join(rootDir, "manifest.yaml");
  const manifest = parseManifest(loadYamlFile(manifestPath));

  assertSafePath(manifest.files.story, "story");
  assertSafePath(manifest.files.poem, "poem");
  assertSafePath(manifest.files.quiz, "quiz");

  const storyParsed = storySchema.safeParse(
    loadYamlFile(path.join(rootDir, manifest.files.story)),
  );
  const poemParsed = poemSchema.safeParse(
    loadYamlFile(path.join(rootDir, manifest.files.poem)),
  );
  const quizParsed = quizSchema.safeParse(
    loadYamlFile(path.join(rootDir, manifest.files.quiz)),
  );

  const issues: string[] = [];
  if (!storyParsed.success) {
    issues.push(...formatZodError("story", storyParsed.error));
  }
  if (!poemParsed.success) {
    issues.push(...formatZodError("poem", poemParsed.error));
  }
  if (!quizParsed.success) {
    issues.push(...formatZodError("quiz", quizParsed.error));
  }
  if (issues.length > 0) {
    throw new DlcValidationError(issues);
  }

  const story = storyParsed.data!;
  const poem = poemParsed.data!;
  const quiz = quizParsed.data!;
  const questionIds = new Set<string>();
  for (const question of quiz.questions) {
    if (questionIds.has(question.id)) {
      issues.push(`重复的题目 id：${question.id}`);
    }
    questionIds.add(question.id);
  }
  const graph = validateStoryGraph(manifest.startStoryNodeId, story.nodes);
  if (!graph.ok) {
    throw new DlcValidationError(graph.errors);
  }

  const characterIds = new Set(manifest.characters.map((character) => character.id));
  for (const node of story.nodes) {
    if ("portrait" in node && node.portrait && !characterIds.has(node.portrait)) {
      issues.push(`节点 ${node.id} 引用了未知角色：${node.portrait}`);
    }
  }
  for (const [role, characterId] of Object.entries(manifest.classroom)) {
    if (!characterIds.has(characterId)) {
      issues.push(`课堂角色 ${role} 引用了未知角色：${characterId}`);
    }
  }
  if (issues.length > 0) {
    throw new DlcValidationError(issues);
  }

  const nodes = Object.fromEntries(story.nodes.map((node) => [node.id, node]));
  const storyChapterNumbers = new Set(story.nodes.map((node) => node.chapter));
  const configuredChapterNumbers = new Set<number>();
  const compiledChapters = story.chapters.map((chapter) => {
    if (configuredChapterNumbers.has(chapter.chapter)) {
      issues.push(`章节 ${chapter.chapter} 的背景配置重复`);
    }
    configuredChapterNumbers.add(chapter.chapter);
    if (!storyChapterNumbers.has(chapter.chapter)) {
      issues.push(`背景配置引用了不存在的章节：${chapter.chapter}`);
    }
    if (!chapter.background) {
      return { chapter: chapter.chapter };
    }
    const backgroundPath = path.join(rootDir, chapter.background);
    if (!existsSync(backgroundPath)) {
      issues.push(`章节 ${chapter.chapter} 的背景资源不存在：${chapter.background}`);
    }
    return {
      chapter: chapter.chapter,
      backgroundUrl: `/dlc/${manifest.id}/${chapter.background}`,
    };
  });
  if (issues.length > 0) {
    throw new DlcValidationError(issues);
  }

  // 解析角色头像 URL。剧情人物可直接画在章节分镜中，不强制配置独立立绘。
  // 优先级：DLC 自带 portrait > 内建公共角色（teacher/classmate/student） > 诗人头像（id 等于 poetId 时）
  const compiledCharacters = manifest.characters.map((character) => {
    let portraitUrl: string | undefined;
    if (character.portrait) {
      // DLC 自带资源，挂在 publicBasePath 下
      portraitUrl = `/dlc/${manifest.id}/${character.portrait}`;
    } else if (BUILTIN_PORTRAITS[character.id]) {
      // 内建公共角色
      portraitUrl = BUILTIN_PORTRAITS[character.id];
    } else if (character.id === manifest.poetId) {
      // 诗人角色，用公共诗人头像
      portraitUrl = `/poets/${manifest.poetId}.webp`;
    }
    return { id: character.id, name: character.name, portraitUrl };
  });

  const compiled = compiledDlcSchema.parse({
    schemaVersion: 1,
    publicBasePath: `/dlc/${manifest.id}`,
    manifest: {
      ...manifest,
      characters: compiledCharacters,
    },
    story: {
      startNodeId: manifest.startStoryNodeId,
      chapters: compiledChapters,
      nodes,
    },
    poem,
    quiz,
  });
  return compiled;
}
