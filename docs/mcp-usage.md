# poem-dlc-usage：拿回自己 DLC 的使用数据

永久地址：https://poem.aibeaver.cn/mcp-usage  
MCP 地址：https://poem.aibeaver.cn/mcp  
提交课包：https://poem.aibeaver.cn/mcp-how-to

你的任务是帮学员把**自己已上架 DLC 被别人游玩产生的数据**拉回本机，默认落到 `assets/user_data/`，并且只拉新增或变更的文件。

## 向用户只要这一样

1. **userId**：`hh` + 学号，或 `hh_` + 学号，例如 `hh_11016863` / `hh11016863`

不要向用户要 token；不要问要哪个课包（先 `list_my_dlc` 列出来给他挑）。

## 能拿到什么

- **对局记录**（sessions）：别人玩这个课包时留下的完整轨迹（故事路径、选择、课堂作答、事件）。
- **行为事件流**（events）：按课包过滤后的事件日志。

拿不到的东西：你自己玩别家课包的记录、别人课包的任何数据。工具会严格按「课包归属人 = 本人」过滤，越权路径整单拒绝。

## 连接 MCP

```json
{
  "mcpServers": {
    "poem-dlc-ingest": {
      "url": "https://poem.aibeaver.cn/mcp"
    }
  }
}
```

每个工具调用都必须带学员 `userId`。格式不对或不在 L2 在读名单，工具会返回「user id不正确，需要咨询老师」，此时停止并向老师求助。

## 工具

### `list_my_dlc`

列出自己已上架、未被隐藏的 DLC，返回 `dlcId`、诗人、篇目与试玩地址。作为导出入口。

```json
{ "name": "list_my_dlc", "arguments": { "userId": "hh_学号" } }
```

### `usage_manifest`

返回使用数据清单。每个文件带：

```json
{
  "path": "sushi-shuidiao-hh_1578/sessions/player-1a2b3c4d-s-20260913-abcdefgh.json",
  "source": "poem-rpg/小马/sessions/s-20260913-abcdefgh.json",
  "dlcId": "sushi-shuidiao-hh_1578",
  "kind": "session",
  "player": "小马",
  "size": 4821,
  "updatedAt": "2026-09-13T01:00:00.000Z",
  "sha256": "…"
}
```

- `path` 是相对落盘根目录（默认 `assets/user_data/`）的稳定路径：同一份数据每次都是同一个 path。
- `sha256` 用来判断本地那份要不要更新。
- 只想导出一个课包时传 `dlcId`。

### `download_usage_files`

按清单里的 `path` 取内容。

- 只接受 `usage_manifest` 返回过的 path；出现不认识/不属于自己的 path，整单拒绝。
- 一次最多 25 个文件。
- 远程 MCP：返回 `contentBase64`，由你写盘。
- 本机 stdio（`pnpm mcp:ingest`）：直接写入 `targetDir`（默认 `assets/user_data/`），返回 `transport: "stdio"` 与已写文件列表。

## 增量算法（照做）

1. 调 `usage_manifest`，拿到 `files`。
2. 逐条对比本机 `assets/user_data/<path>`：
   - 文件不存在 → 需要下载；
   - 文件存在但 sha256 与清单不同 → 需要下载；
   - sha256 一致 → 跳过。
3. 把「需要下载」的 path 按每批 ≤ 25 个调用 `download_usage_files`。
4. 写盘（远程形态）时保持 `path` 原样，不要改文件名，否则下次增量会重复下载。
5. 更新基线：把 `assets/user_data/manifest.json` 写成「本机确实已有且哈希一致」的清单，作为下次比对依据。

一条命令跑完整个流程（Node 标准库，无需装依赖）：

```bash
node scripts/usage-sync.mjs --userId hh_学号
# 或
pnpm usage:sync -- --userId hh_学号
```

可选参数：`--dlc <dlcId>` 只同步一个课包；`--base <url>` 换站点（本机 `http://127.0.0.1:5000`）；`--out <dir>` 换落盘目录。

## 落盘目录

```text
assets/user_data/
  manifest.json                      # 上次同步基线（本机文件 + sha256）
  <dlcId>/
    sessions/<玩家 slug>-<对局 id>.json
    events/<玩家 slug>.json
```

`<玩家 slug>` 是游玩者用户名的稳定转义（ASCII 前缀 + 内容哈希），中文名也能安全落盘；原名见清单里的 `player` 字段。`assets/` 已被 `.gitignore` 忽略，不会污染提交。

## 同源 HTTP 通道

不想走 MCP 时，可直接打同源接口：

```bash
# 清单
curl -sS "https://poem.aibeaver.cn/api/usage?userId=hh_学号"

# 取内容
curl -sS -X POST https://poem.aibeaver.cn/api/usage \
  -H 'Content-Type: application/json' \
  -d '{"userId":"hh_学号","paths":["<dlcId>/sessions/<...>.json"]}'
```

## 留存（audit）

每次工具调用（含认证失败）同样按 `userId_timestamp` 写到 OSS：

```
poem-rpg/ingest-audit/hh_11016863_20260911T102648Z/
  query.json      # 工具名、规范化学员、参数（下载类只记 paths 与条数，不记文件正文）
  response.json   # 返回给调用方的清单 / 文件元信息
  record.json     # 以上汇总
```

## 禁止

- 伪造或借用别人的 userId
- 请求不属于清单的 path，或改路径去够别人的课包
- 改本地文件名后再增量同步
- 把导出的对局数据再上传成 DLC
