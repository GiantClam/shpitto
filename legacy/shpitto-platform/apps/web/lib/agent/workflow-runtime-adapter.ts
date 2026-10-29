import type { AgentState } from "./graph.ts";
import { approvalKindForExecution, markWorkflowApprovalApproved } from "./workflow-approval.ts";
import {
  appendWorkflowAuditTrail,
  buildWorkflowRuntimeState,
  normalizeWorkflowRuntimeState,
  type WorkflowExecutionMode,
  type WorkflowRuntimeState,
  updateWorkflowRuntimeState,
} from "./workflow-state.ts";

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function resolveWorkflowRuntimeFromState(state: AgentState | undefined | null): WorkflowRuntimeState | undefined {
  return normalizeWorkflowRuntimeState(toRecord((state as any)?.workflow_context).workflowRuntime);
}

export function attachWorkflowRuntimeToState(
  state: AgentState,
  runtime: WorkflowRuntimeState,
): AgentState {
  return {
    ...state,
    workflow_context: {
      ...(state.workflow_context || {}),
      workflowRuntime: runtime,
    } as any,
  };
}

export function buildExecutionWorkflowRuntime(params: {
  chatId?: string;
  executionMode: WorkflowExecutionMode;
  contractHash?: string;
  generationLane?: string;
  websiteSurfaceMode?: string;
  promptConfirmed?: boolean;
  blogContentDeployConfirmed?: boolean;
  contentPreviewDeployConfirmed?: boolean;
  sourceTaskId?: string;
  decidedBy?: string;
}): WorkflowRuntimeState {
  const approvalKind = approvalKindForExecution({
    executionMode: params.executionMode,
    promptConfirmed: params.promptConfirmed,
    blogContentDeployConfirmed: params.blogContentDeployConfirmed,
    contentPreviewDeployConfirmed: params.contentPreviewDeployConfirmed,
  });
  const runtime = buildWorkflowRuntimeState({
    chatId: params.chatId,
    executionMode: params.executionMode,
    contractHash: params.contractHash,
    generationLane: params.generationLane,
    websiteSurfaceMode: params.websiteSurfaceMode,
    approvalKind,
    approvalStatus: approvalKind ? "approved" : "not_required",
    approvalSourceTaskId: params.sourceTaskId,
    approvalDecidedBy: params.decidedBy,
  });
  const createdRuntime = appendWorkflowAuditTrail(runtime, {
    type: "created",
    message: `Workflow created for ${params.executionMode}.`,
  });
  if (approvalKind) {
    return markWorkflowApprovalApproved(createdRuntime, {
      decidedBy: params.decidedBy,
      sourceTaskId: params.sourceTaskId,
      message: `Workflow approval recorded for ${approvalKind}.`,
    });
  }
  return createdRuntime;
}

export function markWorkflowExecutionStarted(runtime: WorkflowRuntimeState): WorkflowRuntimeState {
  return updateWorkflowRuntimeState(runtime, {
    status: runtime.approval.status === "approved" ? "active" : runtime.status,
  });
}

export function markWorkflowExecutionCompleted(runtime: WorkflowRuntimeState): WorkflowRuntimeState {
  return updateWorkflowRuntimeState(runtime, {
    status: "completed",
  });
}

export function markWorkflowExecutionFailed(runtime: WorkflowRuntimeState): WorkflowRuntimeState {
  return updateWorkflowRuntimeState(runtime, {
    status: "failed",
  });
}
