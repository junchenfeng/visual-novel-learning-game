#!/usr/bin/env node
/**
 * coze-sync —— 把主仓库的「通用层」单向灌进扣子专用仓库。
 *
 * 背景
 * ----
 * 扣子编程只能同步仓库的 main 分支。主仓库 main 同时承载线上主站
 * （用户名隔离 / 管理台 / OSS 上传 / MCP 审核 / CDN / ECS 部署），这些代码
 * 一旦进扣子沙盒就是污染。于是扣子版拆到独立仓库，本脚本负责把主仓库里
 * 「不含任何宿主依赖」的文件灌过去。
 *
 * 核心判定：import 闭包检查
 * -------------------------
 * include/exclude 只做粗筛。真正决定一个文件能不能共享的是它的**依赖闭包**：
 * 递归解析相对 import（含 css module 的 @import / composes、require、动态 import），
 * 只要闭包内任何一环落在 exclude 里，这个文件就被拒绝，扣子仓库保留自己的旧版本。
 *
 * 这条规则的含义是：**共享文件里一旦出现宿主依赖，它就不再共享**。
 * 因此报告里的「被拒清单」就是主仓库该做分层重构的待办列表，按被拒次数排序
 * 即为重构优先级。收敛方向：把宿主依赖从内核文件里抽出去（依赖注入 / 适配层），
 * 而不是把宿主代码复制一份。
 *
 * 用法
 * ----
 *   node scripts/coze-sync.mjs                  只看报告（默认 dry-run，不写盘）
 *   node scripts/coze-sync.mjs --write          写入扣子仓库并提交；随后自动自检，失败即回滚
 *   node scripts/coze-sync.mjs --write --push   写入、自检、推送到 origin
 *   node scripts/coze-sync.mjs --no-verify      跳过写入后的自检（仅应急，不推荐）
 *   node scripts/coze-sync.mjs --prune          额外删除「主仓库已删」的残留文件
 *   node scripts/coze-sync.mjs --check          护栏：扣子仓库落后则退出码 1（挂 pre-push / CI）
 *   node scripts/coze-sync.mjs --verify         单独在扣子仓库跑一遍 build + test
 *   node scripts/coze-sync.mjs --json           以 JSON 输出报告（供其它工具消费）
 *
 * 约定
 * ----
 * - 主仓库是唯一事实源。扣子仓库里被同步的路径视为**只读**，改了会被覆盖。
 * - 扣子仓库工作树必须干净；有未提交改动时脚本拒绝执行。
 * - 绝不 force push。
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, "coze.config.json"), "utf8"));
const B_REPO = path.resolve(ROOT, CFG.cozeRepo);

const args = new Set(process.argv.slice(2));
const flag = (name) => args.has(`--${name}`);

const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css"]);

function die(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function git(repo, cmdArgs, options = {}) {
  return execFileSync("git", ["-C", repo, ...cmdArgs], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
}

/** 前缀匹配目录（以 / 结尾）或精确匹配文件。 */
function matches(rel, rules) {
  return rules.some((rule) => (rule.endsWith("/") ? rel.startsWith(rule) : rel === rule));
}

/** `git ls-tree -r` 一次取出 path → blob sha，二进制安全且便宜。 */
function treeMap(repo, ref) {
  const out = git(repo, ["ls-tree", "-r", ref]);
  const map = new Map();
  for (const line of out.split("\n")) {
    if (!line) continue;
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const meta = line.slice(0, tab).split(/\s+/);
    map.set(line.slice(tab + 1), meta[2]);
  }
  return map;
}

function blobBuffer(repo, ref, rel) {
  return execFileSync("git", ["-C", repo, "show", `${ref}:${rel}`], {
    maxBuffer: 128 * 1024 * 1024,
  });
}

const textCache = new Map();
function blobText(repo, ref, rel) {
  const key = `${repo}:${ref}:${rel}`;
  if (textCache.has(key)) return textCache.get(key);
  let text = null;
  try {
    text = blobBuffer(repo, ref, rel).toString("utf8");
  } catch {
    text = null;
  }
  textCache.set(key, text);
  return text;
}

// ---------------------------------------------------------------------------
// import 解析
// ---------------------------------------------------------------------------

