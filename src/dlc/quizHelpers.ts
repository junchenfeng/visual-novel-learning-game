import type { ChoiceQuestion, OpenQuestion, QuizQuestion } from "./schema";

export function isOpenQuestion(question: QuizQuestion): question is OpenQuestion {
  return question.type === "open";
}

export function isChoiceQuestion(question: QuizQuestion): question is ChoiceQuestion {
  return question.type === "choice";
}

export function classmateLine(question: QuizQuestion): string {
  if (question.type === "open") {
    return question.classmateAnswer;
  }
  return question.options.find((item) => item.id === question.classmateOptionId)?.label ?? "";
}

export function optionLabel(question: ChoiceQuestion, optionId: string): string {
  return question.options.find((item) => item.id === optionId)?.label ?? optionId;
}
