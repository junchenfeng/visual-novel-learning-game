import { behaviorLogSchema, createBehaviorEvent } from "../src/analytics/eventSchema";

describe("behavior events", () => {
  it("creates a parseable JSON envelope", () => {
    const event = createBehaviorEvent({
      sessionId: "session-1",
      dlcId: "shuidiao-getou",
      dlcVersion: "1.0.0",
      type: "story.choice_selected",
      payload: { choiceId: "write_letter" },
    });
    const log = behaviorLogSchema.parse({
      schemaVersion: 1,
      events: [event],
    });
    expect(log.events[0]?.type).toBe("story.choice_selected");
    expect(JSON.parse(JSON.stringify(log)).events).toHaveLength(1);
  });
});
