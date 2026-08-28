import {
  teacherFeedbackSchema,
  teacherSummarySchema,
  type AIProvider,
  type SummaryRequest,
  type TeacherFeedback,
  type TeacherRequest,
  type TeacherSummary,
} from "./AIProvider";

function score(request: TeacherRequest): TeacherFeedback["assessment"] {
  const answer = request.studentAnswer.trim();
  if (!answer) {
    return "incorrect";
  }
  const hits = request.scoringPoints.filter((point) =>
    point.split(/[、，,]/).some((part) => part && answer.includes(part.trim())),
  );
  if (hits.length >= Math.ceil(request.scoringPoints.length * 0.7)) {
    return "correct";
  }
  if (hits.length > 0 || answer.length >= 8) {
    return "partial";
  }
  return "incorrect";
}

export class MockAIProvider implements AIProvider {
  async evaluate(request: TeacherRequest): Promise<TeacherFeedback> {
    const assessment = score(request);
    return teacherFeedbackSchema.parse({
      assessment,
      classmateAnalysis: request.classmateIsCorrect
        ? `何解说得挺准：${request.classmateAnswer}`
        : `何解这次说错了。常见误会是：${request.misconceptions[0] ?? request.classmateAnswer}`,
      studentFeedback:
        assessment === "correct"
          ? "你抓到了关键信息，老师为你鼓掌。"
          : assessment === "partial"
            ? "方向对了，还可以把时间、地点或人物说得更完整。"
            : "先别着急。对照词的背景再想一想：谁在望月？他在想念谁？",
      explanation: request.referenceAnswer,
      evidence: `评分要点：${request.scoringPoints.join("；")}`,
      encouragement: "下一题继续，把词句和故事背景连起来想。",
    });
  }

  async summarize(_request: SummaryRequest): Promise<TeacherSummary> {
    return teacherSummarySchema.parse({
      remark: "待完成",
    });
  }
}
