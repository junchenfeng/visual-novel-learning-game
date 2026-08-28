"use client";

import { useState } from "react";
import type { CatalogPoet } from "../dlc/catalog";
import { CurioShelf } from "./CurioShelf";
import catalogStyles from "../../app/page.module.css";
import shelfStyles from "./curio-shelf.module.css";

type PoetCatalogProps = {
  poets: CatalogPoet[];
};

export function PoetCatalog({ poets }: PoetCatalogProps) {
  const [poetId, setPoetId] = useState<string | null>(null);
  const selected = poets.find((poet) => poet.poetId === poetId);

  if (selected) {
    return (
      <main className={shelfStyles.shelfPage}>
        <header className={shelfStyles.header}>
          <div className={shelfStyles.titleBlock}>
            <span className={shelfStyles.titleKicker}>博 古 架</span>
            <h1 className={shelfStyles.title}>{selected.poet}诗集</h1>
            <p className={shelfStyles.subtitle}>
              蓝布函套 · 线装精刊 · 选取可阅读的篇目开启穿越
            </p>
          </div>
          <button
            type="button"
            className={shelfStyles.backLink}
            data-testid="back-poets"
            onClick={() => setPoetId(null)}
          >
            ← 返回诗人
          </button>
        </header>
        <CurioShelf works={selected.works} />
      </main>
    );
  }

  return (
    <main className={catalogStyles.catalog}>
      <section className={catalogStyles.hero}>
        <h1>选择穿越对象</h1>
      </section>
      <section className={catalogStyles.grid}>
        {poets.map((poet) => (
          <button
            type="button"
            key={poet.poetId}
            className={`${catalogStyles.poetCard} ${poet.available ? catalogStyles.poetCardReady : catalogStyles.poetCardLocked}`}
            data-testid={`poet-card-${poet.poetId}`}
            onClick={() => setPoetId(poet.poetId)}
          >
            <div className={catalogStyles.avatar}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={poet.poetPortraitUrl} alt={`${poet.poet}头像`} />
            </div>
            <p className={catalogStyles.poetName}>{poet.poet}</p>
            <p className={catalogStyles.poetStatus}>
              {poet.available ? "可游玩" : "即将到来"}
            </p>
          </button>
        ))}
      </section>
    </main>
  );
}
