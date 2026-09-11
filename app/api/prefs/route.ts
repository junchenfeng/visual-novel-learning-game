import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readUsername } from "../../../src/auth/requestUser";
import { normalizeWorkTitle } from "../../../src/dlc/catalogShared";
import { emptyPrefs, getPoemStore, userPrefsKey, type UserPrefs } from "../../../src/server/poemStore";

const putSchema = z.object({
  workTitle: z.string().min(1).max(80),
  dlcId: z.string().min(1).max(80),
});

export async function GET() {
  const username = await readUsername();
  if (!username) {
    return NextResponse.json({ error: "请先填写用户名" }, { status: 401 });
  }
  const prefs = (await getPoemStore().readJson<UserPrefs>(userPrefsKey(username))) ?? emptyPrefs();
  return NextResponse.json(prefs);
}

export async function PUT(request: NextRequest) {
  const username = await readUsername();
  if (!username) {
    return NextResponse.json({ error: "请先填写用户名" }, { status: 401 });
  }
  const json = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "偏好不完整" }, { status: 400 });
  }
  const store = getPoemStore();
  const prefs = (await store.readJson<UserPrefs>(userPrefsKey(username))) ?? emptyPrefs();
  prefs.selectedDlcByWork[normalizeWorkTitle(parsed.data.workTitle)] = parsed.data.dlcId;
  await store.writeJson(userPrefsKey(username), prefs);
  return NextResponse.json(prefs);
}
