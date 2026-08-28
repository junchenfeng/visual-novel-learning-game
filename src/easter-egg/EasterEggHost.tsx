"use client";

import type { CompiledDlc, EasterEggConfig } from "../dlc/schema";
import { resolveEasterEgg } from "./registry";

type EasterEggHostProps = {
  config: EasterEggConfig;
  dlc: CompiledDlc;
  onDone: () => void;
};

export function EasterEggHost({ config, dlc, onDone }: EasterEggHostProps) {
  const Game = resolveEasterEgg(config.kind);
  return <Game config={config} dlc={dlc} onDone={onDone} />;
}
