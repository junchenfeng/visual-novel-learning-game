/**
 * 审核结果的判定口径（纯函数，便于单测）。
 *
 * 专抓 2026-10-09 那类事故：审核引擎取不到模型密钥 / agent 超时，导致**每一单**都被记成
 * blocking「审核引擎不可用」→ 预览台一律「审核失败」。判据就是「issues 里有没有
 * rule === '审核引擎'」，它只可能来自 `src/ingest/codexReview.ts` 的失败分支。
 */

export const ENGINE_RULE = "审核引擎";

export type IngestIssue = {
  severity?: string;
  source?: string;
  rule?: string;
  message?: string;
  fixHint?: string;
  path?: string;
};

export type IngestPackRef = {
  userId?: string;
  dlcId?: string;
  poetId?: string;
  workTitle?: string;
  version?: string;
  author?: string;
};

export type IngestResultLike = {
  verdict?: string;
  issues?: IngestIssue[];
  pack?: IngestPackRef;
  playUrl?: string;
  reason?: string;
  error?: string;
  message?: string;
};

export type OutcomeInput = {
  result: IngestResultLike | null | undefined;
  elapsedMs: number;
  maxElapsedMs: number;
  /** 期望的 dlcId（`<shortId>-<e2eUserId>`）；给了就强校验 */
  expectedDlcId?: string;
  /** 是否把 skip 视作通过（默认否：e2e 每次改版本就是为了不 skip） */
  allowSkip?: boolean;
  /**
   * 内容结论浮动时把「reject 且不是引擎故障」降级成提示（默认否）。
   * 用于那些会被审核员审出真实内容问题、但**引擎本身健康**的用例：
   * 验证集的职责是「引擎有没有坏」，不是替学员改 YAML。
   */
  allowContentReject?: boolean;
};

export type Outcome = {
  ok: boolean;
  problems: string[];
  notes: string[];
  /**
   * 本次是「内容结论浮动」被降级为通过（reject 且非引擎故障）。
   * 这种情况下响应里没有 `pack.dlcId`（没发布），调用方要跳过 dlcId 对账与试玩探活。
   */
  contentReject?: boolean;
};

export function engineIssues(result: IngestResultLike | null | undefined): IngestIssue[] {
  const issues = Array.isArray(result?.issues) ? result.issues : [];
  return issues.filter((issue) => issue && issue.rule === ENGINE_RULE);
}

export function issueSummaries(issues: IngestIssue[] | undefined, limit = 4): string {
  const list = Array.isArray(issues) ? issues : [];
  return list
    .slice(0, limit)
    .map((issue) => {
      const rule = issue?.rule ? `${issue.rule}：` : "";
      const message = String(issue?.message ?? "").replace(/\s+/g, " ").slice(0, 120);
      return `${rule}${message}`.trim();
    })
    .filter(Boolean)
    .join(" | ");
}

export const ENGINE_FAILURE_HINT =
  "审核引擎故障（不是学员 YAML 问题）：先查 scripts/codex-exec.sh 能否取到 TOKENHUB_API_KEY（或同机 /root/ai-gallery/config.json 的 llm[].api-key）、" +
  "再看服务端 logs/ingest-worker-err.log 与 OSS poem-rpg/ingest-audit/<id>/record.json 的 transcript.error；" +
  "若报 codex exec 超时，检查 src/ingest/codexReview.ts 的 CODEX_TIMEOUT_MS 与 Nginx proxy_read_timeout 的关系";

export function evaluateIngestOutcome(input: OutcomeInput): Outcome {
  const problems: string[] = [];
  const notes: string[] = [];
  const result = input.result ?? null;
  let contentReject = false;

  if (!result) {
    return { ok: false, problems: ["没有拿到审核结果（响应为空或超时被中断）"], notes };
  }

  const verdict = String(result.verdict ?? "").trim();
  if (verdict === "accept") {
    // 通过
  } else if (verdict === "skip") {
    if (input.allowSkip) {
      notes.push("verdict=skip（允许）：线上内容与提交一致，未重新审核");
    } else {
      problems.push("verdict=skip：说明版本/指纹与线上一致，Codex 根本没跑（e2e 的版本改写没生效？）");
    }
  } else if (verdict === "reject") {
    if (input.allowContentReject && engineIssues(result).length === 0) {
      contentReject = true;
      notes.push(`verdict=reject（内容结论浮动，非引擎故障，按通过计）：${issueSummaries(result.issues)}`);
    } else {
      problems.push(`verdict=reject：${issueSummaries(result.issues) || "无 issues 文本"}`);
    }
  } else {
    problems.push(`verdict 异常：${verdict || "(空)"}`);
  }

  if (result.error) {
    problems.push(`响应带 error：${result.error}${result.message ? ` / ${result.message}` : ""}`);
  }

  const engines = engineIssues(result);
  if (engines.length > 0) {
    problems.push(`${ENGINE_RULE}故障 ×${engines.length}：${issueSummaries(engines)} —— ${ENGINE_FAILURE_HINT}`);
  }

  if (input.elapsedMs > input.maxElapsedMs) {
    problems.push(`耗时 ${Math.round(input.elapsedMs / 1000)}s 超过上限 ${Math.round(input.maxElapsedMs / 1000)}s（可能正卡在超时边界）`);
  }

  const dlcId = String(result.pack?.dlcId ?? "").trim();
  if (input.expectedDlcId && !contentReject) {
    if (!dlcId) {
      problems.push(`响应里没有 pack.dlcId（期望 ${input.expectedDlcId}）`);
    } else if (dlcId !== input.expectedDlcId) {
      problems.push(`dlcId 不符：得到 ${dlcId}，期望 ${input.expectedDlcId}`);
    }
  } else if (input.expectedDlcId && contentReject) {
    // reject 不会发布，所以这里不该要求 pack.dlcId（旧口径会把 either 用例一律判失败）
    notes.push(`内容结论浮动未发布 ⇒ 跳过 ${input.expectedDlcId} 的 dlcId 对账与试玩探活`);
  }
  if (dlcId) {
    notes.push(`dlcId=${dlcId}${result.pack?.version ? ` v${result.pack.version}` : ""}`);
  }
  if (result.playUrl) {
    notes.push(`playUrl=${result.playUrl}`);
  }

  return { ok: problems.length === 0, problems, notes, contentReject };
}
