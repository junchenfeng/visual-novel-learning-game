export const STATIC_OSS_PREFIX = "poem-rpg/static";

function trimSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function galleryCdnBaseUrl(): string {
  if (typeof window !== "undefined") {
    return "";
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("../server/galleryConfig") as {
      loadGalleryConfig: () => { cdnBaseUrl?: string } | null;
    };
    return trimSlash(mod.loadGalleryConfig()?.cdnBaseUrl ?? "");
  } catch {
    return "";
  }
}

export function getCdnBaseUrl(): string {
  const fromEnv = process.env.CDN_BASE_URL?.trim() || process.env.NEXT_PUBLIC_CDN_BASE_URL?.trim();
  if (fromEnv) {
    return trimSlash(fromEnv);
  }
  if (process.env.JEST_WORKER_ID || process.env.NODE_ENV !== "production") {
    return "";
  }
  return galleryCdnBaseUrl();
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
