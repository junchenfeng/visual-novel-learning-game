# patch-3：平台 MCP 说明 + 课堂「回看上一段」归位

永久地址：https://poem.aibeaver.cn/patch  
本补丁：https://poem.aibeaver.cn/patch-3  
YAML 规范：https://poem.aibeaver.cn/dlc-spec  
提交课包：https://poem.aibeaver.cn/mcp-how-to  
拿回使用数据：https://poem.aibeaver.cn/mcp-usage

这是**累计补丁**，两件事可以单独应用，**不要求先打过 patch-2**：

| 能力 | 改什么 | 不写会怎样 |
| --- | --- | --- |
| 平台 MCP 说明 | 往 `AGENTS.md` 末尾追加一节（只改文档） | 项目里的 agent 不知道提交课包 / 拿回使用数据的通道 |
| 课堂「回看上一段」归位 | 回看按钮从气泡右上角的绝对定位改为**动作区、与提交按钮同排**（改 `ClassroomFrame.tsx` + `classroom.module.css`） | 玩家看不出右上角那个东西是按钮 |

第二件事的两种起点会收敛到**同一份最终代码**，所以跳过 patch-2 也不会打架：

- **已经打过 patch-2**：回看功能在，只是按钮浮在右上角 → 按 [2.1](#21-已经打过-patch2只归位) 搬位置 + 换样式。
- **没打过 patch-2**：项目里没有回看按钮 → 按 [2.2](#22-没打过-patch2一次做全) 一次做全。

`schemaVersion` 仍是 `1`。只动 `ClassroomFrame` 的本地 UI 状态与 CSS：不重写状态机、不动评分、不改 YAML、不改课包。

> 读词节奏（每句锁 3 秒 + 环形读秒）与分阶段 BGM **不在本补丁里**，仍由 [patch-2](https://poem.aibeaver.cn/patch-2) 负责。没打过的照 patch-2 做即可，两件事互不冲突、先后随意。

## 先判断

**A. AGENTS.md**：在学员项目根目录的 `AGENTS.md` 里搜三个探针：

| 探针 | 代表哪件事 |
| --- | --- |
| `poem.aibeaver.cn/mcp` | MCP 地址已写进文档 |
| `ingest_dlc` | 上传课包流程已写进文档 |
| `usage_manifest` | 拿回使用数据流程已写进文档 |
| `hailao-shuidiao` | 上传范围规则已写进文档（扫项目 `dlc/` 下全部合规包，跳过课堂课包） |

- **四个都在**：已对齐，跳过第 1 节。
- **缺任意一个**：把第 1 节的整段**追加到 `AGENTS.md` 末尾**。这几件事是一次写全的，别只补缺的那一段。已经粘过旧版（三个探针在、没有 `hailao-shuidiao`）的，把上传那一节替换成新版原文。
- **项目根没有 `AGENTS.md`**：新建一个，把整段粘进去即可（其它章节以后自然会长出来）。

**B. 回看按钮**：在学员项目里搜 `quiz-back` 与 `.navBack`：

| 现状 | 结论 |
| --- | --- |
| 两个都搜不到 | 没打过 patch-2 → 走 [2.2](#22-没打过-patch2一次做全) |
| 搜得到 `quiz-back`，且 `.navBack` 里有 `position: absolute` | 打过 patch-2（旧版）→ 走 [2.1](#21-已经打过-patch2只归位) |
| 搜得到 `quiz-back`，按钮已在 `styles.actions` 里、`.navBack` 无 `absolute` | 已对齐，跳过第 2 节 |

本项目 `main` 里有完整文本与完整实现，有 git 对照时直接抄，**不要凭记忆改写工具名和域名**。

## 改哪些文件

| 路径 | 改什么 |
| --- | --- |
| `AGENTS.md` | 文件**末尾**追加一节 `## 平台 MCP：上传课包与拿回使用数据`（第 1 节原文） |
| `src/components/ClassroomFrame.tsx` | 回看按钮渲染进动作区（第 2.0 节的代码 + 三个插入点） |
| `src/components/classroom.module.css` | `.navBack` 换成动作区里的描边按钮样式 |

**不要**顺手改 `package.json`、不要新增脚本 —— 增量同步由 `usage_manifest` + `download_usage_files` 两步覆盖，学员项目只需要知道 MCP 入口。

---

## 1. 追加到 AGENTS.md 的原文

````md
## 平台 MCP：上传课包与拿回使用数据

平台把「提交 DLC」和「拿回使用数据」放在同一台 MCP 上：`https://poem.aibeaver.cn/mcp`。这是**远程 MCP 服务，不在当前项目里、也不在本机** —— 不要去找端口、进程或脚本。远程不用 token，每个工具都靠学员自己的 `userId` 开门。

**工具列表里看不到 `list_roster` / `upsert_poet` / `upsert_work` / `ingest_dlc` / `list_my_dlc` / `usage_manifest` / `download_usage_files` 时**，说明调用方还没配置这个 MCP。把下面这段交给用户，让他加进自己 agent 客户端的 MCP 配置，再重新发起请求：

```json
{ "mcpServers": { "poem-dlc-ingest": { "url": "https://poem.aibeaver.cn/mcp" } } }
```

**userId**：`hh` + 学号，或 `hh_` + 学号（`hh11016863` / `hh_11016863`，大小写不敏感）。学号须是当前在读学员。格式不对或不在名单，工具返回「user id不正确，需要咨询老师」—— 此时停下问老师，不要换别的 id 重试。

每个工具调用都必须带 `userId`。管理台人工上传不走这套校验。

**探端点别用 GET**：`https://poem.aibeaver.cn/mcp` 是 MCP 的 HTTP JSON-RPC，只认 `POST`。`GET`（浏览器直接打开、`curl` 直接请求都一样）固定返回 **405 Method Not Allowed** —— 那是探测方式不对，不是端点挂了，别据此判定「MCP 不可用」。手工确认按 MCP 握手来，并且必须带 `Accept: application/json, text/event-stream`，少了它 `POST` 会返回 **406**：

```bash
curl -s https://poem.aibeaver.cn/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"0"}}}'
```

两个附带结论：响应是 **SSE 帧**（一行 `event: message` + 一行 `data: {...}`），不是裸 JSON，解析时按 SSE 拆；**HTTP 200 不代表调用成功** —— `userId` 不对、工具名写错这类错误是 JSON-RPC 的 `error`，HTTP 码照样是 200，成败看 `data` 里的 `result` / `error`。

### 1. 上传课包（poem-dlc-ingest）

说明页：https://poem.aibeaver.cn/mcp-how-to

- 只向用户要一样：`userId`。**不要再问「要传哪个包」「目录在哪」** —— 课包固定在项目根的 `dlc/` 下：`find dlc -name manifest.yaml`，每个命中目录就是一个包根，**逐个都传**。**不要让用户自己打 zip**，也不要问 poetId / 诗人中文名 / 篇名 —— 从 `manifest.yaml` 读。不要向用户要 token。
- **跳过 `hailao-shuidiao`**：它是课堂课包，不归学员。口径是 `manifest.yaml` 的 `id` 命中 `src/dlc/unpublished.ts` 的 `UNPUBLISHED_DLC_IDS`（本项目就是 `hailao-shuidiao`）。传上去等于把老师的课包挂到学员 id 下 —— 服务端只挡精确 id 冲突，**挡不住这种挂靠**。用户点名只传某一个包时才只传那一个。
- 工具：`list_roster`（先看诗人与篇目）→ 诗人不在名册时 `upsert_poet`（正方形 png/jpg/webp，边长 512–1024px，≤2MB，传 `portraitBase64`；几百 KB 的正方形 webp 本来就合规，不用先压缩、也不用为此改尺寸；同一位诗人只需建一次）→ `ingest_dlc`（zip ≤30MB，传 `zipBase64`；每个包一轮）。
- 打包排除 `.DS_Store`、`.git`、`node_modules`、`__MACOSX`。诗人头像是公共资源，**不要放进 zip**。
- 审核 = 机器校验 + 对照 https://poem.aibeaver.cn/dlc-spec 的评审，可能要几分钟，别中途取消。
- `verdict: accept` → 把返回的 `playUrl` 给用户，结束；`verdict: reject` → 按 `issues[].message` / `fixHint` 改 YAML，**你自己重新打包**再 `ingest_dlc`，不要让用户手动重压。
- 线上课包 id 是 `{manifest.id}-{userId}`：同一 userId 同一 short-id 覆盖自己的包，不会盖到别人的，也不会盖到仓库课包。

### 2. 拿回自己 DLC 的使用数据

说明页：https://poem.aibeaver.cn/mcp-usage

- 只向用户要 `userId`，**不要问要哪个课包** —— 先 `list_my_dlc` 列出来让他挑。
- 工具：`list_my_dlc`（自己已上架、未被隐藏的课包 + 试玩地址）→ `usage_manifest`（使用数据清单：每个文件带相对落盘路径、字节数、更新时间、sha256）→ `download_usage_files`（按清单 `path` 取内容，一次最多 25 个）。
- **只导出「课包归属人 = 本人」的数据**：对局记录按 `sessions`、行为事件流按 `dlcId` 逐条过滤后才输出；请求不属于清单的路径，整单拒绝。
- 默认落到本机 `assets/user_data/`，增量更新：拿清单的 `sha256` 与本机已有文件比对，只下载缺失或变更的文件。目录约定：

  ```text
  assets/user_data/
    manifest.json                      # 上次同步基线
    <dlcId>/sessions/<玩家 slug>-<对局 id>.json
    <dlcId>/events/<玩家 slug>.json
  ```

- 远程 MCP 返回 `contentBase64`，由你写盘：**保持清单里的 `path` 原样**，改文件名会让下次增量重复下载。
- 全程 HTTPS，**没有本地脚本可用**：远程 MCP `https://poem.aibeaver.cn/mcp`，或同源 HTTP —— `GET /api/usage?userId=hh_学号` 取清单，`POST /api/usage`（`{"userId":"…","paths":["…"]}`）取内容。不要去找 `scripts/` 下的工具或 `pnpm` 脚本。

### 禁止

- 伪造或借用别人的 `userId`
- 忽略 blocking 意见反复硬传
- 把诗人头像塞进 DLC zip
- 请求不属于清单的 `path`，或把导出的对局数据再上传成 DLC
````

---

## 2. 课堂「回看上一段」归位

### 2.0 目标最终态（两种起点都到这里）

**渲染条件**：只在 `status === "idle"` 且 beat 是 `classmate` / `student` 时出现，**不要**在老师提问页（`teacher`）也显示。

**回退规则**（纯本地 `beat`，不发状态机事件）：

| 当前 beat | 回退到 |
| --- | --- |
| `student` | 有提示 → `classmate`；无提示 → `teacher` |
| `classmate` | `teacher` |

**渲染位置**（这是本次要改的核心：按钮属于动作区，不是浮层）：

| 当前 beat | 位置 |
| --- | --- |
| `student` + 开放题（或有提示的选择题） | 提交按钮所在的那个 `styles.actions` 里，作为**第一个子元素**：`[← 回看上一段] [提交给老师]` |
| `student` + 选择题 | `styles.choices` **上方**单独一行 `styles.actions` |
| `classmate` | 与「轮到我答」同一排 |

**回退之后怎么往前走 —— 不要新增「开始作答」按钮**：回退只是回到前面那个页面，该页原有的前进按钮会照常重现：

- 回退到 `classmate`：打字机打完后「轮到我答」还在 → 回 `student`。
- 回退到 `teacher`：打字机打完后，有提示的题重现「听{同学}说」→ `classmate` → `student`；无提示的选择题本来就在这一页直接列选项作答。

**回调之外的边界**：

- `hasQuizHint` 对开放题恒为 `true`，所以进入 `student` 一定伴随提示；`student` 且无提示那条兜底分支写全但实际用不到。
- 无提示的选择题 `beat` 始终是 `teacher`，回看按钮**不会出现** —— 这是预期，不是漏渲染。
- 已提交的作答与评分在状态机 context 里，回看**不碰**它们。

**打字机从头重播靠对话容器 `key` 重挂载，必须把 `beat` 放进 key**（只写 `speaker` 不可靠：`speaker` 由 `beat` 推导，两个 beat 可能都渲染成 `teacher`）：

```tsx
key={`${question.id}-${beat}-${status}`}
```

**要抄的代码**（`return` 之前放一份，三处复用）：

```tsx
const canGoBack = status === "idle" && (beat === "classmate" || beat === "student");
const backButton = canGoBack ? (
  <button
    className={styles.navBack}
    data-testid="quiz-back"
    onClick={() => {
      playSfx("click");
      setBeat((current) =>
        current === "student" ? (showHint ? "classmate" : "teacher") : "teacher",
      );
    }}
  >
    ← 回看上一段
  </button>
) : null;
```

**三个插入点**：

1. `classmate` 排 —— 注意渲染条件**不要**挂在打字机 `done` 上：排一出现就渲染，只有「轮到我答」等 `classmateTw.done`。

```tsx
{status === "idle" && beat === "classmate" ? (
  <div className={styles.actions}>
    {backButton}
    {classmateTw.done ? (
      <button className={styles.primary} data-testid="student-turn" onClick={() => { playSfx("click"); setBeat("student"); }}>
        轮到我答
      </button>
    ) : null}
  </div>
) : null}
```

2. `student` + 开放题 —— 在 `data-testid="submit-answer"` 那个 `<div className={styles.actions}>` 里，把 `{backButton}` 放在提交按钮**前面**。

3. `student` + 选择题 —— 用 fragment 包住「回看行 + 选项列」：

```tsx
<>
  {backButton ? <div className={styles.actions}>{backButton}</div> : null}
  <div className={styles.choices}>{/* …选项按钮不变… */}</div>
</>
```

**CSS**：`.navBack` 去掉 `position / top / right / z-index`（旧版就是被这几个属性顶到气泡右上角的），换成：

```css
.navBack {
  font-family: var(--font-sans);
  font-size: 13px;
  line-height: 1.5;
  letter-spacing: 0.06em;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px dashed rgba(212, 168, 75, 0.8);
  background: rgba(212, 168, 75, 0.1);
  color: #d4a84b;
  padding: 10px 14px;
  min-height: 44px;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.navBack:hover {
  background: rgba(212, 168, 75, 0.2);
  color: #f4ead5;
  border-color: #d4a84b;
  border-style: solid;
}

.navBack:focus-visible {
  outline: 2px solid #d4a84b;
  outline-offset: 2px;
}
```

暗金描边 + 暗金文字，比实心的 `.primary` 弱一档，但在深色气泡上足够醒目；`min-height: 44px` 与主按钮同高。**不要**用低对比的灰、也不要只留一个 `←` 图标。

### 2.1 已经打过 patch-2：只归位

1. 删掉 `motion.section` 里、`<div className={styles.dialogueBody}>` **之前**那一整块绝对定位按钮（`{status === "idle" && (beat === "classmate" || beat === "student") ? <button className={styles.navBack} …> : null}`）。
2. 把 2.0 的 `canGoBack` / `backButton` 放到 `return` 之前。
3. 按 2.0 的三个插入点接上；`classmate` 那条要把原来的 `&& classmateTw.done` 从**整排**移到**只 gate「轮到我答」**。
4. 按 2.0 换掉 `.navBack` 的 CSS。
5. 顺手把对话容器的 `key` 改成含 `beat` 的写法。

### 2.2 没打过 patch-2：一次做全

`beat`（`teacher` / `classmate` / `student` 三段对话）与「听{同学}说」「轮到我答」这些前进按钮**是项目原有的**，不需要新建状态机、不需要碰 `src/game/gameMachine.ts`。所以「做全」= 2.0 的那份代码 + 三个插入点 + CSS + key，**全部是 `ClassroomFrame` 内部的本地 UI 改动**。

先确认这两样在项目里已经存在再动手：`hasQuizHint(question)`（提示是否存在）、`classmateTw`（同学台词的打字机实例）。有 `showHint` / `classmateTw` 就对了。

## 3. 验收

肉眼核对 + 跑原有检查：

1. `AGENTS.md` 末尾出现 `## 平台 MCP：上传课包与拿回使用数据`，且四个探针（`poem.aibeaver.cn/mcp`、`ingest_dlc`、`usage_manifest`、`hailao-shuidiao`）都在；上传那节写明「扫项目 `dlc/` 下全部合规包、跳过 `hailao-shuidiao`」。
2. 七个工具名一个没写错：`list_roster`、`upsert_poet`、`upsert_work`、`ingest_dlc`、`list_my_dlc`、`usage_manifest`、`download_usage_files`。
3. 两个域名写对：MCP 是 `https://poem.aibeaver.cn/mcp`，不是 `/api/ingest`。
4. MCP 探测方式对：`curl -s -o /dev/null -w '%{http_code}' https://poem.aibeaver.cn/mcp` 应当是 **405**（POST-only 的 JSON-RPC，GET 不通是正常的）；带 `Accept: application/json, text/event-stream` 发 `initialize` 应返回 `event: message` 的 SSE 帧。**别拿 GET 的 405 当成端点故障**。
5. 点一道**有提示的题**走一遍：老师提问 →「听{同学}说」→ 同学发言 →「轮到我答」→ 作答。这三页都能看到「← 回看上一段」，且它在**动作区**、与主按钮同一排（选择题那页在选项上方）。
6. 点一次回看：打字机从头重播；再往前走能回到作答（**不需要**任何新增按钮）；已提交的作答与评分不变。
7. 无提示的选择题：整题不出现回看按钮（预期）。
8. 原有检查与改动前一致：

```bash
pnpm test
pnpm run typecheck
```

本补丁不动状态机与评分，`ClassroomFrame` 没有单测，所以**测试数不该变**。

## 做完之后

用三句话告诉用户：项目里的 agent 现在知道怎么提交课包、怎么把学号对应的使用数据拉回 `assets/user_data/`；课堂的「回看上一段」按钮挪到了提交按钮那一排、比主按钮弱一档但一眼能看到；即使之前没打过 patch-2，只打这一个补丁也能把回看补齐。不要让用户去「重新生成整个项目」。
