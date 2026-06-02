import { describe, expect, it } from "vitest";

import { completeWorkflowCompensation, startWorkflowCompensation } from "./workflow-compensation.ts";
import { buildExecutionWorkflowRuntime } from "./workflow-runtime-adapter.ts";
import { summarizeWorkflowRuntimeForClient } from "./workflow-state.ts";

describe("workflow runtime adapter", () => {
  it("records approved deploy workflows and exposes a stable client summary", () => {
    const runtime = buildExecutionWorkflowRuntime({
      chatId: "chat-1",
      executionMode: "deploy",
      contractHash: "a".repeat(64),
      generationLane: "website-generation-mvp",
      websiteSurfaceMode: "content-hub-site",
      sourceTaskId: "task-preview",
    });

    const summary = summarizeWorkflowRuntimeForClient(runtime);
    expect(runtime.approval.status).toBe("approved");
    expect(summary?.approvalKind).toBe("deploy_confirmation");
    expect(summary?.auditEventCount).toBeGreaterThanOrEqual(2);
  });

  it("tracks compensation lifecycle for deploy failures", () => {
    const runtime = buildExecutionWorkflowRuntime({
      chatId: "chat-2",
      executionMode: "deploy",
      contractHash: "b".repeat(64),
      generationLane: "website-generation-mvp",
      websiteSurfaceMode: "content-hub-site",
    });
    const compensating = startWorkflowCompensation(runtime, {
      reason: "deploy failed",
    });
    const completed = completeWorkflowCompensation(compensating, {
      message: "rollback recorded",
    });

    expect(compensating.status).toBe("compensating");
    expect(compensating.compensation.status).toBe("pending");
    expect(completed.compensation.status).toBe("completed");
  });
});
