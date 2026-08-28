# 产品决策

面向维护玩法边界的开发者。学生向说明见 [architecture.md](architecture.md)、[dlc-spec.md](dlc-spec.md)。

当前版本：**beta**。改体验先改这一页，再改代码和 DLC。

---

## 约定

**目录。** 首页诗人头像墙，`/poet/[poetId]` 书架。`poetId` 在 `manifest.yaml`。课表上未做的诗人/书脊标灰。

**三套界面。** `GamePlayer` 按状态机切换：故事 [`BookFrame`](../src/components/BookFrame.tsx)、读词 [`PoemScrollFrame`](../src/components/PoemScrollFrame.tsx)、问答 [`CourtroomFrame`](../src/components/CourtroomFrame.tsx)。PC 为 390:844 手机舞台（按可用高度缩放，容器查询）；Mobile 铺满。DOM/文字不用 `transform: scale()`。

**故事节点。** `narration` 代入；`fact` 史实标签 + 虚线框，直线、不能进 Game Over。`choice` 正路汇合到 `convergesTo`。`gameOver` 只有「重新选择」，用 `lastChoiceNodeId` 回到刚才的选择。旁白/史实不写 `speaker`、`portrait`。

**开场与梦醒。** 文案由 [`NarrativeGate`](../src/components/NarrativeGate.tsx) 提供，DLC 只给作品名。顺序：开场 → 故事 → 读词 → 梦醒 → 问答。章节背景每章可选一张。开场动画用 CSS。

**问答。** 选择题对照 `correctOptionId` 在浏览器打分，讲解用 DLC `explanation`。填空走 `/api/teacher`，全部答完走 `/api/summary`。老师人设在 [`src/server/ai/masterPrompt.ts`](../src/server/ai/masterPrompt.ts)；DLC 只追加 `gradingPrompt` / `summaryPrompt`。

**学习记录。** JSON 事件进 `localStorage`（`story.game_over`、`story.replayed`、`summary.received` 等）。总结页只有叙事总评和署名。

**运行时。** XState + React；DLC 只是数据。Jest 守图与流程，见 [testing.md](testing.md)。有 BGM、短音效、翻页/立绘对比、老师思考中。正文一次出全段。

---

## Changelog（beta）

骨架与编译链、三阶段界面、诗人课表（未做篇目标灰）、`fact` / `gameOver`、选择+填空混排、`gradingPrompt` / `summaryPrompt` 与 `/api/summary`、固定开场与梦醒、章节背景、390:844 舞台、开场 CSS 动画、扣子 dev 预览代理。仍为 beta，未定 1.0。
