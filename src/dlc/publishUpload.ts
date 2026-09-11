import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { STATIC_OSS_PREFIX } from "../assets/cdn";
import { getPoemStore, uploadedCompiledKey } from "../server/poemStore";
import { reservedGitDlcIds } from "./loadCompiled";
import { parseDlcDirectory } from "./parser";
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

export async function publishUploadedDlc(options: {
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

    await convertPackRastersToWebp(packRoot);
    const compiled = retargetCompiledDlc(parseDlcDirectory(packRoot), targetId);
    const store = getPoemStore();

    for (const filePath of collectPackAssetFiles(packRoot)) {
      const relative = relativeFrom(packRoot, filePath);
      await store.putObject(`${STATIC_OSS_PREFIX}/dlc/${targetId}/${relative}`, readFileSync(filePath), {
        mime: mimeForAsset(filePath),
        cacheControl: "public, max-age=31536000, immutable",
      });
    }
    await store.writeJson(uploadedCompiledKey(targetId), compiled);
    syncPackAssetsToPublic(packRoot, targetId);

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
    };
    const withoutSlot = index.filter(
      (item) => !isSameUploadSlot(item, options.form.userId, firstPass.manifest.id),
    );
    const nextIndex = [...withoutSlot, pack];
    await saveUploadIndex(nextIndex, store);
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
