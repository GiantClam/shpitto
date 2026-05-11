import { spawn, type ChildProcess, execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { withLocalChatTaskStoreDefaults } from "./dev-runtime-env.mts";

const DEV_PORT = Number(process.env.PORT || 3000);
const DEV_URL = `http://127.0.0.1:${DEV_PORT}`;
const PROJECT_ROOT = process.cwd();
const DEV_ALL_STATE_FILE = path.join(PROJECT_ROOT, ".tmp", "dev-all-processes.json");
const execFileAsync = promisify(execFile);

type ExistingServerCheck =
  | { kind: "reuse" }
  | { kind: "start" }
  | { kind: "busy"; detail: string };

type ManagedProcessState = {
  webPid?: number;
  workerPid?: number;
};

function prefixStream(stream: NodeJS.ReadableStream | null, label: string) {
  if (!stream) return;
  let pending = "";
  stream.on("data", (chunk) => {
    pending += chunk.toString();
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) {
        process.stdout.write(`[${label}] \n`);
        continue;
      }
      process.stdout.write(`[${label}] ${line}\n`);
    }
  });
  stream.on("end", () => {
    if (pending) {
      process.stdout.write(`[${label}] ${pending}\n`);
      pending = "";
    }
  });
}

function spawnManagedProcess(label: string, command: string, args: string[]) {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: withLocalChatTaskStoreDefaults(process.env),
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
  });
  prefixStream(child.stdout, label);
  prefixStream(child.stderr, label);
  return child;
}

function spawnPnpmScript(label: string, scriptName: string) {
  if (process.platform === "win32") {
    return spawnManagedProcess(label, process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `pnpm.cmd ${scriptName}`]);
  }
  return spawnManagedProcess(label, "pnpm", [scriptName]);
}

function parsePidList(raw: string): number[] {
  return String(raw)
    .split(/\r?\n/)
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);
}

async function readManagedProcessState(): Promise<ManagedProcessState> {
  try {
    const raw = await readFile(DEV_ALL_STATE_FILE, "utf8");
    const parsed = JSON.parse(raw) as ManagedProcessState;
    return {
      webPid: Number.isFinite(parsed.webPid) ? parsed.webPid : undefined,
      workerPid: Number.isFinite(parsed.workerPid) ? parsed.workerPid : undefined,
    };
  } catch {
    return {};
  }
}

async function writeManagedProcessState(state: ManagedProcessState) {
  await mkdir(path.dirname(DEV_ALL_STATE_FILE), { recursive: true });
  await writeFile(DEV_ALL_STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

async function clearManagedProcessState() {
  await rm(DEV_ALL_STATE_FILE, { force: true });
}

async function terminatePid(pid: number | undefined) {
  if (!pid || pid === process.pid) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    });
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {}
}

async function findStaleWorkerPids(): Promise<number[]> {
  if (process.platform === "win32") {
    const command =
      "$project = [Regex]::Escape((Resolve-Path '.').Path); " +
      "Get-CimInstance Win32_Process | " +
      "Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'chat-task-worker\\.mts' -and $_.CommandLine -match $project } | " +
      "Select-Object -ExpandProperty ProcessId";
    const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-Command", command], {
      cwd: PROJECT_ROOT,
      windowsHide: true,
    });
    return parsePidList(stdout).filter((pid) => pid !== process.pid);
  }

  const { stdout } = await execFileAsync("pgrep", ["-af", "chat-task-worker.mts"], {
    cwd: PROJECT_ROOT,
  });
  return String(stdout)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [pidText, ...rest] = line.split(/\s+/);
      const pid = Number.parseInt(pidText, 10);
      const command = rest.join(" ");
      return Number.isFinite(pid) && command.includes(PROJECT_ROOT) ? pid : NaN;
    })
    .filter((pid) => Number.isFinite(pid) && pid !== process.pid);
}

