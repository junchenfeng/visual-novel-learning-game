export type QuizDialogueBeat = "teacher" | "classmate" | "student";
export type QuizUiStatus = "idle" | "submitting" | "success" | "error";

/** 有 HINT 的题，作答页是听完何解之后；没 HINT 的题，老师提问页就是作答页。 */
export function answeringQuizBeat(hasHint: boolean): QuizDialogueBeat {
  return hasHint ? "student" : "teacher";
}

/**
 * 题目换了：回到老师提问。
 * 选择题答错后点「再答一次」（success → idle、同一题）：回到作答页，不重播何解 HINT。
 */
export function nextQuizDialogueBeat(input: {
  beat: QuizDialogueBeat;
  prevQuestionId: string | null;
  questionId: string;
  prevStatus: QuizUiStatus;
  status: QuizUiStatus;
  hasHint: boolean;
}): QuizDialogueBeat {
  if (input.prevQuestionId !== input.questionId) {
    return "teacher";
  }
  if (input.prevStatus === "success" && input.status === "idle") {
    return answeringQuizBeat(input.hasHint);
  }
  return input.beat;
}
