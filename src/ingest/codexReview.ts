import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { ReviewIssue } from "./issues";
import { machineIssue } from "./issues";

export const CODEX_MODEL = "deepseek-flash";
const CODEX_TIMEOUT_MS = 180_000;
const STDOUT_CAP = 200_000;
const LAST_MESSAGE_CAP = 100_000;

export type CodexTranscript = {
  model: string;
  prompt: string;
  lastMessage?: string;
  reviewJson?: unknown;
  stdout?: string;
  error?: string;
};

export type SpecReviewOutcome = {
  issues: ReviewIssue[];
  transcript?: CodexTranscript;
};

function repoRoot(): string {
  return process.cwd();
}

function specPath(): string {
  return path.join(repoRoot(), "docs", "dlc-spec.md");
}

function execScript(): string {
  return path.join(repoRoot(), "scripts", "codex-exec.sh");
}

const TASK_MD = `你是诗词穿越游戏的 DLC 审核员。

当前 workspace 里只有这些输入，已经够用：
- SPEC.md：唯一规则
- MACHINE_ISSUES.json：机器已经报过的问题
- FILE_LIST.txt：pack/ 内全部相对路径（已列全，不要再搜）
- pack/：学员 DLC

只根据 SPEC.md 检查 pack/ 里的 YAML，以及 FILE_LIST.txt 里的资源路径是否对得上。
禁止发明玩法、禁止要求 SPEC 没写的字段、禁止改写教学目标。

硬性禁止（违反即失败）：
- 禁止 find、locate、grep -R、fd、rg 扫盘
- 禁止 ls /、ls /tmp、ls /root、ls /home，禁止进入 workspace 以外的任何目录
- 禁止读 /tmp、/root、仓库 git、其它学员目录、历史对局
- 禁止 rm、mv、chmod、git、curl、wget、ssh、kill
- 禁止为了「找 review.json」满盘乱翻；它还不存在，由你现在写出来
- 禁止改 pack/ 里的任何文件

先读 MACHINE_ISSUES.json。机器已经报过的问题不要原样重复，除非 SPEC 能给出更具体的改法。

读完立刻在 workspace 根目录写 review.json，然后停止，不要再跑命令验证。格式必须是：

{
  "issues": [
    {
      "severity": "blocking" 或 "warning",
      "path": "相对 pack 的文件路径，例如 content/story.yaml",
      "rule": "SPEC.md 里的小节或字段名",
      "message": "用中文说明系统为什么不能接受",
      "fixHint": "用中文说明应该怎么改"
    }
  ]
}

没有问题时 issues 为空数组。不要输出其它文件当最终结论。
`;

function asIssues(value: unknown): ReviewIssue[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  const issues = (value as { issues?: unknown }).issues;
  if (!Array.isArray(issues)) {
    return [];
  }
  const result: ReviewIssue[] = [];
  for (const item of issues) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const message = String(record.message ?? "").trim();
    if (!message) {
      continue;
    }
    result.push({
      severity: record.severity === "warning" ? "warning" : "blocking",
      source: "spec",
      path: String(record.path ?? "").trim() || undefined,
      rule: String(record.rule ?? "dlc-spec").trim() || "dlc-spec",
      message,
      fixHint: String(record.fixHint ?? "").trim() || undefined,
    });
  }
  return result;
}

export function ingestCodexWorkspace(tempRoot: string): string {
  return path.join(tempRoot, "codex-job");
}

function copyPackIntoWorkspace(packRoot: string, dest: string): void {
  mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(packRoot)) {
    if (name === "codex-job") {
      continue;
    }
    cpSync(path.join(packRoot, name), path.join(dest, name), { recursive: true });
  }
}

function listPackFiles(root: string, current = root): string[] {
  const names = readdirSync(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of names) {
    if (entry.name === "codex-job") {
      continue;
    }
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) {
      files.push(...listPackFiles(root, full));
      continue;
    }
    files.push(path.relative(root, full).split(path.sep).join("/"));
  }
  return files.sort((a, b) => a.localeCompare(b));
}

export function writeCodexWorkspace(options: {
  workspace: string;
  packRoot?: string;
  machineIssues: ReviewIssue[];
}): void {
  mkdirSync(options.workspace, { recursive: true });
  copyFileSync(specPath(), path.join(options.workspace, "SPEC.md"));
  writeFileSync(path.join(options.workspace, "TASK.md"), TASK_MD);
  writeFileSync(
    path.join(options.workspace, "MACHINE_ISSUES.json"),
    `${JSON.stringify(options.machineIssues, null, 2)}\n`,
  );
  if (options.packRoot && existsSync(options.packRoot)) {
    copyPackIntoWorkspace(options.packRoot, path.join(options.workspace, "pack"));
    writeFileSync(
      path.join(options.workspace, "FILE_LIST.txt"),
      `${listPackFiles(options.packRoot).join("\n")}\n`,
    );
  } else {
    writeFileSync(path.join(options.workspace, "FILE_LIST.txt"), "");
  }
}

