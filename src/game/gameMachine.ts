import { and, assign, setup } from "xstate";
import type { TeacherFeedback } from "../server/ai/AIProvider";
import {
  isChoiceQuestion,
  isOpenQuestion,
  optionFeedback,
  optionLabel,
} from "../dlc/quizHelpers";
import type { CompiledDlc, StoryNode } from "../dlc/schema";

export type PendingPhase = "story" | "poem" | "easterEgg" | "lessonTransition" | "summary";

export type AnswerRecord = {
  questionId: string;
  answer: string;
  assessment?: TeacherFeedback["assessment"];
  questionType: "open" | "choice";
  optionId?: string;
};

export type GameContext = {
  dlc: CompiledDlc;
  sessionId: string;
  currentNodeId: string;
  pendingNodeId: string | null;
  pendingPhase: PendingPhase | null;
  lastChoiceId: string | null;
  lastChoiceNodeId: string | null;
  lineIndex: number;
  questionIndex: number;
  studentAnswer: string;
  teacherFeedback: TeacherFeedback | null;
  teacherError: string | null;
  finalRemark: string | null;
  summaryError: string | null;
  answers: AnswerRecord[];
};

export type GameEvent =
  | { type: "BEGIN_STORY" }
  | { type: "CONTINUE" }
  | { type: "ENTER_EASTER_EGG" }
  | { type: "EASTER_EGG_DONE" }
  | { type: "CHOOSE"; choiceId: string }
  | { type: "REPLAY_CHOICE" }
  | { type: "TRANSITION_DONE" }
  | { type: "ENTER_LESSON" }
  | { type: "NEXT_LINE" }
  | { type: "SUBMIT_ANSWER"; text: string }
  | { type: "SUBMIT_CHOICE"; optionId: string }
  | { type: "TEACHER_SUCCESS"; feedback: TeacherFeedback }
  | { type: "TEACHER_ERROR"; message: string }
  | { type: "RETRY" }
  | { type: "NEXT_QUESTION" }
  | { type: "SUMMARY_SUCCESS"; remark: string }
  | { type: "SUMMARY_ERROR"; message: string }
  | { type: "FINISH" };

export function getCurrentNode(context: GameContext): StoryNode {
  const node = context.dlc.story.nodes[context.currentNodeId];
  if (!node) {
    throw new Error(`找不到剧情节点：${context.currentNodeId}`);
  }
  return node;
}

export function currentQuestion(context: GameContext) {
  return context.dlc.quiz.questions[context.questionIndex];
}

function choiceFeedback(
  context: GameContext,
  optionId: string,
): { answer: string; feedback: TeacherFeedback } {
  const question = currentQuestion(context);
  if (!isChoiceQuestion(question)) {
    throw new Error("当前题目不是选择题");
  }
  const selected = optionLabel(question, optionId);
  const spoken = optionFeedback(question, optionId);
  const correct = optionLabel(question, question.correctOptionId);
  const assessment: TeacherFeedback["assessment"] =
    optionId === question.correctOptionId ? "correct" : "incorrect";
  const classmateAnalysis = question.hint
    ? question.hint.isCorrect
      ? `何解的 HINT 方向是对的。`
      : `何解的 HINT 说岔了。`
    : "这道题何解没有提前发言。";
  return {
    answer: selected,
    feedback: {
      assessment,
      classmateAnalysis,
      studentFeedback: spoken,
      explanation: spoken,
      evidence: `正确答案是「${correct}」。`,
      encouragement: assessment === "correct" ? "很好，继续下一题。" : "记住这个知识点，继续往下。",
    },
  };
}

