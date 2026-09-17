# patch-2：课堂回看、读词节奏、分阶段 BGM

永久地址：https://poem.aibeaver.cn/patch  
本补丁：https://poem.aibeaver.cn/patch-2  
YAML 规范：https://poem.aibeaver.cn/dlc-spec  
提交课包：https://poem.aibeaver.cn/mcp-how-to

你是在 patch-1 的基础上继续改**学员已有的游戏代码**。三件事，全部向前兼容：旧课包不写新字段，行为必须和以前一模一样。

| 能力 | 作用 | 不配会怎样 |
| --- | --- | --- |
| 课堂「回看上一段」 | 同学发言 / 作答环节可回退到上一段，回退后打字机从头重播 | 问答只能往前走 |
| 读词节奏控制 | 每进入一句锁定 3 秒，期间「下一句」与空格键禁用，按钮内环形饼图读秒 | 可以连点跳读 |
| 分阶段 BGM | `assets.music` 可分别给**前面的小说**和**后面的读词**配一首 | 一份音频（或没有）贯穿全程 |

`schemaVersion` 仍是 `1`。

## 先判断

在学员项目里搜三个探针符号。

| 探针 | 落地文件 | 代表哪件事 |
| --- | --- | --- |
| `resolveMusicUrls` | `src/dlc/music.ts` | 分阶段 BGM |
| `quiz-back` | `src/components/ClassroomFrame.tsx` | 回看上一段 |
| `READ_LOCK_SECONDS` | `src/components/PoemScrollFrame.tsx` | 读词节奏 |

- **三个都在**：引擎已对齐，跳过本补丁。
- **缺任意一个**：不要只补缺的那一处 —— 三个探针是同一版引擎一起引入的，缺一个就说明学员项目停在更早的版本，**三件事一起做全**，本补丁的自检直接跳过。
- 本项目 `main` 里有完整实现。有 git 对照时直接参考，**不要凭记忆重写 CSS**。

落地自检不看探针，看每个文件自己的「最后一个落地符号」：

| 文件 | 落地锚点 |
| --- | --- |
| `src/dlc/music.ts` | `resolveMusicZone` |
| `tests/music.test.ts` | `describe("resolveMusicZone"` |
| `src/dlc/schema.ts` | `musicConfigSchema` |
| `src/components/GamePlayer.tsx` | `topLevelPhase` |
| `src/components/ClassroomFrame.tsx` | `quiz-back` |
| `src/components/classroom.module.css` | `.navBack` |
| `src/components/PoemScrollFrame.tsx` | `lockRingBar`（`READ_LOCK_SECONDS` 只是起点） |
| `src/components/poem.module.css` | `.lockRingBar` |

锚点缺了就是没落地，别拿「看起来能跑」过关。

## 改哪些文件

**新建：**

| 路径 | 职责 |
| --- | --- |
| `src/dlc/music.ts` | 分阶段 BGM 解析：`resolveMusicUrls` / `resolveMusicZone` |
| `tests/music.test.ts` | 上述两个纯函数的用例 |

**改现有：**

| 路径 | 改什么 |
| --- | --- |
| `src/dlc/schema.ts` | 新增 `musicConfigSchema`；`assets.music` 接受 `{story?, poem?}` 或旧版字符串 |
| `src/components/GamePlayer.tsx` | 按当前 phase 选 BGM；新增 `topLevelPhase()` |
| `src/components/ClassroomFrame.tsx` | `status === "idle"` 且 beat 为 `classmate` / `student` 时渲染「← 回看上一段」，**放在动作区、与提交按钮同排** |
| `src/components/classroom.module.css` | `.navBack` |
| `src/components/PoemScrollFrame.tsx` | `READ_LOCK_SECONDS` 锁定、空格键禁用、环形饼图 |
| `src/components/poem.module.css` | `.lockRing` / `.lockRingTrack` / `.lockRingBar` |
| `docs/dlc-spec.md` | `assets.music` 的两种写法 |
| `DESIGN.md` | 两条交互约定 |

---

## 1. 分阶段 BGM

`src/dlc/schema.ts`：**给改动前后，不要只给新增**，否则实现者得回去全文搜原来那行长什么样。

```ts
// 改前：assets.music 只接受一个字符串
      music: relativePathSchema.optional(),
```

