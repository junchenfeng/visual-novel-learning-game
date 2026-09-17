import { readFileSync } from "node:fs";
import path from "node:path";

export function readRepoMarkdown(filename: string): string {
  return readFileSync(path.join(process.cwd(), "docs", filename), "utf8");
}

export function markdownHttpResponse(markdown: string, request: Request): Response {
  const accept = request.headers.get("accept") ?? "";
  const wantsHtml = accept.includes("text/html") && !accept.includes("text/markdown");
  if (!wantsHtml) {
    return new Response(markdown, {
      headers: {
        "content-type": "text/markdown; charset=utf-8",
        "cache-control": "public, max-age=60",
      },
    });
  }
  return new Response(markdownHtmlDocument(markdown), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=60",
    },
  });
}

function markdownTitle(markdown: string): string {
  const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || "poem-rpg docs";
}

function markdownHtmlDocument(markdown: string): string {
  const escaped = markdown
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const title = markdownTitle(markdown)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    html, body { margin: 0; background: #d9c7a1; color: #2c2416; }
    body {
      font-family: "Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif;
      padding: 32px 16px 64px;
    }
    pre {
      max-width: 46rem;
      margin: 0 auto;
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.65;
      font-size: 15px;
      padding: 28px 24px;
      background: #f4ead5;
      border: 2px solid #2c2416;
      box-shadow: 6px 8px 0 rgba(44, 36, 22, 0.12);
    }
  </style>
</head>
<body>
  <pre>${escaped}</pre>
</body>
</html>
`;
}
