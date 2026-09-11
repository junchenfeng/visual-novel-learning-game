"use client";

import { useState } from "react";
import styles from "./admin.module.css";

type AdminLoginProps = {
  configured: boolean;
};

export function AdminLogin({ configured }: AdminLoginProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(configured ? "" : "本机未配置 POEM_ADMIN_PASSWORD");
  const [pending, setPending] = useState(false);

  return (
    <main className={styles.page}>
      <h1>管理台</h1>
      <p>输入管理密码后才能上传 DLC。</p>
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          setPending(true);
          setError("");
          void (async () => {
            try {
              const response = await fetch("/api/admin/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password }),
              });
              const data = (await response.json()) as { error?: string };
              if (!response.ok) {
                throw new Error(data.error ?? "密码不对");
              }
              window.location.assign("/admin");
            } catch (submitError) {
              setError(submitError instanceof Error ? submitError.message : "密码不对");
              setPending(false);
            }
          })();
        }}
      >
        <label className={styles.label} htmlFor="poem-admin-password">
          密码
        </label>
        <input
          id="poem-admin-password"
          className={styles.input}
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={!configured || pending}
          required
        />
        <button className={styles.submit} type="submit" disabled={!configured || pending}>
          {pending ? "核对中…" : "进入"}
        </button>
        {error ? <p className={styles.error}>{error}</p> : null}
      </form>
    </main>
  );
}
