import sharp from "sharp";
import { convertImageToWebp } from "../assets/webp";
import { idSchema } from "../dlc/schema";

export const PORTRAIT_MIN_PX = 512;
export const PORTRAIT_MAX_PX = 1024;
export const PORTRAIT_MAX_BYTES = 2 * 1024 * 1024;

const PORTRAIT_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/jpg"]);

export type PortraitCheck = { ok: true; webp: Buffer } | { ok: false; issues: string[] };

export function poetIdHint() {
  return "poetId 只能用字母、数字、下划线和短横线，例如 sushi、libai";
}

export function portraitHint() {
  return `诗人头像须为正方形 png/jpg/webp，边长 ${PORTRAIT_MIN_PX}–${PORTRAIT_MAX_PX}px，体积不超过 ${PORTRAIT_MAX_BYTES / (1024 * 1024)}MB`;
}

export function parsePoetId(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  const parsed = idSchema.safeParse(value);
  return parsed.success ? parsed.data.toLowerCase() : null;
}

export async function preparePoetPortrait(input: Buffer, mimeHint?: string): Promise<PortraitCheck> {
  const issues: string[] = [];
  if (input.byteLength === 0) {
    issues.push("头像文件是空的");
    return { ok: false, issues };
  }
  if (input.byteLength > PORTRAIT_MAX_BYTES) {
    issues.push(`头像超过 ${PORTRAIT_MAX_BYTES / (1024 * 1024)}MB`);
  }
  const hinted = (mimeHint ?? "").toLowerCase();
  if (hinted && !PORTRAIT_TYPES.has(hinted) && !hinted.endsWith("png") && !hinted.endsWith("jpeg") && !hinted.endsWith("jpg") && !hinted.endsWith("webp")) {
    issues.push("头像只接受 png / jpg / webp");
  }
  try {
    const meta = await sharp(input, { failOn: "none" }).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) {
      issues.push("读不出头像宽高");
    } else {
      if (width !== height) {
        issues.push(`头像必须是正方形，当前 ${width}×${height}`);
      }
      if (width < PORTRAIT_MIN_PX || width > PORTRAIT_MAX_PX) {
        issues.push(`头像边长须在 ${PORTRAIT_MIN_PX}–${PORTRAIT_MAX_PX}px，当前 ${width}px`);
      }
    }
  } catch {
    issues.push("头像不是可读的图片");
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, webp: await convertImageToWebp(input) };
}
