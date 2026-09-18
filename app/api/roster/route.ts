import { NextRequest, NextResponse } from "next/server";
import { INGEST_USER_ID_HINT } from "../../../src/ingest/l2Students";
import { isIngestUserIdReject } from "../../../src/ingest/userId";
import { listRosterTool, upsertPoetTool } from "../../../src/mcp/tools";
import { PORTRAIT_MAX_BYTES } from "../../../src/roster/portrait";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * 同源 HTTP 的名册通道，补齐 MCP 侧 `list_roster` / `upsert_poet` 的缺口：
 * - `GET  /api/roster?userId=` 看诗人与篇目；
 * - `POST /api/roster` 新建或更新诗人（含头像），multipart 或 JSON 都收。
 *
 * `upsert_work` 没有对应端点：篇目不在名册时不必先建，`POST /api/ingest` 审核通过会自动加。
 */

function withIssuesAsBadRequest(result: unknown) {
  if (isIngestUserIdReject(result)) {
    return NextResponse.json({ error: INGEST_USER_ID_HINT, ...(result as object) }, { status: 400 });
  }
  const issues = (result as { issues?: unknown }).issues;
  if (Array.isArray(issues) && issues.length > 0) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}

/** GET /api/roster?userId=hh_学号 —— 诗人名册（poetId / 诗人 / 篇目）。 */
export async function GET(request: NextRequest) {
  const result = await listRosterTool({
    userId: request.nextUrl.searchParams.get("userId")?.trim() ?? "",
  });
  return withIssuesAsBadRequest(result);
}

/**
 * POST /api/roster —— 新建或更新诗人。
 *
 * multipart：`userId`、`poetId`、`poet`、文件字段 `portrait`（可选 `portraitMime`）。
 * JSON：`{ userId, poetId, poet, portraitBase64, portraitMime? }`（base64 可带 `data:` 前缀）。
 */
export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  let userIdRaw = "";
  let poetId = "";
  let poet = "";
  let portraitBase64 = "";
  let portraitMime: string | undefined;
  let portraitBuffer: Buffer | null = null;

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ error: "JSON 无法解析" }, { status: 400 });
    }
    userIdRaw = String(body.userId ?? "");
    poetId = String(body.poetId ?? "");
    poet = String(body.poet ?? "");
    portraitBase64 = String(body.portraitBase64 ?? "");
    portraitMime = body.portraitMime ? String(body.portraitMime) : undefined;
  } else {
    const form = await request.formData().catch(() => null);
    if (!form) {
      return NextResponse.json({ error: "请用 multipart 或 JSON 上传" }, { status: 400 });
    }
    userIdRaw = String(form.get("userId") ?? "");
    poetId = String(form.get("poetId") ?? "");
    poet = String(form.get("poet") ?? "");
    const hinted = form.get("portraitMime");
    portraitMime = hinted ? String(hinted) : undefined;
    const portrait = form.get("portrait");
    if (portrait instanceof File) {
      // 先挡超大文件，别把它整个读进内存（形状检查在 preparePoetPortrait 里做）
      if (portrait.size > PORTRAIT_MAX_BYTES) {
        return NextResponse.json(
          { error: `头像超过 ${PORTRAIT_MAX_BYTES / (1024 * 1024)}MB` },
          { status: 400 },
        );
      }
      portraitBuffer = Buffer.from(await portrait.arrayBuffer());
      portraitMime = portraitMime ?? portrait.type ?? undefined;
    }
  }

  const result = await upsertPoetTool({
    userId: userIdRaw,
    poetId,
    poet,
    portraitBase64: portraitBase64 || undefined,
    portraitBuffer: portraitBuffer ?? undefined,
    portraitMime,
  });
  return withIssuesAsBadRequest(result);
}
