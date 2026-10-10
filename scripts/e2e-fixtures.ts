/**
 * `poem-dlc-review-e2e-test` 的验证集（5 个用例）。
 *
 * 素材是**学员原 zip**，钉死在 OSS 的 `poem-rpg/ingest-audit/<canonical>_<ts>/pack.zip`：
 * 仓库规矩是不把学员包提交进 git（见 .gitignore 的 "never commit learner packages"），
 * 而 audit 目录是永久留存、内容冻结的，正好当只读 fixture 源。
 *
 * 每条都取「该 slot 已被 accept 的那次提交」——`assertFixtureRecord` 会校验这一点，
 * 避免 auditKey 被改错（改成一次 rejected 提交，e2e 就会误报审核失败）。
 */
import { MAX_ZIP_BYTES } from "../src/dlc/uploadPack";
import { E2E_INGEST_STUDENT, E2E_STUDENT_IDS } from "../src/ingest/l2Students";
import type { PoemStore } from "../src/server/poemStore";
import {
  auditPackZipKey,
  auditRecordKey,
  defaultStore,
  isIngestDlcRecord,
  recordMatchesSlot,
  type AuditRecord,
} from "./ingest-lib/auditStore";

export const E2E_STUDENT_NICKNAME = E2E_INGEST_STUDENT.nickname;
export const E2E_CLASS_ID = E2E_INGEST_STUDENT.classId;

export type E2eStudent = { studentId: string; nickname: string; classId: string };

/** e2e 专用学员身份（真身在 src/ingest/l2Students.ts，这里只为脚本便利派生一份）。 */
export const E2E_STUDENTS: E2eStudent[] = E2E_STUDENT_IDS.map((studentId) => ({
  studentId,
  nickname: E2E_STUDENT_NICKNAME,
  classId: E2E_CLASS_ID,
}));

export type E2eCase = {
  /** 人类可读的用例名（--case 用它筛选） */
  name: string;
  /** 只读 fixture：audit 目录（含尾斜杠） */
  auditKey: string;
  /** 原提交学员（仅溯源用，e2e 不用它提交） */
  canonicalUser: string;
  poetId: string;
  workTitle: string;
  /** 该学员的线上 dlcId（溯源用） */
  sourceDlcId: string;
  /** 包内 manifest.id，用于校验 zip 没被换过 */
  expectedShortId: string;
  /** e2e 身份，决定发布出来的 dlcId = `<shortId>-<e2eUserId>` */
  e2eUserId: string;
};

const AUDIT = "poem-rpg/ingest-audit/";

export const E2E_CASES: E2eCase[] = [
  {
    name: "望岳",
    auditKey: `${AUDIT}hh_2841978_20261010T034917Z/`,
    canonicalUser: "hh_2841978",
    poetId: "dufu",
    workTitle: "望岳",
    sourceDlcId: "hailao-wangyue-hh_2841978",
    expectedShortId: "hailao-wangyue",
    e2eUserId: "hh_0000000",
  },
  {
    name: "赋得古原草送别",
    auditKey: `${AUDIT}hh_1983356_20261010T041545Z/`,
    canonicalUser: "hh_1983356",
    poetId: "baijuyi",
    workTitle: "赋得古原草送别",
    sourceDlcId: "baijuyi-fudecao-hh_1983356",
    expectedShortId: "baijuyi-fudecao",
    e2eUserId: "hh_0000001",
  },
  {
    name: "池上",
    auditKey: `${AUDIT}hh_1983356_20260930T142306Z/`,
    canonicalUser: "hh_1983356",
    poetId: "baijuyi",
    workTitle: "池上",
    sourceDlcId: "baijuyi-chishang-hh_1983356",
    expectedShortId: "baijuyi-chishang",
    e2eUserId: "hh_0000002",
  },
  {
    name: "水调歌头-张星泽",
    auditKey: `${AUDIT}hh_9543026_20261010T040012Z/`,
    canonicalUser: "hh_9543026",
    poetId: "sushi",
    workTitle: "水调歌头·明月几时有",
    sourceDlcId: "data-demo-hh_9543026",
    expectedShortId: "data-demo",
    e2eUserId: "hh_0000003",
  },
  {
    name: "水调歌头-CICI",
    auditKey: `${AUDIT}hh_181668_20261010T035119Z/`,
    canonicalUser: "hh_181668",
    poetId: "sushi",
    workTitle: "水调歌头·明月几时有",
    sourceDlcId: "data-demo-hh_181668",
    expectedShortId: "data-demo",
    e2eUserId: "hh_0000004",
  },
];

export function findCases(selector?: string[]): E2eCase[] {
  if (!selector || selector.length === 0) {
    return E2E_CASES;
  }
  // 允许 `--case 望岳,池上` 这种写法：逗号分隔与多次传参等价
  const wanted = new Set(
    selector
      .flatMap((item) => String(item).split(","))
      .map((item) => item.trim())
      .filter(Boolean),
  );
  const picked = E2E_CASES.filter((item) => wanted.has(item.name) || wanted.has(item.e2eUserId) || wanted.has(item.sourceDlcId));
  const missing = [...wanted].filter(
    (item) => !E2E_CASES.some((c) => c.name === item || c.e2eUserId === item || c.sourceDlcId === item),
  );
  if (missing.length > 0) {
    throw new Error(`未知用例：${missing.join(", ")}；可选：${E2E_CASES.map((c) => c.name).join(" / ")}`);
  }
  return picked;
}

