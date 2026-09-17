import type { ComponentType } from "react";
import type { EasterEggKind } from "../dlc/schema";
import { FillInGame } from "./FillInGame";
import { PlaceholderEasterEgg } from "./PlaceholderEasterEgg";
import type { EasterEggProps } from "./types";

export type { EasterEggProps } from "./types";

export const EASTER_EGG_REGISTRY: Record<EasterEggKind, ComponentType<EasterEggProps>> = {
  placeholder: PlaceholderEasterEgg,
  "fill-in": FillInGame,
};

export function resolveEasterEgg(kind: EasterEggKind) {
  return EASTER_EGG_REGISTRY[kind];
}