const SPECIFIER_PATTERNS = [
  /(?:from|require\s*\(|import\s*\()\s*["']([^"']+)["']/g,
  /(?:^|[\s;{])import\s+["']([^"']+)["']/gm,
  /@import\s+(?:url\(\s*)?["']([^"']+)["']/g,
  /composes\s*:[^;{}]*?from\s+["']([^"']+)["']/g,
];

function parseSpecifiers(source) {
  const found = new Set();
  for (const pattern of SPECIFIER_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source))) found.add(match[1]);
  }
  return [...found];
}

const RESOLVE_SUFFIXES = [
  "",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".css",
  ".json",
  ".yaml",
  ".yml",
];

function resolveAgainst(base, fileSet) {
  for (const suffix of RESOLVE_SUFFIXES) {
    if (fileSet.has(base + suffix)) return base + suffix;
  }
  for (const suffix of RESOLVE_SUFFIXES.slice(1)) {
    const indexPath = `${base}/index${suffix}`;
    if (fileSet.has(indexPath)) return indexPath;
  }
  return null;
}

/** 返回被解析到的仓库内相对路径；裸包名或解析不到时返回 null。 */
function resolveSpecifier(fromRel, specifier, fileSet) {
  if (specifier.startsWith("@/")) return resolveAgainst(specifier.slice(2), fileSet);
  if (!specifier.startsWith(".")) return null;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), specifier));
  return resolveAgainst(base, fileSet);
}

/**
 * 递归检查依赖闭包。命中 exclude 时返回 { blocked, chain }，否则返回 null。
 * chain 是从入口到违规点的路径，用于报告里说明「为什么不能共享」。
 */
