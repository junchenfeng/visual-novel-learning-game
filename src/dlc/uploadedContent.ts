import type { CompileResult } from "./compiler";
import { isUnpublishedDlc } from "./unpublished";

/** 学员上传课包的索引条目。线上存 OSS，扣子版没有这一层。 */
export type UploadedPack = {
  userId: string;
  dlcId: string;
  poetId: string;
  poet: string;
  workTitle: string;
  title: string;
  author: string;
  version: string;
  summary: string;
  uploadedAt: string;
};

/**
 * 「学员上传的课包」这一内容源的端口。
 *
 * 仓库自带课包（generated/dlc/*.json）是内核的一部分，直接读盘；学员上传的
 * 课包存在 OSS，属于宿主能力。内核只认这个接口，实现由宿主在服务启动时注入
 * （见根目录 instrumentation.ts）。没有注入就视为站点没有上传层——扣子版即如此。
 *
 * 这样切分之后 src/dlc/loadCompiled.ts 不再直接 import 上传索引模块，
 * 整个 DLC 加载链才能同步到扣子仓库。见 coze.config.json。
 */
export type UploadedDlcSource = {
  listPacks(): Promise<UploadedPack[]>;
  loadCompiled(id: string): Promise<unknown | null>;
};

let source: UploadedDlcSource | null = null;

export function setUploadedDlcSource(next: UploadedDlcSource | null): void {
  source = next;
}

export function getUploadedDlcSource(): UploadedDlcSource | null {
  return source;
}

export function uploadedPackToCompileResult(pack: UploadedPack): CompileResult {
  return {
    id: pack.dlcId,
    version: pack.version,
    title: pack.title,
    author: pack.author,
    poet: pack.poet,
    poetId: pack.poetId,
    workTitle: pack.workTitle,
    summary: pack.summary,
  };
}

export function publishedUploads(index: UploadedPack[], reservedGitIds: Set<string>): UploadedPack[] {
  return index.filter((item) => !isUnpublishedDlc(item.dlcId) && !reservedGitIds.has(item.dlcId));
}

export function findUploadedPack(index: UploadedPack[], dlcId: string): UploadedPack | undefined {
  return index.find((item) => item.dlcId === dlcId);
}
