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
