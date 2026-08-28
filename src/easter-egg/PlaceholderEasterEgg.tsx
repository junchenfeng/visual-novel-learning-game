"use client";

import { playSfx } from "../audio/playSfx";
import type { EasterEggProps } from "./types";
import styles from "./placeholder.module.css";

export function PlaceholderEasterEgg({ config, onDone }: EasterEggProps) {
  return (
    <div className={styles.stage} data-testid="easter-egg-stage">
      <section className={styles.card}>
        <p className={styles.eyebrow}>彩蛋</p>
        <h1 className={styles.title}>{config.title ?? "这是什么？"}</h1>
        <p className={styles.body}>
          这里是故事结束之后、读词开始之前的小游戏接口。真正的玩法接上之后会出现在这里。
        </p>
        <button
          className={styles.primary}
          data-testid="easter-egg-done"
          onClick={() => {
            playSfx("click");
            onDone();
          }}
        >
          开始读词
        </button>
      </section>
    </div>
  );
}
