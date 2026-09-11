import { INGEST_USER_ID_HINT, L2_STUDENT_BY_ID } from "./l2Students";
import { machineIssue, type ReviewIssue } from "./issues";

const HH_USER_ID = /^hh_?(\d+)$/i;

export type IngestUser = {
  raw: string;
  canonical: string;
  studentId: string;
  nickname: string;
  classId: string;
};

export function parseIngestUserId(raw: string): IngestUser | null {
  const trimmed = raw.trim();
  const match = trimmed.match(HH_USER_ID);
  if (!match?.[1]) {
    return null;
  }
  const student = L2_STUDENT_BY_ID.get(match[1]);
  if (!student) {
    return null;
  }
  return {
    raw: trimmed,
    canonical: `hh_${student.studentId}`,
    studentId: student.studentId,
    nickname: student.nickname,
    classId: student.classId,
  };
}

export function ingestUserIdIssues(): ReviewIssue[] {
  return [
    machineIssue(INGEST_USER_ID_HINT, {
      rule: "userId",
      fixHint: "须为 hh学号 或 hh_学号，且学号是当前 L2 在读学员。不确定请咨询老师。",
    }),
  ];
}

export function ingestUserReject() {
  return {
    verdict: "reject" as const,
    issues: ingestUserIdIssues(),
  };
}

export type IngestAuthReject = ReturnType<typeof ingestUserReject> & { auditId?: string };

export function isIngestUserIdReject(result: unknown): result is IngestAuthReject {
  if (!result || typeof result !== "object" || !("issues" in result)) {
    return false;
  }
  const issues = (result as { issues?: unknown }).issues;
  return (
    Array.isArray(issues) &&
    issues.some((issue) => Boolean(issue && typeof issue === "object" && (issue as { rule?: string }).rule === "userId"))
  );
}

