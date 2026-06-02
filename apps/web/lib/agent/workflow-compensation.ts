import { appendWorkflowAuditTrail, type WorkflowCompensationStep, type WorkflowRuntimeState, updateWorkflowRuntimeState } from "./workflow-state.ts";

function buildDeployCompensationSteps(): WorkflowCompensationStep[] {
  return [
    {
      id: "deployment-cleanup",
      kind: "deployment_cleanup",
      status: "pending",
      message: "Reconcile deployment-side effects and mark the failed deployment as requiring cleanup.",
    },
    {
      id: "published-asset-rollback",
      kind: "published_asset_rollback",
      status: "pending",
      message: "Reconcile published asset state if deploy failed after publication.",
    },
    {
      id: "project-state-revert",
      kind: "project_state_revert",
      status: "pending",
      message: "Restore the last verified project binding if deployment mutated durable project state.",
    },
  ];
}

export function startWorkflowCompensation(
  runtime: WorkflowRuntimeState,
  params?: { reason?: string },
): WorkflowRuntimeState {
  const steps = runtime.executionMode === "deploy" ? buildDeployCompensationSteps() : [];
  const next = updateWorkflowRuntimeState(runtime, {
    status: "compensating",
    compensation: {
      status: "pending",
      startedAt: new Date().toISOString(),
      steps,
    },
  });
  return appendWorkflowAuditTrail(next, {
    type: "compensation_started",
    message: params?.reason || "Compensation workflow started.",
  });
}

export function completeWorkflowCompensation(
  runtime: WorkflowRuntimeState,
  params?: { message?: string },
): WorkflowRuntimeState {
  const next = updateWorkflowRuntimeState(runtime, {
    status: runtime.status === "compensating" ? "failed" : runtime.status,
    compensation: {
      ...runtime.compensation,
      status: "completed",
      completedAt: new Date().toISOString(),
      steps: runtime.compensation.steps.map((step) => ({
        ...step,
        status: step.status === "failed" ? "failed" : "completed",
        completedAt: step.completedAt || new Date().toISOString(),
      })),
    },
  });
  return appendWorkflowAuditTrail(next, {
    type: "compensation_completed",
    message: params?.message || "Compensation workflow completed.",
  });
}

export function failWorkflowCompensation(
  runtime: WorkflowRuntimeState,
  error: string,
): WorkflowRuntimeState {
  const next = updateWorkflowRuntimeState(runtime, {
    compensation: {
      ...runtime.compensation,
      status: "failed",
      lastError: error,
    },
  });
  return appendWorkflowAuditTrail(next, {
    type: "compensation_failed",
    message: error,
  });
}
