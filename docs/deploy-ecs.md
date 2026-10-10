# ECS 独立发布（poem.aibeaver.cn）

课堂教学继续用 `coze-demo` 分支 + 扣子沙盒，见 [coze-dev.md](coze-dev.md)。  
公网站点只跑 `main`：同一台 ECS 上**另起** PM2 进程，**不要**挂到 ai-gallery 的路径下。

## 本机直达（开发环境已配好）

登录信息在**开发环境**里，不在仓库：

| 项 | 值 |
| --- | --- |
| SSH 别名 | `aliyun-ecs`（`~/.ssh/config` → `47.121.121.244`，密钥登录，用户 `root`） |
| 登录 | `ssh aliyun-ecs` |
| 仓库 | `/root/visual-novel-learning-game`（分支 `main`） |
| 进程 | PM2 应用名 `poem-rpg`（id 5），`next start` 监听 `127.0.0.1:3010` |
| 同机其它应用 | `gemini-app-gallery*` 占 **3000**（ai-gallery）。**别动它们**：不改端口、不 `pm2 delete`、不动 `/root/ai-gallery` |

三条容易踩的：

- 首次远程命令会打印 post-quantum key exchange 警告 —— 服务器 OpenSSH 版本旧，可忽略。
- `deploy:build` 里 `sync:cdn` 会打印「未设置 CDN_BASE_URL，仅写入 OSS」：该变量在 `scripts/sync-static-to-oss.ts` 里**只用于那句日志**，不影响上传；构建期 CDN 前缀由 Next 读 `.env.production`。判断有没有生效看页面里有没有 `cdn.aibeaver.cn`，别看这行日志。
- 本机 `pnpm run dev` 起的是 `scripts/dev-preview.mjs`，公开端口取 `DEPLOY_RUN_PORT`（默认 3000，被占就换，如 `DEPLOY_RUN_PORT=5100 pnpm run dev`）。**生产不用它**，也没有它的地址。

## 常用地址

| 用途 | 地址 |
| --- | --- |
| 主站 | https://poem.aibeaver.cn/ |
| 本机上游（绕过 Nginx，排查用） | http://127.0.0.1:3010/ |
| 补丁入口 / 各补丁 | `/patch`、`/patch-1`、`/patch-2` |
| YAML 规范 | `/dlc-spec` |
| MCP 接入说明 / 使用数据回传 | `/mcp-how-to`、`/mcp-usage` |
| MCP 端点 | `https://poem.aibeaver.cn/mcp`（不用 token，工具参数带 `userId`） |
| 同源 HTTP | `POST /api/ingest`（上传）、`GET /api/my-dlc`（我已上架课包 + 版本，提交前对账）、`GET\|POST /api/roster`（诗人名册 / 建诗人+头像）、`GET\|POST /api/usage`（清单 / 下载） |
| CDN 静态资源 | `https://cdn.aibeaver.cn/poem-rpg/static/...` |
| 管理台 | 首页用户名填 `nova-admin`，密码见服务器 `.env.production` 的 `POEM_ADMIN_PASSWORD` |

补丁与规范页的正文是**运行时读仓库里的 markdown**（`src/server/markdownDoc.ts`），所以改 `docs/patch*.md` 也要走一次「更新」才生效，光 commit 不算。

## 常用命令

以下都在本机执行，远程工作目录固定 `/root/visual-novel-learning-game`。

**看状态与日志**

```bash
ssh aliyun-ecs 'pm2 list'
ssh aliyun-ecs 'pm2 describe poem-rpg | head -20'
ssh aliyun-ecs 'cd /root/visual-novel-learning-game && tail -50 logs/err.log'      # PM2 error_file
ssh aliyun-ecs 'tail -50 /root/.pm2/logs/poem-rpg-out.log'
```

**看线上版本**（= 服务器上的 git HEAD，没有别的版本号）

```bash
ssh aliyun-ecs 'cd /root/visual-novel-learning-game && git log --oneline -1 && git status --porcelain | head'
```

只应看到 `codex-home/*.sqlite*` 这类未跟踪的运行时文件；出现 tracked 的 `M` 就先查清楚，别硬 pull。

