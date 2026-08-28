# 提示词试评台（方法说明）

这里是 **试评分、试总评提示词** 的地方：孩子改一段「本课怎么评」，立刻看到老师会怎么讲。**只试提示词，不给提示词打分。**

作业总览见 [docs/teaching/README.md](../README.md)。轨迹字段见 [case-schema.md](case-schema.md)。

真正上课时，服务器是这样拼的：

```text
MASTER_PROMPT（柜台后，冻结） + gradingPrompt（本课） → 填空讲解
SUMMARY_MASTER_PROMPT（冻结） + summaryPrompt（本课） → 总结页总评（现在接口返回「待完成」，作业第 4 步再接回）
```

对应代码：[`src/server/ai/masterPrompt.ts`](../../../src/server/ai/masterPrompt.ts)。老师身份（MASTER_PROMPT / SUMMARY_MASTER_PROMPT）**冻结，谁都不能改**。

---

## 材料放哪

| 材料 | 位置 | 是否进 git |
| --- | --- | --- |
| 作答轨迹案例 | 本目录 `cases/<pack-id>/*.yaml` | 是，人能打开看 |
| 评分/总评草稿 | 备课阶段可写在 `assets/<poetId>/<work-slug>/04_quiz-design.md` | 否（`/assets/` 已 gitignore） |
| 可玩关卡 | `dlc/.../content/quiz.yaml` | 是 |

水调歌头的三份案例：

- [`cases/hailao-shuidiao/all-correct.yaml`](cases/hailao-shuidiao/all-correct.yaml) 全对
- [`cases/hailao-shuidiao/one-miss.yaml`](cases/hailao-shuidiao/one-miss.yaml) 婵娟先错再对
- [`cases/hailao-shuidiao/guess-abc.yaml`](cases/hailao-shuidiao/guess-abc.yaml) 按卷面顺序点到对（第三题第一项就是对的）

---

## 孩子怎么做

1. 打开上面三份 YAML，看每题的 `optionIds` / `texts` 顺序。
2. 打开 `quiz.yaml` 的 `gradingPrompt` / `summaryPrompt`（或 `04_quiz-design.md` 里的草稿）。
3. 在对话区对 agent 说「跑一下」或「看反馈」。
4. 看输出里老师讲了什么、总评怎么收。觉得不对，再改草稿，再跑一遍。

改草稿 **不会** 自动写回 `quiz.yaml`。满意以后，孩子自己决定要不要誊回。实验阶段尽量先改草稿。

---

## Agent 接到「跑一下」时怎么做

1. 读三份 `cases/hailao-shuidiao/*.yaml`。孩子没说清哪一篇时，先问「跑哪一份？全对 / 错一题 / 乱猜？」
2. 填空题（作业第 3 步改完 `q_theme` 之后才有）：用老师人设（`MASTER_PROMPT`）+ 当前 `gradingPrompt`（或草稿），对那份 YAML 里 `type: open` 的 **每一条** `texts` 各写一段讲解：
   - 先点何解这条 HINT（帮了忙还是说岔了）
   - 再针对这条文字：对在哪、漏了什么
   - **不要** 输出 `assessment`，不要写 correct / partial / incorrect，不要打 0–100 分
3. 总评：现在游戏接口返回「待完成」。对话里仍可按当前 `summaryPrompt` 草稿，根据 **整份轨迹**（选择题点过哪些选项、填空写过哪些句子）试写一段总评，让孩子对照三种画像差在哪。
4. 最后只写三行「观察」，例如：
   - 填空讲解有没有点到「难全仍祝福」
   - 有没有纠正何解那种「分开就分开」
   - 总评有没有看出「挨个点选项」和「一次就对」不是同一种认真
5. 草稿改完再跑时，让孩子看这三行变没变。不要评价「你的提示词好不好」。

禁止：改 `MASTER_PROMPT` / `SUMMARY_MASTER_PROMPT`、给孩子的提示词打分、调用 `/api/teacher` 把结果写进游戏。接总结 LLM 是作业第 4 步，见 [../README.md](../README.md)。
