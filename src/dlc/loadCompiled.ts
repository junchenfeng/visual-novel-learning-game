import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { publicAssetUrl } from "../assets/cdn";
import { compiledDlcSchema, DlcValidationError, type CompiledDlc } from "./schema";
import type { CompileResult } from "./compiler";
import { loadUploadIndex, loadUploadedCompiled, publishedUploads, uploadedPackToCompileResult } from "./uploadIndex";
import { excludeUnpublished, isUnpublishedDlc } from "./unpublished";

function generatedDir() {
  return path.join(process.cwd(), "generated", "dlc");
}

export function loadShippedCatalog(): CompileResult[] {
  const catalogPath = path.join(generatedDir(), "catalog.json");
  if (!existsSync(catalogPath)) {
    return [];
  }
  return JSON.parse(readFileSync(catalogPath, "utf8")) as CompileResult[];
}

export function reservedGitDlcIds(): Set<string> {
  return new Set(loadShippedCatalog().map((item) => item.id));
}

export async function loadCompiledCatalog(): Promise<CompileResult[]> {
  const shipped = loadShippedCatalog();
  const reserved = new Set(shipped.map((item) => item.id));
  const published = excludeUnpublished(shipped);
  let uploaded: Awaited<ReturnType<typeof loadUploadIndex>> = [];
  try {
    uploaded = await loadUploadIndex();
  } catch {
    uploaded = [];
  }
  const extra = publishedUploads(uploaded, reserved).map(uploadedPackToCompileResult);
  return [...published, ...extra];
}

export async function loadCompiledDlc(id: string): Promise<CompiledDlc | null> {
  if (!/^[a-z][a-z0-9_-]*$/i.test(id) || isUnpublishedDlc(id)) {
    return null;
  }
  const filePath = path.join(generatedDir(), `${id}.json`);
  if (existsSync(filePath)) {
    return parseCompiledJson(id, JSON.parse(readFileSync(filePath, "utf8")));
  }
  try {
    const uploaded = await loadUploadedCompiled(id);
    if (!uploaded) {
      return null;
    }
    return parseCompiledJson(id, uploaded);
  } catch {
    return null;
  }
}

function parseCompiledJson(id: string, raw: unknown): CompiledDlc {
  try {
    return rewriteCompiledAssets(compiledDlcSchema.parse(raw));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "编译产物与当前 schema 不一致";
    throw new DlcValidationError([`无法加载 DLC「${id}」：${detail}`]);
  }
}

function rewriteCompiledAssets(dlc: CompiledDlc): CompiledDlc {
  return {
    ...dlc,
    publicBasePath: publicAssetUrl(dlc.publicBasePath) || dlc.publicBasePath,
    manifest: {
      ...dlc.manifest,
      characters: dlc.manifest.characters.map((character) => ({
        ...character,
        portraitUrl: character.portraitUrl ? publicAssetUrl(character.portraitUrl) : undefined,
      })),
    },
    story: {
      ...dlc.story,
      chapters: dlc.story.chapters.map((chapter) => ({
        ...chapter,
        backgroundUrl: chapter.backgroundUrl ? publicAssetUrl(chapter.backgroundUrl) : undefined,
      })),
    },
  };
}
