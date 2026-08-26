import type { BehaviorEvent, BehaviorLog } from "../analytics/eventSchema";

export interface StorageAdapter {
  append(event: BehaviorEvent): void;
  readAll(): BehaviorLog;
  clear(): void;
  exportJson(): string;
}
