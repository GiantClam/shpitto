import crypto from "node:crypto";
import type { AgentState } from "./graph.ts";

export type RunAsyncMainflowTaskParams = {
  taskId: string;
  chatId: string;
  inputState: AgentState;
  setSessionState?: (state: AgentState) => void;
  workerId?: string;
};

export async function runAsyncMainflowTask(params: RunAsyncMainflowTaskParams) {
  void params;
  throw new Error(
    "Legacy async-mainflow runner is retired. Use SkillRuntimeExecutor.runTask from worker path.",
  );
}

export function createWorkerCorrelationId() {
  return crypto.randomUUID().slice(0, 12);
}
