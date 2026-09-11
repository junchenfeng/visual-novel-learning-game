import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminPassword, passwordsMatch } from "../../../../src/auth/admin";
import { clearAdminCookie, writeAdminCookie } from "../../../../src/auth/requestAdmin";

const bodySchema = z.object({
  password: z.string().min(1).max(128),
});

export async function POST(request: NextRequest) {
  if (!getAdminPassword()) {
    return NextResponse.json({ error: "未配置管理密码" }, { status: 503 });
  }
  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "请输入密码" }, { status: 400 });
  }
  if (!(await passwordsMatch(parsed.data.password))) {
    return NextResponse.json({ error: "密码不对" }, { status: 401 });
  }
  await writeAdminCookie();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearAdminCookie();
  return NextResponse.json({ ok: true });
}
