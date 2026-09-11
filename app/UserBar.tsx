"use client";

import styles from "./page.module.css";

type UserBarProps = {
  username: string;
};

export function UserBar({ username }: UserBarProps) {
  return (
    <div className={styles.userBar}>
      <p className={styles.userMeta}>当前旅人：{username}</p>
      <button
        type="button"
        className={styles.switchUser}
        onClick={() => {
          void (async () => {
            await fetch("/api/auth", { method: "DELETE" });
            window.location.assign("/");
          })();
        }}
      >
        更换用户名
      </button>
    </div>
  );
}
