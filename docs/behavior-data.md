# behavior_data：把行为数据挂到 data-demo 课包上

永久地址：https://poem.aibeaver.cn/behavior_data  
提交课包：https://poem.aibeaver.cn/mcp-how-to  
拿回使用数据：https://poem.aibeaver.cn/mcp-usage  
YAML 规范：https://poem.aibeaver.cn/dlc-spec

你的任务：**发布 `data-demo` 课包 → 把 100 份行为数据绑定到它名下 → 在 demo 目录里分析**。

**全程不改任何项目的代码**：课包直接用 zip 提交（不必解压进 `dlc/`），行为数据落在你自己新建的
demo 目录（如 `~/poem-behavior-data/`），不往任何仓库里写文件。

| 用什么 | 地址 |
| --- | --- |
| 课包 zip（zip 根上就是 `manifest.yaml`） | `https://cdn.aibeaver.cn/poem-rpg/static/behavior-data/data-demo.zip` |
| 行为数据 zip（解压即得真实落盘布局） | `https://cdn.aibeaver.cn/poem-rpg/static/behavior-data/behavior-data.zip` |
| 提交课包 | `POST https://poem.aibeaver.cn/api/ingest` |
| 对账（自己已上架的包） | `GET https://poem.aibeaver.cn/api/my-dlc?userId=hh_学号` |

## 向用户只要这一样

**userId**：`hh` + 学号，或 `hh_` + 学号，例如 `hh_11016863` / `hh11016863`。

不要问「要不要下载」「放哪个目录」「zip 在哪」—— 本页都写死了。也不要向用户要 token。

## 先理解一件事：发布后 id 会变

平台规则：上架后的 id = `manifest.id` + `-` + 规范化 userId（`src/dlc/uploadPack.ts` 的 `uploadedDlcId()`）。
本包 `manifest.id` 是 `data-demo`，所以发布后是 `data-demo-hh_11016863` 这种形式。

而数据归属是**逐字相等**判定的（`src/usage/collect.ts`：`owned.has(session.dlcId)`），
所以那 100 份会话的 `dlcId` 必须绑定成**发布结果**，写成 `data-demo` 是不算数的。

## 0. 建 demo 目录并下载两份 zip

```bash
DEMO=~/poem-behavior-data
mkdir -p "$DEMO" && cd "$DEMO"

curl -fsSL -O https://cdn.aibeaver.cn/poem-rpg/static/behavior-data/data-demo.zip
curl -fsSL -O https://cdn.aibeaver.cn/poem-rpg/static/behavior-data/behavior-data.zip
unzip -q behavior-data.zip -d "$DEMO"
```

`behavior-data.zip` 解压出来就是平台把使用数据交回本机时的布局（`src/usage/paths.ts` 的 `sessionLocalPath()`）：

```text
~/poem-behavior-data/assets/user_data/
  manifest.json                                    # 同步基线（100 条）
  data-demo/
    sessions/mock-001-c6e71c34-s-20260926-093627-9a0f200f.json
    … 共 100 份
```

文件名里的 `<玩家 slug>`（ASCII 前缀 + 用户名 sha1 前 8 位）与 `<对局 id>` 都是稳定口径，**不要改名**。

## 1. 发布课包（这一步拿到 `dlcId`）

```bash
cd "$DEMO"
unzip -p data-demo.zip manifest.yaml | head -8      # 读 id / poetId / workTitle，不要凭印象写

curl -sS -X POST https://poem.aibeaver.cn/api/ingest \
  -F userId=hh_学号 \
  -F poetId=sushi \
  -F workTitle='水调歌头·明月几时有' \
  -F zip=@data-demo.zip
```

- 返回 `{ verdict, reason?, playUrl?, pack?, issues[] }`：
  - `accept`（HTTP 200）：本轮上架，`pack.dlcId` 就是线上 id。
  - `skip`（HTTP 200）：线上已经是这份（版本 + 内容指纹都没变），**什么都没改，不要去改 YAML**；`pack.dlcId` 同样在返回里。
  - `reject`（HTTP 400）：按 `issues[].message` / `fixHint` 改 YAML 后重新打包再传。
- **把 `pack.dlcId` 记下来**（下称 `$PACK_ID`），`playUrl` 报给用户。
- 诗人 `sushi` 已在名册；篇目不在名册时审核通过会自动加。
- 若返回「user id不正确，需要咨询老师」：立刻停止并原样转告用户，不要换 id 重试。

## 2. 绑定到发布结果

只做两件事：把目录名 `data-demo` 改成 `$PACK_ID`，把文件里的 `data-demo` 字符串整体替换成 `$PACK_ID`。
下面的脚本写在 demo 目录里、只动 demo 目录里的文件，不碰任何项目：

