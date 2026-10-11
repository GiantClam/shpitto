import { spawn } from "node:child_process";
import { withLocalChatTaskStoreDefaults } from "./dev-runtime-env.mts";

const child = spawn(
  process.execPath,
  ["--max-old-space-size=4096", "./node_modules/next/dist/bin/next", "dev", "--turbopack"],
  {
    cwd: process.cwd(),
    env: withLocalChatTaskStoreDefaults(process.env),
    stdio: "inherit",
    shell: false,
    windowsHide: true,
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