export const gameMachine = setup({
  types: {
    context: {} as GameContext,
    events: {} as GameEvent,
    input: {} as { dlc: CompiledDlc; sessionId: string },
  },
  guards: {
    canContinue: ({ context }) => {
      const type = getCurrentNode(context).type;
      return type === "narration" || type === "fact";
    },
    isStoryEnd: ({ context }) => {
      const node = getCurrentNode(context);
      return (node.type === "narration" || node.type === "fact") && !node.nextNodeId;
    },
    hasEasterEgg: ({ context }) => Boolean(context.dlc.manifest.easterEgg),
    isChoice: ({ context }) => getCurrentNode(context).type === "choice",
    isGameOver: ({ context }) => getCurrentNode(context).type === "gameOver",
    isOpenQuestion: ({ context }) => isOpenQuestion(currentQuestion(context)),
    isChoiceQuestion: ({ context }) => isChoiceQuestion(currentQuestion(context)),
    hasMoreLines: ({ context }) =>
      context.lineIndex < context.dlc.poem.lines.length - 1,
    hasMoreQuestions: ({ context }) =>
      context.questionIndex < context.dlc.quiz.questions.length - 1,
    canAdvanceQuestion: ({ context }) => {
      const question = currentQuestion(context);
      if (isChoiceQuestion(question)) {
        return context.teacherFeedback?.assessment === "correct";
      }
      return true;
    },
    choiceAnswerIncorrect: ({ context }) =>
      isChoiceQuestion(currentQuestion(context)) &&
      context.teacherFeedback?.assessment === "incorrect",
    pendingIsStory: ({ context }) => context.pendingPhase === "story",
    pendingIsPoem: ({ context }) => context.pendingPhase === "poem",
    pendingIsEasterEgg: ({ context }) => context.pendingPhase === "easterEgg",
    pendingIsLessonTransition: ({ context }) =>
      context.pendingPhase === "lessonTransition",
  },
  actions: {
    queueNextStoryNode: assign(({ context }) => {
      const node = getCurrentNode(context);
      const nextId =
        node.type === "narration" || node.type === "fact" ? node.nextNodeId : undefined;
      return {
        pendingNodeId: nextId ?? null,
        pendingPhase: (nextId ? "story" : "poem") as PendingPhase,
      };
    }),
    queueEasterEgg: assign({
      pendingNodeId: null,
      pendingPhase: "easterEgg" as PendingPhase,
    }),
    queueEasterEggToPoem: assign({
      pendingNodeId: null,
      pendingPhase: "poem" as PendingPhase,
    }),
    queueChoice: assign(({ context, event }) => {
      if (event.type !== "CHOOSE") {
        return {};
      }
      const node = getCurrentNode(context);
      if (node.type !== "choice") {
        return {};
      }
      const choice = node.choices.find((item) => item.id === event.choiceId);
      if (!choice) {
        throw new Error(`找不到选项：${event.choiceId}`);
      }
      return {
        lastChoiceId: choice.id,
        lastChoiceNodeId: node.id,
        pendingNodeId: choice.nextNodeId,
        pendingPhase: "story" as PendingPhase,
      };
    }),
    queueReplayChoice: assign(({ context }) => {
      if (!context.lastChoiceNodeId) {
        throw new Error("没有可返回的选择节点");
      }
      return {
        pendingNodeId: context.lastChoiceNodeId,
        pendingPhase: "story" as PendingPhase,
      };
    }),
    applyPendingNode: assign(({ context }) => ({
      currentNodeId: context.pendingNodeId ?? context.currentNodeId,
      pendingNodeId: null,
      pendingPhase: null,
    })),
    clearPending: assign({
      pendingNodeId: null,
      pendingPhase: null,
    }),
    revealNextLine: assign(({ context }) => ({
      lineIndex: context.lineIndex + 1,
    })),
    queuePoemToLessonTransition: assign({
      pendingNodeId: null,
      pendingPhase: "lessonTransition" as PendingPhase,
    }),
    saveDraftAnswer: assign(({ event }) => ({
      studentAnswer: event.type === "SUBMIT_ANSWER" ? event.text.trim() : "",
      teacherFeedback: null,
      teacherError: null,
    })),
    saveChoiceAnswer: assign(({ context, event }) => {
      if (event.type !== "SUBMIT_CHOICE") {
        return {};
      }
      const question = currentQuestion(context);
      const graded = choiceFeedback(context, event.optionId);
      return {
        studentAnswer: graded.answer,
        teacherFeedback: graded.feedback,
        teacherError: null,
        answers: [
          ...context.answers,
          {
            questionId: question.id,
            answer: graded.answer,
            assessment: graded.feedback.assessment,
            questionType: "choice" as const,
            optionId: event.optionId,
          },
        ],
      };
    }),
    saveTeacherSuccess: assign(({ context, event }) => {
      if (event.type !== "TEACHER_SUCCESS") {
        return {};
      }
      const question = currentQuestion(context);
      return {
        teacherFeedback: event.feedback,
        teacherError: null,
        answers: [
          ...context.answers,
          {
            questionId: question.id,
            answer: context.studentAnswer,
            assessment: event.feedback.assessment,
            questionType: "open" as const,
          },
        ],
      };
    }),
    saveTeacherError: assign(({ event }) => ({
      teacherError: event.type === "TEACHER_ERROR" ? event.message : "讲解失败",
    })),
    clearQuizAttempt: assign({
      studentAnswer: "",
      teacherFeedback: null,
      teacherError: null,
    }),
    advanceQuestion: assign(({ context }) => ({
      questionIndex: context.questionIndex + 1,
      studentAnswer: "",
      teacherFeedback: null,
      teacherError: null,
    })),
    queueQuizToSummary: assign({
      pendingNodeId: null,
      pendingPhase: "summary" as PendingPhase,
    }),
    saveSummarySuccess: assign(({ event }) => ({
      finalRemark: event.type === "SUMMARY_SUCCESS" ? event.remark : null,
      summaryError: null,
    })),
    saveSummaryError: assign(({ event }) => ({
      summaryError: event.type === "SUMMARY_ERROR" ? event.message : "总评失败",
    })),
  },
}).createMachine({
  id: "poemGame",
  initial: "intro",
  context: ({ input }) => ({
    dlc: input.dlc,
    sessionId: input.sessionId,
    currentNodeId: input.dlc.story.startNodeId,
    pendingNodeId: null,
    pendingPhase: null,
    lastChoiceId: null,
    lastChoiceNodeId: null,
    lineIndex: 0,
    questionIndex: 0,
    studentAnswer: "",
    teacherFeedback: null,
    teacherError: null,
    finalRemark: null,
    summaryError: null,
    answers: [],
  }),
  states: {
    intro: {
      on: {
        BEGIN_STORY: "story",
      },
    },
    story: {
      on: {
        CONTINUE: {
          guard: "canContinue",
          target: "pageTransition",
          actions: "queueNextStoryNode",
        },
        ENTER_EASTER_EGG: {
          guard: and(["isStoryEnd", "hasEasterEgg"]),
          target: "pageTransition",
          actions: "queueEasterEgg",
        },
        CHOOSE: {
          guard: "isChoice",
          target: "pageTransition",
          actions: "queueChoice",
        },
        REPLAY_CHOICE: {
          guard: "isGameOver",
          target: "pageTransition",
          actions: "queueReplayChoice",
        },
      },
    },
    pageTransition: {
      on: {
        TRANSITION_DONE: [
          { guard: "pendingIsStory", target: "story", actions: "applyPendingNode" },
          {
            guard: "pendingIsEasterEgg",
            target: "easterEgg",
            actions: "clearPending",
          },
          { guard: "pendingIsPoem", target: "poem", actions: "clearPending" },
          {
            guard: "pendingIsLessonTransition",
            target: "lessonTransition",
            actions: "clearPending",
          },
          { target: "summary", actions: "clearPending" },
        ],
      },
    },
    easterEgg: {
      on: {
        EASTER_EGG_DONE: {
          target: "pageTransition",
          actions: "queueEasterEggToPoem",
        },
      },
    },
    lessonTransition: {
      on: {
        ENTER_LESSON: "quiz",
      },
    },
    poem: {
      on: {
        NEXT_LINE: [
          { guard: "hasMoreLines", actions: "revealNextLine" },
          { target: "pageTransition", actions: "queuePoemToLessonTransition" },
        ],
      },
    },
    quiz: {
      initial: "idle",
      states: {
        idle: {
          on: {
            SUBMIT_ANSWER: {
              guard: "isOpenQuestion",
              target: "submitting",
              actions: "saveDraftAnswer",
            },
            SUBMIT_CHOICE: {
              guard: "isChoiceQuestion",
              target: "success",
              actions: "saveChoiceAnswer",
            },
          },
        },
        submitting: {
          on: {
            TEACHER_SUCCESS: { target: "success", actions: "saveTeacherSuccess" },
            TEACHER_ERROR: { target: "error", actions: "saveTeacherError" },
          },
        },
        success: {
          on: {
            RETRY: {
              guard: "choiceAnswerIncorrect",
              target: "idle",
              actions: "clearQuizAttempt",
            },
            NEXT_QUESTION: [
              {
                guard: and(["canAdvanceQuestion", "hasMoreQuestions"]),
                target: "idle",
                actions: "advanceQuestion",
              },
              {
                guard: "canAdvanceQuestion",
                target: "#poemGame.pageTransition",
                actions: "queueQuizToSummary",
              },
            ],
          },
        },
        error: {
          on: {
            RETRY: "idle",
          },
        },
      },
    },
    summary: {
      initial: "generating",
      states: {
        generating: {
          on: {
            SUMMARY_SUCCESS: { target: "ready", actions: "saveSummarySuccess" },
            SUMMARY_ERROR: { target: "error", actions: "saveSummaryError" },
          },
        },
        ready: {
          on: {
            FINISH: { target: "#poemGame.outro" },
          },
        },
        error: {
          on: {
            RETRY: "generating",
            FINISH: { target: "#poemGame.outro" },
          },
        },
      },
    },
    outro: {},
  },
});
