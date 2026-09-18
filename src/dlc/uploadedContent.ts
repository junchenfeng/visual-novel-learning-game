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
  /**
   * 包内容指纹（`fingerprintPackDir`，算在解压后的原始目录上）。
   * 缺省表示这是加指纹之前的老条目，不参与「版本与内容都没变就跳过审核」的判定。
   */
  contentSha256?: string;
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

/**
 * 端口存在进程级 globalThis 上，**不能**用模块级 `let source`。
 *
 * 生产构建（Turbopack）按入口分包：instrumentation 是一个入口，app/** 各路由是被
 * tree-shake 过的另一些 chunk。写入方 setUploadedDlcSource 在页面 chunk 里没有任何
 * 调用者，会被摇掉；于是那个 chunk 认为这份模块状态恒为 null，把 getUploadedDlcSource()
 * 常量折叠成 `() => null`，注入彻底失效——线上表现是学员上传的课包全部从目录里消失，
 * 只剩仓库自带的 generated/dlc/*.json。
 *
 * globalThis 的属性读写优化器无法折叠，且天然对同进程的所有 chunk 生效。
 */
const UPLOAD_SOURCE_KEY = "__poemRpgUploadedDlcSource__";

function hostGlobal(): Record<string, unknown> {
  return globalThis as unknown as Record<string, unknown>;
}

export function setUploadedDlcSource(next: UploadedDlcSource | null): void {
  hostGlobal()[UPLOAD_SOURCE_KEY] = next;
}

export function getUploadedDlcSource(): UploadedDlcSource | null {
  return (hostGlobal()[UPLOAD_SOURCE_KEY] as UploadedDlcSource | null | undefined) ?? null;
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