**发布**：见下面「更新」。
**重启**（已授权，见「授权边界」）：

```bash
ssh aliyun-ecs 'pm2 restart poem-rpg'
```

**回滚到某个 sha**

```bash
ssh aliyun-ecs 'cd /root/visual-novel-learning-game && git fetch origin && git checkout <sha> && pnpm run deploy:build && pm2 restart poem-rpg'
```

回滚后是 detached HEAD，下次发布前记得 `git checkout main && git pull origin main`。

**探活三连**

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://poem.aibeaver.cn/
curl -sS -o /dev/null -w '%{http_code}\n' https://poem.aibeaver.cn/patch-2
curl -sSI https://cdn.aibeaver.cn/poem-rpg/static/portraits/teacher.webp | head -1
```

## 授权边界

- ✅ **重启 PM2**（`pm2 restart poem-rpg`）：用户已授权，agent **不必**再问人。
- ✅ 只读侦察（`pm2 list/describe`、读日志、`git log/status`、`curl` 探活）：直接做。
- ⛔ 仍要人工确认：改 DNS / Nginx / `.env.production`、改端口或 `pm2 delete`、动 `/root/ai-gallery/config.json` 的 OSS/LLM 凭证、`git push`、以及回滚到旧 sha 之外的数据写操作。

## 人工清单（控制台，代码代替不了）

1. DNS：`poem.aibeaver.cn` A 记录指向现有 ECS 公网 IP。
2. Nginx：独立 `server_name poem.aibeaver.cn;`，反代 `127.0.0.1:3010`，HTTPS 与主站同一套签发流程（阿里云免费 SSL 或 Let's Encrypt）。
3. 在本仓库目录写 `.env.production`（不要进 git），至少包含：

```bash
AI_PROVIDER=deepseek
AI_GALLERY_CONFIG=/root/ai-gallery/config.json
SAVE_SESSIONS=1
CDN_BASE_URL=https://cdn.aibeaver.cn
POEM_ADMIN_PASSWORD=（只写在服务器上，不要进 git）
```

`AI_API_KEY` 可省略：生产会从 `config.json` 的 `llm` 里取密钥与 `baseUrl` / `model`（现为腾讯云 TokenHub，见下）。若要覆盖，再写 `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL`——注意**不要**手写 `AI_BASE_URL=https://api.deepseek.com`（那条直连口径已下线）。

⚠️ `AI_PROVIDER` 的合法值只有 `mock` / `openai` / `compatible` / `deepseek`（`deepseek` 在这里的含义是「OpenAI 兼容的 live provider」，实际端点仍取自 `config.json`）；写成 `tokenhub` 会认不出来、静默掉回 Coze。**审核引擎（`scripts/codex-exec.sh`）不读这些变量**，它只认 `TOKENHUB_API_KEY` 或 `config.json` 的 tokenhub `api-key`，两者是独立的配置面。

静态图会在 `deploy:build` 里转成 webp 并同步到 OSS，页面走 `CDN_BASE_URL`。管理台上传 DLC 用 `POEM_ADMIN_PASSWORD`；首页用户名填 `nova-admin` 进入上传台。

OSS 桶需要一条 CORS 规则，否则跨源取音频（Howler 的 Web Audio 路径走 XHR）会被浏览器拦下：

```json
{ "allowedOrigin": ["https://poem.aibeaver.cn"], "allowedMethod": ["GET", "HEAD"],
  "allowedHeader": ["*"], "exposeHeader": ["Content-Length", "Content-Range", "ETag", "Last-Modified"],
  "maxAgeSeconds": 86400 }
```

写入方式（服务器上有 OSS 凭证）：

```bash
node -e 'const OSS=require("ali-oss");const c=new OSS({/* /root/ai-gallery/config.json 的 oss */});
c.putBucketCORS("<bucket>", [/* 上面的规则 */])'
```

CDN 会透传该头。注意 CDN 是按完整 URL 缓存的：**补规则之前就已经缓存过的对象仍会返回不带 ACAO 的旧响应**（仓库课包音频 `Cache-Control: immutable`、边缘 TTL 30 天），要立刻生效得刷新 CDN 缓存或换 URL。所以客户端 BGM 走 Howler 的 `html5` 模式（`<audio>` 跨源播放不需要 CORS），不依赖这条规则。

