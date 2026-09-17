"use client";

import { useEffect } from "react";
import type { GameOverNode } from "../dlc/schema";
import { playSfx } from "../audio/playSfx";
import { useTypewriter } from "../ui/useTypewriter";
import styles from "./game-over.module.css";

type GameOverModalProps = {
  node: GameOverNode;
  onReplay: () => void;
};

/**
 * 结局弹窗：游戏结束（gameOver 节点）时，以放大弹窗 + 水墨特效的形式呈现。
 */
export function GameOverModal({ node, onReplay }: GameOverModalProps) {
  const { displayed, done, skip } = useTypewriter(node.text);

  useEffect(() => {
    playSfx("incorrect");
  }, []);

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

      <div className={styles.card}>
        <div className={styles.seal} aria-hidden="true">
          止
        </div>
        <p className={styles.kicker}>
          {node.speaker ? `${node.speaker} · ` : ""}结局
        </p>
        <h2 className={styles.title} data-testid="gameover-title">
          此路不通
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
        ) : (
          <p className={styles.muted}>点文字可以立刻看完全段</p>
        )}
      </div>
    </div>
  );
}