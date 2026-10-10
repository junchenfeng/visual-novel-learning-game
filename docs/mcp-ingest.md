# poem-dlc-ingest

对方 **agent** 应先读 **https://poem.aibeaver.cn/mcp-how-to**。用户只提供 `userId` 和 DLC 目录，zip 由 agent 打包。YAML 规范：https://poem.aibeaver.cn/dlc-spec

对方 agent 提交 `userId`、诗人、篇目和 DLC zip。先按 [dlc-spec.md](dlc-spec.md) 做机器校验，再用隔离的 Codex（DeepSeek V4.1 Flash，腾讯云 TokenHub，模型 id `deepseek-v4.1-flash`）按同一份 spec 写审核意见。**有 blocking 意见就不入库**；全部通过才上架，返回 `playUrl`。

线上课包 id 是 `{manifest.id}-{userId}`。同一学员同一 short-id 覆盖自己的包；教学模板 short-id 相同也不会互相覆盖，更不会盖掉仓库课包。

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
| 对账：我已上架的课包与版本（同源 HTTP） | `GET https://poem.aibeaver.cn/api/my-dlc?userId=hh_学号` |
| 名册：诗人 / 篇目、建诗人+头像（同源 HTTP） | `GET` / `POST https://poem.aibeaver.cn/api/roster` |
| 本机 stdio | `pnpm mcp:ingest` |
| 使用数据清单 / 下载（同源 HTTP） | `GET` / `POST https://poem.aibeaver.cn/api/usage` |

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

**名册是查询用的参照，不是待办清单**：它列出的篇目**不代表**调用方要提交的对象。提交 / 审核的范围由调用方本地 `dlc/` 下真实存在的包决定 —— 本地没有的作品，即使名册已登记、线上已有，也不要替学员新建或补做。

### `upsert_poet`

新建或更新诗人，**必须带头像**。

- `poetId`：小写字母数字下划线短横线，如 `sushi`
- `poet`：中文名，须与 DLC `manifest.poet` 一致
- 头像：正方形 **png / jpg / webp**，边长 **512–1024 px**，体积 **≤ 2MB**
- 远程：`portraitBase64`；本机 stdio 可用 `portraitPath`

诗人头像是公共资源，不要放进 DLC zip。

### `upsert_work`

给已有诗人加篇目。`ingest_dlc` 审核通过时也会自动加。

### `get_ingest_job`

参数：本人 `userId` 和 `jobId`。只返回该学员自己的任务。`queued/running` 时按 `pollAfterMs` 等待；`completed` 后读取 `result.verdict/issues/playUrl`；`failed` 后先对账再重试。结果保留 7 天，过期或无权限都返回 not_found。HTTP 等价接口为 `GET /api/ingest?userId=...&jobId=...`，查询成功是 200，与审核 verdict 无关。

### `ingest_dlc`

参数：`userId`、`poetId`、`workTitle`，以及 `zipBase64`（远程）或 `zipPath`（本机）。zip ≤ 30MB。

生产 PM2 配置启用异步：提交只入持久化队列，返回 `{jobId, status, pollAfterMs}`（HTTP 202），使用 get_ingest_job 查询最终结果。队列满返回 queue_full（HTTP 429）。没有 jobId 的直接拒绝不会入队。未开启 `INGEST_ASYNC_ENABLED=1` 的本机 stdio / 旧部署保留同步兼容。

最终结果（异步模式在 `result` 中，同步模式直接返回）：

```json
{
  "verdict": "accept | skip | reject",
  "reason": "版本 1.2.0 与内容指纹均未变化：线上保持原样，未重新审核",
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

**同步兼容模式的 `verdict` 三态与 HTTP 码**：`accept`（本轮上架）与 `skip` 都是 **200**；只有 `reject` 是 **400**（400 的语义是「按 issues 改 YAML 再来」）。

`skip` = 与线上那份**「版本 + 内容指纹」都相同**，服务端什么都没做（不跑 Codex、不写 OSS、不动上传索引），线上保持原样并带上 `reason`。判据是 `manifest.version` 与包内容指纹（解压后**原始**目录的 sha256 —— 不能对 zip 字节算，重打包会变；也不能对编译产物算，发布侧会先 png→webp）同时相等。**老上传索引条目没有指纹字段，一律照常重新审核**，发布后自动补上指纹。

## 使用数据回传

同一台 MCP 上还有一组面向学员的「拿回自己 DLC 使用数据」工具，同样只认 `userId`：

- `list_my_dlc`：列出自己已上架的课包。
- `usage_manifest`：返回使用数据清单（sessions / events），带落盘路径、字节数与 sha256。
- `download_usage_files`：按清单 path 取内容，返回 `contentBase64` 由调用方写盘到 `assets/user_data/`。

只导出「课包归属人是本人」的数据，越权路径整单拒绝。完整操作说明（含增量算法）：https://poem.aibeaver.cn/mcp-usage ，文档在 [mcp-usage.md](mcp-usage.md)。

## 留存（audit）

同步工具调用及 worker 完成的审核（含认证失败）按 `userId_timestamp` 写到 OSS，目录：

```
poem-rpg/ingest-audit/hh_11016863_20260911T102648Z/
  query.json         # 工具名、规范化学员、参数（不含 zip/头像 base64，只记体积和 sha256）
  response.json      # 返回给调用方的 verdict / issues / playUrl
  transcript.json    # 若跑了 Codex：prompt、last-message、review.json、stdout
  pack.zip           # ingest_dlc 的原始 zip
  portrait.bin       # upsert_poet 的原始头像
  record.json        # 以上汇总
