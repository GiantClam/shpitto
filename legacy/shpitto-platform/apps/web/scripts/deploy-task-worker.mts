import { pathToFileURL } from "node:url";

const deployModes = String(process.env.DEPLOY_WORKER_CLAIM_MODES || "deploy")
  .split(",")
  .map((mode) => mode.trim().toLowerCase())
  .filter(Boolean);

process.env.CHAT_WORKER_CLAIM_MODES = deployModes.length > 0 ? deployModes.join(",") : "deploy";

async function main() {
  const { runChatTaskWorkerLoop } = await import("./chat-task-worker.mts");
  await runChatTaskWorkerLoop();
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (entryUrl && import.meta.url === entryUrl) {
  main().catch((error) => {
    console.error("[DeployTaskWorker] fatal error:", error);
    process.exit(1);
  });
}
