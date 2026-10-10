/** 2026 秋智造营 L2 在读学员（2026-09-11 从 ai-gallery enrollments.status=active 导出）。 */
export type L2EnrolledStudent = {
  studentId: string;
  nickname: string;
  classId: string;
};

/** e2e 验证集身份的昵称/班级（`scripts/e2e-fixtures.ts` 与测试共用，避免写死两处）。 */
export const E2E_INGEST_STUDENT = { nickname: "e2e验证", classId: "l2-e2e" } as const;

/** 真学员名单之后追加的 e2e 身份学号（顺序与 `scripts/e2e-fixtures.ts` 的用例一一对应）。 */
export const E2E_STUDENT_IDS = ["0000000", "0000001", "0000002", "0000003", "0000004"] as const;

export const L2_ENROLLED_STUDENTS: L2EnrolledStudent[] = [
  { studentId: "11016863", nickname: "李晓满", classId: "l2-fjc-byy-sat-aft" },
  { studentId: "11019876", nickname: "佳逸", classId: "l2-fjc-byy-sat-aft" },
  { studentId: "297863", nickname: "帆帆", classId: "l2-fjc-byy-sat-aft" },
  { studentId: "3408594", nickname: "赫赫", classId: "l2-fjc-byy-sat-aft" },
  { studentId: "790441", nickname: "多多", classId: "l2-fjc-byy-sat-aft" },
  { studentId: "8834919", nickname: "佟戈文", classId: "l2-fjc-byy-sat-aft" },
  { studentId: "11038901", nickname: "黄宥钧", classId: "l2-ck-lxh-fri-eve" },
  { studentId: "11165606", nickname: "刘陈煊", classId: "l2-ck-lxh-fri-eve" },
  { studentId: "11171831", nickname: "胡豆", classId: "l2-ck-lxh-fri-eve" },
  { studentId: "11204173", nickname: "郁圣熠", classId: "l2-ck-lxh-fri-eve" },
  { studentId: "11228186", nickname: "妙微", classId: "l2-ck-lxh-fri-eve" },
  { studentId: "11489615", nickname: "Dora", classId: "l2-ck-lxh-fri-eve" },
  { studentId: "1321598", nickname: "钱宥铮", classId: "l2-ck-lxh-fri-eve" },
  { studentId: "1493369", nickname: "奕杉", classId: "l2-ck-lxh-fri-eve" },
  { studentId: "1578", nickname: "小马", classId: "l2-ck-lxh-fri-eve" },
  { studentId: "1856931", nickname: "赵元齐", classId: "l2-ck-lxh-fri-eve" },
  { studentId: "1983356", nickname: "文文", classId: "l2-ck-lxh-fri-eve" },
  { studentId: "3749396", nickname: "亮亮", classId: "l2-ck-lxh-fri-eve" },
  { studentId: "5394147", nickname: "Vinson", classId: "l2-ck-lxh-fri-eve" },
  { studentId: "7304597", nickname: "荣宝", classId: "l2-ck-lxh-fri-eve" },
  { studentId: "7685997", nickname: "多多", classId: "l2-ck-lxh-fri-eve" },
  { studentId: "8798527", nickname: "Lion", classId: "l2-ck-lxh-fri-eve" },
  { studentId: "9543026", nickname: "张星泽", classId: "l2-ck-lxh-fri-eve" },
  { studentId: "10952882", nickname: "阳阳", classId: "l2-ck-lxh-sat-aft" },
  { studentId: "10976394", nickname: "开心", classId: "l2-ck-lxh-sat-aft" },
  { studentId: "10976501", nickname: "豆豆", classId: "l2-ck-lxh-sat-aft" },
  { studentId: "11014385", nickname: "孟星雨", classId: "l2-ck-lxh-sat-aft" },
  { studentId: "11028662", nickname: "孙甲正", classId: "l2-ck-lxh-sat-aft" },
  { studentId: "11034883", nickname: "于航", classId: "l2-ck-lxh-sat-aft" },
  { studentId: "1130749", nickname: "童煜珂", classId: "l2-ck-lxh-sat-aft" },
  { studentId: "1262752", nickname: "牛牛", classId: "l2-ck-lxh-sat-aft" },
  { studentId: "1736942", nickname: "元元", classId: "l2-ck-lxh-sat-aft" },
  { studentId: "222973", nickname: "土豆", classId: "l2-ck-lxh-sat-aft" },
  { studentId: "2233402", nickname: "Eddie", classId: "l2-ck-lxh-sat-aft" },
  { studentId: "316743", nickname: "小闲", classId: "l2-ck-lxh-sat-aft" },
  { studentId: "4638530", nickname: "Chloe", classId: "l2-ck-lxh-sat-aft" },
  { studentId: "61003", nickname: "胡钦源", classId: "l2-ck-lxh-sat-aft" },
  { studentId: "657693", nickname: "周若楠", classId: "l2-ck-lxh-sat-aft" },
  { studentId: "6945501", nickname: "赵英贺", classId: "l2-ck-lxh-sat-aft" },
  { studentId: "7631539", nickname: "桉琪", classId: "l2-ck-lxh-sat-aft" },
  { studentId: "8232067", nickname: "张中仑", classId: "l2-ck-lxh-sat-aft" },
  { studentId: "8490867", nickname: "Derek", classId: "l2-ck-lxh-sat-aft" },
  { studentId: "10281877", nickname: "汤牧原", classId: "l2-ck-lxh-sat-eve" },
  { studentId: "1046318", nickname: "北北", classId: "l2-ck-lxh-sat-eve" },
  { studentId: "10969150", nickname: "李阅旸", classId: "l2-ck-lxh-sat-eve" },
  { studentId: "10987401", nickname: "魏凡钧", classId: "l2-ck-lxh-sat-eve" },
  { studentId: "10987453", nickname: "Poly", classId: "l2-ck-lxh-sat-eve" },
  { studentId: "10992444", nickname: "睿睿", classId: "l2-ck-lxh-sat-eve" },
  { studentId: "10993483", nickname: "丁冠焜", classId: "l2-ck-lxh-sat-eve" },
  { studentId: "11001326", nickname: "Alex", classId: "l2-ck-lxh-sat-eve" },
  { studentId: "11003108", nickname: "Alan", classId: "l2-ck-lxh-sat-eve" },
  { studentId: "11038403", nickname: "Josie", classId: "l2-ck-lxh-sat-eve" },
  { studentId: "11367636", nickname: "马咖", classId: "l2-ck-lxh-sat-eve" },
  { studentId: "11393822", nickname: "刘洛衣", classId: "l2-ck-lxh-sat-eve" },
  { studentId: "1204707", nickname: "雯雯", classId: "l2-ck-lxh-sat-eve" },
  { studentId: "1341994", nickname: "orange", classId: "l2-ck-lxh-sat-eve" },
  { studentId: "149462", nickname: "小高", classId: "l2-ck-lxh-sat-eve" },
  { studentId: "181668", nickname: "CICI&Mia", classId: "l2-ck-lxh-sat-eve" },
  { studentId: "1850745", nickname: "刘建建", classId: "l2-ck-lxh-sat-eve" },
  { studentId: "1993102", nickname: "芃芃", classId: "l2-ck-lxh-sat-eve" },
  { studentId: "279102", nickname: "芃芃", classId: "l2-ck-lxh-sat-eve" },
  { studentId: "2841978", nickname: "伊恩", classId: "l2-ck-lxh-sat-eve" },
  { studentId: "500894", nickname: "阿西", classId: "l2-ck-lxh-sat-eve" },
  { studentId: "5963637", nickname: "凯凯", classId: "l2-ck-lxh-sat-eve" },
  { studentId: "892220", nickname: "八宝儿", classId: "l2-ck-lxh-sat-eve" },
  { studentId: "9699876", nickname: "Matthies", classId: "l2-ck-lxh-sat-eve" },

  // ── e2e 发布验证集专用身份（不是真学员，勿删）────────────────────────────────
  // 供 `pnpm poem-dlc-review-e2e-test` 使用：把已上架学员包以 e2e 身份重提交，
  // 走完整 MCP 链路（鉴权 → 机器校验 → Codex 审核 → 发布）以验证线上审核引擎。
  // 一个用例一个 id：用例发布到 `<shortId>-<e2eUserId>`，而多份学员包 short id 相同
  // （如两份 `data-demo`），共用一个 id 会挤在同一个上传槽上互相覆盖。
  // 这些 id 会出现在管理台/预览台的提交记录里（昵称「e2e验证」），属预期。
  { studentId: "0000000", nickname: E2E_INGEST_STUDENT.nickname, classId: E2E_INGEST_STUDENT.classId },
  { studentId: "0000001", nickname: E2E_INGEST_STUDENT.nickname, classId: E2E_INGEST_STUDENT.classId },
  { studentId: "0000002", nickname: E2E_INGEST_STUDENT.nickname, classId: E2E_INGEST_STUDENT.classId },
  { studentId: "0000003", nickname: E2E_INGEST_STUDENT.nickname, classId: E2E_INGEST_STUDENT.classId },
  { studentId: "0000004", nickname: E2E_INGEST_STUDENT.nickname, classId: E2E_INGEST_STUDENT.classId },
];

export const L2_STUDENT_BY_ID = new Map(L2_ENROLLED_STUDENTS.map((item) => [item.studentId, item]));

export const INGEST_USER_ID_HINT = "user id不正确，需要咨询老师";
