import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { compiledDlcSchema, DlcValidationError, type CompiledDlc } from "./schema";
import type { CompileResult } from "./compiler";

function generatedDir() {
  return path.join(process.cwd(), "generated", "dlc");
}

export function loadCompiledCatalog(): CompileResult[] {
  const catalogPath = path.join(generatedDir(), "catalog.json");
  if (!existsSync(catalogPath)) {
    return [];
  }
  return JSON.parse(readFileSync(catalogPath, "utf8")) as CompileResult[];
}

export function loadCompiledDlc(id: string): CompiledDlc | null {
  if (!/^[a-z][a-z0-9_-]*$/i.test(id)) {
    return null;
  }
  const filePath = path.join(generatedDir(), `${id}.json`);
  if (!existsSync(filePath)) {
    return null;
  }
  try {
    return compiledDlcSchema.parse(JSON.parse(readFileSync(filePath, "utf8")));
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "编译产物与当前 schema 不一致";
    throw new DlcValidationError([`无法加载 DLC「${id}」：${detail}`]);
  }
}
