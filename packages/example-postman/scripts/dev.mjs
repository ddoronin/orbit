import { spawn } from "node:child_process";

const children = new Set();
let shuttingDown = false;

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runProcess(name, args) {
  const child = spawn(npmCommand(), args, {
    stdio: "inherit",
    env: process.env,
  });

  children.add(child);
  child.on("exit", (code, signal) => {
    children.delete(child);
    onChildExit(name, code, signal);
  });

  return child;
}

function stopAll(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  setTimeout(() => {
    for (const child of children) {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    }
  }, 2000).unref();

  process.exitCode = exitCode;
}

function onChildExit(name, code, signal) {
  if (shuttingDown) return;

  const exitCode = code ?? (signal ? 1 : 0);
  if (exitCode !== 0) {
    console.error(`[dev] ${name} exited unexpectedly (${code ?? signal}).`);
  } else {
    console.log(`[dev] ${name} exited.`);
  }

  stopAll(exitCode);
}

process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

runProcess("web", ["run", "dev:web"]);
runProcess("worker", ["run", "dev:worker"]);
