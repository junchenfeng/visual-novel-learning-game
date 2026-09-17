"use client";

import { useState } from "react";
import { usernameHint } from "../src/auth/username";
import { isAdminUsername } from "../src/auth/admin";
import styles from "./page.module.css";

type UsernameGateProps = {
  needLogin?: boolean;
};

export function UsernameGate({ needLogin = false }: UsernameGateProps) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState(needLogin ? "先填写用户名再进书架" : "");
  const [pending, setPending] = useState(false);

  return (
    <main className={styles.gate}>
      <h1>写下你的名字</h1>
      <p>不用密码。这个名字用来分开你的进度、对局和点赞。</p>
      <form
        className={styles.gateForm}
        onSubmit={(event) => {
          event.preventDefault();
          setPending(true);
          setError("");
          void (async () => {
            try {
              const response = await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username }),
              });
              const data = (await response.json()) as { error?: string; username?: string };
              if (!response.ok) {
                throw new Error(data.error ?? usernameHint());
              }
              const nextPath = isAdminUsername(data.username ?? username) ? "/admin" : "/";
              window.location.assign(nextPath);
            } catch (submitError) {
              setError(submitError instanceof Error ? submitError.message : usernameHint());
              setPending(false);
            }
          })();
        }}
      >
        <label className={styles.gateLabel} htmlFor="poem-username">
          用户名
        </label>
        <input
          id="poem-username"
          className={styles.gateInput}
          name="username"
          autoComplete="username"
          inputMode="text"
          maxLength={32}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="例如：小狸"
          required
        />
        <button className={styles.gateSubmit} type="submit" disabled={pending}>
          {pending ? "记下了…" : "进入诗集"}
        </button>
        {error ? <p className={styles.gateError}>{error}</p> : <p>{usernameHint()}</p>}
      </form>
    </main>
  );
}
