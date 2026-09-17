import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HeaderUtils } from "coze-coding-dev-sdk";
import { loadCompiledDlc } from "../../../src/dlc/loadCompiled";
import { isChoiceQuestion } from "../../../src/dlc/quizHelpers";
import { createAIProvider } from "../../../src/server/ai/createProvider";
import { teacherSummarySchema, type SummaryRequest } from "../../../src/server/ai/AIProvider";

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

  const dlc = await loadCompiledDlc(parsed.data.dlcId);
  if (!dlc) {
    return NextResponse.json({ error: "找不到对应的 DLC" }, { status: 404 });
  }

  const answers: SummaryRequest["answers"] = [];
  for (const item of parsed.data.answers) {
    const question = dlc.quiz.questions.find((entry) => entry.id === item.questionId);
    if (!question) {
      return NextResponse.json({ error: `找不到题目：${item.questionId}` }, { status: 400 });
    }
    const payload: SummaryRequest["answers"][number] = {
      questionId: item.questionId,
      prompt: question.prompt,
      questionType: item.questionType,
      attempts: item.attempts,
    };
    if (isChoiceQuestion(question)) {
      payload.correctOptionId = question.correctOptionId;
      payload.options = question.options.map((option) => ({
        id: option.id,
        label: option.label,
      }));
    }
    answers.push(payload);
  }

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
