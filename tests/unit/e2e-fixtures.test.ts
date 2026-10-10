import {
  E2E_CASES,
  E2E_STUDENTS,
  assertFixtureConfig,
  findCases,
} from "../../scripts/e2e-fixtures";
import { isIngestDlcRecord, recordMatchesSlot } from "../../scripts/ingest-lib/auditStore";
import { L2_STUDENT_BY_ID, E2E_STUDENT_IDS, E2E_INGEST_STUDENT } from "../../src/ingest/l2Students";
import { parseIngestUserId } from "../../src/ingest/userId";

describe("e2e 验证集配置", () => {
  it("配置自检通过（用例名/身份不重、auditKey 与溯源字段自洽）", () => {
    expect(assertFixtureConfig()).toEqual([]);
  });

  it("5 个用例，逐个用独立 e2e 身份（同身份会挤在同一个上传槽）", () => {
    expect(E2E_CASES).toHaveLength(5);
    const users = E2E_CASES.map((item) => item.e2eUserId);
    expect(new Set(users).size).toBe(users.length);
    // 两份 data-demo 包的 short id 相同，靠不同身份才拿到不同 dlcId
    const dataDemo = E2E_CASES.filter((item) => item.expectedShortId === "data-demo");
    expect(dataDemo).toHaveLength(2);
    expect(new Set(dataDemo.map((item) => item.e2eUserId)).size).toBe(2);
  });

  it("内容结论浮动的用例必须写明原因，默认一律 accept 口径", () => {
    for (const item of E2E_CASES) {
      expect([undefined, "accept", "either"]).toContain(item.expect);
      if (item.expect === "either") {
        expect(String(item.note ?? "").length).toBeGreaterThan(0);
      }
    }
    // 池上：审核员会审出 gameOver 文案问题（真实内容结论，非引擎故障）
    const chishang = E2E_CASES.find((item) => item.name === "池上");
    expect(chishang?.expect).toBe("either");
    expect(E2E_CASES.filter((item) => item.expect === "either")).toHaveLength(1);
  });

  it("e2e 身份已在 L2 名单里登记且能通过鉴权解析", () => {
    for (const studentId of E2E_STUDENT_IDS) {
      expect(L2_STUDENT_BY_ID.get(studentId)?.nickname).toBe(E2E_INGEST_STUDENT.nickname);
    }
    for (const item of E2E_STUDENTS) {
      const parsed = parseIngestUserId(`hh_${item.studentId}`);
      expect(parsed).not.toBeNull();
      expect(parsed?.canonical).toBe(`hh_${item.studentId}`);
      expect(parsed?.nickname).toBe(E2E_INGEST_STUDENT.nickname);
      expect(parsed?.classId).toBe(E2E_INGEST_STUDENT.classId);
    }
  });

  it("fixture 记录必须是提交记录，且能按 slot 精确匹配", () => {
    const ingestRecord = {
      tool: "ingest_dlc",
      user: { canonical: "hh_2841978" },
      query: { poetId: "dufu", workTitle: "望岳" },
    };
    const queryRecord = { ...ingestRecord, tool: "list_my_dlc" };
    expect(isIngestDlcRecord(ingestRecord)).toBe(true);
    expect(isIngestDlcRecord(queryRecord)).toBe(false);
    expect(isIngestDlcRecord(null)).toBe(false);

    expect(recordMatchesSlot(ingestRecord, { canonical: "hh_2841978", poetId: "dufu", workTitle: "望岳" })).toBe(true);
    expect(recordMatchesSlot(ingestRecord, { canonical: "hh_9543026", poetId: "dufu", workTitle: "望岳" })).toBe(false);
    expect(recordMatchesSlot(ingestRecord, { canonical: "hh_2841978", poetId: "sushi", workTitle: "望岳" })).toBe(false);
    expect(recordMatchesSlot(ingestRecord, { canonical: "hh_2841978", poetId: "dufu", workTitle: "春望" })).toBe(false);
    // 老记录可能没带 poetId/workTitle，此时不做否定判断
    expect(recordMatchesSlot({ tool: "ingest_dlc", user: { canonical: "hh_2841978" }, query: {} }, {
      canonical: "hh_2841978",
      poetId: "dufu",
      workTitle: "望岳",
    })).toBe(true);
  });

  it("findCases 支持按用例名 / e2e 身份 / 线上 dlcId 筛选，未知名字报错", () => {
    expect(findCases([])).toHaveLength(5);
    expect(findCases(["望岳"]).map((item) => item.name)).toEqual(["望岳"]);
    expect(findCases(["hh_0000003"]).map((item) => item.name)).toEqual(["水调歌头-张星泽"]);
    expect(findCases(["data-demo-hh_181668"]).map((item) => item.name)).toEqual(["水调歌头-CICI"]);
    expect(findCases(["望岳,池上"])).toHaveLength(2);
    expect(() => findCases(["不存在的用例"])).toThrow(/未知用例/);
  });
});
