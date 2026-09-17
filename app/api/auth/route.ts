import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { clearUsernameCookie, writeUsernameCookie, readUsername } from "../../../src/auth/requestUser";
import { normalizeUsername, usernameHint } from "../../../src/auth/username";

const bodySchema = z.object({
  username: z.string().min(1).max(64),
});

export async function GET() {
  const username = await readUsername();
  return NextResponse.json({ username });
}

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: usernameHint() }, { status: 400 });
  }
  const username = normalizeUsername(parsed.data.username);
  if (!username) {
    return NextResponse.json({ error: usernameHint() }, { status: 400 });
  }
  await writeUsernameCookie(username);
  return NextResponse.json({ username });
}

export async function DELETE() {
  await clearUsernameCookie();
  return NextResponse.json({ ok: true });
}
