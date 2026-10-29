import {parseArgs} from 'node:util';
import {validateTrustedRelease, type TrustedValidationContext, type TrustedValidationRecord} from './lib/trusted-validation.mjs';

export function validateDeploymentEvidence(evidenceRef: string, candidateRef: string, context?: TrustedValidationContext): TrustedValidationRecord {
  if (!context) throw new Error('Deployment blocked: explicit trusted validation context is required');
  return validateTrustedRelease({...context, evidenceRef, candidateRef});
}

function run(): void {
  const {values} = parseArgs({options: {evidence: {type: 'string'}, candidate: {type: 'string'}, 'stage-root': {type: 'string'}, 'trusted-root': {type: 'string'}, pin: {type: 'string'}, 'pin-sha256': {type: 'string'}, 'evidence-store': {type: 'string'}, 'candidate-id': {type: 'string'}, 'implementer-id': {type: 'string'}}});
  const required = (name: keyof typeof values): string => { const value = values[name]; if (!value) throw new Error(`Deployment validation requires --${name}`); return value; };
  const result = validateDeploymentEvidence(required('evidence'), required('candidate'), {stageRoot: required('stage-root'), trustedRoot: required('trusted-root'), pinRef: required('pin'), pinSha256: required('pin-sha256'), evidenceStore: required('evidence-store'), candidateId: required('candidate-id'), implementerId: required('implementer-id')});
  console.log(JSON.stringify({status: result.status, action: 'deploy-evidence-validated', evidenceRef: result.evidenceRef}, null, 2));
}

if (process.argv[1]?.endsWith('deploy-release.ts')) run();

