"use client";

import Link from "next/link";
import { playSfx } from "../audio/playSfx";
import type { ClassroomPortraits } from "./ClassroomFrame";
import styles from "./classroom.module.css";

type Speaker = "teacher" | "classmate" | "student";

const speakerColor: Record<Speaker, string> = {
  teacher: styles.speakerTeacher,
  classmate: styles.speakerClassmate,
  student: styles.speakerStudent,
};

type ClassroomInterludeProps = {
  kind: "intro" | "wake" | "outro";
  portraits: ClassroomPortraits;
  workTitle: string;
  onContinue?: () => void;
};

/**
 * 课堂背景过场：复用 classroom.module.css 的课堂视觉（三人立绘 + 卷页气泡 + 板书淡字）。
 * - intro：进入穿越前，课堂上走神
 * - wake：读诗结束，回到课堂，接着进入问答
 * - outro：本课结束后的课堂收束
 */
export function ClassroomInterlude({
  kind,
  portraits,
  workTitle,
  onContinue,
}: ClassroomInterludeProps) {
  const body =
    kind === "intro"
      ? `老师正在讲《${workTitle}》，声音忽然变得很远。你望着窗外走了神，粉笔字一点点模糊下去……`
      : kind === "wake"
        ? "你模糊中听到老师喊你的名字，你猛然回过神来..."
        : null;

  return (
    <div className={styles.shell} data-testid={`classroom-${kind}`}>
      <div className={styles.backdrop} aria-hidden="true">
        {workTitle}
      </div>
      <div className={styles.stage}>
        <div className={styles.sprites}>
          {(["teacher", "classmate", "student"] as Speaker[]).map((role) => (
            <div
              key={role}
              className={`${styles.sprite} ${
                role === "teacher" ? styles.spriteActive : ""
              }`}
            >
              {portraits[role].src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={portraits[role].src} alt={portraits[role].name} />
              ) : (
                <p>{portraits[role].name}</p>
              )}
            </div>
          ))}
        </div>
        <section className={styles.dialogue} data-speaker="teacher">
          <p className={`${styles.speaker} ${speakerColor.teacher}`}>
            {portraits.teacher.name}
          </p>
          {kind === "intro" ? <p className={styles.kicker}>上课时</p> : null}
          {body ? <p className={styles.bodyText}>{body}</p> : null}
          <div className={styles.actions}>
            {kind === "intro" ? (
              <button
                className={styles.primary}
                data-testid="begin-story"
                onClick={() => {
                  playSfx("click");
                  onContinue?.();
                }}
              >
                进入故事
              </button>
            ) : null}
            {kind === "wake" ? (
              <button
                className={styles.primary}
                data-testid="enter-lesson"
                onClick={() => {
                  playSfx("click");
                  onContinue?.();
                }}
              >
                继续
              </button>
            ) : null}
            {kind === "outro" ? (
              <Link className={styles.primary} href="/" data-testid="back-home">
                返回目录
              </Link>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
