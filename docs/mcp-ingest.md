# poem-dlc-ingest

对方 **agent** 应先读 **https://poem.aibeaver.cn/mcp-how-to**。用户只提供 `userId` 和 DLC 目录，zip 由 agent 打包。YAML 规范：https://poem.aibeaver.cn/dlc-spec

对方 agent 提交 `userId`、诗人、篇目和 DLC zip。先按 [dlc-spec.md](dlc-spec.md) 做机器校验，再用隔离的 Codex（DeepSeek V4.1 Flash，API id `deepseek-flash`）按同一份 spec 写审核意见。**有 blocking 意见就不入库**；全部通过才上架，返回 `playUrl`。

同作者同版本仍覆盖已有课包，不会长出 `.a`。

## 学员认证

每个工具都必须带本人 `userId`：

- 格式：`hh` + 学号，或 `hh_` + 学号（大小写不敏感），例如 `hh11016863`、`hh_11016863`
- 数字部分必须是 **2026 秋智造营 L2 在读学员**学号（名单写在 `src/ingest/l2Students.ts`，从 ai-gallery 在读名单导出）
- 写入课包与 OSS 时统一成 `hh_<学号>`
- 格式不对或不在名单里：返回 **「user id不正确，需要咨询老师」**，不入库

远程 MCP **不用 token**，只靠每个工具里的 `userId` 开门。管理台人工上传不走这套 hh 校验。

## 连接

| 方式 | 地址 |
| --- | --- |
| 远程 Streamable HTTP MCP | `https://poem.aibeaver.cn/mcp` |
| 同源 multipart / JSON | `POST https://poem.aibeaver.cn/api/ingest` |
| 本机 stdio | `pnpm mcp:ingest` |

本机 Cursor 示例（stdio）：

```json
{
  "mcpServers": {
    "poem-dlc-ingest": {
      "command": "pnpm",
      "args": ["mcp:ingest"],
      "cwd": "/path/to/visual-novel-learning-game"
    }
  }
}
```

远程示例：

```json
{
  "mcpServers": {
    "poem-dlc-ingest": {
      "url": "https://poem.aibeaver.cn/mcp"
    }
  }
}
```

## 工具

所有工具都要带 `userId`。

### `list_roster`

当前诗人与篇目。诗人不在名册时不能直接 ingest。

### `upsert_poet`

新建或更新诗人，**必须带头像**。

- `poetId`：小写字母数字下划线短横线，如 `sushi`
- `poet`：中文名，须与 DLC `manifest.poet` 一致
- 头像：正方形 **png / jpg / webp**，边长 **512–1024 px**，体积 **≤ 2MB**
- 远程：`portraitBase64`；本机 stdio 可用 `portraitPath`

诗人头像是公共资源，不要放进 DLC zip。

### `upsert_work`

给已有诗人加篇目。`ingest_dlc` 审核通过时也会自动加。

### `ingest_dlc`

参数：`userId`、`poetId`、`workTitle`，以及 `zipBase64`（远程）或 `zipPath`（本机）。zip ≤ 30MB。

返回：

```json
{
  "verdict": "accept | reject",
  "playUrl": "https://poem.aibeaver.cn/play/...",
  "auditId": "hh_11016863_20260911T102648Z",
  "issues": [
    {
      "severity": "blocking",
      "source": "machine | spec",
      "path": "content/story.yaml",
      "rule": "剧情图规则",
      "message": "系统为什么不能接受",
      "fixHint": "应该怎么改"
    }
  ]
}
```

`source: machine` 来自编译器 / 图检查 / 名册；`source: spec` 来自 Codex 对照 `docs/dlc-spec.md`。改 spec 文档后，下一单审核自动用新规则。

## 留存（audit）

每一次工具调用（含认证失败）按 `userId_timestamp` 写到 OSS，目录：

```
poem-rpg/ingest-audit/hh_11016863_20260911T102648Z/
  query.json         # 工具名、规范化学员、参数（不含 zip/头像 base64，只记体积和 sha256）
  response.json      # 返回给调用方的 verdict / issues / playUrl
  transcript.json    # 若跑了 Codex：prompt、last-message、review.json、stdout
  pack.zip           # ingest_dlc 的原始 zip
  portrait.bin       # upsert_poet 的原始头像
  record.json        # 以上汇总
```

认证失败时目录前缀是 `invalid_<原始userId>_<timestamp>`。一轮 MCP 工具调用对应一份 audit：原始 query 和这次审核对话挂在同一个文件夹。

## HTTP 上传 zip

```bash
curl -sS -X POST https://poem.aibeaver.cn/api/ingest \
  -F userId=hh_11016863 \
  -F poetId=sushi \
  -F workTitle='水调歌头・明月几时有' \
  -F zip=@pack.zip
```

也可以 JSON：`userId`、`poetId`、`workTitle`、`zipBase64`。

## Codex

审核走 `scripts/codex-exec.sh`，配置在仓库 `codex-home/`（与 `~/.codex`、ai-gallery 批改工位隔离）。密钥从 `DEEPSEEK_API_KEY` 或 ai-gallery `config.json` 的 `llm` deepseek `api-key` 读取。模型：`deepseek-flash`。

Codex 挂掉时，机器意见照样返回，并多一条 blocking「审核引擎不可用」，**不会静默放行**。
