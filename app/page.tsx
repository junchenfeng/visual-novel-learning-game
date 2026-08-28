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
      {/* 普通 <a>：沙盒里 Next <Link> 的客户端 RSC 可能一直停在 Rendering */}
      <section className={styles.grid}>
        {poets.map((poet) => (
          <a
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
          </a>
        ))}
      </section>
    </main>
  );
}
