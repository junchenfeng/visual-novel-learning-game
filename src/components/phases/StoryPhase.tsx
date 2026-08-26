import type { StoryNode } from "../../dlc/schema";
import { useTypewriter } from "../../ui/useTypewriter";
import { playSfx } from "../../audio/playSfx";
import styles from "../book.module.css";

type StoryPhaseProps = {
  node: StoryNode;
  disabled?: boolean;
  onContinue: () => void;
  onChoose: (choiceId: string) => void;
  onReplay: () => void;
};

export function StoryPhase({
  node,
  disabled,
  onContinue,
  onChoose,
  onReplay,
}: StoryPhaseProps) {
  const { displayed, done, skip } = useTypewriter(node.text);

  return (
    <>
      {node.type === "gameOver" ? <p className={styles.kicker}>此路不通</p> : null}
      {node.type === "fact" ? (
        <p className={styles.kicker} data-testid="fact-kicker">
          史实{node.heading ? ` · ${node.heading}` : ""}
        </p>
      ) : null}
      {"speaker" in node && node.speaker ? <p className={styles.speaker}>{node.speaker}</p> : null}
      <p
        className={`${styles.bodyText} ${node.type === "fact" ? styles.factText : ""}`}
        data-testid="story-text"
        onClick={skip}
      >
        {displayed}
        {done ? null : <span className={styles.caret}>▍</span>}
      </p>
      {!done ? (
        <p className={styles.muted}>点文字可以立刻看完全段</p>
      ) : node.type === "choice" ? (
        <div className={styles.choices}>
          {node.choices.map((choice, index) => (
            <button
              key={choice.id}
              className={styles.choice}
              disabled={disabled}
              data-testid={`choice-${index}`}
              onClick={() => {
                playSfx("click");
                onChoose(choice.id);
              }}
            >
              {choice.label}
            </button>
          ))}
        </div>
      ) : node.type === "gameOver" ? (
        <div className={styles.actions}>
          <button
            className={styles.primary}
            disabled={disabled}
            data-testid="replay-choice"
            onClick={() => {
              playSfx("click");
              onReplay();
            }}
          >
            重新选择
          </button>
        </div>
      ) : (
        <div className={styles.actions}>
          <button
            className={styles.primary}
            disabled={disabled}
            data-testid="continue-button"
            onClick={() => {
              playSfx("click");
              onContinue();
            }}
          >
            {node.nextNodeId ? "翻到下一页" : "开始读词"}
          </button>
        </div>
      )}
    </>
  );
}
