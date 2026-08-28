import {
  answeringQuizBeat,
  nextQuizDialogueBeat,
} from "../src/game/quizBeat";

describe("quiz dialogue beat", () => {
  it("starts a new question on the teacher prompt", () => {
    expect(
      nextQuizDialogueBeat({
        beat: "student",
        prevQuestionId: "q_chanjuan",
        questionId: "q_theme",
        prevStatus: "success",
        status: "idle",
        hasHint: true,
      }),
    ).toBe("teacher");
  });

  it("returns a hinted question to the answer page after a wrong choice, skipping 何解", () => {
    expect(answeringQuizBeat(true)).toBe("student");
    expect(
      nextQuizDialogueBeat({
        beat: "student",
        prevQuestionId: "q_theme",
        questionId: "q_theme",
        prevStatus: "success",
        status: "idle",
        hasHint: true,
      }),
    ).toBe("student");
  });

  it("keeps a no-hint question on the teacher answer page after retry", () => {
    expect(answeringQuizBeat(false)).toBe("teacher");
    expect(
      nextQuizDialogueBeat({
        beat: "teacher",
        prevQuestionId: "q_separate",
        questionId: "q_separate",
        prevStatus: "success",
        status: "idle",
        hasHint: false,
      }),
    ).toBe("teacher");
  });

  it("does not reset the beat when the student submits", () => {
    expect(
      nextQuizDialogueBeat({
        beat: "student",
        prevQuestionId: "q_theme",
        questionId: "q_theme",
        prevStatus: "idle",
        status: "success",
        hasHint: true,
      }),
    ).toBe("student");
  });
});
