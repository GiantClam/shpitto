import { spawn } from "node:child_process";
import path from "node:path";

const webRoot = process.cwd();
const isWindows = process.platform === "win32";
const command = isWindows ? process.env.ComSpec || "cmd.exe" : "pnpm";
const args = isWindows
  ? ["/d", "/s", "/c", "pnpm exec vitest run lib/agent/casux-fullflow-live.test.ts --reporter=dot"]
  : ["exec", "vitest", "run", "lib/agent/casux-fullflow-live.test.ts", "--reporter=dot"];

const child = spawn(command, args, {
  cwd: webRoot,
  stdio: "inherit",
  shell: false,
  env: {
    ...process.env,
    NODE_USE_ENV_PROXY: process.env.NODE_USE_ENV_PROXY || "1",
    RUN_CASUX_FULLFLOW_LIVE: process.env.RUN_CASUX_FULLFLOW_LIVE || "1",
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
  const label = path.relative(webRoot, path.resolve(webRoot, "lib/agent/casux-fullflow-live.test.ts")).replace(/\\/g, "/");
  console.error(`[casux-fullflow-live] failed to start ${label}:`, error);
  process.exit(1);
});
