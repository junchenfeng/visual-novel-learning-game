import type { SegmentProgress } from "../ui/lessonProgress";
import styles from "./lesson-progress.module.css";

type LessonProgressProps = {
  progress: SegmentProgress;
  tone?: "paper" | "night";
};

export function LessonProgress({ progress, tone = "paper" }: LessonProgressProps) {
  return (
    <div
      className={`${styles.root} ${tone === "night" ? styles.night : ""}`}
      data-testid="lesson-progress"
      aria-label={`${progress.label} ${progress.detail}`}
    >
      <div className={styles.meta}>
        <span className={styles.label}>{progress.label}</span>
        <span className={styles.detail}>{progress.detail}</span>
      </div>
      <div
        className={styles.track}
        role="progressbar"
        aria-valuenow={progress.percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={styles.fill} style={{ width: `${progress.percent}%` }} />
      </div>
    </div>
  );
}
