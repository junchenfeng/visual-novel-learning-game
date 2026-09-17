import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  ingestDlcTool,
  jsonText,
  listRosterTool,
  upsertPoetTool,
  upsertWorkTool,
} from "./tools";
import { downloadUsageFilesTool, listMyDlcTool, usageManifestTool } from "./usageTools";

const userIdField = z
  .string()
  .describe("学员 user id，格式 hh学号 或 hh_学号，学号须为当前 L2 在读学员");

export function registerIngestTools(server: McpServer): void {
  server.registerTool(
    "list_roster",
    {
      title: "列出诗人名册",
      description: "查看当前可上传的诗人和篇目。诗人不在名册时必须先 upsert_poet。必须提供本人 userId。",
      inputSchema: z.object({
        userId: userIdField,
      }),
    },
    async (input) => jsonText(await listRosterTool(input)),
  );

  server.registerTool(
    "upsert_poet",
    {
      title: "创建或更新诗人",
      description:
        "诗人不存在时必须先调用本工具。头像须为正方形 png/jpg/webp，边长 512–1024px，不超过 2MB。远程用 portraitBase64，本机 stdio 可用 portraitPath。必须提供本人 userId。",
      inputSchema: z.object({
        userId: userIdField,
        poetId: z.string().describe("诗人 id，小写字母数字下划线短横线，如 sushi"),
        poet: z.string().describe("诗人中文名，须与 DLC manifest.poet 一致"),
        portraitBase64: z.string().optional().describe("头像 base64，可带 data: 前缀"),
        portraitPath: z.string().optional().describe("本机头像文件路径，仅 stdio"),
        portraitMime: z.string().optional(),
      }),
    },
    async (input) => jsonText(await upsertPoetTool(input)),
  );

  server.registerTool(
    "upsert_work",
    {
      title: "给诗人加篇目",
      description: "给已有诗人增加篇目标题。ingest_dlc 通过审核时也会自动加。必须提供本人 userId。",
      inputSchema: z.object({
        userId: userIdField,
        poetId: z.string(),
        workTitle: z.string(),
      }),
    },
    async (input) => jsonText(await upsertWorkTool(input)),
  );

  server.registerTool(
    "ingest_dlc",
    {
      title: "审核并上架 DLC",
      description:
        "提交本人 userId（hh学号 / hh_学号）、诗人、篇目和 zip。按 dlc-spec 机器校验 + Codex 审核。全部通过才入库上架；否则只返回修改意见。",
      inputSchema: z.object({
        userId: userIdField,
        poetId: z.string(),
        workTitle: z.string(),
        zipBase64: z.string().optional().describe("DLC zip 的 base64，上限 30MB"),
        zipPath: z.string().optional().describe("本机 zip 路径，仅 stdio"),
      }),
    },
    async (input) => jsonText(await ingestDlcTool(input)),
  );

  const targetDirField = z
    .string()
    .optional()
    .describe("落盘根目录，默认 assets/user_data；相对调用方仓库根");
  const cacheTtlField = z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("清单缓存毫秒数，默认 60000；传 0 强制刷新");

  server.registerTool(
    "list_my_dlc",
    {
      title: "列出我上架的 DLC",
      description:
        "查看自己已通过审核上架的 DLC（课包），含 dlcId 与试玩地址。导出使用数据前先看这里。必须提供本人 userId。",
      inputSchema: z.object({
        userId: userIdField,
        origin: z.string().optional().describe("站点 origin，用于拼 playUrl；省略则用线上地址"),
      }),
    },
    async (input) => jsonText(await listMyDlcTool(input)),
  );

  server.registerTool(
    "usage_manifest",
    {
      title: "我的 DLC 使用数据清单",
      description:
        "返回自己上架 DLC 的游玩数据清单（对局记录 sessions / 行为事件流 events）。每个文件带相对落盘路径、字节数、更新时间和 sha256。拿它和本机 assets/user_data/ 比对，只下载缺失或变更的文件。必须提供本人 userId。",
      inputSchema: z.object({
        userId: userIdField,
        dlcId: z.string().optional().describe("只导出某一个课包；省略则全部"),
        targetDir: targetDirField,
        cacheTtlMs: cacheTtlField,
      }),
    },
    async (input) => jsonText(await usageManifestTool(input)),
  );

  server.registerTool(
    "download_usage_files",
    {
      title: "下载使用数据文件",
      description:
        "按 usage_manifest 返回的 path 取文件内容。只接受清单里的路径，越权路径整单拒绝。远程返回 base64 由你写盘；本机 stdio 直接写入 targetDir。paths 一次最多 25 个。必须提供本人 userId。",
      inputSchema: z.object({
        userId: userIdField,
        paths: z.array(z.string()).min(1).max(25).describe("usage_manifest 里的 path 列表"),
        targetDir: targetDirField,
        cacheTtlMs: cacheTtlField,
      }),
    },
    async (input) => jsonText(await downloadUsageFilesTool(input)),
  );
}
