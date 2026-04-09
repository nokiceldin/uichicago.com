/**
 * run-candidate-in-worktree.mjs
 *
 * Creates an isolated git worktree on a temporary branch, boots a dev server
 * there on a separate port, runs the candidate executor against that server,
 * captures the result, and then shuts the server down.
 *
 * This keeps the main workspace untouched while still allowing candidate
 * patches to be applied and gated against a real running app.
 *
 * Run:
 *   node --env-file=.env scripts/run-candidate-in-worktree.mjs
 *   node --env-file=.env scripts/run-candidate-in-worktree.mjs --candidate-id=candidate_x
 *   node --env-file=.env scripts/run-candidate-in-worktree.mjs --port=3011
 *   node --env-file=.env scripts/run-candidate-in-worktree.mjs --refresh-evals
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawn, spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function parseArgs() {
  const args = process.argv.slice(2);
  const getValue = (name, fallback = null) =>
    args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;

  return {
    candidateId: getValue("candidate-id"),
    port: Number(getValue("port", "3011")),
    keepWorktree: args.includes("--keep-worktree"),
    refreshEvals: args.includes("--refresh-evals"),
    evalLimit: Number(getValue("eval-limit", "20")),
    rubricLimit: Number(getValue("rubric-limit", "20")),
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function run(command, args, cwd, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    encoding: "utf-8",
    stdio: "pipe",
  });
  return result;
}

function copyIfExists(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(path.dirname(dest));
  fs.cpSync(src, dest, { recursive: true });
}

function syncCurrentWorkspaceChanges(worktreeDir) {
  const status = run("git", ["status", "--porcelain"], ROOT);
  if (status.status !== 0) {
    throw new Error(`git status failed: ${status.stderr || status.stdout}`);
  }

  const lines = (status.stdout ?? "")
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);

  for (const line of lines) {
    const relativePath = line.slice(3).trim();
    if (
      !relativePath ||
      relativePath === "node_modules" ||
      relativePath.startsWith(".codex-worktrees/")
    ) continue;
    const src = path.join(ROOT, relativePath);
    const dest = path.join(worktreeDir, relativePath);

    if (fs.existsSync(src)) {
      copyIfExists(src, dest);
    }
  }
}

async function waitForServer(url, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status < 500) return true;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return false;
}

function getLatestExecutionDir(worktreeDir) {
  const executionsDir = path.join(worktreeDir, "artifacts/autonomous-improvement/executions");
  if (!fs.existsSync(executionsDir)) return null;
  const dirs = fs.readdirSync(executionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  if (dirs.length === 0) return null;
  return path.join(executionsDir, dirs[dirs.length - 1]);
}

async function main() {
  const args = parseArgs();
  const runId = nowStamp();
  const branchName = `codex/auto-improve-${runId}`.slice(0, 120);
  const worktreeRoot = path.join(ROOT, ".codex-worktrees");
  const worktreeDir = path.join(worktreeRoot, runId);
  const url = `http://localhost:${args.port}`;
  ensureDir(worktreeRoot);

  const addResult = run("git", ["worktree", "add", "-b", branchName, worktreeDir, "HEAD"], ROOT);
  if (addResult.status !== 0) {
    throw new Error(`git worktree add failed: ${addResult.stderr || addResult.stdout}`);
  }

  try {
    const nodeModulesSrc = path.join(ROOT, "node_modules");
    const nodeModulesDest = path.join(worktreeDir, "node_modules");
    if (fs.existsSync(nodeModulesSrc) && !fs.existsSync(nodeModulesDest)) {
      fs.symlinkSync(nodeModulesSrc, nodeModulesDest, "junction");
    }

    for (const envName of [".env", ".env.local"]) {
      copyIfExists(path.join(ROOT, envName), path.join(worktreeDir, envName));
    }

    syncCurrentWorkspaceChanges(worktreeDir);

    copyIfExists(
      path.join(ROOT, "artifacts/feedback/bad-chat-responses.jsonl"),
      path.join(worktreeDir, "artifacts/feedback/bad-chat-responses.jsonl")
    );
    copyIfExists(
      path.join(ROOT, "artifacts/autonomous-improvement"),
      path.join(worktreeDir, "artifacts/autonomous-improvement")
    );

    const devLogPath = path.join(worktreeDir, "artifacts/autonomous-improvement/worktree-dev.log");
    ensureDir(path.dirname(devLogPath));
    const devLog = fs.openSync(devLogPath, "a");
    const devServer = spawn("npm", ["run", "dev", "--", "--port", String(args.port)], {
      cwd: worktreeDir,
      env: { ...process.env },
      stdio: ["ignore", devLog, devLog],
      detached: true,
    });

    const serverReady = await waitForServer(url);
    if (!serverReady) {
      try {
        process.kill(-devServer.pid, "SIGTERM");
      } catch {}
      throw new Error(`Timed out waiting for dev server at ${url}`);
    }

    if (args.refreshEvals) {
      const evalResult = run(
        "node",
        ["scripts/eval-sparky.mjs", `--limit=${args.evalLimit}`, `--url=${url}`],
        worktreeDir,
        { SPARKY_EVAL_URL: url }
      );
      fs.writeFileSync(path.join(worktreeDir, "artifacts/autonomous-improvement/worktree-eval-sparky.stdout.txt"), evalResult.stdout ?? "");
      fs.writeFileSync(path.join(worktreeDir, "artifacts/autonomous-improvement/worktree-eval-sparky.stderr.txt"), evalResult.stderr ?? "");
      if (evalResult.status !== 0) {
        throw new Error(`eval-sparky failed in worktree: ${evalResult.stderr || evalResult.stdout}`);
      }

      const rubricResult = run(
        "node",
        ["scripts/rubric-eval-runner.mjs", "--live", `--url=${url}`, `--limit=${args.rubricLimit}`],
        worktreeDir,
        { SPARKY_EVAL_URL: url }
      );
      fs.writeFileSync(path.join(worktreeDir, "artifacts/autonomous-improvement/worktree-rubric.stdout.txt"), rubricResult.stdout ?? "");
      fs.writeFileSync(path.join(worktreeDir, "artifacts/autonomous-improvement/worktree-rubric.stderr.txt"), rubricResult.stderr ?? "");
      if (rubricResult.status !== 0) {
        throw new Error(`rubric-eval-runner failed in worktree: ${rubricResult.stderr || rubricResult.stdout}`);
      }
    }

    const loopResult = run("node", ["scripts/run-self-improvement-loop.mjs"], worktreeDir, {
      SPARKY_EVAL_URL: url,
    });
    fs.writeFileSync(path.join(worktreeDir, "artifacts/autonomous-improvement/worktree-loop.stdout.txt"), loopResult.stdout ?? "");
    fs.writeFileSync(path.join(worktreeDir, "artifacts/autonomous-improvement/worktree-loop.stderr.txt"), loopResult.stderr ?? "");
    if (loopResult.status !== 0) {
      throw new Error(`Improvement loop failed in worktree: ${loopResult.stderr || loopResult.stdout}`);
    }

    const execArgs = ["scripts/execute-self-improvement-candidate.mjs", "--auto-apply", "--supported-only", `--url=${url}`];
    if (args.candidateId) execArgs.push(`--candidate-id=${args.candidateId}`);
    const execResult = run("node", execArgs, worktreeDir, { SPARKY_EVAL_URL: url });
    fs.writeFileSync(path.join(worktreeDir, "artifacts/autonomous-improvement/worktree-exec.stdout.txt"), execResult.stdout ?? "");
    fs.writeFileSync(path.join(worktreeDir, "artifacts/autonomous-improvement/worktree-exec.stderr.txt"), execResult.stderr ?? "");
    if (execResult.status !== 0) {
      throw new Error(`Candidate executor failed in worktree: ${execResult.stderr || execResult.stdout}`);
    }

    const latestExecutionDir = getLatestExecutionDir(worktreeDir);
    const latestDecisionPath = latestExecutionDir
      ? path.join(latestExecutionDir, "decision.json")
      : null;

    const summary = {
      generatedAt: new Date().toISOString(),
      branchName,
      worktreeDir,
      url,
      candidateId: args.candidateId ?? null,
      keepWorktree: args.keepWorktree,
      refreshEvals: args.refreshEvals,
      evalLimit: args.evalLimit,
      rubricLimit: args.rubricLimit,
      latestExecutionDir,
      latestDecisionPath,
    };
    fs.writeFileSync(
      path.join(worktreeDir, "artifacts/autonomous-improvement/worktree-run-summary.json"),
      JSON.stringify(summary, null, 2) + "\n",
      "utf-8"
    );

    try {
      process.kill(-devServer.pid, "SIGTERM");
    } catch {}

    console.log("Worktree candidate run complete.");
    console.log(`  Branch   -> ${branchName}`);
    console.log(`  Worktree -> ${worktreeDir}`);
    console.log(`  URL      -> ${url}`);
    console.log(`  Summary  -> ${path.join(worktreeDir, "artifacts/autonomous-improvement/worktree-run-summary.json")}`);

    if (!args.keepWorktree) {
      const removeResult = run("git", ["worktree", "remove", worktreeDir, "--force"], ROOT);
      if (removeResult.status !== 0) {
        console.warn(`Could not remove worktree automatically: ${removeResult.stderr || removeResult.stdout}`);
      } else {
        console.log("  Cleanup  -> worktree removed");
      }
    }
  } catch (error) {
    console.error("run-candidate-in-worktree failed:", error.message);
    process.exitCode = 1;
  }
}

main();
