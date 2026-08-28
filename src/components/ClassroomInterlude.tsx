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
  kind: "intro" | "outro";
  portraits: ClassroomPortraits;
  workTitle: string;
  onContinue?: () => void;
};

/**
 * 课堂背景过场：复用 classroom.module.css 的课堂视觉（三人立绘 + 卷页气泡 + 板书淡字）。
 * - intro：进入穿越前，课堂上走神
 * - outro：结束穿越后，回到课堂被老师点名（首尾呼应）
 */
export function ClassroomInterlude({
  kind,
  portraits,
  workTitle,
  onContinue,
}: ClassroomInterludeProps) {
  const isIntro = kind === "intro";

  return (
    <div
      className={styles.shell}
      data-testid={isIntro ? "classroom-intro" : "classroom-outro"}
    >
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
          <p className={styles.kicker}>{isIntro ? "上节课" : "下课铃之前"}</p>
          <p className={styles.bodyText}>
            {isIntro
              ? `老师正在讲《${workTitle}》，声音忽然变得很远。你望着窗外走了神，粉笔字一点点模糊下去……`
              : `你猛地惊醒。老师正看着你："来，说说看——《${workTitle}》这首诗讲了什么？"你笑了笑——这一课，你刚从诗里回来。`}
          </p>
          <div className={styles.actions}>
            {isIntro ? (
              <button
                className={styles.primary}
                data-testid="begin-story"
                onClick={() => {
                  playSfx("click");
                  onContinue?.();
                }}
              >
                回过神，已入故事
              </button>
            ) : (
              <Link className={styles.primary} href="/" data-testid="back-home">
                合上书，回目录
              </Link>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}