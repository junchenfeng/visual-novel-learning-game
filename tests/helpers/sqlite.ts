/**
 * `node:sqlite` 能力探测。
 *
 * 仓库 engines 要求 Node ≥22.13，但本机常见默认 Node 是 nvm 的 v20（无 `node:sqlite`），
 * 这会让依赖异步队列/跨进程锁的 suite 整体报错、看着像代码坏了。改成显式 skip 并给出原因，
 * 在受支持的 Node（22/24）上照常执行。
 */
export function hasNodeSqlite(): boolean {
  try {
    const getBuiltinModule = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule;
    const mod = getBuiltinModule?.call(process, "node:sqlite") as { DatabaseSync?: unknown } | undefined;
    return Boolean(mod?.DatabaseSync);
  } catch {
    return false;
  }
}

export const SQLITE_SKIP_REASON =
  "当前 Node 没有 node:sqlite：需要 Node ≥22.13（22.x 已免开关；注意 23.0–23.3 反而还要 --experimental-sqlite）。本机默认 nvm v20 与 Homebrew v23.3 都不满足，用 Node 22.15+/24 跑即可（仓库 engines 也是 ≥22.13）。";

/** 有 sqlite 就跑、没有就整组 skip 的 describe。 */
export const describeWithSqlite = hasNodeSqlite() ? describe : describe.skip;

/** 平铺写法（没有 describe）的用例用这个；没有 sqlite 时整条跳过。 */
export const itWithSqlite = hasNodeSqlite() ? it : it.skip;
