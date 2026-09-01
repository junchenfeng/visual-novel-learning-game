"use client";

import Link from "next/link";
import type { GameContext } from "../../game/gameMachine";
import { useTypewriter } from "../../ui/useTypewriter";
import styles from "../summary.module.css";

type SummaryPhaseProps = {
  context: GameContext;
  status: "generating" | "ready" | "error";
  teacher: { src?: string; name: string };
};

const REMARK_SPEED_MS = 24;

export function SummaryPhase({
  context,
  status,
  teacher,
}: SummaryPhaseProps) {
  const poet = context.dlc.manifest.poet;
  const title = context.dlc.manifest.title;
  const { displayed, done, skip } = useTypewriter(
    status === "ready" ? (context.finalRemark ?? "") : "",
    REMARK_SPEED_MS,
  );
  const remark =
    status === "generating"
      ? "老师正在写总评……"
      : status === "error"
        ? `梦醒了，但你已经跟着${poet}走进了《${title}》的故事。愿你再读这首作品时，能听见文字背后的心声。`
        : context.finalRemark;
  const remarkDone = status !== "ready" || done;

  return (
    <div className={styles.shell} data-testid="summary">
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>本课总结</p>
          <h1>
            {poet} · {context.dlc.manifest.workTitle}
          </h1>
        </div>
        <Link className={styles.back} href="/" data-testid="back-home">
          返回目录
        </Link>
      </header>
      <div className={styles.stage}>
        <div className={styles.body}>
          <div className={styles.speaker}>
            {teacher.src ? (
              <div className={styles.portrait}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={teacher.src} alt={teacher.name} />
              </div>
            ) : null}
            <p className={styles.speakerName}>{teacher.name}</p>
          </div>
          <div className={styles.slipWrap}>
            <aside className={styles.slip} aria-label="老师总评">
              <p className={styles.slipKicker}>老师总评</p>
              {status === "ready" ? (
                <p
                  className={styles.slipBody}
                  data-testid="final-remark"
                  onClick={done ? undefined : skip}
                >
                  {displayed}
                  {done ? null : <span className={styles.caret}>▍</span>}
                </p>
              ) : (
                <p
                  className={styles.slipBody}
                  data-testid={status === "generating" ? "summary-generating" : undefined}
                >
                  {remark}
                </p>
              )}
              {status === "ready" && !done ? (
                <p className={styles.muted}>点文字可以立刻看完全部</p>
              ) : null}
            </aside>
          </div>
        </div>
        <p className={styles.credit}>
          — 本课由 <span className={styles.authorName}>{context.dlc.manifest.author}</span> 制作 —
        </p>
        {remarkDone ? (
          <Link className={styles.resume} href="/" data-testid="finish-to-catalog">
            返回目录
          </Link>
        ) : null}
      </div>
    </div>
  );
}