Nginx 需允许较大的 zip：

```nginx
client_max_body_size 32m;
```

## 建议 Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name poem.aibeaver.cn;

    # ssl_certificate / ssl_certificate_key：与主站同套证书流程

    location / {
        proxy_pass http://127.0.0.1:3010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        client_max_body_size 32m;
    }
}

server {
    listen 80;
    server_name poem.aibeaver.cn;
    return 301 https://$host$request_uri;
}
```

端口 **3010** 避开 ai-gallery 的 3000。改端口时同步改 `ecosystem.config.cjs` 与 Nginx。

## 首次部署

```bash
# 建议路径，可改
cd /root
git clone git@github.com:junchenfeng/visual-novel-learning-game.git
cd visual-novel-learning-game
git checkout main

# 写好 .env.production 后再装依赖、构建
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
pnpm install --frozen-lockfile
pnpm run deploy:build
mkdir -p logs
pm2 start ecosystem.config.cjs
pm2 save
```

探活：

```bash
curl -sS http://127.0.0.1:3010/ | head
curl -sSI https://poem.aibeaver.cn/
```

生产走 `next start`，**不走** `scripts/dev-preview.mjs`。

## 更新

```bash
ssh aliyun-ecs 'cd /root/visual-novel-learning-game && git pull origin main && pnpm run deploy:build && pm2 startOrReload ecosystem.config.cjs --update-env && pm2 save'
```

⚠️ **必须用 `pm2 startOrReload ecosystem.config.cjs --update-env`，不要只 `pm2 restart poem-rpg`**：审核现在是异步的，`poem-ingest-worker` 是**独立进程**，只重启 Web 会让它继续跑旧代码（2026-10-10 实测：改了 `src/ingest/codexReview.ts` 的超时上限后，worker 仍在用旧值，正常单子被 180s 上限杀掉）。`--update-env` 同时负责 `INGEST_ASYNC_ENABLED` / `INGEST_DATA_DIR` 这类 env 变更，`pm2 save` 让重启机器后也生效。

`deploy:build` = `pnpm install --frozen-lockfile && next build && sync:cdn`，所以**不必**再单独跑 install。构建要几分钟，中途断线会中断，建议甩到后台再轮询：

```bash
ssh aliyun-ecs 'cd /root/visual-novel-learning-game && nohup bash -c "git pull origin main && export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true && pnpm run deploy:build && pm2 startOrReload ecosystem.config.cjs --update-env && pm2 save" > /tmp/poem-deploy.log 2>&1 & echo kicked'
ssh aliyun-ecs 'tail -20 /tmp/poem-deploy.log; pm2 list | grep poem'
```

发布后四条都要过，缺一条就不算换版：

1. `pm2 list` 里 `poem-rpg` 为 `online`，且 `↺` 计数比发布前 +1。
2. **用本次改动的文案 grep 公网页面**，例如改 `docs/patch-2.md` 后：`curl -s https://poem.aibeaver.cn/patch-2 | grep -c '<新写的句子>'` ≥ 1。只看 HTTP 200 不算数 —— 200 只说明进程活着。
3. `ssh aliyun-ecs 'cd /root/visual-novel-learning-game && tail -20 logs/err.log'` 无新报错。
4. **跑发布验证集**（本机执行，走线上 MCP 全链路）：

```bash
pnpm poem-dlc-review-e2e-test          # 5 个用例；失败时打印证据与排查提示
```

它把 5 份已上架学员包以 e2e 学员身份重提交，强制跑完整 Codex 审核，断言 `verdict=accept` 且 issues 里没有 `rule=审核引擎`。
**这条是唯一能抓住「审核引擎不可用 / agent 超时 → 全部审核失败」的检查**（2026-10-09 事故：ai-gallery 切 TokenHub 后 poem 侧仍读 `name=deepseek` 条目，每一单都被拒；单测全绿也发现不了）。

判读要点：

