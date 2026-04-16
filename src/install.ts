import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { OperationResult } from "./types.js";

export type McpInstallTarget = "codex" | "claude" | "pi" | "opencode";

const INSTALL_NAME = "git-stack";

function getDistCliPath(): string {
  const maybeDist = path.resolve(path.dirname(new URL(import.meta.url).pathname), "cli.js");
  if (!fs.existsSync(maybeDist)) {
    throw new Error(`Built CLI not found at ${maybeDist}. Run \`pnpm build\` first.`);
  }
  return maybeDist;
}

function spawnAndCheck(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}.`);
  }
}

function installIntoCodex(cliPath: string): OperationResult {
  spawnAndCheck("codex", ["mcp", "add", INSTALL_NAME, "--", process.execPath, cliPath, "mcp"]);
  return {
    ok: true,
    message: "Installed git-stack MCP into Codex.",
    warnings: [],
    operations: [`codex mcp add ${INSTALL_NAME} -- ${process.execPath} ${cliPath} mcp`],
  };
}

function installIntoClaude(cliPath: string): OperationResult {
  spawnAndCheck("claude", ["mcp", "add", "--scope", "user", INSTALL_NAME, "--", process.execPath, cliPath, "mcp"]);
  return {
    ok: true,
    message: "Installed git-stack MCP into Claude Code.",
    warnings: [],
    operations: [`claude mcp add --scope user ${INSTALL_NAME} -- ${process.execPath} ${cliPath} mcp`],
  };
}

interface OpenCodeConfig {
  $schema?: string;
  mcp?: Record<
    string,
    {
      type: "local";
      command: string[];
      enabled?: boolean;
      environment?: Record<string, string>;
      timeout?: number;
    }
  >;
  [key: string]: unknown;
}

function readJsonFile<T>(filePath: string): T | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function installIntoOpenCode(cliPath: string): OperationResult {
  const configDir = path.join(os.homedir(), ".config", "opencode");
  const configPath = path.join(configDir, "opencode.json");
  fs.mkdirSync(configDir, { recursive: true });
  const currentConfig = readJsonFile<OpenCodeConfig>(configPath) ?? {};
  const nextConfig: OpenCodeConfig = {
    $schema: currentConfig.$schema ?? "https://opencode.ai/config.json",
    ...currentConfig,
    mcp: {
      ...(currentConfig.mcp ?? {}),
      [INSTALL_NAME]: {
        type: "local",
        command: [process.execPath, cliPath, "mcp"],
        enabled: true,
      },
    },
  };
  fs.writeFileSync(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");

  return {
    ok: true,
    message: `Installed git-stack MCP into OpenCode config at ${configPath}.`,
    warnings: [],
    operations: [`write-opencode-config:${configPath}`],
  };
}

function installIntoPi(): OperationResult {
  return {
    ok: false,
    message: "Pi does not support MCP installation.",
    warnings: [
      "The installed Pi agent documents \"No MCP\" support and recommends CLI tools or extensions instead.",
    ],
    operations: ["unsupported:pi-no-mcp"],
  };
}

export async function installMcpIntoTarget(target: McpInstallTarget): Promise<OperationResult> {
  switch (target) {
    case "codex":
      return installIntoCodex(getDistCliPath());
    case "claude":
      return installIntoClaude(getDistCliPath());
    case "opencode":
      return installIntoOpenCode(getDistCliPath());
    case "pi":
      return installIntoPi();
    default:
      throw new Error(`Unsupported MCP install target: ${String(target)}`);
  }
}