```bash
cd "$DEMO"
PACK_ID=data-demo-hh_学号      # ← 换成上一步返回的 pack.dlcId

cat > bind.mjs <<'EOF'
// 把行为数据绑定到发布出来的课包 id：改目录名 + 整体替换 dlcId + 按改后的字节重算基线哈希。
// 只动 --root 指向的 demo 目录，不碰任何项目。
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = {};
for (let i = 2; i < process.argv.length; i += 1) {
  if (process.argv[i].startsWith("--")) args[process.argv[i].slice(2)] = process.argv[i + 1];
}
const dlcId = (args.dlc ?? "").trim();
const userId = (args.userId ?? "").trim();
const root = path.resolve(args.root ?? ".");
const from = "data-demo";

if (!dlcId || dlcId === from) {
  console.error("用法：node bind.mjs --dlc <pack.dlcId> --userId hh_学号 [--root <demo 目录>]");
  process.exit(1);
}

const baseDir = path.join(root, "assets", "user_data");
const fromDir = path.join(baseDir, from);
if (!existsSync(fromDir)) {
  if (existsSync(path.join(baseDir, dlcId))) {
    console.log(`已经绑定过 ${dlcId}，无需重复执行`);
    process.exit(0);
  }
  console.error(`找不到 ${fromDir}（--root 要指到 demo 目录）`);
  process.exit(1);
}

for (const name of readdirSync(path.join(fromDir, "sessions"))) {
  if (!name.endsWith(".json")) continue;
  const file = path.join(fromDir, "sessions", name);
  writeFileSync(file, readFileSync(file, "utf8").replaceAll(from, dlcId));
}
renameSync(fromDir, path.join(baseDir, dlcId));

const manifestPath = path.join(baseDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8").replaceAll(from, dlcId));
if (userId) manifest.userId = userId;
// id 串变长了，文件字节就变了：基线的 size / sha256 必须跟着重算，否则基线自相矛盾。
for (const file of manifest.files) {
  const body = readFileSync(path.join(baseDir, file.path));
  file.size = body.byteLength;
  file.sha256 = createHash("sha256").update(body).digest("hex");
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`已绑定 ${dlcId}：${manifest.files.length} 份会话 → assets/user_data/${dlcId}/sessions/`);
EOF

node bind.mjs --dlc "$PACK_ID" --userId hh_学号 --root "$DEMO"
```

> `replaceAll("data-demo", …)` 只会命中课包 id 本身（会话里除了 `dlcId` 没有别处出现这个串，
> 基线里的 `dlcIds` / `path` / `dlcId` 都要一起改），目标 id 本身含 `data-demo` 也不会重复替换（单遍替换）。
> 换完 id 文件字节就变了，所以基线里的 `size` / `sha256` 会按改后的文件重算一遍。
> 不必把 `dlcVersion` 改成别的：线上版本就是 manifest 里的 `1.0.1`。

## 3. 验收（四条都要过）

```bash
cd "$DEMO"
find assets/user_data -name '*.json' | wc -l                  # 101 = 100 份会话 + manifest.json
ls assets/user_data                                           # 目录名必须等于 $PACK_ID
node -e 'const fs=require("node:fs");const d=`assets/user_data/'$PACK_ID'/sessions`;const f=fs.readdirSync(d)[0];const s=JSON.parse(fs.readFileSync(`${d}/${f}`));console.log(f,s.dlcId,s.dlcVersion,s.kind)'
node -e 'const m=require("./assets/user_data/manifest.json");console.log(m.userId,m.dlcIds,m.files.length)'
```

| 检查 | 期望 |
| --- | --- |
| 会话份数 | 100（另加 1 个 `manifest.json`） |
| 目录名 | 恰好是 `$PACK_ID`（带 `-<userId>` 后缀） |
| 会话里的 `dlcId` | 等于 `$PACK_ID`；`dlcVersion` 是 `1.0.1` |
| `manifest.json` | `userId` = 你的 userId，`dlcIds` 只有 `$PACK_ID`，`files` 100 条（各带 `path/dlcId/kind/player/size/sha256`） |

## 4. 分析（就是这次的正题）

数据就在 `~/poem-behavior-data/assets/user_data/$PACK_ID/sessions/`，就地分析，别拷进项目去跑。
100 个玩家应当能算出：从开局到通关的漏斗里第 1 章流失约 **35%**、第 2/3 章各在 **5%** 以内、
进入答题后再流失约 **20%**；三道题的首答正确率约 **90% / 60% / 75%**。差得远说明绑定串了。

## 这批数据是什么

100 个虚构玩家的模拟对局（不是真实用户），对应 `data-demo` 这份课包的内容（3 章故事 + 3 道选择题），
按平台真实的会话结构（`src/sessions/recordedSession.ts` 的 `recordedSessionSchema`）生成，
每份都能被 `parseSession()` 直接解析。里面有中途退出的截断轨迹，所以能做留存分析。

## 边界与禁止

- **不往任何仓库里写东西**：不解压课包进 `dlc/`（免得被别的 agent 当成学员自己的作品重传）、
  不把数据写到项目的 `assets/user_data/`、不改任何代码。
- 把这 100 份会话再当 DLC 传上去（`docs/mcp-usage.md` 已明令）。
- 改 `dlcId` / `dlcVersion` 之外的字段（尤其别动 `id`、`sessionId`、事件时间戳）。
- 改本地文件名或目录名。
- 把 `dlcId` 写成 `data-demo`（线上 id 一定带 `-<userId>`）。
- 伪造或借用别人的 userId。

渠道不通时也别自己造轮子：`/api/ingest` 与 `/api/my-dlc` 是同源 HTTP，一直可用；
MCP（`https://poem.aibeaver.cn/mcp`）只是客户端已配好时的备选。
