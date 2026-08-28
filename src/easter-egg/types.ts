import type { CompiledDlc, EasterEggConfig } from "../dlc/schema";

export type EasterEggProps = {
  config: EasterEggConfig;
  dlc: CompiledDlc;
  onDone: () => void;
};
