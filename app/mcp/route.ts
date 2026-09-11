import { createMcpHandler } from "mcp-handler";
import { NextResponse } from "next/server";
import { getIngestToken, ingestTokenHint, ingestTokenMatches } from "../../src/ingest/auth";
import { registerIngestTools } from "../../src/mcp/register";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const mcpHandler = createMcpHandler(
  (server) => {
    registerIngestTools(server);
  },
  {
    serverInfo: { name: "poem-dlc-ingest", version: "0.1.0" },
  },
);

async function gated(request: Request): Promise<Response> {
  if (!getIngestToken()) {
    return NextResponse.json({ error: "未配置 POEM_INGEST_TOKEN" }, { status: 503 });
  }
  if (!ingestTokenMatches(request.headers.get("authorization"))) {
    return NextResponse.json({ error: ingestTokenHint() }, { status: 401 });
  }
  return mcpHandler(request);
}

export const GET = gated;
export const POST = gated;
export const DELETE = gated;
