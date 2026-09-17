"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import type { Poem, QuizQuestion } from "../dlc/schema";
import { classmateLine, hasQuizHint, isChoiceQuestion } from "../dlc/quizHelpers";
import { nextQuizDialogueBeat, type QuizDialogueBeat } from "../game/quizBeat";
import type { TeacherFeedback } from "../server/ai/AIProvider";
import { playSfx } from "../audio/playSfx";
import { computeQuizProgress } from "../ui/lessonProgress";
import { useTypewriter, type TypewriterResult } from "../ui/useTypewriter";
import { LessonProgress } from "./LessonProgress";
import styles from "./classroom.module.css";

type Speaker = "teacher" | "classmate" | "student";
type Beat = QuizDialogueBeat;

export type ClassroomPortraits = Record<Speaker, { src?: string; name: string }>;

type ClassroomFrameProps = {
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
} as const;

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

/** 逐字显示的正文段落：打完前点击可跳过。 */
export function TypedParagraph({
  tw,
  className,
  testId,
}: {
  tw: TypewriterResult;
  className?: string;
  testId?: string;
}) {
  return (
    <p className={className ?? styles.bodyText} data-testid={testId} onClick={tw.done ? undefined : tw.skip}>
      {tw.displayed}
      {tw.done ? null : <span className={styles.caret}>▍</span>}
    </p>
  );
}

const FEEDBACK_SPEED_MS = 20;

/** 点评区块：四段并行逐字输出，速度略快；点击段落可立即看全。 */
function FeedbackSection({
  label,
  text,
  blockClass,
}: {
  label: string;
  text: string;
  blockClass?: string;
}) {
  const { displayed, done, skip } = useTypewriter(text, FEEDBACK_SPEED_MS);
  if (!text) return null;
  return (
    <div className={`${styles.feedbackBlock} ${blockClass ?? ""}`}>
      <p className={styles.feedbackLabel}>{label}</p>
      <p
        className={styles.feedbackContent}
        style={{ whiteSpace: "pre-wrap" }}
        onClick={done ? undefined : skip}
      >
        {displayed}
        {done ? null : <span className={styles.caret}>▍</span>}
      </p>
    </div>
  );
}

