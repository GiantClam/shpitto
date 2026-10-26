declare module '*.mjs' {
  export function assessAutomatedEvidence(record: unknown): {status: string; blockingReasons: string[]};
  export function buildAutomatedExplanation(record: unknown, automated: {status: string; blockingReasons: string[]}): unknown;
  export function buildFinalAcceptanceQueue(args: {register: unknown; records: Map<string, unknown>; generatedAt?: string}): {
    entries: Array<{manualActions: Array<{status: string}>; automatedStatus: string; automatedExplanation: unknown; humanDecisionGuide: unknown}>;
    summary: {automatedReady: number; manualReviewPending: number};
  };
  export function validateVendorDocs(args: {
    manifest: {
      version: string;
      source: string;
      navigation: Array<{title: string; path: string}>;
      search?: {mode: string; source: string};
    };
    navigation: {
      release: string;
      source: string;
      search: {mode: string; source: string};
      pages: Array<{title: string; path: string}>;
    };
    sourceConfig: string;
    exists?: (file: string) => boolean;
    read?: (file: string) => string;
  }): string[];
}