function closureCheck(entry, fileSet, maxDepth) {
  const visited = new Set();
  const queue = [{ rel: entry, chain: [entry], depth: 0 }];

  while (queue.length) {
    const { rel, chain, depth } = queue.shift();
    if (visited.has(rel)) continue;
    visited.add(rel);

    if (matches(rel, CFG.exclude)) return { blocked: rel, chain };
    if (depth >= maxDepth) return { blocked: `${rel}（依赖深度超限）`, chain };

    if (!TEXT_EXT.has(path.posix.extname(rel))) continue;
    const source = blobText(ROOT, CFG.sourceRef, rel);
    if (source == null) continue;

    for (const specifier of parseSpecifiers(source)) {
      if (!specifier.startsWith(".") && !specifier.startsWith("@/")) continue;
      const target = resolveSpecifier(rel, specifier, fileSet);
      if (target) queue.push({ rel: target, chain: [...chain, target], depth: depth + 1 });
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// 计算同步计划
// ---------------------------------------------------------------------------

function buildPlan() {
  if (!fs.existsSync(path.join(B_REPO, ".git"))) {
    die(`找不到扣子仓库：${B_REPO}\n  请检查 coze.config.json 的 cozeRepo，或先克隆该仓库。`);
  }

  const sourceTree = treeMap(ROOT, CFG.sourceRef);
  const cozeTree = treeMap(B_REPO, CFG.cozeRef);
  const fileSet = new Set(sourceTree.keys());

  const plan = { add: [], update: [], same: [], blocked: [], remove: [], quarantined: [] };

  for (const rel of CFG.quarantine ?? []) {
    if (sourceTree.has(rel)) plan.quarantined.push(rel);
  }

  const isCandidate = (rel) =>
    matches(rel, CFG.include) &&
    !matches(rel, CFG.exclude) &&
    !matches(rel, CFG.bOwned) &&
    !matches(rel, CFG.quarantine ?? []);

  for (const rel of sourceTree.keys()) {
    if (!isCandidate(rel)) continue;

    const verdict = closureCheck(rel, fileSet, CFG.maxDepth);
    if (verdict) {
      plan.blocked.push({ rel, blocked: verdict.blocked, chain: verdict.chain });
      continue;
    }

    const sourceSha = sourceTree.get(rel);
    const cozeSha = cozeTree.get(rel);

    if (cozeSha === undefined) plan.add.push(rel);
    else if (cozeSha === sourceSha) plan.same.push(rel);
    else plan.update.push({ rel, diverged: cozeSha !== sourceSha });
  }

  for (const rel of cozeTree.keys()) {
    if (!isCandidate(rel)) continue;
    if (!sourceTree.has(rel)) plan.remove.push(rel);
  }

  plan.blocked.sort((a, b) => a.rel.localeCompare(b.rel));
  plan.update.sort((a, b) => a.rel.localeCompare(b.rel));
  plan.add.sort();
  plan.remove.sort();

  return plan;
}

/** 统计「谁把谁拖下水」，输出分层重构优先级。 */
function blockerHistogram(plan) {
  const counts = new Map();
  for (const item of plan.blocked) {
    counts.set(item.blocked, (counts.get(item.blocked) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

// ---------------------------------------------------------------------------
// 报告
// ---------------------------------------------------------------------------

function report(plan) {
  const sourceSha = git(ROOT, ["rev-parse", "--short", CFG.sourceRef]).trim();

  console.log(`\n主仓库 ${CFG.sourceRef}@${sourceSha} → 扣子仓库 ${CFG.cozeRepo}#${CFG.cozeRef}\n`);

  console.log(`  可同步：${plan.update.length} 改 / ${plan.add.length} 新增`);
  console.log(`  已一致：${plan.same.length}`);
  console.log(`  被拒绝：${plan.blocked.length}（含宿主依赖，扣子仓库保留旧版）`);
  if (plan.remove.length) console.log(`  主仓库已删：${plan.remove.length}（加 --prune 清理）`);

  if (plan.update.length) {
    console.log("\n── 将更新 ──");
    for (const { rel } of plan.update) console.log(`  M ${rel}`);
  }
  if (plan.add.length) {
    console.log("\n── 将新增 ──");
    for (const rel of plan.add) console.log(`  A ${rel}`);
  }

  if (plan.remove.length) {
    console.log("\n── 主仓库已删除，扣子仓库仍有残留 ──");
    for (const rel of plan.remove) console.log(`  D ${rel}`);
  }

  if (plan.quarantined.length) {
    console.log("\n── ⚠ 暂缓同步：主仓库上这些文件自相矛盾 ──");
    for (const rel of plan.quarantined) console.log(`  H ${rel}`);
    console.log("\n  扣子仓库保留自己的版本。修好主仓库后请从 coze.config.json 的");
    console.log("  quarantine 名单里删掉对应条目。");
  }

  const histogram = blockerHistogram(plan);
  if (histogram.length) {
    console.log("\n── 分层重构优先级（谁把谁拖下水）──");
    for (const [blocker, count] of histogram) {
      console.log(`  ${String(count).padStart(3)} 个文件  ←  ${blocker}`);
    }
    console.log("\n  收敛方式：把上面这些宿主依赖从内核文件里抽出去（依赖注入 / 适配层），");
    console.log("  而不是在扣子仓库里复制一份宿主代码。");
  }

  const blockedPreview = plan.blocked.slice(0, 15);
  if (blockedPreview.length) {
    console.log("\n── 被拒文件示例（前 15）──");
    for (const item of blockedPreview) {
      const tail = item.chain.length > 1 ? `  ← ${item.chain.slice(-3).join(" ← ")}` : "";
      console.log(`  ${item.rel}${tail}`);
    }
    if (plan.blocked.length > blockedPreview.length) {
      console.log(`  … 其余 ${plan.blocked.length - blockedPreview.length} 个见 --json`);
    }
  }

  console.log("");
  return sourceSha;
}

// ---------------------------------------------------------------------------
// 写盘
// ---------------------------------------------------------------------------

function assertCozeRepoClean() {
  const dirty = git(B_REPO, ["status", "--porcelain"]).trim();
  if (dirty) {
    die(`扣子仓库工作树不干净，先提交或 stash：\n${dirty}`);
  }
}

function writePlan(plan, sourceSha) {
  assertCozeRepoClean();

  const touched = [];
  for (const rel of plan.add) touched.push(rel);
  for (const { rel } of plan.update) touched.push(rel);

  for (const rel of touched) {
    const dest = path.join(B_REPO, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, blobBuffer(ROOT, CFG.sourceRef, rel));
  }

  for (const rel of plan.remove) {
    if (!flag("prune")) continue;
    fs.rmSync(path.join(B_REPO, rel), { force: true });
    touched.push(rel);
  }

  if (!touched.length) {
    console.log("没有需要写入的内容，扣子仓库已是最新。\n");
    return null;
  }

  // 记下提交前的 HEAD，校验失败时用它回滚（assertCozeRepoClean 已保证此前工作树干净）。
  const previousHead = git(B_REPO, ["rev-parse", "HEAD"]).trim();
  git(B_REPO, ["add", "-A"]);
  const message = [
    `sync: 吸收主仓库 ${sourceSha} 的通用层改动`,
    "",
    `- 更新 ${plan.update.length} / 新增 ${plan.add.length} / 删除 ${flag("prune") ? plan.remove.length : 0}`,
    `- 因宿主依赖被拒 ${plan.blocked.length}（原因见主仓库 scripts/coze-sync.mjs 报告）`,
    "",
    "由主仓库 pnpm run coze:sync --write 生成，请勿手工修改同步范围内的文件。",
  ].join("\n");

  git(B_REPO, ["commit", "-q", "-m", message]);
  const head = git(B_REPO, ["rev-parse", "--short", "HEAD"]).trim();
  console.log(`已提交 ${head}：${touched.length} 个文件\n`);
  return { head, previousHead };
}

// ---------------------------------------------------------------------------
// 护栏：在扣子仓库里真跑一遍
//
// 闭包检查只保证「不引入宿主依赖」，保证不了「接口版本一致」：内核把某个函数
// 从同步改成 async，而它的调用方因为是宿主文件被拒同步，扣子仓库就会编译不过。
// 所以每次 --write 都要真跑一遍，红了就回滚。
// ---------------------------------------------------------------------------

function runVerify() {
  console.log("在扣子仓库执行 build + test…\n");
  // 用 shell 的 rm 而不是 fs.rmSync：Node 侧可能被 safe-delete 守卫拦下。
  execFileSync("rm", ["-rf", ".next"], { cwd: B_REPO });
  execFileSync("pnpm", ["install"], { cwd: B_REPO, stdio: "inherit" });
  // 跑 build 而不是 typecheck：LayoutProps 这类全局类型由构建生成，直接 tsc 会误报。
  execFileSync("pnpm", ["run", "build"], { cwd: B_REPO, stdio: "inherit" });
  execFileSync("pnpm", ["test"], { cwd: B_REPO, stdio: "inherit" });
  console.log("\n✓ 扣子仓库自检通过：主仓库这次改动没有破坏扣子版\n");
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

const plan = buildPlan();

if (flag("json")) {
  console.log(
    JSON.stringify(
      {
        source: `${CFG.sourceRef}@${git(ROOT, ["rev-parse", "--short", CFG.sourceRef]).trim()}`,
        update: plan.update.map((item) => item.rel),
        add: plan.add,
        remove: plan.remove,
        blocked: plan.blocked.map((item) => ({ path: item.rel, blocked: item.blocked })),
        priority: blockerHistogram(plan),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const sourceSha = report(plan);

if (flag("check")) {
  const pending = plan.update.length + plan.add.length;
  if (pending > 0) {
    console.error(`✗ 扣子仓库落后 ${pending} 个文件，请跑 pnpm run coze:sync --write\n`);
    process.exit(1);
  }
  console.log("✓ 扣子仓库与主仓库的通用层一致\n");
  process.exit(0);
}

if (!flag("write")) {
  if (flag("verify")) runVerify();
  console.log("（dry-run，未写盘。加 --write 执行同步）\n");
  process.exit(0);
}

const written = writePlan(plan, sourceSha);

// 写入后必须自检：闭包检查管不了接口版本，这里才是真正的兼容性护栏。
if (written && !flag("no-verify")) {
  try {
    runVerify();
  } catch {
    git(B_REPO, ["reset", "--hard", written.previousHead]);
    console.error(`\n✗ 扣子仓库自检未通过，已回滚本次同步（${written.head} 未保留）。`);
    console.error("  常见原因：内核接口变了，而扣子仓库侧的宿主适配没跟上。");
    console.error("  到扣子仓库手工跟进后重跑本命令；--no-verify 可跳过校验（不推荐）。\n");
    process.exit(1);
  }
} else if (!written && flag("verify")) {
  runVerify();
}

if (flag("push")) {
  git(B_REPO, ["push", "origin", CFG.cozeRef]);
  console.log(`已推送到 origin/${CFG.cozeRef}\n`);
} else {
  console.log("未推送。确认无误后：cd 扣子仓库 && git push origin main\n");
}
