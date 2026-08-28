import { z } from "zod";
import { idSchema } from "../dlc/schema";

export const CASE_SCHEMA_VERSION = 1;

export const choiceAttemptSchema = z.object({
  questionId: idSchema,
  type: z.literal("choice"),
  optionIds: z.array(idSchema).min(1),
});

export const openAttemptSchema = z.object({
  questionId: idSchema,
  type: z.literal("open"),
  texts: z.array(z.string().min(1)).min(1),
});

export const attemptQuestionSchema = z.discriminatedUnion("type", [
  choiceAttemptSchema,
  openAttemptSchema,
]);

export const attemptCaseSchema = z.object({
  schemaVersion: z.literal(CASE_SCHEMA_VERSION),
  id: idSchema,
  label: z.string().min(1),
  questions: z.array(attemptQuestionSchema).min(1),
});

export type ChoiceAttempt = z.infer<typeof choiceAttemptSchema>;
export type OpenAttempt = z.infer<typeof openAttemptSchema>;
export type AttemptQuestion = z.infer<typeof attemptQuestionSchema>;
export type AttemptCase = z.infer<typeof attemptCaseSchema>;
