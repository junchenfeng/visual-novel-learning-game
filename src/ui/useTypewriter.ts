"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type TypewriterResult = {
  /** 当前应显示的文本片段 */
  displayed: string;
  /** 是否已完整显示 */
  done: boolean;
  /** 立即显示全文，并终止进行中的逐字任务 */
  skip: () => void;
};

const DEFAULT_SPEED_MS = 30;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 打字机效果：逐字显示 text。
 * - 文本变化时从头重播（渲染阶段同步重置进度，不闪现全文）
 * - skip() 立即显示全文；会话化的 setTimeout 链保证 skip / 换文本 / 卸载
 *   都能干净终止后台任务，不会出现旧任务回写新文本的时序问题
 * - prefers-reduced-motion: reduce 时直接显示全文
 */
export function useTypewriter(text: string, speed = DEFAULT_SPEED_MS): TypewriterResult {
  const [count, setCount] = useState(0);
  const sessionRef = useRef(0);

  // 文本变化时在渲染阶段同步重置进度，并作废旧会话
  const [prevText, setPrevText] = useState(text);
  if (prevText !== text) {
    setPrevText(text);
    setCount(0);
    sessionRef.current += 1;
  }

  useEffect(() => {
    const total = text.length;
    if (speed <= 0 || prefersReducedMotion()) {
      setCount(total);
      return;
    }
    if (total === 0) {
      return;
    }
    const session = sessionRef.current;
    let timer: number | undefined;
    const step = (next: number) => {
      if (sessionRef.current !== session) {
        return; // 会话已被换文本/跳过作废
      }
      setCount(next);
      if (next >= total) {
        return;
      }
      timer = window.setTimeout(() => step(next + 1), speed);
    };
    step(1);
    return () => {
      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [text, speed]);

  const skip = useCallback(() => {
    sessionRef.current += 1;
    setCount(text.length);
  }, [text]);

  return {
    displayed: text.slice(0, count),
    done: count >= text.length,
    skip,
  };
}
