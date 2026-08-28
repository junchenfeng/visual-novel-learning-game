import { cpSync, mkdirSync, readdirSync, writeFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import { DlcValidationError } from "./schema";
import { parseDlcDirectory } from "./parser";

export type CompileOptions = {
  dlcRoot: string;
  outDir: string;
  publicDir: string;
};

export type CompileResult = {
  id: string;
  version: string;
  title: string;
  author: string;
  poet: string;
  poetId: string;
  workTitle: string;
  summary: string;
};

function* walkDlcPacks(root: string): Generator<{ packDir: string; poetDir: string }> {
  if (!existsSync(root)) {
    return;
  }
  for (const poetEntry of readdirSync(root, { withFileTypes: true })) {
    if (!poetEntry.isDirectory()) continue;
    const poetDir = path.join(root, poetEntry.name);
    for (const poemEntry of readdirSync(poetDir, { withFileTypes: true })) {
      if (!poemEntry.isDirectory()) continue;
      const poemDir = path.join(poetDir, poemEntry.name);
      for (const packEntry of readdirSync(poemDir, { withFileTypes: true })) {
        if (!packEntry.isDirectory()) continue;
        const packDir = path.join(poemDir, packEntry.name);
        const manifestPath = path.join(packDir, "manifest.yaml");
        if (existsSync(manifestPath) && statSync(manifestPath).isFile()) {
          yield { packDir, poetDir: poetEntry.name };
        }
      }
    }
  }
}

export function compileAllDlcs(options: CompileOptions): CompileResult[] {
  if (!existsSync(options.dlcRoot)) {
    throw new DlcValidationError([`找不到 DLC 目录：${options.dlcRoot}`]);
  }

  const packs = [...walkDlcPacks(options.dlcRoot)];
  if (packs.length === 0) {
    throw new DlcValidationError(["DLC 目录为空（未找到任何 manifest.yaml）"]);
  }

  mkdirSync(options.outDir, { recursive: true });
  mkdirSync(options.publicDir, { recursive: true });

  const catalog: CompileResult[] = [];
  const issues: string[] = [];
  const seenIds = new Set<string>();

  for (const { packDir, poetDir } of packs) {
    try {
      const compiled = parseDlcDirectory(packDir);
      const manifest = compiled.manifest;

      // 校验 shortId 全局唯一
      if (seenIds.has(manifest.id)) {
        issues.push(`DLC id 重复：${manifest.id}（${packDir}）`);
        continue;
      }
      seenIds.add(manifest.id);

      // 校验 poetId 与目录第一层一致
      if (manifest.poetId !== poetDir) {
        issues.push(
          `DLC ${manifest.id}: manifest.poetId (${manifest.poetId}) 与目录第一层 (${poetDir}) 不一致`,
        );
        continue;
      }

      writeFileSync(
        path.join(options.outDir, `${manifest.id}.json`),
        `${JSON.stringify(compiled, null, 2)}\n`,
        "utf8",
      );
      const assetsSource = path.join(packDir, "assets");
      const assetsTarget = path.join(options.publicDir, manifest.id, "assets");
      if (existsSync(assetsSource)) {
        mkdirSync(path.dirname(assetsTarget), { recursive: true });
        cpSync(assetsSource, assetsTarget, { recursive: true });
      }
      catalog.push({
        id: manifest.id,
        version: manifest.version,
        title: manifest.title,
        author: manifest.author,
        poet: manifest.poet,
        poetId: manifest.poetId,
        workTitle: manifest.workTitle,
        summary: manifest.summary,
      });
    } catch (error) {
      const packName = path.basename(packDir);
      if (error instanceof DlcValidationError) {
        issues.push(`DLC ${packName}:\n${error.issues.map((item) => `- ${item}`).join("\n")}`);
      } else {
        issues.push(`DLC ${packName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  if (issues.length > 0) {
    throw new DlcValidationError(issues);
  }

  writeFileSync(
    path.join(options.outDir, "catalog.json"),
    `${JSON.stringify(catalog, null, 2)}\n`,
    "utf8",
  );
  return catalog;
}
