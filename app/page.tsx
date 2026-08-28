import Link from "next/link";
import { buildCatalogPoets } from "../src/dlc/catalog";
import { loadCompiledCatalog } from "../src/dlc/loadCompiled";
import styles from "./page.module.css";

export default function HomePage() {
  const poets = buildCatalogPoets(loadCompiledCatalog());

  return (
    <main className={styles.catalog}>
      <section className={styles.hero}>
        <h1>选择穿越对象</h1>
      </section>
      <section className={styles.grid}>
        {poets.map((poet) => (
          <Link
            key={poet.poetId}
            className={`${styles.poetCard} ${poet.available ? styles.poetCardReady : styles.poetCardLocked}`}
            href={`/poet/${poet.poetId}`}
            data-testid={`poet-card-${poet.poetId}`}
          >
            <div className={styles.avatar}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={poet.poetPortraitUrl} alt={`${poet.poet}头像`} />
            </div>
            <p className={styles.poetName}>{poet.poet}</p>
            <p className={styles.poetStatus}>{poet.available ? "可游玩" : "即将到来"}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
