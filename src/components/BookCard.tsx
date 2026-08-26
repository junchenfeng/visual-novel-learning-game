"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CatalogWork } from "../dlc/catalog";

type BookCardProps = {
  work: CatalogWork;
  styles: Record<string, string>;
};

export function BookCard({ work, styles }: BookCardProps) {
  const dlcs = work.dlcs ?? [];
  const hasMultiple = dlcs.length > 1;

  // 初始随机选一个包（在客户端首次渲染时固定）
  const [selectedIndex, setSelectedIndex] = useState<number>(() => {
    if (dlcs.length === 0) return 0;
    return Math.floor(Math.random() * dlcs.length);
  });

  const selectedDlc = dlcs[selectedIndex];
  const [menuOpen, setMenuOpen] = useState(false);

  // 单包或无包直接渲染
  if (!work.available || !selectedDlc) {
    return (
      <span
        className={`${styles.book} ${styles.bookLocked}`}
        data-testid={`locked-book-${work.title}`}
        title={`${work.title}（即将到来）`}
        aria-disabled="true"
      >
        {work.title}
      </span>
    );
  }

  return (
    <div className={styles.bookWrap}>
      <Link
        className={`${styles.book} ${styles.bookReady}`}
        href={`/play/${selectedDlc.id}`}
        data-testid={`catalog-card-${selectedDlc.id}`}
        title={work.title}
      >
        {work.title}
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
            data-testid={`pack-switcher-${work.title}`}
          >
            <span className={styles.packSwitcherLabel}>
              {selectedDlc.displayAuthor}
            </span>
            <svg
              width="12"
              height="12"
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
