"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import type { Poem, QuizQuestion } from "../dlc/schema";
import { classmateLine, isChoiceQuestion } from "../dlc/quizHelpers";
import type { TeacherFeedback } from "../server/ai/AIProvider";
import { playSfx } from "../audio/playSfx";
import { useTypewriter } from "../ui/useTypewriter";
import styles from "./courtroom.module.css";

type Speaker = "teacher" | "classmate" | "student";
type Beat = "teacher" | "classmate" | "student";

export type ClassroomPortraits = Record<Speaker, { src?: string; name: string }>;

type CourtroomFrameProps = {
  poet: string;
  workTitle: string;
  poem: Poem;
  index: number;
  total: number;
  question: QuizQuestion;
  portraits: ClassroomPortraits;
  answer: string;
  status: "idle" | "submitting" | "success" | "error";
  feedback: TeacherFeedback | null;
  error: string | null;
  overlay?: ReactNode;
  onAnswerChange: (value: string) => void;
  onSubmit: () => void;
  onSubmitChoice: (optionId: string) => void;
  onRetry: () => void;
  onNext: () => void;
};

const assessmentLabel = {
  correct: "理解准确",
  partial: "部分正确",
  incorrect: "还要再想想",
};

const speakerColor: Record<Speaker, string> = {
  teacher: styles.speakerTeacher,
  classmate: styles.speakerClassmate,
  student: styles.speakerStudent,
};

const spriteEnter = {
  teacher: { x: -48, opacity: 0 },
  classmate: { y: 36, opacity: 0 },
  student: { x: 48, opacity: 0 },
};

function TypeLine({
  text,
  testId,
  className,
}: {
  text: string;
  testId?: string;
  className?: string;
}) {
  const { displayed, done, skip } = useTypewriter(text);
  return (
    <p className={className ?? styles.bodyText} data-testid={testId} onClick={skip}>
      {displayed}
      {done ? null : <span className={styles.caret}>▍</span>}
    </p>
  );
}

