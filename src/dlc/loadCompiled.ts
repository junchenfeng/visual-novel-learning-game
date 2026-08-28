import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { compiledDlcSchema, type CompiledDlc } from "./schema";
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
  return compiledDlcSchema.parse(JSON.parse(readFileSync(filePath, "utf8")));
}
