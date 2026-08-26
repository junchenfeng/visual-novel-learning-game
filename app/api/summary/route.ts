import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HeaderUtils } from "coze-coding-dev-sdk";
import { loadCompiledDlc } from "../../../src/dlc/loadCompiled";
import { createAIProvider } from "../../../src/server/ai/createProvider";
import { teacherSummarySchema } from "../../../src/server/ai/AIProvider";

const requestSchema = z.object({
  dlcId: z.string().min(1).max(80),
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1).max(80),
        answer: z.string().min(1).max(400),
        assessment: z.enum(["correct", "partial", "incorrect"]).optional(),
        questionType: z.enum(["open", "choice"]),
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

  const answers = parsed.data.answers.map((item) => {
    const question = dlc.quiz.questions.find((entry) => entry.id === item.questionId);
    return {
      questionId: item.questionId,
      prompt: question?.prompt ?? item.questionId,
      answer: item.answer,
      assessment: item.assessment,
      questionType: item.questionType,
    };
  });

  try {
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const summary = await createAIProvider(customHeaders).summarize({
      poet: dlc.manifest.poet,
      workTitle: dlc.manifest.workTitle,
      summaryPrompt: dlc.quiz.summaryPrompt,
      answers,
    });
    return NextResponse.json(teacherSummarySchema.parse(summary));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "老师暂时无法写总评" },
      { status: 502 },
    );
  }
}
