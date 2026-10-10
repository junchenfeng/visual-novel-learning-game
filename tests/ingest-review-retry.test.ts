import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ENGINE_ISSUE_RULE, type ReviewIssue } from "../src/ingest/issues";
import { reviewAttempts, reviewRetryDelayMs, runSpecReviewWithRetry } from "../src/ingest/reviewIngest";

const engineIssue = (message = "审核引擎不可用，请稍后重试。codex exec 超时 240000ms"): ReviewIssue => ({
  severity: "blocking",
  source: "spec",
  rule: ENGINE_ISSUE_RULE,
  message,
});

const contentIssue = (): ReviewIssue => ({
  severity: "blocking",
  source: "spec",
  rule: "poem.yaml（lines 字段表）",
  message: "lines 里出现了 SPEC 未定义的 glosses 字段",
});

const workspace = () => mkdtempSync(path.join(tmpdir(), "review-retry-"));

describe("引擎故障自动重试", () => {
  const keys = ["INGEST_REVIEW_ATTEMPTS", "INGEST_REVIEW_RETRY_DELAY_MS"] as const;
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  beforeEach(() => {
    process.env.INGEST_REVIEW_ATTEMPTS = "2";
    process.env.INGEST_REVIEW_RETRY_DELAY_MS = "0";
  });

  afterEach(() => {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  it("第一次引擎故障（超时）→ 自动重跑一次，第二次的结论生效", async () => {
    const dir = workspace();
    let calls = 0;
    const outcome = await runSpecReviewWithRetry({
      reviewer: async () => {
        calls += 1;
        return calls === 1
          ? { issues: [engineIssue()], transcript: { model: "m", prompt: "p" } }
          : { issues: [contentIssue()], transcript: { model: "m", prompt: "p" } };
      },
      packRoot: dir,
      machineIssues: [],
      workspace: dir,
    });
    expect(calls).toBe(2);
    expect(outcome.issues).toHaveLength(1);
    expect(outcome.issues[0].rule).not.toBe(ENGINE_ISSUE_RULE);
    expect(outcome.transcript?.attempts).toBe(2);
    rmSync(dir, { recursive: true, force: true });
  });

  it("学员 YAML 结论不重试（审核意见是终局，重跑只多花钱）", async () => {
    const dir = workspace();
    let calls = 0;
    const outcome = await runSpecReviewWithRetry({
      reviewer: async () => {
        calls += 1;
        return { issues: [contentIssue()], transcript: { model: "m", prompt: "p" } };
      },
      packRoot: dir,
      machineIssues: [],
      workspace: dir,
    });
    expect(calls).toBe(1);
    expect(outcome.transcript?.attempts).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("重跑前清掉上一轮写坏的 review.json / last-message.txt（别把残件当结论）", async () => {
    const dir = workspace();
    const seen: boolean[] = [];
    const outcome = await runSpecReviewWithRetry({
      reviewer: async () => {
        seen.push(existsSync(path.join(dir, "review.json")), existsSync(path.join(dir, "last-message.txt")));
        if (seen.length === 2) {
          // 模拟被超时杀掉的那一轮留下的半成品
          writeFileSync(path.join(dir, "review.json"), '{ "issues": [ { "severity": "blocking", "message": "半成品" } ] }');
          writeFileSync(path.join(dir, "last-message.txt"), "半成品");
          return { issues: [engineIssue("codex exec 超时 240000ms")], transcript: { model: "m", prompt: "p" } };
        }
        return { issues: [], transcript: { model: "m", prompt: "p" } };
      },
      packRoot: dir,
      machineIssues: [],
      workspace: dir,
    });
    expect(seen).toEqual([false, false, false, false]);
    expect(outcome.issues).toEqual([]);
    expect(outcome.transcript?.attempts).toBe(2);
    rmSync(dir, { recursive: true, force: true });
  });

  it("一直引擎故障 → 用完尝试次数后把最后一次的故障结论带回（供人排障）", async () => {
    process.env.INGEST_REVIEW_ATTEMPTS = "3";
    const dir = workspace();
    let calls = 0;
    const outcome = await runSpecReviewWithRetry({
      reviewer: async () => {
        calls += 1;
        return { issues: [engineIssue(`第 ${calls} 次超时`)], transcript: { model: "m", prompt: "p" } };
      },
      packRoot: dir,
      machineIssues: [],
      workspace: dir,
    });
    expect(calls).toBe(3);
    expect(outcome.issues[0].message).toContain("第 3 次超时");
    expect(outcome.transcript?.attempts).toBe(3);
    rmSync(dir, { recursive: true, force: true });
  });

  it("重试次数与间隔可配、并夹在安全区间（1..3 / 0..60s）", () => {
    process.env.INGEST_REVIEW_ATTEMPTS = "0";
    expect(reviewAttempts()).toBe(1);
    process.env.INGEST_REVIEW_ATTEMPTS = "9";
    expect(reviewAttempts()).toBe(3);
    process.env.INGEST_REVIEW_ATTEMPTS = "abc";
    expect(reviewAttempts()).toBe(2);
    delete process.env.INGEST_REVIEW_ATTEMPTS;
    expect(reviewAttempts()).toBe(2);

    process.env.INGEST_REVIEW_RETRY_DELAY_MS = "-5";
    expect(reviewRetryDelayMs()).toBe(0);
    process.env.INGEST_REVIEW_RETRY_DELAY_MS = "999999";
    expect(reviewRetryDelayMs()).toBe(60_000);
    delete process.env.INGEST_REVIEW_RETRY_DELAY_MS;
    expect(reviewRetryDelayMs()).toBe(3000);
  });
});
