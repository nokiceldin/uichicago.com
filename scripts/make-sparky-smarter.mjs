/**
 * make-sparky-smarter.mjs
 *
 * One-command wrapper for Sparky's safest improvement workflow.
 *
 * It:
 * 1. Finds a free local port
 * 2. Refreshes eval signal inside an isolated worktree server
 * 3. Runs the isolated worktree improvement flow
 * 3. Copies the key artifacts back into the main workspace
 * 4. Cleans up the temporary worktree and branch
 * 5. Prints a plain-English outcome
 *
 * Run:
 *   node --env-file=.env scripts/make-sparky-smarter.mjs
 */

import "dotenv/config";
import fs from "fs";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_ROOT = path.join(ROOT, "artifacts/autonomous-improvement/one-click-runs");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function run(command, args, cwd) {
  return spawnSync(command, args, {
    cwd,
    env: process.env,
    encoding: "utf-8",
    stdio: "pipe",
  });
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

async function findFreePort(start = 3011, tries = 20) {
  for (let i = 0; i < tries; i++) {
    const port = start + i;
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(port)) return port;
  }
  throw new Error(`Could not find a free port after ${tries} attempts starting at ${start}.`);
}

function copyPath(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(path.dirname(dest));
  fs.cpSync(src, dest, { recursive: true });
}

async function main() {
  ensureDir(OUT_ROOT);
  const port = await findFreePort();
  const startedAt = timestamp();

  const worktreeRun = run(
    "node",
    [
      "scripts/run-candidate-in-worktree.mjs",
      `--port=${port}`,
      "--keep-worktree",
      "--refresh-evals",
      "--eval-limit=20",
      "--rubric-limit=20",
    ],
    ROOT
  );

  if (worktreeRun.status !== 0) {
    console.error(worktreeRun.stdout);
    console.error(worktreeRun.stderr);
    throw new Error("Isolated improvement run failed.");
  }

  const combinedOutput = `${worktreeRun.stdout}\n${worktreeRun.stderr}`;
  const summaryMatch = combinedOutput.match(/Summary\s+->\s+(.+)/);
  if (!summaryMatch) {
    throw new Error("Could not locate worktree summary path from runner output.");
  }

  const summaryPath = summaryMatch[1].trim();
  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf-8"));
  const decisionPath = summary.latestDecisionPath;
  const decision = decisionPath && fs.existsSync(decisionPath)
    ? JSON.parse(fs.readFileSync(decisionPath, "utf-8"))
    : null;

  const outDir = path.join(OUT_ROOT, startedAt);
  ensureDir(outDir);
  copyPath(summaryPath, path.join(outDir, "worktree-run-summary.json"));
  if (summary.latestExecutionDir) {
    copyPath(summary.latestExecutionDir, path.join(outDir, "execution"));
  }

  const cleanupNotes = [];
  if (summary.worktreeDir && fs.existsSync(summary.worktreeDir)) {
    const removeResult = run("git", ["worktree", "remove", summary.worktreeDir, "--force"], ROOT);
    if (removeResult.status !== 0) {
      cleanupNotes.push(`Worktree removal failed: ${(removeResult.stderr || removeResult.stdout).trim()}`);
    }
  }
  if (summary.branchName) {
    const branchDelete = run("git", ["branch", "-D", summary.branchName], ROOT);
    if (branchDelete.status !== 0) {
      cleanupNotes.push(`Branch delete failed: ${(branchDelete.stderr || branchDelete.stdout).trim()}`);
    }
  }

  const finalSummary = {
    generatedAt: new Date().toISOString(),
    port,
    worktreeBranch: summary.branchName,
    copiedArtifactsDir: outDir,
    decision,
    cleanupNotes,
  };
  fs.writeFileSync(path.join(outDir, "one-click-summary.json"), JSON.stringify(finalSummary, null, 2) + "\n", "utf-8");

  console.log("Sparky improvement run finished.");
  if (decision) {
    console.log(`Decision: ${decision.decision}`);
    console.log(`Why: ${decision.reason}`);
    if (decision.generatedFeedbackEvalSummary?.avgScore != null) {
      console.log(`Feedback eval score: ${decision.generatedFeedbackEvalSummary.avgScore}`);
    }
    if (decision.beforeSummary?.avgScore != null && decision.afterSummary?.avgScore != null) {
      console.log(`Rubric avg: ${decision.beforeSummary.avgScore} -> ${decision.afterSummary.avgScore}`);
    }
  } else {
    console.log("Decision: unavailable");
  }
  console.log(`Saved artifacts: ${outDir}`);
  if (cleanupNotes.length) {
    console.log(`Cleanup notes: ${cleanupNotes.join(" | ")}`);
  }
}

main().catch((error) => {
  console.error("make-sparky-smarter failed:", error.message);
  process.exit(1);
});
