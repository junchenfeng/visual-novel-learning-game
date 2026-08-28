import { mkdirSync, readdirSync, writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { stringify } from "yaml";
import {
  MAX_RECORDED_SESSIONS_PER_DLC,
  recordedSessionSchema,
  type RecordedSession,
} from "./recordedSession";

export const DEFAULT_SESSIONS_ROOT = "assets/sessions";
export const LATEST_SESSION_FILENAME = "latest.yaml";

export function sessionDirectory(dlcId: string, root = DEFAULT_SESSIONS_ROOT): string {
  return path.join(root, dlcId);
}

export function writeRecordedSession(
  session: RecordedSession,
  root = DEFAULT_SESSIONS_ROOT,
): { filePath: string; latestPath: string } {
  const parsed = recordedSessionSchema.parse(session);
  const dir = sessionDirectory(parsed.dlcId, root);
  mkdirSync(dir, { recursive: true });
  const yaml = stringify(parsed, { lineWidth: 0 });
  const filePath = path.join(dir, `${parsed.id}.yaml`);
  const latestPath = path.join(dir, LATEST_SESSION_FILENAME);
  writeFileSync(filePath, yaml);
  writeFileSync(latestPath, yaml);
  pruneOldSessions(dir);
  return { filePath, latestPath };
}

function pruneOldSessions(dir: string) {
  const files = readdirSync(dir)
    .filter((name) => name.startsWith("s-") && name.endsWith(".yaml"))
    .sort();
  const extra = files.length - MAX_RECORDED_SESSIONS_PER_DLC;
  if (extra <= 0) {
    return;
  }
  for (const name of files.slice(0, extra)) {
    unlinkSync(path.join(dir, name));
  }
}
