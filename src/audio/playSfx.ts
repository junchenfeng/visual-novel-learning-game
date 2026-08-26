export type SfxName = "click" | "line" | "correct" | "incorrect";

const sources: Record<SfxName, string> = {
  click: "/sfx/click.wav",
  line: "/sfx/line.wav",
  correct: "/sfx/correct.wav",
  incorrect: "/sfx/incorrect.wav",
};

type Playable = { play: () => number | undefined };

const cache: Partial<Record<SfxName, Playable>> = {};

export function playSfx(name: SfxName) {
  void import("howler")
    .then(({ Howl }) => {
      if (!cache[name]) {
        cache[name] = new Howl({
          src: [sources[name]],
          volume: 0.32,
          onloaderror: () => undefined,
          onplayerror: () => undefined,
        });
      }
      cache[name]?.play();
    })
    .catch(() => undefined);
}