```ts
// 改后：先加 musicConfigSchema，再把上面的字段换成 union
export const musicConfigSchema = z.object({
  story: relativePathSchema.optional(),
  poem: relativePathSchema.optional(),
});

// …
      music: z.union([musicConfigSchema, relativePathSchema]).optional(),
```

**旧版单字符串写法必须继续能用**，一份音频在小说与读词阶段共用。

`src/dlc/music.ts` 两个纯函数，写完拿下面的表对答案：

`resolveMusicUrls(dlc): { story?: string; poem?: string }`

| `assets.music` | `story` | `poem` |
| --- | --- | --- |
| 没配 | `undefined` | `undefined` |
| `"assets/bgm.mp3"` | `{publicBasePath}/assets/bgm.mp3` | 同上（共用一首） |
| `{ story: a, poem: b }` | `{publicBasePath}/a` | `{publicBasePath}/b` |
| `{ poem: b }` | `undefined` | `{publicBasePath}/b` |
| 已是站点绝对路径 / CDN URL | 原样返回，不再拼前缀 | 同左 |

`resolveMusicZone(phase, pendingPhase?): "story" | "poem" | "none"`

| 顶层 phase | pendingPhase | zone |
| --- | --- | --- |
| `intro` | — | story |
| `story` | — | story |
| `easterEgg` | — | story |
| `poem` | — | poem |
| `pageTransition` | `"poem"` | poem |
| `pageTransition` | `"story"` 或 `"easterEgg"` | story |
| `pageTransition` | `"lessonTransition"` / `null` / 不认识 | none |
| `lessonTransition` | — | none |
| `quiz` | — | none |
| `summary` | — | none |
| `outro` | — | none |
| 表外状态（学员项目可能多出 `assembly` 之类） | — | none |

左列就是 `main` 里 `gameMachine` 的**全部**顶层状态。先 grep 学员项目自己的 `states:` 逐个核对，缺的补进表、多的也补进表 —— 表外状态一律 `none`，显式列出来，别靠「其余」概括，更别猜成 story。

要点：

- `resolveMusicUrls` **不做** CDN 改写 —— `publicBasePath` 在 `loadCompiled` 阶段已经改写过了。
- 对象写法两个字段都可选，只配一个时另一个阶段必须静音。

`GamePlayer` 接线：

```ts
const { story: storyMusic, poem: poemMusic } = useMemo(() => resolveMusicUrls(dlc), [dlc]);
const musicZone = useMemo(
  () => resolveMusicZone(topLevelPhase(snapshot.value), context.pendingPhase),
  [snapshot.value, context.pendingPhase],
);
const activeMusic =
  musicZone === "story" ? storyMusic : musicZone === "poem" ? poemMusic : undefined;
useOptionalHowl(activeMusic, { loop: true });
```

`topLevelPhase` 取状态机当前值的最顶层 phase 名：值可能是字符串，也可能是复合状态对象（如 `quiz`、`summary`），取第一个键。

## 2. 课堂「回看上一段」

`ClassroomFrame`：只在 `status === "idle"` 且当前 beat 是 `classmate` 或 `student` 时渲染按钮。先 `playSfx("click")`，再改本地 `beat`（纯 UI 状态，**不**发状态机事件）：

| 当前 beat | 回退到 |
| --- | --- |
| `student` | 有提示 → `classmate`；无提示 → `teacher` |
| `classmate` | `teacher` |

**回退之后怎么往前走 —— 不要新增「开始作答」按钮。** 回退只是回到前面那个页面，该页原有的前进按钮会照常重现，玩家出得去：

- 回退到 `classmate`：打字机打完后「轮到我答」还在 → 回 `student`。
- 回退到 `teacher`：打字机打完后，有提示的题重现「听{同学}说」→ `classmate` → `student`；无提示的选择题本来就在这一页直接列选项作答。

`hasQuizHint` 对开放题恒为 `true`，所以进入 `student` 一定伴随提示；`student` 且无提示那条兜底分支现实中用不到，但代码要写全。另外无提示的选择题 `beat` 始终是 `teacher`，回看按钮不会出现 —— 这是预期行为，不是漏渲染。

**按钮放哪里：动作区，与提交同排 —— 不要绝对定位浮在气泡角上。** 浮在右上角那种做法玩家看不出它是按钮，这里已改成与提交按钮同一个动作区：

