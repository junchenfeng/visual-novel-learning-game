"use client";

import { useEffect, useRef } from "react";

export function useOptionalHowl(src?: string, options?: { loop?: boolean }) {
  useEffect(() => {
    if (!src) {
      return;
    }
    let cancelled = false;
    let sound: { stop: () => void; unload: () => void } | null = null;

    void import("howler").then(({ Howl }) => {
      if (cancelled) {
        return;
      }
      const instance = new Howl({
        src: [src],
        loop: options?.loop ?? false,
        volume: 0.28,
        // 线上 BGM 放在 CDN 上，属跨源资源。Howler 默认走 Web Audio：先用 XHR 把整段
        // 音频取回来再 decodeAudioData，而跨源 XHR 需要 Access-Control-Allow-Origin。
        // CDN 早已把这条 URL 连同「不带 ACAO」的响应缓存了下来（Cache-Control:
        // immutable，边缘 TTL 30 天），事后补 OSS 桶的 CORS 规则也刷不掉旧缓存，
        // 控制台就一直报 CORS 失败。html5 模式改用 <audio> 直接拉流——媒体元素跨源
        // 播放不需要 CORS，音量与循环照旧，也就不必去刷 CDN 缓存。
        // （OSS 桶的 CORS 规则已补上，见 docs/deploy-ecs.md；将来若要用 Web Audio
        //  做音量淡入淡出，得连同刷新 CDN 缓存或换 URL 一起做。）
        html5: true,
        onloaderror: () => undefined,
        onplayerror: () => undefined,
      });
      sound = instance;
      instance.play();
    });

    return () => {
      cancelled = true;
      sound?.stop();
      sound?.unload();
    };
  }, [src, options?.loop]);
}

export function usePageTurnSound(active: boolean) {
  const previous = useRef(false);
  useEffect(() => {
    if (!active || previous.current === active) {
      previous.current = active;
      return;
    }
    previous.current = active;
    const AudioContextCtor =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }
    const context = new AudioContextCtor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.value = 420;
    gain.gain.value = 0.04;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.stop(context.currentTime + 0.2);
    const timer = window.setTimeout(() => void context.close(), 250);
    return () => window.clearTimeout(timer);
  }, [active]);
}
