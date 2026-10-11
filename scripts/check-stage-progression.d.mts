export function validateStageProgression(input: {
  stage: {stageId: string; status: string; candidateId: string; criteriaIds: string[]};
  record: {recordKind: string; stageId: string; status: string; candidateId: string; candidate: unknown; criterionResults: {criterionId: string; mandatory: boolean; result: string}[]; commands: unknown[]; invalidation: {affectedStages: string[]; currentM3Applicability: string; changedDigestRefs: string[]; requiredReruns: string[]; carriedEvidence: unknown[]}; prerequisites: {stageId: string; observedStatus: string; evidenceRefs: string[]}[]};
  current: unknown;
  evidenceExists?: (ref: string) => boolean;
  readEvidence?: (ref: string) => unknown;
}): string[];
