import { createActor } from "xstate";
import { parseDlcDirectory } from "../src/dlc/parser";
import { gameMachine, getCurrentNode } from "../src/game/gameMachine";
import type { ChoiceQuestion } from "../src/dlc/schema";

function drainTransition(actor: ReturnType<typeof createActor<typeof gameMachine>>) {
  expect(actor.getSnapshot().value).toBe("pageTransition");
  actor.send({ type: "TRANSITION_DONE" });
}

const teacherFeedback = {
  assessment: "correct" as const,
  classmateAnalysis: "同学说得有对有错。",
  studentFeedback: "你抓住了人物和地点。",
  explanation: "标准讲解",
  evidence: "评分要点",
  encouragement: "继续",
};

function playStoryToPoem(actor: ReturnType<typeof createActor<typeof gameMachine>>) {
  if (actor.getSnapshot().matches("intro")) {
    actor.send({ type: "BEGIN_STORY" });
  }
  let guard = 0;
  while (actor.getSnapshot().matches("story") && guard < 40) {
    guard += 1;
    const node = getCurrentNode(actor.getSnapshot().context);
    if (node.type === "choice") {
      const safe = node.choices.find((item) => {
        const next = actor.getSnapshot().context.dlc.story.nodes[item.nextNodeId];
        return next?.type !== "gameOver";
      });
      actor.send({ type: "CHOOSE", choiceId: (safe ?? node.choices[0]).id });
    } else if (node.type === "gameOver") {
      throw new Error("happy path 不应走到 gameOver");
    } else {
      actor.send({ type: "CONTINUE" });
    }
    drainTransition(actor);
  }
}

describe("game machine", () => {
  it("walks story branches back to the same mainline, then poem, mixed quiz and summary", () => {
    const dlc = parseDlcDirectory("dlc/sushi/shuidiao-getou/hailao-shuidiao");
    const actor = createActor(gameMachine, {
      input: { dlc, sessionId: "test-session" },
    });
    actor.start();
    expect(actor.getSnapshot().value).toBe("intro");

    playStoryToPoem(actor);
    expect(actor.getSnapshot().value).toBe("poem");

    for (let index = 0; index < dlc.poem.lines.length; index += 1) {
      actor.send({ type: "NEXT_LINE" });
    }
    drainTransition(actor);
    expect(actor.getSnapshot().value).toBe("lessonTransition");
    actor.send({ type: "ENTER_LESSON" });
    expect(actor.getSnapshot().matches("quiz")).toBe(true);

    for (const question of dlc.quiz.questions) {
      if (question.type === "choice") {
        actor.send({ type: "SUBMIT_CHOICE", optionId: question.correctOptionId });
      } else {
        actor.send({ type: "SUBMIT_ANSWER", text: "密州思念弟弟苏辙，月亮难以两全。" });
        actor.send({ type: "TEACHER_SUCCESS", feedback: teacherFeedback });
      }
      actor.send({ type: "NEXT_QUESTION" });
    }
    drainTransition(actor);
    expect(actor.getSnapshot().matches({ summary: "generating" })).toBe(true);
    actor.send({ type: "SUMMARY_SUCCESS", remark: "本课总评：你读得很认真。" });
    expect(actor.getSnapshot().matches({ summary: "ready" })).toBe(true);
    expect(actor.getSnapshot().context.answers).toHaveLength(dlc.quiz.questions.length);
    expect(actor.getSnapshot().context.finalRemark).toContain("认真");
  });

  it("returns to the last choice node after game over", () => {
    const dlc = parseDlcDirectory("dlc/sushi/shuidiao-getou/hailao-shuidiao");
    const actor = createActor(gameMachine, {
      input: { dlc, sessionId: "game-over-session" },
    });
    actor.start();
    expect(actor.getSnapshot().value).toBe("intro");
    actor.send({ type: "BEGIN_STORY" });
    expect(actor.getSnapshot().value).toBe("story");

    let guard = 0;
    while (guard < 40) {
      guard += 1;
      const node = getCurrentNode(actor.getSnapshot().context);
      if (node.type === "choice") {
        const over = node.choices.find((item) => {
          const next = dlc.story.nodes[item.nextNodeId];
          return next?.type === "gameOver";
        });
        if (over) {
          const choiceNodeId = node.id;
          actor.send({ type: "CHOOSE", choiceId: over.id });
          drainTransition(actor);
          expect(getCurrentNode(actor.getSnapshot().context).type).toBe("gameOver");
          actor.send({ type: "REPLAY_CHOICE" });
          drainTransition(actor);
          expect(getCurrentNode(actor.getSnapshot().context).id).toBe(choiceNodeId);
          return;
        }
        actor.send({ type: "CHOOSE", choiceId: node.choices[0].id });
      } else {
        actor.send({ type: "CONTINUE" });
      }
      drainTransition(actor);
    }
    throw new Error("没有找到 gameOver 分支");
  });

  it("grades a choice question locally without waiting for the teacher", () => {
    const dlc = parseDlcDirectory("dlc/sushi/shuidiao-getou/hailao-shuidiao");
    const actor = createActor(gameMachine, {
      input: { dlc, sessionId: "choice-session" },
    });
    actor.start();
    playStoryToPoem(actor);
    for (let index = 0; index < dlc.poem.lines.length; index += 1) {
      actor.send({ type: "NEXT_LINE" });
    }
    drainTransition(actor);
    expect(actor.getSnapshot().value).toBe("lessonTransition");
    actor.send({ type: "ENTER_LESSON" });

    const question = dlc.quiz.questions[0] as ChoiceQuestion;
    expect(question.type).toBe("choice");
    actor.send({ type: "SUBMIT_CHOICE", optionId: question.classmateOptionId });
    expect(actor.getSnapshot().matches({ quiz: "success" })).toBe(true);
    expect(actor.getSnapshot().context.teacherFeedback?.assessment).toBe("incorrect");
    expect(actor.getSnapshot().context.answers[0]?.questionType).toBe("choice");
  });
});
