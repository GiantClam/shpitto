import path from "node:path";
import dotenv from "dotenv";
import { CloudflareClient } from "../lib/cloudflare.ts";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env"), override: false });

type CliOptions = {
  apply: boolean;
  maxDelete?: number;
  excludes: string[];
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
    excludes: [],
  };

  for (const raw of argv) {
    const arg = String(raw || "").trim();
    if (!arg) continue;
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg.startsWith("--max-delete=")) {
      const value = Number(arg.split("=", 2)[1]);
      if (Number.isFinite(value) && value > 0) options.maxDelete = Math.floor(value);
      continue;
    }
    if (arg.startsWith("--exclude=")) {
      const value = arg.split("=", 2)[1];
      if (value) options.excludes.push(value.trim().toLowerCase());
      continue;
    }
  }
  return options;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cf = new CloudflareClient();
  if (!cf.isConfigured()) {
    throw new Error("Cloudflare client is not configured. Check CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN.");
  }

  const result = await cf.cleanupWebAnalyticsSites({
    dryRun: !opts.apply,
    maxDelete: opts.maxDelete,
    excludeHosts: opts.excludes,
  });

  console.log(
    JSON.stringify(
      {
        mode: opts.apply ? "apply" : "dry-run",
        deletedCount: result.deletedSiteTags.length,
        candidateCount: result.candidateHosts.length,
        candidateHosts: result.candidateHosts,
        deletedHosts: result.deletedHosts,
        deletedSiteTags: result.deletedSiteTags,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(String((error as any)?.message || error || "wa-site-cleanup failed"));
  process.exitCode = 1;
});

