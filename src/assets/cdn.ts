export const STATIC_OSS_PREFIX = "poem-rpg/static";

function trimSlash(value: string) {
  return value.replace(/\/+$/, "");
}

/**
 * CDN 根地址只来自环境变量（线上 `.env.production` 的 `CDN_BASE_URL`）。
 *
 * 这里刻意不读 config.json：那会让这个「纯路径改写」工具反向依赖服务端配置，
 * 于是所有 import 它的内核文件（loadCompiled / catalog / layout）都会被判定为
 * 含宿主依赖，无法同步到扣子版。见 coze.config.json 与 scripts/coze-sync.mjs。
 */
export function getCdnBaseUrl(): string {
  const fromEnv = process.env.CDN_BASE_URL?.trim() || process.env.NEXT_PUBLIC_CDN_BASE_URL?.trim();
  return fromEnv ? trimSlash(fromEnv) : "";
}

export function isLocalPublicPath(pathname: string): boolean {
  return pathname.startsWith("/") && !pathname.startsWith("//");
}

function toCdnObjectPath(pathname: string): string {
  return pathname.replace(/^\/+/, "").replace(/\.(png|jpe?g|gif)$/i, ".webp");
}

/** 把站点内的 /poets、/dlc、/portraits 等静态图改写成 CDN；本机无 CDN 时保持原路径。 */
export function publicAssetUrl(pathname: string | undefined): string {
  if (!pathname) {
    return "";
  }
  if (!isLocalPublicPath(pathname)) {
    return pathname;
  }
  const cdn = getCdnBaseUrl();
  if (!cdn) {
    return pathname;
  }
  const [pathPart] = pathname.split("?");
  const relative = toCdnObjectPath(pathPart ?? "");
  return `${cdn}/${STATIC_OSS_PREFIX}/${relative}`;
}
