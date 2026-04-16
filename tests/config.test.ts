import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadStackConfig, resolveCombinedBranch } from "../src/config.js";

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
});
