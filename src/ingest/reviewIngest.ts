import { ingestMetric, ingestStage } from "./timing";
import { playUrl } from "../server/siteUrl";
import type { RosterPoet } from "../dlc/roster";
import type { UploadedPack } from "../dlc/uploadIndex";
import type { UploadFormInput } from "../dlc/uploadPack";
import { publishUploadedDlc } from "../dlc/publishUpload";
import { upsertWork } from "../roster/store";
import {
  clearReviewArtifacts,
  ingestCodexWorkspace,
  runCodexSpecReview,
  type CodexTranscript,
  type SpecReviewOutcome,
} from "./codexReview";
import {
  ENGINE_ISSUE_RULE,
  hasBlocking,
  isEngineFailure,
  machineIssue,
  type IngestResult,
  type ReviewIssue,
} from "./issues";
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
 * 引擎故障最多跑几次（含首次）。默认 2 = 失败后自动重跑 1 次。
 *
 * 为什么值得重跑：2026-10-10 的实测里，同一份学员包在不同时段的 Agent 耗时在 66s–202s 之间浮动
 * （provider 侧排队/吞吐抖动），撞上 `CODEX_TIMEOUT_MS=240s` 的那一单，重跑一次基本都能过；
 * 而这类失败跟学员的 YAML 毫无关系，直接判 reject 只会让学生白改一遍配置文件。
 *
 * 内容结论（真的审出 YAML 问题）**绝不重试**：那是审核意见，重跑只会把同一件事算两遍钱。
 */
export function reviewAttempts(): number {
  const raw = Number(process.env.INGEST_REVIEW_ATTEMPTS ?? 2);
  if (!Number.isFinite(raw)) return 2;
  return Math.min(3, Math.max(1, Math.round(raw)));
}

/** 两次尝试之间的等待（默认 3s）：上游正卡着的时候立刻重试往往还是撞同一堵墙。 */
export function reviewRetryDelayMs(): number {
  const raw = Number(process.env.INGEST_REVIEW_RETRY_DELAY_MS ?? 3000);
  if (!Number.isFinite(raw)) return 3000;
  return Math.min(60_000, Math.max(0, Math.round(raw)));
}

/**
 * 跑评审，引擎故障就重跑。
 *
 * 预算：单次上限 `CODEX_TIMEOUT_MS=240s`，2 次尝试最坏 ~500s（含机器校验与发布）。
 * 线上是异步队列（`INGEST_ASYNC_ENABLED=1`：先 202 再轮询 get_ingest_job），不受 Nginx
 * `proxy_read_timeout=330s` 约束；但**同步调用方**要把预算放到 600s 以上（e2e 脚本的
 * `--max-ms` 默认值已按此调整）。
 */
export async function runSpecReviewWithRetry(options: {
  reviewer: SpecReviewer;
  packRoot: string;
  machineIssues: ReviewIssue[];
  workspace: string;
}): Promise<SpecReviewOutcome> {
  const attempts = reviewAttempts();
  const delayMs = reviewRetryDelayMs();
  let outcome: SpecReviewOutcome = { issues: [] };
  let used = 0;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    used = attempt;
    if (attempt > 1) {
      clearReviewArtifacts(options.workspace);
      ingestMetric("reviewRetryCount", attempt - 1);
      console.warn(JSON.stringify({
        event: "ingest_review_retry",
        attempt,
        attempts,
        delayMs,
        reason: outcome.issues.find((issue) => issue.rule === ENGINE_ISSUE_RULE)?.message?.slice(0, 200),
      }));
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    outcome = normalizeSpecReview(await options.reviewer({
      packRoot: options.packRoot,
      machineIssues: options.machineIssues,
      workspace: options.workspace,
    }));
    if (!isEngineFailure(outcome.issues)) break;
  }
  return {
    ...outcome,
    transcript: outcome.transcript ? { ...outcome.transcript, attempts: used } : outcome.transcript,
  };
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
  const machine = await ingestStage("machineMs", () => machineReviewZip({
    form: options.form,
    zipBuffer: options.zipBuffer,
    store: options.store,
    roster: options.roster,
  }));
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
    if (hasBlocking(machine.issues)) {
      return { verdict: "reject", issues: machine.issues };
    }
    let specIssues: ReviewIssue[] = [];
    let transcript: CodexTranscript | undefined;
    if (machine.packRoot) {
      const reviewer = options.specReviewer ?? runCodexSpecReview;
      const spec = await ingestStage("specReviewMs", () => runSpecReviewWithRetry({
        reviewer,
        packRoot: machine.packRoot!,
        machineIssues: machine.issues,
        workspace: ingestCodexWorkspace(machine.tempRoot),
      }));
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

    const work = await ingestStage("rosterMs", () => upsertWork(options.form.poetId, options.form.workTitle, options.store));
    if ("issues" in work) {
      return {
        verdict: "reject",
        issues: work.issues.map((message) => machineIssue(message, { rule: "篇目名册" })),
        transcript,
      };
    }

    const published = await ingestStage("publishMs", () => publishUploadedDlc({
      form: options.form,
      zipBuffer: options.zipBuffer,
    }));
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
