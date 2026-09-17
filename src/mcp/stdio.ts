import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { registerIngestTools } from "./register";

serveStdio(() => {
  const server = new McpServer(
    { name: "poem-dlc-ingest", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );
  registerIngestTools(server);
  return server;
});
