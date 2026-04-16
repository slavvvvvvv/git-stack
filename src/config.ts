import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { z } from "zod";
import type {
  BranchDefinition,
  GlobalConfig,
  RepoDefaults,
  StackConfig,
  TrainDefinition,
} from "./types.js";

const branchItemSchema = z.union([
  z.string().trim().min(1),
  z.object({
    name: z.string().trim().min(1),
    role: z.enum(["normal", "combined"]).default("normal"),
  }),
]);

const repoDefaultsSchema = z.object({
  remote: z.string().trim().min(1).default("origin"),
  sync: z
    .object({
      strategy: z.enum(["merge", "rebase"]).default("merge"),
    })
    .default({ strategy: "merge" }),
  github: z
    .object({
      host: z.string().trim().min(1).default("github.com"),
    })
    .default({ host: "github.com" }),
  prs: z
    .object({
      draft: z.boolean().default(false),
      printUrls: z.boolean().default(false),
      commentOnUpdate: z.string().nullable().default(null),
      combinedTitleTemplate: z.string().trim().min(1).default("{{train.name}}"),
    })
    .default({
      draft: false,
      printUrls: false,
      commentOnUpdate: null,
      combinedTitleTemplate: "{{train.name}}",
    }),
  lifecycle: z
    .object({
      keepMergedInToc: z.boolean().default(true),
      closeMergedPrs: z.boolean().default(false),
    })
    .default({
      keepMergedInToc: true,
      closeMergedPrs: false,
    }),
});

const trainSchema = z.object({
  syncBase: z.string().trim().min(1),
  prTarget: z.string().trim().min(1),
  branches: z.array(branchItemSchema).min(1),
});

const stackConfigSchema = z.object({
  defaults: z.unknown().optional(),
  trains: z.record(z.string().trim().min(1), trainSchema),
});

const globalConfigSchema = z.object({
  defaults: z.unknown().optional(),
  github: z
    .object({
      token: z.string().trim().min(1).optional(),
      host: z.string().trim().min(1).optional(),
    })
    .optional(),
});

function parseYamlFile(filePath: string): unknown {
  const content = fs.readFileSync(filePath, "utf8");
  return yaml.load(content);
}

function branchDefinitionFromInput(input: string | { name: string; role?: "normal" | "combined" }): BranchDefinition {
  if (typeof input === "string") {
    return { name: input, role: "normal" };
  }

  return {
    name: input.name,
    role: input.role ?? "normal",
  };
}

function normalizeTrain(name: string, raw: z.infer<typeof trainSchema>): TrainDefinition {
  const branches = raw.branches.map(branchDefinitionFromInput);
  const combinedBranches = branches.filter((branch) => branch.role === "combined");
  if (combinedBranches.length > 1) {
    throw new Error(`Train "${name}" has more than one combined branch.`);
  }

  const combinedBranch = combinedBranches[0];
  if (combinedBranch && branches[branches.length - 1]?.name !== combinedBranch.name) {
    throw new Error(`Train "${name}" must place the combined branch last.`);
  }

  return {
    name,
    syncBase: raw.syncBase,
    prTarget: raw.prTarget,
    branches,
  };
}

function mergeDefaults(globalDefaults: Partial<RepoDefaults> | undefined, repoDefaultsInput: Partial<RepoDefaults> | undefined): RepoDefaults {
  const repoDefaults = repoDefaultsSchema.parse(repoDefaultsInput ?? {});
  return {
    remote: repoDefaults.remote || globalDefaults?.remote || "origin",
    sync: {
      strategy: repoDefaults.sync.strategy || globalDefaults?.sync?.strategy || "merge",
    },
    github: {
      host: repoDefaults.github.host || globalDefaults?.github?.host || "github.com",
    },
    prs: {
      draft: repoDefaults.prs.draft ?? globalDefaults?.prs?.draft ?? false,
      printUrls: repoDefaults.prs.printUrls ?? globalDefaults?.prs?.printUrls ?? false,
      commentOnUpdate: repoDefaults.prs.commentOnUpdate ?? globalDefaults?.prs?.commentOnUpdate ?? null,
      combinedTitleTemplate:
        repoDefaults.prs.combinedTitleTemplate ||
        globalDefaults?.prs?.combinedTitleTemplate ||
        "{{train.name}}",
    },
    lifecycle: {
      keepMergedInToc: repoDefaults.lifecycle.keepMergedInToc ?? globalDefaults?.lifecycle?.keepMergedInToc ?? true,
      closeMergedPrs: repoDefaults.lifecycle.closeMergedPrs ?? globalDefaults?.lifecycle?.closeMergedPrs ?? false,
    },
  };
}

export function getRepoConfigPath(repoPath: string): string {
  return path.join(repoPath, ".stack.yml");
}

export function getGlobalConfigPath(): string {
  return path.join(os.homedir(), ".config", "git-stack", "config.yml");
}

export function getTemplatePath(): string {
  return path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "templates", "stack.yml");
}

export function loadGlobalConfig(): GlobalConfig {
  const configPath = getGlobalConfigPath();
  if (!fs.existsSync(configPath)) {
    return {};
  }

  const parsed = globalConfigSchema.parse(parseYamlFile(configPath));
  return {
    defaults: parsed.defaults as Partial<RepoDefaults> | undefined,
    github: parsed.github,
  };
}

export function loadStackConfig(repoPath: string): StackConfig {
  const repoConfigPath = getRepoConfigPath(repoPath);
  if (!fs.existsSync(repoConfigPath)) {
    throw new Error(`Config file not found at ${repoConfigPath}`);
  }

  const globalConfig = loadGlobalConfig();
  const parsed = stackConfigSchema.parse(parseYamlFile(repoConfigPath));
  const defaults = mergeDefaults(globalConfig.defaults, parsed.defaults as Partial<RepoDefaults> | undefined);
  const trains = Object.entries(parsed.trains).map(([name, train]) => normalizeTrain(name, train));

  return {
    defaults,
    trains,
  };
}

export function writeTemplateConfig(targetPath: string): void {
  const templatePath = path.resolve(process.cwd(), "templates", "stack.yml");
  const fallbackTemplatePath = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..", "templates", "stack.yml");
  const sourcePath = fs.existsSync(templatePath) ? templatePath : fallbackTemplatePath;
  fs.copyFileSync(sourcePath, targetPath);
}

export function findTrainByName(config: StackConfig, name: string): TrainDefinition | undefined {
  return config.trains.find((train) => train.name === name);
}

export function resolveCombinedBranch(train: TrainDefinition): string | null {
  const combined = train.branches.find((branch) => branch.role === "combined");
  if (!combined) {
    return null;
  }

  return combined.name;
}
