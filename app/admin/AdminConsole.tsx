"use client";

import { useMemo, useState } from "react";
import type { RosterPoet } from "../../src/dlc/roster";
import type { UploadedPack } from "../../src/dlc/uploadIndex";
import {
  PREVIEW_STATUS_LABEL,
  nicknameForUserId,
  previewFromUploadedPack,
  previewPlayDlcId,
  type PreviewEntry,
} from "../../src/ingest/preview";
import styles from "./admin.module.css";

function playLink(origin: string, dlcId: string) {
  return `${origin.replace(/\/+$/, "")}/play/${dlcId}`;
}

function poetWorkLabel(entry: Pick<PreviewEntry, "poet" | "poetId" | "workTitle">): string {
  const poet = (entry.poet || entry.poetId).trim();
  const work = entry.workTitle.trim();
  if (poet && work) {
    return `${poet} · ${work}`;
  }
  return poet || work || "—";
}

function formatUpdatedAt(iso: string): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}

function statusClass(status: PreviewEntry["status"]): string {
  if (status === "published") {
    return styles.statusPublished;
  }
  if (status === "rejected") {
    return styles.statusRejected;
  }
  return styles.statusReviewing;
}

type AdminConsoleProps = {
  poets: RosterPoet[];
  previews: PreviewEntry[];
  origin: string;
};

export function AdminConsole({ poets, previews, origin }: AdminConsoleProps) {
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
  const [list, setList] = useState(previews);

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
                const row = previewFromUploadedPack(data.pack, nicknameForUserId(data.pack.userId));
                setList((current) => [row, ...current.filter((item) => item.slotKey !== row.slotKey)]);
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
        <header className={styles.previewHeader}>
          <h2>预览</h2>
          <button type="button" className={styles.ghost} onClick={() => window.location.reload()}>
            刷新
          </button>
        </header>
        {list.length === 0 ? (
          <p>还没有提交记录。</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>user id</th>
                  <th>昵称</th>
                  <th>诗人-诗词</th>
                  <th>url</th>
                  <th>提交状态</th>
                  <th>更新时间</th>
                </tr>
              </thead>
              <tbody>
                {list.map((entry) => {
                  const dlcId = previewPlayDlcId(entry);
                  const url = dlcId ? playLink(origin, dlcId) : "";
                  return (
                    <tr key={entry.slotKey}>
                      <td>{entry.userId}</td>
                      <td>{entry.nickname || nicknameForUserId(entry.userId) || "—"}</td>
                      <td>{poetWorkLabel(entry)}</td>
                      <td className={styles.tableUrl}>
                        {url ? <a href={url}>{url}</a> : null}
                      </td>
                      <td className={statusClass(entry.status)}>{PREVIEW_STATUS_LABEL[entry.status]}</td>
                      <td className={styles.nowrap}>{formatUpdatedAt(entry.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