export function CourtroomFrame({
  poet,
  workTitle,
  poem,
  index,
  total,
  question,
  portraits,
  answer,
  status,
  feedback,
  error,
  overlay,
  onAnswerChange,
  onSubmit,
  onSubmitChoice,
  onRetry,
  onNext,
}: CourtroomFrameProps) {
  const [beat, setBeat] = useState<Beat>("teacher");
  const speaker: Speaker =
    status === "success" || status === "submitting" || status === "error" ? "teacher" : beat;
  const backdrop = poem.lines.map((line) => line.original).join("　");
  const choiceQuestion = isChoiceQuestion(question) ? question : null;
  const { displayed: feedbackText, done: feedbackDone, skip: skipFeedback } = useTypewriter(
    feedback
      ? [feedback.classmateAnalysis, feedback.studentFeedback, feedback.explanation, feedback.encouragement].join(
          "\n",
        )
      : "",
  );

  return (
    <div className={styles.shell} data-testid="quiz-stage">
      <div className={styles.backdrop} aria-hidden="true">
        {backdrop}
      </div>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>
            师生问答 · {index + 1}/{total}
          </p>
          <h1>
            {poet} · {workTitle}
          </h1>
        </div>
        <Link className={styles.back} href="/">
          返回目录
        </Link>
      </header>
      <div className={styles.stage}>
        {overlay}
        <div className={styles.sprites}>
          {(["teacher", "classmate", "student"] as Speaker[]).map((role) => (
            <motion.div
              key={role}
              className={`${styles.sprite} ${speaker === role ? styles.spriteActive : ""} ${
                status === "submitting" && role === "teacher" ? styles.spriteThinking : ""
              }`}
              data-testid={`sprite-${role}${speaker === role ? "-active" : ""}`}
              initial={spriteEnter[role]}
              animate={
                speaker === role
                  ? { x: 0, y: 0, scale: 1.08, opacity: 1 }
                  : { x: 0, y: 18, scale: 0.9, opacity: 0.38 }
              }
              transition={{ duration: 0.28 }}
            >
              {portraits[role].src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={portraits[role].src} alt={portraits[role].name} />
              ) : (
                <p>{portraits[role].name}</p>
              )}
            </motion.div>
          ))}
        </div>
        <motion.section
          className={styles.dialogue}
          data-speaker={speaker}
          key={`${question.id}-${speaker}-${status}`}
        >
          <p className={`${styles.speaker} ${speakerColor[speaker]}`}>{portraits[speaker].name}</p>
          {status === "idle" && beat === "teacher" ? (
            <>
              <TypeLine text={question.prompt} testId="quiz-prompt" />
              <div className={styles.actions}>
                <button
                  className={styles.primary}
                  data-testid="hear-classmate"
                  onClick={() => {
                    playSfx("click");
                    setBeat("classmate");
                  }}
                >
                  听{portraits.classmate.name}说
                </button>
              </div>
            </>
          ) : null}
          {status === "idle" && beat === "classmate" ? (
            <>
              <TypeLine text={classmateLine(question)} testId="classmate-answer" />
              <div className={styles.actions}>
                <button
                  className={styles.primary}
                  data-testid="student-turn"
                  onClick={() => {
                    playSfx("click");
                    setBeat("student");
                  }}
                >
                  轮到我答
                </button>
              </div>
            </>
          ) : null}
          {(status === "idle" && beat === "student") || status === "error" ? (
            <>
              <p className={styles.bodyText}>把你的理解写下来，不必和同学一样。</p>
              {choiceQuestion ? (
                <div className={styles.choices}>
                  {choiceQuestion.options.map((option, optionIndex) => (
                    <button
                      key={option.id}
                      className={styles.choice}
                      data-testid={`quiz-choice-${optionIndex}`}
                      onClick={() => {
                        playSfx("click");
                        onSubmitChoice(option.id);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  <textarea
                    className={styles.input}
                    data-testid="answer-input"
                    maxLength={200}
                    value={answer}
                    onChange={(event) => onAnswerChange(event.target.value)}
                    onKeyDown={(event) => {
                      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                        event.preventDefault();
                        playSfx("click");
                        onSubmit();
                      }
                    }}
                  />
                  {error ? <p className={styles.muted}>{error}</p> : null}
                  <div className={styles.actions}>
                    <button
                      className={styles.primary}
                      data-testid="submit-answer"
                      onClick={() => {
                        playSfx("click");
                        onSubmit();
                      }}
                    >
                      {status === "error" ? "重新请教老师" : "提交给老师"}
                    </button>
                    {status === "error" ? (
                      <button className={styles.secondary} onClick={onRetry}>
                        返回修改
                      </button>
                    ) : null}
                  </div>
                </>
              )}
            </>
          ) : null}
          {status === "submitting" ? (
            <p className={styles.thinking} data-testid="teacher-thinking">
              老师正在思考<span>.</span>
              <span>.</span>
              <span>.</span>
            </p>
          ) : null}
          {status === "success" && feedback ? (
            <div className={styles.feedback} data-testid="teacher-feedback">
              <p>点评：{assessmentLabel[feedback.assessment]}</p>
              <p className={styles.bodyText} onClick={skipFeedback} style={{ whiteSpace: "pre-wrap" }}>
                {feedbackText}
                {feedbackDone ? null : <span className={styles.caret}>▍</span>}
              </p>
              {feedbackDone ? <p className={styles.muted}>{feedback.evidence}</p> : null}
              {feedbackDone ? (
                <div className={styles.actions}>
                  <button
                    className={styles.primary}
                    data-testid="next-question"
                    onClick={() => {
                      playSfx("click");
                      onNext();
                    }}
                  >
                    {index + 1 === total ? "查看总结" : "下一题"}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </motion.section>
      </div>
    </div>
  );
}
