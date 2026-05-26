export type QaIssueSummary = {
  code: string;
  severity: "error" | "warning";
  count: number;
};

export type QaSummary = {
  averageScore: number;
  totalRoutes: number;
  passedRoutes: number;
  totalRetries: number;
  retriesAllowed: number;
  antiSlopIssueCount: number;
  categories: QaIssueSummary[];
  observations?: Array<{
    code: "repeated-opening-family" | "visual-monotony" | "weak-hero";
    severity: "observation";
    message: string;
    routes: string[];
  }>;
};
