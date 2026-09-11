"use client";

import { useMemo, useState } from "react";
import type { RosterPoet } from "../../src/dlc/roster";
import type { UploadedPack } from "../../src/dlc/uploadIndex";
import styles from "./admin.module.css";

function playLink(origin: string, dlcId: string) {
  return `${origin.replace(/\/+$/, "")}/play/${dlcId}`;
}

type AdminConsoleProps = {
  poets: RosterPoet[];
  packs: UploadedPack[];
  origin: string;
};

export function AdminConsole({ poets, packs, origin }: AdminConsoleProps) {
  const [poetId, setPoetId] = useState(poets[0]?.poetId ?? "");
  const works = useMemo(
    () => poets.find((poet) => poet.poetId === poetId)?.works ?? [],
    [poetId, poets],
  );
  const [workTitle, setWorkTitle] = useState(works[0]?.title ?? "");
  const [userId, setUserId] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [list, setList] = useState(packs);

  function onPoetChange(nextPoetId: string) {
    setPoetId(nextPoetId);
    const nextWorks = poets.find((poet) => poet.poetId === nextPoetId)?.works ?? [];
    setWorkTitle(nextWorks[0]?.title ?? "");
  }

  return (
    <main className={styles.pageWide}>
      <header className={styles.header}>
        <div>
          <h1>DLC 上传台</h1>
          <p>zip 里要有 manifest.yaml 和 content/。破坏性错误会拒绝，多出来的字段和文件可以过。</p>
        </div>
        <button
          type="button"
          className={styles.ghost}
          onClick={() => {
            void (async () => {
              await fetch("/api/admin/login", { method: "DELETE" });
              await fetch("/api/auth", { method: "DELETE" });
              window.location.assign("/");
            })();
          }}
        >
          退出管理台
        </button>
      </header>

      <form
        className={styles.upload}
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const zipInput = form.elements.namedItem("zip") as HTMLInputElement | null;
          const file = zipInput?.files?.[0];
          if (!file) {
            setIssues(["请选择 zip"]);
            return;
          }
          const body = new FormData();
          body.set("userId", userId);
          body.set("poetId", poetId);
          body.set("workTitle", workTitle);
          body.set("zip", file);
          setPending(true);
          setIssues([]);
          setMessage("");
          void (async () => {
            try {
              const response = await fetch("/api/admin/upload", { method: "POST", body });
              const data = (await response.json()) as {
                error?: string;
                issues?: string[];
                pack?: UploadedPack;
              };
              if (!response.ok) {
                setIssues(data.issues ?? [data.error ?? "上传失败"]);
                return;
              }
              if (data.pack) {
                setList((current) => {
                  const without = current.filter((item) => item.dlcId !== data.pack?.dlcId);
                  return [data.pack!, ...without];
                });
                setMessage(`已入库 ${data.pack.dlcId}`);
                form.reset();
                setUserId("");
              }
            } catch (submitError) {
              setIssues([submitError instanceof Error ? submitError.message : "上传失败"]);
            } finally {
              setPending(false);
            }
          })();
        }}
      >
        <label className={styles.label} htmlFor="upload-user-id">
          作者 / 学生 user id
        </label>
        <input
          id="upload-user-id"
          className={styles.input}
          name="userId"
          value={userId}
          onChange={(event) => setUserId(event.target.value)}
          placeholder="手填，不必等于登录名"
          required
        />

        <label className={styles.label} htmlFor="upload-poet">
          诗人
        </label>
        <select
          id="upload-poet"
          className={styles.input}
          name="poetId"
          value={poetId}
          onChange={(event) => onPoetChange(event.target.value)}
        >
          {poets.map((poet) => (
            <option key={poet.poetId} value={poet.poetId}>
              {poet.poet}
            </option>
          ))}
        </select>

        <label className={styles.label} htmlFor="upload-work">
          篇目
        </label>
        <select
          id="upload-work"
          className={styles.input}
          name="workTitle"
          value={workTitle}
          onChange={(event) => setWorkTitle(event.target.value)}
        >
          {works.map((work) => (
            <option key={work.title} value={work.title}>
              {work.title}
            </option>
          ))}
        </select>

        <label className={styles.label} htmlFor="upload-zip">
          DLC zip
        </label>
        <input id="upload-zip" className={styles.file} type="file" name="zip" accept=".zip,application/zip" required />

        <button className={styles.submit} type="submit" disabled={pending}>
          {pending ? "校验并上传…" : "上传"}
        </button>
        {message ? <p className={styles.ok}>{message}</p> : null}
        {issues.length > 0 ? (
          <ul className={styles.issues}>
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        ) : null}
      </form>

      <section>
        <h2>已上传</h2>
        {list.length === 0 ? (
          <p>还没有上传包。</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>user id</th>
                <th>play</th>
              </tr>
            </thead>
            <tbody>
              {list.map((pack) => (
                <tr key={pack.dlcId}>
                  <td>{pack.userId}</td>
                  <td>
                    <a href={playLink(origin, pack.dlcId)}>{playLink(origin, pack.dlcId)}</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
