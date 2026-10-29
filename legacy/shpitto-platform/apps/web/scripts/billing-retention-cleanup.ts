import { cleanupExpiredBillingProjects } from "../lib/billing/cleanup.ts";

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const result = await cleanupExpiredBillingProjects({ dryRun });
  console.log(JSON.stringify({ ok: true, dryRun, ...result }, null, 2));
}

main().catch((error) => {
  console.error(String((error as any)?.message || error || "billing cleanup failed"));
  process.exit(1);
});