export async function runCodexSpecReview(options: {
  packRoot?: string;
  machineIssues: ReviewIssue[];
  workspace?: string;
}): Promise<SpecReviewOutcome> {
  if (!options.packRoot || !existsSync(options.packRoot)) {
    return { issues: [] };
  }
  const workspace = options.workspace ?? ingestCodexWorkspace(options.packRoot);
  writeCodexWorkspace({
    workspace,
    packRoot: options.packRoot,
    machineIssues: options.machineIssues,
  });
  if (!existsSync(execScript())) {
    const issues = [
      machineIssue("审核引擎不可用：找不到 scripts/codex-exec.sh", {
        rule: "审核引擎",
        fixHint: "请稍后重试，或联系站点管理员检查 Codex",
      }),
    ].map((issue) => ({ ...issue, source: "spec" as const }));
    return {
      issues,
      transcript: readTranscript(workspace, { error: "missing scripts/codex-exec.sh" }),
    };
  }

  let stdout = "";
  try {
    const spawned = await spawnCodex(workspace);
    stdout = spawned.stdout;
  } catch (error) {
    const spawned = error as { stdout?: string; stderr?: string };
    stdout = spawned.stdout ?? stdout;
    const recovered = readReviewJson(workspace);
    if (recovered) {
      return {
        issues: asIssues(recovered),
        transcript: readTranscript(workspace, { stdout, reviewJson: recovered }),
      };
    }
    return {
      issues: [
        {
          severity: "blocking",
          source: "spec",
          rule: "审核引擎",
          message: `审核引擎不可用，请稍后重试。${error instanceof Error ? error.message : ""}`.trim(),
          fixHint: "机器校验结果仍然有效；修好 YAML 后可再提交",
        },
      ],
      transcript: readTranscript(workspace, {
        stdout,
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }

  const reviewJson = readReviewJson(workspace);
  if (!reviewJson) {
    const reviewFile = path.join(workspace, "review.json");
    return {
      issues: [
        {
          severity: "blocking",
          source: "spec",
          rule: "审核引擎",
          message: existsSync(reviewFile)
            ? "审核引擎返回的 review.json 无法解析，请稍后重试"
            : "审核引擎没有写出 review.json，请稍后重试",
        },
      ],
      transcript: readTranscript(workspace, {
        stdout,
        error: existsSync(reviewFile) ? "invalid review.json" : "missing review.json",
      }),
    };
  }
  return {
    issues: asIssues(reviewJson),
    transcript: readTranscript(workspace, { stdout, reviewJson }),
  };
}

function readReviewJson(workspace: string): unknown | null {
  const reviewFile = path.join(workspace, "review.json");
  if (!existsSync(reviewFile)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(reviewFile, "utf8"));
  } catch {
    return null;
  }
}

function readTranscript(
  workspace: string,
  extras: { stdout?: string; error?: string; reviewJson?: unknown } = {},
): CodexTranscript {
  const lastPath = path.join(workspace, "last-message.txt");
  const reviewPath = path.join(workspace, "review.json");
  let reviewJson = extras.reviewJson;
  if (reviewJson === undefined && existsSync(reviewPath)) {
    try {
      reviewJson = JSON.parse(readFileSync(reviewPath, "utf8"));
    } catch {
      reviewJson = readFileSync(reviewPath, "utf8").slice(0, 20_000);
    }
  }
  return {
    model: CODEX_MODEL,
    prompt: TASK_MD,
    lastMessage: existsSync(lastPath)
      ? readFileSync(lastPath, "utf8").slice(0, LAST_MESSAGE_CAP)
      : undefined,
    reviewJson,
    stdout: extras.stdout?.slice(0, STDOUT_CAP),
    error: extras.error,
  };
}

function spawnCodex(workspace: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      execScript(),
      [
        "--json",
        "-C",
        workspace,
        "-m",
        CODEX_MODEL,
        "-s",
        "workspace-write",
        "-o",
        path.join(workspace, "last-message.txt"),
        "-",
      ],
      {
        cwd: workspace,
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    let settled = false;
    const fail = (message: string) => {
      if (settled) {
        return;
      }
      settled = true;
      const error = new Error(message) as Error & { stdout?: string; stderr?: string };
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    };
    const succeed = (value: { stdout: string; stderr: string }) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (stdout.length > STDOUT_CAP) {
        stdout = `${stdout.slice(0, STDOUT_CAP)}\n…truncated`;
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.stdin.on("error", () => {
      // 进程可能已退出，忽略 EPIPE
    });
    child.stdin.end(readFileSync(path.join(workspace, "TASK.md"), "utf8"));
    const stopWatching = () => {
      clearTimeout(timer);
      clearInterval(poll);
    };
    const acceptWrittenReview = () => {
      if (!readReviewJson(workspace)) {
        return false;
      }
      child.kill("SIGTERM");
      succeed({ stdout, stderr });
      return true;
    };
    const timer = setTimeout(() => {
      if (acceptWrittenReview()) {
        stopWatching();
        return;
      }
      child.kill("SIGTERM");
      fail(`codex exec 超时 ${CODEX_TIMEOUT_MS}ms: ${stderr.slice(-400)}`);
    }, CODEX_TIMEOUT_MS);
    const poll = setInterval(() => {
      if (acceptWrittenReview()) {
        stopWatching();
      }
    }, 1000);
    child.on("error", (error) => {
      stopWatching();
      fail(error.message);
    });
    child.on("close", (code) => {
      stopWatching();
      if (readReviewJson(workspace)) {
        succeed({ stdout, stderr });
        return;
      }
      if (code !== 0) {
        fail(`codex exec 退出码 ${code}: ${stderr.slice(-400)}`);
        return;
      }
      succeed({ stdout, stderr });
    });
  });
}

export const specReviewerUnavailable: typeof runCodexSpecReview = async () => ({
  issues: [
    {
      severity: "blocking",
      source: "spec",
      rule: "审核引擎",
      message: "审核引擎不可用，请稍后重试",
    },
  ],
});
