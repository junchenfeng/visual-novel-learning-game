import { playUrl } from "../server/siteUrl";
import type { RosterPoet } from "../dlc/roster";
import type { UploadedPack } from "../dlc/uploadIndex";
import type { UploadFormInput } from "../dlc/uploadPack";
import { publishUploadedDlc } from "../dlc/publishUpload";
import { upsertWork } from "../roster/store";
import {
  ingestCodexWorkspace,
  runCodexSpecReview,
  type CodexTranscript,
  type SpecReviewOutcome,
} from "./codexReview";
import { hasBlocking, machineIssue, type IngestResult, type ReviewIssue } from "./issues";
import { disposeMachineReview, machineReviewZip } from "./machineReview";
import type { PoemStore } from "../server/poemStore";

export type SpecReviewer = (options: {
  packRoot?: string;
  machineIssues: ReviewIssue[];
  workspace?: string;
}) => Promise<ReviewIssue[] | SpecReviewOutcome>;

function normalizeSpecReview(output: ReviewIssue[] | SpecReviewOutcome): SpecReviewOutcome {
  if (Array.isArray(output)) {
    return { issues: output };
  }
  return output;
}

function siteOrigin(origin?: string): string {
  const fromEnv = process.env.PUBLIC_SITE_URL?.trim();
  return (origin || fromEnv || "https://poem.aibeaver.cn").replace(/\/+$/, "");
}

/**
 * 「这份提交和线上那份是同一份内容吗」—— 是就跳过审核。
 *
 * 两个判据缺一不可：
 * - 只比 version：改了内容但忘升版本会被静默跳过（学员会以为更新生效了）；
 * - 只比指纹：只改了版本号没改内容时会白跑一轮 Codex 评审。
 *
 * 老索引条目没有 `contentSha256` 时一律返回 false，照常走完整审核，发布后自然补上指纹；
 * 这样加这个能力不会改变任何既有条目的行为。
 */
export function shouldSkipReview(input: {
  version?: string;
  contentSha256?: string;
  existing: Pick<UploadedPack, "version" | "contentSha256">;
}): boolean {
  const nextVersion = input.version?.trim();
  const nextSha = input.contentSha256?.trim();
  const existingSha = input.existing.contentSha256?.trim();
  if (!nextVersion || !nextSha || !existingSha) {
    return false;
  }
  return input.existing.version.trim() === nextVersion && existingSha === nextSha;
}

export async function reviewAndIngestDlc(options: {
  form: UploadFormInput;
  zipBuffer: Buffer;
  origin?: string;
  specReviewer?: SpecReviewer;
  /** 默认取宿主注入的 store；测试里注入内存 store，避免读写真实环境。 */
  store?: PoemStore;
  /** 默认读名册 store；测试里直接给 seed 名册，连读盘都省掉。 */
  roster?: RosterPoet[];
}): Promise<IngestResult> {
  const machine = await machineReviewZip({
    form: options.form,
    zipBuffer: options.zipBuffer,
    store: options.store,
    roster: options.roster,
  });
  try {
    // 幂等短路：线上那份与这次提交「版本 + 内容指纹」都一致 → 线上本来就是这个内容，判 skip。
    // 放在 Codex 之前是本轮最值钱的一步：不跑评审、不写 OSS、不动索引，已上架条目的
    // uploadedAt 也不会因为重复提交而抖动。
    //
    // 这里刻意不看 machine.issues：内容与线上逐字节一致时，机器校验报的多半是环境侧变化
    // （名册增删、保留 id 调整），不该让一次「什么都没改」的重复提交变成 reject。
    const existing = machine.existing;
    if (
      existing &&
      shouldSkipReview({
        version: machine.manifest?.version,
        contentSha256: machine.contentSha256,
        existing,
      })
    ) {
      return {
        verdict: "skip",
        reason: `版本 ${existing.version} 与内容指纹均未变化：线上保持原样，未重新审核`,
        playUrl: playUrl(siteOrigin(options.origin), existing.dlcId),
        pack: {
          userId: existing.userId,
          dlcId: existing.dlcId,
          poetId: existing.poetId,
          workTitle: existing.workTitle,
          author: existing.author,
          version: existing.version,
        },
        issues: [],
      };
    }
    let specIssues: ReviewIssue[] = [];
    let transcript: CodexTranscript | undefined;
    if (machine.packRoot) {
      const reviewer = options.specReviewer ?? runCodexSpecReview;
      const spec = normalizeSpecReview(
        await reviewer({
          packRoot: machine.packRoot,
          machineIssues: machine.issues,
          workspace: ingestCodexWorkspace(machine.tempRoot),
        }),
      );
      specIssues = spec.issues;
      transcript = spec.transcript;
    }
    const issues = [...machine.issues, ...specIssues];
    if (hasBlocking(issues)) {
      return { verdict: "reject", issues, transcript };
    }
    if (machine.poetMissing) {
      return {
        verdict: "reject",
        issues: [
          ...issues,
          machineIssue(`诗人不在名册中：${options.form.poetId}`, {
            rule: "诗人名册",
            path: "manifest.yaml",
            fixHint: "请先调用 upsert_poet 并上传正方形头像",
          }),
        ],
        transcript,
      };
    }

    const work = await upsertWork(options.form.poetId, options.form.workTitle);
    if ("issues" in work) {
      return {
        verdict: "reject",
        issues: work.issues.map((message) => machineIssue(message, { rule: "篇目名册" })),
        transcript,
      };
    }

    const published = await publishUploadedDlc({
      form: options.form,
      zipBuffer: options.zipBuffer,
    });
    if ("issues" in published) {
      return {
        verdict: "reject",
        issues: published.issues.map((message) => machineIssue(message)),
        transcript,
      };
    }
    return {
      verdict: "accept",
      playUrl: playUrl(siteOrigin(options.origin), published.pack.dlcId),
      pack: {
        userId: published.pack.userId,
        dlcId: published.pack.dlcId,
        poetId: published.pack.poetId,
        workTitle: published.pack.workTitle,
        author: published.pack.author,
        version: published.pack.version,
      },
      issues,
      transcript,
    };
  } finally {
    disposeMachineReview(machine);
  }
}
