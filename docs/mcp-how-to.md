# 课包提交：Agent 操作说明

永久地址：https://poem.aibeaver.cn/mcp-how-to  
提交接口（首选）：`POST https://poem.aibeaver.cn/api/ingest`  
对账 / 名册：`GET /api/my-dlc`、`GET|POST /api/roster`（同源 HTTPS）  
MCP 端点（可选）：https://poem.aibeaver.cn/mcp  
YAML 规范：https://poem.aibeaver.cn/dlc-spec

你的任务是帮学员把诗词 DLC **打包并提交审核**。先读完再动手。

## 向用户只要这一样

**userId**：`hh` + 学号，或 `hh_` + 学号，例如 `hh_11016863` / `hh11016863`

**不要再问「要传哪个包」「DLC 目录在哪」** —— 课包位置固定，下一节自己扫。也不要让用户打 zip、不要问 poetId / 诗人中文名 / 篇名（从 `manifest.yaml` 读）、不要向用户要 token。

## 传哪些包：`dlc/` 下所有合规包，跳过 `hailao-shuidiao`

课包固定在**项目根**的 `dlc/` 下，包根 = **直接含 `manifest.yaml` 的那一层**（层级不限，如 `dlc/sushi/shuidiao-getou/<pack>/`）。一次把所有合规包都传上去：

```bash
find dlc -name manifest.yaml      # 每个命中目录就是一个包根
```

- 没有 `manifest.yaml` 的目录（草稿、`assets/`）直接跳过，不必报错。
- **跳过 `hailao-shuidiao`**：那是课堂课包，不归学员 —— **名字就是判据**（目录名或 `manifest.yaml` 里的 `id` 都算）。**别只按 `src/dlc/unpublished.ts` 的 `UNPUBLISHED_DLC_IDS` 判断**：那份名单各仓库不同，扣子版是空集，只认它就会漏；名单里另有 id 时也一并跳过。传上去等于把老师的课包挂到学员 id 下 —— 服务端只挡精确 id 冲突，**挡不住这种挂靠**，所以必须由你不传。
- 只有用户明确点名「只传某一个包」时，才只传那一个。
- 多个包 = 多轮提交，逐个走下面的流程。**提交前先对账**（见下一节），没变的包不用传。

包内典型结构（zip 解开后，根目录或唯一子目录里必须能看到 `manifest.yaml`；优先打成 zip 根上就是 `manifest.yaml`）：

```text
manifest.yaml
content/story.yaml
content/poem.yaml
content/quiz.yaml
assets/portraits/…
assets/backgrounds/…
```

诗人头像是公共资源，**不要放进 zip**。

## 先对账：哪些包根本不用重传

`GET https://poem.aibeaver.cn/api/my-dlc?userId=hh_学号` → `{ userId, nickname, dlcs[{ dlcId, poetId, workTitle, version, uploadedAt, playUrl }] }`（MCP 侧等价物是 `list_my_dlc`，返回同样的字段）。

把本地每个包的 `manifest.version` 与它对一遍：**版本一致、内容也没动过的直接跳过不传**，只提交新增或改过的包。对账只是省流量 —— 传了也不会重复上架：服务端拿「版本 + 内容指纹」比对，没变就返回 `skip`（见下）。

## 提交通道：优先同源 HTTP，不需要任何客户端配置

**首选 `POST https://poem.aibeaver.cn/api/ingest`。** 同源、无 token，`userId` 就是唯一凭证，multipart 和 JSON 两种都收：

```bash
curl -sS -X POST https://poem.aibeaver.cn/api/ingest \
  -F userId=hh_11016863 \
  -F poetId=sushi \
  -F workTitle='水调歌头・明月几时有' \
  -F zip=@/tmp/poem-dlc-pack.zip
```

JSON 形式：`{"userId":"…","poetId":"…","workTitle":"…","zipBase64":"…"}`（`zipBase64` 可带 `data:application/zip;base64,` 前缀）。

返回 `{ verdict, reason?, playUrl?, pack?, issues[] }`，三态只对两个 HTTP 码：

- `accept` → HTTP **200**：本轮通过审核并（重新）上架。
- `skip` → HTTP **200**：**与线上那份的「版本 + 内容指纹」都一样，服务端什么都没做**（线上保持原样，还省掉几分钟评审）。把 `playUrl` 照常报给用户，**不要改 YAML**；`reason` 会说明原因。
- `reject` → HTTP **400**：body 就是同一份 `issues`，按它改 YAML 再传。**只有 reject 才是 400**。

**名册也有 HTTP 端点** —— 新诗人不必去配 MCP：

```bash
# 看诗人与篇目（= MCP 的 list_roster）
curl -sS "https://poem.aibeaver.cn/api/roster?userId=hh_11016863"

# 新建 / 更新诗人（含头像，= MCP 的 upsert_poet）；multipart 或 JSON 都收
curl -sS -X POST https://poem.aibeaver.cn/api/roster \
  -F userId=hh_11016863 -F poetId=dufu -F poet=杜甫 -F portrait=@dufu.webp
# JSON 形式：{ "userId": …, "poetId": …, "poet": …, "portraitBase64": … }
```

头像要求：正方形 png/jpg/webp、边长 512–1024px、不超过 2MB（服务端转 webp 落 CDN）。**只有新增篇目（`upsert_work`）没有 HTTP 端点，也不需要**：篇目不在名册时 `POST /api/ingest` 审核通过会自动加。

## 可选：走 MCP（客户端已配好时才用）

