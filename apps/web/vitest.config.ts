import { defaultExclude, defineConfig } from "vitest/config";
import path from "node:path";

const externalIntegrationTests = [
  "lib/agent/.tmp-full-closure-live.test.ts",
  "lib/agent/chat-entry-full-flow.test.ts",
  "lib/agent/deploy-flow.test.ts",
  "lib/agent/lc-cnc-full-prompt-run.test.ts",
  "lib/agent/lc-cnc-mainflow-run.test.ts",
  "lib/agent/lc-cnc-online-regression.test.ts",
  "lib/agent/lc-cnc-user-prompt-run.test.ts",
  "lib/agent/manual-chat-e2e.test.ts",
  "lib/agent/problem1-flow.test.ts",
  "lib/agent/problem1-real-aiberm-debug.test.ts",
  "lib/agent/problem1-real-aiberm.test.ts",
  "lib/agent/problem1-real-deploy.test.ts",
  "lib/agent/skill-direct-codeblock-parser.test.ts",
  "lib/agent/skill-direct-static-sync.test.ts",
  "lib/agent/skill-direct-timeout-resume.test.ts",
  "lib/agent/skill-direct-unknown-guard.test.ts",
  "lib/agent/skill-runtime-e2e.test.ts",
];

const runExternalIntegrationTests = process.env.RUN_EXTERNAL_INTEGRATION_TESTS === "1";

export default defineConfig({
  resolve: {
    alias: {
      "@industry/schema": path.resolve(__dirname, "../../packages/schema/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    exclude: runExternalIntegrationTests ? defaultExclude : [...defaultExclude, ...externalIntegrationTests],
  },
});

