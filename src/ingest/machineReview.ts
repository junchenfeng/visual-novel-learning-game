import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadShippedCatalog, reservedGitDlcIds } from "../dlc/loadCompiled";
import { parseDlcDirectory } from "../dlc/parser";
import { DlcValidationError, type CompiledDlc, type Manifest } from "../dlc/schema";
import type { RosterPoet } from "../dlc/roster";
import { excludeUnpublished } from "../dlc/unpublished";
import {
  extractZipBuffer,
  findPackRoot,
  MAX_ZIP_BYTES,
  resolveUploadTarget,
  validateUploadManifest,
  type UploadFormInput,
} from "../dlc/uploadPack";
import { findUploadedPack, loadUploadIndex } from "../dlc/uploadIndex";
import { portraitHint } from "../roster/portrait";
import { loadRoster } from "../roster/store";
import { machineIssue, type ReviewIssue } from "./issues";

export type MachineReview = {
  tempRoot: string;
  packRoot?: string;
  manifest?: Manifest;
  compiled?: CompiledDlc;
  issues: ReviewIssue[];
  poetMissing: boolean;
  allowUnknownWork: boolean;
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
    const index = await loadUploadIndex();
    const { targetId, overwriteByAuthorVersion } = resolveUploadTarget({
      manifest: compiled.manifest,
      shipped: excludeUnpublished(loadShippedCatalog()),
      uploads: index,
      reservedGitIds: reserved,
    });
    const existing = findUploadedPack(index, targetId);
    const raw = validateUploadManifest({
      form: options.form,
      manifest: compiled.manifest,
      reservedGitIds: reserved,
      existing,
      overwriteByAuthorVersion,
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