- 报 `审核引擎不可用` / `codex exec 超时` ⇒ 引擎故障（凭据或超时），不是学员 YAML 问题。
- 报 `enqueue_failed // 提交未受理` ⇒ Web 侧受理挂了，先看 Web 日志 `ingest_enqueue_error`（2026-10-10 实测：`require("node:sqlite")` 被 Next 打成 URL 型 external，Web 全挂而 worker 正常）。
- 报 `verdict=skip` ⇒ 版本没改动，Codex 根本没跑（e2e 的版本改写没生效）。
- 返回「内容 reject」是合法结论（用例标了 `expect: "either"`），报告里会单独打出来，别当引擎故障处理。
前提是服务端代码里有 e2e 学员（`src/ingest/l2Students.ts` 末尾的 `hh_0000000`…`hh_0000004`）——没有就先发布再跑。

改 `.env.production` 或 `config.json` 的 OSS/LLM 后也要 `pm2 restart poem-rpg`。

## 数据前缀

用户数据写在 OSS：`poem-rpg/{用户名}/...` 与 `poem-rpg/likes/{dlcId}/{用户名}.json`，与作业文件隔离。本机无 OSS 时落到仓库 `assets/poem-rpg/`（已 gitignore）。

「拿回自己 DLC 使用数据」是**只读**导出：按 `poem-rpg/uploads/index.json` 的 `userId` 找出本人课包，再扫 `poem-rpg/{玩家}/sessions/*.json` 与 `poem-rpg/{玩家}/events.json`，按课包归属过滤后回传。不写任何新 OSS key；导出请求本身照旧落 `poem-rpg/ingest-audit/`。

静态资源前缀：`poem-rpg/static/`（CDN `https://cdn.aibeaver.cn/poem-rpg/static/...`）。学生上传的 DLC 索引在 `poem-rpg/uploads/`。诗人名册在 `poem-rpg/roster.json`（首次从仓库 seed）。仓库课包 `hailao-shuidiao`（海狸老师）不进线上目录。

学生上传包的资源按**内容版本段**落盘：`poem-rpg/static/dlc/<dlcId>/r-<包内容指纹前 8 位>/assets/...`，站点路径与之一一对应（`/dlc/<dlcId>/r-xxxxxxxx/assets/...`）。加这一层是因为资源响应头是 `Cache-Control: immutable`，而 CDN 与浏览器按**完整 URL** 缓存一年：同名文件覆盖后旧副本不会失效，学员会看到「传了新版本但图没变」。版本段取内容指纹而不是 `manifest.version`——「改了内容忘升版本」正是这个坑最常见的触发方式。内容一变 URL 就变，缓存自然失效；旧版本目录由下一次发布顺手清掉（保留一小时，避免打断正在进行的对局，见 `src/dlc/publishUpload.ts` 的 `pruneStaleRevisions`），清理需要 `PoemStore.deleteObject`。

拼资源 URL 的代码一律从 `publicBasePath` 出发（`src/dlc/loadCompiled.ts` 的 `rewriteMusicAssets` 曾经自己拼 `/dlc/<dlcId>`，加版本段后会稳定 404）。

仓库自带课包不在这条链上：它们由 `sync:cdn` 传到老路径（`poem-rpg/static/dlc/<dlcId>/...`，同样 `immutable`），改图要同时刷 CDN 缓存，否则边缘最多 30 天不回源。

对方 agent 先读公开说明，再连 MCP：

- 操作说明（用户只给 userId + DLC 目录，zip 由 agent 打）：https://poem.aibeaver.cn/mcp-how-to
- 使用数据回传（用户只给 userId，默认落到 `assets/user_data/`，增量）：https://poem.aibeaver.cn/mcp-usage
- YAML 规范：https://poem.aibeaver.cn/dlc-spec
- MCP：`https://poem.aibeaver.cn/mcp`（不用 token，工具参数带 `userId`）
- 同源 HTTP：`POST /api/ingest`（上传）、`GET|POST /api/usage`（清单 / 下载）
- 服务端细节见 [mcp-ingest.md](mcp-ingest.md)、[mcp-usage.md](mcp-usage.md)

