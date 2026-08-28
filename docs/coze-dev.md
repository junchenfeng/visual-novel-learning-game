# 扣子（Coze）开发环境须知

面向在本仓库做 **dev 沙盒 / 编辑器 iframe 预览** 的开发者。学生向说明见 [architecture.md](architecture.md)。

当前栈：Next.js 16.3.2（App Router + Turbopack）+ React 19.2.8。沙盒入口由 `.coze` 固定，不要改成直接跑 `next dev`。

---

## 1. 平台契约

[`.coze`](../.coze) 把两种运行拆开：

| 阶段 | 命令 | 实际进程 |
| --- | --- | --- |
| 开发预览 | `pnpm install` → `pnpm run dev` | `predev` 编译 DLC，然后 `node scripts/dev-preview.mjs` |
| 正式部署 | `pnpm run deploy:build` → `pnpm run start` | `next build` + `next start -p ${DEPLOY_RUN_PORT}` |

扣子注入 `DEPLOY_RUN_PORT`（dev 预览常见为 `5000`）。公网主机名形如：

```text
https://<workspace-id>-<DEPLOY_RUN_PORT>.dev.coze.site
```

编辑器把该源嵌进跨域 iframe（父页常为 `code.coze.cn`）。edge 代理会改写 HTML，并在文档最前面插入三个 CDN 脚本：

- `page-editor-general-web`（自带 React 18.3.1 的 `CozeHtmlEditorRenderer`）
- `console-bridge`（`parent.postMessage` 转发 console）
- `history-bridge`

这三份脚本**不是**水合挂起的根因：拦截它们之后，`hydrateRoot(document)` 仍可能永不执行。不要再往应用里加「隔离 Coze React」的运行时补丁。

`next.config.ts` 的 `allowedDevOrigins` 必须包含 `**.dev.coze.site`，否则跨源访问 `/_next` 会被 Next 拒绝。

---

## 2. 端口与进程

`scripts/dev-preview.mjs` 占用两个端口：

| 端口 | 绑定 | 职责 |
| --- | --- | --- |
| `DEPLOY_RUN_PORT`（缺省 3000） | `0.0.0.0` | 对外反向代理；平台只探活这个端口 |
| `DEPLOY_RUN_PORT + 1` | `127.0.0.1` | 内部 `next dev -H 127.0.0.1` |

同一仓库目录 **同时只能有一个** `next dev`（`.next` 开发锁）。本机若已有 3000 上的 Next，再起沙盒式代理会直接退出。先停掉占用进程。

生产 `next start` **不走** 该代理。

---

## 3. 预览环境里的两类故障

症状经常叠在一起，修复也必须两套都在。

### 3.1 首屏「看得见」——不要用 JS 动画库驱动入场

Motion / Framer Motion 的 `initial={{ opacity: 0, ... }}` 会写进 SSR HTML。客户端 `animate` 依赖 hydration。hydration 未完成时，月亮和卡片会永远停在：

```html
style="opacity:0;transform:scale(0.72)"
style="opacity:0;transform:translateY(24px)"
```

`useEffect` / `mounted` 同样依赖 hydration，救不了这件事。

开场页 [`NarrativeGate`](../src/components/NarrativeGate.tsx) 使用普通 `div` + CSS `@keyframes` + `animation-fill-mode: forwards`（[`narrativeGate.module.css`](../src/components/narrativeGate.module.css)）。浏览器渲染引擎播动画，与 React 是否接管无关。`onClick` 仍走 React。

约束：

- `forwards` 不能省，否则播完会跳回 `opacity: 0`。
- keyframes 里的 `transform` 会覆盖元素原有 transform；云的循环必须写成 `rotate(-8deg) translateX(...)`。
- 同步写 `@media (prefers-reduced-motion: reduce)`。
- `ClassroomFrame` / `PoemScrollFrame` 的 motion 可以保留：它们只在用户已经点进关卡之后出现。

SSR 验收：

```bash
curl -s "http://127.0.0.1:${DEPLOY_RUN_PORT:-5000}/play/hailao-shuidiao" \
  | grep -oE 'style="[^"]*opacity[^"]*"'
```

开场节点上不应再出现 `opacity:0` 内联样式。

### 3.2 全页「点得动」——dev 水合会等二进制调试帧

Turbopack `next dev` 的客户端 `hydrate()` 顺序：

1. 建立 HMR WebSocket → 控制台出现 `[HMR] connected`（**只证明走到了这一步**）
2. `await initialServerResponse`：从 HTML 内联 Flight 流（`self.__next_f`）构造 RSC 根 Promise
3. 同步建 actionQueue
4. `hydrateRoot(document)`