export function ClassroomFrame({
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
}: ClassroomFrameProps) {
  const choiceQuestion = isChoiceQuestion(question) ? question : null;
  const showHint = hasQuizHint(question);
  const [beat, setBeat] = useState<Beat>("teacher");
  const prevTurn = useRef({ questionId: question.id, status });
  useEffect(() => {
    const prev = prevTurn.current;
    setBeat((current) =>
      nextQuizDialogueBeat({
        beat: current,
        prevQuestionId: prev.questionId,
        questionId: question.id,
        prevStatus: prev.status,
        status,
        hasHint: showHint,
      }),
    );
    prevTurn.current = { questionId: question.id, status };
  }, [question.id, status, showHint]);
  const feedbackRole: Speaker =
    status === "success" && choiceQuestion
      ? choiceQuestion.feedbackSpeaker
      : "teacher";
  const speaker: Speaker =
    status === "success"
      ? feedbackRole
      : status === "submitting" || status === "error"
        ? "teacher"
        : beat;
  const backdrop = poem.lines.map((line) => line.original).join("　");
  const spokenLine = feedback?.explanation ?? "";
  // 非选项文案的打字机输出：仅在对应台词出现时给内容，其余时刻为空串（立即视为完成）。
  const promptTw = useTypewriter(status === "idle" && beat === "teacher" ? question.prompt : "");
  const classmateTw = useTypewriter(
    status === "idle" && beat === "classmate" ? classmateLine(question) : "",
  );
  const spokenTw = useTypewriter(status === "success" && choiceQuestion ? spokenLine : "");

  return (
    <div className={styles.shell} data-testid="quiz-stage">
      <div className={styles.backdrop} aria-hidden="true">
        {backdrop}
      </div>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>师生问答</p>
          <h1>
            {poet} · {workTitle}
          </h1>
        </div>
        <Link className={styles.back} href="/">
          返回目录
        </Link>
      </header>
      <div className={styles.progressWrap}>
        <LessonProgress progress={computeQuizProgress(index, total)} tone="night" />
      </div>
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
                  ? { x: 0, y: 0, scale: 1.05, opacity: 1 }
                  : { x: 0, y: 20, scale: 0.9, opacity: 0.35 }
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
          data-testid={`quiz-beat-${status === "idle" ? beat : status}`}
          key={`${question.id}-${speaker}-${status}`}
        >
          <p className={`${styles.speaker} ${speakerColor[speaker]}`}>{portraits[speaker].name}</p>
          {status === "idle" && (beat === "classmate" || beat === "student") ? (
            <button
              className={styles.navBack}
              data-testid="quiz-back"
              onClick={() => {
                playSfx("click");
                setBeat((current) =>
                  current === "student" ? (showHint ? "classmate" : "teacher") : "teacher",
                );
              }}
            >
              ← 回看上一段
            </button>
          ) : null}
          <div className={styles.dialogueBody}>
            {status === "idle" && beat === "teacher" ? (
              <TypedParagraph tw={promptTw} className={styles.promptText} testId="quiz-prompt" />
            ) : null}

            {status === "idle" && beat === "classmate" ? (
              <TypedParagraph tw={classmateTw} testId="classmate-answer" />
            ) : null}

            {(status === "idle" && beat === "student") || status === "error" ? (
              <>
                <p className={styles.bodyText}>
                  {choiceQuestion
                    ? showHint
                      ? "不必跟着同学说，选出你的理解。"
                      : "选出你的理解。"
                    : "把你的理解写下来，不必和同学一样。"}
                </p>
                {choiceQuestion ? null : (
                  <>
                    <textarea
                      className={styles.input}
                      data-testid="answer-input"
                      maxLength={200}
                      placeholder="在这里写下你的想法…"
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

            {status === "success" && feedback && choiceQuestion ? (
              <div className={styles.feedback} data-testid="choice-feedback">
                <p
                  className={`${styles.assessmentBadge} ${
                    feedback.assessment === "correct"
                      ? styles.assessmentCorrect
                      : feedback.assessment === "incorrect"
                        ? styles.assessmentIncorrect
                        : styles.assessmentPartial
                  }`}
                >
                  {feedbackRole === "classmate" ? portraits.classmate.name : "点评"}
                  {" · "}
                  {assessmentLabel[feedback.assessment]}
                </p>
                <TypedParagraph tw={spokenTw} testId="choice-feedback-text" />
              </div>
            ) : null}

            {status === "success" && feedback && !choiceQuestion ? (
              <div className={styles.feedback} data-testid="teacher-feedback">
                <p
                  className={`${styles.assessmentBadge} ${
                    feedback.assessment === "correct"
                      ? styles.assessmentCorrect
                      : feedback.assessment === "incorrect"
                        ? styles.assessmentIncorrect
                        : styles.assessmentPartial
                  }`}
                >
                  点评 · {assessmentLabel[feedback.assessment]}
                </p>

                <FeedbackSection
                  label={`${portraits.classmate.name}的回答`}
                  text={feedback.classmateAnalysis}
                  blockClass={styles.feedbackClassmate}
                />

                <FeedbackSection
                  label="你的回答"
                  text={feedback.studentFeedback}
                  blockClass={styles.feedbackStudent}
                />

                <FeedbackSection
                  label="老师讲解"
                  text={feedback.explanation}
                  blockClass={styles.feedbackExplain}
                />

                <FeedbackSection
                  label="老师鼓励"
                  text={feedback.encouragement}
                  blockClass={styles.feedbackEncourage}
                />

                {feedback.evidence ? (
                  <p className={styles.evidence}>{feedback.evidence}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          {status === "idle" && beat === "teacher" && showHint && promptTw.done ? (
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
          ) : null}

          {status === "idle" && beat === "teacher" && !showHint && choiceQuestion && promptTw.done ? (
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
          ) : null}

          {status === "idle" && beat === "classmate" && classmateTw.done ? (
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
          ) : null}

          {(status === "idle" && beat === "student") || status === "error" ? (
            choiceQuestion ? (
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
            )
          ) : null}

          {status === "success" &&
          feedback &&
          choiceQuestion &&
          feedback.assessment !== "correct" &&
          spokenTw.done ? (
            <div className={styles.actions}>
              <button
                className={styles.primary}
                data-testid="retry-question"
                onClick={() => {
                  playSfx("click");
                  onRetry();
                }}
              >
                再答一次
              </button>
            </div>
          ) : null}

          {status === "success" &&
          feedback &&
          (!choiceQuestion || feedback.assessment === "correct") &&
          spokenTw.done ? (
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
        </motion.section>
      </div>
    </div>
  );
}
