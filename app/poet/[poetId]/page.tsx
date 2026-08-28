import Link from "next/link";
import { notFound } from "next/navigation";
import { findCatalogPoet } from "../../../src/dlc/catalog";
import { loadCompiledCatalog } from "../../../src/dlc/loadCompiled";
import { CurioShelf } from "../../../src/components/CurioShelf";
import styles from "../../../src/components/curio-shelf.module.css";

type PoetPageProps = {
  params: Promise<{ poetId: string }>;
};

export default async function PoetShelfPage({ params }: PoetPageProps) {
  const { poetId } = await params;
  const shelf = findCatalogPoet(loadCompiledCatalog(), poetId);
  if (!shelf) {
    notFound();
  }

  return (
    <main className={styles.shelfPage}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <span className={styles.titleKicker}>博 古 架</span>
          <h1 className={styles.title}>{shelf.poet}诗集</h1>
          <p className={styles.subtitle}>
            蓝布函套 · 线装精刊 · 选取可阅读的篇目开启穿越
          </p>
        </div>
        <Link className={styles.backLink} href="/" data-testid="back-poets">
          ← 返回诗人
        </Link>
      </header>

      <CurioShelf works={shelf.works} />
    </main>
  );
}
