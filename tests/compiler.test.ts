import { compileAllDlcs } from "../src/dlc/compiler";
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const REAL_PACK_SRC = "dlc/sushi/shuidiao-getou/hailao-shuidiao";

function copyRealPack(root: string, poetDir: string, poemDir: string, packId: string): { packDir: string; manifestPath: string } {
  const packDir = path.join(root, poetDir, poemDir, packId);
  cpSync(REAL_PACK_SRC, packDir, { recursive: true });
  return { packDir, manifestPath: path.join(packDir, "manifest.yaml") };
}

function patchManifest(manifestPath: string, overrides: Record<string, unknown>) {
  const yaml = readFileSync(manifestPath, "utf8");
  let result = yaml;
  for (const [key, value] of Object.entries(overrides)) {
    const regex = new RegExp(`^${key}:.*$`, "m");
    result = result.replace(regex, `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`);
  }
  writeFileSync(manifestPath, result);
}

describe("DLC compiler", () => {
  it("writes catalog json for valid packs with three-level directory", () => {
    const catalog = compileAllDlcs({
      dlcRoot: "dlc",
      outDir: path.join(process.cwd(), "generated", "dlc"),
      publicDir: path.join(process.cwd(), "public", "dlc"),
    });
    expect(catalog.some((item) => item.id === "hailao-shuidiao")).toBe(true);
    expect(catalog[0]?.author).toBeTruthy();
  });

  it("validates poetId matches first-level directory", () => {
    const root = mkdtempSync(path.join(tmpdir(), "dlc-"));
    const { manifestPath } = copyRealPack(root, "libai", "jingyesi", "bad-pack");
    patchManifest(manifestPath, { poetId: "libai", poet: "李白" });
    // 故意把 poetId 改成跟目录不一致
    patchManifest(manifestPath, { poetId: "sushi" });
    expect(() =>
      compileAllDlcs({
        dlcRoot: root,
        outDir: path.join(root, "out"),
        publicDir: path.join(root, "public"),
      }),
    ).toThrow(/poetId.*目录/);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects duplicate short ids across packs", () => {
    const root = mkdtempSync(path.join(tmpdir(), "dlc-"));
    copyRealPack(root, "sushi", "poem-a", "dup-id");
    copyRealPack(root, "sushi", "poem-b", "dup-id");
    expect(() =>
      compileAllDlcs({
        dlcRoot: root,
        outDir: path.join(root, "out"),
        publicDir: path.join(root, "public"),
      }),
    ).toThrow(/id 重复/);
    rmSync(root, { recursive: true, force: true });
  });

  it("fails when a pack is invalid", () => {
    const root = mkdtempSync(path.join(tmpdir(), "dlc-"));
    const packDir = path.join(root, "sushi", "bad", "bad-pack");
    mkdirSync(packDir, { recursive: true });
    writeFileSync(path.join(packDir, "manifest.yaml"), "schemaVersion: 1\n");
    expect(() =>
      compileAllDlcs({
        dlcRoot: root,
        outDir: path.join(root, "out"),
        publicDir: path.join(root, "public"),
      }),
    ).toThrow();
    rmSync(root, { recursive: true, force: true });
  });
});
