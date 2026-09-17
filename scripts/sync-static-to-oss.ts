import { existsSync, readFileSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { STATIC_OSS_PREFIX } from "../src/assets/cdn";
import { convertImageToWebp, isRasterImagePath, replaceExtWithWebp } from "../src/assets/webp";
import { loadGalleryConfig } from "../src/server/galleryConfig";

const IMAGE_EXT = new Set([".webp", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".avif"]);
const AUDIO_EXT = new Set([".mp3", ".ogg", ".wav", ".m4a"]);

async function walkFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function mimeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".webp") return "image/webp";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".avif") return "image/avif";
  if (ext === ".mp3") return "audio/mpeg";
  if (ext === ".ogg") return "audio/ogg";
  if (ext === ".wav") return "audio/wav";
  if (ext === ".m4a") return "audio/mp4";
  return "application/octet-stream";
}

type OssClient = {
  put: (
    key: string,
    data: string | Buffer,
    options?: { mime?: string; headers?: Record<string, string> },
  ) => Promise<unknown>;
};

async function main() {
  const gallery = loadGalleryConfig();
  if (!gallery?.oss) {
    console.log("未找到 ai-gallery OSS 配置，跳过静态资源同步");
    return;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const OSS = require("ali-oss") as new (options: Record<string, unknown>) => OssClient;
  const client = new OSS({
    accessKeyId: gallery.oss.accessKeyId,
    accessKeySecret: gallery.oss.accessKeySecret,
    bucket: gallery.oss.bucket,
    region: gallery.oss.region,
    endpoint: gallery.oss.endpoint,
    secure: true,
  });

  const publicRoot = path.join(process.cwd(), "public");
  const files = (await walkFiles(publicRoot)).filter((filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    return IMAGE_EXT.has(ext) || AUDIO_EXT.has(ext);
  });

  const nativeWebp = new Set(
    files
      .filter((filePath) => path.extname(filePath).toLowerCase() === ".webp")
      .map((filePath) => path.relative(publicRoot, filePath).split(path.sep).join("/")),
  );

  let uploaded = 0;
  for (const filePath of files) {
    const relative = path.relative(publicRoot, filePath).split(path.sep).join("/");
    let keyRelative = relative;
    let body = readFileSync(filePath);
    let uploadPath = filePath;

    if (isRasterImagePath(filePath)) {
      const webpRelative = replaceExtWithWebp(relative);
      if (nativeWebp.has(webpRelative) && webpRelative !== relative) {
        continue;
      }
      body = Buffer.from(await convertImageToWebp(body));
      keyRelative = webpRelative;
      uploadPath = replaceExtWithWebp(filePath);
    }

    const key = `${STATIC_OSS_PREFIX}/${keyRelative}`;
    await client.put(key, body, {
      mime: mimeFor(uploadPath),
      headers: {
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
    uploaded += 1;
    const kb = Math.round((existsSync(filePath) ? statSync(filePath).size : body.length) / 1024);
    console.log(`uploaded ${key} (${kb}KB)`);
  }
  const cdn = process.env.CDN_BASE_URL?.trim() || "(未设置 CDN_BASE_URL，仅写入 OSS)";
  console.log(`已同步 ${uploaded} 个静态文件到 OSS，CDN 前缀：${cdn}/${STATIC_OSS_PREFIX}/`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
