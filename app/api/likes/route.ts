import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readUsername } from "../../../src/auth/requestUser";
import { getPoemStore, likeKey } from "../../../src/server/poemStore";

const putSchema = z.object({
  dlcId: z.string().min(1).max(80),
});

export async function PUT(request: NextRequest) {
  const username = await readUsername();
  if (!username) {
    return NextResponse.json({ error: "请先填写用户名" }, { status: 401 });
  }
  const json = await request.json().catch(() => null);
  const parsed = putSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "缺少作品编号" }, { status: 400 });
  }
  await getPoemStore().writeJson(likeKey(parsed.data.dlcId, username), {
    username,
    dlcId: parsed.data.dlcId,
    likedAt: new Date().toISOString(),
  });
  return NextResponse.json({ liked: true, dlcId: parsed.data.dlcId });
}