第 2 步在 dev 会带上 `debugChannel`。此时 `hasReadable === true`，元素行的 `_owner` / `_debugStack` **不在 HTML 里**，而在 HMR WebSocket 的二进制帧（`REACT_DEBUG_CHUNK`，首字节 `0x00`）。

扣子 edge 的 wss **丢弃二进制帧、放行文本帧**。于是引用永久 pending → RSC 根 Promise 不 resolve → **`hydrateRoot` 从不调用**。表现：DOM 完整、零报错、所有 `onClick` 无效。`Object.keys(document)` 看不到 `__reactContainer$`（Symbol / 不可枚举），要用：

```js
Reflect.ownKeys(document).some((k) => String(k).includes("__reactContainer"))
Object.getOwnPropertyNames(btn).filter((k) => k.startsWith("__react")).length
```

`localhost` 直连与 `next start` 无此通道等待，所以正常。慢网络下 chunk `async` 乱序执行也会让 localhost 复现同类挂起。

生产构建没有 `debugChannel`，不要把「线上好、dev 沙盒坏」当成业务 bug。

---

## 4. `dev-preview.mjs` 做什么

`package.json` 的 `"dev": "node scripts/dev-preview.mjs"`。不要改回裸 `next dev -p ${DEPLOY_RUN_PORT}`，否则 iframe 预览会再次静默失活。

代理对回源 JS 强制 `accept-encoding: identity`，避免对 gzip 字节做字符串替换。改写响应体后必须去掉 `Content-Encoding` / `Content-Length` / `Transfer-Encoding`；打补丁后还要去掉 `etag` / `last-modified`，否则浏览器 304 会缓存未打补丁的 chunk。

| 步骤 | 行为 |
| --- | --- |
| HTML | 缓冲完整文档后一次写出；去掉 `/_next` `<script>` 上的 `async` |
| 静态 | 从 HTML 抽出 `/_next/static` 预热，短 TTL 缓存（8s） |
| Flight | 仅对 `.js` 做子串替换（见下） |
| WebSocket | TCP 隧道，保留 `Upgrade` / `Connection` / `Sec-WebSocket-*`；二进制帧原样转发 |

补丁原文（Turbopack 当前形态）：

```js
"hasReadable: void 0 !== options.debugChannel.readable"
→
"hasReadable: !1"
```

命中时日志：

```text
[dev-preview] applied flight hydration patch to /_next/static/chunks/...react-server-dom-turbopack...
```

每次 chunk 重建都会再打一次。若升级 Next 后补丁不再命中，对实际下发的 chunk 执行：

```bash
grep -o 'hasReadable[^,;]*' <chunk.js>
```

按真实压缩形态改 `FLIGHT_PATCH_FROM`。webpack 模式字符串可能不同。

---

## 5. 其它沙盒约束

### `crypto.randomUUID`

Secure Context 才有 `crypto.randomUUID`。部分 iframe / 非安全上下文会在渲染期抛 `randomUUID is not a function`，整页崩溃。业务 ID 一律走 [`src/ui/uuid.ts`](../src/ui/uuid.ts) 的 `createId()`：`randomUUID` → `getRandomValues`（RFC 4122 v4）→ `Math.random`。

### LLM

沙盒默认 `CozeAIProvider`（`coze-coding-dev-sdk` 的 `LLMClient`）。`/api/teacher` 与 `/api/summary` 用 `HeaderUtils.extractForwardHeaders` 把请求头转给 SDK。本机可用 `.env.local` 切 `AI_PROVIDER=mock|deepseek|openai`，密钥不要进 git。

### 测试

沙盒装不了 Playwright。自动化只跑 Jest（DLC / 状态机 / 事件信封）。iframe 可点性靠本文第 6 节在真实预览里手测或自备浏览器脚本。

---

## 6. 验收

重启 `pnpm run dev` 后：

1. 日志出现 `applied flight hydration patch to ...`
2. 直连 `https://<id>-5000.dev.coze.site/play/hailao-shuidiao`：`__reactContainer` 为真，按钮 `__react*` 属性数 > 0，「走进梦里」能进故事
3. 编辑器 iframe 内同样可点（只测独立标签页不够）
4. 改一个组件文件，HMR 文本帧仍能刷新
5. 填空题 `/api/teacher` 在沙盒能打到扣子 LLM

判失败：页面「长得正常」但按钮无请求、无 `pageerror`、只有 `[HMR] connected`。先查补丁日志和 `__reactContainer`，不要先查 XState。

---

## 7. 不要做的事

- 不要用第二个 React `createRoot` 绕开 hydrate 来「修好预览」。
- 不要把 `postMessage` origin mismatch、console-bridge 警告当成水合失败原因。
- 不要在首屏关键内容上再加 Motion `initial` 隐身态。
- 不要假设拦截 Coze CDN 就能恢复点击。
