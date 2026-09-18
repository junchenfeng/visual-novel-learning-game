export type ReviewIssue = {
  severity: "blocking" | "warning";
  source: "machine" | "spec";
  path?: string;
  rule: string;
  message: string;
  fixHint?: string;
};

/**
 * 审核结论：
 * - `accept`：本轮通过审核并（重新）上架；
 * - `reject`：没过，按 issues 改 YAML 再传；
 * - `skip`：与线上那份「版本 + 内容指纹」都一样，没做任何事，线上保持原样。
 *   `skip` 不是失败 —— 消费方（HTTP 状态码、preview 状态、agent 汇报）都不要当成 reject。
 */
export type IngestVerdict = "accept" | "reject" | "skip";

export type IngestResult = {
  verdict: IngestVerdict;
  playUrl?: string;
  /** 给调用方（尤其 agent）解释这次为什么是这个结论，`skip` 时必有。 */
  reason?: string;
  pack?: {
    userId: string;
    dlcId: string;
    poetId: string;
    workTitle: string;
    author: string;
    version: string;
  };
  issues: ReviewIssue[];
  transcript?: unknown;
  auditId?: string;
};

export function hasBlocking(issues: ReviewIssue[]): boolean {
  return issues.some((issue) => issue.severity === "blocking");
}

export function machineIssue(
  message: string,
  extras: Partial<Pick<ReviewIssue, "path" | "rule" | "fixHint">> = {},
): ReviewIssue {
  return {
    severity: "blocking",
    source: "machine",
    rule: extras.rule ?? "DLC 校验",
    message,
    path: extras.path,
    fixHint: extras.fixHint,
  };
}
