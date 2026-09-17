#!/usr/bin/env node
/**
 * 一键增量同步：把自己已上架 DLC 的使用数据拉到本机 assets/user_data/。
 *
 * 用法：
 *   node scripts/usage-sync.mjs --userId hh_1578
 *   node scripts/usage-sync.mjs --userId hh_1578 --dlc sushi-shuidiao-hh_1578
 *   node scripts/usage-sync.mjs --userId hh_1578 --base http://127.0.0.1:5000 --out assets/user_data
 *
 * 流程：GET /api/usage 拿清单 → 和本地文件（含 manifest.json 基线）比对 sha256 →
 * 只 POST 差异路径 → 落盘并更新基线 manifest.json。仅用 Node 标准库。
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const MAX_BATCH = 25;
const DEFAULT_BASE = process.env.PUBLIC_SITE_URL?.trim() || "https://poem.aibeaver.cn";
const DEFAULT_OUT = "assets/user_data";

function parseArgs(argv) {
  const options = { base: DEFAULT_BASE, out: DEFAULT_OUT, userId: "", dlcId: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--userId" && next) {
      options.userId = next;
      i += 1;
    } else if (arg === "--dlc" && next) {
      options.dlcId = next;
      i += 1;
    } else if (arg === "--base" && next) {
      options.base = next;
      i += 1;
    } else if (arg === "--out" && next) {
      options.out = next;
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "用法：node scripts/usage-sync.mjs --userId hh_学号 [--dlc <dlcId>] [--base <url>] [--out assets/user_data]",
      );
      process.exit(0);
    } else {
      fail(`无法识别的参数：${arg}`);
    }
  }
  if (!options.userId.trim()) {
    fail("缺少 --userId，例如：node scripts/usage-sync.mjs --userId hh_1578");
  }
  return options;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function safeRelativePath(value) {
  const normalized = String(value).replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalized.split("/");
  if (!normalized || normalized.includes("..") || segments.some((item) => !item || item === "." || item === "..")) {
    fail(`不安全的落盘路径：${value}`);
  }
  return normalized;
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error || `请求失败：${response.status}`;
    fail(message);
  }
  return payload;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const base = options.base.replace(/\/+$/, "");
  const outRoot = path.resolve(process.cwd(), options.out);

  const manifestUrl = new URL(`${base}/api/usage`);
  manifestUrl.searchParams.set("userId", options.userId);
  if (options.dlcId) {
    manifestUrl.searchParams.set("dlcId", options.dlcId);
  }

  const manifest = await fetchJson(manifestUrl.toString());
  console.log(`清单：${manifest.dlcIds.length} 个课包、${manifest.files.length} 个文件（目标 ${options.out}/）`);

  const needed = [];
  let unchanged = 0;
  for (const file of manifest.files) {
    const relative = safeRelativePath(file.path);
    const localPath = path.join(outRoot, relative);
    if (existsSync(localPath) && sha256(readFileSync(localPath)) === file.sha256) {
      unchanged += 1;
      continue;
    }
    needed.push(relative);
  }

  if (needed.length === 0) {
    writeBaseline(outRoot, manifest);
    console.log(`已是最新：不变 ${unchanged} 个，新增/更新 0 个`);
    return;
  }

  let downloaded = 0;
  for (let i = 0; i < needed.length; i += MAX_BATCH) {
    const batch = needed.slice(i, i + MAX_BATCH);
    const result = await fetchJson(`${base}/api/usage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: options.userId, paths: batch }),
    });
    for (const file of result.files ?? []) {
      const relative = safeRelativePath(file.path);
      const localPath = path.join(outRoot, relative);
      mkdirSync(path.dirname(localPath), { recursive: true });
      const body = Buffer.from(file.contentBase64 ?? "", "base64");
      writeFileSync(localPath, body);
      const actual = sha256(body);
      if (file.sha256 && actual !== file.sha256) {
        console.warn(`注意：${relative} 的实际哈希与清单不一致（源数据在同步期间变动过）`);
      }
      downloaded += 1;
    }
  }

  writeBaseline(outRoot, manifest);
  console.log(`完成：不变 ${unchanged} 个，新增/更新 ${downloaded} 个`);
}

/** 基线只记录「本机确实已有且哈希一致」的文件，作为下次增量比对的依据。 */
function writeBaseline(outRoot, manifest) {
  const files = [];
  for (const file of manifest.files) {
    const localPath = path.join(outRoot, safeRelativePath(file.path));
    if (!existsSync(localPath)) {
      continue;
    }
    const actual = sha256(readFileSync(localPath));
    if (actual !== file.sha256) {
      continue;
    }
    files.push({
      path: file.path,
      dlcId: file.dlcId,
      kind: file.kind,
      player: file.player,
      size: file.size,
      sha256: actual,
    });
  }
  mkdirSync(outRoot, { recursive: true });
  writeFileSync(
    path.join(outRoot, "manifest.json"),
    `${JSON.stringify(
      {
        userId: manifest.userId,
        generatedAt: manifest.generatedAt,
        dlcIds: manifest.dlcIds,
        syncedAt: new Date().toISOString(),
        files,
      },
      null,
      2,
    )}\n`,
  );
}

await main();
