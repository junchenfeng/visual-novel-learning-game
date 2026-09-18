import { NextRequest, NextResponse } from "next/server";
import { MAX_ZIP_BYTES } from "../../../src/dlc/uploadPack";
import { INGEST_USER_ID_HINT } from "../../../src/ingest/l2Students";
import { isIngestUserIdReject } from "../../../src/ingest/userId";
import { ingestDlcTool } from "../../../src/mcp/tools";
import { requestOrigin } from "../../../src/server/siteUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  const origin = requestOrigin(request.headers);
  let userIdRaw = "";
  let poetId = "";
  let workTitle = "";
  let zipBuffer: Buffer | null = null;
  let zipBase64 = "";

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "JSON 无法解析" }, { status: 400 });
    }
    userIdRaw = String(body.userId ?? "");
    poetId = String(body.poetId ?? "");
    workTitle = String(body.workTitle ?? "");
    zipBase64 = String(body.zipBase64 ?? "");
  } else {
    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "请用 multipart 或 JSON 上传" }, { status: 400 });
    }
    userIdRaw = String(form.get("userId") ?? "");
    poetId = String(form.get("poetId") ?? "");
    workTitle = String(form.get("workTitle") ?? "");
    const zip = form.get("zip");
    if (zip instanceof File) {
      if (zip.size > MAX_ZIP_BYTES) {
        return NextResponse.json({ error: "zip 超过 30MB" }, { status: 400 });
      }
      zipBuffer = Buffer.from(await zip.arrayBuffer());
    }
  }

  const result = await ingestDlcTool({
    userId: userIdRaw,
    poetId,
    workTitle,
    zipBase64: zipBuffer ? undefined : zipBase64 || undefined,
    zipBuffer: zipBuffer ?? undefined,
    origin,
  });

  if (isIngestUserIdReject(result)) {
    return NextResponse.json({ error: INGEST_USER_ID_HINT, ...result }, { status: 400 });
  }

  const verdict = "verdict" in result ? result.verdict : "reject";
  // 只有 reject 是 400：400 的语义是「按 issues 改 YAML 再来」。
  // accept（本轮上架）与 skip（版本与内容都没变、线上保持原样）都是成功，必须 200，
  // 否则 agent 会把 skip 当失败去乱改 YAML。
  return NextResponse.json(result, { status: verdict === "reject" ? 400 : 200 });
}
