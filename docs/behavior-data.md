# behavior_data：把行为数据挂到 data-demo 课包上

永久地址：https://poem.aibeaver.cn/behavior_data  
提交课包：https://poem.aibeaver.cn/mcp-how-to  
拿回使用数据：https://poem.aibeaver.cn/mcp-usage  
YAML 规范：https://poem.aibeaver.cn/dlc-spec

**发布课包这一步老师已经在课上做过**（会给你一张截图）。你要做的是三件事：
**从截图读出 `pack.dlcId` → 把 100 份行为数据绑定到它名下 → 在 demo 目录里分析**。

**全程不改任何项目的代码**：行为数据落在你自己新建的 demo 目录（如 `~/poem-behavior-data/`），
不往任何仓库里写文件；课包也不需要你下载或提交。

| 你要用的东西 | 地址 |
| --- | --- |
| 行为数据 zip（解压即得真实落盘布局） | `https://cdn.aibeaver.cn/poem-rpg/static/behavior-data/behavior-data.zip` |
| 对账（老师若没给截图时用） | `GET https://poem.aibeaver.cn/api/my-dlc?userId=hh_学号` |

## 只需要一样东西：老师给的截图

截图是**老师提交课包时接口的返回**，长这样（节选）：

```json
{
  "verdict": "accept",
  "playUrl": "https://poem.aibeaver.cn/play/data-demo-hh_11016863",
  "pack": { "dlcId": "data-demo-hh_11016863", "poetId": "sushi", "version": "1.0.1" }
}
```

- 要读的字段只有一个：**`pack.dlcId`**（形如 `data-demo-hh_11016863`）。
- **userId 就是它 `data-demo-` 后面的那一段**（这里 `hh_11016863`），不用再向用户要。
- 不要向用户要 token；老师还没给截图时，就向他要这一张（或按附录第 2 条自己对账）。

## 0. 建 demo 目录并解压行为数据

```bash
DEMO=~/poem-behavior-data
mkdir -p "$DEMO" && cd "$DEMO"

curl -fsSL -O https://cdn.aibeaver.cn/poem-rpg/static/behavior-data/behavior-data.zip
unzip -q behavior-data.zip -d "$DEMO"
```

解压出来就是平台把使用数据交回本机时的布局（`src/usage/paths.ts` 的 `sessionLocalPath()`）：

```text
~/poem-behavior-data/assets/user_data/
  manifest.json                                    # 同步基线（100 条）
  data-demo/
    sessions/mock-001-c6e71c34-s-20260926-093627-9a0f200f.json
    … 共 100 份
```

文件名里的 `<玩家 slug>`（ASCII 前缀 + 用户名 sha1 前 8 位）与 `<对局 id>` 都是稳定口径，**不要改名**。

## 1. 绑定到发布结果

只做两件事：把目录名 `data-demo` 改成 `$PACK_ID`，把文件里的 `data-demo` 字符串整体替换成 `$PACK_ID`。
下面的脚本写在 demo 目录里、只动 demo 目录里的文件，不碰任何项目：

```bash
cd "$DEMO"
PACK_ID=data-demo-hh_学号      # ← 换成老师截图里 pack.dlcId 那个值
USER_ID=${PACK_ID#data-demo-}  # userId 就是后缀，不用另外问

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

node bind.mjs --dlc "$PACK_ID" --userId "$USER_ID" --root "$DEMO"
```

> `replaceAll("data-demo", …)` 只会命中课包 id 本身（会话里除了 `dlcId` 没有别处出现这个串，
> 基线里的 `dlcIds` / `path` / `dlcId` 都要一起改），目标 id 本身含 `data-demo` 也不会重复替换（单遍替换）。
> 换完 id 文件字节就变了，所以基线里的 `size` / `sha256` 会按改后的文件重算一遍。
> 不必把 `dlcVersion` 改成别的：线上版本就是课包里的 `1.0.1`。

## 2. 验收（四条都要过）

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
| 目录名 | 恰好是 `$PACK_ID`（形如 `data-demo-hh_11016863`） |
| 会话里的 `dlcId` | 等于 `$PACK_ID`；`dlcVersion` 是 `1.0.1` |
| `manifest.json` | `userId` = `$USER_ID`，`dlcIds` 只有 `$PACK_ID`，`files` 100 条（各带 `path/dlcId/kind/player/size/sha256`） |

## 3. 分析（就是这次的正题）

数据就在 `~/poem-behavior-data/assets/user_data/$PACK_ID/sessions/`，就地分析，别拷进项目去跑。
100 个玩家应当能算出：从开局到通关的漏斗里第 1 章流失约 **35%**、第 2/3 章各在 **5%** 以内、
进入答题后再流失约 **20%**；三道题的首答正确率约 **90% / 60% / 75%**。差得远说明绑定串了。

## 附录：发布这一步（老师已在课上做过，你不用跑）

1. **课包 zip**（zip 根上就是 `manifest.yaml`，`id: data-demo`）：
   `https://cdn.aibeaver.cn/poem-rpg/static/behavior-data/data-demo.zip`
2. 老师执行的是同源 HTTP 提交（不需要解压进任何项目，也不必走 MCP）：

```bash
curl -sS -X POST https://poem.aibeaver.cn/api/ingest \
  -F userId=hh_学号 -F poetId=sushi -F workTitle='水调歌头·明月几时有' -F zip=@data-demo.zip
# → { verdict, reason?, playUrl?, pack?, issues[] }
#   accept / skip 都是 200 且都带 pack.dlcId；只有 reject 是 400（按 issues 改 YAML 再来）
```

3. **为什么数据里的 `dlcId` 必须等于 `pack.dlcId`**：平台规则是上架 id = `manifest.id` + `-` + 规范化
   userId（`src/dlc/uploadPack.ts` 的 `uploadedDlcId()`），本包 `manifest.id` 是 `data-demo`，
   所以线上 id 形如 `data-demo-hh_11016863`。而数据归属是**逐字相等**判定的
   （`src/usage/collect.ts`：`owned.has(session.dlcId)`），写成 `data-demo` 是不算数的。
4. 老师没给截图时，用对账接口自己查（字段与截图里的 `pack` 一致）：

```bash
curl -sS "https://poem.aibeaver.cn/api/my-dlc?userId=hh_学号"
```

## 这批数据是什么

100 个虚构玩家的模拟对局（不是真实用户），对应 `data-demo` 这份课包的内容（3 章故事 + 3 道选择题），
按平台真实的会话结构（`src/sessions/recordedSession.ts` 的 `recordedSessionSchema`）生成，
每份都能被 `parseSession()` 直接解析。里面有中途退出的截断轨迹，所以能做留存分析。

## 边界与禁止

- **不往任何仓库里写东西**：不把数据写到项目的 `assets/user_data/`、不改任何代码。
- 把这 100 份会话再当 DLC 传上去（`docs/mcp-usage.md` 已明令）。
- 改 `dlcId` / `dlcVersion` 之外的字段（尤其别动 `id`、`sessionId`、事件时间戳）。
- 改本地文件名或目录名。
- 把 `dlcId` 写成 `data-demo`（线上 id 一定带 `-<userId>`）。
- 伪造或借用别人的 userId。

渠道不通时也别自己造轮子：`/api/ingest` 与 `/api/my-dlc` 是同源 HTTP，一直可用；
MCP（`https://poem.aibeaver.cn/mcp`）只是客户端已配好时的备选。
