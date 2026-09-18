/**
 * 测试环境的 store 护栏（jest setupFiles）。
 *
 * 本机 `../ai-gallery/config.json` 通常真实存在，于是 `getPoemStore()` 会连上**真 OSS**。
 * 2026-09-18 有测试忘了把注入的 store 往 `upsert_poet` 传，直接把线上诗人头像与名册写坏
 * （头像从 250KB 变成 542 字节的灰图、诗人名被改）。`src/server/galleryConfig.ts` 现在把
 * 显式的 `AI_GALLERY_CONFIG` 当权威（设了但不存在 = 没有配置），这里就利用这一点把测试进程
 * 钉在本地 store：任何漏传 `store` 的代码只会写进仓库 `assets/poem-rpg/`（已 gitignore），
 * 不会打到线上。
 */
process.env.AI_GALLERY_CONFIG = "/nonexistent/ai-gallery/config.json";
