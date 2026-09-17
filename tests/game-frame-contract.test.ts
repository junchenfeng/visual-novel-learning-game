/**
 * 画框契约护栏：游戏画面活在一个固定尺寸的手机画框里，这条约束有代价，
 * 代价必须被显式兑现——本测试就是盯着这两处兑现点。
 *
 * 契约一（滚动）：GameViewport 把画面钉成 430×932，`.viewport` 上是 `overflow: clip`。
 * 因此任何比画框高的屏幕都必须**自己**充当滚动容器，否则内容被直接裁掉、
 * 整个页面无处可滚 —— 用户看到的就是「卡住，滑不动」。
 *
 * 契约二（触屏）：触屏设备（宽 > 600px 的平板、横屏手机）要靠 `(pointer: coarse)`
 * 从「手机画框 + 两侧装饰」切到全屏布局，并给画框内的按钮兜 44px 触控目标。
 *
 * 事故记录：
 * - 2026-09-11 e065647「手机上填词彩蛋可滚动，主按钮始终露在底部」修过契约一
 *   （三个空 + 每个 4 选项会把「落笔定稿」顶出画框）；契约二的规则由 b6c9f51 引入。
 * - 2026-09-17 b418601 为恢复被 Coze 合并切坏的特性线，把 fill-in.module.css
 *   与 viewport.module.css 整份退回旧版，两处**同时**静默失效；该提交自己还写着
 *   「jest 83 tests 全绿」——因为没有任何测试看 CSS。
 *
 * 量 scrollHeight 才能真正确证布局，但那要 e2e 基建；这里退一步用 CSS 声明做契约，
 * 不依赖浏览器、跑得快，专抓「布局修复被静默回退」。改动这些声明时请连带更新本测试。
 */
import { readFileSync } from "node:fs";
import path from "node:path";

type Rule = {
  selector: string;
  media: string;
  declarations: Record<string, string>;
};

const ROOT = path.join(__dirname, "..");

function parseDeclarations(body: string): Record<string, string> {
  const declarations: Record<string, string> = {};
  for (const piece of body.split(";")) {
    const colon = piece.indexOf(":");
    if (colon === -1) {
      continue;
    }
    declarations[piece.slice(0, colon).trim()] = piece.slice(colon + 1).trim();
  }
  return declarations;
}

/** 极简 CSS 解析：只取「选择器 → 声明（+所属媒体查询）」，够做布局契约，不引第三方依赖。 */
function parseRules(css: string): Rule[] {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: Rule[] = [];
  const stack: string[] = [];
  let buffer = "";

  for (const char of source) {
    if (char === "{") {
      stack.push(buffer.trim());
      buffer = "";
    } else if (char === "}") {
      // 选择器跨行书写时要归一化空白，否则 `.a,\n.b` 与 `.a, .b` 对不上。
      const selector = (stack.pop() ?? "").replace(/\s+/g, " ").trim();
      const body = buffer;
      buffer = "";
      if (!selector.startsWith("@")) {
        rules.push({
          selector,
          media: stack.find((item) => item.startsWith("@")) ?? "",
          declarations: parseDeclarations(body),
        });
      }
    } else {
      buffer += char;
    }
  }

  return rules;
}

function loadRules(relativePath: string): Rule[] {
  return parseRules(readFileSync(path.join(ROOT, relativePath), "utf8"));
}

/** 合并某选择器在非媒体查询下的全部声明（含多段同名规则）。 */
function baseDeclarations(rules: Rule[], selector: string): Record<string, string> {
  return rules
    .filter((rule) => rule.media === "" && rule.selector === selector)
    .reduce<Record<string, string>>((acc, rule) => ({ ...acc, ...rule.declarations }), {});
}

/** 合并某选择器在命中该媒体查询片段下的全部声明。 */
function mediaDeclarations(rules: Rule[], mediaFragment: string, selector: string): Record<string, string> {
  return rules
    .filter((rule) => rule.media.includes(mediaFragment) && rule.selector === selector)
    .reduce<Record<string, string>>((acc, rule) => ({ ...acc, ...rule.declarations }), {});
}

function overflowsY(declarations: Record<string, string>): boolean {
  const scroller = ["auto", "scroll"];
  return [declarations["overflow-y"], declarations["overflow"]].some(
    (value) => value !== undefined && scroller.includes(value),
  );
}

/** 高度被约束住（不会随内容长高），才谈得上「内部滚动」。 */
function isHeightBounded(declarations: Record<string, string>): boolean {
  if (declarations.height === "100%" || declarations["max-height"] === "100%") {
    return true;
  }
  return declarations.position === "absolute" && declarations.inset === "0";
}

describe("填词彩蛋（fill-in）在固定画框里可滚动", () => {
  const rules = loadRules("src/easter-egg/fill-in.module.css");

  it("根容器自己就是滚动容器，而不是被画框裁掉", () => {
    const shell = baseDeclarations(rules, ".shell");

    expect(isHeightBounded(shell)).toBe(true);
    expect(overflowsY(shell)).toBe(true);
    // flex 链条上不写 min-height: 0，滚动容器会被内容撑开而失去滚动条。
    expect(shell["min-height"]).toBe("0");
    expect(shell["overscroll-behavior"]).toBe("contain");
  });

  it("主按钮贴住画框底部，滚到哪都点得到「落笔定稿」", () => {
    const actions = baseDeclarations(rules, ".actions");

    expect(actions.position).toBe("sticky");
    expect(actions.bottom).toBe("0");
  });
});

describe("视口对触屏设备让位", () => {
  const rules = loadRules("src/components/viewport.module.css");

  it("(pointer: coarse) 与窄屏一样切成全屏，不再套 430px 手机画框", () => {
    const shell = mediaDeclarations(rules, "(pointer: coarse)", ".desktopShell");
    const viewport = mediaDeclarations(rules, "(pointer: coarse)", ".viewport");

    expect(shell.display).toBe("block");
    expect(shell.padding).toBe("0");
    expect(viewport.width).toBe("100%");
    expect(viewport.height).toBe("100dvh");
    expect(viewport.zoom).toBe("1");
  });

  it("画框内按钮在触屏上兜 44px 触控目标", () => {
    const touchTargets = mediaDeclarations(rules, "(pointer: coarse)", ".canvas button, .canvas a");

    expect(touchTargets["min-height"]).toBe("44px");
    expect(touchTargets["touch-action"]).toBe("manipulation");
  });
});
