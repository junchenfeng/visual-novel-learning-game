import {
  ENGINE_FAILURE_HINT,
  ENGINE_RULE,
  engineIssues,
  evaluateIngestOutcome,
  issueSummaries,
  type IngestResultLike,
} from "../../scripts/ingest-lib/outcome";

const accepted: IngestResultLike = {
  verdict: "accept",
  issues: [],
  pack: { dlcId: "data-demo-hh_0000003", version: "1.0+e2e.20261010" },
  playUrl: "https://poem.aibeaver.cn/play/data-demo-hh_0000003",
};

describe("审核结果判定", () => {
  it("accept 且在预算内、dlcId 对得上 → 通过", () => {
    const outcome = evaluateIngestOutcome({
      result: accepted,
      elapsedMs: 180_000,
      maxElapsedMs: 300_000,
      expectedDlcId: "data-demo-hh_0000003",
    });
    expect(outcome.ok).toBe(true);
    expect(outcome.problems).toEqual([]);
    expect(outcome.notes.join()).toContain("data-demo-hh_0000003");
  });

  it("审核引擎故障是致命项，并给出排查提示（2026-10-09 事故签名）", () => {
    const broken: IngestResultLike = {
      verdict: "reject",
      issues: [
        { severity: "blocking", source: "spec", rule: ENGINE_RULE, message: "审核引擎不可用，请稍后重试。" },
      ],
    };
    expect(engineIssues(broken)).toHaveLength(1);
    const outcome = evaluateIngestOutcome({ result: broken, elapsedMs: 2_000, maxElapsedMs: 300_000 });
    expect(outcome.ok).toBe(false);
    expect(outcome.problems.some((item) => item.includes(ENGINE_RULE))).toBe(true);
    expect(outcome.problems.some((item) => item.includes(ENGINE_FAILURE_HINT))).toBe(true);
  });

  it("学员 YAML 真问题只报 issues 摘要，不误判成引擎故障", () => {
    const rejected: IngestResultLike = {
      verdict: "reject",
      issues: [{ severity: "blocking", rule: "questions[].contextRefs", message: "引用了不存在的节点" }],
    };
    const outcome = evaluateIngestOutcome({ result: rejected, elapsedMs: 90_000, maxElapsedMs: 300_000 });
    expect(outcome.ok).toBe(false);
    expect(outcome.problems.join()).toContain("questions[].contextRefs");
    expect(outcome.problems.some((item) => item.includes(ENGINE_RULE))).toBe(false);
  });

  it("内容结论浮动：reject 但非引擎故障在 allowContentReject 下按通过计（并留提示）", () => {
    const contentReject: IngestResultLike = {
      verdict: "reject",
      issues: [{ severity: "blocking", rule: "story.yaml（故事图）→ 结局 gameOver 节点的 text 字段", message: "文案把矛头指向家长" }],
    };
    const strict = evaluateIngestOutcome({ result: contentReject, elapsedMs: 90_000, maxElapsedMs: 300_000 });
    expect(strict.ok).toBe(false);

    const lenient = evaluateIngestOutcome({
      result: contentReject,
      elapsedMs: 90_000,
      maxElapsedMs: 300_000,
      allowContentReject: true,
    });
    expect(lenient.ok).toBe(true);
    expect(lenient.notes.join()).toContain("内容结论浮动");

    // reject 不会发布 ⇒ 即便给了 expectedDlcId，也不该因「没有 pack.dlcId」判失败（否则 either 用例必挂）
    const lenientWithExpected = evaluateIngestOutcome({
      result: contentReject,
      elapsedMs: 90_000,
      maxElapsedMs: 300_000,
      expectedDlcId: "baijuyi-chishang-hh_0000002",
      allowContentReject: true,
    });
    expect(lenientWithExpected.ok).toBe(true);
    expect(lenientWithExpected.contentReject).toBe(true);
    expect(lenientWithExpected.notes.join()).toContain("跳过");

    // 引擎故障永远是硬失败，即便 allowContentReject
    const brokenEngine = evaluateIngestOutcome({
      result: { verdict: "reject", issues: [{ severity: "blocking", rule: ENGINE_RULE, message: "审核引擎不可用" }] },
      elapsedMs: 1_000,
      maxElapsedMs: 300_000,
      allowContentReject: true,
    });
    expect(brokenEngine.ok).toBe(false);
    expect(brokenEngine.problems.some((item) => item.includes(ENGINE_RULE))).toBe(true);
  });

  it("skip 默认算失败（说明版本改写没生效、Codex 没跑），--allow-skip 才放行", () => {
    const skipped: IngestResultLike = { verdict: "skip", issues: [], reason: "版本与内容指纹均未变化" };
    expect(evaluateIngestOutcome({ result: skipped, elapsedMs: 1_000, maxElapsedMs: 300_000 }).ok).toBe(false);
    expect(evaluateIngestOutcome({ result: skipped, elapsedMs: 1_000, maxElapsedMs: 300_000, allowSkip: true }).ok).toBe(true);
  });

  it("耗时超预算、dlcId 不符、响应为空都算失败", () => {
    expect(evaluateIngestOutcome({ result: accepted, elapsedMs: 301_000, maxElapsedMs: 300_000 }).problems.join()).toMatch(/超过上限/);
    expect(
      evaluateIngestOutcome({ result: accepted, elapsedMs: 1_000, maxElapsedMs: 300_000, expectedDlcId: "baijuyi-chishang-hh_0000002" })
        .problems.join(),
    ).toMatch(/dlcId 不符/);
    expect(evaluateIngestOutcome({ result: null, elapsedMs: 1_000, maxElapsedMs: 300_000 }).problems.join()).toMatch(/没有拿到审核结果/);
    expect(
      evaluateIngestOutcome({ result: { verdict: "reject", error: "queue_full" }, elapsedMs: 10, maxElapsedMs: 300_000, expectedDlcId: "x" })
        .problems.join(),
    ).toMatch(/queue_full/);
  });

  it("issueSummaries 截断长文本并跳过空行", () => {
    expect(issueSummaries([])).toBe("");
    expect(issueSummaries([{ rule: "zip", message: "x".repeat(300) }]).length).toBeLessThan(200);
    expect(issueSummaries([{ message: "   " }, { rule: "r", message: "m" }])).toBe("r：m");
  });
});
