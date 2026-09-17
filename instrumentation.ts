/**
 * 宿主启动钩子。
 *
 * Next 保证 register() 在一个服务实例开始处理请求之前完成一次，所以这里是
 * 「把 OSS 上传层接到内核端口上」的唯一确定时机——不能在请求路径里懒加载，
 * 否则进程起来后的第一个请求就可能拿不到已上传的课包。
 *
 * 扣子专用仓库不含本文件，内核的 getUploadedDlcSource() 始终是 null，
 * 于是只读仓库自带的 generated/dlc/*.json。
 */
export function register(): void {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { setUploadedDlcSource } = require("./src/dlc/uploadedContent") as typeof import("./src/dlc/uploadedContent");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createUploadedDlcSource } = require("./src/dlc/uploadIndex") as typeof import("./src/dlc/uploadIndex");
  setUploadedDlcSource(createUploadedDlcSource());
}
