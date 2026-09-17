import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { publicAssetUrl } from "../assets/cdn";
import { collapseSameAuthorVersion } from "./catalogShared";
import { compiledDlcSchema, DlcValidationError, type CompiledDlc } from "./schema";
import type { CompileResult } from "./compiler";
import { getUploadedDlcSource, publishedUploads, uploadedPackToCompileResult } from "./uploadedContent";
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
  return [...collapseSameAuthorVersion(published), ...(await loadUploadedPacks(reserved))];
}

/** 学员上传的课包由宿主注入（线上是 OSS）。未注入即站点没有这一层，返回空。 */
async function loadUploadedPacks(reserved: Set<string>): Promise<CompileResult[]> {
  const source = getUploadedDlcSource();
  if (!source) {
    return [];
  }
  try {
    return publishedUploads(await source.listPacks(), reserved).map(uploadedPackToCompileResult);
  } catch {
    return [];
  }
}

export async function loadCompiledDlc(id: string): Promise<CompiledDlc | null> {
  if (!/^[a-z][a-z0-9_-]*$/i.test(id) || isUnpublishedDlc(id)) {
    return null;
  }
  const uploaded = await loadUploadedCompiled(id);
  if (uploaded) {
    return parseCompiledJson(id, uploaded);
  }
  const filePath = path.join(generatedDir(), `${id}.json`);
  if (existsSync(filePath)) {
    return parseCompiledJson(id, JSON.parse(readFileSync(filePath, "utf8")));
  }
  return null;
}

/** 同上：上传层未注入时返回 null，落到仓库自带的编译产物。 */
async function loadUploadedCompiled(id: string): Promise<unknown | null> {
  const source = getUploadedDlcSource();
  if (!source) {
    return null;
  }
  try {
    return await source.loadCompiled(id);
  } catch (error) {
    if (error instanceof DlcValidationError) {
      throw error;
    }
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

/**
 * BGM 也要落到 OSS 地址。
 *
 * 编译产物里 backgroundUrl / portraitUrl 都经 publicAssetUrl 拿到 CDN 绝对地址，
 * 而 assets.music 一直是包内相对路径，只靠 publicBasePath 拼接才碰巧对。这里显式
 * 改写，任何直接读 compiled.manifest.assets.music 的消费方（预览、审计、以后接的
 * 第三方）都能拿到可直接访问的地址。resolveMusicUrls 认绝对路径，不会再拼一遍前缀。
 */
function rewriteMusicAssets(
  dlcId: string,
  assets: CompiledDlc["manifest"]["assets"],
): CompiledDlc["manifest"]["assets"] {
  const music = assets?.music;
  if (!assets || !music) {
    return assets;
  }
  const toUrl = (relative?: string) => {
    if (!relative) {
      return undefined;
    }
    const sitePath = `/dlc/${dlcId}/${relative}`;
    return publicAssetUrl(sitePath) || sitePath;
  };
  return {
    ...assets,
    music:
      typeof music === "string"
        ? toUrl(music)
        : { story: toUrl(music.story), poem: toUrl(music.poem) },
  };
}

function rewriteCompiledAssets(dlc: CompiledDlc): CompiledDlc {
  return {
    ...dlc,
    publicBasePath: publicAssetUrl(dlc.publicBasePath) || dlc.publicBasePath,
    manifest: {
      ...dlc.manifest,
      assets: rewriteMusicAssets(dlc.manifest.id, dlc.manifest.assets),
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
