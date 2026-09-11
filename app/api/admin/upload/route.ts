import { NextRequest, NextResponse } from "next/server";
import { normalizeUsername, usernameHint } from "../../../../src/auth/username";
import { MAX_ZIP_BYTES, publishUploadedDlc } from "../../../../src/dlc/publishUpload";
import { loadRoster } from "../../../../src/roster/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "请用表单上传 zip" }, { status: 400 });
  }
  const userId = normalizeUsername(String(form.get("userId") ?? ""));
  if (!userId) {
    return NextResponse.json({ error: `作者 user id 不合法。${usernameHint()}` }, { status: 400 });
  }
  const poetId = String(form.get("poetId") ?? "").trim();
  const workTitle = String(form.get("workTitle") ?? "").trim();
  const roster = await loadRoster();
  if (!roster.some((poet) => poet.poetId === poetId)) {
    return NextResponse.json({ error: "请选择名册中的诗人" }, { status: 400 });
  }
  if (!workTitle) {
    return NextResponse.json({ error: "请选择篇目" }, { status: 400 });
  }
  const zip = form.get("zip");
  if (!(zip instanceof File)) {
    return NextResponse.json({ error: "请选择 zip 文件" }, { status: 400 });
  }
  if (zip.size > MAX_ZIP_BYTES) {
    return NextResponse.json({ error: "zip 超过 30MB" }, { status: 400 });
  }
  const zipBuffer = Buffer.from(await zip.arrayBuffer());
  const result = await publishUploadedDlc({
    form: { userId, poetId, workTitle },
    zipBuffer,
  });
  if ("issues" in result) {
    return NextResponse.json({ error: "校验未通过", issues: result.issues }, { status: 400 });
  }
  return NextResponse.json({ pack: result.pack });
}
