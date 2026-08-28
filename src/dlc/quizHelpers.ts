import type { ChoiceQuestion, OpenQuestion, QuizQuestion } from "./schema";

export function isOpenQuestion(question: QuizQuestion): question is OpenQuestion {
  return question.type === "open";
}

export function isChoiceQuestion(question: QuizQuestion): question is ChoiceQuestion {
  return question.type === "choice";
}

export function hasQuizHint(question: QuizQuestion): boolean {
  if (isOpenQuestion(question)) {
    return true;
  }
  return Boolean(question.hint);
}

export function classmateLine(question: QuizQuestion): string {
  if (question.type === "open") {
    return question.classmateAnswer;
  }
  return question.hint?.text ?? "";
}

export function optionLabel(question: ChoiceQuestion, optionId: string): string {
  return question.options.find((item) => item.id === optionId)?.label ?? optionId;
}

export function optionFeedback(question: ChoiceQuestion, optionId: string): string {
  return question.options.find((item) => item.id === optionId)?.feedback ?? "";
}
