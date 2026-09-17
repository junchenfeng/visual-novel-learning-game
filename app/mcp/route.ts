import { createMcpHandler } from "mcp-handler";
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

export const GET = mcpHandler;
export const POST = mcpHandler;
export const DELETE = mcpHandler;
