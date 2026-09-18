import { NextRequest, NextResponse } from "next/server";
import { INGEST_USER_ID_HINT } from "../../../src/ingest/l2Students";
import { isIngestUserIdReject } from "../../../src/ingest/userId";
import { listMyDlcTool } from "../../../src/mcp/usageTools";
import { requestOrigin } from "../../../src/server/siteUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/my-dlc?userId=hh_学号 —— 我已上架课包的清单（含 version / uploadedAt / playUrl）。
 *
 * 提交课包前的「对账」用：agent 拿本地 dlc 下每个 `manifest.yaml` 的 version 与这里比对，
 * 版本一致且内容指纹一致的包就不用再传了（服务端也会幂等地判 skip）。
 * 与 MCP 的 `list_my_dlc` 是同一段逻辑，只是换个门进来。
 */
export async function GET(request: NextRequest) {
  const result = await listMyDlcTool({
    userId: request.nextUrl.searchParams.get("userId")?.trim() ?? "",
    origin: requestOrigin(request.headers),
  });
  if (isIngestUserIdReject(result)) {
    return NextResponse.json({ error: INGEST_USER_ID_HINT, ...(result as object) }, { status: 400 });
  }
  if ((result as { error?: string }).error) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
