import { withIngestLock } from "../ingest/state";
import { ingestStage } from "../ingest/timing";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { dlcAssetBasePath, packRevision, STATIC_OSS_PREFIX, staticDlcAssetKey } from "../assets/cdn";
import { getPoemStore, uploadedCompiledKey, type PoemStore } from "../server/poemStore";
import { reservedGitDlcIds } from "./loadCompiled";
import { parseDlcDirectory } from "./parser";
import { fingerprintPackDir } from "./packFingerprint";
import {
  collectPackAssetFiles,
  convertPackRastersToWebp,
  extractZipBuffer,
  findPackRoot,
  isSameUploadSlot,
  MAX_ZIP_BYTES,
  mimeForAsset,
  resolveUploadTarget,
  retargetCompiledDlc,
  syncPackAssetsToPublic,
  validateUploadManifest,
  type UploadFormInput,
} from "./uploadPack";
import {
  findUploadedPack,
  loadUploadIndex,
  saveUploadIndex,
  type UploadedPack,
} from "./uploadIndex";
import { loadRoster } from "../roster/store";
import { DlcValidationError } from "./schema";

export { MAX_ZIP_BYTES };

function relativeFrom(rootDir: string, filePath: string): string {
  return path.relative(rootDir, filePath).split(path.sep).join("/");
}

/** 旧版本资源的保留期：published 后一小时内不删，避免打断正在进行的对局（它手上还是老 URL）。 */
export const STALE_REVISION_GRACE_MS = 60 * 60 * 1000;

/**
 * 清掉同一个课包下已经没人引用的旧版本资源。
 *
 * 版本段一换，老 key 就再也不会被读到（唯一的引用方是 `uploads/<dlcId>/compiled.json`，
 * 而它总在同一批写入里被覆盖），留着只白占存储。三条保守规则：
 * - 只在 `poem-rpg/static/dlc/<dlcId>/` 下的一级前缀里动手，绝不越界到别的课包；
 * - 当前前缀不问时间，永远保留；
 * - 时间戳读不到、或最近一次写入还在保留期内，一律不删。
 *
 * 调用方吞掉异常：这是发布成功之后的收尾，不该让学员看到「发布失败」。
 */
export async function pruneStaleRevisions(options: {
  store: PoemStore;
  dlcId: string;
  keepPrefix: string;
  now?: Date;
  graceMs?: number;
}): Promise<string[]> {
  const base = `${STATIC_OSS_PREFIX}/dlc/${options.dlcId}/`;
  const { prefixes } = await options.store.listObjects(base, { delimiter: "/" });
  const now = (options.now ?? new Date()).getTime();
  const graceMs = options.graceMs ?? STALE_REVISION_GRACE_MS;
  const removed: string[] = [];
  for (const prefix of prefixes) {
    if (prefix === options.keepPrefix) {
      continue;
    }
    const { keys } = await options.store.listObjects(prefix);
    if (keys.length === 0) {
      continue;
    }
    const newest = keys.reduce<number | null>((max, item) => {
      const at = item.updatedAt ? Date.parse(item.updatedAt) : Number.NaN;
      if (Number.isNaN(at)) {
        return max;
      }
      return max === null || at > max ? at : max;
    }, null);
    if (newest === null || now - newest < graceMs) {
      continue;
    }
    for (const item of keys) {
      await options.store.deleteObject(item.key);
    }
    removed.push(prefix);
  }
  return removed;
}

export async function publishUploadedDlc(options: {
  form: UploadFormInput;
  zipBuffer: Buffer;
}): Promise<{ pack: UploadedPack } | { issues: string[] }> {
  return ingestStage("publishWithLockMs", () => withIngestLock("publish", () => publishUnlocked(options)));
}

