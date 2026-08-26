"use client";

import { useMemo } from "react";
import type { CatalogWork } from "../dlc/catalog";
import { CurioBook, type BookLayout } from "./CurioBook";
import styles from "./curio-shelf.module.css";

type CurioShelfProps = {
  works: CatalogWork[];
};

type CellDef = {
  col: string; // grid-column value
  row: string; // grid-row value
  layout: BookLayout | "decor";
  decorType?: "seal" | "brush" | "miniScroll";
};

// 博古架格子布局定义（12列网格，行高150px）
// 通过 CSS Grid 模板：
// 第1行：大格(竖书) + 中格(横书) + 小格(装饰) + 大格(卷轴) + 中格(竖书) + 装饰
// 第2行：中格(竖书) + 大格(横书) + 小格(装饰) + 中格(卷轴) + 大格(竖书)
// 第3行：...
// 根据书籍数量动态分配，多余的用装饰填充

function buildLayout(workCount: number): CellDef[] {
  // 预设格子布局模板（12 列网格）
  // 循环使用模板，把书放进非装饰格，装饰格用作视觉调剂
  const patterns: CellDef[] = [
    // 第一行组合
    { col: "span 2", row: "span 2", layout: "vertical" },
    { col: "span 3", row: "span 1", layout: "horizontal" },
    { col: "span 1", row: "span 1", layout: "decor", decorType: "seal" },
    { col: "span 3", row: "span 1", layout: "scroll" },
    { col: "span 2", row: "span 2", layout: "vertical" },
    { col: "span 1", row: "span 2", layout: "decor", decorType: "brush" },
    // 第二行组合
    { col: "span 2", row: "span 1", layout: "vertical" },
    { col: "span 3", row: "span 2", layout: "scroll" },
    { col: "span 1", row: "span 1", layout: "decor", decorType: "miniScroll" },
    { col: "span 2", row: "span 1", layout: "vertical" },
    { col: "span 2", row: "span 1", layout: "horizontal" },
    { col: "span 2", row: "span 1", layout: "decor", decorType: "seal" },
    // 第三行组合
    { col: "span 3", row: "span 1", layout: "horizontal" },
    { col: "span 2", row: "span 2", layout: "vertical" },
    { col: "span 2", row: "span 1", layout: "vertical" },
    { col: "span 2", row: "span 2", layout: "scroll" },
    { col: "span 3", row: "span 1", layout: "decor", decorType: "miniScroll" },
  ];

  const cells: CellDef[] = [];
  const decorTypes: Array<"seal" | "brush" | "miniScroll"> = [
    "seal",
    "miniScroll",
    "brush",
  ];
  let placedBooks = 0;
  let patternIdx = 0;

  // 至少放完所有书 + 一定比例的装饰格
  const minCells = Math.max(patterns.length, Math.ceil(workCount * 1.5));

  while (placedBooks < workCount || cells.length < minCells) {
    const pattern = patterns[patternIdx % patterns.length];
    if (pattern.layout !== "decor" && placedBooks < workCount) {
      cells.push(pattern);
      placedBooks++;
    } else {
      // 装饰格或书已放完，补充装饰
      const decor = pattern.layout === "decor"
        ? pattern
        : {
            ...pattern,
            layout: "decor" as const,
            decorType: decorTypes[cells.length % decorTypes.length],
          };
      cells.push(decor);
    }
    patternIdx++;

    // 防止死循环
    if (cells.length > 100) break;
  }

  return cells;
}

function DecorItem({ type }: { type: string | undefined }) {
  if (type === "seal") {
    return (
      <div className={styles.decorItem}>
        <div className={styles.seal}>藏</div>
      </div>
    );
  }
  if (type === "brush") {
    return (
      <div className={styles.decorItem}>
        <div className={styles.brush} />
      </div>
    );
  }
  if (type === "miniScroll") {
    return (
      <div className={styles.decorItem}>
        <div className={styles.miniScroll} />
      </div>
    );
  }
  return null;
}

export function CurioShelf({ works }: CurioShelfProps) {
  const layout = useMemo(() => buildLayout(works.length), [works.length]);

  // 将书按顺序分配到 layout 中非装饰的格子
  let bookIndex = 0;

  return (
    <div className={styles.curioShelf} role="list" aria-label="博古架书架">
      {layout.map((cell, idx) => {
        if (cell.layout === "decor") {
          return (
            <div
              key={`decor-${idx}`}
              className={`${styles.curioCell} ${styles.curioCellDecor}`}
              style={{
                gridColumn: cell.col,
                gridRow: cell.row,
              }}
              aria-hidden="true"
            >
              <DecorItem type={cell.decorType} />
            </div>
          );
        }

        const work = works[bookIndex];
        bookIndex++;

        if (!work) return null;

        return (
          <div
            key={work.title}
            className={styles.curioCell}
            style={{
              gridColumn: cell.col,
              gridRow: cell.row,
            }}
            role="listitem"
          >
            <CurioBook work={work} layout={cell.layout as BookLayout} />
          </div>
        );
      })}
    </div>
  );
}
