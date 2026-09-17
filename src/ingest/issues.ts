export type ReviewIssue = {
  severity: "blocking" | "warning";
  source: "machine" | "spec";
  path?: string;
  rule: string;
  message: string;
  fixHint?: string;
};

export type IngestVerdict = "accept" | "reject";

export type IngestResult = {
  verdict: IngestVerdict;
  playUrl?: string;
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
