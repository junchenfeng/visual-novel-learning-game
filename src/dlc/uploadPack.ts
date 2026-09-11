import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { convertImageToWebp, isRasterImagePath, replaceExtWithWebp } from "../assets/webp";
import { findAuthorVersionMatch, titlesMatch } from "./catalogShared";
import type { CompileResult } from "./compiler";
import { parseDlcDirectory } from "./parser";
import { POET_ROSTER } from "./roster";
import { DlcValidationError, type CompiledDlc, type Manifest } from "./schema";
import { UNPUBLISHED_DLC_IDS } from "./unpublished";
import type { UploadedPack } from "./uploadIndex";

export const MAX_ZIP_BYTES = 30 * 1024 * 1024;

export type UploadFormInput = {
  userId: string;
  poetId: string;
  workTitle: string;
};

function walkFiles(root: string): string[] {
  const files: string[] = [];
  if (!existsSync(root)) {
    return files;
  }
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(full));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

export function resolveSafeZipTarget(dest: string, name: string): string {
  const normalized = name.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || normalized.startsWith("/") || path.isAbsolute(normalized)) {
    throw new DlcValidationError([`zip 含有不安全路径：${name}`]);
  }
  const target = path.join(dest, normalized);
  const relative = path.relative(dest, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new DlcValidationError([`zip 含有不安全路径：${name}`]);
  }
  return target;
}

export async function extractZipBuffer(buffer: Buffer, dest: string): Promise<void> {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files);
  if (names.length === 0) {
    throw new DlcValidationError(["zip 是空的"]);
  }
  for (const name of names) {
    const entry = zip.files[name];
    if (!entry || entry.dir) {
      continue;
    }
    const target = resolveSafeZipTarget(dest, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, await entry.async("nodebuffer"));
  }
}

export function findPackRoot(dest: string): string {
  if (existsSync(path.join(dest, "manifest.yaml"))) {
    return dest;
  }
  const entries = readdirSync(dest, { withFileTypes: true }).filter(
    (entry) => entry.name !== "__MACOSX" && entry.name !== ".DS_Store",
  );
  const dirs = entries.filter((entry) => entry.isDirectory());
  const files = entries.filter((entry) => entry.isFile());
  if (files.length === 0 && dirs.length === 1 && dirs[0]) {
    const nested = path.join(dest, dirs[0].name);
    if (existsSync(path.join(nested, "manifest.yaml"))) {
      return nested;
    }
  }
  throw new DlcValidationError(["zip 根目录需要 manifest.yaml，或只有一层带 manifest.yaml 的文件夹"]);
}

function rewriteTextFiles(rootDir: string, replacements: Map<string, string>) {
  if (replacements.size === 0) {
    return;
  }
  const textExt = new Set([".yaml", ".yml", ".json", ".md", ".txt"]);
  for (const filePath of walkFiles(rootDir)) {
    if (!textExt.has(path.extname(filePath).toLowerCase())) {
      continue;
    }
    let text = readFileSync(filePath, "utf8");
    let changed = false;
    for (const [from, to] of replacements) {
      if (text.includes(from)) {
        text = text.split(from).join(to);
        changed = true;
      }
    }
    if (changed) {
      writeFileSync(filePath, text, "utf8");
    }
  }
}

export async function convertPackRastersToWebp(rootDir: string): Promise<Map<string, string>> {
  const replacements = new Map<string, string>();
  const assetsDir = path.join(rootDir, "assets");
  if (!existsSync(assetsDir)) {
    return replacements;
  }
  for (const filePath of walkFiles(assetsDir)) {
    if (!isRasterImagePath(filePath)) {
      continue;
    }
    const webpPath = replaceExtWithWebp(filePath);
    const webpBuffer = await convertImageToWebp(readFileSync(filePath));
    writeFileSync(webpPath, webpBuffer);
    if (webpPath !== filePath) {
      unlinkSync(filePath);
    }
    const from = path.relative(rootDir, filePath).split(path.sep).join("/");
    const to = path.relative(rootDir, webpPath).split(path.sep).join("/");
    replacements.set(from, to);
  }
  rewriteTextFiles(rootDir, replacements);
  return replacements;
}

export function collectPackAssetFiles(rootDir: string): string[] {
  const assetsDir = path.join(rootDir, "assets");
  if (!existsSync(assetsDir)) {
    return [];
  }
  return walkFiles(assetsDir);
}