export type FixtureCheck = {
  name: string;
  ok: boolean;
  problems: string[];
  zipBytes?: number;
  recordVerdict?: string;
};

/** 配置自检（纯函数）：用例名/身份不重、auditKey 格式对、溯源字段自洽。 */
export function assertFixtureConfig(cases: E2eCase[] = E2E_CASES): string[] {
  const problems: string[] = [];
  const seenNames = new Set<string>();
  const seenUsers = new Set<string>();
  for (const testCase of cases) {
    if (!testCase.name) problems.push("存在没有 name 的用例");
    if (seenNames.has(testCase.name)) problems.push(`用例名重复：${testCase.name}`);
    seenNames.add(testCase.name);
    if (seenUsers.has(testCase.e2eUserId)) problems.push(`e2e 身份重复：${testCase.e2eUserId}（同身份会挤在同一个上传槽）`);
    seenUsers.add(testCase.e2eUserId);
    const digits = testCase.e2eUserId.replace(/^hh_?/, "");
    if (!E2E_STUDENT_IDS.includes(digits as (typeof E2E_STUDENT_IDS)[number])) {
      problems.push(`e2e 身份未登记在 l2Students.ts：${testCase.e2eUserId}`);
    }
    if (!testCase.auditKey.startsWith(AUDIT) || !testCase.auditKey.endsWith("/")) {
      problems.push(`auditKey 形状不对（应为 ${AUDIT}<canonical>_<ts>/）：${testCase.auditKey}`);
    }
    if (!testCase.poetId || !testCase.workTitle) problems.push(`${testCase.name} 缺 poetId/workTitle`);
    if (!testCase.expectedShortId) problems.push(`${testCase.name} 缺 expectedShortId`);
    if (!testCase.sourceDlcId.endsWith(`-${testCase.canonicalUser}`)) {
      problems.push(`${testCase.name} 的 sourceDlcId（${testCase.sourceDlcId}）与 canonicalUser（${testCase.canonicalUser}）对不上`);
    }
  }
  return problems;
}

/** 校验 fixture 指向的是「一次被 accept 的提交」，并且 pack.zip 在。纯读。 */
export async function assertFixtureRecord(
  store: PoemStore,
  testCase: E2eCase,
): Promise<{ record: AuditRecord | null; zipBytes: number | null; problems: string[] }> {
  const problems: string[] = [];
  const record = await store.readJson<AuditRecord>(auditRecordKey(testCase.auditKey));
  if (!record) {
    return { record: null, zipBytes: null, problems: [`audit 记录读不到：${auditRecordKey(testCase.auditKey)}`] };
  }
  if (!isIngestDlcRecord(record)) {
    problems.push(`audit 记录不是提交（tool=${record.tool ?? "?"}）：${testCase.auditKey}`);
  }
  if (!recordMatchesSlot(record, { canonical: testCase.canonicalUser, poetId: testCase.poetId, workTitle: testCase.workTitle })) {
    problems.push(
      `audit 记录与用例对不上（期望 ${testCase.canonicalUser} / ${testCase.poetId} / ${testCase.workTitle}）`,
    );
  }
  const verdict = String(record.response?.verdict ?? "");
  if (verdict !== "accept" && verdict !== "skip") {
    problems.push(`fixture 应指向一次通过（accept/skip）的提交，实际 verdict=${verdict || "?"}`);
  }
  const zip = await store.getObject(auditPackZipKey(testCase.auditKey));
  if (!zip || zip.byteLength === 0) {
    problems.push(`pack.zip 不存在或为空：${auditPackZipKey(testCase.auditKey)}`);
  } else if (zip.byteLength > MAX_ZIP_BYTES) {
    problems.push(`pack.zip 超过 30MB：${zip.byteLength}`);
  }
  return { record, zipBytes: zip?.byteLength ?? null, problems };
}

export async function loadFixtureZip(store: PoemStore, testCase: E2eCase): Promise<Buffer> {
  const zip = await store.getObject(auditPackZipKey(testCase.auditKey));
  if (!zip || zip.byteLength === 0) {
    throw new Error(`fixture 缺失：${auditPackZipKey(testCase.auditKey)}`);
  }
  return zip;
}

export async function checkFixtures(
  cases: E2eCase[],
  store: PoemStore = defaultStore(),
): Promise<FixtureCheck[]> {
  const out: FixtureCheck[] = [];
  for (const testCase of cases) {
    const { record, zipBytes, problems } = await assertFixtureRecord(store, testCase);
    out.push({
      name: testCase.name,
      ok: problems.length === 0,
      problems,
      zipBytes: zipBytes ?? undefined,
      recordVerdict: record?.response?.verdict,
    });
  }
  return out;
}
