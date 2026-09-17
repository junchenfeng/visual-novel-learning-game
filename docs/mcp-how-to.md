# poem-dlc-ingest：Agent 操作说明

永久地址：https://poem.aibeaver.cn/mcp-how-to  
MCP 地址：https://poem.aibeaver.cn/mcp  
YAML 规范：https://poem.aibeaver.cn/dlc-spec

你的任务是帮学员把诗词 DLC **打包并提交审核**。先读完再动手。

## 向用户只要这两样

1. **userId**：`hh` + 学号，或 `hh_` + 学号，例如 `hh_11016863` / `hh11016863`
2. **DLC 目录**：本机文件夹路径（里面应有 `manifest.yaml`）

不要让用户自己打 zip。不要问 poetId、诗人中文名、篇名——从 `manifest.yaml` 读。不要向用户要 token。

## 连接 MCP

这是**远程 MCP 服务** `https://poem.aibeaver.cn/mcp`，**不在学员的项目里、也不在本机** —— 不要去找端口、进程或本地脚本。远程不用 token，用学员 `userId` 开门。

**工具列表里看不到 `list_roster` / `ingest_dlc`** 时，说明调用方还没配置它：把下面的配置交给用户，让他加进自己 agent 客户端，再重新发起请求。Cursor 配置：

```json
{
  "mcpServers": {
    "poem-dlc-ingest": {
      "url": "https://poem.aibeaver.cn/mcp"
    }
  }
}
```

每个工具调用都必须带学员 `userId`。格式不对或不在 L2 在读名单，工具会返回「user id不正确，需要咨询老师」。

## 标准流程

### 1. 找到 pack 根目录

用户给的路径可能是包根，也可能是上层文件夹。pack 根目录 = **直接包含 `manifest.yaml` 的那一层**。

可以有一层包裹文件夹，但 zip 解开后必须能在根目录或唯一子目录里看到 `manifest.yaml`。优先打成：**zip 根上就是 `manifest.yaml`**。

典型结构：

```text
manifest.yaml
content/story.yaml
content/poem.yaml
content/quiz.yaml
assets/portraits/…
assets/backgrounds/…
```

诗人头像是公共资源，**不要放进 zip**。

### 2. 读 manifest，自己填参数

从 `manifest.yaml` 读取：

- `poetId` → `ingest_dlc.poetId`
- `workTitle` → `ingest_dlc.workTitle`
- `poet` → 新建诗人时给 `upsert_poet.poet`

### 3. 你来打包 zip（用户不包）

排除 `.DS_Store`、`.git`、`node_modules`、`__MACOSX`。体积 ≤ 30MB。

```bash
PACK="/用户给的/pack根目录"
OUT="/tmp/poem-dlc-pack.zip"
rm -f "$OUT"
(cd "$PACK" && zip -r "$OUT" . -x "*.DS_Store" -x "**/.git/**" -x "**/node_modules/**" -x "__MACOSX/**")
```

- 把 zip 编成 base64，调用 `ingest_dlc` 的 `zipBase64`（可带 `data:application/zip;base64,` 前缀）

### 4. 调工具

先：

```json
{ "name": "list_roster", "arguments": { "userId": "hh_学号" } }
```

若返回 **「user id不正确，需要咨询老师」**：立刻停止，把这句话原样告诉用户，不要换别的 id 重试。

若 `poetId` 不在名册：先 `upsert_poet`。头像须为正方形 png/jpg/webp，边长 512–1024px，≤ 2MB。按这个顺序找，**不要让用户打 zip**：

1. pack 根或上一级的 `portrait.png` / `portrait.jpg` / `portrait.webp`
2. 同名 `{poetId}.png` / `.jpg` / `.webp`
3. 仍没有：只再问用户「诗人头像文件路径」

头像用 base64 传 `portraitBase64`。

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

篇目不在名册时不必先 `upsert_work`，审核通过会自动加。

然后提交：

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

审核可能要几分钟（机器校验 + Codex 对照 spec），不要中途取消。

### 5. 看返回

- `verdict: accept`：把 `playUrl` 给用户，提交结束。
- `verdict: reject`：按 `issues[].message` 和 `fixHint` 改 YAML（对照 https://poem.aibeaver.cn/dlc-spec），**你自己重新打包 zip** 再 `ingest_dlc`。不要让用户手动重压。
- 用户 id 错误：停止，咨询老师。

同一 `userId` + 同一 short-id 会覆盖你上次的包。别人用同一个教学 short-id 互不影响；线上试玩地址是 `/play/{short-id}-{userId}`。

## 禁止

- 向用户只要 zip、poetId、篇名（除非 manifest 缺失）
- 伪造或借用别人的 userId
- 忽略 blocking issue 反复硬传
- 把诗人头像塞进 DLC zip
