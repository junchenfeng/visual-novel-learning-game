import { LLMClient, Config } from "coze-coding-dev-sdk";
import { MASTER_PROMPT, SUMMARY_MASTER_PROMPT } from "./masterPrompt";
import {
  teacherFeedbackSchema,
  teacherSummarySchema,
  type AIProvider,
  type SummaryRequest,
  type TeacherFeedback,
  type TeacherRequest,
  type TeacherSummary,
} from "./AIProvider";

function parseJsonContent(content: string | undefined, label: string) {
  if (!content) {
    throw new Error("AI 没有返回内容");
  }
  try {
    return JSON.parse(content) as unknown;
  } catch {
    throw new Error(`${label} 不是合法 JSON`);
  }
}

export class CozeAIProvider implements AIProvider {
  private readonly client: LLMClient;
  private readonly model: string;

  constructor(customHeaders?: Record<string, string>) {
    const config = new Config();
    this.client = new LLMClient(config, customHeaders);
    this.model = process.env.AI_MODEL?.trim() || "doubao-seed-2-0-lite-260215";
  }

  private async chat(system: string, user: unknown): Promise<string> {
    const response = await this.client.invoke(
      [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(user) },
      ],
      {
        model: this.model,
        temperature: 0.3,
      },
    );
    return response.content;
  }

  async evaluate(request: TeacherRequest): Promise<TeacherFeedback> {
    const content = await this.chat(
      `${MASTER_PROMPT}\n\n本课评分指引：\n${request.gradingPrompt}`,
      {
        question: request.questionPrompt,
        classmate_hint: request.classmateAnswer,
        classmate_is_correct: request.classmateIsCorrect,
        student_answer: request.studentAnswer,
        reference_answer: request.referenceAnswer,
        misconceptions: request.misconceptions,
        scoring_points: request.scoringPoints,
      },
    );
    return teacherFeedbackSchema.parse(parseJsonContent(content, "老师点评"));
  }

  async summarize(request: SummaryRequest): Promise<TeacherSummary> {
    const content = await this.chat(
      `${SUMMARY_MASTER_PROMPT}\n\n本课总评指引：\n${request.summaryPrompt}`,
      {
        poet: request.poet,
        work_title: request.workTitle,
        answers: request.answers,
      },
    );
    return teacherSummarySchema.parse(parseJsonContent(content, "老师总评"));
  }
}
