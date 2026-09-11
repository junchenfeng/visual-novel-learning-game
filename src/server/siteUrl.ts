export function requestOrigin(headers: Headers): string {
  const fromEnv = process.env.PUBLIC_SITE_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/+$/, "");
  }
  const proto = headers.get("x-forwarded-proto") ?? "http";
  const host = headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:5000";
  return `${proto}://${host}`;
}

export function playUrl(origin: string, dlcId: string): string {
  return `${origin.replace(/\/+$/, "")}/play/${dlcId}`;
}
