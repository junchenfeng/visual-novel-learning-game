"use client";

import { useMachine } from "@xstate/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createBehaviorEvent } from "../analytics/eventSchema";
import { playSfx } from "../audio/playSfx";
import { useOptionalHowl, usePageTurnSound } from "../audio/useHowler";
import type { CompiledDlc } from "../dlc/schema";
import { isChoiceQuestion } from "../dlc/quizHelpers";
import { gameMachine, getCurrentNode } from "../game/gameMachine";
import { LocalStorageAdapter } from "../storage/LocalStorageAdapter";
import { createId } from "../ui/uuid";
import { BookFrame, type ChapterTab } from "./BookFrame";
import { CourtroomFrame, type ClassroomPortraits } from "./CourtroomFrame";
import { GameOverModal } from "./GameOverModal";
import { GameViewport } from "./GameViewport";
import { NarrativeGate } from "./NarrativeGate";
import { PoemScrollFrame } from "./PoemScrollFrame";
import { StoryPhase } from "./phases/StoryPhase";
import { SummaryPhase } from "./phases/SummaryPhase";

const storage = new LocalStorageAdapter();

function resolvePortrait(dlc: CompiledDlc, portraitId?: string) {
  if (!portraitId) {
    return { src: undefined, name: undefined };
  }
  const character = dlc.manifest.characters.find((item) => item.id === portraitId);
  return {
    src: character?.portraitUrl,
    name: character?.name,
  };
}

function namedPortrait(dlc: CompiledDlc, portraitId: string, fallback: string) {
  const resolved = resolvePortrait(dlc, portraitId);
  return { src: resolved.src, name: resolved.name ?? fallback };
}

function currentPhaseName(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (value && typeof value === "object") {
    if ("quiz" in (value as object)) {
      return "quiz";
    }
    if ("summary" in (value as object)) {
      return "summary";
    }
  }
  return "unknown";
}

type GamePlayerProps = {
  dlc: CompiledDlc;
};

