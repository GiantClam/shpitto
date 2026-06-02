import fs from "node:fs/promises";
import path from "node:path";

import {
  appendWorkflowAuditTrail,
  type WorkflowAuditEvent,
  type WorkflowAuditEventType,
  type WorkflowRuntimeState,
} from "./workflow-state.ts";
import { persistWorkflowRuntimeSnapshot } from "./workflow-store.ts";

export async function appendWorkflowAuditEvent(params: {
  runtime: WorkflowRuntimeState;
  checkpointDir?: string;
  type: WorkflowAuditEventType;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<{ runtime: WorkflowRuntimeState; event: WorkflowAuditEvent }> {
  const nextRuntime = appendWorkflowAuditTrail(params.runtime, {
    type: params.type,
    message: params.message,
    metadata: params.metadata,
  });
  const event = nextRuntime.auditTrail[nextRuntime.auditTrail.length - 1]!;
  if (params.checkpointDir) {
    await fs.mkdir(params.checkpointDir, { recursive: true });
    await fs.appendFile(path.join(params.checkpointDir, "workflow-audit.jsonl"), `${JSON.stringify(event)}\n`, "utf8");
    await persistWorkflowRuntimeSnapshot({
      checkpointDir: params.checkpointDir,
      runtime: nextRuntime,
      metadata: {
        source: "workflow-audit",
        lastEventId: event.id,
      },
    });
  }
  return { runtime: nextRuntime, event };
}
