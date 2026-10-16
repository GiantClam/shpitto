/** Canonical names of the nine acceptance-gates.md common standards; none may be waived. */
export type AcceptanceCommonStandard = 'scope' | 'build-and-checks' | 'coverage' | 'defects' | 'isolation-security' | 'financial-task-integrity' | 'ui-completeness' | 'evidence' | 'recovery';

/** Retained JSON decisions, not record-only assertions. Integration also names independentReviewRef. */
export type AcceptanceDecisionEvidence = {
  stageId: string;
  candidateId: string;
  decision: 'PASS';
  candidateDigests: Record<'sourceTreeSha256' | 'schemaSha256' | 'configurationSha256' | 'contractSha256' | 'validatorSha256' | 'lockfileSha256', string>;
  reviewerId?: string;
  independentFromImplementer?: true;
  reviewedAt?: string;
  integratorId?: string;
  decidedAt?: string;
  independentReviewRef?: string;
  /** M3 equivalence additionally binds the historical record, scopes, rationale and rerun evidence. */
  oldRecordRef?: string;
  unchangedScopes?: string[];
  equivalenceRationale?: string;
  evidenceRefs?: string[];
};

/** IMPLEMENTATION_ACCEPTANCE requires traceability and current JSON evidence; development behavior is unchanged. */
export function validateStageProgression(input: {
  stage: {stageId: string; status: string; candidateId: string; criteriaIds: string[]; gateTaskId?: string; prerequisiteStages?: string[]; prerequisiteTaskIds?: string[]};
  record: {recordKind: string; stageId: string; status: string; candidateId: string; candidate: unknown; criterionResults: {criterionId: string; mandatory: boolean; result: string}[]; commands: unknown[]; invalidation: {affectedStages: string[]; currentM3Applicability: string; changedDigestRefs: string[]; requiredReruns: string[]; carriedEvidence: unknown[]}; prerequisites: {stageId?: string; taskId?: string; observedStatus: string; evidenceRefs: string[]}[]; [key: string]: unknown};
  current: unknown;
  evidenceExists?: (ref: string) => boolean;
  readEvidence?: (ref: string) => unknown;
  traceability?: {gates: Record<string, string>; tasks: {id: string; milestone: string; depends?: string[]; scenarios: string[]; T: string[]}[]; scenarios: {id: string; taskIds: string[]; T: string[]}[]; requirements: {milestones: string[]; taskIds: string[]; scenarioIds: string[]; T: string[]; subcases: string[]}[]};
}): string[];
