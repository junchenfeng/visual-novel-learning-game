import { NextRequest, NextResponse } from "next/server";
import { readUsername } from "../../../src/auth/requestUser";
import { behaviorLogSchema } from "../../../src/analytics/eventSchema";
import { getPoemStore, userEventsKey } from "../../../src/server/poemStore";

export async function PUT(request: NextRequest) {
  const username = await readUsername();
  if (!username) {
    return NextResponse.json({ error: "请先填写用户名" }, { status: 401 });
  }
  const json = await request.json().catch(() => null);
  const parsed = behaviorLogSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "事件记录不完整" }, { status: 400 });
  }
  await getPoemStore().writeJson(userEventsKey(username), parsed.data);
  return NextResponse.json({ saved: true });
}
