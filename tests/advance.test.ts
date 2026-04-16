import { describe, expect, it } from "vitest";
import { activeBranches, normalActiveBranches } from "../src/train.js";
import type { TrainStatus } from "../src/types.js";

const status: TrainStatus = {
  repoPath: "/tmp/repo",
  currentBranch: "feature-b",
  remote: "origin",
  strategy: "merge",
  combinedBranch: "combined",
  warnings: [],
  train: {
    name: "demo",
    syncBase: "main",
    prTarget: "main",
    branches: [
      { name: "feature-a", role: "normal" },
      { name: "feature-b", role: "normal" },
      { name: "combined", role: "combined" },
    ],
  },
  branches: [
    {
      name: "feature-a",
      role: "normal",
      index: 0,
      isCurrent: false,
      isMerged: true,
      isActive: false,
      existsLocally: true,
    },
    {
      name: "feature-b",
      role: "normal",
      index: 1,
      isCurrent: true,
      isMerged: false,
      isActive: true,
      existsLocally: true,
    },
    {
      name: "combined",
      role: "combined",
      index: 2,
      isCurrent: false,
      isMerged: false,
      isActive: true,
      existsLocally: true,
    },
  ],
};

describe("active branch helpers", () => {
  it("keeps combined branch in active list", () => {
    expect(activeBranches(status).map((branch) => branch.name)).toEqual(["feature-b", "combined"]);
  });

  it("filters combined branch out of normal active branches", () => {
    expect(normalActiveBranches(status).map((branch) => branch.name)).toEqual(["feature-b"]);
  });
});
