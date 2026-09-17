# patch-1：把现有引擎对齐解谜关

永久地址：https://poem.aibeaver.cn/patch-1  
YAML 规范：https://poem.aibeaver.cn/dlc-spec  
提交课包：https://poem.aibeaver.cn/mcp-how-to

你的任务是改**学员已有的游戏代码**（扣子项目 / 本机 fork），让它能跑 nova-demo 新增的解谜关。先读完再动手。不要重写引擎，不要改课堂问答，不要把参考课包的剧情文案抄进学员包。

## 这是什么改动

nova-demo 在故事阶段加了三件可选能力，全部向前兼容：旧课包不写这些字段，行为必须和以前一模一样。

| 能力 | 作用 | 不配会怎样 |
| --- | --- | --- |
| `type: explore` 解谜关 | 故事中间点物件找线索，找齐全部**有效**线索才能继续 | 故事仍只有旁白 / 史实 / 选择 / 失败 `gameOver` |
| 真结局 `gameOver.endingId` | 合卷后进入彩蛋或读词，不是「重新选择」 | 无 `endingId` 的 `gameOver` 仍是失败死路 |
| `easterEgg.kind: fill-in` | 故事结束到读词之间的填词小游戏 | 不写 `easterEgg` 时，最后一页只有「开始读词」，没有「这是什么？」 |

`schemaVersion` 仍是 `1`。不要另开版本号来「开关」这三件事。

## 动手前先判断

在学员项目里搜 `exploreNodeSchema`、`ExplorePhase`、`FillInGame`、`ENDING_CONTINUE`。

- **四处都有**：引擎已对齐。只检查学员 `story.yaml` / `manifest.yaml` 是否要用解谜关；YAML 对照 https://poem.aibeaver.cn/dlc-spec。
- **缺任意一处**：按下面改代码。改完再动 YAML。
- **仓库课包 `hailao-shuidiao`**：回归夹具，不要给它加 explore / easterEgg / endings。

## 禁止

- 重写 `gameMachine`、换状态库、把解谜做成独立路由
- 改 `quiz.yaml` / 课堂评分 / 总结页来「配合」解谜
- 把解谜关设成 `startStoryNodeId`
- 让旁白、史实、探索直接跳进**没有** `endingId` 的失败 `gameOver`
- 要求所有课包都必须有 `easterEgg` 或 `endings`
- 向用户要「要不要重做整个游戏」——默认在现有代码上打补丁

## 改哪些文件

**新建（整文件拷贝或按行为实现）：**

| 路径 | 职责 |
| --- | --- |
| `src/components/phases/ExplorePhase.tsx` | 解谜关 UI |
| `src/components/phases/explore.module.css` | 物件格、红戳、解说遮罩 |
| `src/easter-egg/FillInGame.tsx` | 填词彩蛋 |
| `src/easter-egg/fill-in.module.css` | 填词样式 |

若学员项目还没有 `src/easter-egg/`，连同 `EasterEggHost.tsx`、`PlaceholderEasterEgg.tsx`、`registry.ts`、`types.ts` 一起补上。`kind` 必须能解析 `placeholder` 和 `fill-in`。

**改现有文件（最小补丁）：**

| 路径 | 改什么 |
| --- | --- |
| `src/dlc/schema.ts` | explore 节点、真结局、`fill-in`、辅助函数 |
| `src/dlc/graphValidator.ts` | explore 出边、起始限制、真结局可达 |
| `src/game/gameMachine.ts` | 探索事件、真结局继续、彩蛋状态 |
| `src/components/GamePlayer.tsx` | 挂 ExplorePhase / 真结局弹窗 / 彩蛋页 |
| `src/components/GameOverModal.tsx` | 失败 vs 真结局两套文案 |
| `src/components/GameViewport.tsx` | `data-game-overlay-root` 给解说弹层 |
| `src/components/phases/StoryPhase.tsx` | 仅当配置了 `easterEgg` 才显示「这是什么？」 |
| `src/easter-egg/registry.ts` | 登记 `fill-in` |
| `src/analytics/eventSchema.ts` | `story.explore_tap` / `story.explore_done` / `story.ending_continue` |
| `src/components/game-over.module.css` | `.endingCard` / `.endingSeal` / `.endingTitle` |