async function findProjectNextDevPidOnPort(port: number): Promise<number | undefined> {
  if (process.platform === "win32") {
    const command = [
      `$port = ${port}`,
      "$project = [Regex]::Escape((Resolve-Path '.').Path)",
      "$conn = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1",
      "if (-not $conn) { exit 0 }",
      "$proc = Get-CimInstance Win32_Process -Filter \"ProcessId = $($conn.OwningProcess)\"",
      "if ($proc -and $proc.CommandLine -match 'next(\\.exe)?' -and $proc.CommandLine -match $project) {",
      "  $proc.ProcessId",
      "}",
    ].join("; ");
    const { stdout } = await execFileAsync("powershell", ["-NoProfile", "-Command", command], {
      cwd: PROJECT_ROOT,
      windowsHide: true,
    });
    const [pid] = parsePidList(stdout);
    return pid;
  }

  try {
    const { stdout } = await execFileAsync("lsof", ["-ti", `tcp:${port}`], { cwd: PROJECT_ROOT });
    const [pid] = parsePidList(stdout);
    if (!pid) return undefined;
    const { stdout: processInfo } = await execFileAsync("ps", ["-p", String(pid), "-o", "command="], {
      cwd: PROJECT_ROOT,
    });
    return processInfo.includes(PROJECT_ROOT) && processInfo.includes("next") ? pid : undefined;
  } catch {
    return undefined;
  }
}

async function cleanupStaleManagedProcesses() {
  const recorded = await readManagedProcessState();
  const stalePids = new Set<number>();
  if (recorded.webPid) stalePids.add(recorded.webPid);
  if (recorded.workerPid) stalePids.add(recorded.workerPid);

  for (const pid of await findStaleWorkerPids()) {
    stalePids.add(pid);
  }
  const nextPid = await findProjectNextDevPidOnPort(DEV_PORT);
  if (nextPid) stalePids.add(nextPid);

  if (stalePids.size > 0) {
    process.stdout.write(`[dev-all] Cleaning up stale project processes: ${[...stalePids].join(", ")}.\n`);
  }
  await Promise.all([...stalePids].map((pid) => terminatePid(pid)));
  await clearManagedProcessState();
}

async function checkExistingNextDevServer(): Promise<ExistingServerCheck> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);
    const response = await fetch(DEV_URL, {
      redirect: "manual",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const poweredBy = String(response.headers.get("x-powered-by") || "").trim().toLowerCase();
    if (poweredBy === "next.js") {
      return { kind: "reuse" };
    }
    return {
      kind: "busy",
      detail: `${DEV_URL} is already in use by a non-Next.js service (x-powered-by=${poweredBy || "unknown"}).`,
    };
  } catch {
    return { kind: "start" };
  }
}

async function terminateChild(child: ChildProcess | null | undefined) {
  if (!child?.pid || child.exitCode !== null) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    });
    return;
  }
  child.kill("SIGTERM");
}

async function main() {
  await cleanupStaleManagedProcesses();
  const serverCheck = await checkExistingNextDevServer();
  if (serverCheck.kind === "busy") {
    console.error(`[dev-all] ${serverCheck.detail}`);
    process.exit(1);
  }

  const webChild =
    serverCheck.kind === "start"
      ? spawnPnpmScript("web", "dev:next")
      : null;

  if (serverCheck.kind === "reuse") {
    process.stdout.write(`[dev-all] Reusing existing Next.js dev server at ${DEV_URL}.\n`);
  }

  const workerChild = spawnPnpmScript("worker", "worker:chat");
  const children = [webChild, workerChild].filter(Boolean) as ChildProcess[];
  let shuttingDown = false;

  await writeManagedProcessState({
    webPid: webChild?.pid,
    workerPid: workerChild.pid,
  });

  async function shutdown(exitCode: number) {
    if (shuttingDown) return;
    shuttingDown = true;
    await Promise.all(children.map((child) => terminateChild(child)));
    await clearManagedProcessState();
    process.exit(exitCode);
  }

  process.on("SIGINT", () => void shutdown(130));
  process.on("SIGTERM", () => void shutdown(143));

  if (webChild) {
    webChild.on("exit", (code, signal) => {
      if (shuttingDown) return;
      const exitCode = code ?? (signal ? 1 : 0);
      process.stderr.write(`[dev-all] Web process exited unexpectedly (${signal || exitCode}). Stopping worker.\n`);
      void shutdown(exitCode || 1);
    });
  }

  workerChild.on("exit", (code, signal) => {
    if (shuttingDown) return;
    const exitCode = code ?? (signal ? 1 : 0);
    process.stderr.write(`[dev-all] Worker process exited (${signal || exitCode}).\n`);
    void shutdown(exitCode || 0);
  });
}

void main().catch((error) => {
  console.error(`[dev-all] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