```

认证失败时目录前缀是 `invalid_<原始userId>_<timestamp>`。worker 的审计目录在时间戳后附加唯一 jobId，并在 record.json 留存 jobId，避免同一学员同秒完成多单互相覆盖。异步受理先写 SQLite 持久化任务记录，worker 执行时写上述 OSS 审计；状态轮询只读任务记录，不反复写 OSS。原始 query 和这次审核对话挂在同一个文件夹。

## HTTP 上传 zip

```bash
curl -sS -X POST https://poem.aibeaver.cn/api/ingest \
  -F userId=hh_11016863 \
  -F poetId=sushi \
  -F workTitle='水调歌头・明月几时有' \
  -F zip=@pack.zip
```

也可以 JSON：`userId`、`poetId`、`workTitle`、`zipBase64`。

提交前对账、确认哪些包不用重传：

```bash
curl -sS "https://poem.aibeaver.cn/api/my-dlc?userId=hh_11016863"
# → { userId, nickname, dlcs: [{ dlcId, poetId, workTitle, version, uploadedAt, playUrl }] }
```

版本一致、内容也没动过的包可以不传；传了也不会重复上架 —— 服务端会返回 `verdict: "skip"`。

## HTTP 名册（`list_roster` / `upsert_poet` 的同源等价物）

新诗人不必依赖 MCP 客户端，HTTP 侧同样能建：

```bash
# 看诗人与篇目
curl -sS "https://poem.aibeaver.cn/api/roster?userId=hh_11016863"

# 建 / 更新诗人（含头像）
curl -sS -X POST https://poem.aibeaver.cn/api/roster \
  -F userId=hh_11016863 \
  -F poetId=dufu \
  -F poet=杜甫 \
  -F portrait=@dufu.webp