编译器 `parser.ts` 只要走现有 `storySchema` + `validateStoryGraph`，**不必**为 explore 单开解析分支。

有 git 对照时，参考本仓库 `main` 里上述路径，不要凭记忆重写 CSS。

---

## 1. Schema：让 YAML 能编过

`src/dlc/schema.ts` 必须同时满足：

1. `storyNodeSchema` 是 `type` 上的 discriminated union，成员包含 `explore`。
2. `gameOver` 节点有可选 `endingId`。
3. `manifest.easterEgg` 可选；`kind` 枚举含 `"placeholder"` 和 `"fill-in"`。
4. `manifest.endings` 默认 `[]`。

探索物件与节点：

```ts
export const exploreObjectSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  hint: z.string().optional(),
  memory: z.string().min(1),
  valid: z.boolean().default(true),
  icon: z.string().optional(),
  attrs: attrsDeltaSchema.optional(),
});

export const exploreNodeSchema = z
  .object({
    id: idSchema,
    type: z.literal("explore"),
    chapter: z.number().int().positive(),
    chapterTitle: z.string().min(1),
    text: z.string().min(1),
    objects: z.array(exploreObjectSchema).min(1),
    hiddenReward: z.string().optional(),
    nextNodeId: idSchema, // 必填
    speaker: z.string().optional(),
    portrait: idSchema.optional(),
  })
  .superRefine((node, ctx) => {
    // 物件 id 不能重复
    // 至少一条 valid !== false 的有效线索
  });
```

`valid` 缺省为 `true`。`attrs` 只记录，不驱动分支。

辅助函数（状态机和 UI 都要用）：

```ts
export function validExploreObjectIds(node: ExploreNode): string[] {
  return node.objects.filter((obj) => obj.valid).map((obj) => obj.id);
}

export function hasFoundAllValidClues(node: ExploreNode, tappedIds: string[]): boolean {
  const tapped = new Set(tappedIds);
  return validExploreObjectIds(node).every((id) => tapped.has(id));
}
```

彩蛋：

```ts
export const EASTER_EGG_KINDS = ["placeholder", "fill-in"] as const;

export const easterEggSchema = z.object({
  kind: z.enum(EASTER_EGG_KINDS),
  title: z.string().min(1).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
});
```

未知 `kind` 必须编不过。`fill-in` 的空格在 `params.blanks`，运行时读取，schema 不必把 blanks 写死成 zod 对象。

把 `exploreNodeSchema` 加进 `storyNodeSchema` 后，导出 `ExploreNode` / `ExploreObject` / `EndingMeta` 类型。

---

## 2. 剧情图校验

改 `src/dlc/graphValidator.ts` 的 `outgoingIds`：

- `narration` / `fact`：有 `nextNodeId` 则一条出边，否则结束。
- `explore`：固定一条出边 `nextNodeId`。
- `gameOver`：无出边。
- `choice`：每个选项的 `nextNodeId`。

硬规则（编不过就停，按报错改 YAML，不要放宽校验）：

- 起始节点不能是 `gameOver`，也不能是 `explore`。
- 旁白、史实、探索不能指向**没有** `endingId` 的失败 `gameOver`；带 `endingId` 的真结局可以。
- `explore` 的出边参与可达性与无环检查。
- `choice` 写了 `convergesTo`：正路必须汇合；指向任意 `gameOver` 的选项免做汇合检查。
- `choice` **省略** `convergesTo`：每条分支必须到达带 `endingId` 的真结局。

---

## 3. 状态机

改 `src/game/gameMachine.ts`。`story` 仍是同一状态；解谜不是新的顶层 phase。

**context 增加：**

- `exploredObjectIds: string[]`（初始 `[]`）
- `exploreHiddenUnlocked: boolean`（初始 `false`）

**事件增加：**

- `{ type: "EXPLORE_TAP"; objectId: string }`
- `{ type: "EXPLORE_CONTINUE" }`
- `{ type: "ENDING_CONTINUE" }`
- 若还没有：`ENTER_EASTER_EGG` / `EASTER_EGG_DONE`

