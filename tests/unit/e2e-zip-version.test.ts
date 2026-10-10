import JSZip from "jszip";
import {
  buildE2eVersion,
  pickManifestPath,
  readZipManifest,
  replaceManifestVersionLine,
  rewriteManifestVersion,
} from "../../scripts/ingest-lib/zipVersion";

const MANIFEST = ["id: demo-pack", "version: 1.2", "title: 演示", "poetId: dufu", "workTitle: 望岳"].join("\n") + "\n";

async function buildZip(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) {
    zip.file(path, content);
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

describe("e2e 版本改写", () => {
  it("buildE2eVersion 拼出可读的测试版本号", () => {
    expect(buildE2eVersion("1.2", "20261010120000")).toBe("1.2+e2e.20261010120000");
    expect(buildE2eVersion("  v3 ", "20261010120000")).toBe("v3+e2e.20261010120000");
    expect(buildE2eVersion("", "20261010120000")).toBe("e2e.20261010120000");
  });

  it("replaceManifestVersionLine 只动 version 行，保留引号风格与行尾注释", () => {
    expect(replaceManifestVersionLine(MANIFEST, "2.0")).toContain("version: 2.0\n");
    expect(replaceManifestVersionLine('version: "1.0"  # 旧版本\n', "3.1")).toBe('version: "3.1"  # 旧版本\n');
    expect(replaceManifestVersionLine("  version: '0.9'\n", "1.0")).toBe("  version: '1.0'\n");
    // 其它行必须原样
    expect(replaceManifestVersionLine(MANIFEST, "2.0").split("\n")[0]).toBe("id: demo-pack");
    expect(() => replaceManifestVersionLine("id: x\ntitle: y\n", "1.0")).toThrow(/找不到可改写的 version/);
  });

  it("pickManifestPath 优先根目录，允许一层目录，忽略 macOS 噪声", () => {
    expect(pickManifestPath(["manifest.yaml", "content/story.yaml"])).toBe("manifest.yaml");
    expect(pickManifestPath(["pack/manifest.yaml", "pack/content/story.yaml"])).toBe("pack/manifest.yaml");
    expect(pickManifestPath(["__MACOSX/manifest.yaml", "pack/manifest.yaml"])).toBe("pack/manifest.yaml");
    expect(pickManifestPath(["a/b/c/manifest.yaml"])).toBeNull();
    expect(pickManifestPath(["pack/manifest.yml"])).toBeNull();
  });

  it("readZipManifest 读出 id/version", async () => {
    const zip = await buildZip({ "manifest.yaml": MANIFEST, "content/story.yaml": "nodes: []\n" });
    const manifest = await readZipManifest(zip);
    expect(manifest).toMatchObject({ path: "manifest.yaml", id: "demo-pack", version: "1.2" });
  });

  it("readZipManifest 缺 manifest / 缺 id / 缺 version 都会报错", async () => {
    await expect(readZipManifest(await buildZip({ "content/story.yaml": "nodes: []\n" }))).rejects.toThrow(/找不到 manifest\.yaml/);
    await expect(readZipManifest(await buildZip({ "manifest.yaml": "version: 1.0\n" }))).rejects.toThrow(/缺少 id/);
    await expect(readZipManifest(await buildZip({ "manifest.yaml": "id: demo-pack\n" }))).rejects.toThrow(/缺少 version/);
  });

  it("rewriteManifestVersion 只换版本，其余内容逐字节保留", async () => {
    const original = await buildZip({
      "manifest.yaml": MANIFEST,
      "content/story.yaml": "nodes:\n  - id: start\n",
      "assets/pic.png": "not-really-a-png",
    });
    const before = await readZipManifest(original);
    const { zip, previousVersion, manifest } = await rewriteManifestVersion(original, "1.2+e2e.20261010120000");

    expect(previousVersion).toBe("1.2");
    expect(manifest.version).toBe("1.2+e2e.20261010120000");
    const after = await readZipManifest(zip);
    expect(after.id).toBe(before.id);
    expect(after.version).toBe("1.2+e2e.20261010120000");

    const reloaded = await JSZip.loadAsync(zip);
    expect(await reloaded.file("content/story.yaml")!.async("string")).toBe("nodes:\n  - id: start\n");
    expect(await reloaded.file("assets/pic.png")!.async("string")).toBe("not-really-a-png");
    expect(zip.byteLength).toBeGreaterThan(0);
  });
});
