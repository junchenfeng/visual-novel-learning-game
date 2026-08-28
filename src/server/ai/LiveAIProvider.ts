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

export class LiveAIProvider implements AIProvider {
  constructor(
    private readonly options: {
      baseUrl: string;
      apiKey: string;
      model: string;
    },
  ) {}

  private async chat(system: string, user: unknown) {
    const url = `${this.options.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.options.model,
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(user) },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`AI 接口失败：${response.status}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content;
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