**guards：**

| 名字 | 条件 |
| --- | --- |
| `canContinue` | 当前是 `narration` 或 `fact`（**不要**包含 explore） |
| `isExplore` | `type === "explore"` |
| `canFinishExplore` | 当前是 explore 且 `hasFoundAllValidClues` |
| `isEndingNode` | `gameOver` 且有 `endingId` |
| `isFailGameOver` | `gameOver` 且没有 `endingId` |
| `hasEasterEgg` | `Boolean(manifest.easterEgg)` |

`REPLAY_CHOICE` 只给失败 `gameOver` 用（`isFailGameOver`），真结局不能重选。

**actions：**

- `tapExploreObject`：同一物件只记一次；更新 `exploredObjectIds`；找齐有效线索后把 `exploreHiddenUnlocked` 设为 true。
- `queueExploreNext`：`pendingNodeId = node.nextNodeId`，`pendingPhase = "story"`，并清空两套探索字段。
- `queueEndingContinue`：`pendingPhase` 有彩蛋则 `"easterEgg"`，否则 `"poem"`。

**story 上的事件：**

```
EXPLORE_TAP        → 不切页，只 tapExploreObject
EXPLORE_CONTINUE   → guard canFinishExplore → pageTransition → queueExploreNext
ENDING_CONTINUE    → guard isEndingNode → pageTransition → queueEndingContinue
ENTER_EASTER_EGG   → guard isStoryEnd AND hasEasterEgg
```

`pageTransition` 的 `TRANSITION_DONE` 要能进 `easterEgg` 状态。彩蛋里 `EASTER_EGG_DONE` 再进读词。

过关条件：**全部有效线索**都点过即可继续。错误线索可点可不点。未找齐时 `EXPLORE_CONTINUE` 必须留在当前节点。

---

## 4. UI 接线

### GameViewport

画布节点加 `data-game-overlay-root`。线索解说用 portal 挂到这里，避免被书页裁切。

### GamePlayer

1. `node.type === "explore"` 时渲染 `ExplorePhase`，不要走 `StoryPhase`。
2. `StoryPhase` 排除 `gameOver` 和 `explore`。
3. 传给 ExplorePhase：
   - `tappedIds={context.exploredObjectIds}`
   - `hiddenUnlocked={context.exploreHiddenUnlocked}`
   - `onTapObject` → 打点 `story.explore_tap` 后 `send({ type: "EXPLORE_TAP", objectId })`
   - `onContinue` → 打点 `story.explore_done` 后 `send({ type: "EXPLORE_CONTINUE" })`
4. 真结局：`gameOver` 且有 `endingId` 时，弹窗按钮发 `ENDING_CONTINUE`，不要 `REPLAY_CHOICE`。标题从 `manifest.endings` 按 `endingId` 取 `title`。
5. `snapshot.matches("easterEgg") && manifest.easterEgg` 时渲染 `EasterEggHost`，`onDone` 发 `EASTER_EGG_DONE`。
6. `hasEasterEgg={Boolean(dlc.manifest.easterEgg)}` 传给 `StoryPhase`。

### ExplorePhase 行为（必须对齐）

- 展示 `node.text` 和全部 `objects`（`name` + 可选 `hint`）。
- 进度文案：`点开物件，辨认哪些才是有效线索（已找到有效数 / 有效总数）`。
- 点击物件：弹出解说，正文是 `memory`，打字机效果；点「知道了」才关。
- **有效**线索：盖红戳「有效」，可再点重看。
- **错误**线索：置灰，不能再点。
- 找齐有效线索并关掉当前解说后，若有 `hiddenReward`，再弹一次「隐藏回忆」。
- 主按钮：未找齐显示「再看看……」且 disabled；找齐且无未关弹层后变成「继续前行」。
- 测试 id：`explore-object-{id}`、`explore-memory`、`explore-memory-close`、`explore-continue`。
- 按钮带 `data-valid` / `data-tapped`。

### GameOverModal

