<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md

## 项目概览
诗词穿越 RPG 游戏 —— 用户选择诗人 → 进入该诗人的书架 → 选择具体篇目 → 以文字冒险/法庭辩论形式与诗词互动。

- **框架**: Next.js 16 (App Router) + React 19 + TypeScript
- **样式**: CSS Modules (`.module.css`)
- **状态**: XState (gameMachine)
- **测试**: Jest

## 目录结构
```
app/
  page.tsx                 # 首页：诗人选择列表
  poet/[poetId]/page.tsx   # 书架页：博古架陈列该诗人的作品
  play/[dlcId]/page.tsx    # 游戏页：实际游玩
  globals.css              # 全局样式
src/
  components/              # UI 组件
    CurioShelf.tsx         # 博古架书架容器（不规则格子布局）
    CurioBook.tsx          # 线装书组件（竖排/平放/卷轴三种形态）
    curio-shelf.module.css # 博古架 & 线装书样式
    BookCard.tsx           # 旧版书卡（保留备用）
    BookFrame.tsx          # 阅读页框架
    GamePlayer.tsx         # 游戏主控制器
  dlc/                     # DLC 内容加载与编译
    catalog.ts             # 目录数据模型 & 工具函数
    roster.ts              # 诗人名单
    compiler.ts            # DLC 编译器
  game/
    gameMachine.ts         # 游戏状态机（XState）
  ui/                      # 通用 UI 工具
public/
  xuanzhi-bg.webp          # 宣纸纹理背景图（博古架用）
  poets/                   # 诗人头像
```

## 书架系统（博古架风格）

**核心组件**:
- `CurioShelf` — 博古架容器，12 列 CSS Grid 不规则布局，自动分配书籍与装饰格
- `CurioBook` — 单本书组件，支持三种形态：`vertical`（竖排线装）、`horizontal`（平放）、`scroll`（卷轴）

**设计规范**：见 `DESIGN.md`

**配色方案**:
- 主色：靛蓝 `#2c4a6b`（线装书封面）
- 背景：宣纸米黄 `#f0e6d0` + `xuanzhi-bg.webp` 纹理
- 装饰线：暗金 `#b8860b`
- 点缀：印章红 `#a63232`

## 开发命令
```bash
pnpm install     # 安装依赖
pnpm run dev     # 启动开发服务器 (端口 5000)
pnpm run build   # 生产构建
pnpm run typecheck  # TS 类型检查
pnpm test        # 运行 Jest 测试
```

## 测试
- 运行 `pnpm test` 执行所有单元测试（catalog / dlc-schema / eventSchema / gameMachine / compiler）
- 书架页接口：`GET /poet/[poetId]`

## 注意事项
- DLC 内容需要先通过 `pnpm run compile:dlc` 编译到 `generated/dlc/` 目录
- `predev` / `prebuild` 钩子已自动触发编译
- Next.js 16 有破坏性变更，写代码前查阅 `node_modules/next/dist/docs/`
- 故事结束到读词之间可在 `manifest.yaml` 配可选 `easterEgg`；不配则最后一页只有「开始读词」，不会出现「这是什么？」。字段见 `docs/dlc-spec.md`。

## 新增 DLC（带练创作）

当聊到「做某个诗人的某首诗」时，先走带练流程，别直接写 YAML。YAML 字段与图规则见 `docs/dlc-spec.md`。

**中间产物只写到仓库根目录 `assets/<poetId>/<work-slug>/`（诗人 id / 诗词 slug，如 `assets/sushi/shuidiao-getou/`）。** 根目录 `/assets/` 已在 `.gitignore` 中忽略，用来放带练过程文件，避免污染 git。不要写进 `docs/`、`dlc/` 或其他会被跟踪的目录。DLC 包内的 `dlc/.../assets/` 是正式背景/立绘，会进 git，草稿不要放进去。

带练工作单（按环节逐份落盘，确认后再誊进 YAML）：

| 环节 | 中间产物 | 最终落到 |
| --- | --- | --- |
| 信息搜集 | `01_teaching-card.md` 备课卡 | 不直接转 YAML |
| 剧情设计 | `02_story-beats.md` 故事线与关卡 | `content/story.yaml` |
| 读诗教学 | `03_poem-notes.md` 诗词解析 | `content/poem.yaml` |
| 课堂教学 | `04_quiz-design.md` 考题设计 | `content/quiz.yaml` |
| 课堂教学·试评 | `06_answer-samples.md` 答卷样例 | 试评用，不转 YAML |
| 生图准备 | `05_storyboard.md` 分镜表 | 生成图进 DLC 包 `assets/` |

开始前：查该目录下已有工作单，据已落内容判断当前进度，接着往下走，不重复劳动。再对照 `dlc/`、`src/dlc/roster.ts`、`generated/dlc/`，确认诗人与篇目是否已登记、命名与目录规范是否一致。
