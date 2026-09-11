import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/server";
import {
  ingestDlcTool,
  jsonText,
  listRosterTool,
  upsertPoetTool,
  upsertWorkTool,
} from "./tools";

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
}
