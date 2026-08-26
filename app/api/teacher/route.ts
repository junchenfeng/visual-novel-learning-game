import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HeaderUtils } from "coze-coding-dev-sdk";
import { loadCompiledDlc } from "../../../src/dlc/loadCompiled";
import { isOpenQuestion } from "../../../src/dlc/quizHelpers";
import { createAIProvider } from "../../../src/server/ai/createProvider";
import { teacherFeedbackSchema } from "../../../src/server/ai/AIProvider";

const requestSchema = z.object({
  dlcId: z.string().min(1).max(80),
  questionId: z.string().min(1).max(80),
  studentAnswer: z.string().trim().min(1).max(200),
});

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "请求不完整或答案过长" }, { status: 400 });
  }

  const dlc = loadCompiledDlc(parsed.data.dlcId);
  if (!dlc) {
    return NextResponse.json({ error: "找不到对应的 DLC" }, { status: 404 });
  }

  const question = dlc.quiz.questions.find((item) => item.id === parsed.data.questionId);
  if (!question) {
    return NextResponse.json({ error: "找不到这道题" }, { status: 404 });
  }
  if (!isOpenQuestion(question)) {
    return NextResponse.json({ error: "这道题不需要老师实时点评" }, { status: 400 });
  }

  try {
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const feedback = await createAIProvider(customHeaders).evaluate({
      questionPrompt: question.prompt,
      classmateAnswer: question.classmateAnswer,
      classmateIsCorrect: question.classmateIsCorrect,
      referenceAnswer: question.referenceAnswer,
      misconceptions: question.misconceptions,
      scoringPoints: question.scoringPoints,
      studentAnswer: parsed.data.studentAnswer,
      gradingPrompt: dlc.quiz.gradingPrompt,
    });
    return NextResponse.json(teacherFeedbackSchema.parse(feedback));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "老师暂时无法回答" },
      { status: 502 },
    );
  }
}