ECS 上 `codex` 需要在 `poem-rpg` 进程 PATH 里可执行（与 grading-agent 同一份 CLI）。


## DLC 异步审核 worker

需要 Node >=22.13（使用内置 node:sqlite；已在 Node 24 验证）。执行 `pnpm typecheck`、`pnpm test --runInBand`、`pnpm build` 后，使用仓库 `ecosystem.config.cjs` 启动 / 更新 Web 和 `poem-ingest-worker` 两个进程。**必须同时部署 worker 和更新后的 MCP/HTTP 使用说明**。

```bash
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save
```

- PM2 为 Web 设置 `INGEST_ASYNC_ENABLED=1`；未设置保留同步兼容。异步提交 HTTP 202，最终结果走状态查询，不能把 202 当作上架成功。
- **引擎故障自动重试**：`INGEST_REVIEW_ATTEMPTS`（默认 2 = 失败后重跑 1 次，夹在 1..3）、`INGEST_REVIEW_RETRY_DELAY_MS`（默认 3000，夹在 0..60000）。只重试 `rule='审核引擎'` 的失败（codex 超时 / 取不到密钥 / 进程退出 / review.json 写坏）；学员 YAML 的结论是终局，不重试。重跑前会清掉上一轮可能写坏的 `review.json` / `last-message.txt`，次数写进 audit 的 `transcript.attempts` 与 `timings.reviewRetryCount`。
  - 预算：单次上限 240s ⇒ 2 次尝试最坏 ~500s（含机器校验与发布）。异步链路不受 Nginx `proxy_read_timeout=330s` 约束；**同步调用方**（e2e 的 `--max-ms`、直连 MCP 的脚本）要把预算放到 600s 以上，否则会把「重试救回来的成功」误报成超时。
- **审核引擎的模型密钥**：worker 机器上必须能取到腾讯云 TokenHub 的 key——`TOKENHUB_API_KEY` 环境变量，或同机 `/root/ai-gallery/config.json` 的 `llm[].api-key`（`scripts/codex-exec.sh` 会兜底读取）。**取不到 key 时 codex exec 立刻退出，每一单都会记成 blocking「审核引擎不可用」→ 预览台显示「审核失败」**（2026-10-09 ai-gallery 切 TokenHub 后 poem 侧仍读 `name=deepseek` 条目，就是这样全线失败的）。另外聊天里的报错只说明密钥缺失，排查时先看 `logs/ingest-worker-err.log` 与 OSS `poem-rpg/ingest-audit/<id>/record.json` 的 `transcript.error`。注意重试**救不了**这类确定性故障：密钥缺失时两次都会立刻失败（只是多花几百毫秒）。
- Web / worker 的 `INGEST_DATA_DIR` 必须指向同一个本机持久目录，默认 `<repo>/.cache/ingest`；滚动发布、清理目录和备份时保留该目录。SQLite WAL 存任务及待处理 ZIP，完成后清除 ZIP，结果保留 7 天。不是多机共享队列，不放 NFS。
- 单 worker 进程持有进程锁，内部默认并发 2，可设 `INGEST_WORKER_CONCURRENCY=1..8`。同一学员同一诗人篇目顺序处理；不同作品可并行审核。默认最多 100 个在途任务、512 MiB 压缩包总量，满则 429；这不是 QPS 10 的容量承诺。
- 发布、预览和名册更新使用同一 SQLite 中的跨进程互斥锁；所有写入进程必须同机并共用 INGEST_DATA_DIR。旧版服务或外部脚本不遵守锁时仍不安全。
- 正常 SIGTERM 停止领取并等待现有任务结束，PM2 留 360 秒。崩溃重启保留 queued；遗留 running 标记 failed，不自动重放可能已经发布的操作。客户端先查已上架内容再重提。
- 部署回退到同步前，先停止新受理、排空队列；不要删除队列文件，也不要同时保留旧版写入进程。
- 查看 `logs/ingest-worker-out.log` 的 `ingest_stage` / `ingest_job_finished`。先验证受理→排队→审核→发布→查询全链路，再以 1/3/5/10 QPS 分级测试，观察完成吞吐、队列长度、超时率及资源。