async function publishUnlocked(options: {
  form: UploadFormInput;
  zipBuffer: Buffer;
}): Promise<{ pack: UploadedPack } | { issues: string[] }> {
  if (options.zipBuffer.byteLength > MAX_ZIP_BYTES) {
    return { issues: [`zip 超过 ${Math.round(MAX_ZIP_BYTES / (1024 * 1024))}MB`] };
  }

  const tempRoot = mkdtempSync(path.join(tmpdir(), "poem-dlc-upload-"));
  try {
    await extractZipBuffer(options.zipBuffer, tempRoot);
    const packRoot = findPackRoot(tempRoot);
    // 指纹必须在 convertPackRastersToWebp 之前算：那一步会把 png 转 webp 并改写 yaml，
    // 与审核侧算指纹的时点必须一致，否则下次提交永远对不上、退化成每次都全量审核。
    const contentSha256 = fingerprintPackDir(packRoot);
    const firstPass = parseDlcDirectory(packRoot);
    const reserved = reservedGitDlcIds();
    const index = await loadUploadIndex();
    const { targetId } = resolveUploadTarget({
      userId: options.form.userId,
      shortId: firstPass.manifest.id,
    });
    const existing = findUploadedPack(index, targetId);
    const roster = await loadRoster();
    const preIssues = validateUploadManifest({
      form: options.form,
      manifest: firstPass.manifest,
      reservedGitIds: reserved,
      existing,
      roster,
    });
    if (preIssues.length > 0) {
      return { issues: preIssues };
    }

    await ingestStage("imagesMs", () => convertPackRastersToWebp(packRoot));
    // 版本段取内容指纹：内容一变 URL 就变，CDN/浏览器上 immutable 的旧副本自然失效。
    // 站点路径、OSS key、本地 public 目录三处必须同口径，少一处就是 404 或吃旧缓存。
    const revision = packRevision(contentSha256);
    const compiled = retargetCompiledDlc(parseDlcDirectory(packRoot), targetId, revision);
    const store = getPoemStore();

    const files = collectPackAssetFiles(packRoot);
    let nextFile = 0;
    let uploadError: unknown;
    await ingestStage("uploadAssetsMs", () => Promise.all(Array.from({ length: Math.min(4, files.length) }, async () => {
      while (nextFile < files.length && !uploadError) {
        try {
          const filePath = files[nextFile++];
          const relative = relativeFrom(packRoot, filePath);
          await store.putObject(staticDlcAssetKey(targetId, relative, revision), readFileSync(filePath), {
            mime: mimeForAsset(filePath),
            cacheControl: "public, max-age=31536000, immutable",
          });
        } catch (error) { uploadError = error; }
      }
    })));
    if (uploadError) throw uploadError;
    await store.writeJson(uploadedCompiledKey(targetId), compiled);
    syncPackAssetsToPublic(packRoot, targetId, revision);

    const pack: UploadedPack = {
      userId: options.form.userId,
      dlcId: targetId,
      poetId: compiled.manifest.poetId,
      poet: compiled.manifest.poet,
      workTitle: compiled.manifest.workTitle,
      title: compiled.manifest.title,
      author: compiled.manifest.author,
      version: compiled.manifest.version,
      summary: compiled.manifest.summary,
      uploadedAt: new Date().toISOString(),
      contentSha256,
    };
    const withoutSlot = index.filter(
      (item) => !isSameUploadSlot(item, options.form.userId, firstPass.manifest.id),
    );
    const nextIndex = [...withoutSlot, pack];
    await saveUploadIndex(nextIndex, store);
    // 索引落盘 = 这次发布已经生效。之后只做清理：失败也不影响结果，只留一条日志。
    await pruneStaleRevisions({
      store,
      dlcId: targetId,
      keepPrefix: `${STATIC_OSS_PREFIX}${dlcAssetBasePath(targetId, revision)}/`,
    }).catch((error: unknown) => {
      console.error("旧版本资源清理失败", error instanceof Error ? error.message : error);
      return [];
    });
    return { pack };
  } catch (error) {
    if (error instanceof DlcValidationError) {
      return { issues: error.issues };
    }
    return { issues: [error instanceof Error ? error.message : "上传失败"] };
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}
