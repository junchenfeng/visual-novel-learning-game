# ECS 独立发布（poem.aibeaver.cn）

课堂教学继续用 `coze-demo` 分支 + 扣子沙盒，见 [coze-dev.md](coze-dev.md)。  
公网站点只跑 `main`：同一台 ECS 上**另起** PM2 进程，**不要**挂到 ai-gallery 的路径下。

只复用 `/root/ai-gallery/config.json` 里的 OSS 凭证和 DeepSeek `llm` 密钥，不读主站 Session / `students` 表。

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
cd /root/visual-novel-learning-game
git pull origin main
pnpm install --frozen-lockfile
pnpm run deploy:build
pm2 restart poem-rpg
```

改 `.env.production` 或 `config.json` 的 OSS/LLM 后也要 `pm2 restart poem-rpg`。

## 数据前缀

用户数据写在 OSS：`poem-rpg/{用户名}/...` 与 `poem-rpg/likes/{dlcId}/{用户名}.json`，与作业文件隔离。本机无 OSS 时落到仓库 `assets/poem-rpg/`（已 gitignore）。

静态资源前缀：`poem-rpg/static/`（CDN `https://cdn.aibeaver.cn/poem-rpg/static/...`）。学生上传的 DLC 索引在 `poem-rpg/uploads/`。诗人名册在 `poem-rpg/roster.json`（首次从仓库 seed）。仓库课包 `hailao-shuidiao`（海狸老师）不进线上目录。

对方 agent 先读公开说明，再连 MCP：

- 操作说明（用户只给 userId + DLC 目录，zip 由 agent 打）：https://poem.aibeaver.cn/mcp-how-to
- YAML 规范：https://poem.aibeaver.cn/dlc-spec
- MCP：`https://poem.aibeaver.cn/mcp`（不用 token，工具参数带 `userId`）
- 服务端细节见 [mcp-ingest.md](mcp-ingest.md)

ECS 上 `codex` 需要在 `poem-rpg` 进程 PATH 里可执行（与 grading-agent 同一份 CLI）。

