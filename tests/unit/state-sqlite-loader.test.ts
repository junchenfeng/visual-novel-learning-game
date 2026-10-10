import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openStateDb, transaction } from "../../src/ingest/state";
import { SQLITE_SKIP_REASON, hasNodeSqlite } from "../helpers/sqlite";

/**
 * `node:sqlite` 的取法有个只能在 Next 打包产物里才暴露的坑：写成
 * `require("node:sqlite")` 会被 webpack 变成 URL 型 external，运行期抛
 * `Cannot find module 'node:sqlite': Unsupported external type Url for commonjs reference`，
 * 于是 Web 侧每次受理都 enqueue_failed（2026-10-10 线上实测），而 worker 走 tsx 不经打包照常工作，
 * 单测也全绿 —— 所以这里额外加一条源码级护栏。
 */
describe("state.ts 的 node:sqlite 取法", () => {
  (hasNodeSqlite() ? it : it.skip)("能开库、建表、跑事务", () => {
    if (!hasNodeSqlite()) {
      // 没有 node:sqlite 时跳过（Node < 22.5）：理由写进测试名，CI 上能看到
      console.warn(SQLITE_SKIP_REASON);
    }
    const dir = mkdtempSync(path.join(tmpdir(), "poem-state-test-"));
    try {
      const db = openStateDb(dir);
      db.prepare("INSERT INTO locks(name,token,pid) VALUES (?,?,?)").run("t", "tok", process.pid);
      const row = db.prepare("SELECT pid FROM locks WHERE name=?").get("t");
      expect(Number(row?.pid)).toBe(process.pid);
      const echoed = transaction(db, () => {
        db.prepare("INSERT INTO locks(name,token,pid) VALUES (?,?,?)").run("t2", "tok2", process.pid);
        return "ok";
      });
      expect(echoed).toBe("ok");
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("不用 require（会踩 Next 打包器的 URL 型 external）", () => {
    const source = readFileSync(path.join(__dirname, "../../src/ingest/state.ts"), "utf8");
    // 只查代码，不看注释 —— 注释里正好写着「不能用 require("node:sqlite")」这句话
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/require\(\s*["']node:sqlite["']\s*\)/);
    expect(code).toMatch(/getBuiltinModule/);
  });
});
