"use client";

import { useMemo, useState } from "react";
import { playSfx } from "../audio/playSfx";
import type { EasterEggProps } from "./types";
import styles from "./fill-in.module.css";

type FillInBlank = {
  prefix: string;
  suffix: string;
  correct: string;
  options: string[];
  selected: string | null;
};

export function FillInGame({ config, dlc, onDone }: EasterEggProps) {
  const initial = useMemo<FillInBlank[]>(() => {
    const raw = (config.params?.blanks as Array<Record<string, unknown>>) ?? [];
    return raw.map((item) => ({
      prefix: String(item.prefix ?? ""),
      suffix: String(item.suffix ?? ""),
      correct: String(item.correct ?? ""),
      options: Array.isArray(item.options)
        ? (item.options as string[]).slice(0, 4)
        : [],
      selected: null,
    }));
  }, [config]);

  const [blanks, setBlanks] = useState<FillInBlank[]>(initial);
  const [submitted, setSubmitted] = useState(false);
  const [allCorrect, setAllCorrect] = useState(false);

  const handleSelect = (blankIndex: number, value: string) => {
    playSfx("click");
    setBlanks((prev) =>
      prev.map((blank, idx) => (idx === blankIndex ? { ...blank, selected: value } : blank)),
    );
  };

  const handleSubmit = () => {
    playSfx("click");
    const everyCorrect = blanks.every((blank) => blank.selected === blank.correct);
    setAllCorrect(everyCorrect);
    setSubmitted(true);
    playSfx(everyCorrect ? "correct" : "incorrect");
  };

  const revealedBlanks = submitted
    ? blanks.map((blank) => ({ ...blank, selected: blank.correct }))
    : blanks;

  return (
    <div className={styles.shell} data-testid="fill-in-stage">
      <p className={styles.kicker}>填词 · 文思泉涌</p>
      <h2 className={styles.title}>{config.title ?? "补全心中那句"}</h2>
      <p className={styles.subtitle}>
        {submitted
          ? allCorrect
            ? "一字不差！文思泉涌，提笔一挥而就。"
            : "沉吟片刻，改了又改，终究落定了心中那一字。"
          : "从下方选项中选出你认为最合适的字，填入空白处。"}
      </p>

      <div className={styles.poem}>
        {revealedBlanks.map((blank, idx) => (
          <p key={idx} className={styles.line}>
            <span>{blank.prefix}</span>
            <span
              className={`${styles.blank} ${
                submitted
                  ? blank.selected === blank.correct
                    ? styles.correct
                    : styles.autoCorrect
                  : blank.selected
                    ? styles.filled
                    : ""
              }`}
            >
              {blank.selected ?? "____"}
            </span>
            <span>{blank.suffix}</span>
          </p>
        ))}
      </div>

      {!submitted ? (
        <div className={styles.optionsPanel}>
          {blanks.map((blank, idx) => (
            <div key={idx} className={styles.optionGroup}>
              <p className={styles.optionLabel}>第 {idx + 1} 空</p>
              <div className={styles.options}>
                {blank.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={`${styles.optionBtn} ${blank.selected === opt ? styles.active : ""}`}
                    onClick={() => handleSelect(idx, opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.resultHint}>
          {allCorrect ? (
            <p className={styles.correctText}>「妙极！」与心意暗合。</p>
          ) : (
            <p className={styles.hintText}>你选的字也有几分意趣，只是原句终究另有一字。</p>
          )}
        </div>
      )}

      <div className={styles.actions}>
        {!submitted ? (
          <button
            type="button"
            className={styles.primary}
            onClick={handleSubmit}
            disabled={blanks.some((blank) => !blank.selected)}
            data-testid="fill-in-submit"
          >
            落笔定稿
          </button>
        ) : (
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              playSfx("click");
              onDone();
            }}
            data-testid="easter-egg-done"
          >
            开始读词
          </button>
        )}
      </div>
      <p className={styles.author}>
        {dlc.manifest.poet} · {dlc.manifest.workTitle}
      </p>
    </div>
  );
}
