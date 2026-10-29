import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { getContactEmailWorkerEnvConfig, loadSharedEnv } from "./shared-env.mts";

function quoteCmdArgIfNeeded(value: string) {
  const raw = String(value || "");
  if (!/[\s"]/g.test(raw)) return raw;
  return `"${raw.replace(/"/g, '""')}"`;
}

function putSecret(name: string, value: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
    const args = ["exec", "wrangler", "secret", "put", name];
    const child = process.platform === "win32"
      ? spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", [quoteCmdArgIfNeeded(command), ...args.map(quoteCmdArgIfNeeded)].join(" ")], {
          stdio: ["pipe", "pipe", "pipe"],
          shell: false,
          env: { ...process.env, NO_COLOR: "1", CI: "1" },
        })
      : spawn(command, args, {
          stdio: ["pipe", "pipe", "pipe"],
          shell: false,
          env: { ...process.env, NO_COLOR: "1", CI: "1" },
        });

    let stderr = "";
    child.stdout?.on("data", () => undefined);
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `wrangler secret put ${name} failed with exit code ${code}`));
    });
    child.stdin?.write(value);
    child.stdin?.end();
  });
}

export async function syncContactEmailWorkerSecrets() {
  loadSharedEnv();
  const config = getContactEmailWorkerEnvConfig();
  if (!config.apiToken) {
    throw new Error("missing CLOUDFLARE_EMAIL_API_TOKEN or CLOUDFLARE_API_TOKEN in shared env files");
  }

  await putSecret("CLOUDFLARE_EMAIL_API_TOKEN", config.apiToken);
  console.log("PASS secret CLOUDFLARE_EMAIL_API_TOKEN synced");

  if (config.healthToken) {
    await putSecret("CONTACT_EMAIL_HEALTH_TOKEN", config.healthToken);
    console.log("PASS secret CONTACT_EMAIL_HEALTH_TOKEN synced");
  } else {
    console.log("SKIP secret CONTACT_EMAIL_HEALTH_TOKEN not configured in shared env");
  }
}

async function main() {
  await syncContactEmailWorkerSecrets();
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (entryUrl && import.meta.url === entryUrl) {
  void main().catch((error) => {
    console.error(`FAIL contact-email-worker-secret-sync: ${String((error as Error)?.message || error || "unknown error")}`);
    process.exitCode = 1;
  });
}
