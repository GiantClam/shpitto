import crypto from "node:crypto";

export type WorkflowExecutionMode = "generate" | "refine" | "translate" | "deploy";

export type WorkflowStatus =
  | "active"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "compensating"
  | "completed"
  | "failed";

export type WorkflowApprovalKind =
  | "generate_confirmation"
  | "deploy_confirmation"
  | "content_deploy_confirmation"
  | "blog_content_deploy_confirmation";

export type WorkflowApprovalStatus = "not_required" | "pending" | "approved" | "rejected";
export type WorkflowCompensationStatus = "idle" | "pending" | "completed" | "failed";
export type WorkflowAuditEventType =
  | "created"
  | "approval_awaiting"
  | "approval_approved"
  | "approval_rejected"
  | "execution_started"
  | "execution_completed"
  | "execution_failed"
  | "compensation_started"
  | "compensation_completed"
  | "compensation_failed";

export type WorkflowAuditEvent = {
  id: string;
  at: string;
  type: WorkflowAuditEventType;
  message: string;
  metadata?: Record<string, unknown>;
};

export type WorkflowApprovalState = {
  kind?: WorkflowApprovalKind;
  status: WorkflowApprovalStatus;
  requestedAt?: string;
  decidedAt?: string;
  decidedBy?: string;
  sourceTaskId?: string;
};

export type WorkflowCompensationStep = {
  id: string;
  kind: "deployment_cleanup" | "published_asset_rollback" | "project_state_revert";
  status: "pending" | "completed" | "failed";
  message: string;
  completedAt?: string;
  error?: string;
};

export type WorkflowCompensationState = {
  status: WorkflowCompensationStatus;
  startedAt?: string;
  completedAt?: string;
  lastError?: string;
  steps: WorkflowCompensationStep[];
};

export type WorkflowRuntimeState = {
  version: 1;
  workflowId: string;
  chatId?: string;
  taskId?: string;
  executionMode: WorkflowExecutionMode;
  status: WorkflowStatus;
  contractHash?: string;
  generationLane?: string;
  websiteSurfaceMode?: string;
  approval: WorkflowApprovalState;
  compensation: WorkflowCompensationState;
  auditTrail: WorkflowAuditEvent[];
  createdAt: string;
  updatedAt: string;
};

export type WorkflowRuntimeClientSummary = {
  workflowId: string;
  executionMode: WorkflowExecutionMode;
  status: WorkflowStatus;
  contractHash?: string;
  generationLane?: string;
  websiteSurfaceMode?: string;
  approvalStatus: WorkflowApprovalStatus;
  approvalKind?: WorkflowApprovalKind;
  compensationStatus: WorkflowCompensationStatus;
  auditEventCount: number;
  updatedAt: string;
};

