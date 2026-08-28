import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { parseDlcDirectory } from "../src/dlc/parser";
import { isChoiceQuestion, isOpenQuestion } from "../src/dlc/quizHelpers";
import { groupAnswerAttempts } from "../src/game/answerAttempts";
import { attemptCaseSchema } from "../src/teaching/attemptCase";

const casesDir = path.join("docs/teaching/prompt-lab/cases/hailao-shuidiao");

describe("attempt case YAML", () => {
  it("parses the three hailao-shuidiao cases against the live quiz", () => {
    const dlc = parseDlcDirectory("dlc/sushi/shuidiao-getou/hailao-shuidiao");
    const files = readdirSync(casesDir).filter((name) => name.endsWith(".yaml")).sort();
    expect(files).toEqual(["all-correct.yaml", "guess-abc.yaml", "one-miss.yaml"]);

    for (const file of files) {
      const parsed = attemptCaseSchema.parse(
        parseYaml(readFileSync(path.join(casesDir, file), "utf8")),
      );
      expect(parsed.questions).toHaveLength(dlc.quiz.questions.length);

      for (const [index, question] of dlc.quiz.questions.entries()) {
        const sample = parsed.questions[index];
        expect(sample.questionId).toBe(question.id);
        expect(sample.type).toBe(question.type);
        if (sample.type === "choice" && isChoiceQuestion(question)) {
          const optionIds = new Set(question.options.map((item) => item.id));
          expect(sample.optionIds.every((id) => optionIds.has(id))).toBe(true);
          expect(sample.optionIds.at(-1)).toBe(question.correctOptionId);
        }
        if (sample.type === "open") {
          expect(isOpenQuestion(question)).toBe(true);
          expect(sample.texts.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("groups machine answers into per-question attempts", () => {
    const grouped = groupAnswerAttempts([
      {
        questionId: "q_separate",
        answer: "错的",
        assessment: "incorrect",
        questionType: "choice",
        optionId: "wutai_huangzhou",
      },
      {
        questionId: "q_separate",
        answer: "对的",
        assessment: "correct",
        questionType: "choice",
        optionId: "reform_exile",
      },
      {
        questionId: "q_theme",
        answer: "乱写",
        assessment: "incorrect",
        questionType: "open",
      },
    ]);
    expect(grouped).toHaveLength(2);
    expect(grouped[0]?.attempts.map((item) => item.optionId)).toEqual([
      "wutai_huangzhou",
      "reform_exile",
    ]);
    expect(grouped[1]?.attempts.map((item) => item.answer)).toEqual(["乱写"]);
  });
});
