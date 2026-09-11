"use client";

import { useEffect } from "react";
import type { GameOverNode } from "../dlc/schema";
import { playSfx } from "../audio/playSfx";
import { useTypewriter } from "../ui/useTypewriter";
import styles from "./game-over.module.css";

type GameOverModalProps = {
  node: GameOverNode;
  onReplay: () => void;
  isEnding?: boolean;
  endingTitle?: string;
};

/**
 * 结局弹窗：gameOver 节点时呈现。
 * - 普通失败：显示「此路不通」+ 重选
 * - 真结局（endingId 存在）：显示结局标题 + 继续读词
 */
export function GameOverModal({
  node,
  onReplay,
  isEnding = false,
  endingTitle,
}: GameOverModalProps) {
  const { displayed, done, skip } = useTypewriter(node.text);

  useEffect(() => {
    playSfx(isEnding ? "correct" : "incorrect");
  }, [isEnding]);

  return (
    <div className={styles.mask} role="dialog" aria-modal="true" aria-label="结局">
      <div className={styles.smoke} aria-hidden="true" />
      <div className={styles.ring} aria-hidden="true" />
      <div className={styles.particles} aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>

      <div className={`${styles.card} ${isEnding ? styles.endingCard : ""}`}>
        <div className={`${styles.seal} ${isEnding ? styles.endingSeal : ""}`} aria-hidden="true">
          {isEnding ? "终" : "止"}
        </div>
        <p className={styles.kicker}>
          {node.speaker ? `${node.speaker} · ` : ""}
          {isEnding ? "结局" : "此路不通"}
        </p>
        <h2
          className={`${styles.title} ${isEnding ? styles.endingTitle : ""}`}
          data-testid="gameover-title"
        >
          {isEnding ? endingTitle ?? "一阕终章" : "此路不通"}
        </h2>
        <p
          className={styles.body}
          data-testid="gameover-text"
          onClick={done ? undefined : skip}
        >
          {displayed}
          {done ? null : <span className={styles.caret}>▍</span>}
        </p>
        {done ? (
          isEnding ? (
            <button
              className={styles.replay}
              data-testid="gameover-continue"
              onClick={() => {
                playSfx("click");
                onReplay();
              }}
            >
              合卷沉思，开始读词
            </button>
          ) : (
            <button
              className={styles.replay}
              data-testid="gameover-replay"
              onClick={() => {
                playSfx("click");
                onReplay();
              }}
            >
              回到岔路，重新选择
            </button>
          )
        ) : (
          <p className={styles.muted}>点文字可以立刻看完全段</p>
        )}
      </div>
    </div>
  );
}