function nowIso() {
  return new Date().toISOString();
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeAuditTrail(value: unknown): WorkflowAuditEvent[] {
  if (!Array.isArray(value)) return [];
  const entries = value
    .map((entry) => {
      const item = toRecord(entry);
      const id = String(item.id || "").trim();
      const at = String(item.at || "").trim();
      const type = String(item.type || "").trim() as WorkflowAuditEventType;
      const message = String(item.message || "").trim();
      if (!id || !at || !type || !message) return null;
      return {
        id,
        at,
        type,
        message,
        metadata: item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
          ? (item.metadata as Record<string, unknown>)
          : undefined,
      } as WorkflowAuditEvent;
    })
    .filter(Boolean);
  return entries as WorkflowAuditEvent[];
}

function normalizeApproval(value: unknown): WorkflowApprovalState {
  const item = toRecord(value);
  const status = String(item.status || "").trim() as WorkflowApprovalStatus;
  return {
    kind: String(item.kind || "").trim() as WorkflowApprovalKind,
    status: ["pending", "approved", "rejected", "not_required"].includes(status) ? status : "not_required",
    requestedAt: String(item.requestedAt || "").trim() || undefined,
    decidedAt: String(item.decidedAt || "").trim() || undefined,
    decidedBy: String(item.decidedBy || "").trim() || undefined,
    sourceTaskId: String(item.sourceTaskId || "").trim() || undefined,
  };
}

function normalizeCompensation(value: unknown): WorkflowCompensationState {
  const item = toRecord(value);
  const status = String(item.status || "").trim() as WorkflowCompensationStatus;
  const steps = Array.isArray(item.steps)
    ? item.steps
        .map((entry) => {
          const step = toRecord(entry);
          const id = String(step.id || "").trim();
          const kind = String(step.kind || "").trim();
          const stepStatus = String(step.status || "").trim();
          const message = String(step.message || "").trim();
          if (!id || !kind || !stepStatus || !message) return null;
          return {
            id,
            kind: kind as WorkflowCompensationStep["kind"],
            status: stepStatus as WorkflowCompensationStep["status"],
            message,
            completedAt: String(step.completedAt || "").trim() || undefined,
            error: String(step.error || "").trim() || undefined,
          } as WorkflowCompensationStep;
        })
        .filter(Boolean)
    : [];
  return {
    status: ["pending", "completed", "failed", "idle"].includes(status) ? status : "idle",
    startedAt: String(item.startedAt || "").trim() || undefined,
    completedAt: String(item.completedAt || "").trim() || undefined,
    lastError: String(item.lastError || "").trim() || undefined,
    steps: steps as WorkflowCompensationStep[],
  };
}

export function buildWorkflowRuntimeState(params: {
  chatId?: string;
  taskId?: string;
  executionMode: WorkflowExecutionMode;
  contractHash?: string;
  generationLane?: string;
  websiteSurfaceMode?: string;
  approvalKind?: WorkflowApprovalKind;
  approvalStatus?: WorkflowApprovalStatus;
  approvalRequestedAt?: string;
  approvalDecidedAt?: string;
  approvalDecidedBy?: string;
  approvalSourceTaskId?: string;
}): WorkflowRuntimeState {
  const createdAt = nowIso();
  const approvalStatus = params.approvalStatus || (params.approvalKind ? "approved" : "not_required");
  const status: WorkflowStatus =
    approvalStatus === "pending"
      ? "awaiting_approval"
      : approvalStatus === "approved"
        ? "approved"
        : approvalStatus === "rejected"
          ? "rejected"
          : "active";
  return {
    version: 1,
    workflowId: crypto
      .createHash("sha1")
      .update(
        JSON.stringify({
          chatId: params.chatId || "",
          taskId: params.taskId || "",
          executionMode: params.executionMode,
          contractHash: params.contractHash || "",
          createdAt,
        }),
      )
      .digest("hex"),
    chatId: params.chatId,
    taskId: params.taskId,
    executionMode: params.executionMode,
    status,
    contractHash: params.contractHash,
    generationLane: params.generationLane,
    websiteSurfaceMode: params.websiteSurfaceMode,
    approval: {
      kind: params.approvalKind,
      status: approvalStatus,
      requestedAt: params.approvalRequestedAt || (approvalStatus === "pending" ? createdAt : undefined),
      decidedAt:
        params.approvalDecidedAt ||
        (approvalStatus === "approved" || approvalStatus === "rejected" ? createdAt : undefined),
      decidedBy: params.approvalDecidedBy,
      sourceTaskId: params.approvalSourceTaskId,
    },
    compensation: {
      status: "idle",
      steps: [],
    },
    auditTrail: [],
    createdAt,
    updatedAt: createdAt,
  };
}

export function normalizeWorkflowRuntimeState(value: unknown): WorkflowRuntimeState | undefined {
  const item = toRecord(value);
  if (Number(item.version || 0) !== 1) return undefined;
  const workflowId = String(item.workflowId || "").trim();
  const executionMode = String(item.executionMode || "").trim() as WorkflowExecutionMode;
  const status = String(item.status || "").trim() as WorkflowStatus;
  const createdAt = String(item.createdAt || "").trim();
  const updatedAt = String(item.updatedAt || "").trim();
  if (!workflowId || !executionMode || !createdAt || !updatedAt) return undefined;
  if (!["generate", "refine", "translate", "deploy"].includes(executionMode)) return undefined;
  if (!["active", "awaiting_approval", "approved", "rejected", "compensating", "completed", "failed"].includes(status)) {
    return undefined;
  }
  return {
    version: 1,
    workflowId,
    chatId: String(item.chatId || "").trim() || undefined,
    taskId: String(item.taskId || "").trim() || undefined,
    executionMode,
    status,
    contractHash: String(item.contractHash || "").trim() || undefined,
    generationLane: String(item.generationLane || "").trim() || undefined,
    websiteSurfaceMode: String(item.websiteSurfaceMode || "").trim() || undefined,
    approval: normalizeApproval(item.approval),
    compensation: normalizeCompensation(item.compensation),
    auditTrail: normalizeAuditTrail(item.auditTrail),
    createdAt,
    updatedAt,
  };
}

export function updateWorkflowRuntimeState(
  runtime: WorkflowRuntimeState,
  patch: Partial<Omit<WorkflowRuntimeState, "version" | "workflowId" | "createdAt" | "auditTrail">> & {
    auditTrail?: WorkflowAuditEvent[];
  },
): WorkflowRuntimeState {
  return {
    ...runtime,
    ...patch,
    approval: patch.approval ? { ...runtime.approval, ...patch.approval } : runtime.approval,
    compensation: patch.compensation ? { ...runtime.compensation, ...patch.compensation } : runtime.compensation,
    auditTrail: patch.auditTrail ? [...patch.auditTrail] : runtime.auditTrail,
    updatedAt: nowIso(),
  };
}

export function appendWorkflowAuditTrail(
  runtime: WorkflowRuntimeState,
  event: Omit<WorkflowAuditEvent, "id" | "at"> & Partial<Pick<WorkflowAuditEvent, "id" | "at">>,
): WorkflowRuntimeState {
  const nextEvent: WorkflowAuditEvent = {
    id: event.id || crypto.randomUUID(),
    at: event.at || nowIso(),
    type: event.type,
    message: event.message,
    metadata: event.metadata,
  };
  return updateWorkflowRuntimeState(runtime, {
    auditTrail: [...runtime.auditTrail, nextEvent].slice(-100),
  });
}

export function summarizeWorkflowRuntimeForClient(runtime?: WorkflowRuntimeState | null): WorkflowRuntimeClientSummary | undefined {
  if (!runtime) return undefined;
  return {
    workflowId: runtime.workflowId,
    executionMode: runtime.executionMode,
    status: runtime.status,
    contractHash: runtime.contractHash,
    generationLane: runtime.generationLane,
    websiteSurfaceMode: runtime.websiteSurfaceMode,
    approvalStatus: runtime.approval.status,
    approvalKind: runtime.approval.kind,
    compensationStatus: runtime.compensation.status,
    auditEventCount: runtime.auditTrail.length,
    updatedAt: runtime.updatedAt,
  };
}