| 当前 beat | 渲染位置 |
| --- | --- |
| `student` + 开放题（或有提示的选择题） | 提交按钮所在的那个 `styles.actions` 里，作为**第一个子元素**：`[← 回看上一段] [提交给老师]` |
| `student` + 选择题 | `styles.choices` **上方**单独一行 `styles.actions`，别塞进选项之间，也别放到选项下面（长选项会把它顶出视口） |
| `classmate` | 与「轮到我答」同一排 |

两条硬要求：

- `classmate` 那一排的**渲染条件不能挂在打字机 `done` 上**：排一出现就渲染，只有「轮到我答」仍等 `classmateTw.done`。否则打字机没打完就回看不了。
- 样式比 `.primary` 弱一档但必须醒目：`1px dashed` 暗金描边 + 暗金文字（`#d4a84b`）+ 浅暗金底，`min-height: 44px` 与主按钮同高，hover 转实线。**不要**用低对比的灰、也不要只靠一个 `←` 图标。

**打字机从头重播靠对话容器的 `key` 重挂载，必须把 `beat` 放进 key：**

```tsx
key={`${question.id}-${beat}-${status}`}
```

只写 `${question.id}-${speaker}-${status}` 不够可靠：`speaker` 的取值由 `beat` 推导，学员项目里很可能 `teacher` / `student` 两个 beat 都渲染成 `teacher`，此时回退到 `teacher` 的 key 不变，打字机就不会重播。直接带上 `beat` 与 `speaker` 怎么算无关，也就不用去查 `speaker` 的推导分支。参考实现因为 `idle` 时 `speaker` 恒等于 `beat`，写法上二者等价。

测试 id `quiz-back`。已提交的作答（`studentAnswer`、评分）在状态机 context 里，回看只动本地 `beat`，**不碰**它们。

## 3. 读词节奏控制

`PoemScrollFrame`：

```ts
const READ_LOCK_SECONDS = 3;
const RING_R = 10;
const RING_C = 2 * Math.PI * RING_R;
```

- `lineIndex` 变化 → `lockSeconds` 重置为 3；每秒减 1，到 0 解锁。
- 锁定期间：「下一句 / 进入问答」按钮 `disabled` + `aria-disabled`，`onClick` 早返回；空格键监听里也要 `!locked` 才 `preventDefault` 并 `onNext()`。
- 按钮内用 SVG 圆环表达剩余时间：`strokeDasharray={RING_C}`、`strokeDashoffset={RING_C * (1 - lockSeconds / READ_LOCK_SECONDS)}`，两个圆分别是 `.lockRingTrack` / `.lockRingBar`。
- 空格键那个 `useEffect` 的依赖里要加 `locked`，否则闭包会捕获旧的锁状态。

## 4. 课包 YAML（可选）

学员课包不配 BGM 也完全正常。要配的话见 https://poem.aibeaver.cn/dlc-spec：

```yaml
assets:
  music:
    story: assets/bgm-story.mp3    # 前面小说（含彩蛋）
    poem: assets/bgm-poem.m4a      # 后面读词
```

音频放 DLC 包 `assets/` 下，路径须是安全相对路径。改故事或题目后升高 `manifest.yaml` 的 `version`。

## 5. 验收

```bash
pnpm run compile:dlc
pnpm test
pnpm run typecheck
```

必须为真：

1. 旧课包（`assets.music` 是字符串、或压根没配）行为不变。
2. `resolveMusicUrls` 每种输入的行为与上面两张表、以及 `tests/music.test.ts` 一致。
3. 进读词阶段 BGM 换成 `poem`，回故事阶段换回 `story`；课堂问答、总评、以及状态表里判为 `none` 的 phase 都不播 BGM。
4. 刚进一句时「下一句」按不动、空格键也无效，3 秒后恢复。
5. 同学发言 / 作答环节能回看上一段，回退后打字机重播，已提交的作答不变；并且**从回退后的页面能正常走回作答**（不需要任何新增按钮）。
6. 「回看上一段」与提交按钮在同一动作区、肉眼一眼能找到，且打字机没打完时就已经可用。

## 做完之后

用三句话告诉用户：课堂可以回看上一段了、读词加了 3 秒防连点、小说和读词可以各配一首 BGM。不要让用户去「重新生成整个项目」。
