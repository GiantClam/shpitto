import {
  evaluateWebsiteGenerationV2CutoverStatus,
  type WebsiteGenerationV2CutoverStatus,
} from "../lib/agent/website-generation-cutover.ts";

function printHuman(status: WebsiteGenerationV2CutoverStatus) {
  console.log("# Website Generation V2 Cutover Status");
  console.log("");
  console.log(`Ready for default cutover: ${status.readyForDefaultCutover ? "yes" : "no"}`);
  console.log(`Default lane: ${status.defaultLane}`);
  console.log(`Release gate passed: ${status.releaseGatePassed ? "yes" : "no"}`);
  console.log(`Rollback available: ${status.rollbackAvailable ? "yes" : "no"}`);
  console.log("");
  console.log("## Rollback env");
  console.log(`- SHPITTO_WEBSITE_GENERATION_LANE=${status.rollbackEnv.SHPITTO_WEBSITE_GENERATION_LANE}`);
  console.log(`- SHPITTO_WEBSITE_GENERATION_MVP=${status.rollbackEnv.SHPITTO_WEBSITE_GENERATION_MVP}`);
  console.log("");
  console.log("## Blockers");
  if (status.blockers.length === 0) {
    console.log("- none");
  } else {
    for (const blocker of status.blockers) console.log(`- ${blocker}`);
  }
  console.log("");
  console.log("## Scenario status");
  for (const scenario of status.releaseGate.scenarios) {
    const deploymentStatus = scenario.deploymentPassed ? "passed" : "n/a-or-failed";
    console.log(
      `- ${scenario.name}: ${scenario.status} (verification=${scenario.verificationStatus}, recoveredFrom=${scenario.recoveredFrom}, previewOnly=${scenario.previewOnly ? "yes" : "no"}, deployment=${deploymentStatus})`,
    );
  }
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const status = await evaluateWebsiteGenerationV2CutoverStatus();
  if (args.has("--json")) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }
  printHuman(status);
}

await main();
