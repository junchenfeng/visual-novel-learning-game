import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { isAdminUsername } from "../src/auth/admin";
import { USERNAME_COOKIE, decodeCookieUsername, normalizeUsername } from "../src/auth/username";
import { buildCatalogPoets } from "../src/dlc/catalog";
import { loadCompiledCatalog } from "../src/dlc/loadCompiled";
import { UserBar } from "./UserBar";
import { UsernameGate } from "./UsernameGate";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams: Promise<{ needLogin?: string }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const jar = await cookies();
  const username = normalizeUsername(decodeCookieUsername(jar.get(USERNAME_COOKIE)?.value ?? ""));
  if (!username) {
    return <UsernameGate needLogin={params.needLogin === "1"} />;
  }
  if (isAdminUsername(username)) {
    redirect("/admin");
  }

  const poets = buildCatalogPoets(await loadCompiledCatalog());

  return (
    <main className={styles.catalog}>
      <section className={styles.hero}>
        <h1>选择穿越对象</h1>
        <UserBar username={username} />
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
