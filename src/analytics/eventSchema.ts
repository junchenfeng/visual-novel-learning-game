import { z } from "zod";
import { createId } from "../ui/uuid";

export const BEHAVIOR_EVENT_SCHEMA_VERSION = 1;
export const BEHAVIOR_STORAGE_KEY = "poem-rpg:behavior-events:v1";

export const behaviorEventTypeSchema = z.enum([
  "session.started",
  "phase.entered",
  "story.node_entered",
  "story.choice_selected",
  "story.game_over",
  "story.replayed",
  "poem.line_revealed", // 旧日志可能还有；新对局不再打点，存档会丢掉
  "quiz.answer_submitted",
  "teacher.feedback_received",
  "summary.received",
  "game.completed",
]);

export const behaviorEventSchema = z.object({
  schemaVersion: z.literal(BEHAVIOR_EVENT_SCHEMA_VERSION),
  eventId: z.string().min(1),
  sessionId: z.string().min(1),
  dlcId: z.string().min(1),
  dlcVersion: z.string().min(1),
  timestamp: z.string().datetime(),
  type: behaviorEventTypeSchema,
  payload: z.record(z.string(), z.unknown()),
});

export const behaviorLogSchema = z.object({
  schemaVersion: z.literal(BEHAVIOR_EVENT_SCHEMA_VERSION),
  events: z.array(behaviorEventSchema),
});

export type BehaviorEventType = z.infer<typeof behaviorEventTypeSchema>;
export type BehaviorEvent = z.infer<typeof behaviorEventSchema>;
export type BehaviorLog = z.infer<typeof behaviorLogSchema>;

export function createBehaviorEvent(input: {
  sessionId: string;
  dlcId: string;
  dlcVersion: string;
  type: BehaviorEventType;
  payload?: Record<string, unknown>;
}): BehaviorEvent {
  return behaviorEventSchema.parse({
    schemaVersion: BEHAVIOR_EVENT_SCHEMA_VERSION,
    eventId: createId(),
    sessionId: input.sessionId,
    dlcId: input.dlcId,
    dlcVersion: input.dlcVersion,
    timestamp: new Date().toISOString(),
    type: input.type,
    payload: input.payload ?? {},
  });
}
