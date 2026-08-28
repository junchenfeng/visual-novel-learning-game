# 提示词试评台（方法说明）

这里是 **试评分、试总评提示词** 的地方：孩子改一段「本课怎么评」，立刻看到老师会怎么讲。**只试提示词，不给提示词打分，也不改游戏里的可玩关卡。**

真正上课时，服务器是这样拼的：

```text
MASTER_PROMPT（柜台后，冻结） + gradingPrompt（本课） → 填空讲解
SUMMARY_MASTER_PROMPT（冻结） + summaryPrompt（本课） → 总结页总评
```

对应代码：[`src/server/ai/masterPrompt.ts`](../../../src/server/ai/masterPrompt.ts)。老师身份（MASTER_PROMPT / SUMMARY_MASTER_PROMPT）**冻结，谁都不能改**。

---

## 每篇 DLC 的试评材料放哪

试评材料不再集中在本目录，而是跟着每篇作品走，落在 `assets/<poetId>/<work-slug>/`：

| 材料 | 文件 | 状态 |
| --- | --- | --- |
| 评分指引草稿（gradingPrompt） | `04_quiz-design.md` 里的「评分指引草稿」 | 孩子可改 |
| 总评指引草稿（summaryPrompt） | `04_quiz-design.md` 里的「总评指引草稿」 | 孩子可改 |
| 本课答卷样例（题目/HINT/学生答案/总评套餐） | `06_answer-samples.md` | 冻结，不要改 |

标准范例（水调歌头）见 [`assets/sushi/shuidiao-getou/06_answer-samples.md`](../../../assets/sushi/shuidiao-getou/06_answer-samples.md)。

---

## 孩子怎么做

1. 先打开 `06_answer-samples.md`，看有几道填空题、何解怎么说、几份假想的同学答案。
2. 打开 `04_quiz-design.md` 的「评分指引草稿」和「总评指引草稿」。现在的文字就是这一课的初稿，可以从这里改强、改弱、改收束句。
3. 在对话区对 agent 说「跑一下」或「看反馈」。
4. 看输出里老师讲了什么、总评怎么收。觉得不对，再改草稿，再跑一遍。

改这两段草稿 **不会** 自动写回 `quiz.yaml`。满意以后，孩子自己决定要不要把这两段誊回 `content/quiz.yaml` 的 `gradingPrompt` / `summaryPrompt`。实验阶段不要直接改可玩关卡。

---

## Agent 接到「跑一下」时怎么做

1. 读 `assets/<poetId>/<work-slug>/04_quiz-design.md`（评分/总评草稿）和 `06_answer-samples.md`（答卷样例）。孩子没说清哪一篇时，先问一句「跑哪一篇？」。
2. 用老师人设（`src/server/ai/masterPrompt.ts` 里的 `MASTER_PROMPT`）+ 当前「评分指引草稿」，对 `06` 里 **每一条** 学生答卷各写一段讲解：
   - 先点何解这条 HINT（帮了忙还是说岔了）
   - 再针对这条学生答卷：对在哪、漏了什么
   - **不要** 输出 `assessment`，不要写 correct / partial / incorrect，不要打 0–100 分
3. 用 `06` 里的 **总评套餐** 再跑一遍当前「总评指引草稿」，输出一段总评。
4. 最后只写三行「观察」，让孩子自己对照，例如：
   - 讲解有没有点到本课要盯的那个理解点
   - 有没有纠正那份「误会」答卷
   - 总评有没有收到本课那句收束词
5. 草稿改完再跑时，让孩子看这三行变没变。不要评价「你的提示词好不好」。

禁止：改 `MASTER_PROMPT` / `SUMMARY_MASTER_PROMPT`、给孩子的提示词打分、调用 `/api/teacher` 把结果写进游戏、改 `quiz.yaml`。

备课阶段工作单与落盘路径，见仓库根目录 `AGENTS.md`。