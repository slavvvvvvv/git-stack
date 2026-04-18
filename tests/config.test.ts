import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDefaultRepoDefaults,
  getGlobalStacksPath,
  getTemplatePath,
  loadStackConfig,
  resolveCombinedBranch,
  writeStackConfig,
} from "../src/config.js";
import { getConfiguredEditor } from "../src/operations.js";

function writeConfig(content: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "git-stack-config-"));
  fs.writeFileSync(path.join(dir, ".stack.yml"), content, "utf8");
  return dir;
}

function withIsolatedHome<T>(fn: () => T): T {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "git-stack-home-"));
  const previous = process.env.GIT_STACK_HOME;
  process.env.GIT_STACK_HOME = home;
  try {
    return fn();
  } finally {
    if (previous == null) {
      delete process.env.GIT_STACK_HOME;
    } else {
      process.env.GIT_STACK_HOME = previous;
    }
  }
}

describe("config parsing", () => {
  it("parses branch shorthand and combined branches", () => {
    withIsolatedHome(() => {
      const repoPath = writeConfig(`
defaults:
  remote: upstream
stacks:
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
      expect(config.stacks[0]?.branches[0]?.name).toBe("alpha");
      expect(resolveCombinedBranch(config.stacks[0]!)).toBe("combined");
    });
  });

  it("rejects non-final combined branch", () => {
    withIsolatedHome(() => {
      const repoPath = writeConfig(`
stacks:
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
  });

  it("prefers EDITOR over VISUAL and falls back to VISUAL", () => {
    expect(getConfiguredEditor({ EDITOR: "nvim", VISUAL: "code -w" })).toBe("nvim");
    expect(getConfiguredEditor({ VISUAL: "code -w" })).toBe("code -w");
    expect(getConfiguredEditor({})).toBeNull();
  });

  it("writes config that can be loaded again", () => {
    withIsolatedHome(() => {
      const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "git-stack-write-"));
      writeStackConfig(repoPath, {
        defaults: createDefaultRepoDefaults(),
        stacks: [
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
      expect(config.stacks[0]?.name).toBe("demo");
      expect(config.stacks[0]?.branches[1]?.role).toBe("combined");
    });
  });

  it("writes normal branches before combined branches", () => {
    withIsolatedHome(() => {
      const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), "git-stack-write-order-"));
      writeStackConfig(repoPath, {
        defaults: createDefaultRepoDefaults(),
        stacks: [
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

      const written = fs.readFileSync(getGlobalStacksPath(), "utf8");
      const featureIndex = written.indexOf("- feature-b");
      const combinedIndex = written.indexOf("name: combined");
      expect(featureIndex).toBeGreaterThan(-1);
      expect(combinedIndex).toBeGreaterThan(featureIndex);
    });
  });

  it("resolves the bundled template path from the package", () => {
    const templatePath = getTemplatePath();
    expect(fs.existsSync(templatePath)).toBe(true);
    expect(path.basename(templatePath)).toBe("stack.yml");
  });

  it("prefers the global stacks file over a repo-local file when both exist", () => {
    withIsolatedHome(() => {
      const repoPath = writeConfig(`
stacks:
  repo-stack:
    syncBase: main
    prTarget: main
    branches:
      - alpha
`);
      fs.mkdirSync(path.dirname(getGlobalStacksPath()), { recursive: true });
      fs.writeFileSync(
        getGlobalStacksPath(),
        `stacks:\n  global-stack:\n    syncBase: main\n    prTarget: main\n    branches:\n      - beta\n`,
        "utf8",
      );

      const config = loadStackConfig(repoPath);
      expect(config.stacks[0]?.name).toBe("global-stack");
    });
  });
});
