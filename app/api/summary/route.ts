import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { loadCompiledDlc } from "../../../src/dlc/loadCompiled";
import { teacherSummarySchema } from "../../../src/server/ai/AIProvider";

const attemptSchema = z.object({
  answer: z.string().min(1).max(400),
  assessment: z.enum(["correct", "partial", "incorrect"]).optional(),
  optionId: z.string().min(1).max(80).optional(),
});

const requestSchema = z.object({
  dlcId: z.string().min(1).max(80),
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1).max(80),
        questionType: z.enum(["open", "choice"]),
        attempts: z.array(attemptSchema).min(1).max(20),
      }),
    )
    .min(1)
    .max(20),
});

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "请求不完整" }, { status: 400 });
  }

  const dlc = loadCompiledDlc(parsed.data.dlcId);
  if (!dlc) {
    return NextResponse.json({ error: "找不到对应的 DLC" }, { status: 404 });
  }

  for (const item of parsed.data.answers) {
    if (!dlc.quiz.questions.some((question) => question.id === item.questionId)) {
      return NextResponse.json({ error: `找不到题目：${item.questionId}` }, { status: 400 });
    }
  }

  // 作业：接回 createAIProvider().summarize()，把作答轨迹 attempts 交给总评 LLM。
  // 现在先去掉总结 LLM，固定返回「待完成」。
  return NextResponse.json(teacherSummarySchema.parse({ remark: "待完成" }));
}
