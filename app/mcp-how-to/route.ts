import { markdownHttpResponse, readRepoMarkdown } from "../../src/server/markdownDoc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return markdownHttpResponse(readRepoMarkdown("mcp-how-to.md"), request);
}
