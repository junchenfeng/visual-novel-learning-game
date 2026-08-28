import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { createBehaviorEvent } from "../src/analytics/eventSchema";
import { parseDlcDirectory } from "../src/dlc/parser";
import {
  buildRecordedSession,
  compatibleRecordedSessions,
  isSessionCompatibleWithDlc,
  recordedSessionSchema,
} from "../src/sessions/recordedSession";
import { writeRecordedSession } from "../src/sessions/writeRecordedSession";

function event(
  type: Parameters<typeof createBehaviorEvent>[0]["type"],
  payload: Record<string, unknown> = {},
) {
  return createBehaviorEvent({
    sessionId: "session-flow",
    dlcId: "hailao-shuidiao",
    dlcVersion: "1.0.0",
    type,
    payload,
  });
}

describe("recorded sessions", () => {
  const dlc = parseDlcDirectory("dlc/sushi/shuidiao-getou/hailao-shuidiao");

  it("keeps story and quiz, and drops poem/easter-egg events", () => {
    const recordedAt = new Date("2026-08-28T04:00:00.000Z");
    const session = buildRecordedSession({
      dlc,
      sessionId: "session-flow",
      recordedAt,
      answers: [
        {
          questionId: "q_separate",
          answer: "变法",
          assessment: "correct",
          questionType: "choice",
          optionId: "reform_exile",
        },
      ],
      events: [
        event("session.started"),
        event("phase.entered", { phase: "story" }),
        event("story.node_entered", { nodeId: "ch1_open", nodeType: "narration" }),
        event("story.choice_selected", { nodeId: "ch1_choice", choiceId: "write_letter" }),
        event("phase.entered", { phase: "easterEgg" }),
        event("phase.entered", { phase: "poem" }),
        event("poem.line_revealed", { lineId: "line_01", index: 0 }),
        event("phase.entered", { phase: "quiz" }),
        event("quiz.answer_submitted", { questionId: "q_separate" }),
      ],
    });

    expect(session.dlcId).toBe("hailao-shuidiao");
    expect(session.dlcVersion).toBe(dlc.manifest.version);
    expect(session.story.path).toEqual(["ch1_open"]);
    expect(session.story.choices[0]).toEqual({
      nodeId: "ch1_choice",
      choiceIds: ["write_letter"],
    });
    expect(session.quiz.questions[0]).toEqual({
      questionId: "q_separate",
      type: "choice",
      optionIds: ["reform_exile"],
    });
    expect(session.events.some((item) => item.type === "poem.line_revealed")).toBe(false);
    expect(
      session.events.filter((item) => item.type === "phase.entered").map((item) => item.payload.phase),
    ).toEqual(["story", "quiz"]);
  });

  it("discards sessions whose DLC version does not match", () => {
    const recordedAt = new Date("2026-08-28T04:00:00.000Z");
    const matching = buildRecordedSession({
      dlc,
      sessionId: "session-flow",
      recordedAt,
      answers: [
        {
          questionId: "q_separate",
          answer: "变法",
          assessment: "correct",
          questionType: "choice",
          optionId: "reform_exile",
        },
      ],
      events: [event("session.started")],
    });
    const stale = { ...matching, dlcVersion: "0.0.1" };
    expect(isSessionCompatibleWithDlc(matching, dlc)).toBe(true);
    expect(isSessionCompatibleWithDlc(stale, dlc)).toBe(false);
    expect(compatibleRecordedSessions([matching, stale], dlc)).toEqual([matching]);
  });

  it("writes one file per session and a latest copy", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sessions-"));
    const recordedAt = new Date("2026-08-28T04:00:00.000Z");
    const session = buildRecordedSession({
      dlc,
      sessionId: "session-flow",
      recordedAt,
      answers: [
        {
          questionId: "q_separate",
          answer: "变法",
          assessment: "correct",
          questionType: "choice",
          optionId: "reform_exile",
        },
      ],
      events: [event("session.started"), event("phase.entered", { phase: "story" })],
    });
    try {
      const written = writeRecordedSession(session, root);
      const parsed = recordedSessionSchema.parse(parseYaml(readFileSync(written.filePath, "utf8")));
      const latest = recordedSessionSchema.parse(parseYaml(readFileSync(written.latestPath, "utf8")));
      expect(parsed.id).toBe(session.id);
      expect(latest.id).toBe(session.id);
      expect(parsed.events).toHaveLength(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
