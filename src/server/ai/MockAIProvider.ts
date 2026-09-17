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

  async summarize(request: SummaryRequest): Promise<TeacherSummary> {
    const total = request.answers.length;
    const retried = request.answers.filter((item) => item.attempts.length > 1).length;
    const guessed = request.answers.filter((item) => {
      if (item.questionType !== "choice" || item.attempts.length < 2) {
        return false;
      }
      const ids = item.attempts.map((attempt) => attempt.optionId).filter(Boolean);
      if (ids.length < 2) {
        return false;
      }
      const sequential = ids.every((id, index) => {
        const prev = ids[index - 1];
        if (!prev || !id) {
          return true;
        }
        return prev.length === 1 && id.length === 1 && id.charCodeAt(0) === prev.charCodeAt(0) + 1;
      });
      const alwaysFirst = ids.every((id) => id === item.options?.[0]?.id);
      return sequential || alwaysFirst;
    }).length;
    const remark =
      guessed > 0
        ? `你读完了${request.poet}的《${request.workTitle}》。有 ${guessed} 题像是顺着选项挨个点到对的，这样对理解诗词帮助不大。先读懂词句再作答，老师等你认真来一回。`
        : retried > 0
          ? `你认真读完了${request.poet}的《${request.workTitle}》。${total} 题里有 ${retried} 题不是一次就选对，说明还有地方要再对照词句想一想。下次先想清楚再点，会更踏实。`
          : `你认真读完了${request.poet}的《${request.workTitle}》。${total} 题大多一次就抓住了要点。继续把词句和故事连起来想，就会越读越清楚。`;
    return teacherSummarySchema.parse({ remark });
  }
}
