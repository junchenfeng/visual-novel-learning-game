export function getIngestToken(): string {
  return process.env.POEM_INGEST_TOKEN?.trim() ?? "";
}

export function ingestTokenHint(): string {
  return "请在 Authorization 头带 Bearer POEM_INGEST_TOKEN";
}

export function readBearerToken(header: string | null): string {
  if (!header) {
    return "";
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  return (match?.[1] ?? "").trim();
}

export function ingestTokenMatches(header: string | null): boolean {
  const expected = getIngestToken();
  if (!expected) {
    return false;
  }
  const got = readBearerToken(header);
  if (!got || got.length !== expected.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  }
  return diff === 0;
}
