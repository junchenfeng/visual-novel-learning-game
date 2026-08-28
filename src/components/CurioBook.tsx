"use client";

import Link from "next/link";
import { useState } from "react";
import type { CatalogWork } from "../dlc/catalog";
import styles from "./curio-shelf.module.css";

export type BookLayout = "vertical" | "horizontal" | "scroll";

type BookColor = {
  name: string;
  color: string;
};

// 线装书封面配色池（按篇目哈希分配，每种有一个雅致的中式色彩名）
const BOOK_COLORS: BookColor[] = [
  { name: "indigo", color: "#2c4a6b" },    // 靛蓝
  { name: "bamboo", color: "#4a6b3a" },    // 竹青
  { name: "ochre", color: "#8b5a2b" },     // 赭石
  { name: "cinnabar", color: "#7a2e2e" },  // 朱砂（暗）
  { name: "pine", color: "#2c4a4a" },      // 松烟
  { name: "eggplant", color: "#4a2c4a" },  // 紫檀
  { name: "teal", color: "#2c5a5a" },      // 苔青
  { name: "rust", color: "#8b4513" },      // 枣红
];

function hashStringToIndex(str: string, max: number): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash % max;
}

type CurioBookProps = {
  work: CatalogWork;
  layout: BookLayout;
};

export function CurioBook({ work, layout }: CurioBookProps) {
  const dlcs = work.dlcs ?? [];
  const hasMultiple = dlcs.length > 1;

  const [selectedIndex, setSelectedIndex] = useState<number>(() => {
    if (dlcs.length === 0) return 0;
    return hashStringToIndex(work.title, dlcs.length);
  });

  const selectedDlc = dlcs[selectedIndex];
  const [menuOpen, setMenuOpen] = useState(false);

  const bookColor =
    BOOK_COLORS[hashStringToIndex(work.title, BOOK_COLORS.length)]?.color ??
    "#2c4a6b";

  // 锁定状态
  if (!work.available || !selectedDlc) {
    return (
      <div className={styles.bookWrap}>
        <span
          className={`${styles.book} ${styles[`book${capitalize(layout)}`]} ${styles.bookLocked}`}
          title={`${work.title}（即将到来）`}
          aria-disabled="true"
          style={{ ["--book-color" as string]: bookColor }}
        >
          <span className={styles.lockBadge}>?</span>
          {layout === "scroll" && (
            <>
              <span className={`${styles.scrollRoll} ${styles.scrollRollLeft}`} />
              <span className={`${styles.scrollRoll} ${styles.scrollRollRight}`} />
              <span className={styles.scrollTag} />
            </>
          )}
          {layout !== "scroll" && (
            <span className={styles.bookTitle}>{work.title}</span>
          )}
          {layout === "scroll" && (
            <span className={styles.bookTitle}>{work.title}</span>
          )}
        </span>
      </div>
    );
  }

  const bookBaseClass = `${styles.book} ${styles[`book${capitalize(layout)}`]} ${styles.bookReady}`;

  return (
    <div className={styles.bookWrap}>
      <Link
        className={bookBaseClass}
        href={`/play/${selectedDlc.id}`}
        title={`${work.title} — ${selectedDlc.displayAuthor} 版本`}
        style={{ ["--book-color" as string]: bookColor }}
      >
        {layout === "scroll" ? (
          <>
            <span className={`${styles.scrollRoll} ${styles.scrollRollLeft}`} />
            <span className={`${styles.scrollRoll} ${styles.scrollRollRight}`} />
            <span className={styles.scrollTag} />
            <span className={styles.bookTitle}>{work.title}</span>
          </>
        ) : (
          <>
            {layout === "horizontal" && <span className={styles.bookSpine} />}
            <span className={styles.bookTitle}>{work.title}</span>
          </>
        )}
        <span className={styles.inkGlow} aria-hidden="true" />
      </Link>
      {hasMultiple && (
        <div className={styles.packSwitcher}>
          <button
            type="button"
            className={styles.packSwitcherBtn}
            onClick={(e) => {
              e.preventDefault();
              setMenuOpen((open) => !open);
            }}
            aria-label="切换版本"
            title={`由 ${selectedDlc.displayAuthor} 制作，点击切换版本`}
          >
            <span className={styles.packSwitcherLabel}>
              {selectedDlc.displayAuthor}
            </span>
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div
                className={styles.packMenuBackdrop}
                onClick={() => setMenuOpen(false)}
              />
              <ul className={styles.packMenu} role="menu">
                {dlcs.map((dlc, idx) => (
                  <li key={dlc.id} role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className={`${styles.packMenuItem} ${
                        idx === selectedIndex ? styles.packMenuItemActive : ""
                      }`}
                      onClick={() => {
                        setSelectedIndex(idx);
                        setMenuOpen(false);
                      }}
                    >
                      <span className={styles.packMenuItemLabel}>
                        {dlc.displayAuthor} 版本
                      </span>
                      <span className={styles.packMenuItemVersion}>
                        v{dlc.version}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
