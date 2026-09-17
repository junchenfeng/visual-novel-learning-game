import type { ReactNode } from "react";
import styles from "./viewport.module.css";

type GameViewportProps = {
  children: ReactNode;
};

export function GameViewport({ children }: GameViewportProps) {
  return (
    <div className={styles.desktopShell}>
      <div className={styles.sideOrnament} aria-hidden="true">
        <span>诗</span>
        <i />
        <span>词</span>
      </div>
      <main className={styles.viewport}>
        <div className={styles.canvas}>{children}</div>
      </main>
      <div className={`${styles.sideOrnament} ${styles.sideOrnamentRight}`} aria-hidden="true">
        <span>入</span>
        <i />
        <span>梦</span>
      </div>
    </div>
  );
}
