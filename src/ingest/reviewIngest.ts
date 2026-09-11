import { playUrl } from "../server/siteUrl";
import type { UploadFormInput } from "../dlc/uploadPack";
import { publishUploadedDlc } from "../dlc/publishUpload";
import { upsertWork } from "../roster/store";
import {
  runCodexSpecReview,
  type CodexTranscript,
  type SpecReviewOutcome,
} from "./codexReview";
import { hasBlocking, machineIssue, type IngestResult, type ReviewIssue } from "./issues";
import { disposeMachineReview, machineReviewZip } from "./machineReview";

export type SpecReviewer = (options: {
  packRoot?: string;
  machineIssues: ReviewIssue[];
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

export async function reviewAndIngestDlc(options: {
  form: UploadFormInput;
  zipBuffer: Buffer;
  origin?: string;
  specReviewer?: SpecReviewer;
}): Promise<IngestResult> {
  const machine = await machineReviewZip({
    form: options.form,
    zipBuffer: options.zipBuffer,
  });
  try {
    let specIssues: ReviewIssue[] = [];
    let transcript: CodexTranscript | undefined;
    if (machine.packRoot) {
      const reviewer = options.specReviewer ?? runCodexSpecReview;
      const spec = normalizeSpecReview(
        await reviewer({
          packRoot: machine.packRoot,
          machineIssues: machine.issues,
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
