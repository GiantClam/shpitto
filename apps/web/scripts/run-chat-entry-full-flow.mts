import { spawn } from "node:child_process";
import path from "node:path";

const webRoot = process.cwd();
const isWindows = process.platform === "win32";
const command = isWindows ? "pnpm.cmd" : "pnpm";
const args = ["exec", "vitest", "run", "lib/agent/chat-entry-full-flow.test.ts", "--reporter=dot"];

const child = spawn(command, args, {
  cwd: webRoot,
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    NODE_USE_ENV_PROXY: process.env.NODE_USE_ENV_PROXY || "1",
    RUN_EXTERNAL_INTEGRATION_TESTS: "1",
  },
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  const label = path
    .relative(webRoot, path.resolve(webRoot, "lib/agent/chat-entry-full-flow.test.ts"))
    .replace(/\\/g, "/");
  console.error(`[chat-entry-full-flow] failed to start ${label}:`, error);
  process.exit(1);
});
