/**
 * 把 pack.zip 里 `manifest.yaml` 的 `version` 改写成 e2e 专用的唯一值。
 *
 * 存在的理由：`shouldSkipReview` 只在「版本 + 内容指纹」都与线上那份相同时才跳过审核。
 * e2e 每次提交的是同一份学员包，若不改版本，第二次起就会被 skip 短路——**Codex 不跑**，
 * 而「审核引擎不可用」正是要抓的故障（2026-10-09 那批就是这么全军覆没的）。
 * 版本段一变，内容指纹随之变，必然走完整审核。
 *
 * 只动 `version:` 那一行，其余字节保持不变；带引号的写法保留引号风格。
 */
import JSZip from "jszip";
import { parse as parseYaml } from "yaml";

export type ZipManifest = {
  /** zip 内 manifest.yaml 的路径 */
  path: string;
  /** manifest.yaml 原文 */
  text: string;
  /** short id（manifest.id） */
  id: string;
  version: string;
};

/** `<原值>+e2e.<stamp>`；原值为空时退化成 `e2e.<stamp>`。 */
export function buildE2eVersion(original: string, stamp: string): string {
  const base = String(original ?? "").trim();
  const suffix = `e2e.${String(stamp).trim()}`;
  return base ? `${base}+${suffix}` : suffix;
}

/** 候选 manifest 路径：优先根目录，其次一层目录；忽略 macOS 噪声与 codex 工作区。 */
export function pickManifestPath(names: string[]): string | null {
  const candidates = names
    .map((name) => name.replace(/\\/g, "/"))
    .filter((name) => /(^|\/)manifest\.yaml$/i.test(name))
    .filter((name) => !name.includes("__MACOSX/") && !name.split("/").includes("codex-job"))
    .filter((name) => name.split("/").filter(Boolean).length <= 2);
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b))[0];
}

/**
 * 替换 `version:` 行的值。纯函数，便于单测。
 * 找不到该行时抛错——宁可失败也不要提交一份没改版本的包（否则会被 skip 短路）。
 */
export function replaceManifestVersionLine(text: string, version: string): string {
  const re = /^(\s*version\s*:\s*)(["']?)([^\n#]*?)\2(\s*(?:#.*)?)$/m;
  const match = text.match(re);
  if (!match) {
    throw new Error("manifest.yaml 里找不到可改写的 version 行");
  }
  const [, prefix, quote] = match;
  const comment = match[4] ?? "";
  const line = `${prefix}${quote}${version}${quote}${comment}`;
  return text.replace(re, line);
}

export async function readZipManifest(zipBuffer: Buffer): Promise<ZipManifest> {
  const zip = await JSZip.loadAsync(zipBuffer);
  const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  const manifestPath = pickManifestPath(names);
  if (!manifestPath) {
    throw new Error("zip 里找不到 manifest.yaml（根目录或一层目录下）");
  }
  const text = await zip.file(manifestPath)!.async("string");
  const parsed = parseYaml(text) as { id?: unknown; version?: unknown } | null;
  const id = String(parsed?.id ?? "").trim();
  const version = String(parsed?.version ?? "").trim();
  if (!id) {
    throw new Error(`manifest.yaml（${manifestPath}）缺少 id`);
  }
  if (!version) {
    throw new Error(`manifest.yaml（${manifestPath}）缺少 version`);
  }
  return { path: manifestPath, text, id, version };
}

/** 改写 version 后重新打包，返回新 zip 与改写信息。 */
export async function rewriteManifestVersion(
  zipBuffer: Buffer,
  newVersion: string,
): Promise<{ zip: Buffer; manifest: ZipManifest; previousVersion: string; nextText: string }> {
  const manifest = await readZipManifest(zipBuffer);
  const nextText = replaceManifestVersionLine(manifest.text, newVersion);
  const zip = await JSZip.loadAsync(zipBuffer);
  zip.file(manifest.path, nextText);
  const out = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { zip: out, manifest: { ...manifest, text: nextText, version: newVersion }, previousVersion: manifest.version, nextText };
}