export function GamePlayer({ dlc }: GamePlayerProps) {
  const sessionId = useMemo(() => createId(), []);
  const [snapshot, send] = useMachine(gameMachine, {
    input: { dlc, sessionId },
  });
  const [draftAnswer, setDraftAnswer] = useState("");
  const lastPhase = useRef<string>("");
  const started = useRef(false);
  const lastPoemIndex = useRef<number>(-1);
  const lastGameOver = useRef("");
  const summaryStarted = useRef(false);

  const context = snapshot.context;
  const node = getCurrentNode(context);
  const isTurning = snapshot.matches("pageTransition");
  const music = dlc.manifest.assets?.music
    ? `${dlc.publicBasePath}/${dlc.manifest.assets.music}`
    : undefined;
  useOptionalHowl(music, { loop: true });
  usePageTurnSound(isTurning);

  const chapters: ChapterTab[] = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of Object.values(dlc.story.nodes)) {
      if (!map.has(item.chapter)) {
        map.set(item.chapter, item.chapterTitle);
      }
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([number, title]) => ({
        number,
        title,
        backgroundUrl: dlc.story.chapters.find((item) => item.chapter === number)
          ?.backgroundUrl,
      }));
  }, [dlc]);

  const classroom: ClassroomPortraits = {
    teacher: namedPortrait(dlc, dlc.manifest.classroom.teacher, "老师"),
    classmate: namedPortrait(dlc, dlc.manifest.classroom.classmate, "何解"),
    student: namedPortrait(dlc, dlc.manifest.classroom.student, "你"),
  };

  const chapterHasBackground = Boolean(
    chapters.find((chapter) => chapter.number === node.chapter)?.backgroundUrl,
  );

  const appendEvent = (
    type: Parameters<typeof createBehaviorEvent>[0]["type"],
    payload: Record<string, unknown> = {},
  ) => {
    storage.append(
      createBehaviorEvent({
        sessionId,
        dlcId: dlc.manifest.id,
        dlcVersion: dlc.manifest.version,
        type,
        payload,
      }),
    );
  };

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    appendEvent("session.started", { workTitle: dlc.manifest.workTitle });
    appendEvent("phase.entered", { phase: "intro" });
    lastPhase.current = "intro";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const phase = currentPhaseName(snapshot.value);
    if (phase === "pageTransition" || phase === lastPhase.current) {
      return;
    }
    lastPhase.current = phase;
    if (
      phase === "intro" ||
      phase === "story" ||
      phase === "lessonTransition" ||
      phase === "poem" ||
      phase === "quiz" ||
      phase === "summary"
    ) {
      appendEvent("phase.entered", { phase });
    }
    if (phase === "summary") {
      appendEvent("game.completed", { answers: context.answers });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.value]);

  useEffect(() => {
    if (!snapshot.matches("story") || node.type !== "gameOver") {
      return;
    }
    if (lastGameOver.current === node.id) {
      return;
    }
    lastGameOver.current = node.id;
    appendEvent("story.game_over", { nodeId: node.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.value, node.id, node.type]);

  useEffect(() => {
    if (!snapshot.matches("poem")) {
      return;
    }
    if (lastPoemIndex.current === context.lineIndex) {
      return;
    }
    lastPoemIndex.current = context.lineIndex;
    const line = dlc.poem.lines[context.lineIndex];
    appendEvent("poem.line_revealed", {
      lineId: line.id,
      index: context.lineIndex,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.lineIndex, snapshot.value]);

  useEffect(() => {
    if (!isTurning) {
      return;
    }
    const timer = window.setTimeout(() => send({ type: "TRANSITION_DONE" }), 0);
    return () => window.clearTimeout(timer);
  }, [isTurning, send]);

  useEffect(() => {
    if (!snapshot.matches({ summary: "generating" })) {
      if (snapshot.matches({ summary: "ready" }) || snapshot.matches({ summary: "error" })) {
        summaryStarted.current = false;
      }
      return;
    }
    if (summaryStarted.current) {
      return;
    }
    summaryStarted.current = true;
    void (async () => {
      try {
        const response = await fetch("/api/summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dlcId: dlc.manifest.id,
            answers: context.answers.map((item) => ({
              questionId: item.questionId,
              answer: item.answer,
              assessment: item.assessment,
              questionType: item.questionType,
            })),
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "老师暂时无法写总评");
        }
        appendEvent("summary.received", { remark: data.remark });
        send({ type: "SUMMARY_SUCCESS", remark: data.remark });
      } catch (error) {
        send({
          type: "SUMMARY_ERROR",
          message: error instanceof Error ? error.message : "老师暂时无法写总评",
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.value]);

  const portrait = resolvePortrait(dlc, "portrait" in node ? node.portrait : undefined);
  const overlay = null;

  const quizStatus = snapshot.matches({ quiz: "submitting" })
    ? "submitting"
    : snapshot.matches({ quiz: "success" })
      ? "success"
      : snapshot.matches({ quiz: "error" })
        ? "error"
        : "idle";

  const summaryStatus = snapshot.matches({ summary: "generating" })
    ? "generating"
    : snapshot.matches({ summary: "error" })
      ? "error"
      : "ready";

  const submitAnswer = async () => {
    const question = dlc.quiz.questions[context.questionIndex];
    const text = draftAnswer.trim();
    if (!text || question.type !== "open") {
      return;
    }
    appendEvent("quiz.answer_submitted", {
      questionId: question.id,
      answer: text,
      questionType: "open",
    });
    send({ type: "SUBMIT_ANSWER", text });
    try {
      const response = await fetch("/api/teacher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dlcId: dlc.manifest.id,
          questionId: question.id,
          studentAnswer: text,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "老师暂时无法回答");
      }
      appendEvent("teacher.feedback_received", {
        questionId: question.id,
        assessment: data.assessment,
      });
      playSfx(data.assessment === "incorrect" ? "incorrect" : "correct");
      send({ type: "TEACHER_SUCCESS", feedback: data });
    } catch (error) {
      send({
        type: "TEACHER_ERROR",
        message: error instanceof Error ? error.message : "老师暂时无法回答",
      });
    }
  };

  const submitChoice = (optionId: string) => {
    const question = dlc.quiz.questions[context.questionIndex];
    if (!isChoiceQuestion(question)) {
      return;
    }
    appendEvent("quiz.answer_submitted", {
      questionId: question.id,
      optionId,
      questionType: "choice",
    });
    playSfx(optionId === question.correctOptionId ? "correct" : "incorrect");
    send({ type: "SUBMIT_CHOICE", optionId });
  };

  const showPoem =
    snapshot.matches("poem") ||
    (isTurning && context.pendingPhase === "lessonTransition");
  const showQuiz =
    snapshot.matches("quiz") || (isTurning && context.pendingPhase === "summary");
  const showSummary = snapshot.matches("summary");

  let screen;

  if (snapshot.matches("intro")) {
    screen = (
      <NarrativeGate
        kind="intro"
        title={dlc.manifest.title}
        onContinue={() => send({ type: "BEGIN_STORY" })}
      />
    );
  } else if (snapshot.matches("lessonTransition")) {
    screen = (
      <NarrativeGate
        kind="transition"
        title={dlc.manifest.title}
        onContinue={() => send({ type: "ENTER_LESSON" })}
      />
    );
  } else if (showPoem) {
    screen = (
      <PoemScrollFrame
        poet={dlc.manifest.poet}
        workTitle={dlc.manifest.workTitle}
        poem={dlc.poem}
        lineIndex={context.lineIndex}
        overlay={overlay}
        onNext={() => send({ type: "NEXT_LINE" })}
      />
    );
  } else if (showSummary) {
    screen = (
      <SummaryPhase
        context={context}
        status={summaryStatus}
        teacher={classroom.teacher}
      />
    );
  } else if (showQuiz) {
    screen = (
      <CourtroomFrame
        key={dlc.quiz.questions[context.questionIndex].id}
        poet={dlc.manifest.poet}
        workTitle={dlc.manifest.workTitle}
        poem={dlc.poem}
        index={context.questionIndex}
        total={dlc.quiz.questions.length}
        question={dlc.quiz.questions[context.questionIndex]}
        portraits={classroom}
        answer={quizStatus === "idle" || quizStatus === "error" ? draftAnswer : context.studentAnswer}
        status={quizStatus}
        feedback={context.teacherFeedback}
        error={context.teacherError}
        overlay={overlay}
        onAnswerChange={setDraftAnswer}
        onSubmit={() => void submitAnswer()}
        onSubmitChoice={submitChoice}
        onRetry={() => send({ type: "RETRY" })}
        onNext={() => {
          const finishing = context.questionIndex >= dlc.quiz.questions.length - 1;
          if (finishing) {
            lastPhase.current = "summary";
            appendEvent("phase.entered", { phase: "summary" });
            appendEvent("game.completed", { answers: context.answers });
          }
          setDraftAnswer("");
          send({ type: "NEXT_QUESTION" });
        }}
      />
    );
  } else {
    screen = (
      <BookFrame
        poet={dlc.manifest.poet}
        workTitle={dlc.manifest.workTitle}
        chapters={chapters}
        activeChapter={node.chapter}
        portraitSrc={chapterHasBackground ? undefined : portrait.src}
        portraitName={portrait.name}
        overlay={overlay}
      >
        {snapshot.matches("story") && node.type !== "gameOver" ? (
          <StoryPhase
            key={node.id}
            node={node}
            disabled={isTurning}
            onContinue={() => send({ type: "CONTINUE" })}
            onReplay={() => {
              lastGameOver.current = "";
              appendEvent("story.replayed", {
                fromNodeId: node.id,
                toNodeId: context.lastChoiceNodeId,
              });
              send({ type: "REPLAY_CHOICE" });
            }}
            onChoose={(choiceId) => {
              if (node.type !== "choice") {
                return;
              }
              const choice = node.choices.find((item) => item.id === choiceId);
              appendEvent("story.choice_selected", {
                nodeId: node.id,
                choiceId,
                nextNodeId: choice?.nextNodeId,
                convergesTo: node.convergesTo,
              });
              send({ type: "CHOOSE", choiceId });
            }}
          />
        ) : null}
      </BookFrame>
    );
  }

  const isGameOverNode =
    snapshot.matches("story") && node.type === "gameOver";

  return (
    <GameViewport>
      {screen}
      {isGameOverNode ? (
        <GameOverModal
          node={node}
          onReplay={() => {
            lastGameOver.current = "";
            appendEvent("story.replayed", {
              fromNodeId: node.id,
              toNodeId: context.lastChoiceNodeId,
            });
            send({ type: "REPLAY_CHOICE" });
          }}
        />
      ) : null}
    </GameViewport>
  );
}
