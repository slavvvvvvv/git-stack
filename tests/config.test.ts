import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultRepoDefaults, getTemplatePath, loadStackConfig, resolveCombinedBranch, writeStackConfig } from "../src/config.js";
import { getConfiguredEditor } from "../src/operations.js";

function writeConfig(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "git-stack-config-"));
  fs.writeFileSync(path.join(dir, ".stack.yml"), content, "utf8");
  return dir;
}

describe("config parsing", () => {
  it("parses branch shorthand and combined branches", () => {
    const repoPath = writeConfig(`
defaults:
  remote: upstream
trains:
  demo:
    syncBase: main
    prTarget: main
    branches:
      - alpha
      - name: combined
        role: combined
`);

    const config = loadStackConfig(repoPath);
    expect(config.defaults.remote).toBe("upstream");
    expect(config.trains[0]?.branches[0]?.name).toBe("alpha");
    expect(resolveCombinedBranch(config.trains[0]!)).toBe("combined");
  });

  it("rejects non-final combined branch", () => {
    const repoPath = writeConfig(`
trains:
  demo:
    syncBase: main
    prTarget: main
    branches:
      - name: combined
        role: combined
      - alpha
`);

    expect(() => loadStackConfig(repoPath)).toThrow(/combined branch last/);
  });

  it("prefers EDITOR over VISUAL and falls back to VISUAL", () => {
    expect(getConfiguredEditor({ EDITOR: "nvim", VISUAL: "code -w" })).toBe("nvim");
    expect(getConfiguredEditor({ VISUAL: "code -w" })).toBe("code -w");
    expect(getConfiguredEditor({})).toBeNull();
  });

  it("writes config that can be loaded again", () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "git-stack-write-"));
    writeStackConfig(repoPath, {
      defaults: createDefaultRepoDefaults(),
      trains: [
        {
          name: "demo",
          syncBase: "main",
          prTarget: "main",
          branches: [
            { name: "feature-a", role: "normal" },
            { name: "combined", role: "combined" },
          ],
        },
      ],
    });

    const config = loadStackConfig(repoPath);
    expect(config.trains[0]?.name).toBe("demo");
    expect(config.trains[0]?.branches[1]?.role).toBe("combined");
  });

  it("writes normal branches before combined branches", () => {
    const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "git-stack-write-order-"));
    writeStackConfig(repoPath, {
      defaults: createDefaultRepoDefaults(),
      trains: [
        {
          name: "demo",
          syncBase: "main",
          prTarget: "main",
          branches: [
            { name: "feature-a", role: "normal" },
            { name: "feature-b", role: "normal" },
            { name: "combined", role: "combined" },
          ],
        },
      ],
    });

    const written = fs.readFileSync(path.join(repoPath, ".stack.yml"), "utf8");
    const featureIndex = written.indexOf("- feature-b");
    const combinedIndex = written.indexOf("name: combined");
    expect(featureIndex).toBeGreaterThan(-1);
    expect(combinedIndex).toBeGreaterThan(featureIndex);
  });

  it("resolves the bundled template path from the package", () => {
    const templatePath = getTemplatePath();
    expect(fs.existsSync(templatePath)).toBe(true);
    expect(path.basename(templatePath)).toBe("stack.yml");
  });
});
