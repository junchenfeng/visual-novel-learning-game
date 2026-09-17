# 课堂教学与总评

选择题在浏览器里本地判分；填空题走 `/api/teacher`。全部答完后，`GamePlayer` 把每题的完整作答轨迹 `attempts`（选择题的 `optionId` 顺序、填空的历次文字）交给 `POST /api/summary`。

服务器这样拼总评：

```text
SUMMARY_MASTER_PROMPT（冻结） + 本课 summaryPrompt + 作答轨迹 → remark
```

老师身份在 [`src/server/ai/masterPrompt.ts`](../../src/server/ai/masterPrompt.ts)，DLC 只能补充「本课怎么评」，不能改身份或输出格式。生产环境默认 DeepSeek；扣子沙盒走 `CozeAIProvider`。本机可设 `AI_PROVIDER=mock` 看轨迹评语，不打真实 LLM。

试评分/试总评提示词的方法，见 [提示词试评台](prompt-lab/README.md)。轨迹字段见 [case-schema.md](prompt-lab/case-schema.md)。

开发环境进总结前会把完整对局（故事+课堂，不含读诗/彩蛋）写到 `assets/sessions/<dlcId>/`。分析本机对局时丢掉 `dlcVersion` 对不上的文件。
