import { NextRequest, NextResponse } from "next/server";
import { MAX_USAGE_FILES_PER_CALL } from "../../../src/usage/types";
import { INGEST_USER_ID_HINT } from "../../../src/ingest/l2Students";
import { isIngestUserIdReject } from "../../../src/ingest/userId";
import { downloadUsageFilesTool, usageManifestTool } from "../../../src/mcp/usageTools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function userIdRejectResponse(result: unknown) {
  return NextResponse.json({ error: INGEST_USER_ID_HINT, ...(result as object) }, { status: 400 });
}

function usageErrorResponse(result: unknown) {
  return NextResponse.json(result, { status: 400 });
}

/** GET /api/usage?userId=hh_学号[&dlcId=...] —— 取使用数据清单（manifest）。 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const result = await usageManifestTool({
    userId: params.get("userId")?.trim() ?? "",
    dlcId: params.get("dlcId")?.trim() || undefined,
    targetDir: params.get("targetDir")?.trim() || undefined,
  });
  if (isIngestUserIdReject(result)) {
    return userIdRejectResponse(result);
  }
  if ((result as { error?: string }).error) {
    return usageErrorResponse(result);
  }
  return NextResponse.json(result);
}

/** POST /api/usage { userId, paths[], targetDir? } —— 按清单路径取内容（base64）。 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "JSON 无法解析" }, { status: 400 });
  }
  const paths = Array.isArray(body.paths) ? body.paths.map((item) => String(item)) : [];
  if (paths.length === 0) {
    return NextResponse.json({ error: "请提供 paths" }, { status: 400 });
  }
  if (paths.length > MAX_USAGE_FILES_PER_CALL) {
    return NextResponse.json(
      { error: `一次最多下载 ${MAX_USAGE_FILES_PER_CALL} 个文件，当前 ${paths.length} 个` },
      { status: 400 },
    );
  }

  const result = await downloadUsageFilesTool({
    userId: String(body.userId ?? "").trim(),
    paths,
    targetDir: body.targetDir ? String(body.targetDir) : undefined,
  });
  if (isIngestUserIdReject(result)) {
    return userIdRejectResponse(result);
  }
  if ((result as { error?: string }).error) {
    return usageErrorResponse(result);
  }
  return NextResponse.json(result);
}
