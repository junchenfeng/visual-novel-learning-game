"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import type { Poem } from "../dlc/schema";
import type { ReactNode } from "react";
import { playSfx } from "../audio/playSfx";
import { glossAnnotation } from "../ui/poemGloss";
import styles from "./poem.module.css";

type PoemScrollFrameProps = {
  poet: string;
  workTitle: string;
  poem: Poem;
  lineIndex: number;
  turning?: boolean;
  overlay?: ReactNode;
  onNext: () => void;
};

export function PoemScrollFrame({
  poet,
  workTitle,
  poem,
  lineIndex,
  turning,
  overlay,
  onNext,
}: PoemScrollFrameProps) {
  const currentRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [lineIndex]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === " " && !event.repeat) {
        event.preventDefault();
        playSfx("line");
        onNext();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onNext]);

  const revealed = poem.lines.slice(0, lineIndex + 1);
  const isLast = lineIndex >= poem.lines.length - 1;

  return (
    <div className={styles.shell} data-testid="poem-stage">
      <aside className={styles.closedBook}>背景故事</aside>
      <div className={styles.paperWrap}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>宣纸读词</p>
            <h1>
              {poet} · {workTitle}
            </h1>
          </div>
          <Link className={styles.back} href="/" data-testid="back-home">
            返回目录
          </Link>
        </header>
        <motion.article
          className={styles.paper}
          initial={{ opacity: 0, y: 16 }}
          animate={
            turning
              ? { y: [0, -80, 0], scaleY: [1, 0.18, 1], opacity: [1, 0.55, 1] }
              : { opacity: 1, y: 0 }
          }
          transition={{ duration: 0.42, ease: "easeInOut" }}
          style={{ transformOrigin: "top center" }}
        >
          {overlay}
          {revealed.map((line, index) => (
            <section
              key={line.id}
              className={`${styles.line} ${index === lineIndex ? styles.current : ""}`}
              ref={index === lineIndex ? currentRef : undefined}
            >
              <p className={styles.original} data-testid={index === lineIndex ? "poem-original" : undefined}>
                {line.original}
              </p>
              {line.glosses.length > 0 ? (
                <ul
                  className={styles.glosses}
                  aria-label="课下注释"
                  data-testid={index === lineIndex ? "poem-glosses" : undefined}
                >
                  {line.glosses.map((gloss) => (
                    <li key={`${line.id}-${gloss.word}`} className={styles.gloss}>
                      <span className={styles.glossWord}>{gloss.word}</span>
                      <span className={styles.glossMeaning}>{glossAnnotation(gloss)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className={styles.translation} data-testid={index === lineIndex ? "poem-translation" : undefined}>
                {line.translation}
              </p>
              {line.note ? (
                <aside
                  className={styles.note}
                  aria-label="评注"
                  data-testid={index === lineIndex ? "poem-note" : undefined}
                >
                  <p className={styles.noteKicker}>评注</p>
                  <p className={styles.noteBody}>{line.note}</p>
                </aside>
              ) : null}
            </section>
          ))}
          <div className={styles.actions}>
            <button
              className={styles.primary}
              data-testid="next-line"
              onClick={() => {
                playSfx("line");
                onNext();
              }}
            >
              {isLast ? "进入问答" : "下一句"}
            </button>
          </div>
        </motion.article>
      </div>
    </div>
  );
}
