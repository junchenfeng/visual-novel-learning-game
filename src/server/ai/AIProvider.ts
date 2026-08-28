import { z } from "zod";

export const teacherFeedbackSchema = z.object({
  assessment: z.enum(["correct", "partial", "incorrect"]),
  classmateAnalysis: z.string().min(1),
  studentFeedback: z.string().min(1),
  explanation: z.string().min(1),
  evidence: z.string().min(1),
  encouragement: z.string().min(1),
});

export const teacherSummarySchema = z.object({
  remark: z.string().min(1),
});

export type TeacherFeedback = z.infer<typeof teacherFeedbackSchema>;
export type TeacherSummary = z.infer<typeof teacherSummarySchema>;

export type TeacherRequest = {
  questionPrompt: string;
  classmateAnswer: string;
  classmateIsCorrect: boolean;
  referenceAnswer: string;
  misconceptions: string[];
  scoringPoints: string[];
  studentAnswer: string;
  gradingPrompt: string;
};

export type SummaryRequest = {
  poet: string;
  workTitle: string;
  summaryPrompt: string;
  answers: Array<{
    questionId: string;
    prompt: string;
    questionType: "open" | "choice";
    attempts: Array<{
      answer: string;
      assessment?: TeacherFeedback["assessment"];
      optionId?: string;
    }>;
  }>;
};

export interface AIProvider {
  evaluate(request: TeacherRequest): Promise<TeacherFeedback>;
  summarize(request: SummaryRequest): Promise<TeacherSummary>;
}
