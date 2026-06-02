import { appendWorkflowAuditTrail, type WorkflowApprovalKind, type WorkflowRuntimeState, updateWorkflowRuntimeState } from "./workflow-state.ts";

export function approvalKindForExecution(params: {
  executionMode: "generate" | "refine" | "translate" | "deploy";
  promptConfirmed?: boolean;
  blogContentDeployConfirmed?: boolean;
  contentPreviewDeployConfirmed?: boolean;
}): WorkflowApprovalKind | undefined {
  if (params.executionMode === "generate" && params.promptConfirmed) return "generate_confirmation";
  if (params.executionMode === "deploy" && params.blogContentDeployConfirmed) return "blog_content_deploy_confirmation";
  if (params.executionMode === "deploy" && params.contentPreviewDeployConfirmed) return "content_deploy_confirmation";
  if (params.executionMode === "deploy") return "deploy_confirmation";
  return undefined;
}

export function markWorkflowApprovalApproved(
  runtime: WorkflowRuntimeState,
  params?: { decidedBy?: string; sourceTaskId?: string; message?: string },
): WorkflowRuntimeState {
  const next = updateWorkflowRuntimeState(runtime, {
    status: "approved",
    approval: {
      ...runtime.approval,
      status: "approved",
      decidedAt: new Date().toISOString(),
      decidedBy: params?.decidedBy,
      sourceTaskId: params?.sourceTaskId || runtime.approval.sourceTaskId,
    },
  });
  return appendWorkflowAuditTrail(next, {
    type: "approval_approved",
    message: params?.message || "Workflow approval has been confirmed.",
  });
}

export function markWorkflowApprovalRejected(
  runtime: WorkflowRuntimeState,
  params?: { decidedBy?: string; message?: string },
): WorkflowRuntimeState {
  const next = updateWorkflowRuntimeState(runtime, {
    status: "rejected",
    approval: {
      ...runtime.approval,
      status: "rejected",
      decidedAt: new Date().toISOString(),
      decidedBy: params?.decidedBy,
    },
  });
  return appendWorkflowAuditTrail(next, {
    type: "approval_rejected",
    message: params?.message || "Workflow approval has been rejected.",
  });
}
