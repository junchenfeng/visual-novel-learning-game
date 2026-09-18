import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { reservedGitDlcIds } from "../dlc/loadCompiled";
import { parseDlcDirectory } from "../dlc/parser";
import { DlcValidationError, type CompiledDlc, type Manifest } from "../dlc/schema";
import type { RosterPoet } from "../dlc/roster";
import {
  extractZipBuffer,
  findPackRoot,
  MAX_ZIP_BYTES,
  resolveUploadTarget,
  validateUploadManifest,
  type UploadFormInput,
} from "../dlc/uploadPack";
import { findUploadedPack, loadUploadIndex, type UploadedPack } from "../dlc/uploadIndex";
import { fingerprintPackDir } from "../dlc/packFingerprint";
import { portraitHint } from "../roster/portrait";
import { loadRoster } from "../roster/store";
import type { PoemStore } from "../server/poemStore";
import { machineIssue, type ReviewIssue } from "./issues";

export type MachineReview = {
  tempRoot: string;
  packRoot?: string;
  manifest?: Manifest;
  compiled?: CompiledDlc;
  issues: ReviewIssue[];
  poetMissing: boolean;
  allowUnknownWork: boolean;
  /** 本次提交的包内容指纹（解压后、转 webp 前算），供上层判「要不要跳过审核」。 */
  contentSha256?: string;
  /** 同一个上架槽位上已有的条目（同 userId + 同 short-id），有才能比版本与指纹。 */
  existing?: UploadedPack;
};

function classifyMachineMessage(message: string): ReviewIssue {
  if (/诗人不在名册/.test(message)) {
    return machineIssue(message, {
      rule: "诗人名册",
      path: "manifest.yaml",
      fixHint: `请先调用 upsert_poet。${portraitHint()}`,
    });
  }
  if (/篇目/.test(message) && /名册/.test(message)) {
    return machineIssue(message, { rule: "篇目名册", path: "manifest.yaml" });
  }
  if (/背景音乐|音频/.test(message)) {
    return machineIssue(message, {
      rule: "背景音乐",
      path: "manifest.yaml",
      fixHint: "把音频文件放进包内 assets/，并在 manifest.yaml 的 assets.music 里写对相对路径",
    });
  }
  if (/图|环|节点|gameOver|converge/.test(message)) {
    return machineIssue(message, { rule: "剧情图规则", path: "content/story.yaml" });
  }
  if (/zip|路径/.test(message)) {
    return machineIssue(message, { rule: "zip 安全", fixHint: "检查 zip 路径，不要包含 .." });
  }
  return machineIssue(message, { path: "manifest.yaml" });
}

export async function machineReviewZip(options: {
  form: UploadFormInput;
  zipBuffer: Buffer;
  roster?: RosterPoet[];
  /** 默认取宿主注入的 store；测试里注入内存 store，避免读写真实环境。 */
  store?: PoemStore;
}): Promise<MachineReview> {
  const tempRoot = mkdtempSync(path.join(tmpdir(), "poem-dlc-ingest-"));
  const issues: ReviewIssue[] = [];
  if (options.zipBuffer.byteLength > MAX_ZIP_BYTES) {
    issues.push(
      machineIssue(`zip 超过 ${Math.round(MAX_ZIP_BYTES / (1024 * 1024))}MB`, { rule: "zip 大小" }),
    );
    return { tempRoot, issues, poetMissing: false, allowUnknownWork: false };
  }

  try {
    await extractZipBuffer(options.zipBuffer, tempRoot);
    const packRoot = findPackRoot(tempRoot);
    // 与发布侧（publishUploadedDlc）同一时点取值：必须早于 convertPackRastersToWebp，
    // 否则 png→webp 之后两侧指纹永远对不上，skip 会退化成每次全量审核。
    const contentSha256 = fingerprintPackDir(packRoot);
    let compiled: CompiledDlc | undefined;
    try {
      compiled = parseDlcDirectory(packRoot);
    } catch (error) {
      if (error instanceof DlcValidationError) {
        issues.push(...error.issues.map(classifyMachineMessage));
      } else {
        issues.push(machineIssue(error instanceof Error ? error.message : "DLC 解析失败", { path: "manifest.yaml" }));
      }
      return {
        tempRoot,
        packRoot,
        issues,
        poetMissing: false,
        allowUnknownWork: false,
      };
    }
    const roster = options.roster ?? (await loadRoster());
    const poetMissing = !roster.some((item) => item.poetId === options.form.poetId);
    const reserved = reservedGitDlcIds();
    const index = await loadUploadIndex(options.store);
    const { targetId } = resolveUploadTarget({
      userId: options.form.userId,
      shortId: compiled.manifest.id,
    });
    const existing = findUploadedPack(index, targetId);
    const raw = validateUploadManifest({
      form: options.form,
      manifest: compiled.manifest,
      reservedGitIds: reserved,
      existing,
      roster,
      allowUnknownWork: !poetMissing,
    });
    issues.push(...raw.map(classifyMachineMessage));
    return {
      tempRoot,
      packRoot,
      manifest: compiled.manifest,
      compiled,
      issues,
      poetMissing,
      allowUnknownWork: !poetMissing,
      contentSha256,
      existing,
    };
  } catch (error) {
    if (error instanceof DlcValidationError) {
      issues.push(...error.issues.map(classifyMachineMessage));
    } else {
      issues.push(machineIssue(error instanceof Error ? error.message : "zip 解析失败", { rule: "zip" }));
    }
    return { tempRoot, issues, poetMissing: false, allowUnknownWork: false };
  }
}

export function disposeMachineReview(review: Pick<MachineReview, "tempRoot">): void {
  rmSync(review.tempRoot, { recursive: true, force: true });
}