```

JSON 形式：`{ userId, poetId, poet, portraitBase64, portraitMime? }`（`portraitBase64` 可带 `data:` 前缀）。头像会被转成 webp 落到 `${STATIC_OSS_PREFIX}/poets/{poetId}.webp`；不合格（非正方形、边长不在 512–1024px、超 2MB、非 png/jpg/webp）返回 400 + `issues`。`upsert_work` 没有 HTTP 端点：篇目不在名册时 `POST /api/ingest` 通过审核会自动加。

## Codex

审核走 `scripts/codex-exec.sh`，配置在仓库 `codex-home/`（与 `~/.codex`、ai-gallery 批改工位隔离）。模型接入与 ai-gallery 同口径走**腾讯云 TokenHub**：密钥取 `TOKENHUB_API_KEY`，否则读 ai-gallery `config.json` 的 `llm` 里 `name=tokenhub`（或任意一条带 `api-key`）的条目。模型：`deepseek-v4.1-flash`（catalog 见 `codex-home/model-catalog.tokenhub.json`）。

Codex 挂掉时，机器意见照样返回，并多一条 blocking「审核引擎不可用」，**不会静默放行**。

### 评审耗时分解（codex 内部走了哪一步）

每次评审都会把 `transcript.metrics` 写进 audit（`record.json` / `transcript.json`），同时向 worker / Web 日志打一行 `ingest_codex_metrics`：

- `startupMs`：CLI 启动到 `thread.started` / `turn.started`
- `thinkMs` / `toolMs`：模型侧累计时间 / shell 命令累计时间（按事件到达时刻切段）
- `reasoning` / `commands` / `agentMessages`：推理完成次数、命令次数、最终消息数
- `segments`：逐段事件时间线（**超时被 SIGTERM 杀掉时这是唯一的现场证据**）
- `commands`：命令原文（正常只有两条：一次批量读材料、一次写 `review.json`）

2026-10-10 实测经验值：CLI 启动 ~0.5s、shell 命令合计 <200ms、**其余全是模型侧**。
小请求基线（`./scripts/codex-exec.sh '只回复：OK'`）稳定 12–13s ⇒ provider 侧有十几秒固定开销；
真实评审正常 80–200s，偶发「`turn.started` 之后 240s 一个事件都没有」（`stdoutBytes≈252`）⇒ 上游没回数据，
除了超时兜底（`CODEX_TIMEOUT_MS`）本地无可优化空间。

本机复现一次（用 e2e 验证集里钉死的学员包，走与线上相同的评审路径）：

```bash
pnpm probe:codex-review 望岳      # 打印上面的全部指标
```

## 发布验证集（e2e）

发布后**必须**跑一遍（本机执行，走线上 MCP 全链路）：

```bash
pnpm poem-dlc-review-e2e-test              # 5 个用例：望岳 / 赋得古原草送别 / 池上 / 水调歌头×2
pnpm poem-dlc-review-e2e-test --dry-run    # 只校验 fixture 与 MCP 握手（不发包）
pnpm poem-dlc-review-e2e-test --case 望岳 --json
```

- 素材是 5 份**已上架学员包**，钉死在 OSS `poem-rpg/ingest-audit/<canonical>_<ts>/pack.zip`（学员包不进 git）；每条都取「该 slot 被 accept 的那次提交」，`assertFixtureRecord` 会校验。
- 提交身份是 e2e 专用学员 `hh_0000000`…`hh_0000004`（`src/ingest/l2Students.ts` 末尾，昵称「e2e验证」，一个用例一个身份以避开同 short id 的槽位冲突）。用例发布到独立 dlcId（`<shortId>-hh_000000X`），**不碰学生线上包**；这些提交会以「e2e验证」出现在管理台/预览台，属预期。
- 每轮把包内 `manifest.version` 改写成 `<原值>+e2e.<时间戳>`：版本与内容指纹都变了，`shouldSkipReview` 不会命中，**Codex 一定跑**（否则第二次起会被 skip 短路，等于没验）。
- 判定口径：`verdict=accept`、issues 里**没有 `rule=审核引擎`**、单例耗时 < 300s（Nginx `proxy_read_timeout 330s` 是天花板）、dlcId 与 `list_my_dlc` 对账一致。命中「审核引擎」＝引擎故障（凭据 / 超时），**不是学员 YAML 问题**，按上面的 Codex 段落排查。
- 个别用例（`expect: "either"`，如《池上》）会被审核员审出**真实内容问题**（它指出 gameOver 文案把矛头指向家长）。这种结论随模型浮动，且不属于「引擎坏没坏」，所以只断言「不是引擎故障」；`accept` 与「内容 reject」都算通过，报告里会打出来。新增用例若内容不稳，照此标注并写 `note` 说明原因。
- **不进日常 `pnpm test`**（jest 只扫 `tests/`）；只在发布验证与故障排查时手动跑。

排查与善后（同样本机执行）：

```bash
pnpm ingest:ops verify-slots [userId...]        # 只读核对预览台状态 + 最近一次提交的 issues / transcript.error
pnpm ingest:ops rereview-failed --dry-run       # 列出「最近一次失败是引擎事故」、可重跑的单子
pnpm ingest:ops rereview-failed                 # 按 audit 里留存的原 zip 重跑（用学员自己的 userId）
```

## Agent 与运行指标

仍使用隔离 Codex + 可修改的 TASK/SPEC，并保留 shell 工具。规则、机器问题、资源清单与 YAML 一次内联到提示，减少逐个 cat 的模型往返；超过 256 KiB 的 YAML 明确列入 deferredYamlPaths，由 agent 按需读取，绝不静默截断。机器 blocking 先返回修正意见，不再消耗一轮 agent。

worker 输出 JSON `ingest_stage` / `ingest_job_finished`，以 jobId 关联；最终任务包含 timings：queueMs、workspaceMs、machineMs、agentMs、rosterMs、publishMs、imagesMs、uploadAssetsMs、previewMs、auditMs、processingMs、totalMs。缺失阶段表示没执行；嵌套阶段不可直接相加。
agentFirstEventMs 是 Codex 首个事件（可能只是 thread.started），不是模型首 token；agentFirstMessageMs 是首条 agent_message。agentCommandCount / agentCommandsMs 记录已完成 shell 次数及观察到的执行时间，usage 仅在 CLI 输出时记录。提前取得 review.json 后结束 agent，usage 可能缺失。
