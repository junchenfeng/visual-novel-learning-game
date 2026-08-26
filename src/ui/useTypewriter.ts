"use client";

// 打字机效果已移除：直接返回完整文本，避免动画与渲染时序问题。
export function useTypewriter(text: string, _ms?: number) {
  return {
    displayed: text,
    done: true,
    skip: () => undefined,
  };
}