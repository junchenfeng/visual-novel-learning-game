import { compactAuditTimestamp, ingestAuditPrefix } from "../../src/ingest/audit";

describe("审计时间戳", () => {
  it("保留毫秒（目录名仍是紧凑 ISO 形状）", () => {
    expect(compactAuditTimestamp("2026-10-10T05:12:11.123Z")).toBe("20261010T051211123Z");
    expect(compactAuditTimestamp("2026-09-11T10:26:48.123Z")).toBe("20260911T102648123Z");
    // 没带毫秒时补零，保证长度一致
    expect(compactAuditTimestamp("2026-09-11T10:26:48Z")).toBe("20260911T102648000Z");
    expect(compactAuditTimestamp("2026-09-11T10:26:48.5Z")).toBe("20260911T102648500Z");
    // 非法输入退回旧行为（剥掉 - 与 :），不抛错
    expect(compactAuditTimestamp("nope")).toBe("nope");
    expect(compactAuditTimestamp("2026-10-10 05:12:11")).toBe("20261010 051211");
  });

  it("同一秒的两次调用不再撞目录（2026-10-10 的覆盖 bug）", () => {
    const submit = compactAuditTimestamp("2026-10-10T05:12:11.041Z");
    const followUp = compactAuditTimestamp("2026-10-10T05:12:11.238Z");
    expect(submit).not.toBe(followUp);
    // 秒级精度下这两个是同一个目录前缀 —— 后写者会覆盖前者的 record.json
    expect(submit.slice(0, 15)).toBe(followUp.slice(0, 15));
    expect(ingestAuditPrefix("hh_0000000", "2026-10-10T05:12:11.041Z")).not.toBe(
      ingestAuditPrefix("hh_0000000", "2026-10-10T05:12:11.238Z"),
    );
  });

  it("前缀形状不变（仍是 poem-rpg/ingest-audit/<canonical>_<ts>）", () => {
    expect(ingestAuditPrefix("hh_11016863", "2026-09-11T10:26:48.123Z")).toBe(
      "poem-rpg/ingest-audit/hh_11016863_20260911T102648123Z",
    );
  });
});