| | 失败（无 endingId） | 真结局（有 endingId） |
| --- | --- | --- |
| 印 | 止 | 终 |
| 标题 | 此路不通 | `endingTitle`，缺省「一阕终章」 |
| 按钮 | 回到岔路，重新选择 | 合卷沉思，开始读词 |
| 测试 id | `gameover-replay` | `gameover-continue` |

### StoryPhase 最后一页

旁白/史实省略 `nextNodeId` 时：

- 主按钮永远是「开始读词」→ `CONTINUE`
- **只有** `hasEasterEgg === true` 才多出次按钮「这是什么？」→ `ENTER_EASTER_EGG`
- 未配彩蛋时不要渲染这颗按钮

### FillInGame

读 `config.params.blanks[]`：

```yaml
- prefix: "明月几时有，把酒问"
  suffix: "。"
  correct: 青天
  options: [青天, 苍天, 长天, 远天]
```

- 每空最多用 4 个 options。
- 未全部选完不能「落笔定稿」。
- 提交后无论对错都显示正确答案，再点「开始读词」结束彩蛋。
- 彩蛋对错**不进**课堂评分。
- 测试 id：`fill-in-stage`、`fill-in-submit`、`easter-egg-done`。

`registry.ts`：

```ts
export const EASTER_EGG_REGISTRY = {
  placeholder: PlaceholderEasterEgg,
  "fill-in": FillInGame,
};
```

---

## 5. 学员课包 YAML（引擎对齐之后）

字段全文以 https://poem.aibeaver.cn/dlc-spec 为准。这里只写解谜关最小接法。

把解谜插在故事**中间**，前面必须是旁白或史实：

```yaml
- id: s07_walk
  type: narration
  chapter: 2
  chapterTitle: 庭院
  text: 你决定在院子里走走。
  nextNodeId: s08_explore

- id: s08_explore
  type: explore
  chapter: 2
  chapterTitle: 中秋夜·四下走走
  text: 月光如水，每一样物件都藏着一段回忆。
  nextNodeId: s09_after
  objects:
    - id: moon
      name: 明月
      hint: 挂在天上
      memory: 你想起小时候和子由一起赏月。
      valid: true
    - id: robe
      name: 旧官袍
      hint: 搭在椅背上
      memory: 这件官袍已经旧了。
      valid: false
  hiddenReward: 你忽然明白……    # 可选

- id: s09_after
  type: narration
  chapter: 2
  chapterTitle: 大醉
  text: 你回到亭子里。
  nextNodeId: s10_choice
```

过关 = 找齐全部 `valid: true`。错误线索可点可不点。

真结局（可选）：

```yaml
# manifest.yaml
endings:
  - endingId: ending_changjiu
    title: 但愿人长久

# story.yaml
- id: ch_end
  type: gameOver
  chapter: 3
  chapterTitle: 终章
  text: 这一夜的月，够你想很久。
  endingId: ending_changjiu
```

填词彩蛋（可选，写在 `manifest.yaml`）：

```yaml
easterEgg:
  kind: fill-in
  title: 补全心中那阕词
  params:
    blanks:
      - prefix: "明月几时有，把酒问"
        suffix: "。"
        correct: 青天
        options: [青天, 苍天, 长天, 远天]
```

改故事或题目后升高 `manifest.yaml` 的 `version`。

---

## 6. 验收

在学员项目根目录：

```bash
pnpm run compile:dlc
pnpm test
pnpm run typecheck
```

必须为真：

1. 旧课包（无 explore / 无 easterEgg / 无 endings）编译通过，最后一页只有「开始读词」。
2. 未找齐有效线索时不能离开 explore。
3. 只点错误线索不能过关。
4. 真结局按钮进入彩蛋或读词，不是回到选项。
5. 未配 `easterEgg` 时发 `ENTER_EASTER_EGG` 必须留在 story。
6. TypeScript 不报 `StoryNode` 缺少 `explore` 分支。

本地试玩：进带 `type: explore` 的节点，点物件 → 看解说 → 找齐有效线索 → 「继续前行」走到 `nextNodeId`。

## 做完之后

把改动说明用三句话告诉用户：引擎已能跑解谜关、旧课包不受影响、若课包要加解谜还需要改哪份 YAML。不要让用户去「重新生成整个项目」。
