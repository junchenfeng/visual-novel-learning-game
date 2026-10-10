import {
  McpClient,
  McpHttpError,
  McpRpcError,
  extractToolPayload,
  parseMcpResponseBody,
} from "../../scripts/ingest-lib/mcp";

function sse(payload: unknown): string {
  return `event: message\ndata: ${JSON.stringify(payload)}\n\n`;
}

type Captured = { url: string; body: Record<string, unknown>; headers: Record<string, string> };

function fakeFetch(responses: Array<{ status?: number; body: string }>, captured: Captured[] = []) {
  let index = 0;
  const impl = (async (url: string, init: RequestInit) => {
    captured.push({
      url: String(url),
      body: JSON.parse(String(init.body)) as Record<string, unknown>,
      headers: (init.headers ?? {}) as Record<string, string>,
    });
    const next = responses[Math.min(index++, responses.length - 1)];
    return new Response(next.body, { status: next.status ?? 200, headers: { "Content-Type": "text/event-stream" } });
  }) as unknown as typeof fetch;
  return { impl, captured };
}

describe("MCP 客户端", () => {
  it("解析 SSE 与纯 JSON 两种响应，只取带 result/error 的事件", () => {
    const sseBody = `event: message\ndata: {"jsonrpc":"2.0","method":"notifications/ping"}\n\nevent: message\ndata: {"result":{"ok":1},"jsonrpc":"2.0","id":7}\n\ndata: [DONE]\n`;
    expect(parseMcpResponseBody(sseBody)).toMatchObject({ result: { ok: 1 }, id: 7 });
    expect(parseMcpResponseBody('{"result":{"a":2},"jsonrpc":"2.0","id":1}')).toMatchObject({ result: { a: 2 } });
    expect(parseMcpResponseBody('event: message\ndata: {"error":{"code":-32601,"message":"method not found"},"id":2}\n')).toMatchObject({
      error: { code: -32601 },
    });
  });

  it("空响应/垃圾响应直接报错", () => {
    expect(() => parseMcpResponseBody("")).toThrow(McpRpcError);
    expect(() => parseMcpResponseBody("   ")).toThrow(/响应为空/);
    expect(() => parseMcpResponseBody("<html>502</html>")).toThrow(/不是 JSON/);
  });

  it("从工具返回里取出 content[0].text 的 JSON，并暴露 isError", () => {
    const payload = extractToolPayload<{ verdict: string }>({
      result: { content: [{ type: "text", text: '{"verdict":"accept","issues":[]}' }] },
    });
    expect(payload.value.verdict).toBe("accept");
    expect(payload.isError).toBe(false);

    const failing = extractToolPayload({ result: { content: [{ type: "text", text: "oops" }], isError: true } });
    expect(failing.value).toBe("oops");
    expect(failing.isError).toBe(true);

    expect(() => extractToolPayload({ error: { code: -32000, message: "boom" } })).toThrow(McpRpcError);
    expect(() => extractToolPayload({ result: { content: [] } })).toThrow(/没有 text 内容/);
  });

  it("initialize / tools-list / tools-call 的请求形状正确，端点尾部斜杠被规整", async () => {
    const { impl, captured } = fakeFetch([
      { body: sse({ result: { serverInfo: { name: "poem-dlc-ingest", version: "0.1.0" }, protocolVersion: "2025-11-25" }, id: 1 }) },
      { body: sse({ result: { tools: [{ name: "ingest_dlc" }, { name: "list_my_dlc" }, { name: "get_ingest_job" }] }, id: 2 }) },
      { body: sse({ result: { content: [{ type: "text", text: '{"verdict":"accept"}' }] }, id: 3 }) },
    ]);
    const client = new McpClient({ endpoint: "https://poem.aibeaver.cn/mcp/", fetchImpl: impl });

    const handshake = await client.initialize();
    expect(handshake.serverInfo?.name).toBe("poem-dlc-ingest");
    const tools = await client.listTools();
    expect(tools).toContain("ingest_dlc");

    const payload = await client.callTool<{ verdict: string }>("ingest_dlc", { userId: "hh_0000000" });
    expect(payload.value.verdict).toBe("accept");

    expect(captured.map((item) => item.url)).toEqual([
      "https://poem.aibeaver.cn/mcp",
      "https://poem.aibeaver.cn/mcp",
      "https://poem.aibeaver.cn/mcp",
    ]);
    expect(captured.map((item) => item.body.method)).toEqual(["initialize", "tools/list", "tools/call"]);
    expect(captured[2].body.params).toEqual({ name: "ingest_dlc", arguments: { userId: "hh_0000000" } });
    expect(captured[0].headers.Accept).toContain("text/event-stream");
  });

  it("HTTP 非 2xx 抛 McpHttpError，JSON-RPC error 抛 McpRpcError", async () => {
    const httpFail = fakeFetch([{ status: 502, body: "bad gateway" }]);
    await expect(new McpClient({ endpoint: "https://x/mcp", fetchImpl: httpFail.impl }).listTools()).rejects.toThrow(McpHttpError);

    const rpcFail = fakeFetch([{ body: sse({ error: { code: -32000, message: "queue_full" }, id: 1 }) }]);
    await expect(
      new McpClient({ endpoint: "https://x/mcp", fetchImpl: rpcFail.impl }).callTool("ingest_dlc", {}),
    ).rejects.toThrow(/queue_full/);
  });
});
