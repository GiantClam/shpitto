export type CoverageReport = Readonly<{path: string; branchesFound: number; branchesHit: number}>;
export type StageEntry = Readonly<{result: string; applicable?: boolean; mandatory?: boolean}>;

export function resolveM3VerificationOptions(input: Readonly<{
  root: string;
  args: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
  attemptId: string;
}>): Readonly<{output: string; browserEvidencePath: string | null}>;
export function assertM3OutputWritable(output: string): void;
export function isRetainedM3Artifact(root: string, reference: string): boolean;
export const M3_OWNED_SOURCE_ROOTS: readonly string[];
export function assessBrowserEvidence(evidence: unknown, artifactExists: (reference: string) => boolean): Readonly<{passed: boolean; missing: string[]}>;
export function collectOwnedModules(root: string, sourceRoots?: readonly string[]): string[];
export function summarizeLcov(source: string, root: string): Readonly<{
  files: ReadonlyArray<Readonly<{path: string; branchesFound: number; branchesHit: number; branches: ReadonlyArray<readonly [string, boolean]>}>>;
  missing: string[];
  branchesFound: number;
  branchesHit: number;
  percent: number;
}>;
export function mergeLcov(sources: readonly string[], root: string): Readonly<{reports: CoverageReport[]; malformed: string[]}>
export function assessCoverage(input: Readonly<{
  ownedModules: readonly string[];
  reports: readonly CoverageReport[];
  malformed?: readonly string[];
  suitePassed: boolean;
  minimumPercent?: number;
}>): CoverageReport & Readonly<{status: 'PASS' | 'FAIL'; percent: number; missingSources: string[]; malformed: string[]}>;
export function deriveStageStatus(input: Readonly<{
  candidateStable: boolean;
  criteria: readonly StageEntry[];
  standards: readonly StageEntry[];
  scenarios: readonly StageEntry[];
  submissionReady: boolean;
}>): 'STALE' | 'FAIL' | 'IN_PROGRESS' | 'READY_FOR_REVIEW';
export function resultFromCommands(commandIds: readonly string[], commands: readonly Readonly<{commandId: string; status: string}>[], evidenceRefs: readonly string[]): Readonly<{result: string; evidenceRefs: readonly string[]}>;
