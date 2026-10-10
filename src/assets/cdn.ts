export const STATIC_OSS_PREFIX = "poem-rpg/static";

function trimSlash(value: string) {
  return value.replace(/\/+$/, "");
}

/**
 * 资源版本段：`r-<包内容指纹前 8 位>`。
 *
 * 存在的理由只有一个：CDN 与浏览器按**完整 URL**缓存静态资源，而上传包的资源写的是
 * `Cache-Control: immutable`（一年不回源）。同名文件覆盖后旧副本不会失效，学员会看到
 * 「传了新版本但图没变」。唯一可靠的解法是让 URL 随内容变，所以版本段只能由内容决定，
 * **不能**用 `manifest.version`——「改了内容忘升版本」恰恰是这个坑最常见的触发方式。
 *
 * 指纹不合规（缺省、太短、非十六进制）时返回空串：退回不带版本段的老路径，
 * 让老编译产物、单元测试与「指纹算不出来」的边缘情况都还能照常工作。
 */
export function packRevision(contentSha256?: string): string {
  const hex = (contentSha256 ?? "").trim().toLowerCase();
  return /^[a-f0-9]{8,}$/.test(hex) ? `r-${hex.slice(0, 8)}` : "";
}

/** 校验调用方传进来的版本段；不合法一律当「没有版本段」，避免拼出奇怪的路径。 */
export function normalizeRevision(revision?: string): string {
  const value = (revision ?? "").trim().toLowerCase();
  return /^r-[a-f0-9]{8}$/.test(value) ? value : "";
}

/**
 * 上传包资源的站点路径前缀：`/dlc/<dlcId>[/r-xxxxxxxx]`。
 *
 * 站点路径与 OSS key 必须共用这一个口径：`publicAssetUrl` 是无状态的一对一映射，
 * 两边只要有一处不同，线上就是 404。
 */
export function dlcAssetBasePath(dlcId: string, revision?: string): string {
  const rev = normalizeRevision(revision);
  return rev ? `/dlc/${dlcId}/${rev}` : `/dlc/${dlcId}`;
}

/** 上传包某个资源在 OSS 上的 key（对象路径 = 站点路径 + `poem-rpg/static` 前缀）。 */
export function staticDlcAssetKey(dlcId: string, relativePath: string, revision?: string): string {
  const cleaned = relativePath.replace(/^\/+/, "");
  return `${STATIC_OSS_PREFIX}${dlcAssetBasePath(dlcId, revision)}/${cleaned}`;
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
