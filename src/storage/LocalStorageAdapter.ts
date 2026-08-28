import {
  BEHAVIOR_EVENT_SCHEMA_VERSION,
  BEHAVIOR_STORAGE_KEY,
  behaviorLogSchema,
  type BehaviorEvent,
  type BehaviorLog,
} from "../analytics/eventSchema";
import type { StorageAdapter } from "./StorageAdapter";

function emptyLog(): BehaviorLog {
  return { schemaVersion: BEHAVIOR_EVENT_SCHEMA_VERSION, events: [] };
}

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly key = BEHAVIOR_STORAGE_KEY) {}

  append(event: BehaviorEvent): void {
    const log = this.readAll();
    log.events.push(event);
    this.write(log);
  }

  readAll(): BehaviorLog {
    if (typeof window === "undefined") {
      return emptyLog();
    }
    const raw = window.localStorage.getItem(this.key);
    if (!raw) {
      return emptyLog();
    }
    try {
      return behaviorLogSchema.parse(JSON.parse(raw));
    } catch {
      return emptyLog();
    }
  }

  clear(): void {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.removeItem(this.key);
  }

  exportJson(): string {
    return `${JSON.stringify(this.readAll(), null, 2)}\n`;
  }

  private write(log: BehaviorLog) {
    window.localStorage.setItem(this.key, JSON.stringify(log));
  }
}
