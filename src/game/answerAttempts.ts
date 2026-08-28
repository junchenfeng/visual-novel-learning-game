import type { AnswerRecord } from "./gameMachine";

export type AttemptPayload = {
  answer: string;
  assessment?: AnswerRecord["assessment"];
  optionId?: string;
};

export type QuestionAttemptPayload = {
  questionId: string;
  questionType: AnswerRecord["questionType"];
  attempts: AttemptPayload[];
};

export function groupAnswerAttempts(records: AnswerRecord[]): QuestionAttemptPayload[] {
  const order: string[] = [];
  const byId = new Map<string, AnswerRecord[]>();
  for (const record of records) {
    if (!byId.has(record.questionId)) {
      order.push(record.questionId);
      byId.set(record.questionId, []);
    }
    byId.get(record.questionId)?.push(record);
  }
  return order.map((questionId) => {
    const attempts = byId.get(questionId) ?? [];
    return {
      questionId,
      questionType: attempts[0]?.questionType ?? "choice",
      attempts: attempts.map((item) => ({
        answer: item.answer,
        assessment: item.assessment,
        optionId: item.optionId,
      })),
    };
  });
}
