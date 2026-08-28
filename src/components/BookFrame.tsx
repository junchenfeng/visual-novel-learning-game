import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { chapterLabel } from "../ui/chapterLabel";
import styles from "./book.module.css";

export type ChapterTab = {
  number: number;
  title: string;
  backgroundUrl?: string;
};

type BookFrameProps = {
  poet: string;
  workTitle: string;
  chapters: ChapterTab[];
  activeChapter: number;
  portraitSrc?: string;
  portraitName?: string;
  overlay?: ReactNode;
  children: ReactNode;
};

export function BookFrame({
  poet,
  workTitle,
  chapters,
  activeChapter,
  portraitSrc,
  portraitName,
  overlay,
  children,
}: BookFrameProps) {
  const activeChapterConfig = chapters.find(
    (chapter) => chapter.number === activeChapter,
  );
  const activeBackground = activeChapterConfig?.backgroundUrl;
  const pageStyle = activeBackground
    ? ({ "--chapter-background": `url("${activeBackground}")` } as CSSProperties)
    : undefined;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>背景故事</p>
          <h1>
            {poet} · {workTitle}
          </h1>
        </div>
        <Link className={styles.back} href="/" data-testid="back-home">
          返回目录
        </Link>
      </header>
      <div className={styles.stage}>
        <aside className={styles.spine} aria-label="章节书脊">
          {chapters.map((chapter) => (
            <div
              key={chapter.number}
              className={`${styles.tab} ${chapter.number === activeChapter ? styles.tabActive : ""}`}
              data-testid={`chapter-tab-${chapter.number}`}
            >
              <span className={styles.tabNumber}>{chapterLabel(chapter.number)}</span>
              <span className={styles.tabTitle}>{chapter.title}</span>
            </div>
          ))}
        </aside>
        <section
          className={styles.page}
          data-has-background={Boolean(activeBackground)}
          style={pageStyle}
        >
          {activeBackground ? (
            <div className={styles.sceneMedia}>
              <div className={styles.sceneBackdrop} aria-hidden="true" />
              {/* DLC 图片路径在运行时确定，因此保留原生 img。 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={styles.sceneImage}
                src={activeBackground}
                alt={`${activeChapterConfig?.title ?? "本章"}场景插图`}
              />
              <div className={styles.sceneShade} aria-hidden="true" />
            </div>
          ) : null}
          {overlay}
          <div className={styles.copy}>{children}</div>
          {portraitSrc ? (
            <div className={styles.portrait}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={portraitSrc} alt={portraitName ?? "立绘"} />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
