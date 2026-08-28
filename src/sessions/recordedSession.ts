import { z } from "zod";
import { behaviorEventSchema, type BehaviorEvent } from "../analytics/eventSchema";
import { idSchema, type CompiledDlc } from "../dlc/schema";
import { groupAnswerAttempts } from "../game/answerAttempts";
import type { AnswerRecord } from "../game/gameMachine";
import { attemptQuestionSchema, type AttemptQuestion } from "../teaching/attemptCase";

export const RECORDED_SESSION_SCHEMA_VERSION = 1;
export const MAX_RECORDED_SESSIONS_PER_DLC = 20;

export const recordedSessionSchema = z.object({
  schemaVersion: z.literal(RECORDED_SESSION_SCHEMA_VERSION),
  kind: z.literal("recorded"),
  id: idSchema,
  sessionId: z.string().min(1),
  dlcId: idSchema,
  dlcVersion: z.string().min(1),
  recordedAt: z.string().datetime(),
  story: z.object({
    path: z.array(idSchema),
    choices: z.array(
      z.object({
        nodeId: idSchema,
        choiceIds: z.array(idSchema).min(1),
      }),
    ),
    gameOvers: z.array(z.object({ nodeId: idSchema })),
  }),
  quiz: z.object({
    questions: z.array(attemptQuestionSchema),
  }),
  events: z.array(behaviorEventSchema),
});

export type RecordedSession = z.infer<typeof recordedSessionSchema>;

export function sessionFileId(recordedAt: Date, sessionId: string): string {
  const stamp = recordedAt
    .toISOString()
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replace("T", "-")
    .slice(0, 15);
  const short = sessionId.replaceAll("-", "").slice(0, 8);
  return `s-${stamp}-${short}`;
}

export function isSessionCompatibleWithDlc(
  session: Pick<RecordedSession, "dlcId" | "dlcVersion">,
  dlc: Pick<CompiledDlc, "manifest">,
): boolean {
  return session.dlcId === dlc.manifest.id && session.dlcVersion === dlc.manifest.version;
}

export function compatibleRecordedSessions(
  sessions: RecordedSession[],
  dlc: Pick<CompiledDlc, "manifest">,
): RecordedSession[] {
  return sessions.filter((session) => isSessionCompatibleWithDlc(session, dlc));
}

function payloadId(value: unknown): string | undefined {
  return typeof value === "string" && idSchema.safeParse(value).success ? value : undefined;
}

function quizFromAnswers(records: AnswerRecord[]): AttemptQuestion[] {
  return groupAnswerAttempts(records).flatMap((item): AttemptQuestion[] => {
    if (item.questionType === "choice") {
      const optionIds = item.attempts
        .map((attempt) => attempt.optionId)
        .filter((id): id is string => Boolean(id));
      if (optionIds.length === 0) {
        return [];
      }
      return [{ questionId: item.questionId, type: "choice", optionIds }];
    }
    const texts = item.attempts.map((attempt) => attempt.answer).filter(Boolean);
    if (texts.length === 0) {
      return [];
    }
    return [{ questionId: item.questionId, type: "open", texts }];
  });
}

function storyFromEvents(events: BehaviorEvent[]) {
  const path: string[] = [];
  const choiceOrder: string[] = [];
  const choices = new Map<string, string[]>();
  const gameOvers: Array<{ nodeId: string }> = [];

  for (const event of events) {
    if (event.type === "story.node_entered") {
      const nodeId = payloadId(event.payload.nodeId);
      if (nodeId) {
        path.push(nodeId);
      }
    }
    if (event.type === "story.choice_selected") {
      const nodeId = payloadId(event.payload.nodeId);
      const choiceId = payloadId(event.payload.choiceId);
      if (!nodeId || !choiceId) {
        continue;
      }
      if (!choices.has(nodeId)) {
        choiceOrder.push(nodeId);
        choices.set(nodeId, []);
      }
      choices.get(nodeId)?.push(choiceId);
    }
    if (event.type === "story.game_over") {
      const nodeId = payloadId(event.payload.nodeId);
      if (nodeId) {
        gameOvers.push({ nodeId });
      }
    }
  }

  return {
    path,
    choices: choiceOrder.map((nodeId) => ({
      nodeId,
      choiceIds: choices.get(nodeId) ?? [],
    })),
    gameOvers,
  };
}

function isFlowEvent(event: BehaviorEvent): boolean {
  if (event.type === "poem.line_revealed") {
    return false;
  }
  if (event.type === "phase.entered") {
    const phase = event.payload.phase;
    return phase !== "poem" && phase !== "easterEgg" && phase !== "lessonTransition";
  }
  return true;
}

export function buildRecordedSession(input: {
  dlc: CompiledDlc;
  sessionId: string;
  events: BehaviorEvent[];
  answers: AnswerRecord[];
  recordedAt?: Date;
}): RecordedSession {
  const recordedAt = input.recordedAt ?? new Date();
  const sessionEvents = input.events.filter(
    (event) => event.sessionId === input.sessionId && isFlowEvent(event),
  );
  return recordedSessionSchema.parse({
    schemaVersion: RECORDED_SESSION_SCHEMA_VERSION,
    kind: "recorded",
    id: sessionFileId(recordedAt, input.sessionId),
    sessionId: input.sessionId,
    dlcId: input.dlc.manifest.id,
    dlcVersion: input.dlc.manifest.version,
    recordedAt: recordedAt.toISOString(),
    story: storyFromEvents(sessionEvents),
    quiz: {
      questions: quizFromAnswers(input.answers),
    },
    events: sessionEvents,
  });
}