export function resolveUploadTarget(options: {
  manifest: Pick<Manifest, "id" | "author" | "version" | "poetId" | "workTitle">;
  shipped: CompileResult[];
  uploads: UploadedPack[];
  reservedGitIds: Set<string>;
}): { targetId: string; overwriteByAuthorVersion: boolean } {
  const candidates = [
    ...options.shipped.map((item) => ({
      id: item.id,
      author: item.author,
      version: item.version,
      poetId: item.poetId,
      workTitle: item.workTitle,
    })),
    ...options.uploads.map((item) => ({
      id: item.dlcId,
      author: item.author,
      version: item.version,
      poetId: item.poetId,
      workTitle: item.workTitle,
    })),
  ];
  const match = findAuthorVersionMatch(candidates, options.manifest, options.reservedGitIds);
  if (!match) {
    return { targetId: options.manifest.id, overwriteByAuthorVersion: false };
  }
  return { targetId: match.id, overwriteByAuthorVersion: true };
}

export function validateUploadManifest(options: {
  form: UploadFormInput;
  manifest: Manifest;
  reservedGitIds: Set<string>;
  existing?: UploadedPack;
  overwriteByAuthorVersion?: boolean;
}): string[] {
  const issues: string[] = [];
  const { form, manifest, reservedGitIds, existing, overwriteByAuthorVersion } = options;
  const poet = POET_ROSTER.find((item) => item.poetId === form.poetId);
  if (!poet) {
    issues.push(`诗人不在名册中：${form.poetId}`);
  }
  if (manifest.poetId !== form.poetId) {
    issues.push(`manifest.poetId（${manifest.poetId}）与表单选择的诗人（${form.poetId}）不一致`);
  }
  if (poet && manifest.poet && manifest.poet !== poet.poet) {
    issues.push(`manifest.poet（${manifest.poet}）与名册（${poet.poet}）不一致`);
  }
  if (!titlesMatch(manifest.workTitle, form.workTitle)) {
    issues.push(`manifest.workTitle（${manifest.workTitle}）与表单篇目（${form.workTitle}）对不上`);
  }
  if (poet && !poet.works.some((work) => titlesMatch(work.title, manifest.workTitle))) {
    issues.push(`篇目「${manifest.workTitle}」不在诗人「${poet.poet}」的名册中`);
  }
  if (!overwriteByAuthorVersion && (reservedGitIds.has(manifest.id) || UNPUBLISHED_DLC_IDS.has(manifest.id))) {
    issues.push(`DLC id「${manifest.id}」已被仓库课包占用，不能覆盖`);
  }
  if (!overwriteByAuthorVersion && existing && existing.userId !== form.userId) {
    issues.push(`DLC id「${manifest.id}」已由 ${existing.userId} 上传，不能被其他 user id 覆盖`);
  }
  return issues;
}

export function retargetCompiledDlc(compiled: CompiledDlc, targetId: string): CompiledDlc {
  if (compiled.manifest.id === targetId) {
    return compiled;
  }
  const from = `/dlc/${compiled.manifest.id}`;
  const rewrite = (url?: string) => {
    if (!url) {
      return url;
    }
    if (url === from || url.startsWith(`${from}/`)) {
      return `/dlc/${targetId}${url.slice(from.length)}`;
    }
    return url;
  };
  return {
    ...compiled,
    publicBasePath: rewrite(compiled.publicBasePath) ?? compiled.publicBasePath,
    manifest: {
      ...compiled.manifest,
      id: targetId,
      characters: compiled.manifest.characters.map((character) => ({
        ...character,
        portraitUrl: rewrite(character.portraitUrl),
      })),
    },
    story: {
      ...compiled.story,
      chapters: compiled.story.chapters.map((chapter) => ({
        ...chapter,
        backgroundUrl: rewrite(chapter.backgroundUrl),
      })),
    },
  };
}

export async function parseUploadedPack(rootDir: string): Promise<CompiledDlc> {
  return parseDlcDirectory(rootDir);
}

export function publicDirForDlc(dlcId: string): string {
  return path.join(process.cwd(), "public", "dlc", dlcId);
}

export function syncPackAssetsToPublic(rootDir: string, dlcId: string): void {
  const source = path.join(rootDir, "assets");
  const target = path.join(publicDirForDlc(dlcId), "assets");
  rmSync(path.dirname(target), { recursive: true, force: true });
  if (!existsSync(source)) {
    return;
  }
  mkdirSync(target, { recursive: true });
  for (const filePath of walkFiles(source)) {
    const relative = path.relative(source, filePath);
    const dest = path.join(target, relative);
    mkdirSync(path.dirname(dest), { recursive: true });
    writeFileSync(dest, readFileSync(filePath));
  }
}

export function mimeForAsset(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".webp") return "image/webp";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".m4a") return "audio/mp4";
  return "application/octet-stream";
}
