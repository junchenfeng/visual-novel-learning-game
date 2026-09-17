"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { playSfx } from "../../audio/playSfx";
import styles from "../summary.module.css";
import feedbackStyles from "./feedback.module.css";

type FeedbackPhaseProps = {
  poetId: string;
  dlcId: string;
  author: string;
  workTitle: string;
};

export function FeedbackPhase({ poetId, dlcId, author, workTitle }: FeedbackPhaseProps) {
  const router = useRouter();
  const [pending, setPending] = useState<"like" | "skip" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    playSfx("correct");
  }, []);

  const goHome = () => {
    router.push(`/poet/${poetId}`);
  };

  return (
    <div className={styles.shell} data-testid="feedback">
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>本课终章</p>
          <h1>
            {workTitle}
          </h1>
        </div>
      </header>
      <div className={styles.stage}>
        <div className={feedbackStyles.body}>
          <p className={feedbackStyles.lead}>
            这一版由 <strong>{author}</strong> 写成。若你愿意，给这个版本留一枚赞。
          </p>
          {error ? <p className={feedbackStyles.error}>{error}</p> : null}
          <div className={feedbackStyles.actions}>
            <button
              type="button"
              className={feedbackStyles.like}
              data-testid="feedback-like"
              disabled={pending !== null}
              onClick={() => {
                setPending("like");
                setError("");
                playSfx("click");
                void (async () => {
                  try {
                    const response = await fetch("/api/likes", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ dlcId }),
                    });
                    if (!response.ok) {
                      const data = (await response.json().catch(() => null)) as { error?: string } | null;
                      throw new Error(data?.error ?? "点赞没有记下");
                    }
                    goHome();
                  } catch (likeError) {
                    setError(likeError instanceof Error ? likeError.message : "点赞没有记下");
                    setPending(null);
                  }
                })();
              }}
            >
              {pending === "like" ? "记下了…" : "点赞"}
            </button>
            <button
              type="button"
              className={feedbackStyles.skip}
              data-testid="feedback-skip"
              disabled={pending !== null}
              onClick={() => {
                setPending("skip");
                playSfx("click");
                goHome();
              }}
            >
              跳过
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
