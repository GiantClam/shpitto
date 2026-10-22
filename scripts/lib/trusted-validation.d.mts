export type TrustedValidationContext = {
  stageRoot: string;
  trustedRoot: string;
  pinRef: string;
  pinSha256: string;
  evidenceStore: string;
  candidateId: string;
  implementerId: string;
};
export type TrustedValidationRecord = Record<string, unknown> & {status: string; checks: Array<{id: string; status: string; exitCode: number; outputRef: string; outputSha256: string}>};
export function prepareTrustedValidation(options: TrustedValidationContext): {candidateRef: string; evidenceRef: string; record: TrustedValidationRecord};
export function trustedDependencyDigest(trustedRoot: string): string;
export function validateTrustedRelease(options: TrustedValidationContext & {candidateRef: string; evidenceRef: string}): TrustedValidationRecord;
