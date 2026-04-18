import chalk from "chalk";
import Table from "cli-table3";
import ora from "ora";
import type { Ora } from "ora";
import type { BranchStatus, OperationResult } from "./types.js";

function branchStateLabel(branch: BranchStatus): string {
  const parts: string[] = [];
  if (branch.isCurrent) {
    parts.push(chalk.cyan("current"));
  }
  if (branch.isMerged) {
    parts.push(chalk.magenta("merged"));
  } else {
    parts.push(chalk.green("active"));
  }
  if (branch.role === "combined") {
    parts.push(chalk.yellow("combined"));
  }
  return parts.join(chalk.dim(" • "));
}

function branchPrLabel(branch: BranchStatus): string {
  if (!branch.pr) {
    return chalk.dim("No PR");
  }

  return `${chalk.blue(`#${branch.pr.number}`)} ${chalk.dim(branch.pr.title)}`;
}

export function printResult(result: OperationResult, asJson: boolean): void {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const message = result.ok ? chalk.green(result.message) : chalk.red(result.message);
  console.log(message);

  if (result.status) {
    console.log("");
    console.log(chalk.bold(`Stack: ${result.status.stack.name}`));
    console.log(`${chalk.dim("Current branch:")} ${result.status.currentBranch}`);

    const table = new Table({
      head: [chalk.bold("Branch"), chalk.bold("State"), chalk.bold("PR")],
      style: {
        head: [],
        border: ["gray"],
      },
      wordWrap: true,
      colWidths: [42, 28, 48],
    });

    for (const branch of result.status.branches) {
      table.push([branch.name, branchStateLabel(branch), branchPrLabel(branch)]);
    }

    console.log(table.toString());
  }

  if (result.operations && result.operations.length > 0) {
    console.log("");
    console.log(chalk.bold("Actions"));
    for (const operation of result.operations) {
      console.log(chalk.dim(`  • ${operation}`));
    }
  }

  if (result.warnings.length > 0) {
    console.log("");
    console.log(chalk.bold.yellow("Warnings"));
    for (const warning of result.warnings) {
      console.error(chalk.yellow(`  • ${warning}`));
    }
  }
}

function printOperationsSection(title: string, operations: string[] | undefined): void {
  if (!operations || operations.length === 0) {
    return;
  }

  console.log("");
  console.log(chalk.bold(title));
  for (const operation of operations) {
    console.log(chalk.dim(`  • ${operation}`));
  }
}

export async function runWithOutput(
  action: Promise<OperationResult>,
  asJson: boolean,
  spinnerText?: string,
): Promise<void> {
  let spinner: Ora | undefined;
  if (!asJson && spinnerText) {
    spinner = ora({
      text: spinnerText,
      discardStdin: false,
    }).start();
  }

  try {
    const result = await action;
    spinner?.stop();
    printResult(result, asJson);
    if (!result.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (spinner) {
      spinner.fail(message);
    }
    throw error;
  }
}

export async function runStepWithOutput(
  action: Promise<OperationResult>,
  asJson: boolean,
  spinnerText: string,
  doneText: string,
): Promise<OperationResult> {
  if (asJson) {
    return action;
  }

  const spinner: Ora = ora({
    text: spinnerText,
    discardStdin: false,
  }).start();

  try {
    const result = await action;
    if (result.ok) {
      spinner.succeed(doneText);
    } else {
      spinner.fail(result.message);
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    spinner.fail(message);
    throw error;
  }
}

export function printStepResult(title: string, result: OperationResult): void {
  printOperationsSection(title, result.operations);
  if (result.warnings.length > 0) {
    console.log("");
    console.log(chalk.bold.yellow(`${title} warnings`));
    for (const warning of result.warnings) {
      console.error(chalk.yellow(`  • ${warning}`));
    }
  }
}
