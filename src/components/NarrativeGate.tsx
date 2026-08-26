"use client";

import { playSfx } from "../audio/playSfx";
import styles from "./narrativeGate.module.css";

type NarrativeGateProps = {
  kind: "intro" | "transition";
  title: string;
  onContinue: () => void;
};

export function NarrativeGate({ kind, title, onContinue }: NarrativeGateProps) {
  const isIntro = kind === "intro";

  return (
    <section className={`${styles.screen} ${isIntro ? styles.intro : styles.transition}`}>
      <div className={styles.sky} aria-hidden="true">
        <div className={styles.moon} />
        <div className={styles.cloud} />
      </div>
      <div className={styles.card}>
        <p className={styles.eyebrow}>{isIntro ? "一场奇梦" : "梦醒时分"}</p>
        <p className={styles.narrative}>
          {isIntro
            ? "你一睁眼，发现自己居然穿着古装。难道我穿越了？"
            : `你醒过神来，原来是在课堂上做了个梦。你们正在学《${title}》。`}
        </p>
        <button
          className={styles.continue}
          data-testid={isIntro ? "begin-story" : "enter-lesson"}
          onClick={() => {
            playSfx("click");
            onContinue();
          }}
        >
          {isIntro ? "走进梦里" : "开始学习"}
          <span aria-hidden="true">→</span>
        </button>
      </div>
      <p className={styles.hint}>{isIntro ? "点击进入故事" : "梦里的经历，也许正藏着答案"}</p>
    </section>
  );
}
