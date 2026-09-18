import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** 解压 / 打包链路里一律忽略的噪音条目，与 `findPackRoot` 的口径保持一致。 */
const IGNORED_NAMES = new Set(["__MACOSX", ".DS_Store"]);

/** 递归列出包根下的文件，返回相对包根的 POSIX 路径，已排序。 */
function listPackFiles(root: string): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) {
      return;
    }
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED_NAMES.has(entry.name)) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        files.push(path.relative(root, full).split(path.sep).join("/"));
      }
    }
  };
  walk(root);
  return files.sort();
}

/**
 * 包内容指纹 = 「路径 + 每个文件内容的 sha256」再汇总成一次 sha256。
 *
 * 用来判断「学员这次提交的包与线上那份是不是同一份内容」，所以取值位置有两条硬约束：
 * - 不能对 zip 字节取哈希：重新打包会改时间戳与条目顺序，同一份内容会得到不同值；
 * - 不能对编译产物取哈希：发布侧会先 `convertPackRastersToWebp` 把 png 转 webp 并改写
 *   yaml 引用，与审核侧拿到的原始目录对不上。
 *
 * 因此审核侧（machineReviewZip）与发布侧（publishUploadedDlc）都必须在
 * `findPackRoot` 之后、`convertPackRastersToWebp` 之前对**解压后的原始目录**取值。
 * 包外层的包裹文件夹名不参与计算（`findPackRoot` 已经把它归一化了）。
 */
export function fingerprintPackDir(packRoot: string): string {
  const digest = createHash("sha256");
  for (const relative of listPackFiles(packRoot)) {
    const fileHash = createHash("sha256")
      .update(readFileSync(path.join(packRoot, relative)))
      .digest("hex");
    digest.update(relative).update("\0").update(fileHash).update("\n");
  }
  return digest.digest("hex");
}
