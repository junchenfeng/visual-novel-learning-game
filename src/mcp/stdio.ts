import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { registerIngestTools } from "./register";
import { MCP_TRANSPORT_ENV } from "./usageTools";

// 本机 stdio 时工具进程就在调用方机器上，使用数据可直接落到 targetDir（默认 assets/user_data）。
process.env[MCP_TRANSPORT_ENV] = "stdio";

serveStdio(() => {
  const server = new McpServer(
    { name: "poem-dlc-ingest", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  registerIngestTools(server);
  return server;
});
