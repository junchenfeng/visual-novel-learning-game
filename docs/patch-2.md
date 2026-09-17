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

在学员项目里搜 `resolveMusicUrls`、`quiz-back`、`READ_LOCK_SECONDS`。

- **三处都有**：引擎已对齐，跳过本补丁。
- **缺任意一处**：按下面改。
- 本项目 `main` 里有完整实现。有 git 对照时直接参考，**不要凭记忆重写 CSS**。

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
| `src/components/ClassroomFrame.tsx` | `status === "idle"` 且 beat 为 `classmate` / `student` 时渲染「← 回看上一段」 |
| `src/components/classroom.module.css` | `.navBack` |
| `src/components/PoemScrollFrame.tsx` | `READ_LOCK_SECONDS` 锁定、空格键禁用、环形饼图 |
| `src/components/poem.module.css` | `.lockRing` / `.lockRingTrack` / `.lockRingBar` |
| `docs/dlc-spec.md` | `assets.music` 的两种写法 |
| `DESIGN.md` | 两条交互约定 |

---

## 1. 分阶段 BGM

`src/dlc/schema.ts` 新增：

```ts
export const musicConfigSchema = z.object({
  story: relativePathSchema.optional(),
  poem: relativePathSchema.optional(),
});
```

`assets.music` 由 `relativePathSchema.optional()` 改为 `z.union([musicConfigSchema, relativePathSchema]).optional()` —— **旧版单字符串写法必须继续能用**，一份音频在小说与读词阶段共用。

`src/dlc/music.ts` 两个纯函数：

```ts
resolveMusicUrls(dlc): { story?: string; poem?: string }
// 未配置 → {}（两个阶段都不播）
// 字符串 → story / poem 共用同一首
// 对象   → 按 story / poem 分别解析，缺省的阶段为 undefined
// URL 一律 = `${dlc.publicBasePath}/${路径}`

resolveMusicZone(phase, pendingPhase?): "story" | "poem" | "none"
// intro / story / easterEgg → story
// poem                      → poem
// pageTransition            → 依 pendingPhase 承接上一区间，认不出就 none
// 其余（quiz / summary / outro / 未知）→ none
```

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

`ClassroomFrame`：只在 `status === "idle"` 且当前 beat 是 `classmate` 或 `student` 时渲染。回退规则：

```
student   → 有提示则回 classmate，否则回 teacher
classmate → teacher
```

先 `playSfx("click")` 再回退。打字机从头重播 —— 段落 `key` 里已带 `${question.id}-${speaker}-${status}`，跟着 beat 变即可。

**纯本地 UI 状态**：不回退已提交的作答，不改评分。测试 id `quiz-back`。

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
2. `resolveMusicUrls` 四种输入的行为与 `tests/music.test.ts` 一致。
3. 进读词阶段 BGM 换成 `poem`，回故事阶段换回 `story`；课堂问答与总评不播 BGM。
4. 刚进一句时「下一句」按不动、空格键也无效，3 秒后恢复。
5. 同学发言 / 作答环节能回看上一段，回退后打字机重播，已提交的作答不变。

## 做完之后

用三句话告诉用户：课堂可以回看上一段了、读词加了 3 秒防连点、小说和读词可以各配一首 BGM。不要让用户去「重新生成整个项目」。
