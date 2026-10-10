/**
 * 极简 MCP HTTP 客户端（Streamable HTTP，无会话）。
 *
 * 线上由 `mcp-handler` 2.x 提供：POST 一个 JSON-RPC 就够，不需要 initialize 握手、
 * 也没有 Mcp-Session-Id；响应可能是 `text/event-stream`（单条 `data: {...}`）或纯 JSON，
 * 这里两种都吃。工具返回的载荷是 `result.content[0].text` 里的 JSON 字符串。
 *
 * 只实现 e2e / 运维需要的四个方法：initialize、tools/list、tools/call、
 * get_ingest_job（异步模式轮询）。
 */

export type JsonRpcErrorShape = { code?: number; message?: string; data?: unknown };

export type JsonRpcResponse = {
  jsonrpc?: string;
  id?: number | string | null;
  result?: unknown;
  error?: JsonRpcErrorShape;
};

export type McpToolPayload<T> = {
  /** content[0].text 解析后的对象（解析不了时是原始文本） */
  value: T;
  /** JSON-RPC/MCP 层面是否被标记为错误 */
  isError: boolean;
  /** 原始文本，便于失败时打印 */
  text: string;
};

export class McpHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "McpHttpError";
  }
}

export class McpRpcError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
    this.name = "McpRpcError";
  }
}

/**
 * 解析 MCP 响应正文：先试纯 JSON，再按 SSE 逐行取 `data:`。
 * 只保留带 result/error 的事件（keep-alive 之类的空事件丢弃），取最后一个。
 */
export function parseMcpResponseBody(body: string): JsonRpcResponse {
  const trimmed = String(body ?? "").trim();
  if (!trimmed) {
    throw new McpRpcError("MCP 响应为空");
  }
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed) as JsonRpcResponse;
  }
  const payloads: JsonRpcResponse[] = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const match = line.match(/^data:\s*(.*)$/);
    if (!match) continue;
    const data = match[1].trim();
    if (!data || data === "[DONE]") continue;
    try {
      payloads.push(JSON.parse(data) as JsonRpcResponse);
    } catch {
      // 非 JSON 的事件负载（如保活注释）忽略
    }
  }
  if (payloads.length === 0) {
    throw new McpRpcError(`MCP 响应既不是 JSON 也没有可解析的 SSE 事件：${trimmed.slice(0, 200)}`);
  }
  const withBody = payloads.filter((item) => item.result !== undefined || item.error !== undefined);
  const list = withBody.length > 0 ? withBody : payloads;
  return list[list.length - 1];
}

/** 从 JSON-RPC 响应里取出工具载荷（content[0].text 的 JSON）。 */
export function extractToolPayload<T>(response: JsonRpcResponse): McpToolPayload<T> {
  if (response.error) {
    throw new McpRpcError(
      `MCP 调用失败（code=${response.error.code ?? "?"}）：${response.error.message ?? JSON.stringify(response.error.data ?? "")}`,
      response.error.code,
    );
  }
  const result = response.result as { content?: Array<{ type?: string; text?: string }>; isError?: boolean } | undefined;
  const text = result?.content?.find((item) => item?.type === "text")?.text ?? "";
  if (!text) {
    throw new McpRpcError(`MCP 返回里没有 text 内容：${JSON.stringify(response.result).slice(0, 300)}`);
  }
  let value: unknown = text;
  try {
    value = JSON.parse(text);
  } catch {
    // 工具返回非 JSON 文本时原样给出，交给调用方判断
  }
  return { value: value as T, isError: result?.isError === true, text };
}

export type McpClientOptions = {
  /** MCP 端点，如 https://poem.aibeaver.cn/mcp */
  endpoint: string;
  /** 单次 HTTP 调用上限（毫秒）。同步审核动辄 2–4 分钟，要留足。 */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export class McpClient {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private nextId = 1;

  constructor(options: McpClientOptions) {
    this.endpoint = options.endpoint.trim().replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get url(): string {
    return this.endpoint;
  }

  private async rpc(method: string, params: unknown, timeoutMs?: number): Promise<JsonRpcResponse> {
    const id = this.nextId++;
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} }),
      signal: AbortSignal.timeout(timeoutMs ?? this.timeoutMs),
    });
    const body = await response.text();
    if (!response.ok) {
      throw new McpHttpError(`MCP HTTP ${response.status}：${body.slice(0, 300)}`, response.status);
    }
    return parseMcpResponseBody(body);
  }

  async initialize(): Promise<{ serverInfo?: { name?: string; version?: string }; protocolVersion?: string }> {
    const response = await this.rpc("initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "poem-dlc-review-e2e-test", version: "0.1.0" },
    });
    return (response.result ?? {}) as { serverInfo?: { name?: string; version?: string }; protocolVersion?: string };
  }

  async listTools(): Promise<string[]> {
    const response = await this.rpc("tools/list", {});
    const tools = (response.result as { tools?: Array<{ name?: string }> } | undefined)?.tools ?? [];
    return tools.map((tool) => String(tool?.name ?? "")).filter(Boolean);
  }

  async callTool<T>(name: string, args: unknown, timeoutMs?: number): Promise<McpToolPayload<T>> {
    const response = await this.rpc("tools/call", { name, arguments: args }, timeoutMs);
    return extractToolPayload<T>(response);
  }

  /** agent 审核阶段的单次调用要等几分钟，单独放宽。 */
  async callToolSlow<T>(name: string, args: unknown, timeoutMs: number): Promise<McpToolPayload<T>> {
    return this.callTool<T>(name, args, timeoutMs);
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