远程 MCP `https://poem.aibeaver.cn/mcp` —— **不在学员的项目里、也不在本机**，别去找端口、进程或本地脚本。

- 它只认 `POST`：`GET` 固定 **405**，缺 `Accept: application/json, text/event-stream` 会 **406**，响应是 SSE 帧（`event: message` + 一行 `data: {...}`）。**MCP 不通不代表平台故障** —— 上面那条 HTTP 一直可用，换了通道再试即可。
- **工具列表里看不到 `list_roster` / `ingest_dlc`** 时，说明调用方还没配置它：把下面的配置交给用户，让他加进自己 agent 客户端，**重连会话**后再发起请求（工具清单只在建立连接时拉取，改完不重连不生效）。Cursor 配置：

```json
{
  "mcpServers": {
    "poem-dlc-ingest": {
      "url": "https://poem.aibeaver.cn/mcp"
    }
  }
}
```

工具名：`list_roster`、`upsert_poet`、`upsert_work`、`ingest_dlc`、`list_my_dlc`、`usage_manifest`、`download_usage_files`。

每个请求都必须带学员 `userId`。格式不对或不在 L2 在读名单，会返回「user id不正确，需要咨询老师」。

## 标准流程

每个包都走一遍；多个包就是多轮，互不影响。

### 1. 读 manifest，自己填参数

从 `manifest.yaml` 读取：

- `poetId`
- `workTitle`
- `poet` → 新建诗人时才用（只有 MCP 有这一步）

### 2. 你来打包 zip（用户不包）

排除 `.DS_Store`、`.git`、`node_modules`、`__MACOSX`。体积 ≤ 30MB。

```bash
PACK="dlc/sushi/shuidiao-getou/<pack>"     # 就是上面 find 命中的那个包根
OUT="/tmp/poem-dlc-pack.zip"
rm -f "$OUT"
(cd "$PACK" && zip -r "$OUT" . -x "*.DS_Store" -x "**/.git/**" -x "**/node_modules/**" -x "__MACOSX/**")
```

### 3. 提交

**走 HTTP**（上一节那条 curl，或 JSON 形式传 zip 的 base64），最省事，也不需要用户改任何配置。提交前两件事：

1. 按「先对账」比对版本，没变的包直接跳过（传了也没关系 —— 服务端会返回 `skip` 而不是重复上架）。
2. `GET /api/roster` 确认诗人已在名册；不在就先 `POST /api/roster` 把诗人与头像建好，否则这次提交会被拒成「诗人不在名册中」。

只有客户端**已经配好 MCP** 时才走 MCP，顺序是 `list_roster` →（诗人不在名册时）`upsert_poet` → `ingest_dlc`：

```json
{ "name": "list_roster", "arguments": { "userId": "hh_学号" } }
```

若返回 **「user id不正确，需要咨询老师」**：立刻停止，把这句话原样告诉用户，不要换别的 id 重试。

若 `poetId` 不在名册：先 `upsert_poet`。头像须为正方形 png/jpg/webp，边长 512–1024px，≤ 2MB。按这个顺序找，**不要让用户打 zip**：

1. pack 根或上一级的 `portrait.png` / `portrait.jpg` / `portrait.webp`
2. 同名 `{poetId}.png` / `.jpg` / `.webp`
3. 仍没有：只再问用户「诗人头像文件路径」

头像用 base64 传 `portraitBase64`：

```json
{
  "name": "upsert_poet",
  "arguments": {
    "userId": "hh_学号",
    "poetId": "sushi",
    "poet": "苏轼",
    "portraitBase64": "<头像 base64>"
  }
}
```

篇目不在名册时不必先 `upsert_work`，审核通过会自动加。最后提交：

```json
{
  "name": "ingest_dlc",
  "arguments": {
    "userId": "hh_学号",
    "poetId": "sushi",
    "workTitle": "水调歌头・明月几时有",
    "zipBase64": "<zip 的 base64>"
  }
}
```

两条通道的提交是同一次审核，可能几分钟（机器校验 + Codex 对照 spec），不要中途取消。

### 4. 看返回

- `verdict: accept`：把 `playUrl` 给用户，这个包结束。
- `verdict: skip`：**线上已经是这份，没做任何改动**（版本与内容指纹都一样）。把 `playUrl` 报给用户，**别去改 YAML**。
- `verdict: reject`：按 `issues[].message` 和 `fixHint` 改 YAML（对照 https://poem.aibeaver.cn/dlc-spec），**你自己重新打包 zip** 再提交。不要让用户手动重压。
- 「诗人不在名册中」：先 `POST /api/roster` 建诗人与头像再重传（MCP 侧的等价物是 `upsert_poet`）。
- 用户 id 错误：停止，咨询老师。

多个包时，最后按包逐个汇报：包路径 → 版本 → `accept`（新上架）/ `skip`（已是最新）/ `reject`（待改）→ `playUrl` 或要改的 `issues`。别只报一个笼统的「都传完了」。

同一 `userId` + 同一 short-id 会覆盖你上次的包。别人用同一个教学 short-id 互不影响；线上试玩地址是 `/play/{short-id}-{userId}`。

## 禁止

- 向用户只要 zip、poetId、篇名（除非 manifest 缺失）
- 把 `hailao-shuidiao`（或 `src/dlc/unpublished.ts` 名单里的任何包）当学员的包传上去
- 伪造或借用别人的 userId
- 忽略 blocking issue 反复硬传
- 把诗人头像塞进 DLC zip
