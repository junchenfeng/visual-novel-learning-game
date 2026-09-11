import sharp from "sharp";

export const RASTER_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif"]);
const MAX_LONG_EDGE = 1920;
const WEBP_QUALITY = 80;

export function replaceExtWithWebp(filePath: string): string {
  return filePath.replace(/\.(png|jpe?g|gif)$/i, ".webp");
}

export function isRasterImagePath(filePath: string): boolean {
  const match = filePath.match(/(\.[^.]+)$/);
  return Boolean(match && RASTER_EXTS.has(match[1].toLowerCase()));
}

export async function convertImageToWebp(input: Buffer): Promise<Buffer> {
  const image = sharp(input, { failOn: "none", animated: true });
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const longEdge = Math.max(width, height);
  const pipeline =
    longEdge > MAX_LONG_EDGE
      ? image.resize({
          width: width >= height ? MAX_LONG_EDGE : undefined,
          height: height > width ? MAX_LONG_EDGE : undefined,
          fit: "inside",
          withoutEnlargement: true,
        })
      : image;
  return pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
}
