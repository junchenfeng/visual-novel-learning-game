"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { validExploreObjectIds, type ExploreNode } from "../../dlc/schema";
import { playSfx } from "../../audio/playSfx";
import { useTypewriter } from "../../ui/useTypewriter";
import styles from "../book.module.css";
import exploreStyles from "./explore.module.css";

type ExplorePhaseProps = {
  node: ExploreNode;
  disabled?: boolean;
  tappedIds: string[];
  hiddenUnlocked: boolean;
  onTapObject: (objectId: string) => void;
  onContinue: () => void;
};

type ClueDialogProps = {
  title: string;
  kicker: string;
  body: string;
  seal: string;
  sealKind: "valid" | "invalid" | "hidden";
  onClose: () => void;
};

function ClueDialog({ title, kicker, body, seal, sealKind, onClose }: ClueDialogProps) {
  const { displayed, done, skip } = useTypewriter(body);

  return (
    <div
      className={exploreStyles.mask}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-testid="explore-memory"
    >
      <div className={exploreStyles.dialog}>
        <div
          className={`${exploreStyles.dialogSeal} ${
            sealKind === "valid"
              ? exploreStyles.sealValid
              : sealKind === "invalid"
                ? exploreStyles.sealInvalid
                : exploreStyles.sealHidden
          }`}
          aria-hidden="true"
        >
          {seal}
        </div>
        <p className={exploreStyles.dialogKicker}>{kicker}</p>
        <h2 className={exploreStyles.dialogTitle}>{title}</h2>
        <p
          className={exploreStyles.dialogBody}
          onClick={done ? undefined : skip}
        >
          {displayed}
          {done ? null : <span className={exploreStyles.caret}>▍</span>}
        </p>
        {done ? (
          <button
            type="button"
            className={exploreStyles.dialogClose}
            data-testid="explore-memory-close"
            onClick={() => {
              playSfx("click");
              onClose();
            }}
          >
            知道了
          </button>
        ) : (
          <p className={exploreStyles.dialogHint}>点文字可以立刻看完全段</p>
        )}
      </div>
    </div>
  );
}

function useGameOverlayRoot() {
  const [root, setRoot] = useState<Element | null>(null);
  useEffect(() => {
    setRoot(document.querySelector("[data-game-overlay-root]"));
  }, []);
  return root;
}

export function ExplorePhase({
  node,
  disabled,
  tappedIds,
  hiddenUnlocked,
  onTapObject,
  onContinue,
}: ExplorePhaseProps) {
  const [activeMemory, setActiveMemory] = useState<string | null>(null);
  const [hiddenDialog, setHiddenDialog] = useState(false);
  const hiddenSeen = useRef(false);
  const overlayRoot = useGameOverlayRoot();

  const validIds = validExploreObjectIds(node);
  const foundValidCount = validIds.filter((id) => tappedIds.includes(id)).length;
  const allValidFound = foundValidCount >= validIds.length;

  const handleTap = (objectId: string) => {
    if (disabled) return;
    const obj = node.objects.find((item) => item.id === objectId);
    if (!obj) return;
    const alreadyTapped = tappedIds.includes(objectId);
    if (alreadyTapped && !obj.valid) {
      return;
    }
    playSfx("click");
    if (!alreadyTapped) {
      onTapObject(objectId);
    }
    setActiveMemory(objectId);
  };

  const closeMemory = () => {
    const closingId = activeMemory;
    setActiveMemory(null);
    const validNowFound = validIds.every(
      (id) => id === closingId || tappedIds.includes(id),
    );
    if (validNowFound && node.hiddenReward && !hiddenSeen.current) {
      hiddenSeen.current = true;
      setHiddenDialog(true);
    }
  };

  const activeObj = activeMemory
    ? node.objects.find((item) => item.id === activeMemory)
    : null;

  const dialog = activeObj ? (
    <ClueDialog
      key={activeObj.id}
      title={`「${activeObj.name}」忆起`}
      kicker={activeObj.valid ? "有效线索" : "无效线索"}
      body={activeObj.memory}
      seal={activeObj.valid ? "有效" : "误"}
      sealKind={activeObj.valid ? "valid" : "invalid"}
      onClose={closeMemory}
    />
  ) : hiddenDialog && node.hiddenReward ? (
    <ClueDialog
      key="hidden-reward"
      title="隐藏回忆"
      kicker="线索齐了"
      body={node.hiddenReward}
      seal="悟"
      sealKind="hidden"
      onClose={() => setHiddenDialog(false)}
    />
  ) : null;

  return (
    <>
      <div className={styles.copyBody}>
        <p className={styles.kicker}>{node.chapterTitle}</p>
        <p className={styles.bodyText}>{node.text}</p>

        <div className={exploreStyles.scene}>
          <p className={exploreStyles.hint}>
            点开物件，辨认哪些才是有效线索（{foundValidCount} / {validIds.length}）
          </p>
          <div className={exploreStyles.objects}>
            {node.objects.map((obj) => {
              const tapped = tappedIds.includes(obj.id);
              const invalidLocked = tapped && !obj.valid;
              const validStamped = tapped && obj.valid;
              return (
                <button
                  key={obj.id}
                  type="button"
                  className={[
                    exploreStyles.object,
                    validStamped ? exploreStyles.valid : "",
                    invalidLocked ? exploreStyles.invalid : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => handleTap(obj.id)}
                  disabled={disabled || invalidLocked}
                  data-testid={`explore-object-${obj.id}`}
                  data-valid={obj.valid ? "true" : "false"}
                  data-tapped={tapped ? "true" : "false"}
                >
                  <span className={exploreStyles.objectName}>{obj.name}</span>
                  {obj.hint ? (
                    <span className={exploreStyles.objectHint}>{obj.hint}</span>
                  ) : null}
                  {validStamped ? (
                    <span className={exploreStyles.stamp} aria-hidden="true">
                      有效
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          className={styles.primary}
          disabled={disabled || !allValidFound || Boolean(dialog)}
          data-testid="explore-continue"
          onClick={() => {
            playSfx("click");
            onContinue();
          }}
        >
          {allValidFound ? "继续前行" : "再看看……"}
        </button>
      </div>

      {dialog && overlayRoot ? createPortal(dialog, overlayRoot) : null}
    </>
  );
}
