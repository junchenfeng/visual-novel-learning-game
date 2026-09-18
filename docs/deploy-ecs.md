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
| 同源 HTTP | `POST /api/ingest`（上传）、`GET /api/my-dlc`（我已上架课包 + 版本，提交前对账）、`GET\|POST /api/usage`（清单 / 下载） |
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

`AI_API_KEY` 可省略：生产会从 `config.json` 的 `llm` 里取 DeepSeek 密钥。若要覆盖，再写 `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL`。

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
ssh aliyun-ecs 'cd /root/visual-novel-learning-game && git pull origin main && pnpm run deploy:build && pm2 restart poem-rpg'
```

`deploy:build` = `pnpm install --frozen-lockfile && next build && sync:cdn`，所以**不必**再单独跑 install。构建要几分钟，中途断线会中断，建议甩到后台再轮询：

```bash
ssh aliyun-ecs 'cd /root/visual-novel-learning-game && nohup bash -c "git pull origin main && export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true && pnpm run deploy:build && pm2 restart poem-rpg" > /tmp/poem-deploy.log 2>&1 & echo kicked'
ssh aliyun-ecs 'tail -20 /tmp/poem-deploy.log'
```

发布后三条都要过，缺一条就不算换版：

1. `pm2 list` 里 `poem-rpg` 为 `online`，且 `↺` 计数比发布前 +1。
2. **用本次改动的文案 grep 公网页面**，例如改 `docs/patch-2.md` 后：`curl -s https://poem.aibeaver.cn/patch-2 | grep -c '<新写的句子>'` ≥ 1。只看 HTTP 200 不算数 —— 200 只说明进程活着。
3. `ssh aliyun-ecs 'cd /root/visual-novel-learning-game && tail -20 logs/err.log'` 无新报错。

改 `.env.production` 或 `config.json` 的 OSS/LLM 后也要 `pm2 restart poem-rpg`。

## 数据前缀

用户数据写在 OSS：`poem-rpg/{用户名}/...` 与 `poem-rpg/likes/{dlcId}/{用户名}.json`，与作业文件隔离。本机无 OSS 时落到仓库 `assets/poem-rpg/`（已 gitignore）。

「拿回自己 DLC 使用数据」是**只读**导出：按 `poem-rpg/uploads/index.json` 的 `userId` 找出本人课包，再扫 `poem-rpg/{玩家}/sessions/*.json` 与 `poem-rpg/{玩家}/events.json`，按课包归属过滤后回传。不写任何新 OSS key；导出请求本身照旧落 `poem-rpg/ingest-audit/`。

静态资源前缀：`poem-rpg/static/`（CDN `https://cdn.aibeaver.cn/poem-rpg/static/...`）。学生上传的 DLC 索引在 `poem-rpg/uploads/`。诗人名册在 `poem-rpg/roster.json`（首次从仓库 seed）。仓库课包 `hailao-shuidiao`（海狸老师）不进线上目录。

对方 agent 先读公开说明，再连 MCP：

- 操作说明（用户只给 userId + DLC 目录，zip 由 agent 打）：https://poem.aibeaver.cn/mcp-how-to
- 使用数据回传（用户只给 userId，默认落到 `assets/user_data/`，增量）：https://poem.aibeaver.cn/mcp-usage
- YAML 规范：https://poem.aibeaver.cn/dlc-spec
- MCP：`https://poem.aibeaver.cn/mcp`（不用 token，工具参数带 `userId`）
- 同源 HTTP：`POST /api/ingest`（上传）、`GET|POST /api/usage`（清单 / 下载）
- 服务端细节见 [mcp-ingest.md](mcp-ingest.md)、[mcp-usage.md](mcp-usage.md)

ECS 上 `codex` 需要在 `poem-rpg` 进程 PATH 里可执行（与 grading-agent 同一份 CLI）。
